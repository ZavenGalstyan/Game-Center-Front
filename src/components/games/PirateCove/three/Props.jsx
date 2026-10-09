/**
 * Pirate Cove — island and cave props, built from primitives with real
 * materials (planks, thatch, striped cloth, stone blocks, rock). Footprints
 * match engine/props.js. Flames are cheap additive meshes; actual light comes
 * from <LightPool>, which moves a handful of point lights to the emitters
 * nearest the camera focus.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M } from "./materials.js";
import { buildRockGeometry } from "./islandGeo.js";
import ShipModel from "./ShipModel.jsx";

const DEG = Math.PI / 180;

function Flame({ position, scale = 1 }) {
  const ref = useRef();
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + seed;
    const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    ref.current.scale.set(scale * (0.9 + Math.sin(t * 9) * 0.06), scale * f * 1.2, scale * (0.9 + Math.cos(t * 8) * 0.06));
  });
  return (
    <group ref={ref} position={position}>
      <mesh material={M.flame()} position={[0, 0.22, 0]}>
        <coneGeometry args={[0.2, 0.62, 8]} />
      </mesh>
      <mesh material={M.emissive("#ffe08a", 2.5)} position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.12, 8, 6]} />
      </mesh>
    </group>
  );
}

function Rock({ r = 1.6, h = 1.6, seed = 1, color }) {
  const g = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 - seed) * 0.18 + Math.sin(y * 4 + seed * 2) * 0.1;
      const k = 1 + n;
      p.setXYZ(i, x * r * k, (y * 0.5 + 0.38) * h * 2 * k, z * r * k);
    }
    geo.computeVertexNormals();
    return geo;
  }, [r, h, seed]);
  return <mesh geometry={g} material={M.rock(color || "#8d877c")} castShadow receiveShadow />;
}

function Hut() {
  return (
    <group>
      {[
        [-1.9, -1.7],
        [1.9, -1.7],
        [-1.9, 1.7],
        [1.9, 1.7],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.6, z]} material={M.darkWood()} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 1.4, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0]} material={M.wood()} castShadow receiveShadow>
        <boxGeometry args={[4.2, 0.18, 3.8]} />
      </mesh>
      <mesh position={[0, 2.35, 0]} material={M.wood()} castShadow receiveShadow>
        <boxGeometry args={[3.8, 1.9, 3.4]} />
      </mesh>
      <mesh position={[0, 2.1, 1.72]} material={M.iron()}>
        <boxGeometry args={[1, 1.5, 0.05]} />
      </mesh>
      <mesh position={[1.3, 2.5, 1.72]} material={M.glass()}>
        <boxGeometry args={[0.6, 0.5, 0.05]} />
      </mesh>
      <mesh position={[0, 4.15, 0]} rotation={[0, Math.PI / 4, 0]} material={M.thatch()} castShadow>
        <coneGeometry args={[3.6, 2.2, 4, 1]} />
      </mesh>
      <mesh position={[0, 0.9, 2.6]} rotation={[-0.45, 0, 0]} material={M.wood()}>
        <boxGeometry args={[1, 0.08, 1.8]} />
      </mesh>
    </group>
  );
}

function Tent() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.6, 0);
    s.lineTo(0, 2.4);
    s.lineTo(1.6, 0);
    s.lineTo(-1.6, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.8, bevelEnabled: false });
    g.translate(0, 0, -1.4);
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={M.tent("#e2d4b4", "#a8463a")} castShadow receiveShadow />
      <mesh position={[0, 1.2, 1.42]} material={M.cloth("#2a1e14")}>
        <planeGeometry args={[0.9, 1.6]} />
      </mesh>
      {[1.5, -1.5].map((z) => (
        <mesh key={z} position={[0, 1.25, z]} material={M.darkWood()}>
          <cylinderGeometry args={[0.05, 0.05, 2.6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function Campfire({ scale = 1 }) {
  return (
    <group scale={scale}>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62]} material={M.rock("#77736b")} castShadow>
            <dodecahedronGeometry args={[0.18, 0]} />
          </mesh>
        );
      })}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.14, 0]} rotation={[0, (i * Math.PI) / 3, Math.PI / 2.4]} material={M.darkWood()}>
          <cylinderGeometry args={[0.07, 0.08, 1, 6]} />
        </mesh>
      ))}
      <Flame position={[0, 0.15, 0]} scale={1.5} />
      <mesh position={[1.2, 0.22, 0.3]} rotation={[0, 0.4, Math.PI / 2]} material={M.wood()} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 1.4, 8]} />
      </mesh>
    </group>
  );
}

function Crates() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} material={M.wood()} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
      </mesh>
      <mesh position={[0.2, 1.2, 0.1]} rotation={[0, 0.5, 0]} material={M.wood()} castShadow>
        <boxGeometry args={[0.65, 0.6, 0.65]} />
      </mesh>
      <mesh position={[0.95, 0.35, -0.2]} rotation={[0, 0.3, 0]} material={M.darkWood()} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
      </mesh>
    </group>
  );
}

function Barrel({ position = [0, 0, 0], tilt = 0 }) {
  return (
    <group position={position} rotation={[tilt, 0, 0]}>
      <mesh position={[0, 0.5, 0]} material={M.wood()} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.36, 1, 12]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={M.iron()}>
        <cylinderGeometry args={[0.42, 0.42, 0.62, 12, 1, true]} />
      </mesh>
      {[0.12, 0.88].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron()}>
          <torusGeometry args={[0.37, 0.03, 4, 14]} />
        </mesh>
      ))}
    </group>
  );
}

function Barrels() {
  return (
    <group>
      <Barrel position={[0, 0, 0]} />
      <Barrel position={[0.75, 0, 0.2]} />
      <Barrel position={[0.35, 0, -0.6]} />
    </group>
  );
}

function Table() {
  return (
    <group>
      <mesh position={[0, 0.88, 0]} material={M.wood()} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.1, 1.2]} />
      </mesh>
      {[
        [-0.8, -0.5],
        [0.8, -0.5],
        [-0.8, 0.5],
        [0.8, 0.5],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.42, z]} material={M.darkWood()}>
          <boxGeometry args={[0.1, 0.85, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0.55, 1.03, -0.25]} material={M.cloth("#3a2a1a")}>
        <cylinderGeometry args={[0.08, 0.1, 0.22, 8]} />
      </mesh>
    </group>
  );
}

function Signpost() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]} material={M.darkWood()} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
      </mesh>
      <mesh position={[0.35, 1.8, 0]} rotation={[0, 0, 0.05]} material={M.wood()} castShadow>
        <boxGeometry args={[1.1, 0.32, 0.06]} />
      </mesh>
      <mesh position={[-0.3, 1.4, 0]} rotation={[0, 0, -0.08]} material={M.wood()} castShadow>
        <boxGeometry args={[0.9, 0.28, 0.06]} />
      </mesh>
    </group>
  );
}

function FlagPole({ color = "#111" }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group>
      <mesh position={[0, 2.6, 0]} material={M.darkWood()} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 5.2, 6]} />
      </mesh>
      <group ref={ref} position={[0, 4.6, 0]}>
        <mesh position={[0.6, 0, 0]} material={M.cloth(color)} castShadow>
          <boxGeometry args={[1.2, 0.8, 0.02]} />
        </mesh>
      </group>
    </group>
  );
}

function Torch() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} material={M.darkWood()}>
        <cylinderGeometry args={[0.04, 0.06, 1.6, 5]} />
      </mesh>
      <mesh position={[0, 1.62, 0]} material={M.iron()}>
        <cylinderGeometry args={[0.1, 0.06, 0.18, 6]} />
      </mesh>
      <Flame position={[0, 1.7, 0]} scale={0.6} />
    </group>
  );
}

function Lantern() {
  return (
    <group>
      <mesh position={[0, 1.2, 0]} material={M.darkWood()}>
        <cylinderGeometry args={[0.05, 0.07, 2.4, 6]} />
      </mesh>
      <mesh position={[0.3, 2.3, 0]} material={M.darkWood()}>
        <boxGeometry args={[0.6, 0.06, 0.06]} />
      </mesh>
      <mesh position={[0.55, 2.05, 0]} material={M.glass()}>
        <boxGeometry args={[0.22, 0.32, 0.22]} />
      </mesh>
    </group>
  );
}

function Bones() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} material={M.bone()} castShadow>
        <sphereGeometry args={[0.18, 8, 6]} />
      </mesh>
      {[0.4, -0.6, 1.1].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5]} rotation={[Math.PI / 2, 0, a]} material={M.bone()}>
          <cylinderGeometry args={[0.035, 0.035, 0.7, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function SkullRock({ scale = 1 }) {
  return (
    <group scale={scale}>
      <Rock r={2.2} h={2.1} seed={4} color="#b8b2a4" />
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 2.4, 1.85]} material={M.cloth("#1a1614")}>
          <sphereGeometry args={[0.5, 10, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, 2.05]} rotation={[0.2, 0, Math.PI / 4]} material={M.cloth("#1a1614")}>
        <boxGeometry args={[0.32, 0.32, 0.3]} />
      </mesh>
      <mesh position={[0, 0.9, 1.95]} material={M.cloth("#1a1614")}>
        <boxGeometry args={[1.5, 0.2, 0.3]} />
      </mesh>
    </group>
  );
}

function Lighthouse() {
  const beam = useRef();
  useFrame(({ clock }) => {
    if (beam.current) beam.current.rotation.y = clock.elapsedTime * 0.6;
  });
  return (
    <group>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, 1.4 + i * 2.6, 0]} material={M.accent(i % 2 ? "#b8382e" : "#f2ede2")} castShadow receiveShadow>
          <cylinderGeometry args={[2.6 - (i + 1) * 0.22, 2.6 - i * 0.22, 2.6, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 13.8, 0]} material={M.iron()}>
        <cylinderGeometry args={[1.7, 1.7, 0.3, 16]} />
      </mesh>
      <mesh position={[0, 14.8, 0]} material={M.glass()}>
        <cylinderGeometry args={[1.05, 1.05, 1.8, 12]} />
      </mesh>
      <mesh position={[0, 16.1, 0]} material={M.accent("#2a2a2e")} castShadow>
        <coneGeometry args={[1.4, 1.2, 12]} />
      </mesh>
      <group ref={beam} position={[0, 14.8, 0]}>
        <mesh position={[9, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[1.6, 18, 12, 1, true]} />
          <meshBasicMaterial color="#ffe9b0" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function CaveMouth({ scale = 1 }) {
  return (
    <group scale={scale}>
      <group position={[-3.6, 0, -0.6]}>
        <Rock r={2.4} h={3.6} seed={1} color="#7d776c" />
      </group>
      <group position={[3.6, 0, -0.6]}>
        <Rock r={2.4} h={3.4} seed={2} color="#7d776c" />
      </group>
      <group position={[0, 2.6, -1.2]}>
        <Rock r={3.4} h={1.8} seed={3} color="#7d776c" />
      </group>
      <group position={[0, 0, -3.8]}>
        <Rock r={3.6} h={3.6} seed={5} color="#736d63" />
      </group>
      <mesh position={[0, 1.6, -1.1]} material={M.cloth("#050505")}>
        <planeGeometry args={[4.2, 3.4]} />
      </mesh>
    </group>
  );
}

function Column({ broken }) {
  const h = broken ? 2.2 : 5;
  return (
    <group>
      <mesh position={[0, 0.2, 0]} material={M.stone()} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.4, 1.3]} />
      </mesh>
      <mesh position={[0, 0.4 + h / 2, 0]} rotation={[0, 0, broken ? 0.06 : 0]} material={M.stone()} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 0.55, h, 12]} />
      </mesh>
      {!broken && (
        <mesh position={[0, 0.4 + h + 0.2, 0]} material={M.stone()} castShadow>
          <boxGeometry args={[1.3, 0.4, 1.3]} />
        </mesh>
      )}
      {broken && (
        <mesh position={[1.2, 0.3, 0.4]} rotation={[0, 0.6, Math.PI / 2]} material={M.stone()} castShadow>
          <cylinderGeometry args={[0.45, 0.48, 1.6, 10]} />
        </mesh>
      )}
    </group>
  );
}

function Statue() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} material={M.stone()} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.2, 1.8]} />
      </mesh>
      <mesh position={[0, 2.4, 0]} material={M.rock("#a8a294")} castShadow>
        <cylinderGeometry args={[0.45, 0.65, 2.4, 8]} />
      </mesh>
      <mesh position={[0, 4, 0]} material={M.rock("#a8a294")} castShadow>
        <sphereGeometry args={[0.45, 10, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.7, 2.8, 0.2]} rotation={[0.6, 0, s * 0.25]} material={M.rock("#a8a294")} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 1.6, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 3.2, 0.9]} rotation={[0.25, 0, 0]} material={M.rock("#9a948a")} castShadow>
        <boxGeometry args={[0.12, 2.8, 0.12]} />
      </mesh>
    </group>
  );
}

function Idol() {
  return (
    <group>
      <mesh position={[0, 1, 0]} material={M.stone()} castShadow receiveShadow>
        <boxGeometry args={[4.4, 2, 4.4]} />
      </mesh>
      <mesh position={[0, 5, 0]} material={M.rock("#8f8a7e")} castShadow receiveShadow>
        <boxGeometry args={[3.2, 6, 3]} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 6.4, 1.52]} material={M.emissive("#7fe0c0", 1.8)}>
          <boxGeometry args={[0.6, 0.35, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 5.4, 1.65]} material={M.rock("#7d786d")}>
        <boxGeometry args={[0.5, 1.2, 0.4]} />
      </mesh>
      <mesh position={[0, 4.2, 1.55]} material={M.cloth("#1a1614")}>
        <boxGeometry args={[1.8, 0.4, 0.1]} />
      </mesh>
      <mesh position={[0, 8.4, 0]} material={M.rock("#8f8a7e")} castShadow>
        <boxGeometry args={[3.8, 0.8, 3.4]} />
      </mesh>
    </group>
  );
}

function Wall({ len = 8, h = 3.2, thick = 1.2, fort }) {
  const top = useMemo(() => {
    const n = Math.max(2, Math.floor(len / 1.6));
    return Array.from({ length: n }).map((_, i) => ({ x: (i / (n - 1) - 0.5) * (len - 1), h: fort ? 0.9 : 0.3 + ((i * 7) % 5) * 0.25 }));
  }, [len, fort]);
  return (
    <group>
      <mesh position={[0, h / 2, 0]} material={M.stone()} castShadow receiveShadow>
        <boxGeometry args={[len, h, thick]} />
      </mesh>
      {top.map((b, i) =>
        fort ? (
          i % 2 === 0 && (
            <mesh key={i} position={[b.x, h + 0.45, 0]} material={M.stone()} castShadow>
              <boxGeometry args={[0.9, 0.9, thick * 1.05]} />
            </mesh>
          )
        ) : (
          <mesh key={i} position={[b.x, h + b.h / 2 - 0.2, 0]} material={M.stone()} castShadow>
            <boxGeometry args={[1.2, b.h, thick * 0.9]} />
          </mesh>
        ),
      )}
    </group>
  );
}

function Tower() {
  return (
    <group>
      <mesh position={[0, 4, 0]} material={M.stone()} castShadow receiveShadow>
        <cylinderGeometry args={[3.2, 3.6, 8, 14]} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 3, 8.5, Math.sin(a) * 3]} material={M.stone()} castShadow>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        );
      })}
    </group>
  );
}

function FortGate() {
  return (
    <group>
      {[-4.3, 4.3].map((x) => (
        <mesh key={x} position={[x, 3.4, 0]} material={M.stone()} castShadow receiveShadow>
          <boxGeometry args={[3.2, 6.8, 2.8]} />
        </mesh>
      ))}
      <mesh position={[0, 6.6, 0]} material={M.stone()} castShadow>
        <boxGeometry args={[11.8, 1.4, 2.8]} />
      </mesh>
      <mesh position={[0, 7.8, 1.45]} material={M.cloth("#2a1a2a")}>
        <planeGeometry args={[2.2, 1.6]} />
      </mesh>
    </group>
  );
}

function RuinFloor({ scale = 1 }) {
  return (
    <mesh position={[0, 0.17, 0]} material={M.stone()} receiveShadow>
      <boxGeometry args={[10 * scale, 0.35, 10 * scale]} />
    </mesh>
  );
}

function Stairs() {
  return (
    <group>
      <mesh position={[0, 0.15, -1.2]} material={M.stone()} receiveShadow castShadow>
        <boxGeometry args={[4, 0.3, 1.2]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={M.stone()} receiveShadow castShadow>
        <boxGeometry args={[4, 0.6, 1.2]} />
      </mesh>
    </group>
  );
}

function Rowboat() {
  return (
    <group rotation={[0, 0, 0.12]}>
      <mesh position={[0, 0.35, 0]} material={M.wood()} castShadow receiveShadow scale={[0.8, 0.45, 2]}>
        <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} material={M.darkWood()}>
        <boxGeometry args={[1.4, 0.06, 0.25]} />
      </mesh>
      <mesh position={[0.6, 0.5, 0.3]} rotation={[0.2, 0.3, 1.3]} material={M.wood()}>
        <boxGeometry args={[0.08, 2.4, 0.18]} />
      </mesh>
    </group>
  );
}

function Well() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} material={M.stone()} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1.05, 0.9, 14, 1, true]} />
      </mesh>
      <mesh position={[0, 0.4, 0]} material={M.cloth("#0a1a20")}>
        <cylinderGeometry args={[0.9, 0.9, 0.7, 14]} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 1.4, 0]} material={M.darkWood()}>
          <boxGeometry args={[0.12, 1.9, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0]} rotation={[0, 0, Math.PI / 4]} material={M.thatch()} castShadow>
        <boxGeometry args={[1.4, 1.4, 2]} />
      </mesh>
    </group>
  );
}

function Pedestal() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={M.stone()} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.6, 1, 10]} />
      </mesh>
      <mesh position={[0, 1.02, 0]} material={M.stone()}>
        <cylinderGeometry args={[0.6, 0.6, 0.08, 10]} />
      </mesh>
    </group>
  );
}

function Brazier() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={M.iron()} castShadow>
        <cylinderGeometry args={[0.1, 0.25, 1, 8]} />
      </mesh>
      <mesh position={[0, 1.1, 0]} material={M.iron()}>
        <cylinderGeometry args={[0.45, 0.22, 0.35, 10]} />
      </mesh>
      <Flame position={[0, 1.25, 0]} scale={0.9} />
    </group>
  );
}

function CannonEmplacement() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} material={M.darkWood()} castShadow>
        <boxGeometry args={[1, 0.5, 1.6]} />
      </mesh>
      <mesh position={[0, 0.85, 0.35]} rotation={[Math.PI / 2 - 0.1, 0, 0]} material={M.iron()} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 2.2, 10]} />
      </mesh>
      {[-0.55, 0.55].map((x) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.2, z]} rotation={[0, 0, Math.PI / 2]} material={M.wood()}>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 10]} />
          </mesh>
        )),
      )}
      <group position={[0.9, 0, -0.6]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i % 2) * 0.22, 0.12 + Math.floor(i / 2) * 0.2, (i - 1) * 0.22]} material={M.iron()}>
            <sphereGeometry args={[0.12, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function TreasurePile({ scale = 1 }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.25, 0]} material={M.gold()} scale={[1.3, 0.55, 1.1]} castShadow>
        <sphereGeometry args={[1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {[
        [0.5, 0.5, 0.2, "#d0283c"],
        [-0.4, 0.45, -0.3, "#2c8ad8"],
        [0.1, 0.62, 0.5, "#30c060"],
      ].map(([x, y, z, c], i) => (
        <mesh key={i} position={[x, y, z]} material={M.emissive(c, 1.2)}>
          <octahedronGeometry args={[0.13, 0]} />
        </mesh>
      ))}
      <mesh position={[0.8, 0.3, -0.5]} rotation={[0.3, 0.5, 0.2]} material={M.brass()}>
        <cylinderGeometry args={[0.18, 0.12, 0.45, 10]} />
      </mesh>
    </group>
  );
}

function DeadTree() {
  return (
    <group>
      <mesh position={[0, 1.8, 0]} rotation={[0, 0, 0.06]} material={M.cloth("#5e564c")} castShadow>
        <cylinderGeometry args={[0.12, 0.3, 3.6, 6]} />
      </mesh>
      {[0.6, 2.2, 4].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.5, 2.4 + i * 0.4, Math.sin(a) * 0.5]} rotation={[Math.sin(a) * 0.8, 0, Math.cos(a) * 0.9]} material={M.cloth("#5e564c")}>
          <cylinderGeometry args={[0.04, 0.09, 1.4, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function StoneRing() {
  return (
    <group>
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const tall = 2.2 + ((i * 5) % 3) * 0.5;
        return (
          <mesh key={i} position={[Math.cos(a) * 6.2, tall / 2, Math.sin(a) * 6.2]} rotation={[0, -a, ((i % 3) - 1) * 0.06]} material={M.rock("#8f8b82")} castShadow receiveShadow>
            <boxGeometry args={[0.9, tall, 0.6]} />
          </mesh>
        );
      })}
    </group>
  );
}

function WreckBeach() {
  return (
    <group rotation={[0.1, 0, 0.42]} position={[0, -0.6, 0]}>
      <ShipModel clsId="sloop" look={{ hullColor: "#4a3426", accent: "#5a4a3a", sail: "#bfb6a0", tattered: true, flag: "bones" }} preview={{ throttle: 0.1 }} castShadow />
    </group>
  );
}

function PalmBig() {
  return (
    <mesh position={[0, 3, 0]} material={M.cloth("#8a6a48")} castShadow>
      <cylinderGeometry args={[0.25, 0.4, 6, 8]} />
    </mesh>
  );
}

export function PropMesh({ p }) {
  let inner = null;
  switch (p.t) {
    case "hut":
      inner = <Hut />;
      break;
    case "tent":
      inner = <Tent />;
      break;
    case "campfire":
      inner = <Campfire />;
      break;
    case "crates":
      inner = <Crates />;
      break;
    case "barrels":
      inner = <Barrels />;
      break;
    case "table":
      inner = <Table />;
      break;
    case "boulder":
      inner = <Rock r={1.6} h={1.4} seed={p.x * 0.1} />;
      break;
    case "bigRock":
      inner = <Rock r={3.2} h={3.4} seed={p.z * 0.1} color="#6f6a62" />;
      break;
    case "signpost":
      inner = <Signpost />;
      break;
    case "flag":
      inner = <FlagPole color="#141414" />;
      break;
    case "torch":
      inner = <Torch />;
      break;
    case "lantern":
      inner = <Lantern />;
      break;
    case "bones":
      inner = <Bones />;
      break;
    case "skullRock":
      inner = <SkullRock />;
      break;
    case "lighthouse":
      inner = <Lighthouse />;
      break;
    case "caveMouth":
      inner = <CaveMouth />;
      break;
    case "column":
      inner = <Column />;
      break;
    case "brokenColumn":
      inner = <Column broken />;
      break;
    case "statue":
      inner = <Statue />;
      break;
    case "idol":
      inner = <Idol />;
      break;
    case "ruinWall":
      inner = <Wall len={p.len || 8} h={3.2} thick={1.2} />;
      break;
    case "fortWall":
      inner = <Wall len={p.len || 14} h={6} thick={2.2} fort />;
      break;
    case "ruinFloor":
      return (
        <group position={[p.x, p.y, p.z]} rotation={[0, p.rot || 0, 0]}>
          <RuinFloor scale={p.scale || 1} />
        </group>
      );
    case "stairs":
      inner = <Stairs />;
      break;
    case "fortTower":
      inner = <Tower />;
      break;
    case "fortGate":
      inner = <FortGate />;
      break;
    case "wreckBeach":
      inner = <WreckBeach />;
      break;
    case "rowboat":
      inner = <Rowboat />;
      break;
    case "well":
      inner = <Well />;
      break;
    case "pedestal":
      inner = <Pedestal />;
      break;
    case "brazier":
      inner = <Brazier />;
      break;
    case "cannonEmplacement":
      inner = <CannonEmplacement />;
      break;
    case "treasurePile":
      inner = <TreasurePile />;
      break;
    case "deadTree":
      inner = <DeadTree />;
      break;
    case "stoneRing":
      inner = <StoneRing />;
      break;
    case "palmBig":
      inner = <PalmBig />;
      break;
    default:
      return null;
  }
  const s = p.t === "ruinWall" || p.t === "fortWall" ? 1 : p.scale || 1;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.rot || 0, 0]} scale={s}>
      {inner}
    </group>
  );
}

/** Light emitters for the pool: flames, lanterns, braziers, campfires. */
export function propEmitters(props) {
  const out = [];
  for (const p of props) {
    const s = p.scale || 1;
    if (p.t === "campfire") out.push({ x: p.x, y: p.y + 0.8 * s, z: p.z, color: "#ff9a3c", intensity: 9 * s, dist: 16 * s, flicker: 1 });
    else if (p.t === "torch") out.push({ x: p.x, y: p.y + 1.9, z: p.z, color: "#ffa04a", intensity: 5, dist: 11, flicker: 1 });
    else if (p.t === "brazier") out.push({ x: p.x, y: p.y + 1.6, z: p.z, color: p.cursed ? "#7fe0c0" : "#ff9a3c", intensity: 6, dist: 13, flicker: 1 });
    else if (p.t === "lantern") out.push({ x: p.x + 0.5, y: p.y + 2, z: p.z, color: "#ffc070", intensity: 3, dist: 9, flicker: 0.3 });
    else if (p.t === "hut") out.push({ x: p.x, y: p.y + 2.5, z: p.z, color: "#ffc070", intensity: 2, dist: 7, flicker: 0.2 });
    else if (p.t === "treasurePile") out.push({ x: p.x, y: p.y + 1, z: p.z, color: "#ffcc55", intensity: 5, dist: 9, flicker: 0.1 });
  }
  return out;
}

/**
 * Moves `count` point lights to the emitters nearest `focus` (re-evaluated
 * a few times a second), with per-emitter flicker. Keeps the light count
 * fixed so shaders never recompile when you walk around.
 */
export function LightPool({ emitters, focus, count = 5 }) {
  const lights = useRef([]);
  const assigned = useRef([]);
  const acc = useRef(0);
  useFrame(({ clock }, dt) => {
    acc.current -= dt;
    const f = focus?.current;
    if (acc.current <= 0 && f) {
      acc.current = 0.3;
      const sorted = emitters
        .map((e) => ({ e, d: (e.x - f.x) ** 2 + (e.z - f.z) ** 2 }))
        .filter((o) => o.d < 60 * 60)
        .sort((a, b) => a.d - b.d)
        .slice(0, count);
      assigned.current = sorted.map((o) => o.e);
    }
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const L = lights.current[i];
      if (!L) continue;
      const e = assigned.current[i];
      if (!e) {
        L.intensity = 0;
        continue;
      }
      L.position.set(e.x, e.y, e.z);
      L.color.set(e.color);
      L.distance = e.dist;
      const fl = 1 + (Math.sin(t * 11 + i * 3) * 0.12 + Math.sin(t * 17.3 + i) * 0.08) * e.flicker;
      L.intensity = e.intensity * fl;
    }
  });
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <pointLight key={i} ref={(el) => (lights.current[i] = el)} intensity={0} distance={10} decay={1.6} />
      ))}
    </>
  );
}

export { DEG };
