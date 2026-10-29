/**
 * Lord Voldemort — the final duel in the Duelling Ruins.
 *
 *   intro      he speaks; untouchable                       (~7 s)
 *   phase 1    100–66%: aimed curse volleys, a telegraphed curse beam
 *              (a line on the ground — sidestep it), apparition, shields
 *   phase 2    at 66%: he rises into a dark sphere (immune), wakes three
 *              obelisks and summons Death Eaters + a Dementor. Destroy the
 *              obelisks → the sphere shatters and he is dazed (bonus damage).
 *              Then: shockwave rings around him + volleys.
 *   phase 3    below 33%: Fiendfyre — chained ground circles that chase
 *              you — faster volleys, one more summon.
 *   finish     at 1 HP he falls to one knee: land Expelliarmus to end it.
 *
 * Every big attack is telegraphed; nothing is unblockable without warning.
 */
import { OBELISKS, ARENA } from "../data/layout.js";
import { spawnBolt, stun } from "./combat.js";
import { approachAngle } from "./math.js";

export function createBoss(G, e) {
  const B = {
    e,
    phase: 0,
    t: 0,
    next: 2,
    pattern: 0,
    sphere: false,
    dazeT: 0,
    finishT: 0,
    summoned2: false,
    summoned3: false,
    checkpoint: 1,
  };
  e.invuln = true;
  e.state = "intro";
  G.obelisks = OBELISKS.map((o) => ({ ...o, hp: 140, maxHp: 140, dead: false, active: false }));
  G.hurtObelisk = (ob, n) => {
    if (!ob.active || ob.dead) return;
    ob.hp -= Math.round(n);
    G.emit({ type: "dmg", n: Math.round(n), x: ob.x, y: 4.5, z: ob.z, obelisk: true });
    if (ob.hp <= 0) {
      ob.dead = true;
      G.emit({ type: "obeliskDown", id: ob.id, x: ob.x, z: ob.z, left: G.obelisks.filter((x) => !x.dead).length });
      if (G.obelisks.every((x) => x.dead)) breakSphere();
    }
  };
  function breakSphere() {
    B.sphere = false;
    e.invuln = false;
    e.flyY = 0;
    B.dazeT = 5;
    stun(G, e, 5 / (e.def.stunMul || 1));
    e.stunT = 5;
    G.emit({ type: "bossSphere", on: false, x: e.x, z: e.z });
    G.emit({ type: "bossLine", text: "Impossible…!" });
  }
  function toPhase(n) {
    B.phase = n;
    B.next = 1.5;
    G.emit({ type: "bossPhase", phase: n, name: e.def.name });
    if (n === 2) {
      B.checkpoint = 2;
      B.sphere = true;
      e.invuln = true;
      e.wind = null;
      e.flyY = 2.2;
      // float to the centre
      e.x = ARENA.x;
      e.z = ARENA.z;
      for (const ob of G.obelisks) ob.active = true;
      G.emit({ type: "bossSphere", on: true, x: e.x, z: e.z });
      G.emit({ type: "bossLine", text: "You think you can stand against me? Let us see how you fare against my servants." });
      G.spawnUnits([["deathEater", ARENA.x - 9, ARENA.z + 4], ["deathEater", ARENA.x + 9, ARENA.z + 4], ["dementor", ARENA.x, ARENA.z - 12]], "bossAdds");
    }
    if (n === 3) {
      B.checkpoint = 3;
      G.emit({ type: "bossLine", text: "Enough! Burn!" });
    }
  }

  const p = () => G.player;

  function volley(n, spread, speed = 26, dmg = 14) {
    const P = p();
    const sx = e.x + Math.sin(e.yaw) * 0.6;
    const sz = e.z + Math.cos(e.yaw) * 0.6;
    const sy = e.y + 1.5;
    for (let k = 0; k < n; k++) {
      G.later(k * 0.16, () => {
        if (e.dead || e.stunT > 0 || B.sphere && false) return;
        const off = (k - (n - 1) / 2) * spread;
        let dx = P.x - sx;
        const dy = P.y + 1.1 - sy;
        let dz = P.z - sz;
        const c = Math.cos(off);
        const s = Math.sin(off);
        [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
        const L = Math.hypot(dx, dy, dz) || 1;
        spawnBolt(G, { team: "enemy", kind: "curse", x: sx, y: sy, z: sz, dx: dx / L, dy: dy / L, dz: dz / L, speed, range: 50, dmg, src: e, color: "#3dff8a", radius: 0.32, homing: 0.25 });
      });
    }
    G.emit({ type: "enemyCast", id: e.id, kind: "curse", color: "#3dff8a" });
  }
  function beam() {
    const P = p();
    const yaw = Math.atan2(P.x - e.x, P.z - e.z);
    e.yaw = yaw;
    G.zones.push({ kind: "warn", shape: "line", x: e.x, z: e.z, yaw, r: 1.3, len: 40, delay: 1.1, dmg: 30, color: "#3dff8a", t: 0, fx: "beam" });
    G.emit({ type: "telegraph", shape: "line", x: e.x, z: e.z, r: 1.3, len: 40, yaw, dur: 1.1, color: "#3dff8a" });
    G.emit({ type: "windup", id: e.id, x: e.x, y: e.y + 1.5, z: e.z, color: "#3dff8a", t: 1.1, beam: true });
    e.wind = { kind: "beam" };
    e.windT = 1.3;
  }
  function shockwave() {
    G.zones.push({ kind: "warn", shape: "circle", x: e.x, z: e.z, r: 8, delay: 1.4, dmg: 24, color: "#a35cff", t: 0, fx: "shock" });
    G.emit({ type: "telegraph", shape: "circle", x: e.x, z: e.z, r: 8, dur: 1.4, color: "#a35cff" });
    e.wind = { kind: "shock" };
    e.windT = 1.5;
  }
  function fiendfyre(n = 4) {
    for (let k = 0; k < n; k++) {
      G.later(k * 0.55, () => {
        if (e.dead) return;
        const P = p();
        const x = P.x + (G.rand() - 0.5) * 2;
        const z = P.z + (G.rand() - 0.5) * 2;
        G.zones.push({ kind: "warn", shape: "circle", x, z, r: 2.8, delay: 1.0, dmg: 18, color: "#ff7a2a", t: 0, fx: "fire" });
        G.emit({ type: "telegraph", shape: "circle", x, z, r: 2.8, dur: 1.0, color: "#ff7a2a" });
      });
    }
    e.wind = { kind: "fyre" };
    e.windT = 0.8;
  }
  function apparate() {
    const P = p();
    const a = G.rand() * Math.PI * 2;
    const r = 9 + G.rand() * 6;
    let nx = P.x + Math.sin(a) * r;
    let nz = P.z + Math.cos(a) * r;
    const dd = Math.hypot(nx - ARENA.x, nz - ARENA.z);
    if (dd > ARENA.r - 3) {
      nx = ARENA.x + ((nx - ARENA.x) / dd) * (ARENA.r - 3);
      nz = ARENA.z + ((nz - ARENA.z) / dd) * (ARENA.r - 3);
    }
    G.emit({ type: "apparate", id: e.id, x0: e.x, z0: e.z, x: nx, z: nz, y: e.y, boss: true });
    e.x = nx;
    e.z = nz;
  }

  B.update = (dt) => {
    if (e.dead) return;
    const P = p();
    B.t += dt;
    e.t += dt;
    e.hitT = Math.max(0, e.hitT - dt);
    for (const k of ["stunT", "disarmT", "shieldT", "staggerT"]) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
    e.y = (e.flyY || 0) + Math.sin(B.t * 1.6) * (e.flyY ? 0.2 : 0);
    if (!P.dead) e.yaw = approachAngle(e.yaw, Math.atan2(P.x - e.x, P.z - e.z), dt * 5);
    G.bossActive = true;
    if (e.state === "intro") {
      e.anim = "idle";
      if (B.t > 7.5) {
        e.state = "fight";
        e.invuln = false;
        B.phase = 1;
        B.next = 1.2;
        G.emit({ type: "bossAggro", name: e.def.name });
      }
      return;
    }
    if (e.state === "finish") {
      e.anim = "kneel";
      e.invuln = false;
      B.finishT += dt;
      return;
    }
    // phase transitions
    const f = e.hp / e.maxHp;
    if (B.phase === 1 && f <= 0.66) {
      toPhase(2);
      return;
    }
    if (B.phase === 2 && !B.sphere && f <= 0.33) toPhase(3);
    if (B.phase === 3 && !B.summoned3 && f <= 0.22) {
      B.summoned3 = true;
      G.spawnUnits([["darkWizard", ARENA.x - 10, ARENA.z - 8], ["darkWizard", ARENA.x + 10, ARENA.z - 8]], "bossAdds");
    }
    if (e.hp <= 1 && (B.phase < 3 || B.sphere)) e.hp = Math.max(e.hp, 2); // never skip a phase
    if (e.hp <= 1) {
      e.hp = 1;
      e.state = "finish";
      e.wind = null;
      e.invuln = false;
      e.flyY = 0;
      G.emit({ type: "bossFinish" });
      G.emit({ type: "bossLine", text: "No… this cannot be…" });
      return;
    }
    if (B.sphere) {
      e.anim = "channel";
      // the sphere pulses curses now and then
      B.next -= dt;
      if (B.next <= 0) {
        B.next = 3.2;
        volley(3, 0.22, 20, 10);
      }
      return;
    }
    if (B.dazeT > 0) B.dazeT -= dt;
    if (e.stunT > 0 || e.staggerT > 0) {
      e.anim = "stunned";
      return;
    }
    if (e.wind) {
      e.windT -= dt;
      e.anim = e.wind.kind === "beam" ? "cast" : "channel";
      if (e.windT <= 0) e.wind = null;
      return;
    }
    // keep a duelling distance
    const d = Math.hypot(P.x - e.x, P.z - e.z);
    e.anim = "idle";
    if (d < 6 && G.rand() < dt * 1.2) apparate();
    else if (d > 18) {
      const k = (dt * e.def.speed) / d;
      e.x += (P.x - e.x) * k;
      e.z += (P.z - e.z) * k;
      e.anim = "walk";
    }
    B.next -= dt * (e.disarmT > 0 ? 0.35 : 1);
    if (B.next > 0) return;
    const ph = B.phase;
    const roll = G.rand();
    B.pattern++;
    if (ph === 1) {
      if (B.pattern % 4 === 0) beam();
      else if (roll < 0.18) {
        apparate();
        B.next = 0.6;
        return;
      } else if (roll < 0.3 && e.shieldT <= 0) {
        e.shieldT = 1.6;
        G.emit({ type: "enemyShield", id: e.id, x: e.x, y: e.y + 1.2, z: e.z });
      } else volley(3, 0.14);
      B.next = 2.1 + G.rand() * 0.7;
    } else if (ph === 2) {
      if (B.pattern % 3 === 0) shockwave();
      else if (B.pattern % 5 === 0) beam();
      else volley(4, 0.16);
      B.next = 1.9 + G.rand() * 0.6;
    } else {
      if (B.pattern % 3 === 0) fiendfyre(5);
      else if (B.pattern % 4 === 0) beam();
      else if (roll < 0.2) apparate();
      else volley(5, 0.13, 28);
      B.next = 1.6 + G.rand() * 0.5;
    }
  };
  /** Expelliarmus during the finish → victory. */
  B.onHit = (spell) => {
    if (e.state === "finish" && spell === "expelliarmus") {
      e.dead = true;
      e.hp = 0;
      G.bossDefeated(e);
      return true;
    }
    return false;
  };
  /** Restore after the hero falls: back to the last phase checkpoint. */
  B.reset = () => {
    const cp = B.checkpoint;
    e.hp = cp === 1 ? e.maxHp : cp === 2 ? Math.round(e.maxHp * 0.66) : Math.round(e.maxHp * 0.33);
    e.state = "fight";
    e.x = ARENA.x;
    e.z = ARENA.z - 16;
    e.wind = null;
    e.stunT = e.disarmT = e.shieldT = 0;
    B.sphere = false;
    e.invuln = false;
    e.flyY = 0;
    B.phase = cp === 2 ? 1 : cp;
    B.next = 2.5;
    B.summoned3 = false;
    G.zones.length = 0;
    for (const ob of G.obelisks) Object.assign(ob, { hp: ob.maxHp, dead: false, active: false });
    if (cp === 2) e.hp = Math.round(e.maxHp * 0.66) + 1; // re-enter phase 2 cleanly
  };
  return B;
}
