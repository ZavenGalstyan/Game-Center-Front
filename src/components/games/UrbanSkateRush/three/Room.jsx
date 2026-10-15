/**
 * Urban Skate Rush — indoor skate room renderer.
 *
 * Draws a level built by data/rooms.js: themed floor / walls / ceiling with
 * procedural canvas textures (no image files), graffiti, light fixtures,
 * kickers, funboxes, ledges, rails and wall-side props. Purely visual — the
 * physics reads the same level data.
 */
import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ textures */
function makeTex(w, h, draw, repeat = [1, 1], color = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(g, w, h, R, n, colors, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(R() * colors.length)];
    const s = size[0] + R() * (size[1] - size[0]);
    g.fillRect(R() * w, R() * h, s, s);
  }
}

const FLOORS = {
  concrete: (g, w, h, R) => {
    g.fillStyle = "#8f8b84";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 9000, ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.06)", "rgba(120,110,100,0.08)"]);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(60,55,50,${0.05 + R() * 0.06})`;
      g.beginPath();
      g.ellipse(R() * w, R() * h, 20 + R() * 70, 12 + R() * 40, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(40,38,35,0.55)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = "rgba(40,38,35,0.35)";
    g.lineWidth = 1;
    g.beginPath();
    let x = R() * w;
    let y = 0;
    g.moveTo(x, y);
    while (y < h) {
      x += (R() - 0.5) * 30;
      y += 10 + R() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  },
  asphalt: (g, w, h, R) => {
    g.fillStyle = "#3f4145";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 14000, ["rgba(255,255,255,0.07)", "rgba(0,0,0,0.12)", "rgba(120,120,120,0.1)"], [1, 2]);
    g.fillStyle = "#e9e4d4";
    g.fillRect(0, 0, 6, h * 0.55);
    g.fillStyle = "#f2c230";
    g.fillRect(w - 10, 0, 10, h);
  },
  wood: (g, w, h, R) => {
    const planks = 8;
    const pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const tone = 170 + Math.floor(R() * 40);
      g.fillStyle = `rgb(${tone + 40},${tone + 5},${tone - 45})`;
      g.fillRect(i * pw, 0, pw, h);
      g.strokeStyle = "rgba(90,55,25,0.25)";
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        const x0 = i * pw + R() * pw;
        g.moveTo(x0, 0);
        g.bezierCurveTo(x0 + (R() - 0.5) * 8, h * 0.3, x0 + (R() - 0.5) * 8, h * 0.6, x0 + (R() - 0.5) * 6, h);
        g.stroke();
      }
      g.fillStyle = "rgba(60,35,15,0.6)";
      g.fillRect(i * pw, 0, 2, h);
      g.fillRect(i * pw, R() * h, pw, 2);
    }
  },
  grid: (g, w, h) => {
    g.fillStyle = "#14111d";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#20f0ff";
    g.lineWidth = 3;
    g.shadowColor = "#20f0ff";
    g.shadowBlur = 8;
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.strokeStyle = "rgba(255,47,208,0.6)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
  },
  court: (g, w, h, R) => {
    g.fillStyle = "#2f62ad";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 6000, ["rgba(255,255,255,0.05)", "rgba(0,0,40,0.08)"]);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, 0, w / 2, h);
  },
};

const WALLS = {
  brick: (g, w, h, R) => {
    g.fillStyle = "#5b3a2e";
    g.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 26;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const t = 120 + Math.floor(R() * 50);
        g.fillStyle = `rgb(${t + 40},${Math.floor(t * 0.45)},${Math.floor(t * 0.32)})`;
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + off + 2, y + 2, bw - 4, 3);
      }
    }
  },
  concrete: (g, w, h, R) => {
    g.fillStyle = "#8a8e94";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 7000, ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.07)"]);
    g.strokeStyle = "rgba(40,44,50,0.5)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    for (const [x, y] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) {
      g.fillStyle = "rgba(40,40,40,0.5)";
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  },
  stucco: (g, w, h, R) => {
    g.fillStyle = "#f1dfc2";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 8000, ["rgba(255,255,255,0.12)", "rgba(160,120,80,0.06)"], [1, 4]);
  },
  dark: (g, w, h, R) => {
    g.fillStyle = "#1a1624";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, R, 3000, ["rgba(255,255,255,0.03)", "rgba(0,0,0,0.2)"]);
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.strokeRect(0, 0, w, h);
  },
  stands: (g, w, h) => {
    g.fillStyle = "#20262f";
    g.fillRect(0, 0, w, h);
  },
};

const TAGS = ["SKATE", "RUSH", "OLLIE!", "GRIND", "FLIP", "LVL UP", "SK8", "KICK", "SEND IT", "RAD"];
function graffitiTex(seed, neon) {
  const R = rng(seed);
  const word = TAGS[Math.floor(R() * TAGS.length)];
  const hue = Math.floor(R() * 360);
  return makeTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate((R() - 0.5) * 0.25);
    g.font = `900 ${110 - word.length * 6}px "Arial Black", Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    if (neon) {
      g.shadowColor = `hsl(${hue},100%,60%)`;
      g.shadowBlur = 24;
      g.strokeStyle = `hsl(${hue},100%,65%)`;
      g.lineWidth = 10;
      g.strokeText(word, 0, 0);
      g.fillStyle = "#ffffff";
      g.fillText(word, 0, 0);
    } else {
      g.strokeStyle = "#111";
      g.lineWidth = 22;
      g.strokeText(word, 0, 0);
      const gr = g.createLinearGradient(0, -50, 0, 50);
      gr.addColorStop(0, `hsl(${hue},90%,62%)`);
      gr.addColorStop(1, `hsl(${(hue + 50) % 360},90%,50%)`);
      g.fillStyle = gr;
      g.fillText(word, 0, 0);
      g.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 6; i++) g.fillRect(-180 + R() * 360, -40 + R() * 20, 6, 3);
      // drips
      g.fillStyle = `hsl(${hue},90%,55%)`;
      for (let i = 0; i < 5; i++) g.fillRect(-150 + R() * 300, 30, 4, 20 + R() * 40);
    }
    g.restore();
  });
}

function crowdTex(seed) {
  const R = rng(seed);
  return makeTex(512, 128, (g, w, h) => {
    g.fillStyle = "#1b2028";
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let x = 4; x < w; x += 9 + R() * 3) {
        const y = 18 + row * 30 + R() * 4;
        g.fillStyle = `hsl(${Math.floor(R() * 360)},${50 + R() * 40}%,${40 + R() * 25}%)`;
        g.fillRect(x, y, 7, 12);
        g.fillStyle = ["#f1c9a5", "#c68c5e", "#8d5a3b", "#e0ac84"][Math.floor(R() * 4)];
        g.beginPath();
        g.arc(x + 3.5, y - 3, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, [6, 1]);
}

function skyWindowTex() {
  return makeTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#5fb6ff");
    gr.addColorStop(0.55, "#c9ecff");
    gr.addColorStop(0.62, "#2aa8d8");
    gr.addColorStop(1, "#1a7fb0");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(30 + i * 60, 40 + (i % 2) * 20, 28, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "#f5f0e6";
    g.lineWidth = 10;
    g.strokeRect(0, 0, w, h);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  });
}

/* ------------------------------------------------------------------ geometry helpers */
/** Triangular wedge: base on y=0 over w×len, rising to `top` along +z. */
function wedgeGeo(w, len, top) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(len, 0);
  s.lineTo(len, top);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  // shape is in XY (x = along, y = up), extruded along Z (width) → rotate so "along" is +Z
  g.translate(-len / 2, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

const Wedge = ({ w, len, top, color, edge, position, rotation }) => {
  const geo = useMemo(() => wedgeGeo(w, len, top), [w, len, top]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      {/* metal lip at the top edge */}
      <mesh position={[0, top - 0.02, len / 2 - 0.03]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, w, 10]} />
        <meshStandardMaterial color={edge} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* side stripes */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 + 0.005), top * 0.33, len * 0.17]} rotation={[-Math.atan2(top, len), s * Math.PI / 2, 0]}>
          <planeGeometry args={[len * 0.66, 0.06]} />
          <meshBasicMaterial color={edge} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ pieces */
function Kicker({ f, colors }) {
  const len = f.axis === "z" ? f.maxZ - f.minZ : f.maxX - f.minX;
  const w = f.axis === "z" ? f.maxX - f.minX : f.maxZ - f.minZ;
  const rising = f.y1 > f.y0 ? 1 : -1;
  const ry = f.axis === "z" ? (rising > 0 ? 0 : Math.PI) : rising > 0 ? Math.PI / 2 : -Math.PI / 2;
  return <Wedge w={w} len={len} top={f.top} color={colors.ramp} edge={colors.rampEdge} position={[(f.minX + f.maxX) / 2, 0, (f.minZ + f.maxZ) / 2]} rotation={[0, ry, 0]} />;
}

function Funbox({ f, colors }) {
  const w = f.maxX - f.minX;
  const d = f.maxZ - f.minZ;
  const cx = (f.minX + f.maxX) / 2;
  const cz = (f.minZ + f.maxZ) / 2;
  return (
    <group>
      <mesh position={[cx, f.top / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[w, f.top, d]} />
        <meshStandardMaterial color={colors.ramp} roughness={0.7} />
      </mesh>
      <mesh position={[cx, f.top + 0.005, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.2, d - 0.2]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} />
      </mesh>
      <Wedge w={w} len={f.rampLen} top={f.top} color={colors.ramp} edge={colors.rampEdge} position={[cx, 0, f.minZ - f.rampLen / 2]} rotation={[0, 0, 0]} />
      <Wedge w={w} len={f.rampLen} top={f.top} color={colors.ramp} edge={colors.rampEdge} position={[cx, 0, f.maxZ + f.rampLen / 2]} rotation={[0, Math.PI, 0]} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[cx + (s * w) / 2, f.top, cz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, d, 8]} />
          <meshStandardMaterial color={colors.rampEdge} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Ledge({ f, colors }) {
  const w = f.maxX - f.minX;
  const d = f.maxZ - f.minZ;
  return (
    <group position={[(f.minX + f.maxX) / 2, 0, (f.minZ + f.maxZ) / 2]}>
      <mesh position={[0, f.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, f.h, d]} />
        <meshStandardMaterial color={colors.wall} roughness={0.85} />
      </mesh>
      <mesh position={[0, f.h + 0.01, 0]}>
        <boxGeometry args={[w + 0.04, 0.03, d]} />
        <meshStandardMaterial color={colors.rampEdge} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[w / 2 + 0.003, f.h * 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d * 0.9, 0.08]} />
        <meshBasicMaterial color={colors.accent} />
      </mesh>
    </group>
  );
}

function Rail({ r, colors, floorY }) {
  const dx = r.endX - r.startX;
  const dy = r.endY - r.startY;
  const dz = r.endZ - r.startZ;
  const len = Math.hypot(dx, dy, dz);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()), [dx, dy, dz]);
  const posts = r.ledge ? [] : [0.06, 0.5, 0.94];
  const base = r.onBox ? r.startY - 0.42 : floorY;
  return (
    <group>
      <mesh position={[(r.startX + r.endX) / 2, (r.startY + r.endY) / 2, (r.startZ + r.endZ) / 2]} quaternion={q} castShadow>
        <cylinderGeometry args={[0.05, 0.05, len, 12]} />
        <meshStandardMaterial color={r.ledge ? colors.rampEdge : colors.accent} metalness={0.75} roughness={0.25} />
      </mesh>
      {posts.map((t) => {
        const y = r.startY + dy * t;
        const h = y - base;
        return (
          <group key={t} position={[r.startX + dx * t, base, r.startZ + dz * t]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, h, 8]} />
              <meshStandardMaterial color="#555b63" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.3, 0.04, 0.3]} />
              <meshStandardMaterial color="#3a3f45" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Decor({ d, room }) {
  const c = room.colors;
  switch (d.type) {
    case "crates":
      return (
        <group position={[d.x, 0, d.z]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.2, 1.1, 1.2]} />
            <meshStandardMaterial color="#a87a46" roughness={0.9} />
          </mesh>
          <mesh position={[0.1, 1.45, -0.05]} rotation={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.8, 0.7, 0.8]} />
            <meshStandardMaterial color="#b98a52" roughness={0.9} />
          </mesh>
          {[0.2, 0.9].map((y) => (
            <mesh key={y} position={[0, y, 0.605]}>
              <planeGeometry args={[1.2, 0.08]} />
              <meshBasicMaterial color="#6b4a2a" />
            </mesh>
          ))}
        </group>
      );
    case "barrels":
      return (
        <group position={[d.x, 0, d.z]}>
          {[[-0.3, -0.3, "#2f6fb8"], [0.35, 0.1, "#d9302a"], [-0.15, 0.45, "#2f6fb8"]].map(([x, z, col], i) => (
            <mesh key={i} position={[x, 0.45, z]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.9, 16]} />
              <meshStandardMaterial color={col} metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      );
    case "planter":
      return (
        <group position={[d.x, 0, d.z]}>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.2, 0.7, 1.2]} />
            <meshStandardMaterial color="#2aa8b8" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.07, 0.1, 1.6, 8]} />
            <meshStandardMaterial color="#8a6a42" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos(i * 1.26) * 0.45, 2.15, Math.sin(i * 1.26) * 0.45]} rotation={[Math.sin(i * 1.26) * 0.6, 0, -Math.cos(i * 1.26) * 0.6]}>
              <boxGeometry args={[0.9, 0.03, 0.25]} />
              <meshStandardMaterial color="#3fa34d" />
            </mesh>
          ))}
        </group>
      );
    case "speaker":
      return (
        <group position={[d.x, 0, d.z]} rotation={[0, d.x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[1.2, 1.8, 1.0]} />
            <meshStandardMaterial color="#0d0d12" roughness={0.6} />
          </mesh>
          {[0.5, 1.25].map((y, i) => (
            <mesh key={y} position={[0, y, 0.51]}>
              <circleGeometry args={[i ? 0.22 : 0.38, 24]} />
              <meshStandardMaterial color="#222" emissive={c.accent} emissiveIntensity={0.25} />
            </mesh>
          ))}
        </group>
      );
    case "barrier":
      return (
        <group position={[d.x, 0, d.z]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.6, 1.0, 3]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          <mesh position={[d.x > 0 ? -0.305 : 0.305, 0.5, 0]} rotation={[0, d.x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
            <planeGeometry args={[3, 0.3]} />
            <meshBasicMaterial color={c.accent} />
          </mesh>
        </group>
      );
    case "bench":
      return (
        <group position={[d.x, 0, d.z]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[2.2, 0.08, 0.6]} />
            <meshStandardMaterial color="#9b6a3c" />
          </mesh>
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, 0.22, 0]}>
              <boxGeometry args={[0.08, 0.44, 0.5]} />
              <meshStandardMaterial color="#333" />
            </mesh>
          ))}
        </group>
      );
    case "pillar":
      return (
        <group position={[d.x, 0, d.z]}>
          <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[d.w, d.h, d.d]} />
            <meshStandardMaterial color={room.id === "neon" ? "#1b1726" : "#b9b5ad"} roughness={0.8} />
          </mesh>
          {[0.3, 0.6].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[d.w + 0.02, 0.18, d.d + 0.02]} />
              <meshStandardMaterial color={room.id === "neon" ? c.accent : y < 0.5 ? "#f2c230" : "#1c1c1c"} emissive={room.id === "neon" ? c.accent : "#000"} emissiveIntensity={room.id === "neon" ? 1.2 : 0} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ shell (floor, walls, ceiling, lights) */
function Shell({ room }) {
  const { w, d, h, colors } = room;
  const hw = w / 2;
  const hd = d / 2;
  const tex = useMemo(() => {
    const R = rng(room.seed);
    const floor = makeTex(512, 512, (g, W, H) => FLOORS[room.floor](g, W, H, R), [w / 4, d / 4]);
    const wallRep = room.wall === "brick" ? [w / 3, h / 2.2] : [w / 4, h / 4];
    const wallsX = makeTex(512, 512, (g, W, H) => WALLS[room.wall](g, W, H, R), wallRep);
    const wallsZ = wallsX.clone();
    wallsZ.repeat.set(d / (room.wall === "brick" ? 3 : 4), wallRep[1]);
    wallsZ.needsUpdate = true;
    const graffiti = [0, 1, 2, 3].map((i) => graffitiTex(room.seed * 13 + i * 7, room.id === "neon"));
    const crowd = room.wall === "stands" ? crowdTex(room.seed) : null;
    const sky = room.id === "beach" ? skyWindowTex() : null;
    return { floor, wallsX, wallsZ, graffiti, crowd, sky };
  }, [room]);
  useEffect(() => () => Object.values(tex).flat().forEach((t) => t && t.dispose && t.dispose()), [tex]);

  const neon = room.id === "neon";
  const walls = [
    { pos: [0, h / 2, hd], rot: [0, Math.PI, 0], len: w, t: tex.wallsX },
    { pos: [0, h / 2, -hd], rot: [0, 0, 0], len: w, t: tex.wallsX },
    { pos: [hw, h / 2, 0], rot: [0, -Math.PI / 2, 0], len: d, t: tex.wallsZ },
    { pos: [-hw, h / 2, 0], rot: [0, Math.PI / 2, 0], len: d, t: tex.wallsZ },
  ];
  // graffiti spots (not on the beach hall)
  const tags = room.id === "beach" || room.id === "arena" ? [] : [
    { pos: [-hw * 0.4, 2.6, hd - 0.03], rot: [0, Math.PI, 0], s: 4.5 },
    { pos: [hw * 0.45, 2.3, hd - 0.03], rot: [0, Math.PI, 0], s: 3.6 },
    { pos: [hw - 0.03, 2.4, hd * 0.1], rot: [0, -Math.PI / 2, 0], s: 4.2 },
    { pos: [-hw + 0.03, 2.5, -hd * 0.3], rot: [0, Math.PI / 2, 0], s: 4 },
  ];

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex.floor} roughness={room.floor === "wood" ? 0.55 : room.floor === "grid" ? 0.3 : 0.85} metalness={room.floor === "grid" ? 0.3 : 0} emissiveMap={neon ? tex.floor : null} emissive={neon ? "#ffffff" : "#000000"} emissiveIntensity={neon ? 0.55 : 0} />
      </mesh>
      {room.floor === "court" && <CourtLines w={w} d={d} />}
      {/* walls */}
      {walls.map((wl, i) => (
        <group key={i} position={wl.pos} rotation={wl.rot}>
          <mesh receiveShadow>
            <planeGeometry args={[wl.len, h]} />
            <meshStandardMaterial map={tex.wallsX && wl.t} color={room.wall === "stands" ? "#2a313c" : "#ffffff"} roughness={0.9} />
          </mesh>
          {/* baseboard / hazard band */}
          <mesh position={[0, -h / 2 + 0.25, 0.02]}>
            <planeGeometry args={[wl.len, 0.5]} />
            <meshStandardMaterial color={colors.trim} emissive={neon ? colors.trim : "#000"} emissiveIntensity={neon ? 0.8 : 0} roughness={0.6} />
          </mesh>
          {neon && (
            <>
              <mesh position={[0, 0.3, 0.03]}>
                <planeGeometry args={[wl.len, 0.08]} />
                <meshBasicMaterial color="#20f0ff" toneMapped={false} />
              </mesh>
              <mesh position={[0, h / 2 - 0.4, 0.03]}>
                <planeGeometry args={[wl.len, 0.1]} />
                <meshBasicMaterial color="#ff2fd0" toneMapped={false} />
              </mesh>
            </>
          )}
          {room.wall === "stands" && <Stands len={wl.len} h={h} crowd={tex.crowd} accent={colors.accent} />}
          {room.id === "beach" && i < 2 && [-0.3, 0, 0.3].map((f) => (
            <mesh key={f} position={[f * wl.len, 0.6, 0.03]}>
              <planeGeometry args={[wl.len * 0.22, h * 0.45]} />
              <meshBasicMaterial map={tex.sky} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      {tags.map((g, i) => (
        <mesh key={i} position={g.pos} rotation={g.rot}>
          <planeGeometry args={[g.s, g.s / 2]} />
          <meshStandardMaterial map={tex.graffiti[i]} transparent alphaTest={0.05} roughness={0.8} emissiveMap={neon ? tex.graffiti[i] : null} emissive={neon ? "#ffffff" : "#000"} emissiveIntensity={neon ? 1 : 0} toneMapped={!neon} />
        </mesh>
      ))}
      {/* ceiling */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={neon ? "#0b0911" : room.id === "beach" ? "#e9dcc4" : "#2a2b30"} roughness={1} />
      </mesh>
      <Ceiling room={room} />
    </group>
  );
}

function CourtLines({ w, d }) {
  const white = <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />;
  return (
    <group position={[0, 0.006, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.6, 3.8, 64]} />
        {white}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, d - 2]} />
        {white}
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[s * (w / 2 - 1), 0, 0]}>
            <planeGeometry args={[0.18, d - 2]} />
            {white}
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, s * (d / 2 - 1)]}>
            <planeGeometry args={[w - 2, 0.18]} />
            {white}
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[3.6, 64]} />
        <meshBasicMaterial color="#ff3b3b" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Stands({ len, h, crowd, accent }) {
  // padded barrier + three tiers of seated crowd leaning back from the wall
  return (
    <group position={[0, -h / 2, 0.05]}>
      <mesh position={[0, 0.6, 0.02]}>
        <planeGeometry args={[len, 1.2]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.15, 0.03]}>
        <planeGeometry args={[len, 0.12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 3.2, 0.04]}>
        <planeGeometry args={[len, 3.4]} />
        <meshStandardMaterial map={crowd} roughness={1} />
      </mesh>
      <mesh position={[0, h - 1.6, 0.04]}>
        <planeGeometry args={[len * 0.5, 1.2]} />
        <meshBasicMaterial color="#0e1218" />
      </mesh>
    </group>
  );
}

function Ceiling({ room }) {
  const { w, d, h, colors } = room;
  const hw = w / 2;
  const items = [];
  if (room.ceiling === "skylight") {
    for (let i = -1; i <= 1; i++) items.push(<mesh key={`s${i}`} position={[i * w * 0.3, h - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[2.4, d * 0.8]} /><meshBasicMaterial color="#e8f4ff" toneMapped={false} /></mesh>);
    for (let z = -d / 2 + 3; z < d / 2; z += 4) items.push(<mesh key={`t${z}`} position={[0, h - 0.5, z]}><boxGeometry args={[w, 0.25, 0.25]} /><meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.5} /></mesh>);
  } else if (room.ceiling === "pipes") {
    for (let i = 0; i < 4; i++) items.push(<mesh key={`p${i}`} position={[-hw + 4 + i * 1.1, h - 0.4 - (i % 2) * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, d, 12]} /><meshStandardMaterial color={["#c0392b", "#7f8c8d", "#2980b9", "#7f8c8d"][i]} metalness={0.5} roughness={0.4} /></mesh>);
    for (let x = -w * 0.3; x <= w * 0.31; x += w * 0.3) for (let z = -d * 0.3; z <= d * 0.31; z += d * 0.3) items.push(<mesh key={`f${x}${z}`} position={[x, h - 0.15, z]}><boxGeometry args={[0.25, 0.08, 3]} /><meshBasicMaterial color={colors.light} toneMapped={false} /></mesh>);
  } else if (room.ceiling === "beams") {
    for (let x = -hw + 3; x < hw; x += 4) items.push(<mesh key={`b${x}`} position={[x, h - 0.4, 0]}><boxGeometry args={[0.35, 0.6, d]} /><meshStandardMaterial color="#9b7346" roughness={0.8} /></mesh>);
    for (let x = -w * 0.25; x <= w * 0.26; x += w * 0.25) items.push(<group key={`l${x}`} position={[x, h - 1.4, 0]}><mesh><sphereGeometry args={[0.35, 16, 10]} /><meshBasicMaterial color="#fff6e0" toneMapped={false} /></mesh><mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.02, 0.02, 1.4, 6]} /><meshStandardMaterial color="#333" /></mesh></group>);
  } else if (room.ceiling === "neon") {
    items.push(<mesh key="ring" position={[0, h - 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[Math.min(w, d) * 0.3, 0.08, 8, 64]} /><meshBasicMaterial color="#ff2fd0" toneMapped={false} /></mesh>);
    items.push(<mesh key="ring2" position={[0, h - 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[Math.min(w, d) * 0.2, 0.06, 8, 64]} /><meshBasicMaterial color="#20f0ff" toneMapped={false} /></mesh>);
  } else if (room.ceiling === "rig") {
    for (const z of [-d * 0.3, d * 0.3]) {
      items.push(<mesh key={`r${z}`} position={[0, h - 1, z]}><boxGeometry args={[w * 0.8, 0.4, 0.4]} /><meshStandardMaterial color="#2a2f36" metalness={0.7} roughness={0.4} /></mesh>);
      for (let x = -w * 0.35; x <= w * 0.36; x += w * 0.175) items.push(<mesh key={`k${z}${x}`} position={[x, h - 1.35, z]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.35, 0.5, 16]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>);
    }
    items.push(<mesh key="jumbo" position={[0, h - 3, 0]}><boxGeometry args={[4, 2.2, 4]} /><meshStandardMaterial color="#111" emissive="#ff3b3b" emissiveIntensity={0.25} /></mesh>);
  }
  return <group>{items}</group>;
}

/* ------------------------------------------------------------------ lights */
function RoomLights({ room, shadows }) {
  const { w, d, h, light, colors } = room;
  const sunRef = useRef();
  useEffect(() => {
    const s = sunRef.current;
    if (!s) return;
    const cam = s.shadow.camera;
    cam.left = -w / 2 - 2;
    cam.right = w / 2 + 2;
    cam.top = d / 2 + 2;
    cam.bottom = -d / 2 - 2;
    cam.near = 1;
    cam.far = h * 4;
    cam.updateProjectionMatrix();
    s.target.position.set(0, 0, 0);
    s.target.updateMatrixWorld();
  }, [w, d, h]);
  const neon = room.id === "neon";
  return (
    <>
      <color attach="background" args={[light.fog]} />
      <fog attach="fog" args={[light.fog, Math.max(w, d) * 1.1, Math.max(w, d) * 2.6]} />
      <hemisphereLight color={colors.light} groundColor={colors.floor} intensity={light.hemi} />
      <ambientLight intensity={neon ? 0.25 : 0.2} />
      <directionalLight
        ref={sunRef}
        position={[w * 0.15, h * 2.2, -d * 0.2]}
        intensity={light.sun}
        color={light.sunColor}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <pointLight position={[-w * 0.3, h - 1.2, -d * 0.25]} intensity={neon ? 30 : 18} distance={w} decay={1.5} color={light.fill} />
      <pointLight position={[w * 0.3, h - 1.2, d * 0.25]} intensity={neon ? 30 : 18} distance={w} decay={1.5} color={neon ? "#20f0ff" : light.fill} />
      {neon && <pointLight position={[0, 1.5, 0]} intensity={14} distance={w * 0.7} decay={1.5} color="#ff2fd0" />}
    </>
  );
}

/* ------------------------------------------------------------------ public */
/** Whole indoor room for a level built by data/rooms.js. */
export const RoomScene = memo(function RoomScene({ level, shadows = true }) {
  const room = level.room;
  return (
    <group>
      <RoomLights room={room} shadows={shadows} />
      <Shell room={room} />
      {room.features.map((f, i) => {
        if (f.type === "kicker") return <Kicker key={i} f={f} colors={room.colors} />;
        if (f.type === "funbox") return <Funbox key={i} f={f} colors={room.colors} />;
        if (f.type === "ledge") return <Ledge key={i} f={f} colors={room.colors} />;
        return null;
      })}
      {level.rails.map((r) => <Rail key={r.id} r={r} colors={room.colors} floorY={0} />)}
      {room.decor.map((d, i) => <Decor key={i} d={d} room={room} />)}
      <Dust room={room} />
    </group>
  );
});

/** Slow floating dust specks in the light — cheap ambience. */
function Dust({ room }) {
  const ref = useRef();
  const { geo, mat } = useMemo(() => {
    const n = 160;
    const pos = new Float32Array(n * 3);
    const R = rng(room.seed + 5);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (R() - 0.5) * room.w;
      pos[i * 3 + 1] = R() * room.h;
      pos[i * 3 + 2] = (R() - 0.5) * room.d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: room.id === "neon" ? "#ff9cf0" : "#fff6e0", size: 0.05, transparent: true, opacity: 0.5, depthWrite: false });
    return { geo: g, mat: m };
  }, [room]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.01;
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}
