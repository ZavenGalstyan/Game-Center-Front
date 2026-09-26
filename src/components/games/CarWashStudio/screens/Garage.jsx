/**
 * Car Wash Studio — garage: the collection of cars you've detailed.
 * Not a store. Selecting a cleaned car shows its original dirty state
 * (rebuilt from the job's seed by the real engine) next to its clean finish.
 */
import { useEffect, useState } from "react";
import { Icon } from "../components/icons.jsx";
import { JOBS, LOCATIONS } from "../data/jobs.js";
import { BODIES } from "../data/bodies.js";
import { carThumb, snapshot } from "../render/viewRender.js";
import { JobSession } from "../engine/session.js";
import { Stars } from "./JobSelect.jsx";

function Detail({ job, rec, onClose }) {
  const [dirty, setDirty] = useState(null);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      try {
        const url = snapshot(new JobSession(job), job, "left", 640, 300).toDataURL("image/jpeg", 0.85);
        if (alive) setDirty(url);
      } catch {
        if (alive) setDirty("");
      }
    }, 60);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [job]);
  const t = rec.bestTime || 0;
  return (
    <div className="cws-modal" role="dialog" aria-label={job.name} onClick={onClose}>
      <div className="cws-modal__card cws-garage__detail" onClick={(e) => e.stopPropagation()}>
        <h3>{job.name}</h3>
        <p className="cws-modal__sub">{BODIES[job.vehicle.body].name} · {LOCATIONS[job.location - 1].name}</p>
        <div className="cws-garage__pair">
          <figure>
            {dirty ? <img src={dirty} alt="Original dirty state" /> : <div className="cws-garage__wait">{dirty === "" ? "Unavailable" : "Rebuilding…"}</div>}
            <figcaption>As it arrived</figcaption>
          </figure>
          <figure>
            <img className="cws-garage__clean" src={carThumb(job, 640, 300)} alt="Clean finish" />
            <figcaption>Best finish</figcaption>
          </figure>
        </div>
        <div className="cws-garage__facts">
          <span><Stars n={rec.stars} /></span>
          <span>Cleaned {rec.completed}×</span>
          <span>Best cleanliness {Math.round(rec.bestClean * 100)}%</span>
          <span>Best time {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, "0")}</span>
        </div>
        <div className="cws-modal__actions">
          <button type="button" className="cws-btn cws-btn--primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Garage({ progress, onBack }) {
  const [sel, setSel] = useState(null);
  const cleaned = JOBS.filter((j) => progress.jobs[j.id]?.completed > 0).length;
  return (
    <div className="cws-screen cws-list">
      <header className="cws-head">
        <button type="button" className="cws-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Garage</h2>
        <span className="cws-head__meta"><Icon.car /> {cleaned}/{JOBS.length}</span>
      </header>
      <p className="cws-blurb">Every car you've brought back to showroom shine. Tap one to compare how it arrived.</p>
      <div className="cws-jobgrid cws-jobgrid--garage">
        {JOBS.map((j) => {
          const rec = progress.jobs[j.id];
          const has = rec?.completed > 0;
          const seen = j.id <= progress.unlocked;
          return (
            <button key={j.id} type="button" className={`cws-jobcard${has ? " is-done" : " is-locked"}`} disabled={!has} onClick={() => setSel(j)}>
              <span className="cws-jobcard__num">{String(j.id).padStart(2, "0")}</span>
              <span className="cws-jobcard__img">
                {seen ? <img className={has ? "" : "is-silhouette"} src={carThumb(j, 220, 96)} alt="" draggable="false" /> : <Icon.lock />}
              </span>
              <span className="cws-jobcard__name">{has ? j.name : seen ? "Not cleaned yet" : "Unknown"}</span>
              <span className="cws-jobcard__foot">{has ? <Stars n={rec.stars} /> : <em>{BODIES[j.vehicle.body].name}</em>}</span>
            </button>
          );
        })}
      </div>
      {sel && <Detail job={sel} rec={progress.jobs[sel.id]} onClose={() => setSel(null)} />}
    </div>
  );
}
