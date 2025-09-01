// STORE_BUILD 2025-09-01T06:15Z

export function createStore(initialState){
  let state = structuredClone(initialState);
  const subs = new Set();

  function get(){ return state; }
  function replace(next){
    state = structuredClone(next);
    subs.forEach(fn=> fn(state));
  }
  function patch(partial){
    state = Object.assign({}, state, partial);
    subs.forEach(fn=> fn(state));
  }
  function subscribe(fn){
    subs.add(fn);
    fn(state);
    return ()=> subs.delete(fn);
  }
  return { get, replace, patch, subscribe };
}
