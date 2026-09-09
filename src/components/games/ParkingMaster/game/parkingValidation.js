/**
 * Parking Master — parking validation.
 *
 * A level is NOT complete just because the car touched the bay. Every one of
 * these must hold, continuously, for a short confirmation window:
 *
 *   1. the car's centre is inside the bay
 *   2. all four corners are inside the bay (a small margin is allowed)
 *   3. the heading is aligned with the bay's required direction (< ~14 deg)
 *   4. the car is essentially stopped (< 0.35 m/s)
 *
 * `evaluate` is pure and per-frame; the confirmation timer lives in the scene.
 * Precision (0–100) blends how centred and how square the car finished.
 */

const ANGLE_TOL = (14 * Math.PI) / 180;
const STOP_SPEED = 0.35;
const CORNER_MARGIN = 0.28; // metres a corner may poke outside the bay

export function evaluatePark(car, zone, footprint) {
  const [fw, fl] = footprint;
  const csin = Math.sin(zone.heading);
  const ccos = Math.cos(zone.heading);
  // world → bay-local: local X = bay width axis, local Z = bay length axis
  const toLocal = (wx, wz) => {
    const dx = wx - zone.pos[0];
    const dz = wz - zone.pos[1];
    return [dx * ccos - dz * csin, dx * csin + dz * ccos];
  };

  const [lx, lz] = toLocal(car.x, car.z);

  const halfW = zone.size[0] / 2;
  const halfL = zone.size[1] / 2;

  const centreInside = Math.abs(lx) <= halfW && Math.abs(lz) <= halfL;

  // four car corners → bay-local
  const carS = Math.sin(car.yaw);
  const carC = Math.cos(car.yaw);
  let worstOut = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ox = (sx * fw) / 2;
      const oz = (sz * fl) / 2;
      const wx = car.x + (ox * carC + oz * carS);
      const wz = car.z + (-ox * carS + oz * carC);
      const [bx, bz] = toLocal(wx, wz);
      worstOut = Math.max(worstOut, Math.abs(bx) - halfW, Math.abs(bz) - halfL);
    }
  }
  const boundsInside = worstOut <= CORNER_MARGIN;
  const positionOk = centreInside && boundsInside;

  // heading vs required — zone.heading IS the final car orientation
  const target = zone.heading;
  let angleDiff = car.yaw - target;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const angleOk = Math.abs(angleDiff) <= ANGLE_TOL;

  const stopped = Math.abs(car.speed) <= STOP_SPEED;

  const valid = positionOk && angleOk && stopped;

  /* -------------------------------------------------------- precision */

  const posErr = Math.min(
    1,
    Math.sqrt(
      Math.pow(lx / Math.max(0.4, halfW), 2) * 0.62 +
        Math.pow(lz / Math.max(0.4, halfL), 2) * 0.38,
    ),
  );
  const outPenalty = Math.min(0.5, Math.max(0, worstOut) / 0.6);
  const posScore = Math.max(0, 1 - posErr) * (1 - outPenalty);
  const angScore = Math.max(0, 1 - Math.abs(angleDiff) / (ANGLE_TOL * 1.6));
  const precision = Math.round(clamp(posScore * 0.55 + angScore * 0.45, 0, 1) * 100);

  return {
    valid,
    positionOk,
    angleOk,
    stopped,
    inZone: centreInside,
    precision,
    angleDiff,
    lx,
    lz,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export const HOLD_TIME = 1.1; // seconds the valid state must persist
