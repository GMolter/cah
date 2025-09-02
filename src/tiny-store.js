// STORE_BUILD 2025-09-01T07:25Z

/** Persist a namespaced value in localStorage (JSON). */
export function save(key, value) {
  localStorage.setItem("cadh:" + key, JSON.stringify(value));
}

/** Load a namespaced value from localStorage. */
export function load(key, fallback = null) {
  const raw = localStorage.getItem("cadh:" + key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** Remove a namespaced value. */
export function drop(key) {
  localStorage.removeItem("cadh:" + key);
}

/** Clear all CADH keys. */
export function clearAll() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("cadh:")) localStorage.removeItem(k);
  }
}
