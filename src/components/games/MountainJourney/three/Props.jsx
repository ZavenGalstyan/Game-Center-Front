/**
 * Mountain Journey — every authored prop, drawn from the builder's
 * descriptors (L.props) plus the live puzzle objects of the game
 * (badges, platforms, crates, gates, bridges, levers, switches, keys,
 * checkpoints). Each obstacle has one consistent visual language:
 *
 *   climbable ledge   pale stone lip + yellow trail-paint chevrons
 *   ladder            wooden rails and rungs, always yellow-tipped
 *   interactable      brass + a soft glow ring while usable
 *   checkpoint        regional marker that lights up when reached
 *   Mountain Badge    spinning bronze medallion with a light shaft
 *
 * Point lights are pooled (<LightPool>): props only register sources.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mats } from "./materials.js";
import { signTex, flagTex, badgeTex, softDot } from "./textures.js";
import { mulberry32, fbm } from "../engine/rng.js";

const fwd = (h) => [Math.sin(h), Math.cos(h)];
const right = (h) => [-Math.cos(h), Math.sin(h)];

// --- shared rock geometry -----------------------------------------------------
const rockGeos = new Map();
function rockGeo(seed = 0, flat = 0) {
  const key = `${seed % 8}:${flat}`;
  if (rockGeos.has(key)) return rockGeos.get(key);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const rand = mulberry32(seed % 8 + 11);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const s = 0.78 + fbm(x * 1.7 + seed, z * 1.7 + y, 3 + (seed % 8), 2) * 0.45 + rand() * 0.05;
    let yy = y * s * 0.72;
    if (flat && yy > 0.35) yy = 0.35 + (yy - 0.35) * 0.15;
    p.setXYZ(i, x * s, yy, z * s);
  }
  g.computeVertexNormals();
  rockGeos.set(key, g);
  return g;
}
export function disposePropGeometry() {
  for (const g of rockGeos.values()) g.dispose();
  rockGeos.clear();
}

function Rock({ position, scale = 1, seed = 0, mat, rot = 0, flat = 0, cast = true }) {
  return <mesh geometry={rockGeo(seed, flat)} material={mat || mats.rock()} position={position} scale={scale} rotation={[0, rot, 0]} castShadow={cast} receiveShadow />;
}

function Beam({ a, b, w = 0.12, h = 0.12, mat }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len)), [dx, dy, dz, len]);
  return (
    <mesh position={mid} quaternion={q} material={mat || mats.wood()} castShadow receiveShadow>
      <boxGeometry args={[w, h, len]} />
    </mesh>
  );
}

function Rope({ points, r = 0.025 }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), r, 5, false);
  }, [points, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mats.rope()} castShadow />;
}
function sagRope(a, b, sag, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
}

function Post({ x, y, z, h = 1.2, r = 0.07, mat }) {
  return (
    <mesh position={[x, y + h / 2, z]} material={mat || mats.bark("#6b4a32")} castShadow>
      <cylinderGeometry args={[r * 0.85, r, h, 7]} />
    </mesh>
  );
}

/** A flat textured board facing along heading h. */
function Board({ x, y, z, h, w = 1.2, hh = 0.45, tex }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), [tex]);
  useEffect(() => () => m.dispose(), [m]);
  return (
    <mesh position={[x, y, z]} rotation={[0, h, 0]} material={m} castShadow>
      <boxGeometry args={[w, hh, 0.05]} />
    </mesh>
  );
}

// --- light sources (consumed by <LightPool>) -----------------------------------
export function collectLights(L) {
  const out = [];
  for (const p of L.props) {
    if (p.k === "camp") out.push({ x: p.x, y: p.y + 0.6, z: p.z, color: "#ffa04a", intensity: 2.4, distance: 11, flicker: true });
    if (p.k === "checkpoint" && (p.kind === "lantern" || p.kind === "shelter")) out.push({ x: p.x, y: p.y + 1.7, z: p.z, color: "#ffc070", intensity: 1.4, distance: 8, cp: p.id });
  }
  for (const c of L.caves) {
    c.nodes.forEach((n, i) => {
      if (i % 3 === 1) out.push({ x: n.x, y: n.y + 1.6, z: n.z, color: i % 6 === 1 ? "#ffb466" : c.color, intensity: 1.6, distance: 9 });
    });
  }
  return out;
}

// --- static props -----------------------------------------------------------------
function Camp({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const snow = p.kind === "snowCamp";
  const at = (d, s) => [p.x + fx * d + rx * s, p.y, p.z + fz * d + rz * s];
  const flame = useRef();
  useFrame(({ clock }) => {
    if (flame.current) {
      const t = clock.elapsedTime;
      flame.current.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9.3) * 0.18, 1 + Math.cos(t * 11) * 0.08);
    }
  });
  const tent = at(1.2, -2.6);
  const fire = at(0.2, 1.4);
  const canvas = snow ? "#c9572f" : "#d9862f";
  return (
    <group>
      {/* tent: two sloped canvas panels + a back wall */}
      <group position={tent} rotation={[0, p.h + Math.PI / 2 + 0.3, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.62, s * 0.55]} rotation={[s * 0.85, 0, 0]} material={mats.plain(canvas, { side: THREE.DoubleSide, roughness: 0.9 })} castShadow receiveShadow>
            <boxGeometry args={[2.2, 0.03, 1.5]} />
          </mesh>
        ))}
        <mesh position={[-1.05, 0.55, 0]} material={mats.plain("#a85f22", { side: THREE.DoubleSide })}>
          <cylinderGeometry args={[0.02, 0.02, 1.2, 4]} />
        </mesh>
        <mesh position={[1.08, 0.52, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.plain("#7a4418")}>
          <circleGeometry args={[0.55, 3, Math.PI / 2]} />
        </mesh>
        {snow && (
          <mesh position={[0, 1.18, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.plain("#f4f8fb")}>
            <cylinderGeometry args={[0.08, 0.08, 2.2, 6]} />
          </mesh>
        )}
      </group>
      {/* fire ring, logs, flame */}
      <group position={fire}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          return <Rock key={i} position={[Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55]} scale={[0.18, 0.16, 0.18]} seed={i} />;
        })}
        {[0, 1.1, 2.2].map((a) => (
          <mesh key={a} position={[0, 0.12, 0]} rotation={[0.45, a, 0]} material={mats.bark("#4a3020")} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 0.8, 6]} />
          </mesh>
        ))}
        <group ref={flame} position={[0, 0.2, 0]}>
          <mesh position={[0, 0.25, 0]} material={mats.glow("#ff8a2a", 2.6)}>
            <coneGeometry args={[0.22, 0.6, 7]} />
          </mesh>
          <mesh position={[0.05, 0.22, 0.03]} material={mats.glow("#ffd36a", 3)}>
            <coneGeometry args={[0.12, 0.42, 6]} />
          </mesh>
        </group>
      </group>
      {/* log seats */}
      {[
        [-0.4, 3.0, 0.3],
        [1.4, 2.8, -0.5],
      ].map(([d, s, r], i) => (
        <mesh key={i} position={[...at(d, s)].map((v, k) => (k === 1 ? v + 0.22 : v))} rotation={[0, p.h + r, Math.PI / 2]} material={mats.bark("#6a4a30")} castShadow receiveShadow>
          <cylinderGeometry args={[0.22, 0.24, 1.5, 9]} />
        </mesh>
      ))}
      {/* lantern on a post */}
      <group position={at(-1.6, -0.9)}>
        <Post x={0} y={0} z={0} h={1.5} />
        <mesh position={[0, 1.4, 0.12]} material={mats.glow("#ffcf7a", 2.2)}>
          <boxGeometry args={[0.13, 0.18, 0.13]} />
        </mesh>
      </group>
      {/* firewood stack + pack */}
      <group position={at(-0.8, -1.4)} rotation={[0, p.h, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.1 + (i === 2 ? 0.18 : 0), (i - 1) * 0.2 * (i === 2 ? 0 : 1)]} rotation={[0, 0, Math.PI / 2]} material={mats.bark("#5d4128")} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.9, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function TrailSign({ p }) {
  const tex = signTex(p.text || "Trail", "Trailhead");
  const [rx, rz] = right(p.h);
  return (
    <group>
      <Post x={p.x - rx * 0.5} y={p.y} z={p.z - rz * 0.5} h={1.7} />
      <Post x={p.x + rx * 0.5} y={p.y} z={p.z + rz * 0.5} h={1.7} />
      <Board x={p.x} y={p.y + 1.35} z={p.z} h={p.h + Math.PI} w={1.3} hh={0.5} tex={tex} />
    </group>
  );
}

function Log({ p }) {
  const [rx, rz] = right(p.h);
  const len = p.len;
  return (
    <group position={[p.x, p.y + p.r * 0.75, p.z]} rotation={[0, p.h, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={mats.bark("#5e4430")} castShadow receiveShadow>
        <cylinderGeometry args={[p.r * 0.92, p.r, len, 12, 3]} />
      </mesh>
      {/* cut end rings */}
      <mesh position={[-len / 2 - 0.005, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.plain("#c9a77a")}>
        <circleGeometry args={[p.r, 14]} />
      </mesh>
      {/* root plate on the far end */}
      <mesh position={[len / 2 + 0.1, 0.1, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.plain("#5a4632")} castShadow>
        <cylinderGeometry args={[0.95, 0.75, 0.3, 9]} />
      </mesh>
      {/* moss + stubs */}
      {p.moss &&
        [-1.1, 0.4, 1.6].map((x, i) => (
          <mesh key={i} position={[x, p.r * 0.72, 0]} scale={[0.6, 0.25, 0.45]} material={mats.flat("#5f8a3a")}>
            <sphereGeometry args={[0.4, 8, 6]} />
          </mesh>
        ))}
      {[-0.6, 1.0].map((x, i) => (
        <mesh key={`s${i}`} position={[x, p.r * 0.9, 0.1]} rotation={[0.5, 0, 0.3]} material={mats.bark("#5e4430")}>
          <cylinderGeometry args={[0.03, 0.06, 0.5, 5]} />
        </mesh>
      ))}
      {void rx}
      {void rz}
    </group>
  );
}

function StreamRocks({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const rand = mulberry32(Math.round(p.x * 13 + p.z * 7));
  const list = useMemo(() => {
    const o = [];
    for (let i = 0; i < 9; i++) {
      const s = (rand() - 0.5) * 6;
      const d = (rand() - 0.5) * p.w * 1.6;
      o.push([p.x + rx * s + fx * d, p.y - 0.25, p.z + rz * s + fz * d, 0.15 + rand() * 0.25, i]);
    }
    return o;
  }, [p, fx, fz, rx, rz, rand]);
  return (
    <group>
      {list.map((r, i) => (
        <Rock key={i} position={[r[0], r[1], r[2]]} scale={r[3]} seed={r[4]} mat={mats.wetRock()} />
      ))}
    </group>
  );
}

function Dam({ p }) {
  const [fx, fz] = fwd(p.h);
  const rand = mulberry32(Math.round(Math.abs(p.seed) * 31 + 5));
  return (
    <group>
      {[-1.95, -0.65, 0.65, 1.95].map((d, i) => (
        <Rock key={i} position={[p.x + fx * d, p.y + 0.6, p.z + fz * d]} scale={[1.15, 1.6 + rand() * 0.4, 1.1]} seed={i + 3} rot={rand() * 6} mat={mats.wetRock()} />
      ))}
      {[-1.2, 0, 1.3].map((d, i) => (
        <Rock key={`t${i}`} position={[p.x + fx * d, p.y + 1.8, p.z + fz * d]} scale={0.7} seed={i + 1} rot={rand() * 6} />
      ))}
    </group>
  );
}

function GapEdges({ p }) {
  const [rx, rz] = right(p.h);
  const W = p.w + 2.2;
  const faces = [
    [p.ax, p.az, 1],
    [p.bx, p.bz, -1],
  ];
  return (
    <group>
      {faces.map(([x, z, s], i) => (
        <group key={i}>
          <mesh position={[x - Math.sin(p.h) * 0.15 * -s, p.y - 2.2, z - Math.cos(p.h) * 0.15 * -s]} rotation={[0, p.h, 0]} material={mats.rock(p.y > 40 ? "#7c8188" : "#7a746a")} receiveShadow castShadow>
            <boxGeometry args={[W * 2, 4.4, 0.3]} />
          </mesh>
          {[-1, 1].map((k) => (
            <Rock key={k} position={[x + rx * k * (p.w + 0.6), p.y + 0.1, z + rz * k * (p.w + 0.6)]} scale={0.6} seed={i * 2 + k + 4} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Bridge({ p }) {
  const len = p.len;
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const span = p.span;
  const cx = (p.ax + p.bx) / 2;
  const cz = (p.az + p.bz) / 2;
  const at = (d, s, y) => [cx + fx * d + rx * s, y, cz + fz * d + rz * s];
  const sag = p.kind === "rope" ? Math.min(0.36, len * 0.035) : 0;
  const planks = useMemo(() => {
    const n = Math.round(span / 0.32);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const d = -span / 2 + span * t;
      const y = p.y - 0.06 - Math.sin(Math.PI * t) * sag;
      out.push({ d, y, tilt: (i % 3) * 0.02 - 0.02 });
    }
    return out;
  }, [span, p.y, sag]);
  if (p.kind === "stone") {
    return (
      <group position={[cx, 0, cz]} rotation={[0, p.h, 0]}>
        <mesh position={[0, p.y - 0.25, 0]} material={mats.rock("#9a9284")} castShadow receiveShadow>
          <boxGeometry args={[2.6, 0.5, span]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.2, p.y + 0.35, 0]} material={mats.rock("#8f887b")} castShadow>
            <boxGeometry args={[0.3, 0.7, span]} />
          </mesh>
        ))}
        <mesh position={[0, p.y - 0.6, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.rock("#8a8376")} castShadow>
          <torusGeometry args={[len / 2, 0.55, 6, 16, Math.PI]} />
        </mesh>
      </group>
    );
  }
  const railY = 1.05;
  const posts = [-span / 2, span / 2];
  return (
    <group>
      {planks.map((pl, i) => (
        <mesh key={i} position={at(pl.d, 0, pl.y)} rotation={[pl.tilt, p.h, 0]} material={mats.wood("#8a6440")} castShadow receiveShadow>
          <boxGeometry args={[2.15, 0.07, 0.28]} />
        </mesh>
      ))}
      {p.kind === "wood" &&
        [-0.85, 0.85].map((s) => (
          <mesh key={s} position={at(0, s, p.y - 0.22)} rotation={[0, p.h, 0]} material={mats.wood("#6a4a2e")} castShadow>
            <boxGeometry args={[0.18, 0.28, span + 0.4]} />
          </mesh>
        ))}
      {posts.map((d) =>
        [-1.17, 1.17].map((s) => (
          <group key={`${d}${s}`}>
            <Post x={at(d, s, 0)[0]} y={p.y - 0.4} z={at(d, s, 0)[2]} h={1.75} r={0.1} />
          </group>
        )),
      )}
      {[-1.17, 1.17].map((s) =>
        p.kind === "rope" ? (
          <group key={s}>
            <Rope points={sagRope(at(-span / 2, s, p.y + railY), at(span / 2, s, p.y + railY), sag + 0.2)} r={0.035} />
            <Rope points={sagRope(at(-span / 2, s, p.y + 0.05), at(span / 2, s, p.y + 0.05), sag)} r={0.03} />
          </group>
        ) : (
          <group key={s}>
            <Beam a={at(-span / 2, s, p.y + railY)} b={at(span / 2, s, p.y + railY)} w={0.09} h={0.11} mat={mats.wood("#7a5634")} />
            {Array.from({ length: Math.max(2, Math.round(span / 1.6)) + 1 }, (_, i) => {
              const d = -span / 2 + (span * i) / Math.max(2, Math.round(span / 1.6));
              return <Beam key={i} a={at(d, s, p.y - 0.05)} b={at(d, s, p.y + railY)} w={0.08} h={0.08} mat={mats.wood("#6f4f30")} />;
            })}
          </group>
        ),
      )}
      {p.kind === "rope" &&
        planks
          .filter((_, i) => i % 3 === 0)
          .map((pl, i) =>
            [-1.17, 1.17].map((s) => (
              <mesh key={`v${i}${s}`} position={at(pl.d, s, pl.y + 0.55)} material={mats.rope()}>
                <cylinderGeometry args={[0.012, 0.012, 1.0, 4]} />
              </mesh>
            )),
          )}
    </group>
  );
}

function SteppingStone({ p }) {
  const mat = p.icy ? mats.plain("#cfe3ef", { roughness: 0.2 }) : mats.wetRock();
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh position={[0, -1.15, 0]} material={mat} castShadow receiveShadow>
        <cylinderGeometry args={[p.r * 0.9, p.r * 1.2, 2.1, 9]} />
      </mesh>
      <mesh geometry={rockGeo(p.seed || 1, 1)} position={[0, -0.27, 0]} scale={[p.r * 1.02, 0.75, p.r * 1.02]} rotation={[0, (p.seed || 1) * 1.3, 0]} material={p.icy ? mat : mats.rock("#8f9089")} castShadow receiveShadow />
      {p.icy && (
        <mesh position={[0, 0.06, 0]} scale={[p.r * 0.9, 0.05, p.r * 0.9]} material={mats.plain("#f2f8fc")}>
          <sphereGeometry args={[1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      )}
    </group>
  );
}

function Cableway({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const H = 3.2;
  const ends = [
    [p.ax - fx * 0.8, p.az - fz * 0.8],
    [p.bx + fx * 0.8, p.bz + fz * 0.8],
  ];
  return (
    <group>
      {ends.map(([x, z], i) =>
        [-1.5, 1.5].map((s) => <Post key={`${i}${s}`} x={x + rx * s} y={p.y - 0.3} z={z + rz * s} h={H + 0.3} r={0.12} />),
      )}
      {ends.map(([x, z], i) => (
        <Beam key={`b${i}`} a={[x - rx * 1.6, p.y + H - 0.05, z - rz * 1.6]} b={[x + rx * 1.6, p.y + H - 0.05, z + rz * 1.6]} w={0.16} h={0.16} />
      ))}
      {[-0.9, 0.9].map((s) => (
        <Rope key={s} points={sagRope([ends[0][0] + rx * s, p.y + H, ends[0][1] + rz * s], [ends[1][0] + rx * s, p.y + H, ends[1][1] + rz * s], 0.15)} r={0.03} />
      ))}
      {ends.map(([x, z], i) => (
        <mesh key={`w${i}`} position={[x, p.y + H + 0.12, z]} rotation={[0, p.h + Math.PI / 2, Math.PI / 2]} material={mats.metal()}>
          <torusGeometry args={[0.22, 0.05, 6, 14]} />
        </mesh>
      ))}
    </group>
  );
}

function LiftFrame({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const top = p.y + p.H + 3;
  return (
    <group>
      {[-1.5, 1.5].map((s) => (
        <Post key={s} x={p.px + rx * s} y={p.y - 0.2} z={p.pz + rz * s} h={top - p.y + 0.2} r={0.13} />
      ))}
      <Beam a={[p.px - rx * 1.6, top, p.pz - rz * 1.6]} b={[p.px + rx * 1.6, top, p.pz + rz * 1.6]} w={0.18} h={0.18} />
      <mesh position={[p.px, top + 0.2, p.pz]} rotation={[0, p.h, Math.PI / 2]} material={mats.metal()}>
        <torusGeometry args={[0.26, 0.06, 6, 14]} />
      </mesh>
      {/* counterweight hint */}
      <mesh position={[p.px - fx * 0.2 + rx * 1.3, p.y + p.H * 0.6, p.pz - fz * 0.2 + rz * 1.3]} material={mats.rock("#6e6a64")}>
        <boxGeometry args={[0.35, 0.6, 0.35]} />
      </mesh>
    </group>
  );
}

/** A rocky face covering a terrain step (ledges, ladders, lifts). */
function CliffFace({ p, ledge }) {
  const [fx, fz] = fwd(p.h);
  const W = (p.w + 1.5) * 2;
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(W, p.H + 0.6, 0.6, Math.ceil(W * 2), Math.ceil(p.H * 2), 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (z < 0) {
        const n = fbm(x * 0.9 + p.x, y * 0.9 + p.z, 7, 3);
        pos.setZ(i, z - n * 0.35);
      }
    }
    g.computeVertexNormals();
    return g;
  }, [W, p.H, p.x, p.z]);
  useEffect(() => () => geo.dispose(), [geo]);
  const cx = p.x + fx * 0.28;
  const cz = p.z + fz * 0.28;
  const lipMat = mats.rock("#cdbf9d");
  return (
    <group>
      <mesh geometry={geo} position={[cx, p.y + p.H / 2 - 0.3, cz]} rotation={[0, p.h, 0]} material={mats.rock(ledge ? "#8f8678" : "#7b766d")} castShadow receiveShadow />
      {ledge && (
        <group>
          {/* pale lip along the climbable top edge */}
          <mesh position={[p.x + fx * 0.05, p.y + p.H - 0.06, p.z + fz * 0.05]} rotation={[0, p.h, 0]} material={lipMat} castShadow>
            <boxGeometry args={[p.w * 2 - 0.2, 0.16, 0.34]} />
          </mesh>
          {/* yellow trail-paint chevrons + handholds */}
          {[-p.w * 0.55, 0, p.w * 0.55].map((s, i) => {
            const [rx, rz] = right(p.h);
            return (
              <group key={i} position={[p.x - fx * 0.03 + rx * s, p.y + p.H * 0.62, p.z - fz * 0.03 + rz * s]} rotation={[0, p.h + Math.PI, 0]}>
                <mesh position={[-0.09, 0, 0]} rotation={[0, 0, 0.6]} material={mats.glow("#f2c230", 0.35)}>
                  <boxGeometry args={[0.24, 0.06, 0.02]} />
                </mesh>
                <mesh position={[0.09, 0, 0]} rotation={[0, 0, -0.6]} material={mats.glow("#f2c230", 0.35)}>
                  <boxGeometry args={[0.24, 0.06, 0.02]} />
                </mesh>
                <mesh position={[0.25, -0.5, -0.02]} material={lipMat}>
                  <boxGeometry args={[0.18, 0.08, 0.1]} />
                </mesh>
                <mesh position={[-0.2, -0.9, -0.02]} material={lipMat}>
                  <boxGeometry args={[0.18, 0.08, 0.1]} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}

function Ladder({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const lean = 0.18;
  const H = p.H + 0.9;
  const base = [p.x - fx * (lean + 0.08), p.y, p.z - fz * (lean + 0.08)];
  const top = [p.x - fx * 0.02, p.y + H, p.z - fz * 0.02];
  const rungs = Math.round(H / 0.32);
  return (
    <group>
      {[-0.3, 0.3].map((s) => (
        <Beam key={s} a={[base[0] + rx * s, base[1], base[2] + rz * s]} b={[top[0] + rx * s, top[1], top[2] + rz * s]} w={0.08} h={0.08} mat={mats.wood("#9a6d3e")} />
      ))}
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.6) / rungs;
        const c = [base[0] + (top[0] - base[0]) * t, base[1] + (top[1] - base[1]) * t, base[2] + (top[2] - base[2]) * t];
        return <Beam key={i} a={[c[0] - rx * 0.3, c[1], c[2] - rz * 0.3]} b={[c[0] + rx * 0.3, c[1], c[2] + rz * 0.3]} w={0.05} h={0.05} mat={mats.wood("#b0814b")} />;
      })}
      {[-0.3, 0.3].map((s) => (
        <mesh key={`t${s}`} position={[top[0] + rx * s, top[1] + 0.04, top[2] + rz * s]} material={mats.glow("#f2c230", 0.4)}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

function RailSeg({ p }) {
  if (p.kind === "rope") {
    const [fx, fz] = fwd(p.h);
    const a = [p.x - fx * p.len * 0.5, p.y + 0.95, p.z - fz * p.len * 0.5];
    const b = [p.x + fx * p.len * 0.5, p.y + 0.95, p.z + fz * p.len * 0.5];
    return (
      <group>
        <Post x={a[0]} y={p.y - 0.1} z={a[2]} h={1.15} r={0.06} />
        <Rope points={sagRope(a, b, 0.12, 6)} r={0.03} />
      </group>
    );
  }
  return (
    <mesh position={[p.x, p.y + 0.2, p.z]} rotation={[0, p.h, 0]} material={mats.rock("#8c877e")} castShadow receiveShadow>
      <boxGeometry args={[0.36, 0.55, p.len + 0.05]} />
    </mesh>
  );
}

function WindFlags({ p }) {
  const segs = [];
  for (let i = 2; i < p.nodes.length; i += 3) segs.push([p.nodes[i - 2], p.nodes[i]]);
  const colors = ["#d9452b", "#f2c230", "#2f6fa8", "#3f8f4f", "#f4f1ea"];
  return (
    <group>
      {segs.map(([a, b], i) => {
        const h = Math.atan2(b.x - a.x, b.z - a.z);
        const [rx, rz] = right(h);
        const off = -2.2 * p.sgn;
        const A = [a.x + rx * off, a.y + 2.4, a.z + rz * off];
        const B = [b.x + rx * off, b.y + 2.4, b.z + rz * off];
        const pts = sagRope(A, B, 0.35, 8);
        return (
          <group key={i}>
            <Post x={A[0]} y={a.y} z={A[2]} h={2.5} r={0.06} />
            <Rope points={pts} r={0.012} />
            {pts.slice(1, -1).map((q, k) => (
              <mesh key={k} position={[q[0], q[1] - 0.16, q[2]]} rotation={[0, h + Math.PI / 2, 0]} material={mats.cloth(colors[(k + i) % colors.length])}>
                <planeGeometry args={[0.28, 0.3]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Overlook({ p }) {
  const [fx, fz] = fwd(p.h);
  const [rx, rz] = right(p.h);
  const at = (d, s, y = 0) => [p.x + fx * d + rx * s, p.y + y, p.z + fz * d + rz * s];
  const edge = 2.65;
  return (
    <group>
      {/* railing */}
      {Array.from({ length: 7 }, (_, i) => {
        const s = -2.7 + i * 0.9;
        const q = at(edge, s);
        return <Post key={i} x={q[0]} y={p.y - 0.1} z={q[2]} h={1.15} r={0.06} />;
      })}
      <Beam a={at(edge, -2.8, 1.0)} b={at(edge, 2.8, 1.0)} w={0.08} h={0.09} />
      <Beam a={at(edge, -2.8, 0.55)} b={at(edge, 2.8, 0.55)} w={0.06} h={0.07} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Beam a={at(-0.9, s * 2.75, 1.0)} b={at(edge, s * 2.75, 1.0)} w={0.08} h={0.09} />
          {[-0.9, 0.9].map((d) => {
            const q = at(d, s * 2.75);
            return <Post key={d} x={q[0]} y={p.y - 0.1} z={q[2]} h={1.15} r={0.06} />;
          })}
        </group>
      ))}
      {/* bench facing the view */}
      <group position={at(0.3, -1.2)} rotation={[0, p.h, 0]}>
        <mesh position={[0, 0.45, 0]} material={mats.wood("#8a6440")} castShadow>
          <boxGeometry args={[1.6, 0.08, 0.42]} />
        </mesh>
        <mesh position={[0, 0.75, -0.2]} rotation={[-0.15, 0, 0]} material={mats.wood("#8a6440")} castShadow>
          <boxGeometry args={[1.6, 0.3, 0.06]} />
        </mesh>
        {[-0.65, 0.65].map((x) => (
          <mesh key={x} position={[x, 0.22, 0]} material={mats.wood("#6a4a2e")}>
            <boxGeometry args={[0.08, 0.44, 0.38]} />
          </mesh>
        ))}
      </group>
      {/* coin telescope at the marker */}
      <group position={[p.mx, p.y, p.mz]} rotation={[0, p.h, 0]}>
        <mesh position={[0, 0.5, 0]} material={mats.metal("#3f5f6f")} castShadow>
          <cylinderGeometry args={[0.06, 0.12, 1.0, 8]} />
        </mesh>
        <mesh position={[0, 1.1, 0.08]} rotation={[-1.35, 0, 0]} material={mats.metal("#4a7286")} castShadow>
          <cylinderGeometry args={[0.07, 0.1, 0.55, 10]} />
        </mesh>
        <mesh position={[0, 1.0, 0]} material={mats.metal("#c9a24a")}>
          <boxGeometry args={[0.2, 0.14, 0.16]} />
        </mesh>
      </group>
    </group>
  );
}

function Boulder({ p }) {
  const h = p.top - p.y;
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh position={[0, h / 2 - 0.25, 0]} material={mats.rock("#8b867c")} castShadow receiveShadow>
        <cylinderGeometry args={[p.r * 0.95, p.r * 1.15, h + 0.5, 9]} />
      </mesh>
      <mesh position={[0, h - 0.02, 0]} scale={[p.r * 0.96, 0.1, p.r * 0.96]} material={mats.flat("#7f9a52")}>
        <sphereGeometry args={[1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Rock position={[p.r * 0.9, 0.1, 0.3]} scale={0.45} seed={3} />
    </group>
  );
}

function WetRocks({ p }) {
  const rand = mulberry32(p.seed * 17 + 3);
  const list = useMemo(() => {
    const o = [];
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const r = p.r * (0.95 + rand() * 0.4);
      o.push([p.x + Math.cos(a) * r, p.y - 0.1, p.z + Math.sin(a) * r, 0.35 + rand() * 0.6, i]);
    }
    return o;
  }, [p, rand]);
  return (
    <group>
      {list.map((r, i) => (
        <Rock key={i} position={[r[0], r[1], r[2]]} scale={r[3]} seed={r[4]} mat={mats.wetRock()} />
      ))}
    </group>
  );
}

function Arch({ p }) {
  const [rx, rz] = right(p.h);
  const W = p.w + 0.55;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[p.x + rx * s * W, p.y + 1.9, p.z + rz * s * W]} material={mats.rock("#a59c8c")} castShadow receiveShadow>
          <cylinderGeometry args={[0.38, 0.48, 3.8, 8]} />
        </mesh>
      ))}
      <mesh position={[p.x, p.y + 4.0, p.z]} rotation={[0, p.h, 0]} material={mats.rock("#9b9282")} castShadow>
        <boxGeometry args={[W * 2 + 1.2, 0.55, 0.8]} />
      </mesh>
      <mesh position={[p.x, p.y + 4.45, p.z]} rotation={[0, p.h, 0]} material={mats.rock("#8f8778")} castShadow>
        <boxGeometry args={[W * 1.2, 0.35, 0.6]} />
      </mesh>
    </group>
  );
}

function Pillar({ p }) {
  const h = p.broken ? 1.6 : 3.4;
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh position={[0, h / 2, 0]} material={mats.rock("#a69d8d")} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.4, h, 8]} />
      </mesh>
      {!p.broken && (
        <mesh position={[0, h + 0.1, 0]} material={mats.rock("#9b9282")} castShadow>
          <boxGeometry args={[0.9, 0.22, 0.9]} />
        </mesh>
      )}
      {p.broken && <Rock position={[0.8, 0.2, 0.4]} scale={0.4} seed={5} mat={mats.rock("#a69d8d")} />}
    </group>
  );
}

function Finish({ p }) {
  const flag = useRef();
  const summit = p.kind === "summit";
  const tex = flagTex(summit ? "#2f6fa8" : "#d9452b");
  const fm = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
    return m;
  }, [tex]);
  useEffect(() => () => fm.dispose(), [fm]);
  const geo = useMemo(() => new THREE.PlaneGeometry(1.6, 1.0, 12, 4), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 0.8;
      pos.setZ(i, Math.sin(x * 3.2 - t * 6) * 0.1 * x);
    }
    pos.needsUpdate = true;
  });
  const H = summit ? 5.2 : 4.0;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.h, 0]}>
      {/* cairn */}
      {[0.75, 0.6, 0.48, 0.36, 0.26].map((r, i) => (
        <Rock key={i} position={[0, 0.2 + i * 0.36, 0]} scale={[r, r * 0.8, r]} seed={i + 2} rot={i} />
      ))}
      <mesh position={[0, H / 2, 0]} material={mats.metal("#d8d4cc")} castShadow>
        <cylinderGeometry args={[0.05, 0.06, H, 8]} />
      </mesh>
      <mesh position={[0, H + 0.08, 0]} material={mats.glow("#f2c230", 1)}>
        <sphereGeometry args={[0.09, 10, 8]} />
      </mesh>
      <mesh ref={flag} geometry={geo} material={fm} position={[0.82, H - 0.6, 0]} castShadow />
      {summit && (
        <mesh position={[0, 1.2, 0.62]} rotation={[-0.3, 0, 0]} material={mats.metal("#b98f3a")}>
          <boxGeometry args={[0.7, 0.45, 0.05]} />
        </mesh>
      )}
    </group>
  );
}

function Pedestal({ p }) {
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh position={[0, 0.45, 0]} material={mats.rock("#a29a8c")} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.42, 0.9, 8]} />
      </mesh>
      <mesh position={[0, 0.93, 0]} material={mats.rock("#b3ab9c")}>
        <cylinderGeometry args={[0.4, 0.36, 0.08, 8]} />
      </mesh>
    </group>
  );
}

function Plate({ p }) {
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.h, 0]}>
      <mesh position={[0, 0.01, 0]} material={mats.metal("#8a6a3a")} receiveShadow>
        <boxGeometry args={[1.4, 0.04, 1.4]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} material={mats.rock("#9a9284")} receiveShadow>
        <boxGeometry args={[1.15, 0.05, 1.15]} />
      </mesh>
    </group>
  );
}

function CrateRail({ p }) {
  const [rx, rz] = right(p.h);
  return (
    <group>
      {[-0.42, 0.42].map((s) => (
        <Beam key={s} a={[p.ax + rx * s, p.y + 0.02, p.az + rz * s]} b={[p.bx + rx * s, p.y + 0.02, p.bz + rz * s]} w={0.1} h={0.05} mat={mats.metal("#5a544c")} />
      ))}
    </group>
  );
}

function CheckpointMarker({ p, game }) {
  const glow = useRef();
  const flag = useRef();
  const lit = useRef(false);
  useFrame(({ clock }) => {
    const on = game?.cpReached.has(p.id);
    lit.current = on;
    if (glow.current) {
      glow.current.material.emissiveIntensity = on ? 2.4 + Math.sin(clock.elapsedTime * 3) * 0.3 : 0.25;
    }
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.25 + (on ? 0 : 0.5);
  });
  const glowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ffb84a", emissiveIntensity: 0.25, roughness: 0.4 }), []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ map: flagTex("#e0752b"), side: THREE.DoubleSide }), []);
  useEffect(() => () => flagMat.dispose(), [flagMat]);
  const k = p.kind;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.h, 0]}>
      {k === "flag" && (
        <group>
          <Post x={0} y={0} z={0} h={2.4} r={0.05} mat={mats.metal("#cfcac0")} />
          <mesh ref={flag} position={[0, 2.05, 0]} material={flagMat}>
            <planeGeometry args={[0.9, 0.55]} />
          </mesh>
          <mesh ref={glow} position={[0, 2.45, 0]} material={glowMat}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
        </group>
      )}
      {k === "lantern" && (
        <group>
          <Post x={0} y={0} z={0} h={2.1} r={0.07} />
          <Beam a={[0, 2.0, 0]} b={[0, 2.0, -0.5]} w={0.06} h={0.06} />
          <mesh ref={glow} position={[0, 1.72, -0.48]} material={glowMat}>
            <cylinderGeometry args={[0.1, 0.12, 0.26, 8]} />
          </mesh>
          <mesh position={[0, 1.88, -0.48]} material={mats.metal("#3a3530")}>
            <coneGeometry args={[0.15, 0.12, 8]} />
          </mesh>
        </group>
      )}
      {k === "sign" && (
        <group>
          <Post x={0} y={0} z={0} h={2.0} r={0.07} />
          <Board x={0.3} y={1.65} z={0} h={0} w={0.8} hh={0.24} tex={signTex("Trail", "")} />
          <mesh ref={glow} position={[0, 2.05, 0]} material={glowMat}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
        </group>
      )}
      {k === "shelter" && (
        <group position={[0.6, 0, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.55, 0.9, 0]} rotation={[0, 0, s * -0.62]} material={mats.wood("#7a5634")} castShadow receiveShadow>
              <boxGeometry args={[0.08, 2.2, 1.8]} />
            </mesh>
          ))}
          <mesh position={[0, 0.6, -0.85]} material={mats.rock("#9a9284")} castShadow>
            <boxGeometry args={[1.5, 1.2, 0.2]} />
          </mesh>
          <mesh ref={glow} position={[0, 1.2, -0.65]} material={glowMat}>
            <cylinderGeometry args={[0.09, 0.1, 0.22, 8]} />
          </mesh>
        </group>
      )}
      {k === "cairn" && (
        <group>
          {[0.5, 0.4, 0.32, 0.24, 0.18].map((r, i) => (
            <Rock key={i} position={[0, 0.15 + i * 0.26, 0]} scale={[r, r * 0.75, r]} seed={i + 5} rot={i * 1.3} />
          ))}
          <Post x={0} y={1.3} z={0} h={0.9} r={0.025} mat={mats.metal("#cfcac0")} />
          <mesh ref={flag} position={[0.2, 2.0, 0]} material={flagMat}>
            <planeGeometry args={[0.4, 0.26]} />
          </mesh>
          <mesh ref={glow} position={[0, 2.25, 0]} material={glowMat}>
            <sphereGeometry args={[0.06, 10, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// --- cave dressing ------------------------------------------------------------------
function CaveDressing({ cave }) {
  const items = useMemo(() => {
    const out = [];
    const rand = mulberry32(Math.round(cave.entry.x * 17 + cave.entry.z * 3));
    cave.nodes.forEach((n, i) => {
      const nx = cave.nodes[Math.min(cave.nodes.length - 1, i + 1)];
      const h = Math.atan2(nx.x - n.x, nx.z - n.z) || cave.entry.h;
      const [rx, rz] = right(h);
      if (i % 2 === 0) {
        const s = i % 4 === 0 ? 1 : -1;
        out.push({ k: "crystal", x: n.x + rx * s * (n.w + 0.15), y: n.y + 0.2 + rand() * 1.2, z: n.z + rz * s * (n.w + 0.15), s: 0.5 + rand() * 0.6, tilt: s * (0.4 + rand() * 0.4), h });
      }
      if (i % 3 === 1) out.push({ k: "lantern", x: n.x + rx * (n.w - 0.2) * (i % 2 ? 1 : -1), y: n.y, z: n.z + rz * (n.w - 0.2) * (i % 2 ? 1 : -1) });
    });
    return out;
  }, [cave]);
  const crystal = mats.glow(cave.color, 1.6);
  return (
    <group>
      {items.map((it, i) =>
        it.k === "crystal" ? (
          <group key={i} position={[it.x, it.y, it.z]} rotation={[0, it.h, it.tilt]}>
            {[0, 1, 2].map((j) => (
              <mesh key={j} position={[(j - 1) * 0.12, 0, (j % 2) * 0.1]} rotation={[0, 0, (j - 1) * 0.35]} scale={[0.12 * it.s, 0.5 * it.s * (1 - j * 0.2), 0.12 * it.s]} material={crystal}>
                <octahedronGeometry args={[1, 0]} />
              </mesh>
            ))}
          </group>
        ) : (
          <group key={i} position={[it.x, it.y, it.z]}>
            <Post x={0} y={0} z={0} h={1.3} r={0.05} />
            <mesh position={[0, 1.38, 0]} material={mats.glow("#ffbf6a", 2)}>
              <cylinderGeometry args={[0.08, 0.09, 0.18, 8]} />
            </mesh>
          </group>
        ),
      )}
      {/* mouth rocks */}
      {[cave.entry, cave.exit].map((m, i) => {
        const [rx, rz] = right(m.h);
        return (
          <group key={`m${i}`}>
            {[-1, 1].map((s) => (
              <Rock key={s} position={[m.x + rx * s * 2.6, m.y + 1.2, m.z + rz * s * 2.6]} scale={[1.3, 2.0, 1.3]} seed={i * 3 + s + 2} />
            ))}
            <Rock position={[m.x, m.y + cave.roof + 0.9, m.z]} scale={[2.8, 1.1, 1.5]} seed={i + 6} rot={m.h} />
          </group>
        );
      })}
    </group>
  );
}

// --- dynamic: badges, platforms, crates, gates, bridges, levers, switches, keys ----
function Badge({ b, game }) {
  const g = useRef();
  const shaft = useRef();
  const before = game.foundBefore.has(b.idx);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: badgeTex(), metalness: 0.55, roughness: 0.32, emissive: "#6a4410", emissiveIntensity: before ? 0.05 : 0.35, transparent: before, opacity: before ? 0.45 : 1 }),
    [before],
  );
  const rim = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b07a2a", metalness: 0.8, roughness: 0.3, transparent: before, opacity: before ? 0.45 : 1 }), [before]);
  const shaftMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, map: softDot() }), []);
  useEffect(
    () => () => {
      mat.dispose();
      rim.dispose();
      shaftMat.dispose();
    },
    [mat, rim, shaftMat],
  );
  const st = useRef({ pop: 0 });
  useFrame(({ clock }, dt) => {
    if (!g.current) return;
    const got = game.collected.has(b.idx);
    const t = clock.elapsedTime;
    if (got) {
      st.current.pop = Math.min(1, st.current.pop + dt * 2.2);
      const k = st.current.pop;
      g.current.position.y = b.y + 0.15 + k * 1.4;
      g.current.rotation.y += dt * (6 + k * 18);
      g.current.scale.setScalar(Math.max(0.001, 1 - k));
      if (shaft.current) shaft.current.visible = false;
      return;
    }
    g.current.position.y = b.y + 0.15 + Math.sin(t * 2.2 + b.idx) * 0.12;
    g.current.rotation.y = t * 1.6 + b.idx;
  });
  return (
    <group>
      <group ref={g} position={[b.x, b.y, b.z]}>
        <mesh material={rim} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.07, 24]} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, s > 0 ? 0 : Math.PI]} material={mat}>
            <circleGeometry args={[0.33, 24]} />
          </mesh>
        ))}
      </group>
      {!before && (
        <mesh ref={shaft} position={[b.x, b.y + 1.2, b.z]} material={shaftMat}>
          <cylinderGeometry args={[0.22, 0.45, 3.2, 12, 1, true]} />
        </mesh>
      )}
    </group>
  );
}

function Platform({ pl }) {
  const g = useRef();
  useFrame(() => {
    if (g.current) g.current.position.set(pl.x, pl.y, pl.z);
  });
  const H = pl.h;
  const lift = pl.kind === "lift";
  return (
    <group ref={g} position={[pl.x, pl.y, pl.z]} rotation={[0, pl.rot, 0]}>
      {/* deck of logs / planks */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-pl.hw + (i + 0.5) * ((pl.hw * 2) / 6), H / 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.bark("#7a5a3a")} castShadow receiveShadow>
          <cylinderGeometry args={[(pl.hw * 2) / 12, (pl.hw * 2) / 12, pl.hd * 2, 8]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, H * 0.25, s * (pl.hd - 0.15)]} material={mats.wood("#5e4128")}>
          <boxGeometry args={[pl.hw * 2 + 0.1, 0.12, 0.16]} />
        </mesh>
      ))}
      {!lift &&
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([a, c], i) => <Rope key={i} points={[[a * (pl.hw - 0.1), H, c * (pl.hd - 0.1)], [a * 0.9 * 0.5, H + 2.85, c * 0.2]]} r={0.022} />)}
      {lift && <Rope points={[[0, H, 0], [0, H + 40, 0]]} r={0.03} />}
      {/* yellow edge marks: rideable */}
      {[-1, 1].map((s) => (
        <mesh key={`y${s}`} position={[s * (pl.hw - 0.05), H + 0.01, 0]} material={mats.glow("#f2c230", 0.3)}>
          <boxGeometry args={[0.08, 0.02, pl.hd * 2 - 0.2]} />
        </mesh>
      ))}
    </group>
  );
}

function Crate({ cr }) {
  const g = useRef();
  useFrame(() => {
    if (g.current) g.current.position.set(cr.x, cr.y + cr.size, cr.z);
  });
  const s = cr.size * 2;
  return (
    <group ref={g} position={[cr.x, cr.y + cr.size, cr.z]} rotation={[0, cr.h, 0]}>
      <mesh material={mats.wood("#9a6d3e")} castShadow receiveShadow>
        <boxGeometry args={[s, s, s]} />
      </mesh>
      {[-1, 1].map((a) =>
        [-1, 1].map((b) => (
          <mesh key={`${a}${b}`} position={[a * cr.size * 0.98, 0, b * cr.size * 0.98]} material={mats.wood("#6a4626")}>
            <boxGeometry args={[0.1, s + 0.02, 0.1]} />
          </mesh>
        )),
      )}
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, cr.size + 0.01]} material={mats.wood("#6a4626")}>
        <boxGeometry args={[0.1, s * 1.3, 0.04]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, -cr.size - 0.01]} material={mats.wood("#6a4626")}>
        <boxGeometry args={[0.1, s * 1.3, 0.04]} />
      </mesh>
    </group>
  );
}

function Gate({ g: gate, game }) {
  const L = useRef();
  const R = useRef();
  const door = useRef();
  const [rx, rz] = right(gate.h);
  const W = gate.w + 0.1;
  useFrame(() => {
    const o = gate.open;
    if (gate.kind === "gate") {
      if (L.current) L.current.rotation.y = o * 1.7;
      if (R.current) R.current.rotation.y = -o * 1.7;
    } else if (door.current) {
      door.current.position.y = gate.kind === "rockDoor" ? -o * 3.3 : o * 3.2;
    }
  });
  const hint = useRef();
  const hintMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9a640", emissive: "#d9a640", emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3 }), []);
  useEffect(() => () => hintMat.dispose(), [hintMat]);
  useFrame(({ clock }) => {
    if (!hint.current) return;
    const ready = gate.needs.key ? game.keys.has(gate.needs.key) : false;
    hint.current.visible = gate.open < 0.05;
    hint.current.material.emissiveIntensity = ready ? 1.5 + Math.sin(clock.elapsedTime * 4) * 0.5 : 0.3;
  });
  const pillars = (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[rx * s * (W + 0.35), 1.6, rz * s * (W + 0.35)]} material={mats.rock("#9a9284")} castShadow receiveShadow>
          <boxGeometry args={[0.7, 3.4, 0.7]} />
        </mesh>
      ))}
    </>
  );
  if (gate.kind === "gate") {
    return (
      <group position={[gate.x, gate.y, gate.z]}>
        {pillars}
        <group rotation={[0, gate.h, 0]}>
          {[
            [L, -1],
            [R, 1],
          ].map(([ref, s]) => (
            <group key={s} ref={ref} position={[-s * W, 0, 0]}>
              <group position={[s * (W / 2), 1.2, 0]}>
                {Array.from({ length: 4 }, (_, i) => (
                  <mesh key={i} position={[(-1.5 + i) * (W / 4), 0, 0]} material={mats.wood("#7a5634")} castShadow>
                    <boxGeometry args={[W / 4 - 0.04, 2.3, 0.1]} />
                  </mesh>
                ))}
                {[-0.7, 0.7].map((y) => (
                  <mesh key={y} position={[0, y, 0.07]} material={mats.wood("#5e4128")}>
                    <boxGeometry args={[W, 0.16, 0.06]} />
                  </mesh>
                ))}
              </group>
            </group>
          ))}
          {gate.needs.key && (
            <mesh ref={hint} position={[0, 1.25, 0.12]} material={hintMat}>
              <boxGeometry args={[0.22, 0.28, 0.08]} />
            </mesh>
          )}
        </group>
      </group>
    );
  }
  const rockDoor = gate.kind === "rockDoor";
  return (
    <group position={[gate.x, gate.y, gate.z]}>
      {!rockDoor && pillars}
      {!rockDoor && (
        <mesh position={[0, 3.45, 0]} rotation={[0, gate.h, 0]} material={mats.rock("#8f8778")} castShadow>
          <boxGeometry args={[W * 2 + 1.6, 0.5, 0.8]} />
        </mesh>
      )}
      <group ref={door}>
        <mesh position={[0, 1.5, 0]} rotation={[0, gate.h, 0]} material={rockDoor ? mats.rock("#6e6862") : mats.metal("#4f4a44")} castShadow receiveShadow>
          <boxGeometry args={[W * 2 + (rockDoor ? 0.8 : 0.1), 3.0, rockDoor ? 0.6 : 0.12]} />
        </mesh>
        {!rockDoor &&
          Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[rx * (-W + (i + 0.5) * ((2 * W) / 6)), 1.5, rz * (-W + (i + 0.5) * ((2 * W) / 6))]} material={mats.metal("#3a3632")}>
              <boxGeometry args={[0.08, 3.0, 0.08]} />
            </mesh>
          ))}
        {rockDoor && (
          <mesh position={[0, 1.6, 0]} rotation={[0, gate.h, 0]} material={mats.glow("#9fd8ff", 0.6)}>
            <torusGeometry args={[0.45, 0.05, 6, 20]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function ExtBridge({ b }) {
  const g = useRef();
  const [fx, fz] = fwd(b.h);
  const span = b.len + 1.4;
  useFrame(() => {
    // telescopes out from the near bank
    if (g.current) g.current.scale.z = Math.max(0.02, b.ext);
  });
  return (
    <group ref={g} position={[b.ax - fx * 0.7, 0, b.az - fz * 0.7]} rotation={[0, b.h, 0]}>
      <group position={[0, 0, span / 2]}>
        {Array.from({ length: Math.round(span / 0.3) }, (_, i) => (
          <mesh key={i} position={[0, b.y - 0.07, -span / 2 + (i + 0.5) * 0.3]} material={mats.wood("#8a6440")} castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.08, 0.27]} />
          </mesh>
        ))}
        {[-1.12, 1.12].map((s) => (
          <mesh key={s} position={[s, b.y + 0.95, 0]} material={mats.wood("#6f4f30")} castShadow>
            <boxGeometry args={[0.08, 0.1, span]} />
          </mesh>
        ))}
        {[-0.85, 0.85].map((s) => (
          <mesh key={`s${s}`} position={[s, b.y - 0.24, 0]} material={mats.metal("#5c5650")}>
            <boxGeometry args={[0.14, 0.24, span]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Lever({ lv, game }) {
  const arm = useRef();
  const ring = useRef();
  useFrame(({ clock }, dt) => {
    const on = !!game.flags[`lever:${lv.id}`];
    if (arm.current) {
      const want = on ? -0.9 : 0.9;
      arm.current.rotation.x += (want - arm.current.rotation.x) * Math.min(1, dt * 8);
    }
    if (ring.current) {
      ring.current.visible = !on;
      ring.current.material.opacity = 0.35 + Math.sin(clock.elapsedTime * 3) * 0.15;
    }
  });
  return (
    <group position={[lv.x, lv.y, lv.z]} rotation={[0, lv.h, 0]}>
      <mesh position={[0, 0.35, 0]} material={mats.rock("#8f8778")} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.45]} />
      </mesh>
      <group ref={arm} position={[0, 0.72, 0]}>
        <mesh position={[0, 0.4, 0]} material={mats.metal("#c9a24a")} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.8, 8]} />
        </mesh>
        <mesh position={[0, 0.82, 0]} material={mats.plain("#b0302a")}>
          <sphereGeometry args={[0.08, 10, 8]} />
        </mesh>
      </group>
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.8, 32]} />
        <meshBasicMaterial color="#ffe08a" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Switch({ sw, game }) {
  const top = useRef();
  const ring = useRef();
  const crystalMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7fdcff", emissive: "#5fc8ff", emissiveIntensity: 0.4, roughness: 0.2 }), []);
  useEffect(() => () => crystalMat.dispose(), [crystalMat]);
  useFrame(({ clock }) => {
    const on = !!game.flags[`sw:${sw.id}`];
    if (sw.crystal) crystalMat.emissiveIntensity = on ? 3 + Math.sin(clock.elapsedTime * 3) * 0.6 : 0.4 + Math.sin(clock.elapsedTime * 2) * 0.15;
    if (top.current && !sw.crystal) top.current.rotation.z = on ? -0.8 : 0.8;
    if (ring.current) {
      ring.current.visible = !on;
      ring.current.material.opacity = 0.35 + Math.sin(clock.elapsedTime * 3) * 0.15;
    }
  });
  return (
    <group position={[sw.x, sw.y, sw.z]} rotation={[0, sw.h, 0]}>
      {sw.crystal ? (
        <group position={[0, 0.2, 0]}>
          <mesh position={[0, 0.5, 0]} scale={[0.28, 0.75, 0.28]} material={crystalMat}>
            <octahedronGeometry args={[1, 0]} />
          </mesh>
          <Rock position={[0, 0, 0]} scale={[0.6, 0.35, 0.6]} seed={2} />
        </group>
      ) : (
        <group>
          <mesh position={[0, 0.5, 0]} material={mats.rock("#948c7e")} castShadow>
            <boxGeometry args={[0.5, 1.0, 0.3]} />
          </mesh>
          <group ref={top} position={[0, 1.0, 0.1]}>
            <mesh position={[0, 0.25, 0]} material={mats.metal("#c9a24a")}>
              <boxGeometry args={[0.08, 0.5, 0.08]} />
            </mesh>
          </group>
        </group>
      )}
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.8, 32]} />
        <meshBasicMaterial color="#ffe08a" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

function KeyItem({ k, game }) {
  const g = useRef();
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.visible = !game.keys.has(k.id);
    g.current.rotation.y = clock.elapsedTime * 1.5;
    g.current.position.y = k.y + 1.25 + Math.sin(clock.elapsedTime * 2) * 0.08;
  });
  const m = mats.glow("#e6b04a", 0.8);
  return (
    <group ref={g} position={[k.x, k.y + 1.25, k.z]}>
      <mesh material={m}>
        <torusGeometry args={[0.12, 0.035, 8, 16]} />
      </mesh>
      <mesh position={[0, -0.25, 0]} material={m}>
        <boxGeometry args={[0.05, 0.36, 0.05]} />
      </mesh>
      <mesh position={[0.06, -0.38, 0]} material={m}>
        <boxGeometry args={[0.1, 0.05, 0.05]} />
      </mesh>
    </group>
  );
}

// --- the whole set --------------------------------------------------------------------
const STATIC = {
  camp: Camp,
  trailSign: TrailSign,
  log: Log,
  streamRocks: StreamRocks,
  dam: Dam,
  gapEdges: GapEdges,
  bridge: Bridge,
  stone: SteppingStone,
  cableway: Cableway,
  liftFrame: LiftFrame,
  rail: RailSeg,
  windFlags: WindFlags,
  overlook: Overlook,
  boulder: Boulder,
  wetRocks: WetRocks,
  arch: Arch,
  pillar: Pillar,
  finish: Finish,
  pedestal: Pedestal,
  plate: Plate,
  crateRail: CrateRail,
};

export default function Props({ L, game }) {
  return (
    <group>
      {L.props.map((p, i) => {
        if (p.k === "cliffFace") return <CliffFace key={i} p={p} />;
        if (p.k === "ledgeFace") return <CliffFace key={i} p={p} ledge />;
        if (p.k === "ladder") return <Ladder key={i} p={p} />;
        if (p.k === "checkpoint") return <CheckpointMarker key={i} p={p} game={game} />;
        if (p.k === "gate") return null; // drawn live below
        const C = STATIC[p.k];
        return C ? <C key={i} p={p} /> : null;
      })}
      {L.caves.map((c) => (
        <CaveDressing key={c.id} cave={c} />
      ))}
      {game && (
        <>
          {L.badges.map((b) => (
            <Badge key={b.id} b={b} game={game} />
          ))}
          {game.platforms.map((pl) => (
            <Platform key={pl.id} pl={pl} />
          ))}
          {game.crates.map((cr) => (
            <Crate key={cr.id} cr={cr} />
          ))}
          {L.gates.map((g) => (
            <Gate key={g.id} g={g} game={game} />
          ))}
          {L.bridges.map((b) => (
            <ExtBridge key={b.id} b={b} />
          ))}
          {L.levers.map((lv) => (
            <Lever key={lv.id} lv={lv} game={game} />
          ))}
          {L.switches.map((sw) => (
            <Switch key={sw.id} sw={sw} game={game} />
          ))}
          {L.keys.map((k) => (
            <KeyItem key={k.id} k={k} game={game} />
          ))}
        </>
      )}
    </group>
  );
}
