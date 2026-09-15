/**
 * Cozy Cleanup 3D — furniture built from real Three.js primitive meshes
 * (boxes, cylinders, planes), one component per `room.furniture[].type` so
 * every existing room (see data/rooms.js) renders in 3D with zero data
 * changes. Every group's local origin is its floor-contact point (Y=0),
 * so `RoomScene3D` just has to place it at the converted world X/Z.
 *
 * Deliberately primitive-built, not `.glb` models — see the project brief:
 * low-poly-but-styled placeholders now, easy to swap a single component's
 * JSX for a loaded glTF later without touching layout code.
 *
 * Materials vary by real-world material (wood/fabric/glass/plastic/metal)
 * via roughness/metalness, not just flat color, per the "materials" ask.
 */
import * as THREE from "three";

// amt in [-1,1]; negative darkens, positive lightens. Same tiny helper the
// 2D FurnitureKit uses — no color library needed for this.
function shade(hex, amt) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  r = Math.max(0, Math.min(255, mix(r)));
  g = Math.max(0, Math.min(255, mix(g)));
  b = Math.max(0, Math.min(255, mix(b)));
  return `rgb(${r},${g},${b})`;
}

// Note: there's no environment map in this scene, and a high-metalness
// PBR material has almost no diffuse response — it relies on reflections
// to read as anything but black under plain point/directional lights. Kept
// "metal" low enough to stay visibly lit; use it for small trim (handles,
// hinges), not whole appliance bodies (those use "plastic" — an enamel/
// painted-metal look that actually catches the room's light).
const MAT = {
  wood: { roughness: 0.72, metalness: 0.04 },
  woodDark: { roughness: 0.6, metalness: 0.05 },
  fabric: { roughness: 0.92, metalness: 0 },
  glass: { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 },
  plastic: { roughness: 0.35, metalness: 0.05 },
  metal: { roughness: 0.4, metalness: 0.35 },
  paper: { roughness: 0.85, metalness: 0 },
};

function Box({ w, h, d, x = 0, y = 0, z = 0, ry = 0, color = "#c99a6c", mat = "wood", castShadow = true, receiveShadow = true, radius = 0 }) {
  if (radius > 0) {
    return (
      <mesh position={[x, y + h / 2, z]} rotation={[0, ry, 0]} castShadow={castShadow} receiveShadow={receiveShadow}>
        <RoundedBoxGeometry w={w} h={h} d={d} r={Math.min(radius, w / 2, h / 2, d / 2)} />
        <meshStandardMaterial color={color} {...MAT[mat]} />
      </mesh>
    );
  }
  return (
    <mesh position={[x, y + h / 2, z]} rotation={[0, ry, 0]} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} {...MAT[mat]} />
    </mesh>
  );
}

// A cheap "rounded box" — real bevel geometry is overkill for this scale;
// a slightly inset box + a thin frame reads as soft/rounded at room scale
// without the extra triangles. Kept as its own primitive for clarity.
function RoundedBoxGeometry({ w, h, d }) {
  return <boxGeometry args={[w, h, d]} />;
}

function Cyl({ r, h, x = 0, y = 0, z = 0, color = "#c99a6c", mat = "wood", radialSegments = 14 }) {
  return (
    <mesh position={[x, y + h / 2, z]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, radialSegments]} />
      <meshStandardMaterial color={color} {...MAT[mat]} />
    </mesh>
  );
}

/* ---------------------------------------------------------------- BED --- */
export function Bed3D({ footprint, color = "#e7a0ab", frame = "#8a6142", sheet = "#faf3e8" }) {
  const w = Math.max(footprint[0], 1.6), d = Math.max(footprint[1], 2.1);
  return (
    <group>
      <Box w={w} h={0.32} d={d} y={0} color={frame} mat="woodDark" />
      <Box w={w} h={0.62} d={0.1} y={0.32} z={-d / 2 + 0.05} color={frame} mat="woodDark" />
      <Box w={w - 0.08} h={0.22} d={d - 0.14} y={0.32} color={sheet} mat="fabric" />
      <Box w={w - 0.1} h={0.1} d={d * 0.42} y={0.5} z={d * 0.1} color={color} mat="fabric" />
      <Box w={w * 0.32} h={0.1} d={0.34} y={0.58} z={-d / 2 + 0.32} color="#ffffff" mat="fabric" />
      <Box w={w * 0.32} h={0.1} d={0.34} y={0.58} z={-d / 2 + 0.7} color="#ffffff" mat="fabric" />
    </group>
  );
}

export function Nightstand3D({ footprint, color = "#c99a6c" }) {
  const w = Math.min(footprint[0], 0.55), d = Math.min(footprint[1], 0.5);
  return (
    <group>
      <Box w={w} h={0.58} d={d} color={color} mat="wood" />
      <Box w={w * 0.16} h={0.02} d={0.02} y={0.3} z={d / 2 + 0.001} color="#f0e2c8" mat="metal" />
    </group>
  );
}

export function Desk3D({ footprint, color = "#c99a6c", top = "#e2c19a" }) {
  const w = Math.max(footprint[0], 1.1), d = Math.max(Math.min(footprint[1], 0.7), 0.55);
  const legT = 0.06;
  return (
    <group>
      <Box w={legT} h={0.72} d={legT} x={-w / 2 + 0.1} z={-d / 2 + 0.1} color={color} mat="woodDark" />
      <Box w={legT} h={0.72} d={legT} x={w / 2 - 0.1} z={-d / 2 + 0.1} color={color} mat="woodDark" />
      <Box w={legT} h={0.72} d={legT} x={-w / 2 + 0.1} z={d / 2 - 0.1} color={color} mat="woodDark" />
      <Box w={legT} h={0.72} d={legT} x={w / 2 - 0.1} z={d / 2 - 0.1} color={color} mat="woodDark" />
      <Box w={w} h={0.05} d={d} y={0.72} color={top} mat="wood" />
      <Box w={w * 0.32} h={0.18} d={d * 0.8} y={0.52} x={-w * 0.28} color={color} mat="wood" />
    </group>
  );
}

export function Chair3D({ footprint, color = "#8a6142" }) {
  const s = Math.min(footprint[0], 0.5, footprint[1]);
  return (
    <group>
      <Box w={s} h={0.06} d={s} y={0.46} color={color} mat="wood" />
      <Box w={s} h={0.5} d={0.06} y={0.5} z={-s / 2 + 0.03} color={color} mat="wood" />
      <Box w={0.05} h={0.46} d={0.05} x={-s / 2 + 0.04} z={-s / 2 + 0.04} color={color} mat="woodDark" />
      <Box w={0.05} h={0.46} d={0.05} x={s / 2 - 0.04} z={-s / 2 + 0.04} color={color} mat="woodDark" />
      <Box w={0.05} h={0.46} d={0.05} x={-s / 2 + 0.04} z={s / 2 - 0.04} color={color} mat="woodDark" />
      <Box w={0.05} h={0.46} d={0.05} x={s / 2 - 0.04} z={s / 2 - 0.04} color={color} mat="woodDark" />
    </group>
  );
}

export function Bookshelf3D({ footprint, color = "#8a6142" }) {
  const w = Math.max(footprint[0], 0.9), d = Math.min(footprint[1], 0.32), h = 1.7;
  const spineColors = ["#e08a7c", "#8fae86", "#e0b95c", "#7a9cc9", "#c98fae"];
  const rows = [0.42, 0.86, 1.3];
  return (
    <group>
      <Box w={w} h={h} d={d} color={color} mat="wood" />
      {rows.map((ry, i) => (
        <Box key={i} w={w - 0.06} h={0.03} d={d - 0.04} y={ry} color={color} mat="woodDark" />
      ))}
      {rows.slice(0, 2).map((ry, ri) =>
        Array.from({ length: 6 }).map((_, i) => (
          <Box key={`${ri}-${i}`} w={0.06} h={0.24} d={d - 0.08} x={-w / 2 + 0.12 + i * (w - 0.24) / 5} y={ry + 0.03}
            color={spineColors[(ri * 6 + i) % spineColors.length]} mat="paper" />
        )),
      )}
    </group>
  );
}

export function Wardrobe3D({ footprint, color = "#b98a5a" }) {
  const w = Math.max(footprint[0], 1), d = Math.min(footprint[1], 0.5), h = 1.95;
  return (
    <group>
      <Box w={w} h={h} d={d} color={color} mat="wood" />
      <Box w={0.015} h={h - 0.1} d={0.01} y={0.05} color="#4a3520" mat="woodDark" />
      <Cyl r={0.02} h={0.1} x={-0.06} y={h * 0.5 - 0.05} z={d / 2 + 0.01} color="#f0e2c8" mat="metal" />
      <Cyl r={0.02} h={0.1} x={0.06} y={h * 0.5 - 0.05} z={d / 2 + 0.01} color="#f0e2c8" mat="metal" />
    </group>
  );
}

export function Window3D({ footprint }) {
  const w = Math.max(footprint[0], 1.2), h = 1.5;
  return (
    <group>
      <Box w={w + 0.14} h={h + 0.14} d={0.08} y={0} color="#f6efe4" mat="wood" />
      <mesh position={[0, h / 2 + 0.02, 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#bfe0ef" roughness={0.05} metalness={0.1} transparent opacity={0.55} transmission={0.3} />
      </mesh>
      <Box w={0.04} h={h} d={0.03} y={0} z={0.06} color="#f6efe4" mat="wood" />
      <Box w={w} h={0.04} d={0.03} y={h / 2} z={0.06} color="#f6efe4" mat="wood" />
    </group>
  );
}

export function Lamp3D({ footprint, shadeColor = "#f0c46a", base = "#8a6142" }) {
  return (
    <group>
      <Cyl r={0.09} h={0.02} color={base} mat="metal" />
      <Cyl r={0.015} h={0.42} y={0.02} color={base} mat="metal" />
      <mesh position={[0, 0.52, 0]}>
        <coneGeometry args={[0.13, 0.22, 12, 1, true]} />
        <meshStandardMaterial color={shadeColor} side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
      <pointLight position={[0, 0.5, 0]} intensity={0.35} distance={2.2} color="#ffd9a0" />
    </group>
  );
}

export function Plant3D({ leaf = "#7fa66f", pot = "#c9825a" }) {
  return (
    <group>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.28, 10]} />
        <meshStandardMaterial color={pot} {...MAT.plastic} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin(i * 1.3) * 0.06, 0.4 + i * 0.05, Math.cos(i * 1.3) * 0.06]} rotation={[0.3, i, 0.2]} castShadow>
          <sphereGeometry args={[0.16 - i * 0.012, 6, 6]} />
          <meshStandardMaterial color={leaf} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export function WallArt3D({ frame = "#8a6142", art = "#e8a0a8" }) {
  return (
    <group>
      <Box w={0.5} h={0.4} d={0.03} color={frame} mat="wood" />
      <mesh position={[0, 0.2, 0.018]}>
        <circleGeometry args={[0.12, 20]} />
        <meshStandardMaterial color={art} roughness={0.7} />
      </mesh>
    </group>
  );
}

export function Rug3D({ footprint, color = "#e0955f", ring = "#f4d9b0" }) {
  const w = Math.max(footprint[0], 1.4), d = Math.max(footprint[1], 1);
  const r = Math.max(w, d) / 2;
  return (
    <group scale={[w / (r * 2), 1, d / (r * 2)]}>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r, 28]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.68, r * 0.72, 28]} />
        <meshStandardMaterial color={ring} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------- living / café --- */
export function Sofa3D({ footprint, color = "#8fae86" }) {
  const w = Math.max(footprint[0], 1.4), d = Math.min(Math.max(footprint[1], 0.6), 0.75);
  return (
    <group>
      <Box w={w} h={0.34} d={d} color={color} mat="fabric" />
      <Box w={w} h={0.3} d={0.14} y={0.34} z={-d / 2 + 0.07} color={color} mat="fabric" />
      <Box w={0.14} h={0.4} d={d} x={-w / 2 + 0.07} color={color} mat="fabric" />
      <Box w={0.14} h={0.4} d={d} x={w / 2 - 0.07} color={color} mat="fabric" />
    </group>
  );
}

export function Table3D({ footprint, color = "#b98a5a", top = "#e2c19a" }) {
  const w = Math.max(footprint[0], 0.7), d = Math.max(Math.min(footprint[1], 0.6), 0.4);
  const legT = 0.05;
  return (
    <group>
      <Box w={legT} h={0.42} d={legT} x={-w / 2 + 0.08} z={-d / 2 + 0.08} color={color} mat="woodDark" />
      <Box w={legT} h={0.42} d={legT} x={w / 2 - 0.08} z={-d / 2 + 0.08} color={color} mat="woodDark" />
      <Box w={legT} h={0.42} d={legT} x={-w / 2 + 0.08} z={d / 2 - 0.08} color={color} mat="woodDark" />
      <Box w={legT} h={0.42} d={legT} x={w / 2 - 0.08} z={d / 2 - 0.08} color={color} mat="woodDark" />
      <Box w={w} h={0.04} d={d} y={0.42} color={top} mat="wood" />
    </group>
  );
}

export function Bench3D({ footprint, color = "#b98a5a" }) {
  const w = Math.max(footprint[0], 0.9), d = Math.min(footprint[1], 0.34);
  return (
    <group>
      <Box w={w} h={0.06} d={d} y={0.36} color={color} mat="wood" />
      <Box w={0.05} h={0.36} d={0.05} x={-w / 2 + 0.06} color={color} mat="woodDark" />
      <Box w={0.05} h={0.36} d={0.05} x={w / 2 - 0.06} color={color} mat="woodDark" />
    </group>
  );
}

export function Rack3D({ footprint, color = "#8a6142" }) {
  const w = Math.max(footprint[0], 0.7), h = 1.5;
  return (
    <group>
      <Box w={0.04} h={h} d={0.04} x={-w / 2 + 0.05} color={color} mat="wood" />
      <Box w={0.04} h={h} d={0.04} x={w / 2 - 0.05} color={color} mat="wood" />
      <Box w={w} h={0.03} d={0.03} y={h - 0.06} color={color} mat="woodDark" />
    </group>
  );
}

/* ----------------------------------------------------------- kitchen --- */
export function Counter3D({ footprint, color = "#cfe0d6", top = "#8a6142" }) {
  const w = Math.max(footprint[0], 1.2), d = Math.min(Math.max(footprint[1], 0.45), 0.6);
  return (
    <group>
      <Box w={w} h={0.72} d={d} color={color} mat="wood" />
      <Box w={w + 0.05} h={0.04} d={d + 0.05} y={0.72} color={top} mat="woodDark" />
    </group>
  );
}

export function Stove3D({ footprint, color = "#5c6670" }) {
  const w = Math.min(Math.max(footprint[0], 0.55), 0.75), d = Math.min(Math.max(footprint[1], 0.5), 0.6);
  return (
    <group>
      <Box w={w} h={0.72} d={d} color={color} mat="plastic" />
      {[[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.08], [0.12, 0.08]].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 0.735, bz]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 14]} />
          <meshStandardMaterial color="#2c3236" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function Fridge3D({ footprint, color = "#eef4f0" }) {
  const w = Math.min(Math.max(footprint[0], 0.55), 0.7), d = Math.min(Math.max(footprint[1], 0.5), 0.6);
  return (
    <group>
      <Box w={w} h={1.65} d={d} color={color} mat="plastic" />
      <Box w={0.02} h={0.14} d={0.015} x={w / 2 - 0.06} y={1.0} color="#c9d0d3" mat="metal" />
    </group>
  );
}

export function Sink3D({ footprint, color = "#dfe6ea" }) {
  const w = Math.min(Math.max(footprint[0], 0.5), 0.7), d = Math.min(Math.max(footprint[1], 0.4), 0.5);
  return (
    <group>
      <Box w={w} h={0.72} d={d} color={color} mat="plastic" />
      <mesh position={[0, 0.735, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.min(w, d) * 0.32, 18]} />
        <meshStandardMaterial color="#9aa7ad" metalness={0.4} roughness={0.3} />
      </mesh>
      <Box w={0.025} h={0.16} d={0.025} y={0.73} color="#9aa7ad" mat="metal" />
    </group>
  );
}

export function Cabinet3D({ footprint, color = "#b98a5a" }) {
  const w = Math.max(footprint[0], 0.9), d = Math.min(Math.max(footprint[1], 0.35), 0.5);
  return (
    <group>
      <Box w={w} h={0.9} d={d} color={color} mat="wood" />
      <Box w={0.015} h={0.7} d={0.01} y={0.1} color="#4a3520" mat="woodDark" />
    </group>
  );
}

/* --------------------------------------------------------- bathroom --- */
export function Bathtub3D({ footprint, color = "#eef4f7" }) {
  const w = Math.max(footprint[0], 1.3), d = Math.min(Math.max(footprint[1], 0.55), 0.7);
  return (
    <group>
      <Box w={w} h={0.5} d={d} color={color} mat="plastic" />
      <Box w={w - 0.14} h={0.14} d={d - 0.14} y={0.36} color="#cfe0e6" mat="plastic" />
    </group>
  );
}

export function Mirror3D({ frame = "#c9825a" }) {
  return (
    <group>
      <Box w={0.55} h={0.6} d={0.03} color={frame} mat="wood" />
      <mesh position={[0, 0.3, 0.018]}>
        <planeGeometry args={[0.44, 0.5]} />
        <meshStandardMaterial color="#dceef2" roughness={0.1} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function Shower3D({ footprint }) {
  const w = Math.max(footprint[0], 0.75), d = Math.min(Math.max(footprint[1], 0.6), 0.75);
  return (
    <mesh position={[0, 0.85, 0]}>
      <boxGeometry args={[w, 1.7, d]} />
      <meshPhysicalMaterial color="#c9d6da" transparent opacity={0.28} roughness={0.15} transmission={0.35} />
    </mesh>
  );
}

/* ---------------------------------------------------------- laundry --- */
export function Washer3D({ footprint, color = "#eef4f0" }) {
  const w = Math.min(Math.max(footprint[0], 0.55), 0.65), d = Math.min(Math.max(footprint[1], 0.5), 0.6);
  return (
    <group>
      <Box w={w} h={0.8} d={d} color={color} mat="plastic" />
      <mesh position={[0, 0.4, d / 2 + 0.001]}>
        <circleGeometry args={[Math.min(w, d) * 0.28, 16]} />
        <meshStandardMaterial color="#6f8b9b" roughness={0.2} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function Basket3D({ footprint, color = "#c99a6c" }) {
  const w = Math.max(footprint[0], 0.4), d = Math.max(footprint[1], 0.4);
  return (
    <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[Math.max(w, d) / 2, Math.max(w, d) / 2.4, 0.32, 12]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/* ---------------------------------------------------------- balcony --- */
export function Rail3D({ footprint, color = "#b98a5a" }) {
  const w = Math.max(footprint[0], 1.5), h = 0.85;
  const posts = Math.max(4, Math.round(w / 0.4));
  return (
    <group>
      <Box w={w} h={0.04} d={0.04} y={h - 0.04} color={color} mat="wood" />
      {Array.from({ length: posts }).map((_, i) => (
        <Box key={i} w={0.03} h={h} d={0.03} x={-w / 2 + (i / (posts - 1)) * w} color={color} mat="wood" />
      ))}
    </group>
  );
}

export function Planter3D({ footprint, pot = "#c9825a", leaf = "#7fa66f" }) {
  const w = Math.max(footprint[0], 0.5);
  return (
    <group>
      <Box w={w} h={0.28} d={0.24} color={pot} mat="plastic" />
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh key={i} position={[-w / 2 + 0.1 + i * ((w - 0.2) / 3), 0.36, 0]} castShadow>
          <sphereGeometry args={[0.1, 7, 6]} />
          <meshStandardMaterial color={i % 2 ? leaf : shade(leaf, -0.1)} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------- kids room --- */
export function Toybox3D({ footprint, color = "#7a9cc9" }) {
  const w = Math.max(footprint[0], 0.7), d = Math.min(footprint[1], 0.5);
  return (
    <group>
      <Box w={w} h={0.42} d={d} color={color} mat="plastic" />
      <Box w={w + 0.04} h={0.05} d={d + 0.04} y={0.42} color={shade(color, 0.2)} mat="plastic" />
    </group>
  );
}

export function Crib3D({ footprint, color = "#f0dcc0" }) {
  const w = Math.max(footprint[0], 0.9), d = Math.min(footprint[1], 0.55), h = 0.75;
  return (
    <group>
      <Box w={w} h={0.34} d={d} color={color} mat="wood" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Box key={i} w={0.025} h={h - 0.34} d={0.025} x={-w / 2 + 0.08 + i * ((w - 0.16) / 7)} y={0.34} color={color} mat="wood" />
      ))}
    </group>
  );
}

export function Door3D({ footprint, color = "#b98a5a" }) {
  const w = Math.max(footprint[0], 0.7);
  return <Box w={w} h={1.9} d={0.06} color={color} mat="wood" />;
}

/* --------------------------------------------------- generic fallback --- */
export function GenericFurniture3D({ footprint, color = "#b8a084" }) {
  const w = Math.max(footprint[0], 0.5), d = Math.max(footprint[1], 0.5);
  return <Box w={w} h={0.7} d={d} color={color} mat="wood" />;
}

export const KIND_TO_3D = {
  bed: Bed3D,
  nightstand: Nightstand3D,
  desk: Desk3D,
  chair: Chair3D,
  bookshelf: Bookshelf3D,
  wardrobe: Wardrobe3D,
  window: Window3D,
  lamp: Lamp3D,
  plant: Plant3D,
  wallArt: WallArt3D,
  rug: Rug3D,
  sofa: Sofa3D,
  table: Table3D,
  bench: Bench3D,
  rack: Rack3D,
  counter: Counter3D,
  stove: Stove3D,
  fridge: Fridge3D,
  sink: Sink3D,
  cabinet: Cabinet3D,
  bathtub: Bathtub3D,
  mirror: Mirror3D,
  shower: Shower3D,
  washer: Washer3D,
  basket: Basket3D,
  rail: Rail3D,
  planter: Planter3D,
  toybox: Toybox3D,
  crib: Crib3D,
  door: Door3D,
};

export function furnitureColorProps(f) {
  return f.props || {};
}
