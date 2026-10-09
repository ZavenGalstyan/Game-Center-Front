/**
 * Kart Legends — the karts. A rounded extruded tub, nose and bumpers, side
 * pods, rear wing, seat, steering wheel, a helmeted driver, four rimmed
 * wheels, twin exhausts, head- and tail-lights. Six silhouettes (shape) and
 * per-kart liveries (colors).
 *
 * Animated from the engine's kart state every frame: wheel spin, front-wheel
 * steering, body roll into turns, extra lean while drifting, the drift hop,
 * a bump bounce, a squat under throttle, boost flames from the exhausts.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const geoCache = new Map();
function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

/** Rounded box: a rounded rectangle (w × d) extruded h with a soft bevel. */
function roundedBox(w, h, d, r) {
  return cached(`rb:${w}:${h}:${d}:${r}`, () => {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -d / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const bev = Math.min(r * 0.6, h * 0.35);
    const g = new THREE.ExtrudeGeometry(s, { depth: h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); // extrude along +y
    g.translate(0, bev, 0);
    g.computeVertexNormals();
    return g;
  });
}

export function disposeKartGeometry() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

const SHAPES = {
  classic: { len: 2.1, wid: 1.25, nose: 0.55, wing: 1.0, podW: 0.28, wheelR: 0.3, rearR: 0.34 },
  wedge: { len: 2.15, wid: 1.2, nose: 0.75, wing: 1.25, podW: 0.24, wheelR: 0.29, rearR: 0.35 },
  low: { len: 2.3, wid: 1.3, nose: 0.65, wing: 0.9, podW: 0.3, wheelR: 0.28, rearR: 0.32 },
  bullet: { len: 2.45, wid: 1.12, nose: 0.95, wing: 1.1, podW: 0.22, wheelR: 0.28, rearR: 0.33 },
  chunky: { len: 2.05, wid: 1.4, nose: 0.45, wing: 0.95, podW: 0.36, wheelR: 0.36, rearR: 0.4 },
  legend: { len: 2.3, wid: 1.3, nose: 0.8, wing: 1.35, podW: 0.3, wheelR: 0.3, rearR: 0.36 },
};

function Wheel({ r, w, rim, side }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, w, 18]} />
        <meshStandardMaterial color="#1b1b1f" roughness={0.85} />
      </mesh>
      <mesh position={[0, (w / 2 + 0.005) * side, 0]}>
        <cylinderGeometry args={[r * 0.62, r * 0.62, 0.02, 14]} />
        <meshStandardMaterial color={rim} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, (w / 2 + 0.02) * side, 0]}>
        <cylinderGeometry args={[r * 0.18, r * 0.18, 0.03, 8]} />
        <meshStandardMaterial color="#2a2a30" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * The kart. `getState()` returns the engine kart (or a static pose) each
 * frame; `place` (optional) is called with the root group.
 */
export function KartModel({ colors, shape = "classic", getState, place, shadows = true, showDriver = true }) {
  const S = SHAPES[shape] || SHAPES.classic;
  const root = useRef();
  const body = useRef();
  const wheels = useRef([]);
  const steerL = useRef();
  const steerR = useRef();
  const flames = useRef([]);
  const sw = useRef();
  const anim = useRef({ roll: 0, pitch: 0, lift: 0, flame: 0 });
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.32, metalness: 0.2 }),
      trim: new THREE.MeshStandardMaterial({ color: colors.trim, roughness: 0.4, metalness: 0.1 }),
      accent: new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.5, metalness: 0.3 }),
      driver: new THREE.MeshStandardMaterial({ color: colors.driver, roughness: 0.7 }),
      dark: new THREE.MeshStandardMaterial({ color: "#1d1d24", roughness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: "#c9ccd4", metalness: 0.9, roughness: 0.22 }),
      visor: new THREE.MeshStandardMaterial({ color: "#14161c", metalness: 0.6, roughness: 0.08 }),
      head: new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#fff2c0", emissiveIntensity: 1.6 }),
      tail: new THREE.MeshStandardMaterial({ color: "#ff3030", emissive: "#ff1a1a", emissiveIntensity: 1.2 }),
      flame: new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      flameCore: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    }),
    [colors],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const K = getState();
    if (!K) return;
    const a = anim.current;
    if (place && root.current) place(root.current, K);
    for (const w of wheels.current) if (w) w.rotation.x = K.wheelSpin || 0;
    const st = (K.steerVis || 0) * 0.45;
    if (steerL.current) steerL.current.rotation.y = st;
    if (steerR.current) steerR.current.rotation.y = st;
    if (sw.current) sw.current.rotation.z = -st * 2.2;
    const sp = K.vF || 0;
    const driftLean = K.drift && K.drift.on ? -K.drift.dir * 0.09 : 0;
    const roll = clamp((K.yawRate || 0) * sp * 0.006, -0.12, 0.12) + driftLean;
    a.roll += (roll - a.roll) * Math.min(1, dt * 8);
    const pitch = K.boostT > 0 ? -0.05 : K.revving ? -0.02 + Math.sin(clock.elapsedTime * 40) * 0.006 : 0;
    a.pitch += (pitch - a.pitch) * Math.min(1, dt * 6);
    const hop = K.hop > 0 ? Math.sin((1 - K.hop / 0.18) * Math.PI) * 0.22 : 0;
    const bump = (K.bump || 0) * Math.sin(clock.elapsedTime * 38) * 0.04;
    const idle = Math.sin(clock.elapsedTime * 22 + (K.x || 0)) * 0.006 * (Math.abs(sp) < 1 ? 1 : 0.4);
    if (body.current) {
      body.current.rotation.set(a.pitch, 0, a.roll);
      body.current.position.y = hop + bump + idle;
    }
    const f = K.boostT > 0 ? 1 : 0;
    a.flame += (f - a.flame) * Math.min(1, dt * 12);
    flames.current.forEach((fl, i) => {
      if (!fl) return;
      const flick = 0.85 + Math.sin(clock.elapsedTime * 50 + i * 2) * 0.15;
      fl.visible = a.flame > 0.03;
      fl.scale.set(a.flame * flick, a.flame * flick * (K.boostKind === "pad" ? 1.3 : 1), a.flame * flick);
    });
  });

  const L = S.len;
  const W = S.wid;
  const wy = S.wheelR;
  const wheelPos = [
    [W / 2 + 0.05, S.wheelR, L * 0.36, true, 1],
    [-W / 2 - 0.05, S.wheelR, L * 0.36, true, -1],
    [W / 2 + 0.08, S.rearR, -L * 0.36, false, 1],
    [-W / 2 - 0.08, S.rearR, -L * 0.36, false, -1],
  ];
  void wy;
  return (
    <group ref={root}>
      {/* wheels (not part of the rolling body) */}
      {wheelPos.map(([x, r, z, front, side], i) =>
        front ? (
          <group key={i} position={[x, r, z]} ref={side > 0 ? steerL : steerR}>
            <group ref={(o) => (wheels.current[i] = o)}>
              <Wheel r={r} w={0.26} rim={colors.trim} side={side} />
            </group>
          </group>
        ) : (
          <group key={i} position={[x, r, z]} ref={(o) => (wheels.current[i] = o)}>
            <Wheel r={r} w={0.34} rim={colors.trim} side={side} />
          </group>
        ),
      )}
      {/* axles */}
      <mesh position={[0, S.rearR, -L * 0.36]} rotation={[0, 0, Math.PI / 2]} material={mats.dark}>
        <cylinderGeometry args={[0.05, 0.05, W + 0.1, 8]} />
      </mesh>
      <mesh position={[0, S.wheelR, L * 0.36]} rotation={[0, 0, Math.PI / 2]} material={mats.dark}>
        <cylinderGeometry args={[0.045, 0.045, W, 8]} />
      </mesh>
      <group ref={body}>
        {/* floor pan + tub */}
        <mesh geometry={roundedBox(W * 0.9, 0.1, L * 0.95, 0.25)} position={[0, 0.16, 0]} material={mats.dark} castShadow={shadows} />
        <mesh geometry={roundedBox(W * 0.78, 0.34, L * 0.62, 0.28)} position={[0, 0.24, -0.05]} material={mats.body} castShadow={shadows} />
        {/* nose */}
        <mesh geometry={roundedBox(W * 0.5, 0.26, S.nose, 0.16)} position={[0, 0.24, L * 0.31 + S.nose * 0.3]} material={mats.body} castShadow={shadows} />
        <mesh geometry={roundedBox(W * 0.96, 0.12, 0.26, 0.1)} position={[0, 0.17, L * 0.5]} material={mats.trim} castShadow={shadows} />
        {/* side pods */}
        {[-1, 1].map((sd) => (
          <mesh key={sd} geometry={roundedBox(S.podW, 0.26, L * 0.42, 0.11)} position={[sd * (W * 0.39 + S.podW / 2), 0.2, -0.05]} material={mats.trim} castShadow={shadows} />
        ))}
        {/* stripe */}
        <mesh geometry={roundedBox(0.22, 0.02, L * 0.62, 0.08)} position={[0, 0.585, -0.05]} material={mats.trim} />
        {/* rear bumper */}
        <mesh geometry={roundedBox(W * 0.92, 0.14, 0.2, 0.08)} position={[0, 0.2, -L * 0.48]} material={mats.accent} castShadow={shadows} />
        {/* seat */}
        <mesh geometry={roundedBox(0.52, 0.5, 0.18, 0.08)} position={[0, 0.45, -0.38]} material={mats.dark} castShadow={shadows} />
        <mesh geometry={roundedBox(0.5, 0.1, 0.42, 0.08)} position={[0, 0.48, -0.22]} material={mats.dark} />
        {/* steering column + wheel */}
        <mesh position={[0, 0.66, 0.25]} rotation={[0.9, 0, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 6]} />
        </mesh>
        <group position={[0, 0.8, 0.12]} rotation={[0.9, 0, 0]}>
          <mesh ref={sw} material={mats.dark}>
            <torusGeometry args={[0.17, 0.03, 8, 18]} />
          </mesh>
        </group>
        {/* rear wing */}
        {[-1, 1].map((sd) => (
          <mesh key={`w${sd}`} position={[sd * 0.32, 0.72, -L * 0.42]} material={mats.accent}>
            <boxGeometry args={[0.05, 0.42, 0.08]} />
          </mesh>
        ))}
        <mesh geometry={roundedBox(S.wing, 0.07, 0.34, 0.05)} position={[0, 0.92, -L * 0.45]} rotation={[0.12, 0, 0]} material={mats.body} castShadow={shadows} />
        {shape === "legend" &&
          [-1, 1].map((sd) => (
            <mesh key={`f${sd}`} position={[sd * S.wing * 0.5, 0.98, -L * 0.45]} material={mats.trim}>
              <boxGeometry args={[0.04, 0.22, 0.4]} />
            </mesh>
          ))}
        {/* exhausts + flames */}
        {[-1, 1].map((sd, i) => (
          <group key={`e${sd}`} position={[sd * 0.2, 0.42, -L * 0.5]}>
            <mesh rotation={[Math.PI / 2 - 0.25, 0, 0]} material={mats.chrome}>
              <cylinderGeometry args={[0.06, 0.07, 0.3, 10]} />
            </mesh>
            <group ref={(o) => (flames.current[i] = o)} position={[0, 0.04, -0.2]} visible={false}>
              <mesh rotation={[-Math.PI / 2 + 0.25, 0, 0]} position={[0, 0, -0.3]} material={mats.flame}>
                <coneGeometry args={[0.13, 0.7, 10, 1, true]} />
              </mesh>
              <mesh rotation={[-Math.PI / 2 + 0.25, 0, 0]} position={[0, 0, -0.18]} material={mats.flameCore}>
                <coneGeometry args={[0.06, 0.4, 8, 1, true]} />
              </mesh>
            </group>
          </group>
        ))}
        {/* lights */}
        {[-1, 1].map((sd) => (
          <mesh key={`h${sd}`} position={[sd * W * 0.32, 0.28, L * 0.5 + 0.13]} material={mats.head}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={`t${sd}`} position={[sd * W * 0.36, 0.24, -L * 0.48 - 0.1]} material={mats.tail}>
            <boxGeometry args={[0.16, 0.06, 0.03]} />
          </mesh>
        ))}
        {/* driver */}
        {showDriver && (
          <group position={[0, 0.55, -0.2]}>
            <mesh position={[0, 0.25, 0]} material={mats.driver} castShadow={shadows}>
              <capsuleGeometry args={[0.18, 0.22, 4, 10]} />
            </mesh>
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[sd * 0.17, 0.28, 0.22]} rotation={[1.1, 0, -sd * 0.25]} material={mats.driver}>
                <capsuleGeometry args={[0.055, 0.3, 4, 8]} />
              </mesh>
            ))}
            <mesh position={[0, 0.64, 0.02]} material={mats.body} castShadow={shadows}>
              <sphereGeometry args={[0.2, 18, 14]} />
            </mesh>
            <mesh position={[0, 0.63, 0.13]} scale={[1, 0.55, 0.7]} material={mats.visor}>
              <sphereGeometry args={[0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position={[0, 0.79, -0.02]} scale={[1, 0.3, 1.1]} material={mats.trim}>
              <sphereGeometry args={[0.12, 10, 8]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** A kart racing in the race (reads the engine racer each frame). */
export default function RaceKart({ racer, shadows }) {
  const K = racer.kart;
  const place = (g) => {
    g.position.set(K.x, K.y, K.z);
    g.rotation.y = K.h + (K.drift && K.drift.on ? K.drift.dir * 0.32 : 0) * 0.6;
  };
  return <KartModel colors={racer.colors} shape={racer.shape} getState={() => K} place={place} shadows={shadows} />;
}
