/**
 * Urban Skate Rush — stylized skater (helmet, hoodie, baggy pants, chunky
 * sneakers) on a detailed board.
 *
 * The rider stands sideways on the board. Legs use a two-bone IK solve from
 * the hips to foot targets on the deck, so lowering the hips bends the knees
 * naturally. Poses blend between: idle, cruising, pushing (back foot kicks
 * the floor), carving (lean into turns), air (tuck + arms up, feet lift for
 * flips), grinding (low crouch, arms wide) and crashed.
 *
 * Reads the mutable physics `player` every frame — no React re-renders.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const HOODIES = {
  classic: "#e8463a",
  speed: "#2f7de1",
  grind: "#28a86b",
  air: "#ffb21a",
  neon: "#b84dff",
  legendary: "#111318",
};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _k = new THREE.Vector3();
const _d = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;

/** Place a unit-height Y-cylinder mesh so it spans from a to b. */
function span(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
  mesh.scale.y = len;
}

/** Two-bone IK: hip H → foot F, knee bends toward `bend`. Writes knee into K. */
function solveKnee(H, F, l1, l2, bend, K) {
  _d.subVectors(F, H);
  let dist = _d.length();
  dist = Math.min(dist, l1 + l2 - 1e-3);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  const dir = _d.normalize();
  // perpendicular toward the bend direction
  const perp = _a.copy(bend).addScaledVector(dir, -bend.dot(dir)).normalize();
  K.copy(H).addScaledVector(dir, Math.cos(a) * l1).addScaledVector(perp, Math.sin(a) * l1);
}

function Board({ colors, boardRef, wheelRefs }) {
  const deck = colors?.deck ?? 0x2d2d2d;
  const wheels = colors?.wheels ?? 0xf5f5f5;
  const trucks = colors?.trucks ?? 0xc0c0c0;
  return (
    <group ref={boardRef} position={[0, 0.09, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.018, 0.66]} />
        <meshStandardMaterial color={deck} roughness={0.5} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, 0.03, s * 0.37]} rotation={[s * -0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.235, 0.018, 0.12]} />
          <meshStandardMaterial color={deck} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.0095, 0]}>
        <boxGeometry args={[0.226, 0.002, 0.64]} />
        <meshStandardMaterial color="#141414" roughness={1} />
      </mesh>
      {/* underside graphic */}
      <mesh position={[0, -0.0095, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.2, 0.55]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, -0.0098, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.2, 0.12]} />
        <meshBasicMaterial color={deck} />
      </mesh>
      {[0.24, -0.24].map((z) => (
        <group key={z} position={[0, -0.035, z]}>
          <mesh>
            <boxGeometry args={[0.2, 0.03, 0.05]} />
            <meshStandardMaterial color={trucks} metalness={0.8} roughness={0.3} />
          </mesh>
          {[-0.095, 0.095].map((x, i) => (
            <mesh key={x} ref={(el) => (wheelRefs.current[(z > 0 ? 0 : 2) + i] = el)} position={[x, -0.015, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.032, 0.032, 0.03, 16]} />
              <meshStandardMaterial color={wheels} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * player: physics player (x,y,z,yaw,speed,state,pitch,roll,airTime,pushPhase…)
 * board: data/boards.js entry (colors + design).
 */
export default function Skater({ player, board }) {
  const root = useRef();
  const lean = useRef();
  const boardRef = useRef();
  const body = useRef();
  const hips = useRef();
  const torso = useRef();
  const head = useRef();
  const wheelRefs = useRef([]);
  const legs = useRef({});
  const arms = useRef({});
  const anim = useRef({ crouch: 0, push: 0, lift: 0, arms: 0, lean: 0, lastYaw: player.yaw, lastPush: player.pushPhase || 0, kick: 0, crash: 0 });

  const hoodie = HOODIES[board?.design] || HOODIES.classic;
  const mats = useMemo(() => ({
    hoodie: new THREE.MeshStandardMaterial({ color: hoodie, roughness: 0.85 }),
    hoodieDark: new THREE.MeshStandardMaterial({ color: new THREE.Color(hoodie).multiplyScalar(0.7), roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: "#2b3a52", roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: "#e9b48e", roughness: 0.6 }),
    shoe: new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.6 }),
    sole: new THREE.MeshStandardMaterial({ color: "#1c1c1c", roughness: 0.8 }),
    helmet: new THREE.MeshStandardMaterial({ color: "#f7f7f7", roughness: 0.3, metalness: 0.1 }),
    stripe: new THREE.MeshStandardMaterial({ color: hoodie, roughness: 0.3 }),
    pad: new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.7 }),
    dark: new THREE.MeshBasicMaterial({ color: "#151515" }),
  }), [hoodie]);

  const unitCyl = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 12), []);
  const L1 = 0.44; // thigh
  const L2 = 0.44; // shin

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = player;
    const A = anim.current;
    if (!root.current) return;
    root.current.position.set(p.x, p.y, p.z);
    root.current.rotation.y = p.yaw;

    const state = p.state;
    const air = state === "air";
    const grind = state === "grinding";
    const crashed = state === "crashed";
    const speed = Math.abs(p.speed || 0);

    // turn rate → carve lean
    let dyaw = p.yaw - A.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    A.lastYaw = p.yaw;
    const turn = dt > 0 ? dyaw / dt : 0;
    A.lean = lerp(A.lean, air ? 0 : Math.max(-0.35, Math.min(0.35, turn * 0.09 * Math.min(1, speed / 4))), 1 - Math.exp(-8 * dt));
    if (lean.current) lean.current.rotation.z = A.lean;

    // pushing: physics advances pushPhase while accelerating on the ground
    const pp = p.pushPhase || 0;
    const pushing = !air && !grind && Math.abs(pp - A.lastPush) > 1e-4;
    A.lastPush = pp;
    A.push = lerp(A.push, pushing ? 1 : 0, 1 - Math.exp(-6 * dt));

    const crouchTarget = crashed ? 0.1 : grind ? 0.32 : air ? 0.3 : p.crouching ? 0.25 : 0.08 + Math.min(0.08, speed * 0.008) + A.push * 0.06;
    A.crouch = lerp(A.crouch, crouchTarget, 1 - Math.exp(-10 * dt));
    const flipping = air && (Math.abs(p.roll) > 0.15 || Math.abs(p.pitch) > 0.15);
    A.lift = lerp(A.lift, flipping ? 0.22 : 0, 1 - Math.exp(-14 * dt));
    A.arms = lerp(A.arms, air ? 1 : grind ? 0.8 : 0.25 + A.push * 0.2, 1 - Math.exp(-8 * dt));
    A.crash = lerp(A.crash, crashed ? 1 : 0, 1 - Math.exp(-6 * dt));

    // board tricks
    if (boardRef.current) {
      boardRef.current.rotation.x = p.pitch || 0;
      boardRef.current.rotation.z = p.roll || 0;
      boardRef.current.position.y = 0.09 + (flipping ? 0.12 : 0);
    }
    wheelRefs.current.forEach((w) => w && (w.rotation.x = p.wheelRotation || 0));

    // body frame: rider faces +x of the board (sideways stance)
    const hipY = 1.02 - A.crouch;
    if (hips.current) hips.current.position.y = hipY;
    if (body.current) {
      body.current.rotation.x = A.crash * 1.3;
      body.current.position.y = -A.crash * 0.6;
    }
    if (torso.current) torso.current.rotation.x = 0.12 + A.crouch * 0.6 + A.push * 0.15;
    if (head.current) head.current.rotation.x = -0.1 - A.crouch * 0.4;

    // feet targets (body-local: front foot at -x, back foot at +x)
    const phase = pp;
    const L = legs.current;
    const footY = 0.12 + A.lift;
    const front = _b.set(-0.2, footY, 0.02);
    let backX = 0.22;
    let backY = footY;
    let backZ = 0.02;
    if (A.push > 0.02) {
      // back foot comes off the deck, sweeps along the floor and returns
      const s = Math.sin(phase);
      backX = lerp(0.22, 0.32 + s * 0.35, A.push);
      backY = lerp(footY, Math.max(0.03, 0.08 - Math.cos(phase) * 0.06), A.push);
      backZ = lerp(0.02, 0.22, A.push);
    }
    const bend = _k.set(0, 0, 1); // knees bend forward (+z of body)
    const legSides = [
      { key: "f", hip: [-0.11, hipY - 0.05, 0], foot: [front.x, front.y, front.z] },
      { key: "b", hip: [0.11, hipY - 0.05, 0], foot: [backX, backY, backZ] },
    ];
    for (const s of legSides) {
      const l = L[s.key];
      if (!l) continue;
      const H = new THREE.Vector3(...s.hip);
      const F = new THREE.Vector3(...s.foot);
      const K = new THREE.Vector3();
      solveKnee(H, F, L1, L2, bend, K);
      span(l.thigh, H, K);
      span(l.shin, K, F);
      l.knee.position.copy(K);
      l.shoe.position.set(F.x, F.y - 0.04, F.z + 0.04);
    }

    // arms: out for balance, up in the air, swing with pushes
    const R = arms.current;
    const out = 0.35 + A.arms * 0.9;
    const swing = Math.sin(phase) * 0.4 * A.push;
    if (R.l) {
      R.l.rotation.set(0.2 + swing, 0, -out);
      R.le.rotation.x = -0.5 - A.arms * 0.3;
    }
    if (R.r) {
      R.r.rotation.set(0.2 - swing, 0, out);
      R.re.rotation.x = -0.5 - A.arms * 0.3;
    }
  });

  const legParts = (key) => (
    <group>
      <mesh ref={(el) => el && ((legs.current[key] ||= {}).thigh = el)} geometry={unitCyl} material={mats.pants} scale={[0.1, 1, 0.1]} castShadow />
      <mesh ref={(el) => el && ((legs.current[key] ||= {}).shin = el)} geometry={unitCyl} material={mats.pants} scale={[0.085, 1, 0.085]} castShadow />
      <mesh ref={(el) => el && ((legs.current[key] ||= {}).knee = el)} material={mats.pad} castShadow>
        <sphereGeometry args={[0.085, 12, 8]} />
      </mesh>
      <group ref={(el) => el && ((legs.current[key] ||= {}).shoe = el)}>
        <mesh position={[0, 0.03, 0.02]} castShadow material={mats.shoe}>
          <boxGeometry args={[0.13, 0.09, 0.3]} />
        </mesh>
        <mesh position={[0, -0.02, 0.02]} material={mats.sole}>
          <boxGeometry args={[0.14, 0.03, 0.31]} />
        </mesh>
        <mesh position={[0, 0.08, 0.06]} material={mats.stripe}>
          <boxGeometry args={[0.135, 0.02, 0.12]} />
        </mesh>
      </group>
    </group>
  );

  const arm = (side) => (
    <group ref={(el) => el && (arms.current[side] = el)} position={[side === "l" ? -0.27 : 0.27, 0.48, 0]}>
      <mesh position={[0, -0.16, 0]} material={mats.hoodie} castShadow>
        <capsuleGeometry args={[0.07, 0.22, 4, 10]} />
      </mesh>
      <group ref={(el) => el && (arms.current[side + "e"] = el)} position={[0, -0.33, 0]}>
        <mesh position={[0, -0.14, 0]} material={mats.hoodie} castShadow>
          <capsuleGeometry args={[0.06, 0.2, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.3, 0]} material={mats.skin}>
          <sphereGeometry args={[0.06, 12, 8]} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={root}>
      <group ref={lean}>
        <Board colors={board?.colors} boardRef={boardRef} wheelRefs={wheelRefs} />
        {/* rider faces +x of the board */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <group ref={body}>
            {legParts("f")}
            {legParts("b")}
            <group ref={hips} position={[0, 0.94, 0]}>
              <mesh material={mats.pants} castShadow>
                <boxGeometry args={[0.36, 0.2, 0.24]} />
              </mesh>
              <group ref={torso} position={[0, 0.06, 0]}>
                {/* hoodie */}
                <mesh position={[0, 0.27, 0]} material={mats.hoodie} castShadow>
                  <capsuleGeometry args={[0.2, 0.26, 6, 14]} />
                </mesh>
                <mesh position={[0, 0.15, 0.17]} material={mats.hoodieDark}>
                  <boxGeometry args={[0.24, 0.12, 0.06]} />
                </mesh>
                <mesh position={[0, 0.5, -0.12]} rotation={[0.5, 0, 0]} material={mats.hoodieDark} castShadow>
                  <sphereGeometry args={[0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                {arm("l")}
                {arm("r")}
                <group ref={head} position={[0, 0.66, 0]}>
                  <mesh material={mats.skin} castShadow>
                    <sphereGeometry args={[0.15, 18, 14]} />
                  </mesh>
                  {[-0.05, 0.05].map((x) => (
                    <mesh key={x} position={[x, 0.02, 0.135]} material={mats.dark}>
                      <sphereGeometry args={[0.018, 8, 6]} />
                    </mesh>
                  ))}
                  <mesh position={[0, -0.05, 0.14]} material={mats.dark} scale={[1, 0.4, 0.5]}>
                    <sphereGeometry args={[0.03, 8, 6]} />
                  </mesh>
                  {/* helmet */}
                  <mesh position={[0, 0.04, -0.01]} material={mats.helmet} castShadow>
                    <sphereGeometry args={[0.175, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                  </mesh>
                  <mesh position={[0, 0.04, -0.01]} material={mats.stripe} scale={[0.28, 1.01, 1.01]}>
                    <sphereGeometry args={[0.176, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                  </mesh>
                  <mesh position={[0, 0.0, 0.1]} rotation={[0.25, 0, 0]} material={mats.helmet}>
                    <boxGeometry args={[0.26, 0.02, 0.1]} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
