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
  try {
    await joinOrRestore();
    watchPlayers();
    watchChat();
    startHeartbeat();
  } catch(err){
    console.error("Join error:", err);
  }
});

/* Join with clear create/update paths + 45s restore */
async function joinOrRestore(){
  const uid=me.uid, prof=(await get(ref(db,`profiles/${uid}`))).val()||{};
  const pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  const now=Date.now();
  const existingSnap=await get(pRef);
  const existing=existingSnap.val();

  let isNew=true, joinedAt=now;

  if(existing){
    // If back within 45s, keep original seat
    if(now-(existing.lastSeen||0)<=45000){
      isNew=false; joinedAt=existing.joinedAt||now;
      await update(pRef,{lastSeen:now,status:"online"}); // quick bump
    } else {
      // Treated as new seat
      await set(pRef,{
        nickname:displayNick(prof),
        photoURL:prof.photoURL||"../assets/default-avatar.png",
        joinedAt, lastSeen:now, status:"online"
      });
    }
  } else {
    // First time create with full object
    await set(pRef,{
      nickname:displayNick(prof),
      photoURL:prof.photoURL||"../assets/default-avatar.png",
      joinedAt, lastSeen:now, status:"online"
    });
  }

  if(isNew || !existing){ // only when we actually created a new seat
    await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>(c||0)+1);
  }

  // Mark offline on disconnect (no removal to avoid flicker)
  onDisconnect(pRef).update({status:"offline",lastSeen:Date.now()});

  await sendSystem(isNew && !existing ? `${displayNick(prof)} joined the room` : `${displayNick(prof)} reconnected`);
}

/* Leave without signing out */
$("#leaveBtn").onclick=async ()=>{
  if(!me) return;
  const uid=me.uid, pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  try{
    await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>Math.max((c||1)-1,0));
    await set(pRef,null);
    await sendSystem(`${me.displayName?.split(" ")[0]||"User"} left the room`);
  }catch(e){ console.error("Leave error:",e); }
  location.href="../";
};

/* Heartbeat (15s) */
function startHeartbeat(){
  clearInterval(hb);
  hb=setInterval(()=>{ if(me){ update(ref(db,`rooms/${ROOM}/players/${me.uid}`),{lastSeen:Date.now(),status:"online"}).catch(()=>{}); } },15000);
}

/* Scoreboard */
function watchPlayers(){
  onValue(ref(db,`rooms/${ROOM}/players`),snap=>{
    const list=$("#playerList"); const arr=[];
    snap.forEach(ch=>arr.push({...ch.val()}));
    arr.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    $("#playerCount").textContent=arr.length;
    const seen=new Set();
    list.innerHTML=arr.map(p=>{
      const base=p.nickname||"User"; const key=base.toLowerCase();
      const name=seen.has(key)?`${base}*`:(seen.add(key),base);
      return `<li><img src="${p.photoURL}" alt=""><span>${name}</span></li>`;
    }).join("");
  }, (err)=>console.error("players watch error:",err));
}

/* Chat */
$("#chatForm").onsubmit=async e=>{
  e.preventDefault();
  const text=$("#chatInput").value.trim(); if(!text) return;
  const prof=(await get(ref(db,`profiles/${me.uid}`))).val()||{};
  try{
    await push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:displayNick(prof),text,type:"message",ts:Date.now()});
    $("#chatInput").value="";
  }catch(err){ console.error("chat push error:", err); }
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
  }, (err)=>console.error("chat watch error:",err));
}
function sendSystem(text){
  const nick = me?.displayName?.split(" ")[0] || "User";
  return push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:nick,text,type:"message",sys:true,ts:Date.now()});
}
function displayNick(prof){ return (prof.nickname||prof.firstName||"User"); }
