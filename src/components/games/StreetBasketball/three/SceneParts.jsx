/**
 * Street Basketball — in-scene pieces driven by the engine every frame:
 *   <Simulation>  the ONE place the engine advances (priority −1, before any
 *                 visual reads it). Remounting the Canvas is the only way to
 *                 get a second one, and that also drops the old engine.
 *   <Ball>        interpolated position, integrated spin, contact shadow.
 *   <Athlete>     character rig posed from the (interpolated) engine state.
 *   <CameraRig>   broadcast-style 1v1 camera with look-ahead and tiny shakes.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { advance, drainEvents } from "../engine/match.js";
import { BALL_R, RIM_Y } from "../engine/constants.js";
import { ballTexture, blobTexture } from "./textures.js";
import { buildCharacter, poseCharacter, disposeCharacter } from "./character.js";

/* ------------------------------------------------------------------ simulation */
export function Simulation({ game, onEvents, paused }) {
  useFrame((_, dt) => {
    const g = game.current;
    if (!g) return;
    g.paused = !!paused.current;
    advance(g, dt);
    const ev = drainEvents(g);
    if (ev.length && onEvents.current) onEvents.current(ev, g);
  }, -1);
  return null;
}

/* ------------------------------------------------------------------ ball */
export function Ball({ game, skin }) {
  const tex = useMemo(() => ballTexture(skin), [skin]);
  const blob = useMemo(() => blobTexture(), []);
  useEffect(() => () => { tex.dispose(); blob.dispose(); }, [tex, blob]);
  const mesh = useRef();
  const shadow = useRef();
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const dq = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, dt) => {
    const g = game.current;
    if (!g || !mesh.current) return;
    const b = g.ball;
    const a = g.alpha;
    const pv = b.prev || b.p;
    const x = pv.x + (b.p.x - pv.x) * a;
    const y = pv.y + (b.p.y - pv.y) * a;
    const z = pv.z + (b.p.z - pv.z) * a;
    mesh.current.position.set(x, y, z);
    // spin: engine spin when free; when carried, roll with its own motion
    let wx = b.w.x;
    let wy = b.w.y;
    let wz = b.w.z;
    if (g.owner) {
      wx = b.v.z / BALL_R * 0.8;
      wy = 0;
      wz = -b.v.x / BALL_R * 0.8;
    }
    const w = Math.hypot(wx, wy, wz);
    if (w > 1e-3) {
      axis.set(wx / w, wy / w, wz / w);
      dq.setFromAxisAngle(axis, w * Math.min(dt, 0.05));
      q.premultiply(dq);
      mesh.current.quaternion.copy(q);
    }
    if (shadow.current) {
      const h = Math.max(0, y - BALL_R);
      const s = 0.3 + h * 0.08;
      shadow.current.scale.set(s, s, 1);
      shadow.current.position.set(x + h * 0.05, 0.012, z + h * 0.05);
      shadow.current.material.opacity = Math.max(0.12, 0.75 - h * 0.14);
    }
  });
  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[BALL_R, 40, 28]} />
        <meshStandardMaterial map={tex} roughness={0.72} bumpMap={tex} bumpScale={0.25} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.6} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ athlete */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function Athlete({ game, id, look, shadows, onStep }) {
  const rig = useMemo(() => buildCharacter(look, { shadows }), [look, shadows]);
  useEffect(() => () => disposeCharacter(rig), [rig]);
  const blob = useMemo(() => blobTexture(), []);
  useEffect(() => () => blob.dispose(), [blob]);
  const shadow = useRef();
  const clock = useRef(0);
  useFrame((_, dtRaw) => {
    const g = game.current;
    if (!g) return;
    const a = id === "p" ? g.P : g.O;
    if (!a) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const al = g.alpha;
    const x = a.prevX + (a.x - a.prevX) * al;
    const z = a.prevZ + (a.z - a.prevZ) * al;
    const y = a.prevY + (a.y - a.prevY) * al;
    const facing = lerpAngle(a.prevFacing, a.facing, al);
    // engine hand points ride along with the interpolation offset
    const ox = x - a.x;
    const oz = z - a.z;
    const oy = y - a.y;
    const shift = (h) => h && { x: h.x + ox, y: h.y + oy, z: h.z + oz };
    const bx = g.ball.prev ? g.ball.prev.x + (g.ball.p.x - g.ball.prev.x) * al : g.ball.p.x;
    const by = g.ball.prev ? g.ball.prev.y + (g.ball.p.y - g.ball.prev.y) * al : g.ball.p.y;
    const bz = g.ball.prev ? g.ball.prev.z + (g.ball.p.z - g.ball.prev.z) * al : g.ball.p.z;
    const withBall = g.owner === id;
    // hands glued to the ball follow the interpolated ball, not the raw one
    const ballShift = (h) => h && { x: h.x + (bx - g.ball.p.x), y: h.y + (by - g.ball.p.y), z: h.z + (bz - g.ball.p.z) };
    const hands = {
      L: withBall ? ballShift(a.hands.L) : shift(a.hands.L),
      R: withBall ? ballShift(a.hands.R) : shift(a.hands.R),
    };
    const opp = id === "p" ? g.O : g.P;
    const guardArm = withBall && opp && Math.hypot(opp.x - a.x, opp.z - a.z) < 1.6;
    const act = a.act;
    const lookAt = g.owner === id ? { x: 0, z: 0 } : { x: bx, z: bz };
    poseCharacter(rig, {
      x, z, y, facing,
      vx: a.vx, vz: a.vz,
      air: a.air,
      anim: a.anim,
      act: act ? act.kind : null,
      actT: act ? act.t : 0,
      actJumped: act ? !!act.jumped : false,
      actLaunched: act ? !!act.launched : false,
      crossDir: act && act.kind === "cross" ? act.dir : 0,
      stance: a.stance,
      hands,
      hand: act && act.kind === "layup" ? act.hand : a.hand,
      withBall,
      guardArm,
    }, dt, { lookAt, time: clock.current, onStep: onStep ? (sp) => onStep(id, sp) : null });
    if (shadow.current) {
      const s = 1.05 - Math.min(0.5, y * 0.4);
      shadow.current.scale.set(s, s * 0.8, 1);
      shadow.current.position.set(x, 0.011, z);
      shadow.current.rotation.z = -facing;
      shadow.current.material.opacity = 0.72 - Math.min(0.4, y * 0.35);
    }
  });
  return (
    <group>
      <primitive object={rig.root} />
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.7} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ camera */
/**
 * Broadcast-hybrid camera behind the top of the key: keeps the player, the
 * opponent, the ball and the rim framed; follows smoothly (never snaps),
 * biases toward the rim, pulls in a touch for dunks, and shakes only for the
 * big moments (and only if Camera Shake is on / motion isn't reduced).
 */
/** Camera yaw off the court's long axis (radians). Input is rotated by the same angle. */
export const CAM_YAW = 0.43;

export function CameraRig({ game, shakeOn, mode, yawRef }) {
  const { camera, size } = useThree();
  const st = useRef({ x: 0, z: 6, fov: 50, init: false, dunkT: 0 });
  useEffect(() => {
    camera.near = 0.1;
    camera.far = 400;
  }, [camera]);
  useFrame((_, dtRaw) => {
    const g = game.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    const S = st.current;
    const b = g.ball.p;
    const P = g.P;
    const O = g.O;
    // focus: centre of the action (player, opponent, ball); the camera
    // backs off when they spread out so nobody leaves the frame
    const pts = [[P.x, P.z, 1.0], [b.x, Math.max(-0.5, b.z), 0.7]];
    if (O) pts.push([O.x, O.z, 0.6]);
    let fx = 0;
    let fz = 0;
    let wsum = 0;
    for (const [x, z, w] of pts) {
      fx += x * w;
      fz += z * w;
      wsum += w;
    }
    fx /= wsum;
    fz /= wsum;
    let spread = 0;
    for (const [x, z] of pts) spread = Math.max(spread, Math.hypot(x - fx, z - fz));
    S.spread = S.spread === undefined ? spread : S.spread + (spread - S.spread) * Math.min(1, dt * 2);
    // look-ahead toward the rim
    fz = fz * 0.9;
    const k = S.init ? Math.min(1, dt * 2.6) : 1;
    S.init = true;
    S.x += (fx - S.x) * k;
    S.z += (fz - S.z) * k;
    const aspect = size.width / Math.max(1, size.height);
    const narrow = aspect < 1.5 ? (1.5 - aspect) * 3 : 0;
    const dunking = (P.act && P.act.kind === "dunk") || (O && O.act && O.act.kind === "dunk");
    S.dunkT = dunking ? Math.min(1, S.dunkT + dt * 3) : Math.max(0, S.dunkT - dt * 2);
    // broadcast angle: yawed off the court axis so a defender standing between
    // the ball-handler and the rim is never hidden behind him
    const yaw = CAM_YAW;
    if (yawRef) yawRef.current = yaw;
    const dist = 10.2 + Math.max(0, S.spread - 1.2) * 0.9 + narrow * 1.5 - S.dunkT * 1.5;
    const cx = S.x * 0.6 + 0.3;
    const cz = Math.min(S.z, 8) * 0.7 + 0.4;
    const camX = cx + Math.sin(yaw) * dist;
    const camZ = cz + Math.cos(yaw) * dist;
    const camY = 6.4 + narrow * 0.4 - S.dunkT * 0.6;
    let sx = 0;
    let sy = 0;
    if (shakeOn && g.shake > 0) {
      const t = g.time * 60;
      sx = Math.sin(t * 1.7) * g.shake * 0.05;
      sy = Math.cos(t * 2.3) * g.shake * 0.05;
    }
    camera.position.set(camX + sx, camY + sy, camZ);
    // tilt up toward the rim when the action is under it
    const nearRim = Math.max(0, Math.min(1, (4.5 - cz) / 4));
    S.tilt = S.tilt === undefined ? nearRim : S.tilt + (nearRim - S.tilt) * Math.min(1, dt * 2.5);
    camera.lookAt(cx, 1.05 + S.tilt * 1.15 + (b.y > 2.5 ? 0.15 : 0), cz);
    const fov = 38 + narrow * 5 - S.dunkT * 2.5;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    void mode;
    void RIM_Y;
  });
  return null;
}
