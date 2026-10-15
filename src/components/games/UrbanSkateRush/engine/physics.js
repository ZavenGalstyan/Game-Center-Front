/**
 * Urban Skate Rush — Skateboard Physics Engine
 *
 * Handles skateboard movement, jumping, landing, and collision.
 * Pure JS (no Three.js dependencies).
 */

// Physics constants
export const CONFIG = {
  // Movement
  MAX_SPEED: 11, // easy mode: calmer top speed
  ACCELERATION: 12,
  BRAKE_DECEL: 20,
  FRICTION: 3,
  SPRINT_MULT: 1.4,

  // Turning
  TURN_SPEED: 3.5,
  TURN_SPEED_LOW: 4.2,
  TURN_SPEED_HIGH: 3.0,
  TURN_THRESHOLD: 5,

  // Jump
  JUMP_FORCE: 8,
  GRAVITY: 22,
  MAX_FALL: 30,

  // Crouch jump
  CROUCH_JUMP_MULT: 1.25,
  CROUCH_TIME_REQUIRED: 0.2,

  // Collision
  PLAYER_RADIUS: 0.4,
  PLAYER_HEIGHT: 1.7,

  // Grind
  GRIND_SNAP_DIST: 1.7,
  GRIND_SPEED: 8,
  GRIND_FRICTION: 1,
};

// Player states
export const STATES = {
  SKATING: "skating",
  AIR: "air",
  GRINDING: "grinding",
  CRASHED: "crashed",
  MANUAL: "manual",
};

// Trick definitions
export const TRICKS = {
  OLLIE: { name: "Ollie", points: 100, duration: 0.3 },
  KICKFLIP: { name: "Kickflip", points: 250, duration: 0.4 },
  HEELFLIP: { name: "Heelflip", points: 250, duration: 0.4 },
  SHOVE_IT: { name: "Pop Shove-it", points: 200, duration: 0.35 },
  SPIN_180: { name: "180", points: 150, duration: 0.35 },
  SPIN_360: { name: "360", points: 350, duration: 0.5 },
  MANUAL: { name: "Manual", points: 50, duration: 0 }, // Points per second
  NOSE_MANUAL: { name: "Nose Manual", points: 60, duration: 0 },
  BOARDSLIDE: { name: "Boardslide", points: 100, duration: 0 }, // Points per second
  FIFTY_FIFTY: { name: "50-50 Grind", points: 120, duration: 0 },
};

export function createPlayer(spawn = {}) {
  return {
    // Position
    x: spawn.x || 0,
    y: spawn.y || 0.1,
    z: spawn.z || 0,

    // Velocity
    vx: 0,
    vy: 0,
    vz: 0,

    // Rotation (radians)
    yaw: spawn.yaw || 0, // Facing direction
    pitch: 0, // Board tilt for tricks
    roll: 0, // Board roll for tricks

    // State
    state: STATES.SKATING,
    stateTime: 0,
    prevState: STATES.SKATING,

    // Ground
    grounded: true,
    groundY: 0,

    // Speed
    speed: 0,
    targetSpeed: 0,

    // Crouch
    crouching: false,
    crouchTime: 0,

    // Jump
    jumpHeld: false,
    coyoteTime: 0,
    jumpBuffer: 0,

    // Trick state
    currentTrick: null,
    trickTime: 0,
    trickProgress: 0,

    // Combo
    combo: [],
    comboScore: 0,
    comboMultiplier: 1,

    // Grind
    grindRail: null,
    grindProgress: 0,
    grindDistance: 0,

    // Air
    airTime: 0,
    peakHeight: 0,
    spinAngle: 0,

    // Animation
    wheelRotation: 0,
    pushPhase: 0,

    // Events
    events: [],
  };
}

export function setState(player, newState) {
  if (player.state === newState) return;
  player.prevState = player.state;
  player.state = newState;
  player.stateTime = 0;
}

function emit(player, type, data) {
  player.events.push({ type, ...data });
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ============================================================
// Movement
// ============================================================

function updateSkatingSate(player, input, dt, world) {
  const C = CONFIG;

  // Crouching
  if (input.crouch) {
    player.crouching = true;
    player.crouchTime += dt;
  } else {
    player.crouching = false;
    player.crouchTime = 0;
  }

  // Calculate target speed
  let targetSpeed = 0;
  if (input.mz > 0) {
    targetSpeed = C.MAX_SPEED * input.mag;
    if (input.sprint) targetSpeed *= C.SPRINT_MULT;
  } else if (input.mz < 0) {
    targetSpeed = -C.MAX_SPEED * 0.3 * Math.abs(input.mag);
  }

  // Apply acceleration/deceleration
  if (Math.abs(targetSpeed) > Math.abs(player.speed)) {
    // Accelerating
    const accel = input.sprint ? C.ACCELERATION * 1.2 : C.ACCELERATION;
    player.speed = lerp(player.speed, targetSpeed, 1 - Math.exp(-accel * dt));

    // Push animation
    if (targetSpeed > 0) {
      player.pushPhase += dt * 3;
      if (player.pushPhase > Math.PI * 2) player.pushPhase -= Math.PI * 2;
    }
  } else if (targetSpeed === 0) {
    // Friction
    const friction = input.mz < 0 ? C.BRAKE_DECEL : C.FRICTION;
    if (player.speed > 0) {
      player.speed = Math.max(0, player.speed - friction * dt);
    } else if (player.speed < 0) {
      player.speed = Math.min(0, player.speed + friction * dt);
    }
  } else {
    // Braking
    player.speed = lerp(player.speed, targetSpeed, 1 - Math.exp(-C.BRAKE_DECEL * dt));
  }

  // Turning
  if (Math.abs(input.mx) > 0.1 && Math.abs(player.speed) > 0.5) {
    // Turn rate depends on speed
    const speedRatio = Math.abs(player.speed) / C.MAX_SPEED;
    const turnRate = lerp(C.TURN_SPEED_LOW, C.TURN_SPEED_HIGH, speedRatio);
    player.yaw -= input.mx * turnRate * dt * Math.sign(player.speed);
    player.yaw = normalizeAngle(player.yaw);
  }

  // Apply velocity based on facing direction
  player.vx = Math.sin(player.yaw) * player.speed;
  player.vz = Math.cos(player.yaw) * player.speed;

  // Coyote time for jumping off edges
  player.coyoteTime = 0.1;

  // Jump buffer
  if (input.jumpPressed) {
    player.jumpBuffer = 0.15;
  }

  // Jump
  if ((player.jumpBuffer > 0 || input.jumpPressed) && player.grounded) {
    let jumpForce = C.JUMP_FORCE;
    if (player.crouchTime >= C.CROUCH_TIME_REQUIRED) {
      jumpForce *= C.CROUCH_JUMP_MULT;
    }
    player.vy = jumpForce;
    player.grounded = false;
    player.jumpHeld = true;
    player.jumpBuffer = 0;
    player.crouching = false;
    player.crouchTime = 0;
    setState(player, STATES.AIR);
    emit(player, "jump", { force: jumpForce });

    // Start ollie trick
    startTrick(player, TRICKS.OLLIE);
    return;
  }

  // Update position
  player.x += player.vx * dt;
  player.z += player.vz * dt;

  // Wheel rotation
  player.wheelRotation += player.speed * dt * 2;

  // Ground collision — follow ramps up AND down; leaving a ramp lip launches you
  const groundHeight = getGroundHeight(world, player.x, player.z);
  const prevY = player.y;
  if (player.y <= groundHeight + 0.01 || (player.grounded && player.y - groundHeight < 0.25)) {
    player.y = groundHeight;
    player.groundY = groundHeight;
    player.grounded = true;
    // vertical speed while riding a slope (used for the launch)
    const climb = dt > 0 ? (player.y - prevY) / dt : 0;
    player.rampVy = lerp(player.rampVy || 0, Math.max(0, climb), 0.5);
  } else {
    // Rolled off a ledge / ramp lip
    player.grounded = false;
    const launch = (player.rampVy || 0) > 0.6;
    player.vy = launch ? Math.min(7, player.rampVy * 1.7 + 2) : 0;
    player.rampVy = 0;
    setState(player, STATES.AIR);
    if (launch) {
      emit(player, "launch", { vy: player.vy });
      startTrick(player, TRICKS.OLLIE);
    } else emit(player, "fallOff");
  }

  // Check for obstacles
  checkCollisions(player, world, dt);
}

function updateAirState(player, input, dt, world) {
  const C = CONFIG;

  player.airTime += dt;

  // Gravity
  player.vy -= C.GRAVITY * dt;
  player.vy = Math.max(-C.MAX_FALL, player.vy);

  // Variable jump height
  if (!input.jumpHeld && player.vy > 0 && player.jumpHeld) {
    player.vy *= 0.5;
    player.jumpHeld = false;
  }

  // Air control (limited)
  const airControl = 0.4;
  if (Math.abs(input.mx) > 0.1) {
    player.yaw -= input.mx * CONFIG.TURN_SPEED * airControl * dt;
    player.spinAngle += input.mx * 2 * dt;
  }

  // Trick inputs
  if (player.currentTrick === null || player.trickProgress >= 1) {
    if (input.kickflip) {
      startTrick(player, TRICKS.KICKFLIP);
    } else if (input.heelflip) {
      startTrick(player, TRICKS.HEELFLIP);
    } else if (input.shoveIt) {
      startTrick(player, TRICKS.SHOVE_IT);
    }
  }

  // Spin detection
  const absSpinAngle = Math.abs(player.spinAngle);
  if (absSpinAngle >= Math.PI * 1.8 && absSpinAngle < Math.PI * 2.2) {
    if (!player.combo.find((t) => t.name === TRICKS.SPIN_360.name)) {
      addToCombo(player, TRICKS.SPIN_360);
    }
  } else if (absSpinAngle >= Math.PI * 0.8 && absSpinAngle < Math.PI * 1.2) {
    if (!player.combo.find((t) => t.name === TRICKS.SPIN_180.name)) {
      addToCombo(player, TRICKS.SPIN_180);
    }
  }

  // Update trick
  if (player.currentTrick) {
    player.trickTime += dt;
    player.trickProgress = Math.min(1, player.trickTime / player.currentTrick.duration);

    // Board rotation for trick animation
    if (player.currentTrick === TRICKS.KICKFLIP) {
      player.roll = Math.sin(player.trickProgress * Math.PI * 2) * Math.PI;
    } else if (player.currentTrick === TRICKS.HEELFLIP) {
      player.roll = -Math.sin(player.trickProgress * Math.PI * 2) * Math.PI;
    } else if (player.currentTrick === TRICKS.SHOVE_IT) {
      // a pop + wobble that always returns flat (the old half-turn pitch made every shove-it a crash)
      player.pitch = Math.sin(player.trickProgress * Math.PI) * 0.5;
    }
  }

  // Apply velocity
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.z += player.vz * dt;

  // walls / pillars / props are solid in the air too (jumping or launching
  // at a wall used to fly straight through it and out of the room)
  checkCollisions(player, world, dt);

  // Track peak height
  if (player.y > player.peakHeight) {
    player.peakHeight = player.y;
  }

  // Ground check
  const groundHeight = getGroundHeight(world, player.x, player.z);
  if (player.y <= groundHeight && player.vy <= 0) {
    // Landing
    player.y = groundHeight;
    player.groundY = groundHeight;

    // Easy mode: every landing is clean — the board auto-levels and tricks
    // that were still spinning count as landed.
    player.grounded = true;
    player.vy = 0;
    if (player.combo.length > 0) endCombo(player, true);
    setState(player, STATES.SKATING);
    emit(player, "land", { height: player.peakHeight - groundHeight, clean: true });

    // Reset air state
    player.airTime = 0;
    player.peakHeight = player.y;
    player.spinAngle = 0;
    player.roll = 0;
    player.pitch = 0;
    player.currentTrick = null;
    player.trickTime = 0;
    player.trickProgress = 0;
  }

  // Rail detection — auto-grind: falling onto (or holding F near) a rail snaps on
  if (player.state === STATES.AIR) {
    const nearRail = findNearestRail(world, player);
    if (nearRail && (input.grind || player.vy < 0.5)) {
      const t = getClosestRailProgress(nearRail, player);
      const railY = nearRail.startY + t * (nearRail.endY - nearRail.startY);
      if (player.y >= railY - 0.45 && t > 0.01 && t < 0.97) startGrind(player, nearRail);
    }
  }
}

function updateGrindState(player, input, dt, world) {
  const rail = player.grindRail;
  if (!rail) {
    setState(player, STATES.AIR);
    return;
  }

  player.grindDistance += player.speed * dt;

  // Move along rail
  player.grindProgress += (player.speed / rail.length) * dt;

  if (player.grindProgress >= 1 || player.grindProgress < 0) {
    // End of rail
    endGrind(player, true);
    return;
  }

  // Interpolate position along rail
  const pos = getRailPosition(rail, player.grindProgress);
  player.x = pos.x;
  player.y = pos.y + 0.3; // Above rail
  player.z = pos.z;

  // Face along rail
  const dir = getRailDirection(rail, player.grindProgress);
  player.yaw = Math.atan2(dir.x, dir.z);

  // Apply friction
  player.speed -= CONFIG.GRIND_FRICTION * dt;
  if (player.speed < 2) {
    endGrind(player, false);
    return;
  }

  // Sparks
  emit(player, "grindSpark", { x: player.x, y: player.y - 0.3, z: player.z });

  // Jump off
  if (input.jumpPressed) {
    player.vy = CONFIG.JUMP_FORCE * 0.8;
    endGrind(player, true);
    emit(player, "grindJump");
  }

  // Score
  if (player.state === STATES.GRINDING) {
    const grindTrick = player.speed > 6 ? TRICKS.FIFTY_FIFTY : TRICKS.BOARDSLIDE;
    addToCombo(player, grindTrick, dt);
  }
}

function updateCrashedState(player, input, dt, world) {
  player.stateTime += dt;

  // Ragdoll physics
  player.vy -= CONFIG.GRAVITY * dt;
  player.y += player.vy * dt;
  player.x += player.vx * 0.5 * dt;
  player.z += player.vz * 0.5 * dt;

  const groundHeight = getGroundHeight(world, player.x, player.z);
  if (player.y < groundHeight) {
    player.y = groundHeight;
    player.vy = 0;
    player.vx *= 0.8;
    player.vz *= 0.8;
  }

  // Recovery after delay
  if (player.stateTime >= 1.5) {
    player.grounded = true;
    player.speed = 0;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.roll = 0;
    player.pitch = 0;
    setState(player, STATES.SKATING);
    emit(player, "recover");
  }
}

// ============================================================
// Tricks
// ============================================================

function startTrick(player, trick) {
  player.currentTrick = trick;
  player.trickTime = 0;
  player.trickProgress = 0;
  addToCombo(player, trick);
  emit(player, "trick", { trick: trick.name });
}

function addToCombo(player, trick, duration = 0) {
  // Don't add duplicate tricks in same combo (except grind scoring)
  if (duration === 0 && player.combo.find((t) => t.name === trick.name)) {
    return;
  }

  const points = duration > 0 ? trick.points * duration : trick.points;

  if (duration === 0) {
    player.combo.push({ name: trick.name, points });
  }
  player.comboScore += points;
  player.comboMultiplier = Math.min(10, 1 + player.combo.length * 0.5);

  emit(player, "comboAdd", {
    trick: trick.name,
    points: Math.floor(points),
    total: Math.floor(player.comboScore * player.comboMultiplier),
  });
}

function endCombo(player, success) {
  if (player.combo.length === 0) return;

  const finalScore = Math.floor(player.comboScore * player.comboMultiplier);

  emit(player, "comboEnd", {
    success,
    tricks: player.combo.length,
    score: finalScore,
    multiplier: player.comboMultiplier,
  });

  // Reset combo
  player.combo = [];
  player.comboScore = 0;
  player.comboMultiplier = 1;

  return success ? finalScore : 0;
}

function crash(player) {
  setState(player, STATES.CRASHED);
  player.vy = 3;
  player.vx *= 0.3;
  player.vz *= 0.3;
  player.roll = Math.random() * Math.PI - Math.PI / 2;

  // Cancel combo
  endCombo(player, false);

  emit(player, "crash");
}

// ============================================================
// Grinding
// ============================================================

function startGrind(player, rail) {
  player.grindRail = rail;
  player.grindProgress = getClosestRailProgress(rail, player);
  player.grindDistance = 0;
  player.speed = Math.max(player.speed, CONFIG.GRIND_SPEED);
  player.vy = 0;
  setState(player, STATES.GRINDING);
  emit(player, "grindStart", { rail: rail.id });
}

function endGrind(player, success) {
  const distance = player.grindDistance;
  player.grindRail = null;
  player.grindProgress = 0;
  player.grindDistance = 0;

  if (success && distance > 0.5) {
    emit(player, "grindEnd", { distance, success: true });
  }

  setState(player, STATES.AIR);
}

// ============================================================
// Collision
// ============================================================

function getGroundHeight(world, x, z) {
  if (!world || !world.grounds) return 0;

  for (const ground of world.grounds) {
    if (x >= ground.minX && x <= ground.maxX && z >= ground.minZ && z <= ground.maxZ) {
      if (ground.axis) {
        // sloped ground (ramps / kickers): y0 at the min edge → y1 at the max edge
        const t = ground.axis === "x" ? (x - ground.minX) / (ground.maxX - ground.minX) : (z - ground.minZ) / (ground.maxZ - ground.minZ);
        return ground.y0 + (ground.y1 - ground.y0) * t;
      }
      return ground.y;
    }
  }
  return 0;
}

function checkCollisions(player, world, dt) {
  if (!world || !world.obstacles) return;

  const R = CONFIG.PLAYER_RADIUS;

  for (const obs of world.obstacles) {
    // Simple AABB collision
    if (
      player.x + R > obs.minX &&
      player.x - R < obs.maxX &&
      player.z + R > obs.minZ &&
      player.z - R < obs.maxZ &&
      player.y < obs.maxY &&
      player.y + CONFIG.PLAYER_HEIGHT > obs.minY
    ) {
      // Find push direction
      const overlapX1 = player.x + R - obs.minX;
      const overlapX2 = obs.maxX - (player.x - R);
      const overlapZ1 = player.z + R - obs.minZ;
      const overlapZ2 = obs.maxZ - (player.z - R);

      const minOverlap = Math.min(overlapX1, overlapX2, overlapZ1, overlapZ2);

      let hitX = false;
      if (minOverlap === overlapX1) {
        player.x = obs.minX - R;
        hitX = true;
      } else if (minOverlap === overlapX2) {
        player.x = obs.maxX + R;
        hitX = true;
      } else if (minOverlap === overlapZ1) {
        player.z = obs.minZ - R;
      } else {
        player.z = obs.maxZ + R;
      }

      // Easy mode: never crash — glance off and slide along the wall
      const s = Math.sin(player.yaw);
      const c = Math.cos(player.yaw);
      const along = hitX ? Math.abs(c) : Math.abs(s);
      if (hitX) player.yaw = c >= 0 ? 0 : Math.PI;
      else player.yaw = s >= 0 ? Math.PI / 2 : -Math.PI / 2;
      player.speed *= Math.max(0.45, along);
      player.vx = Math.sin(player.yaw) * player.speed;
      player.vz = Math.cos(player.yaw) * player.speed;
      emit(player, "bump");
    }
  }
}

function findNearestRail(world, player) {
  if (!world || !world.rails) return null;

  let nearest = null;
  let nearestDist = CONFIG.GRIND_SNAP_DIST;

  for (const rail of world.rails) {
    const dist = distanceToRail(rail, player);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = rail;
    }
  }

  return nearest;
}

function distanceToRail(rail, player) {
  // Simple distance to rail line segment
  const dx = rail.endX - rail.startX;
  const dz = rail.endZ - rail.startZ;
  const length = Math.hypot(dx, dz);

  if (length < 0.01) return Infinity;

  const t = clamp(
    ((player.x - rail.startX) * dx + (player.z - rail.startZ) * dz) / (length * length),
    0,
    1
  );

  const closestX = rail.startX + t * dx;
  const closestZ = rail.startZ + t * dz;
  const closestY = rail.startY + t * (rail.endY - rail.startY);

  return Math.hypot(player.x - closestX, player.y - closestY, player.z - closestZ);
}

function getClosestRailProgress(rail, player) {
  const dx = rail.endX - rail.startX;
  const dz = rail.endZ - rail.startZ;
  const length = Math.hypot(dx, dz);

  if (length < 0.01) return 0;

  return clamp(
    ((player.x - rail.startX) * dx + (player.z - rail.startZ) * dz) / (length * length),
    0,
    1
  );
}

function getRailPosition(rail, progress) {
  return {
    x: rail.startX + progress * (rail.endX - rail.startX),
    y: rail.startY + progress * (rail.endY - rail.startY),
    z: rail.startZ + progress * (rail.endZ - rail.startZ),
  };
}

function getRailDirection(rail, progress) {
  const dx = rail.endX - rail.startX;
  const dz = rail.endZ - rail.startZ;
  const length = Math.hypot(dx, dz);

  return {
    x: dx / length,
    z: dz / length,
  };
}

// ============================================================
// Main Update
// ============================================================

export function stepPlayer(player, input, dt, world) {
  // Clamp dt for stability
  dt = Math.min(dt, 0.05);

  player.stateTime += dt;

  // Update jump buffer
  if (player.jumpBuffer > 0) {
    player.jumpBuffer -= dt;
  }

  // Update coyote time
  if (player.coyoteTime > 0) {
    player.coyoteTime -= dt;
  }

  switch (player.state) {
    case STATES.SKATING:
      updateSkatingSate(player, input, dt, world);
      break;
    case STATES.AIR:
      updateAirState(player, input, dt, world);
      break;
    case STATES.GRINDING:
      updateGrindState(player, input, dt, world);
      break;
    case STATES.CRASHED:
      updateCrashedState(player, input, dt, world);
      break;
  }

  // Safety net: never leave the room, whatever the state
  const b = world && world.bounds;
  if (b) {
    const R = CONFIG.PLAYER_RADIUS;
    if (player.x < b.minX + R) player.x = b.minX + R;
    if (player.x > b.maxX - R) player.x = b.maxX - R;
    if (player.z < b.minZ + R) player.z = b.minZ + R;
    if (player.z > b.maxZ - R) player.z = b.maxZ - R;
  }
}

export function resetPlayer(player, spawn) {
  player.x = spawn.x || 0;
  player.y = spawn.y || 0.1;
  player.z = spawn.z || 0;
  player.yaw = spawn.yaw || 0;

  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.speed = 0;

  player.state = STATES.SKATING;
  player.stateTime = 0;
  player.grounded = true;
  player.currentTrick = null;
  player.combo = [];
  player.comboScore = 0;
  player.comboMultiplier = 1;
  player.roll = 0;
  player.pitch = 0;
  player.spinAngle = 0;
  player.airTime = 0;
  player.peakHeight = player.y;
  player.grindRail = null;

  player.events = [];
}
