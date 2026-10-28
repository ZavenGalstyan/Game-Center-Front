/**
 * Mirrors simulation actors with rendered characters and creatures, maps
 * sim state onto animation layers (one-shots scrubbed by sim time so a
 * swing's arc lands on the frame the simulation applies the hit), and
 * draws projectiles, stuck arrows, loot drops and the Ashen Anchors.
 *
 * LOD: humans beyond 95 m are hidden; beyond 40 m their animation updates
 * at a lower rate.
 */
import * as THREE from "three";
import { createCharacter } from "./characters.js";
import { createWolf, createDeer, createDragonModel } from "./creatures.js";
import { playerLook, weaponView } from "../engine/profile.js";
import { HEROES, ABILITIES } from "../data/heroes.js";

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const WEAPON_GLOW = { rare: null, epic: "#c07aff", legendary: "#ffa83a" };

export function createActors(scene, assets, fx) {
  const group = new THREE.Group();
  group.name = "actors";
  scene.add(group);
  const views = new Map(); // actor → view
  let player = null;
  let playerKey = "";
  let dragonView = null;
  let frame = 0;
  const tmp = new THREE.Vector3();

  function human(look, weapon, extra = {}) {
    const c = createCharacter(assets, look || {});
    if (weapon) c.setWeapon(weapon, extra.weaponOpts);
    if (extra.offhand) c.setOffhand(extra.offhand);
    if (extra.shield) c.setShield(extra.shield.shape, extra.shield.sigil, extra.shield.color);
    group.add(c.root);
    c.kind = "human";
    return c;
  }
  function drop(v) {
    group.remove(v.root);
    v.dispose();
  }

  /* ------------------------------------------------------------ animation mapping */
  function locomotion(v, a, o = {}) {
    const sp = a.speed || 0;
    let lower = "Idle";
    let ls = 1;
    if (a.onGround === false && a.airT > 0.15) lower = "JumpLoop";
    else if (sp > 6.2) {
      lower = "Sprint";
      ls = sp / 7.6;
    } else if (sp > 2.6) {
      lower = "Jog";
      ls = sp / 5.0;
    } else if (sp > 0.3) {
      lower = "Walk";
      ls = Math.max(0.6, sp / 1.9);
    }
    if (o.back && lower !== "Idle") ls = -Math.abs(ls);
    v.anim.set("lower", lower, { speed: ls });
    return { lower, ls };
  }
  function scrub(v, clip, k, len, fade = 0.08) {
    v.anim.set("full", clip, { time: Math.max(0, Math.min(1, k)) * (len || v.anim.duration(clip)), fade });
  }

  function animatePlayer(G, v, dt) {
    const p = G.player;
    const P = G.P;
    const L = locomotion(v, p, { back: p.moveZ < -0.3 && (p.blocking || p.aiming || p.draw > 0) });
    const a = p.action;
    // upper body stance
    let upper = L.lower;
    let uo = { speed: L.ls };
    if (P.hero === "knight" && p.blocking) {
      upper = "ShieldIdle";
      uo = { fade: 0.08 };
    } else if (P.hero === "rogue" && p.blocking) {
      upper = "BladeIdle";
      uo = { fade: 0.08 };
    } else if (P.hero === "mage" && p.blocking) {
      upper = "CastIdle";
      uo = { fade: 0.1 };
    } else if (P.hero === "archer" && (p.aiming || p.draw > 0)) {
      upper = "AimMid";
      uo = { fade: 0.1 };
    } else if (P.hero === "mage" && a?.type === "charge") {
      upper = "CastIdle";
      uo = { fade: 0.1 };
    } else if (L.lower === "Idle" && G.inCombat() && (P.hero === "knight" || P.hero === "rogue")) {
      upper = "BladeIdle";
      uo = {};
    }
    v.anim.set("upper", upper, uo);
    // full-body one-shots
    let full = null;
    if (p.dead) v.anim.set("full", "Death", { fade: 0.2 });
    else if (a) {
      switch (a.type) {
        case "attack":
        case "heavy":
          scrub(v, a.move.clip, a.t / a.move.dur, a.move.clipLen, 0.05);
          full = a.move.clip;
          break;
        case "charge":
          if (P.hero !== "mage") {
            scrub(v, "BladeHeavy", Math.min(0.24, a.t * 0.3), 1.53, 0.12);
            full = "BladeHeavy";
          }
          break;
        case "dodge":
          scrub(v, "Roll", a.t / a.dur, 1.25, 0.05);
          full = "Roll";
          break;
        case "ability": {
          const A = ABILITIES[a.id];
          if (A.clip) {
            scrub(v, A.clip, a.t / a.dur, A.clipLen, 0.06);
            full = A.clip;
          }
          break;
        }
        case "cast":
          scrub(v, "Cast", a.t / a.dur, 0.5, 0.05);
          full = "Cast";
          break;
        case "potion":
          scrub(v, "Consume", a.t / a.dur, 1.2, 0.1);
          full = "Consume";
          break;
        case "interact":
          scrub(v, "Interact", a.t / a.dur, 1.4, 0.1);
          full = "Interact";
          break;
        case "stagger":
          scrub(v, "HitBody", a.t / Math.max(0.2, a.dur), 0.33, 0.04);
          full = "HitBody";
          break;
      }
      if (!full && !p.dead) v.anim.set("full", null);
    } else if (!p.dead) v.anim.set("full", null);
    v.anim.update(dt);
    if (P.hero === "archer" && (p.aiming || p.draw > 0)) v.aim(G.camPitch * 0.85);
    else if (P.hero === "mage" && (p.blocking || a?.type === "charge")) v.aim(G.camPitch * 0.6);
    if (p.draw > 0) v.bowPose(Math.min(1, p.draw / 0.5));
  }

  function animateEnemyHuman(G, v, e, dt) {
    if (e.dead) {
      v.anim.set("full", "Death", { fade: 0.15 });
      v.anim.update(dt);
      return;
    }
    const L = locomotion(v, e);
    let upper = L.lower === "Idle" && (e.target || e.state === "guard") ? (e.shield ? "ShieldIdle" : "BladeIdle") : L.lower;
    if (e.weapon === "bow" && (e.state === "engage" || e.state === "attack")) upper = "AimMid";
    v.anim.set("upper", upper, { speed: L.ls });
    const at = e.atk;
    if (e.state === "attack" && at) {
      const A = at.def;
      if (A.kind === "shoot") {
        v.anim.set("upper", "AimMid", { fade: 0.1 });
        v.anim.set("full", null);
      } else {
        const clip = A.clip || "SlashA";
        const len = A.clipLen || v.anim.duration(clip);
        const hitAt = 0.45;
        const k = at.phase === "windup" ? (at.t / at.windup) * hitAt : at.phase === "strike" ? hitAt + 0.05 : hitAt + (at.t / A.recover) * (1 - hitAt);
        scrub(v, clip, k, len, 0.06);
      }
    } else if (e.state === "stagger") scrub(v, e.staggerDur > 0.8 ? "Stagger" : "HitBody", e.t / e.staggerDur, e.staggerDur > 0.8 ? 1.07 : 0.33, 0.05);
    else if (e.state === "collapsed") scrub(v, e.t < 3.2 ? "Death" : "GetUp", e.t < 3.2 ? Math.min(1, e.t * 1.5) : (e.t - 3.2) / 0.8, e.t < 3.2 ? 2.4 : 1.53, 0.1);
    else if (e.state === "yield") v.anim.set("full", "CrouchIdle", { fade: 0.3 });
    else if (e.flinchT > 0) {
      v.anim.set("full", null);
      v.anim.set("upper", "HitBody", { fade: 0.03 });
    } else v.anim.set("full", null);
    v.anim.update(dt);
  }

  function animateNpc(G, v, n, dt) {
    if (n.speed > 0.2) {
      v.anim.set("lower", "Walk", { speed: n.speed / 1.4 });
      v.anim.set("upper", "Walk", { speed: n.speed / 1.4 });
      v.anim.set("full", null);
    } else {
      const idle = n.talking ? "Talk" : n.idle || "Idle";
      if (["Sit", "Fix", "CrouchIdle", "Lean"].includes(idle)) {
        v.anim.set("full", idle, { fade: 0.3 });
      } else {
        v.anim.set("full", null);
        v.anim.set("lower", "Idle");
        v.anim.set("upper", idle);
      }
    }
    v.anim.update(dt);
  }
  function animateAlly(G, v, a, dt) {
    if (a.downed) {
      v.anim.set("full", "CrouchIdle", { fade: 0.2 });
      v.anim.update(dt);
      return;
    }
    const L = locomotion(v, a);
    v.anim.set("upper", a.shootT > 0 ? "AimMid" : L.lower, { speed: L.ls });
    if (a.swingT > 0) scrub(v, "SlashA", 1 - a.swingT / 0.5, 0.43, 0.05);
    else if (a.state === "stagger") scrub(v, "HitBody", a.t / 0.3, 0.33, 0.04);
    else v.anim.set("full", null);
    v.anim.update(dt);
  }

  /* ------------------------------------------------------------ projectiles */
  const projGroup = new THREE.Group();
  group.add(projGroup);
  const PM = {
    wood: new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: "#c0c4cc", roughness: 0.3, metalness: 0.9 }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4) }),
    ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 0.2) }),
    feather: new THREE.MeshStandardMaterial({ color: "#e8e0d0", roughness: 0.9, side: THREE.DoubleSide }),
    redFeather: new THREE.MeshStandardMaterial({ color: "#a82418", roughness: 0.9, side: THREE.DoubleSide }),
  };
  const PG = {
    shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5).rotateX(Math.PI / 2),
    head: new THREE.ConeGeometry(0.03, 0.09, 5).rotateX(Math.PI / 2).translate(0, 0, 0.44),
    fletch: new THREE.PlaneGeometry(0.05, 0.14).rotateY(Math.PI / 2).translate(0, 0, -0.34),
    orb: new THREE.SphereGeometry(1, 12, 8),
    knife: new THREE.BoxGeometry(0.03, 0.01, 0.26),
    bolt: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).rotateX(Math.PI / 2),
  };
  function projMesh(kind) {
    const g = new THREE.Group();
    if (kind === "arrow" || kind === "enemyArrow") {
      g.add(new THREE.Mesh(PG.shaft, PM.wood), new THREE.Mesh(PG.head, PM.steel), new THREE.Mesh(PG.fletch, kind === "arrow" ? PM.feather : PM.redFeather));
    } else if (kind === "knife") g.add(new THREE.Mesh(PG.knife, PM.steel));
    else if (kind === "ballista") g.add(new THREE.Mesh(PG.bolt, PM.wood));
    else {
      const s = kind === "fireball" ? 0.32 : kind === "dragonfire" ? 0.8 : kind === "emberbolt" ? 0.18 : 0.16;
      const m = new THREE.Mesh(PG.orb, kind === "emberbolt" ? PM.ember : PM.fire);
      m.scale.setScalar(s);
      g.add(m);
    }
    projGroup.add(g);
    return g;
  }
  const projViews = new Map();
  const stuck = [];
  function updateProjectiles(G, dt) {
    const seen = new Set();
    for (const p of G.projectiles) {
      if (p.dead || p.interior !== G.player.interior) continue;
      seen.add(p.id);
      let m = projViews.get(p.id);
      if (!m) {
        m = projMesh(p.kind);
        projViews.set(p.id, m);
      }
      m.position.set(p.x, p.y, p.z);
      tmp.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      m.lookAt(tmp);
      if (p.kind === "knife") m.rotateX(G.time * 30);
      const tr = p.kind === "fireball" || p.kind === "firebolt" || p.kind === "dragonfire" ? "fire" : p.kind === "emberbolt" ? "corrupt" : p.kind === "ballista" ? "bolt" : p.kind === "arrow" ? "arrow" : null;
      if (tr) fx.trail(tr, p.x, p.y, p.z);
      if (p.kind === "dragonfire" && Math.random() < 0.6) fx.trail("fire", p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5));
    }
    for (const [id, m] of projViews)
      if (!seen.has(id)) {
        projGroup.remove(m);
        projViews.delete(id);
      }
    for (let i = stuck.length - 1; i >= 0; i--) {
      stuck[i].t -= dt;
      if (stuck[i].t <= 0) {
        projGroup.remove(stuck[i].m);
        stuck.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------ drops & anchors */
  const dropViews = new Map();
  const sackGeo = new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.8, 1);
  const sackMat = new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.9 });
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 2.4, 6, 1, true).translate(0, 1.2, 0);
  function updateDrops(G) {
    const seen = new Set();
    for (const d of G.drops) {
      if (d.taken || d.interior !== G.player.interior) continue;
      seen.add(d.id);
      let v = dropViews.get(d.id);
      if (!v) {
        v = new THREE.Group();
        const s = new THREE.Mesh(sackGeo, sackMat);
        s.position.y = 0.16;
        s.castShadow = true;
        v.add(s);
        const rare = d.items.find(([id]) => ["rare", "epic", "legendary"].includes(G.itemRarity?.(id)));
        const col = rare ? (G.itemRarity(rare[0]) === "legendary" ? "#ffa83a" : G.itemRarity(rare[0]) === "epic" ? "#c07aff" : "#5aa8ff") : d.items.length ? "#e8e0c0" : "#ffd25a";
        const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        v.add(beam);
        v.userData.beam = beam;
        v.position.set(d.x, d.y, d.z);
        group.add(v);
        dropViews.set(d.id, v);
      }
      v.userData.beam.material.opacity = 0.25 + Math.sin(G.time * 3 + d.id) * 0.1;
    }
    for (const [id, v] of dropViews)
      if (!seen.has(id)) {
        group.remove(v);
        v.userData.beam.material.dispose();
        dropViews.delete(id);
      }
  }

  /* ------------------------------------------------------------ main update */
  const frustum = new THREE.Frustum();
  const projM = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let camRef = null;
  function syncHuman(G, a, makeLook, dt, animate, far) {
    let v = views.get(a);
    if (!v) {
      const lk = makeLook();
      v = human(lk.look, lk.weapon, lk.extra || {});
      v.yaw = a.yaw;
      views.set(a, v);
    }
    v.root.visible = !far.hide;
    if (far.hide) return v;
    v.root.position.set(a.x, a.y + (a.yOff || 0), a.z);
    v.setShadow(!!far.shadow);
    v.yaw = lerpAngle(v.yaw ?? a.yaw, a.yaw, Math.min(1, dt * 14));
    v.root.rotation.y = v.yaw;
    if (!far.skip) animate(G, v, a, dt * (far.mult || 1));
    v.setHit(Math.min(1, (a.hitFlash || 0) / 0.18));
    if (a.dead) v.setDissolve(Math.max(0, Math.min(1, ((a.deadT || 0) - 1.6) / 1.6)));
    v.capeUpdate(dt, a.speed || 0, 0);
    v.tick(G.time);
    return v;
  }

  function update(G, dt, cam, camera) {
    frame++;
    if (camera) {
      camera.updateMatrixWorld();
      projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projM);
      camRef = camera;
    }
    const p = G.player;
    // ---------------------------------------------------- player
    const look = playerLook(G.P);
    const wv = weaponView(G.P);
    const key = JSON.stringify([look, wv]);
    if (!player || key !== playerKey) {
      if (player) drop(player);
      player = human(look, wv.weapon, { offhand: wv.offhand, shield: wv.shield, weaponOpts: wv.glow ? { style: { accent: wv.glow, glow: 2 } } : undefined });
      playerKey = key;
      player.yaw = p.yaw;
    }
    player.root.position.set(p.x, p.y, p.z);
    player.yaw = lerpAngle(player.yaw, p.yaw, Math.min(1, dt * 16));
    player.root.rotation.y = player.yaw;
    animatePlayer(G, player, dt);
    player.setHit(Math.min(1, p.hitFlash / 0.18));
    player.setStealth(p.buffs.vanish > 0 ? 0.8 : 0);
    player.capeUpdate(dt, p.speed, 0);
    player.tick(G.time);
    // camera too close? fade the hero out
    const camD = Math.hypot(cam.x - p.x, cam.y - (p.y + 1.4), cam.z - p.z);
    player.root.visible = camD > 0.7;
    // ---------------------------------------------------- others
    const alive = new Set();
    const lodFor = (a) => {
      if (a.interior !== p.interior) return { hide: true };
      const d = Math.hypot(a.x - cam.x, a.z - cam.z);
      if (d > 72) return { hide: true };
      // the camera is inside them: don't fill the screen with a torso
      if (d < 1.3 && Math.abs(cam.y - (a.y + 1)) < 1.4) return { hide: true };
      sphere.center.set(a.x, a.y + 1, a.z);
      sphere.radius = 1.6;
      if (camRef && !frustum.intersectsSphere(sphere)) return { hide: true };
      if (d > 30) return { skip: (frame + (a.id || 0)) % 3 !== 0, mult: 3 };
      if (d > 16) return { skip: (frame + (a.id || 0)) % 2 !== 0, mult: 2, shadow: true };
      return { shadow: true };
    };
    for (const e of G.enemies) {
      if (e.despawn) continue;
      alive.add(e);
      const far = lodFor(e);
      if (e.def.creature === "wolf") {
        let v = views.get(e);
        if (!v) {
          v = createWolf({ scale: e.def.scale || 1, snow: e.snow, alpha: !!e.def.alpha });
          group.add(v.root);
          views.set(e, v);
          v.yaw = e.yaw;
        }
        v.root.visible = !far.hide;
        if (far.hide) continue;
        v.root.position.set(e.x, e.y, e.z);
        v.yaw = lerpAngle(v.yaw, e.yaw, Math.min(1, dt * 12));
        v.root.rotation.y = v.yaw;
        const at = e.atk;
        v.update(dt, { speed: e.speed, windup: e.state === "attack" && at?.phase === "windup", windupK: at ? at.t / (at.windup || 1) : 0, lunging: e.lungeT > 0, howl: at?.def.kind === "howl", dead: e.dead, deadT: e.deadT, hit: Math.min(1, (e.hitFlash || 0) / 0.18), dissolve: e.dead ? Math.max(0, (e.deadT - 1.8) / 1.5) : 0 });
        continue;
      }
      syncHuman(
        G,
        e,
        () => ({ look: e.look, weapon: e.weapon, extra: { shield: e.shield } }),
        dt,
        animateEnemyHuman,
        far
      );
    }
    for (const a of G.allies) {
      alive.add(a);
      syncHuman(G, a, () => ({ look: a.look, weapon: a.weapon }), dt, animateAlly, lodFor(a));
    }
    for (const n of G.npcs) {
      alive.add(n);
      syncHuman(G, n, () => ({ look: n.look, weapon: n.weapon }), dt, animateNpc, lodFor(n));
    }
    for (const w of G.wildlife) {
      alive.add(w);
      let v = views.get(w);
      if (!v) {
        v = createDeer();
        group.add(v.root);
        views.set(w, v);
        v.yaw = w.yaw;
      }
      const far = lodFor(w);
      v.root.visible = !far.hide && !(w.dead && w.deadT > 4);
      if (far.hide) continue;
      v.root.position.set(w.x, w.y, w.z);
      v.yaw = lerpAngle(v.yaw, w.yaw, Math.min(1, dt * 10));
      v.root.rotation.y = v.yaw;
      v.update(dt, { speed: w.speed, graze: w.state === "graze", dead: w.dead, deadT: w.deadT, hit: Math.min(1, w.hitFlash / 0.18), dissolve: w.dead ? Math.max(0, (w.deadT - 2) / 1.5) : 0 });
    }
    for (const [a, v] of views)
      if (!alive.has(a)) {
        drop(v);
        views.delete(a);
      }
    // ---------------------------------------------------- dragon
    const D = G.dragon;
    if (D && D.state !== "gone" && !p.interior) {
      if (!dragonView) {
        dragonView = createDragonModel();
        group.add(dragonView.root);
      }
      dragonView.root.visible = true;
      dragonView.root.position.set(D.x, D.y + D.alt, D.z);
      dragonView.root.rotation.y = D.yaw;
      const A = D.atk;
      dragonView.update(dt, {
        speed: D.speed || 0,
        flying: D.alt > 1.5,
        neck: A?.id === "bite" ? (A.phase === "windup" ? -A.t / A.windup : 1) : 0,
        tail: A?.id === "tail" ? (A.phase === "windup" ? A.t / A.windup : 1) : 0,
        jaw: A && A.phase === "windup" ? 1 : 0,
        breath: !!D.breath,
        down: D.down,
        roar: D.state === "roar" || (A && A.id === "nova" && A.phase === "windup"),
        phase: D.phase,
        hit: Math.min(1, D.hitFlash / 0.18),
        dissolve: D.state === "slain" ? Math.max(0, ((D.deadT || 0) - 2.5) / 3) : 0,
        t: G.time,
      });
      if (D.breath) {
        const h = dragonView.headWorld(tmp);
        const fx2 = Math.sin(D.yaw);
        const fz2 = Math.cos(D.yaw);
        fx.jet(h.x + fx2 * 1.2, h.y - 0.2, h.z + fz2 * 1.2, fx2, -0.22, fz2, 19, 7, 0.2);
      }
    } else if (dragonView) dragonView.root.visible = false;
    updateProjectiles(G, dt);
    updateDrops(G);
  }

  return {
    group,
    update,
    playerView: () => player,
    viewOf: (a) => views.get(a),
    dragonView: () => dragonView,
    stick(x, y, z, dx, dy, dz, kind) {
      const m = projMesh(kind);
      m.position.set(x - dx * 0.25, y - dy * 0.25, z - dz * 0.25);
      tmp.set(x + dx, y + dy, z + dz);
      m.lookAt(tmp);
      stuck.push({ m, t: 12 });
      if (stuck.length > 40) {
        projGroup.remove(stuck[0].m);
        stuck.shift();
      }
    },
    clear() {
      for (const [, v] of views) drop(v);
      views.clear();
    },
    dispose() {
      this.clear();
      if (player) drop(player);
      if (dragonView) {
        group.remove(dragonView.root);
        dragonView.dispose();
      }
      scene.remove(group);
      Object.values(PG).forEach((g) => g.dispose());
      Object.values(PM).forEach((m) => m.dispose());
      sackGeo.dispose();
      sackMat.dispose();
      beamGeo.dispose();
    },
  };
}

export { HEROES };
