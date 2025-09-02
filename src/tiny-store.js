/* STORE_BUILD */ console.log("STORE_BUILD", new Date().toISOString());

export function createStore(initial){
  let state = structuredClone(initial);
  const subs = new Set();

  return {
    get: ()=> state,
    patch: (partial)=>{
      state = { ...state, ...partial };
      subs.forEach(fn=> fn(state));
    },
    replace: (next)=>{
      state = structuredClone(next);
      subs.forEach(fn=> fn(state));
    },
    subscribe: (fn)=>{
      subs.add(fn);
      return ()=> subs.delete(fn);
    }
  };
}
