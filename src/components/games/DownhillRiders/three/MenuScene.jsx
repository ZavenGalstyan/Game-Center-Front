/**
 * Downhill Riders — the 3D backdrop behind the menus (its own Canvas).
 *
 *   menu    a rider standing beside the bike on a rocky viewpoint; below, a
 *           forested valley with a winding trail, a distant waterfall, the
 *           mountain ring and the morning sun. The camera drifts slowly; it
 *           is not interactive.
 *   garage  the selected bike on a turning work stand under a race-paddock
 *           tent (drag to spin), the same mountains behind.
 * Everything is built once and disposed on unmount.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createRider } from "./rider.js";
import Sky from "./Sky.jsx";
import { Lights } from "./RaceScene.jsx";
import { propGeo, windMaterial, windUniforms } from "./geo.js";
import { woodTex, waterfallTex, trailTex, grainTex, shadowTex, softDot, bannerTex } from "./textures.js";
import { REGIONS } from "../data/regions.js";
import { mulberry32, fbm, ridged, smoothstep } from "../engine/rng.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

const REGION = { ...REGIONS[0], sky: { ...REGIONS[0].sky, fogNear: 260, fogFar: 1500 } };
const RIDER_AT = [3.0, -13.2];
const PADDOCK_AT = [-5, 7];

function valleyHeight(x, z) {
  // a valley running away from the viewpoint (−z), walls rising either side
  const d = Math.abs(x + Math.sin(z * 0.004) * 120);
  const floor = -140 + z * 0.06;
  return floor + Math.pow(d / 330, 1.7) * 150 + (fbm(x / 90, z / 90, 4) - 0.5) * 40 + ridged(x / 300, z / 300, 9) * 90 * smoothstep(150, 500, d);
}

function buildMenuWorld() {
  const group = new THREE.Group();
  const disp = [];
  const own = (x) => (disp.push(x), x);
  const rand = mulberry32(42);
  // valley terrain
  {
    const N = 120;
    const S = 1400;
    const g = own(new THREE.PlaneGeometry(S, S, N, N));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -S / 2 + 60);
    const p = g.attributes.position;
    const col = [];
    const c = new THREE.Color();
    const grass = new THREE.Color(REGION.ground.grass);
    const forest = new THREE.Color("#2c5a2c");
    const rock = new THREE.Color(REGION.ground.rock);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = valleyHeight(x, z);
      p.setY(i, y);
      const steep = Math.abs(valleyHeight(x + 4, z) - y) / 4;
      c.copy(grass).lerp(forest, 0.6 * fbm(x / 70, z / 70, 2)).lerp(rock, smoothstep(0.7, 1.2, steep));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ vertexColors: true, map: grainTex() }))));
  }
  // winding trail down the valley floor
  {
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const z = -40 - k * 18;
      const x = -Math.sin(z * 0.004) * 120 + Math.sin(k * 0.55) * 28;
      pts.push(new THREE.Vector3(x, 0, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const pos = [];
    const uv = [];
    const idx = [];
    const M = 400;
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      const P = curve.getPointAt(t);
      const Tn = curve.getTangentAt(t);
      const nx = Tn.z;
      const nz = -Tn.x;
      for (const s of [1, -1]) {
        const x = P.x + nx * 3 * s;
        const z = P.z + nz * 3 * s;
        pos.push(x, valleyHeight(x, z) + 0.6, z);
        uv.push(s > 0 ? 0 : 1, t * 80);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ map: trailTex(REGION.trail, REGION.ground.grass), side: THREE.DoubleSide }))));
  }
  // forest
  const trees = [];
  for (let k = 0; k < 2600; k++) {
    const x = (rand() - 0.5) * 1100;
    const z = 40 - rand() * 1100;
    if (Math.hypot(x, z) < 26) continue;
    const y = valleyHeight(x, z);
    const steep = Math.abs(valleyHeight(x + 4, z) - y) / 4;
    if (steep > 1.0 || rand() > 0.75) continue;
    trees.push([x, y - 0.3, z, 1 + rand() * 1.1, rand() < 0.75 ? "pine" : "fir"]);
  }
  const mat = own(windMaterial());
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const kind of ["pine", "fir"]) {
    const list = trees.filter((t) => t[4] === kind);
    const im = new THREE.InstancedMesh(propGeo(kind), mat, list.length);
    list.forEach(([x, y, z, s], i) => {
      e.set(0, rand() * 6, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
    });
    group.add(im);
  }
  // the viewpoint: a rocky ledge with grass
  {
    const g = own(new THREE.CylinderGeometry(16, 22, 30, 18, 3));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 14) continue;
      const s = 1 + (rand() - 0.5) * 0.25;
      p.setX(i, p.getX(i) * s);
      p.setZ(i, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ color: "#7d776c", map: grainTex() })));
    m.position.set(0, -15, 0);
    group.add(m);
    const top = own(new THREE.CircleGeometry(16.2, 24));
    top.rotateX(-Math.PI / 2);
    const tm = new THREE.Mesh(top, own(new THREE.MeshLambertMaterial({ color: REGION.ground.grass2, map: grainTex() })));
    tm.position.y = 0.02;
    tm.receiveShadow = true;
    group.add(tm);
    for (const [x, z, s] of [[7.5, -12.5, 1.0], [-2.5, -13.5, 0.7], [11, -4, 1.3], [-12, -8, 1.1]]) {
      const r = new THREE.Mesh(propGeo("greyrock"), own(new THREE.MeshLambertMaterial({ vertexColors: true })));
      r.position.set(x, -0.2, z);
      r.scale.setScalar(s);
      group.add(r);
    }
    for (const [x, z] of [[11, -9], [13, -2], [-12, 2], [10, 12], [-13, 11]]) {
      const t = new THREE.Mesh(propGeo("pine"), mat);
      t.position.set(x, 0, z);
      t.scale.setScalar(1.1);
      group.add(t);
    }
    // trail sign
    const post = own(new THREE.BoxGeometry(0.12, 2, 0.12));
    const pm = new THREE.Mesh(post, own(new THREE.MeshLambertMaterial({ map: woodTex("#7a5230") })));
    pm.position.set(-0.4, 1, -14.6);
    group.add(pm);
    const board = own(new THREE.PlaneGeometry(1.6, 0.42));
    const bm = new THREE.Mesh(board, own(new THREE.MeshLambertMaterial({ map: bannerTex("SUMMIT TRAIL", "#7a5230", "#ffe9b0"), side: THREE.DoubleSide })));
    bm.position.set(-0.4, 1.7, -14.55);
    bm.rotation.y = 0.25;
    group.add(bm);
  }
  // distant waterfall on the valley wall
  const fallMat = own(new THREE.MeshBasicMaterial({ map: waterfallTex(false), transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  fallMat.map.repeat.set(1, 6);
  {
    // hung between a point up the valley wall and its foot
    const x = 330;
    const z = -520;
    const yb = valleyHeight(x - 20, z);
    const yt = valleyHeight(x + 45, z) - 4;
    const g = own(new THREE.PlaneGeometry(9, Math.max(20, yt - yb)));
    const m = new THREE.Mesh(g, fallMat);
    m.position.set(x + 10, (yt + yb) / 2, z);
    m.rotation.x = -0.35;
    m.rotation.y = -0.9;
    group.add(m);
    const mist = own(new THREE.SpriteMaterial({ map: softDot(), color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }));
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Sprite(mist);
      sp.position.set(x + (rand() - 0.5) * 16, yb + 2 + rand() * 6, z + (rand() - 0.5) * 16);
      sp.scale.setScalar(16 + rand() * 10);
      group.add(sp);
    }
  }
  return {
    group,
    update(t) {
      fallMat.map.offset.y = t * 0.6;
    },
    dispose() {
      disp.forEach((d) => d.dispose?.());
    },
  };
}

function buildPaddock() {
  const group = new THREE.Group();
  const disp = [];
  const own = (x) => (disp.push(x), x);
  const wood = own(new THREE.MeshLambertMaterial({ map: woodTex("#a8743f") }));
  const floor = own(new THREE.BoxGeometry(9, 0.2, 7));
  const fm = new THREE.Mesh(floor, wood);
  fm.position.set(0, -0.1, 0);
  fm.receiveShadow = true;
  group.add(fm);
  // tent canopy (striped) on four poles
  const poleG = own(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6));
  const metal = own(new THREE.MeshLambertMaterial({ color: "#c9ced6" }));
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
    const p = new THREE.Mesh(poleG, metal);
    p.position.set(x, 1.6, z);
    group.add(p);
  }
  const stripes = document.createElement("canvas");
  stripes.width = 256;
  stripes.height = 16;
  const sg = stripes.getContext("2d");
  for (let i = 0; i < 8; i++) {
    sg.fillStyle = i % 2 ? "#ffffff" : "#e8343a";
    sg.fillRect(i * 32, 0, 32, 16);
  }
  const st = own(new THREE.CanvasTexture(stripes));
  st.colorSpace = THREE.SRGBColorSpace;
  const roofG = own(new THREE.ConeGeometry(6.2, 1.6, 4, 1, true));
  const roof = new THREE.Mesh(roofG, own(new THREE.MeshLambertMaterial({ map: st, side: THREE.DoubleSide })));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.78);
  roof.position.set(0, 4.0, 0);
  group.add(roof);
  // back wall: tool board + shelves, tyre stack, crates, banner
  const board = own(new THREE.BoxGeometry(6, 2.2, 0.1));
  const bm = new THREE.Mesh(board, own(new THREE.MeshLambertMaterial({ color: "#5a6272" })));
  bm.position.set(0, 1.5, -3.2);
  group.add(bm);
  const toolMat = own(new THREE.MeshLambertMaterial({ color: "#d9dde3" }));
  for (let k = 0; k < 9; k++) {
    const t = new THREE.Mesh(own(new THREE.BoxGeometry(0.08, 0.5 + (k % 3) * 0.15, 0.04)), toolMat);
    t.position.set(-2.4 + k * 0.6, 1.7, -3.12);
    t.rotation.z = (k % 2 ? 0.3 : -0.2);
    group.add(t);
  }
  const ban = own(new THREE.PlaneGeometry(4.6, 0.7));
  const banM = new THREE.Mesh(ban, own(new THREE.MeshLambertMaterial({ map: bannerTex("DOWNHILL RIDERS", "#1d2230", "#ffd21f") })));
  banM.position.set(0, 3.0, -3.12);
  group.add(banM);
  const tyreG = own(new THREE.TorusGeometry(0.33, 0.1, 8, 18));
  const tyreM = own(new THREE.MeshLambertMaterial({ color: "#1d1d20" }));
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Mesh(tyreG, tyreM);
    t.rotation.x = Math.PI / 2;
    t.position.set(3.3, 0.12 + k * 0.2, -2.3);
    group.add(t);
  }
  const crateG = own(new THREE.BoxGeometry(0.8, 0.6, 0.6));
  for (const [x, z, r] of [[-3.3, -2.3, 0.2], [-3.1, -1.4, -0.3]]) {
    const c = new THREE.Mesh(crateG, wood);
    c.position.set(x, 0.3, z);
    c.rotation.y = r;
    group.add(c);
  }
  // work stand
  const standMat = own(new THREE.MeshLambertMaterial({ color: "#2a2d34" }));
  const base = new THREE.Mesh(own(new THREE.CylinderGeometry(0.9, 1.0, 0.12, 24)), standMat);
  base.position.set(0, 0.06, 0);
  group.add(base);
  const glow = own(new THREE.SpriteMaterial({ map: softDot(), color: "#ffd21f", transparent: true, opacity: 0.25, depthWrite: false }));
  const gs = new THREE.Sprite(glow);
  gs.scale.set(3.4, 0.6, 1);
  gs.position.set(0, 0.15, 0);
  group.add(gs);
  return {
    group,
    dispose() {
      disp.forEach((d) => d.dispose?.());
    },
  };
}

function Backdrop({ mode, bike, spinRef }) {
  const { camera } = useThree();
  const world = useMemo(() => buildMenuWorld(), []);
  const paddock = useMemo(() => buildPaddock(), []);
  useEffect(() => () => {
    world.dispose();
    paddock.dispose();
  }, [world, paddock]);
  const rider = useMemo(() => createRider(bike.colors, { shadows: true, blobTex: shadowTex() }), [bike]);
  useEffect(() => () => rider.dispose(), [rider]);
  const showBike = useMemo(() => createRider(bike.colors, { shadows: true }), [bike]);
  useEffect(() => () => showBike.dispose(), [showBike]);
  const t = useRef(0);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    windUniforms.uTime.value = t.current;
    world.update(t.current);
    const garage = mode === "garage";
    // menu rider stands beside the bike near the ledge, looking out over the valley
    rider.root.visible = !garage;
    rider.root.position.set(RIDER_AT[0], 0, RIDER_AT[1]);
    rider.root.rotation.y = Math.PI / 2 + 0.45;
    rider.update({ speed: 0, pedal: 0, steer: 0.25, lean: -0.06, pitch: 0, compress: 0, stand: true, wheelSpin: 0 }, dt);
    if (rider.blob) {
      rider.blob.visible = !garage;
      rider.blob.position.set(RIDER_AT[0], 0.05, RIDER_AT[1]);
      rider.blob.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.45);
    }
    // garage: the bike alone on the stand, rider hidden
    showBike.root.visible = garage;
    paddock.group.visible = garage;
    paddock.group.position.set(PADDOCK_AT[0], 0, PADDOCK_AT[1]);
    showBike.riderG.visible = false;
    const S = spinRef.current;
    S.v += (S.drag ? 0 : (0.35 - S.v) * Math.min(1, dt * 0.8)) || 0;
    S.a += S.v * dt;
    showBike.root.position.set(PADDOCK_AT[0], 0.22, PADDOCK_AT[1]);
    showBike.root.rotation.y = S.a;
    showBike.update({ speed: 0, pedal: 0, steer: Math.sin(t.current * 0.6) * 0.2, lean: 0, pitch: 0, compress: Math.sin(t.current * 1.4) * 0.05, wheelSpin: t.current * 2 }, dt);
    if (garage) {
      camPos.set(PADDOCK_AT[0] + 2.0, 1.45, PADDOCK_AT[1] + 4.4);
      look.set(PADDOCK_AT[0] - 1.25, 0.72, PADDOCK_AT[1]);
    } else {
      const a = t.current * 0.035;
      camPos.set(-2.6 + Math.sin(a) * 0.7, 4.2 + Math.sin(a * 1.7) * 0.2, -6.5 + Math.cos(a) * 0.5);
      look.set(5.5, -13, -60);
    }
    camera.position.lerp(camPos, Math.min(1, dt * (garage ? 4 : 2)));
    camera.lookAt(look);
  });
  return (
    <>
      <primitive object={world.group} />
      <primitive object={paddock.group} />
      <primitive object={rider.root} />
      {rider.blob && <primitive object={rider.blob} />}
      <primitive object={showBike.root} />
    </>
  );
}

export default function MenuScene({ mode, bike, quality = "medium" }) {
  const hostRef = useRef(null);
  const spinRef = useRef({ a: 0.6, v: 0.35, drag: false, lx: 0 });
  useCanvasWatchdog(hostRef);
  const focus = () => (mode === "garage" ? { x: PADDOCK_AT[0], y: 0, z: PADDOCK_AT[1] } : { x: RIDER_AT[0], y: 0, z: RIDER_AT[1] });
  const garage = mode === "garage";
  return (
    <div
      className={`dr-canvas dr-canvas--menu${garage ? " dr-canvas--garage" : ""}`}
      ref={hostRef}
      onPointerDown={(e) => {
        if (!garage) return;
        spinRef.current.drag = true;
        spinRef.current.lx = e.clientX;
        spinRef.current.v = 0;
      }}
      onPointerMove={(e) => {
        const S = spinRef.current;
        if (!S.drag) return;
        const dx = e.clientX - S.lx;
        S.lx = e.clientX;
        S.a += dx * 0.012;
        S.v = dx * 0.6;
      }}
      onPointerUp={() => (spinRef.current.drag = false)}
      onPointerLeave={() => (spinRef.current.drag = false)}
    >
      <SceneErrorBoundary>
        <Canvas
          frameloop={frameloop}
          dpr={quality === "low" ? [0.6, 0.85] : [0.85, 1.4]}
          shadows={quality !== "low"}
          gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
          camera={{ fov: 50, near: 0.1, far: 4200, position: [-2.8, 3.4, -0.9] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Sizer />
          <Sky region={REGION} seed={7} />
          <Lights region={REGION} focus={focus} shadows={quality !== "low"} />
          <Backdrop mode={mode} bike={bike} spinRef={spinRef} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
