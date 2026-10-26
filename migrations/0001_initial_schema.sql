-- migrations/0001_initial_schema.sql
-- Complete Cloudflare D1 Schema for clerd (Full Discord Parity)
PRAGMA foreign_keys = ON;

-- 1. Users: 64-bit Snowflake UID, Avatars, Banners, Accent Colors, Badges Bitfield, Custom Status, Bio, E2EE Public Key
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                        -- Auth0 `sub` or primary ID
  uid TEXT NOT NULL UNIQUE,                   -- 18-digit Discord-style 64-bit Snowflake UID (e.g. '118945201928374681')
  discord_user_id TEXT UNIQUE,                -- Original Discord Snowflake when imported via Migration Tool
  username TEXT NOT NULL,
  display_name TEXT,
  discriminator TEXT NOT NULL DEFAULT '0001',
  avatar_url TEXT,
  banner_url TEXT,                            -- Profile Banner image URL (R2 or CDN)
  banner_color TEXT NOT NULL DEFAULT '#5865F2', -- Hex fallback banner accent color
  bio TEXT DEFAULT '',                        -- Markdown 'About Me' profile bio
  custom_status TEXT DEFAULT '',              -- Custom status text & emoji
  status TEXT NOT NULL DEFAULT 'online',      -- 'online' | 'idle' | 'dnd' | 'offline'
  badges_bitfield INTEGER NOT NULL DEFAULT 0, -- Bitfield: 1=STAFF, 2=EARLY_SUPPORTER, 4=VERIFIED_DEV, 8=BUG_HUNTER, 16=NITRO_FLUX, 32=SERVER_BOOSTER, 64=MIGRATED_OG
  public_key_jwk TEXT,                        -- ECDH P-256 Public Key (JSON) for E2EE Direct Messages
  theme_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_user_id);

-- 2. Private User Notes (Per-target user notes visible only to owner_user_id, just like Discord)
CREATE TABLE IF NOT EXISTS user_notes (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (owner_user_id, target_user_id)
);

-- 3. Favorite GIFs & Stickers (Synced across devices via D1)
CREATE TABLE IF NOT EXISTS user_favorite_gifs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gif_url TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  title TEXT DEFAULT '',
  width INTEGER DEFAULT 320,
  height INTEGER DEFAULT 240,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, gif_url)
);

-- 4. Customizable UI Themes (Stored in D1, Cached at Cloudflare Edge)
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public INTEGER NOT NULL DEFAULT 1,
  variables_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 5. Servers (Guilds) with Icons, Banners, Invite Codes, Boost Level, Vanity URL
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,                        -- 64-bit Snowflake UID
  discord_guild_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon_url TEXT,
  banner_url TEXT,                            -- Server Banner displayed at top of channel sidebar
  splash_url TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE NOT NULL,           -- Instant invite code (e.g., 'clerd-hq')
  boost_count INTEGER NOT NULL DEFAULT 0,
  boost_tier INTEGER NOT NULL DEFAULT 0,      -- 0, 1, 2, or 3
  default_theme_id TEXT REFERENCES themes(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_servers_invite ON servers(invite_code);

-- 6. Custom Server Emojis & Stickers
CREATE TABLE IF NOT EXISTS server_emojis (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  animated INTEGER NOT NULL DEFAULT 0,
  creator_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 7. Roles (64-bit Bitwise Permissions, Role Colors, Hoist, Role Icon Badge)
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  discord_role_id TEXT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#99AAB5',
  icon_badge TEXT,
  hoist INTEGER NOT NULL DEFAULT 0,           -- Display role members separately in online list
  position INTEGER NOT NULL DEFAULT 0,
  permissions_bitfield TEXT NOT NULL DEFAULT '3072',
  is_everyone INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_roles_server_pos ON roles(server_id, position DESC);

-- 8. Server Members & Moderation State (Server Nickname, Per-Server Avatar/Banner, Kick/Ban/Timeout)
CREATE TABLE IF NOT EXISTS server_members (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  server_avatar_url TEXT,
  server_banner_url TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  muted_until INTEGER,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (server_id, user_id)
);

-- 9. Member <-> Role Assignments
CREATE TABLE IF NOT EXISTS member_roles (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id),
  FOREIGN KEY (server_id, user_id) REFERENCES server_members(server_id, user_id) ON DELETE CASCADE
);

-- 10. Channels (Category, Text, Voice, Stage/Stream, Forum, DM, Group DM)
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  discord_channel_id TEXT UNIQUE,
  parent_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('category', 'text', 'voice', 'stage', 'forum', 'dm', 'group_dm')),
  name TEXT NOT NULL,
  topic TEXT DEFAULT '',
  bitrate INTEGER DEFAULT 64000,
  user_limit INTEGER DEFAULT 0,
  slowmode_seconds INTEGER DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_channels_server_pos ON channels(server_id, position ASC);

-- 11. Channel Permission Overwrites
CREATE TABLE IF NOT EXISTS channel_overwrites (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'member')),
  allow_bits TEXT NOT NULL DEFAULT '0',
  deny_bits TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (channel_id, target_id)
);

-- 12. Messages (Supports Rich Embeds, GIFs, Stickers, Polls, File Attachments, Pinned Messages, Replies, E2EE)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,                        -- 64-bit Snowflake ID
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_encrypted INTEGER NOT NULL DEFAULT 0,
  iv_base64 TEXT,
  gif_url TEXT,                               -- Direct GIF attachment from GIF picker
  sticker_name TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  embeds_json TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  edited_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_messages_channel_cursor ON messages(channel_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id, is_pinned) WHERE is_pinned = 1;

-- 13. Emoji Reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- 14. Full-Text Search (FTS5) Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  channel_id UNINDEXED,
  content,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_messages_fts_insert AFTER INSERT ON messages
WHEN new.is_encrypted = 0
BEGIN
  INSERT INTO messages_fts(rowid, message_id, channel_id, content)
  VALUES (new.rowid, new.id, new.channel_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_fts_delete AFTER DELETE ON messages
BEGIN
  DELETE FROM messages_fts WHERE rowid = old.rowid;
END;

-- 15. Friends & Relationships (Friends, Pending Incoming/Outgoing, Blocked)
CREATE TABLE IF NOT EXISTS relationships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('friend', 'pending_in', 'pending_out', 'blocked')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, target_id)
);

-- 16. Audit Logs (Moderation & Server Changes)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL,                  -- 'MEMBER_KICK', 'MEMBER_BAN', 'CHANNEL_CREATE', 'ROLE_UPDATE', 'DISCORD_IMPORT'
  target_id TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
