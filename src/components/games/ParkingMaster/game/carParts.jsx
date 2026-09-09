/**
 * Parking Master — shared car geometry.
 *
 * A stylised compact/sedan/SUV shell built from simple primitives with
 * deliberate proportions: separate body, cabin, hood and boot volumes, inset
 * glass, fenders, bumpers, mirrors and wheels with visible rims. The player
 * car and every parked car use the same parts so the whole scene stays on a
 * handful of shared materials.
 *
 * Units are metres. Local +Z is the front of the car; the shell sits on y=0
 * with the wheels reaching down to the ground.
 */

import { useMemo } from "react";
import * as THREE from "three";

export const BODY_SPECS = {
  compact: { len: 4.0, wid: 1.8, ride: 0.28, bodyH: 0.6, cabinLen: 1.95, cabinH: 0.62, cabinOff: -0.15, wheelR: 0.33 },
  sedan: { len: 4.5, wid: 1.86, ride: 0.3, bodyH: 0.6, cabinLen: 2.2, cabinH: 0.6, cabinOff: -0.2, wheelR: 0.34 },
  suv: { len: 4.55, wid: 1.95, ride: 0.4, bodyH: 0.78, cabinLen: 2.5, cabinH: 0.78, cabinOff: -0.1, wheelR: 0.37 },
};

const GLASS = "#1b2530";
const TIRE = "#15171b";
const TRIM = "#20242a";

/** Static wheel with rim. Wrap in a group and spin/steer that group. */
export function Wheel({ r = 0.33, width = 0.26, rim = "#c9ced4" }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, width, 20]} />
        <meshStandardMaterial color={TIRE} roughness={0.85} />
      </mesh>
      <mesh position={[0, width / 2 + 0.005, 0]}>
        <cylinderGeometry args={[r * 0.6, r * 0.6, 0.02, 16]} />
        <meshStandardMaterial color={rim} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, -width / 2 - 0.005, 0]}>
        <cylinderGeometry args={[r * 0.6, r * 0.6, 0.02, 16]} />
        <meshStandardMaterial color={rim} metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** The four wheel centre positions in body-local space for a body type. */
export function wheelPositions(bodyType) {
  const s = BODY_SPECS[bodyType] || BODY_SPECS.compact;
  const x = s.wid / 2 - 0.06;
  const z = s.len / 2 - 0.95;
  const y = s.wheelR;
  return {
    r: s.wheelR,
    fl: [-x, y, z],
    fr: [x, y, z],
    rl: [-x, y, -z],
    rr: [x, y, -z],
  };
}

/**
 * The car body shell (everything except wheels). `lightsRef`, when passed,
 * receives { head:[mat,mat], brake:[mat,mat], reverse:[mat,mat] } so the
 * player car can pulse them without re-rendering.
 */
export function CarShell({ color = "#e9edf2", bodyType = "compact", lightsRef, onLights, headlightCones = false }) {
  const s = BODY_SPECS[bodyType] || BODY_SPECS.compact;

  const paint = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 }),
    [color],
  );
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.2 }),
    [],
  );
  const trim = useMemo(
    () => new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6 }),
    [],
  );

  const head = useMemo(
    () => [0, 1].map(() => new THREE.MeshStandardMaterial({ color: "#fff6df", emissive: "#ffe7a8", emissiveIntensity: 0.35 })),
    [],
  );
  const brake = useMemo(
    () => [0, 1].map(() => new THREE.MeshStandardMaterial({ color: "#5a1512", emissive: "#ff2a1e", emissiveIntensity: 0.25 })),
    [],
  );
  const rev = useMemo(
    () => [0, 1].map(() => new THREE.MeshStandardMaterial({ color: "#d8d8d8", emissive: "#ffffff", emissiveIntensity: 0.05 })),
    [],
  );
  const lights = { head, brake, reverse: rev };
  if (lightsRef) lightsRef.current = lights;
  if (onLights) onLights(lights);

  const bodyY = s.wheelR + 0.06;
  const bodyCH = s.bodyH;
  const cabinY = bodyY + bodyCH / 2 + s.cabinH / 2 - 0.02;
  const halfLen = s.len / 2;

  return (
    <group>
      {/* main body */}
      <mesh position={[0, bodyY + bodyCH / 2, 0]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[s.wid, bodyCH, s.len - 0.3]} />
      </mesh>
      {/* rounded lower skirt */}
      <mesh position={[0, bodyY + 0.06, 0]} material={trim}>
        <boxGeometry args={[s.wid + 0.04, 0.16, s.len - 0.5]} />
      </mesh>
      {/* hood */}
      <mesh position={[0, bodyY + bodyCH - 0.03, halfLen - 0.7]} material={paint} castShadow>
        <boxGeometry args={[s.wid - 0.12, 0.16, 1.2]} />
      </mesh>
      {/* boot */}
      <mesh position={[0, bodyY + bodyCH - 0.03, -halfLen + 0.6]} material={paint} castShadow>
        <boxGeometry args={[s.wid - 0.12, 0.16, 1.0]} />
      </mesh>

      {/* cabin */}
      <mesh position={[0, cabinY, s.cabinOff]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[s.wid - 0.14, s.cabinH, s.cabinLen]} />
      </mesh>
      {/* glass greenhouse slightly inset */}
      <mesh position={[0, cabinY + 0.02, s.cabinOff]} material={glass}>
        <boxGeometry args={[s.wid - 0.06, s.cabinH - 0.16, s.cabinLen - 0.5]} />
      </mesh>
      {/* windshield / rear glass wedges */}
      <mesh position={[0, cabinY, s.cabinOff + s.cabinLen / 2 - 0.02]} rotation={[0.5, 0, 0]} material={glass}>
        <boxGeometry args={[s.wid - 0.18, s.cabinH - 0.1, 0.08]} />
      </mesh>
      <mesh position={[0, cabinY, s.cabinOff - s.cabinLen / 2 + 0.02]} rotation={[-0.5, 0, 0]} material={glass}>
        <boxGeometry args={[s.wid - 0.2, s.cabinH - 0.14, 0.08]} />
      </mesh>

      {/* mirrors */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (s.wid / 2 + 0.02), cabinY - 0.05, s.cabinOff + s.cabinLen / 2 - 0.1]} material={trim}>
          <boxGeometry args={[0.16, 0.09, 0.12]} />
        </mesh>
      ))}

      {/* fenders over each wheel */}
      {wheelArches(s).map((p, i) => (
        <mesh key={i} position={p} material={trim}>
          <boxGeometry args={[0.16, 0.34, 1.0]} />
        </mesh>
      ))}

      {/* bumpers */}
      <mesh position={[0, bodyY + 0.12, halfLen - 0.12]} material={trim}>
        <boxGeometry args={[s.wid - 0.02, 0.3, 0.22]} />
      </mesh>
      <mesh position={[0, bodyY + 0.12, -halfLen + 0.12]} material={trim}>
        <boxGeometry args={[s.wid - 0.02, 0.3, 0.22]} />
      </mesh>

      {/* headlights */}
      {[-1, 1].map((sx, i) => (
        <mesh key={`h${i}`} position={[sx * (s.wid / 2 - 0.34), bodyY + bodyCH - 0.14, halfLen - 0.02]} material={head[i]}>
          <boxGeometry args={[0.42, 0.2, 0.08]} />
        </mesh>
      ))}
      {/* taillights */}
      {[-1, 1].map((sx, i) => (
        <mesh key={`t${i}`} position={[sx * (s.wid / 2 - 0.3), bodyY + bodyCH - 0.14, -halfLen + 0.02]} material={brake[i]}>
          <boxGeometry args={[0.5, 0.22, 0.08]} />
        </mesh>
      ))}
      {/* reverse lights */}
      {[-1, 1].map((sx, i) => (
        <mesh key={`r${i}`} position={[sx * (s.wid / 2 - 0.62), bodyY + bodyCH - 0.16, -halfLen + 0.03]} material={rev[i]}>
          <boxGeometry args={[0.16, 0.12, 0.06]} />
        </mesh>
      ))}

      {headlightCones &&
        [-1, 1].map((sx) => (
          <spotLight
            key={sx}
            position={[sx * (s.wid / 2 - 0.34), bodyY + bodyCH - 0.14, halfLen - 0.1]}
            target-position={[sx * 2, -1, halfLen + 8]}
            angle={0.5}
            penumbra={0.6}
            distance={16}
            intensity={6}
            color="#fff2cf"
          />
        ))}
    </group>
  );
}

function wheelArches(s) {
  const x = s.wid / 2 - 0.02;
  const z = s.len / 2 - 0.95;
  const y = s.wheelR + 0.12;
  return [
    [-x, y, z], [x, y, z], [-x, y, -z], [x, y, -z],
  ];
}
