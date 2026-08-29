# Did he cook — cross-device multiplayer

This is a static HTML/CSS/JS build. The frontend can be deployed to GitHub Pages,
Netlify, Cloudflare Pages, etc. Supabase Realtime is used as the hosted signaling /
state-sync service so players on different devices can join the same room code.

## 1. Create a Supabase project

Create a project at https://supabase.com/.

No database table is required for this version. The game uses Realtime Presence and
Broadcast channels.

## 2. Configure the game

Open:

    assets/config.js

Replace:

    PASTE_YOUR_SUPABASE_URL_HERE
    PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE

with the values from your Supabase project's API settings.

Do NOT put a service_role key in the site.

## 3. Deploy

Upload the whole folder:

    index.html
    assets/
      config.js
      game.js
      style.css

The Supabase JavaScript SDK is loaded from jsDelivr. The official Supabase docs
document CDN usage of supabase-js for browser applications.

## 4. Multiplayer

1. One player chooses Create room.
2. The game generates a five-character room code.
3. Other players open the same deployed site on another device.
4. They enter the code and choose Join room.
5. The host sees players appear through Realtime Presence.
6. The host starts the game.
7. Game state and submissions are synchronized through Realtime Broadcast.

A room is intentionally ephemeral: if everyone leaves, the room disappears.
