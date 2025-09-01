import { createGameStore } from "./game.js";
import { UI } from "./ui.js";
import { Transport } from "./net.js";

/** DOM refs */
const $ = (sel) => document.querySelector(sel);
const joinBtn = $("#join-btn");
const newBtn  = $("#new-btn");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const chatInput = $("#chat-input");
const chatSend  = $("#chat-send");

/** Utilities */
const uid = () => Math.random().toString(36).slice(2,10);
const defaultName = () => localStorage.getItem("cah-name") || `Player-${Math.floor(Math.random()*90+10)}`;

/** init inputs */
nameInput.value = defaultName();
roomInput.value = localStorage.getItem("cah-room") || "";

/** global (per-tab) state */
let me = { id: uid(), name: nameInput.value, joinedAt: Date.now(), connected:false };
let transport, store, ui, roomCode = "";

function bindUI(){
  // Chat
  chatSend.addEventListener("click", () => {
    const msg = chatInput.value.trim();
    if(!msg) return;
    store.actions.postChat(me, msg);
    chatInput.value = "";
  });
  chatInput.addEventListener("keydown", e=>{ if(e.key==="Enter") chatSend.click(); });

  // Join + New
  joinBtn.addEventListener("click", joinRoomFromInputs);
  newBtn.addEventListener("click", ()=> {
    roomInput.value = generateRoom();
    joinRoomFromInputs(true);
  });

  // Name persistence
  nameInput.addEventListener("change", () => {
    localStorage.setItem("cah-name", nameInput.value.trim());
  });
}

function generateRoom(){
  const code = Math.random().toString(36).replace(/[^a-z0-9]/g,"").slice(2,8).toUpperCase();
  return code;
}

async function joinRoomFromInputs(forceCreate=false){
  const code = (roomInput.value || "").trim().toUpperCase();
  const name = (nameInput.value || "").trim() || defaultName();
  if(!code) { roomInput.focus(); return; }
  localStorage.setItem("cah-room", code);
  me.name = name;

  await bootRoom(code, forceCreate);
}

async function bootRoom(code, forceCreate){
  // Disconnect existing
  if(transport) transport.destroy();

  roomCode = code;
  transport = new Transport(code);

  // Create engine store
  store = createGameStore(transport);

  // Build UI layer
  if(ui) ui.destroy();
  ui = new UI(store, {
    meId: me.id,
    onPlayCard: (cardId)=> store.actions.playCard(me.id, cardId),
    onJudgePick: (submissionId)=> store.actions.judgePick(me.id, submissionId),
  });

  // Connect + join
  transport.onMessage((msg)=> store.actions.ingestNetwork(msg));

  // announce join
  store.actions.join(me, forceCreate);

  // Keep my latest name synced
  setInterval(()=> store.actions.rename(me.id, nameInput.value.trim() || defaultName()), 4000);
}

/* Auto-join via URL ?room= */
const params = new URLSearchParams(location.search);
const urlRoom = params.get("room");
if(urlRoom){
  roomInput.value = urlRoom.toUpperCase();
}
/* Bind and maybe auto-rejoin last room */
bindUI();
if(roomInput.value) joinRoomFromInputs();

/* Expose for debugging in console */
window.__CAH__ = { join: joinRoomFromInputs, store:()=>store };
