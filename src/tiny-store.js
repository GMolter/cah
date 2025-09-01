// STORE_BUILD 2025-09-01T06:05Z
console.log("STORE_BUILD 2025-09-01T06:05Z");

export function createStore(initial){
  let state = structuredClone(initial);
  const subs = new Set();
  return {
    get: ()=> state,
    subscribe: (fn)=> (subs.add(fn), ()=>subs.delete(fn)),
    patch: (partial)=>{ state = {...state, ...partial}; subs.forEach(fn=>fn(state)); },
    replace: (next)=>{ state = structuredClone(next); subs.forEach(fn=>fn(state)); }
  };
}
