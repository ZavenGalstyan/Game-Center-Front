import { useEffect, useRef } from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { useColliderMeta } from "../PhysicsMetaContext.js";

/**
 * Static (fixed) level geometry — every platform in every world. Visual
 * construction varies by `style` (which template: two-tier ground block,
 * plain slab, wood) while `tint`/`emissive` carry each world's palette, so
 * the SAME three templates read as ten different places instead of being
 * hardcoded per world.
 *
 * The collider is explicit (CuboidCollider sized directly off `size`)
 * rather than `colliders="cuboid"` auto-detection from the mesh's bounding
 * box — auto-detection resolves asynchronously, which meant every platform
 * needed a requestAnimationFrame retry loop to find its collider handle;
 * with many platforms mounting in the same commit those retries landed on
 * the same frame and could race with Rapier's own body creation. Explicit
 * colliders are available on the very next effect, synchronously.
 */
const DEFAULT_TINTS = {
  ground: { top: "#5da83f", base: "#7a5a3a" },
  wood: { top: "#9a6b3f" },
  stone: { top: "#8d8d90" },
};

function ConveyorStripes({ w, d, h, dir }) {
  const count = Math.max(2, Math.round(d / 1.6));
  const angle = Math.atan2(dir?.[0] ?? 0, dir?.[1] ?? 1);
  const stripes = [];
  for (let i = 0; i < count; i++) {
    const z = -d / 2 + ((i + 0.5) / count) * d;
    stripes.push(
      <mesh key={i} position={[0, h / 2 + 0.011, z]} rotation={[-Math.PI / 2, 0, angle]}>
        <planeGeometry args={[w * 0.7, 0.3]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.6} />
      </mesh>,
    );
  }
  return <group>{stripes}</group>;
}

export default function PlatformMesh({ pos, size, rot = [0, 0, 0], surface = "normal", style = "ground", tint, emissive, conveyorDir }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const meta = useColliderMeta();

  useEffect(() => {
    const collider = colliderRef.current;
    if (!collider) return undefined;
    const handle = collider.handle;
    meta.current.set(handle, { kind: "platform", surface, conveyorDir });
    return () => meta.current.delete(handle);
  }, [meta, surface, conveyorDir]);

  const [w, h, d] = size;
  const colors = tint || DEFAULT_TINTS[style] || DEFAULT_TINTS.stone;
  const glow = emissive || (surface === "lava" ? "#ff5522" : null);

  return (
    <RigidBody ref={bodyRef} type="fixed" colliders={false} position={pos} rotation={rot} friction={surface === "ice" ? 0.15 : 0.9} restitution={0}>
      <CuboidCollider ref={colliderRef} args={[w / 2, h / 2, d / 2]} />
      {style === "ground" && (
        <group>
          <mesh castShadow receiveShadow position={[0, h * 0.28, 0]}>
            <boxGeometry args={[w, h * 0.44, d]} />
            <meshStandardMaterial color={colors.top} roughness={0.92} />
          </mesh>
          <mesh receiveShadow position={[0, -h * 0.14, 0]}>
            <boxGeometry args={[w * 0.995, h * 0.72, d * 0.995]} />
            <meshStandardMaterial color={colors.base || colors.top} roughness={1} />
          </mesh>
        </group>
      )}
      {style !== "ground" && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={colors.top}
            roughness={style === "ice" ? 0.15 : 0.85}
            metalness={style === "metal" ? 0.55 : 0.1}
            transparent={style === "ice"}
            opacity={style === "ice" ? 0.82 : 1}
            emissive={glow || "#000000"}
            emissiveIntensity={glow ? 0.55 : 0}
          />
        </mesh>
      )}
      {surface === "conveyor" && <ConveyorStripes w={w} d={d} h={h} dir={conveyorDir} />}
    </RigidBody>
  );
}
