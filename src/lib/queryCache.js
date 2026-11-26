/**
 * Small client-side cache for PUBLIC, non-personalised API data (the game
 * catalog and the category list). Never put anything fetched with a token in
 * here: entries are shared by every user of the browser.
 *
 * - Memory: a bounded LRU (MAX_ENTRIES), reused across route changes.
 * - Persisted (opt-in per key): a copy in localStorage so a reload can paint
 *   the last known catalog at once while it revalidates. Persisted entries
 *   older than PERSIST_MAX_AGE are ignored.
 * - Every invalidation bumps an epoch; a revalidation that started before the
 *   invalidation must not write its (possibly stale) result back — callers
 *   capture `cacheEpoch()` before fetching and pass it to `writeCache`.
 */

const MAX_ENTRIES = 40;
const PERSIST_PREFIX = "gc_cache_v1:";
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const mem = new Map(); // key -> { data, at }
let epoch = 0;

function readPersisted(key) {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.at !== "number" || Date.now() - entry.at > PERSIST_MAX_AGE) return null;
    return entry;
  } catch {
    return null;
  }
}

function remember(key, entry) {
  mem.delete(key);
  mem.set(key, entry);
  while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value);
}

/** Returns { data, at, fresh } or null. `fresh` is age < maxAge. */
export function readCache(key, { persist = false, maxAge = 60_000 } = {}) {
  let entry = mem.get(key) ?? null;
  if (entry) remember(key, entry);
  else if (persist && (entry = readPersisted(key))) remember(key, entry);
  if (!entry) return null;
  return { data: entry.data, at: entry.at, fresh: Date.now() - entry.at < maxAge };
}

/** Stores `data`; skipped (returns false) when the cache was invalidated since `sinceEpoch`. */
export function writeCache(key, data, { persist = false, sinceEpoch } = {}) {
  if (sinceEpoch !== undefined && sinceEpoch !== epoch) return false;
  const entry = { data, at: Date.now() };
  remember(key, entry);
  if (persist) {
    try {
      localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(entry));
    } catch {
      /* quota / blocked storage — memory copy is enough */
    }
  }
  return true;
}

export function cacheEpoch() {
  return epoch;
}

/** Drops every entry whose key starts with one of `prefixes` (memory + storage). */
export function invalidateCache(...prefixes) {
  epoch += 1;
  const hit = (k) => prefixes.some((p) => k.startsWith(p));
  for (const k of [...mem.keys()]) if (hit(k)) mem.delete(k);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PERSIST_PREFIX) && hit(k.slice(PERSIST_PREFIX.length))) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Calls `fn(data, key)` for each in-memory entry whose key starts with `prefix`. */
export function forEachCached(prefix, fn) {
  for (const [k, e] of mem) if (k.startsWith(prefix)) fn(e.data, k);
}
