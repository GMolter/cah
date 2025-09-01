// /src/game.js
export const GAME_BUILD = "GAME_BUILD 2025-09-01T06:20Z";

export const ROUND_SECONDS = 45;
export const id = ()=> Math.random().toString(36).slice(2,10);

// demo decks
const WHITE = [
  "A mime having a stroke.",
  "A PowerPoint about bullets.",
  "Grandma’s browser history.",
  "An unexpected item in the bagging area.",
  "Bees? Bees.",
  "Literally eating the rich.",
  "A Bluetooth toaster that won’t pair.",
  "Florida Man.",
  "Unskippable ads.",
  "The world’s okayest dad."
].map((t,i)=> ({ id:`w${i}`, text:t }));

const BLACK = [
  "Why can’t I sleep at night? ____.",
  "I got 99 problems but ____ ain’t one.",
  "Next on Netflix: ____.",
  "What’s that smell? ____.",
  "In the next Marvel movie, ____ will finally face ____."
].map((t,i)=> ({ id:`b${i}`, text:t }));

class Deck {
  constructor(cards){ this.cards = [...cards]; this._reshuffle(); }
  _reshuffle(){ for(let i=this.cards.length-1;i>0;i--){ const j=(Math.random()* (i+1))|0; [this.cards[i],this.cards[j]]=[this.cards[j],this.cards[i]]; } }
  draw(){ return this.cards.shift() || null; }
}

export function createHostDecks(){
  return { white: new Deck(WHITE), black: new Deck(BLACK) };
}

export function computeNextJudgeId(players, lastJudge){
  const ids = Object.keys(players || {}).sort();
  if(!ids.length) return null;
  if(!lastJudge) return ids[0];
  const i = ids.indexOf(lastJudge);
  return ids[(i+1) % ids.length];
}
