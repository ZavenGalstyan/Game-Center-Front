/**
 * Mini Golf Journey — main menu. The first screen shown inside <GamePlayer>;
 * gameplay never starts on its own.
 */
import MenuScene from "../components/MenuScene.jsx";
import { IconPlay, IconGrid, IconChart, IconGear, IconFlag } from "../components/Icons.jsx";

export default function MiniGolfMenu({ state, animate, onPlay, onNavigate }) {
  const done = state.stats.levelsCompleted;
  const stars = state.stats.starsEarned;
  return (
    <div className="mgj-screen mgj-menu">
      <MenuScene animate={animate} />
      <div className="mgj-menu__scrim" />

      <div className="mgj-menu__content">
        <div className="mgj-menu__brand">
          <span className="mgj-menu__crest">
            <IconFlag />
          </span>
          <h1 className="mgj-menu__title">
            Mini Golf<span>Journey</span>
          </h1>
          <p className="mgj-menu__tagline">
            <span>Aim</span>
            <i />
            <span>Putt</span>
            <i />
            <span>Master</span>
          </p>
        </div>

        <nav className="mgj-menu__nav">
          <button type="button" className="mgj-btn mgj-btn--play" onClick={onPlay}>
            <IconPlay />
            Play
          </button>
          <div className="mgj-menu__row">
            <button type="button" className="mgj-btn mgj-menu__link" onClick={() => onNavigate("levelSelect")}>
              <IconGrid />
              Level Select
            </button>
            <button type="button" className="mgj-btn mgj-menu__link" onClick={() => onNavigate("stats")}>
              <IconChart />
              Statistics
            </button>
            <button type="button" className="mgj-btn mgj-menu__link" onClick={() => onNavigate("settings")}>
              <IconGear />
              Settings
            </button>
          </div>
        </nav>

        <p className="mgj-menu__footer">
          <span className="mgj-menu__footer-dot" />
          {done > 0 ? (
            <>
              <strong>{done}</strong>/50 holes · <strong>{stars}</strong> stars
            </>
          ) : (
            <>50 holes · 5 worlds · one calm afternoon</>
          )}
        </p>
      </div>
    </div>
  );
}
