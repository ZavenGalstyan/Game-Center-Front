/**
 * Alpine Rush — the race HUD (DOM over the canvas), compact so the skier and
 * the gates ahead stay clear. Reads the mutable race at ~15 Hz (useSample).
 *
 *   top-left      level + objective (mode, rule)
 *   top-centre    race timer (+ penalty), countdown, course progress
 *   top-right     gate n / total (+ missed), position in a rival race
 *   bottom-left   speedometer + posture / surface
 *   bottom-right  medal target (live) + control hints
 *   centre        callouts (gate splits, missed gates, edge warnings, air)
 *   overlay       wind streaks at high speed, fade on a cliff fall
 */
import { useEffect, useRef } from "react";
import { useSample, fmtTime, speedText, ordinal } from "./useSample.js";
import { RSTATE, MODE_NAMES } from "../engine/race.js";
import { SURFACES } from "../engine/course.js";
import { FALL_TIME } from "../engine/skier.js";
import { Medal } from "./Overlays.jsx";

export default function Hud({ race, settings, callouts, touch }) {
  const units = settings.units;
  const T = race.T;
  const free = race.free;
  const s = useSample(
    () => {
      const P = race.player;
      const K = P.sk;
      const sp = K.air ? Math.hypot(K.ax, K.az) : K.vF;
      const C = K.crash;
      return {
        place: P.place,
        n: race.racers.length,
        time: race.state === RSTATE.COUNTDOWN ? 0 : Math.floor(race.raceTime * 20) / 20,
        pen: P.missed * race.penaltyPer,
        speed: speedText(sp, units),
        frac: Math.min(1, sp / K.p.vmax),
        gate: Math.min(P.nextGate + 1, T.gates.length),
        missed: P.missed,
        posture: K.braking ? "BRAKE" : K.tuck > 0.8 ? "RACE TUCK" : K.tuck > 0.3 ? "TUCK" : null,
        surf: K.air ? "AIR" : SURFACES[K.surf]?.name || "",
        stress: Math.round(K.stress * 10) / 10,
        target: race.target(),
        wrong: P.wrongWay > 1.2 && race.state === RSTATE.RACING,
        stuck: race.stuck && !C,
        fade: C && C.fell && C.t > FALL_TIME - 0.5 ? 1 : 0,
        fast: sp > 22,
        state: race.state,
        wind: race.def.wind ? Math.round((race.wind?.str || 0) * 10) / 10 : null,
        toFinish: race.toFinish(),
        dsqRisk: !free && P.missed >= race.dsqAt,
      };
    },
    [race, units],
    15,
  );
  const reduced = settings.reducedFx;
  return (
    <div className={`ar-hud${touch ? " ar-hud--touch" : ""}`}>
      <div className="ar-hud__tl">
        <div className="ar-hud__lvl">
          {free ? "FREE SKI" : `LEVEL ${race.def.id}`} · <b>{race.def.name}</b>
        </div>
        <div className="ar-hud__obj">
          {free
            ? "Ski freely — no clock, no gates"
            : race.mode === "rival"
              ? `Beat 3 rivals · miss a gate +${race.penaltyPer}s`
              : `${MODE_NAMES[race.mode]} · miss a gate +${race.penaltyPer}s`}
        </div>
      </div>
      <div className="ar-hud__tc">
        <div className="ar-time">
          {free ? fmtTime(s.time) : fmtTime(s.time)}
          {s.pen > 0 && <span className="ar-time__pen">+{s.pen}s</span>}
        </div>
        <Progress race={race} />
      </div>
      {!free && (
        <div className="ar-hud__tr">
          <div className="ar-gatecount">
            <span className="ar-gatecount__lbl">GATE</span>
            <b>{s.gate}</b>
            <span>/{T.gates.length}</span>
          </div>
          {s.missed > 0 && <div className={`ar-missed${s.dsqRisk ? " is-risk" : ""}`}>{s.missed} missed{s.dsqRisk ? " · DSQ next!" : ""}</div>}
          {s.n > 1 && (
            <div className="ar-place">
              <b>{ordinal(s.place)}</b> / {s.n}
            </div>
          )}
        </div>
      )}
      <div className="ar-hud__bl">
        <div className="ar-speed">
          <svg className="ar-speed__arc" viewBox="0 0 100 56" aria-hidden="true">
            <path d="M8 52 A42 42 0 0 1 92 52" className="ar-speed__track" />
            <path d="M8 52 A42 42 0 0 1 92 52" className="ar-speed__fill" style={{ strokeDasharray: `${s.frac * 132} 200` }} />
          </svg>
          <div className="ar-speed__n">{s.speed}</div>
          <div className="ar-speed__u">{units === "mph" ? "MPH" : "KM/H"}</div>
        </div>
        <div className="ar-hud__state">
          {s.posture && <span className="ar-chip ar-chip--posture">{s.posture}</span>}
          <span className="ar-chip">{s.surf}</span>
          {s.wind != null && Math.abs(s.wind) > 0.4 && <span className="ar-chip ar-chip--wind">WIND {s.wind > 0 ? "◀" : "▶"}</span>}
        </div>
      </div>
      <div className="ar-hud__br">
        {s.target && (
          <div className="ar-target">
            <Medal kind={s.target.medal} size={26} />
            <div>
              <span>{s.target.medal ? `${s.target.medal.toUpperCase()} PACE` : "NO MEDAL PACE"}</span>
              <b>{fmtTime(s.target.time)}</b>
            </div>
          </div>
        )}
        {settings.hints && !touch && (
          <div className="ar-hints">
            <span><kbd>A</kbd><kbd>D</kbd> carve</span>
            <span><kbd>Q</kbd><kbd>E</kbd> hard carve</span>
            <span><kbd>W</kbd> tuck · <kbd>⇧</kbd> race</span>
            <span><kbd>S</kbd> brake · <kbd>␣</kbd> jump</span>
            <span><kbd>C</kbd> camera · <kbd>Esc</kbd> pause</span>
          </div>
        )}
      </div>
      {s.stress > 0.5 && s.state === RSTATE.RACING && <div className="ar-warn">EDGE! ease off the hard carve</div>}
      {s.wrong && <div className="ar-warn">WRONG WAY</div>}
      {s.stuck && (
        <div className="ar-warn ar-warn--soft">
          Stuck? Press <kbd>R</kbd> to respawn
        </div>
      )}
      <div className="ar-callouts">
        {callouts.map((c) => (
          <div key={c.id} className={`ar-callout ar-callout--${c.kind}`}>
            {c.text}
            {c.sub && <small>{c.sub}</small>}
          </div>
        ))}
      </div>
      {!reduced && s.fast && <div className="ar-streaks" style={{ opacity: Math.min(1, (s.frac - 0.55) * 3) }} />}
      <div className="ar-fade" style={{ opacity: s.fade }} />
    </div>
  );
}

function Progress({ race }) {
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
    }, 60);
    return () => clearInterval(id);
  }, [race, T]);
  return (
    <div className="ar-progress">
      {!race.free &&
        T.gates.map((g) => (
          <i key={g.n} className={`ar-progress__gate is-${g.color}`} style={{ left: `${((g.s - T.sGate) / T.raceLen) * 100}%` }} />
        ))}
      {race.racers
        .slice()
        .reverse()
        .map((r) => (
          <span key={r.id} ref={(el) => (dots.current[r.id] = el)} className={`ar-progress__dot${r.isPlayer ? " is-player" : ""}`} style={r.isPlayer ? null : { background: r.colors.jacket }} />
        ))}
    </div>
  );
}

/** Big centred 3 · 2 · 1 · GO! plus the race rule while the clock waits. */
export function Countdown({ value, race }) {
  if (value == null) return null;
  const free = race.free;
  const m = race.def.medals;
  return (
    <div className="ar-count" key={value}>
      <span className={`ar-count__n${value === "GO!" ? " is-go" : ""}`}>{value}</span>
      {value !== "GO!" && (
        <div className="ar-rule">
          {free ? (
            <>Free Ski — explore the mountain, no clock pressure.</>
          ) : (
            <>
              <b>{MODE_NAMES[race.mode]}</b> · {race.T.gates.length} gates in order · missed gate <b>+{race.penaltyPer}s</b> · more than {race.dsqAt} missed = DSQ
              {race.mode !== "rival" && m && (
                <span className="ar-rule__medals">
                  <Medal kind="gold" size={16} /> {fmtTime(m[0])} <Medal kind="silver" size={16} /> {fmtTime(m[1])} <Medal kind="bronze" size={16} /> {fmtTime(m[2])}
                </span>
              )}
              {race.mode === "rival" && <span className="ar-rule__medals">Finish top 3 for a medal</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
