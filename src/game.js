// game.js
export const GAME_BUILD = "GAME_BUILD 2025-09-01T06:05Z";

export const ROUND_SECONDS = 45;

export function id(){
  // compact sortable-ish id
  return Math.random().toString(36).slice(2, 10);
}

function makeDeck(cards){
  const pool = cards.slice();
  return {
    draw(){
      if(!pool.length) return null;
      const idx = Math.floor(Math.random()*pool.length);
      const [val] = pool.splice(idx,1);
      return val;
    }
  };
}

// Minimal sample decks (replace with real packs later)
const WHITE = Array.from({length: 400}, (_,i)=> ({ id: "w"+(i+1), text: "White card "+(i+1) }));
const BLACK = Array.from({length: 80}, (_,i)=> ({ id: "b"+(i+1), text: "Black prompt "+(i+1) }));

export function createHostDecks(){
  return {
    white: makeDeck(WHITE),
    black: makeDeck(BLACK)
  };
}

export function computeNextJudgeId(players, prev){
  const ids = Object.keys(players||{}).sort(); // deterministic
  if (!ids.length) return null;
  if (!prev) return ids[0];
  const i = ids.indexOf(prev);
  return ids[(i+1) % ids.length];
}

console.log(GAME_BUILD);
