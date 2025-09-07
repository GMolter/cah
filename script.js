import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const app = initializeApp({
  apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain:"olio-cardsagainsthumanity.firebaseapp.com",
  projectId:"olio-cardsagainsthumanity",
  storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId:"256442998757",
  appId:"1:256442998757:web:ab26e55db0b5029879990c"
});
const db = getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");
const auth = getAuth(app);

// ui helpers
const $=s=>document.querySelector(s);
const toast=(t)=>{const d=document.createElement("div");d.className="toast";d.textContent=t;$("#toasts").appendChild(d);setTimeout(()=>d.remove(),2500);};
const show=(el,yn)=>el.style.display=yn?"":"none";

// auth state
onAuthStateChanged(auth, async (u)=>{
  if(!u){ show($("#authCard"),1); show($("#joinCard"),0); return; }
  await ensureProfile(u); // make sure /profiles exists & updated
  $("#meChip").textContent=(u.displayName||u.email||u.uid);
  show($("#authCard"),0); show($("#joinCard"),1);
});

// ensure /profiles entry
async function ensureProfile(u){
  const pRef=ref(db,"profiles/"+u.uid);
  const snap=await get(pRef);
  const nickname = u.displayName || (u.email?u.email.split("@")[0]:"Player");
  const data={ email:u.email||"", nickname, photoURL:u.photoURL||"", lastLoginAt:Date.now() };
  if(!snap.exists()){
    data.createdAt=Date.now(); data.provider=(u.providerData[0]?.providerId)||"password";
    await set(pRef,data);
  }else{
    await update(pRef,data);
  }
}

// google sign-in
$("#googleBtn").onclick=async ()=>{
  try{ const res=await signInWithPopup(auth,new GoogleAuthProvider()); await ensureProfile(res.user); }
  catch(e){ toast(e.message||"Google sign-in failed"); }
};

// email sign-in
$("#emailSignIn").onclick=async ()=>{
  try{ await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value); }
  catch(e){ toast(e.message||"Sign-in failed"); }
};

// create account modal
const modal=$("#createModal");
$("#openCreate").onclick=()=>show(modal,1);
$("#createClose").onclick=()=>show(modal,0);
$("#createDo").onclick=async ()=>{
  const em=$("#ca_email").value.trim(), pw=$("#ca_pass").value, nick=$("#ca_user").value.trim();
  if(pw.length<6){ toast("Password must be 6+ chars"); return; }
  try{
    const {user}=await createUserWithEmailAndPassword(auth,em,pw);
    if(nick) try{ await updateProfile(user,{displayName:nick}); }catch{}
    await ensureProfile({ ...user, displayName:nick||user.displayName });
    show(modal,0); toast("Account created");
  }catch(e){ toast(e.message||"Create failed"); }
};

// join room flow
async function tryJoin(room){
  const u=auth.currentUser; if(!u){ toast("Please sign in"); return; }
  // banned?
  const ban=await get(ref(db,"bans/uids/"+u.uid));
  if(ban.exists()){ toast("You are banned from playing."); return; }
  // if private, require code via accessAttempts write (rules verify)
  const code=$("#roomCode").value.trim();
  const now=Date.now();
  try{
    await set(ref(db,`rooms/${room}/accessAttempts/${u.uid}`),{ ts:now, code:code||"" });
    window.location.href=`./${room}/`;
  }catch(e){
    toast(code? "Incorrect/missing code" : "Room requires a code");
  }
}
document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>tryJoin(b.dataset.room));
$("#signOut").onclick=()=>signOut(auth);

// small nicety: keep signed in (handled by Firebase persistence by default)
