// scripts/migrate-discord.ts
// Discord API v10 Server, Channel, Role, Member, Badge, Banner, and Message History Importer
const DISCORD_API = "https://discord.com/api/v10";

export async function migrateDiscordServer(botToken: string, guildId: string, clerdUrl: string, adminJwt: string) {
  const headers = { Authorization: `Bot ${botToken}` };
  const guild = await fetch(`${DISCORD_API}/guilds/${guildId}`, { headers }).then((r) => r.json());
  const channels = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers }).then((r) => r.json());
  const emojis = await fetch(`${DISCORD_API}/guilds/${guildId}/emojis`, { headers }).then((r) => r.json());

  const res = await fetch(`${clerdUrl}/api/migrations/discord`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminJwt}` },
    body: JSON.stringify({ guild, channels, emojis })
  });
  return res.json();
}
