# clerd — Full-Stack Discord Alternative on Cloudflare Free Plan

Includes everything Discord offers:
- **64-bit Snowflake UIDs** (`118945201928374681`) with one-click Copy UID & Developer Mode
- **Go Live Screen Streams & Camera Stage** (`getDisplayMedia` + `getUserMedia` + WebRTC SFU) with 720p/1080p/1440p quality selector, live stream preview cards, and Picture-in-Picture
- **Profile Badges** (Staff, Early Supporter, Verified Dev, Bug Hunter, Nitro Flux, Server Booster, Migrated OG)
- **Custom Profile Banners, Avatars & Accent Colors** + **Server Banners & Invite Codes**
- **Private User Notes** persisted per target user in Cloudflare D1 (`user_notes` table)
- **GIF Picker & Favorites** (Search, Trending, Categories, and Starred Favorites synced to D1)
- **End-to-End Encrypted Direct Messages** (Web Crypto API ECDH P-256 + AES-256-GCM)
- **Workers AI Chat Summarization** (`@cf/meta/llama-3.1-8b-instruct`)
- **One-Click Discord Server Migration Tool** (Discord API v10)

Media object storage is not currently configured; avatar/banner and attachment uploads are not available. The chat UI and Worker do not require a paid R2 bucket.

## Quick Start
1. `npm install`
2. In Auth0, set the SPA's **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins** to `http://localhost:5173`. The callback and logout URLs must also include your deployed app origin when you deploy.
3. Check `.env` for the Auth0 tenant domain, SPA client ID, and API audience. The current SDK redirect URI is the app origin (`http://localhost:5173`).
4. `npx wrangler login`
5. `npm run db:migrate:local` (for local development; use `npm run db:migrate:remote` to apply migrations to the configured Cloudflare D1 database)
6. Start the Worker in one terminal with `npm run dev:worker`.
7. Start Vite in a second terminal with `npm run dev` (port 5173 is fixed; Vite exits if it is unavailable).
