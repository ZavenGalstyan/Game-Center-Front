/**
 * Mountain Journey — the explorer: a jointed hiker built from primitives
 * (hiking jacket with collar and zip, backpack with bedroll and pockets,
 * adventure trousers, boots, gloves, optional hat) and animated
 * procedurally. Every frame a target pose is computed from the engine state
 * and each joint eases toward it, so transitions are always smooth.
 *
 *   idle · walk · run       leg / arm swing driven by player.phase, which the
 *                           engine advances by distance travelled → no foot
 *                           sliding at any speed
 *   jump · fall · land      tuck, arms-out, a crouch scaled by impact
 *   climb (ledge)           reach → hang → pull up → stand (engine timeline)
 *   ladder                  alternating hands and feet with the climb height
 *   interact · push · victory · viewpoint (hands on hips, looking out)
 *
 * Local +z is forward; the root's rotation.y is the facing angle.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STATE } from "../engine/constants.js";
import { CLIMB } from "../engine/constants.js";
import { mats } from "./materials.js";

export const JACKETS = ["#c8452f", "#2f6fa8", "#e0a531", "#3f7f4f", "#7a4fa0", "#2d3b4f", "#e9e4d8", "#d26a8e"];
export const PACKS = ["#4b5a3a", "#8a4b2a", "#2d4f6e", "#b8862f", "#5a3d6e", "#2b2b2b"];
export const HATS = ["none", "beanie", "cap", "bucket", "explorer"];

const POSE_KEYS = [
  "hipY",
  "hipTilt",
  "lean",
  "twist",
  "headX",
  "headY",
  "lThigh",
  "lShin",
  "rThigh",
  "rShin",
  "lThighZ",
  "rThighZ",
  "lArm",
  "lFore",
  "rArm",
  "rFore",
  "lArmZ",
  "rArmZ",
];

function zeroPose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

/** Pose from engine state. `t` is wall time (idle motion), `G` the game. */
export function poseFromGame(G, t) {
  const P = G.player;
  const p = zeroPose();
  const state = G.state;
  const speed = P.speed || 0;
  const run = Math.min(1, Math.max(0, (speed - 4.4) / 2.4));
  const walk = Math.min(1, speed / 3.2);
  const phi = P.phase;
  // --- base: idle breathing ----------------------------------------------
  p.hipY = Math.sin(t * 1.9) * 0.008;
  p.lArmZ = 0.1 + Math.sin(t * 1.9) * 0.015;
  p.rArmZ = -0.1 - Math.sin(t * 1.9) * 0.015;
  p.lFore = -0.12;
  p.rFore = -0.12;
  p.headY = Math.sin(t * 0.37) * 0.35 * (1 - walk);
  p.headX = Math.sin(t * 0.23) * 0.06;

  if (state === STATE.CLIMBING && G.climb) {
    const C = G.climb;
    if (C.cl.kind === "ledge") {
      const k = Math.min(1, C.t / CLIMB.ledgeTime);
      if (k < 0.3) {
        const s = k / 0.3;
        p.lArm = p.rArm = -2.9 * s;
        p.lFore = p.rFore = -0.2;
        p.lThigh = -0.4 * s;
        p.lShin = 0.6 * s;
        p.lean = 0.15 * s;
      } else if (k < 0.72) {
        const s = (k - 0.3) / 0.42;
        p.lArm = p.rArm = -2.9 + 1.3 * s;
        p.lFore = p.rFore = -1.5 * s;
        p.lThigh = -0.4 - 1.0 * s;
        p.lShin = 0.6 + 1.0 * s;
        p.rThigh = 0.2;
        p.rShin = 0.3;
        p.lean = 0.15 + 0.45 * s;
      } else {
        const s = (k - 0.72) / 0.28;
        p.lArm = p.rArm = -1.6 * (1 - s) - 0.2;
        p.lFore = p.rFore = -1.5 * (1 - s);
        p.lThigh = -1.4 * (1 - s);
        p.lShin = 1.6 * (1 - s);
        p.rThigh = 0.2 * (1 - s);
        p.lean = 0.6 * (1 - s);
      }
      p.headX = -0.25;
      return p;
    }
    // ladder
    const ph = (C.h || 0) * 2.8;
    const s = Math.sin(ph);
    p.lArm = -2.45 + s * 0.35;
    p.rArm = -2.45 - s * 0.35;
    p.lFore = -0.55 - Math.max(0, s) * 0.5;
    p.rFore = -0.55 - Math.max(0, -s) * 0.5;
    p.lThigh = -0.75 - s * 0.35;
    p.rThigh = -0.75 + s * 0.35;
    p.lShin = 1.0 + s * 0.3;
    p.rShin = 1.0 - s * 0.3;
    p.lean = 0.05;
    p.headX = -0.2;
    if (C.mount >= 0) {
      const m = Math.min(1, C.mount / CLIMB.mountTime);
      p.lArm = p.rArm = -2.2 * (1 - m);
      p.lThigh = -1.2 * (1 - m);
      p.lShin = 1.3 * (1 - m);
      p.lean = 0.4 * (1 - m);
    }
    return p;
  }

  if (state === STATE.VIEWPOINT) {
    // relaxed, shading the eyes with one hand, taking it all in
    p.lArm = 0.06;
    p.lArmZ = 0.16;
    p.lFore = -0.25;
    p.rArm = -2.3;
    p.rArmZ = -0.35;
    p.rFore = -1.9;
    p.headX = -0.12 + Math.sin(t * 0.5) * 0.04;
    p.headY = Math.sin(t * 0.25) * 0.4;
    return p;
  }

  if (state === STATE.LEVEL_COMPLETE || (G.animAction && G.animAction.name === "victory")) {
    const ft = G.finishT || 0;
    const wave = Math.sin(ft * 7);
    p.lArm = -2.75;
    p.rArm = -2.75;
    p.lArmZ = 0.35 + wave * 0.18;
    p.rArmZ = -0.35 - wave * 0.18;
    p.lFore = -0.35;
    p.rFore = -0.35;
    p.hipY = Math.max(0, Math.sin(ft * 5.5)) * 0.07 * (ft < 2 ? 1 : 0.3);
    p.headX = -0.18;
    return p;
  }

  if (state === STATE.FALLING || state === STATE.RESPAWNING) {
    p.lArm = -1.5;
    p.rArm = -1.5;
    p.lArmZ = 1.2;
    p.rArmZ = -1.2;
    p.lThigh = -0.3;
    p.rThigh = 0.3;
    p.lShin = 0.5;
    p.rShin = 0.4;
    return p;
  }

  if (!P.grounded) {
    const up = P.vy > 0;
    const k = Math.min(1, P.airT / 0.18);
    if (up) {
      p.lThigh = -0.9 * k;
      p.lShin = 1.2 * k;
      p.rThigh = 0.25 * k;
      p.rShin = 0.5 * k;
      p.lArm = 0.6 * k;
      p.rArm = -1.3 * k;
      p.rFore = -0.6;
      p.lean = 0.12;
    } else {
      p.lThigh = -0.45;
      p.lShin = 0.7;
      p.rThigh = -0.1;
      p.rShin = 0.4;
      p.lArm = -0.9;
      p.rArm = -0.9;
      p.lArmZ = 0.65;
      p.rArmZ = -0.65;
      p.lean = 0.05;
    }
    return p;
  }

  // --- grounded locomotion -------------------------------------------------
  if (walk > 0.02) {
    const A = 0.48 + run * 0.42;
    const sL = Math.sin(phi);
    const cL = Math.cos(phi);
    p.lThigh = -sL * A * walk;
    p.rThigh = sL * A * walk;
    p.lShin = (0.12 + Math.max(0, cL) * (0.75 + run * 0.6)) * walk;
    p.rShin = (0.12 + Math.max(0, -cL) * (0.75 + run * 0.6)) * walk;
    const B = 0.42 + run * 0.5;
    p.lArm = sL * B * walk;
    p.rArm = -sL * B * walk;
    p.lFore = -(0.25 + run * 1.0) * walk - 0.1;
    p.rFore = -(0.25 + run * 1.0) * walk - 0.1;
    p.hipY += (Math.abs(cL) - 0.6) * (0.045 + run * 0.06) * walk;
    p.twist = sL * (0.08 + run * 0.08) * walk;
    p.lean = (0.05 + run * 0.18) * walk;
    if (P.wade > 0.12) {
      p.lean += 0.08;
      p.lArmZ += 0.35;
      p.rArmZ -= 0.35;
    }
  }
  if (P.pushing) {
    p.lArm = -1.35;
    p.rArm = -1.35;
    p.lFore = -0.5;
    p.rFore = -0.5;
    p.lean = 0.38;
  }
  if (G.animAction && G.animAction.name === "interact") {
    const k = Math.min(1, G.animAction.t / 0.25) * (1 - Math.max(0, (G.animAction.t - 0.45) / 0.25));
    p.rArm = -1.25 * k + p.rArm * (1 - k);
    p.rFore = -0.3 * k + p.rFore * (1 - k);
    p.lean = Math.max(p.lean, 0.2 * k);
  }
  // landing crouch
  if (P.landT < 0.32) {
    const k = (1 - P.landT / 0.32) * (0.35 + P.landHard * 0.65);
    p.hipY -= 0.17 * k;
    p.lThigh -= 0.55 * k;
    p.rThigh -= 0.55 * k;
    p.lShin += 1.0 * k;
    p.rShin += 1.0 * k;
    p.lean += 0.2 * k;
  }
  return p;
}

/** A fixed pose for menus / the Explorer screen. */
export function menuPose(t, kind = "overlook") {
  const p = zeroPose();
  if (kind === "overlook") {
    p.lArm = 0.08;
    p.rArm = -0.35;
    p.lArmZ = 0.16;
    p.rArmZ = -0.22;
    p.lFore = -0.3;
    p.rFore = -1.2;
    p.headX = -0.08 + Math.sin(t * 0.4) * 0.03;
    p.headY = Math.sin(t * 0.21) * 0.25;
    p.hipY = Math.sin(t * 1.6) * 0.006;
    p.rThigh = -0.12;
    p.rShin = 0.15;
  } else {
    p.hipY = Math.sin(t * 1.9) * 0.008;
    p.lArmZ = 0.12;
    p.rArmZ = -0.12;
    p.lFore = -0.15;
    p.rFore = -0.15;
    p.headY = Math.sin(t * 0.5) * 0.3;
  }
  return p;
}

function Hat({ kind, color }) {
  if (kind === "none") {
    return (
      <mesh position={[0, 0.06, -0.01]} material={mats.plain("#4a3222")}>
        <sphereGeometry args={[0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      </mesh>
    );
  }
  if (kind === "beanie") {
    return (
      <group>
        <mesh position={[0, 0.04, 0]} material={mats.plain(color)}>
          <sphereGeometry args={[0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        <mesh position={[0, 0.03, 0]} material={mats.plain(color)}>
          <cylinderGeometry args={[0.133, 0.133, 0.05, 16]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} material={mats.plain("#f2efe6")}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
      </group>
    );
  }
  if (kind === "cap") {
    return (
      <group>
        <mesh position={[0, 0.05, 0]} material={mats.plain(color)}>
          <sphereGeometry args={[0.127, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        </mesh>
        <mesh position={[0, 0.05, 0.12]} rotation={[0.18, 0, 0]} material={mats.plain(color)}>
          <boxGeometry args={[0.2, 0.012, 0.12]} />
        </mesh>
      </group>
    );
  }
  if (kind === "bucket") {
    return (
      <group position={[0, 0.06, 0]}>
        <mesh material={mats.plain(color)}>
          <cylinderGeometry args={[0.11, 0.13, 0.11, 16]} />
        </mesh>
        <mesh position={[0, -0.045, 0]} rotation={[0, 0, 0]} material={mats.plain(color)}>
          <cylinderGeometry args={[0.21, 0.22, 0.012, 20]} />
        </mesh>
      </group>
    );
  }
  // explorer: crown + wide brim + band
  return (
    <group position={[0, 0.07, 0]}>
      <mesh material={mats.plain(color)}>
        <cylinderGeometry args={[0.1, 0.125, 0.13, 16]} />
      </mesh>
      <mesh position={[0, -0.025, 0]} material={mats.plain("#3a2a1c")}>
        <cylinderGeometry args={[0.127, 0.127, 0.03, 16]} />
      </mesh>
      <mesh position={[0, -0.06, 0]} material={mats.plain(color)}>
        <cylinderGeometry args={[0.24, 0.25, 0.012, 22]} />
      </mesh>
    </group>
  );
}

const SKIN = "#e2b08c";
const TROUSERS = "#6b6650";
const BOOT = "#5a3a22";
const SOLE = "#2a1f18";
const GLOVE = "#3a3530";

/**
 * The model. `poseFn(dt, t)` returns the target pose each frame;
 * `place(group)` (optional) positions / rotates the root each frame.
 */
export function ExplorerModel({ look, poseFn, place, castShadow = true }) {
  const root = useRef();
  const J = useRef({});
  const cur = useRef(zeroPose());
  const jacket = look?.jacket || JACKETS[0];
  const pack = look?.pack || PACKS[0];
  const hat = look?.hat || "none";
  const hatColor = look?.hatColor || "#7a5a3a";
  const reg = (k) => (o) => {
    if (o) J.current[k] = o;
  };
  const mJ = mats.plain(jacket, { roughness: 0.75 });
  const mJdark = useMemo(() => mats.plain(new THREE.Color(jacket).multiplyScalar(0.72).getStyle(), { roughness: 0.8 }), [jacket]);
  const mP = mats.plain(pack, { roughness: 0.85 });
  const mPdark = useMemo(() => mats.plain(new THREE.Color(pack).multiplyScalar(0.7).getStyle(), { roughness: 0.9 }), [pack]);
  const mT = mats.plain(TROUSERS);
  const mB = mats.plain(BOOT);
  const mS = mats.plain(SOLE);
  const mSkin = mats.plain(SKIN, { roughness: 0.65 });
  const mG = mats.plain(GLOVE);

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const target = poseFn(dt, st.clock.elapsedTime);
    const c = cur.current;
    const k = 1 - Math.exp(-dt * 16);
    for (const key of POSE_KEYS) c[key] += (target[key] - c[key]) * k;
    const j = J.current;
    if (!j.hips) return;
    j.hips.position.y = 0.96 + c.hipY;
    j.hips.rotation.y = c.twist * 0.5;
    j.torso.rotation.set(c.lean, -c.twist, 0);
    j.head.rotation.set(c.headX, c.headY, 0);
    j.lThigh.rotation.set(c.lThigh, 0, c.lThighZ + 0.04);
    j.rThigh.rotation.set(c.rThigh, 0, c.rThighZ - 0.04);
    j.lShin.rotation.x = c.lShin;
    j.rShin.rotation.x = c.rShin;
    j.lArm.rotation.set(c.lArm, 0, c.lArmZ);
    j.rArm.rotation.set(c.rArm, 0, c.rArmZ);
    j.lFore.rotation.x = c.lFore;
    j.rFore.rotation.x = c.rFore;
    // keep the feet roughly level
    j.lFoot.rotation.x = -(c.lThigh + c.lShin) * 0.6;
    j.rFoot.rotation.x = -(c.rThigh + c.rShin) * 0.6;
    if (place && root.current) place(root.current, dt);
  });

  const limb = (len, r, mat) => (
    <mesh position={[0, -len / 2, 0]} material={mat} castShadow={castShadow}>
      <capsuleGeometry args={[r, Math.max(0.01, len - r * 2), 4, 10]} />
    </mesh>
  );

  return (
    <group ref={root}>
      <group ref={reg("hips")} position={[0, 0.96, 0]}>
        {/* pelvis + belt */}
        <mesh material={mT} castShadow={castShadow}>
          <boxGeometry args={[0.32, 0.16, 0.2]} />
        </mesh>
        <mesh position={[0, 0.07, 0]} material={mS}>
          <boxGeometry args={[0.33, 0.035, 0.21]} />
        </mesh>
        {/* legs */}
        {[
          ["l", 0.095],
          ["r", -0.095],
        ].map(([s, x]) => (
          <group key={s} ref={reg(`${s}Thigh`)} position={[x, -0.04, 0]}>
            {limb(0.43, 0.075, mT)}
            <group ref={reg(`${s}Shin`)} position={[0, -0.43, 0]}>
              {limb(0.39, 0.064, mT)}
              <group ref={reg(`${s}Foot`)} position={[0, -0.4, 0]}>
                <mesh position={[0, -0.02, 0.045]} material={mB} castShadow={castShadow}>
                  <boxGeometry args={[0.13, 0.11, 0.26]} />
                </mesh>
                <mesh position={[0, -0.075, 0.045]} material={mS}>
                  <boxGeometry args={[0.14, 0.03, 0.275]} />
                </mesh>
                <mesh position={[0, 0.04, 0.0]} material={mB}>
                  <cylinderGeometry args={[0.07, 0.068, 0.08, 10]} />
                </mesh>
              </group>
            </group>
          </group>
        ))}
        {/* torso */}
        <group ref={reg("torso")} position={[0, 0.05, 0]}>
          <mesh position={[0, 0.25, 0]} scale={[1.18, 1, 0.82]} material={mJ} castShadow={castShadow}>
            <capsuleGeometry args={[0.165, 0.24, 6, 14]} />
          </mesh>
          {/* hem + zip + collar */}
          <mesh position={[0, 0.06, 0]} scale={[1.2, 1, 0.84]} material={mJdark}>
            <cylinderGeometry args={[0.168, 0.17, 0.05, 16]} />
          </mesh>
          <mesh position={[0, 0.27, 0.137]} material={mJdark}>
            <boxGeometry args={[0.018, 0.36, 0.01]} />
          </mesh>
          <mesh position={[0, 0.47, 0]} material={mJdark} castShadow={castShadow}>
            <cylinderGeometry args={[0.085, 0.12, 0.08, 14]} />
          </mesh>
          {/* chest pocket */}
          <mesh position={[0.075, 0.33, 0.128]} material={mJdark}>
            <boxGeometry args={[0.07, 0.07, 0.012]} />
          </mesh>
          {/* backpack */}
          <group position={[0, 0.26, -0.17]}>
            <mesh material={mP} castShadow={castShadow}>
              <boxGeometry args={[0.3, 0.42, 0.18]} />
            </mesh>
            <mesh position={[0, 0.2, 0.01]} material={mPdark}>
              <boxGeometry args={[0.31, 0.06, 0.2]} />
            </mesh>
            <mesh position={[0, -0.07, -0.1]} material={mPdark}>
              <boxGeometry args={[0.22, 0.16, 0.04]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.165, -0.05, 0]} material={mPdark}>
                <boxGeometry args={[0.04, 0.16, 0.12]} />
              </mesh>
            ))}
            {/* bedroll */}
            <mesh position={[0, 0.27, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.plain("#8f7a52")} castShadow={castShadow}>
              <cylinderGeometry args={[0.075, 0.075, 0.38, 12]} />
            </mesh>
            {/* straps */}
            {[-1, 1].map((s) => (
              <mesh key={`st${s}`} position={[s * 0.09, 0.05, 0.12]} material={mS}>
                <boxGeometry args={[0.035, 0.42, 0.02]} />
              </mesh>
            ))}
          </group>
          {/* head */}
          <group ref={reg("head")} position={[0, 0.5, 0]}>
            <mesh position={[0, 0.03, 0]} material={mSkin}>
              <cylinderGeometry args={[0.045, 0.05, 0.07, 10]} />
            </mesh>
            <group position={[0, 0.14, 0]}>
              <mesh material={mSkin} castShadow={castShadow}>
                <sphereGeometry args={[0.115, 18, 14]} />
              </mesh>
              <mesh position={[0, -0.01, 0.112]} material={mSkin}>
                <sphereGeometry args={[0.022, 8, 6]} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.042, 0.02, 0.1]} material={mats.plain("#2a201a")}>
                  <sphereGeometry args={[0.013, 6, 5]} />
                </mesh>
              ))}
              <Hat kind={hat} color={hatColor} />
            </group>
          </group>
          {/* arms */}
          {[
            ["l", 0.225],
            ["r", -0.225],
          ].map(([s, x]) => (
            <group key={s} ref={reg(`${s}Arm`)} position={[x, 0.42, 0]}>
              <mesh material={mJ} castShadow={castShadow}>
                <sphereGeometry args={[0.07, 10, 8]} />
              </mesh>
              {limb(0.28, 0.056, mJ)}
              <group ref={reg(`${s}Fore`)} position={[0, -0.28, 0]}>
                {limb(0.25, 0.05, mJ)}
                <mesh position={[0, -0.27, 0.005]} material={mG} castShadow={castShadow}>
                  <sphereGeometry args={[0.052, 10, 8]} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/** The in-game explorer, following the engine. */
export default function Explorer({ game, look, shadows }) {
  const poseFn = (dt, t) => poseFromGame(game, t);
  const vis = useRef({ yaw: game.player.facing });
  const place = (g, dt) => {
    const P = game.player;
    g.position.set(P.x, P.y, P.z);
    // smooth the visual facing so snaps (climbs, respawns) never pop
    let d = P.facing - vis.current.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    vis.current.yaw += d * Math.min(1, dt * 18);
    g.rotation.y = vis.current.yaw;
    g.visible = !(game.state === "RESPAWNING" && game.respawn && game.respawn.t < 0.375);
  };
  return <ExplorerModel look={look} poseFn={poseFn} place={place} castShadow={shadows} />;
}
