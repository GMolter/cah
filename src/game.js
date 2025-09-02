// GAME_BUILD 2025-09-01T07:25Z

export const BLACK_CARDS = [
  { id: "b1", text: "I never leave the house without ____." },
  { id: "b2", text: "My superpower? Definitely ____." },
  { id: "b3", text: "Nothing says romance like ____." }
];

export const WHITE_CARDS = [
  { id: "w1", text: "A burrito the size of my head" },
  { id: "w2", text: "Grandma’s dentures" },
  { id: "w3", text: "Explosive diarrhea" },
  { id: "w4", text: "Doing shots with Santa" },
  { id: "w5", text: "A duck wearing sunglasses" },
  { id: "w6", text: "Farting in an elevator" }
];

export function randomBlack() {
  return BLACK_CARDS[Math.floor(Math.random() * BLACK_CARDS.length)];
}
