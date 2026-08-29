DID HE COOK — FIXED CROSS-DEVICE BUILD

1. In Supabase open Realtime -> Settings.
2. Make sure Realtime is enabled.
3. Make sure Allow public access to channels is ENABLED.
4. No database tables are required.
5. Deploy this whole folder to GitHub Pages/Netlify/Cloudflare Pages.
6. The included assets/config.js already contains the supplied Supabase URL and publishable key.
7. Create a room on Device A, copy the five-character code, then open the deployed URL on Device B and join it.

The client uses Supabase Realtime Broadcast + Presence. The host responds to explicit hello messages, so joining does not depend on a timing-sensitive presence callback.

Never replace the publishable key with a secret/service_role key.
