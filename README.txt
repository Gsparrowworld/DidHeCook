# Did he cook — kitchen multiplayer v4

This build is based directly on the last known-good cross-device multiplayer build
provided by the user. The Supabase URL and publishable key are preserved exactly.

Fixes:
- Preserves the working Supabase Realtime connection/handshake architecture.
- Does NOT use a guessed/new Supabase key.
- A remote submission updates only the player-status list while a player is typing.
- Remote submissions cannot redraw the active round or restart its timer.
- Every player's timer is local to that browser.
- Timer expiry automatically submits a fallback answer, preventing stuck rounds.
- Host coordinates automatic phase transitions.
- Players automatically enter the next round when everyone has submitted.
- Everyone sees live Thinking / Submitted status.
- Kitchen-themed visuals.

Supabase:
- Realtime enabled.
- Public channel access enabled.
- No database tables required.
- Use only the publishable browser key, never a secret/service_role key.

Deployment:
index.html at repository root, assets beside it. All local game assets use relative paths.
The Supabase JS client is loaded from jsDelivr, which supports CORS.
