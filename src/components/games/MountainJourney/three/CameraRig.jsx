/**
 * Mountain Journey — the third-person camera.
 *
 *   play       orbit behind / above the explorer from game.cam (yaw, pitch),
 *              eased; pulled in against terrain, solids and cave roofs (a
 *              march from the head outward), fast in / slow out, so it never
 *              clips walls and never pops; tighter and lower in caves
 *   viewpoint  glides to the overlook's camera and sweeps the panorama
 *   falling    holds position, looks down after the explorer
 *   complete   swings round to the front for the victory pose, then drifts
 * It also writes focusRef (what the sun's shadow box centres on).
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STATE, VIEW_TIME } from "../engine/constants.js";
import { caveRoofAt } from "../engine/terrain.js";
import { easeInOut } from "../engine/rng.js";

const desired = new THREE.Vector3();
const target = new THREE.Vector3();
const head = new THREE.Vector3();

export default function CameraRig({ game, settings, focusRef }) {
  const { camera } = useThree();
  const st = useRef({ init: false, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), dist: 5.5, cave: 0, fov: 58, viewFrom: null, bobT: 0 });
  const reduced = settings.reducedMotion;
  const bob = settings.cameraBob && !reduced;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const G = game;
    const P = G.player;
    const T = G.L.terrain;
    const S = G.L.solids;
    let fov = 58;
    let snap = !s.init || G.cam.snap;
    G.cam.snap = false;

    head.set(P.x, P.y + 1.55, P.z);
    const q = T.query(P.x, P.z);
    const roof = caveRoofAt(q);
    s.cave += ((roof != null ? 1 : 0) - s.cave) * Math.min(1, dt * 3);

    if (G.state === STATE.VIEWPOINT && G.view) {
      const V = G.view;
      const c = V.vp.cam;
      const k = easeInOut(Math.min(1, V.t / 1.4));
      if (!s.viewFrom) s.viewFrom = s.pos.clone();
      const sweep = Math.sin((V.t / VIEW_TIME) * Math.PI * 2) * c.sweep;
      const yaw = c.h + sweep;
      desired.set(c.x, c.y + k * 1.2, c.z);
      desired.lerpVectors(s.viewFrom, desired, k);
      target.set(c.x + Math.sin(yaw) * 60, c.y - 6 + c.pitch * 40, c.z + Math.cos(yaw) * 60);
      fov = 62;
      s.pos.lerp(desired, Math.min(1, dt * 3));
      s.tgt.lerp(target, Math.min(1, dt * 2.2));
    } else {
      s.viewFrom = null;
      if (G.state === STATE.LEVEL_COMPLETE) {
        // swing round to the front and rise a little
        const ft = G.finishT || 0;
        const yaw = P.facing + Math.PI - 0.5 + Math.min(1, ft * 0.35) * 0.35 + ft * 0.04;
        const d = 4.2 + Math.min(2.5, ft * 0.4);
        desired.set(P.x + Math.sin(yaw) * d, P.y + 1.6 + Math.min(1.6, ft * 0.25), P.z + Math.cos(yaw) * d);
        target.set(P.x, P.y + 1.2, P.z);
        fov = 52;
      } else if (G.state === STATE.FALLING || G.state === STATE.RESPAWNING) {
        desired.copy(s.pos);
        target.set(P.x, P.y + 0.8, P.z);
      } else {
        const yaw = G.cam.yaw;
        const pitch = G.cam.pitch + s.cave * 0.06;
        const maxD = 5.6 - s.cave * 1.9 + (P.run && P.speed > 5 ? 0.5 : 0);
        const bx = -Math.sin(yaw) * Math.cos(pitch);
        const bz = -Math.cos(yaw) * Math.cos(pitch);
        const by = Math.sin(pitch);
        // shoulder offset (to the right), shrinking when pulled in
        const rx = -Math.cos(yaw) * 0.42;
        const rz = Math.sin(yaw) * 0.42;
        let want = maxD;
        for (let d = 0.5; d <= maxD; d += 0.25) {
          const sk = Math.min(1, d / 2.2);
          const x = head.x + bx * d + rx * sk;
          const y = head.y + by * d;
          const z = head.z + bz * d + rz * sk;
          const qq = T.query(x, z);
          let blocked = qq.h > y - 0.35;
          if (!blocked && s.cave > 0.05) {
            const r = caveRoofAt(qq);
            if (r != null && y > r - 0.45) blocked = true;
            // cave walls: leaving the corridor sideways inside a cave
            if (r == null && qq.e > 0.2 && roof != null) blocked = true;
          }
          if (!blocked && S.blocks(x, y, z, 0.25)) blocked = true;
          if (blocked) {
            want = Math.max(0.8, d - 0.35);
            break;
          }
        }
        s.dist += (want - s.dist) * Math.min(1, dt * (want < s.dist ? 16 : 2.5));
        const d = s.dist;
        const sk = Math.min(1, d / 2.2);
        desired.set(head.x + bx * d + rx * sk, head.y + by * d + 0.15, head.z + bz * d + rz * sk);
        // a gentle walking bob
        if (bob && P.grounded && P.speed > 0.5) {
          desired.y += Math.sin(P.phase * 2) * 0.03 * Math.min(1, P.speed / 4);
        }
        target.set(head.x + rx * 0.55 - bx * 2.2, head.y - 0.15 - Math.sin(pitch) * 0.6, head.z + rz * 0.55 - bz * 2.2);
        fov = 58 + (P.run && P.speed > 5 ? 4 : 0) - s.cave * 2;
      }
      if (snap) {
        s.pos.copy(desired);
        s.tgt.copy(target);
        s.dist = 5.5;
      } else {
        // follow tightly enough to stay responsive, softly enough to be smooth
        const kp = G.state === STATE.PLAYING || G.state === STATE.CLIMBING ? 14 : 3;
        s.pos.lerp(desired, Math.min(1, dt * kp));
        s.tgt.lerp(target, Math.min(1, dt * (kp + 4)));
      }
    }
    s.init = true;
    camera.position.copy(s.pos);
    // never under the ground
    const gh = T.height(camera.position.x, camera.position.z);
    if (camera.position.y < gh + 0.3) camera.position.y = gh + 0.3;
    camera.lookAt(s.tgt);
    s.fov += (fov - s.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    if (focusRef) focusRef.current = { x: P.x, y: P.y, z: P.z, cave: s.cave };
  });
  return null;
}
