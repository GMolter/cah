// Host-side helpers: dealing, rotations, and default decks
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

export function createHostDecks(){
  return { black: makeDeck(sampleBlack), white: makeDeck(sampleWhite) };
}

export function computeNextJudgeId(playerMap, currentJudgeId){
  const ids = Object.keys(playerMap).sort((a,b)=>{
    const ja = playerMap[a].joinedAt || 0;
    const jb = playerMap[b].joinedAt || 0;
    if (ja !== jb) return ja - jb;
    return a.localeCompare(b);
  });
  if (!ids.length) return null;
  const idx = currentJudgeId ? Math.max(0, ids.indexOf(currentJudgeId)) : -1;
  return ids[(idx + 1) % ids.length];
}

export { ROUND_SECONDS, id, now };
