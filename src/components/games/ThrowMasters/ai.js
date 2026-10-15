/**
 * Throw Masters — AI aiming. The AI never places projectiles: it searches for
 * an angle/power pair by flying candidate throws through the same physics as
 * the player (simulateShot), then deliberately spoils the answer with a
 * "misjudgement" bias plus per-throw hand shake. After every throw it looks
 * at where its shot ended up and shrinks the bias — so it walks its shots in
 * like a person would. `skill` (0..1) scales all of it.
 */
import { WEAPONS } from "./data.js";
import { simulateShot, fighterBox } from "./physics.js";

const lerp = (a, b, t) => a + (b - a) * t;

function gauss(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fresh per-battle AI memory. */
export function createAIMemory(skill, rand = Math.random) {
  const sign = rand() < 0.5 ? -1 : 1;
  return {
    skill,
    powerBias: sign * lerp(0.3, 0.06, skill) * (0.6 + 0.4 * rand()),
    angleBias: gauss(rand) * lerp(7, 2, skill),
    prefer: lerp(22, 52, rand()),
    throws: 0,
    misses: 0,
  };
}

/** Score a simulated throw: 0 = clean hit on the target, larger = worse. */
function score(res, target) {
  const ev = res.event;
  if (ev && ev.type === "fighter" && ev.side === target.side) return ev.zone === "legs" ? 6 : 0;
  if (ev && ev.type === "explode") return Math.max(0, res.minDist - 20);
  return res.minDist + 30;
}

/** Search the ideal throw for `shooter` → `target` in the current world. */
export function solveShot(world, shooter, target, weaponId) {
  const w = WEAPONS[weaponId];
  let best = null;
  const angles = [];
  for (let a = -8; a <= 80; a += 4) angles.push(a);
  const powers = [];
  for (let p = 0.2; p <= 1.0001; p += 0.05) powers.push(p);
  const tb = fighterBox(target);
  const solutions = [];
  for (const a of angles) {
    let aBest = null;
    for (const p of powers) {
      const res = simulateShot(world, shooter, weaponId, a, p, target, w.fuse ? 3 : 4.5);
      const s = score(res, target);
      if (!aBest || s < aBest.s) aBest = { a, p, s };
    }
    // refine power around the best coarse value
    for (let p = aBest.p - 0.045; p <= aBest.p + 0.045; p += 0.009) {
      if (p < 0.1 || p > 1) continue;
      const res = simulateShot(world, shooter, weaponId, a, p, target, w.fuse ? 3 : 4.5);
      const s = score(res, target);
      if (s < aBest.s) aBest = { a, p, s };
    }
    solutions.push(aBest);
    if (!best || aBest.s < best.s) best = aBest;
  }
  return { best, solutions, target: tb };
}

/**
 * Pick the throw the AI will actually make (with its mistakes applied).
 * Returns {angle, power, ideal}.
 */
export function planShot(world, shooter, target, weaponId, mem, rand = Math.random) {
  const { best, solutions } = solveShot(world, shooter, target, weaponId);
  // among the throws that would hit, take the one nearest the AI's preferred arc
  const good = solutions.filter((s) => s.s <= best.s + 4);
  good.sort((x, y) => Math.abs(x.a - mem.prefer) - Math.abs(y.a - mem.prefer));
  const pick = good[0] || best;
  const k = mem.skill;
  const angle = pick.a + mem.angleBias + gauss(rand) * lerp(14, 2.3, k);
  const power = pick.p * (1 + mem.powerBias + gauss(rand) * lerp(0.19, 0.032, k));
  return {
    angle: Math.max(-30, Math.min(85, angle)),
    power: Math.max(0.1, Math.min(1, power)),
    ideal: { angle: pick.a, power: pick.p },
  };
}

/** Learn from the throw just made: misses tighten the bias, like a human adjusting. */
export function learn(mem, hit, rand = Math.random) {
  mem.throws++;
  if (hit) {
    mem.powerBias *= 0.85;
    mem.angleBias *= 0.85;
  } else {
    mem.misses++;
    const c = lerp(0.8, 0.45, mem.skill);
    mem.powerBias *= c;
    mem.angleBias *= c;
    // after a miss, sometimes switch to a different arc
    if (rand() < 0.25) mem.prefer = lerp(20, 58, rand());
  }
}
