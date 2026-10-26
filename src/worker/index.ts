// src/worker/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { DurableObject } from "cloudflare:workers";
import { generateSnowflake, UserBadges } from "./snowflake";

export interface Env {
  DB: D1Database;
  CHANNEL_ROOM: DurableObjectNamespace<ChannelRoom>;
  AI: Ai;
  ASSETS: Fetcher;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  TENOR_API_KEY: string;
}

export const Perm = {
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  CONNECT_VOICE: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  STREAM_VIDEO: 1n << 9n
} as const;

type Variables = {
  user: { sub: string; username: string; avatar?: string; discordId?: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("/api/*", cors());

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyAuth0Token(token: string, env: Env): Promise<JWTPayload> {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  const { payload } = await jwtVerify(token, cachedJwks, {
    issuer: `https://${env.AUTH0_DOMAIN}/`,
    audience: env.AUTH0_AUDIENCE
  });
  return payload;
}

app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
  if (!rawToken) return c.json({ error: "Missing Authorization token" }, 401);

  try {
    const payload = await verifyAuth0Token(rawToken, c.env);
    c.set("user", {
      sub: payload.sub!,
      username:
        (payload["https://clerd.example.com/username"] as string) ||
        (payload.name as string) ||
        (payload.email as string)?.split("@")[0] ||
        "user",
      avatar: payload["https://clerd.example.com/avatar"] as string | undefined,
      discordId: payload["https://clerd.example.com/discord_id"] as string | undefined
    });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired Auth0 token" }, 401);
  }
});

app.get("/api/bootstrap", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO users (id, uid, username, display_name, avatar_url, status)
     VALUES (?1, ?2, ?3, ?4, ?5, 'online')
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       display_name = COALESCE(users.display_name, excluded.display_name),
       avatar_url = COALESCE(users.avatar_url, excluded.avatar_url)`
  )
    .bind(user.sub, generateSnowflake(), user.username, user.username, user.avatar ?? null)
    .run();

  const [{ results: users }, { results: servers }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, uid, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, badges_bitfield
       FROM users WHERE id = ?1`
    )
      .bind(user.sub)
      .all(),
    c.env.DB.prepare(
      `SELECT s.id, s.name, s.description, s.icon_url, s.banner_url, s.owner_id, s.invite_code
       FROM servers s
       JOIN server_members sm ON sm.server_id = s.id
       WHERE sm.user_id = ?1 AND sm.is_banned = 0
       ORDER BY s.created_at ASC`
    )
      .bind(user.sub)
      .all()
  ]);
  const serverIds = servers.map((server) => server.id as string);
  const firstServerId = serverIds[0];
  const channelsQuery = firstServerId
    ? c.env.DB.prepare(
        `SELECT id, server_id, parent_id, type, name, topic, position
         FROM channels WHERE server_id = ?1 ORDER BY position ASC`
      )
        .bind(firstServerId)
        .all()
    : Promise.resolve({ results: [] });
  const membersQuery = firstServerId
    ? c.env.DB.prepare(
        `SELECT u.id, u.uid, u.username, u.display_name, u.avatar_url, u.status,
                sm.nickname, r.name AS role_name, r.color AS role_color
         FROM server_members sm
         JOIN users u ON u.id = sm.user_id
         LEFT JOIN member_roles mr ON mr.server_id = sm.server_id AND mr.user_id = sm.user_id
         LEFT JOIN roles r ON r.id = mr.role_id AND r.hoist = 1
         WHERE sm.server_id = ?1 AND sm.is_banned = 0
         ORDER BY r.position DESC, u.username ASC`
      )
        .bind(firstServerId)
        .all()
    : Promise.resolve({ results: [] });
  const [{ results: channelRows }, { results: memberRows }] = await Promise.all([
    channelsQuery,
    membersQuery
  ]);

  return c.json({
    user: users[0] ?? null,
    servers,
    channels: channelRows,
    members: memberRows
  });
});

// 1. User Profile (UID, Avatar, Banner, Badges, Bio, Custom Status)
app.get("/api/users/:userId/profile", async (c) => {
  const viewer = c.get("user");
  const targetId = c.req.param("userId");

  const profile = await c.env.DB.prepare(
    `SELECT u.id, u.uid, u.username, u.display_name, u.discriminator, u.avatar_url,
            u.banner_url, u.banner_color, u.bio, u.custom_status, u.status,
            u.badges_bitfield, u.public_key_jwk, u.created_at,
            (SELECT note_content FROM user_notes WHERE owner_user_id = ?1 AND target_user_id = u.id) AS private_note
     FROM users u WHERE u.id = ?2 OR u.uid = ?2`
  )
    .bind(viewer.sub, targetId)
    .first();

  if (!profile) return c.json({ error: "User not found" }, 404);
  return c.json({ profile });
});

// Update User Profile (Avatar, Banner, Bio, Custom Status, Badges)
app.patch("/api/users/@me", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    display_name?: string;
    avatar_url?: string;
    banner_url?: string;
    banner_color?: string;
    bio?: string;
    custom_status?: string;
    status?: string;
  }>();

  await c.env.DB.prepare(
    `UPDATE users SET
       display_name = COALESCE(?2, display_name),
       avatar_url = COALESCE(?3, avatar_url),
       banner_url = COALESCE(?4, banner_url),
       banner_color = COALESCE(?5, banner_color),
       bio = COALESCE(?6, bio),
       custom_status = COALESCE(?7, custom_status),
       status = COALESCE(?8, status)
     WHERE id = ?1`
  )
    .bind(
      user.sub,
      body.display_name ?? null,
      body.avatar_url ?? null,
      body.banner_url ?? null,
      body.banner_color ?? null,
      body.bio ?? null,
      body.custom_status ?? null,
      body.status ?? null
    )
    .run();

  return c.json({ updated: true });
});

// 2. Private User Notes (PUT /api/users/:targetId/note)
app.put("/api/users/:targetId/note", async (c) => {
  const owner = c.get("user");
  const targetId = c.req.param("targetId");
  const { note } = await c.req.json<{ note: string }>();

  await c.env.DB.prepare(
    `INSERT INTO user_notes (owner_user_id, target_user_id, note_content, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(owner_user_id, target_user_id) DO UPDATE SET
       note_content = excluded.note_content,
       updated_at = excluded.updated_at`
  )
    .bind(owner.sub, targetId, note.slice(0, 500), Date.now())
    .run();

  return c.json({ saved: true, targetId, note });
});

// 3. GIF Search Proxy & Favorite GIFs (Cached at Edge to save quota)
app.get("/api/gifs/search", async (c) => {
  const q = c.req.query("q") || "excited";
  const workerCaches = (globalThis as typeof globalThis & { caches: { default: Cache } }).caches;
  const cache = workerCaches.default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const tenorUrl = `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${c.env.TENOR_API_KEY}&limit=20`;
  const res = await fetch(tenorUrl);
  const data = await res.json();
  const response = c.json(data, 200, { "Cache-Control": "public, max-age=1800" });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
});

app.get("/api/gifs/favorites", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT gif_url, preview_url, title, width, height FROM user_favorite_gifs WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100"
  )
    .bind(user.sub)
    .all();
  return c.json({ favorites: results });
});

app.post("/api/gifs/favorites", async (c) => {
  const user = c.get("user");
  const { gif_url, preview_url, title } = await c.req.json<{ gif_url: string; preview_url: string; title?: string }>();
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO user_favorite_gifs (user_id, gif_url, preview_url, title) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(user.sub, gif_url, preview_url, title ?? "")
    .run();
  return c.json({ favorited: true });
});

// 4. Create Server with Banner, Icon, Invite Code, Default Categories & Channels
app.post("/api/servers", async (c) => {
  const user = c.get("user");
  const { name, icon_url, banner_url, description } = await c.req.json<{
    name: string;
    icon_url?: string;
    banner_url?: string;
    description?: string;
  }>();

  const serverId = generateSnowflake();
  const everyoneRoleId = generateSnowflake();
  const catTextId = generateSnowflake();
  const generalId = generateSnowflake();
  const clipsId = generateSnowflake();
  const catVoiceId = generateSnowflake();
  const voiceLoungeId = generateSnowflake();
  const stageStreamId = generateSnowflake();
  const inviteCode = `clerd-${Math.random().toString(36).slice(2, 8)}`;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO servers (id, name, description, icon_url, banner_url, owner_id, invite_code)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(serverId, name, description ?? "", icon_url ?? null, banner_url ?? null, user.sub, inviteCode),
    c.env.DB.prepare(
      `INSERT INTO roles (id, server_id, name, color, position, permissions_bitfield, is_everyone)
       VALUES (?1, ?2, '@everyone', '#99AAB5', 0, '3148800', 1)`
    ).bind(everyoneRoleId, serverId),
    c.env.DB.prepare("INSERT INTO server_members (server_id, user_id) VALUES (?1, ?2)").bind(serverId, user.sub),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, type, name, position) VALUES (?1, ?2, 'category', 'TEXT CHANNELS', 0)").bind(catTextId, serverId),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, parent_id, type, name, position) VALUES (?1, ?2, ?3, 'text', 'general', 1)").bind(generalId, serverId, catTextId),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, parent_id, type, name, position) VALUES (?1, ?2, ?3, 'text', 'clips-and-gifs', 2)").bind(clipsId, serverId, catTextId),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, type, name, position) VALUES (?1, ?2, 'category', 'VOICE & STREAMS', 3)").bind(catVoiceId, serverId),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, parent_id, type, name, position) VALUES (?1, ?2, ?3, 'voice', 'Lobby Voice', 4)").bind(voiceLoungeId, serverId, catVoiceId),
    c.env.DB.prepare("INSERT INTO channels (id, server_id, parent_id, type, name, position) VALUES (?1, ?2, ?3, 'stage', 'Go Live Stream Stage', 5)").bind(stageStreamId, serverId, catVoiceId)
  ]);

  return c.json({ id: serverId, name, invite_code: inviteCode });
});

app.post("/api/servers/:serverId/channels", async (c) => {
  const user = c.get("user");
  const serverId = c.req.param("serverId");
  const body = await c.req.json<{ name: string; topic?: string }>();
  const name = body.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  if (!name) return c.json({ error: "Channel name is required" }, 400);

  const server = await c.env.DB.prepare("SELECT owner_id FROM servers WHERE id = ?1")
    .bind(serverId)
    .first<{ owner_id: string }>();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (server.owner_id !== user.sub) return c.json({ error: "Only the server owner can create channels" }, 403);

  const channelId = generateSnowflake();
  await c.env.DB.prepare(
    `INSERT INTO channels (id, server_id, type, name, topic, position)
     SELECT ?1, ?2, 'text', ?3, ?4, COALESCE(MAX(position), 0) + 1
     FROM channels WHERE server_id = ?2`
  )
    .bind(channelId, serverId, name, body.topic ?? "")
    .run();

  return c.json({ id: channelId, server_id: serverId, type: "text", name, topic: body.topic ?? "" }, 201);
});

// 5. Paginated Message History & Full-Text Search
app.get("/api/channels/:channelId/messages", async (c) => {
  const { channelId } = c.req.param();
  const before = c.req.query("before");
  const search = c.req.query("q");
  const pinnedOnly = c.req.query("pinned") === "1";
  const limit = Math.min(Number(c.req.query("limit") || 50), 50);

  if (pinnedOnly) {
    const { results } = await c.env.DB.prepare(
      `SELECT m.*, u.uid, u.username, u.display_name, u.avatar_url, u.badges_bitfield
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ?1 AND m.is_pinned = 1 ORDER BY m.id DESC LIMIT 50`
    )
      .bind(channelId)
      .all();
    return c.json({ messages: results });
  }

  if (search && search.trim().length > 1) {
    const ftsRows = await c.env.DB.prepare(
      `SELECT m.*, u.uid, u.username, u.display_name, u.avatar_url, u.badges_bitfield
       FROM messages_fts f
       JOIN messages m ON m.rowid = f.rowid
       JOIN users u ON u.id = m.author_id
       WHERE f.channel_id = ?1 AND messages_fts MATCH ?2
       ORDER BY m.id DESC LIMIT ?3`
    )
      .bind(channelId, search.trim(), limit)
      .all();
    return c.json({ messages: ftsRows.results.reverse() });
  }

  const stmt = before
    ? c.env.DB.prepare(
        `SELECT m.*, u.uid, u.username, u.display_name, u.avatar_url, u.badges_bitfield
         FROM messages m JOIN users u ON u.id = m.author_id
         WHERE m.channel_id = ?1 AND m.id < ?2 ORDER BY m.id DESC LIMIT ?3`
      ).bind(channelId, before, limit)
    : c.env.DB.prepare(
        `SELECT m.*, u.uid, u.username, u.display_name, u.avatar_url, u.badges_bitfield
         FROM messages m JOIN users u ON u.id = m.author_id
         WHERE m.channel_id = ?1 ORDER BY m.id DESC LIMIT ?2`
      ).bind(channelId, limit);

  const { results } = await stmt.all();
  return c.json({ messages: results.reverse() });
});

// 6. WebSocket Upgrade -> Durable Object ChannelRoom (Chat, Voice & Go Live Screen Streams)
app.get("/api/channels/:channelId/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }
  const { channelId } = c.req.param();
  const user = c.get("user");
  const id = c.env.CHANNEL_ROOM.idFromName(channelId);
  const stub = c.env.CHANNEL_ROOM.get(id);

  const forwardUrl = new URL(c.req.url);
  forwardUrl.searchParams.set("channelId", channelId);
  forwardUrl.searchParams.set("userId", user.sub);
  forwardUrl.searchParams.set("username", user.username);
  if (user.avatar) forwardUrl.searchParams.set("avatar", user.avatar);

  return stub.fetch(new Request(forwardUrl.toString(), c.req.raw));
});

// 7. Workers AI Summarization & Keyword Extraction
app.post("/api/channels/:channelId/summarize", async (c) => {
  const { channelId } = c.req.param();
  const { results } = await c.env.DB.prepare(
    `SELECT u.username, m.content FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_id = ?1 AND m.is_encrypted = 0
     ORDER BY m.id DESC LIMIT 80`
  )
    .bind(channelId)
    .all<{ username: string; content: string }>();

  const transcript = results.reverse().map((r) => `${r.username}: ${r.content}`).join("\n");
  const aiResponse = (await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content: "Summarize the chat in 3 bullets and extract 5 keywords as JSON."
      },
      { role: "user", content: transcript.slice(0, 6000) }
    ]
  })) as { response?: string };

  return c.json({ result: aiResponse.response });
});

// ============================================================================
// Durable Object: ChannelRoom (Hibernatable WebSockets + Live Stream Signaling)
// ============================================================================
interface SessionMeta {
  channelId: string;
  userId: string;
  username: string;
  avatar?: string;
  isStreaming?: boolean;
  streamTitle?: string;
  streamQuality?: string; // '720p30' | '1080p60' | '1440p60'
}

export class ChannelRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const meta: SessionMeta = {
      channelId: url.searchParams.get("channelId") || "",
      userId: url.searchParams.get("userId") || "anonymous",
      username: url.searchParams.get("username") || "user",
      avatar: url.searchParams.get("avatar") || undefined,
      isStreaming: false
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [meta.channelId, meta.userId]);
    server.serializeAttachment(meta);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    const meta = ws.deserializeAttachment() as SessionMeta;
    const payload = JSON.parse(raw);

    switch (payload.type) {
      case "MESSAGE_CREATE": {
        const msgId = generateSnowflake();
        const createdAt = Date.now();
        const isEncrypted = payload.isEncrypted ? 1 : 0;

        await this.env.DB.batch([
          this.env.DB.prepare(
            `INSERT INTO users (id, uid, username, avatar_url, status, badges_bitfield)
             VALUES (?1, ?2, ?3, ?4, 'online', ?5)
             ON CONFLICT(id) DO UPDATE SET username = excluded.username`
          ).bind(meta.userId, generateSnowflake(), meta.username, meta.avatar ?? null, UserBadges.EARLY_SUPPORTER),
          this.env.DB.prepare(
            `INSERT INTO messages (id, channel_id, author_id, content, is_encrypted, iv_base64, gif_url, embeds_json, attachments_json, reply_to_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
          ).bind(
            msgId,
            meta.channelId,
            meta.userId,
            payload.content,
            isEncrypted,
            payload.ivBase64 ?? null,
            payload.gifUrl ?? null,
            JSON.stringify(payload.embeds ?? []),
            JSON.stringify(payload.attachments ?? []),
            payload.replyToId ?? null,
            createdAt
          )
        ]);

        this.broadcast({
          type: "MESSAGE_CREATED",
          message: {
            id: msgId,
            channel_id: meta.channelId,
            author_id: meta.userId,
            username: meta.username,
            avatar_url: meta.avatar,
            content: payload.content,
            is_encrypted: isEncrypted,
            iv_base64: payload.ivBase64 ?? null,
            gif_url: payload.gifUrl ?? null,
            embeds_json: JSON.stringify(payload.embeds ?? []),
            attachments_json: JSON.stringify(payload.attachments ?? []),
            reply_to_id: payload.replyToId ?? null,
            created_at: createdAt
          }
        });
        break;
      }

      // Live Screen Share / Go Live Stream Events (0 D1 writes - purely in Durable Object memory!)
      case "STREAM_START": {
        meta.isStreaming = true;
        meta.streamTitle = payload.streamTitle || `${meta.username}'s Live Stream`;
        meta.streamQuality = payload.streamQuality || "1080p60";
        ws.serializeAttachment(meta);
        this.broadcast({
          type: "STREAM_STATE_CHANGED",
          streamerId: meta.userId,
          username: meta.username,
          isStreaming: true,
          streamTitle: meta.streamTitle,
          streamQuality: meta.streamQuality
        });
        break;
      }

      case "STREAM_STOP": {
        meta.isStreaming = false;
        ws.serializeAttachment(meta);
        this.broadcast({
          type: "STREAM_STATE_CHANGED",
          streamerId: meta.userId,
          username: meta.username,
          isStreaming: false
        });
        break;
      }

      case "TYPING_START":
      case "WEBRTC_SIGNAL": {
        this.broadcast({ ...payload, senderId: meta.userId, username: meta.username }, ws);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }

  private broadcast(data: unknown, exclude?: WebSocket) {
    const serialized = JSON.stringify(data);
    for (const sock of this.ctx.getWebSockets()) {
      if (sock !== exclude) {
        try {
          sock.send(serialized);
        } catch {}
      }
    }
  }
}

export default app;
