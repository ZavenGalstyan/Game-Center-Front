/**
 * Urban Skate Rush — Enhanced 3D Environment Components
 *
 * High-quality procedural city environment with realistic lighting.
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Deterministic pseudo-random so re-renders never re-roll scenery.
function rand(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ============================================================
// Realistic Sky Dome with Atmospheric Scattering
// ============================================================

export function Sky({ topColor = 0x87ceeb, bottomColor = 0xffffff, sunPosition = [50, 80, 30], theme = "downtown" }) {
  const uniforms = useMemo(() => {
    // Adjust sky colors based on theme
    let top = new THREE.Color(topColor);
    let bottom = new THREE.Color(bottomColor);
    let sunDir = new THREE.Vector3(...sunPosition).normalize();

    if (theme === "neon") {
      top = new THREE.Color(0x0a0a1a);
      bottom = new THREE.Color(0x1a1a3e);
    } else if (theme === "industrial") {
      top = new THREE.Color(0x6a7a8a);
      bottom = new THREE.Color(0x9aa0a6);
    } else if (theme === "beach") {
      top = new THREE.Color(0x40c4ff);
      bottom = new THREE.Color(0xe0f7fa);
    }

    return {
      topColor: { value: top },
      bottomColor: { value: bottom },
      sunDirection: { value: sunDir },
      sunColor: { value: new THREE.Color(0xfff5e6) },
      offset: { value: 20 },
      exponent: { value: 0.5 },
    };
  }, [topColor, bottomColor, sunPosition, theme]);

  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vSunDirection;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;

    void main() {
      vec3 direction = normalize(vWorldPosition + offset);
      float h = direction.y;

      // Base sky gradient
      vec3 skyColor = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));

      // Sun glow effect
      float sunDot = max(dot(direction, sunDirection), 0.0);
      float sunGlow = pow(sunDot, 32.0) * 0.5;
      float sunDisc = pow(sunDot, 256.0) * 2.0;

      // Horizon haze
      float horizonGlow = pow(1.0 - abs(h), 8.0) * 0.3;

      // Combine effects
      vec3 finalColor = skyColor;
      finalColor += sunColor * sunGlow;
      finalColor += sunColor * sunDisc;
      finalColor += bottomColor * horizonGlow;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return (
    <mesh>
      <sphereGeometry args={[500, 32, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================================================
// Realistic Sun with Corona and Rays
// ============================================================

export function Sun({ position = [50, 80, 30], color = 0xfff5e6, intensity = 1.2 }) {
  const coronaRef = useRef();

  useFrame((state) => {
    if (coronaRef.current) {
      coronaRef.current.rotation.z = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Sun core */}
      <mesh>
        <sphereGeometry args={[4, 12, 12]} />
        <meshBasicMaterial color={0xffffff} fog={false} />
      </mesh>

      {/* Single soft halo (perf: was 4 stacked transparent spheres) */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[8, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

// ============================================================
// Cloud Layer (for realism)
// ============================================================

export function Clouds({ count = 15, theme = "downtown" }) {
  if (theme === "neon") return null; // No clouds at night

  const clouds = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: (rand(i * 4 + 1) - 0.5) * 400,
        y: 80 + rand(i * 4 + 2) * 40,
        z: (rand(i * 4 + 3) - 0.5) * 400,
        scale: 5 + rand(i * 4 + 4) * 10,
        opacity: 0.3 + rand(i * 4 + 5) * 0.3,
      });
    }
    return arr;
  }, [count]);

  return (
    <group>
      {clouds.map((cloud, i) => (
        <mesh key={i} position={[cloud.x, cloud.y, cloud.z]}>
          <sphereGeometry args={[cloud.scale, 6, 5]} />
          <meshBasicMaterial color={0xffffff} transparent opacity={cloud.opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Enhanced Ground with Realistic Materials
// ============================================================

export function EnhancedGround({ grounds, districtTheme = "downtown" }) {
  const groundMaterials = {
    downtown: {
      road: { color: 0x2a2a2a, roughness: 0.85, metalness: 0.05 },
      sidewalk: { color: 0x5a5a5a, roughness: 0.95, metalness: 0.0 },
      marking: 0xeeeeee,
    },
    industrial: {
      road: { color: 0x252525, roughness: 0.9, metalness: 0.1 },
      sidewalk: { color: 0x484848, roughness: 0.95, metalness: 0.05 },
      marking: 0xcccccc,
    },
    beach: {
      road: { color: 0x4a4a4a, roughness: 0.8, metalness: 0.0 },
      sidewalk: { color: 0xc4b49a, roughness: 0.98, metalness: 0.0 },
      sand: { color: 0xe8d8b4, roughness: 1.0, metalness: 0.0 },
      marking: 0xffffff,
    },
    neon: {
      road: { color: 0x1a1a2e, roughness: 0.7, metalness: 0.15 },
      sidewalk: { color: 0x2a2a4e, roughness: 0.8, metalness: 0.1 },
      marking: 0x00ffff,
    },
    mega: {
      road: { color: 0x252535, roughness: 0.75, metalness: 0.1 },
      sidewalk: { color: 0x353545, roughness: 0.85, metalness: 0.05 },
      marking: 0xff6b35,
    },
  };

  const materials = groundMaterials[districtTheme] || groundMaterials.downtown;

  return (
    <group>
      {grounds.map((g, i) => {
        const width = g.maxX - g.minX;
        const depth = g.maxZ - g.minZ;
        const isSidewalk = g.id?.includes("sidewalk");
        const isRamp = g.id?.includes("ramp");
        const isBeach = g.id?.includes("beach") || g.id?.includes("sand");
        const isPier = g.id?.includes("pier");
        const isSkatePark = g.id?.includes("skate") || g.id?.includes("bowl") || g.id?.includes("flow") || g.id?.includes("tech");

        let mat = materials.road;
        if (isSidewalk) mat = materials.sidewalk;
        else if (isBeach && materials.sand) mat = materials.sand;
        else if (isPier) mat = { color: 0x5a4a3a, roughness: 0.9, metalness: 0.0 };
        else if (isSkatePark) mat = { color: 0x3a3a3a, roughness: 0.6, metalness: 0.1 };
        else if (isRamp) mat = { color: 0x4a4a4a, roughness: 0.7, metalness: 0.1 };

        return (
          <group key={g.id || i}>
            {/* Main ground surface */}
            <mesh
              position={[(g.minX + g.maxX) / 2, g.y - 0.05, (g.minZ + g.maxZ) / 2]}
              receiveShadow
            >
              <boxGeometry args={[width, 0.1, depth]} />
              <meshStandardMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
              />
            </mesh>

            {/* Sidewalk curb */}
            {isSidewalk && (
              <mesh
                position={[(g.minX + g.maxX) / 2, g.y - 0.025, g.minZ - 0.05]}
              >
                <boxGeometry args={[width, 0.15, 0.1]} />
                <meshStandardMaterial color={0x6a6a6a} roughness={0.9} />
              </mesh>
            )}

          </group>
        );
      })}
    </group>
  );
}

// ============================================================
// Procedural Buildings
// ============================================================

export function Building({ position, size, style = "modern", windows = true }) {
  const [width, height, depth] = size;
  const windowRows = Math.floor(height / 3);
  const windowCols = Math.floor(Math.max(width, depth) / 2);

  const buildingColors = {
    modern: [0x2a3a4a, 0x3a4a5a, 0x4a5a6a, 0x1a2a3a],
    industrial: [0x4a4a4a, 0x5a5a5a, 0x3a3a3a],
    beach: [0xf5e6d3, 0xe8d4c4, 0xfff5e6, 0xd4c4b4],
    neon: [0x1a1a2e, 0x2a2a3e, 0x0a0a1e],
    mega: [0x2a2a3a, 0x3a3a4a, 0x1a1a2a],
  };

  const colors = buildingColors[style] || buildingColors.modern;
  const mainColor = colors[Math.floor(Math.random() * colors.length)];

  return (
    <group position={position}>
      {/* Main building body */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={mainColor}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      {/* Windows */}
      {windows && windowRows > 0 && (
        <group>
          {Array.from({ length: windowRows }).map((_, row) =>
            Array.from({ length: windowCols }).map((_, col) => {
              const windowX = (col - (windowCols - 1) / 2) * 1.8;
              const windowY = (row + 1) * 2.5;
              const lit = Math.random() > 0.3;

              return (
                <mesh
                  key={`${row}-${col}`}
                  position={[windowX, windowY, depth / 2 + 0.01]}
                >
                  <planeGeometry args={[0.8, 1.2]} />
                  <meshBasicMaterial
                    color={lit ? 0xfff5cc : 0x1a1a2a}
                    transparent
                    opacity={lit ? 0.9 : 0.5}
                  />
                </mesh>
              );
            })
          )}
        </group>
      )}

      {/* Roof details */}
      <mesh position={[0, height + 0.2, 0]}>
        <boxGeometry args={[width * 0.9, 0.4, depth * 0.9]} />
        <meshStandardMaterial color={0x333333} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ============================================================
// Street Props
// ============================================================

export function StreetLight({ position, color = 0xfff5cc, on = true }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 5, 8]} />
        <meshStandardMaterial color={0x444444} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Arm */}
      <mesh position={[0.4, 4.8, 0]} rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshStandardMaterial color={0x444444} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Light fixture */}
      <mesh position={[0.7, 4.7, 0]}>
        <boxGeometry args={[0.4, 0.15, 0.25]} />
        <meshStandardMaterial color={0x333333} />
      </mesh>

      {/* Light bulb (emissive only — real point lights were the main lag source) */}
      {on && (
        <mesh position={[0.7, 4.55, 0]}>
          <sphereGeometry args={[0.1, 6, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

export function Tree({ position, scale = 1, type = "deciduous" }) {
  const trunkHeight = 2 * scale;
  const canopySize = 1.5 * scale;

  if (type === "palm") {
    return (
      <group position={position}>
        {/* Trunk */}
        <mesh position={[0, trunkHeight, 0]}>
          <cylinderGeometry args={[0.15 * scale, 0.2 * scale, trunkHeight * 2, 8]} />
          <meshStandardMaterial color={0x8b7355} roughness={0.9} />
        </mesh>
        {/* Fronds */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <mesh
            key={i}
            position={[
              Math.sin((angle * Math.PI) / 180) * 0.8 * scale,
              trunkHeight * 2 + 0.3,
              Math.cos((angle * Math.PI) / 180) * 0.8 * scale,
            ]}
            rotation={[0.3, (angle * Math.PI) / 180, 0.5]}
          >
            <coneGeometry args={[0.3 * scale, 2 * scale, 4]} />
            <meshStandardMaterial color={0x228b22} roughness={0.8} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, trunkHeight / 2, 0]}>
        <cylinderGeometry args={[0.1 * scale, 0.15 * scale, trunkHeight, 8]} />
        <meshStandardMaterial color={0x4a3728} roughness={0.9} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, trunkHeight + canopySize * 0.8, 0]}>
        <sphereGeometry args={[canopySize, 8, 8]} />
        <meshStandardMaterial color={0x2d5a27} roughness={0.8} />
      </mesh>
    </group>
  );
}

export function Bench({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.5, 0.08, 0.5]} />
        <meshStandardMaterial color={0x5a3a2a} roughness={0.8} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.75, -0.2]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[1.5, 0.5, 0.06]} />
        <meshStandardMaterial color={0x5a3a2a} roughness={0.8} />
      </mesh>
      {/* Legs */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.08, 0.44, 0.4]} />
          <meshStandardMaterial color={0x333333} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function TrashBin({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.25, 0.3, 1, 12]} />
        <meshStandardMaterial color={0x2a4a2a} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.28, 0.25, 0.1, 12]} />
        <meshStandardMaterial color={0x333333} metalness={0.4} />
      </mesh>
    </group>
  );
}

export function FireHydrant({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.7, 8]} />
        <meshStandardMaterial color={0xcc2222} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color={0xcc2222} roughness={0.6} />
      </mesh>
      {/* Side outlets */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.15, 0.4, 0]} rotation={[0, 0, side * Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 8]} />
          <meshStandardMaterial color={0xcc2222} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export function TrafficCone({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]}>
        <coneGeometry args={[0.15, 0.5, 8]} />
        <meshStandardMaterial color={0xff6600} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.02, 0.12, 0.08, 8]} />
        <meshStandardMaterial color={0xffffff} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.06, 0.02, 0.08, 8]} />
        <meshStandardMaterial color={0xffffff} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function ParkingMeter({ position }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
        <meshStandardMaterial color={0x444444} metalness={0.6} />
      </mesh>
      {/* Meter head */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.1]} />
        <meshStandardMaterial color={0x555555} metalness={0.4} />
      </mesh>
    </group>
  );
}

// ============================================================
// Ramps and Skate Structures
// ============================================================

export function QuarterPipe({ position, rotation = 0, width = 4, height = 2, color = 0x555555 }) {
  const segments = 12;
  const shape = new THREE.Shape();

  // Create quarter circle shape
  shape.moveTo(0, 0);
  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI / 2) * (i / segments);
    shape.lineTo(Math.cos(angle) * height, Math.sin(angle) * height);
  }
  shape.lineTo(0, height);
  shape.lineTo(0, 0);

  const extrudeSettings = {
    steps: 1,
    depth: width,
    bevelEnabled: false,
  };

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow rotation={[0, Math.PI / 2, 0]} position={[0, 0, -width / 2]}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

export function FunBox({ position, rotation = 0, width = 3, height = 0.8, depth = 2 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={0x444444} roughness={0.7} />
      </mesh>
      {/* Metal coping on edges */}
      <mesh position={[0, height, depth / 2 + 0.02]}>
        <boxGeometry args={[width, 0.05, 0.04]} />
        <meshStandardMaterial color={0x888888} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ============================================================
// Enhanced Rails
// ============================================================

export function GrindRail({ start, end, color = 0x888888 }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const midZ = (start.z + end.z) / 2;

  const direction = new THREE.Vector3(dx, dy, dz).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, direction);
  const euler = new THREE.Euler().setFromQuaternion(quaternion);

  return (
    <group>
      {/* Main rail */}
      <mesh
        position={[midX, midY, midZ]}
        rotation={[euler.x + Math.PI / 2, euler.y, euler.z]}
        castShadow
      >
        <cylinderGeometry args={[0.04, 0.04, length, 12]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Rail supports */}
      {[0.2, 0.5, 0.8].map((t) => {
        const supportX = start.x + dx * t;
        const supportY = start.y + dy * t;
        const supportZ = start.z + dz * t;
        const supportHeight = supportY;

        return supportHeight > 0.1 ? (
          <mesh key={t} position={[supportX, supportHeight / 2, supportZ]}>
            <boxGeometry args={[0.06, supportHeight, 0.06]} />
            <meshStandardMaterial color={0x333333} metalness={0.5} />
          </mesh>
        ) : null;
      })}
    </group>
  );
}

// ============================================================
// Neon Signs (for Neon Downtown)
// ============================================================

export function NeonSign({ position, text = "SKATE", color = 0xff00ff, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Sign backing */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[text.length * 0.5 + 0.4, 1, 0.1]} />
        <meshStandardMaterial color={0x111111} />
      </mesh>
      {/* Text representation (simplified as glowing bar) */}
      <mesh>
        <boxGeometry args={[text.length * 0.4, 0.3, 0.05]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// ============================================================
// Shipping Container (for Industrial Zone)
// ============================================================

export function ShippingContainer({ position, rotation = 0, color = 0x8b4513 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
        <boxGeometry args={[2.5, 2.6, 6]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.3} />
      </mesh>
      {/* Door details */}
      <mesh position={[0, 1.3, 3.01]}>
        <planeGeometry args={[2.3, 2.4]} />
        <meshStandardMaterial color={0x333333} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ============================================================
// Beach Props
// ============================================================

export function BeachUmbrella({ position, color = 0xff6b35 }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.4, 8]} />
        <meshStandardMaterial color={0xffffff} />
      </mesh>
      {/* Umbrella top */}
      <mesh position={[0, 2.2, 0]} rotation={[0.1, 0, 0]}>
        <coneGeometry args={[1.2, 0.6, 8, 1, true]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Lifeguard({ position }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[3, 0.2, 3]} />
        <meshStandardMaterial color={0xffffff} />
      </mesh>
      {/* Posts */}
      {[[-1.2, -1.2], [-1.2, 1.2], [1.2, -1.2], [1.2, 1.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.5, z]}>
          <cylinderGeometry args={[0.1, 0.1, 2.8, 8]} />
          <meshStandardMaterial color={0xcc2222} />
        </mesh>
      ))}
      {/* Platform */}
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[2.8, 0.15, 2.8]} />
        <meshStandardMaterial color={0xffffff} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 3.7, 0]}>
        <boxGeometry args={[2.4, 1.4, 2.4]} />
        <meshStandardMaterial color={0xcc2222} />
      </mesh>
    </group>
  );
}
