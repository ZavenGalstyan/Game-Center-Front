/**
 * Parking Jam — render smoke test body (bundled by renderSmoke.mjs).
 * Server-renders the real components for every level / theme / graphics
 * level / skin and every static screen, so a render-time crash anywhere is
 * caught in Node before it can reach a player.
 */
import { renderToStaticMarkup } from "react-dom/server";
import Environment from "../render/Environment.jsx";
import { VehicleTop, VehicleDefs, VehicleBadge } from "../render/Vehicle.jsx";
import { getLevel, TOTAL_LEVELS } from "../data/index.js";
import { WORLDS, worldOf } from "../data/worlds.js";
import { SKINS } from "../data/skins.js";
import { VEHICLE_TYPES } from "../engine/level.js";
import { CELL } from "../render/geometry.js";
import { ROAD } from "../render/path.js";
import LevelSelect from "../screens/LevelSelect.jsx";
import Vehicles from "../screens/Vehicles.jsx";
import Statistics from "../screens/Statistics.jsx";
import Settings from "../screens/Settings.jsx";
import LevelComplete from "../screens/LevelComplete.jsx";
import { defaultProgress, applyComplete } from "../utils/progress.js";

export function run() {
  const failures = [];
  let renders = 0;
  const attempt = (label, el) => {
    try {
      const html = renderToStaticMarkup(el);
      if (!html || html.length < 20) throw new Error("empty render");
      renders++;
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
    }
  };

  // every level's environment at every graphics level, with a few viewport shapes
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const lv = getLevel(id);
    const world = worldOf(id);
    const W = lv.cols * CELL;
    const H = lv.rows * CELL;
    for (const graphics of ["low", "medium", "high"]) {
      for (const [ex, ey] of [[2.2, 0.6], [0.6, 1.8], [4, 3]]) {
        const vb = { x: -ROAD - ex * CELL, y: -ROAD - ey * CELL, w: W + 2 * (ROAD + ex * CELL), h: H + 2 * (ROAD + ey * CELL) };
        attempt(`level ${id} env ${graphics} ${ex}x${ey}`, <svg><Environment level={lv} world={world} vb={vb} graphics={graphics} uid="t" /></svg>);
      }
    }
    // all its vehicles
    attempt(`level ${id} vehicles`, (
      <svg>
        <defs><VehicleDefs id="t" /></defs>
        {lv.vehicles.map((v) => <VehicleTop key={v.id} type={v.type} cells={v.length} color={v.color} defs="t" night={world.night} detail="high" />)}
      </svg>
    ));
  }

  // every vehicle class in every skin, both detail levels
  for (const skin of SKINS) {
    for (const [type, t] of Object.entries(VEHICLE_TYPES)) {
      for (const detail of ["low", "high"]) {
        attempt(`${type} ${skin.id} ${detail}`, <svg><VehicleTop type={type} cells={t.length} color="red" skin={skin} defs="t" detail={detail} night /></svg>);
      }
    }
    attempt(`badge ${skin.id}`, <VehicleBadge skin={skin} />);
  }

  // static screens, fresh save and a well-progressed save
  const fresh = defaultProgress();
  let rich = defaultProgress();
  for (let id = 1; id <= 64; id++) rich = applyComplete(rich, id, { stars: (id % 3) + 1, mistakes: 0, timeMs: 1000, hints: 0 }).progress;
  const noop = () => {};
  for (const [name, p] of [["fresh", fresh], ["rich", rich]]) {
    for (const w of WORLDS) attempt(`levels ${name} w${w.id}`, <LevelSelect progress={p} worldId={w.id} onWorld={noop} onPlay={noop} onBack={noop} />);
    attempt(`vehicles ${name}`, <Vehicles progress={p} onSelect={noop} onBack={noop} />);
    attempt(`stats ${name}`, <Statistics progress={p} onBack={noop} />);
  }
  attempt("settings", <Settings settings={fresh.settings} muted onChange={noop} onBack={noop} />);
  attempt("complete", (
    <LevelComplete level={getLevel(1)} world={WORLDS[0]} result={{ stars: 2, mistakes: 1, hints: 0, timeMs: 5000, newSkins: ["city"] }}
      hasNext isLast={false} reducedMotion onNext={noop} onReplay={noop} onLevels={noop} formatTime={() => "0:05"} />
  ));
  return { renders, failures };
}
