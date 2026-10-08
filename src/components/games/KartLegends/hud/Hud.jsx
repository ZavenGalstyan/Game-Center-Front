/**
 * Kart Legends — the race HUD (DOM over the canvas). Reads the mutable race
 * through useSample (~15 Hz) except the minimap dots, which move at 20 Hz
 * straight through refs.
 *
 *   top-left    position (big) + lap
 *   top-right   race time, best lap
 *   bottom-left speedometer
 *   bottom-mid  drift charge (tier colours) · 3-segment boost meter
 *   centre      countdown, lap / final-lap banners, wrong-way warning
 *   right       minimap
 */
import { useEffect, useMemo, useRef } from "react";
import { useSample, fmtRace, ordinal, speedOf } from "./useSample.js";
import { RSTATE } from "../engine/race.js";
import { DRIFT_TIERS, DRIFT_CAP } from "../engine/kart.js";

const TIER_COL = ["#ffffff", "#7fd4ff", "#ffa531", "#d76bff"];

export default function Hud({ race, settings, banner, touch }) {
  const units = settings.units;
  const s = useSample(
    () => {
      const P = race.player;
      const K = P.kart;
      return {
        place: P.place,
        lap: Math.min(race.laps, P.lap + 1),
        time: race.state === RSTATE.COUNTDOWN ? 0 : Math.floor((P.finished ? P.finishTime : race.raceTime) * 20) / 20,
        best: P.bestLap,
        speed: speedOf(K, units),
        meter: Math.round(K.meter * 60) / 60,
        drift: K.drift.on ? Math.round((K.drift.charge / DRIFT_CAP) * 40) / 40 : 0,
        tier: K.drift.on ? K.drift.tier : 0,
        boosting: K.boostT > 0,
        wrong: P.wrongWay > 1.2 && race.state === RSTATE.RACING,
        state: race.state,
      };
    },
    [race, units],
    15,
  );
  const segs = [0, 1, 2].map((i) => Math.max(0, Math.min(1, (s.meter - i / 3) * 3)));
  return (
    <div className={`kl-hud${touch ? " kl-hud--touch" : ""}`}>
      <div className="kl-hud__pos">
        <div className={`kl-place kl-place--${s.place}`}>
          <span className="kl-place__n">{s.place}</span>
          <span className="kl-place__suf">{ordinal(s.place).slice(-2)}</span>
        </div>
        <div className="kl-lap">
          LAP <b>{s.lap}</b>/{race.laps}
        </div>
      </div>
      <div className="kl-hud__time">
        <div className="kl-time">{fmtRace(s.time)}</div>
        {s.best != null && <div className="kl-time kl-time--best">BEST {fmtRace(s.best)}</div>}
      </div>
      <div className="kl-hud__speed">
        <span className="kl-speed">{s.speed}</span>
        <span className="kl-speed__u">{units === "mph" ? "MPH" : "KM/H"}</span>
      </div>
      <div className="kl-hud__meters">
        <div className={`kl-drift${s.drift > 0 ? " is-on" : ""}`}>
          <div className="kl-drift__fill" style={{ width: `${s.drift * 100}%`, background: TIER_COL[s.tier] }} />
          {DRIFT_TIERS.map((t, i) => (
            <i key={i} className="kl-drift__tick" style={{ left: `${(t / DRIFT_CAP) * 100}%` }} />
          ))}
          <span className="kl-drift__label">{s.tier > 0 ? ["", "MINI", "SUPER", "ULTRA"][s.tier] + " TURBO" : "DRIFT"}</span>
        </div>
        <div className={`kl-boost${s.boosting ? " is-boosting" : ""}`}>
          {segs.map((f, i) => (
            <div key={i} className={`kl-boost__seg${f >= 1 ? " is-full" : ""}`}>
              <div className="kl-boost__fill" style={{ width: `${f * 100}%` }} />
            </div>
          ))}
          <span className="kl-boost__label">BOOST</span>
        </div>
      </div>
      {settings.minimap && <Minimap race={race} />}
      {s.wrong && <div className="kl-wrong">WRONG WAY</div>}
      {banner && (
        <div key={banner.id} className={`kl-banner kl-banner--${banner.kind}`}>
          {banner.text}
        </div>
      )}
      {s.boosting && <div className="kl-speedlines" />}
    </div>
  );
}

function Minimap({ race }) {
  const T = race.T;
  const view = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    let c = Infinity;
    let d = -Infinity;
    for (const p of T.samples) {
      a = Math.min(a, p.x);
      b = Math.max(b, p.x);
      c = Math.min(c, p.z);
      d = Math.max(d, p.z);
    }
    const pad = 12;
    const span = Math.max(b - a, d - c) + pad * 2;
    // map x → screen-left on the left (mirror x so "left" turns read left from above, z up)
    const tx = (x) => ((b + pad - x) / span) * 100;
    const tz = (z) => ((d + pad - z) / span) * 100;
    let path = "";
    for (let i = 0; i < T.N; i += 3) {
      const p = T.samples[i];
      path += `${i ? "L" : "M"}${tx(p.x).toFixed(1)},${tz(p.z).toFixed(1)}`;
    }
    path += "Z";
    let sc = "";
    if (T.shortcut) T.shortcut.samples.forEach((p, i) => (sc += `${i ? "L" : "M"}${tx(p.x).toFixed(1)},${tz(p.z).toFixed(1)}`));
    const s0 = T.samples[0];
    return { tx, tz, path, sc, start: [tx(s0.x), tz(s0.z)] };
  }, [T]);
  const dots = useRef([]);
  useEffect(() => {
    const id = setInterval(() => {
      race.racers.forEach((r, i) => {
        const el = dots.current[i];
        if (el) {
          el.setAttribute("cx", view.tx(r.kart.x).toFixed(1));
          el.setAttribute("cy", view.tz(r.kart.z).toFixed(1));
        }
      });
    }, 50);
    return () => clearInterval(id);
  }, [race, view]);
  return (
    <svg className="kl-minimap" viewBox="0 0 100 100" aria-hidden="true">
      <path d={view.path} className="kl-minimap__track" />
      <path d={view.path} className="kl-minimap__line" />
      {view.sc && <path d={view.sc} className="kl-minimap__short" />}
      <circle cx={view.start[0]} cy={view.start[1]} r="2.2" className="kl-minimap__start" />
      {race.racers
        .slice()
        .reverse()
        .map((r) => (
          <circle
            key={r.id}
            ref={(el) => (dots.current[r.id] = el)}
            r={r.isPlayer ? 3.4 : 2.6}
            fill={r.colors.body}
            stroke={r.isPlayer ? "#fff" : "#1d1d24"}
            strokeWidth={r.isPlayer ? 1.2 : 0.8}
            cx="-10"
            cy="-10"
          />
        ))}
    </svg>
  );
}

/** Big centred 3 · 2 · 1 · GO! */
export function Countdown({ value }) {
  if (value == null) return null;
  return (
    <div className="kl-count" key={value}>
      <span className={`kl-count__n${value === "GO!" ? " is-go" : ""}`}>{value}</span>
    </div>
  );
}
