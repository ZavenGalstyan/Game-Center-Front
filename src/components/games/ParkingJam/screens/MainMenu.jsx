/**
 * Parking Jam — main menu. The scene on the right is a real compiled lot
 * driven by the real rules: every few seconds the hint logic picks a car
 * that can legally leave and the Scene drives it out, until the lot is empty
 * and it refills. So the menu demonstrates the actual game, calmly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Scene from "../render/Scene.jsx";
import { Icon } from "../components/icons.jsx";
import { compileLevel } from "../engine/level.js";
import { applyExit, bestHint, initialState, isSolved } from "../engine/logic.js";
import { WORLDS, worldOf, LEVELS_PER_WORLD } from "../data/worlds.js";
import { skinById } from "../data/skins.js";
import { summary, nextPlayable } from "../utils/progress.js";
import { TOTAL_LEVELS } from "../data/index.js";

const DEMO = compileLevel({
  name: "Demo",
  map: `
    a^ .. .. b- b> ..
    a- c^ .. .. d^ ..
    .. c- e- e> d- ..
    f- f> .. g- g> ..
  `,
  types: "a:sedan b:coupe c:hatch d:suv e:compact f:taxi g:pickup",
}, { id: 900 });

export default function MainMenu({ progress, settings, onPlay, onLevels, onVehicles, onStats, onSettings }) {
  const [state, setState] = useState(() => initialState(DEMO));
  const [round, setRound] = useState(0);
  const sceneRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (settings.reducedMotion) return undefined;
    let t;
    const step = () => {
      const s = stateRef.current;
      if (isSolved(s)) {
        t = setTimeout(() => {
          setState(initialState(DEMO));
          setRound((r) => r + 1);
          t = setTimeout(step, 1800);
        }, 1200);
        return;
      }
      const i = bestHint(DEMO, s.present);
      const next = i == null ? null : applyExit(DEMO, s, i);
      if (next) {
        setState(next);
        sceneRef.current?.exit(i);
      }
      t = setTimeout(step, 1900);
    };
    t = setTimeout(step, 1400);
    return () => clearTimeout(t);
  }, [settings.reducedMotion]);

  const s = summary(progress);
  // same rule as ParkingJam.playNext: resume an unfinished level, else the next new one
  const cur = progress.current;
  const next = cur && cur.levelId <= progress.unlockedLevel ? cur.levelId : nextPlayable(progress);
  const started = s.completed > 0 || Boolean(cur);
  const w = worldOf(next);
  const skin = useMemo(() => skinById(progress.selectedVehicleSkin), [progress.selectedVehicleSkin]);
  const demoSettings = useMemo(() => ({ ...settings, graphics: settings.graphics === "low" ? "low" : "medium" }), [settings]);

  return (
    <div className="pj-menu">
      <div className="pj-menu__scene" aria-hidden="true">
        <Scene
          key={round}
          ref={sceneRef}
          level={DEMO}
          world={WORLDS[0]}
          present={state.present}
          skin={skin}
          settings={demoSettings}
          uid="pjmenu"
          interactive={false}
          insets={{ left: "44%" }}
          className="pj-scene--menu"
        />
      </div>
      <div className="pj-menu__shade" aria-hidden="true" />
      <div className="pj-menu__hero">
        <div className="pj-logo" aria-label="Parking Jam">
          <span className="pj-logo__sign">P</span>
          <span className="pj-logo__words">
            <span className="pj-logo__top">PARKING</span>
            <span className="pj-logo__bottom">JAM</span>
          </span>
        </div>
        <p className="pj-tagline">MOVE <i>•</i> CLEAR <i>•</i> ESCAPE</p>
        <div className="pj-menu__buttons">
          <button type="button" className="pj-btn pj-btn--primary pj-btn--big" onClick={onPlay} autoFocus>
            <Icon.play /> {started ? "Continue" : "Play"}
            {started && <small>Level {next} · {w.name}</small>}
          </button>
          <button type="button" className="pj-btn" onClick={onLevels}><Icon.grid /> Levels</button>
          <div className="pj-menu__row">
            <button type="button" className="pj-btn" onClick={onVehicles}><Icon.car /> Vehicles</button>
            <button type="button" className="pj-btn" onClick={onStats}><Icon.stats /> Statistics</button>
          </div>
          <button type="button" className="pj-btn pj-btn--ghost" onClick={onSettings}><Icon.gear /> Settings</button>
        </div>
        <p className="pj-menu__progress">
          <span><Icon.star className="is-on" /> {s.stars} / {TOTAL_LEVELS * 3}</span>
          <span>{s.completed} / {TOTAL_LEVELS} levels</span>
          <span>{WORLDS.length} lots · {LEVELS_PER_WORLD} each</span>
        </p>
      </div>
    </div>
  );
}
