import MenuShowcase from "../game/MenuShowcase.jsx";
import { BladeIcon } from "../game/icons.jsx";
import { TOTAL_STAGES } from "../data/stages.js";
import { totalPossibleStars } from "../utils/progression.js";

export default function BladeMenu({ state, skin, onPlay, onStageSelect, onBlades, onStatistics, onSettings }) {
  const stagesDone = state.statistics.stagesCompleted;
  const stars = state.statistics.totalStars;
  const bosses = state.statistics.bossesDefeated;

  return (
    <div className="br-menu">
      <div className="br-menu__showcase">
        <MenuShowcase targetId="cedarShield" skin={skin} />
      </div>

      <div className="br-menu__title">
        <h1 className="br-menu__title-text">BLADE<br />RUSH</h1>
        <p className="br-menu__tagline">THROW &bull; TIME &bull; BREAK</p>
      </div>

      <div className="br-menu__stats">
        <div className="br-menu__stat"><span className="br-menu__stat-num">{stagesDone}/{TOTAL_STAGES}</span><span className="br-menu__stat-label">STAGES</span></div>
        <div className="br-menu__stat"><span className="br-menu__stat-num">{stars}/{totalPossibleStars()}</span><span className="br-menu__stat-label">STARS</span></div>
        <div className="br-menu__stat"><span className="br-menu__stat-num">{bosses}/10</span><span className="br-menu__stat-label">BOSSES</span></div>
      </div>

      <div className="br-menu__actions">
        <button type="button" className="br-btn br-btn--primary br-btn--big" onClick={onPlay}>PLAY</button>
        <div className="br-menu__row">
          <button type="button" className="br-btn" onClick={onStageSelect}>STAGE SELECT</button>
          <button type="button" className="br-btn" onClick={onBlades}><BladeIcon /> BLADES</button>
        </div>
        <div className="br-menu__row">
          <button type="button" className="br-btn br-btn--ghost" onClick={onStatistics}>STATISTICS</button>
          <button type="button" className="br-btn br-btn--ghost" onClick={onSettings}>SETTINGS</button>
        </div>
      </div>
    </div>
  );
}
