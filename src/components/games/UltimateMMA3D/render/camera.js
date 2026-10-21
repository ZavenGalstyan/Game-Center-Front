/**
 * Broadcast camera director.
 *
 *  fight    side-on to the line between the fighters, zoom fitted to their
 *           separation and the viewport's aspect (both always in frame), side
 *           chosen with hysteresis (never flips across the fighters), lower and
 *           tighter for ground work, eased with critically-damped springs.
 *  intro    scripted shots: venue establishing orbit → fighter A → fighter B → face-off
 *  replay   slow low orbit around the finishing blow
 *  victory  low orbit around the winner
 *  menu     slow cinematic orbit (menu backdrop) · showcase: close orbit of one fighter
 *
 * Collision avoidance: the camera stays inside the cage, or rises above the
 * fence when it has to back out through it, and never enters the stands.
 */
import * as THREE from "three";
import { OCT_APOTHEM } from "../engine/constants.js";
import { FENCE_H } from "./arena.js";

const _v = new THREE.Vector3();

function spring(cur, vel, target, w, dt) {
  // critically damped: x'' = −w²(x − target) − 2w·x'  (sub-stepped for stability)
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    for (const c of ["x", "y", "z"]) {
      vel[c] += (-w * w * (cur[c] - target[c]) - 2 * w * vel[c]) * h;
      cur[c] += vel[c] * h;
    }
  }
  return cur;
}

export function createDirector(camera, arenaRadius = 7) {
  const pos = new THREE.Vector3(0, 2.2, 6);
  const look = new THREE.Vector3(0, 1.1, 0);
  const vPos = new THREE.Vector3();
  const vLook = new THREE.Vector3();
  let side = 1;
  let shake = 0;
  let mode = "menu";
  let modeT = 0;
  let orbitA = 0;
  const avoid = (p) => {
    const r = Math.hypot(p.x, p.z);
    const maxR = arenaRadius - 0.6;
    if (r > maxR) {
      p.x *= maxR / r;
      p.z *= maxR / r;
    }
    if (Math.hypot(p.x, p.z) > OCT_APOTHEM - 0.35 && p.y < FENCE_H + 0.45) p.y = FENCE_H + 0.45;
    if (p.y < 0.35) p.y = 0.35;
    return p;
  };

  return {
    get mode() {
      return mode;
    },
    setArenaRadius(r) {
      arenaRadius = r;
    },
    setMode(m, snap = false) {
      if (m !== mode) modeT = 0;
      mode = m;
      if (snap) vPos.set(0, 0, 0);
    },
    shake(a) {
      shake = Math.min(0.12, shake + a);
    },
    /** ctx: { a, b (THREE.Vector3 positions), ground, focus, aspect, intro: {t, a, b, ya, yb} } */
    update(dt, ctx) {
      modeT += dt;
      let tp;
      let tl;
      let k = 4.2;
      const aspect = ctx.aspect || 16 / 9;
      if (mode === "fight" && ctx.a && ctx.b) {
        const mid = ctx.a.clone().add(ctx.b).multiplyScalar(0.5);
        const d = new THREE.Vector3().subVectors(ctx.b, ctx.a);
        d.y = 0;
        const sep = Math.max(0.5, d.length());
        d.normalize();
        let n = new THREE.Vector3(-d.z, 0, d.x);
        // hysteresis: stay on the side the camera is already on
        const cur = new THREE.Vector3().subVectors(pos, mid).setY(0);
        if (cur.dot(n) * side < -0.25 * cur.length()) side = -side;
        // prefer the side that keeps the camera away from the fence
        n.multiplyScalar(side);
        const vfov = THREE.MathUtils.degToRad(camera.fov);
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
        const halfW = sep / 2 + (ctx.ground ? 1.1 : 0.85);
        let dist = Math.max(ctx.ground ? 3.2 : 3.4, halfW / Math.tan(hfov / 2) + 0.4);
        dist = Math.min(dist, 7.5);
        const h = ctx.ground ? 2.35 : 1.75 + sep * 0.12;
        tp = mid.clone().addScaledVector(n, dist);
        tp.y = h;
        // slight angle toward the player for readability
        if (ctx.playerSide !== undefined) {
          const pv = ctx.playerSide === 0 ? ctx.a : ctx.b;
          tp.addScaledVector(new THREE.Vector3().subVectors(mid, pv).setY(0).normalize(), -0.55);
        }
        tl = mid.clone();
        tl.y = ctx.ground ? 0.45 : 1.15;
        k = 3.6;
      } else if (mode === "intro" && ctx.intro) {
        const { t, a, b } = ctx.intro;
        if (t < 3.2) {
          const ang = -0.6 + t * 0.32;
          tp = new THREE.Vector3(Math.sin(ang) * 9, 4.2 - t * 0.5, Math.cos(ang) * 9);
          tl = new THREE.Vector3(0, 0.9, 0);
          k = 6;
        } else if (t < 6.4) {
          const f = a;
          const ang = (ctx.intro.ya || 0) + 0.5 - (t - 3.2) * 0.12;
          tp = f.clone().add(new THREE.Vector3(Math.sin(ang) * 1.55, 1.55, Math.cos(ang) * 1.55));
          tl = f.clone().add(new THREE.Vector3(0, 1.45, 0));
          k = t < 3.4 ? 30 : 6;
        } else if (t < 9.6) {
          const f = b;
          const ang = (ctx.intro.yb || 0) - 0.5 + (t - 6.4) * 0.12;
          tp = f.clone().add(new THREE.Vector3(Math.sin(ang) * 1.55, 1.55, Math.cos(ang) * 1.55));
          tl = f.clone().add(new THREE.Vector3(0, 1.45, 0));
          k = t < 6.6 ? 30 : 6;
        } else {
          const mid = a.clone().add(b).multiplyScalar(0.5);
          tp = mid.clone().add(new THREE.Vector3(0, 1.9, 4.2));
          tl = mid.clone().setY(1.3);
          k = t < 9.8 ? 30 : 4;
        }
      } else if (mode === "replay" && ctx.focus) {
        orbitA += dt * 0.35;
        tp = ctx.focus.clone().add(new THREE.Vector3(Math.sin(orbitA) * 2.6, 0.9, Math.cos(orbitA) * 2.6));
        tl = ctx.focus.clone().setY(1.1);
        k = 5;
      } else if (mode === "victory" && ctx.focus) {
        orbitA += dt * 0.25;
        tp = ctx.focus.clone().add(new THREE.Vector3(Math.sin(orbitA) * 2.8, 0.75, Math.cos(orbitA) * 2.8));
        tl = ctx.focus.clone().setY(1.55);
        k = 3;
      } else if (mode === "showcase" && ctx.focus) {
        orbitA += dt * 0.22;
        const r = ctx.zoom ?? 2.7;
        tp = ctx.focus.clone().add(new THREE.Vector3(Math.sin(orbitA) * r, 1.35, Math.cos(orbitA) * r));
        tl = ctx.focus.clone().add(new THREE.Vector3(ctx.offsetX ?? 0, 1.1, 0));
        k = 4;
      } else {
        orbitA += dt * 0.06;
        tp = new THREE.Vector3(Math.sin(orbitA) * 8.5, 3.6, Math.cos(orbitA) * 8.5);
        tl = new THREE.Vector3(0, 0.6, 0);
        k = 2;
      }
      avoid(tp);
      if (modeT < 0.02 && (mode === "intro" || mode === "replay")) {
        pos.copy(tp);
        look.copy(tl);
        vPos.set(0, 0, 0);
        vLook.set(0, 0, 0);
      }
      spring(pos, vPos, tp, k, dt);
      spring(look, vLook, tl, k * 1.3, dt);
      avoid(pos);
      camera.position.copy(pos);
      if (shake > 0) {
        camera.position.add(_v.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
        shake = Math.max(0, shake - dt * 0.6);
      }
      camera.lookAt(look);
    },
  };
}
