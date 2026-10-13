/**
 * Swimming Champions — race simulation (no Three.js, no DOM).
 *
 * The pool runs along +z from the start wall (pos 0) to the far wall
 * (pos 50). Every swimmer keeps `pos` (0..50), `dir` (+1 / -1) and the number
 * of completed `lengths`; total distance is derived from those, so a swimmer
 * physically reverses at each wall and can never jump ahead.
 *
 * The player is driven by `stroke(side)`, `setBoost(on)` and `action()`.
 * Strokes must alternate (A / D) close to the ideal tempo; the smoothed
 * rhythm meter scales each stroke's impulse, so mashing or repeating one arm
 * is slower than a steady beat. AI swimmers chase a target speed shaped by
 * their skill, stamina and race fraction, and turn with their own efficiency.
 *
 * Everything is deterministic for a given seed + input sequence, which the
 * headless tests in tools/simTest.mjs rely on.
 */

export const POOL = 50;
export const LANES = 6;
export const LANE_W = 2.5;
export const PLAYER_LANE = 2;
export const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_W;

export const DISTANCES = {
  50: { label: "50m Sprint", short: "50m", lengths: 1 },
  100: { label: "100m Freestyle", short: "100m", lengths: 2 },
  200: { label: "200m Freestyle", short: "200m", lengths: 4 },
};

/** AI speed bands (m/s) in lane order, the player's lane is skipped. */
export const DIFFICULTY = {
  easy: { label: "Easy", speeds: [3.05, 2.85, 3.3, 2.95, 3.15], turn: [0.45, 0.65] },
  medium: { label: "Medium", speeds: [3.8, 3.5, 4.12, 3.65, 3.97], turn: [0.6, 0.85] },
  hard: { label: "Hard", speeds: [4.02, 3.9, 4.3, 4.1, 4.2], turn: [0.8, 1] },
};

export const RIVALS = [
  { name: "Kenji", cap: 0xff5a5a, suit: 0x1b2a6b, skin: 0xf1c7a1 },
  { name: "Marco", cap: 0xffd23f, suit: 0x111827, skin: 0xd9a27a },
  { name: "YOU", cap: 0x22e3ff, suit: 0x0b3d91, skin: 0xf3cba5 },
  { name: "Liam", cap: 0xff8a2a, suit: 0x3a1d5c, skin: 0x8d5a3b },
  { name: "Andre", cap: 0x9b6bff, suit: 0x0f3b2e, skin: 0xc68a5e },
  { name: "Sven", cap: 0x3ddc84, suit: 0x5b1020, skin: 0xf6d2b8 },
];

// --- tuning ---------------------------------------------------------------
export const TUNE = {
  idealGap: 0.4, // seconds between alternating strokes
  impulse: 0.74,
  dragQ: 0.11,
  dragL: 0.1,
  kick: 0.35, // baseline flutter-kick thrust
  boostThrust: 1.45,
  boostDrain: 0.3,
  strokeCost: 0.012,
  regen: 0.075,
  turnZone: 3.6, // turn can be armed within this distance of the wall
  flipAt: 1.2, // armed turns start the flip here
  flipTime: 0.45,
  glideTime: 0.4,
  openTurnTime: 1.25,
  autoDive: 1.0,
  introTime: 4.6,
  countTime: 3,
};

const INTRO = TUNE.introTime;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeSwimmer(lane, isPlayer) {
  return {
    lane,
    isPlayer,
    ...RIVALS[lane],
    phase: "block", // block | dive | swim | turn | finish
    pos: 0,
    dir: 1,
    lengths: 0,
    v: 0,
    stamina: 1,
    rhythm: 0.6,
    pulse: 0,
    lastStroke: -9,
    lastSide: 0,
    boosting: false,
    exhausted: false,
    armed: false,
    turnQ: 0,
    turnT: 0,
    turnKind: "",
    turnDist: 0,
    diveT: 0,
    reaction: 0,
    finishTime: 0,
    place: 0,
    // animation scalars read by the renderer
    stroke: 0, // arm cycle, 1.0 = both arms once
    strokeTarget: 0,
    kick: 0,
    underwater: 0,
    crouch: 0,
  };
}

export const totalOf = (s) => s.lengths * POOL + (s.dir > 0 ? s.pos : POOL - s.pos);
export const wallDist = (s) => (s.dir > 0 ? POOL - s.pos : s.pos);

export class Race {
  constructor({ distance = 50, difficulty = "medium", seed = 1, onEvent = null } = {}) {
    this.distance = DISTANCES[distance] ? distance : 50;
    this.lengths = DISTANCES[this.distance].lengths;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : "medium";
    this.rand = mulberry32(seed);
    this.onEvent = onEvent;
    this.phase = "intro"; // intro | countdown | race | done
    this.phaseT = 0;
    this.time = 0; // race clock (since GO)
    this.finishedCount = 0;
    this.swimmers = [];
    const diff = DIFFICULTY[this.difficulty];
    const distScale = this.distance === 200 ? 0.967 : this.distance === 100 ? 0.985 : 1;
    let ai = 0;
    for (let lane = 0; lane < LANES; lane++) {
      const s = makeSwimmer(lane, lane === PLAYER_LANE);
      if (!s.isPlayer) {
        const r = this.rand;
        s.base = diff.speeds[ai++] * distScale * (0.985 + r() * 0.03);
        s.endurance = 0.3 + r() * 0.7;
        s.turnEff = diff.turn[0] + r() * (diff.turn[1] - diff.turn[0]);
        s.reaction = 0.13 + r() * 0.17;
        s.wob = [r() * 6.28, r() * 6.28, 0.6 + r() * 0.5, 1.3 + r() * 0.7];
        s.fatigue = 0;
      }
      this.swimmers.push(s);
    }
    this.player = this.swimmers[PLAYER_LANE];
    this.boostHeld = false;
  }

  emit(type, data) {
    this.onEvent?.(type, data);
  }

  /** Skip the camera fly-over and go straight to the countdown. */
  skipIntro() {
    if (this.phase === "intro") this.phaseT = INTRO;
  }

  // ------------------------------------------------------------ player input
  stroke(side) {
    const p = this.player;
    if (this.phase === "countdown") return this.emit("early");
    if (this.phase !== "race") return;
    if (p.phase === "block") return this.dive(p);
    if (p.phase !== "swim" && !(p.phase === "turn" && p.turnT > TUNE.flipTime)) {
      // mid-dive / mid-somersault: no pull, but keep the alternation honest
      if (p.phase !== "finish") p.lastSide = side;
      return;
    }
    const gap = this.time - p.lastStroke;
    const alternate = side !== p.lastSide;
    let q;
    let grade;
    if (!alternate) {
      q = 0.1;
      grade = "same";
    } else if (gap <= TUNE.idealGap) {
      q = clamp(1 - (TUNE.idealGap - gap) / 0.3, 0, 1);
      grade = q > 0.82 ? "perfect" : q > 0.5 ? "good" : "fast";
    } else {
      q = clamp(1 - (gap - 0.48) / 0.9, 0.25, 1);
      grade = q > 0.82 ? "perfect" : q > 0.55 ? "good" : "slow";
    }
    p.rhythm += (q - p.rhythm) * 0.45;
    const stam = p.stamina < 0.2 ? 0.55 + 2.25 * p.stamina : 1;
    p.pulse += TUNE.impulse * (0.15 + 0.85 * Math.pow(p.rhythm, 1.5)) * stam;
    p.stamina = Math.max(0, p.stamina - TUNE.strokeCost - (gap < 0.22 ? 0.02 : 0));
    p.lastStroke = this.time;
    p.lastSide = side;
    p.strokeTarget = Math.floor(p.strokeTarget * 2 + 1e-6) / 2 + 0.5;
    this.emit("stroke", { side, grade, q, rhythm: p.rhythm });
  }

  setBoost(on) {
    this.boostHeld = !!on;
  }

  /** SPACE / contextual button: dive off the block, or arm a wall turn. */
  action() {
    const p = this.player;
    if (this.phase === "countdown") return this.emit("early");
    if (this.phase !== "race") return;
    if (p.phase === "block") return this.dive(p);
    if (p.phase === "swim" && this.canTurn(p) && !p.armed) {
      const d = wallDist(p);
      if (d > TUNE.turnZone) return;
      p.armed = true;
      // ideal press between 1.2 m and 2.4 m from the wall
      p.turnQ = d > 2.4 ? clamp(1 - (d - 2.4) / 1.2, 0, 1) : d >= TUNE.flipAt ? 1 : clamp(d / TUNE.flipAt, 0.2, 1);
      if (d < TUNE.flipAt) this.startFlip(p);
    }
  }

  canTurn(s) {
    return s.lengths < this.lengths - 1;
  }

  /** What the contextual button does right now (for HUD / mobile). */
  context() {
    const p = this.player;
    if (this.phase !== "race") return "wait";
    if (p.phase === "block") return "dive";
    if (p.phase === "swim" && this.canTurn(p) && !p.armed && wallDist(p) <= TUNE.turnZone) return "turn";
    if (p.phase === "finish") return "done";
    return "boost";
  }

  // ------------------------------------------------------------ mechanics
  dive(s) {
    s.phase = "dive";
    s.diveT = 0;
    s.reaction = this.time;
    const q = clamp(1 - (s.reaction - 0.12) / 0.9, 0.3, 1);
    s.diveSpeed = 3.3 + 1.5 * q;
    if (s.isPlayer) this.emit("dive", { reaction: s.reaction, q });
  }

  startFlip(s) {
    s.phase = "turn";
    s.turnKind = "flip";
    s.turnT = 0;
    s.turnDist = wallDist(s);
    s.flipped = false;
    s.armed = false;
    if (s.isPlayer) this.emit("flip", { q: s.turnQ });
  }

  touchWall(s, overshoot) {
    if (!this.canTurn(s)) {
      s.pos = s.dir > 0 ? POOL : 0;
      s.phase = "finish";
      s.finishTime = this.time - (s.v > 0.1 ? overshoot / s.v : 0);
      s.v = 0;
      s.pulse = 0;
      this.touched.push(s); // places are given after the frame, by exact time
      return;
    }
    // reached the wall without a flip: slow open turn
    s.pos = s.dir > 0 ? POOL : 0;
    s.phase = "turn";
    s.turnKind = "open";
    s.turnT = 0;
    s.turnQ = 0;
    s.armed = false;
    s.v = 0;
    s.pulse = 0;
    if (s.isPlayer) this.emit("missedTurn");
  }

  reverse(s) {
    s.lengths += 1;
    s.dir = -s.dir;
    s.pos = s.dir > 0 ? 0 : POOL;
    this.emit("turn", { lane: s.lane, player: s.isPlayer, q: s.turnQ, kind: s.turnKind, length: s.lengths + 1 });
  }

  aiTarget(s) {
    const f = totalOf(s) / this.distance;
    let k = 1;
    if (f < 0.12) k = 1.02;
    else if (f > 0.78) k = 1 + 0.045 * s.endurance - 0.06 * s.fatigue;
    else k = 0.985 - 0.02 * s.fatigue;
    const t = this.time;
    const wob = 1 + 0.018 * Math.sin(t * s.wob[2] + s.wob[0]) + 0.012 * Math.sin(t * s.wob[3] + s.wob[1]);
    return s.base * k * wob;
  }

  stepSwimmer(s, dt) {
    if (s.phase === "block") {
      s.crouch = Math.min(1, s.crouch + dt * 3);
      if (!s.isPlayer && this.time >= s.reaction) this.dive(s);
      else if (s.isPlayer && this.time >= TUNE.autoDive) this.dive(s);
      return;
    }
    if (s.phase === "finish") {
      s.v = 0;
      s.kick += dt * 3;
      return;
    }
    s.kick += dt * (s.phase === "turn" ? 6 : 13);

    if (s.phase === "dive") {
      s.diveT += dt;
      if (s.diveT < 0.55) {
        s.pos = (s.diveT / 0.55) * 3.3;
        s.v = 3.3 / 0.55;
        return;
      }
      s.phase = "swim";
      s.pos = 3.3;
      s.v = s.diveSpeed;
      s.underwater = 1;
      if (s.isPlayer) this.emit("entry", { lane: s.lane });
      else this.emit("splash", { lane: s.lane });
    }

    if (s.phase === "turn") {
      s.turnT += dt;
      if (s.turnKind === "flip") {
        if (s.turnT < TUNE.flipTime) {
          const step = (s.turnDist / TUNE.flipTime) * dt;
          s.pos = clamp(s.pos + s.dir * step, 0, POOL);
          return;
        }
        if (!s.flipped) {
          s.flipped = true;
          this.reverse(s);
          s.v = 2.4 + 2.5 * s.turnQ;
          s.underwater = 1;
        }
        if (s.turnT >= TUNE.flipTime + TUNE.glideTime) s.phase = "swim";
      } else {
        if (s.turnT < TUNE.openTurnTime) return;
        this.reverse(s);
        s.v = 2.1;
        s.underwater = 0.6;
        s.phase = "swim";
      }
    }

    s.underwater = Math.max(0, s.underwater - dt * 1.4);
    const drag = TUNE.dragQ * s.v * s.v + TUNE.dragL * s.v;
    let acc = TUNE.kick - drag;

    if (s.isPlayer) {
      const take = s.pulse * (1 - Math.exp(-9 * dt));
      s.pulse -= take;
      s.v += take;
      if (s.exhausted && s.stamina > 0.25) s.exhausted = false;
      s.boosting = this.boostHeld && !s.exhausted && s.phase === "swim" && this.context() === "boost";
      if (s.boosting) {
        acc += TUNE.boostThrust;
        s.stamina = Math.max(0, s.stamina - TUNE.boostDrain * dt);
        if (s.stamina === 0) s.exhausted = true;
      } else s.stamina = Math.min(1, s.stamina + TUNE.regen * dt);
      // rhythm fades if you stop stroking
      if (this.time - s.lastStroke > 0.9) s.rhythm = Math.max(0, s.rhythm - dt * 0.5);
      s.stroke += (s.strokeTarget - s.stroke) * (1 - Math.exp(-10 * dt));
      s.v = Math.max(0, s.v + acc * dt);
    } else {
      const target = this.aiTarget(s);
      if (target > s.base * 0.99) s.fatigue = Math.min(1, s.fatigue + dt * 0.02 * (1.4 - s.endurance));
      s.stamina = clamp(1 - s.fatigue, 0, 1);
      const rate = s.v < target ? 1.3 : 0.9;
      s.v += (target - s.v) * (1 - Math.exp(-rate * dt));
      if (s.phase === "swim") s.stroke += dt * s.v * 0.31;
    }

    if (s.phase === "turn") {
      s.pos = clamp(s.pos + s.dir * s.v * dt, 0, POOL);
      return;
    }
    s.pos += s.dir * s.v * dt;

    const d = wallDist(s);
    if (!s.isPlayer && this.canTurn(s) && d <= TUNE.flipAt + 0.1) {
      s.turnQ = clamp(s.turnEff * (0.9 + this.rand() * 0.1), 0, 1);
      this.startFlip(s);
      return;
    }
    if (s.armed && d <= TUNE.flipAt) {
      this.startFlip(s);
      return;
    }
    if (d <= 0) this.touchWall(s, -d);
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.phaseT += dt;
    if (this.phase === "intro") {
      if (this.phaseT >= INTRO) {
        this.phase = "countdown";
        this.phaseT = 0;
        this.lastBeep = 0;
        this.emit("count", { n: 3 });
      }
      return;
    }
    if (this.phase === "countdown") {
      for (const s of this.swimmers) s.crouch = Math.min(1, s.crouch + dt * 2);
      const n = Math.floor(this.phaseT);
      if (n > this.lastBeep && n < TUNE.countTime) {
        this.lastBeep = n;
        this.emit("count", { n: TUNE.countTime - n });
      }
      if (this.phaseT >= TUNE.countTime) {
        this.phase = "race";
        this.phaseT = 0;
        this.time = 0;
        this.emit("go");
      }
      return;
    }
    if (this.phase === "race" || this.phase === "done") {
      if (this.phase === "race") this.time += dt;
      this.touched = [];
      for (const s of this.swimmers) this.stepSwimmer(s, dt);
      if (this.touched.length) {
        this.touched.sort((a, b) => a.finishTime - b.finishTime);
        for (const s of this.touched) {
          s.place = ++this.finishedCount;
          this.emit("finish", { lane: s.lane, place: s.place, time: s.finishTime, player: s.isPlayer });
        }
        if (this.finishedCount === LANES) {
          this.phase = "done";
          this.emit("done", { standings: this.standings() });
        }
      }
    }
  }

  standings() {
    return [...this.swimmers].sort((a, b) => {
      if (a.place && b.place) return a.place - b.place;
      if (a.place) return -1;
      if (b.place) return 1;
      return totalOf(b) - totalOf(a);
    });
  }

  positionOf(s) {
    return this.standings().indexOf(s) + 1;
  }
}
