import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update,
  onValue, push, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/* Firebase */
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

/* ========== Auth bootstrap ========== */
onAuthStateChanged(auth, async (u) => {
  if (!u) { location.href = "../"; return; }
  me = u;
  console.log("[auth] uid:", me.uid);

  // Attach listeners first so UI updates regardless of join timing.
  watchPlayers();
  watchChat();
  startHeartbeat();

  // Then try to create/refresh our seat.
  await joinSeatMinimal();
});

/* ========== Minimal, robust join ========== */
async function joinSeatMinimal() {
  const uid = me.uid;

  // profile
  let prof = {};
  try {
    const p = await get(ref(db, `profiles/${uid}`));
    prof = p.val() || {};
  } catch (e) {
    console.warn("[profile] read warn:", e?.message || e);
  }

  const nickname = prof.nickname || prof.firstName || "User";
  const photoURL = prof.photoURL || "../assets/default-avatar.png";
  const now = Date.now();

  const seatRef = ref(db, `rooms/${ROOM}/players/${uid}`);
  const seat = { nickname, photoURL, joinedAt: now, lastSeen: now, status: "online" };

  try {
    // Always write full object (overwrite if existed). This avoids any race/rollback.
    await set(seatRef, seat);
    onDisconnect(seatRef).update({ status: "offline", lastSeen: Date.now() }).catch(()=>{});
    console.log("[seat] set OK for", uid);
  } catch (e) {
    console.error("[seat] set FAILED:", e?.message || e);
    toast("Couldn’t join the room (permissions).", 4000);
  }
}

/* ========== Leave (no sign-out, no count ops) ========== */
$("#leaveBtn").onclick = async () => {
  if (!me) return;
  try {
    await set(ref(db, `rooms/${ROOM}/players/${me.uid}`), null);
  } catch (e) {
    console.warn("[leave] seat remove warn:", e?.message || e);
  }
  location.href = "../";
};

/* ========== Heartbeat every 15s ========== */
function startHeartbeat() {
  clearInterval(hb);
  hb = setInterval(() => {
    if (!me) return;
    update(ref(db, `rooms/${ROOM}/players/${me.uid}`), {
      lastSeen: Date.now(), status: "online"
    }).catch(()=>{});
  }, 15000);
}

/* ========== Scoreboard (pure reflect of DB) ========== */
function watchPlayers() {
  const playersRef = ref(db, `rooms/${ROOM}/players`);
  onValue(playersRef, (snap) => {
    const rows = [];
    snap.forEach((ch) => rows.push({ id: ch.key, ...ch.val() }));
    rows.sort((a,b) => (a.joinedAt||0)-(b.joinedAt||0));

    $("#playerCount").textContent = rows.length;

    const seen = new Set();
    $("#playerList").innerHTML = rows.map((p) => {
      const base = p.nickname || "User";
      const key = base.toLowerCase();
      const name = seen.has(key) ? `${base}*` : (seen.add(key), base);
      const avatar = p.photoURL || "../assets/default-avatar.png";
      return `<li><img src="${avatar}" alt=""><span>${name}</span></li>`;
    }).join("");

    // Local toasts by diff (no DB side-effects)
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

/* ========== Chat (unchanged; only real messages in DB) ========== */
$("#chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  let prof = {};
  try { const p = await get(ref(db, `profiles/${me.uid}`)); prof = p.val() || {}; } catch {}
  try {
    await push(ref(db, `rooms/${ROOM}/chat`), {
      uid: me.uid, nickname: prof.nickname || prof.firstName || "User",
      text, type: "message", ts: Date.now()
    });
    input.value = "";
  } catch (err) {
    console.error("[chat] push error:", err?.message || err);
  }
};

function watchChat() {
  onValue(ref(db, `rooms/${ROOM}/chat`), (snap) => {
    const log = $("#chatLog"); log.innerHTML = "";
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

/* ========== Transient toast (no DB) ========== */
function toast(text, ms=4000){
  const wrap = document.querySelector("#toasts"); if(!wrap) return;
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
  wrap.appendChild(t); setTimeout(()=>t.remove(), ms);
}
