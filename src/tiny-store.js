// /src/tiny-store.js
export const STORE_BUILD = "STORE_BUILD 2025-09-01T06:20Z";

export function createStore(initial){
  let state = structuredClone(initial);
  const subs = new Set();
  return {
    get: ()=> state,
    subscribe(fn){ subs.add(fn); return ()=> subs.delete(fn); },
    patch(p){
      state = Object.assign({}, state, p);
      subs.forEach(fn=>fn(state));
    },
    replace(next){
      state = structuredClone(next);
      subs.forEach(fn=>fn(state));
    }
  };
}
