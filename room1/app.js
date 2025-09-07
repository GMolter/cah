import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update,
  onValue, push, runTransaction, onDisconnect
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

let me = null, hb = null;
let lastRoster = new Set();

/* ===== Auth ===== */
onAuthStateChanged(auth, async (u) => {
  if (!u) { location.href = "../"; return; }
  me = u;
  console.log("[auth] uid:", me.uid);
  try {
    await joinSeatAtomic();
    watchPlayers();
    watchChat();
    startHeartbeat();
  } catch (e) {
    console.error("[init] error:", e);
  }
});

/* ===== Atomic join seat (fixes single-user roster) =====
   1) Peek current player node.
   2) Transactionally set/refresh our seat:
      - If node is null OR stale (>45s), (re)create with new joinedAt.
      - Else only update lastSeen/status.
   3) Increment rooms/$room/count only on true CREATE (null or stale).
*/
async function joinSeatAtomic() {
  const uid = me.uid;
  const prof = (await get(ref(db, `profiles/${uid}`))).val() || {};
  const pRef = ref(db, `rooms/${ROOM}/players/${uid}`);
  const now = Date.now();

  const beforeSnap = await get(pRef);
  const before = beforeSnap.val();
  const wasNull = !before;
  const wasStale = before ? (now - (before.lastSeen || 0) > 45000) : false;

  const nickname = prof.nickname || prof.firstName || "User";
  const photoURL = prof.photoURL || "../assets/default-avatar.png";

  await runTransaction(pRef, (cur) => {
    if (!cur || (now - (cur.lastSeen || 0) > 45000)) {
      // create (fresh seat)
      return { nickname, photoURL, joinedAt: now, lastSeen: now, status: "online" };
    } else {
      // refresh only
      return { ...cur, lastSeen: now, status: "online" };
    }
  });

  if (wasNull || wasStale) {
    await runTransaction(ref(db, `rooms/${ROOM}/count`), (c) => (c || 0) + 1);
    toast(`${nickname} joined the room`, 4000);
  } else {
    toast(`${nickname} reconnected`, 3000);
  }

  onDisconnect(pRef).update({ status: "offline", lastSeen: Date.now() });
}

/* ===== Leave (no sign-out) ===== */
$("#leaveBtn").onclick = async () => {
  if (!me) return;
  const uid = me.uid, pRef = ref(db, `rooms/${ROOM}/players/${uid}`);
  try {
    await runTransaction(ref(db, `rooms/${ROOM}/count`), (c) => Math.max((c || 1) - 1, 0));
    await set(pRef, null);
    toast("You left the room", 3000);
  } catch (e) { console.error("[leave] error", e); }
  location.href = "../";
};

/* ===== Heartbeat ===== */
function startHeartbeat() {
  clearInterval(hb);
  hb = setInterval(() => {
    if (me) {
      update(ref(db, `rooms/${ROOM}/players/${me.uid}`), { lastSeen: Date.now(), status: "online" })
        .catch(() => {});
    }
  }, 15000);
}

/* ===== Scoreboard + transient toasts ===== */
function watchPlayers() {
  const playersRef = ref(db, `rooms/${ROOM}/players`);
  onValue(playersRef, (snap) => {
    const entries = [];
    snap.forEach((ch) => entries.push({ id: ch.key, ...ch.val() }));
    entries.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

    $("#playerCount").textContent = entries.length;

    const seen = new Set();
    $("#playerList").innerHTML = entries.map(p => {
      const base = p.nickname || "User", k = base.toLowerCase();
      const name = seen.has(k) ? `${base}*` : (seen.add(k), base);
      const avatar = p.photoURL || "../assets/default-avatar.png";
      return `<li><img src="${avatar}" alt=""><span>${name}</span></li>`;
    }).join("");

    // local-only join/leave toasts
    const current = new Set(entries.map(e => e.id));
    for (const id of current) if (!lastRoster.has(id)) toast(`${nameForId(id, entries)} joined`, 3000);
    for (const id of lastRoster) if (!current.has(id)) toast(`${nameForId(id, entries, "User")} left`, 3000);
    lastRoster = current;

    console.log("[players] total:", entries.length, "ids:", entries.map(e => e.id));
  }, err => console.error("[players] watch error", err));
}

function nameForId(id, list, fallback = "User") {
  const f = list?.find(e => e.id === id);
  return f?.nickname || fallback;
}

/* ===== Chat (only real messages go to DB) ===== */
$("#chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#chatInput").value.trim();
  if (!text) return;
  const prof = (await get(ref(db, `profiles/${me.uid}`))).val() || {};
  try {
    await push(ref(db, `rooms/${ROOM}/chat`), {
      uid: me.uid, nickname: prof.nickname || prof.firstName || "User",
      text, type: "message", ts: Date.now()
    });
    $("#chatInput").value = "";
  } catch (err) { console.error("[chat] push error", err); }
};

function watchChat() {
  onValue(ref(db, `rooms/${ROOM}/chat`), (snap) => {
    const log = $("#chatLog"); log.innerHTML = "";
    snap.forEach(s => {
      const m = s.val(), div = document.createElement("div");
      div.className = "chat-msg " + (m.uid === me.uid ? "self" : "other");
      div.textContent = `${m.nickname}: ${m.text}`;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  }, err => console.error("[chat] watch error", err));
}

/* ===== Transient toasts ===== */
function toast(text, ms = 5000) {
  const wrap = $("#toasts");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
