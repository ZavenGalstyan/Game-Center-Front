import { IconBack, IconCheck, IconLock } from "../components/uiIcons.jsx";
import { ACHIEVEMENTS } from "../data/achievements.js";

export default function Achievements({ earnedIds, onBack }) {
  const earned = new Set(earnedIds);
  return (
    <div className="em-screen em-achievements">
      <div className="em-screen__head">
        <button type="button" className="em-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Achievements</h2>
        <span className="em-book__total">{earned.size} / {ACHIEVEMENTS.length}</span>
      </div>
      <div className="em-achievements__list">
        {ACHIEVEMENTS.map((a) => {
          const done = earned.has(a.id);
          return (
            <div key={a.id} className={`em-ach-row${done ? " em-ach-row--done" : ""}`}>
              <span className="em-ach-row__icon">{done ? <IconCheck /> : <IconLock />}</span>
              <div className="em-ach-row__text">
                <span className="em-ach-row__name">{a.name}</span>
                <span className="em-ach-row__desc">{a.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
