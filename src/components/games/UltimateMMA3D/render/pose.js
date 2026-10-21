/**
 * Pose authoring on the fighter skeleton (UE-style 65-bone rig).
 *
 * A pose is described in CHARACTER SPACE (+X = fighter's left, +Y up,
 * +Z forward, metres, origin between the feet on the floor):
 *
 *   hip:   [x,y,z]  pelvis offset from rest          hipR:  [rx,ry,rz] deg
 *   spine: [rx,ry,rz] spread over spine_01..03       neck / head: [rx,ry,rz]
 *   lh/rh: wrist target position    le/re: elbow pole (where the elbow points)
 *   lf/rf: ankle target position    lk/rk: knee pole
 *   lhR/rhR: wrist rotation          lfR/rfR: foot rotation (0 = sole flat)
 *   lc/rc: clavicle rotation
 *
 * Rotations are applied "as seen at rest" and inherited down the chain, so
 * `spine: [0,-20,0]` twists the torso 20° and the head follows. Limbs are
 * solved with a hinge-correct two-bone IK: the elbow / knee bends only about
 * its anatomical axis, then the chain is aimed at the target and rolled
 * toward the pole. Feet keep their sole orientation in character space, so a
 * planted foot stays flat whatever the hips do (no foot sliding in clips).
 *
 * `bakePose()` returns local bone rotations (+ pelvis position); clips.js
 * turns sequences of poses into THREE.AnimationClips. Pure maths on
 * THREE.Bone objects — runs in Node for the headless tests too.
 */
import * as THREE from "three";

const D2R = Math.PI / 180;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();

export const POSE_BONES = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head", "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"];

/** Character-space rotation from degrees (yaw, then pitch, then roll). */
export function charRot([rx = 0, ry = 0, rz = 0] = [], out = new THREE.Quaternion()) {
  return out.setFromEuler(_e.set(rx * D2R, ry * D2R, rz * D2R, "YXZ"));
}

/**
 * Wraps a skeleton (any Object3D tree containing the bones) for posing.
 * The tree must sit at the origin with identity transform.
 */
export function createPoser(root) {
  root.updateMatrixWorld(true);
  const B = {};
  root.traverse((o) => {
    if (o.isBone) B[o.name] = o;
  });
  for (const n of POSE_BONES) if (!B[n]) throw new Error(`skeleton missing bone ${n}`);
  const rest = {};
  const restWorldQ = {};
  const parentRestWorldQ = {};
  const restWorldP = {};
  for (const n of Object.keys(B)) {
    const b = B[n];
    rest[n] = { q: b.quaternion.clone(), p: b.position.clone() };
    restWorldQ[n] = b.getWorldQuaternion(new THREE.Quaternion());
    parentRestWorldQ[n] = b.parent.getWorldQuaternion(new THREE.Quaternion());
    restWorldP[n] = b.getWorldPosition(new THREE.Vector3());
  }
  const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const lengths = {
    upperarm: restWorldP.upperarm_l.distanceTo(restWorldP.lowerarm_l),
    forearm: restWorldP.lowerarm_l.distanceTo(restWorldP.hand_l),
    thigh: restWorldP.thigh_l.distanceTo(restWorldP.calf_l),
    shin: restWorldP.calf_l.distanceTo(restWorldP.foot_l),
  };

  const reset = () => {
    for (const n of Object.keys(B)) {
      B[n].quaternion.copy(rest[n].q);
      B[n].position.copy(rest[n].p);
    }
    root.updateMatrixWorld(true);
  };

  /** local = inv(PRW) · D · PRW · q0 — rotate a bone by D "as seen at rest". */
  const rotateRest = (n, deg) => {
    if (!deg) return;
    const D = charRot(deg, _q1);
    const prw = parentRestWorldQ[n];
    _q2.copy(prw).invert().multiply(D).multiply(prw).multiply(rest[n].q);
    B[n].quaternion.copy(_q2);
  };
  const _qp = new THREE.Quaternion();
  const setWorldQ = (b, wq) => {
    b.parent.getWorldQuaternion(_qp).invert();
    b.quaternion.copy(_qp.multiply(wq));
    b.updateMatrixWorld(true);
  };
  const wpos = (b, out) => b.getWorldPosition(out);

  // hinge axes "as seen at rest": positive bend flexes elbows forward, knees back
  const HINGE = { lowerarm_l: [0, -1, 0], lowerarm_r: [0, 1, 0], calf_l: [1, 0, 0], calf_r: [1, 0, 0] };

  function twoBone(upper, lower, end, target, pole) {
    const a = B[upper];
    const b = B[lower];
    const c = B[end];
    const pa = wpos(a, new THREE.Vector3());
    const la = pa.distanceTo(wpos(b, _v1));
    const lb = _v1.distanceTo(wpos(c, _v2));
    const t = new THREE.Vector3().fromArray(target);
    let dist = pa.distanceTo(t);
    dist = THREE.MathUtils.clamp(dist, Math.abs(la - lb) + 1e-3, la + lb - 1e-4);
    // 1. bend the hinge so the chain spans `dist`
    const cosC = THREE.MathUtils.clamp((la * la + lb * lb - dist * dist) / (2 * la * lb), -1, 1);
    const bend = Math.PI - Math.acos(cosC);
    const ax = HINGE[lower];
    const axis = _v3.fromArray(ax);
    const prw = parentRestWorldQ[lower];
    _q1.setFromAxisAngle(axis, bend);
    _q2.copy(prw).invert().multiply(_q1).multiply(prw).multiply(rest[lower].q);
    b.quaternion.copy(_q2);
    a.updateMatrixWorld(true);
    // 2. aim upper so the end effector points at the target
    wpos(c, _v1);
    const cur = _v1.sub(pa).normalize();
    const want = _v2.copy(t).sub(pa).normalize();
    _q1.setFromUnitVectors(cur, want);
    a.getWorldQuaternion(_q2);
    setWorldQ(a, _q1.multiply(_q2));
    // 3. roll about the aim axis so the middle joint points at the pole
    if (pole) {
      const axisW = want.clone();
      const mid = wpos(b, new THREE.Vector3()).sub(pa);
      const pv = new THREE.Vector3().fromArray(pole).sub(pa);
      mid.addScaledVector(axisW, -mid.dot(axisW));
      pv.addScaledVector(axisW, -pv.dot(axisW));
      if (mid.lengthSq() > 1e-8 && pv.lengthSq() > 1e-8) {
        mid.normalize();
        pv.normalize();
        let ang = Math.acos(THREE.MathUtils.clamp(mid.dot(pv), -1, 1));
        if (_v3.crossVectors(mid, pv).dot(axisW) < 0) ang = -ang;
        _q1.setFromAxisAngle(axisW, ang);
        a.getWorldQuaternion(_q2);
        setWorldQ(a, _q1.multiply(_q2));
      }
    }
  }

  /** Orient a bone in character space: world = D · restWorld. */
  const orient = (n, deg) => {
    const D = charRot(deg || [0, 0, 0], new THREE.Quaternion());
    setWorldQ(B[n], D.multiply(restWorldQ[n]));
  };

  function apply(P) {
    reset();
    if (P.hip) B.pelvis.position.copy(rest.pelvis.p).add(_v1.fromArray(P.hip).applyQuaternion(_q1.copy(parentRestWorldQ.pelvis).invert().multiply(rootInv)));
    rotateRest("pelvis", P.hipR);
    if (P.spine) {
      const s = P.spine.map((x) => x / 3);
      rotateRest("spine_01", s);
      rotateRest("spine_02", s);
      rotateRest("spine_03", s);
    }
    rotateRest("neck_01", P.neck);
    rotateRest("Head", P.head);
    rotateRest("clavicle_l", P.lc);
    rotateRest("clavicle_r", P.rc);
    root.updateMatrixWorld(true);
    if (P.lh) twoBone("upperarm_l", "lowerarm_l", "hand_l", P.lh, P.le || [0.45, 0.8, 0]);
    if (P.rh) twoBone("upperarm_r", "lowerarm_r", "hand_r", P.rh, P.re || [-0.45, 0.8, 0]);
    if (P.lhR) rotateRest("hand_l", P.lhR);
    if (P.rhR) rotateRest("hand_r", P.rhR);
    if (P.lf) twoBone("thigh_l", "calf_l", "foot_l", P.lf, P.lk || [0.15, 0.5, 1]);
    if (P.rf) twoBone("thigh_r", "calf_r", "foot_r", P.rf, P.rk || [-0.15, 0.5, 1]);
    root.updateMatrixWorld(true);
    if (P.lf || P.lfR) orient("foot_l", P.lfR);
    if (P.rf || P.rfR) orient("foot_r", P.rfR);
    root.updateMatrixWorld(true);
  }

  /** Apply + read back local rotations (and pelvis position). */
  function bake(P) {
    apply(P);
    const out = {};
    for (const n of POSE_BONES) out[n] = B[n].quaternion.toArray();
    out.$pelvisPos = B.pelvis.position.toArray();
    return out;
  }

  return { B, rest, restWorldP, lengths, reset, apply, bake, wpos: (n) => B[n].getWorldPosition(new THREE.Vector3()) };
}
