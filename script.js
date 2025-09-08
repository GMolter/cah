import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,updateProfile,signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase,ref,get,set,update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const app=initializeApp({apiKey:"AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",authDomain:"olio-cardsagainsthumanity.firebaseapp.com",projectId:"olio-cardsagainsthumanity",storageBucket:"olio-cardsagainsthumanity.firebasestorage.app",messagingSenderId:"256442998757",appId:"1:256442998757:web:ab26e55db0b5029879990c"});
const db=getDatabase(app,"https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/"); const auth=getAuth(app);
const $=s=>document.querySelector(s), show=(el,on)=>el.style.display=on?"":"none", toast=t=>{const d=document.createElement("div");d.className="toast";d.textContent=t;$("#toasts").appendChild(d);setTimeout(()=>d.remove(),2400);};
const ROOT="gmolter8@gmail.com";

async function isAdmin(u){ if(!u) return false; if(u.email===ROOT) return true; try{const s=await get(ref(db,"admins/uids/"+u.uid)); return s.val()===true;}catch{return false;}}

async function upsertProfile(u){
  const pRef=ref(db,"profiles/"+u.uid), s=await get(pRef);
  const nick=u.displayName||(u.email?u.email.split("@")[0]:"Player");
  const data={email:u.email||"",nickname:nick,photoURL:u.photoURL||"",lastLoginAt:Date.now()};
  if(!s.exists()){data.createdAt=Date.now();data.provider=(u.providerData[0]?.providerId)||"password";await set(pRef,data);} else await update(pRef,data);
}

onAuthStateChanged(auth,async u=>{
  if(!u){show($("#authCard"),1);show($("#joinCard"),0);return;}
  await upsertProfile(u); const crown=await isAdmin(u)?" 👑":"";
  $("#meChip").textContent=(u.displayName||u.email||u.uid)+crown;
  show($("#authCard"),0); show($("#joinCard"),1);
});

$("#googleBtn").onclick=async()=>{try{const r=await signInWithPopup(auth,new GoogleAuthProvider());await upsertProfile(r.user);}catch(e){toast(e.message||"Google sign-in failed");}};
$("#emailSignIn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value);}catch(e){toast(e.message||"Sign-in failed");}};
$("#signOut").onclick=()=>signOut(auth);

// Create account modal
const modal=$("#createModal"); $("#openCreate").onclick=()=>show(modal,1); $("#createClose").onclick=()=>show(modal,0);
$("#createDo").onclick=async()=>{const em=$("#ca_email").value.trim(), pw=$("#ca_pass").value, nm=$("#ca_user").value.trim();
  if(pw.length<6){toast("Password must be 6+ chars");return;}
  try{const {user}=await createUserWithEmailAndPassword(auth,em,pw); if(nm)try{await updateProfile(user,{displayName:nm});}catch{}
    await upsertProfile({...user,displayName:nm||user.displayName}); show(modal,0); toast("Account created");
  }catch(e){toast(e.message||"Create failed");}
};

// Join flow + admin hidden command
async function join(room){
  const u=auth.currentUser; if(!u){toast("Please sign in");return;}
  const input=$("#roomCode").value.trim(); const lower=input.toLowerCase();
  // Hidden admin command: //setpassword// [code]
  if(lower.startsWith("//setpassword//")){
    const code=input.slice(14).trim(); const admin=await isAdmin(u);
    if(!admin){toast("Not allowed");return;}
    try{ if(code){await update(ref(db,`rooms/${room}/settings`),{private:true,password:code}); toast("Password set");}
      else{await update(ref(db,`rooms/${room}/settings`),{private:false,password:null}); toast("Password cleared (public)");}
    }catch(e){toast(e.message||"Failed to set password");}
    return;
  }
  // ban check
  if((await get(ref(db,"bans/uids/"+u.uid))).exists()){toast("You are banned from playing.");return;}
  try{await set(ref(db,`rooms/${room}/accessAttempts/${u.uid}`),{ts:Date.now(),code:input||""}); location.href=`./${room}/`; }
  catch{toast(input?"Incorrect/missing code":"Room requires a code");}
}
document.querySelectorAll("[data-room]").forEach(b=>b.onclick=()=>join(b.dataset.room));
