/**
 * Crowd Rush — obstacle hazard math.
 *
 * Each obstacle type is a pure function of local time -> a description the
 * renderer draws AND the engine tests runners against. Keeping the two in one
 * place is what makes a hit look like it came from the thing on screen.
 *
 * `hitsRunner(ob, tLocal, rx, rz)` — rx is the runner's world x, rz is the
 * runner's z RELATIVE to the obstacle's z (negative = not there yet).
 * `pushAt(ob, tLocal, rx, rz)` — sideways shove for non-lethal hazards.
 *
 * The engine caps how many runners any one obstacle can remove per short window
 * (see engine.js) so a single bad frame never wipes a crowd.
 */

const TAU = Math.PI * 2;

export function obstacleState(ob, tLocal) {
  const t = Math.max(0, tLocal);
  switch (ob.obstacle) {
    case "rotatingBar": {
      const a = t * (ob.speed || 1.2);
      return { angle: a, arm: ob.arm || 3.4, twin: !!ob.twin };
    }
    case "movingWall": {
      const gapX = Math.sin(t * (ob.speed || 1.3)) * (ob.range || 3.2);
      return { gapX, gap: ob.gap || 2, icy: !!ob.icy };
    }
    case "swingHammer": {
      const period = ob.period || 1.5;
      const s = ob.side || -1;
      const x = s * (3.6 - (1 + Math.cos((t / period) * TAU)) * 1.8);
      return { x, side: s, heavy: !!ob.heavy, twin: !!ob.twin, swing: Math.sin((t / period) * TAU) };
    }
    case "saw": {
      const x = Math.sin(t * (ob.speed || 1.6)) * (ob.sweep || 3.4) + (ob.x || 0);
      return { x, spin: t * 14 };
    }
    case "spikeRoller": {
      const w = ob.width || 3.6;
      const span = 2 * w + 2;
      const x = ((t * (ob.speed || 2)) % span) - w - 1;
      return { x, width: w, telegraph: 0.9 };
    }
    case "crusher": {
      const period = ob.period || 1.3;
      const local = (t % period) / period;
      const down = local < 0.34;
      const y = down ? 0.2 : 0.2 + Math.min(1, (local - 0.34) / 0.5) * 2.4 * (local < 0.7 ? 1 : (1 - local) / 0.3);
      return { down, y: Math.max(0.2, y), x: ob.x || 0, width: ob.width || 2.8, twin: !!ob.twin, local };
    }
    case "conveyor": {
      return { dir: ob.dir || 1, strength: ob.strength || 2.4, scroll: t * (ob.strength || 2.4) };
    }
    case "fallingColumn": {
      // engine flips ob._triggered when the crowd gets close; fall takes 0.5s
      const fallT = ob._triggered ? t - ob._triggeredAt : -1;
      const fallen = fallT >= 0.5;
      const y = fallT < 0 ? 6 : fallen ? 0.3 : 6 - (fallT / 0.5) * 5.7;
      return { y, fallen, falling: fallT >= 0 && !fallen, x: ob.x || 0 };
    }
    default:
      return {};
  }
}

export function hitsRunner(ob, tLocal, rx, rz) {
  const s = obstacleState(ob, tLocal);
  switch (ob.obstacle) {
    case "rotatingBar": {
      const test = (ang) => {
        const dx = rx;
        const dz = rz;
        const along = dx * Math.cos(ang) + dz * Math.sin(ang);
        const perp = -dx * Math.sin(ang) + dz * Math.cos(ang);
        return Math.abs(perp) < 0.4 && Math.abs(along) < s.arm;
      };
      return test(s.angle) || (s.twin && test(s.angle + Math.PI / 2));
    }
    case "movingWall": {
      if (Math.abs(rz) > 0.55) return false;
      const inGap = rx > s.gapX - s.gap / 2 && rx < s.gapX + s.gap / 2;
      return !inGap;
    }
    case "swingHammer": {
      if (Math.abs(rz) > 0.6) return false;
      const half = s.heavy ? 1.15 : 0.85;
      const a = Math.abs(rx - s.x) < half;
      const b = s.twin && Math.abs(rx + s.x) < half;
      return a || b;
    }
    case "saw":
      return Math.abs(rz) < 0.5 && Math.abs(rx - s.x) < 0.75;
    case "spikeRoller":
      return Math.abs(rz) < 0.55 && Math.abs(rx - s.x) < 1.0;
    case "crusher": {
      if (!s.down) return false;
      const a = Math.abs(rz) < 0.55 && Math.abs(rx - s.x) < s.width / 2;
      const b = s.twin && Math.abs(rz - 1.4) < 0.55 && Math.abs(rx + s.x) < s.width / 2;
      return a || b;
    }
    case "fallingColumn":
      return (s.fallen || s.falling) && Math.abs(rz) < 0.7 && Math.abs(rx - s.x) < 0.95;
    default:
      return false;
  }
}

/** non-lethal sideways push (conveyor). Returns world-units/second of x drift. */
export function pushAt(ob, tLocal, rx, rz, len = 10) {
  if (ob.obstacle !== "conveyor") return 0;
  if (rz < -1 || rz > len) return 0;
  const s = obstacleState(ob, tLocal);
  return s.dir * s.strength;
}

export const LETHAL_OBSTACLES = new Set([
  "rotatingBar", "movingWall", "swingHammer", "saw", "spikeRoller", "crusher", "fallingColumn",
]);
