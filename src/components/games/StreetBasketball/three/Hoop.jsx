/**
 * Street Basketball — the hoop: base plate, padded pole, extension arm,
 * backboard (framed acrylic with shooter's square), rim + bracket, and a
 * lightweight animated net (a textured open cone whose vertices ripple and
 * stretch when the ball goes through — no cloth simulation).
 *
 * Every dimension comes from engine/constants.js, i.e. from the same numbers
 * the collision code uses.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  RIM_Y, RIM_R, RIM_TUBE, RIM_INNER, BOARD_Z, BOARD_THICK, BOARD_W, BOARD_BOTTOM, BOARD_TOP,
  NET_DEPTH, NET_BOTTOM_R, POLE_Z, POLE_R,
} from "../engine/constants.js";
import { backboardTexture, netTexture } from "./textures.js";

const NET_SEG = 24;
const NET_ROWS = 7;

export default function Hoop({ game, accent = "#d9432f" }) {
  const boardTex = useMemo(() => backboardTexture(accent), [accent]);
  const netTex = useMemo(() => {
    const t = netTexture();
    t.repeat.set(2, 1);
    return t;
  }, []);
  const mats = useMemo(() => ({
    steel: new THREE.MeshStandardMaterial({ color: "#3a3f46", metalness: 0.55, roughness: 0.45 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: "#23262b", metalness: 0.5, roughness: 0.55 }),
    rim: new THREE.MeshStandardMaterial({ color: "#e0512b", metalness: 0.45, roughness: 0.38 }),
    pad: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 }),
    board: new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.35, metalness: 0.05 }),
    frame: new THREE.MeshStandardMaterial({ color: "#2b2f35", metalness: 0.6, roughness: 0.4 }),
    net: new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, depthWrite: true }),
  }), [boardTex, netTex, accent]);

  // net geometry: open cone, rim → bottom
  const net = useMemo(() => {
    const geo = new THREE.CylinderGeometry(RIM_INNER + 0.004, NET_BOTTOM_R, NET_DEPTH, NET_SEG, NET_ROWS, true);
    const base = geo.attributes.position.array.slice();
    return { geo, base };
  }, []);
  const netRef = useRef();
  const anim = useRef({ amp: 0, t: 0, lastHit: -1, bx: 0, bz: 0, by: 0 });

  useFrame((_, dt) => {
    const g = game.current;
    if (!g) return;
    const b = g.ball;
    const A = anim.current;
    if (b.netHit !== undefined && b.netHit !== A.lastHit) {
      A.lastHit = b.netHit;
      A.amp = 1;
      A.t = 0;
    }
    A.t += Math.min(dt, 0.05);
    A.amp = Math.max(0, A.amp - Math.min(dt, 0.05) * 1.3);
    // live bulge where the ball actually is inside the net
    const depth = RIM_Y - b.p.y;
    const inNet = depth > -0.05 && depth < NET_DEPTH + 0.15 && Math.hypot(b.p.x, b.p.z) < RIM_R + 0.05;
    const pos = net.geo.attributes.position;
    const arr = pos.array;
    const base = net.base;
    let changed = false;
    if (A.amp > 0.001 || inNet) {
      changed = true;
      for (let i = 0; i < arr.length; i += 3) {
        const x0 = base[i];
        const y0 = base[i + 1];
        const z0 = base[i + 2];
        const t = (NET_DEPTH / 2 - y0) / NET_DEPTH; // 0 top … 1 bottom
        const ang = Math.atan2(z0, x0);
        const rad = Math.hypot(x0, z0);
        // swish: rings flare, bottom snaps down and sways
        const wave = Math.sin(A.t * 22 - t * 5) * A.amp;
        let rr = rad * (1 + 0.28 * t * wave * (0.6 + 0.4 * Math.sin(ang * 3 + A.t * 9)));
        let yy = y0 - 0.1 * t * A.amp * (0.6 + 0.4 * Math.sin(A.t * 16));
        if (inNet) {
          // local bulge around the ball
          const wy = RIM_Y - NET_DEPTH / 2 + y0;
          const dy = Math.abs(wy - b.p.y);
          if (dy < 0.2) rr = Math.max(rr, Math.min(rad + 0.08, 0.17 + (0.2 - dy) * 0.25));
        }
        arr[i] = Math.cos(ang) * rr;
        arr[i + 1] = yy;
        arr[i + 2] = Math.sin(ang) * rr;
      }
    } else if (anim.current.dirty) {
      arr.set(base);
      changed = true;
    }
    anim.current.dirty = changed;
    if (changed) pos.needsUpdate = true;
  });

  const boardH = BOARD_TOP - BOARD_BOTTOM;
  const boardCy = (BOARD_TOP + BOARD_BOTTOM) / 2;
  const poleTop = 3.45;
  const armLen = BOARD_Z - BOARD_THICK - POLE_Z; // pole → back of board

  return (
    <group>
      {/* base plate + bolts */}
      <mesh position={[0, 0.015, POLE_Z]} material={mats.darkSteel} receiveShadow>
        <boxGeometry args={[0.55, 0.03, 0.55]} />
      </mesh>
      {/* pole */}
      <mesh position={[0, poleTop / 2, POLE_Z]} material={mats.steel} castShadow>
        <cylinderGeometry args={[POLE_R, POLE_R * 1.08, poleTop, 20]} />
      </mesh>
      {/* safety pad */}
      <mesh position={[0, 0.95, POLE_Z]} material={mats.pad} castShadow>
        <boxGeometry args={[0.34, 1.7, 0.34]} />
      </mesh>
      {/* extension arm (two rails + brace) */}
      <mesh position={[0, poleTop - 0.06, POLE_Z + armLen / 2]} material={mats.steel} castShadow>
        <boxGeometry args={[0.1, 0.1, armLen + 0.12]} />
      </mesh>
      <mesh position={[0, poleTop - 0.62, POLE_Z + armLen * 0.55]} rotation={[-0.62, 0, 0]} material={mats.steel}>
        <boxGeometry args={[0.07, 0.07, armLen * 1.15]} />
      </mesh>
      <mesh position={[0, poleTop - 0.06, POLE_Z]} material={mats.darkSteel}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
      </mesh>
      {/* backboard: face + frame */}
      <mesh position={[0, boardCy, BOARD_Z - BOARD_THICK / 2]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_W, boardH, BOARD_THICK]} />
        <meshStandardMaterial attach="material-0" color="#2b2f35" />
        <meshStandardMaterial attach="material-1" color="#2b2f35" />
        <meshStandardMaterial attach="material-2" color="#2b2f35" />
        <meshStandardMaterial attach="material-3" color="#2b2f35" />
        <primitive object={mats.board} attach="material-4" />
        <meshStandardMaterial attach="material-5" color="#9aa0a6" roughness={0.6} />
      </mesh>
      {[
        [0, BOARD_TOP + 0.02, BOARD_W + 0.06, 0.04],
        [0, BOARD_BOTTOM - 0.02, BOARD_W + 0.06, 0.04],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, BOARD_Z - BOARD_THICK / 2]} material={mats.frame}>
          <boxGeometry args={[w, h, BOARD_THICK + 0.02]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (BOARD_W / 2 + 0.015), boardCy, BOARD_Z - BOARD_THICK / 2]} material={mats.frame}>
          <boxGeometry args={[0.04, boardH + 0.08, BOARD_THICK + 0.02]} />
        </mesh>
      ))}
      {/* rim bracket plate */}
      <mesh position={[0, RIM_Y - 0.03, (BOARD_Z + (-RIM_R)) / 2]} material={mats.rim}>
        <boxGeometry args={[0.14, 0.035, Math.abs(BOARD_Z + RIM_R) + 0.02]} />
      </mesh>
      <mesh position={[0, RIM_Y - 0.11, BOARD_Z + 0.04]} material={mats.rim}>
        <boxGeometry args={[0.2, 0.18, 0.02]} />
      </mesh>
      {/* rim */}
      <mesh position={[0, RIM_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.rim} castShadow>
        <torusGeometry args={[RIM_R, RIM_TUBE, 12, 56]} />
      </mesh>
      {/* net hooks */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * RIM_R, RIM_Y - 0.012, Math.sin(a) * RIM_R]} material={mats.rim}>
            <boxGeometry args={[0.012, 0.022, 0.012]} />
          </mesh>
        );
      })}
      {/* net */}
      <mesh ref={netRef} geometry={net.geo} material={mats.net} position={[0, RIM_Y - NET_DEPTH / 2 - 0.008, 0]} />
    </group>
  );
}
