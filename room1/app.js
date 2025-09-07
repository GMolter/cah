import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update,
  onValue, push, runTransaction, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase init */
const cfg = {
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c"
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getDatabase(app, "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com/");

const ROOM = "room1";
const $ = (q) => document.querySelector(q);

let me = null;
let hb = null;
let lastRoster = new Set();

/* ========== Auth & bootstrap ========== */
onAuthStateChanged(auth, async (u) => {
  if (!u) { location.href = "../"; return; }
  me = u;
  console.log("[auth] uid:", me.uid);

  // 1) Always start listeners so UI updates even if join write is delayed.
  watchPlayers();
  watchChat();
  startHeartbeat();

  // 2) Then attempt to create/refresh our seat.
  try {
    await joinSeatSimple();
  } catch (e) {
    console.error("[joinSeatSimple] ERROR =>", e?.message || e);
  }
});

/* ========== Join seat (plain create/refresh) ========== */
async function joinSeatSimple() {
  const uid = me.uid;
  const profSnap = await get(ref(db, `profiles/${uid}`));
  const prof = profSnap.val() || {};
  const nickname = prof.nickname || prof.firstName || "User";
  const photoURL = prof.photoURL || "../assets/default-avatar.png";
  const now = Date.now();

  const seatRef = ref(db, `rooms/${ROOM}/players/${uid}`);
  const seatSnap = await get(seatRef);
  const exists = seatSnap.exists();
  const wasStale = exists ? (now - (seatSnap.val().lastSeen || 0) > 45000) : true;

  if (!exists || wasStale) {
    // Create or re-create (fresh joinedAt)
    const seat = { nickname, photoURL, joinedAt: now, lastSeen: now, status: "online" };
    await set(seatRef, seat).catch((e) => { throw new Error("set seat failed: "+e.message); });
    // Best-effort count bump (not required for rendering)
    runTransaction(ref(db, `rooms/${ROOM}/count`), (c) => (c || 0) + 1).catch((e)=>console.warn("[count+] warn:", e.message));
    toast(`${nickname} joined the room`, 3500);
    console.log("[seat] created for", uid);
  } else {
    // Just refresh presence; keep original joinedAt
    await update(seatRef, { lastSeen: now, status: "online" }).catch((e)=>{ throw new Error("update presence failed: "+e.message); });
    toast(`${nickname} reconnected`, 2500);
    console.log("[seat] refreshed for", uid);
  }

  // Mark offline on disconnect (no removal)
  onDisconnect(seatRef).update({ status: "offline", lastSeen: Date.now() }).catch(()=>{});
}

/* ========== Leave room (no sign-out) ========== */
$("#leaveBtn").onclick = async () => {
  if (!me) return;
  const uid = me.uid;
  const seatRef = ref(db, `rooms/${ROOM}/players/${uid}`);
  try {
    await runTransaction(ref(db, `rooms/${ROOM}/count`), (c) => Math.max((c || 1) - 1, 0));
    await set(seatRef, null);
  } catch (e) {
    console.warn("[leave] warn:", e.message);
  }
  location.href = "../";
};

/* ========== Heartbeat every 15s ========== */
function startHeartbeat() {
  clearInterval(hb);
  hb = setInterval(() => {
    if (!me) return;
    update(ref(db, `rooms/${ROOM}/players/${me.uid}`), { lastSeen: Date.now(), status: "online" })
      .catch((e)=>console.warn("[heartbeat] warn:", e.message));
  }, 15000);
}

/* ========== Scoreboard (always renders what exists) ========== */
function watchPlayers() {
  const playersRef = ref(db, `rooms/${ROOM}/players`);
  onValue(playersRef, (snap) => {
    const rows = [];
    snap.forEach((ch) => rows.push({ id: ch.key, ...ch.val() }));
    rows.sort((a,b) => (a.joinedAt||0) - (b.joinedAt||0));

    // Render
    $("#playerCount").textContent = rows.length;
    const seen = new Set();
    $("#playerList").innerHTML = rows.map((p) => {
      const base = p.nickname || "User";
      const name = seen.has(base.toLowerCase()) ? `${base}*` : (seen.add(base.toLowerCase()), base);
      const avatar = p.photoURL || "../assets/default-avatar.png";
      return `<li><img src="${avatar}" alt=""><span>${name}</span></li>`;
    }).join("");

    // Local transient toasts (join/leave) by diff
    const current = new Set(rows.map(r => r.id));
    for (const id of current) if (!lastRoster.has(id)) toast(`${nameFor(id, rows)} joined`, 2500);
    for (const id of lastRoster) if (!current.has(id)) toast(`${nameFor(id, rows, "User")} left`, 2500);
    lastRoster = current;

    console.log("[players] render =>", rows.length, rows.map(r=>r.id));
  }, (err) => {
    console.error("[players] onValue ERROR =>", err?.message || err);
  });
}

function nameFor(id, list, fallback="User"){ const f=list.find(x=>x.id===id); return f?.nickname || fallback; }

/* ========== Chat (DB only for real messages) ========== */
$("#chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  const prof = (await get(ref(db, `profiles/${me.uid}`))).val() || {};
  await push(ref(db, `rooms/${ROOM}/chat`), {
    uid: me.uid,
    nickname: prof.nickname || prof.firstName || "User",
    text, type: "message", ts: Date.now()
  }).catch((e)=>console.error("[chat push] ERROR =>", e.message));
  input.value = "";
};

function watchChat() {
  onValue(ref(db, `rooms/${ROOM}/chat`), (snap) => {
    const log = $("#chatLog");
    log.innerHTML = "";
    snap.forEach((s) => {
      const m = s.val();
      const div = document.createElement("div");
      div.className = "chat-msg " + (m.uid === me?.uid ? "self" : "other");
      div.textContent = `${m.nickname}: ${m.text}`;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  }, (err)=>console.error("[chat onValue] ERROR =>", err?.message || err));
}

/* ========== Transient toast (UI only) ========== */
function toast(text, ms=4000){
  const wrap = document.querySelector("#toasts");
  if(!wrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}
