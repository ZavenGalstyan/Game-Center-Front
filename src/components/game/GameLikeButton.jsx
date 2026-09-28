import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useToast } from "../Toast.jsx";
import { api } from "../../lib/api.js";

/**
 * Heart / favourite button for the <GamePlayer> control toolbar.
 *
 * Lives in the same control row as Restart / Mute / Fullscreen and reuses the
 * `.game-controls__btn` styling so it feels native. Anonymous users still see
 * the button; clicking it just shows a "log in" toast and never calls the API.
 *
 * Backend is the source of truth: the authoritative like state is fetched on
 * mount and whenever the game or auth status changes, with a per-effect guard
 * so a slow response for a previous game can't overwrite the current one.
 */
function IconHeart({ filled }) {
  // Stroke width: 1.8 default, 2 when active/filled (per icon spec)
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

export default function GameLikeButton({ gameId }) {
  const { status, isAuthenticated, handleAuthExpired } = useAuth();
  const toast = useToast();

  const [liked, setLiked] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bump, setBump] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Authoritative like state for the current game + user.
  useEffect(() => {
    if (!gameId) return undefined;
    if (status !== "authenticated") {
      // Anonymous (or logged out while mounted): neutral state, no request.
      setLiked(false);
      setStatusLoading(false);
      return undefined;
    }

    let active = true;
    setStatusLoading(true);
    api
      .getGameLikeStatus(gameId)
      .then((value) => {
        if (active) setLiked(value);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.status === 401) handleAuthExpired();
        setLiked(false);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [gameId, status, handleAuthExpired]);

  const onClick = useCallback(async () => {
    if (actionLoading) return;

    if (!isAuthenticated) {
      toast.show("Log in to like games", { type: "info" });
      return;
    }

    const previous = liked;
    const nextValue = !previous;

    // Optimistic update.
    setLiked(nextValue);
    if (nextValue) {
      setBump(true);
      setTimeout(() => {
        if (mountedRef.current) setBump(false);
      }, 220);
    }
    setActionLoading(true);

    try {
      const res = previous
        ? await api.unlikeGame(gameId)
        : await api.likeGame(gameId);
      // Trust the server's value only if it actually returned one.
      const confirmed = res?.data?.liked ?? res?.liked;
      if (mountedRef.current && typeof confirmed === "boolean") {
        setLiked(confirmed);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setLiked(previous); // revert
      if (err?.status === 401) {
        handleAuthExpired();
        toast.show("Log in to like games", { type: "info" });
      } else {
        toast.show("Could not update liked games. Please try again.", {
          type: "error",
        });
      }
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  }, [actionLoading, isAuthenticated, liked, gameId, toast, handleAuthExpired]);

  const label = liked ? "Unlike game" : "Like game";

  return (
    <button
      type="button"
      className={
        "game-controls__btn game-controls__btn--like" +
        (liked ? " is-liked" : "") +
        (bump ? " is-bump" : "")
      }
      onClick={onClick}
      disabled={actionLoading}
      aria-pressed={liked}
      aria-label={label}
      title={label}
      style={statusLoading ? { opacity: 0.55 } : undefined}
    >
      <IconHeart filled={liked} />
      <span>{liked ? "Liked" : "Like"}</span>
    </button>
  );
}
