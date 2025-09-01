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

/** helpers */
const id = () => Math.random().toString(36).slice(2,10);
const now = () => Date.now();

function makeDeck(list){
  const cards = [...list].map((t, i)=>({ id:`c${i}-${id()}`, text:t }));
  const draw = () => cards.splice(Math.floor(Math.random()*cards.length),1)[0];
  return { draw, size: ()=> cards.length };
}

export function createGameStore(transport){
  const store = createStore({
    meta:{ room:"", hostId:null, heartbeat:0, seed:Math.random() },
    players:{},      // id -> {id,name,score,connected,submitted,hand:[cards]}
    chat:[],         // {id, actorName, text, ts}
    round:{
      num:0, judgeId:null, black:null, deadline:0,
      submissions:[], // {id, by, card, revealed:false}
      pickedId:null
    },
    deck:{ black:makeDeck(sampleBlack), white:makeDeck(sampleWhite) }
  });

  // network wrapper
  const net = (type, payload) => transport.send({ type, payload });

  // host election via heartbeat:
  let isHost = false;
  let myId = null;

  /** host loop */
  setInterval(() => {
    const s = store.get();
    // If I'm host, send heartbeat
    if(isHost){
      store.patch({ meta:{ ...s.meta, heartbeat: now(), hostId: myId }});
      net("heartbeat", { hostId: myId, t: now() });
    }else{
      // if heartbeat stale, claim host
      if(now() - s.meta.heartbeat > 2500){
        isHost = true;
        store.patch({ meta:{ ...s.meta, hostId: myId, heartbeat: now() }});
        startRoundIfNeeded();
      }
    }
    // handle deadline -> auto-advance
    if(isHost && s.round.deadline && now() > s.round.deadline){
      finalizeRoundAuto();
    }
  }, 800);

  /** actions */
  const actions = {
    ingestNetwork(msg){
      const { type, payload } = msg;
      const s = store.get();

      if(type==="hello"){
        // Add/refresh player
        const p = payload;
        const existing = s.players[p.id];
        const players = { ...s.players,
          [p.id]: { id:p.id, name:p.name, score: existing?.score || 0, submitted:false, connected:true, hand: existing?.hand || [] }
        };
        store.patch({ players });

        // If host, deal missing hands & send state
        if(isHost){
          ensureHand(p.id, players[p.id]);
          broadcastState();
        }
      }

      if(type==="rename"){
        if(s.players[payload.id]){
          s.players[payload.id].name = payload.name;
          store.patch({ players: { ...s.players }});
        }
      }

      if(type==="heartbeat"){
        // update known host
        if(!isHost){
          store.patch({ meta:{ ...s.meta, hostId: payload.hostId, heartbeat: payload.t }});
        }
      }

      if(type==="chat"){
        s.chat.push(payload);
        store.patch({ chat: [...s.chat] });
      }

      if(type==="play"){
        // record submission (host validates)
        if(isHost && s.round.judgeId !== payload.by && !s.round.submissions.find(x=>x.by===payload.by)){
          const card = removeCardFromHand(payload.by, payload.cardId);
          if(card){
            s.round.submissions.push({ id:id(), by:payload.by, card, revealed:false });
            s.players[payload.by].submitted = true;
            store.patch({ round:{ ...s.round }, players:{ ...s.players }});
            broadcastState();
            // Auto reveal flip-in for everyone
            setTimeout(()=> revealAll(), 300);
          }
        }
      }

      if(type==="judge-pick"){
        if(isHost && s.round.judgeId === payload.judgeId){
          pickWinner(payload.submissionId);
        }
      }

      if(type==="state"){
        // Full sync (non-hosts consume)
        if(!isHost) {
          store.replace(payload.state);
        }
      }
    },

    join(player, forceCreate=false){
      myId = player.id;
      // initial announce
      net("hello", player);

      // Decide host on first join or forced creation
      const s = store.get();
      if(!s.meta.hostId || forceCreate){
        isHost = true;
        store.patch({ meta:{ ...s.meta, hostId: myId, heartbeat: now() }});
        startRoundIfNeeded();
      }
    },

    rename(id, name){
      net("rename", { id, name });
    },

    postChat(me, text){
      const item = { id:id(), actorName: me.name, text, ts: now() };
      net("chat", item);
    },

    playCard(playerId, cardId){
      net("play", { by:playerId, cardId });
    },

    judgePick(judgeId, submissionId){
      net("judge-pick", { judgeId, submissionId });
    }
  };

  /** host-only helpers **/
  function ensureHand(pid, player){
    while(player.hand.length < 7 && store.get().deck.white.size() > 0){
      player.hand.push(store.get().deck.white.draw());
    }
  }

  function dealAll(){
    const s = store.get();
    Object.values(s.players).forEach(p => ensureHand(p.id, p));
    store.patch({ players: { ...s.players }});
  }

  function removeCardFromHand(pid, cardId){
    const s = store.get();
    const p = s.players[pid];
    if(!p) return null;
    const idx = p.hand.findIndex(c=> c.id===cardId);
    if(idx>=0) return p.hand.splice(idx,1)[0];
    return null;
  }

  function startRoundIfNeeded(){
    const s = store.get();
    if(s.round.deadline > now()) return; // active
    const judgeId = rotateJudge();
    const black = s.deck.black.draw();
    // reset submitted flags
    Object.values(s.players).forEach(p => p.submitted=false);

    const deadline = now() + ROUND_SECONDS*1000;
    store.patch({ round:{
      num: s.round.num+1, judgeId, black, submissions:[], deadline, pickedId:null
    }, players:{...s.players}});
    dealAll();
    broadcastState();
  }

  function rotateJudge(){
    const s = store.get();
    const ids = Object.keys(s.players);
    if(ids.length===0) return null;
    // deterministic rotation: sort by id to keep stable order
    ids.sort();
    const current = s.round.judgeId ? ids.indexOf(s.round.judgeId) : -1;
    const next = (current+1) % ids.length;
    return ids[next];
  }

  function revealAll(){
    const s = store.get();
    s.round.submissions.forEach(x=> x.revealed = true);
    store.patch({ round:{ ...s.round }});
    broadcastState();
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
    // Short pause then new round
    setTimeout(()=> {
      // top-up winner's hand after card spent
      ensureHand(sub.by, winner);
      startRoundIfNeeded();
    }, 2000);
  }

  function finalizeRoundAuto(){
    const s = store.get();
    // If no pick, randomly pick among submissions
    if(s.round.submissions.length>0 && !s.round.pickedId){
      const pick = s.round.submissions[Math.floor(Math.random()*s.round.submissions.length)];
      pickWinner(pick.id);
    }else{
      startRoundIfNeeded();
    }
  }

  function broadcastState(){
    net("state", { state: store.get() });
  }

  // expose store + actions
  return { get: store.get, subscribe: store.subscribe, actions };
}
