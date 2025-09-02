import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase */
const cfg={apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",authDomain:"olio-cardsagainsthumanity.firebaseapp.com",projectId:"olio-cardsagainsthumanity",storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",messagingSenderId:"256442998757",appId:"1:256442998757:web:ab26e55db0b5029879990c"};
const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");
const ROOM="room1", $=q=>document.querySelector(q);
let me=null, hb=null;

/* Auth */
onAuthStateChanged(auth, async u=>{
  if(!u){ location.href="../"; return; }
  me=u;
  await safeJoin();
  watchPlayers();
  watchChat();
  startHeartbeat();
});

/* Join logic: preserve within 45s, otherwise new join; count via transaction */
async function safeJoin(){
  const uid=me.uid, prof=(await get(ref(db,`profiles/${uid}`))).val()||{};
  const pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  const now=Date.now();
  const existing=(await get(pRef)).val();
  let isNew=true, joinedAt=now;
  if(existing && now-(existing.lastSeen||0)<=45000){ isNew=false; joinedAt=existing.joinedAt||now; }

  await update(pRef,{
    nickname:prof.nickname||prof.firstName||"User",
    photoURL:prof.photoURL||"../assets/default-avatar.png",
    joinedAt,lastSeen:now,status:"online"
  });

  if(isNew){ await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>(c||0)+1); }

  // Cleanly mark offline on disconnect (no remove to avoid flicker)
  onDisconnect(pRef).update({status:"offline",lastSeen:Date.now()});

  // "System" message shaped as normal chat (type: 'message') to satisfy rules
  sendSystem(isNew?`${displayNick(prof)} joined the room`:`${displayNick(prof)} reconnected`);
}

/* Leave without signing out */
$("#leaveBtn").onclick=async ()=>{
  if(!me) return;
  const uid=me.uid, pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>Math.max((c||1)-1,0));
  await set(pRef,null);
  await sendSystem(`${me.displayName?.split(" ")[0]||"User"} left the room`);
  location.href="../";
};

/* Heartbeat */
function startHeartbeat(){
  clearInterval(hb);
  hb=setInterval(()=>{ if(me){ update(ref(db,`rooms/${ROOM}/players/${me.uid}`),{lastSeen:Date.now(),status:"online"}); } },15000);
}

/* Scoreboard (top-right), sorted by joinedAt, duplicate names suffix * */
function watchPlayers(){
  onValue(ref(db,`rooms/${ROOM}/players`),snap=>{
    const list=$("#playerList"); const arr=[];
    snap.forEach(ch=>arr.push({...ch.val()}));
    arr.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    $("#playerCount").textContent=arr.length;
    const seen=new Set();
    list.innerHTML=arr.map(p=>{
      const base=(p.nickname||"User"); const key=base.toLowerCase();
      const name=seen.has(key)?`${base}*`:(seen.add(key),base);
      return `<li><img src="${p.photoURL}" alt=""><span>${name}</span></li>`;
    }).join("");
  });
}

/* Chat (top-left) */
$("#chatForm").onsubmit=async e=>{
  e.preventDefault();
  const text=$("#chatInput").value.trim(); if(!text) return;
  const prof=(await get(ref(db,`profiles/${me.uid}`))).val()||{};
  await push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:displayNick(prof),text, type:"message", ts:Date.now()});
  $("#chatInput").value="";
};
function watchChat(){
  onValue(ref(db,`rooms/${ROOM}/chat`),snap=>{
    const log=$("#chatLog"); log.innerHTML="";
    snap.forEach(s=>{
      const m=s.val(); const div=document.createElement("div");
      const isSys = m.sys === true || /joined the room|left the room|reconnected/.test(m.text||"");
      div.className="chat-msg "+(isSys?"system":(m.uid===me.uid?"self":"other"));
      div.textContent=isSys ? m.text : `${m.nickname}: ${m.text}`;
      log.appendChild(div);
    }); log.scrollTop=log.scrollHeight;
  });
}
function sendSystem(text){
  const nick = me?.displayName?.split(" ")[0] || "User";
  return push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:nick,text, type:"message", sys:true, ts:Date.now()});
}
function displayNick(prof){ return (prof.nickname||prof.firstName||"User"); }
