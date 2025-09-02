import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase */
const cfg={apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",authDomain:"olio-cardsagainsthumanity.firebaseapp.com",projectId:"olio-cardsagainsthumanity",storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",messagingSenderId:"256442998757",appId:"1:256442998757:web:ab26e55db0b5029879990c"};
const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");

const ROOM="room1";
const $=q=>document.querySelector(q);
let me=null, hb=null;

/* Auth */
onAuthStateChanged(auth, async u=>{
  if(!u){ location.href="../"; return; }
  me=u;
  console.log("[auth] signed in as", me.uid);
  await joinOrRestore();
  watchPlayers();
  watchChat();
  startHeartbeat();
});

/* Join with explicit create/update and transactional count. */
async function joinOrRestore(){
  const uid=me.uid;
  const prof=(await get(ref(db,`profiles/${uid}`))).val()||{};
  const pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  const now=Date.now();
  const snap=await get(pRef);
  const existing=snap.val();

  let created=false, preserved=false, joinedAt=now;

  if(existing){
    if(now-(existing.lastSeen||0)<=45000){
      preserved=true;
      joinedAt=existing.joinedAt||now;
      await update(pRef,{lastSeen:now,status:"online"});
    }else{
      await set(pRef,{nickname:nameOf(prof),photoURL:prof.photoURL||"../assets/default-avatar.png",joinedAt,lastSeen:now,status:"online"});
      created=true;
    }
  }else{
    await set(pRef,{nickname:nameOf(prof),photoURL:prof.photoURL||"../assets/default-avatar.png",joinedAt,lastSeen:now,status:"online"});
    created=true;
  }

  if(created){
    await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>(c||0)+1);
  }

  onDisconnect(pRef).update({status:"offline",lastSeen:Date.now()});

  const msg = created ? `${nameOf(prof)} joined the room` : (preserved ? `${nameOf(prof)} reconnected` : `${nameOf(prof)} updated`);
  await sendSystem(msg);
  console.log("[join] created:",created,"preserved:",preserved,"joinedAt:",joinedAt);
}

/* Leave (no sign-out) */
$("#leaveBtn").onclick=async ()=>{
  if(!me) return;
  const uid=me.uid, pRef=ref(db,`rooms/${ROOM}/players/${uid}`);
  try{
    await runTransaction(ref(db,`rooms/${ROOM}/count`),c=>Math.max((c||1)-1,0));
    await set(pRef,null);
    await sendSystem(`${me.displayName?.split(" ")[0]||"User"} left the room`);
  }catch(e){ console.error("[leave] error",e); }
  location.href="../";
};

/* Heartbeat every 15s to keep lastSeen fresh */
function startHeartbeat(){
  clearInterval(hb);
  hb=setInterval(()=>{
    if(me){
      update(ref(db,`rooms/${ROOM}/players/${me.uid}`),{lastSeen:Date.now(),status:"online"}).catch(()=>{});
    }
  },15000);
}

/* Scoreboard */
function watchPlayers(){
  const playersRef=ref(db,`rooms/${ROOM}/players`);
  onValue(playersRef,snap=>{
    const arr=[]; snap.forEach(ch=>arr.push({...ch.val(), _key: ch.key}));
    console.log("[players] children:",arr.length, arr.map(p=>p._key));
    arr.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    $("#playerCount").textContent=arr.length;

    const seen=new Set();
    $("#playerList").innerHTML=arr.map(p=>{
      const base=p.nickname||"User"; const k=base.toLowerCase();
      const name=seen.has(k)?`${base}*`:(seen.add(k),base);
      const avatar=p.photoURL||"../assets/default-avatar.png";
      return `<li><img src="${avatar}" alt=""><span>${name}</span></li>`;
    }).join("");
  }, err=>console.error("[players] watch error",err));
}

/* Chat */
$("#chatForm").onsubmit=async e=>{
  e.preventDefault();
  const text=$("#chatInput").value.trim(); if(!text) return;
  const prof=(await get(ref(db,`profiles/${me.uid}`))).val()||{};
  try{
    await push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:nameOf(prof),text,type:"message",ts:Date.now()});
    $("#chatInput").value="";
  }catch(err){ console.error("[chat] push error",err); }
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
  }, err=>console.error("[chat] watch error",err));
}

function sendSystem(text){
  const nick = me?.displayName?.split(" ")[0] || "User";
  return push(ref(db,`rooms/${ROOM}/chat`),{uid:me.uid,nickname:nick,text,type:"message",sys:true,ts:Date.now()});
}
function nameOf(prof){ return (prof.nickname||prof.firstName||"User"); }
