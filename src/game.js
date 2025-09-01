// GAME_BUILD 2025-09-01T06:05Z
console.log("GAME_BUILD 2025-09-01T06:05Z");

export const ROUND_SECONDS = 60;
export const id = ()=> Math.random().toString(36).slice(2,10);

const WHITE = [
  "A funny joke","My collection of rocks","A big explosion","Spaghetti",
  "A cute puppy","Science","Cheese","Aliens","An oversized lollipop",
  "A cartoon camel enjoying a popsicle","A very good boy"
].map((t,i)=>({ id:"w"+i, text:t }));

const BLACK = [
  "In the beginning, there was ____.",
  "What did I bring back from Mexico?",
  "Why is the floor sticky?"
].map((t,i)=>({ id:"b"+i, text:t }));

function makeDeck(cards){
  let bag = cards.slice();
  return {
    draw(){
      if (!bag.length) return null;
      const idx = Math.floor(Math.random()*bag.length);
      return bag.splice(idx,1)[0];
    }
  };
}
export function createHostDecks(){
  return {
    white: makeDeck(WHITE),
    black: makeDeck(BLACK)
  };
}

export function computeNextJudgeId(players, prevJudge){
  const ids = Object.keys(players||{});
  ids.sort();
  if (!ids.length) return null;
  if (!prevJudge) return ids[0];
  const i = Math.max(0, ids.indexOf(prevJudge));
  return ids[(i+1) % ids.length];
}
