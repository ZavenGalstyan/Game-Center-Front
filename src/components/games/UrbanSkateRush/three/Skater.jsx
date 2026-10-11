/**
 * Urban Skate Rush — Realistic Skater Model
 *
 * Detailed 3D skater with proper anatomy, joints, and animations.
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Skin shader for realistic skin rendering
const skinMaterial = {
  color: 0xe8b89d,
  roughness: 0.6,
  metalness: 0.0,
};

// Cloth material for clothes
const clothMaterial = (color) => ({
  color,
  roughness: 0.85,
  metalness: 0.0,
});

// ============================================================
// Realistic Skateboard
// ============================================================

function Skateboard({ deckColor = 0x2d2d2d, wheelRefs }) {
  return (
    <group position={[0, 0.05, 0]}>
      {/* Deck with curved nose and tail */}
      <mesh castShadow>
        {/* Main deck */}
        <boxGeometry args={[0.21, 0.015, 0.75]} />
        <meshStandardMaterial
          color={deckColor}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>

      {/* Nose kick */}
      <mesh position={[0, 0.02, 0.38]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.2, 0.015, 0.08]} />
        <meshStandardMaterial color={deckColor} roughness={0.5} />
      </mesh>

      {/* Tail kick */}
      <mesh position={[0, 0.02, -0.38]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.2, 0.015, 0.08]} />
        <meshStandardMaterial color={deckColor} roughness={0.5} />
      </mesh>

      {/* Grip tape (top) - textured */}
      <mesh position={[0, 0.009, 0]}>
        <boxGeometry args={[0.2, 0.002, 0.73]} />
        <meshStandardMaterial color={0x111111} roughness={1} metalness={0} />
      </mesh>

      {/* Graphic underside */}
      <mesh position={[0, -0.009, 0]} rotation={[Math.PI, 0, 0]}>
        <planeGeometry args={[0.19, 0.7]} />
        <meshStandardMaterial color={0x444444} roughness={0.4} />
      </mesh>

      {/* Front truck assembly */}
      <group position={[0, -0.02, 0.26]}>
        {/* Baseplate */}
        <mesh>
          <boxGeometry args={[0.18, 0.008, 0.05]} />
          <meshStandardMaterial color={0x666666} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Hanger */}
        <mesh position={[0, -0.015, 0]}>
          <boxGeometry args={[0.22, 0.015, 0.025]} />
          <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Kingpin */}
        <mesh position={[0, -0.01, 0]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.03, 8]} />
          <meshStandardMaterial color={0xaaaaaa} metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Bushings */}
        <mesh position={[0, -0.008, 0.01]}>
          <cylinderGeometry args={[0.012, 0.012, 0.015, 8]} />
          <meshStandardMaterial color={0xff6b35} roughness={0.7} />
        </mesh>
      </group>

      {/* Back truck assembly */}
      <group position={[0, -0.02, -0.26]}>
        <mesh>
          <boxGeometry args={[0.18, 0.008, 0.05]} />
          <meshStandardMaterial color={0x666666} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.015, 0]}>
          <boxGeometry args={[0.22, 0.015, 0.025]} />
          <meshStandardMaterial color={0x888888} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, -0.01, 0]} rotation={[-0.3, 0, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.03, 8]} />
          <meshStandardMaterial color={0xaaaaaa} metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, -0.008, -0.01]}>
          <cylinderGeometry args={[0.012, 0.012, 0.015, 8]} />
          <meshStandardMaterial color={0xff6b35} roughness={0.7} />
        </mesh>
      </group>

      {/* Wheels with bearings */}
      {[
        [-0.1, -0.038, 0.26],
        [0.1, -0.038, 0.26],
        [-0.1, -0.038, -0.26],
        [0.1, -0.038, -0.26],
      ].map((pos, i) => (
        <group key={i} position={pos}>
          {/* Wheel */}
          <mesh
            ref={(el) => wheelRefs && (wheelRefs.current[i] = el)}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.028, 0.028, 0.022, 24]} />
            <meshStandardMaterial
              color={0xf5f5dc}
              roughness={0.4}
              metalness={0.05}
            />
          </mesh>
          {/* Bearing (inner) */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.024, 12]} />
            <meshStandardMaterial color={0xcc0000} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ============================================================
// Body Parts with Proper Joints
// ============================================================

function Head({ position }) {
  return (
    <group position={position}>
      {/* Skull base */}
      <mesh castShadow>
        <sphereGeometry args={[0.095, 24, 24]} />
        <meshStandardMaterial {...skinMaterial} />
      </mesh>

      {/* Jaw / face shape */}
      <mesh position={[0, -0.04, 0.03]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...skinMaterial} />
      </mesh>

      {/* Ears */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.09, 0, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>
      ))}

      {/* Eyes */}
      {[-1, 1].map((side) => (
        <group key={`eye-${side}`} position={[side * 0.035, 0.02, 0.08]}>
          {/* Eye white */}
          <mesh>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshStandardMaterial color={0xffffff} roughness={0.2} />
          </mesh>
          {/* Pupil */}
          <mesh position={[0, 0, 0.012]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshStandardMaterial color={0x2a1810} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Eyebrows */}
      {[-1, 1].map((side) => (
        <mesh key={`brow-${side}`} position={[side * 0.035, 0.055, 0.075]} rotation={[0, 0, side * 0.2]}>
          <boxGeometry args={[0.035, 0.008, 0.01]} />
          <meshStandardMaterial color={0x2a1a10} roughness={0.9} />
        </mesh>
      ))}

      {/* Nose */}
      <mesh position={[0, -0.01, 0.09]}>
        <coneGeometry args={[0.015, 0.03, 8]} />
        <meshStandardMaterial {...skinMaterial} />
      </mesh>

      {/* Mouth line */}
      <mesh position={[0, -0.055, 0.075]}>
        <boxGeometry args={[0.04, 0.004, 0.01]} />
        <meshStandardMaterial color={0xc48870} roughness={0.6} />
      </mesh>

      {/* Hair */}
      <mesh position={[0, 0.05, -0.02]}>
        <sphereGeometry args={[0.1, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color={0x1a1a1a} roughness={0.9} />
      </mesh>

      {/* Cap */}
      <group position={[0, 0.04, 0.02]} rotation={[0.15, 0, 0]}>
        {/* Cap dome */}
        <mesh>
          <sphereGeometry args={[0.11, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={0xc41e3a} roughness={0.7} />
        </mesh>
        {/* Cap brim */}
        <mesh position={[0, -0.01, 0.08]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[0.14, 0.008, 0.08]} />
          <meshStandardMaterial color={0xc41e3a} roughness={0.7} />
        </mesh>
        {/* Cap button */}
        <mesh position={[0, 0.11, 0]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color={0xc41e3a} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function Torso({ position, shirtColor = 0x333333 }) {
  return (
    <group position={position}>
      {/* Main torso */}
      <mesh castShadow>
        <capsuleGeometry args={[0.1, 0.25, 8, 16]} />
        <meshStandardMaterial {...clothMaterial(shirtColor)} />
      </mesh>

      {/* Shoulders */}
      <mesh position={[0, 0.12, 0]}>
        <capsuleGeometry args={[0.12, 0.08, 8, 16]} />
        <meshStandardMaterial {...clothMaterial(shirtColor)} />
      </mesh>

      {/* Collar / neck base */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.06, 12]} />
        <meshStandardMaterial {...clothMaterial(shirtColor)} />
      </mesh>

      {/* Shirt graphic/logo */}
      <mesh position={[0, 0, 0.1]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color={0xff6b35} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Arm({ position, rotation, side = 1, sleeveColor = 0x333333 }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Upper arm */}
      <mesh position={[0, -0.1, 0]} castShadow>
        <capsuleGeometry args={[0.04, 0.12, 6, 12]} />
        <meshStandardMaterial {...clothMaterial(sleeveColor)} />
      </mesh>

      {/* Elbow joint */}
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial {...skinMaterial} />
      </mesh>

      {/* Forearm */}
      <group position={[0, -0.2, 0]} rotation={[0.3 * side, 0, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <capsuleGeometry args={[0.032, 0.12, 6, 12]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>

        {/* Wrist */}
        <mesh position={[0, -0.19, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>

        {/* Hand */}
        <mesh position={[0, -0.24, 0.01]}>
          <boxGeometry args={[0.04, 0.06, 0.025]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>

        {/* Fingers */}
        {[-0.012, 0, 0.012].map((x, i) => (
          <mesh key={i} position={[x, -0.29, 0.01]}>
            <capsuleGeometry args={[0.006, 0.02, 4, 6]} />
            <meshStandardMaterial {...skinMaterial} />
          </mesh>
        ))}

        {/* Thumb */}
        <mesh position={[0.025 * side, -0.24, 0.02]} rotation={[0, 0, 0.5 * side]}>
          <capsuleGeometry args={[0.008, 0.025, 4, 6]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>
      </group>
    </group>
  );
}

function Leg({ position, rotation, side = 1, pantsColor = 0x2a4a6a, shoeColor = 0x222222 }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Upper leg / thigh */}
      <mesh position={[0, -0.12, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.16, 6, 12]} />
        <meshStandardMaterial {...clothMaterial(pantsColor)} />
      </mesh>

      {/* Knee */}
      <mesh position={[0, -0.25, 0.015]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial {...clothMaterial(pantsColor)} />
      </mesh>

      {/* Lower leg / shin */}
      <group position={[0, -0.25, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <capsuleGeometry args={[0.04, 0.16, 6, 12]} />
          <meshStandardMaterial {...clothMaterial(pantsColor)} />
        </mesh>

        {/* Ankle */}
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial {...clothMaterial(shoeColor)} />
        </mesh>

        {/* Shoe */}
        <group position={[0, -0.27, 0.03]}>
          {/* Shoe body */}
          <mesh castShadow>
            <boxGeometry args={[0.08, 0.05, 0.14]} />
            <meshStandardMaterial color={shoeColor} roughness={0.8} />
          </mesh>
          {/* Sole */}
          <mesh position={[0, -0.03, 0]}>
            <boxGeometry args={[0.085, 0.015, 0.15]} />
            <meshStandardMaterial color={0x1a1a1a} roughness={0.9} />
          </mesh>
          {/* Toe cap */}
          <mesh position={[0, 0.005, 0.06]}>
            <sphereGeometry args={[0.04, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={shoeColor} roughness={0.8} />
          </mesh>
          {/* Laces */}
          {[0.02, 0.04].map((z, i) => (
            <mesh key={i} position={[0, 0.025, z]}>
              <boxGeometry args={[0.06, 0.006, 0.015]} />
              <meshStandardMaterial color={0xffffff} roughness={0.7} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// ============================================================
// Main Skater Component
// ============================================================

export default function RealisticSkater({ player, board, state = "skating" }) {
  const groupRef = useRef();
  const wheelRefs = useRef([]);
  const bodyRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();

  // Animation state
  const animRef = useRef({
    breathe: 0,
    armSwing: 0,
    crouch: 0,
  });

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Update animation
    animRef.current.breathe += delta * 2;
    animRef.current.armSwing += delta * 3;

    // Position and rotation
    groupRef.current.position.set(player.x, player.y, player.z);
    groupRef.current.rotation.y = player.yaw;

    // Board tilt for tricks
    if (groupRef.current.children[0]) {
      const boardGroup = groupRef.current.children[0];
      boardGroup.rotation.x = player.pitch;
      boardGroup.rotation.z = player.roll;
    }

    // Wheel rotation
    wheelRefs.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x = player.wheelRotation;
    });

    // Body lean based on turning and speed
    if (bodyRef.current) {
      const leanZ = -player.vx * 0.03;
      const leanX = player.state === 3 ? 0.2 : 0; // Crouch when grinding
      const breatheOffset = Math.sin(animRef.current.breathe) * 0.005;

      bodyRef.current.rotation.z = leanZ;
      bodyRef.current.rotation.x = leanX;
      bodyRef.current.position.y = 0.65 + breatheOffset - (player.state === 3 ? 0.1 : 0);
    }

    // Arm swing based on speed
    const armSwing = Math.sin(animRef.current.armSwing) * Math.min(Math.abs(player.speed) * 0.05, 0.2);
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = armSwing;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = -armSwing;
    }
  });

  const deckColor = board?.colors?.deck || 0x2d2d2d;
  const shirtColor = board?.colors?.shirt || 0x333333;
  const pantsColor = board?.colors?.pants || 0x2a4a6a;

  return (
    <group ref={groupRef}>
      {/* Skateboard */}
      <Skateboard deckColor={deckColor} wheelRefs={wheelRefs} />

      {/* Skater body */}
      <group ref={bodyRef} position={[0, 0.65, 0]}>
        {/* Hips */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.18, 0.08, 0.1]} />
          <meshStandardMaterial {...clothMaterial(pantsColor)} />
        </mesh>

        {/* Torso */}
        <Torso position={[0, 0.25, 0]} shirtColor={shirtColor} />

        {/* Neck */}
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.035, 0.04, 0.08, 12]} />
          <meshStandardMaterial {...skinMaterial} />
        </mesh>

        {/* Head */}
        <Head position={[0, 0.6, 0]} />

        {/* Arms */}
        <group ref={leftArmRef}>
          <Arm
            position={[-0.15, 0.38, 0]}
            rotation={[0.1, 0, 0.25]}
            side={-1}
            sleeveColor={shirtColor}
          />
        </group>
        <group ref={rightArmRef}>
          <Arm
            position={[0.15, 0.38, 0]}
            rotation={[0.1, 0, -0.25]}
            side={1}
            sleeveColor={shirtColor}
          />
        </group>

        {/* Legs */}
        <group ref={leftLegRef}>
          <Leg
            position={[-0.07, -0.04, 0.05]}
            rotation={[0.05, 0, 0]}
            side={-1}
            pantsColor={pantsColor}
          />
        </group>
        <group ref={rightLegRef}>
          <Leg
            position={[0.07, -0.04, -0.05]}
            rotation={[-0.05, 0, 0]}
            side={1}
            pantsColor={pantsColor}
          />
        </group>
      </group>

      {/* Shadow blob */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.25, 16]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}
