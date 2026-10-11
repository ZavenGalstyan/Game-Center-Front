/**
 * Urban Skate Rush — Third-Person Camera System
 *
 * Smooth following camera with orbit controls.
 */

const lerp = (a, b, t) => a + (b - a) * t;

export const CAMERA_CONFIG = {
  // Distance
  DISTANCE_MIN: 4,
  DISTANCE_DEFAULT: 6,
  DISTANCE_MAX: 10,
  DISTANCE_SPEED_SCALE: 0.1, // Extra distance at high speed

  // Height
  HEIGHT_OFFSET: 2,
  LOOK_HEIGHT: 1.2,

  // Smoothing
  POSITION_SMOOTH: 8,
  ROTATION_SMOOTH: 6,

  // Orbit
  ORBIT_SENSITIVITY: 0.003,
  PITCH_MIN: -0.3,
  PITCH_MAX: 0.8,

  // Speed effects
  FOV_DEFAULT: 60,
  FOV_SPEED_MAX: 75,
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
    orbitPitch: 0.2, // Vertical orbit

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
  const speedRatio = Math.abs(player.speed) / 15;
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
  camera.orbitPitch = 0.2;
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
