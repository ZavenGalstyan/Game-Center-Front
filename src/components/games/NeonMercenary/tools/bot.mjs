/**
 * Campaign bot: plays Neon Mercenary through the real simulation using only
 * the player's input object + camera angles (like a mouse), the same
 * interactions the UI offers (talk, hold-E, breach puzzles, shops, transit,
 * contract terminal). Used by tools/campaignTest.mjs and the browser harness.
 *
 *   const bot = createBot(G, opts); each frame: const inp = bot.step(dt); G.step(dt, inp)
 */
import { findPath, lineOfSight, navClear, nearestWalkable } from "../engine/map.js";
import { dist, wrapAngle, yawOf, clamp } from "../engine/math.js";
import { buy, canBuy, learnSkill, canLearn, equipWeapon, equipArmor, weaponByUid, armorByUid, derive, weaponStats } from "../engine/profile.js";
import { shopStock } from "../data/shops.js";
import { WEAPONS, AMMO, RARITY_MULT } from "../data/weapons.js";
import { ARMOR } from "../data/items.js";
import { pick as hackPick } from "../engine/hack.js";

const SKILL_ORDER = ["tough", "marksman", "steadyAim", "tough", "marksman", "plated", "quickHands", "marksman", "overclock", "steadyAim", "killer", "hardened", "plated", "secondWind", "medic", "killer", "hardened", "capacitor", "dash", "breach", "steadyAim", "killer", "executioner", "adrenal", "tough", "brawler", "combatStim", "deadeye", "unbreakable", "ghost", "hardened", "plated"];

export function createBot(G, opts = {}) {
  const log = opts.log || (() => {});
  const S = { path: null, pathT: 0, goal: null, stuckT: 0, lastPos: { x: 0, z: 0 }, holdE: 0, target: null, strafe: 1, strafeT: 0, wait: 0, dodgeT: 0, healT: 0, kills: 0, aimErr: opts.aimErr ?? 0.012, takedown: null, crouch: false, peekT: 0 };

  function moveToward(tx, tz, inp, run = true) {
    const p = G.player;
    const M = G.map;
    S.pathT -= 1 / 60;
    const goalMoved = !S.goal || dist(S.goal.x, S.goal.z, tx, tz) > 1.2;
    let wx = tx;
    let wz = tz;
    if (!navClear(M, p.x, p.z, tx, tz)) {
      if (!S.path || goalMoved || S.pathT <= 0) {
        S.path = findPath(M, p.x, p.z, tx, tz, 40000);
        S.pathI = 0;
        S.pathT = 0.6;
        S.goal = { x: tx, z: tz };
      }
      if (S.path?.length) {
        let wp = S.path[S.pathI];
        while (wp && dist(p.x, p.z, wp.x, wp.z) < 0.7 && S.pathI < S.path.length - 1) wp = S.path[++S.pathI];
        if (wp) {
          wx = wp.x;
          wz = wp.z;
        }
      }
    } else S.path = null;
    const d = dist(p.x, p.z, tx, tz);
    // world direction → camera-relative axes
    const yw = yawOf(wx - p.x, wz - p.z);
    const rel = wrapAngle(yw - G.camYaw);
    inp.mz = Math.cos(rel);
    inp.mx = -Math.sin(rel);
    inp.sprint = run && d > 6 && !S.crouch && !G.missions.active?.step?.stealth;
    // stuck detection → jump / sidestep
    S.stuckT += 1 / 60;
    if (S.stuckT > 0.8) {
      if (dist(p.x, p.z, S.lastPos.x, S.lastPos.z) < 0.25 && d > 1) {
        inp.jump = true;
        S.path = null;
        S.pathT = 0;
        S.strafe = -S.strafe;
        inp.mx += S.strafe;
      }
      S.lastPos = { x: p.x, z: p.z };
      S.stuckT = 0;
    }
    return d;
  }
  function faceToward(x, y, z, err = 0) {
    const c = G.aimPoint().cam;
    const dx = x - c.x;
    const dz = z - c.z;
    G.camYaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * err;
    G.camPitch = clamp(Math.atan2(y - c.y, Math.hypot(dx, dz)) + (Math.random() - 0.5) * err, -0.95, 0.8);
  }

  function visibleEnemies() {
    const p = G.player;
    const out = [];
    for (const e of G.enemies) {
      if (e.state === "dead") continue;
      if (e.boss?.shieldOn && e.boss.id === "vex") {
        // shoot the drones instead
      }
      const d = dist(e.x, e.z, p.x, p.z);
      if (d > 55) continue;
      const ty = e.flyer ? e.y : e.y + e.h * 0.62;
      if (!lineOfSight(G.map, p.x, p.y + 1.55, p.z, e.x, ty, e.z)) continue;
      out.push({ e, d });
    }
    out.sort((a, b) => score(a) - score(b));
    return out;
  }
  function score({ e, d }) {
    let s = d;
    if (e.boss?.shieldOn) s += 100; // shielded → drones first
    if (e.decoy) s += 5;
    if (e.state === "combat") s -= 10;
    if (e.def.weapon?.kind === "melee" && d < 6) s -= 20;
    return s;
  }

  function avoidHazards(inp) {
    const p = G.player;
    for (const h of G.hazards) {
      if (h.kind === "aimline" || h.kind === "cone") continue;
      const warnLeft = h.warn - h.t;
      if (h.kind === "laser") {
        // break line of sight or roll right as it fires
        if (warnLeft < 0.45 && warnLeft > 0 && S.dodgeT <= 0) {
          inp.mx = S.strafe;
          inp.mz = 0.2;
          inp.ctrl = true;
          S.dodgeT = 0.7;
        }
        continue;
      }
      if (h.kind === "beam") {
        if (h.t > h.warn - 0.3) inp.ctrl = !S.crouch && p.crouchT < 0.5 && dist(p.x, p.z, h.x, h.z) < h.len ? (S.crouch = true) : false;
        continue;
      }
      if (h.kind === "zone") {
        if (G.inHazard(h, p) || (h.life > 0 && false)) {
          /* walking through cleared gas is fine */
        }
        continue;
      }
      if (h.t > h.warn + h.life) continue;
      const inside = G.inHazard(h, { ...p, x: p.x, z: p.z });
      const near = h.kind === "circle" || h.kind === "pool" ? dist(p.x, p.z, h.x, h.z) < h.r + 1.5 : inside;
      if (!(inside || near)) continue;
      // move out: away from centre (circles), perpendicular (lines), toward centre (rings)
      let ax = 0;
      let az = 0;
      if (h.kind === "line") {
        const px = Math.cos(h.ang);
        const pz = -Math.sin(h.ang);
        const side = (p.x - h.x) * px + (p.z - h.z) * pz >= 0 ? 1 : -1;
        ax = px * side;
        az = pz * side;
      } else if (h.kind === "panel") {
        const cx = (h.x0 + h.x1) / 2;
        const cz = (h.z0 + h.z1) / 2;
        ax = p.x - cx;
        az = p.z - cz;
      } else if (h.kind === "ring") {
        ax = h.x - p.x;
        az = h.z - p.z;
      } else {
        ax = p.x - h.x;
        az = p.z - h.z;
      }
      const l = Math.hypot(ax, az) || 1;
      const rel = wrapAngle(yawOf(ax / l, az / l) - G.camYaw);
      inp.mz = Math.cos(rel);
      inp.mx = -Math.sin(rel);
      inp.sprint = true;
      if (warnLeft < 0.35 && warnLeft > -0.05 && inside && S.dodgeT <= 0 && h.ground !== false) {
        inp.ctrl = true;
        S.dodgeT = 0.7;
      }
      if (h.ground && warnLeft < 0.25 && warnLeft > 0 && inside && h.kind !== "pool" && h.kind !== "panel") inp.jump = true;
      return true;
    }
    return false;
  }

  function fight(inp, list) {
    const p = G.player;
    const W = G.wpn;
    const { e, d } = list[0];
    S.target = e;
    const head = !e.flyer && d < 18;
    const ty = e.flyer ? e.y : e.y + e.h * (head ? 0.86 : 0.62) * (e.crouch ? 0.6 : 1);
    // lead moving targets slightly
    faceToward(e.x + e.vx * 0.05, ty, e.z + e.vz * 0.05, S.aimErr * (d / 10));
    inp.aim = d > 7 && !W.def?.melee;
    // switch to the best weapon for the range
    const P = G.P;
    const ranged = ["w1", "w2"].filter((s) => P.equip[s]);
    if (ranged.length === 2 && W.reloadT <= 0) {
      const sts = ranged.map((s) => ({ s, st: weaponStats(weaponByUid(P, P.equip[s]), G.D), res: G.reserve(WEAPONS[weaponByUid(P, P.equip[s]).id].ammo), mag: P.mags[P.equip[s]] }));
      const usable = sts.filter((x) => x.res > 0 || x.mag > 0);
      const best = usable.sort((a, b) => rangeScore(b.st, d) - rangeScore(a.st, d))[0];
      if (best && P.activeSlot !== best.s && P.activeSlot !== "melee") inp.slot = best.s;
    }
    if (P.activeSlot === "melee") inp.slot = "w1";
    // fire when the crosshair is on target
    const aim = G.aimPoint();
    if (aim.target === e || d < 3) {
      if (W.stats && !W.stats.melee) {
        if (G.mag > 0) {
          inp.fire = true;
          inp.firePressed = W.fireT <= 0 && (S.fp = !S.fp);
        } else inp.reload = true;
      }
    }
    if (d < 1.8 && e.def.weapon?.kind === "melee" && !e.boss) inp.melee = true;
    // movement: hold a good distance and strafe (bosses: keep moving)
    S.strafeT -= 1 / 60;
    if (S.strafeT <= 0) {
      S.strafeT = 1 + Math.random() * 1.5;
      S.strafe = -S.strafe;
    }
    const want = e.boss ? 11 : e.def.weapon?.kind === "melee" ? 7 : 12;
    let mz = d > want + 3 ? 1 : d < want - 3 ? -1 : 0;
    inp.mz = mz;
    inp.mx = S.strafe * (e.boss ? 1 : 0.6);
    // ability
    const os = G.P.cyber.equipped.os;
    if (os && G.cds.ability <= 0 && G.player.energy > 60 && (e.boss || list.length > 2 || (os === "emp" && list.some((x) => x.e.robot && x.d < 10)))) inp.ability = true;
    // heal
    S.healT -= 1 / 60;
    if (p.hp < G.D.maxHp * 0.45 && S.healT <= 0) {
      inp.heal = true;
      S.healT = 1.5;
    }
  }
  function rangeScore(st, d) {
    const dps = (st.dmg * st.pellets * st.rpm) / 60;
    const fall = d > st.range ? 0.4 : 1;
    return dps * fall * (st.pellets > 1 && d > 12 ? 0.3 : 1);
  }

  /* ------------------------------------------------------------ stealth */
  function stealth(inp, step) {
    const p = G.player;
    const guards = G.enemies.filter((e) => e.mission && e.state !== "dead" && e.state !== "combat");
    if (!p.crouch && p.crouchT < 0.5) inp.crouchKey = true;
    S.crouch = true;
    const sees = (e) => {
      const d = dist(e.x, e.z, p.x, p.z);
      const facing = Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw)) < 1.2;
      return facing && d < e.def.detect * 0.8 && lineOfSight(G.map, e.x, e.y + 1.6, e.z, p.x, p.y + 1, p.z);
    };
    const watcher = guards.find((e) => sees(e));
    if (watcher) {
      // break line of sight: back toward the last safe spot
      const home = step.retryAt || S.safeSpot || { x: p.x, z: p.z };
      moveToward(home.x, home.z, inp, false);
      inp.sprint = false;
      return true;
    }
    if (!guards.some(sees)) S.safeSpot = { x: p.x, z: p.z };
    // a guard close by with its back turned → take it down
    const prey = guards
      .filter((e) => dist(e.x, e.z, p.x, p.z) < 9 && Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw)) > 1.6)
      .sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0];
    if (prey) {
      const bx = prey.x - Math.sin(prey.yaw) * 1.0;
      const bz = prey.z - Math.cos(prey.yaw) * 1.0;
      moveToward(bx, bz, inp, false);
      inp.sprint = false;
      if (dist(p.x, p.z, prey.x, prey.z) < 1.9) {
        faceToward(prey.x, prey.y + 1, prey.z, 0);
        inp.melee = true;
      }
      return true;
    }
    // a guard close by but facing us → hold still and wait for it to turn
    if (guards.some((e) => dist(e.x, e.z, p.x, p.z) < 7)) {
      inp.mx = inp.mz = 0;
      return true;
    }
    return false; // otherwise creep on toward the objective (main logic, crouched)
  }

  /* ------------------------------------------------------------ main step */
  function step() {
    const inp = { mx: 0, mz: 0 };
    const P = G.P;
    const p = G.player;
    S.dodgeT -= 1 / 60;
    if (G.dialogue) {
      G.missions.dialogueNext();
      return inp;
    }
    if (G.cinematic) {
      const k = G.cinematic;
      G.cinematic = null;
      if (k !== "boss") G.missions.cinematicDone();
      return inp;
    }
    if (G.hack) {
      // solve along the puzzle's solution path
      let B = G.hack.B;
      for (const [r, c] of B.solution) B = hackPick(B, r, c);
      G.hack.B = B;
      G.missions.hackResult(B.status === "success");
      return inp;
    }
    if (p.dead) {
      S.deathT = (S.deathT || 0) + 1 / 60;
      if (S.deathT > 1) {
        S.deathT = 0;
        G.respawn();
        opts.onDeath?.();
      }
      return inp;
    }
    const A = G.missions.active;
    if (A?.failed) {
      G.missions.retry();
      return inp;
    }
    if (!A) return inp;
    const step = A.step;
    if (step.type === "choice") {
      G.missions.choose("leak");
      return inp;
    }
    if (avoidHazards(inp)) {
      const vis = visibleEnemies();
      if (vis.length) {
        const keep = { mx: inp.mx, mz: inp.mz, sprint: inp.sprint, ctrl: inp.ctrl, jump: inp.jump };
        fight(inp, vis);
        Object.assign(inp, keep);
        inp.aim = false;
      }
      return inp;
    }
    if (S.crouch && step.type !== "objects" && !step.stealth) {
      if (p.crouch) inp.crouchKey = true;
      S.crouch = false;
    }
    // stealth steps
    if (step.stealth && stealth(inp, step)) return inp;
    if (!step.stealth && p.crouch && !G.hazards.some((h) => h.kind === "beam")) inp.crouchKey = true;
    const vis = visibleEnemies().filter(({ e, d }) => (e.state === "combat" || d < 20 || e.tag === A.data.tag || e.boss) && !(step.stealth && e.state !== "combat"));
    const holding = S.holdE > 0 && G.focus?.hold;
    if (vis.length && !(holding && vis[0].d > 12 && G.focus.obj.progress > G.focus.hold * 0.5)) {
      fight(inp, vis);
      return inp;
    }
    // reload while it's quiet
    if (G.wpn.stats && !G.wpn.stats.melee && G.mag < G.wpn.stats.mag * 0.6 && G.wpn.reloadT <= 0 && G.reserve(G.wpn.stats.ammo) > 0) inp.reload = true;
    if (p.hp < G.D.maxHp * 0.6 && (P.stacks.medkit || 0) > 1 && S.healT <= 0) {
      inp.heal = true;
      S.healT = 1.5;
    }
    S.healT -= 1 / 60;
    // objectives
    const marks = G.missions.markers().filter((m) => m.kind !== "enemy");
    let m = marks[0];
    if (step.type === "defend") {
      // stand at the defend point
      m = { x: step.at[0], z: step.at[1], kind: "defend" };
      const d = moveToward(step.at[0] + (step.protect ? -2 : 0), step.at[1] + (step.protect ? 2 : 0), inp);
      if (d < 1.5) inp.mx = inp.mz = 0;
      return inp;
    }
    if (!m) {
      // kill steps with no marker: go to the nearest tagged enemy
      const e = G.enemies.find((x) => x.tag === A.data.tag && x.state !== "dead") || (step.type === "boss" && G.boss);
      if (e) moveToward(e.x, e.z, inp);
      return inp;
    }
    if (m.kind === "area") {
      // search area: the clue object sits inside — look for it
      const c = Object.values(G.objects).find((o) => o.clue != null);
      if (c) m = { x: c.x, z: c.z, kind: "object" };
    }
    const d = moveToward(m.x, m.z, inp);
    const f = G.focus;
    if (d < 2.4 && f) {
      faceToward(f.x, (f.y || 0) + 1, f.z, 0);
      if (f.kind === "npc" || f.kind === "door" || (f.kind === "object" && !f.hold) || f.kind === "station") {
        if (S.eCd <= 0 || S.eCd == null) {
          inp.interactPressed = true;
          inp.interact = true;
          S.eCd = 0.5;
        }
      } else if (f.hold) {
        inp.interact = true;
        S.holdE = 1;
        inp.mx = inp.mz = 0;
      }
    } else S.holdE = 0;
    S.eCd = (S.eCd || 0) - 1 / 60;
    if (m.kind === "object" && d < 1.2) inp.mx = inp.mz = 0;
    return inp;
  }

  /* ------------------------------------------------------------ between contracts */
  function prepare() {
    const P = G.P;
    // skills
    for (let k = 0; k < 40 && P.sp > 0; k++) {
      const id = SKILL_ORDER.find((s) => canLearn(P, s).ok);
      if (!id) break;
      learnSkill(P, id);
    }
    const shops = { market: ["kenji", "marta", "rhee", "nan"], industrial: ["ozzy"], corporate: ["vale"] }[G.districtId] || [];
    const D = derive(P);
    const scoreW = (id, rar) => {
      const st = weaponStats({ id, rarity: rar, level: 0 }, D);
      return (st.dmg * st.pellets * st.rpm) / 60;
    };
    for (const sh of shops) {
      for (const e of shopStock(sh, P)) {
        if (!canBuy(P, e).ok) continue;
        if (e.kind === "weapon" && !WEAPONS[e.id].melee) {
          const cur = ["w1", "w2"].map((s) => weaponByUid(P, P.equip[s])).filter(Boolean);
          const worst = cur.length < 2 ? null : cur.sort((a, b) => scoreW(a.id, a.rarity) - scoreW(b.id, b.rarity))[0];
          const better = cur.length < 2 || scoreW(e.id, e.rarity || "common") > scoreW(worst.id, worst.rarity) * 1.25;
          if (better && P.credits > Math.max(1200, 0) && WEAPONS[e.id].ammo !== "pistol") {
            buy(P, e);
            const w = P.weapons[P.weapons.length - 1];
            equipWeapon(P, w.uid, cur.length < 2 ? "w2" : P.equip.w1 === worst?.uid ? "w1" : "w2");
            // keep the unlimited pistol in slot 1 if nothing else has ammo
          }
        }
        if (e.kind === "armor") {
          const a = ARMOR[e.id];
          const cur = armorByUid(P, P.equip[a.slot]);
          if (!cur || ARMOR[cur.id].armor < a.armor) {
            if (buy(P, e).ok) equipArmor(P, P.armors[P.armors.length - 1].uid);
          }
        }
        if (e.kind === "cyber" && ["shield", "emp", "optical", "skeleton", "synaptic", "biomon", "titanium", "neural"].includes(e.id) && P.credits > CYBERCOST(e.id) + 600) buy(P, e);
      }
      // ammo for carried weapons, medkits
      for (let k = 0; k < 6; k++)
        for (const e of shopStock(sh, P)) {
          if (e.kind === "ammo") {
            const need = ["w1", "w2"].some((s) => {
              const w = weaponByUid(P, P.equip[s]);
              return w && WEAPONS[w.id].ammo && !AMMO[WEAPONS[w.id].ammo].unlimited && `ammo${cap(WEAPONS[w.id].ammo)}` === e.id && (P.ammo[WEAPONS[w.id].ammo] || 0) < AMMO[WEAPONS[w.id].ammo].max * 0.6;
            });
            if (need && P.credits > 300) buy(P, e);
          }
          if (e.kind === "stack" && e.id === "medkit" && (P.stacks.medkit || 0) < 6 && P.credits > 200) buy(P, e);
          if (e.kind === "stack" && e.id === "trauma" && (P.stacks.trauma || 0) < 2 && P.credits > 1500) buy(P, e);
        }
    }
    // shield/EMP as the active
    if (P.cyber.owned.includes("emp") && G.districtId === "industrial") P.cyber.equipped.os = "emp";
    else if (P.cyber.owned.includes("shield")) P.cyber.equipped.os = "shield";
    G.refreshStats();
    G.player.hp = G.D.maxHp;
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const CYBERCOST = (id) => ({ shield: 1500, emp: 2600, optical: 1200, skeleton: 1800, synaptic: 900, biomon: 2000, titanium: 3600, neural: 3400 })[id] || 9999;

  void nearestWalkable;
  void RARITY_MULT;
  return { step, prepare, S };
}
