export function createStore(initial){
  let state = structuredClone(initial);
  const subs = new Set();

  function get(){ return state; }
  function patch(partial){
    state = deepMerge(state, partial);
    subs.forEach(fn=> fn(state));
  }
  function replace(next){
    state = next;
    subs.forEach(fn=> fn(state));
  }
  function subscribe(fn){ subs.add(fn); fn(state); return ()=> subs.delete(fn); }

  return { get, patch, replace, subscribe };
}

function deepMerge(target, source){
  if(typeof source !== "object" || source===null) return source;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for(const [k,v] of Object.entries(source)){
    if(Array.isArray(v)) out[k] = v.slice();
    else if(typeof v === "object" && v) out[k] = deepMerge(target?.[k] ?? {}, v);
    else out[k] = v;
  }
  return out;
}
