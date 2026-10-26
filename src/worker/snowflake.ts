// src/worker/snowflake.ts
// 64-bit Discord-compatible Snowflake UID generator (Custom Epoch: 2020-01-01T00:00:00Z)
const CLERD_EPOCH = 1577836800000n;
let sequence = 0n;

export function generateSnowflake(workerId = 1n): string {
  const now = BigInt(Date.now());
  sequence = (sequence + 1n) & 4095n;
  const id = ((now - CLERD_EPOCH) << 22n) | ((workerId & 31n) << 17n) | sequence;
  return id.toString();
}

export function snowflakeToTimestamp(snowflake: string): number {
  try {
    return Number((BigInt(snowflake) >> 22n) + CLERD_EPOCH);
  } catch {
    return Date.now();
  }
}

export const UserBadges = {
  CLERD_STAFF: 1 << 0,       // 🛡️ Staff
  EARLY_SUPPORTER: 1 << 1,   // 🌟 Early Supporter
  VERIFIED_DEV: 1 << 2,      // ⚙️ Verified Bot/App Developer
  BUG_HUNTER: 1 << 3,        // 🐛 Gold Bug Hunter
  NITRO_FLUX: 1 << 4,        // 🚀 clerd Nitro Flux
  SERVER_BOOSTER: 1 << 5,    // 💎 Server Booster
  MIGRATED_OG: 1 << 6        // 📦 Migrated from Discord
} as const;
