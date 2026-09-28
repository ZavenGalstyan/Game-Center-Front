/**
 * Street Basketball — the court and its surroundings, per court theme.
 *
 * Gameplay-critical things (court lines, hoop) are identical everywhere and
 * come from engine constants; the rest is dressing, scaled by the Graphics
 * setting (low trims props/crowd first — never the ball, players or hoop).
 * Repeated props (trees, fence posts, crowd, windows) use instancing or a
 * handful of shared materials to keep draw calls low.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { COURT_HALF_W, BASELINE_Z, COURT_FAR_Z } from "../engine/constants.js";
import {
  COURT_TEX, courtTexture, chainLinkTexture, muralTexture, windowsTexture, skyTexture, woodTexture,
  groundTexture, ledTexture, glowTexture, noiseTexture,
} from "./textures.js";

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ sky */
function Sky({ court }) {
  const tex = useMemo(() => skyTexture(court.sky), [court]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-10}>
      <sphereGeometry args={[140, 24, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ court slab */
function CourtFloor({ court, quality }) {
  const size = quality === "high" ? 2048 : quality === "low" ? 1024 : 1536;
  const tex = useMemo(() => courtTexture(court, size), [court, size]);
  const bump = useMemo(() => noiseTexture(256, 9, 90), []);
  useEffect(() => () => { tex.dispose(); bump.dispose(); }, [tex, bump]);
  bump.repeat.set(24, 24);
  const w = COURT_TEX.x1 - COURT_TEX.x0;
  const h = COURT_TEX.z1 - COURT_TEX.z0;
  const groundKind = court.id === "beach" ? "sand" : court.id === "neighborhood" ? "grass" : court.id === "rooftop" ? "roof" : "dark";
  const gtex = useMemo(() => {
    const t = groundTexture(groundKind, 12);
    t.repeat.set(40, 40);
    return t;
  }, [groundKind]);
  useEffect(() => () => gtex.dispose(), [gtex]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(COURT_TEX.x0 + COURT_TEX.x1) / 2, 0, (COURT_TEX.z0 + COURT_TEX.z1) / 2]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} bumpMap={bump} bumpScale={0.6} roughness={0.93} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 5]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial map={gtex} roughness={1} color={court.id === "arena" ? "#15151a" : "#ffffff"} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ fence */
function Fence({ height = 3.2, x = COURT_HALF_W + 1.6, zBack = BASELINE_Z - 2.6, zFront = COURT_FAR_Z + 2.4, gapFront = true, color = "#8a9096" }) {
  const tex = useMemo(() => chainLinkTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const mk = (len) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.55, height / 0.55);
    return t;
  };
  const sideLen = zFront - zBack;
  const backLen = x * 2;
  const texSide = useMemo(() => mk(sideLen), [sideLen]);
  const texBack = useMemo(() => mk(backLen), [backLen]);
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.5 }), [color]);
  const posts = [];
  for (let z = zBack; z <= zFront + 0.01; z += 2.5) {
    posts.push([-x, z], [x, z]);
  }
  for (let xx = -x + 2.5; xx < x; xx += 2.5) posts.push([xx, zBack]);
  const postRef = useRef();
  useEffect(() => {
    const m = new THREE.Matrix4();
    posts.forEach(([px, pz], i) => {
      m.makeTranslation(px, height / 2, pz);
      postRef.current.setMatrixAt(i, m);
    });
    postRef.current.instanceMatrix.needsUpdate = true;
  });
  const meshProps = { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 };
  return (
    <group>
      <instancedMesh ref={postRef} args={[null, null, posts.length]} material={postMat} castShadow>
        <cylinderGeometry args={[0.045, 0.045, height, 8]} />
      </instancedMesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * x, height / 2, (zBack + zFront) / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[sideLen, height]} />
          <meshStandardMaterial map={texSide} {...meshProps} />
        </mesh>
      ))}
      <mesh position={[0, height / 2, zBack]}>
        <planeGeometry args={[backLen, height]} />
        <meshStandardMaterial map={texBack} {...meshProps} />
      </mesh>
      {/* top rails */}
      {[-1, 1].map((s) => (
        <mesh key={`r${s}`} position={[s * x, height, (zBack + zFront) / 2]} rotation={[Math.PI / 2, 0, 0]} material={postMat}>
          <cylinderGeometry args={[0.03, 0.03, sideLen, 6]} />
        </mesh>
      ))}
      <mesh position={[0, height, zBack]} rotation={[0, 0, Math.PI / 2]} material={postMat}>
        <cylinderGeometry args={[0.03, 0.03, backLen, 6]} />
      </mesh>
      {!gapFront && null}
    </group>
  );
}

/* ------------------------------------------------------------------ props */
function Bench({ position = [0, 0, 0], rot = 0 }) {
  const wood = useMemo(() => woodTexture(8, "#7a5a3a"), []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[2.2, 0.06, 0.42]} />
        <meshStandardMaterial map={wood} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.78, -0.2]} rotation={[-0.15, 0, 0]} castShadow>
        <boxGeometry args={[2.2, 0.3, 0.05]} />
        <meshStandardMaterial map={wood} roughness={0.85} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.4]} />
          <meshStandardMaterial color="#2a2d31" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function StreetLamp({ position, on = false, quality }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 5.2, 10]} />
        <meshStandardMaterial color="#2b3035" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.45, 5.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 8]} />
        <meshStandardMaterial color="#2b3035" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.85, 5.05, 0]}>
        <boxGeometry args={[0.42, 0.12, 0.22]} />
        <meshStandardMaterial color="#2b3035" emissive={on ? "#ffd89a" : "#000"} emissiveIntensity={on ? 1.6 : 0} />
      </mesh>
      {on && quality !== "low" && <pointLight position={[0.85, 4.8, 0]} color="#ffcf8a" intensity={18} distance={16} decay={1.6} />}
    </group>
  );
}

/** Instanced low-poly trees (trunk + two foliage lumps). */
function Trees({ spots, tint = "#4f7a35" }) {
  const trunk = useRef();
  const leaf = useRef();
  const leaf2 = useRef();
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    spots.forEach(([x, z, h = 1], i) => {
      m.compose(p.set(x, 1.1 * h, z), q.identity(), s.set(h, h, h));
      trunk.current.setMatrixAt(i, m);
      m.compose(p.set(x, 3.1 * h, z), q.setFromEuler(new THREE.Euler(0, i, 0)), s.set(1.5 * h, 1.3 * h, 1.5 * h));
      leaf.current.setMatrixAt(i, m);
      m.compose(p.set(x + 0.4 * h, 3.9 * h, z - 0.2 * h), q, s.set(1.05 * h, 0.95 * h, 1.05 * h));
      leaf2.current.setMatrixAt(i, m);
    });
    [trunk, leaf, leaf2].forEach((r) => (r.current.instanceMatrix.needsUpdate = true));
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={trunk} args={[null, null, spots.length]}>
        <cylinderGeometry args={[0.12, 0.18, 2.2, 7]} />
        <meshStandardMaterial color="#5a4332" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[null, null, spots.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={tint} roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={leaf2} args={[null, null, spots.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={tint} roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}

function Palms({ spots }) {
  const items = useMemo(() => spots.map(([x, z, h = 1, lean = 0.2], i) => {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(Math.sin(lean) * t * t * 2.2 * h, t * 7 * h, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return { x, z, h, curve, top: pts[8], rot: i * 1.7 };
  }), [spots]);
  const frond = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(1.2, 0.35, 2.6, -0.5);
    s.quadraticCurveTo(1.2, -0.05, 0, 0);
    return new THREE.ShapeGeometry(s, 6);
  }, []);
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0, it.z]} rotation={[0, it.rot, 0]}>
          <mesh>
            <tubeGeometry args={[it.curve, 12, 0.14 * it.h, 7, false]} />
            <meshStandardMaterial color="#7a5c3e" roughness={1} />
          </mesh>
          {Array.from({ length: 9 }, (_, k) => (
            <mesh key={k} position={[it.top.x, it.top.y, it.top.z]} rotation={[-0.3 - (k % 2) * 0.25, (k / 9) * Math.PI * 2, 0]}>
              <primitive object={frond} attach="geometry" />
              <meshStandardMaterial color={k % 2 ? "#2f6b3a" : "#3c8246"} side={THREE.DoubleSide} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** A row of simple buildings with window textures. */
function Buildings({ list, night = false }) {
  const texs = useMemo(() => [0, 1, 2].map((i) => windowsTexture(night, 3 + i, night ? ["#1d2030", "#24202a", "#1a2228"][i] : ["#9c7f6b", "#b59a82", "#8a8f99"][i])), [night]);
  useEffect(() => () => texs.forEach((t) => t.dispose()), [texs]);
  return (
    <group>
      {list.map(([x, z, w, h, d, ti = 0, roof = false], i) => {
        const t = texs[ti % 3].clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, w / 3), Math.max(1, h / 5));
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial map={t} emissiveMap={night ? t : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.55 : 0} roughness={0.9} />
            </mesh>
            {roof && (
              <mesh position={[0, h + 0.9, 0]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[Math.max(w, d) * 0.72, 1.8, 4]} />
                <meshStandardMaterial color="#6b3b30" roughness={0.9} flatShading />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Mural({ position, rotation = [0, 0, 0], size = [9, 3.4], palette, word, seed }) {
  const tex = useMemo(() => muralTexture(palette, word, seed), [palette, word, seed]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, size[1] / 2, -0.12]}>
        <boxGeometry args={[size[0] + 0.3, size[1] + 0.2, 0.2]} />
        <meshStandardMaterial color="#7e6457" roughness={1} />
      </mesh>
      <mesh position={[0, size[1] / 2, 0]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Ocean() {
  const ref = useRef();
  useFrame((st) => {
    if (ref.current) ref.current.material.color.setHSL(0.54, 0.62, 0.42 + Math.sin(st.clock.elapsedTime * 0.6) * 0.015);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -34]}>
      <planeGeometry args={[220, 40]} />
      <meshStandardMaterial color="#2a8fb0" roughness={0.25} metalness={0.2} />
    </mesh>
  );
}

function Boardwalk() {
  const wood = useMemo(() => {
    const t = woodTexture(12, "#9c7650");
    t.repeat.set(12, 1);
    return t;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group position={[-12.6, 0, 5]}>
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.2, 34]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[1.7, 0.75, -16 + i * 3]}>
          <boxGeometry args={[0.1, 1.0, 0.1]} />
          <meshStandardMaterial color="#6f5236" />
        </mesh>
      ))}
      <mesh position={[1.7, 1.25, 0]}>
        <boxGeometry args={[0.08, 0.08, 34]} />
        <meshStandardMaterial color="#6f5236" />
      </mesh>
    </group>
  );
}

function StringLights({ from, to, count = 16, color = "#ffd27a" }) {
  const pts = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      arr.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * 0.6, from[2] + (to[2] - from[2]) * t]);
    }
    return arr;
  }, [from, to, count]);
  return (
    <group>
      {pts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function LedSign({ text, position, rotation = [0, 0, 0], color, size = [7, 1.1] }) {
  const tex = useMemo(() => ledTexture(text, color), [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[size[0] + 0.2, size[1] + 0.2, 0.2]} />
        <meshStandardMaterial color="#0b0b10" />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Spotlights({ quality }) {
  const glow = useMemo(() => glowTexture("#ffffff"), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const rigs = [[-9, 12, 12], [9, 12, 12], [-9, 12, -4], [9, 12, -4]];
  const beams = useMemo(() => rigs.map(([x, y, z]) => {
    const dir = new THREE.Vector3(0 - x, 0 - y, 4 - z);
    const len = dir.length();
    dir.normalize();
    // cone apex (+Y) at the light, base toward the court
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    return { q, len, pos: [dir.x * len * 0.5, dir.y * len * 0.5, dir.z * len * 0.5] };
  }), []);
  return (
    <group>
      {rigs.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh>
            <boxGeometry args={[0.8, 0.5, 0.5]} />
            <meshStandardMaterial color="#15151a" />
          </mesh>
          <sprite scale={[3.2, 3.2, 1]} position={[0, -0.2, 0]}>
            <spriteMaterial map={glow} color="#e8eeff" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
          {/* visible beam, pointing from the rig down at centre court */}
          <mesh position={beams[i].pos} quaternion={beams[i].q}>
            <coneGeometry args={[1.25, beams[i].len, 20, 1, true]} />
            <meshBasicMaterial color="#cfd8ff" transparent opacity={quality === "low" ? 0.014 : 0.024} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bleachers({ z = -6, width = 26, rows = 5, rot = 0, x = 0 }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {Array.from({ length: rows }, (_, i) => (
        <mesh key={i} position={[0, 0.3 + i * 0.45, -i * 0.8]} receiveShadow>
          <boxGeometry args={[width, 0.12, 0.7]} />
          <meshStandardMaterial color={i % 2 ? "#2a2c34" : "#33363f"} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, rows * 0.225, -rows * 0.4 + 0.2]}>
        <boxGeometry args={[width, rows * 0.45, rows * 0.8]} />
        <meshStandardMaterial color="#1c1d22" roughness={1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ crowd */
/**
 * Instanced silhouette spectators (body + head). `seats` = [x,y,z,faceAngle].
 * Excitement (0…1, driven by game events) makes them bounce and raise arms.
 */
function Crowd({ seats, excitement }) {
  const body = useRef();
  const head = useRef();
  const arms = useRef();
  const colors = useMemo(() => {
    const r = seeded(seats.length * 7 + 1);
    const pal = ["#c0392b", "#2d64b0", "#e8a33a", "#1f7a5a", "#8e3bb8", "#ecf0f1", "#2c3e50", "#d35400", "#16a085", "#7f8c8d"];
    const skins = ["#f1c9a5", "#e0ac84", "#c68a62", "#a86b45", "#8a5534", "#6b3f25"];
    return seats.map(() => [pal[Math.floor(r() * pal.length)], skins[Math.floor(r() * skins.length)], r()]);
  }, [seats]);
  useEffect(() => {
    const c = new THREE.Color();
    colors.forEach(([shirt, skin], i) => {
      body.current.setColorAt(i, c.set(shirt));
      head.current.setColorAt(i, c.set(skin));
      arms.current.setColorAt(i, c.set(skin));
    });
    body.current.instanceColor.needsUpdate = true;
    head.current.instanceColor.needsUpdate = true;
    arms.current.instanceColor.needsUpdate = true;
  }, [colors]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const s = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const acc = useRef(0);
  useFrame((st, dt) => {
    acc.current += dt;
    if (acc.current < 1 / 30) return; // 30 Hz is plenty for background people
    acc.current = 0;
    const t = st.clock.elapsedTime;
    const ex = excitement.current;
    seats.forEach(([x, y, z, rot], i) => {
      const ph = colors[i][2] * 10;
      const idle = Math.sin(t * 1.3 + ph) * 0.015;
      const hop = ex > 0.05 ? Math.max(0, Math.sin(t * 9 + ph)) * 0.14 * ex : 0;
      const yy = y + idle + hop;
      e.set(0, rot, Math.sin(t * 0.8 + ph) * 0.03);
      q.setFromEuler(e);
      m.compose(p.set(x, yy + 0.55, z), q, s);
      body.current.setMatrixAt(i, m);
      m.compose(p.set(x, yy + 1.12, z), q, s);
      head.current.setMatrixAt(i, m);
      // arms: down (hidden inside body) or up when cheering
      const up = ex > 0.25 && colors[i][2] < ex ? 1 : 0;
      m.compose(p.set(x, yy + (up ? 1.25 : 0.5), z), q, s.set(1, up ? 1 : 0.6, 1));
      arms.current.setMatrixAt(i, m);
      s.set(1, 1, 1);
    });
    body.current.instanceMatrix.needsUpdate = true;
    head.current.instanceMatrix.needsUpdate = true;
    arms.current.instanceMatrix.needsUpdate = true;
  });
  const n = seats.length;
  return (
    <group>
      <instancedMesh ref={body} args={[null, null, n]}>
        <cylinderGeometry args={[0.17, 0.21, 0.78, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={head} args={[null, null, n]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[null, null, n]}>
        <boxGeometry args={[0.52, 0.42, 0.08]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

function crowdSeats(court, count) {
  const r = seeded(court.id.length * 101 + count);
  const seats = [];
  const face = (x, z) => Math.atan2(0 - x, 4 - z);
  if (court.id === "arena") {
    // bleachers behind the baseline and along both sides
    for (let i = 0; i < count; i++) {
      const band = i % 3;
      const row = Math.floor(r() * 4);
      if (band === 0) {
        const x = -12 + r() * 24;
        const z = -7.2 - row * 0.8;
        seats.push([x, 0.36 + row * 0.45, z, face(x, z)]);
      } else {
        const s = band === 1 ? -1 : 1;
        const x = s * (11.2 + row * 0.8);
        const z = -3 + r() * 16;
        seats.push([x, 0.36 + row * 0.45, z, face(x, z)]);
      }
    }
    return seats;
  }
  for (let i = 0; i < count; i++) {
    const side = r();
    let x;
    let z;
    if (side < 0.45) {
      x = (r() < 0.5 ? -1 : 1) * (COURT_HALF_W + 2.3 + r() * 1.6);
      z = -1 + r() * 11;
    } else if (side < 0.75) {
      x = -8 + r() * 16;
      z = COURT_FAR_Z + 3.2 + r() * 2;
    } else {
      x = -6 + r() * 12;
      z = BASELINE_Z - 3.4 - r() * 1.5;
    }
    if (court.id === "neighborhood" && Math.abs(x) < 3 && z < -3) x += 5;
    seats.push([x, 0, z, face(x, z)]);
  }
  return seats;
}

/* ------------------------------------------------------------------ lights */
function Lights({ court, shadows, quality }) {
  const dir = useRef();
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog(court.fog, 34, 120);
    return () => {
      scene.fog = null;
    };
  }, [court, scene]);
  useEffect(() => {
    const l = dir.current;
    if (!l) return;
    l.target.position.set(0, 0, 4);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -10;
    cam.right = 10;
    cam.top = 10;
    cam.bottom = -10;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
  }, [shadows]);
  const sz = quality === "high" ? 2048 : 1024;
  return (
    <group>
      <hemisphereLight args={[court.hemi.sky, court.hemi.ground, court.hemi.intensity]} />
      <ambientLight intensity={court.ambient} />
      <directionalLight
        ref={dir}
        position={court.sun.pos}
        color={court.sun.color}
        intensity={court.sun.intensity}
        castShadow={shadows}
        shadow-mapSize-width={sz}
        shadow-mapSize-height={sz}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {court.id === "arena" && <spotLight position={[0, 14, 5]} angle={0.75} penumbra={0.6} intensity={180} distance={40} decay={1.5} color="#f2f4ff" />}
      {(court.id === "downtown" || court.id === "rooftop") && <pointLight position={[0, 7, 4]} intensity={40} distance={30} decay={1.5} color="#ffe2b8" />}
    </group>
  );
}

/* ------------------------------------------------------------------ world */
export default function World({ court, quality = "medium", shadows = false, excitement }) {
  const low = quality === "low";
  const high = quality === "high";
  const crowdCount = Math.round(court.crowd * (low ? 0.5 : high ? 1.3 : 1));
  const seats = useMemo(() => crowdSeats(court, crowdCount), [court, crowdCount]);
  const night = court.id === "downtown" || court.id === "rooftop" || court.id === "arena";

  return (
    <group>
      <Sky court={court} />
      <Lights court={court} shadows={shadows} quality={quality} />
      <CourtFloor court={court} quality={quality} />
      <Crowd seats={seats} excitement={excitement} />

      {court.id === "neighborhood" && (
        <group>
          <Fence />
          <Bench position={[-COURT_HALF_W - 0.8, 0, 3]} rot={Math.PI / 2} />
          <Bench position={[COURT_HALF_W + 0.8, 0, 6]} rot={-Math.PI / 2} />
          <StreetLamp position={[-COURT_HALF_W - 1.2, 0, 10]} />
          <StreetLamp position={[COURT_HALF_W + 1.2, 0, -1]} />
          <Mural position={[0, 0, BASELINE_Z - 3.2]} palette={["#b4876d", "#f2a541", "#4fb3bf", "#ffd166", "#ef476f"]} word="OUR COURT" seed={21} size={[11, 3.2]} />
          {!low && <Trees spots={[[-11, -4, 1.1], [-13, 3, 0.9], [-12, 10, 1.2], [12, -3, 1], [13, 5, 1.15], [11.5, 13, 0.95], [-6, 17, 1.1], [6, 18, 1.2], [0, 20, 1]]} />}
          <Buildings list={[[-18, -10, 7, 5, 6, 0, true], [-9, -14, 8, 6, 6, 1, true], [2, -15, 9, 7, 6, 2, true], [13, -13, 7, 5.5, 6, 0, true], [22, -6, 7, 6, 6, 1, true], [-22, 4, 6, 5, 7, 2, true], [22, 8, 7, 5, 7, 0, true], [-16, 24, 8, 6, 6, 1, true], [16, 25, 8, 7, 6, 2, true]]} />
        </group>
      )}

      {court.id === "downtown" && (
        <group>
          <Fence height={3.6} color="#5d646b" />
          <StreetLamp position={[-COURT_HALF_W - 1.2, 0, 8]} on quality={quality} />
          <StreetLamp position={[COURT_HALF_W + 1.2, 0, 1]} on quality={quality} />
          <StreetLamp position={[-COURT_HALF_W - 1.2, 0, -1]} on quality="low" />
          <Mural position={[0, 0, BASELINE_Z - 3.3]} palette={["#3a3346", "#ff3864", "#2de2e6", "#f9c80e", "#ff6c11"]} word="CITY GAME" seed={42} size={[12, 3.8]} />
          <Mural position={[-COURT_HALF_W - 3.4, 0, 5]} rotation={[0, Math.PI / 2, 0]} palette={["#2c2a3a", "#7b2cbf", "#f72585", "#4cc9f0", "#ffd60a"]} word="NO FOULS" seed={77} size={[10, 3.4]} />
          <Buildings night list={[[-20, -14, 9, 26, 9, 0], [-8, -18, 10, 34, 9, 1], [5, -17, 9, 22, 9, 2], [17, -15, 10, 30, 9, 0], [-24, 6, 9, 20, 10, 1], [24, 4, 10, 28, 10, 2], [-20, 24, 10, 18, 9, 0], [20, 26, 10, 24, 9, 1], [0, 30, 12, 30, 9, 2]]} />
        </group>
      )}

      {court.id === "beach" && (
        <group>
          <Ocean />
          <Boardwalk />
          <Palms spots={[[-10.5, -6, 1, 0.25], [10.8, -5, 1.1, -0.3], [11.5, 7, 0.95, -0.2], [-15, 12, 1.05, 0.3], [15, 16, 1, -0.15], [-7, 18, 1.15, 0.1], [4, 21, 1, -0.2]]} />
          <Bench position={[COURT_HALF_W + 1.2, 0, 4]} rot={-Math.PI / 2} />
          {!low && <Mural position={[COURT_HALF_W + 3.5, 0, 6]} rotation={[0, -Math.PI / 2, 0]} palette={["#e9d8b8", "#ff7b42", "#26b3c9", "#ffd24a", "#ff4d6d"]} word="SALT & SWISH" seed={9} size={[9, 3]} />}
          {/* lifeguard tower */}
          <group position={[-3, 0, -11]}>
            {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z], i) => (
              <mesh key={i} position={[x, 1.2, z]}>
                <boxGeometry args={[0.12, 2.4, 0.12]} />
                <meshStandardMaterial color="#e8e1d2" />
              </mesh>
            ))}
            <mesh position={[0, 2.9, 0]}>
              <boxGeometry args={[2, 1.2, 2]} />
              <meshStandardMaterial color="#e24b3b" />
            </mesh>
            <mesh position={[0, 3.7, 0]}>
              <coneGeometry args={[1.6, 0.6, 4]} />
              <meshStandardMaterial color="#f4ecd8" flatShading />
            </mesh>
          </group>
        </group>
      )}

      {court.id === "rooftop" && (
        <group>
          {/* parapet walls */}
          {[[-(COURT_HALF_W + 2.6), 5, 0.4, 24], [COURT_HALF_W + 2.6, 5, 0.4, 24]].map(([x, z, w, d], i) => (
            <mesh key={i} position={[x, 0.55, z]}>
              <boxGeometry args={[w, 1.1, d]} />
              <meshStandardMaterial color="#56525c" roughness={0.95} />
            </mesh>
          ))}
          <Fence height={3.4} color="#4b4f57" x={COURT_HALF_W + 2.2} />
          <StringLights from={[-COURT_HALF_W - 2, 3.4, -3]} to={[COURT_HALF_W + 2, 3.4, -3]} />
          <StringLights from={[-COURT_HALF_W - 2, 3.4, 13]} to={[COURT_HALF_W + 2, 3.4, 13]} color="#ffb3d9" />
          {/* water tower */}
          <group position={[-12, 0, -8]}>
            <mesh position={[0, 6, 0]}>
              <cylinderGeometry args={[1.6, 1.6, 3.2, 16]} />
              <meshStandardMaterial color="#6a4a36" roughness={1} />
            </mesh>
            <mesh position={[0, 8.2, 0]}>
              <coneGeometry args={[1.8, 1.2, 16]} />
              <meshStandardMaterial color="#3a2b22" />
            </mesh>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
              <mesh key={i} position={[x, 2.2, z]}>
                <cylinderGeometry args={[0.07, 0.07, 4.4, 6]} />
                <meshStandardMaterial color="#2d2d33" />
              </mesh>
            ))}
          </group>
          <Buildings night list={[[-40, -40, 12, 60, 12, 0], [-22, -48, 10, 80, 10, 1], [-5, -52, 14, 70, 12, 2], [14, -46, 10, 90, 10, 0], [32, -42, 12, 55, 12, 1], [-48, -10, 12, 50, 12, 2], [48, -8, 12, 65, 12, 0], [-44, 30, 12, 45, 12, 1], [44, 34, 14, 58, 12, 2]].map(([x, z, w, h, d, t]) => [x, z, w, h, d, t])} />
          {/* the building we stand on drops away beyond the parapet */}
          <mesh position={[0, -0.05, 5]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[COURT_HALF_W * 2 + 5.6, 26]} />
            <meshStandardMaterial color="#5f5b64" roughness={1} />
          </mesh>
        </group>
      )}

      {court.id === "arena" && (
        <group>
          <Bleachers z={-6.8} width={28} />
          <Bleachers z={4.5} width={20} rot={Math.PI / 2} x={-10.8} />
          <Bleachers z={4.5} width={20} rot={-Math.PI / 2} x={10.8} />
          <Spotlights quality={quality} />
          <LedSign text="STREET LEGENDS" position={[0, 6.2, -10.5]} color="#ffd23f" size={[10, 1.4]} />
          <LedSign text="KING OF THE COURT" position={[-14, 5, 5]} rotation={[0, Math.PI / 2, 0]} color="#ff3864" size={[9, 1.2]} />
          <LedSign text="RULE THE COURT" position={[14, 5, 5]} rotation={[0, -Math.PI / 2, 0]} color="#2de2e6" size={[9, 1.2]} />
          {/* court edge glow strip */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (COURT_HALF_W + 0.95), 0.01, 5]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.12, 17]} />
              <meshBasicMaterial color="#f5c542" toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
