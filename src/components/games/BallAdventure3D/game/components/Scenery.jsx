import { useMemo } from "react";

/**
 * Non-collidable dressing: per-level decorations plus a ring of cheap
 * low-poly distant silhouettes so every world reads as a place, not
 * platforms floating in empty colour. None of this has a collider. A small
 * set of generic shapes (Tree/Spike/Panel/Rock/Cloud) gets recoloured per
 * world instead of hand-building a bespoke prop set for all ten themes.
 */
function Tree({ pos, scale = 1, rot = 0, trunk = "#6b4a2c", leaf = "#2f7d3a", leaf2 = "#3d9146" }) {
  return (
    <group position={pos} scale={scale} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 0.7, 6]} />
        <meshStandardMaterial color={trunk} roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0]}>
        <coneGeometry args={[0.55, 1.1, 7]} />
        <meshStandardMaterial color={leaf} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.55, 0]}>
        <coneGeometry args={[0.4, 0.8, 7]} />
        <meshStandardMaterial color={leaf2} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Flower({ pos, scale = 1, hue = 0.9, stem = "#3d9146" }) {
  const color = useMemo(() => `hsl(${Math.round(hue * 360)}, 70%, 65%)`, [hue]);
  return (
    <group position={pos} scale={scale}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.24, 5]} />
        <meshStandardMaterial color={stem} roughness={1} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Rock({ pos, scale = 1, rot = 0, color = "#8d8d90", emissive }) {
  return (
    <mesh position={pos} scale={scale} rotation={[0.2, rot, 0.1]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.35, 0]} />
      <meshStandardMaterial color={color} roughness={1} emissive={emissive || "#000000"} emissiveIntensity={emissive ? 0.6 : 0} />
    </mesh>
  );
}

function Cloud({ pos, scale = 1, color = "#ffffff" }) {
  return (
    <group position={pos} scale={scale}>
      {[[0, 0, 0], [0.5, 0.08, 0.1], [-0.5, 0.05, -0.1], [0.2, 0.15, 0.3]].map((o, i) => (
        <mesh key={i} position={o}>
          <sphereGeometry args={[0.55, 8, 8]} />
          <meshStandardMaterial color={color} transparent opacity={0.92} roughness={1} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Tall thin silhouette — cactus, icicle, crystal spire, candy cane, ember rock. */
function Spike({ pos, scale = 1, color = "#8d8d90", emissive, height = 1.4, radius = 0.16 }) {
  return (
    <mesh position={[pos[0], pos[1] + height / 2, pos[2]]} scale={scale} castShadow>
      <coneGeometry args={[radius, height, 6]} />
      <meshStandardMaterial color={color} roughness={0.5} emissive={emissive || "#000000"} emissiveIntensity={emissive ? 0.7 : 0} />
    </mesh>
  );
}

/** Flat pillar/panel — factory pipes, neon signage, temple columns, sky pillars. */
function Panel({ pos, scale = 1, color = "#4a5057", emissive, height = 1.6, width = 0.3 }) {
  return (
    <mesh position={[pos[0], pos[1] + height / 2, pos[2]]} scale={scale} castShadow>
      <boxGeometry args={[width, height, width]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} emissive={emissive || "#000000"} emissiveIntensity={emissive ? 0.8 : 0} />
    </mesh>
  );
}

const DECOR_COMPONENTS = { tree: Tree, flower: Flower, rock: Rock, cloud: Cloud, spike: Spike, panel: Panel };

function Mountains({ center = [0, 0, 0], color = "#7fa88f", radius = 110, count = 14, shape = "cone" }) {
  const items = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 2) * 0.15;
      const r = radius + (i % 3) * 12;
      const h = shape === "dune" ? 10 + ((i * 37) % 8) : shape === "spire" ? 36 + ((i * 37) % 26) : 26 + ((i * 37) % 20);
      arr.push({
        pos: [center[0] + Math.cos(a) * r, -6, center[2] + Math.sin(a) * r],
        h,
        w: shape === "spire" ? 6 + (i % 3) * 2 : shape === "dune" ? 22 + (i % 4) * 8 : 16 + (i % 4) * 6,
      });
    }
    return arr;
  }, [center[0], center[2], radius, count, shape]);

  return (
    <group>
      {items.map((m, i) => (
        <mesh key={i} position={[m.pos[0], m.pos[1] + m.h / 2, m.pos[2]]}>
          {shape === "box"
            ? <boxGeometry args={[m.w * 0.7, m.h, m.w * 0.7]} />
            : <coneGeometry args={[m.w, m.h, shape === "spire" ? 4 : 5]} />}
          <meshStandardMaterial color={color} roughness={1} fog />
        </mesh>
      ))}
    </group>
  );
}

export default function Scenery({ decorations, mountainCenter, mountainColor, mountainShape }) {
  return (
    <group>
      <Mountains center={mountainCenter} color={mountainColor} shape={mountainShape} />
      {decorations.map((d, i) => {
        const Cmp = DECOR_COMPONENTS[d.type];
        if (!Cmp) return null;
        return <Cmp key={i} {...d} />;
      })}
    </group>
  );
}
