// APP_JS_BUILD 2025-09-01T06:05Z
console.log("APP_JS_BUILD 2025-09-01T06:05Z");

import { app, auth, db, authReady } from "./firebase.js";
import { createHostDecks, computeNextJudgeId, ROUND_SECONDS, id } from "./game.js";
import { createStore } from "./tiny-store.js";
import { UI } from "./ui.js";

import {
  ref, get, set, update, onValue, onDisconnect, remove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* ---------- DOM helpers ---------- */
const $ = (s)=> document.querySelector(s);
const joinModal = $("#join-modal");
const joinBtn   = $("#join-btn");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const chatInput = $("#chat-input");
const chatSend  = $("#chat-send");

/* ---------- State ---------- */
const params = new URLSearchParams(location.search);
const qsRoom = (params.get("room") || "").toUpperCase();

const defaultName = ()=> localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;
if (nameInput) nameInput.value = defaultName();
if (roomInput) roomInput.value = qsRoom || localStorage.getItem("cadh-room") || "";

const store = createStore({
  hostUid: null, started:false, players:{}, hands:{},
  round:{ number:0, judgeUid:null, black:null, deadline:0, pickedSubmissionId:null },
  submissions:[], chat:[]
});
let ui;
let my = { uid:null, name: defaultName() };
let currentRoom = null;
let hostDecks = null;
let unsubs = [];

function showModal(show){ if(joinModal){ joinModal.style.display = show ? "grid" : "none"; } }
function clearLocal(){ localStorage.removeItem("cadh-name"); localStorage.removeItem("cadh-room"); }

/* ---------- Can I host? ---------- */
function canIHost(){
  const s = store.get();
  return !!(s.hostUid && s.hostUid === my.uid);
}

/* ---------- Join ---------- */
async function joinRoom(code, desiredName){
  await authReady;
  my.uid = auth.currentUser.uid;
  my.name = desiredName || defaultName();

  localStorage.setItem("cadh-name", my.name);
  localStorage.setItem("cadh-room", code);
  currentRoom = code;

  // Create/overwrite my player node
  const playerRef = ref(db, `rooms/${code}/players/${my.uid}`);
  await set(playerRef, { name: my.name, joinedAt: Date.now(), connected:true, score:0, submitted:false });

  // presence
  const presenceRef = ref(db, `rooms/${code}/presence/${my.uid}`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);
  onDisconnect(playerRef).update({ connected:false });

  // claim host if empty (allowed by rules for first writer)
  const hostRef = ref(db, `rooms/${code}/hostUid`);
  try{ await set(hostRef, my.uid); }catch(_e){ /* already taken */ }

  // set createdAt once
  try{ await set(ref(db, `rooms/${code}/createdAt`), Date.now()); }catch(_e){}

  bindRoomSubscriptions(code);

  if (canIHost()) hostDecks = createHostDecks();
  showModal(false);
}

/* ---------- Firebase listeners ---------- */
function bindRoomSubscriptions(code){
  unsubs.forEach(fn=>fn&&fn()); unsubs = [];
  const listen = (path, cb)=> {
    const r = ref(db, path);
    const off = onValue(r, cb, ()=>{}); // errors logged by SDK
    unsubs.push(off);
  };

  listen(`rooms/${code}/hostUid`, (snap)=>{
    store.patch({ hostUid: snap.val() || null });
    if (canIHost() && !hostDecks) hostDecks = createHostDecks();
  });
  listen(`rooms/${code}/started`, (snap)=> store.patch({ started: !!snap.val() }));
  listen(`rooms/${code}/players`, (snap)=> store.patch({ players: snap.val()||{} }));
  listen(`rooms/${code}/hands`, (snap)=> store.patch({ hands: snap.val()||{} }));
  listen(`rooms/${code}/round`, (snap)=> store.patch({ round: snap.val() || {number:0,judgeUid:null,black:null,deadline:0,pickedSubmissionId:null} }));
  listen(`rooms/${code}/submissions`, (snap)=>{
    const val = snap.val()||{};
    const arr = Object.entries(val).map(([k,v])=>({id:k,...v})).sort((a,b)=>a.createdAt-b.createdAt);
    store.patch({ submissions: arr });
  });
  listen(`rooms/${code}/chat`, (snap)=>{
    const val = snap.val()||{};
    const arr = Object.values(val).sort((a,b)=>a.ts-b.ts);
    store.patch({ chat: arr });
    renderChat(arr);
  });
}

/* ---------- Host actions ---------- */
async function hostStartRound(){
  if (!canIHost()) return;
  const s = store.get();
  const ids = Object.keys(s.players||{});
  if (ids.length < 3) { alert("Need at least 3 players to start."); return; }

  if (!hostDecks) hostDecks = createHostDecks();

  // reset submitted
  await Promise.all(ids.map(pid=> update(ref(db, `rooms/${currentRoom}/players/${pid}`), { submitted:false })));

  // deal to 7
  for (const pid of ids){
    const handRef = ref(db, `rooms/${currentRoom}/hands/${pid}`);
    const snap = await get(handRef);
    const hand = snap.exists()? snap.val(): {};
    for (let i=Object.keys(hand).length; i<7; i++){
      const card = hostDecks.white.draw(); if (!card) break;
      await set(ref(db, `rooms/${currentRoom}/hands/${pid}/${card.id}`), card);
    }
  }

  // clear submissions
  await remove(ref(db, `rooms/${currentRoom}/submissions`));

  const nextJudge = computeNextJudgeId(s.players, s.round?.judgeUid || null);
  const black = hostDecks.black.draw();
  const deadline = Date.now() + ROUND_SECONDS*1000;
  await set(ref(db, `rooms/${currentRoom}/round`), {
    number:(s.round?.number||0)+1, judgeUid:nextJudge, black, deadline, pickedSubmissionId:null
  });
  await set(ref(db, `rooms/${currentRoom}/started`), true);
}

async function hostPickWinner(subId){
  if (!canIHost()) return;
  const sub = (await get(ref(db, `rooms/${currentRoom}/submissions/${subId}`))).val();
  if (!sub) return;
  const pRef = ref(db, `rooms/${currentRoom}/players/${sub.by}`);
  const pSnap = await get(pRef);
  const cur = pSnap.exists()? (pSnap.val().score||0) : 0;
  await update(pRef, { score: cur+1 });
  await update(ref(db, `rooms/${currentRoom}/round`), { pickedSubmissionId: subId });
  setTimeout(()=> hostStartRound(), 1200);
}

/* ---------- Chat ---------- */
function renderChat(items){
  const box = $("#chat-list");
  if (!box) return;
  box.innerHTML = items.map(i=>`<div class="chat-row"><span class="name">${i.name}:</span><span class="text">${i.text}</span></div>`).join("");
  box.scrollTop = box.scrollHeight;
}
async function sendChat(msg){
  if (!currentRoom || !msg.trim()) return;
  const meName = localStorage.getItem("cadh-name") || "Player";
  const item = { from: my.uid, name: meName, text: msg.trim(), ts: Date.now() };
  await set(ref(db, `rooms/${currentRoom}/chat/${id()}`), item);
}

/* ---------- Wire UI ---------- */
authReady.then(()=>{
  ui = new UI(store, {
    meId: auth.currentUser.uid,
    onPlayCard: (cid)=> playCard(cid),
    onJudgePick: (sid)=> hostPickWinner(sid),
    onStartRound: ()=> hostStartRound()
  });
  showModal(true);
});

async function playCard(cardId){
  const s = store.get();
  if (!s.started) return;
  if (s.round?.judgeUid === my.uid) return;
  if (s.players?.[my.uid]?.submitted) return;
  const cardRef = ref(db, `rooms/${currentRoom}/hands/${my.uid}/${cardId}`);
  const snap = await get(cardRef);
  if (!snap.exists()) return;
  await set(ref(db, `rooms/${currentRoom}/submissions/${id()}`), { by: my.uid, card: snap.val(), createdAt: Date.now() });
  await remove(cardRef);
  await update(ref(db, `rooms/${currentRoom}/players/${my.uid}`), { submitted:true });
}

/* ---------- Events (guarded in case ids missing) ---------- */
if (joinBtn) joinBtn.addEventListener("click", ()=>{
  const code = (roomInput?.value || "").trim().toUpperCase();
  const name = (nameInput?.value || "").trim() || defaultName();
  if (!code) { roomInput?.focus(); return; }
  joinRoom(code, name).catch(e=> alert("Join failed: "+(e?.message||e)));
});
if (roomInput) roomInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn?.click(); });
if (nameInput) nameInput.addEventListener("keydown", e=>{ if(e.key==="Enter") joinBtn?.click(); });

let sending = false;
if (chatSend) chatSend.addEventListener("click", async ()=>{
  if (sending) return;
  const msg = (chatInput?.value || "").trim();
  if (!msg) return;
  sending = true;
  try { await sendChat(msg); chatInput.value = ""; } finally { sending = false; }
});
if (chatInput) chatInput.addEventListener("keydown", e=>{
  if (e.key === "Enter") { e.preventDefault(); chatSend?.click(); }
});

console.log("[boot] App loaded; waiting for user to join…");
