import { ElementIcon } from "../components/icons.jsx";
import { IconBook, IconChart, IconSettings, IconTrophy, IconFlag, IconPlay } from "../components/uiIcons.jsx";

const ORBIT = ["fire", "water", "earth", "air"];

export default function MainMenu({ discoveredCount, totalCount, onPlay, onBook, onChapters, onAchievements, onStats, onSettings }) {
  return (
    <div className="em-menu">
      <div className="em-menu__orbit" aria-hidden="true">
        <div className="em-menu__orbit-core" />
        {ORBIT.map((id, i) => (
          <div key={id} className="em-menu__orbit-item" style={{ "--i": i }}>
            <ElementIcon id={id} family="energy" />
          </div>
        ))}
      </div>

      <h1 className="em-menu__title">Element Merge</h1>
      <p className="em-menu__tagline">MIX • DISCOVER • CREATE</p>

      <div className="em-menu__progress">{discoveredCount} / {totalCount} discovered</div>

      <button type="button" className="em-btn em-btn--primary em-btn--lg em-menu__play" onClick={onPlay}>
        <IconPlay /> Play
      </button>
      <div className="em-menu__buttons">
        <button type="button" className="em-btn em-btn--ghost" onClick={onBook}><IconBook /> Discovery Book</button>
        <button type="button" className="em-btn em-btn--ghost" onClick={onChapters}><IconFlag /> Chapters</button>
        <button type="button" className="em-btn em-btn--ghost" onClick={onAchievements}><IconTrophy /> Achievements</button>
        <button type="button" className="em-btn em-btn--ghost" onClick={onStats}><IconChart /> Statistics</button>
        <button type="button" className="em-btn em-btn--ghost em-menu__settings" onClick={onSettings}><IconSettings /> Settings</button>
      </div>
    </div>
  );
}
