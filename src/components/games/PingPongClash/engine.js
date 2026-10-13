/**
 * Ping Pong Clash — match logic (no DOM, so it also runs headless).
 *
 * World units are metres, seen from above: the table is centred on the
 * origin, its length along x. Side 0 (the player) defends x < 0, side 1 (the
 * AI) defends x > 0. The ball also has a height `z` above the table surface
 * so it can arc over the net and bounce; the floor sits at z = -TABLE.H.
 *
 * Rules (arcade-simplified table tennis): after a hit the ball must clear the
 * net and bounce once on the opponent's half. Landing on your own half,
 * hitting the net or missing the table is a fault; letting a good ball get
 * past you (or bounce twice) loses the point. First to 11, win by 2, serve
 * alternates every 2 points and every point from 10-10.
 */

export const TABLE = { L: 2.74, W: 1.525, NET: 0.1525, H: 0.76 };
export const BOUNDS = { x: 2.3, y: 1.3 };
export const PADDLE_R = 0.14;
export const BALL_R = 0.03;

const HL = TABLE.L / 2;
const HW = TABLE.W / 2;
const G = 7; // softened gravity: floatier, more readable arcs
const STEP = 1 / 240; // physics sub-step — no tunnelling through paddles
const BASE_PACE = 2.9; // horizontal ball speed (m/s) at the start of a rally
const POINT_PAUSE = 1.25;
const AI_SERVE_DELAY = 1.0;
const WATCHDOG = 5; // a live ball with no hit for this long ends the point

export const DIFFICULTY = {
  easy: { label: "Easy", speed: 1.3, reaction: 0.36, err: 0.2, aim: 0.42, mistake: 0.12, pace: 0.9 },
  medium: { label: "Medium", speed: 1.9, reaction: 0.22, err: 0.12, aim: 0.62, mistake: 0.06, pace: 1.0 },
  hard: { label: "Hard", speed: 2.7, reaction: 0.12, err: 0.06, aim: 0.82, mistake: 0.03, pace: 1.12 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const towardOpponent = (side) => (side === 0 ? 1 : -1);
const onTable = (x, y) => Math.abs(x) <= HL && Math.abs(y) <= HW;

/** Which side serves, given the score and who served first. */
export function serverFor(score, first) {
  const p = score[0] + score[1];
  const swap = p < 20 ? Math.floor(p / 2) % 2 : p % 2;
  return swap ? 1 - first : first;
}

/** Winning side, or -1 while the match is still on. */
export function winnerOf(score) {
  for (const s of [0, 1]) if (score[s] >= 11 && score[s] - score[1 - s] >= 2) return s;
  return -1;
}

/** Advance a ball one step. Returns "net" | "table" | "floor" | "out" | null. */
function stepBall(b, dt) {
  const px = b.x;
  const pz = b.z;
  b.vy += b.spin * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.vz -= G * dt;
  b.z += b.vz * dt;
  if (!b.netDone && Math.sign(px) !== Math.sign(b.x)) {
    b.netDone = true;
    if (b.z < TABLE.NET && Math.abs(b.y) < HW + 0.15) return "net";
  }
  if (pz > 0 && b.z <= 0 && onTable(b.x, b.y)) return "table";
  if (b.z <= -TABLE.H) return "floor";
  if (Math.abs(b.x) > BOUNDS.x + 0.3 || Math.abs(b.y) > BOUNDS.y + 0.3) return "out";
  return null;
}

export class Match {
  /**
   * @param {object} o
   * @param {"easy"|"medium"|"hard"} o.difficulty AI level (side 1)
   * @param {boolean} o.demo both sides AI-controlled, endless (menu backdrop)
   * @param {(type:string, data?:object)=>void} o.onEvent
   * @param {() => number} o.random injectable RNG (tests)
   */
  constructor({ difficulty = "medium", demo = false, onEvent = () => {}, random = Math.random } = {}) {
    this.onEvent = onEvent;
    this.random = random;
    this.paddles = [0, 1].map((s) => ({ x: -towardOpponent(s) * (HL + 0.3), y: 0, vx: 0, vy: 0 }));
    this.pointer = { x: -(HL + 0.3), y: 0 };
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, hitter: 0, bounced: false, netDone: true };
    this.fx = [];
    this.time = 0;
    this.newMatch(difficulty, demo);
  }

  newMatch(difficulty = this.difficulty, demo = this.demo) {
    this.difficulty = difficulty;
    this.demo = demo;
    this.ai = [demo ? DIFFICULTY.hard : null, DIFFICULTY[difficulty] || DIFFICULTY.medium];
    this.score = [0, 0];
    this.first = demo ? (this.random() < 0.5 ? 0 : 1) : 0;
    this.winner = -1;
    this.lastPoint = null;
    this.fx.length = 0;
    this.setupServe();
  }

  get server() {
    return serverFor(this.score, this.first);
  }

  isAI(side) {
    return Boolean(this.ai[side]);
  }

  setupServe() {
    this.phase = "serve";
    this.timer = 0;
    this.rally = 0;
    this.plan = [null, null];
    this.aiServeY = (this.random() * 2 - 1) * 0.35;
    this.holdBall();
    this.onEvent("serve", { server: this.server, score: [...this.score] });
  }

  /** Player input in world coordinates (the paddle eases toward it). */
  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** Space / click. Only the human server can launch the ball. */
  serve() {
    if (this.phase !== "serve" || this.isAI(this.server)) return false;
    this.launchServe();
    return true;
  }

  launchServe() {
    this.phase = "live";
    this.shoot(this.server, true);
  }

  holdBall() {
    const s = this.server;
    const p = this.paddles[s];
    const b = this.ball;
    b.x = p.x + towardOpponent(s) * (PADDLE_R + 0.05);
    b.y = p.y;
    b.z = 0.14 + Math.abs(Math.sin(this.time * 4)) * 0.12;
    b.vx = b.vy = b.vz = b.spin = 0;
  }

  /** Send the ball from `side` toward the other half. */
  shoot(side, isServe = false) {
    const b = this.ball;
    const p = this.paddles[side];
    const dir = towardOpponent(side);
    const ai = this.ai[side];
    let tx;
    let ty;
    let pace;
    let spin;
    let netMistake = false;

    if (!ai) {
      // Where the ball meets the paddle steers it; paddle motion adds pace and spin.
      const offset = clamp((b.y - p.y) / PADDLE_R, -1, 1);
      const push = clamp(dir * p.vx, -1, 3);
      ty = offset * 0.7 * HW + b.y * 0.2 + clamp(p.vy, -4, 4) * 0.035;
      tx = dir * HL * clamp(0.62 + push * 0.05, 0.45, 0.85);
      pace = 1 + Math.max(0, push) * 0.12;
      spin = clamp(p.vy, -5, 5) * 0.09;
    } else {
      const r = this.random;
      const opp = this.paddles[1 - side];
      // aim away from where the opponent is standing
      const away = opp.y > 0 ? -1 : 1;
      ty = (away * r() * 0.8 + (r() - 0.5) * 0.6) * ai.aim * HW;
      tx = dir * HL * (0.45 + r() * 0.4);
      pace = ai.pace * (0.95 + r() * 0.1);
      spin = (r() - 0.5) * 0.6 * ai.aim;
      if (!isServe && r() < ai.mistake) {
        const kind = r();
        if (kind < 0.4) ty = Math.sign(ty || 1) * HW * (1.12 + r() * 0.2);
        else if (kind < 0.7) tx = dir * (HL + 0.12 + r() * 0.25);
        else netMistake = true;
      }
    }

    const speed = BASE_PACE * pace * (1 + Math.min(this.rally, 14) * 0.03);
    const dx = Math.abs(tx - b.x);
    let t = Math.max(dx / speed, 0.35);
    // Lengthen the flight until the arc clears the net comfortably.
    const tn = () => Math.abs(b.x) / (dx / t);
    const zAt = (tt, vz) => b.z + vz * tt - 0.5 * G * tt * tt;
    let vz = (0.5 * G * t * t - b.z) / t;
    if (Math.sign(b.x) !== Math.sign(tx)) {
      for (let i = 0; i < 20 && zAt(tn(), vz) < TABLE.NET + 0.06; i++) {
        t *= 1.08;
        vz = (0.5 * G * t * t - b.z) / t;
      }
    }
    if (netMistake) vz *= 0.5;
    if (ai) ty -= 0.5 * spin * t * t; // the AI accounts for its own spin

    b.vx = (dir * dx) / t;
    b.vy = (ty - b.y) / t;
    b.vz = vz;
    b.spin = spin;
    b.hitter = side;
    b.bounced = false;
    b.netDone = Math.sign(b.x) === Math.sign(tx) && b.x !== 0;
    this.lastHit = this.time;
    this.rally++;
    this.plan[1 - side] = null;
    this.fx.push({ kind: "ring", x: b.x, y: b.y, t: 0, life: 0.35, color: side === 0 ? "#ff6b6b" : "#6bc4ff" });
    this.onEvent("hit", { side, serve: isServe, power: clamp(speed / 4.5, 0, 1) });
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.movePaddles(dt);

    if (this.phase === "serve") {
      this.holdBall();
      if (this.isAI(this.server)) {
        this.timer += dt;
        if (this.timer >= AI_SERVE_DELAY) this.launchServe();
      }
    } else if (this.phase === "live") {
      for (let left = dt; left > 1e-9 && this.phase === "live"; left -= STEP) this.physics(Math.min(STEP, left));
      if (this.phase === "live" && this.time - this.lastHit > WATCHDOG) {
        this.award(this.ball.bounced ? this.ball.hitter : 1 - this.ball.hitter, "TIME");
      }
    } else if (this.phase === "point") {
      this.timer += dt;
      // the dead ball rolls on and settles
      const b = this.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - dt * 2.5;
      b.vy *= 1 - dt * 2.5;
      if (this.timer >= POINT_PAUSE) {
        if (this.winner >= 0) {
          if (this.demo) this.newMatch();
          else {
            this.phase = "over";
            this.onEvent("over", { winner: this.winner, score: [...this.score] });
          }
        } else this.setupServe();
      }
    }

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.vx !== undefined) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 1 - dt * 3;
        f.vy *= 1 - dt * 3;
      }
      if (f.t >= f.life) this.fx.splice(i, 1);
    }
  }

  physics(dt) {
    const b = this.ball;
    const ev = stepBall(b, dt);
    const hitter = b.hitter;
    const receiver = 1 - hitter;
    if (ev === "net") return this.award(receiver, "NET");
    if (ev === "table") {
      const half = b.x < 0 ? 0 : 1;
      if (half === hitter) return this.award(receiver, "FAULT");
      if (b.bounced) return this.award(hitter, "DOUBLE BOUNCE");
      b.bounced = true;
      b.z = 0;
      b.vz = -b.vz * 0.82;
      b.spin *= 0.5;
      this.onEvent("bounce", { side: half });
      return;
    }
    if (ev === "floor" || ev === "out") return this.award(b.bounced ? hitter : receiver, b.bounced ? "MISSED" : "OUT");

    // Only a ball that has bounced on your half can be returned; an "out"
    // ball sails past the paddle so the fault stays the hitter's.
    if (b.bounced) {
      const p = this.paddles[receiver];
      const movingIn = Math.sign(b.vx) === -towardOpponent(receiver);
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (movingIn && dx * dx + dy * dy < (PADDLE_R + BALL_R) ** 2) this.shoot(receiver);
    }
  }

  award(side, reason) {
    const b = this.ball;
    this.score[side]++;
    this.phase = "point";
    this.timer = 0;
    this.winner = winnerOf(this.score);
    this.lastPoint = { side, reason };
    b.vz = 0;
    const color = side === 0 ? "#ffd166" : "#6bc4ff";
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + this.random() * 0.3;
      const v = 0.6 + this.random() * 1.2;
      this.fx.push({ kind: "spark", x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.7 + this.random() * 0.3, color });
    }
    this.fx.push({ kind: "ring", x: b.x, y: b.y, t: 0, life: 0.6, color, big: true });
    this.onEvent("point", { side, reason, score: [...this.score], winner: this.winner });
  }

  /* ------------------------------------------------------------ paddles */

  movePaddles(dt) {
    for (const side of [0, 1]) {
      const p = this.paddles[side];
      const ox = p.x;
      const oy = p.y;
      if (this.ai[side]) this.moveAI(side, dt);
      else {
        // ease toward the pointer, kept behind the player's end line
        const k = 1 - Math.exp(-dt * 28);
        const tx = clamp(this.pointer.x, -BOUNDS.x + 0.1, -HL + 0.08);
        const ty = clamp(this.pointer.y, -BOUNDS.y + 0.1, BOUNDS.y - 0.1);
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
      }
      if (dt > 0) {
        const s = 1 - Math.exp(-dt * 20);
        p.vx += ((p.x - ox) / dt - p.vx) * s;
        p.vy += ((p.y - oy) / dt - p.vy) * s;
      }
    }
  }

  moveAI(side, dt) {
    const ai = this.ai[side];
    const p = this.paddles[side];
    const back = -towardOpponent(side); // toward this side's end
    let tx = back * (HL + 0.3);
    let ty = 0;
    const b = this.ball;

    if (this.phase === "serve" && this.server === side) {
      ty = this.aiServeY;
    } else if (this.phase === "live" && b.hitter !== side) {
      if (this.time - this.lastHit >= ai.reaction) {
        if (!this.plan[side]) this.plan[side] = this.predict(side, ai);
        tx = this.plan[side].x;
        ty = this.plan[side].y;
      } else ty = p.y;
    } else if (this.phase === "live") {
      ty = b.y * 0.35; // recover toward the middle, shading the ball's side
    } else ty = p.y;

    const max = ai.speed * dt;
    p.x += clamp(tx - p.x, -max, max);
    p.y += clamp(ty - p.y, -max, max);
  }

  /** Where the incoming ball will be when it reaches this side's hitting zone. */
  predict(side, ai) {
    const back = -towardOpponent(side);
    const plane = back * (HL + 0.25);
    const g = { ...this.ball };
    let target = { x: back * (HL + 0.3), y: g.y * 0.5 };
    for (let i = 0; i < 4 / STEP; i++) {
      const ev = stepBall(g, STEP);
      if (ev === "table") {
        if (g.bounced) break;
        g.bounced = true;
        g.z = 0;
        g.vz = -g.vz * 0.82;
        g.spin *= 0.5;
      } else if (ev) break;
      if (g.bounced && back * g.x >= back * plane) {
        target = { x: plane, y: g.y };
        break;
      }
    }
    target.y += (this.random() * 2 - 1) * ai.err;
    return target;
  }
}
