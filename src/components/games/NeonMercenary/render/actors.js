/**
 * Mirrors sim entities (player, enemies, bosses, NPCs, civilians) with
 * rendered characters / drones, maps their sim state onto animation layers,
 * and handles hit flashes, cloaking, deaths and LOD.
 */
import * as THREE from "three";
import { createCharacter } from "./characters.js";
import { NPCS, CIVILIANS } from "../data/npcs.js";
import { WEAPONS } from "../data/weapons.js";
import { ARMOR } from "../data/items.js";
import { weaponByUid, armorByUid } from "../engine/profile.js";
import { BOSSES } from "../engine/bosses.js";

const tmp = new THREE.Vector3();
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const GUN_TYPES = new Set(["pistol", "heavyPistol", "smg", "shotgun", "ar", "energy", "minigun"]);

/* ------------------------------------------------------------ drones */
function createDrone(look) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: look.paint || "#2a2e36", roughness: 0.35, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: "#111216", roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: look.trim || "#ff3b5c", emissive: look.trim || "#ff3b5c", emissiveIntensity: 3, toneMapped: false });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12), paint);
  body.scale.set(1, 0.65, 1.15);
  root.add(body);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glow);
  eye.position.set(0, -0.02, 0.33);
  root.add(eye);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 24), dark);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.06), dark);
    arm.position.set(Math.cos(a) * 0.36, 0.05, Math.sin(a) * 0.36);
    arm.rotation.y = -a;
    root.add(arm);
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 12), new THREE.MeshBasicMaterial({ color: "#9aa", transparent: true, opacity: 0.25, depthWrite: false }));
    rot.position.set(Math.cos(a) * 0.56, 0.1, Math.sin(a) * 0.56);
    root.add(rot);
    rotors.push(rot);
  }
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), dark);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -0.2, 0.2);
  root.add(gun);
  root.traverse((o) => o.isMesh && (o.castShadow = true));
  return {
    root,
    drone: true,
    eye: glow,
    rotors,
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose?.();
        }
      });
    },
  };
}

/* ------------------------------------------------------------ looks */
function playerLook(P) {
  const head = armorByUid(P, P.equip.head);
  const bodyA = armorByUid(P, P.equip.body);
  const L = P.look;
  const suit = { jacket: "#2c2f3c", kevlar: "#2f362e", tactical: "#33383e", weave: "#261c2c", aegis: "#30343e" }[bodyA?.id] || "#2a2d38";
  const coat = { jacket: "#4a2a56", kevlar: "#3e4a3a", tactical: "#3c4450", weave: "#3a1c3a", aegis: "#4a505c" }[bodyA?.id] || "#3a3448";
  return {
    body: L.body,
    hair: L.hair,
    hairColor: L.hairColor || (L.body === "f" ? "#1a0f1f" : "#141010"),
    skin: L.skin,
    suit,
    coat,
    trim: L.accent || "#19f0ff",
    gear: "player",
    bodyArmor: bodyA?.id || null,
    headArmor: head?.id || null,
    helmet: head?.id === "helmet",
    armor: { kevlar: "#3a4038", tactical: "#3c4048", weave: "#2a2030", aegis: "#5a606c" }[bodyA?.id] || "#30343c",
  };
}
const lookKey = (l) => JSON.stringify(l);

export function createActors(scene, assets) {
  const views = new Map(); // entity → view
  let player = null;
  let playerKey = "";
  const npcViews = new Map();
  const civViews = [];
  let time = 0;

  function makeView(look, kind) {
    if (look.robot === "drone") return createDrone(look);
    const c = createCharacter(assets, look);
    c.kind = kind;
    return c;
  }

  function removeView(v) {
    scene.remove(v.root);
    v.dispose();
  }

  /* ------------------------------------------------------------ player */
  function updatePlayer(G, dt, cinematicHide) {
    const P = G.P;
    const look = playerLook(P);
    const key = lookKey(look);
    if (!player || key !== playerKey) {
      if (player) removeView(player);
      player = makeView(look, "player");
      playerKey = key;
      scene.add(player.root);
      player.curW = null;
    }
    const p = G.player;
    const v = player;
    v.root.visible = !cinematicHide;
    v.root.position.set(p.x, p.y, p.z);
    v.yaw = v.yaw == null ? p.yaw : lerpAngle(v.yaw, p.yaw, Math.min(1, dt * 18));
    v.root.rotation.y = v.yaw;
    const W = G.wpn;
    const def = W.def;
    const wk = def ? (def.melee ? "blade" : def.base ? WEAPONS[def.base].type : def.type) : null;
    if (wk !== v.curW) {
      v.setWeapon(wk, def?.color);
      v.curW = wk;
    }
    const A = v.anim;
    const speed = Math.hypot(p.vx, p.vz);
    const back = p.moveZ < -0.3;
    const crouch = p.crouchT > 0.5;
    // lower body
    let lower = "Idle";
    let ls = 1;
    if (!p.onGround && p.airT > 0.12) lower = "JumpLoop";
    else if (crouch) {
      lower = speed > 0.4 ? "CrouchWalk" : "CrouchIdle";
      ls = Math.max(0.6, speed / 1.6);
    } else if (speed > 6) {
      lower = "Sprint";
      ls = speed / 7;
    } else if (speed > 3.3) {
      lower = "Jog";
      ls = speed / 4.6;
    } else if (speed > 0.35) {
      lower = "Walk";
      ls = Math.max(0.6, speed / 2.2);
    }
    if (back && lower !== "Idle") ls = -Math.abs(ls);
    A.set("lower", lower, { speed: ls });
    // upper body
    const gun = GUN_TYPES.has(wk);
    let upper = lower;
    let uo = { speed: ls };
    const aimingNow = G.aimT > 0.3 || p.faceT > 0.25;
    if (gun) {
      if (W.reloadT > 0) {
        upper = "Reload";
        uo = { time: (1 - W.reloadT / (W.reloadTotal || 1)) * 1.6, fade: 0.1 };
      } else if (aimingNow) {
        upper = W.fireT > W.stats.interval - 0.12 && W.stats.interval > 0.15 ? "Shoot" : "AimMid";
        uo = upper === "Shoot" ? { restart: W.fireT > W.stats.interval - 0.02, fade: 0.05, speed: 1.4 } : { fade: 0.1 };
      } else if (lower === "Sprint") upper = "Sprint";
      else {
        upper = "GunIdle";
        uo = {};
      }
    } else if (wk === "blade") upper = lower === "Idle" ? "BladeIdle" : lower;
    A.set("upper", upper, uo);
    // full-body one-shots
    let full = null;
    let fo = {};
    if (p.dead) {
      full = "Death";
      fo = { fade: 0.2 };
    } else if (p.dodgeT > 0) {
      full = "Roll";
      fo = { time: (1 - p.dodgeT / 0.55) * 1.2, fade: 0.06 };
    } else if (W.swingT > 0) {
      if (W.swingBlade) {
        full = ["SlashA", "SlashB", "SlashC"][W.combo];
        const durs = [0.42, 0.46, 0.62];
        fo = { time: (1 - W.swingT / durs[W.combo]) * (W.combo === 2 ? 1.0 : 0.43), fade: 0.05 };
      } else {
        full = W.combo % 2 ? "Cross" : "Jab";
        fo = { time: (1 - W.swingT / 0.48) * 0.7, fade: 0.05 };
      }
    } else if (G.interacting) {
      full = "Interact";
      fo = { fade: 0.2, speed: 1 };
    } else if (G.cds.heal > 0.2) {
      full = "Consume";
      fo = { time: (1 - G.cds.heal / 0.9) * 1.1 };
    } else if (G.dialogue || G.hack) full = G.hack ? "Interact" : "Idle";
    A.set("full", full, fo);
    A.update(dt);
    // aim pitch (only when the upper body is in a gun pose)
    if (!full && gun && (upper === "AimMid" || upper === "Shoot")) v.aim(G.camPitch * 0.9);
    v.tick(time);
    const hurt = Math.max(0, 1 - (G.time - G.lastHurtT) * 6);
    v.setHit(hurt * 0.6);
    // shield buff shimmer
    if (v.uniforms) v.uniforms.uTrimI.value = G.buffs.shield > 0 ? 3 : G.buffs.neural > 0 ? 2.4 : 1.3;
  }

  /* ------------------------------------------------------------ enemies */
  function enemyLook(e) {
    if (e.boss) return BOSSES[e.boss.id].look;
    return e.look || e.def.look;
  }
  function enemyWeapon(e) {
    if (e.boss) return { razor: "smg", ironjaw: null, specter: "heavyPistol", vex: "energy" }[e.boss.id];
    const w = (e.look || e.def.look)?.weapon;
    return w || null;
  }
  function updateEnemy(G, e, v, dt, camPos) {
    const d = Math.hypot(e.x - camPos.x, e.z - camPos.z);
    v.root.visible = d < 110;
    v.root.position.set(e.x, e.y + (v.drone ? Math.sin(time * 3 + e.id) * 0.08 : 0), e.z);
    v.yaw = v.yaw == null ? e.yaw : lerpAngle(v.yaw, e.yaw, Math.min(1, dt * 12));
    v.root.rotation.y = v.yaw;
    if (v.drone) {
      for (const r of v.rotors) r.rotation.y += dt * 40;
      v.root.rotation.z = -e.vx * 0.04;
      v.root.rotation.x = e.vz * 0.04;
      v.eye.emissiveIntensity = e.stunT > 0 ? 0.3 + Math.random() : e.state === "combat" ? 4 : 2;
      if (e.state === "dead") {
        v.deadY = (v.deadY ?? e.y) - dt * 6;
        v.root.position.y = Math.max(0.3, v.deadY);
        v.root.rotation.z += dt * 6;
      }
      return;
    }
    // LOD: far characters animate at a lower rate
    v.acc = (v.acc || 0) + dt;
    const step = d > 45 ? 1 / 12 : d > 25 ? 1 / 30 : 0;
    if (step && v.acc < step) return;
    const adt = v.acc;
    v.acc = 0;
    const A = v.anim;
    const sp = Math.hypot(e.vx, e.vz);
    const gun = GUN_TYPES.has(v.curW);
    let lower = sp > 3 ? "Jog" : sp > 0.3 ? "Walk" : e.crouch ? "CrouchIdle" : "Idle";
    if (sp > 5.5) lower = "Sprint";
    const ls = lower === "Jog" ? sp / 4.4 : lower === "Walk" ? Math.max(0.6, sp / 1.6) : lower === "Sprint" ? sp / 7 : 1;
    A.set("lower", lower, { speed: ls });
    let upper = gun ? "GunIdle" : lower;
    let uo = { speed: ls };
    if (gun && (e.anim === "aim" || e.anim === "shoot" || e.state === "combat")) {
      upper = e.anim === "shoot" ? "Shoot" : "AimMid";
      uo = e.anim === "shoot" ? { restart: e.animT > 0.23, fade: 0.05 } : { fade: 0.12 };
    }
    A.set("upper", upper, uo);
    let full = null;
    let fo = {};
    const b = e.boss;
    if (e.state === "dead") {
      full = "Death";
      fo = { fade: 0.15 };
    } else if (e.anim === "stun" || e.anim === "stagger") full = "Stagger";
    else if (e.anim === "melee") {
      full = e.def?.look?.weapon === "pipe" ? "SlashB" : "Hook";
      fo = { fade: 0.08 };
    } else if (e.anim === "hit" && e.hitT > 0.05) {
      full = "HitBody";
      fo = { fade: 0.05 };
    } else if (b) {
      const a = e.anim;
      if (a === "taunt") full = b.id === "vex" ? "CastIdle" : "Talk";
      else if (a === "crouch") full = "CrouchIdle";
      else if (a === "dash" || a === "charge") full = "Sprint";
      else if (a === "slamWind") {
        full = "Throw";
        fo = { time: Math.min(0.6, (1.15 - b.actT) * 0.5) };
      } else if (a === "slam") full = "Throw";
      else if (a === "roar") full = "No";
      else if (a === "cast") full = b.act === "beam" ? "CastIdle" : "Cast";
      else if (a === "slash") full = "SlashA";
    }
    A.set("full", full, fo);
    A.update(adt);
    if (!full && gun && (upper === "AimMid" || upper === "Shoot")) {
      const p = G.player;
      const pitch = Math.atan2(p.y + 1.1 - (e.y + 1.4), Math.hypot(p.x - e.x, p.z - e.z));
      v.aim(pitch);
    }
    v.tick(time);
    v.setHit(Math.max(0, 1 - (G.time - e.lastHitT) * 7) * 0.7);
    if (b?.id === "specter") {
      const reveal = (b.revealT = Math.max(0, (b.revealT || 0) - dt));
      v.cloakV = (v.cloakV ?? 0) + ((b.cloak && reveal <= 0 ? 1 : 0) - (v.cloakV ?? 0)) * Math.min(1, dt * 6);
      v.setCloak(v.cloakV);
    }
    if (b?.id === "vex" && v.uniforms) v.uniforms.uTrimI.value = b.shieldOn ? 4 : b.vuln > 0 ? 0.5 : 2;
  }

  function syncEnemies(G, dt, camPos) {
    const live = new Set();
    for (const e of G.enemies) {
      live.add(e);
      let v = views.get(e);
      if (!v) {
        const look = enemyLook(e);
        v = makeView(look, "enemy");
        if (!v.drone) {
          const wk = enemyWeapon(e);
          v.setWeapon(wk === "minigun" ? null : wk, look.trim);
          v.curW = wk;
        }
        scene.add(v.root);
        views.set(e, v);
      }
      updateEnemy(G, e, v, dt, camPos);
    }
    for (const [e, v] of views)
      if (!live.has(e)) {
        removeView(v);
        views.delete(e);
      }
  }

  /* ------------------------------------------------------------ NPCs + civilians */
  function syncNpcs(G, dt, camPos) {
    const ids = new Set();
    for (const n of G.npcs) {
      ids.add(n.id);
      let v = npcViews.get(n.id);
      if (!v) {
        const d = NPCS[n.id];
        if (!d) continue;
        v = makeView(d.look, "npc");
        scene.add(v.root);
        npcViews.set(n.id, v);
      }
      v.root.visible = !n.hidden && Math.hypot(n.x - camPos.x, n.z - camPos.z) < 90;
      v.root.position.set(n.x, 0, n.z);
      v.root.rotation.y = n.yaw;
      const talking = n.talkT > 0 || (G.dialogue && G.dialogue.lines[G.dialogue.i]?.[0] === n.id);
      v.anim.set("lower", "Idle");
      v.anim.set("upper", "Idle");
      v.anim.set("full", talking ? "Talk" : n.anim || "Idle", { fade: 0.4 });
      v.anim.update(dt);
      v.tick(time);
    }
    for (const [id, v] of npcViews)
      if (!ids.has(id)) {
        removeView(v);
        npcViews.delete(id);
      }
    // civilians
    while (civViews.length < G.civilians.length) {
      const c = G.civilians[civViews.length];
      const v = makeView(CIVILIANS[c.look % CIVILIANS.length], "civ");
      scene.add(v.root);
      civViews.push(v);
    }
    while (civViews.length > G.civilians.length) removeView(civViews.pop());
    G.civilians.forEach((c, i) => {
      const v = civViews[i];
      const d = Math.hypot(c.x - camPos.x, c.z - camPos.z);
      v.root.visible = d < 80;
      if (!v.root.visible) return;
      v.root.position.set(c.x, 0, c.z);
      v.root.rotation.y = c.yaw;
      const run = (c.speedNow || 1) > 3;
      v.acc = (v.acc || 0) + dt;
      if (d > 35 && v.acc < 1 / 15) return;
      v.anim.set("lower", run ? "Jog" : "Walk", { speed: run ? 1 : (c.speedNow || 1.2) / 1.4 });
      v.anim.set("upper", run ? "Jog" : c.id % 3 === 0 ? "Phone" : "Walk", { speed: run ? 1 : (c.speedNow || 1.2) / 1.4 });
      v.anim.set("full", null);
      v.anim.update(v.acc);
      v.acc = 0;
    });
  }

  return {
    update(G, dt, camPos, opts = {}) {
      time += dt;
      updatePlayer(G, dt, opts.hidePlayer);
      syncEnemies(G, dt, camPos);
      syncNpcs(G, dt, camPos);
    },
    playerView: () => player,
    viewOf: (e) => views.get(e),
    clear() {
      for (const [, v] of views) removeView(v);
      views.clear();
      for (const [, v] of npcViews) removeView(v);
      npcViews.clear();
      while (civViews.length) removeView(civViews.pop());
    },
    dispose() {
      this.clear();
      if (player) removeView(player);
      player = null;
    },
  };
}

export { ARMOR, weaponByUid, tmp };
