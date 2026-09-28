/**
 * Boxing Club — main menu: your fighter shadow-boxing in a dim gym, the
 * title, six buttons and your record. Everything fits the stage (no scroll).
 */
import GymBackdrop from "../components/GymBackdrop.jsx";
import FighterCanvas from "../components/FighterCanvas.jsx";
import { Icon } from "../components/icons.jsx";
import { OPPONENTS } from "../data/opponents.js";
import { careerIndex } from "../utils/progress.js";

export default function MainMenu({ progress, playerLook, settings, onCareer, onTraining, onFighter, onGloves, onStats, onSettings }) {
  const st = progress.statistics;
  const idx = careerIndex(progress);
  const next = OPPONENTS[idx];
  return (
    <div className="bc-menu">
      <GymBackdrop detail={settings.graphics} />
      <div className="bc-menu__fighter">
        <FighterCanvas look={playerLook} animate={!settings.reducedMotion} punches />
      </div>
      <div className="bc-menu__panel">
        <h1 className="bc-logo">
          <span className="bc-logo__top">BOXING</span>
          <span className="bc-logo__bottom">CLUB</span>
        </h1>
        <p className="bc-tagline">TRAIN <i>•</i> FIGHT <i>•</i> BECOME CHAMPION</p>
        <div className="bc-menu__buttons">
          <button type="button" className="bc-btn bc-btn--primary bc-btn--big" onClick={onCareer} autoFocus>
            <Icon.trophy /> Career
            <small>{progress.champion ? "Champion — defend the belt" : next ? `Next: ${next.name}` : ""}</small>
          </button>
          <div className="bc-menu__grid">
            <button type="button" className="bc-btn" onClick={onTraining}><Icon.bag /> Training</button>
            <button type="button" className="bc-btn" onClick={onFighter}><Icon.user /> Fighter</button>
            <button type="button" className="bc-btn" onClick={onGloves}><Icon.glove /> Gloves</button>
            <button type="button" className="bc-btn" onClick={onStats}><Icon.stats /> Statistics</button>
          </div>
          <button type="button" className="bc-btn bc-btn--ghost" onClick={onSettings}><Icon.gear /> Settings</button>
        </div>
        <div className="bc-record">
          <span className="bc-record__label">RECORD</span>
          <b>{st.wins}–{st.losses}{st.draws ? `–${st.draws}` : ""}</b>
          <span>{st.kos} KO{st.kos === 1 ? "" : "s"}</span>
          {progress.fighter.tp > 0 && <span className="bc-record__tp"><Icon.bolt /> {progress.fighter.tp} TP to spend</span>}
        </div>
      </div>
    </div>
  );
}
