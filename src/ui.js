// UI_BUILD 2025-09-01T06:05Z
console.log("UI_BUILD 2025-09-01T06:05Z");

export class UI {
  constructor(store, actions){
    this.store = store;
    this.actions = actions;
    this.$ = (s)=> document.querySelector(s);

    // cache
    this.el = {
      modal: this.$("#join-modal"),
      start: this.$("#start-round"),
      roundStatus: this.$("#round-status"),
      youAre: this.$("#you-are"),
      blackText: this.$("#black-text"),
      timer: this.$("#timer"),
      hand: this.$("#hand"),
      subs: this.$("#submissions"),
      players: this.$("#player-list"),
      scores: this.$("#scoreboard"),
      chatList: this.$("#chat-list"),
    };

    // start button
    if (this.el.start){
      this.el.start.addEventListener("click", ()=> actions.onStartRound && actions.onStartRound());
    }

    // react to state
    store.subscribe((s)=> this.render(s));
  }

  showStartIfHost(s){
    if (!this.el.start) return;
    const isHost = s.hostUid && s.hostUid === this.actions.meId;
    const canStart = isHost && Object.keys(s.players||{}).length >= 3;
    this.el.start.classList.toggle("hidden", !canStart);
  }

  render(s){
    // banner pills
    if (this.el.roundStatus) this.el.roundStatus.textContent = s.started ? "Live" : "Waiting…";
    if (this.el.youAre) {
      const judge = s.round?.judgeUid;
      this.el.youAre.textContent = (judge === this.actions.meId) ? "Judge" : "Player";
    }

    // black card
    if (s.round?.black) this.el.blackText.textContent = s.round.black.text;
    else this.el.blackText.textContent = "(waiting for host)";
    if (s.round?.deadline){
      const left = Math.max(0, Math.floor((s.round.deadline - Date.now())/1000));
      const mm = Math.floor(left/60).toString().padStart(1,"0");
      const ss = (left%60).toString().padStart(2,"0");
      this.el.timer.textContent = `${mm}:${ss}`;
    } else {
      this.el.timer.textContent = "1:00";
    }

    // hand
    if (this.el.hand){
      const myHand = (s.hands||{})[this.actions.meId] || {};
      const cards = Object.values(myHand);
      this.el.hand.innerHTML = cards.map(c=>`
        <div class="white-card" data-card="${c.id}">
          <div class="text">${c.text}</div>
        </div>
      `).join("");
      // click to play
      this.el.hand.querySelectorAll(".white-card").forEach(div=>{
        div.onclick = ()=>{
          const cid = div.getAttribute("data-card");
          this.actions.onPlayCard && this.actions.onPlayCard(cid);
        };
      });
    }

    // submissions (judge view)
    if (this.el.subs){
      const mineIsJudge = s.round?.judgeUid === this.actions.meId;
      const picked = s.round?.pickedSubmissionId || null;
      this.el.subs.innerHTML = (s.submissions||[]).map(sub=>{
        const cls = ["white-card"];
        if (mineIsJudge) cls.push("pickable");
        if (picked === sub.id) cls.push("winner");
        return `<div class="${cls.join(" ")}" data-sub="${sub.id}">
            <div class="text">${sub.card.text}</div>
          </div>`;
      }).join("");
      if (mineIsJudge){
        this.el.subs.querySelectorAll(".white-card.pickable").forEach(div=>{
          div.onclick = ()=> this.actions.onJudgePick && this.actions.onJudgePick(div.getAttribute("data-sub"));
        });
      }
    }

    // players + scores
    if (this.el.players){
      const entries = Object.entries(s.players||{});
      entries.sort((a,b)=> (b[1].score||0)-(a[1].score||0));
      this.el.players.innerHTML = entries.map(([id,p])=>`
        <div class="player">
          <span class="name">${p.name}${(s.round?.judgeUid===id)?" — 👑":""}</span>
          <span class="score">${p.score||0}</span>
        </div>
      `).join("");
      this.el.scores.innerHTML = entries.map(([_,p])=>`
        <div class="row"><span>${p.name}</span><b>${p.score||0}</b></div>
      `).join("");
    }

    this.showStartIfHost(s);
  }
}
