# Did he cook — kitchen themed multiplayer v3

This build fixes the major synchronization issue in the previous build.

Key changes:
- Non-host submissions are sent to the host without replacing the non-host's
  active page with the host's full state.
- Incoming state messages only cause a full render when the GAME PHASE changes.
  Submission/status updates refresh only the player-status area.
- Each client has its own local timer. A submission from another player cannot
  reset that client's timer.
- Timer expiry submits a default answer if the player has not submitted, so the
  game cannot get permanently stuck at 00:00.
- Everyone can see submission status for everyone else.
- The host sees joining players through Presence plus an explicit hello/state
  handshake.
- All clients automatically progress when the host detects every player has
  submitted. The host does not need to press Next.
- Kitchen-themed visual design.

SUPABASE:
1. In Supabase, open Realtime -> Settings.
2. Realtime must be enabled.
3. Public channel access must be enabled for this no-login client.
4. No database tables are required.
5. Never put a secret/service_role key in the browser.

DEPLOY:
Keep index.html at the root and the assets folder beside it.
The game uses relative local asset paths. It loads supabase-js from jsDelivr.
For an offline/no-network version, bundle supabase-js locally.

IMPORTANT:
This project uses Supabase as the realtime transport. The GitHub Pages site is
still a static frontend, but the actual multiplayer communication is handled
by Supabase Realtime.
