/**
 * Alpine Rush — the 3D backdrop behind the menus (its own Canvas).
 *
 *   menu    the player's skier standing on a snowy ledge, poles planted,
 *           overlooking a valley: a groomed piste winding down between
 *           snowy forest, chalets, a chair lift with moving chairs, the
 *           peak ring and a bright alpine sun. The camera drifts slowly;
 *           not interactive.
 *   garage  the skier on a turntable inside a timber ski hut (drag to
 *           spin), wearing the selected skis and suit.
 * Everything is built once and disposed on unmount.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createSkierModel } from "./skierModel.js";
import Sky from "./Sky.jsx";
import { Lights, AutoRes } from "./RaceScene.jsx";
import { propGeo, windMaterial, windUniforms } from "./geo.js";
import { woodTex, pisteTex, grainTex, shadowTex, bannerTex, setTextureQuality } from "./textures.js";
import { WORLDS } from "../data/worlds.js";
import { mulberry32, fbm, ridged, smoothstep } from "../engine/rng.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { frameloop, glTest, Sizer } from "../utils/testHooks.js";

const W1 = WORLDS[0];
const WORLD = { ...W1, sky: { ...W1.sky, fogNear: 300, fogFar: 1700 } };
const SKIER_AT = [2.4, -12.4];
const HUT_AT = [-6, 8];

function valleyHeight(x, z) {
  const d = Math.abs(x + Math.sin(z * 0.004) * 110);
  const floor = -150 + z * 0.12;
  return floor + Math.pow(d / 300, 1.6) * 170 + (fbm(x / 80, z / 80, 4) - 0.5) * 26 + ridged(x / 280, z / 280, 9) * 120 * smoothstep(140, 480, d);
}
const pistePath = (z) => -Math.sin(z * 0.004) * 110 + Math.sin(z * 0.012) * 40;

function buildMenuWorld() {
  const group = new THREE.Group();
  const disp = [];
  const own = (x) => (disp.push(x), x);
  const rand = mulberry32(42);
  // snowy valley
  {
    const N = 130;
    const S = 1500;
    const g = own(new THREE.PlaneGeometry(S, S, N, N));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -S / 2 + 60);
    const p = g.attributes.position;
    const col = [];
    const c = new THREE.Color();
    const a = new THREE.Color(WORLD.snow.a);
    const b = new THREE.Color(WORLD.snow.b);
    const shade = new THREE.Color(WORLD.snow.shade);
    const rock = new THREE.Color(WORLD.snow.rock);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = valleyHeight(x, z);
      p.setY(i, y);
      const steep = Math.abs(valleyHeight(x + 4, z) - y) / 4;
      c.copy(a).lerp(b, fbm(x / 40, z / 40, 2)).lerp(shade, smoothstep(0.4, 1.0, steep) * 0.7).lerp(rock, smoothstep(1.1, 1.7, steep));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ vertexColors: true, map: grainTex() }))));
  }
  // the groomed piste winding down the valley
  {
    const pos = [];
    const uv = [];
    const idx = [];
    const M = 300;
    for (let i = 0; i <= M; i++) {
      const z = -30 - i * 3.6;
      const x = pistePath(z);
      const dx = pistePath(z - 1) - x;
      const l = Math.hypot(dx, 1);
      const nx = 1 / l;
      const nz = dx / l;
      for (const s of [1, -1]) {
        const px = x + nx * 11 * s;
        const pz = z + nz * 11 * s;
        pos.push(px, valleyHeight(px, pz) + 0.5, pz);
        uv.push(s > 0 ? 0 : 1, i * 0.36);
      }
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ map: pisteTex(WORLD.piste), side: THREE.DoubleSide }))));
  }
  // forest, chalets
  const mat = own(windMaterial());
  const plain = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const by = new Map();
  const put = (k, x, y, z, s, r = rand() * 6) => {
    if (!by.has(k)) by.set(k, []);
    by.get(k).push([x, y, z, s, r]);
  };
  for (let k = 0; k < 3200; k++) {
    const x = (rand() - 0.5) * 1200;
    const z = 40 - rand() * 1200;
    if (Math.hypot(x, z) < 24) continue;
    if (Math.abs(x - pistePath(z)) < 22) continue;
    const y = valleyHeight(x, z);
    const steep = Math.abs(valleyHeight(x + 4, z) - y) / 4;
    if (steep > 0.95 || rand() > 0.7) continue;
    put(rand() < 0.7 ? "snowpine" : "snowfir", x, y - 0.3, z, 1 + rand() * 1.1);
  }
  for (const [x, z, r] of [[pistePath(-260) + 34, -260, 1.2], [pistePath(-470) - 36, -470, -1.4], [pistePath(-650) + 30, -650, 0.8]]) put("cabin", x, valleyHeight(x, z) - 0.4, z, 1.3, r);
  // chair lift towers along the valley
  const towers = [];
  for (let z = -60; z > -900; z -= 70) {
    const x = pistePath(z) - 48;
    towers.push(new THREE.Vector3(x, valleyHeight(x, z) + 11.4, z));
    put("liftTower", x, valleyHeight(x, z) - 0.3, z, 1, Math.PI / 2);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [k, list] of by) {
    const im = new THREE.InstancedMesh(propGeo(k), ["cabin", "liftTower"].includes(k) ? plain : mat, list.length);
    list.forEach(([x, y, z, s, r], i) => {
      e.set(0, r, 0);
      q.setFromEuler(e);
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    });
    group.add(im);
  }
  const cable = own(new THREE.BufferGeometry().setFromPoints(towers));
  group.add(new THREE.Line(cable, own(new THREE.LineBasicMaterial({ color: "#2a2d34" }))));
  const chairs = new THREE.InstancedMesh(propGeo("chair"), plain, 14);
  chairs.frustumCulled = false;
  group.add(chairs);
  // the viewpoint ledge
  {
    const g = own(new THREE.CylinderGeometry(15, 22, 34, 18, 3));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 16) continue;
      const s = 1 + (rand() - 0.5) * 0.3;
      p.setX(i, p.getX(i) * s);
      p.setZ(i, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ color: "#6d727c", map: grainTex() })));
    m.position.set(0, -17, 0);
    group.add(m);
    const top = own(new THREE.CircleGeometry(15.4, 28));
    top.rotateX(-Math.PI / 2);
    const tm = new THREE.Mesh(top, own(new THREE.MeshLambertMaterial({ color: WORLD.snow.a, map: grainTex() })));
    tm.position.y = 0.02;
    tm.receiveShadow = true;
    group.add(tm);
    for (const [x, z, s] of [[7.5, -11.5, 1.0], [-3, -13, 0.7], [11, -3, 1.3], [-11, -7, 1.1]]) {
      const r = new THREE.Mesh(propGeo("snowrock"), plain);
      r.position.set(x, -0.25, z);
      r.scale.setScalar(s);
      group.add(r);
    }
    for (const [x, z] of [[10.5, -8], [12, -1], [-11.5, 2], [9, 11], [-12, 10]]) {
      const t = new THREE.Mesh(propGeo("snowpine"), mat);
      t.position.set(x, 0, z);
      t.scale.setScalar(1.1);
      group.add(t);
    }
    // piste sign
    const post = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 2, 0.12)), own(new THREE.MeshLambertMaterial({ map: woodTex("#6e4a2a") })));
    post.position.set(-0.6, 1, -14.2);
    group.add(post);
    const board = new THREE.Mesh(own(new THREE.PlaneGeometry(1.7, 0.42)), own(new THREE.MeshLambertMaterial({ map: bannerTex("ALPINE RUSH", "#0d2a52", "#ffd21f"), side: THREE.DoubleSide })));
    board.position.set(-0.6, 1.75, -14.15);
    board.rotation.y = 0.3;
    group.add(board);
  }
  const L = [0];
  for (let i = 1; i < towers.length; i++) L.push(L[i - 1] + towers[i].distanceTo(towers[i - 1]));
  const v = new THREE.Vector3();
  return {
    group,
    update(t) {
      const total = L[L.length - 1];
      for (let c = 0; c < 14; c++) {
        const d = ((c / 14) * total + t * 2.5) % total;
        let i = 1;
        while (i < L.length - 1 && L[i] < d) i++;
        const f = (d - L[i - 1]) / Math.max(1e-3, L[i] - L[i - 1]);
        v.lerpVectors(towers[i - 1], towers[i], f);
        v.y -= Math.sin(f * Math.PI) * 1.5;
        chairs.setMatrixAt(c, m4.makeTranslation(v.x, v.y, v.z));
      }
      chairs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disp.forEach((d) => d.dispose?.());
    },
  };
}

function buildHut() {
  const group = new THREE.Group();
  const disp = [];
  const own = (x) => (disp.push(x), x);
  const wood = own(new THREE.MeshLambertMaterial({ map: woodTex("#9a6a3c") }));
  const dark = own(new THREE.MeshLambertMaterial({ map: woodTex("#6e4a2a") }));
  const floor = new THREE.Mesh(own(new THREE.BoxGeometry(10, 0.2, 8)), wood);
  floor.position.set(0, -0.1, 0);
  floor.receiveShadow = true;
  group.add(floor);
  const back = new THREE.Mesh(own(new THREE.BoxGeometry(10, 5, 0.3)), dark);
  back.position.set(0, 2.5, -3.9);
  group.add(back);
  for (const x of [-4.9, 4.9]) {
    const side = new THREE.Mesh(own(new THREE.BoxGeometry(0.3, 5, 8)), dark);
    side.position.set(x, 2.5, 0);
    group.add(side);
  }
  const roof = new THREE.Mesh(own(new THREE.BoxGeometry(11, 0.5, 9)), own(new THREE.MeshLambertMaterial({ color: "#f4f8fc" })));
  roof.position.set(0, 5.2, 0);
  group.add(roof);
  // ski rack on the back wall
  const rackSkis = ["#e8343a", "#1f6fff", "#ffd21f", "#22b36a", "#ff8a1f", "#8a3aff", "#f2f4f8"];
  rackSkis.forEach((c, i) => {
    const s = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 1.7, 0.03)), own(new THREE.MeshLambertMaterial({ color: c })));
    s.position.set(-3.3 + i * 0.5, 1.6, -3.72);
    s.rotation.z = (i % 2 ? 1 : -1) * 0.06;
    group.add(s);
  });
  const ban = new THREE.Mesh(own(new THREE.PlaneGeometry(4.8, 0.75)), own(new THREE.MeshLambertMaterial({ map: bannerTex("SKI GARAGE", "#0d2a52", "#ffd21f") })));
  ban.position.set(0, 3.6, -3.73);
  group.add(ban);
  const plate = new THREE.Mesh(own(new THREE.CylinderGeometry(1.2, 1.3, 0.14, 32)), own(new THREE.MeshLambertMaterial({ color: "#2a2d34" })));
  plate.position.set(0, 0.07, 0);
  plate.receiveShadow = true;
  group.add(plate);
  const snow = new THREE.Mesh(own(new THREE.CylinderGeometry(1.1, 1.1, 0.05, 32)), own(new THREE.MeshLambertMaterial({ color: "#f4f8fc" })));
  snow.position.set(0, 0.16, 0);
  group.add(snow);
  return {
    group,
    dispose() {
      disp.forEach((d) => d.dispose?.());
    },
  };
}

function Backdrop({ mode, suit, ski, design, spinRef }) {
  const { camera } = useThree();
  const world = useMemo(() => buildMenuWorld(), []);
  const hut = useMemo(() => buildHut(), []);
  useEffect(
    () => () => {
      world.dispose();
      hut.dispose();
    },
    [world, hut],
  );
  const skier = useMemo(() => createSkierModel({ suit, ski, design, shadows: true, blobTex: shadowTex() }), [suit, ski, design]);
  useEffect(() => () => skier.dispose(), [skier]);
  const t = useRef(0);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    windUniforms.uTime.value = t.current;
    world.update(t.current);
    const garage = mode === "garage";
    hut.group.visible = garage;
    hut.group.position.set(HUT_AT[0], 0, HUT_AT[1]);
    if (garage) {
      const S = spinRef.current;
      if (!S.drag) S.v += (0.4 - S.v) * Math.min(1, dt * 0.8);
      S.a += S.v * dt;
      skier.root.position.set(HUT_AT[0], 0.19, HUT_AT[1]);
      skier.root.rotation.set(0, S.a, 0);
      skier.update({ speed: 0, tuck: 0.15 + Math.sin(t.current * 0.7) * 0.15, plow: 0, steer: 0, lean: Math.sin(t.current * 0.9) * 0.12, air: false, compress: 0, hold: false, slope: 0, t: t.current, pole: 0 }, dt);
      if (skier.blob) skier.blob.visible = false;
      camPos.set(HUT_AT[0] + 2.2, 1.6, HUT_AT[1] + 4.2);
      look.set(HUT_AT[0] - 0.9, 0.85, HUT_AT[1]);
    } else {
      skier.root.position.set(SKIER_AT[0], 0, SKIER_AT[1]);
      skier.root.rotation.set(0, Math.PI + 0.35, 0);
      skier.update({ speed: 0, tuck: 0, plow: 0, steer: 0, lean: 0, air: false, compress: 0, hold: true, slope: 0, t: t.current, pole: 0 }, dt);
      if (skier.blob) {
        skier.blob.visible = true;
        skier.blob.position.set(SKIER_AT[0], 0.05, SKIER_AT[1]);
        skier.blob.rotation.set(-Math.PI / 2, 0, 0.35);
      }
      const a = t.current * 0.03;
      camPos.set(-2.2 + Math.sin(a) * 0.8, 3.8 + Math.sin(a * 1.6) * 0.25, -5.6 + Math.cos(a) * 0.5);
      look.set(4.5, -14, -60);
    }
    camera.position.lerp(camPos, Math.min(1, dt * (garage ? 4 : 2)));
    camera.lookAt(look);
  });
  return (
    <>
      <primitive object={world.group} />
      <primitive object={hut.group} />
      <primitive object={skier.root} />
      {skier.blob && <primitive object={skier.blob} />}
    </>
  );
}

export default function MenuScene({ mode, suit, ski, design, quality = "medium" }) {
  setTextureQuality(quality);
  const hostRef = useRef(null);
  const spinRef = useRef({ a: 0.6, v: 0.4, drag: false, lx: 0 });
  useCanvasWatchdog(hostRef);
  const garage = mode === "garage";
  const focus = () => (garage ? { x: HUT_AT[0], y: 0, z: HUT_AT[1] } : { x: SKIER_AT[0], y: 0, z: SKIER_AT[1] });
  return (
    <div
      className={`ar-canvas ar-canvas--menu${garage ? " ar-canvas--garage" : ""}`}
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
          dpr={quality === "low" ? [0.6, 0.8] : quality === "high" ? [1, 1.4] : [0.75, 1]}
          shadows={quality === "high"}
          gl={{ antialias: quality === "high", powerPreference: "high-performance", ...glTest }}
          camera={{ fov: 50, near: 0.1, far: 4200, position: [-2.6, 3.6, -0.8] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Sizer />
          <AutoRes />
          <Sky region={WORLD} seed={7} />
          <Lights world={WORLD} focus={focus} shadows={quality === "high"} />
          <Backdrop mode={mode} suit={suit} ski={ski} design={design} spinRef={spinRef} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
