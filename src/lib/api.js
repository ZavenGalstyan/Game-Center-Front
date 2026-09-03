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
 * Throws { status, message, errors } on any non-2xx response or network failure.
 * Returns the `data` payload of the success envelope on success.
 */
async function request(path, { method = "GET", body, auth = false } = {}) {
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
    };
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    throw {
      status: res.status,
      message: json.message || "Request failed",
      errors: json.errors || null,
    };
  }

  return json.data;
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

  listUsers: ({ page = 1, limit = 10, role } = {}) => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(role ? { role } : {}),
    });
    return request(`/api/users?${qs.toString()}`, { auth: true });
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
