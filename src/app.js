// app.js
const APP_BUILD = "APP_JS_BUILD 2025-09-01T06:05Z";
if (window.__CADH_APP_INITED) {
  console.warn("[guard] app.js already initialized; skipping second load");
} else {
  window.__CADH_APP_INITED = true;

  import("./firebase.js").then(async ({ app, auth, db, authReady })=>{
    const { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } = await import("./game.js");
    const { createStore } = await import("./tiny-store.js");
    const { UI } = await import("./ui.js");

    const {
      ref, get, set, update, onValue, onDisconnect, remove
    } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js");

    /* ---------- DOM ---------- */
    const $ = (s)=> document.querySelector(s);
    const joinModal = $("#join-modal");
    const joinBtn   = $("#join-btn");
    const genBtn    = $("#gen-btn");
    const roomInput = $("#room-input");
    const nameInput = $("#name-input");
    const chatInput = $("#chat-input");
    const chatSend  = $("#chat-send");
    const startBtn  = $("#start-btn");

    console.log(APP_BUILD);

    /* ---------- State ---------- */
    const defaultName = ()=> localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;
    const params = new URLSearchParams(location.search);
    const qsRoom = (params.get("room") || "").toUpperCase();

    nameInput.value = defaultName();
    roomInput.value = qsRoom || localStorage.getItem("cadh-room") || "";

    const store = createStore({
      hostUid: null,
      started: false,
      players: {},
      hands: {},
      round: { number: 0, judgeUid: null, black: null, deadline: 0, pickedSubmissionId: null },
      submissions: [],
      chat: []
    });

    let ui;
    let my = { uid: null, name: nameInput.value };
    let currentRoom = null;
    let hostDecks = null;
    let unsubs = [];

    /* ---------- Helpers ---------- */
    function canIHost(){
      const s = store.get();
      const host = !!(s.hostUid && s.hostUid === my.uid);
      console.log("[canIHost]", { me: my.uid, hostUid: s.hostUid, host });
      return host;
    }
    function showModal(show){
      joinModal.style.display = show ? "flex" : "none";
      console.log("[UI] join modal visible:", show);
    }
    function clearLocal(){
      console.log("[localStorage] clearing cadh-* keys");
      localStorage.removeItem("cadh-name");
      localStorage.removeItem("cadh-room");
      localStorage.removeItem("cadh-host");
      localStorage.removeItem("cadh-autojoin");
    }
    const isHostLocal = ()=> localStorage.getItem("cadh-host") === "true";

    function fourDigit(){
      return String(Math.floor(1000 + Math.random()*9000));
    }

    /* ---------- Firebase wiring ---------- */
    async function joinRoom(code, desiredName){
      console.log("[joinRoom] Attempting join", { code, desiredName });

      await authReady;
      my.uid = auth.currentUser.uid;
      my.name = desiredName || defaultName();
      console.log("[joinRoom] Auth ready", { uid: my.uid, name: my.name });

      localStorage.setItem("cadh-name", my.name);
      localStorage.setItem("cadh-room", code);
      localStorage.setItem("cadh-autojoin", "true");
      currentRoom = code;

      // Ensure host presence if host flag set (try to claim hostUid)
      if (isHostLocal()){
        try {
          await set(ref(db, `rooms/${code}/hostUid`), my.uid);
          console.log("[joinRoom] hostUid claimed (from host flag)");
        } catch(e){
          console.warn("[joinRoom] hostUid claim failed (may already be set)", e);
        }
      }

      // Create/over-write my player node
      const playerRef = ref(db, `rooms/${code}/players/${my.uid}`);
      try {
        console.log("[joinRoom] Creating my player via set()", playerRef.toString());
        await set(playerRef, {
          name: my.name,
          joinedAt: Date.now(),
          connected: true,
          score: 0,
          submitted: false
        });
        console.log("[joinRoom] Player set OK");
      } catch (err) {
        console.error("[joinRoom] ERROR setting players node:", err);
        alert("Could not join: " + (err?.message || err));
        return;
      }

      // Presence
      const presenceRef = ref(db, `rooms/${code}/presence/${my.uid}`);
      try {
        console.log("[joinRoom] Setting presence true", presenceRef.toString());
        await set(presenceRef, true);
        onDisconnect(presenceRef).set(false);
        onDisconnect(playerRef).update({ connected:false });
        console.log("[joinRoom] Presence set + onDisconnect registered");
      } catch (err) {
        console.error("[joinRoom] ERROR writing presence:", err);
      }

      // Subscriptions
      console.log("[joinRoom] Binding subscriptions for room", code);
      bindRoomSubscriptions(code);

      if (canIHost()) {
        console.log("[joinRoom] I am HOST; initializing decks");
        hostDecks = createHostDecks();
      } else {
        console.log("[joinRoom] I am NOT host");
      }

      showModal(false);
    }

    function bindRoomSubscriptions(code){
      // clear old unsubs
      unsubs.forEach(fn => fn && fn());
      unsubs = [];
      console.log("[bindRoomSubscriptions] (re)binding listeners for room", code);

      const listen = (path, cb) => {
        const r = ref(db, path);
        console.log("[listen] onValue ->", r.toString());
        const off = onValue(r, cb, (err)=> console.error("[listen] onValue ERROR", r.toString(), err));
        unsubs.push(off);
      };

      listen(`rooms/${code}/hostUid`, (snap)=>{
        const hostUid = snap.val() || null;
        console.log("[sub] hostUid =", hostUid);
        store.patch({ hostUid });
        attachHostPresenceWatcher(code, hostUid);
        if (canIHost() && !hostDecks) {
          console.log("[sub] became host; initializing decks");
          hostDecks = createHostDecks();
        }
      });

      listen(`rooms/${code}/started`, (snap)=>{
        const started = !!snap.val();
        console.log("[sub] started =", started);
        store.patch({ started });
      });

      listen(`rooms/${code}/players`, (snap)=>{
        const players = snap.val() || {};
        console.log("[sub] players =", players);
        store.patch({ players });
      });

      listen(`rooms/${code}/hands`, (snap)=>{
        const hands = snap.val() || {};
        console.log("[sub] hands keys =", Object.keys(hands));
        store.patch({ hands });
      });

      listen(`rooms/${code}/round`, (snap)=>{
        const round = snap.val() || { number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null };
        console.log("[sub] round =", round);
        store.patch({ round });
      });

      listen(`rooms/${code}/submissions`, (snap)=>{
        const val = snap.val() || {};
        const arr = Object.entries(val).map(([k,v])=> ({ id:k, ...v }));
        arr.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
        console.log("[sub] submissions len =", arr.length);
        store.patch({ submissions: arr });
      });

      listen(`rooms/${code}/chat`, (snap)=>{
        const val = snap.val() || {};
        const arr = Object.values(val);
        arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
        console.log("[sub] chat len =", arr.length);
        store.patch({ chat: arr });
      });
    }

    function attachHostPresenceWatcher(code, hostUid){
      if (!hostUid) {
        console.log("[attachHostPresenceWatcher] no hostUid yet");
        return;
      }
      console.log("[attachHostPresenceWatcher] hostUid =", hostUid);

      const hostPresenceRef = ref(db, `rooms/${code}/presence/${hostUid}`);
      const hostPlayerRef   = ref(db, `rooms/${code}/players/${hostUid}`);

      const off1 = onValue(hostPresenceRef, (snap)=>{
        const present = !!snap.val();
        console.log("[hostPresence] present =", present);
        if (!present) endGame("Host left — game ended.");
      }, (err)=> console.error("[hostPresence] ERROR", err));
      const off2 = onValue(hostPlayerRef, (snap)=>{
        const connected = snap.exists() ? !!snap.val().connected : false;
        console.log("[hostPlayer] connected =", connected);
        if (!connected) endGame("Host left — game ended.");
      }, (err)=> console.error("[hostPlayer] ERROR", err));

      unsubs.push(off1, off2);
    }

    function endGame(message){
      console.warn("[endGame]", message);
      unsubs.forEach(fn=> fn && fn());
      unsubs = [];
      clearLocal();
      store.replace({
        hostUid: null, started:false, players:{}, hands:{},
        round:{ number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null },
        submissions:[], chat:[]
      });
      showModal(true);
    }

    /* ---------- Host actions ---------- */
    async function hostStartRound(){
      console.log("[hostStartRound] invoked");
      if (!canIHost()) { console.warn("[hostStartRound] not host; abort"); return; }
      const s = store.get();
      const playerIds = Object.keys(s.players||{});
      console.log("[hostStartRound] playerIds =", playerIds);
      if (playerIds.length < 3){
        alert("Need at least 3 players to start.");
        console.warn("[hostStartRound] <3 players; abort");
        return;
      }
      if (!hostDecks) {
        console.log("[hostStartRound] creating decks");
        hostDecks = createHostDecks();
      }

      const nextJudge = computeNextJudgeId(s.players, s.round?.judgeUid || null);
      const black = hostDecks.black.draw();
      console.log("[hostStartRound] nextJudge =", nextJudge, "black =", black);

      try {
        // Reset submitted flags
        await Promise.all(playerIds.map(pid =>
          update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false })
        ));
        // Top-up each hand to 7
        for (const pid of playerIds){
          const handRef = ref(db, `rooms/${currentRoom}/hands/${pid}`);
          const handSnap = await get(handRef);
          const hand = handSnap.exists() ? handSnap.val() : {};
          const count = Object.keys(hand).length;
          for (let i=count; i<7; i++){
            const card = hostDecks.white.draw();
            if (!card) break;
            await set(ref(db, `rooms/${currentRoom}/hands/${pid}/${card.id}`), card);
          }
        }
        // Clear submissions
        await remove(ref(db, `rooms/${currentRoom}/submissions`));
        // Write round
        const deadline = Date.now() + ROUND_SECONDS*1000;
        await set(ref(db, `rooms/${currentRoom}/round`), {
          number: (s.round?.number || 0) + 1,
          judgeUid: nextJudge,
          black,
          deadline,
          pickedSubmissionId: null
        });
        // Mark started
        await set(ref(db, `rooms/${currentRoom}/started`), true);
        console.log("[hostStartRound] round started");
      } catch(err) {
        console.error("[hostStartRound] FAILED", err);
      }
    }

    async function hostPickWinner(submissionId){
      console.log("[hostPickWinner] invoked for", submissionId);
      if (!canIHost()) { console.warn("[hostPickWinner] not host; abort"); return; }
      try {
        const subRef = ref(db, `rooms/${currentRoom}/submissions/${submissionId}`);
        const subSnap = await get(subRef);
        if (!subSnap.exists()) { console.warn("[hostPickWinner] submission missing"); return; }
        const sub = subSnap.val();
        const winner = sub.by;

        const playerRef = ref(db, `rooms/${currentRoom}/players/${winner}`);
        const pSnap = await get(playerRef);
        if (pSnap.exists()){
          const cur = pSnap.val().score || 0;
          await update(playerRef, { score: cur + 1 });
        }
        await update(ref(db, `rooms/${currentRoom}/round`), { pickedSubmissionId: submissionId });
        setTimeout(()=> hostStartRound(), 1200);
      } catch(err) {
        console.error("[hostPickWinner] FAILED", err);
      }
    }

    /* ---------- Player actions ---------- */
    let sendingChat = false;
    async function sendChat(msg){
      if (sendingChat) { return; } // debounce
      sendingChat = true;
      try{
        console.log("[sendChat] sending", msg);
        if (!currentRoom || !msg.trim()) { console.warn("[sendChat] no room or empty msg"); return; }
        const s = store.get();
        if (!s.players || !s.players[my.uid]) { console.warn("[sendChat] not a member yet; abort"); return; }
        const item = { from: my.uid, name: my.name, text: msg.trim(), ts: Date.now() };
        const path = `rooms/${currentRoom}/chat/${id()}`;
        console.log("[sendChat] set ->", path);
        await set(ref(db, path), item);
        console.log("[sendChat] OK");
      } catch(err){
        console.error("[sendChat] FAILED", err);
        alert("Chat failed: " + (err?.message || err));
      } finally{
        sendingChat = false;
      }
    }

    async function playCard(cardId){
      console.log("[playCard] cardId", cardId);
      const s = store.get();
      if (!currentRoom || !s.started) { console.warn("[playCard] no room or not started"); return; }
      if (s.round?.judgeUid === my.uid) { console.warn("[playCard] I am judge; cannot play"); return; }
      if (s.players?.[my.uid]?.submitted) { console.warn("[playCard] already submitted this round"); return; }

      const cardRef = ref(db, `rooms/${currentRoom}/hands/${my.uid}/${cardId}`);
      try {
        const snap = await get(cardRef);
        if (!snap.exists()) { console.warn("[playCard] card not in my hand"); return; }
        const card = snap.val();
        const subId = id();

        console.log("[playCard] submitting", subId, card);
        await set(ref(db, `rooms/${currentRoom}/submissions/${subId}`), {
          by: my.uid, card, createdAt: Date.now()
        });
        await remove(cardRef);
        await update(ref(db, `rooms/${currentRoom}/players/${my.uid}`), { submitted: true });
      } catch(err) {
        console.error("[playCard] FAILED", err);
      }
    }

    /* ---------- UI Wiring ---------- */
    await authReady;
    console.log("[authReady] user =", auth.currentUser?.uid);
    my.uid = auth.currentUser?.uid || null;

    ui = new UI(store, {
      meId: my.uid,
      onPlayCard: playCard,
      onJudgePick: (submissionId)=> { if (canIHost()) hostPickWinner(submissionId); },
      onStartRound: hostStartRound
    });

    // Join modal buttons
    joinBtn.addEventListener("click", ()=>{
      const code = (roomInput.value || "").trim().toUpperCase();
      const name = (nameInput.value || "").trim() || defaultName();
      console.log("[UI] Join clicked", { code, name });
      if(!code){ roomInput.focus(); return; }
      joinRoom(code, name);
    });

    // Generate code (host)
    genBtn.addEventListener("click", async ()=>{
      const code = fourDigit();
      roomInput.value = code;
      localStorage.setItem("cadh-host", "true"); // mark me global host
      localStorage.setItem("cadh-room", code);
      console.log("[gen] generated room code", code);

      // Pre-create room metadata (createdAt + hostUid)
      await authReady;
      my.uid = auth.currentUser.uid;
      try{
        await set(ref(db, `rooms/${code}/createdAt`), Date.now());
      }catch(e){
        console.warn("[gen] createdAt write (may already exist)", e);
      }
      try{
        await set(ref(db, `rooms/${code}/hostUid`), my.uid);
      }catch(e){
        console.warn("[gen] hostUid write (may already exist)", e);
      }
    });

    // Enter keys: ensure no double-trigger
    roomInput.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); joinBtn.click(); } });
    nameInput.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); joinBtn.click(); } });

    // Chat
    chatSend.addEventListener("click", ()=>{
      const msg = chatInput.value.trim();
      if(!msg) return;
      chatInput.value = "";
      sendChat(msg);
    });
    chatInput.addEventListener("keydown", e=>{
      if(e.key==="Enter"){ e.preventDefault(); chatSend.click(); }
    });

    // Auto-resume session on load
    (async function autoResume(){
      const savedRoom = localStorage.getItem("cadh-room");
      const savedName = localStorage.getItem("cadh-name");
      const auto = localStorage.getItem("cadh-autojoin")==="true";
      if (savedRoom && savedName && auto){
        console.log("[resume] attempting auto-join", savedRoom);
        try{
          await joinRoom(savedRoom, savedName);
        }catch(e){
          console.warn("[resume] failed", e);
        }
      } else {
        showModal(true);
      }
    })();

    console.log("[boot] App loaded; waiting for user to join…");
  });
}
