/**
 * Police Escape 3D — the in-mission HUD (DOM over the canvas). Compact:
 * mission + objective, timer (or time left), heat (pursuit intensity +
 * police count), objective arrow + distance, minimap, integrity, nitro,
 * speed, the bust meter, roadblock warnings and short callouts. Sampled from
 * the mutable mission at ~15–20 Hz — never re-renders at frame rate.
 */
import { kmh } from "../engine/car.js";
import { STATE } from "../engine/mission.js";
import { PSTATE } from "../engine/police.js";
import { fmtTime, useSample } from "./useSample.js";
import Minimap from "./Minimap.jsx";

/** Where the player should go now: { x, z, label }. */
export function objectiveOf(run) {
  if (run.cpIndex < run.checkpoints.length) {
    const cp = run.checkpoints[run.cpIndex];
    return { x: cp.x, z: cp.z, label: `CHECKPOINT ${run.cpIndex + 1}/${run.checkpoints.length}`, kind: "cp" };
  }
  const z = run.city.zone;
  if (!run.zoneOpen && run.heatLock) return { x: z.x, z: z.z, label: "LOSE THE POLICE", kind: "survive" };
  if (!run.zoneOpen) {
    const left = Math.max(0, (run.def.survive || 0) - run.time);
    return { x: z.x, z: z.z, label: `SURVIVE ${Math.ceil(left)}s`, kind: "survive" };
  }
  return { x: z.x, z: z.z, label: `ESCAPE → ${(z.kind || "garage").toUpperCase()}`, kind: "zone" };
}

export default function Hud({ run, def, world, best, callouts, touch }) {
  const s = useSample(
    () => {
      const c = run.player;
      const ob = objectiveOf(run);
      const dx = ob.x - c.x;
      const dz = ob.z - c.z;
      const ang = Math.atan2(dx, dz) - c.h;
      const live = run.police.filter((p) => p.state !== PSTATE.LOST);
      const near = live.reduce((m, p) => Math.min(m, p.distToPlayer), Infinity);
      let warn = null;
      for (const r of run.roadblocks) {
        const d = Math.hypot(r.x - c.x, r.z - c.z);
        const ahead = (dx2(r, c) * Math.sin(c.h) + dz2(r, c) * Math.cos(c.h)) / Math.max(1, d);
        if (d < 180 && ahead > 0.5 && !r.passed) warn = { d: Math.round(d), gap: r.gapSide };
      }
      return {
        t: Math.floor(run.time * 10) / 10,
        left: def.timeLimit ? Math.max(0, def.timeLimit - run.time) : null,
        kmh: kmh(c),
        nitro: Math.round(c.nitro * 40) / 40,
        nitroOn: c.nitroOn,
        integrity: Math.round(run.integrity),
        bust: Math.round(run.bust * 20) / 20,
        heat: run.intensity,
        cops: live.length,
        near: Number.isFinite(near) ? Math.round(near) : null,
        ob: ob.label,
        obKind: ob.kind,
        dist: Math.round(Math.hypot(dx, dz)),
        arrow: Math.round((ang * 180) / Math.PI),
        warn,
        playing: run.state === STATE.PLAYING,
        vmax: Math.round(c.p.vmax * 3.6),
      };
    },
    [run],
    16,
  );
  const frac = Math.min(1, s.kmh / (s.vmax + 50));
  const arc = 251;
  const intCls = s.integrity < 25 ? " is-crit" : s.integrity < 50 ? " is-low" : "";
  return (
    <div className={`pe-hud${touch ? " pe-hud--touch" : ""}`}>
      <div className="pe-hud__mission" style={{ "--accent": world.palette.neon[0] }}>
        <span className="pe-hud__mnum">MISSION {def.id}</span>
        <span className="pe-hud__mname">{def.name}</span>
        <span className={`pe-hud__obj pe-hud__obj--${s.obKind}`}>{s.ob}</span>
      </div>
      <div className="pe-hud__top">
        <div className={`pe-hud__time${s.left != null && s.left < 15 ? " is-urgent" : ""}`}>{s.left != null ? fmtTime(s.left) : fmtTime(s.t)}</div>
        <div className="pe-hud__sub">{s.left != null ? "TIME LEFT" : best ? `BEST ${fmtTime(best)}` : def.stars?.time ? `★★ ${fmtTime(def.stars.time)}` : "ESCAPE TIME"}</div>
        <div className="pe-hud__dir" aria-label={`Objective ${s.dist} metres`}>
          <svg viewBox="-20 -20 40 40" style={{ transform: `rotate(${-s.arrow}deg)` }} aria-hidden="true">
            <path d="M0 -15 L10 8 L0 3 L-10 8 Z" />
          </svg>
          <b>{s.dist >= 1000 ? `${(s.dist / 1000).toFixed(1)} km` : `${s.dist} m`}</b>
        </div>
      </div>
      <div className="pe-hud__right">
        <div className={`pe-heat pe-heat--${s.heat}`} aria-label={`Pursuit intensity ${s.heat}`}>
          <span>HEAT</span>
          {[1, 2, 3].map((k) => (
            <i key={k} className={k <= s.heat ? "is-on" : ""} />
          ))}
          <em>
            🚓 {s.cops}
            {s.near != null && s.near < 400 ? ` · ${s.near} m` : ""}
          </em>
        </div>
        <Minimap run={run} size={touch ? 110 : 150} />
      </div>
      <div className="pe-hud__bars">
        <div className={`pe-bar pe-bar--int${intCls}`}>
          <span>INTEGRITY</span>
          <div>
            <i style={{ transform: `scaleX(${s.integrity / 100})` }} />
          </div>
          <b>{s.integrity}%</b>
        </div>
        <div className={`pe-bar pe-bar--nitro${s.nitroOn ? " is-on" : ""}`}>
          <span>
            NITRO <kbd>{touch ? "N2O" : "Shift"}</kbd>
          </span>
          <div>
            <i style={{ transform: `scaleX(${s.nitro})` }} />
          </div>
        </div>
      </div>
      <div className="pe-hud__gauge">
        <svg viewBox="0 0 200 120" aria-hidden="true">
          <path d="M20 110 A80 80 0 0 1 180 110" className="pe-gauge__bg" />
          <path d="M20 110 A80 80 0 0 1 180 110" className={`pe-gauge__fg${s.nitroOn ? " is-nitro" : ""}`} style={{ strokeDasharray: arc, strokeDashoffset: arc * (1 - frac) }} />
        </svg>
        <div className="pe-gauge__num">{s.kmh}</div>
        <div className="pe-gauge__unit">KM/H</div>
      </div>
      {s.playing && s.bust > 0.02 && (
        <div className="pe-bust" role="alert">
          <b>GETTING BUSTED!</b>
          <div>
            <i style={{ transform: `scaleX(${s.bust})` }} />
          </div>
          <small>Keep moving — get away from the police</small>
        </div>
      )}
      {s.playing && s.warn && !s.bust && (
        <div className="pe-warn" key="rb">
          ⚠ ROADBLOCK AHEAD · {s.warn.d} m <small>gap on the {s.warn.gap === "L" ? "left" : "right"} — or take another street</small>
        </div>
      )}
      <div className="pe-callouts">
        {callouts.map((c) => (
          <div key={c.id} className={`pe-callout pe-callout--${c.kind}`}>
            {c.text}
            {c.sub && <small>{c.sub}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
const dx2 = (r, c) => r.x - c.x;
const dz2 = (r, c) => r.z - c.z;

export function Countdown({ value }) {
  if (value == null) return null;
  return (
    <div className="pe-countdown" key={value}>
      <span className={value === "GO!" ? "is-go" : ""}>{value}</span>
    </div>
  );
}
