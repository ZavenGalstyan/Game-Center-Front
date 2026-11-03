import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import {
  buildGameRequestPayload,
  submitGameRequest,
} from "./gameRequest.js";
import { hasLiveSession, verifySession } from "./session.js";

const EXIT_MS = 200;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * State machine for the custom game request dialog:
 *   closed → "auth"   (guest)            → Login/Register via the app's AuthModal
 *   closed → "form"   (authenticated)    → valid submit → "notice"
 *   "form" → "auth"   (session expired)
 *
 * @param {(mode: "login" | "register", options?: { onAuthenticated?: () => void }) => void} [openAuth]
 */
export default function useGameRequestFlow(openAuth) {
  const { status, user, handleAuthExpired } = useAuth();
  const [view, setView] = useState(null); // null | "auth" | "form" | "notice"
  const [closing, setClosing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  // Deferred open: "hydrating" = clicked while auth was still loading,
  // "signed-in" = resume once the AuthModal login/register succeeds.
  const [pendingOpen, setPendingOpen] = useState(null);
  const closeTimer = useRef(null);

  const expireSession = useCallback(() => {
    handleAuthExpired();
    setSessionExpired(true);
    setView("auth");
  }, [handleAuthExpired]);

  // Recheck authentication every time the dialog is opened.
  const resolveOpen = useCallback(() => {
    if (status === "authenticated" && hasLiveSession()) {
      setSessionExpired(false);
      setView("form");
    } else if (status === "authenticated") {
      expireSession();
    } else {
      setSessionExpired(false);
      setView("auth");
    }
  }, [status, expireSession]);

  const open = useCallback(() => {
    if (view || closing) return;
    if (status === "loading") setPendingOpen("hydrating");
    else resolveOpen();
  }, [view, closing, status, resolveOpen]);

  useEffect(() => {
    const ready =
      (pendingOpen === "hydrating" && status !== "loading") ||
      (pendingOpen === "signed-in" && status === "authenticated");
    if (ready) {
      setPendingOpen(null);
      resolveOpen();
    }
  }, [pendingOpen, status, resolveOpen]);

  // Session lost while the form is showing (401 elsewhere, token cleared…).
  useEffect(() => {
    if (view === "form" && status !== "authenticated") {
      setSessionExpired(true);
      setView("auth");
    }
  }, [view, status]);

  // Confirm with the server in the background when the form opens; a stale
  // token flips the dialog to the sign-in view. Network trouble is ignored
  // here (the submit re-checks locally).
  const formOpen = view === "form";
  useEffect(() => {
    if (!formOpen) return undefined;
    let cancelled = false;
    verifySession().then((valid) => {
      if (!cancelled && valid === false) expireSession();
    });
    return () => {
      cancelled = true;
    };
  }, [formOpen, expireSession]);

  const close = useCallback(
    (after) => {
      if (!view || closing) return;
      setClosing(true);
      closeTimer.current = setTimeout(
        () => {
          closeTimer.current = null;
          setView(null);
          setClosing(false);
          setSessionExpired(false);
          after?.();
        },
        prefersReducedMotion() ? 0 : EXIT_MS,
      );
    },
    [view, closing],
  );

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** Leave the dialog for the app's own Login / Register modal. */
  const startAuth = useCallback(
    (mode) => {
      close(() =>
        openAuth?.(mode, {
          // Resume the request once the visitor is actually signed in.
          onAuthenticated: () => setPendingOpen("signed-in"),
        }),
      );
    },
    [close, openAuth],
  );

  /**
   * Submit handler for validated form values. Re-checks the session first,
   * then hands a clean payload to the submission seam.
   */
  const submit = useCallback(
    async (values) => {
      if (status !== "authenticated" || !hasLiveSession()) {
        expireSession();
        return;
      }
      const payload = buildGameRequestPayload(values);
      try {
        const { delivered } = await submitGameRequest(payload);
        // Online submissions are not live yet: say so honestly.
        if (!delivered) setView("notice");
        // When the backend exists, a delivered request gets its own success view.
      } catch (err) {
        if (err?.status === 401) {
          expireSession();
          return;
        }
        throw err;
      }
    },
    [status, expireSession],
  );

  return {
    view,
    closing,
    opening: pendingOpen === "hydrating" && !view,
    sessionExpired,
    user,
    open,
    close,
    startAuth,
    submit,
  };
}
