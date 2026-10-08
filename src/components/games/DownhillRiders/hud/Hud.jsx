/**
 * Downhill Riders — the race HUD (DOM over the canvas), deliberately
 * minimal. Reads the mutable race through useSample (~15 Hz); the trail
 * progress dots move at 20 Hz straight through refs.
 *
 *   top-left     position 2/4
 *   top-centre   trail progress (start → checkpoints → finish, every rider)
 *                + distance to the finish
 *   top-right    race time · trick score
 *   bottom-left  speed
 *   bottom-mid   3-segment boost meter
 *   centre       countdown, trick / checkpoint / overtake callouts, hints
 *   overlay      crash fade, speed lines (off with Reduced Motion)
 */
import { useEffect, useRef } from "react";
import { useSample, fmtRace, speedOf, distOf } from "./useSample.js";
import { RSTATE } from "../engine/race.js";
import { CRASH_TIME } from "../engine/bike.js";

export default function Hud({ race, settings, callouts, touch }) {
  const units = settings.units;
  const T = race.T;
  const s = useSample(
    () => {
      const P = race.player;
      const B = P.bike;
      const crashT = B.crash ? B.crash.t : -1;
      return {
        place: P.place,
        time: race.state === RSTATE.COUNTDOWN ? 0 : Math.floor((P.finished ? P.finishTime : race.raceTime) * 20) / 20,
        speed: speedOf(B, units),
        meter: Math.round(B.meter * 60) / 60,
        boosting: B.boostT > 0,
        score: race.stats.trickScore,
        toFinish: race.toFinish(),
        cps: `${P.nextCp}/${T.checkpoints.length}`,
        wrong: P.wrongWay > 1.0 && race.state === RSTATE.RACING,
        stuck: race.stuck && !B.crash,
        fade: crashT > CRASH_TIME - 0.55 ? 1 : crashT >= 0 ? 0.15 : 0,
        fast: B.vF > B.p.vmax * 0.72 || B.boostT > 0,
        air: B.air && B.airT > 0.25,
        trick: B.trick ? B.trick.kind : null,
        state: race.state,
      };
    },
    [race, units],
    15,
  );
  const segs = [0, 1, 2].map((i) => Math.max(0, Math.min(1, (s.meter - i / 3) * 3)));
  const reduced = settings.reducedMotion;
  return (
    <div className={`dr-hud${touch ? " dr-hud--touch" : ""}`}>
      <div className="dr-hud__pos">
        <span className="dr-pos__n">{s.place}</span>
        <span className="dr-pos__of">/4</span>
        <span className="dr-pos__lbl">POS</span>
      </div>
      <Progress race={race} label={distOf(s.toFinish, units)} cps={s.cps} />
      <div className="dr-hud__time">
        <div className="dr-time">{fmtRace(s.time)}</div>
        <div className="dr-score">
          <span>TRICKS</span> <b>{s.score.toLocaleString()}</b>
        </div>
      </div>
      <div className="dr-hud__speed">
        <span className="dr-speed">{s.speed}</span>
        <span className="dr-speed__u">{units === "mph" ? "MPH" : "KM/H"}</span>
      </div>
      <div className={`dr-boost${s.boosting ? " is-boosting" : ""}`}>
        {segs.map((f, i) => (
          <div key={i} className={`dr-boost__seg${f >= 1 ? " is-full" : ""}`}>
            <div className="dr-boost__fill" style={{ width: `${f * 100}%` }} />
          </div>
        ))}
        <span className="dr-boost__label">BOOST</span>
      </div>
      {s.air && !s.trick && s.state === RSTATE.RACING && !touch && (
        <div className="dr-airhint">
          <kbd>Q</kbd> / <kbd>E</kbd> trick
        </div>
      )}
      {s.wrong && <div className="dr-warn">WRONG WAY</div>}
      {s.stuck && (
        <div className="dr-warn dr-warn--soft">
          Stuck? Press <kbd>R</kbd> to respawn
        </div>
      )}
      <div className="dr-callouts">
        {callouts.map((c) => (
          <div key={c.id} className={`dr-callout dr-callout--${c.kind}`}>
            {c.text}
            {c.sub && <small>{c.sub}</small>}
          </div>
        ))}
      </div>
      {!reduced && s.fast && <div className="dr-speedlines" />}
      <div className="dr-fade" style={{ opacity: s.fade === 1 ? 1 : 0 }} />
      {s.fade > 0 && s.fade < 1 && <div className="dr-crashflash">CRASH!</div>}
    </div>
  );
}

function Progress({ race, label, cps }) {
  const T = race.T;
  const dots = useRef([]);
  useEffect(() => {
    const id = setInterval(() => {
      race.racers.forEach((r, i) => {
        const el = dots.current[i];
        if (!el) return;
        const f = Math.max(0, Math.min(1, (r.prog - T.sGate) / T.raceLen));
        el.style.left = `${f * 100}%`;
      });
    }, 50);
    return () => clearInterval(id);
  }, [race, T]);
  return (
    <div className="dr-progress">
      <div className="dr-progress__bar">
        {T.checkpoints.map((c) => (
          <i key={c.n} className="dr-progress__cp" style={{ left: `${((c.s - T.sGate) / T.raceLen) * 100}%` }} />
        ))}
        <i className="dr-progress__flag" />
        {race.racers
          .slice()
          .reverse()
          .map((r) => (
            <span key={r.id} ref={(el) => (dots.current[r.id] = el)} className={`dr-progress__dot${r.isPlayer ? " is-player" : ""}`} style={{ background: r.colors.jersey }} />
          ))}
      </div>
      <div className="dr-progress__txt">
        <b>{label}</b> to finish · CP {cps}
      </div>
    </div>
  );
}

/** Big centred 3 · 2 · 1 · GO! */
export function Countdown({ value }) {
  if (value == null) return null;
  return (
    <div className="dr-count" key={value}>
      <span className={`dr-count__n${value === "GO!" ? " is-go" : ""}`}>{value}</span>
    </div>
  );
}
