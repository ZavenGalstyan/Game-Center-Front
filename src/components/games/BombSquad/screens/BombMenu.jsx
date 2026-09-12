import MenuShowcase from "../components/MenuShowcase.jsx";
import { TOTAL_MISSIONS } from "../data/missions.js";
import { totalPossibleStars } from "../systems/progressionSystem.js";

export default function BombMenu({ state, onPlay, onMissionSelect, onArchive, onStatistics, onSettings }) {
  const missionsDone = state.statistics.missionsCompleted;
  const stars = state.statistics.totalStars;
  const perfect = state.statistics.perfectDisarms;

  return (
    <div className="bs-menu">
      <div className="bs-menu__title">
        <h1 className="bs-menu__title-text">
          <span className="bs-menu__title-bomb">BOMB</span>
          <span className="bs-menu__title-squad">SQUAD</span>
        </h1>
        <p className="bs-menu__tagline">THINK &bull; DECODE &bull; DISARM</p>
      </div>

      <div className="bs-menu__showcase">
        <MenuShowcase reducedMotion={state.settings.reducedMotion} />
      </div>

      <div className="bs-menu__stats">
        <div className="bs-menu__stat"><span className="bs-menu__stat-num">{missionsDone}/{TOTAL_MISSIONS}</span><span className="bs-menu__stat-label">MISSIONS</span></div>
        <div className="bs-menu__stat"><span className="bs-menu__stat-num">{stars}/{totalPossibleStars()}</span><span className="bs-menu__stat-label">STARS</span></div>
        <div className="bs-menu__stat"><span className="bs-menu__stat-num">{perfect}</span><span className="bs-menu__stat-label">PERFECT DISARMS</span></div>
      </div>

      <div className="bs-menu__actions">
        <button type="button" className="bs-btn bs-btn--primary bs-btn--big" onClick={onPlay}>PLAY</button>
        <div className="bs-menu__row">
          <button type="button" className="bs-btn" onClick={onMissionSelect}>MISSION SELECT</button>
          <button type="button" className="bs-btn" onClick={onArchive}>DEVICE ARCHIVE</button>
        </div>
        <div className="bs-menu__row">
          <button type="button" className="bs-btn bs-btn--ghost" onClick={onStatistics}>STATISTICS</button>
          <button type="button" className="bs-btn bs-btn--ghost" onClick={onSettings}>SETTINGS</button>
        </div>
      </div>
    </div>
  );
}
