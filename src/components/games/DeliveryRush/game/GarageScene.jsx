/**
 * Delivery Rush — the garage showroom.
 *
 * A small workshop built from the same geometry accumulator as the city: a
 * polished floor with a lit turntable, painted bay lines, a back wall of
 * shutters and racking, ceiling strip lights, and a few props (tyre stack,
 * tool chest, jack, oil drums) so it reads as a place rather than a backdrop.
 *
 * The selected car sits on the turntable and rotates on its own; drag with a
 * mouse or finger to spin it yourself, and it eases back into its idle spin.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { MeshAcc } from "../world/geom.js";
import { rgb, shade, mix } from "../world/palette.js";
import { buildVehicle } from "../world/vehicleModel.js";

/**
 * A small studio environment map — a soft grey gradient with two bright
 * softbox patches — so the car's glass and chrome reflect something instead
 * of rendering flat black. The room's own spot/point lights still do the
 * actual illumination; this only feeds reflections.
 */
function buildStudioEnv(renderer) {
  const envScene = new THREE.Scene();
  const disposables = [];

  const geo = new THREE.SphereGeometry(10, 16, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = [0.42, 0.46, 0.52];
  const bot = [0.08, 0.09, 0.11];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const t = Math.max(0, Math.min(1, (y + 1) / 2));
    colors[i * 3] = bot[0] + (top[0] - bot[0]) * t;
    colors[i * 3 + 1] = bot[1] + (top[1] - bot[1]) * t;
    colors[i * 3 + 2] = bot[2] + (top[2] - bot[2]) * t;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(geo, mat));
  disposables.push(geo, mat);

  for (const [x, y, z, c] of [
    [4, 5, 5, 0xfff6e8],
    [-5, 3, -4, 0x8fb4ff],
  ]) {
    const sGeo = new THREE.SphereGeometry(1.6, 8, 6);
    const sMat = new THREE.MeshBasicMaterial({ color: c });
    const s = new THREE.Mesh(sGeo, sMat);
    s.position.set(x, y, z);
    envScene.add(s);
    disposables.push(sGeo, sMat);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.03, 0.1, 20);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  envScene.clear();
  return rt;
}

const FLOOR = rgb("#2b3138");
const FLOOR_2 = rgb("#333a42");
const WALL = rgb("#39424b");
const WALL_2 = rgb("#2c343c");
const METAL = rgb("#7d868f");
const DARK = rgb("#1b2026");
const LINE = rgb("#f0c04a");
const GLOW = rgb("#e8f2ff");

function buildRoom() {
  const opaque = new MeshAcc(8192);
  const emissive = new MeshAcc(1024);
  const W = 26;
  const D = 24;
  const H = 6.4;

  // floor with a chequer of subtle tone shifts
  opaque.quadY(-W / 2, -D / 2, W / 2, D / 2, 0, FLOOR);
  for (let x = -W / 2; x < W / 2; x += 3) {
    for (let z = -D / 2; z < D / 2; z += 3) {
      if (((x + z) / 3) % 2 === 0) continue;
      opaque.quadY(x, z, x + 3, z + 3, 0.002, FLOOR_2);
    }
  }
  // bay markings
  opaque.quadY(-5.4, -6.4, -5.2, 6.4, 0.006, LINE);
  opaque.quadY(5.2, -6.4, 5.4, 6.4, 0.006, LINE);
  opaque.quadY(-5.4, 6.2, 5.4, 6.4, 0.006, LINE);

  // walls
  opaque.add("box", [0, H / 2, -D / 2], [W, H, 0.4], WALL);
  opaque.add("box", [-W / 2, H / 2, 0], [0.4, H, D], WALL_2);
  opaque.add("box", [W / 2, H / 2, 0], [0.4, H, D], WALL_2);
  opaque.add("box", [0, H, 0], [W, 0.4, D], shade(WALL_2, 0.7));
  // dado band
  opaque.add("box", [0, 1.15, -D / 2 + 0.22], [W, 2.3, 0.12], shade(WALL, 0.72));

  // roller shutter on the back wall
  opaque.add("box", [0, 2.4, -D / 2 + 0.3], [9.5, 4.8, 0.18], shade(METAL, 0.72));
  for (let i = 0; i < 14; i++) {
    opaque.add("box", [0, 0.3 + i * 0.34, -D / 2 + 0.42], [9.3, 0.2, 0.08], shade(METAL, 0.62));
  }
  opaque.add("box", [0, 5.0, -D / 2 + 0.35], [10.2, 0.35, 0.3], shade(METAL, 0.9));

  // racking along the left wall
  for (let i = 0; i < 4; i++) {
    opaque.add("box", [-W / 2 + 1.1, 0.5 + i * 1.35, -3.5], [1.8, 0.12, 9], METAL);
    for (const z of [-7.6, -3.5, 0.6]) {
      opaque.add("box", [-W / 2 + 1.1, 2.6, z], [0.14, 5.2, 0.14], shade(METAL, 0.8));
    }
  }
  for (let i = 0; i < 9; i++) {
    const z = -7.2 + i * 0.95;
    opaque.add("box", [-W / 2 + 1.1, 1.05 + (i % 3) * 1.35, z], [1.4, 0.85, 0.7],
      shade(rgb(["#b7452f", "#2f6f8f", "#c9a227"][i % 3]), 0.9));
  }

  // tool chest + jack + oil drums on the right
  opaque.add("box", [W / 2 - 2.2, 0.55, -4], [2.4, 1.1, 1.0], rgb("#b8452f"));
  opaque.add("box", [W / 2 - 2.2, 1.13, -4], [2.5, 0.08, 1.1], shade(METAL, 1.1));
  for (let i = 0; i < 3; i++) {
    opaque.add("box", [W / 2 - 2.2, 0.3 + i * 0.33, -3.52], [2.1, 0.24, 0.06], shade(DARK, 1.6));
  }
  for (let i = 0; i < 3; i++) {
    opaque.add("cyl12", [W / 2 - 2.6 + i * 1.1, 0.45, 1.6], [0.86, 0.9, 0.86],
      shade(rgb(["#2f6f8f", "#3f7a4f", "#8a8f96"][i]), 1));
    opaque.add("cyl12", [W / 2 - 2.6 + i * 1.1, 0.92, 1.6], [0.9, 0.06, 0.9], shade(METAL, 0.9));
  }
  // tyre stack
  for (let i = 0; i < 4; i++) {
    opaque.add("cyl16", [-W / 2 + 3.4, 0.18 + i * 0.34, 6.4], [1.5, 0.34, 1.5], rgb("#191b1e"));
  }
  // workbench
  opaque.add("box", [-4.5, 0.45, -D / 2 + 1.6], [5.5, 0.9, 1.1], shade(METAL, 0.72));
  opaque.add("box", [-4.5, 0.94, -D / 2 + 1.6], [5.7, 0.1, 1.25], rgb("#8a6a43"));

  /* -------------------------------------------------------------- turntable */

  opaque.add("cyl16", [0, 0.06, 0], [11.2, 0.12, 11.2], shade(FLOOR_2, 1.15));
  opaque.add("cyl16", [0, 0.13, 0], [10.4, 0.06, 10.4], shade(FLOOR, 1.25));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    emissive.add(
      "box",
      [Math.cos(a) * 5.35, 0.15, Math.sin(a) * 5.35],
      [0.5, 0.05, 0.16],
      shade(GLOW, 0.55),
      -a,
    );
  }

  /* ------------------------------------------------------------ ceiling rig */

  for (const z of [-6.5, 0, 6.5]) {
    opaque.add("box", [0, H - 0.55, z], [16, 0.28, 0.9], shade(METAL, 0.6));
    emissive.add("box", [0, H - 0.72, z], [15.2, 0.1, 0.62], GLOW);
  }
  for (const x of [-9, 9]) {
    opaque.add("box", [x, H - 0.4, 0], [0.2, 0.6, D - 2], shade(METAL, 0.5));
  }

  return { opaque, emissive };
}

function Room({ vehicle, paintHex, spinRef }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);

  useLayoutEffect(() => {
    const root = new THREE.Group();
    const { opaque, emissive } = buildRoom();
    const envMap = buildStudioEnv(gl);
    scene.environment = envMap.texture;

    const oGeo = opaque.build();
    const oMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18, envMapIntensity: 0.25 });
    const oMesh = new THREE.Mesh(oGeo, oMat);
    oMesh.receiveShadow = true;
    oMesh.castShadow = false;
    root.add(oMesh);

    const eGeo = emissive.build();
    const eMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    root.add(new THREE.Mesh(eGeo, eMat));

    const pivot = new THREE.Group();
    root.add(pivot);
    const car = buildVehicle(vehicle.body, paintHex, {});
    car.group.position.y = 0.16;
    pivot.add(car.group);
    car.shadow.mesh.position.y = 0.165; // just above the turntable surface
    car.shadow.mesh.scale.multiplyScalar(0.92); // a touch tighter under studio light
    pivot.add(car.shadow.mesh);

    // three-point lighting: key over the turntable, cool fill, warm rim
    const key = new THREE.SpotLight(0xffffff, 90, 22, 0.72, 0.6, 1.6);
    key.position.set(2.5, 6.0, 3.5);
    key.target.position.set(0, 0.8, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0012;
    root.add(key, key.target);

    const fill = new THREE.PointLight(0x9fc4ff, 42, 26, 2);
    fill.position.set(-6, 4.2, -4);
    root.add(fill);

    const rim = new THREE.PointLight(0xffc98a, 34, 22, 2);
    rim.position.set(5.5, 2.6, -5.5);
    root.add(rim);

    root.add(new THREE.HemisphereLight(0x8fa8c0, 0x24282e, 0.85));
    root.add(new THREE.AmbientLight(0xffffff, 0.22));

    const prevFog = scene.fog;
    const prevBg = scene.background;
    const prevEnv = scene.environment;
    scene.fog = new THREE.Fog(0x1b2026, 26, 62);
    scene.background = new THREE.Color(0x151a1f);
    scene.add(root);

    ref.current = { root, pivot, car, t: 0, disposables: [oGeo, oMat, eGeo, eMat] };

    return () => {
      scene.remove(root);
      scene.fog = prevFog;
      scene.background = prevBg;
      scene.environment = prevEnv;
      envMap.dispose();
      car.dispose();
      for (const d of ref.current.disposables) d.dispose();
      key.dispose();
      fill.dispose();
      rim.dispose();
      root.clear();
      ref.current = null;
    };
  }, [scene, vehicle.id, vehicle.body, paintHex]);

  useFrame((_, delta) => {
    const o = ref.current;
    if (!o) return;
    const dt = Math.min(0.05, delta);
    o.t += dt;
    const s = spinRef.current;
    if (!s.dragging) s.velocity += (0.28 - s.velocity) * Math.min(1, dt * 1.4);
    s.angle += s.velocity * dt;
    o.pivot.rotation.y = s.angle;

    camera.position.set(
      Math.sin(0.62) * 9.2,
      3.05 + Math.sin(o.t * 0.4) * 0.12,
      Math.cos(0.62) * 9.2,
    );
    camera.lookAt(0, 1.05, 0);
  });

  return null;
}

export default function GarageScene({ vehicle, paintHex, quality = "high" }) {
  const spinRef = useRef({ angle: 0.6, velocity: 0.28, dragging: false });
  const hostRef = useRef(null);

  // drag to spin — pointer events on the wrapper, not the canvas, so the
  // controls above it keep working
  const pointer = useMemo(() => {
    let lastX = 0;
    return {
      onPointerDown(e) {
        spinRef.current.dragging = true;
        spinRef.current.velocity = 0;
        lastX = e.clientX;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove(e) {
        if (!spinRef.current.dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        spinRef.current.angle -= dx * 0.008;
        spinRef.current.velocity = -dx * 0.35;
      },
      onPointerUp() {
        spinRef.current.dragging = false;
      },
      onPointerCancel() {
        spinRef.current.dragging = false;
      },
    };
  }, []);

  return (
    <div className="dr-bgscene dr-bgscene--garage" ref={hostRef} {...pointer}>
      <Canvas
        dpr={quality === "low" ? [0.6, 1] : [1, 1.8]}
        gl={{ antialias: quality !== "low", alpha: false, stencil: false }}
        shadows={quality !== "low"}
        camera={{ fov: 38, near: 0.3, far: 120, position: [6, 3, 7] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Room vehicle={vehicle} paintHex={paintHex} spinRef={spinRef} />
      </Canvas>
    </div>
  );
}
