import ClinicScene from "../components/ClinicScene.jsx";
import { Icon, Stars, ToothMark } from "../components/ui.jsx";
import { getPatient } from "../data/patients.js";
import { getLevel, TOTAL_LEVELS } from "../data/levels.js";
import { totalStars, completedCount } from "../utils/progress.js";

/** Main menu: the studio itself is the backdrop; the next patient waits in the chair. */
export default function MainMenu({ progress, decor, onStart, onPatients, onTools, onStudio, onStats, onSettings }) {
  const next = getLevel(progress.current?.levelId || Math.min(progress.unlocked, TOTAL_LEVELS));
  const patient = getPatient(next?.patient || "mia");
  const done = completedCount(progress);
  return (
    <div className="dst-screen dst-menu">
      <ClinicScene decor={decor} patient={patient} mood="calm" pan={300} className="dst-menu__scene" />
      <div className="dst-menu__panel">
        <div className="dst-logo">
          <ToothMark size={54} />
          <div>
            <h1>DENTIST STUDIO</h1>
            <p>CLEAN • TREAT • SMILE</p>
          </div>
        </div>
        <button type="button" className="dst-btn dst-btn--primary dst-btn--big" onClick={onStart}>
          <Icon name="play" size={18} fill /> {progress.current ? "CONTINUE" : "START"}
        </button>
        {next && (
          <p className="dst-menu__next">
            Next: <strong>{patient.name}</strong> · {next.caseType}
          </p>
        )}
        <div className="dst-menu__grid">
          <button type="button" className="dst-btn" onClick={onPatients}>
            <Icon name="users" size={16} /> PATIENTS
          </button>
          <button type="button" className="dst-btn" onClick={onTools}>
            <Icon name="tools" size={16} /> TOOLS
          </button>
          <button type="button" className="dst-btn" onClick={onStudio}>
            <Icon name="studio" size={16} /> STUDIO
          </button>
          <button type="button" className="dst-btn" onClick={onStats}>
            <Icon name="chart" size={16} /> STATISTICS
          </button>
          <button type="button" className="dst-btn dst-btn--wide" onClick={onSettings}>
            <Icon name="gear" size={16} /> SETTINGS
          </button>
        </div>
        <div className="dst-menu__meta">
          <span>
            <Stars n={1} of={1} size={14} /> {totalStars(progress)} / {TOTAL_LEVELS * 3}
          </span>
          <span>
            {done} / {TOTAL_LEVELS} patients
          </span>
        </div>
      </div>
    </div>
  );
}
