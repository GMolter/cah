import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id, now } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";

import {
  ref, get, set, update, push, onValue, runTransaction, serverTimestamp, onDisconnect, remove
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

  const roomBase = ref(db, `rooms/${code}`);

  // Try to set host if not set yet
  const hostUidRef = ref(db, `rooms/${code}/hostUid`);
  await runTransaction(hostUidRef, (cur)=> cur || my.uid);

  const createdAtRef = ref(db, `rooms/${code}/createdAt`);
  await runTransaction(createdAtRef, (cur)=> cur || Date.now());

  // Add/update self in players
  const playerRef = ref(db, `rooms/${code}/players/${my.uid}`);
  await update(playerRef, {
    name: my.name,
    joinedAt: Date.now(),
    connected: true,
    score: (await get(playerRef)).exists() ? (await get(playerRef)).val().score || 0 : 0,
    submitted: false
  });

  // Presence
  const presenceRef = ref(db, `rooms/${code}/presence/${my.uid}`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);
  onDisconnect(playerRef).update({ connected:false });

  // Subscribe to room data
  bindRoomSubscriptions(code);

  // If I'm host, init decks (local only)
  if (canIHost()){
    hostDecks = createHostDecks();
  }
}

function bindRoomSubscriptions(code){
  // Host
  onValue(ref(db, `rooms/${code}/hostUid`), (snap)=>{
    store.patch({ hostUid: snap.val() || null });
    // If I became host later, create decks
    if (canIHost() && !hostDecks) hostDecks = createHostDecks();
  });

  // Started flag
  onValue(ref(db, `rooms/${code}/started`), (snap)=>{
    store.patch({ started: !!snap.val() });
  });

  // Players
  onValue(ref(db, `rooms/${code}/players`), (snap)=>{
    store.patch({ players: snap.val() || {} });
  });

  // Hands (whole object)
  onValue(ref(db, `rooms/${code}/hands`), (snap)=>{
    store.patch({ hands: snap.val() || {} });
  });

  // Round
  onValue(ref(db, `rooms/${code}/round`), (snap)=>{
    store.patch({ round: snap.val() || { number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null } });
  });

  // Submissions (convert map to array + id)
  onValue(ref(db, `rooms/${code}/submissions`), (snap)=>{
    const val = snap.val() || {};
    const arr = Object.entries(val).map(([k,v])=> ({ id:k, ...v }));
    arr.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
    store.patch({ submissions: arr });
  });

  // Chat stream (array)
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
  for (const pid of playerIds){
    await update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false });
  }
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

  // Mark started (in case it wasn't)
  await set(ref(db, `rooms/${currentRoom}/started`), true);
}

async function hostPickWinner(submissionId){
  if (!canIHost()) return;
  const subSnap = await get(ref(db, `rooms/${currentRoom}/submissions/${submissionId}`));
  if (!subSnap.exists()) return;
  const sub = subSnap.val();
  const winner = sub.by;

  // increment score
  const scoreRef = ref(db, `rooms/${currentRoom}/players/${winner}/score`);
  await runTransaction(scoreRef, (cur)=> (cur || 0) + 1);

  // set picked
  await update(ref(db, `rooms/${currentRoom}/round`), { pickedSubmissionId: submissionId });

  // small pause, then next round
  setTimeout(()=> hostStartRound(), 1500);
}

/* ---------- Player actions ---------- */
async function sendChat(msg){
  if (!currentRoom || !msg.trim()) return;
  const item = {
    from: my.uid, name: my.name, text: msg.trim(), ts: Date.now()
  };
  await set(ref(db, `rooms/${currentRoom}/chat/${id()}`), item);
}

async function playCard(cardId){
  const s = store.get();
  if (!currentRoom || !s.started) return;
  if (s.round?.judgeUid === my.uid) return; // judge cannot play
  if (s.players?.[my.uid]?.submitted) return;

  // Get card from my hand
  const cardRef = ref(db, `rooms/${currentRoom}/hands/${my.uid}/${cardId}`);
  const snap = await get(cardRef);
  if (!snap.exists()) return;
  const card = snap.val();

  // Submit
  const subId = id();
  await set(ref(db, `rooms/${currentRoom}/submissions/${subId}`), {
    by: my.uid,
    card,
    createdAt: Date.now()
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
    onJudgePick: (submissionId)=> {
      if (canIHost()) hostPickWinner(submissionId);
    },
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
