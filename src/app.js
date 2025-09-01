// /src/app.js  — robust join flow + presence watcher with grace
import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";
import {
  ref, get, set, update, onValue, onDisconnect, remove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

console.log("APP_JS_BUILD","2025-09-01T06:05Z");

/* ---------- DOM ---------- */
const $ = (s)=> document.querySelector(s);
const joinModal = $("#join-modal");
const joinBtn   = $("#join-btn");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const chatInput = $("#chat-input");
const chatSend  = $("#chat-send");

/* ---------- Local State & Store ---------- */
const defaultName = ()=> localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;

// Prefill from localStorage or ?room
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

// For host only
let hostDecks = null;

// Unsubscribers for listeners so we can detach on game end
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
  currentRoom = code;

  // 1) Create/overwrite my player node (no reads)
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

  // 2) Presence
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

  // 3) Try to become host (first writer wins)
  const hostUidRef = ref(db, `rooms/${code}/hostUid`);
  try {
    console.log("[joinRoom] Attempting to set hostUid:", hostUidRef.toString(), "->", my.uid);
    await set(hostUidRef, my.uid);
    console.log("[joinRoom] Claimed hostUid successfully");
  } catch (err) {
    console.warn("[joinRoom] Could not set hostUid (likely taken):", err);
  }

  // 4) createdAt set-once (config page may have set this already)
  const createdAtRef = ref(db, `rooms/${code}/createdAt`);
  try {
    console.log("[joinRoom] Attempting to set createdAt:", createdAtRef.toString());
    await set(createdAtRef, Date.now());
    console.log("[joinRoom] createdAt set");
  } catch (err) {
    console.warn("[joinRoom] createdAt already exists / write blocked:", err);
  }

  // 5) Subscribe to room data
  console.log("[joinRoom] Binding subscriptions for room", code);
  bindRoomSubscriptions(code);

  // If I'm host, init local decks
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

let hostGraceTimer = null;
function attachHostPresenceWatcher(code, hostUid){
  if (!hostUid) {
    console.log("[attachHostPresenceWatcher] no hostUid yet");
    return;
  }
  if (hostUid === my.uid) {
    console.log("[attachHostPresenceWatcher] I am host; no need to watch my own presence");
    return;
  }
  console.log("[attachHostPresenceWatcher] hostUid =", hostUid);

  const hostPresenceRef = ref(db, `rooms/${code}/presence/${hostUid}`);
  const hostPlayerRef   = ref(db, `rooms/${code}/players/${hostUid}`);

  const clearGrace = ()=> { if (hostGraceTimer){ clearTimeout(hostGraceTimer); hostGraceTimer = null; } };

  const maybeEnd = (reason) => {
    const started = store.get().started;
    if (!started) {
      console.log("[hostPresence] host absent but game not started; waiting.");
      return;
    }
    console.warn("[hostPresence] ending game:", reason);
    endGame("Host left — game ended.");
  };

  const off1 = onValue(hostPresenceRef, (snap)=>{
    const present = !!snap.val();
    console.log("[hostPresence] present =", present);
    if (present) {
      clearGrace();
      return;
    }
    // If not present, start/refresh a short grace timer before ending (only if started)
    clearGrace();
    hostGraceTimer = setTimeout(()=> maybeEnd("presence=false after grace"), 5000);
  }, (err)=> console.error("[hostPresence] ERROR", err));

  const off2 = onValue(hostPlayerRef, (snap)=>{
    const connected = snap.exists() ? !!snap.val().connected : false;
    console.log("[hostPlayer] connected =", connected);
    if (connected) {
      clearGrace();
      return;
    }
    clearGrace();
    hostGraceTimer = setTimeout(()=> maybeEnd("player.connected=false after grace"), 5000);
  }, (err)=> console.error("[hostPlayer] ERROR", err));

  unsubs.push(off1, off2);
}

/* ---------- End game (host left) ---------- */
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

  // Reset submitted flags
  try {
    await Promise.all(playerIds.map(pid =>
      update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false })
        .then(()=> console.log("[hostStartRound] reset submitted for", pid))
        .catch(err=> console.error("[hostStartRound] reset submitted FAILED for", pid, err))
    ));
  } catch(e) {
    console.error("[hostStartRound] error resetting submitted flags:", e);
  }

  // Deal (top up to 7)
  for (const pid of playerIds){
    try {
      const handRef = ref(db, `rooms/${currentRoom}/hands/${pid}`);
      const handSnap = await get(handRef);
      const hand = handSnap.exists() ? handSnap.val() : {};
      const count = Object.keys(hand).length;
      console.log("[hostStartRound] dealing to", pid, "current:", count);
      for (let i=count; i<7; i++){
        const card = hostDecks.white.draw();
        if (!card) { console.warn("[hostStartRound] out of white cards"); break; }
        await set(ref(db, `rooms/${currentRoom}/hands/${pid}/${card.id}`), card);
        console.log("[hostStartRound] dealt", card.id, "to", pid);
      }
    } catch(err) {
      console.error("[hostStartRound] DEAL FAILED for", pid, err);
    }
  }

  // Clear submissions
  try {
    await remove(ref(db, `rooms/${currentRoom}/submissions`));
    console.log("[hostStartRound] cleared submissions");
  } catch(err) {
    console.error("[hostStartRound] clear submissions FAILED", err);
  }

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
    console.log("[hostStartRound] wrote round", { number: (s.round?.number || 0) + 1, judgeUid: nextJudge, deadline });
  } catch(err) {
    console.error("[hostStartRound] write round FAILED", err);
  }

  // Mark started
  try {
    await set(ref(db, `rooms/${currentRoom}/started`), true);
    console.log("[hostStartRound] set started = true");
  } catch(err) {
    console.error("[hostStartRound] set started FAILED", err);
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
    console.log("[hostPickWinner] winner =", winner, sub);

    const playerRef = ref(db, `rooms/${currentRoom}/players/${winner}`);
    const pSnap = await get(playerRef);
    if (pSnap.exists()){
      const cur = pSnap.val().score || 0;
      await update(playerRef, { score: cur + 1 });
      console.log("[hostPickWinner] incremented score to", cur + 1);
    } else {
      console.warn("[hostPickWinner] winner player node missing");
    }

    await update(ref(db, `rooms/${currentRoom}/round`), { pickedSubmissionId: submissionId });
    console.log("[hostPickWinner] set pickedSubmissionId =", submissionId);

    setTimeout(()=> hostStartRound(), 1500);
  } catch(err) {
    console.error("[hostPickWinner] FAILED", err);
  }
}

/* ---------- Player actions ---------- */
async function sendChat(msg){
  console.log("[sendChat] sending", msg);
  if (!currentRoom || !msg.trim()) { console.warn("[sendChat] no room or empty msg"); return; }
  const s = store.get();
  if (!s.players || !s.players[my.uid]) { console.warn("[sendChat] not a member yet; abort"); return; }
  const item = { from: my.uid, name: my.name, text: msg.trim(), ts: Date.now() };
  try {
    const path = `rooms/${currentRoom}/chat/${id()}`;
    console.log("[sendChat] set ->", path);
    await set(ref(db, path), item);
    console.log("[sendChat] OK");
  } catch(err) {
    console.error("[sendChat] FAILED", err);
    throw err;
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
    console.log("[playCard] submission OK");

    await remove(cardRef);
    console.log("[playCard] removed card from hand");

    await update(ref(db, `rooms/${currentRoom}/players/${my.uid}`), { submitted: true });
    console.log("[playCard] flagged submitted = true");
  } catch(err) {
    console.error("[playCard] FAILED", err);
  }
}

/* ---------- Wire UI ---------- */
authReady.then(()=>{
  console.log("[authReady] user =", auth.currentUser?.uid);
  ui = new UI(store, {
    meId: auth.currentUser.uid,
    onPlayCard: playCard,
    onJudgePick: (submissionId)=> { if (canIHost()) hostPickWinner(submissionId); },
    onStartRound: hostStartRound
  });
});

/* ---------- Modal events ---------- */
joinBtn.addEventListener("click", ()=>{
  const code = (roomInput.value || "").trim().toUpperCase();
  const name = (nameInput.value || "").trim() || defaultName();
  console.log("[UI] Join clicked", { code, name });
  if(!code){ roomInput.focus(); console.warn("[UI] empty code"); return; }
  joinRoom(code, name).catch(err=>{
    console.error("[UI] joinRoom FAILED", err);
    alert("Could not join: " + (err?.message || err));
  });
});

roomInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });
nameInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });

/* ---------- Chat events ---------- */
chatSend.addEventListener("click", ()=>{
  const msg = chatInput.value.trim();
  console.log("[UI] Chat send clicked", msg);
  if(!msg) return;
  sendChat(msg).catch(err=> {
    console.error("[UI] Chat failed", err);
    alert("Chat failed: " + (err?.message || err));
  });
  chatInput.value = "";
});
chatInput.addEventListener("keydown", e=>{ if(e.key==="Enter") chatSend.click(); });

/* ---------- Show modal on load ---------- */
showModal(true);
console.log("[boot] App loaded; waiting for user to join…");
