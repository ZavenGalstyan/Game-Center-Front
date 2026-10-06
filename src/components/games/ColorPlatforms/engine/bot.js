/**
 * Color Platforms — route bot. Plays a level through the real Sim, which is
 * how every level is proven finishable (and every star collectable) in
 * tools/simTest.mjs and in the DEV browser harness.
 *
 * Route = the level's platforms in listed order (minus `skip` decoys), then
 * the finish. Stars with `at: i` must be collected on the way to platform i.
 *
 * Each step without a plan the bot tries a few simple policies on a CLONE of
 * the sim (jump now full / jump now short / just walk-or-drift), steering
 * toward the next star or the target platform and switching to the target's
 * color right after takeoff. The first policy that reaches the node is then
 * executed for real — the sim is deterministic, so it plays out identically.
 * If nothing works yet (moving platform out of reach) it walks toward the
 * target and waits at the edge.
 */
import { PHYS, NEUTRAL } from "./constants.js";

export function buildRoute(level) {
  const nodes = [];
  level.platforms.forEach((p, i) => {
    if (p.skip) return;
    nodes.push({ plat: i, stars: level.stars.map((s, k) => (s.at === i ? k : -1)).filter((k) => k >= 0) });
  });
  nodes.push({ finish: true, stars: [] });
  // color to hold in the air: the node's own color, or (for Neutral / bounce
  // nodes) the next colored platform's — so decoys on the way down are passed
  let next = null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const c = n.finish ? null : level.platforms[n.plat].color;
    if (c && c !== NEUTRAL) next = c;
    n.color = c && c !== NEUTRAL ? c : next;
  }
  return nodes;
}

const POLICIES = [
  { jump: true, hold: true },
  { jump: true, hold: false },
  { jump: false, hold: false },
];
const HORIZON = Math.round(3.2 / PHYS.DT);

export class Bot {
  constructor(sim) {
    this.sim = sim;
    this.route = buildRoute(sim.level);
    this.idx = 0;
    this.plan = null; // { pol, step }
    this.input = { left: false, right: false, jump: false };
    this.deaths = 0;
    this.lastStatus = sim.status;
  }

  node() {
    return this.route[Math.min(this.idx, this.route.length - 1)];
  }

  /** Steering target x for a node on sim `s`. */
  targetX(s, node) {
    for (const k of node.stars) if (!s.starsGot[k]) return s.level.stars[k].x;
    if (node.finish) return s.level.finish.x;
    const pl = s.plats[node.plat];
    return pl.x + pl.def.w / 2;
  }

  reached(s, node, bounceSeq0) {
    for (const k of node.stars) if (!s.starsGot[k]) return false;
    if (node.finish) return s.finished;
    const pl = s.plats[node.plat];
    if (pl.def.type === "bounce") return s.bounceSeq > bounceSeq0 && s.lastBounce === node.plat;
    return s.p.grounded && s.p.ground === node.plat;
  }

  /** Input for one step of policy `pol` on sim `s` (also applies color / jump). */
  drive(s, node, pol, step, inp) {
    const p = s.p;
    if (step === 0 && pol.jump && s.status === "play") s.pressJump();
    const tx = this.targetX(s, node);
    const d = tx - p.x;
    if (pol.dir) {
      // committed hop: keep going until landing (carries past hazards)
      inp.left = pol.dir < 0 && !p.grounded;
      inp.right = pol.dir > 0 && !p.grounded;
      if (step === 0) {
        inp.left = pol.dir < 0;
        inp.right = pol.dir > 0;
      }
    } else {
      inp.left = !pol.stay && d < -4;
      inp.right = !pol.stay && d > 4;
    }
    inp.jump = pol.jump && (pol.hold ? p.vy < 0 || step < 2 : step < 1);
    if (!p.grounded && node.color && p.color !== node.color) s.setColor(node.color);
    return inp;
  }

  /** Simulate a policy on a clone; returns true if it reaches the node. */
  tryPolicy(node, pol, relaxed = false) {
    const c = this.sim.clone();
    const b0 = c.bounceSeq;
    if (relaxed && (node.finish || !node.stars.length || (c.p.grounded && c.p.ground === node.plat))) return false;
    const target = relaxed ? { plat: node.plat, stars: [], color: node.color } : node;
    const inp = { left: false, right: false, jump: false };
    for (let i = 0; i < HORIZON; i++) {
      this.drive(c, target, pol, i, inp);
      c.step(inp);
      if (c.status === "respawn") return false;
      if (this.reached(c, target, b0)) return true;
      if (i > 2 && c.p.grounded && !pol.jump && c.p.ground !== this.sim.p.ground) return false;
      if (i > 2 && c.p.grounded && pol.jump) return false;
    }
    return false;
  }

  approachInput(s, node, inp) {
    const tx = this.targetX(s, node);
    let want = tx;
    if (s.p.grounded) {
      const g = s.plats[s.p.ground];
      want = Math.max(g.x + PHYS.FOOT + 3, Math.min(g.x + g.def.w - PHYS.FOOT - 3, tx));
    }
    const d = want - s.p.x;
    inp.left = d < -3;
    inp.right = d > 3;
    inp.jump = false;
  }

  /** Would plain approaching die within ~0.5 s (spikes ahead, a saw coming)? */
  approachDies(node, steps = 30, still = false) {
    const c = this.sim.clone();
    const inp = { left: false, right: false, jump: false };
    for (let i = 0; i < steps; i++) {
      if (still) inp.left = inp.right = inp.jump = false;
      else this.approachInput(c, node, inp);
      c.step(inp);
      if (c.status === "respawn") return true;
    }
    return false;
  }

  /** A hop that lands safely (any platform) and does not lose ground. */
  tryHop(node, pol) {
    const c = this.sim.clone();
    const x0 = c.p.x;
    const tx = this.targetX(c, node);
    const inp = { left: false, right: false, jump: false };
    for (let i = 0; i < HORIZON; i++) {
      if (pol.stay) {
        if (i === 0) c.pressJump();
        inp.left = inp.right = false;
        inp.jump = c.p.vy < 0 || i < 2;
      } else this.drive(c, node, pol, i, inp);
      c.step(inp);
      if (c.status === "respawn") return false;
      if (i > 3 && c.p.grounded) {
        if (this.approachDiesFrom(c, node)) return false;
        const ok = pol.stay || c.starCount() > this.sim.starCount() || Math.abs(tx - c.p.x) <= Math.abs(tx - x0) + 1;
        return ok ? { stars: c.starCount() } : false;
      }
    }
    return false;
  }

  approachDiesFrom(sim, node) {
    const c = sim.clone();
    const inp = { left: false, right: false, jump: false };
    for (let i = 0; i < 24; i++) {
      this.approachInput(c, node, inp);
      c.step(inp);
      if (c.status === "respawn") return true;
    }
    return false;
  }

  /** Advance one simulation step (decide → sim.step → after). */
  step() {
    if (this.sim.status === "finished") return;
    this.decide();
    this.sim.step(this.input);
    this.after();
  }

  /** Set this.input (and color / jump presses) for the next sim step. */
  decide() {
    const s = this.sim;
    const inp = this.input;
    this.mode = "idle";
    if (s.status === "finished") return inp;
    if (s.status === "respawn") {
      if (this.lastStatus !== "respawn") this.deaths += 1;
      this.lastStatus = s.status;
      this.plan = null;
      inp.left = inp.right = inp.jump = false;
      this.mode = "respawn";
      return inp;
    }
    this.lastStatus = s.status;
    if (!this.plan && s.p.grounded) this.resync();
    const node = this.node();
    this.cur = node;

    if (!this.plan) {
      const pols = s.p.grounded ? POLICIES : [POLICIES[2]];
      for (const pol of pols) {
        if (this.tryPolicy(node, pol)) {
          this.plan = { pol, step: 0, b0: s.bounceSeq };
          break;
        }
      }
      // can't grab the star on the way: land on the platform first, then go for it
      if (!this.plan)
        for (const pol of pols) {
          if (this.tryPolicy(node, pol, true)) {
            this.plan = { pol, step: 0, b0: s.bounceSeq, relaxed: true };
            break;
          }
        }
    }

    if (this.plan) {
      this.cur = this.plan.relaxed ? { plat: node.plat, stars: [], color: node.color } : node;
      this.drive(s, this.cur, this.plan.pol, this.plan.step, inp);
      this.plan.step += 1;
      this.mode = "plan";
      return inp;
    }

    // no plan: approach the target along the current platform and wait at the edge —
    // hopping first if walking on would run into a hazard
    if (s.p.grounded && this.approachDies(node)) {
      const stillDies = this.approachDies(node, 30, true);
      const dir = Math.sign(this.targetX(s, node) - s.p.x) || s.p.face;
      const hops = [
        { jump: true, hold: true, dir },
        { jump: true, hold: false, dir },
        POLICIES[0],
        POLICIES[1],
      ];
      if (stillDies) hops.push({ jump: true, hold: true, stay: true });
      const stars0 = s.starCount();
      let pick = null;
      for (const pol of hops) {
        const r = this.tryHop(node, pol);
        if (!r) continue;
        if (r.stars > stars0) {
          pick = pol;
          break;
        }
        if (!pick) pick = pol;
      }
      if (pick) {
        const pol = pick;
        {
          this.plan = { pol, step: 0, b0: s.bounceSeq };
          this.drive(s, node, pol, 0, inp);
          this.plan.step = 1;
          this.mode = "plan";
          return inp;
        }
      }
    }
    const tx = this.targetX(s, node);
    let want = tx;
    if (s.p.grounded) {
      const g = s.plats[s.p.ground];
      want = Math.max(g.x + PHYS.FOOT + 3, Math.min(g.x + g.def.w - PHYS.FOOT - 3, tx));
    }
    const d = want - s.p.x;
    inp.left = d < -3;
    inp.right = d > 3;
    inp.jump = false;
    if (!s.p.grounded && node.color && s.p.color !== node.color) s.setColor(node.color);
    this.mode = "approach";
    return inp;
  }

  /** Bookkeeping after the sim stepped with this.input. */
  after() {
    const s = this.sim;
    if (this.mode === "respawn") {
      if (s.status === "play") this.resync(true);
      return;
    }
    if (this.mode === "plan" && this.plan) {
      if (this.reached(s, this.cur, this.plan.b0)) {
        if (!this.plan.relaxed) this.idx += 1;
        this.plan = null;
      } else if (s.status !== "play" || (s.p.grounded && this.plan.step > 3 && (this.plan.pol.jump || s.p.ground !== this.groundAtPlan))) {
        this.plan = null;
      }
      if (!this.plan) this.groundAtPlan = s.p.grounded ? s.p.ground : -1;
      return;
    }
    if (this.mode === "approach") this.groundAtPlan = s.p.grounded ? s.p.ground : -1;
  }

  /** Jump the route index to the node we are standing on (respawn / overshoot). */
  resync(respawned = false) {
    const s = this.sim;
    if (!s.p.grounded) return;
    const j = this.route.findIndex((n) => !n.finish && n.plat === s.p.ground);
    if (j < 0) return;
    const next = this.route[j].stars.every((k) => s.starsGot[k]) ? j + 1 : j;
    if (respawned) this.idx = next;
    else if (next > this.idx) this.idx = next;
  }
}

/** Run the bot on a level until finished or time out. */
export function runBot(sim, maxSeconds = 240) {
  const bot = new Bot(sim);
  const steps = Math.round(maxSeconds / PHYS.DT);
  for (let i = 0; i < steps && !sim.finished; i++) bot.step();
  return { finished: sim.finished, time: sim.time, stars: sim.starCount(), deaths: bot.deaths, node: bot.idx, route: bot.route.length, bot };
}
