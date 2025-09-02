import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
         createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, child } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

/* --- El helpers --- */
const $ = (q)=>document.querySelector(q);
const authCard = $("#authCard"), nickCard = $("#nickCard"), roomsCard = $("#roomsCard");

/* --- Auth UI actions --- */
$("#googleBtn").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e){ setMsg("#authMsg", e.message); }
};

$("#emailSignUp").onclick = async () => {
  const first = $("#firstName").value.trim();
  const email = $("#email").value.trim();
  const pass = $("#password").value;
  if(!first) return setMsg("#authMsg","Enter first name");
  try {
    const {user} = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(user, { displayName: first });
  } catch(e){ setMsg("#authMsg", e.message); }
};

$("#emailSignIn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); }
  catch(e){ setMsg("#authMsg", e.message); }
};

$("#signOut").onclick = () => signOut(auth);

/* --- Nickname save --- */
$("#saveNick").onclick = async () => {
  const nick = $("#nickname").value.trim();
  if(nick.length<1) return setMsg("#nickMsg","Nickname required");
  const uid = auth.currentUser.uid;
  await set(ref(db, `/profiles/${uid}`), {
    email: auth.currentUser.email, firstName: firstNameOf(auth.currentUser),
    photoURL: auth.currentUser.photoURL || null, nickname: nick, nicknameLocked: true,
    createdAt: Date.now(), lastRoom: null
  });
  showRooms();
};

/* --- Room selection --- */
document.querySelectorAll(".roomBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>enterRoom(btn.dataset.room));
});

async function enterRoom(room){
  const code = $("#roomCode").value.trim();
  const snap = await get(ref(db, `/rooms/${room}/settings`));
  const s = snap.val() || { private:false, password:"", maxPlayers:8 };
  if(s.private){
    if(code.length<3) return setMsg("#roomMsg","Room is private: enter code (≥3 chars).");
    if(code!==s.password) return setMsg("#roomMsg","Incorrect room code.");
  }
  location.href = `./${room}/`;
}

/* --- State guard --- */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ showOnly(authCard); return; }
  // ensure profile exists / nickname gate
  const uid = user.uid;
  const p = await get(ref(db, `/profiles/${uid}`));
  if(!p.exists() || !p.val().nicknameLocked){
    showOnly(nickCard);
    $("#nickname").value = (p.val() && p.val().nickname) || firstNameOf(user) || "";
  } else {
    showRooms();
  }
});

/* --- UI helpers --- */
function showRooms(){ showOnly(roomsCard); }
function showOnly(el){ [authCard,nickCard,roomsCard].forEach(x=>x.classList.add("hidden")); el.classList.remove("hidden"); }
function setMsg(sel, msg){ const el=$(sel); el.textContent=msg; setTimeout(()=>el.textContent="",4000); }
function firstNameOf(user){ const n=(user.displayName||"").trim(); return n.split(" ")[0]||""; }
