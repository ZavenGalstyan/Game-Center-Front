import { useEffect, useRef, useState } from "react";
import { Icon, Stars } from "../components/ui.jsx";
import PatientFigure from "../components/PatientFigure.jsx";
import { audio } from "../audio/audio.js";

/**
 * Results. The Before/After images are rendered from the REAL session
 * state: BEFORE is the level's deterministic starting mouth, AFTER is the
 * finished mouth exactly as the player left it.
 */
export default function TreatmentComplete({ data, level, patient, hasNext, reduced, onNext, onReplay, onPatients }) {
  const { result, stars, prevStars, before, after, unlockedNext } = data;
  const [shown, setShown] = useState(reduced ? stars : 0);
  useEffect(() => {
    if (reduced) return undefined;
    const ids = [];
    for (let i = 0; i < stars; i++) {
      ids.push(
        setTimeout(() => {
          setShown(i + 1);
          audio.star(i);
        }, 700 + i * 260),
      );
    }
    return () => ids.forEach(clearTimeout);
  }, [stars, reduced]);

  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="dst-screen dst-done">
      <div className="dst-done__compare">
        <BeforeAfter before={before} after={after} reduced={reduced} />
      </div>
      <div className="dst-card dst-done__card">
        <div className="dst-done__top">
          <div className="dst-done__face">
            <PatientFigure patient={patient} head mood="beam" />
          </div>
          <div>
            <p className="dst-done__kicker">TREATMENT COMPLETE</p>
            <h2>{level.name}</h2>
          </div>
        </div>
        <Stars n={shown} size={30} className="dst-done__stars" />
        {stars > prevStars && prevStars > 0 && <p className="dst-good">New best!</p>}
        <dl className="dst-done__stats">
          <div>
            <dt>Cleanliness</dt>
            <dd>{pct(result.cleanliness)}</dd>
          </div>
          <div>
            <dt>Precision</dt>
            <dd>{pct(result.precision)}</dd>
          </div>
          <div>
            <dt>Procedures</dt>
            <dd>
              {result.procedures} / {result.proceduresTotal}
            </dd>
          </div>
          <div>
            <dt>Hints</dt>
            <dd>{result.hints}</dd>
          </div>
        </dl>
        {result.optional.length > 0 && (
          <ul className="dst-done__opt">
            {result.optional.map((o) => (
              <li key={o.id} className={o.done ? "is-done" : ""}>
                <span className="dst-done__tick">{o.done ? <Icon name="check" size={12} stroke={3} /> : null}</span>
                {o.label}
              </li>
            ))}
          </ul>
        )}
        <p className="dst-done__rule">
          ★★ 85%+ cleanliness · ★★★ also every optional detail with at most 3 hints
        </p>
        {unlockedNext && hasNext && <p className="dst-good">A new patient is waiting!</p>}
        <div className="dst-row">
          <button type="button" className="dst-btn" onClick={onPatients}>
            <Icon name="users" size={16} /> Patients
          </button>
          <button type="button" className="dst-btn" onClick={onReplay}>
            <Icon name="replay" size={16} /> Replay
          </button>
          {hasNext && (
            <button type="button" className="dst-btn dst-btn--primary" onClick={onNext} autoFocus>
              Next patient <Icon name="play" size={14} fill />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BeforeAfter({ before, after, reduced }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(reduced ? 50 : 100);
  const dragging = useRef(false);
  useEffect(() => {
    if (reduced) return undefined;
    // a short controlled sweep: BEFORE wipes away to reveal AFTER, then settles mid-way
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      if (dragging.current) return;
      const t = Math.min(1, (now - t0) / 1100);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      setPos(100 - 50 * e);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    const id = setTimeout(() => (raf = requestAnimationFrame(step)), 250);
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const move = (ev) => {
    const r = ref.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)));
  };
  if (!before || !after) return <div className="dst-ba dst-ba--empty">Before / After unavailable</div>;
  return (
    <div
      className="dst-ba"
      ref={ref}
      onPointerDown={(ev) => {
        dragging.current = true;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        move(ev);
      }}
      onPointerMove={(ev) => dragging.current && move(ev)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
        if (ev.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
      }}
    >
      <img src={after} alt="After treatment" draggable={false} />
      <div className="dst-ba__before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="Before treatment" draggable={false} />
      </div>
      <div className="dst-ba__handle" style={{ left: `${pos}%` }}>
        <span>
          <Icon name="zoomL" size={12} stroke={3} />
          <Icon name="zoomR" size={12} stroke={3} />
        </span>
      </div>
      <span className="dst-ba__tag dst-ba__tag--l">BEFORE</span>
      <span className="dst-ba__tag dst-ba__tag--r">AFTER</span>
    </div>
  );
}
