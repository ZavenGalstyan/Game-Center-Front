/**
 * Stunt Racer 3D — jump sizing helper (dev tool). For a ramp (len, rise)
 * and a landing drop, prints how far past the lip a car lands when it hits
 * the ramp at a range of approach speeds (real car physics on the ramp,
 * then ballistics), so gaps / landing zones can be sized:
 *   gap ≤ ~0.85 × distance at the slowest allowed speed
 *   straight landing beyond the gap ≥ distance at top speed − gap + margin
 *
 *   node tools/jumpCalc.mjs <len> <rise> <drop> [minKmh]
 */
import { createRun, STATE } from "../engine/run.js";
import { placeOnTrack } from "../engine/car.js";
import { G } from "../engine/track.js";
import { CAR_BY_ID } from "../data/cars.js";

const [len, rise, drop, minKmh] = process.argv.slice(2).map(Number);
const def = { id: 998, name: "calc", world: 1, width: 14, y0: 100, pieces: [{ t: "S", len: 120, start: true }, { t: "ramp", len, rise }, { t: "gap", len: 300, drop: 0 }, { t: "S", len: 40 }] };
const car = CAR_BY_ID.get("blaze");
const out = [];
const vmax = 34 + 5 * 1.4;
for (const kmh of [minKmh || 75, 90, 110, 130, vmax * 3.6, (vmax + 10) * 3.6]) {
  const run = createRun(def, car);
  run.state = STATE.PLAYING;
  const r = run.T.ramps[0];
  placeOnTrack(run.car, run.T, r.s0 - 2, 0, kmh / 3.6);
  run.ai = () => ({ throttle: 0.6, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false });
  let n = 0;
  while (run.car.mode === "ground" && n++ < 2000) run.stepN(1);
  const c = run.car;
  const lip = run.T.samples[r.lip];
  // ballistic to y = lip.y - drop
  const t = (c.vy + Math.sqrt(c.vy * c.vy + 2 * G * (c.y - (lip.y - drop)))) / G;
  const x = Math.hypot(c.vx, c.vz) * t + Math.hypot(c.x - lip.x, c.z - lip.z);
  out.push(`${Math.round(kmh)} km/h → lip ${(Math.hypot(c.vx, c.vy, c.vz) * 3.6).toFixed(0)} km/h, lands ${x.toFixed(1)} m past the lip, air ${t.toFixed(2)} s`);
}
console.log(`ramp len ${len} rise ${rise} (lip slope ${((2 * rise) / len).toFixed(2)}), drop ${drop}`);
console.log(out.join("\n"));
