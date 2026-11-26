import { Suspense, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { getGameComponent } from "./registry.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { BAKED_TEXT_GAMES, GAME_CATALOG_IDS } from "../../i18n/gameCatalogIds.js";
import { attachDomTranslator, peekGameTranslator, setCanvasTranslator } from "../../i18n/gameTranslator.js";

/**
 * Renders the playable game for a backend `game` inside <GamePlayer>.
 *
 * Unknown games render nothing so <GamePlayer> falls back to its placeholder.
 * `restartNonce` is the incrementing counter behind the Game Single Page's
 * Restart button; it's passed through as `restartSignal` so a game can decide
 * what "restart" means for its current screen (Classic Chess restarts the
 * active match, not its menu; Delivery Rush restarts the current mission).
 *
 * `muted` is the Game Single Page's mute state. Games that don't take the prop
 * simply ignore it — see MUTE_AWARE in registry.js for the ones that do.
 *
 * The Suspense boundary is here for games registered as lazy chunks (Delivery
 * Rush ships its own WebGL renderer and is only fetched when someone opens it).
 * It also covers the game's Russian catalog, so a game opened in Russian never
 * flashes English first.
 *
 * The game mounts only after the page around it has painted once. Many games
 * do a long synchronous setup on mount (WebGL scenes, level generation); this
 * keeps the title, controls and "Loading game…" on screen during it instead
 * of a blank route. It is state, not suspension, so the page's own commit is
 * never held back by React's reveal throttling for nested Suspense.
 */
export default function GameRenderer({ game, restartNonce = 0, muted = false }) {
  const { t, lang } = useTranslation();
  const painted = useAfterFirstPaint();
  const Game = getGameComponent(game);
  if (!Game) return null;
  const catalogId = GAME_CATALOG_IDS[String(game.name ?? "").trim().replace(/\s+/g, " ").toLowerCase()];
  const fallback = (
    <div className="game-player__placeholder">
      <p className="game-player__placeholder-text">{t("Loading game…")}</p>
    </div>
  );
  if (!painted) return fallback;
  return (
    <Suspense fallback={fallback}>
      <LocalizedGame catalogId={catalogId} lang={lang}>
        <Game game={game} restartSignal={restartNonce} muted={muted} />
      </LocalizedGame>
    </Suspense>
  );
}

/** True from the first frame after mount (100 ms at most, e.g. in a background tab). */
function useAfterFirstPaint() {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const done = () => setPainted(true);
    let timer;
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(done, 0);
    });
    const cap = setTimeout(done, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(cap);
    };
  }, []);
  return painted;
}

/**
 * Applies the game's translation catalog to everything the game renders
 * (DOM text + canvas text) while the UI language is Russian, and restores the
 * English originals when the player switches back — without remounting the
 * game, so switching language mid-run keeps the run. The exception is a game
 * that bakes text into textures (signs on a 3D wall, cached sprites): those were
 * drawn in the old language and only a fresh start redraws them.
 */
function LocalizedGame({ catalogId, lang, children }) {
  const rootRef = useRef(null);
  const mounted = useRef(false);
  const startLang = useRef(lang);
  const [, rerender] = useReducer((n) => n + 1, 0);

  let translator = null;
  if (lang === "ru" && catalogId) {
    const entry = peekGameTranslator(catalogId);
    if (entry?.status === "pending") {
      // First open: wait in the Suspense fallback. Mid-game switch: keep the
      // game on screen and translate as soon as the catalog arrives.
      if (!mounted.current) throw entry.promise;
      entry.promise.then(rerender);
    } else if (entry) {
      translator = entry.value;
    }
  }
  // Canvas text drawn during the game's own first effects must already see it.
  if (translator) setCanvasTranslator(translator);

  useEffect(() => {
    mounted.current = true;
  }, []);

  useEffect(() => {
    if (lang !== startLang.current && BAKED_TEXT_GAMES.includes(catalogId)) window.location.reload();
  }, [lang, catalogId]);

  useLayoutEffect(() => {
    if (!translator || !rootRef.current) return undefined;
    setCanvasTranslator(translator);
    const detach = attachDomTranslator(rootRef.current, translator);
    return () => {
      detach();
      setCanvasTranslator(null);
    };
  }, [translator]);

  return (
    <div ref={rootRef} className="game-player__i18n-root">
      {children}
    </div>
  );
}
