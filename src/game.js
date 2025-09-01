import { createStore } from "./tiny-store.js";

const ROUND_SECONDS = 60;

const sampleBlack = [
  "In the beginning, there was _____.",
  "What did I bring back from Mexico?",
  "______: kid-tested, mother-approved.",
  "The secret ingredient is _____.",
  "My superpower? _____."
];

const sampleWhite = [
  "Spaghetti","A big explosion","A cute puppy","Science","Aliens","Cheese",
  "My collection of rocks","An oversized lollipop","A cartoon camel enjoying a popsicle",
  "A very good boy","Casey the Dog","Glitter","A mysterious briefcase","Unlimited breadsticks",
  "An awkward silence","Jazz hands","Grandma's laptop","The last slice","Free samples"
];

const id  = () => Math.random().toString(36).slice(2,10);
const now = () => Date.now();

function makeDeck(list){
  const cards = [...list].map((t,i)=>({ id:`c${i}-${id()}`, text:t }));
  const draw = () => cards.splice(Math.floor(Math.random()*cards.length),1)[0];
  const size = () => cards.length;
  return { draw, size };
}

export function createGameStore(transport){
  // Deck helpers live OUTSIDE state (no functions in state)
  const deckBlack = makeDeck(sampleBlack);
  const deckWhite = makeDeck(sampleWhite);

  const store = createStore({
    meta:{ room:"", hostId:null, heartbeat:0, seed:Math.random() },
    players:{},
    chat:[],
    round:{ num:0, judgeId:null, black:null, deadline:0, submissions:[], pickedId:null }
  });

  const net = (type, payload) => transport.send({ type, payload });

  let isHost = false;
  let myId = null;

  setInterval(() => {
    const s = store.get();
    if(isHost){
      store.patch({ meta:{ ...s.meta, heartbeat: now(), hostId: myId }});
      net("heartbeat", { hostId: myId, t: now() });
    }else if(now() - s.meta.heartbeat > 2500){
      isHost = true;
      store.patch({ meta:{ ...s.meta, hostId: myId, heartbeat: now() }});
      startRoundIfNeeded();
    }
    if(isHost && s.round.deadline && now() > s.round.deadline){
      finalizeRoundAuto();
    }
  }, 800);

  const actions = {
    ingestNetwork(msg){
      const { type, payload } = msg;
      const s = store.get();

      if(type === "hello"){
        const p = payload;
        const existing = s.players[p.id];
        const players = { ...s.players,
          [p.id]: { id:p.id, name:p.name, score: existing?.score || 0, submitted:false, connected:true, hand: existing?.hand || [] }
        };
        store.patch({ players });
        if(isHost){
          ensureHand(p.id, players[p.id]);
          broadcastState();
        }
      }

      if(type === "rename"){
        if(s.players[payload.id]){
          s.players[payload.id].name = payload.name;
          store.patch({ players: { ...s.players }});
        }
      }

      if(type === "heartbeat"){
        if(!isHost){
          store.patch({ meta:{ ...s.meta, hostId: payload.hostId, heartbeat: payload.t }});
        }
      }

      if(type === "chat"){
        s.chat.push(payload);
        store.patch({ chat: [...s.chat] });
      }

      if(type === "play"){
        if(isHost && s.round.judgeId !== payload.by && !s.round.submissions.find(x=>x.by===payload.by)){
          const card = removeCardFromHand(payload.by, payload.cardId);
          if(card){
            s.round.submissions.push({ id:id(), by:payload.by, card, revealed:true });
            s.players[payload.by].submitted = true;
            store.patch({ round:{ ...s.round }, players:{ ...s.players }});
            broadcastState();
          }
        }
      }

      if(type === "judge-pick"){
        if(isHost && s.round.judgeId === payload.judgeId){
          pickWinner(payload.submissionId);
        }
      }

      if(type === "state"){
        if(!isHost) store.replace(payload.state); // pure JSON only
      }
    },

    join(player, forceCreate=false){
      myId = player.id;
      net("hello", player);
      const s = store.get();
      if(!s.meta.hostId || forceCreate){
        isHost = true;
        store.patch({ meta:{ ...s.meta, hostId: myId, heartbeat: now() }});
        startRoundIfNeeded();
      }
    },

    rename(id, name){ net("rename", { id, name }); },
    postChat(me, text){ net("chat", { id:id(), actorName: me.name, text, ts: now() }); },
    playCard(playerId, cardId){ net("play", { by:playerId, cardId }); },
    judgePick(judgeId, submissionId){ net("judge-pick", { judgeId, submissionId }); }
  };

  function ensureHand(pid, player){
    while(player.hand.length < 7 && deckWhite.size() > 0){
      player.hand.push(deckWhite.draw());
    }
  }

  function dealAll(){
    const s = store.get();
    Object.values(s.players).forEach(p => ensureHand(p.id, p));
    store.patch({ players: { ...s.players }});
  }

  function removeCardFromHand(pid, cardId){
    const s = store.get();
    const p = s.players[pid]; if(!p) return null;
    const idx = p.hand.findIndex(c=> c.id===cardId);
    if(idx>=0) return p.hand.splice(idx,1)[0];
    return null;
  }

  function startRoundIfNeeded(){
    const s = store.get();
    if(s.round.deadline > now()) return;
    const judgeId = rotateJudge();
    const black = deckBlack.draw();
    Object.values(s.players).forEach(p => p.submitted=false);
    const deadline = now() + ROUND_SECONDS*1000;
    store.patch({ round:{ num:s.round.num+1, judgeId, black, submissions:[], deadline, pickedId:null }, players:{...s.players}});
    dealAll();
    broadcastState();
  }

  function rotateJudge(){
    const ids = Object.keys(store.get().players).sort();
    if(!ids.length) return null;
    const current = store.get().round.judgeId ? ids.indexOf(store.get().round.judgeId) : -1;
    return ids[(current+1) % ids.length];
  }

  function pickWinner(submissionId){
    const s = store.get();
    const sub = s.round.submissions.find(x=> x.id===submissionId);
    if(!sub) return;
    const winner = s.players[sub.by];
    winner.score = (winner.score||0)+1;
    s.round.pickedId = submissionId;
    store.patch({ players:{...s.players}, round:{...s.round}});
    broadcastState();
    setTimeout(()=>{ ensureHand(sub.by, winner); startRoundIfNeeded(); }, 2000);
  }

  function finalizeRoundAuto(){
    const s = store.get();
    if(s.round.submissions.length && !s.round.pickedId){
      const pick = s.round.submissions[Math.floor(Math.random()*s.round.submissions.length)];
      pickWinner(pick.id);
    }else{
      startRoundIfNeeded();
    }
  }

  function broadcastState(){ net("state", { state: store.get() }); }

  return { get: store.get, subscribe: store.subscribe, actions };
}
