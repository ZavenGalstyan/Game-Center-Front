/**
 * Rooftop Sniper — the background city for any location. Procedurally laid
 * out but seeded per location (same skyline every attempt at that
 * location). Buildings, windows and cars are each a single InstancedMesh —
 * 3 draw calls for the whole skyline, matching the project's performance
 * conventions (Ball Adventure 3D / Supermarket Rush both lean on instancing
 * for anything repeated). A small per-location THEME table drives palette
 * and one signature prop (antenna / crane / dunes / snow caps / neon signs
 * / floodlights); weather particles (rain/snow) come from `location.weather`.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function mulberry32(seed) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREET_Y = -40;
const BUILDING_COUNT = 70;
const WINDOW_COUNT = 500;
const CAR_COUNT = 14;

const THEMES = {
  downtown: {
    seed: 20260101,
    hue: [0.58, 0.66],
    sat: 0.14,
    light: [0.22, 0.4],
    window: "#ffdfa0",
    road: "#3a3d42",
    car: ["#e9e9e9", "#c94b3f"],
    prop: "antenna",
  },
  industrial: {
    seed: 20260111,
    hue: [0.07, 0.1],
    sat: 0.1,
    light: [0.16, 0.3],
    window: "#ffcf7a",
    road: "#302d28",
    car: ["#b8752e", "#6d7278"],
    prop: "crane",
  },
  desert: {
    seed: 20260121,
    hue: [0.08, 0.11],
    sat: 0.35,
    light: [0.45, 0.62],
    window: "#ffe9c2",
    road: "#8a6a45",
    car: ["#d8c8a0", "#b04a2e"],
    prop: "dunes",
  },
  snow: {
    seed: 20260131,
    hue: [0.58, 0.62],
    sat: 0.08,
    light: [0.55, 0.72],
    window: "#fff6d8",
    road: "#7d8894",
    car: ["#c94b3f", "#38506b"],
    prop: "snowcap",
  },
  neon: {
    seed: 20260141,
    hue: [0.72, 0.86],
    sat: 0.3,
    light: [0.08, 0.16],
    window: "#39e6ff",
    road: "#0c0f16",
    car: ["#ff3df0", "#39e6ff"],
    prop: "neon",
    emissiveWindows: true,
  },
  "security-zone": {
    seed: 20260151,
    hue: [0.55, 0.6],
    sat: 0.1,
    light: [0.12, 0.2],
    window: "#8fd7ff",
    road: "#14171c",
    car: ["#2a3138", "#3d4650"],
    prop: "floodlight",
  },
};

function buildLayout(theme) {
  const rand = mulberry32(theme.seed);
  const buildings = [];
  for (let i = 0; i < BUILDING_COUNT; i++) {
    const angle = rand() * Math.PI - Math.PI;
    const dist = 90 + rand() * 220;
    const x = Math.sin(angle) * dist * 0.9 + (rand() - 0.5) * 20;
    const z = -Math.abs(Math.cos(angle)) * dist - 60;
    if (Math.abs(x) < 9 && z > -170) continue;
    const height = 10 + rand() * 46;
    const width = 8 + rand() * 14;
    const depth = 8 + rand() * 14;
    const hue = theme.hue[0] + rand() * (theme.hue[1] - theme.hue[0]);
    const light = theme.light[0] + rand() * (theme.light[1] - theme.light[0]);
    buildings.push({
      position: [x, STREET_Y + height / 2, z],
      scale: [width, height, depth],
      color: new THREE.Color().setHSL(hue, theme.sat, light),
      top: STREET_Y + height,
      width,
      depth,
      x,
      z,
    });
  }
  return buildings;
}

export default function CityEnvironment({ location }) {
  const theme = THEMES[location.id] || THEMES.downtown;
  const buildings = useMemo(() => buildLayout(theme), [theme]);

  const windows = useMemo(() => {
    const rand = mulberry32(theme.seed + 777);
    const out = [];
    for (let i = 0; i < WINDOW_COUNT; i++) {
      const b = buildings[Math.floor(rand() * buildings.length)];
      if (!b) continue;
      const face = rand() < 0.5 ? "x" : "z";
      const [, height] = b.scale;
      const y = b.position[1] - height / 2 + rand() * height * 0.92 + height * 0.04;
      let x, z, rotY;
      if (face === "x") {
        x = b.position[0] + (rand() < 0.5 ? 1 : -1) * (b.width / 2 + 0.03);
        z = b.position[2] + (rand() - 0.5) * b.depth * 0.85;
        rotY = 0;
      } else {
        x = b.position[0] + (rand() - 0.5) * b.width * 0.85;
        z = b.position[2] + (rand() < 0.5 ? 1 : -1) * (b.depth / 2 + 0.03);
        rotY = Math.PI / 2;
      }
      const litChance = theme.emissiveWindows ? 0.6 : 0.35;
      out.push({ position: [x, y, z], rotY, lit: rand() < litChance });
    }
    return out;
  }, [buildings, theme]);

  const buildingRef = useRef();
  const windowRef = useRef();
  const carRef = useRef();

  const carState = useMemo(() => {
    const rand = mulberry32(theme.seed + 555);
    return new Array(CAR_COUNT).fill(0).map(() => ({
      z: -70 - rand() * 130,
      x: (rand() < 0.5 ? -1 : 1) * (14 + rand() * 4),
      speed: 6 + rand() * 6,
      dir: rand() < 0.5 ? 1 : -1,
      color: rand() < 0.5 ? theme.car[0] : theme.car[1],
    }));
  }, [theme]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const bMesh = buildingRef.current;
    if (bMesh) {
      buildings.forEach((b, i) => {
        dummy.position.set(...b.position);
        dummy.scale.set(...b.scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bMesh.setMatrixAt(i, dummy.matrix);
        bMesh.setColorAt(i, b.color);
      });
      bMesh.instanceMatrix.needsUpdate = true;
      if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    }

    const wMesh = windowRef.current;
    if (wMesh) {
      windows.forEach((w, i) => {
        dummy.position.set(...w.position);
        dummy.rotation.set(0, w.rotY, 0);
        dummy.scale.setScalar(w.lit ? 1 : 0.001);
        dummy.updateMatrix();
        wMesh.setMatrixAt(i, dummy.matrix);
      });
      wMesh.instanceMatrix.needsUpdate = true;
    }

    const cMesh = carRef.current;
    if (cMesh) {
      carState.forEach((c, i) => cMesh.setColorAt(i, new THREE.Color(c.color)));
      if (cMesh.instanceColor) cMesh.instanceColor.needsUpdate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, windows, carState]);

  useFrame((_, dt) => {
    if (carRef.current) {
      for (let i = 0; i < carState.length; i++) {
        const c = carState[i];
        c.z += c.speed * dt * c.dir;
        if (c.z > -60) c.z = -195;
        if (c.z < -200) c.z = -65;
        dummy.position.set(c.x, STREET_Y + 0.6, c.z);
        dummy.rotation.set(0, c.dir > 0 ? 0 : Math.PI, 0);
        dummy.scale.set(1.8, 1, 3.2);
        dummy.updateMatrix();
        carRef.current.setMatrixAt(i, dummy.matrix);
      }
      carRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group key={location.id}>
      <instancedMesh ref={buildingRef} args={[null, null, buildings.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} metalness={0.05} />
      </instancedMesh>

      <instancedMesh ref={windowRef} args={[null, null, windows.length]}>
        <planeGeometry args={[0.9, 1.3]} />
        <meshBasicMaterial color={theme.window} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>

      <instancedMesh ref={carRef} args={[null, null, CAR_COUNT]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.3} />
      </instancedMesh>

      <mesh position={[0, STREET_Y - 0.05, -140]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 320]} />
        <meshStandardMaterial color={theme.road} roughness={location.id === "neon" ? 0.25 : 1} metalness={location.id === "neon" ? 0.4 : 0} />
      </mesh>

      <ThemeProp prop={theme.prop} />
      <Clouds visible={location.weather === "clear" || location.weather === "cloudy"} />
      <Birds visible={location.id !== "neon"} />
      <Weather kind={location.weather} />
    </group>
  );
}

/** One signature prop per location — kept lightweight (a handful of meshes). */
function ThemeProp({ prop }) {
  if (prop === "crane") {
    return (
      <group position={[-30, -14, -95]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1, 40, 1]} />
          <meshStandardMaterial color="#c98a1f" roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[8, 20, 0]}>
          <boxGeometry args={[18, 0.8, 0.8]} />
          <meshStandardMaterial color="#c98a1f" roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[-3, 20, 0]}>
          <boxGeometry args={[6, 0.8, 0.8]} />
          <meshStandardMaterial color="#c98a1f" roughness={0.7} metalness={0.3} />
        </mesh>
      </group>
    );
  }
  if (prop === "dunes") {
    return (
      <group>
        {[[-140, -34, -260, 90], [120, -30, -280, 70], [0, -36, -300, 110]].map((d, i) => (
          <mesh key={i} position={[d[0], d[1], d[2]]}>
            <sphereGeometry args={[d[3], 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c9a066" roughness={1} />
          </mesh>
        ))}
      </group>
    );
  }
  if (prop === "floodlight") {
    return (
      <group position={[6, -6.5, -8]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 3.6, 6]} />
          <meshStandardMaterial color="#20242a" roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 1.9, 0.25]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.5, 0.3, 0.3]} />
          <meshStandardMaterial color="#dceeff" emissive="#8fd7ff" emissiveIntensity={1.4} />
        </mesh>
      </group>
    );
  }
  if (prop === "neon") {
    return (
      <group position={[-3.5, -0.3, -9.5]}>
        <mesh>
          <planeGeometry args={[2.2, 0.7]} />
          <meshBasicMaterial color="#ff3df0" toneMapped={false} />
        </mesh>
      </group>
    );
  }
  if (prop === "snowcap") {
    return (
      <group>
        {[[-24, -5.2, -18], [26, -3.4, -22]].map((d, i) => (
          <mesh key={i} position={d} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[3.2, 10]} />
            <meshStandardMaterial color="#eef4fa" roughness={0.9} />
          </mesh>
        ))}
      </group>
    );
  }
  // antenna (downtown default)
  return (
    <mesh position={[5.6, 1.4, -6]} castShadow>
      <cylinderGeometry args={[0.03, 0.05, 4, 6]} />
      <meshStandardMaterial color="#2b2b2b" roughness={0.6} metalness={0.5} />
    </mesh>
  );
}

function Clouds({ visible }) {
  const ref = useRef();
  const items = useMemo(() => {
    const rand = mulberry32(9001);
    return new Array(9).fill(0).map(() => ({
      x: (rand() - 0.5) * 260,
      y: 40 + rand() * 40,
      z: -120 - rand() * 140,
      s: 18 + rand() * 22,
      speed: 0.4 + rand() * 0.4,
    }));
  }, []);
  useFrame((state, dt) => {
    if (!ref.current) return;
    ref.current.children.forEach((mesh, i) => {
      mesh.position.x += items[i].speed * dt;
      if (mesh.position.x > 140) mesh.position.x = -140;
    });
  });
  if (!visible) return null;
  return (
    <group ref={ref}>
      {items.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]}>
          <sphereGeometry args={[c.s, 8, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Birds({ visible }) {
  const ref = useRef();
  const items = useMemo(() => {
    const rand = mulberry32(4242);
    return new Array(6).fill(0).map(() => ({
      x: (rand() - 0.5) * 80,
      y: 14 + rand() * 18,
      z: -50 - rand() * 60,
      speed: 3 + rand() * 3,
      phase: rand() * Math.PI * 2,
    }));
  }, []);
  useFrame((state, dt) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.children.forEach((mesh, i) => {
      const b = items[i];
      mesh.position.x += b.speed * dt;
      if (mesh.position.x > 60) mesh.position.x = -60;
      mesh.position.y = b.y + Math.sin(t * 3 + b.phase) * 0.6;
      mesh.rotation.z = Math.sin(t * 10 + b.phase) * 0.4;
    });
  });
  if (!visible) return null;
  return (
    <group ref={ref}>
      {items.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]}>
          <coneGeometry args={[0.25, 0.9, 3]} />
          <meshBasicMaterial color="#2a2a2a" />
        </mesh>
      ))}
    </group>
  );
}

const WEATHER_COUNT = 260;

/** Rain or snow — one InstancedMesh of falling particles, looped in a box above the rooftop. */
function Weather({ kind }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const isRain = kind === "rain";
  const isSnow = kind === "snow";
  const particles = useMemo(() => {
    if (!isRain && !isSnow) return [];
    const rand = mulberry32(31415);
    return new Array(WEATHER_COUNT).fill(0).map(() => ({
      x: (rand() - 0.5) * 60,
      y: rand() * 30,
      z: -10 - rand() * 60,
      speed: isRain ? 22 + rand() * 8 : 1.2 + rand() * 0.8,
      drift: isSnow ? (rand() - 0.5) * 0.6 : 0,
      phase: rand() * Math.PI * 2,
    }));
  }, [isRain, isSnow]);

  useFrame((state, dt) => {
    if (!ref.current || particles.length === 0) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speed * dt;
      if (p.y < -2) p.y = 30;
      const x = p.x + (isSnow ? Math.sin(t + p.phase) * 0.8 : 0);
      dummy.position.set(x, p.y, p.z);
      if (isRain) {
        dummy.rotation.set(0, 0, 0.06);
        dummy.scale.set(0.015, 0.5, 0.015);
      } else {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.05);
      }
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  if (!isRain && !isSnow) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, WEATHER_COUNT]}>
      {isRain ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[1, 5, 4]} />}
      <meshBasicMaterial
        color={isRain ? "#9fd0ff" : "#ffffff"}
        transparent
        opacity={isRain ? 0.4 : 0.85}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
