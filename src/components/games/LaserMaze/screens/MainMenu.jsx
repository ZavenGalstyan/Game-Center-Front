/**
 * Laser Maze — main menu. The demo board is a real compiled level driven by
 * the real tracer: the mirror flips every ~1.6s and the beam/target follow,
 * so the menu shows the actual game rule rather than a canned animation.
 */
import { useEffect, useMemo, useState } from "react";
import Board from "../components/Board.jsx";
import { Icon } from "../components/icons.jsx";
import { compileLevel } from "../engine/level.js";
import { traceBeams } from "../engine/trace.js";
import { WORLDS, worldOf } from "../data/worlds.js";
import { overall, nextPlayable } from "../utils/progress.js";
import { TOTAL_LEVELS } from "../data/index.js";

const DEMO = compileLevel({
  id: 0,
  name: "Demo",
  map: String.raw`
    .  .  .  .  .
    >r .  .  /  .
    .  .  .  .  .
    .  .  .  Tr .
  `,
});

export default function MainMenu({ progress, settings, onPlay, onWorlds, onStats, onSettings }) {
  const [rot, setRot] = useState(1);
  useEffect(() => {
    if (settings.reducedMotion) return undefined;
    const id = setInterval(() => setRot((r) => (r ? 0 : 1)), 1600);
    return () => clearInterval(id);
  }, [settings.reducedMotion]);
  const state = useMemo(() => ({ rot: [rot], mov: [], crank: [] }), [rot]);
  const trace = useMemo(() => traceBeams(DEMO, state), [state]);
  const o = overall(progress);
  const next = nextPlayable(progress);
  const started = o.completed > 0;
  const w = worldOf(next);
  const demoSettings = useMemo(() => ({ ...settings, graphics: settings.graphics === "low" ? "low" : "medium" }), [settings]);

  return (
    <div className="lm-screen lm-menu">
      <div className="lm-menu__hero">
        <h1 className="lm-logo">
          <span className="lm-logo__laser">LASER</span>
          <span className="lm-logo__maze">MAZE</span>
        </h1>
        <p className="lm-tagline">ROTATE <i>•</i> REFLECT <i>•</i> ILLUMINATE</p>
        <div className="lm-menu__buttons">
          <button type="button" className="lm-btn lm-btn--primary lm-btn--big" onClick={onPlay}>
            <Icon.play /> {started ? "Continue" : "Play"}
            {started && <small>{w.id}-{((next - 1) % 10) + 1}</small>}
          </button>
          <button type="button" className="lm-btn" onClick={onWorlds}><Icon.globe /> Worlds</button>
          <div className="lm-menu__row">
            <button type="button" className="lm-btn" onClick={onStats}><Icon.stats /> Statistics</button>
            <button type="button" className="lm-btn" onClick={onSettings}><Icon.gear /> Settings</button>
          </div>
        </div>
        <p className="lm-menu__progress">
          <span>★ {o.stars} / {TOTAL_LEVELS * 3}</span>
          <span>{o.completed} / {TOTAL_LEVELS} levels</span>
          <span>{WORLDS.length} worlds</span>
        </p>
      </div>
      <div className="lm-menu__demo" aria-hidden="true">
        <Board level={DEMO} state={state} trace={trace} world={WORLDS[0]} uid="lmdemo" settings={demoSettings} interactive={false} pulse={[rot]} />
        <p className="lm-menu__caption">Tap a mirror · the beam follows · light every target</p>
      </div>
    </div>
  );
}
