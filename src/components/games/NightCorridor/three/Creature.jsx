/**
 * Night Corridor — the creature's body.
 *
 * A procedural rig, built to read as a silhouette: ~2.45 m tall, starved
 * thin, arms that hang past its knees with long fingers, a pale stretched
 * face with hollow eyes that catch the flashlight, and ragged cloth that
 * sways. It's designed for darkness, doorways and the far end of a
 * corridor — movement and posture do the work, not close-up detail.
 *
 * Animation is procedural per engine `anim`: idle (breathing + sudden head
 * twitches), walk (slow, heavy, head tilted), run (hunched, arms reaching),
 * bang (hammering a door), lunge (the catch), look (searching).
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { faceTexture, clothTexture } from "./textures.js";

const HIP_Y = 1.16;
const tmpHead = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();

function useRigMaterials() {
  return useMemo(() => {
    // Near-black, slightly wet skin: in the beam it shows sheen and bone, not colour.
    const skin = new THREE.MeshStandardMaterial({ color: "#161413", roughness: 0.36, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: "#0b0a09", roughness: 0.85 });
    const face = new THREE.MeshStandardMaterial({ map: faceTexture(), transparent: true, roughness: 0.42, color: "#bdb5a8" });
    const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: "#24201c" });
    const eye = new THREE.MeshBasicMaterial({ color: "#ffe2b0", toneMapped: false });
    return { skin, dark, face, cloth, eye };
  }, []);
}

/** A tapered bone with rounded joint at its end. */
function Limb({ length, r0, r1, mat, children, innerRef, shadows }) {
  return (
    <group ref={innerRef}>
      <mesh position={[0, -length / 2, 0]} material={mat} castShadow={shadows}>
        <cylinderGeometry args={[r0, r1, length, 12]} />
      </mesh>
      <mesh position={[0, -length, 0]} material={mat}>
        <sphereGeometry args={[r1 * 1.25, 10, 8]} />
      </mesh>
      <group position={[0, -length, 0]}>{children}</group>
    </group>
  );
}

function useRigShapes() {
  return useMemo(() => {
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18);
    // Starved waist widening into a ribcage, sloping into a long neck.
    const abdomen = lathe([[0.001, -0.02], [0.1, 0], [0.085, 0.12], [0.07, 0.26], [0.085, 0.42], [0.12, 0.56], [0.001, 0.57]]);
    const chest = lathe([[0.001, -0.03], [0.12, -0.02], [0.17, 0.08], [0.2, 0.2], [0.205, 0.3], [0.17, 0.38], [0.09, 0.44], [0.045, 0.47], [0.001, 0.48]]);
    return { abdomen, chest };
  }, []);
}

function Hand({ mat, side, shadows }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]} material={mat} castShadow={shadows}>
        <boxGeometry args={[0.07, 0.13, 0.035]} />
      </mesh>
      {[-0.026, -0.009, 0.009, 0.026].map((x, i) => (
        <group key={x} position={[x, -0.12, 0]} rotation={[0.25 + i * 0.05, 0, side * (x * 2)]}>
          <mesh position={[0, -0.11, 0]} material={mat} castShadow={shadows}>
            <cylinderGeometry args={[0.009, 0.004, 0.22, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Creature({ creature, shadows, eyeGlowRef, paused })  {
  const m = useRigMaterials();
  const shapes = useRigShapes();
  const { camera } = useThree();
  const root = useRef();
  const body = useRef();
  const spine = useRef();
  const chest = useRef();
  const neck = useRef();
  const head = useRef();
  const eyes = useRef();
  const thighL = useRef();
  const thighR = useRef();
  const shinL = useRef();
  const shinR = useRef();
  const armL = useRef();
  const armR = useRef();
  const foreL = useRef();
  const foreR = useRef();
  const clothRefs = useRef([]);
  const st = useRef({ phase: 0, twitch: 0, twitchT: 2, twitchX: 0, twitchZ: 0 });

  useFrame((state, dt) => {
    const c = creature;
    const g = root.current;
    if (!g) return;
    const visible = c.state !== "HIDDEN";
    g.visible = visible;
    if (!visible) return;
    dt = paused ? 0 : Math.min(dt, 0.05);
    const s = st.current;
    g.position.set(c.x, 0, c.z);
    // engine yaw: forward = (-sin, -cos); the rig faces +Z, so add PI.
    g.rotation.y = c.yaw + Math.PI;

    const anim = c.anim;
    const speed = Math.max(0.2, c.speed || 0);
    const run = anim === "run";
    s.phase += dt * (run ? 2 + speed * 1.15 : anim === "walk" ? 0.6 + speed * 1.6 : 0);
    const ph = s.phase;
    const t = state.clock.elapsedTime;

    // Sudden twitches — the head snaps to an unnatural angle and back.
    s.twitchT -= dt;
    if (s.twitchT <= 0) {
      s.twitchT = run ? 0.6 + Math.random() * 0.8 : 1.4 + Math.random() * 3;
      s.twitchX = (Math.random() - 0.5) * 0.7;
      s.twitchZ = (Math.random() - 0.5) * 1.1;
      s.twitch = 1;
    }
    s.twitch = Math.max(0, s.twitch - dt * 3.5);
    const tw = s.twitch > 0.6 ? 1 : s.twitch / 0.6;

    let lean = 0.12;
    let bob = 0;
    let legSwing = 0;
    let knee = 0.12;
    let armX = 0.06;
    let armZ = 0.17;
    let fore = -0.1;
    let headX = 0.15;
    let headZ = 0.32;
    let headY = 0;
    let breathe = Math.sin(t * 1.6) * 0.02;

    if (anim === "walk" || anim === "look") {
      legSwing = anim === "walk" ? Math.sin(ph) * 0.42 : 0;
      knee = 0.15 + Math.max(0, -Math.sin(ph)) * 0.55;
      armX = 0.05 - Math.sin(ph) * 0.18;
      bob = Math.abs(Math.cos(ph)) * 0.04;
      lean = 0.2;
      headY = c.headYaw || 0;
    } else if (run) {
      legSwing = Math.sin(ph) * 0.95;
      knee = 0.3 + Math.max(0, -Math.sin(ph)) * 1.2;
      lean = 0.62;
      armX = -1.25 + Math.sin(ph + Math.PI) * 0.55;
      armZ = 0.28;
      fore = -0.45;
      bob = Math.abs(Math.sin(ph)) * 0.1;
      headX = -0.25;
      headZ = 0.12;
      breathe = Math.sin(t * 9) * 0.03;
    } else if (anim === "bang") {
      lean = 0.35;
      const hit = Math.max(0, Math.sin(t * 11));
      armX = -1.9 + hit * 0.7;
      armZ = 0.15;
      fore = -0.6 + hit * 0.4;
      headX = 0.1;
      headZ = 0.05;
    } else if (anim === "lunge") {
      lean = 0.95;
      knee = 0.9;
      bob = -0.22;
      armX = -1.6;
      armZ = 1.05;
      fore = -0.35;
      headX = -0.35;
      headZ = 0;
      breathe = Math.sin(t * 20) * 0.04;
    } else {
      // idle: still, too still
      armX = 0.02 + Math.sin(t * 0.7) * 0.03;
      headY = c.headYaw || 0;
    }

    body.current.position.y = HIP_Y + bob;
    spine.current.rotation.x = lean;
    chest.current.scale.set(1 + breathe, 1 + breathe * 0.5, 1 + breathe);
    head.current.rotation.set(headX + s.twitchX * tw, headY, headZ + s.twitchZ * tw);
    neck.current.rotation.x = run ? -0.35 : 0.25;
    thighL.current.rotation.x = -legSwing - lean * 0.4;
    thighR.current.rotation.x = legSwing - lean * 0.4;
    shinL.current.rotation.x = knee * (legSwing > 0 ? 1 : 0.4) + 0.05;
    shinR.current.rotation.x = knee * (legSwing < 0 ? 1 : 0.4) + 0.05;
    armL.current.rotation.set(armX, 0, armZ);
    armR.current.rotation.set(run ? -1.25 + Math.sin(ph) * 0.55 : anim === "bang" ? armX + 0.4 * Math.sin(t * 11 + 1.5) : anim === "walk" ? 0.05 + Math.sin(ph) * 0.18 : armX, 0, -armZ);
    foreL.current.rotation.x = fore;
    foreR.current.rotation.x = fore;
    clothRefs.current.forEach((cl, i) => {
      if (cl) cl.rotation.x = 0.1 + Math.sin(t * (run ? 9 : 1.5) + i * 1.7) * (run ? 0.35 : 0.08) + (run ? 0.45 : 0);
    });
    // The catch: hunch in and put that face right in front of the camera, in the beam.
    if (anim === "lunge") {
      neck.current.rotation.x = -0.75;
      head.current.rotation.set(-0.35 + s.twitchX * tw * 0.3, 0, 0.12 + s.twitchZ * tw * 0.3);
      g.updateMatrixWorld(true);
      head.current.getWorldPosition(tmpHead);
      tmpHead.y += 0.08;
      camera.getWorldDirection(tmpFwd);
      const k = Math.min(1, (c.lungeT = (c.lungeT || 0) + dt) / 0.18);
      const tx = camera.position.x + tmpFwd.x * 0.6;
      const ty = camera.position.y + tmpFwd.y * 0.6 - 0.04;
      const tz = camera.position.z + tmpFwd.z * 0.6;
      g.position.x += (tx - tmpHead.x) * k;
      g.position.y += (ty - tmpHead.y) * k;
      g.position.z += (tz - tmpHead.z) * k;
    } else c.lungeT = 0;
    if (eyes.current) {
      const glow = eyeGlowRef?.current ?? 0.35;
      eyes.current.children.forEach((e) => e.material.color.setRGB(1 * glow, 0.88 * glow, 0.69 * glow));
    }
  });

  const sh = shadows;
  return (
    <group ref={root} visible={false}>
      <group ref={body} position={[0, HIP_Y, 0]}>
        {/* pelvis */}
        <mesh material={m.dark} castShadow={sh}>
          <boxGeometry args={[0.24, 0.14, 0.14]} />
        </mesh>
        {/* legs */}
        {[[-0.1, thighL, shinL], [0.1, thighR, shinR]].map(([x, tRef, sRef]) => (
          <group key={x} position={[x, -0.04, 0]}>
            <Limb innerRef={tRef} length={0.6} r0={0.065} r1={0.042} mat={m.skin} shadows={sh}>
              <Limb innerRef={sRef} length={0.56} r0={0.04} r1={0.03} mat={m.skin} shadows={sh}>
                <mesh position={[0, -0.01, 0.08]} material={m.dark} castShadow={sh}>
                  <boxGeometry args={[0.07, 0.04, 0.24]} />
                </mesh>
              </Limb>
            </Limb>
          </group>
        ))}
        {/* torso */}
        <group ref={spine} position={[0, 0.05, 0]}>
          <mesh material={m.skin} castShadow={sh} scale={[1, 1, 0.72]} geometry={shapes.abdomen} />
          <group ref={chest} position={[0, 0.55, 0]}>
            <mesh material={m.skin} castShadow={sh} scale={[1.18, 1, 0.62]} geometry={shapes.chest} />
            {/* hunched shoulder blades */}
            <mesh position={[0, 0.3, -0.05]} material={m.skin} castShadow={sh} scale={[1.05, 0.42, 0.55]}>
              <sphereGeometry args={[0.24, 16, 10]} />
            </mesh>
            {/* rib ridges */}
            {[0.02, 0.1, 0.18].map((y) => (
              <mesh key={y} position={[0, y, 0.07]} material={m.dark} scale={[1, 1, 0.5]}>
                <torusGeometry args={[0.13, 0.008, 4, 12, Math.PI]} />
              </mesh>
            ))}
            {/* ragged cloth */}
            {[-0.2, -0.11, -0.02, 0.08, 0.17, 0.22].map((x, i) => (
              <mesh key={x} ref={(r) => (clothRefs.current[i] = r)} position={[x, -0.05, 0.1 - (i % 2) * 0.2]} material={m.cloth} castShadow={sh}>
                <planeGeometry args={[0.15, 0.95]} />
              </mesh>
            ))}
            {/* neck + head */}
            <group ref={neck} position={[0, 0.3, 0.02]}>
              <mesh position={[0, 0.1, 0]} material={m.skin} castShadow={sh}>
                <cylinderGeometry args={[0.035, 0.045, 0.22, 6]} />
              </mesh>
              <group ref={head} position={[0, 0.24, 0.02]}>
                <mesh position={[0, 0.08, 0]} material={m.skin} scale={[0.12, 0.2, 0.14]} castShadow={sh}>
                  <sphereGeometry args={[1, 24, 18]} />
                </mesh>
                <mesh position={[0, 0.08, 0]} material={m.face} scale={[0.124, 0.205, 0.145]}>
                  <sphereGeometry args={[1.02, 32, 24, Math.PI / 2 - 1.0, 2.0, 0.35, 1.95]} />
                </mesh>
                <group ref={eyes} position={[0, 0.115, 0.128]}>
                  {[-0.04, 0.04].map((x) => (
                    <mesh key={x} position={[x, 0, 0]}>
                      <sphereGeometry args={[0.009, 6, 6]} />
                      <meshBasicMaterial color="#ffe2b0" toneMapped={false} />
                    </mesh>
                  ))}
                </group>
              </group>
            </group>
            {/* arms — far too long */}
            {[[-1, armL, foreL], [1, armR, foreR]].map(([side, aRef, fRef]) => (
              <group key={side} position={[side * 0.27, 0.25, 0]}>
                <mesh material={m.skin} castShadow={sh}>
                  <sphereGeometry args={[0.05, 8, 6]} />
                </mesh>
                <Limb innerRef={aRef} length={0.74} r0={0.042} r1={0.03} mat={m.skin} shadows={sh}>
                  <Limb innerRef={fRef} length={0.72} r0={0.03} r1={0.02} mat={m.skin} shadows={sh}>
                    <Hand mat={m.skin} side={side} shadows={sh} />
                  </Limb>
                </Limb>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
