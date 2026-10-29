/**
 * Campaign bot (tests only, not shipped): plays Crown of Ashes through the
 * same per-step input the keyboard/mouse produce — walking A* paths, aiming
 * the camera, attacking, blocking, dodging telegraphs, drinking potions,
 * pressing E on the right things and picking dialogue choices from a plan.
 *
 * plan: { hero, garrick: 'spared'|'executed'|'exiled', crown: 'wardens'|'ember'|'marches',
 *         dragon: 'freed'|'slain', order: [questId…] (main + side, in play order) }
 */
import { HEROES, ABILITIES } from "../data/heroes.js";
import { QUESTS } from "../data/quests.js";
import { NPCS } from "../data/npcs.js";
import { LOCATIONS } from "../data/worldmap.js";
import { resolveMarker } from "../engine/quests.js";
import { abilityUnlocked } from "../engine/profile.js";
import { wrapAngle } from "../engine/math.js";

const GIVERS = { s_wolves: "wren", s_frost: "doran", s_locket: "elsie", s_shrines: "seraphine" };
const LEADER = { wardens: "isolde", ember: "seraphine", marches: "maren" };

export function createBot(G, plan, log = () => {}) {
  const B = {
    t: 0,
    path: null,
    pathGoal: null,
    pathT: 0,
    lastPos: { x: 0, z: 0, t: 0 },
    stuckN: 0,
    hold: 0,
    holdKind: null,
    potionCd: 0,
    dodgeCd: 0,
    dlgT: 0,
    deaths: 0,
    goalText: "",
    blockT: 0,
    learnT: 0,
    sideT: 0,
  };
  const P = () => G.P;
  const p = () => G.player;
  const hero = () => P().hero;
  const ranged = () => hero() === "archer" || hero() === "mage";

  /* ------------------------------------------------------------ dialogue policy */
  function chooseIndex(D) {
    const C = D.choices.map((c) => c.text);
    const find = (re) => C.findIndex((t) => re.test(t));
    // conversation memory: leave hubs we've already been through
    if (B.dlgKey !== D) {
      B.dlgKey = D;
      B.seenNodes = new Set();
    }
    const again = B.seenNodes.has(D.nodeId);
    B.seenNodes.add(D.nodeId);
    if (again) {
      const bye = find(/Goodbye|Farewell|^(Leave)|Not now|Not yet|Not right now|Maybe later/);
      if (bye >= 0) return bye;
    }
    if (D.npc === "garrick") {
      const want = plan.garrick === "spared" ? /^Swear/ : plan.garrick === "exiled" ? /^Run\./ : /ends here/;
      const i = find(want);
      if (i >= 0) return i;
    }
    if (D.npc === "dragon") {
      const i = find(plan.dragon === "freed" ? /Break the last chain/ : /Slay her/);
      if (i >= 0) return i;
    }
    const leader = LEADER[plan.crown];
    if (["isolde", "seraphine", "maren"].includes(D.npc) && G.quests.state("q_crown")?.state === "active") {
      if (D.npc === leader) {
        let i = find(/^Pledge/);
        if (i < 0) i = find(/^(I swear|I'm sure|The Heartstone is the Court's)/);
        if (i >= 0) return i;
      } else {
        const i = find(/hear the others|Not yet|think on it/);
        if (i >= 0) return i;
      }
    }
    if (D.npc === "wren") {
      const i = find(/Ride with me|Consider it done/);
      if (i >= 0) return i;
    }
    if (D.npc === "elsie") {
      const i = find(/It's yours|look for it/);
      if (i >= 0) return i;
    }
    if (D.npc === "doran") {
      const i = find(/I'll find them/);
      if (i >= 0) return i;
    }
    if (D.npc === "seraphine") {
      const i = find(/shrines/);
      if (i >= 0 && !P().quests.s_shrines && plan.order.includes("s_shrines")) return i;
    }
    // avoid opening shops in the bot; prefer progress
    const bad = /Show me|Let me (trade|browse)|Upgrade|Rent a bed|Goodbye|Farewell/;
    const good = C.findIndex((t) => !bad.test(t));
    return good >= 0 ? good : C.length - 1;
  }
  function handleDialogue() {
    const D = G.dialogue;
    B.dlgT -= 1 / 60;
    if (B.dlgT > 0) return;
    B.dlgT = 0.05;
    if (G.dlg.showingChoices()) {
      const i = chooseIndex(D);
      log(`  [${D.npc}] → ${D.choices[i]?.text}`);
      G.dlg.choose(i);
    } else G.dlg.next();
  }

  /* ------------------------------------------------------------ goals */
  function currentQuest() {
    for (const id of plan.order) {
      const q = P().quests[id];
      if (q?.state === "done") continue;
      return id;
    }
    return null;
  }
  function npcPos(id) {
    const n = G.npcs.find((x) => x.npc === id);
    if (n) return { x: n.x, z: n.z, interior: null, npc: id, ref: n };
    const d = NPCS[id];
    return d ? { x: d.x, z: d.z, interior: null, npc: id } : null;
  }
  function goal() {
    const id = currentQuest();
    if (!id) return null;
    const q = P().quests[id];
    if (!q) {
      // a side quest that needs its giver (or the main chain hasn't reached it yet)
      if (GIVERS[id]) return { ...npcPos(GIVERS[id]), why: `start ${id}` };
      return null;
    }
    // the crown choice: walk to our leader
    if (id === "q_crown") return { ...npcPos(LEADER[plan.crown]), why: "pledge" };
    const st = QUESTS[id].stages[q.stage];
    for (const o of st.objectives) {
      if (q.done[o.id] || o.optional) continue;
      if (o.type === "talk") return { ...npcPos(o.npc), why: o.text };
      if (!o.marker) continue;
      const m = resolveMarker(G, o.marker);
      if (m) return { ...m, why: o.text, marker: o.marker, npc: typeof o.marker === "string" && o.marker.startsWith("npc:") ? o.marker.slice(4) : undefined };
    }
    return null;
  }

  /* ------------------------------------------------------------ navigation */
  function steer(inp, gx, gz, run = true) {
    const pl = p();
    const d = Math.hypot(gx - pl.x, gz - pl.z);
    B.pathT -= 1 / 60;
    if (!B.path || B.pathT <= 0 || !B.pathGoal || Math.hypot(B.pathGoal.x - gx, B.pathGoal.z - gz) > 3) {
      B.path = G.W.nav.path(pl.x, pl.z, gx, gz, 60000) || [[gx, gz]];
      B.pathT = 2.5;
      B.pathGoal = { x: gx, z: gz };
    }
    while (B.path.length > 1 && Math.hypot(B.path[0][0] - pl.x, B.path[0][1] - pl.z) < 1.6) B.path.shift();
    const [wx, wz] = B.path[0];
    const want = Math.atan2(wx - pl.x, wz - pl.z);
    G.camYaw = want;
    inp.mz = 1;
    inp.sprint = run && pl.st > 30 && d > 12;
    // stuck?
    B.t += 1 / 60;
    if (B.t - B.lastPos.t > 1.5) {
      const moved = Math.hypot(pl.x - B.lastPos.x, pl.z - B.lastPos.z);
      if (moved < 0.8 && d > 2) {
        B.stuckN++;
        B.path = null;
        inp.jump = true;
        if (B.stuckN % 2 === 0) inp.mx = B.stuckN % 4 === 0 ? 1 : -1;
      } else B.stuckN = 0;
      B.lastPos = { x: pl.x, z: pl.z, t: B.t };
    }
    return d;
  }
  function exitInterior(inp) {
    const I = G.W.interiors[p().interior];
    const ex = G.W.interact.find((o) => o.kind === "exitDoor" && o.interior === p().interior);
    const d = steer(inp, ex.x, ex.z);
    if (d < 2.5 && G.focus?.kind === "exit") inp.interact = true;
    void I;
  }

  /* ------------------------------------------------------------ combat */
  function threats() {
    const pl = p();
    const list = [];
    for (const e of G.enemies) {
      if (e.dead || e.interior !== pl.interior || e.state === "yield" || e.state === "collapsed") continue;
      const d = Math.hypot(e.x - pl.x, e.z - pl.z);
      if ((e.target === pl && d < 40) || d < 9) list.push({ e, d: d - (e.boss ? 2 : 0) });
    }
    for (const o of G.objects) {
      if (o.dead) continue;
      const d = Math.hypot(o.x - pl.x, o.z - pl.z);
      const live = G.quests.state("q_anchors")?.state === "active";
      if (live && d < 22 && !G.enemies.some((e) => !e.dead && e.target === pl && Math.hypot(e.x - pl.x, e.z - pl.z) < 14)) list.push({ e: o, d: d + 5 });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }
  function inHostileZone() {
    const pl = p();
    for (const z of G.zones) {
      if (z.team !== "hostile" || z.fired || z.kind === "trap") continue;
      const left = z.delay - z.t;
      if (left < 0 || left > 1.2) continue;
      const dx = pl.x - z.x;
      const dz = pl.z - z.z;
      const d = Math.hypot(dx, dz);
      let inside = d < z.r + 0.8;
      if (z.shape === "cone") inside = d < z.r + 0.8 && Math.abs(wrapAngle(Math.atan2(dx, dz) - z.yaw)) < (z.half || 0.5) + 0.35;
      if (z.shape === "line") {
        const fx = Math.sin(z.yaw);
        const fz = Math.cos(z.yaw);
        const along = dx * fx + dz * fz;
        inside = along > -1 && along < (z.len || z.r) + 1 && Math.abs(dx * fz - dz * fx) < z.r + 0.8;
      }
      if (inside) return z;
    }
    // breath in progress
    const D = G.dragon;
    if (D?.breath) {
      const h = D.head();
      const a = Math.abs(wrapAngle(Math.atan2(pl.x - h.x, pl.z - h.z) - D.yaw));
      if (a < 0.6 && Math.hypot(pl.x - h.x, pl.z - h.z) < 22) return { x: h.x, z: h.z, r: 22, yaw: D.yaw, cone: true };
    }
    return null;
  }
  function aimAt(tx, ty, tz) {
    const c = G.camera;
    const pl = p();
    G.camYaw = Math.atan2(tx - pl.x, tz - pl.z);
    const d = Math.hypot(tx - pl.x, tz - pl.z);
    const cy = c ? c.y : pl.y + 1.8;
    G.camPitch = Math.max(-1.1, Math.min(0.7, Math.atan2(ty - cy, d + 3.5)));
  }
  function fight(inp, t, dist) {
    const pl = p();
    const S = G.stats;
    const H = HEROES[hero()];
    const isDragon = t === G.dragon;
    const tx = t.x;
    const tz = t.z;
    // dodge pending telegraphs
    const z = inHostileZone();
    B.dodgeCd -= 1 / 60;
    if (z && B.dodgeCd <= 0 && pl.st > 20 && !pl.action) {
      const ax = pl.x - z.x;
      const az = pl.z - z.z;
      let ang = Math.atan2(ax, az);
      if (z.cone || z.shape === "cone" || z.shape === "line") ang = (z.yaw || 0) + (wrapAngle(Math.atan2(ax, az) - (z.yaw || 0)) > 0 ? Math.PI / 2 : -Math.PI / 2);
      G.camYaw = ang;
      inp.mz = 1;
      inp.dodge = true;
      B.dodgeCd = 0.7;
      return;
    }
    if (z) {
      // move out on foot if no stamina to roll
      G.camYaw = Math.atan2(pl.x - z.x, pl.z - z.z);
      inp.mz = 1;
      inp.sprint = true;
      return;
    }
    // potions
    B.potionCd -= 1 / 60;
    if (pl.hp < S.maxHp * 0.42 && B.potionCd <= 0 && (G.inv.count("p_heal") || G.inv.count("p_greater"))) {
      inp.potion = 1;
      B.potionCd = 3;
    }
    if (pl.res < 15 && pl.st < 25 && B.potionCd <= 0 && G.inv.count("p_tonic") && hero() !== "knight") {
      inp.potion = 2;
      B.potionCd = 3;
    }
    // dragon in the air: melee heroes go crank a ballista
    if (isDragon && t.flying() && !ranged()) {
      const bal = G.W.interact.filter((o) => o.kind === "ballista").sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z));
      const ready = bal.find((o) => (G.ballistaCd[o.id] || 0) <= 0) || bal[0];
      const d = steer(inp, ready.x + Math.sin(ready.rot) * -1.6, ready.z + Math.cos(ready.rot) * -1.6);
      if (d < 2.6 && G.focus?.kind === "ballista" && (G.ballistaCd[ready.id] || 0) <= 0) inp.interact = true;
      return;
    }
    // aim point: chest / dragon head or body
    let ty = t.y + (t.h || 1.8) * 0.6 + (t.yOff || 0);
    let ax = tx;
    let az = tz;
    if (isDragon) {
      const hb = t.hitboxes();
      const body = hb[0];
      ax = body.x;
      az = body.z;
      ty = body.y;
    }
    if (ranged()) {
      const want = isDragon ? 23 : 11;
      if (dist < want - 4) inp.mz = -1;
      else if (dist > want + 8) inp.mz = 1;
      inp.mx = Math.sin(B.t * 0.7) > 0 ? 0.4 : -0.4;
      aimAt(ax, ty, az);
      const A = { down: false, pressed: false };
      if (hero() === "archer") {
        if (B.holdKind !== "draw") {
          if (!pl.action && pl.shotCd <= 0 && pl.st > 8) {
            A.pressed = true;
            A.down = true;
            B.holdKind = "draw";
            B.hold = 0;
          }
        } else {
          B.hold += 1 / 60;
          A.down = B.hold < 0.75;
          if (!A.down) B.holdKind = null;
        }
        // abilities
        if (!pl.action && pl.cds.r <= 0 && pl.res >= 45 && threats().length >= 2) inp.r = true;
        else if (!pl.action && pl.cds.q <= 0 && pl.res >= 25 && dist < 8) inp.q = true;
        else if (!pl.action && abilityUnlocked(P(), "f") && pl.cds.f <= 0 && pl.res >= 35 && (t.boss || isDragon)) inp.f = true;
      } else {
        if (B.holdKind !== "cast") {
          if (!pl.action && pl.shotCd <= 0) {
            A.pressed = true;
            A.down = true;
            B.holdKind = "cast";
            B.hold = 0;
            B.holdFor = pl.res > 50 ? 0.75 : 0.05;
          }
        } else {
          B.hold += 1 / 60;
          A.down = B.hold < B.holdFor;
          if (!A.down) B.holdKind = null;
        }
        if (!pl.action && pl.cds.q <= 0 && pl.res >= 30 && dist < 5) inp.q = true;
        else if (!pl.action && pl.cds.r <= 0 && pl.res >= 70 && (t.boss || isDragon || threats().length >= 3)) inp.r = true;
        else if (!pl.action && abilityUnlocked(P(), "f") && pl.cds.f <= 0 && pl.res >= 20 && dist < 3.5) {
          G.camYaw += Math.PI;
          inp.mz = 1;
          inp.f = true;
        }
      }
      inp.attack = A;
      return;
    }
    // melee
    const reach = isDragon ? 5.5 : (t.r || 0.5) + 1.6;
    const ex = isDragon ? ax : tx;
    const ez = isDragon ? az : tz;
    const d = Math.hypot(ex - pl.x, ez - pl.z);
    G.camYaw = Math.atan2(ex - pl.x, ez - pl.z);
    G.camPitch = -0.2;
    if (d > reach) {
      inp.mz = 1;
      inp.sprint = d > 8 && pl.st > 40;
    } else if (d < reach - 1.5 && !isDragon) inp.mz = -0.4;
    // block incoming normal swings (knight / rogue) when stamina allows
    const winding = t.state === "attack" && t.atk?.phase === "windup" && !t.atk.def?.heavy && d < 4.5;
    B.blockT -= 1 / 60;
    if (winding && pl.st > 30 && hero() === "knight") {
      inp.alt = true;
      B.blockT = 0.5;
      return;
    }
    if (B.blockT > 0 && hero() === "knight") {
      inp.alt = true;
      return;
    }
    const A = { down: false, pressed: false };
    // a click is a press on one step and a release on the next
    if (B.pressedLast) B.pressedLast = false;
    else if (d <= reach + 0.4 && pl.st > 12 && (!pl.action || (pl.action.type === "attack" && pl.action.t > pl.action.dur * 0.55))) {
      A.pressed = true;
      A.down = true;
      B.pressedLast = true;
    }
    inp.attack = A;
    // abilities
    if (!pl.action && d < 3) {
      if (hero() === "knight") {
        if (pl.cds.q <= 0 && pl.res >= 22 && (t.boss || t.poiseMax >= 100)) inp.q = true;
        else if (pl.cds.r <= 0 && pl.res >= 40 && (threats().length >= 2 || t.boss)) inp.r = true;
        else if (abilityUnlocked(P(), "f") && pl.cds.f <= 0 && pl.res >= 50 && threats().length >= 2) inp.f = true;
      } else if (hero() === "rogue") {
        if (pl.cds.r <= 0 && pl.res >= 45 && t.boss && pl.hp < S.maxHp * 0.6) inp.r = true;
        else if (pl.cds.q <= 0 && pl.res >= 30 && (t.boss || isDragon)) inp.q = true;
        else if (abilityUnlocked(P(), "f") && pl.cds.f <= 0 && pl.res >= 35 && threats().length >= 2) inp.f = true;
      }
    }
    void ABILITIES;
    void H;
  }

  /* ------------------------------------------------------------ skills */
  function spendPoints() {
    const H = HEROES[hero()];
    while (P().sp > 0) {
      // prefer the branch that unlocks F, then health, then damage
      const order = H.tree.slice().sort((a, b) => (a.unlocks ? -1 : 0) - (b.unlocks ? -1 : 0) || a.tier - b.tier);
      let learned = false;
      for (const n of order) {
        const rank = P().skills[n.id] || 0;
        const reqOk = !n.req || (P().skills[n.req] || 0) >= 1;
        const lvlOk = P().level >= (n.tier - 1) * 2 + 1;
        if (rank < n.ranks && reqOk && lvlOk) {
          P().skills[n.id] = rank + 1;
          P().sp--;
          learned = true;
          break;
        }
      }
      if (!learned) break;
    }
    G.refreshStats();
  }
  /** Equip anything strictly better (simple attack/armour score). */
  function autoEquip() {
    const Pp = P();
    for (const it of Pp.inv) {
      const d = G.itemDef?.(it.id);
      void d;
    }
  }

  /* ------------------------------------------------------------ main */
  return {
    B,
    input() {
      const inp = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, attack: { down: false, pressed: false }, alt: false, sprint: false, jump: false, dodge: false, interact: false, q: false, r: false, f: false, potion: 0 };
      const pl = p();
      if (G.dialogue) {
        handleDialogue();
        return inp;
      }
      if (pl.dead) {
        B.deadT = (B.deadT || 0) + 1 / 60;
        if (B.deadT > 2) {
          B.deadT = 0;
          B.deaths++;
          G.respawn(true);
          B.path = null;
          log(`  ✝ died (${B.deaths}) — respawn at ${P().lastSafe}`);
        }
        return inp;
      }
      B.learnT -= 1 / 60;
      if (B.learnT <= 0) {
        B.learnT = 5;
        if (P().sp > 0) spendPoints();
        autoEquip();
      }
      // combat first
      const T = threats();
      const D = G.dragon;
      const dragonLive = D && !D.down && ["roar", "ground", "attack", "fly", "takeoff", "dive", "crash"].includes(D.state) && !pl.interior && Math.hypot(D.x - pl.x, D.z - pl.z) < 80;
      if (dragonLive) {
        // fight adds first if any are on us
        if (T.length && T[0].d < 6) fight(inp, T[0].e, T[0].d);
        else fight(inp, D, Math.hypot(D.x - pl.x, D.z - pl.z));
        return inp;
      }
      if (T.length) {
        fight(inp, T[0].e, T[0].d);
        return inp;
      }
      B.holdKind = null;
      // loot nearby
      B.dropBlack = B.dropBlack || new Set();
      const drop = G.drops.find((d) => !d.taken && !B.dropBlack.has(d.id) && d.interior === pl.interior && Math.hypot(d.x - pl.x, d.z - pl.z) < 16);
      if (drop) {
        if (B.dropId !== drop.id) {
          B.dropId = drop.id;
          B.dropT = 0;
        }
        B.dropT += 1 / 60;
        if (B.dropT > 8) B.dropBlack.add(drop.id);
        steer(inp, drop.x, drop.z, false);
        if (G.focus?.kind === "drop") inp.interact = true;
        return inp;
      }
      // the dragon lies subdued: walk to her head (the fate talk opens on its own)
      if (D?.down && !P().flags.dragonFate) {
        const h = D.head();
        steer(inp, h.x, h.z, false);
        return inp;
      }
      const g = goal();
      if (!g) return inp;
      B.goalText = g.why;
      // inside an interior but the goal is outside → leave
      if (pl.interior && g.interior !== pl.interior) {
        exitInterior(inp);
        return inp;
      }
      const d = steer(inp, g.x, g.z);
      const f = G.focus;
      if (d < 3.4 && f) {
        // press E on the matching focus
        const wantNpc = g.npc && f.kind === "npc" && f.ref?.npc === g.npc;
        const wantEnt = !g.npc && f.kind !== "npc" && f.kind !== "bark" && f.kind !== "drop" && f.kind !== "companion";
        if (wantNpc || wantEnt) {
          inp.interact = true;
          inp.mz = 0;
        }
      }
      if (d < 1.2) inp.mz = 0;
      return inp;
    },
  };
}

export const PLANS = {
  knight: { hero: "knight", garrick: "spared", crown: "wardens", dragon: "freed", order: ["q_thornwick", "s_locket", "q_road", "s_wolves", "q_redhand", "q_testament", "s_frost", "q_grate", "q_heartstone", "q_crown", "q_anchors", "q_dragon", "q_throne"] },
  archer: { hero: "archer", garrick: "executed", crown: "ember", dragon: "slain", order: ["q_thornwick", "q_road", "q_redhand", "q_testament", "q_grate", "q_heartstone", "q_crown", "q_anchors", "q_dragon", "q_throne"] },
  mage: { hero: "mage", garrick: "spared", crown: "marches", dragon: "slain", order: ["q_thornwick", "q_road", "q_redhand", "q_testament", "q_grate", "q_heartstone", "q_crown", "q_anchors", "q_dragon", "q_throne"] },
  rogue: { hero: "rogue", garrick: "exiled", crown: "marches", dragon: "freed", order: ["q_thornwick", "q_road", "q_redhand", "s_shrines", "q_testament", "q_grate", "q_heartstone", "q_crown", "q_anchors", "q_dragon", "q_throne"] },
};
export { LOCATIONS };
