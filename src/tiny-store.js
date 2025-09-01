// tiny-store.js
export const STORE_BUILD = "STORE_BUILD 2025-09-01T06:05Z";

export function createStore(initial){
  let state = structuredClone(initial);
  const subs = new Set();
  return {
    get: ()=> state,
    subscribe: (fn)=> { subs.add(fn); return ()=> subs.delete(fn); },
    replace: (next)=> { state = structuredClone(next); subs.forEach(s=>s(state)); },
    patch: (partial)=> { Object.assign(state, partial); subs.forEach(s=>s(state)); }
  };
}

console.log(STORE_BUILD);
