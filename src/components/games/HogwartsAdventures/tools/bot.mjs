/**
 * A headless player for the tests. It drives the real Game through the same
 * input frames the keyboard produces (move, look, cast, shield, interact…),
 * navigating with the enemy nav grid. Nothing is teleported or granted —
 * if the bot finishes the campaign, a person can too.
 */
import { Game } from "../engine/game.js";
import { newProfile } from "../engine/profile.js";
import { SPELLS } from "../data/spells.js";
import { NPCS } from "../data/npcs.js";
import { OBJECT_BY_ID, SYMBOLS, PILLAR_ANSWER, BRAZIER_ORDER } from "../data/objects.js";
import { PLATFORMS } from "../data/layout.js";
import { hotbar } from "../engine/profile.js";

const DT = 1 / 60;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const blank = () => ({ mx: 0, mz: 0, dYaw: 0, dPitch: 0, sprint: false, dodge: false, cast: { down: false, pressed: false }, aim: false, interact: false, shield: false, q: false, r: false, potion: 0, lumos: false, slot: null, cycle: 0 });

export class Bot {
  constructor(hero = "harry", opts = {}) {
    this.G = opts.game || new Game(opts.profile || newProfile(hero), { arrival: opts.arrival || "new", seed: opts.seed || 7 });
    this.log = [];
    this.frames = 0;
    this.deaths = 0;
    this.verbose = !!opts.verbose;
    this.events = [];
  }
  say(m) {
    this.log.push(m);
    if (this.verbose) console.log(`[${(this.G.time | 0).toString().padStart(5)}s] ${m}`);
  }
  /* ---------------------------------------------------------- stepping */
  tick(inp = blank()) {
    const G = this.G;
    G.step(DT, inp);
    this.frames++;
    for (const e of G.drain()) {
      this.events.push(e);
      if (e.type === "playerDeath") this.deaths++;
      if (e.type === "questDone") this.say(`QUEST DONE: ${e.name}`);
      if (e.type === "deny" && this.verbose) this.say(`deny: ${e.text}`);
    }
    if (G.player.dead) {
      for (let i = 0; i < 90; i++) G.step(DT, blank());
      G.respawn();
      G.drain();
      this.say("respawned");
    }
    if (this.events.length > 4000) this.events.splice(0, 2000);
  }
  wait(sec, inpFn) {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) this.tick(inpFn ? inpFn() : blank());
  }
  /** Input that turns the camera to yaw (and pitch) — the bot "moves the mouse". */
  lookInput(yaw, pitch = null, inp = blank()) {
    const G = this.G;
    inp.dYaw = wrap(G.camYaw - yaw);
    if (pitch != null) inp.dPitch = pitch - G.camPitch;
    return inp;
  }
  /* ---------------------------------------------------------- movement */
  goto(x, z, { r = 0.7, timeout = 120, sprint = true, fight = true } = {}) {
    const G = this.G;
    let path = null;
    let pathT = 0;
    let stuck = 0;
    let last = { x: G.player.x, z: G.player.z };
    const t0 = G.time;
    while (Math.hypot(G.player.x - x, G.player.z - z) > r) {
      if (G.time - t0 > timeout) throw new Error(`goto(${x},${z}) timed out at ${G.player.x.toFixed(1)},${G.player.z.toFixed(1)}`);
      if (fight && this.threat()) {
        this.fightAll(30);
        path = null;
        continue;
      }
      if (G.dialogue) this.finishDialogue();
      const p = G.player;
      pathT -= DT;
      if (!path || pathT <= 0) {
        path = G.nav.lineOpen(p.x, p.z, x, z) ? [{ x, z }] : G.nav.findPath(p.x, p.z, x, z, 60000) || [{ x, z }];
        pathT = 1.5;
      }
      let wp = path[0];
      while (path.length > 1 && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.6) {
        path.shift();
        wp = path[0];
      }
      const yaw = Math.atan2(wp.x - p.x, wp.z - p.z);
      const inp = this.lookInput(yaw, -0.12);
      inp.mz = 1;
      inp.sprint = sprint && Math.hypot(x - p.x, z - p.z) > 4;
      this.tick(inp);
      stuck += DT;
      if (stuck > 1.5) {
        if (Math.hypot(p.x - last.x, p.z - last.z) < 0.4) {
          // nudge sideways and re-plan
          for (let i = 0; i < 20; i++) {
            const n = this.lookInput(yaw + 1.2);
            n.mz = 1;
            this.tick(n);
          }
          path = null;
        }
        stuck = 0;
        last = { x: p.x, z: p.z };
      }
    }
  }
  /** Turn the camera to look at a point (yaw + pitch from the camera pivot). */
  lookAt(x, y, z, frames = 20) {
    const G = this.G;
    for (let i = 0; i < frames; i++) {
      const p = G.player;
      const yaw = Math.atan2(x - p.x, z - p.z);
      const d = Math.hypot(x - p.x, z - p.z);
      const pitch = Math.atan2(y - (p.y + 1.6), d);
      this.tick(this.lookInput(yaw, Math.max(-1, Math.min(0.7, pitch))));
    }
  }
  equip(spell) {
    const hb = hotbar(this.G.P);
    const i = hb.indexOf(spell);
    if (i < 0) throw new Error(`spell ${spell} not learned`);
    const inp = blank();
    inp.slot = i;
    this.tick(inp);
  }
  /** Cast the equipped spell at a world point. Returns true if a matching cast event fired. */
  castAt(spell, x, y, z, { aim = true } = {}) {
    const G = this.G;
    this.equip(spell);
    for (let k = 0; k < 6; k++) {
      this.lookAt(x, y, z, 14);
      while ((G.player.cds[spell] || 0) > 0) this.tick(this.lookInput(G.camYaw));
      if (G.player.mana < SPELLS[spell].cost + 2) this.waitMana(SPELLS[spell].cost + 10);
      const before = G.P.stats.casts;
      const inp = this.lookInput(G.camYaw);
      inp.aim = aim;
      inp.cast.pressed = true;
      this.tick(inp);
      this.tick();
      if (G.P.stats.casts > before) return true;
    }
    return false;
  }
  waitMana(n) {
    const G = this.G;
    let guard = 0;
    while (G.player.mana < Math.min(n, G.stats.maxMana - 1) && guard++ < 3000) {
      if (this.threat()) return this.fightAll(30);
      this.tick();
    }
  }
  /* ---------------------------------------------------------- talking & using */
  finishDialogue(choice = 0) {
    const G = this.G;
    let guard = 0;
    while (G.dialogue && guard++ < 200) {
      if (G.dialogue.choices) G.dlg.choose(typeof choice === "function" ? choice(G.dialogue.choices) : choice);
      else G.dlg.next();
      this.tick();
    }
  }
  talk(npcId, choice = 0) {
    const G = this.G;
    let n = G.npcs.find((x) => x.id === npcId);
    if (!n) throw new Error(`no npc ${npcId}`);
    for (let k = 0; k < 4 && !(G.focus?.kind === "npc" && G.focus.ref === n); k++) {
      // the nearest open spot around them (desks and tables get in the way)
      const tr = Math.min(n.talkRange - 0.9, 2.2);
      const p = G.player;
      let best = null;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = n.x + Math.sin(a) * tr;
        const z = n.z + Math.cos(a) * tr;
        if (!G.nav.open(x, z)) continue;
        const d = Math.hypot(x - p.x, z - p.z);
        if (!best || d < best.d) best = { x, z, d };
      }
      if (best) this.goto(best.x, best.z, { r: 0.5 });
      this.lookAt(n.x, n.y + 1.5, n.z, 10);
      n = G.npcs.find((x) => x.id === npcId);
    }
    if (!(G.focus?.kind === "npc" && G.focus.ref.id === npcId)) throw new Error(`can't focus ${npcId} (focus ${G.focus?.label})`);
    const inp = blank();
    inp.interact = true;
    this.tick(inp);
    if (!G.dialogue) throw new Error(`no dialogue with ${npcId}`);
    this.finishDialogue(choice);
  }
  use(objId, near = null) {
    const G = this.G;
    const o = G.objects.byId[objId];
    const [x, z] = near || [o.x, o.z];
    this.goto(x, z, { r: 0.35 });
    this.lookAt(o.x, o.y + 0.5, o.z, 12);
    if (!(G.focus?.kind === "obj" && G.focus.ref === o)) throw new Error(`can't focus ${objId} (focus ${G.focus?.label})`);
    const inp = blank();
    inp.interact = true;
    this.tick(inp);
    this.tick();
  }
  lumos(on = true) {
    const G = this.G;
    if (G.player.lumos !== on) {
      const inp = blank();
      inp.lumos = true;
      this.tick(inp);
      this.tick();
    }
  }
  /* ---------------------------------------------------------- combat */
  threat() {
    const G = this.G;
    const p = G.player;
    return G.enemies.some((e) => !e.dead && e.aggro && e.def.ai !== "dummy" && !e.invuln && Math.hypot(e.x - p.x, e.z - p.z) < 26);
  }
  /** Fight until no aggro enemy (or `group` is dead). Reacts to telegraphs. */
  fightAll(timeout = 90, filter = null) {
    const G = this.G;
    const t0 = G.time;
    let dodgeCd = 0;
    while (G.time - t0 < timeout) {
      const p = G.player;
      const foes = G.enemies.filter((e) => !e.dead && (filter ? filter(e) : e.aggro && e.def.ai !== "dummy") && (!e.invuln || e.bossCtl));
      if (!foes.length) return true;
      // pick a target
      let tgt = foes.filter((e) => !e.invuln).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const obel = (G.obelisks || []).find((o) => o.active && !o.dead);
      if (G.boss?.sphere && obel && (!tgt || tgt.group !== "bossAdds" || Math.hypot(obel.x - p.x, obel.z - p.z) < 18)) tgt = { x: obel.x, y: 0, z: obel.z, obelisk: true, def: { height: 4, radius: 1.2 } };
      if (!tgt) {
        this.tick();
        continue;
      }
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      // choose a spell
      let spell = "stupefy";
      if (tgt.type === "dementor" && G.P.spells.patronum && !(p.cds.patronum > 0) && p.mana >= SPELLS.patronum.cost) spell = "patronum";
      else if (tgt.bossCtl?.e?.state === "finish" || (tgt.state === "finish")) spell = "expelliarmus";
      else if ((tgt.type === "book" || tgt.type === "spider" || tgt.type === "bigSpider") && G.P.spells.incendio) spell = "incendio";
      else if (tgt.shieldT > 0) spell = "expelliarmus";
      else if (p.cds.stupefy > 0) spell = "expelliarmus";
      if (tgt.type === "dementor" && spell !== "patronum") spell = G.P.spells.incendio ? "incendio" : "expelliarmus";
      if (!G.P.spells[spell]) spell = "expelliarmus";
      const inp = blank();
      // threats: telegraphs under us → dodge away; incoming bolts → shield
      const danger = G.zones.find((z) => z.kind === "warn" && !z.fired && insideWarn(z, p, 1.2));
      const bolt = G.projectiles.find((b) => b.team === "enemy" && Math.hypot(b.x - p.x, b.z - p.z) < 5 && (b.vx * (p.x - b.x) + b.vz * (p.z - b.z)) > 0);
      dodgeCd -= DT;
      if (danger && p.dodgeCd <= 0 && dodgeCd <= 0) {
        const ax = p.x - danger.x;
        const az = p.z - danger.z;
        let ay = Math.atan2(ax, az);
        if (danger.shape === "line") ay = danger.yaw + Math.PI / 2;
        const rel = wrap(ay - G.camYaw);
        inp.mx = -Math.sin(rel);
        inp.mz = Math.cos(rel);
        inp.dodge = true;
        dodgeCd = 0.6;
      } else if (bolt && !(p.cds.protego > 0) && p.mana > 10) inp.shield = true;
      // keep a sensible distance, strafe a little
      const yaw = Math.atan2(tgt.x - p.x, tgt.z - p.z);
      const pitch = Math.atan2(tgt.y + (tgt.def?.height || 1.6) * 0.5 - (p.y + 1.6), Math.max(1, d));
      Object.assign(inp, { ...this.lookInput(yaw, Math.max(-0.9, Math.min(0.6, pitch))), mx: inp.mx, mz: inp.mz, dodge: inp.dodge, shield: inp.shield });
      const seen = tgt.obelisk || G.col.los(p.x, p.y + 1.5, p.z, tgt.x, tgt.y + 1, tgt.z);
      if (!seen && !inp.dodge) {
        // walk around whatever is in the way
        this.fightPathT = (this.fightPathT || 0) - DT;
        if (!this.fightPath || this.fightPathT <= 0) {
          this.fightPath = G.nav.findPath(p.x, p.z, tgt.x, tgt.z, 20000);
          this.fightPathT = 0.8;
        }
        const wp = this.fightPath?.find((w) => Math.hypot(w.x - p.x, w.z - p.z) > 0.8);
        if (wp) {
          Object.assign(inp, this.lookInput(Math.atan2(wp.x - p.x, wp.z - p.z), -0.1));
          inp.mz = 1;
          this.tick(inp);
          continue;
        }
      }
      if (!inp.dodge) {
        if (d > 15 || !seen) inp.mz = 1;
        else if (d < 4 && tgt.def?.ai !== "boss") inp.mz = -1;
        inp.mx = Math.sin(G.time * 0.9) > 0 ? 0.4 : -0.4;
      }
      // heal up
      if (p.hp < G.stats.maxHp * 0.35 && G.count("wiggenweld")) inp.potion = 1;
      else if (p.mana < 12 && G.count("invigoration")) inp.potion = 2;
      // specials
      if (G.time % 3 < DT && p.mana > 40 && !(p.cds.q > 0)) inp.q = true;
      if (G.time % 5 < DT && p.mana > 45 && !(p.cds.r > 0)) inp.r = true;
      const hb = hotbar(G.P);
      const si = hb.indexOf(spell);
      if (G.P.equipped !== spell && si >= 0) inp.slot = si;
      else if (Math.abs(wrap(G.camYaw - yaw)) < 0.25 && !(p.cds[spell] > 0) && p.mana >= SPELLS[spell].cost * G.stats.costMul + 10) inp.cast.pressed = true;
      this.tick(inp);
    }
    return false;
  }
  /* ---------------------------------------------------------- platforms */
  /** Ride a moving platform (by id) from where we stand to (x,z) on the far side. */
  ride(platformId, boardWhen, leaveAt, timeout = 60) {
    const G = this.G;
    const pl = () => G.col.platforms.find((s) => s.id === platformId);
    const t0 = G.time;
    while (!boardWhen(pl())) {
      if (G.time - t0 > timeout) throw new Error(`platform ${platformId} never arrived`);
      this.tick();
    }
    const s = pl();
    this.goto((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, { r: 0.6, sprint: false, fight: false });
    const t1 = G.time;
    while (!leaveAt(pl())) {
      if (G.time - t1 > timeout) throw new Error(`stuck on ${platformId}`);
      // stay centred while riding
      const c = pl();
      const p = G.player;
      const cx = (c.x0 + c.x1) / 2;
      const cz = (c.z0 + c.z1) / 2;
      const inp = blank();
      if (Math.hypot(cx - p.x, cz - p.z) > 0.5) {
        Object.assign(inp, this.lookInput(Math.atan2(cx - p.x, cz - p.z)));
        inp.mz = 0.5;
      }
      this.tick(inp);
    }
  }
}

function insideWarn(z, p, pad) {
  if (z.shape === "line") {
    const dx = p.x - z.x;
    const dz = p.z - z.z;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const along = dx * fx + dz * fz;
    return along > 0 && along < z.len && Math.abs(dx * fz - dz * fx) < z.r + pad;
  }
  return Math.hypot(p.x - z.x, p.z - z.z) < z.r + pad;
}

/* ================================================================ the campaign */
export function playCampaign(bot, { upTo = "finale" } = {}) {
  const G = bot.G;
  const done = (q) => G.questState(q) === "done";
  const step = (name, fn) => {
    bot.say(`— ${name}`);
    fn();
  };
  // 1 Meet Dumbledore
  step("meet", () => bot.talk("dumbledore"));
  // 2 Explore
  step("explore", () => {
    bot.goto(-30, 0);
    bot.goto(30, 0);
    bot.goto(0, 30);
    bot.goto(0, 12);
  });
  // 3 Lesson
  step("lesson", () => {
    bot.talk("flitwick");
    for (const id of ["feather_1", "feather_2", "feather_3"]) {
      const o = OBJECT_BY_ID[id];
      bot.goto(o.x + 2.5, o.z + 2.5);
      if (!bot.castAt("levioso", o.x, o.y + 0.95, o.z)) throw new Error("levioso failed");
    }
    bot.goto(55, -20);
    const c = OBJECT_BY_ID.cushion;
    bot.castAt("accio", c.x, c.y + 0.4, c.z);
    bot.talk("flitwick");
  });
  if (!done("lesson")) throw new Error("lesson not done");
  // 4 Duel
  step("duel", () => {
    bot.talk("snape");
    bot.goto(38, 15);
    const e = G.enemies.find((x) => x.group === "duel");
    e.aggro = true;
    let t = 0;
    while (!done("duel") && t++ < 4) {
      bot.fightAll(60, (x) => x.group === "duel");
      if (G.questStage("duel") === 1 && !G.flag("duelBlock")) {
        // make sure we block one: wait for a bolt and shield
        const g0 = G.time;
        while (!G.flag("duelBlock") && G.time - g0 < 30) {
          const p = G.player;
          const b = G.projectiles.find((x) => x.team === "enemy" && Math.hypot(x.x - p.x, x.z - p.z) < 4);
          const inp = blank();
          if (b) inp.shield = true;
          bot.tick(inp);
        }
      }
      if (G.questStage("duel") === 2) bot.talk("snape");
    }
  });
  // 5 Book
  step("book", () => {
    bot.talk("pince");
    bot.goto(-52, 0);
    bot.castAt("alohomora", -56, 2, 0);
    bot.goto(-58.5, 0);
    bot.fightAll(60, (x) => x.group === "books");
    const b = OBJECT_BY_ID.founders_book;
    bot.goto(-60, 3);
    bot.castAt("accio", b.x, b.y + 0.4, b.z);
    bot.talk("pince");
  });
  // 6 Hidden corridor
  step("corridor", () => {
    bot.lumos(true);
    bot.goto(-63.5, 0);
    bot.wait(0.5);
    bot.castAt("levioso", -66, 1.8, 0);
    bot.wait(1.5);
    bot.goto(-80, 0);
    bot.fightAll(60, (x) => x.group === "corridorArmour" && !x.dead);
    bot.lumos(true);
    for (const id of ["glyph_1", "glyph_2", "glyph_3"]) {
      const o = OBJECT_BY_ID[id];
      bot.goto(o.x, 7.6);
      bot.wait(0.3);
    }
    for (let i = 1; i <= 3; i++) {
      const o = G.objects.byId[`pillar_${i}`];
      let guard = 0;
      while (SYMBOLS[o.st.rot % 4] !== PILLAR_ANSWER[i - 1] && guard++ < 5) bot.use(`pillar_${i}`, [o.x, o.z + 1.6]);
    }
    bot.wait(1);
  });
  // 7 Repair
  step("repair", () => {
    bot.goto(-87, -11.5);
    bot.castAt("reparo", -87, 0.2, -14.2);
    bot.wait(1.5);
    bot.goto(-87, -45);
    bot.castAt("reparo", -87, 2.4, -60.5);
    bot.use("mirror", [-87, -57.5]);
    bot.finishDialogue();
  });
  // 8 Forest
  step("forest", () => {
    bot.lumos(false);
    bot.goto(0, 12);
    bot.talk("hagrid");
    bot.goto(-81, 86);
    bot.castAt("incendio", -81, 2.5, 92);
    bot.wait(0.5);
    bot.lumos(true);
    for (const id of ["track_1", "track_2", "track_3"]) {
      const o = OBJECT_BY_ID[id];
      bot.goto(o.x, o.z, { r: 2 });
      bot.wait(0.3);
    }
    bot.goto(-122, 158, { r: 2 });
    bot.fightAll(90, (x) => x.group === "hollow");
    bot.goto(-104, 190, { r: 2 });
    bot.fightAll(90, (x) => x.group === "camp");
    bot.use("mask", [-99, 191]);
    bot.lumos(false);
    bot.talk("hagrid");
  });
  // 9 Defend
  step("defend", () => {
    bot.talk("neville");
    let guard = 0;
    while (!done("defend") && guard++ < 6) {
      bot.fightAll(120, (x) => (x.group === "pitchWave1" || x.group === "pitchWave2") && !x.dead);
      bot.wait(0.5);
      if (G.questStage("defend") === 3) bot.talk("neville");
      if (G.questStage("defend") === 1 && !G.enemies.some((e) => !e.dead && e.group === "pitchWave1")) bot.wait(3);
    }
  });
  if (!done("defend")) throw new Error("defend not done");
  // 10 Chamber
  step("chamber", () => {
    bot.talk("dumbledore");
    bot.lumos(true);
    for (const id of BRAZIER_ORDER) {
      const o = OBJECT_BY_ID[id];
      bot.goto(o.x + (o.x < -87 ? 2.5 : -2.5), o.z + (o.z < -51 ? 2.5 : -2.5));
      bot.wait(0.2);
    }
    for (const id of BRAZIER_ORDER) {
      const o = OBJECT_BY_ID[id];
      bot.goto(-87, -51);
      bot.castAt("incendio", o.x, 1.4, o.z);
      bot.wait(0.4);
    }
    bot.lumos(false);
    bot.goto(-102, -51);
    const A = PLATFORMS.find((p) => p.id === "shaftA");
    void A;
    bot.goto(-104.8, -51, { r: 0.4, fight: false });
    bot.ride("shaftA", (s) => s.x1 > -104.3, (s) => s.x0 < -117.2);
    bot.ride("shaftB", (s) => s.x1 > -114.7, (s) => s.x0 < -127.7);
    bot.goto(-134, -51, { fight: false });
  });
  // 11 Ambush
  step("ambush", () => {
    bot.fightAll(150, (x) => x.group === "ambush" && !x.dead);
  });
  // 12 Door
  step("door", () => {
    bot.use("ancient_door", [-144, -61.5]);
    // Courage — the Great Hall alcove (Accio)
    bot.goto(-136, -51);
    bot.goto(-128.6, -51, { r: 0.4, fight: false });
    bot.ride("shaftB", (s) => s.x0 < -127.7, (s) => s.x1 > -114.7);
    bot.ride("shaftA", (s) => s.x0 < -117.2, (s) => s.x1 > -104.3);
    bot.goto(0, -50);
    bot.castAt("accio", 0, 4.7, -63.2);
    bot.wait(0.6);
    const ch = G.objects.byId.chest_gh;
    bot.use("chest_gh", [ch.x, ch.z + 1.5]);
    // Wit — the practice tower (lift + Alohomora)
    bot.goto(91.5, 86.5);
    bot.goto(91.5, 88.6, { r: 0.4, fight: false });
    bot.ride("towerLift", (s) => s.y1 < 0.4, (s) => s.y1 > 7.9);
    bot.goto(98, 92, { fight: false });
    bot.castAt("alohomora", 102.5, 8.4, 92);
    bot.use("chest_tower", [101, 92]);
    bot.use("chest_pitch", [102, 89.5]);
    bot.goto(95, 92, { fight: false });
    bot.ride("towerLift", (s) => s.y1 > 7.9, (s) => s.y1 < 0.4);
    // Loyalty — the forest shrine (Levioso)
    bot.goto(-146, 204, { r: 1 });
    bot.castAt("levioso", -150, 1.2, 205);
    bot.wait(1);
    bot.use("sigil_badger", [-147.8, 205]);
    // back to the door
    bot.goto(-87, -51);
    bot.goto(-102, -51);
    bot.goto(-104.8, -51, { r: 0.4, fight: false });
    bot.ride("shaftA", (s) => s.x1 > -104.3, (s) => s.x0 < -117.2);
    bot.ride("shaftB", (s) => s.x1 > -114.7, (s) => s.x0 < -127.7);
    bot.use("ancient_door", [-144, -61.5]);
  });
  // 13 Artifact
  step("artifact", () => {
    bot.goto(-144, -70);
    bot.fightAll(200, (x) => x.group === "vault" && !x.dead);
    bot.use("pedestal", [-144, -78.3]);
  });
  if (upTo === "artifact") return;
  // 14 Prepare
  step("prepare", () => {
    bot.goto(-136, -51);
    bot.goto(-128.6, -51, { r: 0.4, fight: false });
    bot.ride("shaftB", (s) => s.x0 < -127.7, (s) => s.x1 > -114.7);
    bot.ride("shaftA", (s) => s.x0 < -117.2, (s) => s.x1 > -104.3);
    bot.talk("dumbledore");
    bot.talk("snape");
    const c = G.npcs.find((n) => n.companion);
    bot.talk(c.id, (ch) => ch.length - 1);
    bot.goto(0, -50);
    bot.use("portkey", [0, -51.5]);
    bot.finishDialogue(0);
  });
  // 15 Finale
  step("finale", () => {
    bot.wait(8.5);
    let guard = 0;
    while (!done("finale") && guard++ < 8) {
      bot.fightAll(240, (x) => !x.dead && (x.bossCtl || x.group === "bossAdds"));
    }
  });
}
