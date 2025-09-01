export class UI{
  constructor(store, { meId, onPlayCard, onJudgePick, onStartRound }){
    this.store = store;
    this.meId = meId;
    this.onPlayCard = onPlayCard;
    this.onJudgePick = onJudgePick;
    this.onStartRound = onStartRound;

    this.$ = (sel)=> document.querySelector(sel);
    this.unsub = store.subscribe( s => this.render(s) );
    this.timerInterval = setInterval(()=> this.renderTimer(this.store.get()), 250);

    // Start button (host only; no longer in topbar, but we leave handler)
    const startBtn = this.$("#start-btn");
    if (startBtn) startBtn.addEventListener("click", ()=> this.onStartRound());

    this.render(store.get());
  }

  destroy(){
    if(this.unsub) this.unsub();
    clearInterval(this.timerInterval);
  }

  render(s){
    this.renderPlayers(s);
    this.renderChat(s);
    this.renderBlackCard(s);
    this.renderSubmissions(s);
    this.renderHand(s);
    this.renderTimer(s);
    this.renderBannerAndStart(s);
  }

  renderBannerAndStart(s){
    const banner = this.$("#banner");
    const playerCount = Object.keys(s.players||{}).length;
    const isHost = s.hostUid && s.hostUid === this.meId;
    const gameStarted = !!s.started;

    const need = Math.max(0, 3 - playerCount);
    if (!gameStarted && playerCount < 3){
      banner.hidden = false;
      banner.textContent = `Waiting for players — need ${need} more to start (min 3).`;
    } else if (isHost && !gameStarted){
      banner.hidden = false;
      banner.textContent = `Ready to start — click “Start Round” (host only).`;
    } else {
      banner.hidden = true;
      banner.textContent = "";
    }
  }

  renderPlayers(s){
    const list = this.$("#players-list");
    const board = this.$("#scoreboard");
    list.innerHTML = "";
    board.innerHTML = "";

    const ids = Object.keys(s.players||{}).sort((a,b)=>{
      const ja = s.players[a].joinedAt || 0;
      const jb = s.players[b].joinedAt || 0;
      if (ja !== jb) return ja - jb;
      return a.localeCompare(b);
    });

    ids.forEach(pid=>{
      const p = s.players[pid];
      const li = document.createElement("li");
      if(pid===s.round?.judgeUid) li.classList.add("pulse");
      if(pid===this.meId) li.classList.add("me");

      const left = document.createElement("div");
      left.textContent = p.name;
      const right = document.createElement("div");
      const badge = document.createElement("span");
      badge.className = "badge " + (pid===s.round?.judgeUid ? "judge" : p.submitted ? "ok" : "wait");
      badge.textContent = pid===s.round?.judgeUid ? "Judge" : p.submitted ? "✓" : "…";
      right.appendChild(badge);

      li.appendChild(left); li.appendChild(right);
      list.appendChild(li);

      const sb = document.createElement("li");
      sb.innerHTML = `<div>${p.name}</div><div>${p.score||0}</div>`;
      board.appendChild(sb);
    });
  }

  renderChat(s){
    const log = this.$("#chat-log");
    if(!this._chatLen) this._chatLen = 0;
    const msgs = s.chat || [];
    if(msgs.length === this._chatLen) return;
    const frag = document.createDocumentFragment();
    for(let i=this._chatLen; i<msgs.length; i++){
      const m = msgs[i];
      const el = document.createElement("div");
      el.className = "chat-msg fade-in";
      el.innerHTML = `<span class="chat-actor">${m.name}:</span> ${escapeHTML(m.text)}`;
      frag.appendChild(el);
    }
    log.appendChild(frag);
    log.scrollTop = log.scrollHeight;
    this._chatLen = msgs.length;
  }

  renderBlackCard(s){
    const text = this.$("#black-text");
    const jc = this.$("#judge-stack");
    text.textContent = s.round?.black ? s.round.black.text : "Waiting for round…";
    if(s.round?.judgeUid){
      jc.title = `Judge: ${s.players?.[s.round.judgeUid]?.name || "—"}`;
    }
  }

  renderSubmissions(s){
    const area = this.$("#submissions");
    area.innerHTML = "";

    const isJudge = this.meId === s.round?.judgeUid;

    (s.submissions || []).forEach(sub=>{
      const card = elCard(sub.card.text);
      card.classList.add("slide-up");
      if(isJudge && !s.round?.pickedSubmissionId) {
        card.addEventListener("click", ()=> this.onJudgePick(sub.id));
      }else{
        card.classList.add("disabled");
      }
      if(s.round?.pickedSubmissionId === sub.id){
        card.style.outline = "4px solid var(--good)";
        card.style.outlineOffset = "4px";
      }
      area.appendChild(card);
    });
  }

  renderHand(s){
    const me = s.players?.[this.meId];
    const hand = this.$("#hand");
    hand.innerHTML = "";

    const canPlay = s.round?.judgeUid !== this.meId && !me?.submitted && s.started;

    (s.hands?.[this.meId] ? Object.values(s.hands[this.meId]) : []).forEach(c=>{
      const card = elCard(c.text);
      card.classList.add("flip-in");
      if(canPlay){
        card.addEventListener("click", ()=>{
          card.classList.add("selected");
          // onPlayCard is provided by app.js
          this.onPlayCard(c.id);
          setTimeout(()=> card.classList.add("disabled"), 50);
        });
      }else{
        card.classList.add("disabled");
      }
      hand.appendChild(card);
    });
  }

  renderTimer(s){
    const left = Math.max(0, Math.floor(((s.round?.deadline || 0) - Date.now())/1000));
    const dash = (left / 60) * 100;
    const num = this.$("#timer-number");
    const fg = this.$("#timer-fg");
    num.textContent = s.round?.deadline ? `${left}s` : "—";
    fg.setAttribute("stroke-dasharray", `${dash},100`);
  }
}

/* helpers */
function elCard(text){
  const el = document.createElement("div");
  el.className = "card";
  el.textContent = text;
  return el;
}
function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
