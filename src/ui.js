// UI_BUILD 2025-09-01T07:25Z

/** Show the join modal and wire its button. */
export function showJoinModal(preset, onJoin) {
  const modal = document.getElementById("join-modal");
  const nameInput = document.getElementById("name-input");
  const roomInput = document.getElementById("room-input");
  const btn = document.getElementById("join-btn");

  nameInput.value = (preset?.name || "");
  roomInput.value = (preset?.code || "");

  const tryJoin = () => {
    const name = nameInput.value.trim();
    const code = roomInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (!/^\d{4}$/.test(code)) { alert("Room code must be 4 digits"); roomInput.focus(); return; }
    onJoin({ name, code });
  };

  btn.onclick = tryJoin;
  roomInput.onkeydown = (e)=> { if(e.key === "Enter") tryJoin(); };
  nameInput.onkeydown = (e)=> { if(e.key === "Enter") tryJoin(); };

  modal.style.display = "grid";
}
export function hideJoinModal() {
  const modal = document.getElementById("join-modal");
  modal.style.display = "none";
}

/** Render the whole app */
export function renderGameUI(model) {
  const app = document.getElementById("app");
  const roomBadge = document.getElementById("room-badge");
  if (!model) {
    app.innerHTML = `<div class="panel"><header><strong>Loading…</strong></header><div class="body">Please wait</div></div>`;
    return;
  }
  roomBadge.textContent = `Room ${model.code}`;
  roomBadge.style.display = "block";

  const players = Object.values(model.players || {});
  const chat = model.chat || [];
  const hostUid = model.hostUid || null;
  const amHost = model.me?.uid && hostUid && model.me.uid === hostUid;

  app.innerHTML = `
    <section class="panel">
      <header>
        <strong>Players</strong>
        <div>${players.length} joined</div>
      </header>
      <div class="body players">
        <ul>
          ${players.map(p => `
            <li>
              <span>${escapeHtml(p.name)}</span>
              <span>${Number(p.score||0)}</span>
            </li>
          `).join("")}
        </ul>
        ${amHost ? `
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
            <button id="start-round" class="btn-primary">Start Round</button>
            <span style="color:#aaa;font-size:13px;">(Need 3+ players)</span>
          </div>
        ` : `
          <p style="margin-top:12px;color:#aaa;">Waiting for host to start…</p>
        `}
      </div>
    </section>

    <section class="panel">
      <header><strong>Room Chat</strong></header>
      <div class="body">
        <div id="chat-box" class="chat-box">
          ${chat.map(m => `
            <div class="chat-item">
              <span class="name">${escapeHtml(m.name)}</span>
              <span class="text">${escapeHtml(m.text)}</span>
            </div>
          `).join("")}
        </div>
        <div class="chat-input">
          <input id="chat-input" placeholder="Type message…" maxlength="500">
          <button id="chat-send" class="btn">Send</button>
        </div>
      </div>
    </section>
  `;

  // Scroll chat to bottom on render
  const box = document.getElementById("chat-box");
  if (box) box.scrollTop = box.scrollHeight;

  // Wire buttons (overwrite handlers each render so no duplicates)
  const startBtn = document.getElementById("start-round");
  if (startBtn) startBtn.onclick = () => model.onStartRound && model.onStartRound();

  const sendBtn = document.getElementById("chat-send");
  const input = document.getElementById("chat-input");
  if (sendBtn && input) {
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      model.onSendChat && model.onSendChat(text);
      input.value = "";
      input.focus();
    };
    sendBtn.onclick = send;
    input.onkeydown = (e)=> { if(e.key === "Enter") send(); };
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
