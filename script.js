import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, remove, onValue, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase */
const cfg={apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",authDomain:"olio-cardsagainsthumanity.firebaseapp.com",projectId:"olio-cardsagainsthumanity",storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",messagingSenderId:"256442998757",appId:"1:256442998757:web:ab26e55db0b5029879990c"};
const app=initializeApp(cfg), auth=getAuth(app);
const db=getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");

const $=q=>document.querySelector(q), qs=a=>document.querySelectorAll(a);
const signCard=$("#signCard"), roomCard=$("#roomCard"), userInfo=$("#userInfo"), gateErr=$("#gateErr"), authErr=$("#authErr");

/* --- Auth view wiring --- */
onAuthStateChanged(auth,(u)=>{
  if(u){
    signCard.style.display="none"; roomCard.style.display="";
    // crown if admin
    onValue(ref(db,"admins/uids/"+u.uid),(s)=>{
      const isAdmin=s.val()===true;
      userInfo.innerHTML=`${isAdmin?'<span class="crown">👑</span>':''}${u.email||u.uid}`;
    },{onlyOnce:false});
  }else{
    signCard.style.display=""; roomCard.style.display="none";
  }
});

/* --- Sign in methods --- */
$("#googleBtn").onclick=async()=>{ try{ await signInWithPopup(auth,new GoogleAuthProvider()); }catch(e){ authErr.textContent=e.message||"Google sign-in failed"; }};
$("#emailForm").onsubmit=async(e)=>{
  e.preventDefault(); authErr.textContent="";
  try{ await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value.trim()); }
  catch(err){ authErr.textContent=err.code==="auth/user-not-found"?"No account—use Create account.":(err.message||"Sign in failed"); }
};
$("#signOutBtn").onclick=()=>signOut(auth);

/* --- Create account modal --- */
const modal=$("#createModal"), openCreate=$("#openCreate"), cancel=$("#createCancel"), form=$("#createForm"), cErr=$("#createErr");
openCreate.onclick=()=>{ cErr.textContent=""; form.reset(); modal.classList.remove("hidden"); $("#newEmail").focus(); };
cancel.onclick=()=>modal.classList.add("hidden");
form.onsubmit=async(e)=>{
  e.preventDefault(); cErr.textContent="";
  const em=$("#newEmail").value.trim(), p=$("#newPass").value, p2=$("#newPass2").value;
  if(p!==p2){ cErr.textContent="Passwords do not match."; return; }
  try{ await createUserWithEmailAndPassword(auth,em,p); modal.classList.add("hidden"); }
  catch(err){ cErr.textContent=err.message||"Create failed"; }
};

/* --- Room gate + secret setpassword --- */
qs(".joinBtn").forEach(b=>b.onclick=()=>attemptEnter(b.dataset.room));
async function attemptEnter(room){
  gateErr.textContent="";
  const u=auth.currentUser; if(!u){ gateErr.textContent="Sign in first."; return; }
  const val=($("#roomCode").value||"").trim();

  // secret admin command
  if(val.startsWith("//setpassword//")){
    const pwd=val.replace(/^\/\/setpassword\/\/\s*/,"");
    try{
      if(pwd.length===0) await update(ref(db,`rooms/${room}/settings`),{private:false,password:null});
      else await update(ref(db,`rooms/${room}/settings`),{private:true,password:pwd});
      gateErr.textContent="Room settings updated.";
    }catch(e){ gateErr.textContent=e.code==="PERMISSION_DENIED"?"Not allowed.":(e.message||"Update failed."); }
    return;
  }

  // gate: blind write succeeds if public or code matches password (rules)
  const path=`rooms/${room}/accessAttempts/${u.uid}`;
  try{ await set(ref(db,path),{ts:Date.now(),code:val}); await remove(ref(db,path)).catch(()=>{}); location.href=`./${room}/`; }
  catch(e){ gateErr.textContent=String(e.message||"").includes("PERMISSION_DENIED")?"Incorrect or missing room code.":(e.message||"Could not check room access."); }
}
