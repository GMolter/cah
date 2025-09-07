import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, remove, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

const $ = (q)=>document.querySelector(q);
const authErr=$("#authErr"), gateErr=$("#gateErr");

$("#googleBtn").onclick = async ()=>{
  try{ await signInWithPopup(auth,new GoogleAuthProvider()); }
  catch(e){ authErr.textContent=e.message||"Google sign-in failed"; }
};

$("#emailForm").onsubmit = async (e)=>{
  e.preventDefault(); authErr.textContent="";
  const email=$("#email").value.trim(), pass=$("#password").value.trim();
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){
    if(e.code==="auth/user-not-found"){
      try{ await createUserWithEmailAndPassword(auth,email,pass); }
      catch(er){ authErr.textContent=er.message||"Sign up failed"; }
    }else authErr.textContent=e.message||"Sign in failed";
  }
};

onAuthStateChanged(auth, (u)=>{
  document.querySelectorAll(".joinBtn").forEach(btn=>{
    btn.disabled=!u; btn.onclick = u ? ()=>attemptEnter(btn.dataset.room) : null;
  });
});

async function attemptEnter(room){
  gateErr.textContent="";
  const user=auth.currentUser; if(!user){ gateErr.textContent="Sign in first."; return; }
  const val=($("#roomCode").value||"").trim();

  // Secret: //setpassword// [password?]
  if(val.startsWith("//setpassword//")){
    const pwd = val.replace(/^\/\/setpassword\/\/\s*/,"");
    try{
      if(pwd.length===0){
        await update(ref(db,`rooms/${room}/settings`),{private:false,password:null});
        gateErr.textContent="Room password cleared (public).";
      }else{
        await update(ref(db,`rooms/${room}/settings`),{private:true,password:pwd});
        gateErr.textContent="Room password updated.";
      }
    }catch(e){
      gateErr.textContent = e.code==="PERMISSION_DENIED" ? "You’re not allowed to change room settings." : (e.message||"Update failed.");
    }
    return; // do not redirect on secret command
  }

  // Normal gate: blind write allowed by rules if public OR code matches
  const code = val;
  const path = `rooms/${room}/accessAttempts/${user.uid}`;
  try{
    await set(ref(db,path),{ts:Date.now(),code});
    await remove(ref(db,path)).catch(()=>{});
    location.href = `./${room}/`;
  }catch(e){
    gateErr.textContent = String(e&&e.message).includes("PERMISSION_DENIED") ? "Incorrect or missing room code." : (e.message||"Could not check room access.");
  }
}
