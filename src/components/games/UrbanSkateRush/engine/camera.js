/**
 * Urban Skate Rush — Third-Person Camera System
 *
 * Smooth following camera with orbit controls.
 */

const lerp = (a, b, t) => a + (b - a) * t;

export const CAMERA_CONFIG = {
  // Distance
  DISTANCE_MIN: 4,
  DISTANCE_DEFAULT: 4.6, // indoor rooms: closer chase cam
  DISTANCE_MAX: 10,
  DISTANCE_SPEED_SCALE: 0.1, // Extra distance at high speed

  // Height
  HEIGHT_OFFSET: 0.75,
  LOOK_HEIGHT: 1.05,

  // Smoothing
  POSITION_SMOOTH: 8,
  ROTATION_SMOOTH: 6,

  // Orbit
  ORBIT_SENSITIVITY: 0.003,
  PITCH_MIN: -0.3,
  PITCH_MAX: 0.8,

  // Speed effects
  FOV_DEFAULT: 62,
  FOV_SPEED_MAX: 72,
  FOV_SMOOTH: 4,
};

export function createCamera() {
  return {
    // Position
    x: 0,
    y: 5,
    z: -6,

    // Target
    targetX: 0,
    targetY: 1,
    targetZ: 0,

    // Orbit angles
    orbitYaw: 0, // Horizontal orbit
    orbitPitch: 0.16, // Vertical orbit

    // Distance
    distance: CAMERA_CONFIG.DISTANCE_DEFAULT,

    // FOV
    fov: CAMERA_CONFIG.FOV_DEFAULT,

    // Shake
    shakeIntensity: 0,
    shakeX: 0,
    shakeY: 0,
  };
}

export function updateCamera(camera, player, input, dt, settings = {}) {
  const C = CAMERA_CONFIG;
  const sensitivity = (settings.cameraSensitivity || 1) * C.ORBIT_SENSITIVITY;
  const distanceMult = settings.cameraDistance || 1;

  // Apply mouse input to orbit
  if (input.mouseDeltaX !== 0 || input.mouseDeltaY !== 0) {
    camera.orbitYaw -= input.mouseDeltaX * sensitivity;
    camera.orbitPitch -= input.mouseDeltaY * sensitivity;

    // Clamp pitch
    camera.orbitPitch = Math.max(C.PITCH_MIN, Math.min(C.PITCH_MAX, camera.orbitPitch));
  }

  // Calculate target position (where the player is)
  camera.targetX = player.x;
  camera.targetY = player.y + C.LOOK_HEIGHT;
  camera.targetZ = player.z;

  // Calculate camera distance based on speed
  const speedRatio = Math.min(1, Math.abs(player.speed) / 11);
  const baseDistance = C.DISTANCE_DEFAULT * distanceMult;
  const targetDistance = baseDistance + speedRatio * C.DISTANCE_SPEED_SCALE * baseDistance;
  camera.distance = lerp(camera.distance, targetDistance, 1 - Math.exp(-4 * dt));

  // Calculate camera position based on orbit
  const yawAngle = player.yaw + camera.orbitYaw;
  const pitchAngle = camera.orbitPitch;

  const horizontalDist = camera.distance * Math.cos(pitchAngle);
  const verticalDist = camera.distance * Math.sin(pitchAngle);

  const idealX = camera.targetX - Math.sin(yawAngle) * horizontalDist;
  const idealY = camera.targetY + verticalDist + C.HEIGHT_OFFSET;
  const idealZ = camera.targetZ - Math.cos(yawAngle) * horizontalDist;

  // Smooth camera movement
  const smoothFactor = 1 - Math.exp(-C.POSITION_SMOOTH * dt);
  camera.x = lerp(camera.x, idealX, smoothFactor);
  camera.y = lerp(camera.y, idealY, smoothFactor);
  camera.z = lerp(camera.z, idealZ, smoothFactor);

  // Apply shake
  if (camera.shakeIntensity > 0) {
    camera.shakeX = (Math.random() - 0.5) * camera.shakeIntensity;
    camera.shakeY = (Math.random() - 0.5) * camera.shakeIntensity;
    camera.shakeIntensity *= 0.9;
    if (camera.shakeIntensity < 0.01) camera.shakeIntensity = 0;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
  }

  // FOV based on speed
  const targetFov = C.FOV_DEFAULT + speedRatio * (C.FOV_SPEED_MAX - C.FOV_DEFAULT);
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-C.FOV_SMOOTH * dt));
}

export function shakeCamera(camera, intensity) {
  camera.shakeIntensity = Math.max(camera.shakeIntensity, intensity);
}

export function resetCamera(camera, player) {
  camera.orbitYaw = 0;
  camera.orbitPitch = 0.16;
  camera.distance = CAMERA_CONFIG.DISTANCE_DEFAULT;
  camera.x = player.x;
  camera.y = player.y + 5;
  camera.z = player.z - 6;
  camera.targetX = player.x;
  camera.targetY = player.y + 1;
  camera.targetZ = player.z;
  camera.shakeIntensity = 0;
}

export function getCameraMatrix(camera) {
  // Returns values for Three.js camera positioning
  return {
    position: [
      camera.x + camera.shakeX,
      camera.y + camera.shakeY,
      camera.z,
    ],
    lookAt: [camera.targetX, camera.targetY, camera.targetZ],
    fov: camera.fov,
  };
}

/* ------------------------------------------------------------------ collision */

/** Fraction (0..1) along origin→origin+d where the ray first enters a box, or 1. */
function rayBoxes(ox, oy, oz, dx, dy, dz, boxes, pad) {
  let best = 1;
  for (const b of boxes) {
    const minX = b.minX - pad;
    const maxX = b.maxX + pad;
    const minY = (b.minY ?? 0) - pad;
    const maxY = b.maxY + pad;
    const minZ = b.minZ - pad;
    const maxZ = b.maxZ + pad;
    // the skater is never "inside" a box we care about (e.g. standing on a ledge)
    if (ox > minX && ox < maxX && oy > minY && oy < maxY && oz > minZ && oz < maxZ) continue;
    let t0 = 0;
    let t1 = best;
    let ok = true;
    for (const [o, d, lo, hi] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          ok = false;
          break;
        }
        continue;
      }
      let a = (lo - o) / d;
      let c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) {
        ok = false;
        break;
      }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

const CAM_PAD = 0.3; // keep this far from any surface (near-plane safety)
const MIN_VIEW_DIST = 2.4; // closer than this → rise above the skater instead

/**
 * Keeps the chase camera out of walls, pillars, crates and ramps: it is
 * pulled in front of the first obstacle between the skater and the camera,
 * and when that leaves it too close (back against a wall) it rises up and
 * looks down at the skater so the rider always stays in view. Writes the
 * corrected position back so the smoothing continues from it (no popping).
 */
export function resolveCameraCollision(camera, obstacles = [], bounds = null) {
  const tx = camera.targetX;
  const ty = camera.targetY;
  const tz = camera.targetZ;
  let cx = camera.x;
  let cy = camera.y;
  let cz = camera.z;
  const ceiling = bounds ? bounds.maxY - 0.6 : Infinity;

  const cast = () => {
    const dx = cx - tx;
    const dy = cy - ty;
    const dz = cz - tz;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    let t = rayBoxes(tx, ty, tz, dx, dy, dz, obstacles, CAM_PAD);
    if (bounds) {
      // room shell (inside faces of the walls / ceiling)
      const m = CAM_PAD;
      if (dx > 0) t = Math.min(t, (bounds.maxX - m - tx) / dx);
      if (dx < 0) t = Math.min(t, (bounds.minX + m - tx) / dx);
      if (dz > 0) t = Math.min(t, (bounds.maxZ - m - tz) / dz);
      if (dz < 0) t = Math.min(t, (bounds.minZ + m - tz) / dz);
      if (dy > 0) t = Math.min(t, (ceiling - ty) / dy);
    }
    if (t < 1) {
      const f = Math.max(0, t - 0.05 / len);
      cx = tx + dx * f;
      cy = ty + dy * f;
      cz = tz + dz * f;
    }
  };

  cast();
  // squeezed against something: climb above the rider and look down
  const hd = Math.hypot(cx - tx, cz - tz);
  if (hd < MIN_VIEW_DIST) {
    const lift = (MIN_VIEW_DIST - hd) * 1.15;
    cy = Math.min(ceiling, Math.max(cy, ty + 0.9 + lift));
    cast(); // re-check the raised line of sight
  }
  cy = Math.max(0.4, Math.min(ceiling, cy));
  camera.x = cx;
  camera.y = cy;
  camera.z = cz;
}
