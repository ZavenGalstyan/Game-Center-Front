/**
 * Visibility rule for the Game Requests admin area: exact, case-sensitive
 * username match. This only decides what the UI shows — the backend checks
 * the server-side admin role on every request and answers 401/403 otherwise.
 */
export const isGameRequestsAdmin = (user) => user?.username === "Admin";
