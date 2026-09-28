/**
 * Boxing Club — training hub: four drills, each with your best score and
 * medal. Medals award Training Points once per new medal level — practice
 * helps, but it's never a grind wall: fights award points too.
 */
import GymBackdrop from "../components/GymBackdrop.jsx";
import { Icon } from "../components/icons.jsx";
import { DRILLS } from "../engine/training.js";

const MEDAL = ["—", "BRONZE", "SILVER", "GOLD"];
const S = { viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" };
const ICON = {
  heavy: <svg {...S}><path d="M24 2v7" /><rect x="15" y="9" width="18" height="34" rx="8" /><path d="M15 18h18M15 34h18" /></svg>,
  speed: <svg {...S}><path d="M8 8h32" /><path d="M24 8v5" /><path d="M24 13c7 0 9 6 9 11 0 7-5 13-9 13s-9-6-9-13c0-5 2-11 9-11z" /></svg>,
  dodge: <svg {...S}><circle cx="30" cy="12" r="6" /><path d="M30 18c-6 4-10 10-10 22" /><path d="M6 20c6-2 10-1 13 1" /><path d="M9 14l-4 6 6 3" /></svg>,
  combo: <svg {...S}><circle cx="10" cy="24" r="6" /><circle cx="24" cy="24" r="6" /><circle cx="38" cy="24" r="6" /><path d="M16 24h2M30 24h2" /></svg>,
};

export default function TrainingMenu({ progress, onDrill, onBack }) {
  return (
    <div className="bc-training">
      <GymBackdrop ring={false} />
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Training</h2>
        <span className="bc-head__meta"><Icon.bolt /> {progress.fighter.tp} TP</span>
      </header>
      <div className="bc-drills">
        {Object.values(DRILLS).map((d) => {
          const rec = progress.training[d.id];
          return (
            <button key={d.id} type="button" className={`bc-drill medal-${rec.medal}`} onClick={() => onDrill(d.id)}>
              <span className="bc-drill__icon" aria-hidden="true">{ICON[d.id]}</span>
              <b>{d.name}</b>
              <span className="bc-drill__blurb">{d.blurb}</span>
              <span className="bc-drill__rec">
                <span>BEST <b>{rec.best}</b></span>
                <span className={`bc-medal m${rec.medal}`}>{MEDAL[rec.medal]}</span>
              </span>
              <span className="bc-drill__goals">{d.medals.map((m, i) => <i key={i} className={rec.medal > i ? "is-on" : ""}>{m}</i>)}</span>
            </button>
          );
        })}
      </div>
      <p className="bc-training__note">Each new medal (bronze → silver → gold) earns 1 Training Point. Spend them on the Fighter screen.</p>
    </div>
  );
}
