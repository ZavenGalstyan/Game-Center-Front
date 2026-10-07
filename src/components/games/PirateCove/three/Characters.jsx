/**
 * Pirate Cove — characters. One jointed rig (hips → torso → chest → head,
 * shoulders → elbows, hips → knees) dressed per type, posed procedurally
 * every frame from engine state. No skinned meshes, no animation files:
 *
 *   pirate    coat, tricorn, bag, cutlass · walk/run/sprint, 3-hit combo,
 *             block, dodge roll, dig (with shovel), open, jump, hurt, fall
 *   grunt     bandana, vest, cutlass       · telegraphed windup → strike
 *   captain   big coat, plumed hat, beard  · heavier, slower windup
 *   skeleton  bones + rags, rusty blade    · rattly, quick
 *   guardian  armoured giant skeleton, glowing eyes, greatsword
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M } from "./materials.js";
import { ATTACKS } from "../engine/onfoot.js";

const G = {};
function geo(key, make) {
  if (!G[key]) G[key] = make();
  return G[key];
}
export function disposeCharacterGeometry() {
  for (const k of Object.keys(G)) {
    G[k].dispose();
    delete G[k];
  }
}
const cyl = (rt, rb, h, s = 8) => geo(`c${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s).translate(0, -h / 2, 0));
const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r, w = 10, h = 8) => geo(`s${r}_${w}`, () => new THREE.SphereGeometry(r, w, h));

const LOOKS = {
  pirate: { coat: "#7c1f1c", shirt: "#efe6d2", pants: "#46372a", boots: "#1c1612", belt: "#3a2416", skin: "#c99a72", hat: "tricorn", hatCol: "#1a1614", skirt: true, bag: true, hair: "#2a1a10", sword: "cutlass" },
  grunt: { coat: "#3c4c5e", shirt: "#d8d0bf", pants: "#5a4a38", boots: "#241a12", belt: "#3a2a1a", skin: "#b88660", hat: "bandana", hatCol: "#a3302a", skirt: false, sword: "cutlass", stripes: true },
  captain: { coat: "#1f2b4c", shirt: "#e8e0cc", pants: "#2e2620", boots: "#121010", belt: "#2a1a10", skin: "#b07a58", hat: "plume", hatCol: "#141414", skirt: true, beard: true, sword: "sabre" },
  skeleton: { bone: true, rags: "#5a5244", sword: "rusty", eyes: "#9fffd0" },
  guardian: { bone: true, armor: true, rags: "#3a3a46", sword: "great", eyes: "#7fffb8" },
};

function Sword({ kind }) {
  const len = kind === "great" ? 1.5 : kind === "sabre" ? 0.95 : 0.85;
  const metal = kind === "rusty" ? M.accent("#7a5a40") : M.accent("#d8dde2");
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={box(0.05, 0.16, 0.05)} material={M.darkWood()} position={[0, 0.02, 0]} />
      <mesh geometry={box(kind === "great" ? 0.42 : 0.26, 0.04, 0.07)} material={M.brass()} position={[0, -0.07, 0]} />
      <mesh geometry={box(kind === "great" ? 0.12 : 0.07, len, 0.018)} material={metal} position={[0, -0.09 - len / 2, 0]} castShadow />
    </group>
  );
}

function Hat({ L }) {
  if (L.hat === "tricorn" || L.hat === "plume") {
    const big = L.hat === "plume" ? 1.18 : 1;
    return (
      <group position={[0, 0.17, 0]} scale={big}>
        <mesh geometry={geo("hatBrim", () => new THREE.CylinderGeometry(0.3, 0.3, 0.04, 3))} material={M.cloth(L.hatCol)} rotation={[0, Math.PI, 0]} castShadow />
        <mesh geometry={geo("hatTrim", () => new THREE.TorusGeometry(0.255, 0.018, 4, 3))} material={M.brass()} rotation={[Math.PI / 2, 0, Math.PI / 6]} position={[0, 0.02, 0]} />
        <mesh geometry={geo("hatCrown", () => new THREE.CylinderGeometry(0.13, 0.17, 0.2, 10).translate(0, 0.1, 0))} material={M.cloth(L.hatCol)} castShadow />
        {L.hat === "plume" && (
          <mesh geometry={geo("plume", () => new THREE.ConeGeometry(0.06, 0.55, 6).rotateZ(-1.0).translate(0.2, 0.25, -0.05))} material={M.cloth("#e8e4da")} />
        )}
      </group>
    );
  }
  if (L.hat === "bandana") {
    return (
      <group>
        <mesh geometry={geo("band", () => new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55))} material={M.cloth(L.hatCol)} position={[0, 0.03, 0]} />
        <mesh geometry={box(0.08, 0.16, 0.04)} material={M.cloth(L.hatCol)} position={[0, -0.02, -0.17]} rotation={[0.4, 0, 0]} />
      </group>
    );
  }
  return null;
}

/** A dressed rig. `parts` collects refs for posing. */
function Rig({ type, parts }) {
  const L = LOOKS[type] || LOOKS.grunt;
  const bone = L.bone;
  const skin = bone ? M.bone() : M.skin(L.skin);
  const coat = bone ? M.cloth(L.rags) : M.cloth(L.coat);
  const shirt = bone ? M.bone() : L.stripes ? M.tent("#d8d0bf", "#3a4a6a") : M.cloth(L.shirt);
  const pants = bone ? M.bone() : M.cloth(L.pants);
  const boots = bone ? M.bone() : M.cloth(L.boots);
  const limbR = bone ? 0.035 : 0.065;
  const set = (k) => (el) => (parts.current[k] = el);
  const leg = (side) => (
    <group ref={set(`leg${side}`)} position={[side === "L" ? 0.11 : -0.11, 0, 0]}>
      <mesh geometry={cyl(limbR + 0.02, limbR + 0.005, 0.46)} material={pants} castShadow />
      <group ref={set(`knee${side}`)} position={[0, -0.45, 0]}>
        <mesh geometry={cyl(limbR + 0.005, limbR - 0.005, 0.42)} material={bone ? pants : boots} castShadow />
        <mesh geometry={box(bone ? 0.07 : 0.12, 0.08, bone ? 0.16 : 0.24)} material={boots} position={[0, -0.44, 0.04]} castShadow />
        {!bone && <mesh geometry={cyl(0.085, 0.08, 0.16)} material={boots} position={[0, -0.18, 0]} />}
      </group>
    </group>
  );
  const arm = (side) => (
    <group ref={set(`arm${side}`)} position={[side === "L" ? 0.23 : -0.23, 0.2, 0]}>
      <mesh geometry={cyl(limbR + 0.01, limbR, 0.3)} material={bone ? skin : coat} castShadow />
      <group ref={set(`elbow${side}`)} position={[0, -0.29, 0]}>
        <mesh geometry={cyl(limbR, limbR - 0.008, 0.27)} material={bone ? skin : shirt} castShadow />
        <mesh geometry={sph(0.055, 6, 5)} material={skin} position={[0, -0.3, 0]} />
        {side === "R" && (
          <group ref={set("sword")} position={[0, -0.31, 0.02]}>
            <Sword kind={L.sword} />
          </group>
        )}
        {side === "L" && type === "pirate" && (
          <group ref={set("shovel")} position={[0, -0.31, 0]} visible={false}>
            <mesh geometry={box(0.04, 1.1, 0.04)} material={M.wood()} position={[0, -0.1, 0.3]} rotation={[1.2, 0, 0]} />
            <mesh geometry={box(0.2, 0.26, 0.02)} material={M.iron()} position={[0, -0.32, 0.78]} rotation={[1.2, 0, 0]} />
          </group>
        )}
      </group>
    </group>
  );
  return (
    <group ref={set("hips")} position={[0, 0.94, 0]}>
      {leg("L")}
      {leg("R")}
      <mesh geometry={box(bone ? 0.22 : 0.3, 0.14, bone ? 0.12 : 0.2)} material={bone ? skin : pants} position={[0, 0.02, 0]} castShadow />
      <group ref={set("torso")}>
        {bone ? (
          <>
            <mesh geometry={cyl(0.04, 0.04, 0.42)} material={skin} position={[0, 0.48, 0]} />
            {[0.1, 0.18, 0.26, 0.34].map((y) => (
              <mesh key={y} geometry={geo(`rib${y}`, () => new THREE.TorusGeometry(0.13 - y * 0.08, 0.02, 4, 10, Math.PI * 1.5).rotateX(Math.PI / 2).rotateY(Math.PI * 0.75))} material={skin} position={[0, y + 0.1, 0]} />
            ))}
            <mesh geometry={box(0.34, 0.24, 0.05)} material={coat} position={[0.02, 0.28, -0.1]} rotation={[0.1, 0, 0.1]} />
          </>
        ) : (
          <>
            <mesh geometry={cyl(0.19, 0.17, 0.46)} material={shirt} position={[0, 0.5, 0]} castShadow />
            <mesh geometry={geo("coatBody", () => new THREE.CylinderGeometry(0.205, 0.19, 0.44, 10, 1, true, Math.PI * 0.18, Math.PI * 1.64).translate(0, -0.22, 0))} material={coat} position={[0, 0.5, 0]} castShadow />
            <mesh geometry={cyl(0.185, 0.185, 0.07)} material={M.cloth(L.belt)} position={[0, 0.1, 0]} />
            <mesh geometry={box(0.08, 0.06, 0.03)} material={M.brass()} position={[0, 0.07, 0.185]} />
            {L.skirt && <mesh geometry={geo("skirt", () => new THREE.CylinderGeometry(0.2, 0.3, 0.42, 10, 1, true, Math.PI * 0.2, Math.PI * 1.6).translate(0, -0.21, 0))} material={coat} position={[0, 0.06, 0]} castShadow />}
            {L.bag && <mesh geometry={box(0.16, 0.18, 0.08)} material={M.cloth("#6b4a2c")} position={[0.21, -0.04, 0.05]} rotation={[0, 0, 0.1]} />}
            {L.armor && <mesh geometry={box(0.42, 0.4, 0.3)} material={M.iron()} position={[0, 0.32, 0]} />}
          </>
        )}
        {L.armor && <mesh geometry={box(0.46, 0.34, 0.3)} material={M.iron()} position={[0, 0.34, 0]} castShadow />}
        <group ref={set("chest")} position={[0, 0.52, 0]}>
          {arm("L")}
          {arm("R")}
          {L.armor && (
            <>
              <mesh geometry={sph(0.12, 8, 6)} material={M.iron()} position={[0.27, 0.22, 0]} />
              <mesh geometry={sph(0.12, 8, 6)} material={M.iron()} position={[-0.27, 0.22, 0]} />
            </>
          )}
          <group ref={set("head")} position={[0, 0.36, 0]}>
            {!bone && <mesh geometry={cyl(0.06, 0.07, 0.1)} material={skin} position={[0, -0.02, 0]} />}
            <mesh geometry={sph(bone ? 0.14 : 0.15, 12, 10)} material={skin} position={[0, 0.08, 0]} castShadow />
            {bone ? (
              <>
                <mesh geometry={box(0.16, 0.08, 0.1)} material={skin} position={[0, -0.02, 0.04]} />
                {[-0.05, 0.05].map((x) => (
                  <mesh key={x} geometry={sph(0.032, 6, 5)} material={M.emissive(L.eyes, 2)} position={[x, 0.09, 0.12]} />
                ))}
              </>
            ) : (
              <>
                {[-0.05, 0.05].map((x) => (
                  <mesh key={x} geometry={sph(0.018, 6, 5)} material={M.cloth("#141010")} position={[x, 0.1, 0.14]} />
                ))}
                <mesh geometry={box(0.03, 0.05, 0.04)} material={skin} position={[0, 0.06, 0.155]} />
                {L.hair && <mesh geometry={geo("hair", () => new THREE.SphereGeometry(0.155, 10, 6, Math.PI * 0.6, Math.PI * 0.8, 0.2, Math.PI * 0.55))} material={M.cloth(L.hair)} position={[0, 0.08, -0.01]} />}
                {L.beard && <mesh geometry={geo("beard", () => new THREE.ConeGeometry(0.11, 0.2, 8).rotateX(Math.PI).translate(0, -0.02, 0.09))} material={M.cloth("#2a1a10")} />}
              </>
            )}
            {L.armor ? <mesh geometry={geo("helm", () => new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5))} material={M.iron()} position={[0, 0.1, 0]} /> : <Hat L={L} />}
          </group>
        </group>
      </group>
    </group>
  );
}

const lerp = (a, b, t) => a + (b - a) * t;
const _bq = new THREE.Quaternion();
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

/** Pose for the pirate's combo: returns shoulder/elbow/torso angles for combo k at progress u (0..1). */
function attackPose(k, u) {
  if (k === 0) {
    // forehand slash, right to left
    const w = ease(u / 0.3);
    const s = ease((u - 0.25) / 0.35);
    return { ax: lerp(-1.2, -1.45, s), ay: lerp(lerp(0, -1.0, w), 1.1, s), az: lerp(0, -0.5, w), ex: -0.4, twist: lerp(lerp(0, -0.5, w), 0.55, s) };
  }
  if (k === 1) {
    // backhand, left to right
    const w = ease(u / 0.25);
    const s = ease((u - 0.22) / 0.35);
    return { ax: lerp(-1.3, -1.4, s), ay: lerp(lerp(0, 1.0, w), -1.1, s), az: lerp(0, 0.4, w), ex: -0.6, twist: lerp(lerp(0, 0.5, w), -0.6, s) };
  }
  // overhead chop
  const w = ease(u / 0.35);
  const s = ease((u - 0.32) / 0.25);
  return { ax: lerp(lerp(-0.3, -2.9, w), -0.5, s), ay: 0, az: 0, ex: lerp(-0.6, -0.15, s), twist: 0, bend: lerp(lerp(0, -0.15, w), 0.35, s) };
}

export function Character({ body, type, hpBar = false }) {
  const root = useRef();
  const parts = useRef({});
  const bar = useRef();
  const fill = useRef();
  const scale = type === "captain" ? 1.12 : type === "guardian" ? 1.32 : 1;
  const smooth = useRef({ speed: 0, air: 0 });
  const barMats = useMemo(
    () => [new THREE.MeshBasicMaterial({ color: "#1a0f0a", transparent: true, opacity: 0.7, depthTest: false }), new THREE.MeshBasicMaterial({ color: "#e8433a", depthTest: false })],
    [],
  );

  useFrame(({ clock, camera }, dt) => {
    const P = parts.current;
    const r = root.current;
    if (!r || !P.hips) return;
    const t = clock.elapsedTime;
    r.position.set(body.x, body.y, body.z);
    r.rotation.y = body.yaw;
    const isPirate = type === "pirate";
    const st = body.state;
    const sm = smooth.current;
    const spd = isPirate ? body.speed : Math.hypot(body.vx || 0, body.vz || 0);
    sm.speed += (spd - sm.speed) * Math.min(1, dt * 8);
    const run = Math.min(1, sm.speed / 6);
    const walkPhase = (body.moveAnim ?? body.walk ?? 0) * (2.2 - run * 0.7);
    const sw = Math.sin(walkPhase);
    const amp = Math.min(1, sm.speed / 2.2) * (0.55 + run * 0.35);
    // defaults
    let legL = sw * amp;
    let legR = -sw * amp;
    let kneeL = Math.max(0, -Math.cos(walkPhase)) * amp * 1.1;
    let kneeR = Math.max(0, Math.cos(walkPhase)) * amp * 1.1;
    let armLx = -sw * amp * 0.8;
    let armRx = sw * amp * 0.6 - 0.15;
    let armLz = 0.1;
    let armRz = -0.1;
    let armRy = 0;
    let elbowL = -0.3 - run * 0.5;
    let elbowR = -0.4 - run * 0.4;
    let twist = 0;
    let bend = run * 0.18;
    let hipY = 0.94 - Math.abs(Math.cos(walkPhase)) * 0.05 * amp + Math.sin(t * 1.6) * 0.008;
    let rootTilt = 0;
    let shovel = false;

    const airborne = isPirate && !body.grounded;
    sm.air += ((airborne ? 1 : 0) - sm.air) * Math.min(1, dt * 10);
    if (sm.air > 0.01) {
      legL = lerp(legL, -0.6, sm.air);
      legR = lerp(legR, 0.25, sm.air);
      kneeL = lerp(kneeL, 1.1, sm.air);
      kneeR = lerp(kneeR, 0.5, sm.air);
      armLx = lerp(armLx, -0.9, sm.air);
      armLz = lerp(armLz, 0.6, sm.air);
    }

    if (isPirate) {
      if (st === "attack") {
        const A = ATTACKS[body.combo];
        const u = Math.min(1, body.stateT / A.dur);
        const p = attackPose(body.combo, u);
        armRx = p.ax;
        armRy = p.ay;
        armRz = p.az - 0.1;
        elbowR = p.ex;
        twist = p.twist;
        bend = p.bend ?? 0.12;
        armLx = -0.4;
        armLz = 0.35;
        legL = 0.35;
        legR = -0.25;
        kneeR = 0.3;
      } else if (body.blocking) {
        armRx = -1.25;
        armRy = 0.9;
        armRz = 0.3;
        elbowR = -0.9;
        armLx = -0.9;
        armLz = 0.5;
        elbowL = -1.2;
        bend = 0.15;
      } else if (st === "dodge") {
        const u = Math.min(1, body.stateT / 0.45);
        rootTilt = Math.sin(u * Math.PI) * 0.9;
        hipY = 0.94 - Math.sin(u * Math.PI) * 0.4;
        kneeL = kneeR = 1.2;
        legL = legR = -0.8;
        armLx = armRx = -1.2;
      } else if (st === "dig") {
        shovel = true;
        const c = Math.sin(body.stateT * 7);
        bend = 0.55 + c * 0.2;
        armLx = -0.9 + c * 0.4;
        armRx = -0.9 + c * 0.4;
        armLz = -0.15;
        armRz = 0.15;
        elbowL = elbowR = -0.4;
        kneeL = kneeR = 0.4 + c * 0.1;
        hipY = 0.86;
      } else if (st === "open") {
        bend = 0.5 * Math.sin(Math.min(1, body.stateT / 0.6) * Math.PI);
        armLx = armRx = -1.0;
        armLz = 0.25;
        armRz = -0.25;
        kneeL = kneeR = 0.3;
      } else if (st === "hurt") {
        bend = -0.3;
        armLx = armRx = 0.3;
        armLz = 0.6;
      } else if (st === "dead") {
        const u = Math.min(1, body.stateT / 0.9);
        rootTilt = -ease(u) * 1.45;
        hipY = 0.94 - ease(u) * 0.75;
        armLz = 1.2;
        armRz = -1.2;
      }
    } else {
      // foes
      const T = body.T;
      if (st === "ATTACK") {
        const wind = T.windup;
        if (body.stateT < wind) {
          const u = ease(body.stateT / wind);
          armRx = lerp(-0.2, -2.6, u);
          armRz = lerp(-0.1, -0.5, u);
          elbowR = -0.6;
          twist = -0.4 * u;
          bend = -0.12 * u;
        } else {
          const u = ease((body.stateT - wind) / (T.strike + 0.12));
          armRx = lerp(-2.6, -0.3, u);
          armRz = lerp(-0.5, 0.3, u);
          elbowR = -0.2;
          twist = lerp(-0.4, 0.45, u);
          bend = lerp(-0.12, 0.35, u);
          legL = 0.4;
          legR = -0.3;
        }
      } else if (st === "HIT") {
        bend = -0.35;
        armLx = armRx = 0.4;
        rootTilt = -0.15;
      } else if (st === "NOTICE") {
        armRx = -0.8;
        elbowR = -0.8;
        bend = -0.05;
      } else if (st === "DEFEATED") {
        const u = Math.min(1, body.stateT / 0.8);
        rootTilt = -ease(u) * 1.45;
        hipY = 0.94 - ease(u) * 0.75;
        armLz = 1.2;
        armRz = -1.2;
        if (type === "skeleton" || type === "guardian") {
          const fade = Math.max(0, 1 - (body.stateT - 2.5) / 1.2);
          r.scale.setScalar(scale * Math.max(0.001, fade));
        }
      } else if (st === "CHASE") {
        armRx = -0.5 + sw * 0.3;
      }
      if (type === "skeleton") {
        // a little rattle
        twist += Math.sin(t * 23 + body.x) * 0.03;
      }
      if (body.flash > 0) bend -= body.flash * 0.25;
    }

    P.hips.position.y = hipY;
    P.hips.rotation.x = 0;
    r.rotation.x = rootTilt;
    P.legL.rotation.x = -legL;
    P.legR.rotation.x = -legR;
    P.kneeL.rotation.x = kneeL;
    P.kneeR.rotation.x = kneeR;
    P.torso.rotation.set(bend, twist, 0);
    P.armL.rotation.set(armLx, 0, armLz);
    P.armR.rotation.set(armRx, armRy, armRz);
    P.elbowL.rotation.x = elbowL;
    P.elbowR.rotation.x = elbowR;
    if (P.head) P.head.rotation.set(-bend * 0.4, -twist * 0.5, 0);
    if (P.shovel) P.shovel.visible = shovel;
    if (P.sword) P.sword.visible = !shovel;
    if (body.state !== "DEFEATED" || !(type === "skeleton" || type === "guardian")) r.scale.setScalar(scale);

    if (bar.current) {
      const show = hpBar && body.alive && body.hp < body.maxHp;
      bar.current.visible = show;
      if (show) {
        r.getWorldQuaternion(_bq).invert().multiply(camera.quaternion);
        bar.current.quaternion.copy(_bq);
        const k = Math.max(0, body.hp / body.maxHp);
        fill.current.scale.x = Math.max(0.001, k);
        fill.current.position.x = -(1 - k) * 0.45;
      }
    }
  });

  return (
    <group ref={root}>
      <Rig type={type} parts={parts} />
      {hpBar && (
        <group ref={bar} position={[0, 2.25, 0]}>
          <mesh material={barMats[0]} renderOrder={20}>
            <planeGeometry args={[0.98, 0.12]} />
          </mesh>
          <mesh ref={fill} material={barMats[1]} position={[0, 0, 0.01]} renderOrder={21}>
            <planeGeometry args={[0.9, 0.07]} />
          </mesh>
        </group>
      )}
      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={M.shadow()} renderOrder={1}>
        <circleGeometry args={[0.45, 16]} />
      </mesh>
    </group>
  );
}
