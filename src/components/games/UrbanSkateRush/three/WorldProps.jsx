/**
 * Urban Skate Rush — World Props & NPCs
 *
 * Pedestrians, vehicles, vegetation, and environmental details.
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ============================================================
// Pedestrian / NPC
// ============================================================

export function Pedestrian({ position, rotation = 0, variant = 0, walking = false }) {
  const groupRef = useRef();
  const animRef = useRef({ phase: Math.random() * Math.PI * 2 });

  // Randomized appearance based on variant
  const colors = useMemo(() => {
    const skinTones = [0xe8b89d, 0xd4a574, 0xc68642, 0x8d5524, 0xf5d0c5];
    const shirtColors = [0x2d4a6d, 0x6d2d4a, 0x4a6d2d, 0x4a2d6d, 0x6d4a2d, 0x333333, 0xffffff, 0xcc3333, 0x3333cc];
    const pantsColors = [0x1a1a2e, 0x2e1a1a, 0x1a2e1a, 0x2d2d2d, 0x4a4a4a, 0x1e3a5f];
    const hairColors = [0x1a1a1a, 0x3a2a1a, 0x8b4513, 0xd4a574, 0x2a1a1a, 0x4a3728];

    const v = variant % 100;
    return {
      skin: skinTones[v % skinTones.length],
      shirt: shirtColors[(v * 3) % shirtColors.length],
      pants: pantsColors[(v * 7) % pantsColors.length],
      hair: hairColors[(v * 11) % hairColors.length],
      hasHat: v % 4 === 0,
      hatColor: shirtColors[(v * 5) % shirtColors.length],
      isFemale: v % 2 === 1,
    };
  }, [variant]);

  useFrame((state) => {
    if (!groupRef.current) return;
    animRef.current.phase += 0.02;

    if (walking) {
      // Subtle idle animation
      const breathe = Math.sin(animRef.current.phase) * 0.01;
      groupRef.current.position.y = position[1] + breathe;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      {/* Legs */}
      <mesh position={[-0.06, 0.35, 0]}>
        <capsuleGeometry args={[0.045, 0.4, 4, 8]} />
        <meshStandardMaterial color={colors.pants} roughness={0.8} />
      </mesh>
      <mesh position={[0.06, 0.35, 0]}>
        <capsuleGeometry args={[0.045, 0.4, 4, 8]} />
        <meshStandardMaterial color={colors.pants} roughness={0.8} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.06, 0.08, 0.02]}>
        <boxGeometry args={[0.07, 0.06, 0.12]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} />
      </mesh>
      <mesh position={[0.06, 0.08, 0.02]}>
        <boxGeometry args={[0.07, 0.06, 0.12]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.85, 0]}>
        <capsuleGeometry args={[colors.isFemale ? 0.09 : 0.1, 0.3, 4, 8]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.16, 0.8, 0]} rotation={[0, 0, 0.15]}>
        <capsuleGeometry args={[0.035, 0.3, 4, 8]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>
      <mesh position={[0.16, 0.8, 0]} rotation={[0, 0, -0.15]}>
        <capsuleGeometry args={[0.035, 0.3, 4, 8]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.7} />
      </mesh>

      {/* Hands */}
      <mesh position={[-0.18, 0.55, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={colors.skin} roughness={0.6} />
      </mesh>
      <mesh position={[0.18, 0.55, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={colors.skin} roughness={0.6} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.08, 8]} />
        <meshStandardMaterial color={colors.skin} roughness={0.6} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color={colors.skin} roughness={0.6} />
      </mesh>

      {/* Hair */}
      {!colors.hasHat && (
        <mesh position={[0, 1.28, -0.01]}>
          <sphereGeometry args={[0.092, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial color={colors.hair} roughness={0.9} />
        </mesh>
      )}

      {/* Hat (optional) */}
      {colors.hasHat && (
        <group position={[0, 1.28, 0]}>
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 12]} />
            <meshStandardMaterial color={colors.hatColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 12]} />
            <meshStandardMaterial color={colors.hatColor} roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* Face details */}
      <mesh position={[0, 1.18, 0.085]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color={colors.skin} roughness={0.5} />
      </mesh>
    </group>
  );
}

// ============================================================
// Walking Pedestrian (animated)
// ============================================================

export function WalkingPedestrian({ path, speed = 0.5, variant = 0 }) {
  const groupRef = useRef();
  const progressRef = useRef(Math.random());

  useFrame((_, delta) => {
    if (!groupRef.current || !path || path.length < 2) return;

    progressRef.current += delta * speed * 0.1;
    if (progressRef.current > 1) progressRef.current = 0;

    const totalLength = path.length - 1;
    const currentSegment = Math.floor(progressRef.current * totalLength);
    const segmentProgress = (progressRef.current * totalLength) % 1;

    const p1 = path[currentSegment];
    const p2 = path[(currentSegment + 1) % path.length];

    const x = p1[0] + (p2[0] - p1[0]) * segmentProgress;
    const z = p1[1] + (p2[1] - p1[1]) * segmentProgress;

    groupRef.current.position.x = x;
    groupRef.current.position.z = z;

    // Face direction of movement
    const angle = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
    groupRef.current.rotation.y = angle;
  });

  return (
    <group ref={groupRef}>
      <Pedestrian position={[0, 0, 0]} variant={variant} walking />
    </group>
  );
}

// ============================================================
// Crowd (group of standing pedestrians)
// ============================================================

export function Crowd({ position, count = 5, radius = 3 }) {
  const pedestrians = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = radius * 0.3 + Math.random() * radius * 0.7;
      arr.push({
        x: Math.sin(angle) * dist,
        z: Math.cos(angle) * dist,
        rotation: Math.random() * Math.PI * 2,
        variant: Math.floor(Math.random() * 100),
      });
    }
    return arr;
  }, [count, radius]);

  return (
    <group position={position}>
      {pedestrians.map((p, i) => (
        <Pedestrian
          key={i}
          position={[p.x, 0, p.z]}
          rotation={p.rotation}
          variant={p.variant}
        />
      ))}
    </group>
  );
}

// ============================================================
// Parked Car
// ============================================================

export function Car({ position, rotation = 0, color = 0x3366cc }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.8, 0.5, 4]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 0.9, -0.3]} castShadow>
        <boxGeometry args={[1.6, 0.5, 2]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Windows */}
      <mesh position={[0, 0.9, -0.3]}>
        <boxGeometry args={[1.55, 0.4, 1.9]} />
        <meshStandardMaterial color={0x1a2a3a} metalness={0.8} roughness={0.1} />
      </mesh>

      {/* Wheels */}
      {[
        [-0.8, 0.25, 1.3],
        [0.8, 0.25, 1.3],
        [-0.8, 0.25, -1.3],
        [0.8, 0.25, -1.3],
      ].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 16]} />
          <meshStandardMaterial color={0x1a1a1a} roughness={0.8} />
        </mesh>
      ))}

      {/* Headlights */}
      <mesh position={[-0.6, 0.5, 2]}>
        <boxGeometry args={[0.3, 0.15, 0.05]} />
        <meshStandardMaterial color={0xffffcc} emissive={0xffffcc} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.6, 0.5, 2]}>
        <boxGeometry args={[0.3, 0.15, 0.05]} />
        <meshStandardMaterial color={0xffffcc} emissive={0xffffcc} emissiveIntensity={0.3} />
      </mesh>

      {/* Taillights */}
      <mesh position={[-0.7, 0.5, -2]}>
        <boxGeometry args={[0.2, 0.1, 0.05]} />
        <meshStandardMaterial color={0xff0000} emissive={0xff0000} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.7, 0.5, -2]}>
        <boxGeometry args={[0.2, 0.1, 0.05]} />
        <meshStandardMaterial color={0xff0000} emissive={0xff0000} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// ============================================================
// Van / Delivery Vehicle
// ============================================================

export function Van({ position, rotation = 0, color = 0xffffff }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[2, 1.4, 4.5]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 0.7, 2.5]} castShadow>
        <boxGeometry args={[1.9, 1.2, 1]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Windshield */}
      <mesh position={[0, 0.85, 2.95]}>
        <boxGeometry args={[1.6, 0.7, 0.05]} />
        <meshStandardMaterial color={0x1a2a3a} metalness={0.8} roughness={0.1} />
      </mesh>

      {/* Wheels */}
      {[
        [-0.9, 0.3, 1.8],
        [0.9, 0.3, 1.8],
        [-0.9, 0.3, -1.5],
        [0.9, 0.3, -1.5],
      ].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.25, 16]} />
          <meshStandardMaterial color={0x1a1a1a} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Bicycle (parked)
// ============================================================

export function Bicycle({ position, rotation = 0, color = 0x3366cc }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Frame */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 8]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.5, -0.2]} rotation={[Math.PI / 4, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Wheels */}
      <mesh position={[0, 0.3, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.02, 8, 24]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.02, 8, 24]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.8} />
      </mesh>

      {/* Seat */}
      <mesh position={[0, 0.75, -0.1]}>
        <boxGeometry args={[0.1, 0.03, 0.2]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} />
      </mesh>

      {/* Handlebars */}
      <mesh position={[0, 0.7, 0.35]}>
        <boxGeometry args={[0.35, 0.02, 0.02]} />
        <meshStandardMaterial color={0x333333} metalness={0.6} />
      </mesh>
    </group>
  );
}

// ============================================================
// Bush / Shrub
// ============================================================

export function Bush({ position, scale = 1, color = 0x2d5a27 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3 * scale, 0]} castShadow>
        <sphereGeometry args={[0.5 * scale, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0.2 * scale, 0.25 * scale, 0.2 * scale]} castShadow>
        <sphereGeometry args={[0.35 * scale, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[-0.2 * scale, 0.25 * scale, -0.1 * scale]} castShadow>
        <sphereGeometry args={[0.3 * scale, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ============================================================
// Flower Bed
// ============================================================

export function FlowerBed({ position, size = [2, 3] }) {
  const flowers = useMemo(() => {
    const arr = [];
    const flowerColors = [0xff6b6b, 0xffd93d, 0xff6bff, 0x6b6bff, 0xffffff, 0xff8c00];
    for (let i = 0; i < 15; i++) {
      arr.push({
        x: (Math.random() - 0.5) * size[0] * 0.8,
        z: (Math.random() - 0.5) * size[1] * 0.8,
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        scale: 0.5 + Math.random() * 0.5,
      });
    }
    return arr;
  }, [size]);

  return (
    <group position={position}>
      {/* Soil bed */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[size[0], 0.1, size[1]]} />
        <meshStandardMaterial color={0x3a2a1a} roughness={1} />
      </mesh>

      {/* Border */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[size[0] + 0.1, 0.1, size[1] + 0.1]} />
        <meshStandardMaterial color={0x5a4a3a} roughness={0.9} />
      </mesh>

      {/* Flowers */}
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0.15, f.z]}>
          {/* Stem */}
          <mesh position={[0, 0.1 * f.scale, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2 * f.scale, 6]} />
            <meshStandardMaterial color={0x228b22} roughness={0.8} />
          </mesh>
          {/* Flower head */}
          <mesh position={[0, 0.22 * f.scale, 0]}>
            <sphereGeometry args={[0.04 * f.scale, 8, 8]} />
            <meshStandardMaterial color={f.color} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ============================================================
// Street Vendor / Food Cart
// ============================================================

export function FoodCart({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Cart body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.2, 0.8, 2]} />
        <meshStandardMaterial color={0xcc4444} roughness={0.7} />
      </mesh>

      {/* Counter */}
      <mesh position={[0, 1.05, 0.3]}>
        <boxGeometry args={[1.3, 0.1, 0.8]} />
        <meshStandardMaterial color={0x888888} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Umbrella pole */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
        <meshStandardMaterial color={0x666666} metalness={0.6} />
      </mesh>

      {/* Umbrella */}
      <mesh position={[0, 2.2, 0]}>
        <coneGeometry args={[1, 0.4, 8, 1, true]} />
        <meshStandardMaterial color={0xffcc00} side={THREE.DoubleSide} />
      </mesh>

      {/* Wheels */}
      {[
        [-0.5, 0.15, -0.8],
        [0.5, 0.15, -0.8],
      ].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 12]} />
          <meshStandardMaterial color={0x1a1a1a} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Pigeon / Bird
// ============================================================

export function Bird({ position, variant = 0 }) {
  const groupRef = useRef();
  const animRef = useRef({ phase: Math.random() * Math.PI * 2 });

  useFrame(() => {
    if (!groupRef.current) return;
    animRef.current.phase += 0.05;

    // Pecking animation
    const peck = Math.sin(animRef.current.phase * 3) * 0.1;
    groupRef.current.rotation.x = peck > 0 ? peck : 0;
  });

  const color = variant % 2 === 0 ? 0x666666 : 0x8b7355;

  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.1, 0.07]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Beak */}
      <mesh position={[0, 0.09, 0.1]} rotation={[0.3, 0, 0]}>
        <coneGeometry args={[0.01, 0.025, 4]} />
        <meshStandardMaterial color={0xffaa00} roughness={0.6} />
      </mesh>

      {/* Tail */}
      <mesh position={[0, 0.07, -0.08]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.02, 0.01, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ============================================================
// Dog (with owner placeholder)
// ============================================================

export function Dog({ position, rotation = 0, color = 0x8b4513 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body */}
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.22, 0.18]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>

      {/* Snout */}
      <mesh position={[0, 0.2, 0.25]}>
        <boxGeometry args={[0.05, 0.04, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>

      {/* Ears */}
      <mesh position={[-0.05, 0.28, 0.15]}>
        <boxGeometry args={[0.02, 0.05, 0.03]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0.05, 0.28, 0.15]}>
        <boxGeometry args={[0.02, 0.05, 0.03]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>

      {/* Legs */}
      {[
        [-0.05, 0.08, 0.1],
        [0.05, 0.08, 0.1],
        [-0.05, 0.08, -0.1],
        [0.05, 0.08, -0.1],
      ].map((pos, i) => (
        <mesh key={i} position={pos}>
          <cylinderGeometry args={[0.02, 0.02, 0.16, 6]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}

      {/* Tail */}
      <mesh position={[0, 0.25, -0.18]} rotation={[0.5, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.01, 0.12, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ============================================================
// Lamp Post with Banner
// ============================================================

export function LampPostWithBanner({ position, bannerText = "", bannerColor = 0xff6b35 }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 5, 8]} />
        <meshStandardMaterial color={0x333333} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Lamp arm */}
      <mesh position={[0.4, 4.8, 0]} rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshStandardMaterial color={0x333333} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Lamp */}
      <mesh position={[0.7, 4.7, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.25]} />
        <meshStandardMaterial color={0x222222} />
      </mesh>
      <pointLight position={[0.7, 4.5, 0]} color={0xfff5cc} intensity={0.4} distance={12} />

      {/* Banner */}
      <mesh position={[0.3, 3.5, 0]}>
        <boxGeometry args={[0.6, 1, 0.02]} />
        <meshStandardMaterial color={bannerColor} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ============================================================
// Newspaper Stand
// ============================================================

export function NewspaperStand({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.8, 1.2, 0.5]} />
        <meshStandardMaterial color={0x2a6a2a} roughness={0.7} />
      </mesh>
      {/* Display window */}
      <mesh position={[0, 0.7, 0.26]}>
        <boxGeometry args={[0.6, 0.5, 0.02]} />
        <meshStandardMaterial color={0xffffff} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ============================================================
// ATM Machine
// ============================================================

export function ATM({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.6, 1.5, 0.5]} />
        <meshStandardMaterial color={0x1a4a8a} roughness={0.6} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0.9, 0.26]}>
        <boxGeometry args={[0.35, 0.25, 0.02]} />
        <meshStandardMaterial color={0x40c4ff} emissive={0x40c4ff} emissiveIntensity={0.3} />
      </mesh>
      {/* Keypad */}
      <mesh position={[0, 0.55, 0.26]}>
        <boxGeometry args={[0.2, 0.15, 0.02]} />
        <meshStandardMaterial color={0x888888} metalness={0.5} />
      </mesh>
    </group>
  );
}
