import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";

import {
  ref, get, set, update, onValue, onDisconnect, remove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* ---------- DOM ---------- */
const $ = (s)=> document.querySelector(s);
const joinBtn   = $("#join-btn");
const newBtn    = $("#new-btn");
const startBtn  = $("#start-btn");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const chatInput = $("#chat-input");
const chatSend  = $("#chat-send");

/* ---------- Local State & Store ---------- */
const defaultName = ()=> localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;
nameInput.value = defaultName();
roomInput.value = localStorage.getItem("cadh-room") || "";

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

/* ---------- Helpers ---------- */
function generateRoomCode(){
  return Math.random().toString(36).replace(/[^a-z0-9]/g,"").slice(2,8).toUpperCase();
}
function canIHost(){
  return store.get().hostUid && store.get().hostUid === my.uid;
}

/* ---------- Firebase wiring ---------- */
async function joinRoom(code, desiredName){
  await authReady;
  my.uid = auth.currentUser.uid;
  my.name = desiredName || defaultName();

  localStorage.setItem("cadh-name", my.name);
  localStorage.setItem("cadh-room", code);

  currentRoom = code;

  // 1) Add/refresh self as a player FIRST (makes us a member)
  const playerRef = ref(db, `rooms/${code}/players/${my.uid}`);
  const existing = await get(playerRef);
  const prevScore = existing.exists() ? (existing.val().score || 0) : 0;
  await update(playerRef, {
    name: my.name,
    joinedAt: Date.now(),
    connected: true,
    score: prevScore,
    submitted: false
  });

  // Presence
  const presenceRef = ref(db, `rooms/${code}/presence/${my.uid}`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);
  onDisconnect(playerRef).update({ connected:false });

  // 2) Try to become host (first writer wins; rules allow if unset or already me)
  const hostUidRef = ref(db, `rooms/${code}/hostUid`);
  await set(hostUidRef, my.uid).catch(()=>{}); // ignore if someone else already set it

  // 3) Set createdAt once (ignore if exists)
  const createdAtRef = ref(db, `rooms/${code}/createdAt`);
  await set(createdAtRef, Date.now()).catch(()=>{});

  // Subscribe to room data
  bindRoomSubscriptions(code);

  // If I'm host, init local decks
  if (canIHost()) {
    hostDecks = createHostDecks();
  }
}

function bindRoomSubscriptions(code){
  onValue(ref(db, `rooms/${code}/hostUid`), (snap)=>{
    store.patch({ hostUid: snap.val() || null });
    if (canIHost() && !hostDecks) hostDecks = createHostDecks();
  });

  onValue(ref(db, `rooms/${code}/started`), (snap)=>{
    store.patch({ started: !!snap.val() });
  });

  onValue(ref(db, `rooms/${code}/players`), (snap)=>{
    store.patch({ players: snap.val() || {} });
  });

  onValue(ref(db, `rooms/${code}/hands`), (snap)=>{
    store.patch({ hands: snap.val() || {} });
  });

  onValue(ref(db, `rooms/${code}/round`), (snap)=>{
    store.patch({ round: snap.val() || { number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null } });
  });

  onValue(ref(db, `rooms/${code}/submissions`), (snap)=>{
    const val = snap.val() || {};
    const arr = Object.entries(val).map(([k,v])=> ({ id:k, ...v }));
    arr.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
    store.patch({ submissions: arr });
  });

  onValue(ref(db, `rooms/${code}/chat`), (snap)=>{
    const val = snap.val() || {};
    const arr = Object.values(val);
    arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
    store.patch({ chat: arr });
  });
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

  // increment score atomically (read-modify-write acceptable for demo)
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
const canStartRef = { value:false };

authReady.then(()=>{
  ui = new UI(store, {
    meId: auth.currentUser.uid,
    onPlayCard: playCard,
    onJudgePick: (submissionId)=> { if (canIHost()) hostPickWinner(submissionId); },
    onStartRound: hostStartRound,
    canStartRef
  });
});

/* ---------- DOM Events ---------- */
chatSend.addEventListener("click", ()=>{
  const msg = chatInput.value.trim();
  if(!msg) return;
  sendChat(msg);
  chatInput.value = "";
});
chatInput.addEventListener("keydown", e=>{
  if(e.key==="Enter") chatSend.click();
});

joinBtn.addEventListener("click", ()=> {
  const code = (roomInput.value || "").trim().toUpperCase();
  const name = (nameInput.value || "").trim() || defaultName();
  if(!code) { roomInput.focus(); return; }
  joinRoom(code, name);
});

newBtn.addEventListener("click", ()=> {
  const code = generateRoomCode();
  roomInput.value = code;
  const name = (nameInput.value || "").trim() || defaultName();
  joinRoom(code, name);
});
