// APP_JS_BUILD 2025-09-01T06:15Z
import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";

import {
  ref, get, set, update, onValue, onDisconnect, remove, child
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* ---------- guard double init (for hot reloads / duplicate includes) ---------- */
if (window._cadh_app_booted) {
  console.warn("[boot] already booted, skipping duplicate init");
} else {
  window._cadh_app_booted = true;

  /* ---------- DOM ---------- */
  const $ = (s)=> document.querySelector(s);
  const joinModal = $("#join-modal");
  const joinBtn   = $("#join-btn");
  const roomInput = $("#room-input");
  const nameInput = $("#name-input");
  const chatInput = $("#chat-input");
  const chatSend  = $("#chat-send");
  const startBtn  = $("#start-round");

  /* ---------- Local State & Store ---------- */
  function defaultName(){
    return localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;
  }

  // Prefill from localStorage or ?room
  const params = new URLSearchParams(location.search);
  const qsRoom = (params.get("room") || "").toUpperCase();

  if (nameInput) nameInput.value = defaultName();
  if (roomInput) roomInput.value = qsRoom || localStorage.getItem("cadh-room") || "";

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
  let my = { uid: null, name: nameInput?.value || defaultName() };
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
    if (!joinModal) return;
    joinModal.style.display = show ? "flex" : "none";
    console.log("[UI] join modal visible:", show);
  }
  function clearLocal(){
    console.log("[localStorage] clearing cadh-* keys");
    localStorage.removeItem("cadh-name");
    localStorage.removeItem("cadh-room");
  }

  /* ---------- Firebase wiring ---------- */
  async function joinRoom(code, desiredName){
    console.log("[joinRoom] Attempting join", { code, desiredName });

    await authReady;
    my.uid = auth.currentUser.uid;
    my.name = (desiredName || "").trim() || defaultName();
    console.log("[joinRoom] Auth ready", { uid: my.uid, name: my.name });

    // 0) Verify room exists (read-only)
    const roomRoot = ref(db, `rooms/${code}`);
    const createdAtSnap = await get(child(roomRoot, "createdAt"));
    if (!createdAtSnap.exists()) {
      console.warn("[joinRoom] Room does NOT exist:", code);
      alert("That room code doesn’t exist. Ask the host to create it on the config page.");
      return;
    }

    // 1) Create/overwrite my player node
    const playerRef = child(roomRoot, `players/${my.uid}`);
    try {
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

    // 2) Presence
    const presenceRef = child(roomRoot, `presence/${my.uid}`);
    try {
      await set(presenceRef, true);
      onDisconnect(presenceRef).set(false);
      onDisconnect(playerRef).update({ connected:false });
      console.log("[joinRoom] Presence set + onDisconnect registered");
    } catch (err) {
      console.error("[joinRoom] ERROR writing presence:", err);
    }

    // 3) Subscriptions
    currentRoom = code;
    localStorage.setItem("cadh-name", my.name);
    localStorage.setItem("cadh-room", code);
    bindRoomSubscriptions(code);

    if (canIHost() && !hostDecks) hostDecks = createHostDecks();

    showModal(false);
  }

  function bindRoomSubscriptions(code){
    unsubs.forEach(fn => fn && fn());
    unsubs = [];
    console.log("[bindRoomSubscriptions] (re)binding listeners for room", code);

    const listen = (path, cb, label = path) => {
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
    // keep room/name so refresh can rejoin if host returns
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
    if (!hostDecks) hostDecks = createHostDecks();

    const nextJudge = computeNextJudgeId(s.players, s.round?.judgeUid || null);
    const black = hostDecks.black.draw();
    console.log("[hostStartRound] nextJudge =", nextJudge, "black =", black);

    try {
      await Promise.all(playerIds.map(pid =>
        update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false })
      ));
    } catch(e) {
      console.error("[hostStartRound] error resetting submitted flags:", e);
    }

    // Deal to 7
    for (const pid of playerIds){
      try {
        const handRef = ref(db, `rooms/${currentRoom}/hands/${pid}`);
        const handSnap = await get(handRef);
        const hand = handSnap.exists() ? handSnap.val() : {};
        const count = Object.keys(hand).length;
        for (let i=count; i<7; i++){
          const card = hostDecks.white.draw();
          if (!card) break;
          await set(ref(db, `rooms/${currentRoom}/hands/${pid}/${card.id}`), card);
        }
      } catch(err) {
        console.error("[hostStartRound] DEAL FAILED for", pid, err);
      }
    }

    // Clear submissions
    try { await remove(ref(db, `rooms/${currentRoom}/submissions`)); } catch(err) { /* ignore */ }

    // Write round
    const deadline = Date.now() + ROUND_SECONDS*1000;
    try {
      await set(ref(db, `rooms/${currentRoom}/round`), {
        number: (s.round?.number || 0) + 1,
        judgeUid: nextJudge,
        black,
        deadline,
        pickedSubmissionId: null
      });
      await set(ref(db, `rooms/${currentRoom}/started`), true);
      console.log("[hostStartRound] wrote round & started=true");
    } catch(err) {
      console.error("[hostStartRound] write round FAILED", err);
    }
  }

  async function hostPickWinner(submissionId){
    console.log("[hostPickWinner] invoked for", submissionId);
    if (!canIHost()) { console.warn("[hostPickWinner] not host; abort"); return; }
    try {
      const subRef = ref(db, `rooms/${currentRoom}/submissions/${submissionId}`);
      const subSnap = await get(subRef);
      if (!subSnap.exists()) return;
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
  async function sendChat(msg){
    if (!currentRoom || !(msg||"").trim()) return;
    const s = store.get();
    if (!s.players || !s.players[my.uid]) return;
    const item = { from: my.uid, name: my.name, text: msg.trim(), ts: Date.now() };
    const path = `rooms/${currentRoom}/chat/${id()}`;
    await set(ref(db, path), item);
  }

  async function playCard(cardId){
    const s = store.get();
    if (!currentRoom || !s.started) return;
    if (s.round?.judgeUid === my.uid) return;
    if (s.players?.[my.uid]?.submitted) return;

    const cardRef = ref(db, `rooms/${currentRoom}/hands/${my.uid}/${cardId}`);
    const snap = await get(cardRef);
    if (!snap.exists()) return;
    const card = snap.val();
    const subId = id();

    await set(ref(db, `rooms/${currentRoom}/submissions/${subId}`), {
      by: my.uid, card, createdAt: Date.now()
    });
    await remove(cardRef);
    await update(ref(db, `rooms/${currentRoom}/players/${my.uid}`), { submitted: true });
  }

  /* ---------- Wire UI ---------- */
  authReady.then(()=>{
    console.log("[authReady] user =", auth.currentUser?.uid);
    my.uid = auth.currentUser?.uid || null;
    ui = new UI(store, {
      meId: my.uid,
      onPlayCard: playCard,
      onJudgePick: (submissionId)=> { if (canIHost()) hostPickWinner(submissionId); },
      onStartRound: hostStartRound
    });

    // Auto-show join modal if no room in storage/URL
    const roomHint = localStorage.getItem("cadh-room") || (new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (roomHint) {
      // Prefill and show modal to confirm join (safer)
      if (roomInput) roomInput.value = roomHint;
      showModal(true);
    } else {
      showModal(true);
    }
  });

  /* ---------- Modal events (guarded to avoid double binding) ---------- */
  if (!window._cadh_bound){
    window._cadh_bound = true;

    joinBtn?.addEventListener("click", ()=>{
      const code = (roomInput?.value || "").trim().toUpperCase();
      const name = (nameInput?.value || "").trim() || defaultName();
      if (!/^\d{4}$/.test(code)) { alert("Room code must be 4 digits."); return; }
      joinRoom(code, name).catch(err=>{
        console.error("[UI] joinRoom FAILED", err);
        alert("Could not join: " + (err?.message || err));
      });
    });

    roomInput?.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });
    nameInput?.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });

    chatSend?.addEventListener("click", async ()=>{
      const msg = chatInput?.value.trim();
      if(!msg) return;
      try { await sendChat(msg); } catch(e){ console.error("[chat] send failed", e); alert("Chat failed: " + (e?.message||e)); }
      chatInput.value = "";
    });
    chatInput?.addEventListener("keydown", e=>{
      if(e.key==="Enter"){ e.preventDefault(); chatSend.click(); }
    });
  }

  /* ---------- Show initial state ---------- */
  console.log("[boot] App loaded; waiting for user to join…");
}
