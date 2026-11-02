// Session checks for the custom game request flow, built on the app's
// existing token store and /api/auth/me endpoint (same as bootstrapAuth).

import { api, tokenStore } from "../../lib/api.js";

/** Reads `exp` (seconds) from a JWT without verifying it; null when absent. */
function tokenExpiry(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Synchronous check: a token is stored and has not visibly expired. */
export function hasLiveSession() {
  const token = tokenStore.get();
  if (!token) return false;
  const exp = tokenExpiry(token);
  return exp === null || exp > Date.now();
}

/**
 * Asks the backend whether the session is still valid.
 * @returns {Promise<boolean | null>} true valid, false expired/rejected,
 *   null when it could not be determined (network / server trouble).
 */
export async function verifySession() {
  try {
    await api.me();
    return true;
  } catch (err) {
    return err?.status === 401 ? false : null;
  }
}
