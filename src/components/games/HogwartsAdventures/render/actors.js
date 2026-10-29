/**
 * Actors: the hero, NPCs and enemies as rigged characters (or procedural
 * creatures), kept in sync with the simulation each frame. Picks animation
 * layers from sim state: locomotion on the legs, casting / shielding /
 * aiming on the torso, full-body one-shots for dodges, hits, levitation,
 * stuns and deaths.
 */
import * as THREE from "three";
import { createCharacter } from "./characters.js";
import { createDementor, createSpider, createBook, createDummy } from "./creatures.js";
import { HEROES } from "../data/heroes.js";

/** Fill in school-robe defaults for a look. */
export function wizardLook(look, extra = {}) {
  const L = { garments: ["robe"], cloak: look.cloak || look.robe || "#1a181c", belt: false, ...look, ...extra };
  if (L.scarf && L.tie === undefined) L.tie = true;
  if (L.coat) {
    L.cloak = null;
    L.garments = ["robe"];
  }
  return L;
}
const ENEMY_LOOK = {
  darkWizard: { body: "m", hair: null, robe: "#241c2a", tunic: "#2a2230", hose: "#18141c", trim: "#5a2a6a", cloak: "#1a1420", hood: true, skinTint: "#d8c8c0", eyeGlow: true, eyes: "#c060ff" },
  deathEater: { body: "m", hair: null, robe: "#0c0b0e", tunic: "#111014", hose: "#0a0a0c", trim: "#2a2a2e", cloak: "#08080a", hood: true, mask: true, skinTint: "#d8ccc4" },
  voldemort: { body: "m", hair: null, robe: "#0a0a0c", tunic: "#0e0e10", hose: "#0a0a0c", trim: "#1a1a1e", cloak: "#060608", skinTint: "#c8d0cc", eyeGlow: true, eyes: "#ff2a2a", scale: 1.04, girth: 0.92 },
  armour: { body: "m", hair: null, skinTint: "#3a3a40", tunic: "#3a3c44", hose: "#2a2c34", garments: ["gambeson"], gambeson: "#4a4c54", trim: "#8a8e96", armor: { chest: "plate", head: "great", shoulders: "plate", arms: "gauntlets", legs: "greaves" }, metal: "#8a909a", belt: true, eyeGlow: true, eyes: "#7fd0ff" },
};

export function createActors(scene, assets) {
  const live = new Map(); // sim object → view
  const tmpV = new THREE.Vector3();

  function makeHuman(look, weapon = "wand") {
    const c = createCharacter(assets, look);
    if (weapon) c.setWeapon(weapon);
    c.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(c.root);
    return { kind: "human", c, root: c.root, anim: c.anim, t: 0, hitV: 0, dis: 0 };
  }
  function makeCreature(model, scale) {
    const k = model === "dementor" ? createDementor() : model === "spider" ? createSpider(scale || 1) : model === "book" ? createBook() : createDummy();
    scene.add(k.root);
    return { kind: "creature", k, root: k.root, t: 0, hitV: 0, dis: 0 };
  }

  function viewForEnemy(e) {
    const m = e.def.look.model;
    if (m === "human" || m === "armour") {
      let look;
      if (e.type === "duelist") {
        const H = HEROES[e.partner || "draco"];
        look = wizardLook(H.look);
      } else look = wizardLook(ENEMY_LOOK[e.type] || ENEMY_LOOK.darkWizard);
      if (m === "armour") look = { ...ENEMY_LOOK.armour, scale: e.def.look.scale || 1, girth: e.def.look.scale ? 1.15 : 1 };
      const v = makeHuman(look, m === "armour" ? "sword" : "wand");
      if (e.type === "guardian") v.c.setShield?.("heater", null, "#3a3c44");
      return v;
    }
    return makeCreature(m, e.def.look.scale);
  }

  function sync(obj, v, dt, st) {
    v.root.position.set(obj.x, obj.y, obj.z);
    v.root.rotation.y = obj.yaw;
    v.hitV = Math.max(0, v.hitV - dt * 5);
    if (st.hit) v.hitV = 1;
    if (v.kind === "human") {
      const c = v.c;
      const A = c.anim;
      const sp = st.speed || 0;
      // legs
      const loco = sp > 6 ? "Sprint" : sp > 3.2 ? "Jog" : sp > 0.4 ? "Walk" : st.idle || "Idle";
      A.set("lower", loco, { speed: sp > 0.4 ? (loco === "Walk" ? Math.max(0.7, sp / 1.6) : loco === "Jog" ? Math.max(0.8, sp / 4.2) : Math.max(0.8, sp / 6.8)) : 1 });
      // torso
      if (st.upper) A.set("upper", st.upper, st.upperOpts || {});
      else A.set("upper", loco, { speed: sp > 0.4 ? (loco === "Walk" ? Math.max(0.7, sp / 1.6) : 1) : 1 });
      // full body one-shots
      if (st.full) A.set("full", st.full, st.fullOpts || {});
      else A.set("full", null);
      A.update(dt);
      if (st.aimPitch != null) c.aim(st.aimPitch * 0.8, 0);
      c.capeUpdate(dt, sp, st.turn || 0);
      c.setHit(v.hitV);
      if (st.dissolve != null) c.setDissolve(st.dissolve);
      c.tick(performance.now() / 1000);
    } else {
      v.k.update(dt, st.creature || {});
      v.k.setHit(v.hitV);
      if (st.dissolve != null) v.k.setDissolve(st.dissolve);
    }
  }

  return {
    live,
    /** The hero's view (rebuilt when the hero changes). */
    player: null,
    playerHero: null,
    ensurePlayer(G) {
      if (this.player && this.playerHero === G.P.hero) return this.player;
      if (this.player) this.remove(this.player);
      this.player = makeHuman(wizardLook(HEROES[G.P.hero].look));
      this.playerHero = G.P.hero;
      return this.player;
    },
    remove(v) {
      scene.remove(v.root);
      if (v.kind === "human") v.c.dispose();
      else v.k.dispose();
    },
    /** Wand tip in world space for the hero (spell origins in the renderer). */
    wandTip(v, out = tmpV) {
      if (!v || v.kind !== "human") return null;
      return v.c.tipWorld(out);
    },
    update(G, dt) {
      const p = G.player;
      // ---------------------------------------------------------- hero
      const pv = this.ensurePlayer(G);
      let upper = null;
      let upperOpts = {};
      let full = null;
      let fullOpts = {};
      if (p.dead) full = "Death";
      else if (p.dodgeT > 0) full = "Roll";
      else if (p.hurtT > 0.12) full = "HitBody";
      else if (p.castT > 0) {
        const quick = ["expelliarmus", "stupefy", "incendio", "volley"].includes(p.castSpell);
        const big = ["slam", "maxima", "totalum", "liftwave", "gather", "patronum"].includes(p.castSpell);
        if (big) {
          full = "Cast";
          fullOpts = { time: (0.42 - p.castT) * 2.4 };
        } else {
          upper = quick ? "Throw" : "Cast";
          upperOpts = { time: (0.42 - p.castT) * (quick ? 3.2 : 2.2) + 0.05, fade: 0.06 };
        }
      } else if (p.shieldT > 0) upper = "Block";
      else if (p.aiming) upper = "AimMid";
      sync(p, pv, dt, { speed: G.dialogue ? 0 : p.speed, upper, upperOpts, full, fullOpts, hit: p.hitT > 0.3, aimPitch: p.aiming ? G.camPitch : null, turn: 0, idle: G.inCombat() ? "BladeIdle" : "Idle" });
      pv.root.visible = !(G.cam && G.cam.dist < 0.9);

      // ---------------------------------------------------------- NPCs
      const seen = new Set();
      for (const n of G.npcs) {
        seen.add(n);
        let v = live.get(n);
        const near = Math.hypot(n.x - p.x, n.z - p.z) < 90;
        if (n.hidden || !near) {
          if (v) {
            this.remove(v);
            live.delete(n);
          }
          continue;
        }
        if (!v) {
          const look = wizardLook(n.def.look, n.companion ? {} : {});
          v = makeHuman(look, n.id === "hagrid" ? null : "wand");
          live.set(n, v);
        }
        const a = n.anim;
        const full = a === "down" ? "Death" : a === "cower" ? "CrouchIdle" : null;
        const idle = a === "Walk" ? "Idle" : a === "cower" || a === "down" ? "Idle" : a || "Idle";
        sync(n, v, dt, { speed: n.speed || 0, idle, upper: a === "Talk" ? "Talk" : a === "FoldArms" ? "FoldArms" : null, full, hit: n.hitT > 0 });
        if (n.hitT > 0) n.hitT = Math.max(0, n.hitT - dt);
      }
      // ---------------------------------------------------------- enemies
      for (const e of G.enemies) {
        seen.add(e);
        let v = live.get(e);
        if (!v) {
          v = viewForEnemy(e);
          live.set(e, v);
        }
        const st = { speed: e.speed || 0, hit: e.hitT > 0.1, creature: { speed: e.speed || 0, anim: e.anim, hitT: e.hitT } };
        const human = v.kind === "human";
        if (e.dead) {
          v.dis = Math.min(1, v.dis + dt * (e.yielded ? 0 : 0.35));
          st.full = e.yielded ? "CrouchIdle" : "Death";
          st.dissolve = e.deadT > 1.6 ? Math.min(1, (e.deadT - 1.6) * 0.5) : 0;
          if (e.silent) st.dissolve = 1;
        } else if (human) {
          switch (e.anim) {
            case "cast":
              st.upper = e.wind ? "CastIdle" : "Throw";
              break;
            case "windup":
              st.full = "Overhand";
              st.fullOpts = { time: 0.25 };
              break;
            case "attack":
              st.full = "SlashA";
              break;
            case "slam":
              st.full = "Overhand";
              break;
            case "stunned":
              st.full = "Stagger";
              st.fullOpts = { time: 0.35 };
              break;
            case "hit":
              st.full = "HitBody";
              break;
            case "lifted":
              st.full = "JumpLoop";
              break;
            case "disarmed":
              st.upper = "No";
              break;
            case "kneel":
              st.full = "CrouchIdle";
              break;
            case "channel":
              st.upper = "CastIdle";
              break;
            default:
              if (e.shieldT > 0) st.upper = "Block";
          }
          if (e.disarmT > 0 && v.c.weapon) v.c.weapon.visible = false;
          else if (v.c.weapon) v.c.weapon.visible = true;
        }
        sync(e, v, dt, st);
      }
      for (const [o, v] of live)
        if (!seen.has(o)) {
          this.remove(v);
          live.delete(o);
        }
    },
    viewOf(o) {
      return live.get(o);
    },
    dispose() {
      for (const v of live.values()) this.remove(v);
      live.clear();
      if (this.player) this.remove(this.player);
      this.player = null;
    },
  };
}
