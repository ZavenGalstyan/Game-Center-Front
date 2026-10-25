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
 */
async function request(path, { method = "GET", body, auth = false, raw = false } = {}) {
  const headers = { "Content-Type": "application/json" };
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

  listGameTypes: () => request("/api/game-types"),

  getGameType: (id) => request(`/api/game-types/${id}`),

  createGameType: ({ name, slug }) =>
    request("/api/game-types", { method: "POST", auth: true, body: { name, slug } }),

  updateGameType: (id, body) =>
    request(`/api/game-types/${id}`, { method: "PATCH", auth: true, body }),

  deleteGameType: (id) =>
    request(`/api/game-types/${id}`, { method: "DELETE", auth: true }),

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
    }),

  updateGame: (id, body) =>
    request(`/api/games/${id}`, { method: "PATCH", auth: true, body }),

  deleteGame: (id) => request(`/api/games/${id}`, { method: "DELETE", auth: true }),

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
  } catch {
    tokenStore.clear();
    return null;
  }
}

export function logout() {
  tokenStore.clear();
}
