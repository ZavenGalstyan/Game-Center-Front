import { useEffect, useRef, useState } from "react";
import "./ClassicChess.css";
import ChessMenu from "./ChessMenu.jsx";
import ChessSettings from "./ChessSettings.jsx";
import ChessBoard from "./ChessBoard.jsx";
import { loadSettings, saveSettings } from "./settings.js";

/**
 * Classic Chess — a self-contained game with its own internal menu.
 *
 * Everything renders inside the one shared <GamePlayer> window. At any moment
 * exactly one of three screens is shown: menu, settings, or the active match.
 * No side panels, no route changes.
 *
 *   first open ............ menu
 *   "Play with AI" ........ match (user White, AI Black)
 *   "Play Local" .......... match (two players, same device)
 *   "Settings" ........... settings screen (Back returns to menu)
 *   "Menu" (in match) .... back to menu (current match is discarded)
 *
 * `restartSignal` is the incrementing counter behind the GamePlayer Restart
 * button — bumping it restarts the current match, and is a no-op on the
 * menu / settings screens.
 */

const DEFAULT_SCREEN = "menu";

export default function ClassicChess({ restartSignal = 0 }) {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState(DEFAULT_SCREEN); // menu | settings | game
  const [mode, setMode] = useState("ai"); // ai | local
  const [matchKey, setMatchKey] = useState(0); // bump to (re)start a match

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Outer Restart button: only meaningful during a match.
  const seenSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenSignal.current) return;
    seenSignal.current = restartSignal;
    if (screen === "game") setMatchKey((k) => k + 1);
  }, [restartSignal, screen]);

  const startGame = (nextMode) => {
    setMode(nextMode);
    setMatchKey((k) => k + 1);
    setScreen("game");
  };

  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className={`chess chess--gfx-${settings.graphicsQuality}`}>
      {screen === "menu" && (
        <ChessMenu
          onPlayAI={() => startGame("ai")}
          onPlayLocal={() => startGame("local")}
          onSettings={() => setScreen("settings")}
        />
      )}

      {screen === "settings" && (
        <ChessSettings
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen("menu")}
        />
      )}

      {screen === "game" && (
        <ChessBoard
          key={matchKey}
          mode={mode}
          settings={settings}
          onMenu={() => setScreen("menu")}
        />
      )}
    </div>
  );
}
