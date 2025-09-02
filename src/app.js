// APP_JS_BUILD 2025-09-01T07:25Z
import { authReady, db, ref, child, get, set, onValue, onDisconnect, push } from "./firebase.js";
import { save, load, drop } from "./tiny-store.js";
import { randomBlack } from "./game.js";
import { showJoinModal, hideJoinModal, renderGameUI } from "./ui.js";

console.log("APP_JS_BUILD", new Date().toISOString());

/** Local reactive-ish state */
const S = {
  me: null,               // { uid, name }
  code: null,             // 4-digit code
  hostUid: null,          // read from RTDB
  players: {},            // map uid -> player info
  chat: [],               // array of messages
  unsubs: []              // unsubscribe functions
};

/** Boot flow */
(async function boot(){
  const user = await authReady; // ensure auth ready (anonymous ok)
  console.log("[boot] App loaded; waiting for user to join…");

  // Prefill modal from saved session
  const saved = load("session", null); // {code, name}
  const preset = {
    name: saved?.name || `Player-${Math.floor(Math.random()*90+10)}`,
    code: saved?.code || ""
  };
  showJoinModal(preset, ({name, code}) => {
    joinRoom({ name, code }).catch(e => {
      alert("Join failed: " + (e?.message || e));
      console.error(e);
    });
  });
})();

/** Join a room: requires the room to already exist */
async function joinRoom({ name, code }){
  const user = await authReady;

  // Validate 4-digit numeric, and room existence (we do NOT create rooms here)
  if (!/^\d{4}$/.test(code)) throw new Error("Room code must be 4 digits.");
  const roomRef = ref(db, `rooms/${code}`);
  const exists = (await get(roomRef)).exists();
  if (!exists) throw new Error(`Room ${code} does not exist.`);

  // Write/Upsert my player record
  const playerRef = ref(db, `rooms/${code}/players/${user.uid}`);
  await set(playerRef, {
    name,
    joinedAt: Date.now(),
    connected: true,
    score: 0,
    submitted: false
  });

  // Presence
  const presenceRef = ref(db, `rooms/${code}/presence/${user.uid}`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);

  // Update local state + persist session (to survive refresh)
  S.me = { uid: user.uid, name };
  S.code = code;
  save("session", { code, name });

  // Bind subscriptions once per join
  bindRoomSubscriptions(code);

  hideJoinModal();
  render();
}

/** Clear previous listeners then subscribe to room data */
function bindRoomSubscriptions(code){
  // Detach old
  S.unsubs.forEach(unsub => { try{unsub();}catch{} });
  S.unsubs = [];

  const sub = (path, handler) => {
    const r = ref(db, path);
    const off = onValue(r, handler, (err)=> console.error("[listen] error", path, err));
    S.unsubs.push(off);
  };

  // hostUid
  sub(`rooms/${code}/hostUid`, (snap) => {
    S.hostUid = snap.val() || null;
    render();
  });

  // players
  sub(`rooms/${code}/players`, (snap) => {
    S.players = snap.val() || {};
    render();
  });

  // chat (ordered by push order; we just read values)
  sub(`rooms/${code}/chat`, (snap) => {
    const items = [];
    snap.forEach(ch => items.push(ch.val()));
    items.sort((a,b)=> (a.ts||0)-(b.ts||0));
    S.chat = items;
    render();
  });
}

/** Render UI */
function render(){
  const amHost = S.me?.uid && S.hostUid && S.me.uid === S.hostUid;
  renderGameUI({
    code: S.code,
    me: S.me,
    players: S.players,
    chat: S.chat,
    hostUid: S.hostUid,
    onSendChat: sendChat,
    onStartRound: amHost ? hostStartRound : null
  });
}

/** Chat send (no duplicates: handler overwritten each render) */
async function sendChat(text){
  if (!S.code || !S.me) return;
  const msgRef = push(ref(db, `rooms/${S.code}/chat`));
  await set(msgRef, {
    from: S.me.uid,
    name: S.me.name,
    text,
    ts: Date.now()
  });
}

/** Minimal start round write (host only; dealing is server/rules dependent) */
async function hostStartRound(){
  if (!S.code || !S.me || S.me.uid !== S.hostUid) return;
  const ids = Object.keys(S.players || {});
  if (ids.length < 3) { alert("Need at least 3 players to start."); return; }

  const judgeUid = ids[Math.floor(Math.random()*ids.length)];
  const black = randomBlack();

  await set(ref(db, `rooms/${S.code}/round`), {
    number: 1,
    judgeUid,
    black,
    deadline: Date.now() + 60_000,
    pickedSubmissionId: null
  });

  await set(ref(db, `rooms/${S.code}/started`), true);
}
