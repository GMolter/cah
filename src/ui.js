// ui.js
export const UI_BUILD = "UI_BUILD 2025-09-01T06:05Z";

/**
 * Very small UI binder that reacts to store changes and props.
 */
export class UI {
  constructor(store, { meId, onPlayCard, onJudgePick, onStartRound }){
    this.store = store;
    this.meId = meId;
    this.onPlayCard = onPlayCard;
    this.onJudgePick = onJudgePick;
    this.onStartRound = onStartRound;

    this.$roomPill = document.querySelector("#room-pill");
    this.$black = document.querySelector("#black-card .card-text");
    this.$timer = document.querySelector("#round-timer");
    this.$hand = document.querySelector("#hand-cards");
    this.$subs = document.querySelector("#submissions");
    this.$start = document.querySelector("#start-btn");
    this.$status = document.querySelector("#status");
    this.$chatLog = document.querySelector("#chat-log");

    // start button action (bound once)
    this.$start.addEventListener("click", ()=> this.onStartRound?.());

    store.subscribe((s)=> this.render(s));
  }

  render(s){
    // Room pill
    const code = localStorage.getItem("cadh-room") || "";
    this.$roomPill.textContent = code ? `Room: ${code}` : "Not in room";

    // Black card
    const black = s.round?.black?.text || "Waiting to start…";
    this.$black.textContent = black;

    // Start button visibility
    const isHost = s.hostUid && s.hostUid === this.meId;
    const playerCount = Object.keys(s.players||{}).length;
    const canStart = isHost && playerCount >= 3 && !s.started;
    this.$start.style.display = canStart ? "inline-block" : "none";

    // Status
    this.$status.textContent =
      isHost
        ? (playerCount < 3 ? `Waiting for ${3-playerCount} more player(s)…` : (s.started ? "Round in progress" : "Ready to start"))
        : (s.started ? "Round in progress" : "Waiting for host…");

    // Hand
    const myHand = Object.values((s.hands||{})[this.meId] || {});
    this.$hand.innerHTML = "";
    for (const c of myHand){
      const el = document.createElement("div");
      el.className = "card whitecard";
      el.innerHTML = `<div class="card-text">${escapeHTML(c.text)}</div>`;
      el.addEventListener("click", ()=> this.onPlayCard?.(c.id));
      this.$hand.appendChild(el);
    }

    // Submissions
    this.$subs.innerHTML = "";
    const isJudge = s.round?.judgeUid === this.meId;
    for (const sub of s.submissions){
      const el = document.createElement("div");
      el.className = "card whitecard";
      el.innerHTML = `<div class="card-text">${escapeHTML(sub.card?.text||"")}</div>`;
      if (isJudge && !s.round?.pickedSubmissionId){
        el.style.outline = "2px solid transparent";
        el.style.cursor = "pointer";
        el.addEventListener("click", ()=> this.onJudgePick?.(sub.id));
        el.addEventListener("mouseenter", ()=> el.style.outline = "2px solid var(--accent)");
        el.addEventListener("mouseleave", ()=> el.style.outline = "2px solid transparent");
      }
      this.$subs.appendChild(el);
    }

    // Chat
    this.$chatLog.innerHTML = "";
    for (const m of s.chat){
      const row = document.createElement("div");
      row.className = "chat-item";
      row.innerHTML = `<span class="name">${escapeHTML(m.name||"")}</span><span class="text">${escapeHTML(m.text||"")}</span>`;
      this.$chatLog.appendChild(row);
    }
    this.$chatLog.scrollTop = this.$chatLog.scrollHeight;
  }
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

console.log(UI_BUILD);
