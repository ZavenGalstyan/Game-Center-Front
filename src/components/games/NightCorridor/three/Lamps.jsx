/**
 * Night Corridor — ceiling lamps.
 *
 * Every lamp gets a visible fixture (fluorescent troffer, red emergency
 * cage, warm shade, bare bulb or a dead tube hanging off its chain) and a
 * soft pool of light on the floor beneath it, both driven by the lamp's
 * live flicker level. Real lighting comes from a FIXED pool of point
 * lights handed to the nearest lit lamps every frame — the shader's light
 * count never changes (no recompiles) and a long corridor costs the same
 * as a short one. Lamps outside the pool still read as lit through their
 * fixture glow + floor pool.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WALL_H } from "../engine/constants.js";
import { glowTexture, shaftTexture } from "./textures.js";

export const LAMP_STYLE = {
  lamp: { color: null, intensity: 5.5, range: 10, pool: 0.3 },
  flicker: { color: null, intensity: 5.0, range: 9.5, pool: 0.28 },
  broken: { color: "#000000", intensity: 0, range: 0, pool: 0 },
  emergency: { color: "#ff2416", intensity: 4.2, range: 9, pool: 0.34 },
  warm: { color: "#ffae5c", intensity: 6, range: 9, pool: 0.3 },
  bulb: { color: "#ffc77a", intensity: 4.5, range: 8, pool: 0.32 },
};

function lampColor(kind, theme) {
  return new THREE.Color(LAMP_STYLE[kind]?.color || theme.fluorescent);
}

function Fixture({ lamp, theme, matRef, glowRef, shaftRef, quality }) {
  const color = useMemo(() => lampColor(lamp.kind, theme), [lamp.kind, theme]);
  const y = WALL_H;
  const along = useMemo(() => ((lamp.c * 7 + lamp.r * 3) % 2 === 0 ? 0 : Math.PI / 2), [lamp.c, lamp.r]);
  const glow = glowTexture();
  const shaft = shaftTexture();
  const housing = (
    <meshStandardMaterial color="#3a3a36" roughness={0.55} metalness={0.6} />
  );
  let body = null;
  if (lamp.kind === "lamp" || lamp.kind === "flicker" || lamp.kind === "broken") {
    const broken = lamp.kind === "broken";
    body = (
      <group rotation={[0, along, 0]}>
        <group position={[0, y - 0.04, 0]} rotation={broken ? [0, 0, 0.42] : [0, 0, 0]}>
          <group position={broken ? [0.5, -0.22, 0] : [0, 0, 0]}>
            <mesh>
              <boxGeometry args={[1.25, 0.07, 0.32]} />
              {housing}
            </mesh>
            <mesh position={[0, -0.04, 0]}>
              <boxGeometry args={[1.16, 0.015, 0.25]} />
              <meshStandardMaterial ref={matRef} color="#1c1c1a" emissive={color} emissiveIntensity={0} roughness={0.4} fog={false} />
            </mesh>
          </group>
        </group>
        {broken && (
          <mesh position={[-0.6, y - 0.3, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.6, 4]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        )}
      </group>
    );
  } else if (lamp.kind === "emergency") {
    body = (
      <group position={[0, y, 0]}>
        <mesh position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.13, 0.15, 0.12, 12]} />
          {housing}
        </mesh>
        <mesh position={[0, -0.16, 0]}>
          <sphereGeometry args={[0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial ref={matRef} color="#3a0805" emissive={color} emissiveIntensity={0} transparent opacity={0.92} roughness={0.3} side={THREE.DoubleSide} fog={false} />
        </mesh>
      </group>
    );
  } else {
    // warm shade or bare bulb on a cord
    const drop = lamp.kind === "bulb" ? 0.55 : 0.35;
    body = (
      <group position={[0, y, 0]}>
        <mesh position={[0, -drop / 2, 0]}>
          <cylinderGeometry args={[0.006, 0.006, drop, 4]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        {lamp.kind === "warm" && (
          <mesh position={[0, -drop - 0.05, 0]}>
            <coneGeometry args={[0.24, 0.18, 16, 1, true]} />
            <meshStandardMaterial color="#2c3a33" roughness={0.6} metalness={0.4} side={THREE.DoubleSide} />
          </mesh>
        )}
        <mesh position={[0, -drop - 0.1, 0]}>
          <sphereGeometry args={[0.055, 12, 10]} />
          <meshStandardMaterial ref={matRef} color="#2a2118" emissive={color} emissiveIntensity={0} fog={false} />
        </mesh>
      </group>
    );
  }
  const style = LAMP_STYLE[lamp.kind];
  return (
    <group position={[lamp.x, 0, lamp.z]}>
      {body}
      {style.pool > 0 && (
        <mesh ref={glowRef} position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[3.4, 3.4]} />
          <meshBasicMaterial map={glow} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
      {quality !== "low" && style.pool > 0 && (
        <group ref={shaftRef} position={[0, WALL_H / 2 - 0.05, 0]}>
          {[0, Math.PI / 2].map((ry) => (
            <mesh key={ry} rotation={[0, ry + along, 0]} renderOrder={2}>
              <planeGeometry args={[lamp.kind === "lamp" || lamp.kind === "flicker" ? 1.3 : 0.9, WALL_H - 0.1]} />
              <meshBasicMaterial map={shaft} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export default function Lamps({ lamps, theme, quality = "medium", poolSize = 7, focus }) {
  const matRefs = useRef([]);
  const glowRefs = useRef([]);
  const shaftRefs = useRef([]);
  const lightRefs = useRef([]);
  const list = lamps.list;
  const colors = useMemo(() => list.map((l) => lampColor(l.kind, theme)), [list, theme]);
  const order = useRef([]);

  useEffect(() => {
    order.current = list.map((_, i) => i);
  }, [list]);

  useFrame(() => {
    const fx = focus.current?.x ?? 0;
    const fz = focus.current?.z ?? 0;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const style = LAMP_STYLE[l.kind];
      const lv = l.level;
      const m = matRefs.current[i];
      if (m) m.emissiveIntensity = lv * (l.kind === "emergency" ? 3.2 : l.kind === "lamp" || l.kind === "flicker" ? 2.6 : 4);
      const gm = glowRefs.current[i];
      if (gm) gm.material.opacity = lv * style.pool;
      const sh = shaftRefs.current[i];
      if (sh) for (const ch of sh.children) ch.material.opacity = lv * 0.045;
    }
    // Hand the real lights to the nearest lit lamps.
    const ord = order.current;
    ord.sort((a, b) => {
      const la = list[a];
      const lb = list[b];
      const da = la.level > 0.02 ? (la.x - fx) ** 2 + (la.z - fz) ** 2 : 1e9;
      const db = lb.level > 0.02 ? (lb.x - fx) ** 2 + (lb.z - fz) ** 2 : 1e9;
      return da - db;
    });
    for (let k = 0; k < poolSize; k++) {
      const light = lightRefs.current[k];
      if (!light) continue;
      const idx = ord[k];
      const l = idx != null ? list[idx] : null;
      if (!l || l.level <= 0.02) {
        light.intensity = 0;
        continue;
      }
      const style = LAMP_STYLE[l.kind];
      const d = Math.sqrt((l.x - fx) ** 2 + (l.z - fz) ** 2);
      // Fade out the far end of the pool so hand-offs don't pop.
      const fade = Math.max(0, Math.min(1, (26 - d) / 8));
      light.position.set(l.x, l.kind === "bulb" ? WALL_H - 0.75 : WALL_H - 0.25, l.z);
      light.color.copy(colors[idx]);
      light.intensity = style.intensity * l.level * fade;
      light.distance = style.range;
    }
  });

  return (
    <group>
      {list.map((l, i) => (
        <Fixture
          key={l.id}
          lamp={l}
          theme={theme}
          quality={quality}
          matRef={(m) => (matRefs.current[i] = m)}
          glowRef={(m) => (glowRefs.current[i] = m)}
          shaftRef={(m) => (shaftRefs.current[i] = m)}
        />
      ))}
      {Array.from({ length: poolSize }, (_, k) => (
        <pointLight key={k} ref={(r) => (lightRefs.current[k] = r)} intensity={0} distance={10} decay={2} />
      ))}
    </group>
  );
}
