/* APP_JS_BUILD */ 
console.log("APP_JS_BUILD", new Date().toISOString());

import { db, authReady } from "./firebase.js";
import { ref, set, onValue, onDisconnect, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { createStore } from "./tiny-store.js";
import { freshGame, drawBlack, drawHand, id, ROUND_SECONDS } from "./game.js";
import { showJoinModal, renderPlayers, renderChat, renderBlack, renderHand, renderSubmissions, qs } from "./ui.js";

// ------------------------------------------------
// Local state
// ------------------------------------------------
const store = createStore({
  me: null,
  room: null,
  players: {},
  chat: [],
  hand: [],
  submissions: [],
  round: null,
  hostUid: null,
  started: false,
});

// ------------------------------------------------
// UI Elements
// ------------------------------------------------
const joinModal = qs("#join-modal");
const nameInput = qs("#name-input");
const roomInput = qs("#room-input");
const joinBtn   = qs("#join-btn");
const chatInput = qs("#chat-input");
const chatSend  = qs("#chat-send");
const roomCodePill = qs("#room-code-pill");
const hostControls = qs("#host-controls");

// ------------------------------------------------
// Join flow
// ------------------------------------------------
showJoinModal(true);

joinBtn.addEventListener("click", async ()=>{
  const code = roomInput.value.trim();
  const name = nameInput.value.trim();
  if(!code || !name) return alert("Enter name and room code");
  await joinRoom(code, name);
});

async function joinRoom(code, desiredName){
  console.log("[joinRoom] Attempting join",{code,desiredName});
  const user = await authReady;
  console.log("[joinRoom] Auth ready",{uid:user.uid,name:desiredName});

  const playerRef = ref(db, `rooms/${code}/players/${user.uid}`);
  await set(playerRef,{
    name: desiredName,
    joinedAt: Date.now(),
    connected: true,
    score: 0,
    submitted: false
  });
  console.log("[joinRoom] Player set OK");

  const presRef = ref(db, `rooms/${code}/presence/${user.uid}`);
  await set(presRef,true);
  onDisconnect(presRef).set(false);
  console.log("[joinRoom] Presence set + onDisconnect registered");

  // Save local
  localStorage.setItem("cadh-room",code);
  localStorage.setItem("cadh-name",desiredName);

  store.patch({ me:user.uid, room:code });
  bindRoomSubscriptions(code);
  showJoinModal(false);
  roomCodePill.textContent = "Room: "+code;
}

// ------------------------------------------------
// Room Subscriptions
// ------------------------------------------------
function bindRoomSubscriptions(code){
  console.log("[bindRoomSubscriptions] (re)binding listeners for room",code);
  listen(`rooms/${code}/hostUid`, v=> {
    console.log("[sub] hostUid =",v);
    store.patch({ hostUid:v });
    if(v===store.get().me){
      console.log("[sub] became host; initializing decks");
      ensureDecks(code);
    }
  });
  listen(`rooms/${code}/started`, v=>{
    console.log("[sub] started =",v);
    store.patch({ started:v });
  });
  listen(`rooms/${code}/players`, v=>{
    console.log("[sub] players =",v);
    store.patch({ players:v||{} });
    renderPlayers(v||{});
  });
  listen(`rooms/${code}/hands`, v=>{
    console.log("[sub] hands keys =", v?Object.keys(v):[]);
  });
  listen(`rooms/${code}/round`, v=>{
    console.log("[sub] round =",v);
    store.patch({ round:v });
    renderBlack(v?.black||null);
  });
  listen(`rooms/${code}/submissions`, v=>{
    console.log("[sub] submissions len =", v?Object.keys(v).length:0);
    store.patch({ submissions:Object.values(v||{}) });
  });
  listen(`rooms/${code}/chat`, v=>{
    console.log("[sub] chat len =", v?Object.keys(v).length:0);
    store.patch({ chat:Object.values(v||{}) });
    renderChat(Object.values(v||{}));
  });
}

function listen(path,cb){
  onValue(ref(db,path), snap=>{
    cb(snap.val());
  });
}

// ------------------------------------------------
// Hosting / Deck setup
// ------------------------------------------------
async function ensureDecks(code){
  const game = freshGame();
  const rRef = ref(db,`rooms/${code}/round`);
  const snap = await get(rRef);
  if(!snap.exists()){
    await set(rRef,{
      number:0,
      judgeUid:null,
      black:null,
      deadline:0,
      pickedSubmissionId:null
    });
  }
  // Save decks into local store only
  store.patch({ deck: game });
}

// ------------------------------------------------
// Host start round
// ------------------------------------------------
export async function hostStartRound(){
  const s=store.get();
  if(!s.hostUid || s.hostUid!==s.me) return console.warn("Not host");

  const playerIds = Object.keys(s.players||{});
  if(playerIds.length<3) return alert("Need 3+ players");
  console.log("[hostStartRound] playerIds =",playerIds);

  const nextJudge = playerIds[Math.floor(Math.random()*playerIds.length)];
  const black = drawBlack(s.deck);

  const rRef = ref(db,`rooms/${s.room}/round`);
  await set(rRef,{
    number:(s.round?.number||0)+1,
    judgeUid: nextJudge,
    black:black,
    deadline: Date.now()+ROUND_SECONDS*1000,
    pickedSubmissionId:null
  });
  console.log("[hostStartRound] wrote new round");
}

// ------------------------------------------------
// Chat
// ------------------------------------------------
chatSend.addEventListener("click", async ()=>{
  const txt=chatInput.value.trim();
  if(!txt) return;
  chatInput.value="";
  const s=store.get();
  const msgId=id();
  const refp=ref(db,`rooms/${s.room}/chat/${msgId}`);
  await set(refp,{
    from:s.me,
    name: s.players[s.me]?.name||"anon",
    text:txt,
    ts:Date.now()
  });
});

// ------------------------------------------------
// On load
// ------------------------------------------------
console.log("[boot] App loaded; waiting for user to join…");

// Restore previous session
const lastRoom=localStorage.getItem("cadh-room");
const lastName=localStorage.getItem("cadh-name");
if(lastRoom && lastName){
  joinRoom(lastRoom,lastName);
}

// Expose
window.hostStartRound=hostStartRound;
