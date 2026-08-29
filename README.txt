# Did he cook — Multiplayer v5

This build is based directly on the uploaded v2 build that was known to connect.
The exact credentials requested by the user are in assets/config.js:

https://narspzirurrsdbhblalb.supabase.co
sb_publishable_00dNE1hThWqAco5aaGk3sg_VMT9dYne

The Realtime connection/channel creation pattern is intentionally kept the same
as v2. Game synchronization was changed separately:
- active forms are not redrawn on remote submissions
- player status updates are updated in place
- timers are local and do not reset
- timeout auto-submits
- all players receive phase changes
- host advances automatically
- kitchen-themed UI

Supabase Realtime and public channel access should remain configured exactly as
they were for the working v2 build.
\n\nV6 CHANGES\n- Round 2 now uses six separate ingredient dropdowns instead of a textarea.\n- Each slot has its own ingredient selector.\n- Duplicate selections are prevented.\n- Submitting takes the player to a dedicated waiting screen; the next round only appears after everyone submits (or times out).\n
V7 CHANGES
- Round 2 now has SIX separate SELECT input fields, one for each ingredient.
- Round 2 shows BOTH the ingredient prompt and the food item prompt from the other player.
- Players choose six distinct ingredients from dropdown selectors; they do not type a list.
- Round 3 now presents the eight supplied ingredients as individual selectable checkboxes.
- Players actively choose which supplied ingredients to use for the food item.
- The chef pitch is optional and no longer replaces ingredient selection.
- Waiting screens remain after submission.

V8 CLARIFICATION / GAME FLOW
Round 1:
- Player submits TWO things: an ingredient prompt and a food item prompt.

Round 2:
- Player receives ONLY another player's ingredient prompt.
- Player types SIX ingredients into SIX separate input fields.
- The Round 1 food item is intentionally NOT shown in Round 2.

Round 3:
- Player receives a random food item prompt taken from another player's Round 1 submission.
- Player receives 8 ingredients assembled from other players' Round 2 submissions, excluding their own.
- Player SELECTS which of those 8 ingredients to use for the dish.
- The optional chef pitch is supplementary; ingredient selection is required.
