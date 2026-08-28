/* ============================================================
   DID HE COOK? — pass-the-prompt party game
   Pure static client. Peer-to-peer via PeerJS (public broker
   used only for connection signaling; gameplay data flows
   directly between browsers / relayed by the host peer).
   No window.top / parent / opener usage — safe inside a
   sandboxed iframe.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- small utilities ---------------- */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clean(str, max) {
    if (typeof str !== "string") return "";
    var s = str.replace(/\s+/g, " ").trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // returns a permutation of indices [0..n-1] with NO fixed points
  // (so player i is never assigned their own item), for n >= 2.
  function derangement(n) {
    if (n < 2) return [0];
    var idx;
    var tries = 0;
    do {
      idx = shuffled(Array.from({ length: n }, function (_, i) { return i; }));
      tries++;
    } while (idx.some(function (v, i) { return v === i; }) && tries < 200);
    // fallback: simple rotation guarantees no fixed points for n>=2
    if (idx.some(function (v, i) { return v === i; })) {
      idx = Array.from({ length: n }, function (_, i) { return (i + 1) % n; });
    }
    return idx;
  }

  var ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  function makeRoomCode() {
    var s = "";
    for (var i = 0; i < 4; i++) s += ROOM_CODE_CHARS[randInt(ROOM_CODE_CHARS.length)];
    return s;
  }

  var FALLBACK_INGREDIENT_PROMPTS = [
    "ingredients you'd find at a haunted carnival",
    "things stuffed in the back of a college fridge",
    "ingredients smuggled off a pirate ship",
    "things found on a school science shelf",
    "ingredients from a wizard's pantry"
  ];
  var FALLBACK_FOOD_PROMPTS = ["pizza", "burrito", "soup", "sandwich", "sundae"];
  var FALLBACK_INGREDIENTS = [
    "mystery sauce", "questionable cheese", "glitter", "old gum", "duct tape",
    "expired ketchup", "a single sock", "cardboard", "hot glue", "dust bunnies",
    "bug spray", "candle wax", "rubber bands", "chalk dust", "wet napkins"
  ];

  /* ---------------- audio (WebAudio, only after a click) ---------------- */

  var audioCtx = null;
  function unlockAudio() {
    if (audioCtx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } catch (e) { audioCtx = null; }
  }
  function beep(freq, dur, type) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }
  function sfxClick() { beep(440, 0.08, "square"); }
  function sfxPhase() { beep(660, 0.15, "triangle"); setTimeout(function () { beep(880, 0.15, "triangle"); }, 120); }
  function sfxWin() { beep(523, 0.12); setTimeout(function () { beep(659, 0.12); }, 110); setTimeout(function () { beep(784, 0.25); }, 220); }

  /* ---------------- DOM refs ---------------- */

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    home: $("screen-home"),
    lobby: $("screen-lobby"),
    prompts: $("screen-prompts"),
    ingredients: $("screen-ingredients"),
    combine: $("screen-combine"),
    voting: $("screen-voting"),
    results: $("screen-results")
  };

  var gameHeader = $("gameHeader");
  var phaseTitleEl = $("phaseTitle");
  var timerDisplayEl = $("timerDisplay");
  var timerValueEl = $("timerValue");
  var connStatusEl = $("connStatus");
  var toastEl = $("toast");

  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("hidden", k !== name);
    });
    if (name === "home") gameHeader.classList.add("hidden");
    else gameHeader.classList.remove("hidden");
  }

  var toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = "toast" + (isError ? " error" : "");
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, 3200);
  }

  function setConnStatus(state) {
    // state: 'ok' | 'warn' | 'bad'
    connStatusEl.className = "conn-status" + (state === "ok" ? "" : " " + state);
    connStatusEl.title = state === "ok" ? "Connected" : state === "warn" ? "Connecting…" : "Disconnected";
  }

  /* ---------------- game state ---------------- */

  var G = {
    role: null,          // 'host' | 'client'
    peer: null,
    conns: {},            // host: peerId -> DataConnection
    hostConn: null,       // client: DataConnection to host
    myId: null,
    myName: "",
    hostId: null,         // full peer id string of host ("dhc-xxxx")
    roomCode: null,
    players: {},          // id -> {id, name, isHost}
    settings: { timerSeconds: 60, maxPlayers: 8 },
    phase: "home",
    deadline: 0,
    countdownInterval: null,
    hostTickInterval: null,

    // host-authoritative round data
    round: {
      prompts: {},              // playerId -> {ingredientPrompt, foodPrompt}
      ingredientAssignment: {}, // playerId -> fromPlayerId (whose ingredient prompt they fill)
      ingredientLists: {},      // playerId -> [6 strings]  (submitted, about the prompt assigned to them)
      foodAssignment: {},       // playerId -> fromPlayerId (whose food prompt they combine)
      pools: {},                // playerId -> [ingredients pool of up to 8]
      dishes: {},                // playerId -> {foodPrompt, ingredients:[], name, description}
      votingList: [],            // [{ownerId, foodPrompt, ingredients, name, description}] shuffled
      votes: {}                  // voterId -> ownerId voted for
    },

    // this client's local scratch for current phase (used for auto-submit on timeout)
    local: { submitted: false }
  };

  /* ============================================================
     NETWORKING
     ============================================================ */

  function playerArray() {
    return Object.keys(G.players).map(function (id) { return G.players[id]; });
  }

  function otherIds(excludeId) {
    return Object.keys(G.players).filter(function (id) { return id !== excludeId; });
  }

  // Broadcasts / rendering messages (lobby_update, phase_*, player_left, ...)
  // always go through handleGameMessage — this is what actually drives the
  // UI, for BOTH the host's own screen and every connected client.
  function hostBroadcast(msg, exceptId) {
    Object.keys(G.conns).forEach(function (pid) {
      if (pid === exceptId) return;
      try { G.conns[pid].send(msg); } catch (e) { /* ignore */ }
    });
    if (G.myId !== exceptId) handleGameMessage(msg);
  }

  function hostSendTo(pid, msg) {
    if (pid === G.myId) { handleGameMessage(msg); return; }
    var c = G.conns[pid];
    if (c) { try { c.send(msg); } catch (e) { /* ignore */ } }
  }

  // Messages a player sends TO the host (hello, submissions, votes).
  // When the host itself is the "player" (it plays too), route straight
  // into the same handler used for real remote connections.
  function clientSend(msg) {
    if (G.role === "host") { handleFromPlayer(msg, G.myId); return; }
    if (G.hostConn) { try { G.hostConn.send(msg); } catch (e) { /* ignore */ } }
  }

  function newPeerWithId(id, cb) {
    var p = new Peer(id, { debug: 0 });
    p.on("open", function (openedId) { cb(null, p, openedId); });
    p.on("error", function (err) { cb(err, p, null); });
  }

  var HOST_ID_RETRIES = 5;

  function hostGame() {
    unlockAudio();
    var name = clean($("nameInput").value, 18) || "Host";
    G.myName = name;
    var attempts = 0;

    function tryCreate() {
      attempts++;
      var code = makeRoomCode();
      var fullId = "dhc-" + code.toLowerCase();
      var p = new Peer(fullId, { debug: 0 });

      var settled = false;

      p.on("open", function (id) {
        if (settled) return;
        settled = true;
        G.role = "host";
        G.peer = p;
        G.myId = id;
        G.hostId = id;
        G.roomCode = code;
        G.players = {};
        G.players[id] = { id: id, name: name, isHost: true };

        setConnStatus("ok");
        renderLobby();
        showScreen("lobby");

        p.on("connection", function (conn) { setupHostConnection(conn); });
        p.on("disconnected", function () { setConnStatus("bad"); toast("Lost connection to signaling server.", true); });
        p.on("error", function (err) {
          console.warn("peer error (host, post-open):", err && err.type);
        });
      });

      p.on("error", function (err) {
        if (settled) return;
        if (err && err.type === "unavailable-id" && attempts < HOST_ID_RETRIES) {
          try { p.destroy(); } catch (e) {}
          tryCreate();
        } else if (!settled) {
          settled = true;
          showHomeError("Couldn't create a room (" + (err && err.type ? err.type : "network error") + "). Check your connection and try again.");
        }
      });
    }
    tryCreate();
  }

  function setupHostConnection(conn) {
    conn.on("open", function () {
      // capacity check
      if (Object.keys(G.players).length >= G.settings.maxPlayers) {
        try { conn.send({ t: "room_full" }); } catch (e) {}
        setTimeout(function () { try { conn.close(); } catch (e) {} }, 200);
        return;
      }
      if (G.phase !== "home" && G.phase !== "lobby") {
        try { conn.send({ t: "room_in_progress" }); } catch (e) {}
        setTimeout(function () { try { conn.close(); } catch (e) {} }, 200);
        return;
      }
      G.conns[conn.peer] = conn;
    });
    conn.on("data", function (data) { handleFromPlayer(data, conn.peer); });
    conn.on("close", function () { handlePlayerLeft(conn.peer); });
    conn.on("error", function () { handlePlayerLeft(conn.peer); });
  }

  function handlePlayerLeft(pid) {
    if (!G.players[pid]) return;
    delete G.players[pid];
    delete G.conns[pid];
    if (G.phase === "lobby" || G.phase === "home") {
      renderLobby();
      hostBroadcast({ t: "lobby_update", players: playerArray(), settings: G.settings });
    } else {
      // mid-game departure: just drop them from further tallies; don't halt the game
      hostBroadcast({ t: "player_left", id: pid, players: playerArray() });
      checkAllSubmitted();
    }
  }

  function joinGame(codeRaw) {
    unlockAudio();
    var name = clean($("nameInput").value, 18) || "Player";
    var code = clean(codeRaw, 6).toUpperCase();
    if (!code) { showHomeError("Enter a room code."); return; }
    G.myName = name;

    var p = new Peer(undefined, { debug: 0 });
    var settled = false;

    p.on("open", function (myId) {
      G.role = "client";
      G.peer = p;
      G.myId = myId;
      var targetId = "dhc-" + code.toLowerCase();
      G.hostId = targetId;
      G.roomCode = code;

      var conn = p.connect(targetId, { reliable: true });
      var connectTimeout = setTimeout(function () {
        if (!settled) {
          showHomeError("Couldn't reach that room. Check the code and try again.");
          try { conn.close(); } catch (e) {}
          try { p.destroy(); } catch (e) {}
        }
      }, 9000);

      conn.on("open", function () {
        settled = true;
        clearTimeout(connectTimeout);
        G.hostConn = conn;
        setConnStatus("ok");
        conn.send({ t: "hello", name: name, id: myId });
      });
      conn.on("data", function (data) { handleGameMessage(data); });
      conn.on("close", function () {
        setConnStatus("bad");
        if (G.phase !== "home") toast("Host disconnected. Game ended.", true);
      });
      conn.on("error", function (err) {
        clearTimeout(connectTimeout);
        if (!settled) showHomeError("Couldn't reach that room. Check the code and try again.");
      });
    });

    p.on("error", function (err) {
      if (settled) return;
      if (err && err.type === "peer-unavailable") {
        showHomeError("No room found with that code.");
      } else {
        showHomeError("Connection error (" + (err && err.type ? err.type : "network") + "). Try again.");
      }
    });
  }

  /* ============================================================
     MESSAGE HANDLING
     ============================================================ */

  // Called only on the HOST, for data arriving from a specific player
  // (a real remote connection, or the host's own local submission).
  function handleFromPlayer(msg, fromId) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case "hello":
        onHostHello(msg, fromId);
        break;
      case "submit_prompts":
        onHostSubmitPrompts(msg, fromId);
        break;
      case "submit_ingredients":
        onHostSubmitIngredients(msg, fromId);
        break;
      case "submit_dish":
        onHostSubmitDish(msg, fromId);
        break;
      case "vote":
        onHostVote(msg, fromId);
        break;
    }
  }

  // Called on EVERY player (host's own screen included) to drive the UI
  // from authoritative game-state broadcasts.
  function handleGameMessage(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case "room_full":
        showHomeError("That room is full.");
        break;
      case "room_in_progress":
        showHomeError("That game has already started.");
        break;
      case "lobby_update":
        G.players = {};
        msg.players.forEach(function (p) { G.players[p.id] = p; });
        G.settings = msg.settings;
        renderLobby();
        break;
      case "player_left":
        G.players = {};
        msg.players.forEach(function (p) { G.players[p.id] = p; });
        if (G.phase === "lobby") renderLobby();
        break;
      case "phase_prompts":
        enterPhasePrompts(msg.deadline);
        break;
      case "phase_ingredients":
        enterPhaseIngredients(msg.deadline, msg.prompt);
        break;
      case "phase_combine":
        enterPhaseCombine(msg.deadline, msg.prompt, msg.ingredients);
        break;
      case "phase_voting":
        enterPhaseVoting(msg.deadline, msg.dishes, msg.myOwnerId);
        break;
      case "phase_results":
        enterPhaseResults(msg.results, msg.winnerIds);
        break;
    }
  }

  function onHostHello(msg, fromId) {
    var name = clean(msg.name, 18) || "Player";
    G.players[fromId] = { id: fromId, name: name, isHost: false };
    renderLobby();
    hostBroadcast({ t: "lobby_update", players: playerArray(), settings: G.settings });
  }

  /* ============================================================
     HOST-SIDE GAME FLOW
     ============================================================ */

  function clearHostTick() {
    if (G.hostTickInterval) { clearInterval(G.hostTickInterval); G.hostTickInterval = null; }
  }

  function armHostTick(onDeadline, onEarlyCheck) {
    clearHostTick();
    G.hostTickInterval = setInterval(function () {
      if (onEarlyCheck && onEarlyCheck()) {
        clearHostTick();
        onDeadline(true);
        return;
      }
      if (Date.now() >= G.deadline) {
        clearHostTick();
        onDeadline(false);
      }
    }, 300);
  }

  function startGameHost() {
    var ids = Object.keys(G.players);
    if (ids.length < 2) { toast("Need at least 2 chefs to start.", true); return; }
    G.round = {
      prompts: {}, ingredientAssignment: {}, ingredientLists: {},
      foodAssignment: {}, pools: {}, dishes: {}, votingList: [], votes: {}
    };
    beginPhasePrompts();
  }

  function beginPhasePrompts() {
    G.phase = "prompts";
    G.deadline = Date.now() + G.settings.timerSeconds * 1000;
    hostBroadcast({ t: "phase_prompts", deadline: G.deadline });
    armHostTick(finishPhasePrompts, function () {
      return Object.keys(G.round.prompts).length >= Object.keys(G.players).length;
    });
  }

  function onHostSubmitPrompts(msg, fromId) {
    if (G.phase !== "prompts" || G.round.prompts[fromId]) return;
    G.round.prompts[fromId] = {
      ingredientPrompt: clean(msg.ingredientPrompt, 80) || FALLBACK_INGREDIENT_PROMPTS[randInt(FALLBACK_INGREDIENT_PROMPTS.length)],
      foodPrompt: clean(msg.foodPrompt, 60) || FALLBACK_FOOD_PROMPTS[randInt(FALLBACK_FOOD_PROMPTS.length)]
    };
  }

  function finishPhasePrompts() {
    var ids = Object.keys(G.players);
    ids.forEach(function (id) {
      if (!G.round.prompts[id]) {
        G.round.prompts[id] = {
          ingredientPrompt: FALLBACK_INGREDIENT_PROMPTS[randInt(FALLBACK_INGREDIENT_PROMPTS.length)],
          foodPrompt: FALLBACK_FOOD_PROMPTS[randInt(FALLBACK_FOOD_PROMPTS.length)]
        };
      }
    });
    beginPhaseIngredients();
  }

  function beginPhaseIngredients() {
    var ids = Object.keys(G.players);
    var order = derangement(ids.length);
    ids.forEach(function (id, i) { G.round.ingredientAssignment[id] = ids[order[i]]; });

    G.phase = "ingredients";
    G.deadline = Date.now() + G.settings.timerSeconds * 1000;
    ids.forEach(function (id) {
      var fromId = G.round.ingredientAssignment[id];
      hostSendTo(id, { t: "phase_ingredients", deadline: G.deadline, prompt: G.round.prompts[fromId].ingredientPrompt });
    });
    armHostTick(finishPhaseIngredients, function () {
      return Object.keys(G.round.ingredientLists).length >= ids.length;
    });
  }

  function onHostSubmitIngredients(msg, fromId) {
    if (G.phase !== "ingredients" || G.round.ingredientLists[fromId]) return;
    var list = Array.isArray(msg.list) ? msg.list.map(function (s) { return clean(s, 30); }).filter(Boolean) : [];
    list = list.slice(0, 6);
    while (list.length < 6) list.push(FALLBACK_INGREDIENTS[randInt(FALLBACK_INGREDIENTS.length)]);
    G.round.ingredientLists[fromId] = list;
  }

  function finishPhaseIngredients() {
    var ids = Object.keys(G.players);
    ids.forEach(function (id) {
      if (!G.round.ingredientLists[id]) {
        var list = [];
        for (var i = 0; i < 6; i++) list.push(FALLBACK_INGREDIENTS[randInt(FALLBACK_INGREDIENTS.length)]);
        G.round.ingredientLists[id] = list;
      }
    });
    beginPhaseCombine();
  }

  function beginPhaseCombine() {
    var ids = Object.keys(G.players);
    var order = derangement(ids.length);
    ids.forEach(function (id, i) { G.round.foodAssignment[id] = ids[order[i]]; });

    ids.forEach(function (id) {
      var pool = [];
      otherIds(id).forEach(function (oid) {
        pool = pool.concat(G.round.ingredientLists[oid] || []);
      });
      pool = shuffled(pool);
      var picked = pool.slice(0, 8);
      while (picked.length < 8 && pool.length > 0) {
        picked.push(pool[randInt(pool.length)]);
      }
      if (picked.length === 0) picked = shuffled(FALLBACK_INGREDIENTS).slice(0, 8);
      G.round.pools[id] = picked;
    });

    G.phase = "combine";
    G.deadline = Date.now() + G.settings.timerSeconds * 1000;
    ids.forEach(function (id) {
      var foodFrom = G.round.foodAssignment[id];
      hostSendTo(id, {
        t: "phase_combine",
        deadline: G.deadline,
        prompt: G.round.prompts[foodFrom].foodPrompt,
        ingredients: G.round.pools[id]
      });
    });
    armHostTick(finishPhaseCombine, function () {
      return Object.keys(G.round.dishes).length >= ids.length;
    });
  }

  function onHostSubmitDish(msg, fromId) {
    if (G.phase !== "combine" || G.round.dishes[fromId]) return;
    var pool = G.round.pools[fromId] || [];
    var chosen = Array.isArray(msg.chosen) ? msg.chosen.filter(function (s) { return pool.indexOf(s) !== -1; }) : [];
    chosen = chosen.slice(0, 8);
    var foodFrom = G.round.foodAssignment[fromId];
    G.round.dishes[fromId] = {
      foodPrompt: G.round.prompts[foodFrom].foodPrompt,
      ingredients: chosen.length ? chosen : shuffled(pool).slice(0, 2),
      name: clean(msg.name, 40) || "Mystery Dish",
      description: clean(msg.description, 200)
    };
  }

  function finishPhaseCombine() {
    var ids = Object.keys(G.players);
    ids.forEach(function (id) {
      if (!G.round.dishes[id]) {
        var pool = G.round.pools[id] || FALLBACK_INGREDIENTS;
        var foodFrom = G.round.foodAssignment[id];
        G.round.dishes[id] = {
          foodPrompt: (G.round.prompts[foodFrom] || {}).foodPrompt || FALLBACK_FOOD_PROMPTS[0],
          ingredients: shuffled(pool).slice(0, 2),
          name: "Mystery Dish",
          description: "No description provided."
        };
      }
    });
    beginPhaseVoting();
  }

  function beginPhaseVoting() {
    var ids = Object.keys(G.players);
    var list = ids.map(function (id) {
      var d = G.round.dishes[id];
      return { ownerId: id, foodPrompt: d.foodPrompt, ingredients: d.ingredients, name: d.name, description: d.description };
    });
    G.round.votingList = shuffled(list);

    G.phase = "voting";
    G.deadline = Date.now() + G.settings.timerSeconds * 1000;
    ids.forEach(function (id) {
      hostSendTo(id, { t: "phase_voting", deadline: G.deadline, dishes: G.round.votingList, myOwnerId: id });
    });
    armHostTick(finishPhaseVoting, function () {
      return Object.keys(G.round.votes).length >= ids.length;
    });
  }

  function onHostVote(msg, fromId) {
    if (G.phase !== "voting" || G.round.votes[fromId]) return;
    if (!msg.ownerId || msg.ownerId === fromId) return;
    if (!G.players[msg.ownerId]) return;
    G.round.votes[fromId] = msg.ownerId;
  }

  function finishPhaseVoting() {
    var tally = {};
    Object.keys(G.players).forEach(function (id) { tally[id] = 0; });
    Object.keys(G.round.votes).forEach(function (voter) {
      var target = G.round.votes[voter];
      if (tally[target] != null) tally[target]++;
    });
    var results = Object.keys(G.players).map(function (id) {
      var d = G.round.dishes[id] || {};
      return {
        ownerId: id,
        ownerName: G.players[id] ? G.players[id].name : "?",
        votes: tally[id] || 0,
        foodPrompt: d.foodPrompt, ingredients: d.ingredients, name: d.name, description: d.description
      };
    }).sort(function (a, b) { return b.votes - a.votes; });

    var top = results.length ? results[0].votes : 0;
    var winnerIds = results.filter(function (r) { return r.votes === top && top > 0; }).map(function (r) { return r.ownerId; });

    G.phase = "results";
    hostBroadcast({ t: "phase_results", results: results, winnerIds: winnerIds });
  }

  function checkAllSubmitted() {
    // called after a mid-game disconnect to allow early advance if everyone remaining has submitted
    var ids = Object.keys(G.players);
    if (ids.length === 0) { clearHostTick(); return; }
    if (G.phase === "prompts" && ids.every(function (id) { return G.round.prompts[id]; })) { clearHostTick(); finishPhasePrompts(); }
    else if (G.phase === "ingredients" && ids.every(function (id) { return G.round.ingredientLists[id]; })) { clearHostTick(); finishPhaseIngredients(); }
    else if (G.phase === "combine" && ids.every(function (id) { return G.round.dishes[id]; })) { clearHostTick(); finishPhaseCombine(); }
    else if (G.phase === "voting" && ids.every(function (id) { return G.round.votes[id]; })) { clearHostTick(); finishPhaseVoting(); }
  }

  /* ============================================================
     CLIENT-SIDE PHASE RENDERING (also runs for host, since the
     host is fed its own broadcasts through handleMessage)
     ============================================================ */

  function startLocalCountdown(label) {
    if (G.countdownInterval) clearInterval(G.countdownInterval);
    timerDisplayEl.classList.remove("hidden");
    phaseTitleEl.textContent = label;
    function tick() {
      var remaining = Math.max(0, Math.round((G.deadline - Date.now()) / 1000));
      timerValueEl.textContent = remaining;
      if (remaining <= 0) clearInterval(G.countdownInterval);
    }
    tick();
    G.countdownInterval = setInterval(tick, 250);
  }

  function enterPhasePrompts(deadline) {
    G.phase = "prompts";
    G.deadline = deadline;
    G.local = { submitted: false };
    $("promptsForm").reset();
    $("promptsForm").classList.remove("hidden");
    $("promptsWaiting").classList.add("hidden");
    startLocalCountdown("Round 1 · Set the Challenge");
    sfxPhase();
    showScreen("prompts");
  }

  function enterPhaseIngredients(deadline, prompt) {
    G.phase = "ingredients";
    G.deadline = deadline;
    G.local = { submitted: false };
    $("assignedIngredientPrompt").textContent = prompt;
    var grid = $("ingredientInputs");
    grid.innerHTML = "";
    for (var i = 0; i < 6; i++) {
      var input = document.createElement("input");
      input.type = "text";
      input.maxLength = 30;
      input.required = true;
      input.placeholder = "Ingredient " + (i + 1);
      input.className = "ingredient-slot";
      grid.appendChild(input);
    }
    $("ingredientsForm").classList.remove("hidden");
    $("ingredientsWaiting").classList.add("hidden");
    startLocalCountdown("Round 2 · Fill the Pantry");
    sfxPhase();
    showScreen("ingredients");
  }

  var currentPool = [];
  var currentSelection = [];

  function renderChipPools() {
    var poolEl = $("ingredientPool");
    var selEl = $("selectedIngredients");
    poolEl.innerHTML = "";
    selEl.innerHTML = "";
    currentPool.forEach(function (ing, i) {
      var chosenCount = currentSelection.filter(function (s) { return s === ing; }).length;
      var totalCount = currentPool.filter(function (s) { return s === ing; }).length;
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = ing;
      var usesLeft = totalCount - chosenCount;
      if (usesLeft <= 0) chip.classList.add("chosen");
      chip.addEventListener("click", function () {
        if (usesLeft <= 0) return;
        sfxClick();
        currentSelection.push(ing);
        renderChipPools();
      });
      poolEl.appendChild(chip);
    });
    currentSelection.forEach(function (ing, i) {
      var chip = document.createElement("span");
      chip.className = "chip in-selected";
      chip.textContent = ing;
      chip.title = "Tap to remove";
      chip.addEventListener("click", function () {
        sfxClick();
        currentSelection.splice(i, 1);
        renderChipPools();
      });
      selEl.appendChild(chip);
    });
  }

  function enterPhaseCombine(deadline, prompt, ingredients) {
    G.phase = "combine";
    G.deadline = deadline;
    G.local = { submitted: false };
    $("assignedFoodPrompt").textContent = prompt;
    currentPool = ingredients.slice();
    currentSelection = [];
    renderChipPools();
    $("combineForm").reset();
    $("combineForm").classList.remove("hidden");
    $("combineWaiting").classList.add("hidden");
    startLocalCountdown("Round 3 · Cook It Up");
    sfxPhase();
    showScreen("combine");
  }

  var currentVoteChoice = null;

  function enterPhaseVoting(deadline, dishes, myOwnerId) {
    G.phase = "voting";
    G.deadline = deadline;
    G.local = { submitted: false };
    currentVoteChoice = null;
    var listEl = $("dishList");
    listEl.innerHTML = "";
    dishes.forEach(function (d) {
      var card = document.createElement("div");
      var isMine = d.ownerId === myOwnerId;
      card.className = "dish-card" + (isMine ? " mine" : "");
      card.innerHTML =
        '<div class="dish-prompt">' + escapeHtml(d.foodPrompt) + '</div>' +
        '<h4>' + escapeHtml(d.name) + '</h4>' +
        '<div class="dish-ingredients">' + d.ingredients.map(escapeHtml).join(", ") + '</div>' +
        (d.description ? '<div class="dish-desc">"' + escapeHtml(d.description) + '"</div>' : "") +
        (isMine ? '<div class="dish-author">This is your dish</div>' : "");
      if (!isMine) {
        card.addEventListener("click", function () {
          sfxClick();
          currentVoteChoice = d.ownerId;
          Array.prototype.forEach.call(listEl.children, function (c) { c.classList.remove("selected"); });
          card.classList.add("selected");
          $("submitVoteBtn").disabled = false;
        });
      }
      listEl.appendChild(card);
    });
    $("submitVoteBtn").disabled = true;
    $("submitVoteBtn").classList.remove("hidden");
    $("votingWaiting").classList.add("hidden");
    startLocalCountdown("Round 4 · Did They Cook?");
    sfxPhase();
    showScreen("voting");
  }

  function enterPhaseResults(results, winnerIds) {
    G.phase = "results";
    if (G.countdownInterval) clearInterval(G.countdownInterval);
    timerDisplayEl.classList.add("hidden");
    phaseTitleEl.textContent = "Results";

    var winners = results.filter(function (r) { return winnerIds.indexOf(r.ownerId) !== -1; });
    var banner = $("winnerBanner");
    if (winners.length === 0) {
      banner.textContent = "No votes were cast — nobody cooked!";
    } else if (winners.length === 1) {
      banner.textContent = "🏆 " + winners[0].ownerName + " cooked! (" + winners[0].votes + " votes)";
    } else {
      banner.textContent = "🏆 It's a tie: " + winners.map(function (w) { return w.ownerName; }).join(" & ");
    }

    var listEl = $("resultsList");
    listEl.innerHTML = "";
    results.forEach(function (d) {
      var card = document.createElement("div");
      card.className = "dish-card" + (winnerIds.indexOf(d.ownerId) !== -1 ? " selected" : "");
      card.innerHTML =
        '<div class="dish-prompt">' + escapeHtml(d.foodPrompt) + '</div>' +
        '<h4>' + escapeHtml(d.name) + '</h4>' +
        '<div class="dish-ingredients">' + (d.ingredients || []).map(escapeHtml).join(", ") + '</div>' +
        (d.description ? '<div class="dish-desc">"' + escapeHtml(d.description) + '"</div>' : "") +
        '<div class="dish-author">by ' + escapeHtml(d.ownerName) + '</div>' +
        '<div class="vote-count">' + d.votes + (d.votes === 1 ? " vote" : " votes") + '</div>';
      listEl.appendChild(card);
    });

    if (winners.length) sfxWin();

    if (G.role === "host") {
      $("playAgainBtn").classList.remove("hidden");
      $("resultsClientHint").classList.add("hidden");
    } else {
      $("playAgainBtn").classList.add("hidden");
      $("resultsClientHint").classList.remove("hidden");
    }
    showScreen("results");
  }

  /* ============================================================
     LOBBY RENDERING
     ============================================================ */

  function renderLobby() {
    $("roomCodeDisplay").textContent = G.roomCode || "------";
    var list = $("playerList");
    list.innerHTML = "";
    playerArray().forEach(function (p) {
      var li = document.createElement("li");
      li.innerHTML = '<span>' + escapeHtml(p.name) + (p.id === G.myId ? " (you)" : "") + '</span>' +
        (p.isHost ? '<span class="player-badge">HOST</span>' : "");
      list.appendChild(li);
    });
    $("playerCount").textContent = playerArray().length;

    var isHost = G.role === "host";
    $("hostSettings").classList.toggle("hidden", !isHost);
    $("lobbyClientHint").classList.toggle("hidden", isHost);
    if (isHost) {
      $("startGameBtn").disabled = playerArray().length < 2;
      $("timerSetting").value = G.settings.timerSeconds;
      $("timerValueLabel").textContent = G.settings.timerSeconds;
      $("maxPlayersSetting").value = G.settings.maxPlayers;
      $("maxPlayersValueLabel").textContent = G.settings.maxPlayers;
    }
  }

  /* ============================================================
     HOME SCREEN WIRING
     ============================================================ */

  function showHomeError(msg) {
    var el = $("homeError");
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  function clearHomeError() {
    $("homeError").classList.add("hidden");
  }

  $("hostBtn").addEventListener("click", function () {
    clearHomeError();
    hostGame();
  });

  $("joinBtn").addEventListener("click", function () {
    clearHomeError();
    $("joinCodeSection").classList.remove("hidden");
    $("homeButtons").classList.add("hidden");
    $("codeInput").focus();
  });

  $("cancelJoinBtn").addEventListener("click", function () {
    $("joinCodeSection").classList.add("hidden");
    $("homeButtons").classList.remove("hidden");
    clearHomeError();
  });

  $("confirmJoinBtn").addEventListener("click", function () {
    clearHomeError();
    joinGame($("codeInput").value);
  });

  $("codeInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("confirmJoinBtn").click(); }
  });
  $("nameInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); }
  });

  /* ============================================================
     LOBBY WIRING
     ============================================================ */

  $("timerSetting").addEventListener("input", function () {
    $("timerValueLabel").textContent = this.value;
    if (G.role === "host") {
      G.settings.timerSeconds = parseInt(this.value, 10);
      hostBroadcast({ t: "lobby_update", players: playerArray(), settings: G.settings });
    }
  });
  $("maxPlayersSetting").addEventListener("input", function () {
    $("maxPlayersValueLabel").textContent = this.value;
    if (G.role === "host") {
      G.settings.maxPlayers = parseInt(this.value, 10);
      hostBroadcast({ t: "lobby_update", players: playerArray(), settings: G.settings });
    }
  });
  $("startGameBtn").addEventListener("click", function () {
    sfxClick();
    startGameHost();
  });

  /* ============================================================
     PROMPTS FORM
     ============================================================ */

  $("promptsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (G.local.submitted) return;
    var ingredientPrompt = clean($("ingredientPromptInput").value, 80);
    var foodPrompt = clean($("foodPromptInput").value, 60);
    if (!ingredientPrompt || !foodPrompt) return;
    G.local.submitted = true;
    sfxClick();
    clientSend({ t: "submit_prompts", ingredientPrompt: ingredientPrompt, foodPrompt: foodPrompt });
    $("promptsForm").classList.add("hidden");
    $("promptsWaiting").textContent = "Submitted! Waiting for other chefs…";
    $("promptsWaiting").classList.remove("hidden");
  });

  /* ============================================================
     INGREDIENTS FORM
     ============================================================ */

  $("ingredientsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (G.local.submitted) return;
    var inputs = Array.prototype.slice.call(document.querySelectorAll("#ingredientInputs .ingredient-slot"));
    var list = inputs.map(function (i) { return clean(i.value, 30); }).filter(Boolean);
    if (list.length < 6) return;
    G.local.submitted = true;
    sfxClick();
    clientSend({ t: "submit_ingredients", list: list });
    $("ingredientsForm").classList.add("hidden");
    $("ingredientsWaiting").textContent = "Submitted! Waiting for other chefs…";
    $("ingredientsWaiting").classList.remove("hidden");
  });

  /* ============================================================
     COMBINE FORM
     ============================================================ */

  $("combineForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (G.local.submitted) return;
    if (currentSelection.length < 2) { toast("Pick at least 2 ingredients.", true); return; }
    var name = clean($("dishNameInput").value, 40);
    var description = clean($("dishDescInput").value, 200);
    if (!name) return;
    G.local.submitted = true;
    sfxClick();
    clientSend({ t: "submit_dish", chosen: currentSelection.slice(), name: name, description: description });
    $("combineForm").classList.add("hidden");
    $("combineWaiting").textContent = "Submitted! Waiting for other chefs…";
    $("combineWaiting").classList.remove("hidden");
  });

  /* ============================================================
     VOTING
     ============================================================ */

  $("submitVoteBtn").addEventListener("click", function () {
    if (G.local.submitted || !currentVoteChoice) return;
    G.local.submitted = true;
    sfxClick();
    clientSend({ t: "vote", ownerId: currentVoteChoice });
    $("submitVoteBtn").classList.add("hidden");
    $("votingWaiting").textContent = "Vote cast! Waiting for other chefs…";
    $("votingWaiting").classList.remove("hidden");
  });

  /* ============================================================
     RESULTS / PLAY AGAIN
     ============================================================ */

  $("playAgainBtn").addEventListener("click", function () {
    sfxClick();
    G.phase = "lobby";
    renderLobby();
    hostBroadcast({ t: "lobby_update", players: playerArray(), settings: G.settings });
    showScreen("lobby");
  });

  /* ============================================================
     RESIZE HANDLING — no canvas here (DOM/CSS layout), but keep
     the viewport meta honest and recompute on iframe resize.
     ============================================================ */

  function handleResize() {
    document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  }
  window.addEventListener("resize", handleResize);
  handleResize();

  /* ---------------- boot ---------------- */
  showScreen("home");

  // remember last-used name across sessions if storage is available
  var savedName = safeGet("dhc_name");
  if (savedName) $("nameInput").value = savedName;
  $("nameInput").addEventListener("change", function () { safeSet("dhc_name", clean(this.value, 18)); });

})();
