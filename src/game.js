// GAME_BUILD 2025-09-01T06:15Z

export const ROUND_SECONDS = 50;

export function id(){
  return Math.random().toString(36).slice(2, 10);
}

// very small demo decks; replace with your full decks as needed
const WHITE = [
  { id:"w1", text:"A surprising burrito." },
  { id:"w2", text:"Grandma’s Wi-Fi password." },
  { id:"w3", text:"A suspiciously large balloon." },
  { id:"w4", text:"A microwave dinner for one." },
  { id:"w5", text:"That one guy from yoga class." },
  { id:"w6", text:"A goose with a job." },
  { id:"w7", text:"Ten thousand bees." },
  { id:"w8", text:"An awkward fist bump." },
  { id:"w9", text:"Mild salsa." },
  { id:"w10", text:"A haunted Roomba." },
];

const BLACK = [
  { id:"b1", text:"I never leave the house without ____." },
  { id:"b2", text:"My superpower? Definitely ____." },
  { id:"b3", text:"Nothing says romance like ____." },
];

function makeBag(arr){
  const pool = arr.slice();
  return {
    draw(){
      if (pool.length === 0) return null;
      const idx = Math.floor(Math.random()*pool.length);
      return pool.splice(idx,1)[0];
    }
  };
}

export function createHostDecks(){
  return {
    white: makeBag(WHITE),
    black: makeBag(BLACK)
  };
}

export function computeNextJudgeId(playersMap, lastJudgeUid){
  const ids = Object.keys(playersMap||{}).sort();
  if (ids.length === 0) return null;
  if (!lastJudgeUid) return ids[0];
  const i = ids.indexOf(lastJudgeUid);
  if (i < 0 || i === ids.length-1) return ids[0];
  return ids[i+1];
}
