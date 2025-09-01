import { createGameStore } from "./game.js";
import { UI } from "./ui.js";
import { Transport } from "./net.js";

const $ = (sel) => document.querySelector(sel);
const joinBtn   = $("#join-btn");
const newBtn    = $("#new-btn");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const chatInput = $("#chat-input");
const chatSend  = $("#chat-send");

const uid = () => Math.random().toString(36).slice(2,10);
const defaultName = () => localStorage.getItem("cadh-name") || `Player-${Math.floor(Math.random()*90+10)}`;

/* init inputs */
nameInput.value = defaultName();
roomInput.value = localStorage.getItem("cadh-room") || "";

let me = { id: uid(), name: nameInput.value, joinedAt: Date.now(), connected:false };
let transport, store, ui, roomCode = "";

function bindUI(){
  chatSend.addEventListener("click", () => {
    const msg = chatInput.value.trim();
    if(!msg || !store) return;
    store.actions.postChat(me, msg);
    chatInput.value = "";
  });
  chatInput.addEventListener("keydown", e=>{ if(e.key==="Enter") chatSend.click(); });

  joinBtn.addEventListener("click", joinRoomFromInputs);
  newBtn.addEventListener("click", ()=> {
    roomInput.value = generateRoom();
    joinRoomFromInputs(true);
  });

  nameInput.addEventListener("change", () => {
    localStorage.setItem("cadh-name", nameInput.value.trim());
  });
}

function generateRoom(){
  return Math.random().toString(36).replace(/[^a-z0-9]/g,"").slice(2,8).toUpperCase();
}

async function joinRoomFromInputs(forceCreate=false){
  const code = (roomInput.value || "").trim().toUpperCase();
  const name = (nameInput.value || "").trim() || defaultName();
  if(!code) { roomInput.focus(); return; }
  localStorage.setItem("cadh-room", code);
  me.name = name;
  await bootRoom(code, forceCreate);
}

async function bootRoom(code, forceCreate){
  if(transport) transport.destroy();

  roomCode = code;
  transport = new Transport(code);
  store = createGameStore(transport);

  if(ui) ui.destroy();
  ui = new UI(store, {
    meId: me.id,
    onPlayCard: (cardId)=> store.actions.playCard(me.id, cardId),
    onJudgePick: (submissionId)=> store.actions.judgePick(me.id, submissionId),
  });

  transport.onMessage((msg)=> store.actions.ingestNetwork(msg));
  store.actions.join(me, forceCreate);

  setInterval(()=> store.actions.rename(me.id, nameInput.value.trim() || defaultName()), 4000);
}

/* Auto from URL */
const params = new URLSearchParams(location.search);
const urlRoom = params.get("room");
if(urlRoom) roomInput.value = urlRoom.toUpperCase();

bindUI();
if(roomInput.value) joinRoomFromInputs();

window.__CADH__ = { join: joinRoomFromInputs, store:()=>store };
