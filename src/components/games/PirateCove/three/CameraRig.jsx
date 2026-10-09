/**
 * Pirate Cove — the one camera, driven by game mode:
 *
 *   sea      chase cam behind/above the ship; distance and height scale with
 *            the hull, widen slightly with speed (and FOV opens a touch);
 *            lags the heading so turns feel weighty; mouse free-look
 *            (game.seaLook) eases back behind the stern; shake from
 *            game.shake (scaled by settings, off with reduced motion)
 *   ashore   third-person orbit around the pirate's shoulders; pulled in
 *            against terrain, walls (box colliders) and cave rock
 *   finale   slow orbit around the treasure
 *   lost     rises and drifts back over the wreck
 * It also writes `focus` (what the sun's shadow camera centres on).
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MODE } from "../engine/constants.js";
import { forwardOf } from "../engine/ship.js";
import { caveSDF, caveCeil } from "../engine/cave.js";
import { STEP_UP } from "../engine/onfoot.js";

const tmp = new THREE.Vector3();
const look = new THREE.Vector3();

function boxBlocks(A, x, y, z) {
  for (const b of A.boxes) {
    if (b.gate && b.gate.open) continue;
    if (y > b.top + 0.2) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(b.rot || 0);
    const s = Math.sin(b.rot || 0);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < b.hw + 0.25 && Math.abs(lz) < b.hd + 0.25 && b.top > STEP_UP + 0.5) return true;
  }
  return false;
}

export default function CameraRig({ game, focus, settings }) {
  const { camera } = useThree();
  const st = useRef({ yaw: null, dist: 30, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), init: false, footDist: 5, lastMode: null, fov: 55 });
  const reduced = settings.reducedMotion;
  const shakeAmt = reduced ? 0 : settings.cameraShake ?? 1;

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const P = game.player;
    const mode = game.mode;
    const t = clock.elapsedTime;
    let pos = tmp;
    let target = look;
    let fov = 55;
    let snap = !s.init;
    const onFoot = (mode === MODE.ISLAND || mode === MODE.DEFEATED || mode === MODE.BOARDING) && game.pirate;
    if (s.lastMode !== (onFoot ? "foot" : "sea")) {
      snap = true; // mode switches happen under the fade
      s.lastMode = onFoot ? "foot" : "sea";
    }

    if (mode === MODE.ADVENTURE_COMPLETE && game.finale) {
      const F = game.finale;
      // a slow drift around the pirate's side of the chest, easing up and back
      const a = F.from + Math.sin(F.t * 0.35) * 0.45 + 0.25;
      const d = 3.4 + Math.min(1.6, F.t * 0.25);
      pos.set(F.x + Math.sin(a) * d, F.y + 1.9 + Math.min(1.6, F.t * 0.22), F.z + Math.cos(a) * d);
      target.set(F.x, F.y + 0.8, F.z);
      fov = 50;
    } else if (onFoot) {
      const p = game.pirate;
      const cave = game.area !== "out";
      const maxD = cave ? 4.2 : 5.6;
      const pitch = p.camPitch + (cave ? 0.08 : 0);
      const head = new THREE.Vector3(p.x, p.y + 1.55, p.z);
      // camera direction from yaw/pitch (behind the pirate)
      const dx = -Math.sin(p.camYaw) * Math.cos(pitch);
      const dz = -Math.cos(p.camYaw) * Math.cos(pitch);
      const dy = Math.sin(pitch);
      // pull in against the world
      let want = maxD;
      const land = game.land;
      const A = land?.areas[game.area];
      // shoulder offset (to the right) is part of the tested position
      const rx = -Math.cos(p.camYaw) * 0.45;
      const rz = Math.sin(p.camYaw) * 0.45;
      for (let d = 0.6; d <= maxD; d += 0.3) {
        const sk = Math.min(1, d / 2);
        const x = head.x + dx * d + rx * sk;
        const y = head.y + dy * d;
        const z = head.z + dz * d + rz * sk;
        let blocked = false;
        if (cave) {
          const C = land.caves[game.area];
          if (caveSDF(C, x - C.origin.x, z - C.origin.z) > -0.35 || y > caveCeil(C, x - C.origin.x, z - C.origin.z) - 0.5) blocked = true;
        } else if (land.terrain.height(x, z) > y - 0.35) blocked = true;
        if (!blocked && A && boxBlocks(A, x, y, z)) blocked = true;
        if (!blocked && A && !cave) {
          for (const c of A.circles) {
            if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < (c.r + 0.3) * (c.r + 0.3) && y < land.terrain.height(c.x, c.z) + 6.5) {
              blocked = true;
              break;
            }
          }
        }
        if (blocked) {
          want = Math.max(0.9, d - 0.35);
          break;
        }
      }
      s.footDist += (want - s.footDist) * Math.min(1, dt * (want < s.footDist ? 18 : 3));
      const d = s.footDist;
      // shoulder offset to the right so the pirate isn't dead-centre (shrinks when pulled in)
      const sk = Math.min(1, d / 2);
      pos.set(head.x + dx * d + rx * sk, head.y + dy * d + 0.1, head.z + dz * d + rz * sk);
      target.set(head.x + rx * 0.6 - dx * 2, head.y - 0.1 + Math.sin(-pitch) * 0.5, head.z + rz * 0.6 - dz * 2);
      fov = cave ? 60 : 58;
      focus.current = { x: p.x, y: p.y, z: p.z };
    } else {
      const L = P.stats.length;
      const sp = Math.max(0, P.speed) / P.stats.maxSpeed;
      if (s.yaw == null || snap) s.yaw = P.heading;
      // lag the heading (critically damped feel)
      let dh = P.heading - s.yaw;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      s.yaw += dh * Math.min(1, dt * 1.6);
      const yaw = s.yaw + (game.seaLook?.yaw || 0);
      const lost = mode === MODE.SHIP_DESTROYED;
      const dist = L * 1.5 + 11 + sp * 6 + (lost ? Math.min(30, game.deathT * 6) : 0);
      const height = L * 0.56 + 5.5 + sp * 1.5 + (game.seaLook?.pitch || 0) * 20 + (lost ? Math.min(20, game.deathT * 4) : 0);
      const f = forwardOf(yaw);
      pos.set(P.x - f.x * dist, P.y + height, P.z - f.z * dist);
      const ahead = L * 0.9 + sp * 6;
      const fs = forwardOf(s.yaw);
      target.set(P.x + fs.x * ahead, P.y + 3.2, P.z + fs.z * ahead);
      fov = 55 + sp * 5;
      focus.current = { x: P.x + fs.x * 10, y: 0, z: P.z + fs.z * 10 };
      if (mode === MODE.DOCKING) fov = 52;
    }

    if (snap) {
      s.pos.copy(pos);
      s.tgt.copy(target);
      s.init = true;
    } else {
      const k = onFoot ? Math.min(1, dt * 12) : Math.min(1, dt * 4);
      s.pos.lerp(pos, k);
      s.tgt.lerp(target, onFoot ? Math.min(1, dt * 16) : Math.min(1, dt * 5));
    }
    camera.position.copy(s.pos);
    // shake
    const sh = (game.shake || 0) * shakeAmt;
    if (sh > 0.001) {
      camera.position.x += Math.sin(t * 61) * sh * 0.35;
      camera.position.y += Math.sin(t * 53 + 1) * sh * 0.3;
      camera.position.z += Math.cos(t * 57) * sh * 0.35;
    }
    // keep the sea camera above the water
    if (!onFoot) camera.position.y = Math.max(camera.position.y, 3);
    camera.lookAt(s.tgt);
    s.fov += (fov - s.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
