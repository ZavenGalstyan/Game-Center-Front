/** Car Wash Studio — job select: 5 locations x 10 jobs. */
import { useState } from "react";
import { Icon } from "../components/icons.jsx";
import { JOBS, LOCATIONS } from "../data/jobs.js";
import { STAGES } from "../engine/stages.js";
import { carThumb } from "../render/viewRender.js";

function Stars({ n, size }) {
  return (
    <span className="cws-stars" style={size ? { fontSize: size } : undefined}>
      {[0, 1, 2].map((i) => <Icon.star key={i} on={i < n} />)}
    </span>
  );
}
export { Stars };

export default function JobSelect({ progress, initialLocation = 1, onLocation, onPlay, onBack }) {
  const [locId, setLocId] = useState(initialLocation);
  const loc = LOCATIONS[locId - 1];
  const jobs = JOBS.filter((j) => j.location === locId);
  const locStars = jobs.reduce((a, j) => a + (progress.jobs[j.id]?.stars || 0), 0);
  const locOpen = jobs[0].id <= progress.unlocked;
  const pickLoc = (id) => {
    setLocId(id);
    onLocation?.(id);
  };
  return (
    <div className="cws-screen cws-list">
      <header className="cws-head">
        <button type="button" className="cws-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Jobs</h2>
        <span className="cws-head__meta"><Icon.star on /> {locStars}/30</span>
      </header>
      <nav className="cws-tabs" aria-label="Locations">
        {LOCATIONS.map((l) => {
          const open = JOBS.find((j) => j.location === l.id).id <= progress.unlocked;
          return (
            <button key={l.id} type="button" className={`cws-tab${l.id === locId ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => pickLoc(l.id)}>
              {!open && <Icon.lock />}
              <span>{l.name}</span>
            </button>
          );
        })}
      </nav>
      <p className="cws-blurb">{loc.blurb}</p>
      <div className="cws-jobgrid">
        {jobs.map((j) => {
          const rec = progress.jobs[j.id];
          const locked = j.id > progress.unlocked;
          const resume = progress.current?.jobId === j.id;
          const hasInt = !!j.interior;
          return (
            <button key={j.id} type="button" className={`cws-jobcard${locked ? " is-locked" : ""}${rec?.completed ? " is-done" : ""}`}
              disabled={locked} onClick={() => onPlay(j.id)}
              title={locked ? "Complete the previous job to unlock" : j.stages.map((s) => STAGES[s].label).join(" · ")}>
              <span className="cws-jobcard__num">{String(j.id).padStart(2, "0")}</span>
              {resume && <span className="cws-badge">IN PROGRESS</span>}
              <span className="cws-jobcard__img">
                {locked ? <Icon.lock /> : <img src={carThumb(j, 220, 96)} alt="" draggable="false" />}
              </span>
              <span className="cws-jobcard__name">{locked ? "Locked" : j.name}</span>
              <span className="cws-jobcard__foot">
                <Stars n={rec?.stars || 0} />
                {!locked && hasInt && <em>+ interior</em>}
              </span>
            </button>
          );
        })}
      </div>
      {!locOpen && <p className="cws-note">Finish the previous location's jobs to open {loc.name}.</p>}
    </div>
  );
}
