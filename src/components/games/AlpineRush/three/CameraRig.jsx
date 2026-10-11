/**
 * Alpine Rush — the third-person ski camera.
 *
 *   countdown  a slow swoop from beside the skier round to the chase spot,
 *              arriving just before GO
 *   skiing     behind and above; follows the TRAVEL direction (not every
 *              wobble of the skis) with a little lag; pulls back and widens
 *              the FOV with speed; slope-aware — rises and looks further
 *              down the fall line on steep pitches so the next gates stay in
 *              view; a soft dip on landings, a smooth recovery after jumps
 *   fallen     holds its spot and watches, then eases back behind
 *   finished   a slow orbit around the skier
 * Never clips: kept above the snow under it (and the skier's snow), inside
 * the safety nets, and never rolls (lookAt with world up). Distance (C key /
 * Settings) and follow stiffness (camera sensitivity) come from settings.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RSTATE } from "../engine/race.js";
import { locate, NET_MARGIN } from "../engine/course.js";
import { clamp, easeInOut, wrapAngle } from "../engine/rng.js";

export const CAM_DIST = { near: 0.78, normal: 1, far: 1.3 };

export default function CameraRig({ race, G, settingsRef, camBus }) {
  const { camera } = useThree();
  const st = useRef({ yaw: race.player.sk.h, init: false, dip: 0, dipV: 0, fov: 60, hint: -1, wasCrash: false, look: new THREE.Vector3(), lookInit: false });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  const T = race.T;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.12);
    const S = st.current;
    const set = settingsRef.current;
    const reduced = !!set.reducedFx;
    const K = race.player.sk;
    const sp = K.air ? Math.hypot(K.ax, K.az) : Math.max(0, K.vF);
    const vn = clamp(sp / 32, 0, 1.3);
    const distK = CAM_DIST[set.camDist] ?? 1;
    const sens = 0.5 + (set.camSens ?? 0.5); // 0.5 .. 1.5
    if (camBus && camBus.current.length) {
      for (const e of camBus.current) if (e.kind === "land") S.dipV -= 1.0 + e.a * 2.0;
      camBus.current.length = 0;
    }
    const dts = Math.min(dt, 0.05); // the landing-dip spring stays stable
    S.dipV += (-S.dip * 50 - S.dipV * 9) * dts;
    S.dip += S.dipV * dts;
    const loc = K.loc;
    const Sm = loc ? T.interp(loc.s).a : T.samples[0];
    const grade = Math.max(0, Sm.grade);
    // travel direction (air: the flight path; fallen: the slope)
    const travel = K.air ? Math.atan2(K.ax, K.az) : sp > 1.5 ? K.h + Math.atan2(K.vS, Math.max(1, K.vF)) * 0.6 : K.h;
    S.yaw += wrapAngle(travel - S.yaw) * Math.min(1, dt * (K.air ? 1.8 : 3.4) * sens);
    const dist = (4.6 + (reduced ? 0.4 : vn * 1.6)) * distK;
    const height = (1.9 + vn * 0.4 + grade * 3.2) * (0.85 + distK * 0.15);
    want.set(K.x - Math.sin(S.yaw) * dist, K.y + height, K.z - Math.cos(S.yaw) * dist);
    let fovT = reduced ? 62 : 58 + vn * 14;
    let lookAhead = 7 + vn * 8;

    if (race.state === RSTATE.COUNTDOWN) {
      const k = easeInOut(clamp(1 - (race.countdown - 0.6) / 3.0, 0, 1));
      const ang = K.h + Math.PI * 0.8 * (1 - k);
      const r = (7 - k * 2.4) * distK;
      want.set(K.x - Math.sin(ang) * r, K.y + 1.6 + k * (height - 1.6), K.z - Math.cos(ang) * r);
      S.yaw = K.h;
      pos.copy(want);
      fovT = 54 + k * 4;
      lookAhead = 1 + 6 * k;
    } else if (race.state === RSTATE.FINISHED) {
      if (S.orbitAng == null) {
        S.orbitAng = Math.atan2(K.x - pos.x, K.z - pos.z);
        S.orbitDist = Math.hypot(pos.x - K.x, pos.z - K.z);
      }
      S.orbitAng += dt * 0.3;
      S.orbitDist += (6.5 - S.orbitDist) * Math.min(1, dt * 1.5);
      pos.set(K.x - Math.sin(S.orbitAng) * S.orbitDist, pos.y + (K.y + 2.2 - pos.y) * Math.min(1, dt * 2), K.z - Math.cos(S.orbitAng) * S.orbitDist);
      fovT = 52;
      lookAhead = 0;
    } else if (K.crash) {
      fovT = 56;
      lookAhead = 0;
      S.wasCrash = true;
      pos.lerp(want, Math.min(1, dt * 0.8));
    } else {
      if (!S.init) {
        pos.copy(want);
        S.yaw = K.h;
      } else {
        // carry the camera with the skier, then ease toward the chase spot
        pos.set(pos.x + K.x - S.kx, pos.y + K.y - S.ky, pos.z + K.z - S.kz);
        pos.lerp(want, Math.min(1, dt * (S.wasCrash ? 2.5 : 5.5) * sens));
        if (S.wasCrash && pos.distanceTo(want) < 0.5) S.wasCrash = false;
      }
    }
    S.kx = K.x;
    S.ky = K.y;
    S.kz = K.z;
    S.init = true;
    // inside the nets (lateral clamp in the piste frame)
    if (race.state !== RSTATE.FINISHED) {
      const q = locate(T, pos.x, pos.z, S.hint);
      S.hint = q.i;
      const lim = q.w + NET_MARGIN - 0.3;
      if (Math.abs(q.lat) > lim) {
        const p = T.samples[q.i];
        const over = Math.abs(q.lat) - lim;
        pos.x -= p.nx * Math.sign(q.lat) * over;
        pos.z -= p.nz * Math.sign(q.lat) * over;
      }
    }
    // above the snow under the camera and the skier's snow
    const ground = G ? G.heightAt(pos.x, pos.z) : -Infinity;
    const kGround = K.gnd && !K.gnd.fall ? K.gnd.y : K.y;
    pos.y = Math.max(pos.y, ground + 1.2, kGround + 1.0);
    camera.position.copy(pos);
    if (!reduced) camera.position.y += S.dip * 0.3;
    // look a little down the fall line ahead (gates in view), smoothed
    const ahead = loc ? T.pointAt(loc.s + lookAhead, 0) : null;
    const lx = K.x + Math.sin(S.yaw) * lookAhead;
    const lz = K.z + Math.cos(S.yaw) * lookAhead;
    const ly = ahead && race.state === RSTATE.RACING && !K.crash ? Math.min(K.y + 0.9, ahead.y + 1.4) : K.y + 1.0;
    const target = S.tgt || (S.tgt = new THREE.Vector3());
    target.set(lx, ly, lz);
    if (!S.lookInit || race.state === RSTATE.COUNTDOWN) {
      S.look.copy(target);
      S.lookInit = true;
    } else S.look.lerp(target, Math.min(1, dt * 6 * sens));
    camera.up.set(0, 1, 0);
    camera.lookAt(S.look);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 2.5);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
