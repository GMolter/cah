/* GAME_BUILD */ console.log("GAME_BUILD", new Date().toISOString());

const BLACK_CARDS = [
  { id:"b1", text:"I never leave the house without ____." },
  { id:"b2", text:"My superpower? Definitely ____." },
  { id:"b3", text:"Nothing says romance like ____." }
];

const WHITE_CARDS = [
  { id:"w1", text:"Spaghetti" },
  { id:"w2", text:"A cute puppy" },
  { id:"w3", text:"My collection of rocks" },
  { id:"w4", text:"Science" },
  { id:"w5", text:"A big explosion" },
  { id:"w6", text:"Cheese" },
  { id:"w7", text:"Aliens" }
];

export const ROUND_SECONDS = 60;

export function id() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function makeDeck(arr){
  let pool = arr.slice();
  for(let i=pool.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function freshGame(){
  return {
    blackDeck: makeDeck(BLACK_CARDS),
    whiteDeck: makeDeck(WHITE_CARDS)
  };
}

export function drawBlack(state){
  return state.blackDeck.pop() || null;
}

export function drawHand(state, count=7){
  const hand=[];
  for(let i=0;i<count;i++){
    const c = state.whiteDeck.pop();
    if(c) hand.push(c);
  }
  return hand;
}
