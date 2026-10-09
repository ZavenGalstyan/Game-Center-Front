/**
 * Pirate Cove — a ship on the water. Geometry comes from shipGeo.js (cached
 * per class + paint); this component poses it every frame from the engine's
 * ship (x, y, heading, pitch, roll), furls / fills the sails with the sail
 * setting and speed, recoils each broadside's guns, waves the flag and, for
 * enemies, floats a health bar over the masts.
 *
 * Pass `ship` for a live engine ship, or `preview` ({ throttle }) for menus.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { shipGeometry, squareSailGeometry } from "./shipGeo.js";
import { M } from "./materials.js";
import { flagTexture } from "./textures.js";

const FLAG_W = 2.2;
const _q = new THREE.Quaternion();
const FLAG_H = 1.5;

function Flag({ kind, bg, position, scale = 1 }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(FLAG_W, FLAG_H, 10, 6).translate(FLAG_W / 2, 0, 0), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: flagTexture(kind, bg), side: THREE.DoubleSide, roughness: 0.9 }), [kind, bg]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = x / FLAG_W;
      p.setZ(i, Math.sin(x * 2.4 - t * 6.5) * 0.22 * k + Math.sin(y * 3 + t * 4) * 0.05 * k);
      p.setY(i, y - k * k * 0.18);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  // flag streams aft (−z): rotate so +x points backward
  return <mesh geometry={geo} material={material} position={position} rotation={[0, Math.PI / 2, 0]} scale={scale} castShadow />;
}

function HealthBar({ ship, height }) {
  const g = useRef();
  const fill = useRef();
  const back = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1a0f0a", transparent: true, opacity: 0.75, depthTest: false }), []);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({ color: ship.boss ? "#ff6a2a" : "#e8433a", depthTest: false }), [ship.boss]);
  useFrame(({ camera }) => {
    if (!g.current) return;
    const recent = ship._game ? ship._game.time - ship.lastHitAt < 6 : false;
    const dist = camera.position.distanceTo(g.current.parent.position);
    const near = dist < (ship.boss ? 320 : 200);
    // constant on-screen size (≈ readable at any range)
    g.current.scale.setScalar(Math.max(1, dist / 34) * (ship.boss ? 1.25 : 1));
    const engaged = ship.ai && ship.ai.state !== "PATROL";
    g.current.visible = ship.alive && (recent || (near && engaged) || ship._targeted);
    // billboard in world space: undo the ship's own rotation
    g.current.parent.getWorldQuaternion(_q).invert().multiply(camera.quaternion);
    g.current.quaternion.copy(_q);
    const k = Math.max(0, ship.hull / ship.maxHull);
    fill.current.scale.x = Math.max(0.001, k);
    fill.current.position.x = -(1 - k) * 2;
  });
  return (
    <group ref={g} position={[0, height, 0]} renderOrder={20}>
      <mesh material={back} renderOrder={20}>
        <planeGeometry args={[4.3, 0.42]} />
      </mesh>
      <mesh ref={fill} material={fillMat} position={[0, 0, 0.01]} renderOrder={21}>
        <planeGeometry args={[4, 0.26]} />
      </mesh>
    </group>
  );
}

export default function ShipModel({ ship, clsId, look, preview, castShadow = true, healthBar = false }) {
  const cls = clsId || ship?.stats?.id || "sloop";
  const lk = look || ship?.look || {};
  const G = useMemo(() => shipGeometry(cls, lk), [cls, lk.hullColor, lk.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const root = useRef();
  const body = useRef();
  const sails = useRef([]);
  const gunsL = useRef();
  const gunsR = useRef();
  const sailMat = lk.tattered ? M.tattered(lk.sail || "#f3ecdc") : M.sail(lk.sail || "#f3ecdc");
  const hullMat = M.hull("#ffffff");
  const rail = M.accent(new THREE.Color(lk.hullColor || "#6b4428").multiplyScalar(0.55).getStyle());
  const portMat = M.accent(new THREE.Color(lk.accent || "#2f6f8f").multiplyScalar(0.7).getStyle());
  const tallest = G.mastTops.reduce((a, b) => (b.y > a.y ? b : a));
  const D = G.dims;
  const glow = lk.cursed ? M.emissive("#56f0b0", 2.2) : M.glass();

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (ship && root.current) {
      root.current.position.set(ship.x, ship.y, ship.z);
      root.current.rotation.y = ship.heading;
      root.current.visible = !ship.removed;
      if (body.current) {
        body.current.rotation.x = -ship.pitch;
        body.current.rotation.z = ship.roll;
      }
    } else if (preview && body.current) {
      body.current.rotation.x = Math.sin(t * 0.7) * 0.02;
      body.current.rotation.z = Math.sin(t * 0.5) * 0.035;
      body.current.position.y = Math.sin(t * 0.8) * 0.12;
    }
    const thr = ship ? (ship.alive ? Math.max(0, ship.throttle) : 0.15) : preview?.throttle ?? 0.7;
    const sp = ship ? Math.min(1, Math.abs(ship.speed) / ship.stats.maxSpeed) : 0.5;
    for (let i = 0; i < sails.current.length; i++) {
      const s = sails.current[i];
      if (!s) continue;
      const furl = 0.22 + 0.78 * thr;
      s.scale.y += (furl - s.scale.y) * Math.min(1, dt * 2.5);
      s.scale.z = 0.35 + 0.85 * sp * thr + Math.sin(t * 2.7 + i * 1.3) * 0.05 + 0.1;
    }
    if (ship) {
      for (const side of ["left", "right"]) {
        ship.recoil[side] = Math.max(0, ship.recoil[side] - dt * 2.4);
      }
      if (gunsL.current) gunsL.current.position.x = -ship.recoil.left * 0.45;
      if (gunsR.current) gunsR.current.position.x = ship.recoil.right * 0.45;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={G.hull} material={hullMat} castShadow={castShadow} receiveShadow />
        <mesh geometry={G.deck} material={M.deck()} receiveShadow />
        <mesh geometry={G.inner} material={M.darkWood()} receiveShadow />
        <mesh geometry={G.rail} material={rail} />
        <mesh geometry={G.portGeo} material={portMat} />
        <group ref={gunsL}>
          <mesh geometry={G.cannonL} material={M.iron()} />
        </group>
        <group ref={gunsR}>
          <mesh geometry={G.cannonR} material={M.iron()} />
        </group>
        <mesh geometry={G.sparGeo} material={M.mast()} castShadow={castShadow} />
        <lineSegments geometry={G.rigGeo} material={M.rope()} />
        {G.sails.map((s, i) => (
          <mesh
            key={i}
            ref={(el) => (sails.current[i] = el)}
            position={[s.x, s.y, s.z]}
            geometry={squareSailGeometry(s.w, s.h)}
            material={sailMat}
            castShadow={castShadow}
          />
        ))}
        {G.jib && <mesh geometry={G.jib} material={sailMat} castShadow={castShadow} />}
        <Flag kind={lk.flag || "skull"} bg={lk.flagBg || "#111111"} position={[0, tallest.y + 0.2, tallest.z - 0.1]} />
        {/* stern lantern + windows */}
        <mesh position={[0, G.stern.y + 0.7, G.stern.z - 0.15]} material={glow}>
          <boxGeometry args={[0.32, 0.45, 0.32]} />
        </mesh>
        <mesh position={[0, G.stern.y + 0.4, G.stern.z - 0.15]} material={M.iron()}>
          <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
        </mesh>
        {Array.from({ length: G.stern.windows }).map((_, i) => {
          const n = G.stern.windows;
          const x = (i / Math.max(1, n - 1) - 0.5) * G.stern.hb * 1.2;
          return (
            <mesh key={i} position={[x, G.stern.y * 0.62, G.stern.z - 0.06]} material={glow}>
              <boxGeometry args={[0.42, 0.55, 0.06]} />
            </mesh>
          );
        })}
        {/* wheel + deck clutter */}
        <group position={[0, D.top(0.16) - D.S.bulwark + 0.75, -D.L * 0.34]}>
          <mesh material={M.wood()} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.5, 0.05, 6, 16]} />
          </mesh>
          <mesh material={M.wood()} position={[0, -0.45, 0.1]}>
            <boxGeometry args={[0.18, 0.9, 0.18]} />
          </mesh>
        </group>
        <mesh material={M.wood()} position={[D.B * 0.22, D.top(0.6) - D.S.bulwark + 0.4, D.L * 0.1]} castShadow={castShadow}>
          <cylinderGeometry args={[0.35, 0.3, 0.8, 10]} />
        </mesh>
        <mesh material={M.wood()} position={[-D.B * 0.2, D.top(0.55) - D.S.bulwark + 0.35, D.L * 0.05]} castShadow={castShadow}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
        </mesh>
        <mesh material={M.cloth("#7a6040")} position={[D.B * 0.18, D.top(0.45) - D.S.bulwark + 0.12, -D.L * 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.12, 6, 14]} />
        </mesh>
        {/* figurehead */}
        <mesh material={M.accent(lk.accent || "#2f6f8f")} position={[0, D.top(1) - 0.2, D.L / 2 + 0.1]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.22, 0.8, 8]} />
        </mesh>
      </group>
      {healthBar && ship && <HealthBar ship={ship} height={tallest.y + 3} />}
    </group>
  );
}
