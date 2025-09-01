export class UI{
  constructor(store, { meId, onPlayCard, onJudgePick }){
    this.store = store;
    this.meId = meId;
    this.onPlayCard = onPlayCard;
    this.onJudgePick = onJudgePick;

    this.$ = (sel)=> document.querySelector(sel);
    this.root = this.$("#app");

    this.unsub = store.subscribe( s => this.render(s) );
    this.render(store.get());

    // timer tick
    this.timerInterval = setInterval(()=> this.renderTimer(this.store.get()), 250);
  }

  destroy(){
    if(this.unsub) this.unsub();
    clearInterval(this.timerInterval);
  }

  /* ---------- Renderers ---------- */
  render(state){
    this.renderPlayers(state);
    this.renderChat(state);
    this.renderBlackCard(state);
    this.renderSubmissions(state);
    this.renderHand(state);
    this.renderTimer(state);
  }

  renderPlayers(s){
    const list = this.$("#players-list");
    const board = this.$("#scoreboard");
    list.innerHTML = "";
    board.innerHTML = "";

    const ids = Object.keys(s.players);
    ids.sort();
    ids.forEach(pid=>{
      const p = s.players[pid];
      const li = document.createElement("li");
      if(pid===s.round.judgeId) li.classList.add("pulse");
      if(pid===this.meId) li.classList.add("me");

      const left = document.createElement("div");
      left.textContent = p.name;
      const right = document.createElement("div");
      const badge = document.createElement("span");
      badge.className = "badge " + (pid===s.round.judgeId ? "judge" : p.submitted ? "ok" : "wait");
      badge.textContent = pid===s.round.judgeId ? "Judge" : p.submitted ? "✓" : "…";
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
    if(s.chat.length === this._chatLen) return;
    const frag = document.createDocumentFragment();
    for(let i=this._chatLen; i<s.chat.length; i++){
      const m = s.chat[i];
      const el = document.createElement("div");
      el.className = "chat-msg fade-in";
      el.innerHTML = `<span class="chat-actor">${m.actorName}:</span> ${escapeHTML(m.text)}`;
      frag.appendChild(el);
    }
    log.appendChild(frag);
    log.scrollTop = log.scrollHeight;
    this._chatLen = s.chat.length;
  }

  renderBlackCard(s){
    const b = this.$("#black-text");
    const jc = this.$("#judge-stack");
    b.textContent = s.round.black ? s.round.black.text : "Waiting for round…";
    if(s.round.judgeId){
      jc.title = `Judge: ${s.players[s.round.judgeId]?.name || "—"}`;
    }
  }

  renderSubmissions(s){
    const area = this.$("#submissions");
    area.innerHTML = "";

    const isJudge = this.meId === s.round.judgeId;

    s.round.submissions.forEach(sub=>{
      const card = elCard(sub.card.text);
      card.classList.add("slide-up");
      if(isJudge && !s.round.pickedId) {
        card.addEventListener("click", ()=> this.onJudgePick(sub.id));
      }else{
        card.classList.add("disabled");
      }
      if(s.round.pickedId === sub.id){
        card.style.outline = "4px solid var(--good)";
        card.style.outlineOffset = "4px";
      }
      area.appendChild(card);
    });
  }

  renderHand(s){
    const me = s.players[this.meId];
    const hand = this.$("#hand");
    hand.innerHTML = "";

    // Judge can't submit
    const canPlay = s.round.judgeId !== this.meId && !me?.submitted;

    me?.hand?.forEach(c=>{
      const card = elCard(c.text);
      card.classList.add("flip-in");
      if(canPlay){
        card.addEventListener("click", ()=>{
          card.classList.add("selected");
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
    const left = Math.max(0, Math.floor((s.round.deadline - Date.now())/1000));
    const dash = (left / 60) * 100;
    const num = this.$("#timer-number");
    const fg = this.$("#timer-fg");
    num.textContent = s.round.deadline ? `${left}s` : "—";
    fg.setAttribute("stroke-dasharray", `${dash},100`);
  }
}

/* ---------- helpers ---------- */
function elCard(text){
  const el = document.createElement("div");
  el.className = "card";
  el.textContent = text;
  return el;
}
function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
