/**
 * Street Basketball — opponent AI.
 *
 * A controller that emits exactly the same intents a keyboard does
 * (move vector, sprint, shootDown/shootUp, cross, driveDown/driveUp, jump,
 * steal). Fairness rules, enforced by construction:
 *   • It perceives the player ONLY through perceive(g, reaction) — delayed
 *     snapshots of positions / velocities / visible actions. It never sees a
 *     key press; it sees a shot start ~reaction ms after it visibly starts.
 *   • It uses the same shot meter: its release point is a noisy target, so
 *     it misses like a human does, and physics decides every shot.
 *   • Same speed caps, stamina, steal whiff penalty, block geometry.
 * Difficulty only moves reaction time, decision quality, timing noise and
 * the ratings the engine already uses for everyone.
 *
 * States — offense: CHECK SIZE_UP MOVE_LEFT MOVE_RIGHT DRIVE CROSSOVER
 *   CREATE_SPACE SHOOT; defense: GUARD PRESS GIVE_SPACE CONTEST STEAL RECOVER;
 *   loose ball: CHASE_REBOUND.
 */
import { perceive, distRim, finishKind } from "./match.js";
import { predictLanding } from "./ballPhysics.js";
import { PERFECT_CENTER, METER_TIME } from "./shot.js";
import { ARC_R, COURT_HALF_W, RIM_Y } from "./constants.js";
import { fwd } from "./athlete.js";

const SPOTS = {
  inside: [{ x: -1.6, z: 1.4 }, { x: 1.6, z: 1.4 }, { x: 0, z: 2.6 }, { x: -2.4, z: 3.2 }, { x: 2.4, z: 3.2 }],
  mid: [{ x: -3.6, z: 2.2 }, { x: 3.6, z: 2.2 }, { x: -2.6, z: 4.4 }, { x: 2.6, z: 4.4 }, { x: 0, z: 5.0 }],
  outside: [{ x: -6.3, z: 1.2 }, { x: 6.3, z: 1.2 }, { x: -4.9, z: 4.6 }, { x: 4.9, z: 4.6 }, { x: 0, z: 6.9 }, { x: -2.6, z: 6.6 }, { x: 2.6, z: 6.6 }],
};

export function createAI(profile, rng) {
  const P = {
    reaction: 0.3,
    iq: 0.5, // decision quality 0..1
    aggression: 0.5,
    preferredRange: "mid",
    driveFreq: 0.4,
    crossFreq: 0.3,
    shootFreq: 0.4,
    defenseStyle: "contain", // press | contain | sag
    releaseSigma: 0.06,
    ...profile,
  };
  const B = {
    state: "CHECK",
    stateT: 0,
    thinkT: 0,
    spot: null,
    shootTarget: 0,
    shooting: false,
    driving: false,
    crossSide: 0,
    contestPlan: null,
    lastOffense: null,
    possessionT: 0,
    playerOutside: 0,
    playerDrives: 0,
    lastPlayerAct: null,
    jumpAt: null,
  };

  function set(state) {
    B.state = state;
    B.stateT = 0;
  }

  return {
    brain: B,
    profile: P,
    intent(g, a, dt) {
      const ev = [];
      const out = { mx: 0, mz: 0, sprint: false, events: ev };
      B.stateT += dt;
      B.thinkT -= dt;
      const snap = perceive(g, P.reaction);
      if (!snap) return out;
      // the OTHER athlete, whichever side this AI plays
      const pl = a.id === "o" ? snap.p : snap.o;
      trackPlayer(pl);

      if (g.phase === "check" || g.phase === "scored" || g.phase === "reset" || g.phase === "over") {
        releaseAll(a, ev);
        B.possessionT = 0;
        set(g.phase === "check" ? "CHECK" : "IDLE");
        if (g.phase === "scored" || g.phase === "reset") {
          // walk back toward the top
          const tx = g.offense === a.id ? 0 : 0;
          steer(out, a, tx, 7.5, 0.35);
        }
        return out;
      }

      const mine = g.owner === a.id;
      if (mine) offense(g, a, pl, dt, out);
      else if (g.bmode === "loose" || g.bmode === "flight") {
        releaseAll(a, ev);
        chaseRebound(g, a, snap, pl, dt, out);
      } else if (g.owner && g.owner !== a.id) {
        releaseAll(a, ev);
        defense(g, a, snap, pl, dt, out);
      } else {
        releaseAll(a, ev);
        steer(out, a, 0, 5, 0.5);
      }
      return out;
    },
  };

  function trackPlayer(pl) {
    const pa = pl.act;
    if (pa !== B.lastPlayerAct) {
      if (pa === "shoot" && Math.hypot(pl.x, pl.z) > ARC_R) B.playerOutside += 1;
      if (pa === "layup" || pa === "dunk") B.playerDrives += 1;
      B.lastPlayerAct = pa;
    }
  }

  function releaseAll(a, ev) {
    if (B.shooting) {
      ev.push("shootUp");
      B.shooting = false;
    }
    if (B.driving) {
      ev.push("driveUp");
      B.driving = false;
    }
  }

  /* ---------------------------------------------------------- offense */
  function offense(g, a, pl, dt, out) {
    const ev = out.events;
    B.possessionT += dt;
    if (B.lastOffense !== g.possession) {
      B.lastOffense = g.possession;
      B.possessionT = 0;
      set("SIZE_UP");
      B.stateT = -rng.range(0, 0.4) * (1 - P.iq);
      B.spot = null;
    }
    // shot in progress: release on our own meter target
    if (a.act && a.act.kind === "shoot") {
      if (B.shooting && !a.act.releaseReq) {
        const m = (g.time - a.act.pressT) / METER_TIME;
        if (m >= B.shootTarget) {
          ev.push("shootUp");
          B.shooting = false;
        }
      }
      return;
    }
    if (a.act) return; // layup / dunk / crossover in progress
    B.shooting = false;

    const dRim = distRim(a);
    const dxp = pl.x - a.x;
    const dzp = pl.z - a.z;
    const dDef = Math.hypot(dxp, dzp);
    // is the (perceived) defender between me and the rim?
    const between = dRim > 0 ? (dxp * -a.x + dzp * -a.z) / ((dDef || 1) * dRim) : 0;
    const defInFront = between > 0.35 && dDef < 2.2;
    const defShook = pl.slow > 0.15 || pl.air;

    const sv = shotValue(a, dRim, dDef, between);
    const inRange = rangeOk(dRim);
    const stall = B.possessionT > 8 + P.iq * 2;

    switch (B.state) {
      case "SIZE_UP": {
        // jab-dribble in place, facing up
        const jab = Math.sin(B.stateT * 5) * 0.3;
        out.mx = -a.z * 0.0 + jab * (a.z > 0 ? 1 : -1) * 0.5;
        out.mz = 0;
        if (B.stateT > 0.55 + (1 - P.iq) * 0.5) decide(g, a, { dRim, dDef, between, sv, inRange, defInFront, defShook, stall });
        break;
      }
      case "MOVE": {
        if (!B.spot) B.spot = pickSpot(a);
        const dd = steer(out, a, B.spot.x, B.spot.z, 0.35);
        out.sprint = dd > 3 && P.aggression > 0.5;
        if (dd < 0.45 || B.stateT > 2.6) set("SIZE_UP");
        // open look on the move → rise up
        if (inRange && dDef > 2.1 && B.stateT > 0.4 && rng.chance(P.shootFreq * dt * 2.5)) startShot(a, dRim, dDef, ev);
        break;
      }
      case "DRIVE": {
        if (!B.driving) {
          ev.push("driveDown");
          B.driving = true;
        }
        // attack the side away from the defender
        const side = B.crossSide || (dxp > 0 ? -1 : 1);
        const tx = side * 0.9;
        const tz = 0.9;
        steer(out, a, tx, tz, 0.1);
        out.sprint = true;
        // cut off: pull up, cross, or reset
        if (defInFront && dDef < 1.0 && B.stateT > 0.25 && dRim > 2.6) {
          ev.push("driveUp");
          B.driving = false;
          if (a.cd.cross <= 0 && g.time - (B.lastCrossT || -9) > 1.2 && rng.chance(P.crossFreq + 0.2)) {
            B.crossSide = -B.crossSide || 1;
            B.lastCrossT = g.time;
            ev.push("cross");
            set("CROSSOVER");
          } else if (inRange && rng.chance(P.shootFreq)) startShot(a, dRim, dDef, ev);
          else set("CREATE_SPACE");
        }
        if (B.stateT > 3.2) {
          ev.push("driveUp");
          B.driving = false;
          set("SIZE_UP");
        }
        break;
      }
      case "CROSSOVER": {
        if (B.stateT > 0.32) {
          // go where the crossover sent us
          if (dRim < 7.5 && (defShook || rng.chance(0.6 + P.iq * 0.3))) set("DRIVE");
          else set("SIZE_UP");
        }
        break;
      }
      case "CREATE_SPACE": {
        // step back away from the defender, then fire
        const l = dDef || 1;
        out.mx = -dxp / l;
        out.mz = -dzp / l;
        if (B.stateT > 0.45) {
          if (rangeOk(distRim(a)) || stall) startShot(a, distRim(a), dDef, ev);
          else set("MOVE");
        }
        break;
      }
      default:
        set("SIZE_UP");
    }
  }

  function decide(g, a, c) {
    const ev = [];
    const w = [];
    // real shot selection: only good-enough looks from sane spots
    const tight = c.defInFront && c.dDef < 1.15;
    const shootOk = c.inRange && !(tight && !c.stall) && (c.sv > 0.36 - P.iq * 0.06 || (c.stall && c.sv > 0.2));
    if (shootOk) w.push(["SHOOT", P.shootFreq * (0.6 + c.sv) * (c.dDef > 1.8 ? 1.6 : 1)]);
    const laneOpen = !c.defInFront || c.defShook || c.dDef > 2.4;
    const crowdedRim = tight && c.dRim < 2.8;
    w.push(["DRIVE", crowdedRim ? 0.12 : P.driveFreq * (laneOpen ? 1.5 : 0.45) * (c.dRim < 7.5 ? 1 : 0.3) + (c.dRim < 2.6 ? 1.2 : 0)]);
    const crossReady = g.time - (B.lastCrossT || -9) > 1.6 - P.iq * 0.4;
    if (c.dDef < 2.0 && c.defInFront && crossReady) w.push(["CROSSOVER", P.crossFreq * 1.2]);
    // crowded under the rim: kick it back out and reset, like a real player
    w.push(["MOVE", 0.25 + (c.inRange ? 0 : 0.6) + (crowdedRim ? 1.6 : 0)]);
    if (c.dDef < 1.3 && rangeOk(c.dRim + 1)) w.push(["CREATE_SPACE", 0.15 + P.iq * 0.2]);
    const choice = weighted(w);
    if (choice === "SHOOT") startShot(a, c.dRim, c.dDef, g.__aiEv || null);
    else if (choice === "CROSSOVER") {
      B.crossSide = rng.chance(0.5) ? 1 : -1;
      B.pendingCross = true;
      B.lastCrossT = g.time;
      set("CROSSOVER");
    } else if (choice === "DRIVE") {
      B.crossSide = 0;
      set("DRIVE");
    } else if (choice === "MOVE") {
      B.spot = crowdedRim ? { x: a.x >= 0 ? 2.8 : -2.8, z: 4.2 } : pickSpot(a);
      set("MOVE");
    } else set(choice);
    return ev;
  }

  function startShot(a, dRim, dDef, ev) {
    B.shooting = true;
    B.pendingShot = true;
    // own-meter release target: noisy around perfect (skill-dependent)
    B.shootTarget = Math.min(1, Math.max(0.45, PERFECT_CENTER + rng.gauss() * P.releaseSigma + (dDef < 1.2 ? rng.gauss() * 0.03 : 0)));
    set("SHOOT");
    if (ev) {
      ev.push("shootDown");
      B.pendingShot = false;
    }
  }

  function shotValue(a, dRim, dDef, between) {
    const pts = dRim > ARC_R ? 2 : 1;
    let p = dRim < 1.6 ? 0.66 : dRim < 3.2 ? 0.52 : dRim < 5 ? 0.46 : dRim < ARC_R ? 0.42 : 0.36;
    p *= 0.72 + a.r.shooting * 0.055;
    const guarded = between > 0.2 ? (dDef < 1.0 ? 0.45 : dDef < 1.6 ? 0.7 : dDef < 2.2 ? 0.88 : 1) : 0.95;
    return pts * p * guarded;
  }

  function rangeOk(dRim) {
    const r = P.preferredRange;
    if (dRim > ARC_R + 1.3) return false;
    if (r === "inside") return dRim < 3.4;
    if (r === "mid") return dRim < ARC_R + 0.1 || (dRim < ARC_R + 0.9 && P.iq > 0.6);
    if (r === "outside") return dRim > 3.2;
    return true;
  }

  function pickSpot(a) {
    const r = P.preferredRange === "any" ? rng.pick(["inside", "mid", "outside"]) : P.preferredRange;
    const list = SPOTS[r] || SPOTS.mid;
    let best = list[0];
    let bestS = -1;
    for (const s of list) {
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      const sc = (d > 1.2 ? 1 : 0.2) * (0.6 + rng.next()) / (1 + d * 0.15);
      if (sc > bestS) {
        bestS = sc;
        best = s;
      }
    }
    return best;
  }

  function weighted(w) {
    const tot = w.reduce((s, x) => s + Math.max(0, x[1]), 0);
    let r = rng.next() * tot;
    for (const [k, v] of w) {
      r -= Math.max(0, v);
      if (r <= 0) return k;
    }
    return w[w.length - 1][0];
  }

  /* ---------------------------------------------------------- defense */
  function defense(g, a, snap, pl, dt, out) {
    const ev = out.events;
    const dRimP = Math.hypot(pl.x, pl.z);
    // anticipation: better defenders lead the dribbler
    const lead = 0.1 + P.iq * 0.22;
    const px = pl.x + pl.vx * lead;
    const pz = pl.z + pl.vz * lead;
    let gap = P.defenseStyle === "press" ? 0.95 : P.defenseStyle === "sag" ? 1.55 : 1.2;
    if (dRimP > ARC_R + 1.6) gap += 0.9; // don't chase way out
    if (dRimP > ARC_R && B.playerOutside > 2) gap -= 0.3; // respect a hot shooter
    if (dRimP < 3) gap = Math.min(gap, 0.9);
    gap = Math.max(0.78, gap);
    const pd = Math.hypot(px, pz) || 1;
    const gx = px - (px / pd) * gap;
    const gz = pz - (pz / pd) * gap;

    const act = pl.act;
    // visible shot → contest (timing from what we SAW, not what was pressed)
    if ((act === "shoot" || act === "layup" || act === "dunk") && !a.act && !a.air) {
      const dist = Math.hypot(pl.x - a.x, pl.z - a.z);
      if (!B.jumpAt && dist < 2.6) {
        const seenStart = snap.t - (pl.actT || 0);
        const typicalRelease = act === "shoot" ? 0.52 : act === "layup" ? 0.5 : 0.55;
        const apex = 0.3;
        const noise = rng.gauss() * (0.13 - a.r.block * 0.009) + (1 - P.iq) * 0.05;
        B.jumpAt = seenStart + typicalRelease - apex + noise;
        B.contestSeen = snap.t;
      }
      set("CONTEST");
      // close out hard, hands up
      steer(out, a, pl.x - (pl.x / (Math.hypot(pl.x, pl.z) || 1)) * 0.7, pl.z - (pl.z / (Math.hypot(pl.x, pl.z) || 1)) * 0.7, 0.1);
      out.sprint = true;
      if (B.jumpAt && g.time >= B.jumpAt) {
        ev.push("jump");
        B.jumpAt = null;
      }
      return;
    }
    if (!act) B.jumpAt = null;

    if (a.slow > 0 || (a.act && a.act.kind === "steal")) {
      set("RECOVER");
    } else if (B.state === "CONTEST" || B.state === "RECOVER" || B.state === "IDLE" || B.state === "CHECK") set("GUARD");

    const dd = steer(out, a, gx, gz, 0.12);
    out.sprint = dd > 1.6;

    // steal attempts: only when the ball is visibly exposed and close
    const b = snap.ball;
    if (!a.act && a.cd.steal <= 0 && a.slow <= 0 && B.thinkT <= 0) {
      B.thinkT = 0.22 + (1 - P.iq) * 0.18;
      const bd = Math.hypot(b.x - a.x, b.z - a.z);
      const exposed = b.mode === "cross" || (b.mode === "dribble" && b.drib > 0.2 && b.drib < 0.75);
      const f = fwd(a);
      const inFront = ((b.x - a.x) * f.x + (b.z - a.z) * f.z) / (bd || 1) > 0.3;
      if (exposed && bd < 1.2 && inFront && rng.chance(P.aggression * (0.2 + a.r.steal * 0.035))) {
        ev.push("steal");
        set("STEAL");
      }
    }
  }

  /* ---------------------------------------------------------- rebound */
  function chaseRebound(g, a, snap, pl, dt, out) {
    const b = snap.ball;
    set("CHASE_REBOUND");
    const fake = { p: { x: b.x, y: b.y, z: b.z }, v: { x: b.vx, y: b.vy, z: b.vz }, w: { x: 0, y: 0, z: 0 }, belowEntry: false };
    // recompute the landing guess ~5x/second (cheap: silent physics copy)
    if (!B.land || B.thinkT <= 0) {
      B.land = predictLanding(fake, 2.4 + (a.r.rebound - 5) * 0.03);
      B.thinkT = 0.2;
    }
    const L = B.land;
    const tx = Math.max(-COURT_HALF_W + 0.4, Math.min(COURT_HALF_W - 0.4, L.x));
    const tz = Math.max(-1.1, L.z);
    steer(out, a, tx, tz, 0.05);
    out.sprint = true;
    // jump for high balls within reach
    const hd = Math.hypot(b.x - a.x, b.z - a.z);
    const moving = Math.hypot(b.vx, b.vy, b.vz) > 0.6;
    if (!a.air && !a.act && moving && hd < 0.9 && b.y > 2.0 && b.y < 3.2 && b.vy < 1 && rng.chance(0.5 + a.r.rebound * 0.05)) {
      out.events.push("jump");
    }
    // don't goaltend: if the ball is still over the rim, hold position
    if (Math.hypot(b.x, b.z) < 0.5 && b.y > RIM_Y) {
      out.mx *= 0.3;
      out.mz *= 0.3;
    }
  }

  function steer(out, a, tx, tz, stopR) {
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d > stopR) {
      const m = Math.min(1, d / 0.6);
      out.mx = (dx / d) * m;
      out.mz = (dz / d) * m;
    }
    return d;
  }
}

/**
 * The AI's SIZE_UP → SHOOT transition pushes its shootDown through this
 * wrapper so the press lands in the same intent as the decision.
 */
export function wrapAI(ai) {
  return {
    ...ai,
    intent(g, a, dt) {
      const out = ai.intent(g, a, dt);
      const B = ai.brain;
      if (B.pendingShot && g.owner === a.id && !a.act) {
        out.events.push("shootDown");
        B.pendingShot = false;
      }
      if (B.pendingCross && g.owner === a.id && !a.act) {
        out.events.push("cross");
        B.pendingCross = false;
      }
      // never hold "shoot" without an active shot (keeps state clean)
      if (B.state === "SHOOT" && !a.act && !B.pendingShot && g.owner === a.id && B.stateT > 0.3) {
        B.shooting = false;
        B.state = "SIZE_UP";
        B.stateT = 0;
      }
      return out;
    },
  };
}

export { finishKind };
