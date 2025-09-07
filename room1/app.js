import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, onDisconnect } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase */
const cfg={apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",authDomain:"olio-cardsagainsthumanity.firebaseapp.com",projectId:"olio-cardsagainsthumanity",storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",messagingSenderId:"256442998757",appId:"1:256442998757:web:ab26e55db0b5029879990c"};
const app=initializeApp(cfg), auth=getAuth(app);
const db=getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");

const ROOM="room1", $=q=>document.querySelector(q);
let me=null, hb=null, prevKeys=new Set();

/* Auth bootstrap */
onAuthStateChanged(auth, async u=>{
  if(!u){ location.href="../"; return; }
  me=u; console.log("[auth]",me.uid);
  watchPlayers(); watchChat(); startHeartbeat();
  await joinSeat(); // triggers a “joined” toast on success
});

/* Strict child seat write + toast */
async function joinSeat(){
  const uid=me.uid;
  let prof={}; try{ const s=await get(ref(db,`profiles/${uid}`)); prof=s.val()||{}; }catch{}
  const nickname=prof.nickname||prof.firstName||"User";
  const photoURL=prof.photoURL||"../assets/default-avatar.png";
  const seatRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  const now=Date.now(), seat={nickname,photoURL,joinedAt:now,lastSeen:now,status:"online"};
  try{
    await set(seatRef,seat);
    onDisconnect(seatRef).update({status:"offline",lastSeen:Date.now()}).catch(()=>{});
    console.log("[seat] set OK"); toast(`${nickname} joined`,3000);
  }catch(e){
    console.error("[seat] set FAILED:",e?.message||e); toast("Couldn’t join the room.",4000);
  }
}

/* Leave (no sign-out) */
$("#leaveBtn").onclick=async()=>{
  if(!me) return;
  try{ await set(ref(db,`rooms/${ROOM}/players/${me.uid}`),null); toast("You left the room",2500); }catch{}
  location.href="../";
};

/* Heartbeat */
function startHeartbeat(){
  clearInterval(hb);
  hb=setInterval(()=>{ if(me) update(ref(db,`rooms/${ROOM}/players/${me.uid}`),{lastSeen:Date.now(),status:"online"}).catch(()=>{}); },15000);
}

/* Scoreboard + join/leave toasts via diff */
function watchPlayers(){
  const playersRef=ref(db,`rooms/${ROOM}/players`);
  onValue(playersRef,snap=>{
    const raw=snap.val()||{}, rows=Object.entries(raw).map(([id,v])=>({id,...v}));
    rows.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    $("#playerCount").textContent=rows.length;
    const seen=new Set();
    $("#playerList").innerHTML=rows.map(p=>{
      const base=p.nickname||"User", key=base.toLowerCase();
      const name=seen.has(key)?`${base}*`:(seen.add(key),base);
      const avatar=p.photoURL||"../assets/default-avatar.png";
      return `<li><img src="${avatar}" alt=""><span>${name}</span></li>`;
    }).join("");

    // roster diff -> transient toasts
    const curKeys=new Set(Object.keys(raw));
    for(const k of curKeys) if(!prevKeys.has(k)) toast(`${(raw[k]?.nickname)||"User"} joined`,2500);
    for(const k of prevKeys) if(!curKeys.has(k)) toast(`User left`,2500);
    prevKeys=curKeys;

    console.log("[players] keys:",[...curKeys]);
  },err=>console.error("[players] watch error",err?.message||err));
}

/* Chat */
$("#chatForm").onsubmit=async e=>{
  e.preventDefault();
  const input=$("#chatInput"), text=input.value.trim(); if(!text) return;
  let prof={}; try{ const s=await get(ref(db,`profiles/${me.uid}`)); prof=s.val()||{}; }catch{}
  try{
    await push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:prof.nickname||prof.firstName||"User",text,type:"message",ts:Date.now()});
    input.value="";
  }catch(e){ console.error("[chat] push",e?.message||e); }
};
function watchChat(){
  onValue(ref(db,`rooms/${ROOM}/chat`),snap=>{
    const log=$("#chatLog"); log.innerHTML="";
    snap.forEach(s=>{
      const m=s.val(), div=document.createElement("div");
      div.className="chat-msg "+(m.uid===me?.uid?"self":"other");
      div.textContent=`${m.nickname}: ${m.text}`; log.appendChild(div);
    }); log.scrollTop=log.scrollHeight;
  },err=>console.error("[chat] watch",err?.message||err));
}

/* UI-only toasts */
function toast(text,ms=4000){
  const wrap=$("#toasts"); if(!wrap) return;
  const t=document.createElement("div"); t.className="toast"; t.textContent=text;
  wrap.appendChild(t); setTimeout(()=>t.remove(),ms);
}
