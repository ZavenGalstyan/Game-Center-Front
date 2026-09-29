/**
 * Arena Gladiator — the arena as a place: sand floor, stone wall with gates,
 * tiered stands with an instanced crowd, banners, torches, weapon racks,
 * props outside the fighting ring, sun + shadows, dust in the light.
 *
 * One builder dresses all five arenas from data/arenas.js themes. Only the
 * wall circle and pillars are gameplay (engine collision + camera collision);
 * everything else is decoration and is trimmed by the Graphics setting —
 * never the fighters, weapons or the collision geometry.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  sandTexture, stoneTexture, woodTexture, bannerTexture, skyTexture, glowTexture, noiseTexture, crowdTexture,
} from "./textures.js";
import { matOf, buildWeaponMesh, buildShieldMesh } from "./weapons3d.js";
import { buildGladiator, poseGladiator } from "./gladiator.js";
import { weaponById } from "../data/weapons.js";

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const QUALITY = {
  low: { shadow: 1024, crowd: 0.35, dust: 0, lights: 0, props: 0.5 },
  medium: { shadow: 2048, crowd: 0.7, dust: 140, lights: 2, props: 1 },
  high: { shadow: 4096, crowd: 1, dust: 320, lights: 4, props: 1 },
};

/* ------------------------------------------------------------------ sky + light */
function SkyAndLight({ arena, quality }) {
  const T = arena.theme;
  const Q = QUALITY[quality] || QUALITY.medium;
  const { scene } = useThree();
  const sky = useMemo(() => skyTexture(T.sky[0], T.sky[1], T.night), [T]);
  const sunRef = useRef();
  useEffect(() => {
    scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
    scene.background = new THREE.Color(T.sky[1]);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, T]);
  useEffect(() => {
    const s = sunRef.current;
    if (!s) return;
    s.target.position.set(0, 0, 0);
    s.target.updateMatrixWorld();
    s.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (s.shadow.map) {
      s.shadow.map.dispose();
      s.shadow.map = null;
    }
  }, [Q.shadow]);
  const R = arena.radius + 2;
  return (
    <group>
      <mesh renderOrder={-10}>
        <sphereGeometry args={[160, 24, 16]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {T.night && (
        <mesh position={[-60, 70, -90]}>
          <circleGeometry args={[5, 32]} />
          <meshBasicMaterial color="#e8ecff" fog={false} />
        </mesh>
      )}
      <hemisphereLight args={[T.sky[1], T.sandDark, T.ambI * 0.9]} />
      <ambientLight color={T.amb} intensity={T.ambI * 0.35} />
      <directionalLight
        ref={sunRef}
        position={T.sunPos}
        color={T.sun}
        intensity={T.sunI}
        castShadow
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ floor */
function Floor({ arena, quality }) {
  const T = arena.theme;
  const size = quality === "high" ? 2048 : quality === "low" ? 1024 : 1536;
  const tex = useMemo(() => sandTexture(T.sand, T.sandDark, size, arena.floor === "stone" ? "stone" : "sand"), [T, size, arena.floor]);
  const bump = useMemo(() => {
    const b = noiseTexture(256, 9, 90).clone();
    b.wrapS = b.wrapT = THREE.RepeatWrapping;
    b.repeat.set(30, 30);
    b.needsUpdate = true;
    return b;
  }, []);
  useEffect(() => () => bump.dispose(), [bump]);
  const R = arena.radius + 0.6;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R, 72]} />
        <meshStandardMaterial map={tex} bumpMap={bump} bumpScale={arena.floor === "stone" ? 0.3 : 0.8} roughness={0.96} />
      </mesh>
      {/* the world beyond the stands */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[R, 150, 48]} />
        <meshStandardMaterial color={T.sandDark} roughness={1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ wall + gates */
function Wall({ arena }) {
  const T = arena.theme;
  const R = arena.radius;
  const H = arena.wallH;
  const circ = 2 * Math.PI * R;
  const stone = useMemo(() => {
    const t = stoneTexture(T.stone, 512, 256, arena.tier + 3).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.round(circ / 4.2), H / 2.2);
    t.needsUpdate = true;
    return t;
  }, [T.stone, circ, H, arena.tier]);
  useEffect(() => () => stone.dispose(), [stone]);
  return (
    <group>
      <mesh position={[0, H / 2, 0]} receiveShadow>
        <cylinderGeometry args={[R + 0.02, R + 0.02, H, 96, 1, true]} />
        <meshStandardMaterial map={stone} side={THREE.BackSide} roughness={0.92} />
      </mesh>
      {/* coping stones on top */}
      <mesh position={[0, H + 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R + 0.6, R + 0.6, 0.16, 96, 1, true]} />
        <meshStandardMaterial color={T.stone} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H + 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[R - 0.02, R + 0.6, 96]} />
        <meshStandardMaterial color={T.stone} roughness={0.85} />
      </mesh>
      {/* sand-worn base */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[R - 0.005, R - 0.005, 0.36, 96, 1, true]} />
        <meshStandardMaterial color={T.sandDark} transparent opacity={0.45} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <Gate arena={arena} angle={0} />
      <Gate arena={arena} angle={Math.PI} />
    </group>
  );
}

function Gate({ arena, angle }) {
  const T = arena.theme;
  const R = arena.radius;
  const H = arena.wallH;
  const wood = useMemo(() => woodTexture(T.wood, 5, 13), [T.wood]);
  const gw = 2.2;
  const gh = Math.min(H - 0.2, 2.5);
  const stoneM = matOf(T.stone, 0.88);
  const iron = matOf("#2b2a28", 0.5, 0.7);
  const bars = [];
  for (let i = 0; i < 9; i++) bars.push(-gw / 2 + 0.12 + (i * (gw - 0.24)) / 8);
  return (
    <group rotation={[0, angle, 0]}>
      <group position={[0, 0, R - 0.02]} rotation={[0, Math.PI, 0]}>
        {/* dark tunnel behind */}
        <mesh position={[0, gh / 2, -0.35]}>
          <planeGeometry args={[gw, gh]} />
          <meshBasicMaterial color="#0d0a08" />
        </mesh>
        {/* wooden doors with iron bands (slightly ajar lattice at the top) */}
        {[-1, 1].map((s) => (
          <group key={s} position={[(s * gw) / 4, gh / 2 - 0.05, -0.12]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[gw / 2 - 0.04, gh * 0.66, 0.08]} />
              <meshStandardMaterial map={wood} roughness={0.8} />
            </mesh>
            {[-0.25, 0.1].map((y) => (
              <mesh key={y} position={[0, y * gh, 0.05]} material={iron}>
                <boxGeometry args={[gw / 2 - 0.06, 0.06, 0.02]} />
              </mesh>
            ))}
          </group>
        ))}
        {bars.map((x) => (
          <mesh key={x} position={[x, gh * 0.84, -0.1]} material={iron}>
            <cylinderGeometry args={[0.018, 0.018, gh * 0.32, 6]} />
          </mesh>
        ))}
        {/* stone frame + lintel */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (gw / 2 + 0.2), gh / 2 + 0.05, 0.05]} material={stoneM} castShadow receiveShadow>
            <boxGeometry args={[0.4, gh + 0.1, 0.35]} />
          </mesh>
        ))}
        <mesh position={[0, gh + 0.22, 0.05]} material={stoneM} castShadow>
          <boxGeometry args={[gw + 0.9, 0.36, 0.4]} />
        </mesh>
        <mesh position={[0, gh + 0.46, 0.07]} material={matOf(T.banner2, 0.5, 0.6)}>
          <boxGeometry args={[0.5, 0.14, 0.05]} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ stands + crowd */
function Stands({ arena, quality, excitement }) {
  const T = arena.theme;
  const Q = QUALITY[quality] || QUALITY.medium;
  const R = arena.radius;
  const H = arena.wallH;
  const tiers = T.tiers;
  const stepD = 1.0;
  const stepH = 0.62;
  const stone = useMemo(() => stoneTexture(T.stone, 256, 128, 21), [T.stone]);
  const rows = [];
  for (let i = 0; i < tiers; i++) rows.push({ r: R + 0.9 + i * stepD, y: H + 0.16 + i * stepH });
  const outerR = R + 0.9 + tiers * stepD;
  const outerY = H + 0.16 + tiers * stepH;
  return (
    <group>
      {rows.map((row, i) => (
        <group key={i}>
          <mesh position={[0, row.y + stepH / 2, 0]} receiveShadow>
            <cylinderGeometry args={[row.r, row.r, stepH, 80, 1, true]} />
            <meshStandardMaterial map={stone} side={THREE.BackSide} roughness={0.9} color={i % 2 ? "#e6e0d6" : "#ffffff"} />
          </mesh>
          <mesh position={[0, row.y + stepH, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <ringGeometry args={[row.r, row.r + stepD, 80]} />
            <meshStandardMaterial color={T.stone} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* outer wall with arches */}
      <OuterWall arena={arena} r={outerR} y={outerY} />
      {T.crowd > 0 && <Crowd arena={arena} rows={rows} count={Math.round(T.crowd * Q.crowd)} excitement={excitement} stepH={stepH} />}
    </group>
  );
}

function OuterWall({ arena, r, y }) {
  const T = arena.theme;
  const arches = arena.tier >= 3 ? 2 : arena.tier >= 2 ? 1 : 0;
  const h = 2.2 + arches * 2.4;
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = T.stone;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 128, 20, 3);
    if (arches) {
      g.fillStyle = T.night ? "#0a0806" : "#2a211a";
      for (let i = 0; i < 4; i++) {
        const x = 16 + i * 64;
        g.beginPath();
        g.moveTo(x, 118);
        g.lineTo(x, 50);
        g.arc(x + 16, 50, 16, Math.PI, 0);
        g.lineTo(x + 32, 118);
        g.fill();
      }
    } else {
      // palisade planks
      g.fillStyle = T.wood;
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = `rgba(0,0,0,${0.1 + (i % 3) * 0.06})`;
        g.fillRect(i * 16, 0, 2, 128);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(Math.round((2 * Math.PI * r) / 7), 1);
    return t;
  }, [T, arches, r]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, y + h / 2, 0]}>
      <cylinderGeometry args={[r + 0.1, r + 0.1, h, 80, 1, true]} />
      <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.95} />
    </mesh>
  );
}

const CROWD_COLORS_DAY = ["#8a3b2e", "#c8b58a", "#5a6b7a", "#7a6a3a", "#e0d6c0", "#6b4a6b", "#4a6a4a", "#a0522d", "#d9c7a0", "#3d5a80"];
const CROWD_COLORS_NIGHT = ["#3a2e36", "#453447", "#353d4d", "#4a3d2c", "#4d3434", "#2e3a2e"];

/** Seated spectators: instanced low-poly figures (body + head), bobbing with excitement. */
function Crowd({ arena, rows, count, excitement, stepH }) {
  const T = arena.theme;
  const bodyRef = useRef();
  const headRef = useRef();
  const data = useMemo(() => {
    const rnd = seeded(arena.tier * 77 + 5);
    const people = [];
    const perRow = Math.ceil(count / rows.length);
    rows.forEach((row, ri) => {
      for (let i = 0; i < perRow && people.length < count; i++) {
        const a = (i / perRow) * Math.PI * 2 + ri * 0.13 + (rnd() - 0.5) * 0.05;
        // leave the gates' lines of sight clear-ish
        const rr = row.r + 0.45 + (rnd() - 0.5) * 0.15;
        people.push({ a, r: rr, y: row.y + stepH, phase: rnd() * Math.PI * 2, amp: 0.5 + rnd(), s: 0.9 + rnd() * 0.25 });
      }
    });
    return people;
  }, [arena.tier, count, rows, stepH]);
  const bodyGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.16, 0.22, 0.62, 7);
    g.translate(0, 0.31, 0);
    return g;
  }, []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.11, 8, 6), []);
  useEffect(() => () => {
    bodyGeo.dispose();
    headGeo.dispose();
  }, [bodyGeo, headGeo]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const cols = T.night ? CROWD_COLORS_NIGHT : CROWD_COLORS_DAY;
    const rnd = seeded(3);
    const c = new THREE.Color();
    data.forEach((p, i) => {
      c.set(cols[Math.floor(rnd() * cols.length)]);
      bodyRef.current.setColorAt(i, c);
      c.set(T.night ? "#4a3a30" : ["#c79a74", "#8a5a3c", "#e0b896", "#5e3a26", "#b07a58"][Math.floor(rnd() * 5)]);
      headRef.current.setColorAt(i, c);
    });
    bodyRef.current.instanceColor.needsUpdate = true;
    headRef.current.instanceColor.needsUpdate = true;
  }, [data, T.night]);
  const frame = useRef(0);
  useFrame((st) => {
    frame.current++;
    if (frame.current % 2 && frame.current > 2) return; // 30 Hz is plenty for a crowd
    const ex = excitement ? excitement.current : 0;
    const t = st.clock.elapsedTime;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const jump = Math.max(0, Math.sin(t * (4 + p.amp * 3) + p.phase)) * (0.02 + ex * 0.22 * p.amp);
      const x = Math.sin(p.a) * p.r;
      const z = Math.cos(p.a) * p.r;
      tmp.position.set(x, p.y + jump, z);
      tmp.rotation.set(0, p.a + Math.PI, 0);
      tmp.scale.setScalar(p.s);
      tmp.updateMatrix();
      bodyRef.current.setMatrixAt(i, tmp.matrix);
      tmp.position.y += 0.72 * p.s;
      tmp.updateMatrix();
      headRef.current.setMatrixAt(i, tmp.matrix);
    }
    bodyRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[bodyGeo, null, data.length]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[headGeo, null, data.length]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ banners / torches / racks */
function Banners({ arena }) {
  const T = arena.theme;
  const R = arena.radius;
  const H = arena.wallH;
  const texA = useMemo(() => bannerTexture(T.banner, T.banner2, arena.tier), [T, arena.tier]);
  const texB = useMemo(() => bannerTexture(T.banner2, T.banner, arena.tier + 1), [T, arena.tier]);
  const n = 6 + arena.tier * 2;
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    // keep the gates clear
    if (Math.abs(Math.sin(a)) < 0.2) continue;
    items.push(a);
  }
  const bannerRefs = useRef([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    bannerRefs.current.forEach((m, i) => {
      if (m) m.rotation.x = Math.sin(t * 1.3 + i) * 0.04;
    });
  });
  return (
    <group>
      {items.map((a, i) => (
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, H + 0.1, R - 0.06]}>
            <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={matOf("#5a3a20", 0.8)}>
              <cylinderGeometry args={[0.03, 0.03, 1.0, 6]} />
            </mesh>
            <mesh ref={(m) => (bannerRefs.current[i] = m)} position={[0, -0.9, 0]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.9, 1.8, 1, 4]} />
              <meshStandardMaterial map={i % 2 ? texB : texA} side={THREE.DoubleSide} transparent alphaTest={0.4} roughness={0.95} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function Torches({ arena, quality }) {
  const T = arena.theme;
  const Q = QUALITY[quality] || QUALITY.medium;
  const R = arena.radius;
  const H = arena.wallH;
  const flameTex = useMemo(() => glowTexture("rgba(255,210,120,1)", "rgba(255,90,20,0)"), []);
  const count = T.torches ? 8 : T.fireBowls ? 0 : 0;
  const bowls = T.fireBowls || 0;
  const flames = useRef([]);
  const lights = useRef([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    flames.current.forEach((f, i) => {
      if (!f) return;
      const k = 0.85 + Math.sin(t * 13 + i * 2.1) * 0.08 + Math.sin(t * 7.3 + i) * 0.07;
      f.scale.set(f.userData.s * k, f.userData.s * (1.1 + (1 - k)), 1);
    });
    lights.current.forEach((l, i) => {
      if (l) l.intensity = l.userData.base * (0.85 + Math.sin(t * 11 + i * 1.7) * 0.1 + Math.sin(t * 5.1 + i) * 0.05);
    });
  });
  const items = [];
  for (let i = 0; i < count; i++) items.push({ a: ((i + 0.25) / count) * Math.PI * 2, kind: "torch" });
  for (let i = 0; i < bowls; i++) items.push({ a: ((i + 0.5) / bowls) * Math.PI * 2, kind: "bowl" });
  let lightBudget = Q.lights;
  return (
    <group>
      {items.map((it, i) => {
        const bowl = it.kind === "bowl";
        const y = bowl ? H + 1.2 : H - 0.55;
        const r = bowl ? R + 0.3 : R - 0.12;
        const light = lightBudget-- > 0;
        return (
          <group key={i} rotation={[0, it.a, 0]}>
            <group position={[0, y, r]}>
              {bowl ? (
                <group>
                  <mesh position={[0, -0.6, 0]} material={matOf("#3a2c20", 0.6, 0.6)}>
                    <cylinderGeometry args={[0.05, 0.12, 1.1, 8]} />
                  </mesh>
                  <mesh material={matOf("#5a4a38", 0.5, 0.7)}>
                    <cylinderGeometry args={[0.36, 0.2, 0.26, 14]} />
                  </mesh>
                </group>
              ) : (
                <group>
                  <mesh position={[0, -0.2, 0.05]} rotation={[0.35, 0, 0]} material={matOf("#3a2616", 0.8)}>
                    <cylinderGeometry args={[0.035, 0.03, 0.5, 6]} />
                  </mesh>
                  <mesh position={[0, 0.02, 0.1]} material={matOf("#2b2a28", 0.5, 0.7)}>
                    <cylinderGeometry args={[0.07, 0.045, 0.12, 8]} />
                  </mesh>
                </group>
              )}
              <sprite
                ref={(m) => {
                  if (m) {
                    m.userData.s = bowl ? 1.1 : 0.5;
                    flames.current[i] = m;
                  }
                }}
                position={[0, bowl ? 0.45 : 0.3, bowl ? 0 : 0.1]}
              >
                <spriteMaterial map={flameTex} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
              </sprite>
              {light && (
                <pointLight
                  ref={(l) => {
                    if (l) {
                      l.userData.base = T.night ? 7 : 2.5;
                      lights.current[i] = l;
                    }
                  }}
                  position={[0, bowl ? 0.6 : 0.35, bowl ? -0.5 : 0.4]}
                  color="#ff9a4a"
                  intensity={T.night ? 7 : 2.5}
                  distance={T.night ? 13 : 7}
                  decay={1.6}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Wall-mounted weapon racks (thin — they never poke into the fighting ring). */
function Racks({ arena }) {
  const R = arena.radius;
  const models = useMemo(() => {
    const out = [];
    for (const [a, list] of [[Math.PI * 0.5, ["gladius", "spear", "longsword"]], [-Math.PI * 0.5, ["axe", "sica", "gladius"]]]) {
      const g = new THREE.Group();
      g.rotation.y = a;
      const back = new THREE.Group();
      back.position.set(0, 0, R - 0.06);
      back.rotation.y = Math.PI;
      g.add(back);
      const wood = matOf(arena.theme.wood, 0.8);
      for (const y of [0.55, 1.45]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.05), wood);
        bar.position.set(0, y, 0.0);
        back.add(bar);
      }
      list.forEach((m, i) => {
        const w = buildWeaponMesh(m);
        w.position.set(-0.55 + i * 0.55, 0.45, 0.06);
        w.rotation.set(0, 0, 0.12 - i * 0.12);
        if (m === "spear") w.scale.setScalar(0.85);
        back.add(w);
      });
      const sh = buildShieldMesh(a > 0 ? "round" : "oval", arena.theme.banner, arena.theme.banner2, a > 0 ? 1 : 2);
      sh.position.set(0.95, 1.1, 0.02);
      sh.scale.multiplyScalar(0.9);
      back.add(sh);
      out.push(g);
    }
    return out;
  }, [R, arena.theme]);
  return (
    <group>
      {models.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
    </group>
  );
}

/** Barrels, crates and rope on the walkway behind the wall — outside the playable ring. */
function Props({ arena }) {
  const R = arena.radius;
  const H = arena.wallH;
  const wood = useMemo(() => woodTexture(arena.theme.wood, 4, 17), [arena.theme.wood]);
  const items = useMemo(() => {
    const rnd = seeded(arena.tier * 13 + 1);
    const out = [];
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.25) continue;
      out.push({ a, kind: rnd() < 0.5 ? "barrel" : "crate", r: R + 0.3 + rnd() * 0.2, rot: rnd() * 3 });
    }
    return out;
  }, [arena.tier, R]);
  return (
    <group>
      {items.map((p, i) => (
        <group key={i} rotation={[0, p.a, 0]}>
          <group position={[0, H + 0.16, p.r]} rotation={[0, p.rot, 0]}>
            {p.kind === "barrel" ? (
              <group>
                <mesh position={[0, 0.4, 0]} castShadow>
                  <cylinderGeometry args={[0.28, 0.25, 0.8, 12]} />
                  <meshStandardMaterial map={wood} roughness={0.85} />
                </mesh>
                {[0.15, 0.65].map((y) => (
                  <mesh key={y} position={[0, y, 0]} material={matOf("#2b2a28", 0.5, 0.6)}>
                    <cylinderGeometry args={[0.285, 0.285, 0.05, 12, 1, true]} />
                  </mesh>
                ))}
              </group>
            ) : (
              <mesh position={[0, 0.3, 0]} castShadow>
                <boxGeometry args={[0.6, 0.6, 0.6]} />
                <meshStandardMaterial map={wood} roughness={0.85} />
              </mesh>
            )}
          </group>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ temple / legends architecture */
function Columns({ arena }) {
  const T = arena.theme;
  const n = T.columns;
  const ref = useRef();
  const R = arena.radius + 0.9 + T.tiers * 1.0 + 0.8;
  const baseY = arena.wallH + 0.16 + T.tiers * 0.62;
  const h = 5.5;
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.makeTranslation(Math.sin(a) * R, baseY + h / 2, Math.cos(a) * R);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [n, R, baseY]);
  if (!n) return null;
  return (
    <group>
      <instancedMesh ref={ref} args={[null, null, n]} castShadow>
        <cylinderGeometry args={[0.45, 0.52, h, 16]} />
        <meshStandardMaterial color={T.stone} roughness={0.7} />
      </instancedMesh>
      <mesh position={[0, baseY + h + 0.3, 0]}>
        <cylinderGeometry args={[R + 0.7, R + 0.7, 0.6, 64, 1, true]} />
        <meshStandardMaterial color={T.stone} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** In-ring pillars (Sun Temple): real colliders for fighters and the camera. */
function Pillars({ arena }) {
  const T = arena.theme;
  if (!arena.pillars.length) return null;
  return (
    <group>
      {arena.pillars.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 2.4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[p.r * 0.9, p.r, 4.8, 18]} />
            <meshStandardMaterial color={T.stone} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[p.r * 2.6, 0.3, p.r * 2.6]} />
            <meshStandardMaterial color={T.stone} roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.9, 0]} castShadow>
            <boxGeometry args={[p.r * 2.5, 0.25, p.r * 2.5]} />
            <meshStandardMaterial color={T.stone} roughness={0.8} />
          </mesh>
          <mesh position={[0, 3.6, 0]}>
            <cylinderGeometry args={[p.r * 0.93, p.r * 0.93, 0.5, 18, 1, true]} />
            <meshStandardMaterial map={bannerTexture(T.banner, T.banner2, i)} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Stone statues of past champions (reuses the gladiator model in stone). */
function Statues({ arena }) {
  const T = arena.theme;
  const n = T.statues || 0;
  const group = useMemo(() => {
    const g = new THREE.Group();
    if (!n) return g;
    const stone = new THREE.MeshStandardMaterial({ color: T.stone, roughness: 0.75 });
    const R = arena.radius + 0.9 + T.tiers * 1.0 + 1.5;
    const baseY = arena.wallH + 0.16 + T.tiers * 0.62;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const rig = buildGladiator({ helmet: i % 2 ? "crest" : "none", hair: "short", beard: i % 3 === 0, bulk: 1.1 }, { weapon: weaponById(i % 3 === 0 ? "spear" : "sword_shield"), armor: "balanced" }, { shadows: false });
      const fake = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, act: null, weapon: weaponById(i % 3 === 0 ? "spear" : "sword_shield"), guardBlend: i % 2 ? 1 : 0, sprintBlend: 0, blocking: false, defeated: false, sprinting: false };
      poseGladiator(rig, fake, 0.016, {});
      poseGladiator(rig, fake, 0.3, {});
      rig.root.traverse((o) => {
        if (o.isMesh) {
          o.material = stone;
          o.castShadow = false;
        }
      });
      const holder = new THREE.Group();
      holder.add(rig.root);
      holder.scale.setScalar(2.2);
      holder.position.set(Math.sin(a) * R, baseY + 0.8, Math.cos(a) * R);
      holder.rotation.y = a + Math.PI;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), stone);
      plinth.position.set(Math.sin(a) * R, baseY, Math.cos(a) * R);
      g.add(plinth);
      g.add(holder);
    }
    return g;
  }, [n, arena, T]);
  return <primitive object={group} />;
}

/* ------------------------------------------------------------------ dust motes */
function Dust({ arena, quality }) {
  const Q = QUALITY[quality] || QUALITY.medium;
  const n = Math.round(Q.dust * (arena.theme.dust || 0));
  const ref = useRef();
  const tex = useMemo(() => glowTexture("rgba(255,244,220,0.9)", "rgba(255,244,220,0)"), []);
  const { positions, seeds } = useMemo(() => {
    const rnd = seeded(41);
    const p = new Float32Array(n * 3);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * arena.radius;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = 0.2 + rnd() * 3.5;
      p[i * 3 + 2] = Math.sin(a) * r;
      s[i] = rnd() * 100;
    }
    return { positions: p, seeds: s };
  }, [n, arena.radius]);
  useFrame((st, dt) => {
    if (!ref.current) return;
    const attr = ref.current.geometry.attributes.position;
    const t = st.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const sd = seeds[i];
      attr.array[i * 3] += Math.sin(t * 0.3 + sd) * 0.05 * dt + 0.06 * dt;
      attr.array[i * 3 + 1] += Math.sin(t * 0.5 + sd * 2) * 0.04 * dt;
      attr.array[i * 3 + 2] += Math.cos(t * 0.27 + sd) * 0.05 * dt;
      if (attr.array[i * 3] > arena.radius) attr.array[i * 3] = -arena.radius;
    }
    attr.needsUpdate = true;
  });
  if (!n) return null;
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={n} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={tex} size={0.06} sizeAttenuation transparent opacity={arena.theme.night ? 0.25 : 0.5} depthWrite={false} color={arena.theme.sun} />
    </points>
  );
}

/* ------------------------------------------------------------------ assembly */
export default function Arena({ arena, quality = "medium", excitement }) {
  const Q = QUALITY[quality] || QUALITY.medium;
  return (
    <group>
      <SkyAndLight arena={arena} quality={quality} />
      <Floor arena={arena} quality={quality} />
      <Wall arena={arena} />
      <Stands arena={arena} quality={quality} excitement={excitement} />
      <Banners arena={arena} />
      <Torches arena={arena} quality={quality} />
      <Racks arena={arena} />
      {Q.props >= 1 && <Props arena={arena} />}
      <Pillars arena={arena} />
      <Columns arena={arena} />
      {quality !== "low" && <Statues arena={arena} />}
      <Dust arena={arena} quality={quality} />
    </group>
  );
}

/* ------------------------------------------------------------------ camera collision */
/**
 * Clip a camera ray (pivot → desired) against the arena's solid geometry:
 * the inside of the wall cylinder and every pillar. Returns the allowed
 * distance along the ray (≤ `len`). Pure maths — no raycasting against meshes.
 */
export function cameraClip(arena, px, pz, dx, dz, len, margin = 0.28) {
  let best = len;
  // wall: find t where |p + d t| = R − margin (ray starts inside)
  const R = arena.radius - margin;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const c = px * px + pz * pz - R * R;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b + Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t < best) best = t;
    }
    if (c > 0) best = 0; // pivot itself outside (shouldn't happen)
  }
  for (const p of arena.pillars || []) {
    const ox = px - p.x;
    const oz = pz - p.z;
    const r = p.r + margin;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t >= 0 && t < best) best = t;
  }
  return Math.max(0, best);
}
