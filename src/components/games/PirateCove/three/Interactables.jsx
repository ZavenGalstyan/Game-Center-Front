/**
 * Pirate Cove — things you can use on an island: chests, dig spots, levers,
 * gates and pickups. Each reads its engine item every frame (state + t), so
 * the animation always matches the authoritative state.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M } from "./materials.js";

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function Chest({ it }) {
  const root = useRef();
  const lid = useRef();
  const glow = useRef();
  const coins = useRef();
  const s = it.big ? 1.7 : 1;
  useFrame(() => {
    if (!root.current) return;
    const st = it.state;
    root.current.visible = st !== "buried";
    let y = it.y;
    if (st === "rising") y = it.y - 1.2 + ease(it.t / 1.1) * 1.2;
    root.current.position.set(it.x, y, it.z);
    let open = 0;
    if (st === "opening") open = ease(it.t / 0.7);
    if (st === "opened") open = 1;
    lid.current.rotation.x = -open * 1.9;
    glow.current.visible = open > 0.05;
    glow.current.scale.set(0.9, 0.3 + open * 0.5, 0.6);
    coins.current.visible = open > 0.2;
    coins.current.position.y = 0.45 + open * 0.15;
  });
  return (
    <group ref={root} rotation={[0, it.rot || 0, 0]} scale={s}>
      <mesh position={[0, 0.3, 0]} material={M.wood()} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.6, 0.72]} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.3, 0]} material={M.iron()}>
          <boxGeometry args={[0.07, 0.62, 0.74]} />
        </mesh>
      ))}
      <group ref={lid} position={[0, 0.6, -0.36]}>
        <mesh position={[0, 0.12, 0.36]} rotation={[0, 0, Math.PI / 2]} material={M.wood()} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 1.1, 12, 1, false, 0, Math.PI]} />
        </mesh>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.12, 0.36]} rotation={[0, 0, Math.PI / 2]} material={M.iron()}>
            <cylinderGeometry args={[0.375, 0.375, 0.07, 12, 1, false, 0, Math.PI]} />
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0.74]} material={M.brass()}>
          <boxGeometry args={[0.16, 0.2, 0.05]} />
        </mesh>
      </group>
      <group ref={coins} position={[0, 0.45, 0]}>
        <mesh material={M.gold()} scale={[0.48, 0.18, 0.3]}>
          <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0.2, 0.15, 0.05]} material={M.emissive("#d0283c", 1.4)}>
          <octahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
      <mesh ref={glow} position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#ffd36a" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function DigSpot({ it, revealed }) {
  const root = useRef();
  const x = useRef();
  const mound = useRef();
  const hole = useRef();
  useFrame(({ clock }) => {
    if (!root.current) return;
    const dug = it.state === "dug" || it.state === "digging";
    root.current.visible = revealed() || dug;
    x.current.visible = !dug;
    mound.current.scale.y = it.state === "digging" ? 0.6 : dug ? 0.01 : 1;
    hole.current.visible = it.state === "dug";
    x.current.rotation.y = clock.elapsedTime * 0.3;
    x.current.position.y = 0.06 + Math.sin(clock.elapsedTime * 2) * 0.02;
  });
  return (
    <group ref={root} position={[it.x, it.y, it.z]}>
      <mesh ref={mound} position={[0, 0.02, 0]} material={M.accent("#d9c290")} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <group ref={x}>
        {[Math.PI / 4, -Math.PI / 4].map((r) => (
          <mesh key={r} rotation={[0, r, 0]} position={[0, 0.42, 0]} material={M.emissive("#b8281c", 1.2)}>
            <boxGeometry args={[1.4, 0.06, 0.18]} />
          </mesh>
        ))}
      </group>
      <mesh ref={hole} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} material={M.cloth("#4a3a22")}>
        <circleGeometry args={[0.9, 16]} />
      </mesh>
    </group>
  );
}

function Lever({ it }) {
  const arm = useRef();
  useFrame(() => {
    if (!arm.current) return;
    const k = it.state === "pulled" ? Math.min(1, (it.t || 0) * 3 + (it.t == null ? 1 : 0)) : 0;
    it.t = (it.t || 0) + 1 / 60;
    arm.current.rotation.x = 0.7 - ease(k) * 1.4;
  });
  return (
    <group position={[it.x, it.y, it.z]} rotation={[0, it.rot || 0, 0]}>
      <mesh position={[0, 0.45, 0]} material={M.stone()} castShadow receiveShadow>
        <boxGeometry args={[1, 0.9, 0.8]} />
      </mesh>
      <group ref={arm} position={[0, 0.9, 0]}>
        <mesh position={[0, 0.55, 0]} material={M.iron()} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.1, 6]} />
        </mesh>
        <mesh position={[0, 1.12, 0]} material={M.accent("#a8382e")}>
          <sphereGeometry args={[0.11, 8, 6]} />
        </mesh>
      </group>
      <mesh position={[0, 0.92, 0.42]} material={it.state === "pulled" ? M.emissive("#7fe0c0", 1.6) : M.cloth("#2a2a2a")}>
        <boxGeometry args={[0.3, 0.3, 0.02]} />
      </mesh>
    </group>
  );
}

function Gate({ it }) {
  const bars = useRef();
  const w = it.w || 4;
  const n = Math.max(3, Math.round(w / 0.45));
  useFrame(() => {
    if (!bars.current) return;
    let k = 0;
    if (it.state === "opening-gate") k = ease(it.t / 2);
    if (it.state === "open") k = 1;
    bars.current.position.y = k * 4.2;
  });
  return (
    <group position={[it.x, it.y, it.z]} rotation={[0, it.rot || 0, 0]}>
      <group ref={bars}>
        {Array.from({ length: n }).map((_, i) => (
          <mesh key={i} position={[(i / (n - 1) - 0.5) * (w - 0.3), 2, 0]} material={M.iron()} castShadow>
            <boxGeometry args={[0.1, 4, 0.1]} />
          </mesh>
        ))}
        {[0.5, 2, 3.5].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={M.iron()} castShadow>
            <boxGeometry args={[w, 0.12, 0.14]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Pickup({ it }) {
  const g = useRef();
  const seed = useMemo(() => (it.x * 0.37 + it.z * 0.11) % 6.28, [it.x, it.z]);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.visible = it.state === "idle";
    const t = clock.elapsedTime + seed;
    g.current.position.set(it.x, it.y + (it.lift || 0) + 0.45 + Math.sin(t * 2) * 0.08, it.z);
    g.current.rotation.y = t * 1.2;
  });
  let body;
  switch (it.item) {
    case "map":
      body = (
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh material={M.accent("#e8d6a8")}>
            <cylinderGeometry args={[0.1, 0.1, 0.62, 10]} />
          </mesh>
          <mesh material={M.accent("#a8382e")}>
            <torusGeometry args={[0.105, 0.02, 4, 12]} />
          </mesh>
        </group>
      );
      break;
    case "fragment":
      body = (
        <mesh material={M.accent("#e2cf9e")} rotation={[0.3, 0, 0.2]}>
          <boxGeometry args={[0.42, 0.34, 0.015]} />
        </mesh>
      );
      break;
    case "key":
      body = (
        <group>
          <mesh material={M.brass()}>
            <torusGeometry args={[0.1, 0.03, 6, 12]} />
          </mesh>
          <mesh material={M.brass()} position={[0, -0.24, 0]}>
            <boxGeometry args={[0.04, 0.3, 0.04]} />
          </mesh>
          <mesh material={M.brass()} position={[0.05, -0.34, 0]}>
            <boxGeometry args={[0.08, 0.04, 0.04]} />
          </mesh>
        </group>
      );
      break;
    case "food":
      body = (
        <group>
          <mesh material={M.accent("#8a4a24")} scale={[1, 0.8, 0.8]}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
          <mesh material={M.bone()} position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
          </mesh>
        </group>
      );
      break;
    case "potion":
      body = (
        <group>
          <mesh material={M.emissive("#e8435a", 1.2)}>
            <sphereGeometry args={[0.14, 10, 8]} />
          </mesh>
          <mesh material={M.wood()} position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.12, 6]} />
          </mesh>
        </group>
      );
      break;
    default:
      body = (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} material={M.gold()} position={[0, i * 0.05 - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.04, 12]} />
            </mesh>
          ))}
        </group>
      );
  }
  const important = it.item === "map" || it.item === "fragment" || it.item === "key";
  return (
    <group ref={g}>
      {body}
      {important && (
        <mesh position={[0, -0.2, 0]}>
          <sphereGeometry args={[0.45, 12, 10]} />
          <meshBasicMaterial color="#ffe08a" transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

export default function Interactables({ game, islandId, area }) {
  const items = game.landItems.filter((i) => i.island === islandId && (i.area || "out") === area);
  const revealedFor = (it) => () => game.items.maps.has(it.map);
  return (
    <group>
      {items.map((it) => {
        switch (it.kind) {
          case "chest":
            return <Chest key={it.id} it={it} />;
          case "dig":
            return <DigSpot key={it.id} it={it} revealed={revealedFor(it)} />;
          case "lever":
            return <Lever key={it.id} it={it} />;
          case "gate":
            return <Gate key={it.id} it={it} />;
          case "pickup":
            return <Pickup key={it.id} it={it} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
