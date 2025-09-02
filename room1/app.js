import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, push, serverTimestamp, remove, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* --- Firebase --- */
const firebaseConfig = {
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app, "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");

const ROOM = "room1";
let currentUser = null;

/* --- UI refs --- */
const $ = (q)=>document.querySelector(q);
const playerList=$("#playerList"), playerCount=$("#playerCount");
const chatLog=$("#chatLog"), chatForm=$("#chatForm"), chatInput=$("#chatInput");

/* --- Auth flow --- */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href="../"; return; }
  currentUser=user;
  await joinRoom();
});

/* --- Join room --- */
async function joinRoom(){
  const uid=currentUser.uid;
  const profSnap=await get(ref(db,`profiles/${uid}`));
  const prof=profSnap.val()||{};
  const joinedAt=Date.now();
  const playerRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  await update(ref(db),{
    [`rooms/${ROOM}/players/${uid}`]:{
      nickname:prof.nickname||prof.firstName||"User",
      photoURL:prof.photoURL||"../assets/default-avatar.png",
      joinedAt, lastSeen:Date.now(), status:"online"
    },
    [`rooms/${ROOM}/count`]: (await get(ref(db,`rooms/${ROOM}/count`))).val()+1 || 1
  });
  // onDisconnect clean
  import("https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js").then(({onDisconnect})=>{
    onDisconnect(playerRef).remove();
  });
  sendSystem("join");
  watchPlayers(); watchChat();
}

/* --- Leave room --- */
$("#leaveBtn").onclick=async ()=>{
  await leaveRoom(); signOut(auth);
};
async function leaveRoom(){
  if(!currentUser)return;
  const uid=currentUser.uid;
  await remove(ref(db,`rooms/${ROOM}/players/${uid}`));
  const countSnap=await get(ref(db,`rooms/${ROOM}/count`));
  const c=(countSnap.val()||1)-1;
  await set(ref(db,`rooms/${ROOM}/count`),Math.max(c,0));
  sendSystem("leave");
}

/* --- Scoreboard --- */
function watchPlayers(){
  onValue(ref(db,`rooms/${ROOM}/players`),(snap)=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    arr.sort((a,b)=>a.joinedAt-b.joinedAt);
    playerCount.textContent=arr.length;
    playerList.innerHTML=arr.map(p=>
      `<li><img src="${p.photoURL}" alt=""><span>${p.nickname}</span></li>`
    ).join("");
  });
}

/* --- Chat --- */
chatForm.onsubmit=async(e)=>{
  e.preventDefault();
  const text=chatInput.value.trim(); if(!text)return;
  const prof=await get(ref(db,`profiles/${currentUser.uid}`));
  push(ref(db,`rooms/${ROOM}/chat`),{
    uid:currentUser.uid,
    nickname:(prof.val()&&prof.val().nickname)||"User",
    text, type:"message", ts:Date.now()
  });
  chatInput.value="";
};
function watchChat(){
  onValue(ref(db,`rooms/${ROOM}/chat`),(snap)=>{
    chatLog.innerHTML="";
    snap.forEach(msg=>{
      const m=msg.val();
      const div=document.createElement("div");
      div.className="chat-msg "+(m.type==="system"?"system":(m.uid===currentUser.uid?"self":"other"));
      div.textContent=m.type==="message"?`${m.nickname}: ${m.text}`:`${m.nickname||"System"} ${m.text}`;
      chatLog.appendChild(div);
    });
    chatLog.scrollTop=chatLog.scrollHeight;
  });
}
function sendSystem(type){
  push(ref(db,`rooms/${ROOM}/chat`),{
    uid:"system",
    nickname:currentUser.displayName||"User",
    text:type==="join"?"joined the room":"left the room",
    type, ts:Date.now()
  });
}
