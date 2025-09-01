import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";

import {
  ref, get, set, update, onValue, onDisconnect, remove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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
  return store.get().hostUid && store.get().hostUid === my.uid;
}
function showModal(show){
  joinModal.style.display = show ? "flex" : "none";
}
function clearLocal(){
  localStorage.removeItem("cadh-name");
  localStorage.removeItem("cadh-room");
}

/* ---------- Firebase wiring ---------- */
async function joinRoom(code, desiredName){
  await authReady;
  my.uid = auth.currentUser.uid;
  my.name = desiredName || defaultName();

  localStorage.setItem("cadh-name", my.name);
  localStorage.setItem("cadh-room", code);

  currentRoom = code;

  // 1) Add/refresh self as a player FIRST.
  const playerRef = ref(db, `rooms/${code}/players/${my.uid}`);
  const existing = await get(playerRef);

  if (!existing.exists()){
    // Create with full shape ONCE to satisfy validation; then later we'll do partial updates.
    await set(playerRef, {
      name: my.name,
      joinedAt: Date.now(),
      connected: true,
      score: 0,
      submitted: false
    });
  } else {
    const prev = existing.val();
    await update(playerRef, {
      name: my.name,
      joinedAt: prev.joinedAt || Date.now(),
      connected: true,
      // keep existing score
      submitted: false
    });
  }

  // Presence (self-managed)
  const presenceRef = ref(db, `rooms/${code}/presence/${my.uid}`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);
  onDisconnect(playerRef).update({ connected:false });

  // 2) Try to become host (first writer wins; rule allows if unset or already me)
  const hostUidRef = ref(db, `rooms/${code}/hostUid`);
  await set(hostUidRef, my.uid).catch(()=>{}); // ignore if someone else already set

  // 3) Set createdAt once (ignore if exists)
  const createdAtRef = ref(db, `rooms/${code}/createdAt`);
  await set(createdAtRef, Date.now()).catch(()=>{});

  // Subscribe to room data (and remember unsubs)
  bindRoomSubscriptions(code);

  // If I'm host, init local decks
  if (canIHost()) {
    hostDecks = createHostDecks();
  }

  // Hide modal once joined
  showModal(false);
}

function bindRoomSubscriptions(code){
  // clear old unsubs
  unsubs.forEach(fn => fn && fn());
  unsubs = [];

  const listen = (path, cb) => {
    const r = ref(db, path);
    const off = onValue(r, cb);
    unsubs.push(off);
  };

  listen(`rooms/${code}/hostUid`, (snap)=>{
    const hostUid = snap.val() || null;
    store.patch({ hostUid });
    attachHostPresenceWatcher(code, hostUid);
    if (canIHost() && !hostDecks) hostDecks = createHostDecks();
  });

  listen(`rooms/${code}/started`, (snap)=>{
    store.patch({ started: !!snap.val() });
  });

  listen(`rooms/${code}/players`, (snap)=>{
    store.patch({ players: snap.val() || {} });
  });

  listen(`rooms/${code}/hands`, (snap)=>{
    store.patch({ hands: snap.val() || {} });
  });

  listen(`rooms/${code}/round`, (snap)=>{
    store.patch({ round: snap.val() || { number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null } });
  });

  listen(`rooms/${code}/submissions`, (snap)=>{
    const val = snap.val() || {};
    const arr = Object.entries(val).map(([k,v])=> ({ id:k, ...v }));
    arr.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
    store.patch({ submissions: arr });
  });

  listen(`rooms/${code}/chat`, (snap)=>{
    const val = snap.val() || {};
    const arr = Object.values(val);
    arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
    store.patch({ chat: arr });
  });
}

function attachHostPresenceWatcher(code, hostUid){
  if (!hostUid) return;

  const hostPresenceRef = ref(db, `rooms/${code}/presence/${hostUid}`);
  const hostPlayerRef   = ref(db, `rooms/${code}/players/${hostUid}`);

  const off1 = onValue(hostPresenceRef, (snap)=>{
    const present = !!snap.val();
    if (!present) endGame("Host left — game ended.");
  });
  const off2 = onValue(hostPlayerRef, (snap)=>{
    const connected = snap.exists() ? !!snap.val().connected : false;
    if (!connected) endGame("Host left — game ended.");
  });

  unsubs.push(off1, off2);
}

/* ---------- End game (host left) ---------- */
function endGame(message){
  alert(message || "Game ended.");
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
  if (!canIHost()) return;
  const s = store.get();
  const playerIds = Object.keys(s.players||{});
  if (playerIds.length < 3){
    alert("Need at least 3 players to start.");
    return;
  }
  if (!hostDecks) hostDecks = createHostDecks();

  const nextJudge = computeNextJudgeId(s.players, s.round?.judgeUid || null);
  const black = hostDecks.black.draw();

  // Reset submitted flags
  await Promise.all(playerIds.map(pid =>
    update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false })
  ));

  // Deal (top up to 7)
  for (const pid of playerIds){
    const handSnap = await get(ref(db, `rooms/${currentRoom}/hands/${pid}`));
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
}

async function hostPickWinner(submissionId){
  if (!canIHost()) return;
  const subSnap = await get(ref(db, `rooms/${currentRoom}/submissions/${submissionId}`));
  if (!subSnap.exists()) return;
  const sub = subSnap.val();
  const winner = sub.by;

  // increment score
  const playerRef = ref(db, `rooms/${currentRoom}/players/${winner}`);
  const pSnap = await get(playerRef);
  if (pSnap.exists()){
    const cur = pSnap.val().score || 0;
    await update(playerRef, { score: cur + 1 });
  }

  // set picked
  await update(ref(db, `rooms/${currentRoom}/round`), { pickedSubmissionId: submissionId });

  // small pause, then next round
  setTimeout(()=> hostStartRound(), 1500);
}

/* ---------- Player actions ---------- */
async function sendChat(msg){
  if (!currentRoom || !msg.trim()) return;
  const s = store.get();
  if (!s.players || !s.players[my.uid]) return; // must be member
  const item = { from: my.uid, name: my.name, text: msg.trim(), ts: Date.now() };
  await set(ref(db, `rooms/${currentRoom}/chat/${id()}`), item);
}

async function playCard(cardId){
  const s = store.get();
  if (!currentRoom || !s.started) return;
  if (s.round?.judgeUid === my.uid) return; // judge cannot play
  if (s.players?.[my.uid]?.submitted) return;

  const cardRef = ref(db, `rooms/${currentRoom}/hands/${my.uid}/${cardId}`);
  const snap = await get(cardRef);
  if (!snap.exists()) return;
  const card = snap.val();

  // Submit
  const subId = id();
  await set(ref(db, `rooms/${currentRoom}/submissions/${subId}`), {
    by: my.uid, card, createdAt: Date.now()
  });

  // Remove from hand & flag submitted
  await remove(cardRef);
  await update(ref(db, `rooms/${currentRoom}/players/${my.uid}`), { submitted: true });
}

/* ---------- Wire UI ---------- */
authReady.then(()=>{
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
  if(!code){ roomInput.focus(); return; }
  joinRoom(code, name).catch(err=>{
    alert("Could not join: " + (err?.message || err));
  });
});

roomInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });
nameInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn.click(); });

/* ---------- Chat events ---------- */
chatSend.addEventListener("click", ()=>{
  const msg = chatInput.value.trim();
  if(!msg) return;
  sendChat(msg).catch(err=> alert("Chat failed: " + (err?.message || err)));
  chatInput.value = "";
});
chatInput.addEventListener("keydown", e=>{
  if(e.key==="Enter") chatSend.click();
});

/* ---------- Show modal on load ---------- */
showModal(true);
