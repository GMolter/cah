// UI_BUILD 2025-09-01T06:15Z

export class UI {
  constructor(store, handlers){
    this.store = store;
    this.handlers = handlers;
    this.$ = s => document.querySelector(s);

    this.$roundBlack = this.$("#round-black");
    this.$roundMeta  = this.$("#round-meta");
    this.$startWrap  = this.$("#start-controls");
    this.$startBtn   = this.$("#start-round");

    this.$players    = this.$("#players");
    this.$hand       = this.$("#hand");
    this.$subs       = this.$("#submissions");
    this.$chatLog    = this.$("#chat-log");
    this.$roomCode   = this.$("#room-code");

    this.$startBtn.addEventListener("click", ()=> this.handlers.onStartRound?.());

    this.unsub = store.subscribe((s)=> this.render(s));
  }

  render(s){
    // header / room code
    const code = localStorage.getItem("cadh-room") || "—";
    if (this.$roomCode) this.$roomCode.textContent = code;

    // players
    this.$players.innerHTML = "";
    const ids = Object.keys(s.players||{});
    ids.sort();
    ids.forEach(uid=>{
      const p = s.players[uid];
      const el = document.createElement("div");
      el.className = "player" + (uid===this.handlers.meId ? " me":"");
      el.innerHTML = `
        <div><strong>${escapeHtml(p.name||"Player")}</strong></div>
        <div class="muted small">Score: ${p.score||0}${p.submitted ? " • submitted": ""}</div>
      `;
      this.$players.appendChild(el);
    });

    // hand
    this.$hand.innerHTML = "";
    const myHand = (s.hands||{})[this.handlers.meId] || {};
    Object.values(myHand).forEach(card=>{
      const el = document.createElement("div");
      el.className = "card";
      el.textContent = card.text;
      el.addEventListener("click", ()=>{
        if (s.round?.judgeUid === this.handlers.meId) return; // judge cannot play
        this.handlers.onPlayCard?.(card.id);
      });
      this.$hand.appendChild(el);
    });

    // round
    if (s.round?.black?.text) {
      this.$roundBlack.textContent = s.round.black.text;
    } else {
      this.$roundBlack.textContent = s.hostUid ? "Waiting for round…" : "Waiting for host…";
    }
    const judgeName = s.round?.judgeUid && s.players[s.round.judgeUid]?.name;
    const deadline  = s.round?.deadline ? new Date(s.round.deadline).toLocaleTimeString() : "—";
    this.$roundMeta.innerHTML = `
      <span class="muted">Judge:</span> ${escapeHtml(judgeName || "—")}
      &nbsp;&nbsp; <span class="muted">Ends:</span> ${deadline}
    `;

    // start button (host only, ≥3 players, not started or ready for next)
    const amHost = !!(s.hostUid && s.hostUid === this.handlers.meId);
    const playerCount = Object.keys(s.players||{}).length;
    const canSeeStart = amHost && playerCount >= 3;
    this.$startWrap.classList.toggle("hidden", !canSeeStart);

    // submissions (only visible to host for picking)
    this.$subs.innerHTML = "";
    const subs = s.submissions || [];
    subs.forEach(sub=>{
      const el = document.createElement("div");
      el.className = "submission";
      el.innerHTML = `
        <div>${escapeHtml(sub.card?.text || "")}</div>
        <div class="by">by ${escapeHtml(s.players[sub.by]?.name || "Player")}</div>
      `;
      el.addEventListener("click", ()=>{
        if (amHost && s.round?.judgeUid === this.handlers.meId) {
          this.handlers.onJudgePick?.(sub.id);
        }
      });
      this.$subs.appendChild(el);
    });

    // chat
    this.$chatLog.innerHTML = "";
    const chat = s.chat || [];
    chat.forEach(msg=>{
      const row = document.createElement("div");
      row.className = "chat-row";
      row.innerHTML = `<span class="chat-name">${escapeHtml(msg.name||"")}</span>${escapeHtml(msg.text||"")}`;
      this.$chatLog.appendChild(row);
    });
    this.$chatLog.scrollTop = this.$chatLog.scrollHeight;
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
