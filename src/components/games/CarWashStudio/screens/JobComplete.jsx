/**
 * Car Wash Studio — job complete: interactive Before / After slider built
 * from the ACTUAL job states (the untouched seeded start state and the
 * finished session, both rendered by the real compositor), results and stars.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/icons.jsx";
import { OPTIONAL } from "../engine/stages.js";
import { audio } from "../audio/audio.js";

function BeforeAfter({ before, after }) {
  const [pos, setPos] = useState(0.5);
  const ref = useRef(null);
  const drag = useRef(false);
  const setFrom = useCallback((clientX) => {
    const r = ref.current.getBoundingClientRect();
    setPos(Math.max(0.02, Math.min(0.98, (clientX - r.left) / r.width)));
  }, []);
  useEffect(() => {
    // one slow reveal sweep so the difference is obvious immediately
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1400);
      if (!drag.current) setPos(0.92 - 0.42 * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      className="cws-ba"
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFrom(e.clientX);
      }}
      onPointerMove={(e) => drag.current && setFrom(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onPointerCancel={() => (drag.current = false)}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => Math.max(0.02, p - 0.05));
        if (e.key === "ArrowRight") setPos((p) => Math.min(0.98, p + 0.05));
      }}
    >
      {after ? <img className="cws-ba__img" src={after} alt="After cleaning" draggable="false" /> : <div className="cws-ba__img" />}
      <div className="cws-ba__before" style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}>
        {before ? <img className="cws-ba__img" src={before} alt="Before cleaning" draggable="false" /> : <div className="cws-ba__img" />}
      </div>
      <span className="cws-ba__tag cws-ba__tag--l">BEFORE</span>
      <span className="cws-ba__tag cws-ba__tag--r">AFTER</span>
      <div className="cws-ba__handle" style={{ left: `${pos * 100}%` }}><i /></div>
    </div>
  );
}

const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

export default function JobComplete({ data, job, hasNext, onNext, onReplay, onJobs }) {
  const { result, stars } = data;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ids = [];
    for (let i = 0; i < stars; i++) {
      ids.push(setTimeout(() => {
        setShown(i + 1);
        audio.star(i);
      }, 700 + i * 320));
    }
    return () => ids.forEach(clearTimeout);
  }, [stars]);
  const mins = Math.floor(result.time / 60);
  const secs = Math.round(result.time % 60);
  const optional = job.optional || [];
  return (
    <div className="cws-screen cws-done">
      <header className="cws-done__head">
        <h2>JOB COMPLETE</h2>
        <p>Job {String(job.id).padStart(2, "0")} · {job.name}</p>
      </header>
      <div className="cws-done__body">
        <BeforeAfter before={data.before} after={data.after} />
        <div className="cws-done__side">
          <div className="cws-done__stars" aria-label={`${stars} stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`cws-bigstar${i < shown ? " is-on" : ""}`}><Icon.star on={i < shown} /></span>
            ))}
          </div>
          <dl className="cws-results">
            <div><dt>Cleanliness</dt><dd>{pct(result.cleanliness)}</dd></div>
            <div><dt>Exterior</dt><dd>{pct(result.exterior)}</dd></div>
            <div><dt>Wheels</dt><dd>{pct(result.wheels)}</dd></div>
            <div><dt>Interior</dt><dd>{result.interior == null ? "—" : pct(result.interior)}</dd></div>
            <div><dt>Optional details</dt><dd>{result.optDone}/{result.optTotal}</dd></div>
            <div><dt>Hints used</dt><dd>{result.hints}</dd></div>
            <div><dt>Time</dt><dd>{mins}:{String(secs).padStart(2, "0")}</dd></div>
          </dl>
          {optional.length > 0 && (
            <ul className="cws-optlist">
              {optional.map((id) => <li key={id} className={(result.optIds || []).includes(id) ? "is-done" : ""}>{OPTIONAL[id].label}</li>)}
            </ul>
          )}
          <p className="cws-done__tip">
            {stars < 2 ? "2 stars: finish with at most one hint." : stars < 3 ? "3 stars: also complete every optional detail." : "Perfect detail!"}
            {data.unlockedNext && hasNext ? " Next job unlocked." : ""}
          </p>
          <div className="cws-done__actions">
            {hasNext && <button type="button" className="cws-btn cws-btn--primary" onClick={onNext}><Icon.play /> NEXT JOB</button>}
            <button type="button" className="cws-btn" onClick={onReplay}>REPLAY</button>
            <button type="button" className="cws-btn" onClick={onJobs}><Icon.list /> JOB SELECT</button>
          </div>
        </div>
      </div>
    </div>
  );
}
