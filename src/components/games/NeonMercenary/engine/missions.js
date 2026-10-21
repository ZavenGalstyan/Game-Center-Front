/**
 * Mission runtime: runs the step lists in data/contracts.js against the Game.
 *
 * Persistence: profile.story.active = {id, checkpoint} — a mission always
 * resumes from its last checkpoint (entities re-spawn, quest items given by
 * later steps are restored), so a reload can never soft-lock a contract.
 * Failure (death, alarm, timer, protected NPC down) offers a retry from the
 * same checkpoint; abandoning lets the player re-accept at a terminal.
 */
import { CONTRACTS, CONTRACT_BY_ID } from "../data/contracts.js";
import { DIALOGUE } from "../data/story.js";
import { DISTRICTS } from "../data/districts/index.js";
import { STACKS } from "../data/items.js";
import { WEAPONS } from "../data/weapons.js";
import { addXp, addCredits, addStack, takeStack, addWeapon } from "./profile.js";
import { dist, yawOf, wrapAngle } from "./math.js";
import { lineOfSight, nearestWalkable, setGate } from "./map.js";
import { newBreach } from "./hack.js";

const stepTag = (m, i) => `m${m.def.id}s${i}`;

export function createMissions(G) {
  const M = {
    active: null, // runtime of the running contract
    suspended: null, // contract id waiting for the player to return to its district
  };
  const P = () => G.P;

  /* ------------------------------------------------------------ availability */
  M.nextId = () => {
    const done = new Set(P().story.done);
    for (const c of CONTRACTS) if (!done.has(c.id)) return c.id;
    return null;
  };
  M.available = () => {
    const id = M.nextId();
    if (!id) return [];
    const c = CONTRACT_BY_ID[id];
    return [{ id, title: c.title, district: c.district, here: c.district === G.districtId, brief: c.brief, location: c.location, rewards: c.rewards, giver: c.giver }];
  };
  M.isActive = () => !!P().story.active;

  /* ------------------------------------------------------------ start / resume */
  M.start = (id) => {
    const c = CONTRACT_BY_ID[id];
    if (!c || P().story.done.includes(id)) return { ok: false, msg: "Unavailable." };
    if (M.nextId() !== id) return { ok: false, msg: "Finish the current contract first." };
    if (P().story.active && P().story.active.id !== id) return { ok: false, msg: "You already have an active contract." };
    if (c.district !== G.districtId) return { ok: false, msg: `This contract is in the ${DISTRICTS[c.district].name}.` };
    P().story.active = { id, checkpoint: 0, items: snapshotQuest() };
    if (c.start) M.dialogue(c.start);
    run(c, 0, true);
    G.emit({ type: "missionStart", id, title: c.title, brief: c.brief });
    return { ok: true };
  };
  function snapshotQuest() {
    const out = {};
    for (const [k, v] of Object.entries(P().stacks)) if (STACKS[k]?.cat === "quest") out[k] = v;
    return out;
  }
  function restoreQuest(snap) {
    for (const k of Object.keys(P().stacks)) if (STACKS[k]?.cat === "quest") delete P().stacks[k];
    for (const [k, v] of Object.entries(snap || {})) P().stacks[k] = v;
  }

  function run(def, stepI, fresh) {
    G.clearMissionEntities();
    M.active = { def, stepI: -1, step: null, t: 0, failed: null, data: {} };
    M.suspended = null;
    // gates opened by earlier steps stay open on resume
    for (let i = 0; i < stepI; i++) for (const g of def.steps[i].open || []) setGate(G.map, g, true);
    enter(stepI, fresh);
  }

  M.onDistrict = (id) => {
    const a = P().story.active;
    M.active = null;
    M.suspended = null;
    if (!a) return;
    const def = CONTRACT_BY_ID[a.id];
    if (!def) {
      P().story.active = null;
      return;
    }
    if (def.district !== id) {
      M.suspended = a.id;
      return;
    }
    restoreQuest(a.items);
    run(def, a.checkpoint || 0, false);
  };

  /* ------------------------------------------------------------ steps */
  function enter(i, fresh = true) {
    const A = M.active;
    const def = A.def;
    if (i >= def.steps.length) return complete();
    const s = def.steps[i];
    A.stepI = i;
    A.step = s;
    A.t = 0;
    A.data = { tag: stepTag(A, i), done: new Set(), waves: 0, triggers: 0, progress: 0, clue: 0 };
    if (s.checkpoint) {
      P().story.active.checkpoint = i;
      P().story.active.items = snapshotQuest();
      G.emit({ type: "checkpoint" });
    }
    for (const g of s.open || []) setGate(G.map, g, true);
    if (s.flag) P().story.flags[s.flag] = true;
    for (const [k, n] of Object.entries(s.give || {})) addStack(P(), k, n);
    if (s.spawn) spawnList(s.spawn, A.data.tag);
    if (s.type === "collect") for (const pk of s.pickups || []) G.spawnPickup({ kind: "stack", item: pk.item, amount: 1, x: pk.at[0], z: pk.at[1], y: pk.y || 0, mission: true, exact: true, big: true });
    if (s.type === "objects") s.targets.forEach((t, k) => (!s.order || k === 0) && addObject(t));
    if (s.type === "hack") addObject({ ...s.target, hold: 0.6, breach: true });
    if (s.type === "search") addClue(0);
    if (s.type === "boss") {
      G.spawnBoss(s.boss, s.at[0], s.at[1], s.arena);
      G.emit({ type: "cinematic", scene: "boss", boss: s.boss });
    }
    if (s.type === "defend" && s.protect) {
      const n = G.npcs.find((x) => x.id === s.protect.npc) || addNpc(s.protect.npc);
      n.x = s.protect.at[0];
      n.z = s.protect.at[1];
      n.home = { x: n.x, z: n.z, yaw: 0 };
      n.hp = n.maxHp = s.protect.hp;
      n.protected = true;
      n.anim = "Interact";
      n.hidden = false;
    }
    if (s.zones) for (const z of s.zones) G.hazards.push({ id: `zone:${z.id}`, kind: "zone", x0: z.x0, z0: z.z0, x1: z.x1, z1: z.z1, warn: 0, life: 1e9, t: 0, dps: z.dps, ground: false, color: "#7dff3a", mission: true, clear: z.clear });
    if (s.cameras) A.data.cams = s.cameras.map((c, k) => ({ ...c, k, detect: 0, cool: 0, cur: c.yaw }));
    if (s.dialogue && fresh && !["scene", "talk", "deliver"].includes(s.type)) M.dialogue(s.dialogue);
    if (s.type === "scene") M.dialogue(s.dialogue, () => advance());
    if (s.type === "cinematic") G.emit({ type: "cinematic", scene: s.scene });
    if (s.type === "choice") G.emit({ type: "ui", open: "choice" });
    if (s.say) G.say(s.say[0], s.say[1]);
    G.emit({ type: "objective", text: M.objectiveText() });
  }
  function addNpc(id) {
    const n = { id, x: 0, z: 0, yaw: 0, def: { name: id }, home: { x: 0, z: 0, yaw: 0 }, talkT: 0, anim: "Idle" };
    G.npcs.push(n);
    return n;
  }
  function spawnList(list, tag) {
    for (const sp of list) {
      let x = sp.at[0];
      let z = sp.at[1];
      if (x === 0 && z === 0) {
        // "near the player" (alarm reinforcements)
        const a = G.rand() * Math.PI * 2;
        x = G.player.x + Math.sin(a) * 14;
        z = G.player.z + Math.cos(a) * 14;
      }
      G.spawnEnemy(sp.t, x, z, { tag, route: sp.route, hold: sp.hold, alert: sp.alert, drop: sp.drop, yaw: sp.yaw, hpMul: sp.hpMul });
    }
  }
  function addObject(t) {
    const A = M.active;
    G.objects[t.id] = { ...t, x: t.at[0], z: t.at[1], y: t.y || 0, active: true, interact: true, progress: 0, step: A.stepI, r: t.r || 2.1, spawnT: t.spawner ? t.spawner.every * 0.5 : 0 };
  }
  function addClue(k) {
    const s = M.active.step;
    const c = s.clues[k];
    if (!c) return;
    M.active.data.clue = k;
    G.objects[c.id] = { id: c.id, x: c.at[0], z: c.at[1], y: 0, label: c.label, hold: 1.2, active: true, interact: true, progress: 0, clue: k, r: 2 };
  }
  function advance() {
    const A = M.active;
    if (!A) return;
    const s = A.step;
    if (s?.after?.give) for (const [k, n] of Object.entries(s.after.give)) addStack(P(), k, n);
    if (s?.after?.flag) P().story.flags[s.after.flag] = true;
    // objects of a finished step disappear
    for (const [id, o] of Object.entries(G.objects)) if (o.step === A.stepI || o.clue != null) delete G.objects[id];
    G.hazards = G.hazards.filter((h) => !h.mission);
    enter(A.stepI + 1);
  }

  function complete() {
    const A = M.active;
    const def = A.def;
    const Pr = P();
    const r = def.rewards || {};
    const lv = addXp(Pr, r.xp || 0);
    addCredits(Pr, r.credits || 0);
    for (const [k, n] of Object.entries(r.stacks || {})) addStack(Pr, k, n);
    let item = null;
    if (r.weapon) item = WEAPONS[addWeapon(Pr, r.weapon[0], r.weapon[1]).id].name;
    Pr.story.flags[`c${def.id}`] = true;
    for (const f of def.flags || []) Pr.story.flags[f] = true;
    if (def.unlock) Pr.unlocked[def.unlock] = true;
    for (const k of def.cleanup || []) delete Pr.stacks[k];
    for (const k of ["package", "shard", "fuse", "manifest", "clue"]) delete Pr.stacks[k]; // single-contract items
    Pr.story.done.push(def.id);
    Pr.story.active = null;
    M.active = null;
    if (lv) G.refreshStats();
    G.emit({ type: "missionComplete", id: def.id, title: def.title, xp: r.xp || 0, credits: r.credits || 0, stacks: r.stacks || {}, item, unlock: def.unlock || null, levels: lv, final: def.id === 20 });
    if (lv) G.emit({ type: "levelUp", level: Pr.level, sp: Pr.sp });
    const nx = M.nextId();
    if (nx) {
      const c = CONTRACT_BY_ID[nx];
      G.emit({ type: "nextContract", id: nx, title: c.title, district: c.district });
    }
  }

  M.abandon = () => {
    if (!P().story.active) return;
    const snap = P().story.active.items;
    G.clearMissionEntities();
    restoreQuest(snap);
    P().story.active = null;
    M.active = null;
    M.suspended = null;
    M.clearDialogue();
    G.emit({ type: "missionAbandoned" });
  };

  /* ------------------------------------------------------------ failure / retry */
  M.fail = (reason) => {
    const A = M.active;
    if (!A || A.failed) return;
    A.failed = reason;
    G.emit({ type: "missionFailed", reason, title: A.def.title });
  };
  M.onPlayerDeath = () => {
    if (M.active && !M.active.failed) M.active.failed = "death";
  };
  M.retryPoint = () => {
    const A = M.active;
    if (!A) return null;
    const ck = A.def.steps[P().story.active?.checkpoint ?? 0];
    return ck?.retryAt || null;
  };
  /** After the player respawned (or chose Retry): restart from the checkpoint. */
  M.onRespawn = () => {
    const A = M.active;
    if (!A || !A.failed) return;
    const a = P().story.active;
    restoreQuest(a.items);
    const ck = A.def.steps[a.checkpoint];
    for (const [k, n] of Object.entries(ck?.retryGive || {})) if ((P().stacks[k] || 0) < n) P().stacks[k] = n;
    M.clearDialogue();
    run(A.def, a.checkpoint, false);
  };
  M.retry = () => {
    const A = M.active;
    if (!A) return;
    const at = M.retryPoint();
    if (at) {
      const p = G.player;
      p.x = at.x;
      p.z = at.z;
      p.y = 0;
      p.vx = p.vy = p.vz = 0;
      p.safe = { x: at.x, z: at.z, y: 0 };
      G.camYaw = at.yaw ?? G.camYaw;
    }
    G.player.hp = Math.max(G.player.hp, G.D.maxHp * 0.6);
    for (const e of G.enemies) if (e.state === "combat") e.state = e.route ? "return" : "return";
    M.onRespawn();
  };

  /* ------------------------------------------------------------ dialogue */
  const queue = [];
  M.dialogue = (key, onDone) => {
    const lines = DIALOGUE[key];
    if (!lines) {
      onDone?.();
      return;
    }
    if (G.dialogue) {
      queue.push([key, onDone]);
      return;
    }
    G.dialogue = { key, lines, i: 0, onDone };
    G.emit({ type: "dialogue", key });
  };
  function endDialogue() {
    const d = G.dialogue;
    G.dialogue = null;
    G.emit({ type: "dialogueEnd", key: d.key });
    d.onDone?.();
    if (!G.dialogue && queue.length) {
      const [k, cb] = queue.shift();
      M.dialogue(k, cb);
    }
  }
  M.dialogueNext = () => {
    const d = G.dialogue;
    if (!d) return;
    d.i++;
    if (d.i >= d.lines.length) endDialogue();
  };
  M.dialogueSkip = () => {
    if (G.dialogue) endDialogue();
  };
  M.clearDialogue = () => {
    queue.length = 0;
    G.dialogue = null;
  };
  M.cinematicDone = () => {
    const A = M.active;
    if (A?.step?.type === "cinematic") advance();
  };
  M.choose = (opt) => {
    const A = M.active;
    if (A?.step?.type !== "choice") return;
    P().ending = opt;
    if (opt === "sell") addCredits(P(), 25000);
    advance();
  };

  /* ------------------------------------------------------------ hooks from the game */
  M.onTalk = (npcId) => {
    const A = M.active;
    if (!A || A.failed) return false;
    const s = A.step;
    if (s.type === "talk" && s.npc === npcId) {
      M.dialogue(s.dialogue, () => advance());
      return true;
    }
    if (s.type === "deliver" && s.npc === npcId) {
      const n = s.n || 1;
      if ((P().stacks[s.item] || 0) >= n) {
        takeStack(P(), s.item, n);
        M.dialogue(s.dialogue, () => advance());
      } else G.emit({ type: "notice", text: `You need ${n > 1 ? `${n}× ` : ""}${STACKS[s.item].name}.` });
      return true;
    }
    return false;
  };
  M.npcLabel = (npcId) => {
    const s = M.active?.step;
    if (!s || M.active.failed) return null;
    const n = G.npcs.find((x) => x.id === npcId);
    if ((s.type === "talk" || s.type === "deliver") && s.npc === npcId) return `${s.type === "deliver" ? "Hand over to" : "Talk to"} ${n?.def?.name || npcId} ◆`;
    return null;
  };
  M.onKill = (e) => {
    const A = M.active;
    if (!A) return;
    if (A.step.stealth && e.mission) {
      // a takedown is silent, but any other kill counts as being noticed nearby
    }
  };
  M.onBossDown = (id) => {
    const A = M.active;
    if (A?.step?.type === "boss" && A.step.boss === id) {
      A.data.bossDownT = A.t;
    }
  };
  M.onPickup = () => {};
  M.onObject = (o) => {
    const A = M.active;
    if (!A || A.failed) return;
    const s = A.step;
    if (o.breach) {
      if (A.data.hackCool > 0) {
        G.emit({ type: "notice", text: `Terminal locked out — ${Math.ceil(A.data.hackCool)} s` });
        return;
      }
      G.hack = { obj: o.id, B: newBreach(G.rand, s.tier || 1, G.D.hack) };
      G.emit({ type: "ui", open: "hack" });
      return;
    }
    if (o.clue != null) {
      const c = s.clues[o.clue];
      delete G.objects[o.id];
      addStack(P(), "clue", 1);
      if (c.flag) P().story.flags[c.flag] = true;
      G.emit({ type: "objectiveDone", text: `Clue ${o.clue + 1}/${s.clues.length}` });
      M.dialogue(c.dialogue, () => {
        if (o.clue + 1 < s.clues.length) addClue(o.clue + 1);
        else {
          delete P().stacks.clue;
          advance();
        }
      });
      return;
    }
    if (o.take) {
      for (const [k, n] of Object.entries(o.take))
        if ((P().stacks[k] || 0) < n) {
          G.emit({ type: "notice", text: `You need ${n > 1 ? `${n}× ` : ""}${STACKS[k].name}.` });
          return;
        }
      for (const [k, n] of Object.entries(o.take)) takeStack(P(), k, n);
    }
    o.active = false;
    delete G.objects[o.id];
    A.data.done.add(o.id);
    for (const [k, n] of Object.entries(o.give || {})) addStack(P(), k, n);
    if (o.note) G.say("Terminal", o.note, 4200);
    if (o.spawnOnDone) spawnList(o.spawnOnDone, A.data.tag);
    // hazard zones cleared by this object
    for (const h of G.hazards) if (h.clear === o.id) h.life = 0;
    G.emit({ type: "objectiveDone", text: o.label });
    const targets = s.targets || [];
    if (s.order) {
      const k = targets.findIndex((t) => t.id === o.id);
      if (targets[k + 1]) addObject(targets[k + 1]);
    }
    const allDone = targets.every((t) => A.data.done.has(t.id));
    if (o.dialogue) M.dialogue(o.dialogue, () => allDone && advance());
    else if (allDone) advance();
    else G.emit({ type: "objective", text: M.objectiveText() });
  };
  M.hackResult = (ok) => {
    const A = M.active;
    const h = G.hack;
    G.hack = null;
    if (!A || !h) return;
    if (ok) {
      A.data.done.add(h.obj);
      delete G.objects[h.obj];
      G.emit({ type: "hackDone", ok: true });
      advance();
    } else {
      A.data.hackCool = 5;
      G.emit({ type: "hackDone", ok: false });
      G.say("Terminal", "INTRUSION DETECTED — countermeasures deployed.");
      if (A.step.alarm) spawnList(A.step.alarm, A.data.tag);
    }
  };
  M.doorOpen = (d) => !d.flag || !!P().story.flags[d.flag];
  M.onDoor = (d) => {
    const A = M.active;
    if (A?.step?.type === "door" && A.step.door === d.id && !A.failed) advance();
  };
  M.onStation = () => {};

  /* ------------------------------------------------------------ per-frame */
  M.update = (dt) => {
    const A = M.active;
    if (!A || A.failed) return;
    const s = A.step;
    if (!s) return;
    A.t += dt;
    const p = G.player;
    const D = A.data;
    if (D.hackCool > 0) D.hackCool -= dt;
    // timer
    if (s.timer && A.t > s.timer) return M.fail("timer");
    // stealth: any enemy reaching combat = spotted
    if (s.stealth) for (const e of G.enemies) if (e.state === "combat" && e.mission) return M.fail("spotted");
    // area triggers
    if (s.triggers)
      s.triggers.forEach((tr, k) => {
        if (D.triggers & (1 << k)) return;
        const [x0, z0, x1, z1] = tr.area;
        if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
          D.triggers |= 1 << k;
          spawnList(tr.spawn, D.tag);
          if (tr.say) G.say(tr.say[0], tr.say[1]);
        }
      });
    // object spawners (rogue machines keep printing drones)
    for (const o of Object.values(G.objects)) {
      if (!o.spawner || !o.active) continue;
      o.spawnT -= dt;
      if (o.spawnT <= 0) {
        o.spawnT = o.spawner.every;
        const alive = G.enemies.filter((e) => e.spawnedBy === o.id && e.state !== "dead").length;
        if (alive < o.spawner.max) {
          const e = G.spawnEnemy(o.spawner.type, o.x + (G.rand() - 0.5) * 2, o.z + 2.5, { tag: D.tag, alert: dist(o.x, o.z, p.x, p.z) < 30 });
          e.spawnedBy = o.id;
          G.emit({ type: "spawnFx", x: e.x, y: 1.5, z: e.z, color: "#ff8a1f" });
        }
      }
    }
    // steam vents
    if (s.vents)
      for (const v of s.vents) {
        const ph = (A.t + v.off) % v.period;
        if (ph < dt) G.hazards.push({ id: `vent${v.x}${v.z}${A.t}`, kind: "circle", x: v.x, z: v.z, r: v.r, warn: 1.2, life: 1.4, t: 0, dps: 34, ground: false, color: "#e8f4ff", mission: true, vent: true });
      }
    // security cameras
    if (D.cams)
      for (const c of D.cams) {
        if (c.dead) continue;
        c.cur = c.yaw + Math.sin(A.t * 0.6 + c.k) * c.sweep;
        c.cool = Math.max(0, c.cool - dt);
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const seen = !p.dead && d < c.range && Math.abs(wrapAngle(yawOf(dx, dz) - c.cur)) < 0.42 && lineOfSight(G.map, c.x, c.y - 0.3, c.z, p.x, p.y + 1.2, p.z);
        c.detect = Math.max(0, Math.min(1, c.detect + (seen ? dt * (p.crouchT > 0.5 ? 0.8 : 1.4) : -dt * 0.5)));
        if (c.detect >= 1 && c.cool <= 0) {
          c.cool = 22;
          c.detect = 0.3;
          G.say("Halcyon Security", "Intruder flagged by surveillance. Drones dispatched.");
          spawnList(s.alarm || [], D.tag);
          G.emit({ type: "alarm" });
        }
      }
    // node objects destroy their camera when disabled
    if (D.cams && s.targets) s.targets.forEach((t, k) => D.done.has(t.id) && D.cams[k] && (D.cams[k].dead = true));
    // step completion
    switch (s.type) {
      case "goto":
        if (dist(p.x, p.z, s.at[0], s.at[1]) < s.r && Math.abs(p.y - (s.y || 0)) < 3) advance();
        break;
      case "kill":
      case "collect": {
        const alive = G.enemies.filter((e) => e.tag === D.tag && e.state !== "dead").length;
        if (s.type === "kill" && A.t > 0.3 && alive === 0) advance();
        if (s.type === "collect" && (P().stacks[s.item] || 0) >= s.need) advance();
        break;
      }
      case "defend": {
        const inside = dist(p.x, p.z, s.at[0], s.at[1]) < s.r && !p.dead;
        if (inside) D.progress += dt;
        (s.waves || []).forEach((w, k) => {
          if (D.waves & (1 << k)) return;
          if (D.progress >= w.t || A.t > w.t + 25) {
            D.waves |= 1 << k;
            spawnList(w.spawn, D.tag);
          }
        });
        if (s.protect) {
          const n = G.npcs.find((x) => x.id === s.protect.npc);
          if (n) {
            for (const e of G.enemies) if (e.state === "combat" && dist(e.x, e.z, n.x, n.z) < 9) n.hp -= dt * (e.flyer ? 4 : 6);
            if (n.hp <= 0) return M.fail("protect");
          }
        }
        if (D.progress >= s.duration) {
          if (s.protect) {
            const n = G.npcs.find((x) => x.id === s.protect.npc);
            if (n) n.protected = false;
          }
          advance();
        }
        break;
      }
      case "boss":
        if (D.bossDownT != null && A.t - D.bossDownT > 2.2) advance();
        break;
    }
  };

  /* ------------------------------------------------------------ HUD / journal */
  M.objectiveText = () => {
    const A = M.active;
    if (!A) {
      if (M.suspended) return `Return to the ${DISTRICTS[CONTRACT_BY_ID[M.suspended].district].name} to continue “${CONTRACT_BY_ID[M.suspended].title}”`;
      const nx = M.available()[0];
      if (!nx) return P().ending ? "Neon City is yours. Free roam." : "";
      return nx.here ? `New contract: “${nx.title}” — check a Contract Terminal` : `Travel to the ${DISTRICTS[nx.district].name} (Maglev) for “${nx.title}”`;
    }
    const s = A.step;
    if (!s) return "";
    const D = A.data;
    let t = s.text || "";
    if (s.type === "objects" && s.targets.length > 1) t += ` (${D.done.size}/${s.targets.length})`;
    if (s.type === "collect") t += ` (${Math.min(P().stacks[s.item] || 0, s.need)}/${s.need})`;
    if (s.type === "kill") {
      const alive = G.enemies.filter((e) => e.tag === D.tag && e.state !== "dead").length;
      if (alive > 0) t += ` — ${alive} left`;
    }
    if (s.type === "search") t = `${s.text}: ${s.clues[D.clue]?.hint || ""} (${D.clue}/${s.clues.length})`;
    return t;
  };
  /** Progress info for the HUD (timers, defend bars, protected NPC). */
  M.hud = () => {
    const A = M.active;
    if (!A || !A.step) return null;
    const s = A.step;
    const out = { title: A.def.title, stealth: !!s.stealth, failed: A.failed };
    if (s.timer) out.timer = Math.max(0, s.timer - A.t);
    if (s.type === "defend") out.progress = { label: s.label, value: A.data.progress / s.duration };
    if (s.protect) {
      const n = G.npcs.find((x) => x.id === s.protect.npc);
      if (n) out.protect = { name: n.def?.name || n.id, value: Math.max(0, n.hp / n.maxHp) };
    }
    if (A.data.cams) out.cams = A.data.cams.filter((c) => !c.dead).map((c) => c.detect);
    return out;
  };
  /** World markers for the current objective: [{x,y,z,label,kind,r?}]. */
  M.markers = () => {
    const A = M.active;
    const out = [];
    if (!A || !A.step || A.failed) {
      if (!A) {
        // point at the contract terminal when a contract is waiting here
        const nx = M.available()[0];
        if (nx?.here) for (const t of G.def.terminals || []) out.push({ x: t.x, y: 2.2, z: t.z, label: "Contract", kind: "terminal" });
        else if (nx || M.suspended) for (const st of G.def.stations || []) if (st.id === "transitGate") out.push({ x: st.x, y: 2.2, z: st.z, label: "Maglev", kind: "travel" });
      }
      return routeMarkers(out);
    }
    const s = A.step;
    const D = A.data;
    const npc = (id) => G.npcs.find((n) => n.id === id);
    if (s.type === "talk" || s.type === "deliver") {
      const n = npc(s.npc);
      if (n) out.push({ x: n.x, y: 2.3, z: n.z, label: n.def?.name || s.npc, kind: "npc" });
    } else if (s.type === "goto") out.push({ x: s.at[0], y: (s.y || 0) + 1.6, z: s.at[1], label: "Go", kind: "goto", r: s.r });
    else if (s.type === "door") {
      const d = (G.def.doors || []).find((x) => x.id === s.door);
      if (d) out.push({ x: d.at[0], y: 1.8, z: d.at[1], label: d.label, kind: "door" });
    } else if (s.type === "objects" || s.type === "hack") {
      for (const o of Object.values(G.objects)) if (o.active && o.step === A.stepI) out.push({ x: o.x, y: (o.y || 0) + 1.7, z: o.z, label: o.label, kind: "object" });
    } else if (s.type === "search") {
      const c = s.clues[D.clue];
      if (c) out.push({ x: c.area[0], y: 1, z: c.area[1], label: c.hint, kind: "area", r: c.r });
    } else if (s.type === "collect") {
      for (const pk of G.pickups) if (pk.mission && pk.item === s.item) out.push({ x: pk.x, y: (pk.y || 0) + 1, z: pk.z, label: STACKS[s.item].name, kind: "object" });
      for (const e of G.enemies) if (e.tag === D.tag && e.dropsQuest && e.state !== "dead") out.push({ x: e.x, y: e.y + e.h + 0.6, z: e.z, label: "Carrier", kind: "enemy" });
    } else if (s.type === "defend") out.push({ x: s.at[0], y: 1.5, z: s.at[1], label: s.label, kind: "defend", r: s.r });
    if (s.type === "kill" || s.type === "boss" || s.marker === "enemies") {
      const alive = G.enemies.filter((e) => e.tag === D.tag && e.state !== "dead");
      const show = s.type === "boss" || alive.length <= 4 || s.marker === "enemies";
      if (show) for (const e of alive) out.push({ x: e.x, y: e.y + e.h + 0.5, z: e.z, label: "", kind: "enemy" });
      else if (alive.length) {
        // centroid of the group
        const cx = alive.reduce((a, e) => a + e.x, 0) / alive.length;
        const cz = alive.reduce((a, e) => a + e.z, 0) / alive.length;
        out.push({ x: cx, y: 2, z: cz, label: `${alive.length} hostiles`, kind: "goto" });
      }
    }
    if (Array.isArray(s.marker)) out.push({ x: s.marker[0], y: 1.6, z: s.marker[1], label: "Objective", kind: "goto" });
    return routeMarkers(out);
  };
  /** Targets in another region (tunnel, tower…) are routed through the doors. */
  function routeMarkers(list) {
    const p = G.player;
    const here = regionOf(p.x, p.z);
    const out = [];
    for (const m of list) {
      const there = regionOf(m.x, m.z);
      if (there === here) {
        out.push(m);
        continue;
      }
      const d = nextDoor(here, there);
      if (d) out.push({ x: d.at[0], y: 1.8, z: d.at[1], label: d.label, kind: "door", routed: true });
    }
    // de-duplicate routed doors
    const seen = new Set();
    return out.filter((m) => {
      const k = `${m.kind}${m.x.toFixed(1)}${m.z.toFixed(1)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  function regionOf(x, z) {
    const Mp = G.map;
    if (x > Mp.origin[0] && x < Mp.origin[0] + Mp.cityW && z > Mp.origin[1] && z < Mp.origin[1] + Mp.cityD) return "city";
    const areas = G.def.areas || [];
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return `a${i}`;
    }
    return "city";
  }
  function nextDoor(from, to) {
    const doors = (G.def.doors || []).filter((d) => M.doorOpen(d));
    // BFS over regions
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const r = q.shift();
      if (r === to) break;
      for (const d of doors) {
        if (regionOf(d.at[0], d.at[1]) !== r) continue;
        const nr = regionOf(d.to.x, d.to.z);
        if (prev.has(nr)) continue;
        prev.set(nr, { r, d });
        q.push(nr);
      }
    }
    if (!prev.has(to)) {
      // not reachable yet — point at the first locked door out of here
      return (G.def.doors || []).find((d) => regionOf(d.at[0], d.at[1]) === from && regionOf(d.to.x, d.to.z) === to) || null;
    }
    let cur = to;
    let step = prev.get(cur);
    while (step && step.r !== from) {
      cur = step.r;
      step = prev.get(cur);
    }
    return step?.d || null;
  }
  M.regionOf = regionOf;

  /** Journal data. */
  M.journal = () => {
    const Pr = P();
    const done = new Set(Pr.story.done);
    return CONTRACTS.map((c) => ({
      id: c.id,
      title: c.title,
      district: c.district,
      location: c.location,
      giver: c.giver,
      brief: c.brief,
      rewards: c.rewards,
      status: done.has(c.id) ? "done" : Pr.story.active?.id === c.id ? "active" : M.nextId() === c.id ? "available" : "locked",
      steps: c.steps.filter((s) => s.text).map((s, i) => ({ text: s.text, done: done.has(c.id) || (Pr.story.active?.id === c.id && M.active && c.steps.indexOf(s) < M.active.stepI) })),
    }));
  };

  return M;
}
