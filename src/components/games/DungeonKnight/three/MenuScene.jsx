/**
 * Dungeon Knight — the 3D backdrop behind every menu: the knight (in his
 * equipped gear) standing before a torch-lit dungeon entrance, stairs
 * descending into the dark behind him, fog and drifting embers.
 *
 *   view "wide"   main menu: knight right of centre, the arch behind
 *   view "knight" equipment / knight screens: closer, slowly turning
 *   view "gate"   dungeon select: the stairs, the knight small
 *
 * One canvas for all menu screens (switching screens only eases the camera).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { buildHumanoid, poseHumanoid, disposeHumanoid } from "./humanoid.js";
import { knightSpec } from "./knightView.js";
import { mat, steel, lathe, addMesh, group, geo, applyEnvironment, releaseEnvironment } from "./materials.js";
import { floorTexture, wallTexture, flameTexture, glowTexture, woodTexture } from "./textures.js";
import { frameloop, glTest, Sizer, TEST } from "../utils/testHooks.js";
import { useCanvasWatchdog } from "../utils/canvasGuard.jsx";

const VIEWS = {
  wide: { pos: [1.25, 1.75, 5.2], look: [-0.95, 1.45, 0], spin: false },
  knight: { pos: [-0.45, 1.45, 4.7], look: [-2.75, 1.05, 0.6], spin: true },
  gate: { pos: [0.0, 2.2, 6.4], look: [0, 1.9, -2], spin: false },
};

function buildBackdrop(scene, quality) {
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color("#07060a");
  scene.fog = new THREE.Fog("#0b0908", 6, 19);
  const stone = mat("#8f8475", 0.9, 0, { map: wallTexture() });
  const trim = mat("#6a5f53", 0.88, 0, { map: wallTexture() });
  const floorM = new THREE.MeshStandardMaterial({ color: "#8a8073", map: floorTexture(), roughness: 0.92 });
  const floorG = new THREE.PlaneGeometry(20, 20);
  floorG.rotateX(-Math.PI / 2);
  const fuv = floorG.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 7, fuv.getY(i) * 7);
  const floor = addMesh(root, floorG, floorM, null, null, null, false);
  floor.receiveShadow = true;
  // back wall with a great arch
  const wallZ = -1.8;
  const archW = 2.6;
  const wallG = (() => {
    const s = new THREE.Shape();
    s.moveTo(-9, 0);
    s.lineTo(-9, 7);
    s.lineTo(9, 7);
    s.lineTo(9, 0);
    s.lineTo(archW / 2, 0);
    s.lineTo(archW / 2, 2.6);
    s.absarc(0, 2.6, archW / 2, 0, Math.PI, false);
    s.lineTo(-archW / 2, 0);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false, curveSegments: 18 });
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.8, uv.getY(i) / 2.8);
    return g;
  })();
  const wall = addMesh(root, wallG, stone, [0, 0, wallZ - 0.8], null, null, false);
  wall.receiveShadow = true;
  const archG = (() => {
    const s = new THREE.Shape();
    const ow = archW / 2 + 0.45;
    const iw = archW / 2;
    s.moveTo(-ow, 0);
    s.lineTo(-ow, 2.6);
    s.absarc(0, 2.6, ow, Math.PI, 0, true);
    s.lineTo(ow, 0);
    s.lineTo(iw, 0);
    s.lineTo(iw, 2.6);
    s.absarc(0, 2.6, iw, 0, Math.PI, false);
    s.lineTo(-iw, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 1, curveSegments: 18 });
  })();
  addMesh(root, archG, trim, [0, 0, wallZ - 0.9], null, null, true).receiveShadow = true;
  addMesh(root, new THREE.BoxGeometry(0.4, 0.55, 1.1), trim, [0, 4.15, wallZ - 0.4], null, null, false);
  // stairs descending into the dark
  for (let i = 0; i < 12; i++) {
    const st = addMesh(root, new THREE.BoxGeometry(archW, 0.22, 0.42), trim, [0, -0.11 - i * 0.22, wallZ - 1.0 - i * 0.42], null, null, false);
    st.receiveShadow = true;
  }
  addMesh(root, new THREE.PlaneGeometry(archW + 0.2, 6), mat("#020203", 1), [0, 0.2, wallZ - 5.8], null, null, false);
  for (const s of [-1, 1]) addMesh(root, new THREE.BoxGeometry(0.3, 6, 6), stone, [s * (archW / 2 + 0.15), 0.4, wallZ - 3.6], null, null, false);
  // pillars
  const pillarG = lathe([[0.55, 0], [0.55, 0.3], [0.44, 0.42], [0.4, 0.5], [0.38, 4.6], [0.44, 4.8], [0.55, 5.0], [0.55, 7]], 18);
  for (const x of [-4.6, 4.6]) addMesh(root, pillarG, stone, [x, 0, wallZ + 0.3], null, null, true);
  // braziers / torches either side of the arch
  const flames = [];
  const flameMat = new THREE.SpriteMaterial({ map: flameTexture(), color: "#ffb35c", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffb35c", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const x of [-2.3, 2.3]) {
    const t = group(root, [x, 0, wallZ + 0.35]);
    addMesh(t, lathe([[0.0, 0], [0.22, 0], [0.12, 0.12], [0.08, 1.0], [0.14, 1.08], [0.3, 1.22], [0.32, 1.32], [0.0, 1.3]], 14), steel("#5a544c", 0.6), null, null, null, true);
    const f = new THREE.Sprite(flameMat);
    f.position.set(0, 1.62, 0);
    f.scale.set(0.55, 0.85, 1);
    t.add(f);
    const h = new THREE.Sprite(haloMat);
    h.position.set(0, 1.6, 0);
    h.scale.set(2.6, 2.6, 1);
    t.add(h);
    const l = new THREE.PointLight("#ffa04a", 11, 9, 1.6);
    l.position.set(0, 1.7, 0.3);
    t.add(l);
    flames.push({ f, l, seed: x });
  }
  // a little clutter
  const wood = mat("#7a5232", 0.85, 0, { map: woodTexture() });
  const crate = addMesh(root, new THREE.BoxGeometry(0.8, 0.8, 0.8), wood, [-3.4, 0.4, wallZ + 1.0], [0, 0.4, 0], null, true);
  crate.receiveShadow = true;
  addMesh(root, new THREE.BoxGeometry(0.6, 0.6, 0.6), wood, [-3.35, 1.1, wallZ + 1.0], [0, 0.9, 0], null, true);
  for (const [x, z] of [[3.5, wallZ + 0.9], [3.0, wallZ + 1.5]]) addMesh(root, lathe([[0, 0], [0.3, 0], [0.36, 0.5], [0.3, 1.0], [0, 1.0]], 14), wood, [x, 0, z], null, null, true);
  // cool moon/key light + ambient
  const hemi = new THREE.HemisphereLight("#5a6a8f", "#2a1e16", 0.45);
  root.add(hemi);
  const key = new THREE.DirectionalLight("#9fb4ff", 0.55);
  key.position.set(3, 8, 6);
  key.target.position.set(0, 0, 0);
  root.add(key, key.target);
  if (quality !== "low") {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 6;
    sc.bottom = -6;
    sc.near = 1;
    sc.far = 20;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
  }
  // a soft warm front fill so the knight's face and armour read against the arch
  const front = new THREE.PointLight("#ffd2a0", 7, 9, 1.4);
  front.position.set(0.6, 2.4, 3.2);
  root.add(front);
  const rim = new THREE.SpotLight("#9fc4ff", 18, 12, 0.5, 0.6, 1.2);
  rim.position.set(-1.2, 4.5, -1.2);
  rim.target.position.set(-1, 1, 0.6);
  root.add(rim, rim.target);
  // embers / dust
  const n = quality === "low" ? 40 : 110;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 5;
    pos[i * 3 + 1] = Math.random() * 4;
    pos[i * 3 + 2] = -1.6 + Math.random() * 6;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: "#ffb36a", size: 0.04, map: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(pg, pm);
  root.add(pts);
  const base = pos.slice();
  return {
    root,
    update(t) {
      for (const fl of flames) {
        const f = 0.88 + Math.sin(t * 11 + fl.seed) * 0.06 + Math.sin(t * 23 + fl.seed * 3) * 0.05;
        fl.f.scale.set(0.55 * f, 0.85 * (0.9 + (f - 0.88) * 2), 1);
        fl.l.intensity = 11 * f;
      }
      const p = pg.attributes.position;
      for (let i = 0; i < n; i++) {
        p.array[i * 3] = base[i * 3] + Math.sin(t * 0.3 + i) * 0.25;
        p.array[i * 3 + 1] = (base[i * 3 + 1] + t * 0.25 + i * 0.05) % 4.2;
        p.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.2 + i) * 0.2;
      }
      p.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.isLight && o.dispose) o.dispose();
      });
      floorM.dispose();
      flameMat.dispose();
      haloMat.dispose();
      pg.dispose();
      pm.dispose();
    },
  };
}

function Driver({ equipped, viewRef, quality, motionRef }) {
  const { scene, camera, gl } = useThree();
  const st = useRef(null);
  useEffect(() => {
    gl.shadowMap.enabled = quality !== "low";
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    applyEnvironment(gl, scene, 0.35);
    const bd = buildBackdrop(scene, quality);
    const v = VIEWS[viewRef.current] || VIEWS.wide;
    camera.position.set(...v.pos);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    st.current = { bd, rig: null, key: "", t: 0, look: new THREE.Vector3(...v.look), pos: new THREE.Vector3(...v.pos), yaw: 0.35 };
    if (TEST) {
      window.__dkMenu = { scene, camera, gl };
    }
    return () => {
      if (st.current.rig) disposeHumanoid(st.current.rig);
      bd.dispose();
      scene.environment = null;
      releaseEnvironment(gl);
      st.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // (re)build the knight when the gear changes
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const k = `${equipped.weapon}|${equipped.armor}|${equipped.shield}`;
    if (k === s.key) return;
    if (s.rig) disposeHumanoid(s.rig);
    s.rig = buildHumanoid(knightSpec(equipped, quality !== "low"));
    scene.add(s.rig.root);
    s.key = k;
  }, [equipped.weapon, equipped.armor, equipped.shield, quality, scene]);
  useFrame((_, dtRaw) => {
    const s = st.current;
    if (!s) return;
    const dt = Math.min(0.05, dtRaw);
    s.t += dt;
    const v = VIEWS[viewRef.current] || VIEWS.wide;
    const k = 1 - Math.exp(-2.4 * dt);
    const reduced = motionRef.current;
    s.pos.lerp(new THREE.Vector3(...v.pos), k);
    s.look.lerp(new THREE.Vector3(...v.look), k);
    const sway = reduced ? 0 : 1;
    camera.position.set(s.pos.x + Math.sin(s.t * 0.21) * 0.12 * sway, s.pos.y + Math.sin(s.t * 0.33) * 0.05 * sway, s.pos.z);
    camera.lookAt(s.look);
    s.bd.update(s.t);
    if (s.rig) {
      const wantYaw = v.spin && !reduced ? 0.35 + Math.sin(s.t * 0.35) * 0.6 : 0.35;
      s.yaw += (wantYaw - s.yaw) * (1 - Math.exp(-2 * dt));
      const breathe = Math.sin(s.t * 1.6) * 0.012;
      poseHumanoid(
        s.rig,
        {
          x: -1.0, z: 0.6, yaw: s.yaw, y: 0, twist: 0, lean: breathe, crouch: 0, roll: 0, fall: 0, hurt: 0,
          hR: [0.3, 0.92 + breathe, 0.22], dR: [0.14, -0.9, 0.4], hL: [-0.3, 1.05 + breathe, 0.27], nL: [-0.45, 0.05, 0.9],
          eyes: 0, noGait: true,
        },
        dt,
        s.t,
      );
    }
  });
  return null;
}

export default function MenuScene({ equipped, view = "wide", quality = "medium", reducedMotion = false }) {
  const hostRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const motionRef = useRef(reducedMotion);
  motionRef.current = reducedMotion;
  useCanvasWatchdog(hostRef);
  return (
    <div ref={hostRef} className="dk-menu3d" aria-hidden="true">
      <Canvas dpr={quality === "high" ? [1, 2] : [1, 1.5]} frameloop={frameloop} shadows={quality !== "low"} gl={{ antialias: true, ...glTest }} camera={{ fov: 45, near: 0.1, far: 60, position: [1.2, 1.7, 5.2] }}>
        <Sizer />
        <Driver equipped={equipped} viewRef={viewRef} quality={quality} motionRef={motionRef} />
      </Canvas>
    </div>
  );
}

void geo;
