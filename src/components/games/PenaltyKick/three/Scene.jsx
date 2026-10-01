/**
 * Penalty Kick — everything inside the game <Canvas>.
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame, priority -2).
 * Everything else READS engine state each frame:
 *   Ball    — the authoritative physics position (interpolated between the
 *             last two fixed steps) and the physics orientation quaternion
 *   Figures — posed from the SAME pose functions that build the keeper's
 *             colliders and time the kicker's contact
 *   Net     — ripples driven by the physics net events (strength ∝ impact)
 * No component moves anything the physics owns.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PK, WOODWORK } from "../engine/constants.js";
import { KZ } from "../engine/keeper.js";
import { pitchTexture, ballTexture, boardTexture, blobTexture, standTexture, chainLinkTexture } from "./textures.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/* ================================================================ driver */
export function Driver({ engine }) {
  useFrame((_, dt) => engine.frame(dt), -2);
  return null;
}

/* ================================================================ camera */
export function CameraRig({ engine }) {
  const { camera, size } = useThree();
  const cur = useRef({ pos: new THREE.Vector3(0, 2, 17), look: new THREE.Vector3(0, 1, 0), role: null, mode: null });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  useEffect(() => {
    engine.project = (nx, ny, planeZ = 0) => {
      ray.setFromCamera({ x: nx, y: ny }, camera);
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      if (Math.abs(d.z) < 1e-6) return null;
      const t = (planeZ - o.z) / d.z;
      if (t <= 0) return null;
      return [o.x + d.x * t, o.y + d.y * t];
    };
    return () => {
      engine.project = null;
    };
  }, [engine, camera, ray]);
  useFrame((_, dt) => {
    const g = engine.cameraGoal();
    const c = cur.current;
    const role = engine.session.role;
    // snap on a change of viewpoint (shooter ↔ keeper ↔ menu); ease otherwise
    const snap = c.role !== role || c.mode !== engine.mode;
    c.role = role;
    c.mode = engine.mode;
    const k = snap ? 1 : 1 - Math.exp(-dt * (g.speed || 4.5));
    c.pos.lerp(tmpV.set(...g.pos), k);
    c.look.lerp(tmpV2.set(...g.look), k);
    camera.position.copy(c.pos);
    if (engine.shake > 0) {
      const s = engine.shake * 0.05;
      camera.position.x += Math.sin(engine.wallT * 71) * s;
      camera.position.y += Math.cos(engine.wallT * 53) * s;
    }
    camera.lookAt(c.look);
    // narrow / portrait stages: widen the vertical FOV until the whole goal
    // (plus a margin) fits horizontally — the goal never gets cropped
    const aspect = size.width / Math.max(1, size.height);
    let fov = g.fov;
    if (engine.mode !== "menu") {
      const dist = Math.abs(c.pos.z) + 0.5;
      const halfW = role === "keep" ? 4.3 : 4.9;
      const need = (2 * Math.atan(halfW / dist / aspect) * 180) / Math.PI;
      fov = Math.min(100, Math.max(fov, need));
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (snap ? 1 : 0.1);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/* ================================================================ sky + lights */
export function Sky({ venue }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(venue.sky[0]) }, horizon: { value: new THREE.Color(venue.sky[1]) } },
        vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          `uniform vec3 top;
uniform vec3 horizon;
varying vec3 vP;
void main() {
  float h = clamp(vP.y * 1.6 + 0.05, 0.0, 1.0);
  gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0);
  #include <colorspace_fragment>
}`,
      }),
    [venue]
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

export function Lights({ venue, shadows, quality }) {
  const sun = useRef();
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0, 6);
    return o;
  }, []);
  const map = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[venue.hemi[0], venue.hemi[1], venue.hemi[2]]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        position={venue.sun.pos}
        intensity={venue.sun.intensity}
        color={venue.sun.color}
        target={target}
        castShadow={shadows}
        shadow-mapSize-width={map}
        shadow-mapSize-height={map}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={16}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {venue.time !== "day" && <ambientLight intensity={0.25} color={venue.sun.color} />}
    </>
  );
}

/* ================================================================ pitch */
const LINE_W = 0.12;
function lineRects() {
  const r = [];
  const box = (hw, depth) => {
    r.push([-hw - LINE_W / 2, 0, LINE_W, depth]); // left side
    r.push([hw - LINE_W / 2, 0, LINE_W, depth]); // right side
    r.push([-hw, depth - LINE_W, hw * 2, LINE_W]); // front
  };
  r.push([-30, -LINE_W, 60, LINE_W]); // goal line (its far edge is the goal plane)
  box(PK.GOAL_HALF_W + 5.5, 5.5);
  box(PK.GOAL_HALF_W + 16.5, 16.5);
  return r;
}

export function Pitch({ venue }) {
  const tex = useMemo(() => pitchTexture(venue.grass, venue.key === "neighborhood" ? 1 : venue.key === "final" ? 0.2 : 0.55), [venue]);
  const lineMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f6f0", roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const lines = useMemo(() => {
    const geos = lineRects().map(([x, z, w, d]) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      g.translate(x + w / 2, 0, z + d / 2);
      return g;
    });
    const spot = new THREE.CircleGeometry(0.12, 24);
    spot.rotateX(-Math.PI / 2);
    spot.translate(0, 0, PK.SPOT_Z);
    geos.push(spot);
    // the arc outside the area: radius 9.15 around the spot, beyond z = 16.5
    const a = Math.acos(5.5 / 9.15);
    const arc = new THREE.RingGeometry(9.15 - LINE_W / 2, 9.15 + LINE_W / 2, 48, 1, Math.PI / 2 - a, a * 2);
    arc.rotateX(-Math.PI / 2);
    arc.rotateY(Math.PI);
    arc.translate(0, 0, PK.SPOT_Z);
    geos.push(arc);
    const m = mergeGeometries(geos.map((g) => g.toNonIndexed()));
    geos.forEach((g) => g.dispose());
    return m;
  }, []);
  useEffect(() => () => lines.dispose(), [lines]);
  const outer = useMemo(() => new THREE.Color(venue.grass[1]).multiplyScalar(0.82), [venue]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 18]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 18]}>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial color={outer} roughness={1} />
      </mesh>
      <mesh geometry={lines} material={lineMat} position={[0, 0.004, 0]} receiveShadow />
    </group>
  );
}

/* ================================================================ goal + net */
function cylBetween(a, b, r, mat, key, cast = true) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const len = A.distanceTo(B);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return (
    <mesh key={key} position={mid} quaternion={q} material={mat} castShadow={cast}>
      <cylinderGeometry args={[r, r, len, 16]} />
    </mesh>
  );
}

const NET_D = PK.NET_DEPTH;
const roofY = (z) => PK.GOAL_H + (PK.NET_TOP_BACK_H - PK.GOAL_H) * Math.min(1, Math.max(0, -z / NET_D));

/** Builds the net as a vertex grid on 4 surfaces + segment index list. */
function buildNet() {
  const verts = [];
  const normals = [];
  const segs = [];
  const W = PK.GOAL_HALF_W;
  const cell = 0.15;
  const surface = (nu, nv, at, n) => {
    const base = verts.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const p = at(i / nu, j / nv);
        verts.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
        if (i > 0) segs.push(base + j * (nu + 1) + i - 1, base + j * (nu + 1) + i);
        if (j > 0) segs.push(base + (j - 1) * (nu + 1) + i, base + j * (nu + 1) + i);
      }
  };
  const nx = Math.round((2 * W) / cell);
  // back wall (outward normal −z)
  surface(nx, Math.round(PK.NET_TOP_BACK_H / cell), (u, v) => [-W + 2 * W * u, v * PK.NET_TOP_BACK_H, -NET_D], [0, 0, -1]);
  // roof, sloping from the bar to the back top
  surface(nx, Math.round(NET_D / cell), (u, v) => [-W + 2 * W * u, roofY(-v * NET_D), -v * NET_D - 0.02], [0, 1, 0]);
  // sides
  for (const s of [-1, 1]) surface(Math.round(NET_D / cell), Math.round(PK.GOAL_H / cell), (u, v) => [s * W, v * roofY(-u * NET_D), -u * NET_D - 0.02], [s, 0, 0]);
  return { verts: new Float32Array(verts), normals: new Float32Array(normals), segs };
}

export function Goal({ engine, quality }) {
  const post = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f7f8f4", roughness: 0.35, metalness: 0.1 }), []);
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cfd3d6", roughness: 0.6, metalness: 0.3 }), []);
  const net = useMemo(() => {
    const n = buildNet();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(n.verts.slice(), 3));
    g.setIndex(n.segs);
    return { geo: g, base: n.verts, normals: n.normals };
  }, []);
  const netMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#f2f4f0", transparent: true, opacity: quality === "low" ? 0.55 : 0.7 }), [quality]);
  const hits = useRef([]);
  const dirty = useRef(false);
  useEffect(() => {
    engine.netFx = (e) => {
      // outward push along −n (the physics normal points back into the goal)
      const a = Math.min(0.55, 0.06 + e.speed * 0.017);
      hits.current.push({ p: e.p, n: e.n, a, t: 0 });
      if (hits.current.length > 4) hits.current.shift();
    };
    return () => {
      engine.netFx = null;
    };
  }, [engine]);
  useEffect(() => () => net.geo.dispose(), [net]);
  useFrame((_, dt) => {
    // from behind the goal (player keeping) the net is see-through
    const want = engine.session.role === "keep" && engine.mode === "play" ? 0.16 : quality === "low" ? 0.55 : 0.7;
    netMat.opacity += (want - netMat.opacity) * Math.min(1, dt * 8);
    const H = hits.current;
    if (!H.length && !dirty.current) return;
    for (const h of H) h.t += Math.min(dt, 0.05);
    hits.current = H.filter((h) => h.t < 2.2);
    const pos = net.geo.attributes.position.array;
    const b = net.base;
    const nrm = net.normals;
    for (let i = 0; i < pos.length; i += 3) {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (const h of hits.current) {
        const ex = b[i] - h.p[0];
        const ey = b[i + 1] - h.p[1];
        const ez = b[i + 2] - h.p[2];
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > 3.2) continue;
        // a damped wobble: out first, then settle
        const env = Math.exp(-h.t * 3.2) * Math.cos(h.t * 11);
        const w = Math.exp(-d2 / 0.45) * h.a * env;
        // move along the surface's own outward normal so the mesh never tears
        const s = nrm[i] * -h.n[0] + nrm[i + 1] * -h.n[1] + nrm[i + 2] * -h.n[2];
        const k = w * (0.35 + 0.65 * Math.max(0, s));
        dx += nrm[i] * k;
        dy += nrm[i + 1] * k;
        dz += nrm[i + 2] * k;
        // the mesh also sags and sways in the screen plane, so the ripple is
        // readable from behind the ball (a push straight away from the camera
        // alone barely shows)
        dy -= Math.abs(w) * 0.45;
        dx += (b[i] - h.p[0]) * w * 0.35;
      }
      pos[i] = b[i] + dx;
      pos[i + 1] = b[i + 1] + dy;
      pos[i + 2] = b[i + 2] + dz;
    }
    net.geo.attributes.position.needsUpdate = true;
    dirty.current = hits.current.length > 0;
  });
  const W = PK.GOAL_HALF_W + PK.POST_R;
  return (
    <group>
      {WOODWORK.map((w) => cylBetween(w.a, [w.b[0] + (w.kind === "bar" ? PK.POST_R * Math.sign(w.b[0]) : 0), w.b[1] + (w.kind === "post" ? PK.POST_R : 0), w.b[2]], PK.POST_R, post, w.id))}
      {[-1, 1].map((s) => (
        <group key={s}>
          {cylBetween([s * W, PK.GOAL_H, -0.1], [s * W, PK.NET_TOP_BACK_H, -NET_D], 0.025, frame, `r${s}`)}
          {cylBetween([s * W, PK.NET_TOP_BACK_H, -NET_D], [s * W, 0, -NET_D], 0.025, frame, `b${s}`)}
          {cylBetween([s * W, 0.02, -0.1], [s * W, 0.02, -NET_D], 0.02, frame, `g${s}`, false)}
        </group>
      ))}
      {cylBetween([-W, PK.NET_TOP_BACK_H, -NET_D], [W, PK.NET_TOP_BACK_H, -NET_D], 0.025, frame, "top")}
      {cylBetween([-W, 0.02, -NET_D], [W, 0.02, -NET_D], 0.02, frame, "bottom", false)}
      <lineSegments geometry={net.geo} material={netMat} frustumCulled={false} />
    </group>
  );
}

/* ================================================================ ball */
export function Ball({ engine, ball }) {
  const mesh = useRef();
  const shadow = useRef();
  const tex = useMemo(() => ballTexture(ball), [ball]);
  const blob = useMemo(() => blobTexture(), []);
  const p = useMemo(() => [0, 0, 0], []);
  useFrame(() => {
    const pen = engine.session.pen;
    const m = mesh.current;
    if (!m) return;
    if (!pen || !engine.ballPos(p)) {
      m.visible = false;
      shadow.current.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(p[0], p[1], p[2]);
    const q = pen.ball.q;
    m.quaternion.set(q[0], q[1], q[2], q[3]);
    const s = shadow.current;
    s.visible = true;
    s.position.set(p[0], 0.012, p[2]);
    const h = Math.max(0, p[1] - PK.BALL_R);
    const sc = 0.3 + h * 0.12;
    s.scale.set(sc, sc, 1);
    s.material.opacity = Math.max(0.08, 0.5 - h * 0.12);
  });
  return (
    <>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[PK.BALL_R, 40, 24]} />
        <meshStandardMaterial map={tex} roughness={0.42} metalness={0.02} />
      </mesh>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blob} color="#000" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ================================================================ figures */
/**
 * A stylised articulated footballer drawn from a joint dictionary (the same
 * one the physics uses). Limbs are unit cylinders placed between joints.
 */
const LIMBS = [
  // [from, to, radius, material key, taper]
  ["pelvis", "neck", 0.165, "shirt"],
  ["neck", "head", 0.055, "skin"],
  ["shL", "elL", 0.058, "sleeve"],
  ["shR", "elR", 0.058, "sleeve"],
  ["elL", "hL", 0.048, "arm"],
  ["elR", "hR", 0.048, "arm"],
  ["hipL", "knL", 0.078, "thigh"],
  ["hipR", "knR", 0.078, "thigh"],
  ["knL", "ftL", 0.058, "sock"],
  ["knR", "ftR", 0.058, "sock"],
];
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const unitSph = new THREE.SphereGeometry(1, 16, 12);
const bootGeo = new THREE.BoxGeometry(0.1, 0.075, 0.25);
bootGeo.translate(0, 0, 0.05);

function placeLimb(m, a, b, r) {
  tmpV.set(a[0], a[1], a[2]);
  tmpV2.set(b[0], b[1], b[2]);
  const len = tmpV.distanceTo(tmpV2);
  m.position.copy(tmpV).add(tmpV2).multiplyScalar(0.5);
  tmpV2.sub(tmpV).normalize();
  if (len > 1e-5) m.quaternion.setFromUnitVectors(UP, tmpV2);
  m.scale.set(r, Math.max(0.001, len), r);
}

export function Figure({ engine, which, kits, shadows }) {
  const group = useRef();
  const mats = useMemo(() => {
    const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
    return { shirt: m("#fff"), sleeve: m("#fff"), arm: m("#fff"), skin: m("#fff"), thigh: m("#fff"), sock: m("#fff"), boot: m("#111"), hand: m("#fff"), hair: m("#2a1d14"), shorts: m("#fff") };
  }, []);
  const refs = useRef({});
  const kitKey = useRef("");
  useFrame(() => {
    const s = engine.session;
    const pen = s.pen;
    const g = group.current;
    if (!g) return;
    const hide = !pen || (which === "keeper" && pen.opts.noKeeper);
    g.visible = !hide;
    if (hide) return;
    const pose = which === "keeper" ? engine.keeperPose() : engine.kickerPose();
    if (!pose) return;
    // kit by role: the player's colours when the player controls this figure
    // menu hero: the taker is the player (your kit)
    const mine = which === "keeper" ? s.role === "keep" : s.role === "shoot" || engine.mode === "menu";
    const kit = which === "keeper" ? (mine ? kits.playerKeeper : kits.rivalKeeper) : mine ? kits.player : kits.rival;
    const key = `${which}|${mine}|${kit.shirt}|${kit.shorts}|${kit.skin}|${kit.boots}|${kit.hands}|${kit.socks}`;
    if (key !== kitKey.current) {
      kitKey.current = key;
      mats.shirt.color.set(kit.shirt);
      mats.sleeve.color.set(kit.shirt);
      mats.arm.color.set(which === "keeper" ? kit.shirt : kit.skin);
      mats.skin.color.set(kit.skin);
      mats.thigh.color.set(kit.shorts);
      mats.shorts.color.set(kit.shorts);
      mats.sock.color.set(kit.socks || kit.shorts);
      mats.boot.color.set(kit.boots);
      mats.hand.color.set(kit.hands);
    }
    const R = refs.current;
    for (const [a, b, r] of LIMBS) placeLimb(R[`${a}-${b}`], pose[a], pose[b], r);
    // torso: slightly wider shoulders — a second, shorter cylinder high up
    placeLimb(R.chestBox, pose.chest, pose.neck, 0.19);
    // shorts: a band around the hips
    placeLimb(R.shorts, [(pose.hipL[0] + pose.hipR[0]) / 2, pose.pelvis[1] - 0.14, (pose.hipL[2] + pose.hipR[2]) / 2], pose.pelvis, 0.18);
    const put = (m, p, r) => {
      m.position.set(p[0], p[1], p[2]);
      m.scale.setScalar(r);
    };
    put(R.head, pose.head, 0.115);
    // hair sits on the back of the head, opposite the gaze (shows where the head looks)
    const gz = pose.gaze || [0, 0, which === "keeper" ? 1 : -1];
    R.hair.position.set(pose.head[0] - gz[0] * 0.025 + pose.up[0] * 0.02, pose.head[1] + 0.03 - gz[1] * 0.01, pose.head[2] - gz[2] * 0.025);
    R.hair.scale.setScalar(0.118);
    put(R.hL, pose.hL, which === "keeper" ? 0.085 : 0.05);
    put(R.hR, pose.hR, which === "keeper" ? 0.085 : 0.05);
    for (const j of ["knL", "knR", "elL", "elR", "shL", "shR"]) put(R[j], pose[j], j[0] === "k" ? 0.07 : j[0] === "e" ? 0.05 : 0.07);
    // boots point along the body's facing
    const f = which === "keeper" ? [0, 0, 1] : pose.fwd;
    const yaw = Math.atan2(f[0], f[2]);
    for (const [k, p] of [["bootL", pose.ftL], ["bootR", pose.ftR]]) {
      R[k].position.set(p[0], Math.max(0.04, p[1]), p[2]);
      R[k].rotation.set(0, yaw, 0);
    }
  });
  const reg = (k) => (el) => {
    if (el) refs.current[k] = el;
  };
  return (
    <group ref={group}>
      {LIMBS.map(([a, b, , mk]) => (
        <mesh key={`${a}-${b}`} ref={reg(`${a}-${b}`)} geometry={unitCyl} material={mats[mk]} castShadow={shadows} />
      ))}
      <mesh ref={reg("chestBox")} geometry={unitCyl} material={mats.sleeve} castShadow={shadows} />
      <mesh ref={reg("shorts")} geometry={unitCyl} material={mats.shorts} castShadow={shadows} />
      <mesh ref={reg("head")} geometry={unitSph} material={mats.skin} castShadow={shadows} />
      <mesh ref={reg("hair")} geometry={unitSph} material={mats.hair} />
      <mesh ref={reg("hL")} geometry={unitSph} material={mats.hand} castShadow={shadows} />
      <mesh ref={reg("hR")} geometry={unitSph} material={mats.hand} castShadow={shadows} />
      {["knL", "knR"].map((k) => (
        <mesh key={k} ref={reg(k)} geometry={unitSph} material={mats.sock} />
      ))}
      {["elL", "elR"].map((k) => (
        <mesh key={k} ref={reg(k)} geometry={unitSph} material={mats.arm} />
      ))}
      {["shL", "shR"].map((k) => (
        <mesh key={k} ref={reg(k)} geometry={unitSph} material={mats.sleeve} />
      ))}
      <mesh ref={reg("bootL")} geometry={bootGeo} material={mats.boot} castShadow={shadows} />
      <mesh ref={reg("bootR")} geometry={bootGeo} material={mats.boot} castShadow={shadows} />
    </group>
  );
}

/** Soft contact shadows under both figures (always on; real shadows optional). */
export function FigureShadows({ engine }) {
  const a = useRef();
  const b = useRef();
  const blob = useMemo(() => blobTexture(), []);
  useFrame(() => {
    const s = engine.session;
    const kp = engine.keeperPose();
    const kk = engine.kickerPose();
    const set = (m, pose, show) => {
      if (!m) return;
      m.visible = !!pose && show;
      if (!m.visible) return;
      m.position.set(pose.pelvis[0], 0.01, pose.pelvis[2]);
    };
    set(a.current, kp, !s.pen?.opts.noKeeper);
    set(b.current, kk, true);
  });
  return (
    <>
      {[a, b].map((r, i) => (
        <mesh key={i} ref={r} rotation-x={-Math.PI / 2} renderOrder={1}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial map={blob} color="#000" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/* ================================================================ aim + targets */
export function AimMarker({ engine }) {
  const g = useRef();
  const ring = useRef();
  const fill = useRef();
  const curve = useRef();
  useFrame(() => {
    const s = engine.session;
    const show = engine.mode === "play" && s.role === "shoot" && (s.phase === "AIM" || s.phase === "INTRO");
    const el = g.current;
    if (!el) return;
    el.visible = show;
    if (!show) return;
    el.position.set(engine.aim.x, engine.aim.y, 0.05);
    const inFrame = Math.abs(engine.aim.x) < PK.GOAL_HALF_W - 0.1 && engine.aim.y < PK.GOAL_H - 0.08;
    ring.current.material.color.set(inFrame ? "#ffffff" : "#ff5a4a");
    const pw = engine.power();
    fill.current.visible = !!engine.charge;
    fill.current.scale.setScalar(0.02 + pw * 0.26);
    fill.current.material.color.set(pw > PK.OVERPOWER ? "#ff5a4a" : "#ffd84a");
    // curve hint: a short arc showing which way the flight bends
    curve.current.visible = Math.abs(engine.curve) > 0.02;
    curve.current.scale.set(engine.curve >= 0 ? 1 : -1, 1, 1);
    curve.current.material.opacity = 0.4 + Math.abs(engine.curve) * 0.6;
    const pulse = 1 + Math.sin(engine.wallT * 6) * 0.04;
    ring.current.scale.setScalar(pulse);
  });
  return (
    <group ref={g}>
      <mesh ref={ring} renderOrder={5}>
        <ringGeometry args={[0.26, 0.3, 40]} />
        <meshBasicMaterial color="#fff" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh renderOrder={5}>
        <ringGeometry args={[0.02, 0.045, 16]} />
        <meshBasicMaterial color="#fff" depthTest={false} transparent />
      </mesh>
      <mesh ref={fill} renderOrder={4}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#ffd84a" transparent opacity={0.45} depthTest={false} />
      </mesh>
      <mesh ref={curve} position={[0, -0.42, 0]} renderOrder={5}>
        <ringGeometry args={[0.34, 0.39, 24, 1, Math.PI * 1.15, Math.PI * 0.7]} />
        <meshBasicMaterial color="#9fe6ff" transparent opacity={0.8} depthTest={false} />
      </mesh>
    </group>
  );
}

export function TargetRing({ engine }) {
  const g = useRef();
  useFrame(() => {
    const s = engine.session;
    const t = s.mode === "targets" && s.target;
    const el = g.current;
    if (!el) return;
    el.visible = !!t;
    if (!t) return;
    el.position.set(t.x, t.y, 0.03);
    el.scale.setScalar(t.r);
    el.rotation.z = engine.wallT * 0.6;
  });
  return (
    <group ref={g}>
      <mesh renderOrder={3}>
        <ringGeometry args={[0.86, 1, 48]} />
        <meshBasicMaterial color="#ff6a2a" transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh renderOrder={3}>
        <ringGeometry args={[0.36, 0.5, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh renderOrder={2}>
        <circleGeometry args={[0.86, 48]} />
        <meshBasicMaterial color="#ff6a2a" transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ================================================================ stadium + crowd */
/** Seat rows for a venue: returns { slabs:[{pos,size}], seats:[[x,y,z]] }. */
function layoutStands(kind) {
  const slabs = [];
  const seats = [];
  const tiers = kind === "fence" ? 0 : kind === "small" ? 6 : kind === "medium" ? 10 : 16;
  // behind the goal: rows along x, stepping back (−z) and up
  const behind = (z0, len, rows) => {
    for (let r = 0; r < rows; r++) {
      const h = 0.9 + r * 0.42;
      const z = z0 - r * 0.78;
      slabs.push({ pos: [0, h / 2, z], size: [len, h, 0.8] });
      for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.62) seats.push([x, h, z + 0.05]);
    }
  };
  // along a touchline: rows along z, stepping outward (±x) and up
  const side = (x0, sgn, zc, len, rows) => {
    for (let r = 0; r < rows; r++) {
      const h = 0.9 + r * 0.42;
      const x = x0 + sgn * r * 0.78;
      slabs.push({ pos: [x, h / 2, zc], size: [0.8, h, len] });
      for (let z = zc - len / 2 + 0.4; z < zc + len / 2 - 0.2; z += 0.62) seats.push([x - sgn * 0.05, h, z]);
    }
  };
  if (kind === "fence") {
    // a few benches of locals along both sides of the pitch
    for (const sg of [-1, 1]) for (let r = 0; r < 2; r++) for (let z = -2; z < 26; z += 0.65) seats.push([sg * (21 + r * 0.8), 0.45 + r * 0.4, z]);
    return { slabs, seats };
  }
  behind(-9, 58, tiers);
  side(-27.5, -1, 16, 46, Math.max(4, tiers - 2));
  side(27.5, 1, 16, 46, Math.max(4, tiers - 2));
  return { slabs, seats };
}

export function Stadium({ venue, crowdLevel, engine, quality }) {
  const { slabs, seats } = useMemo(() => layoutStands(venue.stands), [venue]);
  const dark = venue.time === "night";
  const standMat = useMemo(() => new THREE.MeshStandardMaterial({ map: standTexture(dark), roughness: 0.9 }), [dark]);
  const slabGeo = useMemo(() => {
    if (!slabs.length) return null;
    const gs = slabs.map((s) => {
      const g = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
      g.translate(...s.pos);
      return g;
    });
    const m = mergeGeometries(gs);
    gs.forEach((g) => g.dispose());
    return m;
  }, [slabs]);
  useEffect(() => () => slabGeo && slabGeo.dispose(), [slabGeo]);
  const boards = useMemo(() => boardTexture(venue.boards, venue.name), [venue]);
  // spectators: density = venue crowd × setting
  const count = Math.floor(seats.length * venue.crowd * crowdLevel * (quality === "low" ? 0.6 : 1));
  const crowd = useMemo(() => {
    if (!count) return null;
    const body = new THREE.BoxGeometry(0.42, 0.62, 0.3);
    body.translate(0, 0.31, 0);
    const head = new THREE.BoxGeometry(0.22, 0.24, 0.22);
    head.translate(0, 0.76, 0);
    const geo = mergeGeometries([body, head]);
    body.dispose();
    head.dispose();
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const uni = { uTime: { value: 0 }, uExcite: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime;
      sh.uniforms.uExcite = uni.uExcite;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uExcite;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nfloat ph = float(gl_InstanceID) * 1.618;\ntransformed.y += sin(uTime * 1.3 + ph) * 0.03 + abs(sin(uTime * 9.0 + ph * 3.1)) * 0.32 * uExcite * step(0.35, fract(ph));"
        );
    };
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const palette = ["#e84c3d", "#f2c230", "#2b62d9", "#f4f4f0", "#1f9e57", "#1b1d24", "#ff7a2a", "#7a3cc7", venue.boards[0], venue.boards[0]];
    let a = 99;
    const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // spread the crowd evenly over all seats
    const step = seats.length / count;
    for (let i = 0; i < count; i++) {
      const s = seats[Math.floor(i * step + r() * step * 0.8) % seats.length];
      q.setFromAxisAngle(UP, (r() - 0.5) * 0.4);
      const sc = 0.88 + r() * 0.24;
      m4.compose(tmpV.set(s[0] + (r() - 0.5) * 0.12, s[1], s[2]), q, tmpV2.set(sc, sc, sc));
      mesh.setMatrixAt(i, m4);
      col.set(palette[Math.floor(r() * palette.length)]);
      if (dark) col.multiplyScalar(0.8);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return { mesh, uni, geo, mat };
  }, [count, seats, venue, dark]);
  useEffect(
    () => () => {
      if (crowd) {
        crowd.geo.dispose();
        crowd.mat.dispose();
        crowd.mesh.dispose();
      }
    },
    [crowd]
  );
  useFrame(() => {
    if (!crowd) return;
    crowd.uni.uTime.value = engine.wallT;
    crowd.uni.uExcite.value = engine.excite;
  });
  return (
    <group>
      {slabGeo && <mesh geometry={slabGeo} material={standMat} receiveShadow />}
      {crowd && <primitive object={crowd.mesh} />}
      {/* perimeter boards: behind the goal and down both sides */}
      <mesh position={[0, 0.5, -6]}>
        <boxGeometry args={[44, 1, 0.15]} />
        <meshStandardMaterial map={boards} emissive={dark ? "#ffffff" : "#000000"} emissiveMap={dark ? boards : null} emissiveIntensity={dark ? 0.55 : 0} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 23, 0.5, 12]} rotation-y={Math.PI / 2}>
          <boxGeometry args={[36, 1, 0.15]} />
          <meshStandardMaterial map={boards} emissive={dark ? "#ffffff" : "#000000"} emissiveMap={dark ? boards : null} emissiveIntensity={dark ? 0.55 : 0} roughness={0.6} />
        </mesh>
      ))}
      {venue.stands === "fence" && <Fence />}
      {venue.floodlights === "poles" ? <LightPoles /> : venue.floodlights && <Floodlights night={venue.time === "night"} />}
      <Backdrop venue={venue} />
    </group>
  );
}

/** Neighborhood Pitch: chain-link fence all round, wooden benches for the locals. */
function Fence() {
  const link = useMemo(() => chainLinkTexture(), []);
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7d878d", roughness: 0.5, metalness: 0.6 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a5a36", roughness: 0.85 }), []);
  const meshMat = (w, h) => {
    const t = link.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 0.9, h / 0.9);
    return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, color: "#c9d0d4" });
  };
  const panels = useMemo(
    () => [
      // [cx, cz, length, height, rotY]
      [0, -7.5, 44, 3.6, 0],
      [-19.5, 10, 35, 2.4, Math.PI / 2],
      [19.5, 10, 35, 2.4, Math.PI / 2],
    ].map(([x, z, len, h, r]) => ({ x, z, len, h, r, mat: meshMat(len, h) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [link]
  );
  useEffect(() => () => panels.forEach((p) => p.mat.dispose()), [panels]);
  const posts = [];
  for (const p of panels) {
    const n = Math.round(p.len / 3.5);
    for (let i = 0; i <= n; i++) {
      const u = -p.len / 2 + (p.len * i) / n;
      posts.push([p.r ? p.x : p.x + u, p.r ? p.z + u : p.z, p.h]);
    }
  }
  return (
    <group>
      {panels.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]} rotation-y={p.r} material={p.mat}>
          <planeGeometry args={[p.len, p.h]} />
        </mesh>
      ))}
      {posts.map(([x, z, h], i) => (
        <mesh key={`p${i}`} position={[x, h / 2, z]} material={pole}>
          <cylinderGeometry args={[0.045, 0.045, h, 8]} />
        </mesh>
      ))}
      {/* benches under the spectators outside both side fences */}
      {[-1, 1].flatMap((sg) =>
        [0, 1].map((r) => (
          <group key={`b${sg}${r}`} position={[sg * (21 + r * 0.8), 0, 12]}>
            <mesh position={[0, 0.42 + r * 0.4, 0]} material={wood}>
              <boxGeometry args={[0.42, 0.07, 28]} />
            </mesh>
            {[-12, -4, 4, 12].map((z) => (
              <mesh key={z} position={[0, (0.42 + r * 0.4) / 2, z]} material={pole}>
                <boxGeometry args={[0.06, 0.42 + r * 0.4, 0.06]} />
              </mesh>
            ))}
          </group>
        ))
      )}
    </group>
  );
}

function Floodlights({ night }) {
  const blob = useMemo(() => blobTexture(), []);
  const spots = [
    [-30, -14],
    [30, -14],
    [-30, 38],
    [30, 38],
  ];
  return (
    <group>
      {spots.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 16, 0]}>
            <boxGeometry args={[0.6, 32, 0.6]} />
            <meshStandardMaterial color="#5d6570" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 32.5, 0]} rotation-y={Math.atan2(-x, -z)}>
            <boxGeometry args={[5, 2.4, 0.5]} />
            <meshStandardMaterial color="#20242a" emissive={night ? "#fff8e6" : "#c9c4b6"} emissiveIntensity={night ? 1.6 : 0.3} />
          </mesh>
          {night && (
            <sprite position={[0, 32.5, 0]} scale={[16, 16, 1]}>
              <spriteMaterial map={blob} color="#fff4d6" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
            </sprite>
          )}
        </group>
      ))}
    </group>
  );
}

/** Neighborhood floodlight poles: slim, 14 m, unlit by day. */
function LightPoles() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6f7a80", roughness: 0.5, metalness: 0.6 }), []);
  return (
    <group>
      {[
        [-20.5, -6.5],
        [20.5, -6.5],
        [-20.5, 26],
        [20.5, 26],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 7, 0]} material={mat}>
            <cylinderGeometry args={[0.1, 0.16, 14, 10]} />
          </mesh>
          <mesh position={[-Math.sign(x) * 0.5, 14.1, 0]} rotation-z={Math.sign(x) * 0.35}>
            <boxGeometry args={[1.4, 0.35, 0.8]} />
            <meshStandardMaterial color="#2b2f36" emissive="#d9d4c4" emissiveIntensity={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Distant scenery per venue: trees and houses, a skyline, or the sea. */
function Backdrop({ venue }) {
  const items = useMemo(() => {
    let a = venue.key.length * 97 + 13;
    const r = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const out = [];
    const ringAt = (n, rMin, rMax, make) => {
      for (let i = 0; i < n; i++) {
        const ang = Math.PI * 0.15 + r() * Math.PI * 1.7 + Math.PI;
        const d = rMin + r() * (rMax - rMin);
        out.push(make(Math.sin(ang) * d, 12 + Math.cos(ang) * d, r));
      }
    };
    if (venue.key === "neighborhood") {
      ringAt(60, 34, 70, (x, z, r) => ({ kind: "tree", x, z, h: 5 + r() * 5 }));
      ringAt(14, 45, 80, (x, z, r) => ({ kind: "house", x, z, h: 4 + r() * 3, w: 6 + r() * 5, c: ["#d8c7a8", "#c56b4f", "#e9e3d5", "#9fb3c8"][Math.floor(r() * 4)] }));
    } else if (venue.key === "coastal") {
      ringAt(30, 50, 80, (x, z, r) => ({ kind: "tree", x, z, h: 6 + r() * 4 }));
    } else {
      ringAt(venue.key === "city" ? 26 : 36, 70, 130, (x, z, r) => ({ kind: "tower", x, z, h: 18 + r() * (venue.key === "city" ? 30 : 55), w: 8 + r() * 10 }));
    }
    return out;
  }, [venue]);
  const night = venue.time === "night";
  return (
    <group>
      {venue.key === "coastal" && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, -150]}>
          <planeGeometry args={[600, 220]} />
          <meshStandardMaterial color="#3b6f9a" roughness={0.25} metalness={0.3} />
        </mesh>
      )}
      {items.map((it, i) =>
        it.kind === "tree" ? (
          <group key={i} position={[it.x, 0, it.z]}>
            <mesh position={[0, it.h * 0.2, 0]}>
              <cylinderGeometry args={[0.25, 0.35, it.h * 0.4, 6]} />
              <meshLambertMaterial color="#5b4330" />
            </mesh>
            <mesh position={[0, it.h * 0.62, 0]}>
              <coneGeometry args={[it.h * 0.28, it.h * 0.8, 7]} />
              <meshLambertMaterial color={venue.key === "coastal" ? "#2f6b45" : "#3e7d3a"} />
            </mesh>
          </group>
        ) : it.kind === "house" ? (
          <group key={i} position={[it.x, 0, it.z]} rotation-y={Math.atan2(it.x, it.z - 12)}>
            <mesh position={[0, it.h / 2, 0]}>
              <boxGeometry args={[it.w, it.h, 6]} />
              <meshLambertMaterial color={it.c} />
            </mesh>
            <mesh position={[0, it.h + 1.2, 0]} rotation-y={Math.PI / 4}>
              <coneGeometry args={[it.w * 0.62, 2.4, 4]} />
              <meshLambertMaterial color="#7d3b2e" />
            </mesh>
          </group>
        ) : (
          <mesh key={i} position={[it.x, it.h / 2, it.z]}>
            <boxGeometry args={[it.w, it.h, it.w]} />
            <meshLambertMaterial color={night ? "#1a2036" : "#9aa6b8"} emissive={night ? "#3a3f5a" : "#000"} emissiveIntensity={night ? 0.35 : 0} />
          </mesh>
        )
      )}
    </group>
  );
}

/* ================================================================ particles */
const MAXP = 160;
export function Particles({ engine, enabled }) {
  const mesh = useRef();
  const P = useRef([]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    engine.fx = (kind, data) => {
      if (!enabled) return;
      const add = (p, v, c, life, size) => {
        if (P.current.length >= MAXP) P.current.shift();
        P.current.push({ p: [...p], v, c, life, age: 0, size });
      };
      if (kind === "kick") {
        for (let i = 0; i < 14; i++) add([0.05, 0.03, PK.SPOT_Z + 0.1], [(Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.8, 0.3 + Math.random() * 1.6], i % 3 ? "#5c9a3e" : "#8a6a42", 0.6, 0.035);
      } else if (kind === "bounce" && data.speed > 3) {
        for (let i = 0; i < 6; i++) add([data.p[0], 0.03, data.p[2]], [(Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2], "#5c9a3e", 0.45, 0.03);
      } else if (kind === "confetti") {
        const cs = ["#ffd84a", "#ff5a4a", "#4ad2ff", "#ffffff", "#7dff6a"];
        for (let i = 0; i < 120; i++) add([(Math.random() - 0.5) * 8, 4 + Math.random() * 2, 2 + Math.random() * 6], [(Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3], cs[i % 5], 3.2, 0.07);
      }
    };
    return () => {
      engine.fx = null;
    };
  }, [engine, enabled]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAXP; i++) {
      m.setMatrixAt(i, m4.makeScale(0, 0, 0));
      m.setColorAt(i, col.set("#ffffff"));
    }
    m.instanceMatrix.needsUpdate = true;
    m.material.needsUpdate = true;
  }, [m4, col]);
  const eul = useMemo(() => new THREE.Euler(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (!P.current.length && !m.userData.live) return;
    m.userData.live = P.current.length > 0;
    const d = Math.min(dt, 0.05);
    const list = (P.current = P.current.filter((p) => (p.age += d) < p.life));
    for (let i = 0; i < MAXP; i++) {
      const p = list[i];
      if (!p) {
        m4.makeScale(0, 0, 0);
        m.setMatrixAt(i, m4);
        continue;
      }
      const confetti = p.life > 2;
      p.v[1] -= (confetti ? 2.2 : 9.8) * d;
      if (confetti) {
        p.v[0] *= 1 - d;
        p.v[2] *= 1 - d;
      }
      p.p[0] += p.v[0] * d;
      p.p[1] = Math.max(0.01, p.p[1] + p.v[1] * d);
      p.p[2] += p.v[2] * d;
      const s = p.size * (1 - (p.age / p.life) * 0.5);
      q.setFromEuler(eul.set(p.age * 7 + i, p.age * 5, 0));
      m4.compose(tmpV.set(...p.p), q, tmpV2.set(s, s, s));
      m.setMatrixAt(i, m4);
      m.setColorAt(i, col.set(p.c));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[null, null, MAXP]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 0.2]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

export { KZ };
