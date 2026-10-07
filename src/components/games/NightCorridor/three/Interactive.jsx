/**
 * Night Corridor — things you touch: doors, hiding lockers, pickups and
 * wall devices. All animate from engine state inside one useFrame each;
 * no React state changes per frame.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CELL } from "../engine/constants.js";
import { PROP_SIZES } from "../engine/level.js";
import { doorTexture, signTexture, glowTexture } from "./textures.js";
import { getMaterials } from "./materials.js";

// ------------------------------------------------------------------ doors
function Door({ door, shadows }) {
  const pivot = useRef();
  const led = useRef();
  const tex = doorTexture(door.style === "exit" ? "exit" : door.style);
  const mats = getMaterials();
  const base = door.axis === "z" ? 0 : -Math.PI / 2;
  const sign = door.axis === "z" ? -1 : 1;
  const hinge = door.axis === "z" ? [door.x - 0.5, 0, door.z] : [door.x, 0, door.z - 0.5];
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.2, roughness: door.style === "wood" ? 0.8 : 0.55, metalness: door.style === "wood" ? 0 : 0.4 }), [tex, door.style]);
  const lockable = door.locked || door.exit;

  useFrame((state) => {
    const p = pivot.current;
    if (!p) return;
    let jitter = 0;
    if (door.shake > 0) jitter = Math.sin(state.clock.elapsedTime * 60) * 0.02 * door.shake;
    p.rotation.y = base + sign * door.swing * door.open * (Math.PI / 2) * 0.96 + jitter;
    if (led.current) {
      const unlocked = door.exit ? door.ready || door.open > 0.1 : !door.locked || door.open > 0.1;
      led.current.color.set(unlocked ? "#18ff6a" : "#ff2018");
    }
  });

  const exitSign = door.exit ? signTexture(door.label?.toUpperCase().includes("STAIR") ? "STAIRS" : "EXIT", "exit") : null;
  return (
    <group>
      <group ref={pivot} position={hinge} rotation={[0, base, 0]}>
        <mesh position={[0.495, 1.065, 0]} material={panelMat} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[0.97, 2.12, 0.05]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.86, 1.02, s * 0.045]}>
            <mesh material={mats.chrome}>
              <boxGeometry args={[0.05, 0.12, 0.02]} />
            </mesh>
            <mesh position={[-0.06, 0.03, s * 0.03]} material={mats.chrome}>
              <boxGeometry args={[0.13, 0.025, 0.025]} />
            </mesh>
          </group>
        ))}
      </group>
      {lockable && (
        <group position={[door.x, 0, door.z]} rotation={[0, door.axis === "z" ? 0 : Math.PI / 2, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[0.66, 1.22, s * (CELL / 2 - 0.02)]} rotation={[0, s < 0 ? Math.PI : 0, 0]}>
              <mesh material={mats.darkMetal}>
                <boxGeometry args={[0.14, 0.2, 0.04]} />
              </mesh>
              <mesh position={[0, 0.06, 0.022]}>
                <boxGeometry args={[0.03, 0.03, 0.01]} />
                <meshBasicMaterial ref={s === 1 ? led : undefined} color="#ff2018" toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {exitSign && (
        <group position={[door.x, 2.45, door.z]} rotation={[0, door.axis === "z" ? 0 : Math.PI / 2, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * (CELL / 2 + 0.03)]} rotation={[0, s < 0 ? Math.PI : 0, 0]}>
              <boxGeometry args={[0.6, 0.18, 0.04]} />
              <meshStandardMaterial map={exitSign} emissive="#22ff66" emissiveMap={exitSign} emissiveIntensity={1.4} fog={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export function Doors({ doors, shadows }) {
  return (
    <group>
      {doors.map((d) => (
        <Door key={d.id} door={d} shadows={shadows} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- lockers
function Locker({ locker, game, shadows }) {
  const doorRef = useRef();
  const mats = getMaterials();
  const s = PROP_SIZES.locker;
  useFrame(() => {
    const h = game.hiding;
    let open = 0;
    const anim = game.lockerAnim?.[locker.id];
    if (anim != null) {
      const t = game.time - anim;
      if (t >= 0 && t < 0.7) open = Math.sin((t / 0.7) * Math.PI) * 1.1;
    }
    if (h && h.locker === locker && h.t < 0.4) open = Math.max(open, Math.sin((h.t / 0.4) * Math.PI) * 1.1);
    if (doorRef.current) doorRef.current.rotation.y = -open;
  });
  return (
    <group position={[locker.x, 0, locker.z]} rotation={[0, locker.yaw, 0]}>
      <mesh position={[0, s.h / 2, -0.02]} material={mats.greenMetal} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[s.w, s.h, s.d - 0.04]} />
      </mesh>
      <group ref={doorRef} position={[-s.w / 2 + 0.02, 0, s.d / 2 - 0.02]}>
        <mesh position={[s.w / 2 - 0.02, s.h / 2, 0]} material={mats.locker} castShadow={shadows}>
          <boxGeometry args={[s.w - 0.05, s.h - 0.06, 0.025]} />
        </mesh>
      </group>
    </group>
  );
}

export function Lockers({ game, shadows }) {
  return (
    <group>
      {game.lockers.map((l) => (
        <Locker key={l.id} locker={l} game={game} shadows={shadows} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ items
function KeyModel() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0.6]} scale={1.4}>
      <mesh position={[-0.045, 0, 0]}>
        <torusGeometry args={[0.025, 0.007, 8, 18]} />
        <meshStandardMaterial color="#b08d3a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[0.09, 0.012, 0.006]} />
        <meshStandardMaterial color="#b08d3a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, -0.012, 0]}>
        <boxGeometry args={[0.025, 0.018, 0.006]} />
        <meshStandardMaterial color="#b08d3a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[-0.11, 0, 0]}>
        <boxGeometry args={[0.07, 0.035, 0.004]} />
        <meshStandardMaterial color="#8a2a1c" roughness={0.8} />
      </mesh>
    </group>
  );
}

function FuseModel() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 12]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.5} />
      </mesh>
      {[-0.065, 0.065].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.025, 12]} />
          <meshStandardMaterial color="#9c9a92" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function CardModel() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0.4]}>
      <boxGeometry args={[0.085, 0.055, 0.004]} />
      <meshStandardMaterial color="#d9dde0" roughness={0.4} emissive="#1b4e8c" emissiveIntensity={0.15} />
    </mesh>
  );
}

function RadioModel({ item }) {
  const led = useRef();
  useFrame((st) => {
    if (led.current) led.current.color.setRGB(item.on ? 1 * (0.6 + 0.4 * Math.sin(st.clock.elapsedTime * 9)) : 0.08, item.on ? 0.1 : 0.02, 0.02);
  });
  return (
    <group position={[0, 0.09, 0]}>
      <mesh>
        <boxGeometry args={[0.3, 0.18, 0.1]} />
        <meshStandardMaterial color="#3b2f25" roughness={0.6} />
      </mesh>
      <mesh position={[-0.06, 0, 0.051]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#141210" roughness={1} />
      </mesh>
      <mesh position={[0.08, 0.03, 0.052]}>
        <boxGeometry args={[0.1, 0.04, 0.005]} />
        <meshStandardMaterial color="#c9b98f" emissive="#c9a85a" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.1, -0.04, 0.052]}>
        <boxGeometry args={[0.012, 0.012, 0.004]} />
        <meshBasicMaterial ref={led} color="#200" toneMapped={false} />
      </mesh>
      <mesh position={[0.12, 0.22, -0.02]} rotation={[0, 0, -0.35]}>
        <cylinderGeometry args={[0.004, 0.004, 0.32, 4]} />
        <meshStandardMaterial color="#999" metalness={0.9} />
      </mesh>
    </group>
  );
}

function ValveModel() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.1, 0.014, 8, 24]} />
        <meshStandardMaterial color="#8c1d14" roughness={0.5} metalness={0.5} />
      </mesh>
      {[0, Math.PI / 3, (2 * Math.PI) / 3].map((r) => (
        <mesh key={r} rotation={[0, 0, r]}>
          <boxGeometry args={[0.2, 0.014, 0.014]} />
          <meshStandardMaterial color="#8c1d14" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function NoteModel() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0.3]}>
      <planeGeometry args={[0.16, 0.22]} />
      <meshStandardMaterial color="#d8d0bc" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Pickup({ item }) {
  const ref = useRef();
  const glint = useRef();
  const glow = glowTexture();
  useFrame((st) => {
    if (!ref.current) return;
    const hidden = item.kind !== "radio" && item.taken;
    ref.current.visible = !hidden;
    if (glint.current) glint.current.material.opacity = hidden ? 0 : 0.18 + 0.14 * Math.sin(st.clock.elapsedTime * 2.2 + item.x);
  });
  const model =
    item.model === "fuse" ? <FuseModel /> : item.model === "valve" ? <ValveModel /> : item.model === "keycard" ? <CardModel /> : item.model === "radio" ? <RadioModel item={item} /> : item.model === "note" ? <NoteModel /> : <KeyModel />;
  return (
    <group ref={ref} position={[item.x, item.y, item.z]} rotation={[0, item.yaw, 0]}>
      <group position={[0, item.model === "radio" ? 0 : 0.02, 0]}>{model}</group>
      {item.model !== "radio" && (
        <sprite ref={glint} position={[0, 0.06, 0]} scale={[0.32, 0.32, 1]}>
          <spriteMaterial map={glow} color="#ffe2a8" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      )}
    </group>
  );
}

function WallDevice({ item }) {
  const led = useRef();
  const lever = useRef();
  const mats = getMaterials();
  useFrame(() => {
    if (led.current) led.current.color.set(item.used ? "#1dff6b" : "#ff2a18");
    if (lever.current) lever.current.rotation.x += ((item.used ? 0.9 : -0.9) - lever.current.rotation.x) * 0.2;
  });
  const m = item.model;
  return (
    <group position={[item.x, item.y, item.z]} rotation={[0, item.yaw, 0]}>
      {m === "fusebox" && (
        <group>
          <mesh position={[0, 0, -0.02]} material={mats.paintedMetal}>
            <boxGeometry args={[0.5, 0.65, 0.18]} />
          </mesh>
          <mesh position={[0, 0, 0.072]}>
            <boxGeometry args={[0.4, 0.5, 0.01]} />
            <meshStandardMaterial color="#1a1a18" />
          </mesh>
          {[-0.12, 0, 0.12].map((x) => (
            <mesh key={x} position={[x, 0.08, 0.085]} material={mats.darkMetal}>
              <boxGeometry args={[0.07, 0.16, 0.03]} />
            </mesh>
          ))}
          <mesh position={[0.12, -0.14, 0.09]}>
            <boxGeometry args={[0.07, 0.04, 0.02]} />
            <meshStandardMaterial color="#c9a227" />
          </mesh>
          <mesh position={[-0.15, -0.22, 0.09]}>
            <boxGeometry args={[0.035, 0.035, 0.01]} />
            <meshBasicMaterial ref={led} color="#f20" toneMapped={false} />
          </mesh>
          <mesh position={[0.32, 0, -0.05]} rotation={[0, -0.9, 0]} material={mats.paintedMetal}>
            <boxGeometry args={[0.02, 0.62, 0.42]} />
          </mesh>
          <mesh position={[0, 0.85, -0.06]} material={mats.pipe}>
            <cylinderGeometry args={[0.025, 0.025, 1.1, 8]} />
          </mesh>
        </group>
      )}
      {(m === "switch" || m === "lever") && (
        <group>
          <mesh position={[0, 0, -0.02]} material={mats.beigeMetal}>
            <boxGeometry args={[0.3, 0.42, 0.12]} />
          </mesh>
          <group ref={lever} position={[0, 0, 0.05]}>
            <mesh position={[0, 0.12, 0.03]} material={mats.red}>
              <boxGeometry args={[0.04, 0.24, 0.04]} />
            </mesh>
          </group>
          <mesh position={[0.09, 0.16, 0.042]}>
            <boxGeometry args={[0.03, 0.03, 0.01]} />
            <meshBasicMaterial ref={led} color="#f20" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.9, -0.06]} material={mats.pipe}>
            <cylinderGeometry args={[0.02, 0.02, 1.4, 8]} />
          </mesh>
        </group>
      )}
      {m === "valve" && (
        <group>
          <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={mats.pipeRust}>
            <cylinderGeometry args={[0.08, 0.08, 0.12, 12]} />
          </mesh>
          <mesh position={[0, 0, -0.2]} rotation={[0, 0, Math.PI / 2]} material={mats.pipe}>
            <cylinderGeometry args={[0.07, 0.07, 1.6, 10]} />
          </mesh>
          <group ref={lever} position={[0, 0, 0.04]}>
            <mesh visible={item.used}>
              <torusGeometry args={[0.13, 0.016, 8, 24]} />
              <meshStandardMaterial color="#8c1d14" roughness={0.5} metalness={0.5} />
            </mesh>
          </group>
          <mesh position={[0.18, 0.16, 0.0]}>
            <boxGeometry args={[0.03, 0.03, 0.01]} />
            <meshBasicMaterial ref={led} color="#f20" toneMapped={false} />
          </mesh>
        </group>
      )}
      {(m === "panel" || m === "elevator" || m === "keypad") && (
        <group>
          <mesh position={[0, 0, -0.01]} material={mats.chrome}>
            <boxGeometry args={[0.24, 0.4, 0.04]} />
          </mesh>
          <mesh position={[0, 0.06, 0.015]}>
            <circleGeometry args={[0.045, 18]} />
            <meshBasicMaterial ref={led} color="#f20" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.08, 0.012]}>
            <boxGeometry args={[0.14, 0.06, 0.005]} />
            <meshStandardMaterial color="#10161a" emissive="#2a5a3a" emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function Items({ items }) {
  return (
    <group>
      {items.map((it) => (it.kind === "use" ? <WallDevice key={it.id} item={it} /> : <Pickup key={it.id} item={it} />))}
    </group>
  );
}
