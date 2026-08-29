# Did he cook — cross-device multiplayer

This build fixes the multiplayer form-reset problem and makes progression automatic.

## What changed

- Typing in Round 1/2/3 is no longer destroyed when another player submits.
- The timer does not restart just because another player submitted.
- Everyone sees a live player list showing Thinking / Submitted.
- The host sees everyone in the lobby.
- A non-host can join from another device and remains connected through Supabase Realtime.
- Everyone automatically moves to the next round when all connected players have submitted.
- The host does not need to press a Next button.
- Presence tracks connected players; Broadcast carries game events/state.

## Supabase

1. Open the Supabase project.
2. Realtime -> Settings.
3. Ensure Realtime is enabled.
4. Ensure public channel access is enabled for this build.
5. No database tables are required.
6. Never put a secret/service_role key in the browser.

The browser uses the supplied publishable key in assets/config.js.

## Deploy

Put index.html at the repository root and the assets folder beside it.
Deploy the folder to GitHub Pages, Netlify, Cloudflare Pages, or another static HTTPS host.

The HTML references local ./assets files. The Supabase JavaScript client is loaded from
jsDelivr in index.html; jsDelivr supports cross-origin browser loading.

## Test

Device A: Create Room -> copy code.
Device B: open the same deployed site -> enter code -> Join Room.
Device A should show Device B in the lobby.
Both players Ready -> host starts.
Each player submits independently. Other players' submission status updates without
redrawing the active form. Once everyone submits, everyone advances automatically.
