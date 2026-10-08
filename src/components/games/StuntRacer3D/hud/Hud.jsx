/**
 * Stunt Racer 3D — the in-run HUD (DOM over the canvas). Minimal: level,
 * timer (+ best), stars, speedometer, nitro meter, callouts (checkpoints,
 * stars, clean landings…) and the speed warning before loops / signed jumps.
 * Everything is sampled from the mutable run at 15–20 Hz — the HUD never
 * re-renders at frame rate.
 */
import { kmh } from "../engine/car.js";
import { STATE } from "../engine/run.js";
import { useSample, fmtTime } from "./useSample.js";

function StarIcon({ on, size = "1em" }) {
  return (
    <svg className={`sr-staricon${on ? " is-on" : ""}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 2.2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.2 6 20.5l1.3-6.7-5-4.6 6.8-.8z" />
    </svg>
  );
}
export { StarIcon };

/** Upcoming requirement (loop / signed jump) and whether we're short of it. */
function upcomingNeed(run) {
  const T = run.T;
  const s = run.car.s;
  let need = null;
  for (const lp of T.loops) {
    const d = lp.s0 - s;
    if (d > 0 && d < 150 && (!need || d < need.d)) need = { kind: "LOOP", kmh: lp.minKmh, d };
  }
  for (const r of T.ramps) {
    if (!r.minKmh) continue;
    const d = r.s0 - s;
    if (d > 0 && d < 130 && (!need || d < need.d)) need = { kind: "JUMP", kmh: r.minKmh, d };
  }
  return need;
}

export default function Hud({ run, def, world, best, callouts, touch }) {
  const sample = useSample(
    () => {
      const c = run.car;
      const need = run.state === STATE.PLAYING ? upcomingNeed(run) : null;
      const sp = kmh(c);
      return {
        t: Math.floor(run.time * 10) / 10,
        kmh: sp,
        nitro: Math.round(c.nitro * 40) / 40,
        nitroOn: c.nitroOn,
        stars: run.stars.size,
        cp: run.cpIndex,
        warn: need && sp < need.kmh ? need : null,
        boost: c.boostT > 0,
        vmax: Math.round(c.p.vmax * 3.6),
      };
    },
    [run],
    20,
  );
  const T = run.T;
  const frac = Math.min(1, sample.kmh / (sample.vmax + 40));
  const arc = 251; // length of the gauge arc path
  return (
    <div className={`sr-hud${touch ? " sr-hud--touch" : ""}`}>
      <div className="sr-hud__level" style={{ "--accent": world.road.accent }}>
        <span className="sr-hud__lnum">LEVEL {def.id}</span>
        <span className="sr-hud__lname">{def.name}</span>
      </div>
      <div className="sr-hud__timer">
        <div className="sr-hud__time">{fmtTime(sample.t)}</div>
        <div className="sr-hud__best">{best ? `BEST ${fmtTime(best)}` : `GOLD ${fmtTime(def.medals ? def.medals.gold : null)}`}</div>
      </div>
      <div className="sr-hud__right">
        <div className="sr-hud__stars" aria-label={`${sample.stars} of ${T.stars.length} stars`}>
          {T.stars.map((_, i) => (
            <StarIcon key={i} on={i < sample.stars} />
          ))}
        </div>
        {T.checkpoints.length > 0 && (
          <div className="sr-hud__cps">
            CHECKPOINTS {sample.cp}/{T.checkpoints.length}
          </div>
        )}
      </div>
      <div className="sr-hud__gauge">
        <svg viewBox="0 0 200 120" aria-hidden="true">
          <path d="M20 110 A80 80 0 0 1 180 110" className="sr-gauge__bg" />
          <path d="M20 110 A80 80 0 0 1 180 110" className={`sr-gauge__fg${sample.nitroOn ? " is-nitro" : ""}`} style={{ strokeDasharray: arc, strokeDashoffset: arc * (1 - frac) }} />
        </svg>
        <div className="sr-gauge__num">{sample.kmh}</div>
        <div className="sr-gauge__unit">KM/H</div>
      </div>
      <div className={`sr-hud__nitro${sample.nitroOn ? " is-on" : ""}${sample.nitro < 0.02 ? " is-empty" : ""}`}>
        <div className="sr-nitro__label">
          NITRO <kbd>{touch ? "N2O" : "Shift"}</kbd>
        </div>
        <div className="sr-nitro__bar">
          <div className="sr-nitro__fill" style={{ transform: `scaleX(${sample.nitro})` }} />
          {[0.25, 0.5, 0.75].map((x) => (
            <i key={x} style={{ left: `${x * 100}%` }} />
          ))}
        </div>
      </div>
      {sample.warn && (
        <div className="sr-hud__warn" key={sample.warn.kind}>
          <b>{sample.warn.kind} AHEAD</b> · SPEED REQUIRED {sample.warn.kmh} KM/H
          <small>{touch ? "hold N2O" : "hold Shift for nitro"}</small>
        </div>
      )}
      <div className="sr-callouts">
        {callouts.map((c) => (
          <div key={c.id} className={`sr-callout sr-callout--${c.kind}`}>
            {c.text}
            {c.sub && <small>{c.sub}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Countdown({ value }) {
  if (value == null) return null;
  return (
    <div className="sr-countdown" key={value}>
      <span className={value === "GO!" ? "is-go" : ""}>{value}</span>
    </div>
  );
}
