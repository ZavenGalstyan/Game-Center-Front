import { useCallback, useEffect, useRef, useState } from "react";
import GameControls from "./GameControls.jsx";

/**
 * Reusable game player shell for the Game Center.
 *
 * Renders a responsive 16:9 stage with a small control toolbar (Restart /
 * Mute / Fullscreen). The actual game is passed in as `children` and can be
 * anything — a React component (Chess board, puzzle grid, arcade canvas...),
 * plain HTML, or an <iframe>. With no children it shows a neutral
 * "Game will load here" placeholder.
 *
 * Fullscreen applies to THIS container only, never the whole page. The button
 * label follows the browser's real fullscreen state (via `fullscreenchange`),
 * so leaving fullscreen with ESC keeps the UI correct.
 *
 * Props:
 *  - title:        accessible label for the stage (e.g. the game name)
 *  - children:     the game content (optional)
 *  - onRestart:    handler for the Restart button. Omit to leave it disabled
 *                  until a game provides one.
 *  - onToggleMute: handler for the Mute/Unmute button. Omit to leave it disabled.
 *  - muted:        current mute state, drives the Mute button label/icon.
 */
export default function GamePlayer({
  title = "Game",
  children,
  onRestart,
  onToggleMute,
  muted = false,
}) {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Trust the browser, not the button — covers ESC and the browser's own UI.
  useEffect(() => {
    const sync = () => {
      const el = containerRef.current;
      const fsEl =
        document.fullscreenElement || document.webkitFullscreenElement || null;
      setIsFullscreen(Boolean(el) && fsEl === el);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const fsEl =
        document.fullscreenElement || document.webkitFullscreenElement || null;
      if (fsEl) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (err) {
      // Unsupported, or the gesture requirement wasn't met — keep UI state as-is.
      console.warn("Fullscreen toggle failed:", err);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`game-player${isFullscreen ? " game-player--fullscreen" : ""}`}
    >
      <GameControls
        isFullscreen={isFullscreen}
        muted={muted}
        onToggleFullscreen={toggleFullscreen}
        onRestart={onRestart}
        onToggleMute={onToggleMute}
      />

      <div
        className="game-player__stage"
        role="group"
        aria-label={`${title} player`}
      >
        {children ?? (
          <div className="game-player__placeholder">
            <p className="game-player__placeholder-text">Game will load here</p>
          </div>
        )}
      </div>
    </div>
  );
}
