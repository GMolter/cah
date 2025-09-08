import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const app = initializeApp({
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c"
});
const db = getDatabase(app, "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");
const auth = getAuth(app);

const $ = s => document.querySelector(s);
const showBlock = (el, on) => { el.style.display = on ? "" : "none"; };
const toast = t => { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; $("#toasts").appendChild(d); setTimeout(() => d.remove(), 2400); };

const ROOT = "gmolter8@gmail.com";
const nice = (code) => ({
  "auth/invalid-credential": "Invalid email or password.",
  "auth/wrong-password": "Wrong password.",
  "auth/user-not-found": "No account found for that email.",
  "auth/invalid-email": "That email looks invalid.",
  "auth/email-already-in-use": "That email is already in use.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/network-request-failed": "Network error. Please try again.",
  "auth/too-many-requests": "Too many attempts. Try again later."
}[code] || "Something went wrong. Please try again.");

async function isAdmin(u) {
  if (!u) return false;
  if (u.email === ROOT) return true;
  try { const s = await get(ref(db, "admins/uids/" + u.uid)); return s.val() === true; }
  catch { return false; }
}

async function upsertProfile(u) {
  const pRef = ref(db, "profiles/" + u.uid);
  const snap = await get(pRef);
  const nickname = u.displayName || (u.email ? u.email.split("@")[0] : "Player");
  const data = { email: u.email || "", nickname, photoURL: u.photoURL || "", lastLoginAt: Date.now() };
  if (!snap.exists()) {
    data.createdAt = Date.now();
    data.provider = (u.providerData[0]?.providerId) || "password";
    await set(pRef, data);
  } else {
    await update(pRef, data);
  }
}

// -------- Auth state --------
onAuthStateChanged(auth, async (u) => {
  if (!u) { showBlock($("#authCard"), true); showBlock($("#joinCard"), false); return; }
  await upsertProfile(u);
  const crown = (await isAdmin(u)) ? " 👑" : "";
  $("#meChip").textContent = (u.displayName || u.email || u.uid) + crown;
  showBlock($("#authCard"), false);
  showBlock($("#joinCard"), true);
});

// -------- Sign-in flows --------
$("#googleBtn").onclick = async () => {
  try { const r = await signInWithPopup(auth, new GoogleAuthProvider()); await upsertProfile(r.user); }
  catch (e) { toast(nice(e.code)); }
};
$("#emailSignIn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); }
  catch (e) { toast(nice(e.code)); }
};
$("#signOut").onclick = () => signOut(auth);

// -------- Create account modal (class toggle fix) --------
const modal = $("#createModal");
$("#openCreate").onclick = () => modal.classList.add("show");
$("#createClose").onclick = () => modal.classList.remove("show");
$("#createDo").onclick = async () => {
  const em = $("#ca_email").value.trim();
  const pw = $("#ca_pass").value;
  const nm = $("#ca_user").value.trim();
  if (!em || !pw) { toast("Please enter email and password."); return; }
  if (pw.length < 6) { toast("Password must be 6+ chars."); return; }
  try {
    const { user } = await createUserWithEmailAndPassword(auth, em, pw);
    if (nm) { try { await updateProfile(user, { displayName: nm }); } catch {} }
    await upsertProfile({ ...user, displayName: nm || user.displayName });
    modal.classList.remove("show");
    toast("Account created");
  } catch (e) { toast(nice(e.code)); }
};

// -------- Join + shortcuts --------
async function join(room) {
  const u = auth.currentUser; if (!u) { toast("Please sign in"); return; }
  const raw = $("#roomCode").value.trim();

  // //config shortcut
  if (/^\/\/config$/i.test(raw)) { location.href = "./config/"; return; }

  // //pass [code] (admins only) — //pass clears
  const m = raw.match(/^\/\/pass(?:\s+(.*))?$/i);
  if (m) {
    if (!(await isAdmin(u))) { toast("Not allowed"); return; }
    const code = (m[1] || "").trim();
    try {
      if (code) {
        await update(ref(db, `rooms/${room}/settings`), { private: true, password: code });
        toast("Password set");
      } else {
        await update(ref(db, `rooms/${room}/settings`), { private: false, password: null });
        toast("Password cleared (public)");
      }
    } catch { toast("Failed to update room password"); }
    return;
  }

  // banned?
  if ((await get(ref(db, "bans/uids/" + u.uid))).exists()) { toast("You are banned from playing."); return; }

  // normal join — gated by rules via /accessAttempts
  try {
    await set(ref(db, `rooms/${room}/accessAttempts/${u.uid}`), { ts: Date.now(), code: raw || "" });
    location.href = `./${room}/`;
  } catch {
    toast(raw ? "Incorrect/missing code" : "Room requires a code");
  }
}
document.querySelectorAll("[data-room]").forEach(b => b.onclick = () => join(b.dataset.room));
