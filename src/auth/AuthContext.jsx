import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  bootstrapAuth,
  login as apiLogin,
  logout as apiLogout,
  registerAndLogin as apiRegisterAndLogin,
} from "../lib/api.js";

/**
 * @typedef {"loading" | "guest" | "authenticated"} AuthStatus
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    bootstrapAuth().then((u) => {
      if (cancelled) return;
      setUser(u);
      setStatus(u ? "authenticated" : "guest");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const u = await apiLogin(credentials);
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const registerAndLogin = useCallback(async (payload) => {
    const u = await apiRegisterAndLogin(payload);
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setStatus("guest");
  }, []);

  // Called when a protected request comes back 401 (token stale/expired).
  const handleAuthExpired = useCallback(() => {
    apiLogout();
    setUser(null);
    setStatus("guest");
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      isAdmin: user?.role === "admin",
      isAuthenticated: status === "authenticated",
      login,
      registerAndLogin,
      logout,
      handleAuthExpired,
      setUser,
    }),
    [status, user, login, registerAndLogin, logout, handleAuthExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
