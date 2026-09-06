import { useRef, useState, useEffect, useCallback, Suspense, lazy, useMemo } from "react";
import { resolveGame } from "../games/registry.js";

/**
 * Renders the playable game for a backend game id, looked up in the frontend
 * registry (src/games/registry.js). Mini-screen by default; the Fullscreen
 * button puts the wrapper element into the Fullscreen API (works for both
 * in-app components and iframe games).
 */
export default function GamePlayer({ gameId, title }) {
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const entry = resolveGame(gameId); // null | { kind: "component", load } | { kind: "iframe", src }

  const LazyGame = useMemo(
    () => (entry?.kind === "component" ? lazy(entry.load) : null),
    [entry],
  );

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen(); // Safari
      }
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    }
  }, []);

  if (!entry) {
    return (
      <div className="game-player game-player--placeholder">
        <p>This game isn&rsquo;t playable yet.</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`game-player ${isFullscreen ? "game-player--fs" : ""}`}
    >
      {entry.kind === "iframe" ? (
        <iframe
          src={entry.src}
          title={title}
          className="game-player__frame"
          allow="fullscreen; autoplay; gamepad; xr-spatial-tracking"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
          loading="lazy"
        />
      ) : (
        <Suspense fallback={<div className="game-player__loading">Loading game…</div>}>
          <div className="game-player__frame">
            <LazyGame />
          </div>
        </Suspense>
      )}

      <button
        type="button"
        className="game-player__fs-btn btn"
        onClick={toggleFullscreen}
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
    </div>
  );
}
