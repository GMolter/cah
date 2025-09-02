/* UI_BUILD */ console.log("UI_BUILD", new Date().toISOString());

export function qs(sel){ return document.querySelector(sel); }
export function el(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

export function showJoinModal(show){
  qs("#join-modal").style.display = show? "flex":"none";
}

export function renderPlayers(players){
  const box=qs("#players"); box.innerHTML="";
  for(const [uid,p] of Object.entries(players||{})){
    const row=el("div","player-row");
    const dot=el("div","dot "+(p.connected?"online":""));
    const nm=el("span","nm"); nm.textContent=p.name;
    const sc=el("span","score"); sc.textContent=p.score||0;
    row.append(dot,nm,sc); box.append(row);
  }
}

export function renderChat(log){
  const box=qs("#chat-log"); box.innerHTML="";
  for(const m of log){
    const div=el("div","chat-line");
    const nm=el("span","name"); nm.textContent=m.name+":";
    const tx=el("span","txt"); tx.textContent=" "+m.text;
    div.append(nm,tx); box.append(div);
  }
  box.scrollTop=box.scrollHeight;
}

export function renderBlack(card){
  qs("#black-card").textContent= card? card.text:"—";
}

export function renderHand(cards,onPick){
  const box=qs("#hand"); box.innerHTML="";
  cards.forEach(c=>{
    const cc=el("div","card choice"); cc.textContent=c.text;
    cc.onclick=()=> onPick(c);
    box.append(cc);
  });
}

export function renderSubmissions(subs,judge,onPick){
  const box=qs("#submissions"); box.innerHTML="";
  subs.forEach(s=>{
    const cc=el("div","card judge"); cc.textContent=s.card.text;
    if(judge) cc.onclick=()=> onPick(s);
    box.append(cc);
  });
}
