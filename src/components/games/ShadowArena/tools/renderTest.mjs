/**
 * Headless render smoke test: draws every frame of AI-vs-AI bouts for all
 * 36 fighter pairings (all arenas, both palettes) plus every attack frame of
 * every move, through a no-op mock canvas. Catches exceptions in the
 * painters and NaN skeleton joints.
 *   node src/components/games/ShadowArena/tools/renderTest.mjs
 */
import { createMatch, step, makeFighter, NO_INPUT } from "../engine/fight.js";
import { FIGHTERS, ARENAS } from "../engine/data.js";
import { createAI, aiParams, aiInput } from "../engine/ai.js";
import { drawFrame, spawnFx, stepFx, followCam } from "../render/draw.js";
import { poseOf, skeleton } from "../render/fighterArt.js";

const noop = () => {};
const grad = { addColorStop: noop };
const ctx = new Proxy(
  {},
  {
    get: (t, k) => (k in t ? t[k] : k === "createLinearGradient" || k === "createRadialGradient" ? () => grad : noop),
    set: (t, k, v) => ((t[k] = v), true),
  }
);
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { bakeArena } = await import("../render/arenas.js");

let fails = 0;
let frames = 0;
const view = { w: 1280, h: 720, dpr: 1, scale: 1.333, ox: 0, oy: 0 };
const finite = (s) => Object.values(s).every((v) => (Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v)));

for (const a of ARENAS) bakeArena(a.id, 1.3);

// every attack frame of every move, ground and air, both palettes
for (const def of FIGHTERS)
  for (const name of ["punch", "kick", "special"])
    for (const air of [false, true]) {
      if (air && name === "special") continue;
      const f = makeFighter(def, 0, { alt: air });
      const mv = def.moves[name];
      for (let t = 0; t <= mv.startup + mv.active + mv.recovery; t++) {
        f.state = "attack";
        f.atk = { id: 1, name, move: mv, t, hit: false, air, stop: false };
        f.y = air ? 60 : 0;
        const [pose] = poseOf(f, t / 60);
        const s = skeleton(pose);
        if (!finite(s)) {
          fails++;
          console.log("NaN skeleton", def.id, name, t);
        }
      }
    }
for (const def of FIGHTERS)
  for (const st of ["idle", "walk", "jump", "block", "blockstun", "hit", "land", "ko", "win"]) {
    const f = makeFighter(def, 1);
    f.state = st;
    for (let t = 0; t < 60; t++) {
      f.t = t;
      f.vy = 10 - t / 3;
      const s = skeleton(poseOf(f, t / 60)[0]);
      if (!finite(s)) {
        fails++;
        console.log("NaN skeleton", def.id, st, t);
      }
    }
  }

// full bouts
let n = 0;
for (const a of FIGHTERS)
  for (const b of FIGHTERS) {
    n++;
    const m = createMatch({ fighters: [a.id, b.id], arena: ARENAS[n % 4].id, roundTime: 45 });
    const A = createAI(aiParams(0.8), n);
    const B = createAI(aiParams(0.8), n + 100);
    const fx = [];
    const cam = { x: 480, z: 1 };
    let guard = 0;
    try {
      while (m.phase !== "over" || m.t < 120) {
        if (guard++ > 60 * 60 * 5) break;
        for (const e of step(m, [aiInput(A, m, 0), aiInput(B, m, 1)])) spawnFx(fx, e, m);
        stepFx(fx, 1 / 60);
        followCam(cam, m, 1 / 60);
        if (!Number.isFinite(cam.x) || !Number.isFinite(cam.z) || cam.z < 1 || cam.z > 1.31) throw new Error(`camera ${cam.x} ${cam.z}`);
        drawFrame(ctx, m, view, fx, {}, m.frame / 60, { cam, hitboxes: true, names: ["A", "B"], bannerNames: ["A", "B"] });
        frames++;
      }
    } catch (e) {
      fails++;
      console.log(`render crash ${a.id} v ${b.id} at frame ${m.frame}:`, e.stack);
    }
  }
// a few no-input frames on a fresh match too (intro banners)
const m = createMatch({ fighters: ["flame", "flame"], arena: "cave" });
for (let i = 0; i < 200; i++) {
  step(m, [NO_INPUT, NO_INPUT]);
  drawFrame(ctx, m, view, [], null, i / 60, {});
}
console.log(`${frames} frames drawn, ${fails} failures`);
process.exit(fails ? 1 : 0);
