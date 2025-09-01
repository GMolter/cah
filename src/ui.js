// /src/ui.js
export const UI_BUILD = "UI_BUILD 2025-09-01T06:20Z";

export class UI {
  constructor(store, { meId, onPlayCard, onJudgePick, onStartRound }){
    this.store = store;
    this.meId = meId;
    this.onPlayCard = onPlayCard;
    this.onJudgePick = onJudgePick;
    this.onStartRound = onStartRound;

    this.$players     = document.getElementById("players");
    this.$playerCount = document.getElementById("player-count");
    this.$roundPill   = document.getElementById("round-pill");
    this.$rolePill    = document.getElementById("role-pill");
    this.$hostControls= document.getElementById("host-controls");
    this.$startBtn    = document.getElementById("start-btn");
    this.$blackSlot   = document.getElementById("black-slot");
    this.$stage       = document.getElementById("stage");
    this.$roomTag     = document.getElementById("room-tag");
    this.$chatLog     = document.getElementById("chat-log");

    if(this.$startBtn){
      this.$startBtn.addEventListener("click", ()=> this.onStartRound && this.onStartRound());
    }

    this.unsub = store.subscribe((s)=> this.render(s));
  }

  setRoom(code){ if(this.$roomTag) this.$roomTag.textContent = code ? `Room: ${code}` : ""; }

  render(s){
    const me = this.meId;
    const players = s.players || {};
    const pIds = Object.keys(players);
    const iAmHost = s.hostUid && s.hostUid === me;

    // Players list
    if(this.$players){
      this.$players.innerHTML = "";
      pIds.forEach(pid=>{
        const p = players[pid];
        const el = document.createElement("div");
        el.className = "pill" + (pid===me?" me":"");
        el.textContent = `${p.name || "Player"}${p.submitted?" ✓":""}`;
        this.$players.appendChild(el);
      });
    }
    if(this.$playerCount){
      this.$playerCount.textContent = `${pIds.length} joined`;
    }

    // Role
    if(this.$rolePill){
      const role = s.round?.judgeUid === me ? "Judge" : (iAmHost ? "Host" : "Player");
      this.$rolePill.textContent = role;
    }

    // Host controls
    if(this.$hostControls){
      const show = iAmHost && pIds.length >= 3;
      this.$hostControls.style.display = show ? "flex" : "none";
    }

    // Round pill
    if(this.$roundPill){
      const rn = s.round?.number || 0;
      this.$roundPill.textContent = rn ? `Round ${rn}` : "Waiting…";
    }

    // Black card
    if(this.$blackSlot){
      this.$blackSlot.innerHTML = "";
      const black = s.round?.black;
      if(black){
        const b = document.createElement("div");
        b.className = "card black-card";
        b.textContent = black.text;
        this.$blackSlot.appendChild(b);
      }
    }

    // Stage (hand or submissions)
    if(this.$stage){
      this.$stage.innerHTML = "";
      if(s.round?.judgeUid === me){
        // I am judge -> see submissions to pick
        const wrap = document.createElement("div");
        wrap.className = "submissions";
        (s.submissions || []).forEach(sub=>{
          const c = document.createElement("div");
          c.className = "card";
          c.textContent = sub?.card?.text || "(missing)";
          c.addEventListener("click", ()=> this.onJudgePick && this.onJudgePick(sub.id));
          wrap.appendChild(c);
        });
        this.$stage.appendChild(wrap);
      }else{
        // I am player -> show my hand
        const hand = (s.hands && s.hands[this.meId]) || {};
        const wrap = document.createElement("div");
        wrap.className = "hand";
        Object.values(hand).forEach(card=>{
          const c = document.createElement("div");
          c.className = "card";
          c.textContent = card.text;
          c.addEventListener("click", ()=> this.onPlayCard && this.onPlayCard(card.id));
          wrap.appendChild(c);
        });
        this.$stage.appendChild(wrap);
      }
    }

    // Chat log
    if(this.$chatLog){
      this.$chatLog.innerHTML = "";
      (s.chat || []).forEach(m=>{
        const line = document.createElement("div");
        line.className = "msg";
        line.innerHTML = `<span class="name">${m.name || "?"}:</span> ${escapeHtml(m.text||"")}`;
        this.$chatLog.appendChild(line);
      });
      this.$chatLog.scrollTop = this.$chatLog.scrollHeight;
    }
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
