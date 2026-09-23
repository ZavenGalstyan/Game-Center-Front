/**
 * Laser Maze — world select. Each card's artwork is a real level of that
 * world rendered in its SOLVED state (validator solution replayed through
 * the engine), so the preview doubles as a taste of the world's mechanic.
 */
import { memo, useMemo } from "react";
import Board from "../components/Board.jsx";
import { Icon, Star } from "../components/icons.jsx";
import { WORLDS } from "../data/worlds.js";
import { getLevel, TOTAL_LEVELS } from "../data/index.js";
import { initialState } from "../engine/level.js";
import { traceBeams } from "../engine/trace.js";
import { applyMove } from "../engine/moves.js";
import { isWorldUnlocked, worldSummary } from "../utils/progress.js";

const PREVIEW_SETTINGS = { graphics: "low", particles: false, beamGlow: "normal", reducedMotion: true };
const PREVIEW_LEVEL = { 1: 3, 2: 15, 3: 25, 4: 34, 5: 44, 6: 54, 7: 64, 8: 74, 9: 84, 10: 95 };

const Preview = memo(function Preview({ world }) {
  const data = useMemo(() => {
    const id = PREVIEW_LEVEL[world.id];
    if (id > TOTAL_LEVELS) return null;
    const level = getLevel(id);
    if (!level) return null;
    let s = initialState(level);
    for (const mv of level.solution || []) s = applyMove(level, s, mv);
    return { level, state: s, trace: traceBeams(level, s) };
  }, [world.id]);
  if (!data) return <div className="lm-wcard__emblem" />;
  return (
    <Board level={data.level} state={data.state} trace={data.trace} world={world}
      uid={`lmw${world.id}`} settings={PREVIEW_SETTINGS} interactive={false} />
  );
});

export default function WorldSelect({ progress, onPick, onBack }) {
  return (
    <div className="lm-screen lm-worlds">
      <header className="lm-screen__head">
        <button type="button" className="lm-back" onClick={onBack}><Icon.back /> Menu</button>
        <h2>Worlds</h2>
        <span className="lm-screen__meta">★ {WORLDS.reduce((a, w) => a + worldSummary(progress, w.id).stars, 0)}</span>
      </header>
      <div className="lm-worlds__grid">
        {WORLDS.map((w) => {
          const open = isWorldUnlocked(progress, w.id);
          const sum = worldSummary(progress, w.id);
          return (
            <button key={w.id} type="button" className={`lm-wcard${open ? "" : " is-locked"}${sum.completed === 10 ? " is-done" : ""}`}
              style={{ "--wa": w.accent, "--wa2": w.accent2, "--wb0": w.bg0, "--wb1": w.bg2 }}
              onClick={() => open && onPick(w.id)} disabled={!open} aria-label={`World ${w.id}: ${w.name}${open ? "" : " (locked)"}`}>
              <div className="lm-wcard__art">
                <Preview world={w} />
                {!open && <div className="lm-wcard__lock"><Icon.lock /></div>}
              </div>
              <div className="lm-wcard__body">
                <span className="lm-wcard__num">{String(w.id).padStart(2, "0")}</span>
                <b className="lm-wcard__name">{w.name}</b>
                <span className="lm-wcard__mech">{w.mechanic}</span>
                <span className="lm-wcard__prog">
                  <span>{sum.completed}/10</span>
                  <span className="lm-wcard__stars"><Star on size={12} /> {sum.stars}/30</span>
                </span>
                <i className="lm-wcard__bar"><i style={{ width: `${sum.completed * 10}%` }} /></i>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
