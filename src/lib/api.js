import { invalidateCache } from "./queryCache.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const TOKEN_KEY = "gc_access_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Low-level request helper.
 * Throws { status, message, errors, code, retryAfter } on any non-2xx response
 * or network failure. `code` is the backend's machine-readable error code
 * (e.g. COMMENT_LIMIT_REACHED) and `retryAfter` the Retry-After header in
 * seconds; both are null when absent.
 * Returns the `data` payload of the success envelope on success.
 * `expect` (optional) is the exact success status the caller requires; any
 * other 2xx is treated as a failure so the UI never confirms an unverified write.
 * `cache` (optional) is passed to fetch as its cache mode (e.g. "reload").
 *
 * Content-Type is only sent with a JSON body: on a body-less cross-origin GET
 * it would make the request "non-simple" and cost a CORS preflight each time.
 *
 * Identical GETs that are in flight at the same moment share one network
 * request. The key includes the token actually sent, so two identities never
 * share a response. Callers must treat returned objects as read-only.
 */
const inflight = new Map();

function request(path, options = {}) {
  const { method = "GET", auth = false, cache, body, expect } = options;
  if (method !== "GET" || body || expect) return send(path, options);
  const token = auth ? tokenStore.get() : null;
  const key = `${cache || ""} ${token || ""} ${path}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = send(path, { ...options, raw: true }).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return options.raw ? pending : pending.then((json) => json.data);
}

async function send(path, { method = "GET", body, auth = false, raw = false, expect, cache } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...(cache ? { cache } : {}),
    });
  } catch {
    throw {
      status: 0,
      message: "Cannot reach the server. Is the backend running?",
      errors: null,
      code: null,
      retryAfter: null,
    };
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    const retryAfter = Number.parseInt(res.headers.get("Retry-After"), 10);
    throw {
      status: res.status,
      message: json.message || "Request failed",
      errors: json.errors || null,
      code: json.code || null,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
    };
  }

  if (expect && res.status !== expect) {
    throw {
      status: res.status,
      message: "Unexpected response from the server. Please try again.",
      errors: null,
      code: "UNEXPECTED_STATUS",
      retryAfter: null,
    };
  }

  // `raw` returns the whole envelope ({ data, pagination, ... }); default unwraps `data`.
  return raw ? json : json.data;
}

/**
 * The like endpoints may or may not wrap their payload in the standard `data`
 * envelope depending on backend version — read `liked` from either shape.
 */
function readLiked(json) {
  return Boolean(json?.data?.liked ?? json?.liked);
}

/**
 * Category endpoints are served with Cache-Control: public, max-age=60. After
 * this browser changes a category, its HTTP cache could keep serving the old
 * list for up to that long, so category reads bypass it (fetch cache "reload",
 * which also refreshes the cached copy) for that window.
 */
const CATEGORY_HTTP_MAX_AGE = 60_000;
let bypassCategoryCacheUntil = 0;
const categoryCacheMode = () => (Date.now() < bypassCategoryCacheUntil ? "reload" : undefined);

// Catalog data embeds category names, so a category change also drops games.
function afterCategoryMutation(result) {
  bypassCategoryCacheUntil = Date.now() + CATEGORY_HTTP_MAX_AGE;
  invalidateCache("types", "games:", "game:");
  return result;
}

function afterGameMutation(result) {
  invalidateCache("games:", "game:");
  return result;
}

export const api = {
  health: () => request("/api/health"),

  register: ({ username, email, password }) =>
    request("/api/auth/register", {
      method: "POST",
      body: { username, email, password },
    }),

  login: ({ email, password }) =>
    request("/api/auth/login", { method: "POST", body: { email, password } }),

  me: () => request("/api/auth/me", { auth: true }),

  changePassword: ({ currentPassword, newPassword }) =>
    request("/api/auth/change-password", {
      method: "PATCH",
      auth: true,
      body: { currentPassword, newPassword },
    }),

  /* --------------------------------- Avatars -------------------------------- */

  // Public. Returns { avatars, categories, defaultAvatarId, total }.
  listAvatars: () => request("/api/avatars"),

  // Returns { avatarId, user }.
  updateMyAvatar: (avatarId) =>
    request("/api/auth/me/avatar", { method: "PATCH", auth: true, body: { avatarId } }),

  listUsers: ({ page = 1, limit = 10, role } = {}) => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(role ? { role } : {}),
    });
    return request(`/api/users?${qs.toString()}`, { auth: true });
  },

  /* -------------------------------- Game types ------------------------------- */

  // `fresh` skips the browser's HTTP cache (used right after a mutation).
  listGameTypes: ({ fresh = false } = {}) =>
    request("/api/game-types", { cache: fresh ? "reload" : categoryCacheMode() }),

  getGameType: (id) => request(`/api/game-types/${id}`, { cache: categoryCacheMode() }),

  createGameType: ({ name, slug }) =>
    request("/api/game-types", { method: "POST", auth: true, body: { name, slug } }).then(
      afterCategoryMutation,
    ),

  updateGameType: (id, body) =>
    request(`/api/game-types/${id}`, { method: "PATCH", auth: true, body }).then(
      afterCategoryMutation,
    ),

  deleteGameType: (id) =>
    request(`/api/game-types/${id}`, { method: "DELETE", auth: true }).then(
      afterCategoryMutation,
    ),

  /* ---------------------------------- Games --------------------------------- */

  // Returns the full envelope: { data: Game[], pagination: {...} }.
  // With `categoryId` the backend returns main-category matches first, then
  // secondary-category matches (each item carries `categoryMatch`).
  listGames: ({ limit = 20, offset = 0, categoryId, search } = {}) => {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { search } : {}),
    });
    return request(`/api/games?${qs.toString()}`, { raw: true });
  },

  getGame: (id) => request(`/api/games/${id}`),

  // mainCategory: GameType id (required); secondaryCategories: GameType ids.
  createGame: ({ name, description, mainCategory, secondaryCategories = [] }) =>
    request("/api/games", {
      method: "POST",
      auth: true,
      body: { name, description, mainCategory, secondaryCategories },
    }).then(afterGameMutation),

  updateGame: (id, body) =>
    request(`/api/games/${id}`, { method: "PATCH", auth: true, body }).then(afterGameMutation),

  deleteGame: (id) =>
    request(`/api/games/${id}`, { method: "DELETE", auth: true }).then(afterGameMutation),

  /* ------------------------------- Game likes ------------------------------ */

  // Authenticated-only. Returns a boolean.
  getGameLikeStatus: (gameId) =>
    request(`/api/games/${gameId}/like`, { auth: true, raw: true }).then(readLiked),

  // Returns the raw JSON so the caller can tell "no `liked` field" (e.g. a 204
  // response) apart from an explicit `false` and keep its optimistic state.
  likeGame: (gameId) =>
    request(`/api/games/${gameId}/like`, { method: "POST", auth: true, raw: true }),

  unlikeGame: (gameId) =>
    request(`/api/games/${gameId}/like`, { method: "DELETE", auth: true, raw: true }),

  /* ------------------------------ Game ratings ----------------------------- */

  // Public. Sends the token when there is one so `myRating` is filled in.
  // Returns { averageRating, ratingsCount, ratingDistribution, myRating }.
  getRatingSummary: (gameId) =>
    request(`/api/games/${gameId}/ratings/summary`, { auth: true }),

  // Authenticated-only; ratings are final (409 if already rated).
  // Returns { rating: { gameId, rating, createdAt }, summary }.
  submitRating: (gameId, rating) =>
    request(`/api/games/${gameId}/ratings`, {
      method: "POST",
      auth: true,
      body: { rating },
    }),

  /* ----------------------------- Game comments ----------------------------- */

  // Public. Sends the token when there is one so `isOwner` is filled in. A
  // stale token makes the backend answer 401 even here, so retry once as a
  // guest (comments stay readable) and flag it so the caller can drop the
  // expired session. Returns { data: Comment[], pagination, authExpired }.
  listComments: async (gameId, { limit = 10, offset = 0, sort = "newest" } = {}) => {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sort,
    });
    const path = `/api/games/${gameId}/comments?${qs.toString()}`;
    const hadToken = Boolean(tokenStore.get());
    try {
      const json = await request(path, { auth: true, raw: true });
      return { ...json, authExpired: false };
    } catch (err) {
      if (err?.status !== 401 || !hadToken) throw err;
      const json = await request(path, { raw: true });
      return { ...json, authExpired: true };
    }
  },

  // Authenticated-only. Returns { count, limit, remaining, canComment }.
  getMyCommentCount: (gameId) =>
    request(`/api/games/${gameId}/comments/me/count`, { auth: true }),

  // Returns { comment, allowance }.
  createComment: (gameId, content) =>
    request(`/api/games/${gameId}/comments`, {
      method: "POST",
      auth: true,
      body: { content },
    }),

  // Owner only. Returns { comment }.
  updateComment: (gameId, commentId, content) =>
    request(`/api/games/${gameId}/comments/${commentId}`, {
      method: "PATCH",
      auth: true,
      body: { content },
    }),

  // Owner only. Returns { deletedCommentId, allowance }.
  deleteComment: (gameId, commentId) =>
    request(`/api/games/${gameId}/comments/${commentId}`, {
      method: "DELETE",
      auth: true,
    }),

  /* ------------------------- Custom game requests -------------------------- */

  // Authenticated. Returns the created request (HTTP 201).
  createGameRequest: ({ firstName, lastName, email, description }) =>
    request("/api/game-requests", {
      method: "POST",
      auth: true,
      body: { firstName, lastName, email, description },
      expect: 201,
    }),

  // Admin only (enforced server-side). Returns { requests, pagination }.
  listGameRequests: ({ page = 1, limit = 10, search, status } = {}) => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
    });
    return request(`/api/game-requests?${qs.toString()}`, { auth: true });
  },

  // Admin only (enforced server-side). Returns the updated request.
  updateGameRequestStatus: (id, status) =>
    request(`/api/game-requests/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      auth: true,
      body: { status },
      expect: 200,
    }),

  // Backend shape varies: { items, total } or the standard { data, pagination }.
  getMyLikedGames: ({ limit = 12, offset = 0 } = {}) => {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return request(`/api/users/me/liked-games?${qs.toString()}`, {
      auth: true,
      raw: true,
    });
  },
};

export async function registerAndLogin({ username, email, password }) {
  await api.register({ username, email, password });
  const data = await api.login({ email, password });
  tokenStore.set(data.accessToken);
  return data.user;
}

export async function login({ email, password }) {
  const data = await api.login({ email, password });
  tokenStore.set(data.accessToken);
  return data.user;
}

export async function bootstrapAuth() {
  if (!tokenStore.get()) return null;
  try {
    const { user } = await api.me();
    return user;
  } catch (err) {
    // Only a rejected token ends the session. A network failure or a server
    // error (e.g. the backend still waking up) leaves the visitor a guest for
    // this page load but keeps the token for the next one.
    if (err?.status === 401 || err?.status === 403) tokenStore.clear();
    return null;
  }
}

export function logout() {
  tokenStore.clear();
}
