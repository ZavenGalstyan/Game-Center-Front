/**
 * Highway Racer — one run, as pure simulation (no Three.js, no DOM), so the
 * same code drives the game and the headless tests in tools/.
 *
 * Architecture: the player stays at z = 0 and everything else scrolls toward
 * +Z. Traffic keeps its own forward speed per lane, so its on-screen motion is
 * (playerSpeed - trafficSpeed) — it approaches because the player is faster.
 *
 * Run states:  countdown → playing → crashed → result
 * The only way into `crashed` is crash(), which bails unless the phase is
 * `playing`, so a crash fires exactly once per run.
 *
 * The world advances in fixed 1/120 s steps from a clamped frame delta
 * (≤ 50 ms), so a stalled or hidden tab can never jump traffic into the
 * player, and fast cars can't tunnel through each other.
 *
 * Pools: traffic, coins and boost pickups are fixed arrays of slots that are
 * switched on and off — nothing is allocated per spawn, counts stay bounded.
 */
import {
  BOOST, BOOST_PICKUP, COIN, COUNTDOWN, CRASH_TIME, DENSITY, DESPAWN_BEHIND, LANES, LANE_COUNT, LANE_SPEED,
  MAX_BOOST_PICKUPS, MAX_COINS, MAX_FRAME, MAX_TRAFFIC, NEAR, PLAYER, SAME_LANE_GAP, SCORE, SPAWN_AHEAD, SPEED,
  STEP, VEHICLES, clamp, lerpTable,
} from "./config.js";
import { PATTERNS, realize, tierAt, weighted } from "./patterns.js";
import { isFair, window as occupancy } from "./fairness.js";
import { carTuning } from "../data/cars.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAINTS = 8; // traffic colour variants (the renderer owns the palette)

function makeCar() {
  return { active: false, id: 0, lane: 1, x: 0, z: 0, speed: 0, type: "sedan", paint: 0, passed: false, near: false, minGap: 99, hit: false, bump: 0, yaw: 0 };
}
function makeCoin() {
  return { active: false, id: 0, x: 0, z: 0, kind: "coin", lanes: [] };
}

/**
 * `invincible` is for the headless long-run tools only: hits are counted in
 * R.ghostHits instead of ending the run.
 */
export function createRun({ car, seed = (Math.random() * 2 ** 31) | 0, invincible = false } = {}) {
  const tune = carTuning(car);
  const rng = mulberry32(seed);
  const R = {
    seed,
    car,
    tune,
    phase: "countdown",
    countdown: COUNTDOWN,
    countShown: 4,
    clock: 0,
    time: 0,
    crashTimer: 0,
    speed: 0,
    cruise: SPEED.start,
    distance: 0,
    score: 0,
    scoreFrac: 0,
    coins: 0,
    nearMisses: 0,
    passed: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    boost: 0,
    boostTime: 0,
    boostsUsed: 0,
    topSpeed: 0,
    crash: null,
    player: { lane: 1, target: 1, x: 0, vx: 0, lean: 0, yaw: 0, steer: 0, spin: 0, spinRate: 0, bounce: 0, bounceV: 0 },
    traffic: Array.from({ length: MAX_TRAFFIC }, makeCar),
    pickups: Array.from({ length: MAX_COINS + MAX_BOOST_PICKUPS }, makeCoin),
    spawnTimer: 0.9,
    coinTimer: 2.2,
    boostPickupTimer: 18,
    events: [],
    nextId: 1,
    acc: 0,
    ghostHits: 0,
  };

  const emit = (type, data) => {
    R.events.push(data ? { type, ...data } : { type });
    if (R.events.length > 200) R.events.splice(0, R.events.length - 200);
  };

  /* ------------------------------------------------------------ helpers */
  const activeCars = () => R.traffic.filter((c) => c.active);
  const refSpeed = () => Math.max(R.speed, SPEED.start);
  const boostTarget = (v) => Math.min(v * SPEED.boostMul, SPEED.hardCap);
  /** fastest the player can be when freshly spawned traffic arrives */
  const worstSpeed = () => boostTarget(Math.max(refSpeed(), Math.min(tune.topSpeed, R.cruise + 2)));

  function laneSpacingOk(lane, z, type, extra) {
    const hl = VEHICLES[type].halfLength;
    const check = (c) => c.lane === lane && Math.abs(c.z - z) < hl + VEHICLES[c.type].halfLength + SAME_LANE_GAP;
    for (const c of R.traffic) if (c.active && check(c)) return false;
    for (const c of extra) if (check(c)) return false;
    return true;
  }

  const pickupSpeeds = () => {
    const v = refSpeed();
    const w = worstSpeed();
    return [v, v + (w - v) / 3, v + ((w - v) * 2) / 3, w];
  };

  /** Does a static pickup at (x, z) collide with any car's occupancy window? */
  function pickupBlocked(x, z, cars, speeds) {
    for (const v of speeds) {
      const d = -z;
      const t = d / v;
      const tw = (PLAYER.halfLength + 1.2) / v;
      for (const c of cars) {
        const hw = VEHICLES[c.type].halfWidth;
        if (Math.abs(LANES[c.lane] - x) > hw + COIN.radius + 0.5) continue;
        const w = occupancy(c, v, 1.5);
        if (w && t + tw > w[0] && t - tw < w[1]) return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------ traffic */
  function trySpawn(base = SPAWN_AHEAD) {
    const tier = tierAt(R.time);
    const pool = PATTERNS.filter((p) => p.tier <= tier).map((p) => [p, p.w]);
    const cars = activeCars();
    const free = R.traffic.filter((c) => !c.active).length;
    const v = refSpeed();
    for (let attempt = 0; attempt < 6; attempt++) {
      const pattern = weighted(rng, pool);
      const spec = realize(pattern, rng, tier);
      if (spec.length > free) continue;
      const extra = [];
      let ok = true;
      for (const s of spec) {
        const z = -(base + s.dz + VEHICLES[s.type].halfLength);
        if (!laneSpacingOk(s.lane, z, s.type, extra)) {
          ok = false;
          break;
        }
        extra.push({ lane: s.lane, z, type: s.type, speed: LANE_SPEED[s.lane] });
      }
      if (!ok) continue;
      if (!isFair(cars, extra, v, worstSpeed(), tune.laneTime)) continue;
      // pickups never end up hidden inside traffic: drop far ones that would,
      // or try another shape if a visible one is in the way
      const clash = R.pickups.filter((p) => p.active && pickupBlocked(p.x, p.z, extra, pickupSpeeds()));
      if (clash.some((p) => p.z > -120)) continue;
      for (const p of clash) p.active = false;
      for (const e of extra) {
        const slot = R.traffic.find((c) => !c.active);
        Object.assign(slot, {
          active: true,
          id: R.nextId++,
          lane: e.lane,
          x: LANES[e.lane],
          z: e.z,
          speed: e.speed,
          type: e.type,
          paint: Math.floor(rng() * PAINTS),
          passed: false,
          near: false,
          minGap: 99,
          hit: false,
          bump: 0,
          yaw: 0,
        });
      }
      return pattern.id;
    }
    return null;
  }

  /* ------------------------------------------------------------ pickups */
  function placePickup(kind, x, z, lanes) {
    const slot = R.pickups.find((p) => !p.active);
    if (!slot) return false;
    Object.assign(slot, { active: true, id: R.nextId++, kind, x, z, lanes });
    return true;
  }

  function spawnCoins() {
    const freeSlots = R.pickups.filter((p) => !p.active).length - MAX_BOOST_PICKUPS;
    const cars = activeCars();
    const speeds = pickupSpeeds();
    for (let attempt = 0; attempt < 5; attempt++) {
      const kind = rng() < 0.35 && R.time > 12 ? "switch" : "line";
      const a = Math.floor(rng() * LANE_COUNT);
      const b = a === 1 ? (rng() < 0.5 ? 0 : 2) : 1;
      const n = kind === "line" ? 5 + Math.floor(rng() * 3) : 8;
      if (n > freeSlots) return;
      const spots = [];
      for (let i = 0; i < n; i++) {
        let x = LANES[a];
        if (kind === "switch") {
          const k = clamp((i - 2) / 3, 0, 1);
          const e = k * k * (3 - 2 * k);
          x = LANES[a] + (LANES[b] - LANES[a]) * e;
        }
        spots.push({ x, z: -(SPAWN_AHEAD - 20 + i * COIN.spacing) });
      }
      if (spots.some((s) => pickupBlocked(s.x, s.z, cars, speeds))) continue;
      for (const s of spots) placePickup("coin", s.x, s.z);
      return;
    }
  }

  function spawnBoostPickup() {
    const cars = activeCars();
    for (let attempt = 0; attempt < 4; attempt++) {
      const lane = Math.floor(rng() * LANE_COUNT);
      const z = -(SPAWN_AHEAD - 10);
      if (pickupBlocked(LANES[lane], z, cars, pickupSpeeds())) continue;
      const nearCoin = R.pickups.some((p) => p.active && Math.abs(p.z - z) < 6 && Math.abs(p.x - LANES[lane]) < 1.5);
      if (nearCoin) continue;
      placePickup("boost", LANES[lane], z);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ input */
  R.steer = (dir) => {
    if (R.phase !== "playing" || !dir) return false;
    const p = R.player;
    const next = clamp(p.target + (dir < 0 ? -1 : 1), 0, LANE_COUNT - 1);
    if (next === p.target) return false;
    p.target = next;
    emit("lane", { dir: dir < 0 ? -1 : 1 });
    return true;
  };

  R.activateBoost = () => {
    if (R.phase !== "playing" || R.boostTime > 0 || R.boost < 1) return false;
    R.boost = 1;
    R.boostTime = tune.boostDuration;
    R.boostsUsed++;
    emit("boost");
    return true;
  };

  /* ------------------------------------------------------------ crash */
  function crash(c) {
    if (R.phase !== "playing") return;
    if (invincible) {
      if (!c.hit) R.ghostHits++;
      c.hit = true;
      return;
    }
    R.phase = "crashed";
    R.crashTimer = 0;
    const p = R.player;
    const veh = VEHICLES[c.type];
    const dx = p.x - c.x;
    const penX = PLAYER.halfWidth + veh.halfWidth - Math.abs(dx);
    const penZ = PLAYER.halfLength + veh.halfLength - Math.abs(c.z);
    const side = penX < penZ * 0.6;
    const dirX = dx === 0 ? (rng() < 0.5 ? -1 : 1) : Math.sign(dx);
    R.crash = { kind: side ? "side" : c.z < 0 ? "rear" : "front", x: (p.x + c.x) / 2 + (side ? -dirX * PLAYER.halfWidth * 0.5 : 0), z: side ? c.z * 0.5 : -PLAYER.halfLength, carId: c.id, speed: R.speed };
    // the car we hit is shoved forward; we drop below its speed so the two separate
    c.hit = true;
    c.bump = 1;
    c.speed += side ? 2 : 5;
    R.speed = side ? Math.min(R.speed * 0.6, R.speed) : Math.min(R.speed * 0.4, c.speed * 0.7);
    p.vx = dirX * (side ? 5 : 2.5);
    p.spinRate = dirX * (side ? 2.2 : 1.2) * (rng() < 0.3 ? -1 : 1);
    p.bounceV = 2.2;
    if (R.boostTime > 0) R.boost = 0; // a boost cut short by a crash is spent
    R.boostTime = 0;
    R.combo = 0;
    R.comboTimer = 0;
    emit("crash", R.crash);
  }

  /* ------------------------------------------------------------ one fixed step */
  function step(dt) {
    R.clock += dt;
    const p = R.player;

    if (R.phase === "countdown") {
      R.countdown -= dt;
      const shown = Math.ceil(R.countdown);
      if (shown !== R.countShown && shown >= 1 && shown <= 3) {
        R.countShown = shown;
        emit("count", { n: shown });
      }
      if (R.countdown <= 0) {
        R.phase = "playing";
        R.countdown = 0;
        emit("go");
      }
    }

    const playing = R.phase === "playing";
    const crashed = R.phase === "crashed" || R.phase === "result";

    /* speed */
    if (playing) {
      R.time += dt;
      const frac = lerpTable(SPEED.ramp, R.time);
      R.cruise = SPEED.start + (tune.topSpeed - SPEED.start) * frac;
      const boosting = R.boostTime > 0;
      const target = boosting ? boostTarget(R.cruise) : R.cruise;
      if (R.speed < target) {
        const launch = R.speed < SPEED.start * 0.98 ? SPEED.start / SPEED.launch : 0;
        R.speed = Math.min(target, R.speed + Math.max(boosting ? SPEED.boostAccel : SPEED.accel, launch) * dt);
      } else {
        R.speed = Math.max(target, R.speed - 9 * dt);
      }
      if (boosting) {
        R.boostTime = Math.max(0, R.boostTime - dt);
        R.boost = R.boostTime / tune.boostDuration;
        if (R.boostTime === 0) {
          R.boost = 0;
          emit("boostEnd");
        }
      }
    } else if (crashed) {
      R.speed = Math.max(0, R.speed - 24 * dt);
    }
    if (R.speed > R.topSpeed) R.topSpeed = R.speed;
    const v = R.speed;

    /* player lateral motion: critically damped spring toward the target lane */
    if (!crashed) {
      const w = 4.74 / tune.laneTime; // 95 % settled after laneTime
      const tx = LANES[p.target];
      const a = w * w * (tx - p.x) - 2 * w * p.vx;
      p.vx += a * dt;
      p.x += p.vx * dt;
      const lo = LANES[0] - 0.15;
      const hi = LANES[LANE_COUNT - 1] + 0.15;
      if (p.x < lo) {
        p.x = lo;
        if (p.vx < 0) p.vx = 0;
      } else if (p.x > hi) {
        p.x = hi;
        if (p.vx > 0) p.vx = 0;
      }
      const speedK = clamp(v / 40, 0.35, 1.2);
      p.lean += (clamp(-p.vx * 0.032 * speedK, -0.11, 0.11) - p.lean) * Math.min(1, dt * 14);
      p.yaw += (clamp(-p.vx * 0.022, -0.16, 0.16) - p.yaw) * Math.min(1, dt * 16);
      p.steer += (clamp((tx - p.x) * 0.16, -0.38, 0.38) - p.steer) * Math.min(1, dt * 18);
    } else {
      // crash: slide, spin a little, settle
      p.vx *= Math.exp(-3.2 * dt);
      p.x = clamp(p.x + p.vx * dt, LANES[0] - 1.6, LANES[LANE_COUNT - 1] + 1.6);
      p.spinRate *= Math.exp(-2.6 * dt);
      p.spin += p.spinRate * dt;
      p.lean *= Math.exp(-4 * dt);
      p.steer *= Math.exp(-4 * dt);
    }
    p.bounceV -= 14 * dt;
    p.bounce = Math.max(0, p.bounce + p.bounceV * dt);
    if (p.bounce === 0 && p.bounceV < 0) p.bounceV = 0;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.vx)) {
      p.x = LANES[p.target];
      p.vx = 0;
    }
    p.lane = p.x < (LANES[0] + LANES[1]) / 2 ? 0 : p.x > (LANES[1] + LANES[2]) / 2 ? 2 : 1;

    /* distance + score (only while actually driving) */
    if (playing) {
      const dd = v * dt;
      R.distance += dd;
      const sk = clamp((v - SPEED.start) / Math.max(1, tune.topSpeed - SPEED.start), 0, 1.4);
      R.scoreFrac += dd * SCORE.perMetre * (1 + SCORE.speedBonus * sk);
      if (R.scoreFrac >= 1) {
        const whole = Math.floor(R.scoreFrac);
        R.score += whole;
        R.scoreFrac -= whole;
      }
      if (R.boostTime === 0 && R.boost < 1) {
        R.boost = Math.min(1, R.boost + dd * BOOST.distanceFill);
        if (R.boost >= 1) emit("boostReady");
      }
      if (R.combo > 0) {
        R.comboTimer -= dt;
        if (R.comboTimer <= 0) {
          R.combo = 0;
          emit("comboEnd");
        }
      }
    }

    /* traffic */
    const pHW = PLAYER.halfWidth;
    const pHL = PLAYER.halfLength;
    for (const c of R.traffic) {
      if (!c.active) continue;
      if (crashed) c.speed = Math.max(0, c.speed - 9 * dt);
      c.z += (v - c.speed) * dt;
      if (c.bump > 0) c.bump = Math.max(0, c.bump - dt * 1.6);
      if (c.z > DESPAWN_BEHIND || c.z < -(SPAWN_AHEAD + 140)) {
        c.active = false;
        continue;
      }
      if (!playing) continue;
      const veh = VEHICLES[c.type];
      const dx = Math.abs(p.x - c.x);
      const az = Math.abs(c.z);
      if (dx < pHW + veh.halfWidth * 0.96 && az < pHL + veh.halfLength * 0.97) {
        crash(c);
        continue;
      }
      if (az < pHL + veh.halfLength + 0.8) {
        const gap = dx - 0.95 - veh.halfWidth;
        if (gap < c.minGap) c.minGap = gap;
      }
      if (!c.passed && c.z > pHL + veh.halfLength) {
        c.passed = true;
        R.passed++;
        emit("pass", { dx: c.x - p.x, type: c.type });
        if (!c.near && !c.hit && c.minGap < NEAR.gap) {
          c.near = true;
          R.nearMisses++;
          R.combo = Math.min(NEAR.comboMax, R.combo + 1);
          R.comboTimer = NEAR.comboWindow;
          if (R.combo > R.bestCombo) R.bestCombo = R.combo;
          const pts = NEAR.score * R.combo;
          R.score += pts;
          if (R.boostTime === 0) {
            const was = R.boost;
            R.boost = Math.min(1, R.boost + NEAR.boostFill);
            if (was < 1 && R.boost >= 1) emit("boostReady");
          }
          emit("near", { points: pts, combo: R.combo, side: Math.sign(c.x - p.x) });
        }
      }
    }

    /* pickups (static on the road: they close at the player's speed) */
    for (const k of R.pickups) {
      if (!k.active) continue;
      k.z += v * dt;
      if (k.z > 6) {
        k.active = false;
        continue;
      }
      if (!playing) continue;
      const r = k.kind === "boost" ? BOOST_PICKUP.radius : COIN.radius;
      if (Math.abs(p.x - k.x) < pHW + r && Math.abs(k.z) < pHL + r) {
        k.active = false;
        if (k.kind === "coin") {
          R.coins += COIN.value;
          R.score += COIN.score;
          emit("coin", { x: k.x, z: k.z });
        } else {
          const was = R.boost;
          if (R.boostTime === 0) R.boost = Math.min(1, R.boost + BOOST_PICKUP.fill);
          else R.boostTime = Math.min(tune.boostDuration, R.boostTime + 0.6);
          emit("boostPickup", { x: k.x, z: k.z });
          if (was < 1 && R.boost >= 1) emit("boostReady");
        }
      }
    }

    /* spawning */
    if (playing) {
      R.spawnTimer -= dt;
      if (R.spawnTimer <= 0) {
        const id = trySpawn();
        R.spawnTimer = id ? lerpTable(DENSITY, R.time) * (0.8 + rng() * 0.4) : 0.3;
      }
      R.coinTimer -= dt;
      if (R.coinTimer <= 0) {
        spawnCoins();
        R.coinTimer = 2.6 + rng() * 2.4;
      }
      R.boostPickupTimer -= dt;
      if (R.boostPickupTimer <= 0) {
        const placed = R.boost < 0.7 && R.boostTime === 0 && spawnBoostPickup();
        R.boostPickupTimer = placed ? 20 + rng() * 12 : 4;
      }
    } else if (R.phase === "crashed") {
      R.crashTimer += dt;
      if (R.crashTimer >= CRASH_TIME) {
        R.phase = "result";
        emit("result");
      }
    }
  }

  /**
   * Advance by one rendered frame. `frameDt` is clamped (tab stalls, debugger
   * pauses) and consumed in fixed steps.
   */
  R.update = (frameDt) => {
    const dt = Number.isFinite(frameDt) ? Math.min(Math.max(frameDt, 0), MAX_FRAME) : 0;
    R.acc += dt;
    let n = 0;
    while (R.acc >= STEP && n < 8) {
      step(STEP);
      R.acc -= STEP;
      n++;
    }
    if (n === 8) R.acc = 0;
  };

  /** Simulate `seconds` immediately (tests / tools). */
  R.simulate = (seconds) => {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) step(STEP);
  };

  R.counts = () => ({
    traffic: R.traffic.filter((c) => c.active).length,
    pickups: R.pickups.filter((c) => c.active).length,
  });

  R.summary = () => ({
    distance: R.distance,
    score: R.score,
    coins: R.coins,
    nearMisses: R.nearMisses,
    bestCombo: R.bestCombo,
    passed: R.passed,
    boostsUsed: R.boostsUsed,
    topSpeedKmh: Math.round(R.topSpeed * 3.6),
    time: R.time,
  });

  // traffic is prepared during the countdown: two groups already out ahead
  trySpawn(95);
  trySpawn(150);
  return R;
}
