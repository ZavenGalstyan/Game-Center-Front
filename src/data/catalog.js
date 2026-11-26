import { api } from "../lib/api.js";
import { cacheEpoch, forEachCached, readCache, writeCache } from "../lib/queryCache.js";

/**
 * Public game catalog loading + caching for the games page.
 *
 * Page size: newer backends accept limit=200, the currently deployed one
 * rejects anything over 100 with a 400 on the `limit` field. We ask for 200,
 * fall back to 100 on that exact rejection, and remember the answer for a
 * while so an old backend doesn't cost a failed request on every visit. Once
 * the new backend is live the next probe after LIMIT_MEMO_MS picks it up.
 *
 * Full catalog: after the first page, `pagination.total` tells us every
 * remaining offset, so the rest is fetched concurrently (MAX_CONCURRENT at a
 * time) and reassembled in offset order, deduplicated by id. If the catalog
 * changed while we were paging (the total moved, or games are missing), the
 * load is redone once so nothing is silently skipped.
 */

const PREFERRED_LIMIT = 200;
const LEGACY_LIMIT = 100;
const MAX_CONCURRENT = 3;
const LIMIT_MEMO_KEY = "gc_games_page_limit";
const LIMIT_MEMO_MS = 6 * 60 * 60 * 1000;
const MAX_PAGES = 50;

/** How long cached catalog data counts as fresh (no revalidation at all). */
export const CATALOG_FRESH_MS = 60_000;

function rememberedLimit() {
  try {
    const memo = JSON.parse(localStorage.getItem(LIMIT_MEMO_KEY) || "null");
    if (memo?.limit === LEGACY_LIMIT && Date.now() - memo.at < LIMIT_MEMO_MS) return LEGACY_LIMIT;
  } catch {
    /* ignore */
  }
  return PREFERRED_LIMIT;
}

function rememberLimit(limit) {
  try {
    if (limit === LEGACY_LIMIT) localStorage.setItem(LIMIT_MEMO_KEY, JSON.stringify({ limit, at: Date.now() }));
    else localStorage.removeItem(LIMIT_MEMO_KEY);
  } catch {
    /* ignore */
  }
}

const isLimitRejection = (err) =>
  err?.status === 400 && Array.isArray(err.errors) && err.errors.some((e) => e?.field === "limit");

/**
 * First page of a listing at the largest page size the backend accepts.
 * Resolves { data, pagination, pageSize } where pageSize is what the backend
 * actually used (it may clamp).
 */
async function fetchFirstPage(params) {
  let limit = rememberedLimit();
  let res;
  try {
    res = await api.listGames({ ...params, limit, offset: 0 });
  } catch (err) {
    if (limit === LEGACY_LIMIT || !isLimitRejection(err)) throw err;
    limit = LEGACY_LIMIT;
    res = await api.listGames({ ...params, limit, offset: 0 });
  }
  rememberLimit(limit);
  const pageSize = Number(res.pagination?.limit) || limit;
  return { data: res.data ?? [], pagination: res.pagination ?? null, pageSize };
}

/** Runs `tasks` (functions returning promises) with at most `max` in flight; results keep task order. */
async function runBounded(tasks, max, isCancelled) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      if (isCancelled()) return;
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, tasks.length) }, worker));
  return results;
}

function mergeUnique(pages) {
  const seen = new Set();
  const all = [];
  for (const page of pages) {
    for (const g of page ?? []) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      all.push(g);
    }
  }
  return all;
}

async function fetchAllOnce(isCancelled) {
  const first = await fetchFirstPage({});
  const total = Number(first.pagination?.total);
  if (!first.pagination?.hasMore || !Number.isFinite(total)) {
    return { data: first.data, pagination: first.pagination, consistent: true };
  }

  const step = first.pageSize;
  if (first.data.length !== step) {
    // Unexpected page shape: follow nextOffset sequentially instead of guessing offsets.
    const pages = [first.data];
    let pagination = first.pagination;
    for (let i = 0; pagination?.hasMore && pagination.nextOffset != null && i < MAX_PAGES; i++) {
      if (isCancelled()) return null;
      const next = await api.listGames({ limit: step, offset: pagination.nextOffset });
      pages.push(next.data);
      pagination = next.pagination;
      if (!next.data?.length) break;
    }
    const data = mergeUnique(pages);
    return { data, pagination, consistent: data.length >= Number(pagination?.total ?? 0) };
  }

  const offsets = [];
  for (let o = step; o < total && offsets.length < MAX_PAGES; o += step) offsets.push(o);
  const rest = await runBounded(
    offsets.map((offset) => () => api.listGames({ limit: step, offset })),
    MAX_CONCURRENT,
    isCancelled,
  );
  if (isCancelled()) return null;

  const data = mergeUnique([first.data, ...rest.map((r) => r?.data)]);
  const totals = rest.map((r) => Number(r?.pagination?.total));
  const consistent = totals.every((t) => t === total) && data.length === total;
  const last = rest[rest.length - 1]?.pagination ?? first.pagination;
  return { data, pagination: { ...last, total, hasMore: false, nextOffset: null }, consistent };
}

/** Every game, in backend order. Returns null when cancelled. */
export async function fetchAllGames({ isCancelled = () => false } = {}) {
  let res = await fetchAllOnce(isCancelled);
  if (res && !res.consistent) res = await fetchAllOnce(isCancelled);
  if (!res) return null;
  return { data: res.data, pagination: res.pagination };
}

/** First page of a category listing (main-category matches first). */
export async function fetchCategoryGames(categoryId) {
  const { data, pagination, pageSize } = await fetchFirstPage({ categoryId });
  return { data, pagination, pageSize };
}

/** Next page of a category listing. */
export function fetchMoreCategoryGames(categoryId, { offset, pageSize }) {
  return api.listGames({ limit: pageSize, offset, categoryId });
}

/* ------------------------------- Cache keys ------------------------------- */

export const catalogKey = (typeId) => (typeId ? `games:type:${typeId}` : "games:all");
const persistFor = (key) => key === "games:all";

export function readCatalog(typeId) {
  const key = catalogKey(typeId);
  return readCache(key, { persist: persistFor(key), maxAge: CATALOG_FRESH_MS });
}

export function writeCatalog(typeId, value, sinceEpoch) {
  const key = catalogKey(typeId);
  return writeCache(key, value, { persist: persistFor(key), sinceEpoch });
}

export { cacheEpoch };

/* ------------------------------ Single games ------------------------------ */

const gameKey = (id) => `game:${id}`;

/**
 * A game already known locally: from its own detail fetch, or from any
 * catalog listing kept in memory or (for the full catalog) in storage.
 */
export function peekGame(id) {
  if (!id) return null;
  const own = readCache(gameKey(id));
  if (own) return own.data;
  let found = null;
  readCatalog(); // pulls the persisted full catalog into memory if needed
  forEachCached("games:", (value) => {
    found ||= value?.data?.find((g) => g.id === id) ?? null;
  });
  return found;
}

export function rememberGame(game, sinceEpoch) {
  if (game?.id) writeCache(gameKey(game.id), game, { sinceEpoch });
}
