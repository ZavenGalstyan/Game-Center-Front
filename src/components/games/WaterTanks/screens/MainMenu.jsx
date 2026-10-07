/**
 * Water Tanks — main menu. Title and actions on the left; on the right a
 * small lab bench with four real glass tanks (same renderer as gameplay, in
 * the player's chosen style). Every few seconds two tanks quietly exchange
 * water through the bench pipe — the levels move, the totals never change.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TankGlass from "../components/TankGlass.jsx";
import { Icon } from "../components/icons.jsx";
import { tankGeometry } from "../components/geometry.js";
import { getLevel, TOTAL_LEVELS } from "../data/index.js";
import { chapterOf } from "../data/chapters.js";
import { summary, nextPlayable } from "../utils/progress.js";

const DEMO = [
  { cap: 8, f: 0.92, shape: "wide" },
  { cap: 5, f: 1.0, shape: "jar" },
  { cap: 6, f: 0.8, shape: "standard" },
  { cap: 3, f: 0.6, shape: "tall" },
];
const START = [6, 2, 5, 1];
const WIDTH = { wide: 0.6, jar: 0.52, standard: 0.44, tall: 0.34 };

export default function MainMenu({ progress, compact, onPlay, onLevels, onTanks, onStats, onSettings }) {
  const s = summary(progress);
  const next = nextPlayable(progress);
  const nextLevel = getLevel(next);
  const fresh = progress.completedLevels.length === 0;
  const allDone = s.completed >= TOTAL_LEVELS;

  /* bench size */
  const benchRef = useRef(null);
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = benchRef.current;
    if (!el) return undefined;
    const m = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.w === Math.round(r.width) && b.h === Math.round(r.height) ? b : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* gentle demo exchange */
  const [amounts, setAmounts] = useState(START);
  useEffect(() => {
    if (progress.settings.reducedMotion) return undefined;
    let i = 0;
    const pairs = [[0, 1], [2, 3], [1, 2], [3, 0], [1, 0], [3, 2]];
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const [a, b] = pairs[i++ % pairs.length];
      setAmounts((cur) => {
        const n = cur.slice();
        const t = Math.min(n[a], DEMO[b].cap - n[b], 2);
        if (t <= 0) return cur;
        n[a] -= t;
        n[b] += t;
        return n;
      });
    }, 3600);
    return () => clearInterval(id);
  }, [progress.settings.reducedMotion]);

  let tanks = null;
  if (box && box.w > 60 && box.h > 60) {
    const H = Math.min(box.h * 0.74, (box.w * 0.94) / (DEMO.reduce((a, d) => a + WIDTH[d.shape], 0) + 0.13 * 5));
    const ws = DEMO.map((d) => Math.round(WIDTH[d.shape] * H));
    const hs = DEMO.map((d) => Math.round(d.f * H));
    const gap = (box.w - ws.reduce((a, b) => a + b, 0)) / 5;
    let x = gap;
    tanks = DEMO.map((d, i) => {
      const t = { x, w: ws[i], h: hs[i], geo: tankGeometry(ws[i], hs[i], d.shape) };
      x += ws[i] + gap;
      return t;
    });
  }
  const baseY = box ? box.h * 0.86 : 0;

  return (
    <div className={`wt-menu${compact ? " is-compact" : ""}`}>
      <div className="wt-menu__left">
        <div className="wt-logo">
          <span className="wt-logo__kicker">Logic · Water Lab</span>
          <h1 className="wt-logo__title">
            <span>Water</span>
            <span className="wt-logo__tanks">Tanks</span>
          </h1>
          <p className="wt-logo__tag">Pour <i>•</i> Measure <i>•</i> Solve</p>
        </div>

        <button type="button" className="wt-btn wt-btn--primary wt-btn--big wt-menu__play" onClick={onPlay}>
          <Icon.play />
          <span className="wt-menu__play-text">
            <b>{fresh ? "Play" : allDone ? "Replay" : "Continue"}</b>
            {nextLevel && <small>Level {next} · {nextLevel.name}</small>}
          </span>
        </button>

        <nav className="wt-menu__grid" aria-label="Water Tanks menu">
          <button type="button" className="wt-btn" onClick={onLevels}><Icon.levels /><span>Levels</span></button>
          <button type="button" className="wt-btn" onClick={onTanks}><Icon.tank /><span>Tanks</span></button>
          <button type="button" className="wt-btn" onClick={onStats}><Icon.stats /><span>Statistics</span></button>
          <button type="button" className="wt-btn" onClick={onSettings}><Icon.gear /><span>Settings</span></button>
        </nav>

        <div className="wt-menu__progress">
          <div className="wt-meter">
            <span className="wt-meter__label"><b>{s.completed}</b> / {TOTAL_LEVELS} levels</span>
            <span className="wt-meter__bar"><i style={{ width: `${(s.completed / TOTAL_LEVELS) * 100}%` }} /></span>
          </div>
          <div className="wt-meter">
            <span className="wt-meter__label"><b>{s.stars}</b> / {TOTAL_LEVELS * 3} stars</span>
            <span className="wt-meter__bar wt-meter__bar--gold"><i style={{ width: `${(s.stars / (TOTAL_LEVELS * 3)) * 100}%` }} /></span>
          </div>
          {!compact && <span className="wt-menu__chapter">{chapterOf(next).name}</span>}
        </div>
      </div>

      <div className="wt-menu__bench" ref={benchRef} aria-hidden="true">
        <div className="wt-menu__halo" />
        {tanks && (
          <>
            <svg className="wt-menu__pipes" width={box.w} height={box.h}>
              <path d={`M${tanks[0].x + tanks[0].w * 0.5},${baseY + 8} V${box.h - 4} H${tanks[3].x + tanks[3].w * 0.5} V${baseY + 8}`} className="wt-menu__pipe" />
              <path d={`M${tanks[0].x + tanks[0].w * 0.5},${baseY + 8} V${box.h - 4} H${tanks[3].x + tanks[3].w * 0.5} V${baseY + 8}`} className="wt-menu__pipe-glow" />
              {tanks.slice(1, 3).map((t, i) => <path key={i} d={`M${t.x + t.w / 2},${baseY + 8} V${box.h - 4}`} className="wt-menu__pipe" />)}
            </svg>
            <div className="wt-menu__counter" style={{ top: baseY }} />
            {tanks.map((t, i) => (
              <div key={i} className="wt-menu__tank" style={{ left: t.x, top: baseY - t.h, width: t.w, height: t.h, animationDelay: `${i * -1.7}s` }}>
                <TankGlass uid={`menu${i}`} geo={t.geo} capacity={DEMO[i].cap} amount={amounts[i]} waterMs={1600} showNumbers={false} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
