/**
 * Night Corridor — reusable light flicker controller.
 *
 * Every ceiling lamp has a power state (`on`) and a behaviour (`mode`):
 *
 *   steady    normal light ('f' lamps add rare, short random flickers)
 *   flicker   a burst of rapid stutter for `dur`, then back to its state
 *   blackout  dark for `dur`, then a stuttering restart
 *   unstable  irregular flashing until told otherwise
 *   fail      stutter for a second, then dead
 *   explode   instant pop + sparks, dead for the rest of the section
 *
 * `level` (0..1) is the brightness the renderer multiplies into the light
 * and the fixture's emissive. Lamps change through events only — nothing
 * flickers everywhere at random.
 */
import { mulberry32 } from "./rng.js";

export function createLamps(level, section) {
  const rand = mulberry32((section.id || 1) * 7919 + 13);
  const initial = section.lampsOff || [];
  const lamps = level.lamps.map((l) => ({
    ...l,
    on: l.kind !== "broken" && !initial.includes(l.kind),
    mode: "steady",
    timer: 0,
    flip: 0,
    level: 0,
    out: 1,
    nextRandom: 2 + rand() * 6,
    dead: l.kind === "broken",
  }));

  function setMode(lamp, mode, dur, emit) {
    if (lamp.dead && mode !== "off") return;
    switch (mode) {
      case "on":
        lamp.on = true;
        lamp.mode = "steady";
        break;
      case "off":
        lamp.on = false;
        lamp.mode = "steady";
        break;
      case "flicker":
        if (!lamp.on) return;
        lamp.mode = "flicker";
        lamp.timer = dur ?? 1.1;
        emit?.({ type: "lamp", action: "buzz", x: lamp.x, z: lamp.z });
        break;
      case "blackout":
        lamp.mode = "blackout";
        lamp.timer = dur ?? 2.5;
        break;
      case "unstable":
        lamp.on = true;
        lamp.mode = "unstable";
        emit?.({ type: "lamp", action: "buzz", x: lamp.x, z: lamp.z });
        break;
      case "fail":
        lamp.mode = "fail";
        lamp.timer = dur ?? 1.0;
        emit?.({ type: "lamp", action: "buzz", x: lamp.x, z: lamp.z });
        break;
      case "explode":
        if (!lamp.on) return;
        lamp.on = false;
        lamp.dead = true;
        lamp.mode = "steady";
        emit?.({ type: "lamp", action: "pop", x: lamp.x, z: lamp.z });
        break;
      default:
        break;
    }
  }

  /** Lamps picked by an event selector. */
  function select(selector, ctx) {
    if (!selector || selector === "all") return lamps;
    const [kind, a, b] = String(selector).split(":");
    if (kind === "kind") return lamps.filter((l) => l.kind === (a.length === 1 ? { o: "lamp", f: "flicker", e: "emergency", w: "warm", b: "bulb" }[a] : a));
    if (kind === "main") return lamps.filter((l) => l.kind === "lamp" || l.kind === "flicker" || l.kind === "bulb");
    if (kind === "near") {
      const m = ctx.markers[a];
      const rad = Number(b) || 6;
      if (!m) return [];
      return lamps.filter((l) => Math.hypot(l.x - m.x, l.z - m.z) <= rad);
    }
    if (kind === "player") {
      const rad = Number(a) || 6;
      return lamps.filter((l) => Math.hypot(l.x - ctx.player.x, l.z - ctx.player.z) <= rad);
    }
    if (kind === "behind") {
      // Lamps behind the player's view, within a radius — "the light goes out behind you".
      const rad = Number(a) || 10;
      const fx = -Math.sin(ctx.player.yaw);
      const fz = -Math.cos(ctx.player.yaw);
      return lamps.filter((l) => {
        const dx = l.x - ctx.player.x;
        const dz = l.z - ctx.player.z;
        const d = Math.hypot(dx, dz);
        return d <= rad && d > 1.5 && (dx * fx + dz * fz) / d < -0.2;
      });
    }
    if (kind === "nearest") {
      const n = Number(a) || 1;
      return [...lamps].filter((l) => !l.dead).sort((p, q) => Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) - Math.hypot(q.x - ctx.player.x, q.z - ctx.player.z)).slice(0, n);
    }
    return [];
  }

  function step(dt, emit) {
    for (const l of lamps) {
      if (l.dead) {
        l.level = 0;
        continue;
      }
      let out = l.on ? 1 : 0;
      switch (l.mode) {
        case "flicker":
        case "fail":
          l.timer -= dt;
          l.flip -= dt;
          if (l.flip <= 0) {
            l.flip = 0.03 + rand() * 0.1;
            l.out = rand() < 0.5 ? 0 : rand() < 0.5 ? 0.35 : 1;
          }
          out = l.out;
          if (l.timer <= 0) {
            if (l.mode === "fail") l.on = false;
            l.mode = "steady";
          }
          break;
        case "blackout":
          l.timer -= dt;
          out = 0;
          if (l.timer <= 0) {
            l.on = true;
            l.mode = "flicker";
            l.timer = 0.7;
            emit?.({ type: "lamp", action: "buzz", x: l.x, z: l.z });
          }
          break;
        case "unstable":
          l.flip -= dt;
          if (l.flip <= 0) {
            const lit = rand() < 0.55;
            l.flip = lit ? 0.08 + rand() * 0.9 : 0.04 + rand() * 0.25;
            l.out = lit ? 0.85 + rand() * 0.15 : rand() * 0.15;
          }
          out = l.out;
          break;
        default:
          if (l.on && l.kind === "flicker") {
            l.nextRandom -= dt;
            if (l.nextRandom <= 0) {
              l.nextRandom = 2.5 + rand() * 7;
              l.mode = "flicker";
              l.timer = 0.12 + rand() * 0.5;
            }
          }
          break;
      }
      l.level = out;
    }
  }

  function snapshot() {
    return lamps.map((l) => ({ on: l.on, mode: l.mode === "unstable" ? "unstable" : "steady", dead: l.dead }));
  }
  function restore(snap) {
    snap.forEach((s, i) => {
      const l = lamps[i];
      l.on = s.on;
      l.mode = s.mode;
      l.dead = s.dead;
      l.timer = 0;
    });
  }

  return { list: lamps, setMode, select, step, snapshot, restore };
}
