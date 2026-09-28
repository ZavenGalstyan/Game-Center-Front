/**
 * Parking Jam — the static parking environment for one level.
 *
 * Layout (world units, one cell = 100, lot origin at 0,0):
 *
 *        block      |road|    top block     |road|   block
 *   ────────────────┼────┼──────────────────┼────┼──────────
 *        road ring runs all the way round and off-screen
 *   ────────────────┼────┼──────────────────┼────┼──────────
 *        left block |road|   PARKING LOT    |road| right block
 *
 * The lot and its four ring roads are fixed; the blocks around them stretch
 * to whatever the viewport shows, so wide/tall screens get more scenery
 * instead of letterboxing. Decor is seeded by level id + viewport, never
 * random per render, and lives on its own memoised SVG layer so car
 * animation never repaints it.
 */
import { memo } from "react";
import { CELL } from "./geometry.js";
import { ROAD } from "./path.js";
import { shade } from "./color.js";
import { asphaltTile, grassTile, concreteTile, paverTile } from "./textures.js";
import {
  Tree, Bush, Lamp, Bollard, Bench, ParkingSign, Hydrant, Bin, PlanterBox, CartCorral,
  LuggageCart, Cone, Drain, Building, Awnings, mulberry,
} from "./decor.jsx";

const WALK = 34; // sidewalk band inside each block's curb
const NEAR = 170; // depth of the "street furniture" zone before buildings start

function Pattern({ id, url, size = 256, fallback }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size}>
      <rect width={size} height={size} fill={fallback} />
      {url && <image href={url} width={size} height={size} />}
    </pattern>
  );
}

/* ---------------------------------------------------------------- lot */

function LotSurface({ level, world, uid, graphics }) {
  const { rows, cols } = level;
  const W = cols * CELL;
  const H = rows * CELL;
  const sc = world.scene;
  const r = mulberry(level.id * 131 + 7);
  const hi = graphics !== "low";
  const stains = [];
  const n = hi ? Math.round((rows * cols) / 5) : 0;
  for (let i = 0; i < n; i++) {
    stains.push({ x: (Math.floor(r() * cols) + 0.3 + r() * 0.4) * CELL, y: (Math.floor(r() * rows) + 0.3 + r() * 0.4) * CELL, rx: 12 + r() * 16, ry: 8 + r() * 12, a: r() * 180 });
  }
  const cracks = [];
  for (let i = 0; hi && i < 3; i++) {
    let x = r() * W;
    let y = r() * H;
    const pts = [[x, y]];
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.3) * 40;
      pts.push([x, y]);
    }
    cracks.push(pts.map((p) => p.map((q) => q.toFixed(1)).join(",")).join(" "));
  }
  // stall marks: a worn cross at every interior grid intersection, T's at the edges
  const marks = [];
  for (let gy = 0; gy <= rows; gy++) {
    for (let gx = 0; gx <= cols; gx++) {
      const x = gx * CELL;
      const y = gy * CELL;
      const edgeX = gx === 0 || gx === cols;
      const edgeY = gy === 0 || gy === rows;
      if (edgeX && edgeY) continue;
      const a = 16;
      let d;
      if (edgeY) d = `M ${x} ${y === 0 ? 4 : y - 4} V ${y === 0 ? a + 6 : y - a - 6}`;
      else if (edgeX) d = `M ${x === 0 ? 4 : x - 4} ${y} H ${x === 0 ? a + 6 : x - a - 6}`;
      else d = `M ${x - a} ${y} H ${x + a} M ${x} ${y - a} V ${y + a}`;
      marks.push(<path key={`${gx}:${gy}`} d={d} opacity={0.4 + r() * 0.4} />);
    }
  }
  const garage = world.key === "garage";
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-lot)`} />
      {hi && <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-lotvig)`} />}
      {stains.map((s, i) => (
        <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} transform={`rotate(${s.a} ${s.x} ${s.y})`} fill="#000" opacity="0.1" />
      ))}
      {cracks.map((c, i) => (
        <polyline key={i} points={c} fill="none" stroke={shade(sc.lot, -0.35)} strokeWidth="1.6" opacity="0.55" />
      ))}
      {garage && hi && Array.from({ length: rows * cols }, (_, i) => {
        const cx = (i % cols) * CELL;
        const cy = Math.floor(i / cols) * CELL;
        return (
          <text key={i} x={cx + 12} y={cy + CELL - 12} fontSize="15" fontWeight="700" fill={sc.line} opacity="0.35" fontFamily="Arial, sans-serif">
            {String.fromCharCode(65 + Math.floor(i / cols))}{(i % cols) + 1}
          </text>
        );
      })}
      <g stroke={sc.line} strokeWidth="4" strokeLinecap="round" fill="none">{marks}</g>
      {hi && <Drain x={W - CELL * 0.5} y={H - 10} />}
      {/* lot boundary: dashed give-way line where cars meet the road */}
      <rect x={3} y={3} width={W - 6} height={H - 6} fill="none" stroke={sc.line} strokeWidth="3" strokeDasharray="16 12" opacity="0.7" />
    </g>
  );
}

/* --------------------------------------------------------- obstacles */

export function Obstacle({ o, world }) {
  const x = (o.col + 0.5) * CELL;
  const y = (o.row + 0.5) * CELL;
  if (o.type === "pillar") {
    const s = 64;
    return (
      <g transform={`translate(${x} ${y})`} className="pj-obstacle">
        <rect x={-s / 2 + 8} y={-s / 2 + 12} width={s} height={s} rx={4} fill="rgba(0,0,0,0.3)" />
        <rect x={-s / 2} y={-s / 2 + 8} width={s} height={s} rx={4} fill="#8a8f96" />
        <rect x={-s / 2} y={-s / 2 + 8} width={s} height={s} rx={4} fill="url(#pj-hazard)" opacity="0.9" />
        <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={4} fill="#c3c7cc" stroke="#7d838b" strokeWidth="2" />
        <rect x={-s / 2 + 7} y={-s / 2 + 7} width={s - 14} height={s - 14} rx={2} fill="#d4d7db" />
        <path d={`M ${-s / 2 + 7} ${-s / 2 + 7} L ${s / 2 - 7} ${s / 2 - 7} M ${s / 2 - 7} ${-s / 2 + 7} L ${-s / 2 + 7} ${s / 2 - 7}`} stroke="#b5b9bf" strokeWidth="1.5" />
      </g>
    );
  }
  if (o.type === "planter") {
    return (
      <g transform={`translate(${x} ${y})`} className="pj-obstacle">
        <rect x={-38} y={-30} width={84} height={82} rx={12} fill="rgba(0,0,0,0.28)" />
        <rect x={-42} y={-36} width={84} height={82} rx={12} fill={shade(world.scene.curb, -0.2)} />
        <rect x={-42} y={-42} width={84} height={82} rx={12} fill={world.scene.curb} stroke={world.scene.curbDark} strokeWidth="2" />
        <rect x={-34} y={-34} width={68} height={66} rx={8} fill="#5b4330" />
        <Bush x={-12} y={-8} r={20} tone="#3f9a45" />
        <Bush x={12} y={8} r={18} tone="#4caf50" flowers={world.night ? null : ["#ff8fb1", "#fff", "#ffd34d"]} />
      </g>
    );
  }
  if (o.type === "barrier") {
    return (
      <g transform={`translate(${x} ${y})`} className="pj-obstacle">
        {[-22, 22].map((bx) => (
          <g key={bx} transform={`translate(${bx} 0)`}>
            <rect x={-12} y={-34} width={30} height={78} rx={6} fill="rgba(0,0,0,0.28)" />
            <rect x={-16} y={-36} width={32} height={78} rx={6} fill="#b8201c" />
            <rect x={-16} y={-42} width={32} height={78} rx={6} fill="#e5332e" stroke="#8e1714" strokeWidth="1.6" />
            <rect x={-16} y={-12} width={32} height={14} fill="#fff" />
            <rect x={-8} y={-36} width={16} height={8} rx={3} fill="#b8201c" />
          </g>
        ))}
      </g>
    );
  }
  // bollards: four posts with a chain
  return (
    <g transform={`translate(${x} ${y})`} className="pj-obstacle">
      <rect x={-30} y={-30} width={60} height={60} rx={6} fill={world.scene.walk} opacity="0.8" />
      <path d="M -24 -24 H 24 V 24 H -24 Z" fill="none" stroke="#e2b021" strokeWidth="2.5" strokeDasharray="5 3" />
      {[[-24, -24], [24, -24], [24, 24], [-24, 24]].map(([bx, by]) => <Bollard key={`${bx}${by}`} x={bx} y={by} />)}
      <Cone x={0} y={0} />
    </g>
  );
}

/** A closed stretch of lot edge — no road access (validator forbids facing it). */
function ClosedEdge({ edge, a, b, level, world }) {
  const W = level.cols * CELL;
  const H = level.rows * CELL;
  const t = 18;
  let x;
  let y;
  let w;
  let h;
  if (edge === "top") [x, y, w, h] = [a * CELL, -t, (b - a + 1) * CELL, t];
  else if (edge === "bottom") [x, y, w, h] = [a * CELL, H, (b - a + 1) * CELL, t];
  else if (edge === "left") [x, y, w, h] = [-t, a * CELL, t, (b - a + 1) * CELL];
  else [x, y, w, h] = [W, a * CELL, t, (b - a + 1) * CELL];
  const horiz = edge === "top" || edge === "bottom";
  const n = Math.round((horiz ? w : h) / 50);
  const key = world.key;
  if (key === "sunny" || key === "mall") {
    return (
      <g>
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={8} fill={world.scene.curb} stroke={world.scene.curbDark} strokeWidth="2" />
        {Array.from({ length: n }, (_, i) => {
          const cx = horiz ? x + (i + 0.5) * (w / n) : x + w / 2;
          const cy = horiz ? y + h / 2 : y + (i + 0.5) * (h / n);
          return <Bush key={i} x={cx} y={cy} r={15} tone={key === "mall" ? "#4f9e55" : "#3f9a45"} flowers={i % 3 === 1 && key === "mall" ? ["#ff8fb1", "#fff"] : null} />;
        })}
      </g>
    );
  }
  return (
    <g>
      <rect x={x + 4} y={y + 6} width={w} height={h} fill="rgba(0,0,0,0.3)" />
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#9da3aa" stroke="#6c727a" strokeWidth="2" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="url(#pj-hazard)" opacity={key === "night" ? 0.7 : 1} />
    </g>
  );
}

/* ------------------------------------------------------------- decor */

function decorate(world, blocks, seed, night) {
  const r = mulberry(seed);
  const out = [];
  const key = world.key;
  let k = 0;
  const add = (el) => out.push(<g key={k++}>{el}</g>);
  const treeTones = night ? ["#1f4a33", "#244f38"] : key === "mall" ? ["#4f9e55", "#3f8f4a"] : ["#3f9a45", "#4aa84d", "#368a3d"];

  for (const b of blocks) {
    const inner = { x: b.x + WALK, y: b.y + WALK, w: b.w - WALK * 2, h: b.h - WALK * 2 };
    if (inner.w < 30 || inner.h < 30) continue;

    // lamps along every side that faces the lot's ring road
    const lampGap = 300;
    for (const side of b.facing) {
      const horiz = side === "top" || side === "bottom";
      const len = horiz ? b.w : b.h;
      const count = Math.max(1, Math.floor(len / lampGap));
      for (let i = 0; i < count; i++) {
        const along = (i + 0.5) * (len / count);
        const lx = horiz ? b.x + along : side === "left" ? b.x + 16 : b.x + b.w - 16;
        const ly = horiz ? (side === "top" ? b.y + 16 : b.y + b.h - 16) : b.y + along;
        if (!b.visible(lx, ly, 40)) continue;
        const angle = { top: 0, bottom: 180, left: 270, right: 90 }[side];
        if (key === "airport" && i % 2) add(<Bollard x={lx} y={ly} />);
        else add(<Lamp x={lx} y={ly} angle={angle + 180} night={night} />);
      }
    }

    // far zone for buildings: inner rect minus the near zone on facing sides
    const far = { ...inner };
    for (const side of b.facing) {
      if (side === "top") { far.y += NEAR; far.h -= NEAR; }
      if (side === "bottom") far.h -= NEAR;
      if (side === "left") { far.x += NEAR; far.w -= NEAR; }
      if (side === "right") far.w -= NEAR;
    }
    const hasFar = far.w > 140 && far.h > 110;
    const buildingStyle = { sunny: "house", garage: "city", mall: "store", airport: "terminal", night: "office" }[key];

    if (hasFar && key !== "garage") {
      // split the far zone along its long axis into a row of buildings
      const horiz = far.w >= far.h;
      const total = horiz ? far.w : far.h;
      let pos = 0;
      while (pos < total - 80) {
        const size = Math.min(total - pos, (key === "airport" ? 520 : key === "sunny" ? 170 : 260) + r() * 180);
        const depth = horiz ? far.h : far.w;
        const thick = key === "sunny" ? Math.min(depth, 120 + r() * 30) : depth;
        const bx = horiz ? far.x + pos : b.facing.includes("left") ? far.x : far.x + far.w - thick;
        const by = horiz ? (b.facing.includes("top") ? far.y : far.y + far.h - thick) : far.y + pos;
        const bw = horiz ? size - 26 : thick;
        const bh = horiz ? thick : size - 26;
        if (b.visible(bx + bw / 2, by + bh / 2, Math.max(bw, bh))) {
          const style = key === "night" && r() > 0.5 ? "tower" : key === "airport" && r() > 0.7 ? "office" : buildingStyle;
          add(<Building x={bx} y={by} w={bw} h={bh} style={style} seed={Math.floor(r() * 1e6)} night={night} accent={["#ff4fa3", "#40e0ff", "#b48cff", "#ffd34d"][Math.floor(r() * 4)]} />);
          if (key === "mall" && horiz) {
            const ay = b.facing.includes("top") ? by - 26 : by + bh + 2;
            add(<Awnings x={bx} y={ay} w={bw} colors={["#e0463b", "#2f7de1", "#3dae5a", "#f28a2e", "#8a55d6"]} />);
          }
          if (key === "sunny") {
            // a garden hedge + tree in front of each house
            const gx = horiz ? bx + bw * 0.5 : bx + bw / 2;
            const gy = horiz ? (b.facing.includes("top") ? by - 30 : by + bh + 30) : by + bh / 2;
            add(<Bush x={gx - 30} y={gy} r={16} tone="#3f9a45" flowers={["#ff8fb1", "#fff", "#ffd34d"]} />);
          }
        }
        pos += size;
      }
    }

    if (key === "garage") {
      // painted bays + structural pillars across the whole deck block
      b.deck = true;
      const horiz = b.w >= b.h;
      const bayW = 100;
      const bayL = 190;
      const aisle = 130;
      const along = horiz ? inner.w : inner.h;
      const across = horiz ? inner.h : inner.w;
      const lines = [];
      for (let band = 0; band * (bayL + aisle) < across - 60; band++) {
        const off = 20 + band * (bayL + aisle);
        const depth = Math.min(bayL, across - off - 10);
        if (depth < 80) break;
        for (let k = 0; k * bayW <= along - 20; k++) {
          const a = 10 + k * bayW;
          const x0 = horiz ? inner.x + a : inner.x + off;
          const y0 = horiz ? inner.y + off : inner.y + a;
          if (!b.visible(x0, y0, 220)) continue;
          lines.push(horiz ? `M ${x0} ${y0} v ${depth}` : `M ${x0} ${y0} h ${depth}`);
          if (k % 3 === 0 && k > 0) {
            const px = horiz ? x0 : x0 + depth + aisle / 2;
            const py = horiz ? y0 + depth + aisle / 2 : y0;
            if (off + depth + aisle < across) add(<g transform={`translate(${px - 50} ${py - 50})`}><Obstacle o={{ type: "pillar", row: 0, col: 0 }} world={world} /></g>);
          }
          if (r() > 0.8) {
            const sx = horiz ? x0 + bayW / 2 : x0 + depth / 2;
            const sy = horiz ? y0 + depth / 2 : y0 + bayW / 2;
            add(<ellipse cx={sx} cy={sy} rx={18} ry={12} fill="#000" opacity="0.1" />);
          }
        }
        // aisle arrow
        const ax = horiz ? inner.x + along / 2 : inner.x + off + depth + aisle / 2;
        const ay = horiz ? inner.y + off + depth + aisle / 2 : inner.y + along / 2;
        if (off + depth + aisle < across && b.visible(ax, ay, 40)) {
          add(<path d="M -26 -6 H 8 V -16 L 28 0 L 8 16 V 6 H -26 Z" transform={`translate(${ax} ${ay}) rotate(${horiz ? 0 : 90})`} fill="#ffd65a" opacity="0.55" />);
        }
      }
      add(<path d={lines.join(" ")} stroke="#ffd65a" strokeOpacity="0.6" strokeWidth="4" fill="none" />);
    }

    // near-zone furniture on a jittered lattice
    const step = key === "sunny" ? 118 : 132;
    for (let gy = inner.y + step / 2; gy < inner.y + inner.h; gy += step) {
      for (let gx = inner.x + step / 2; gx < inner.x + inner.w; gx += step) {
        const x = gx + (r() - 0.5) * step * 0.5;
        const y = gy + (r() - 0.5) * step * 0.5;
        if (hasFar && x > far.x - 30 && x < far.x + far.w + 30 && y > far.y - 30 && y < far.y + far.h + 30) continue;
        if (!b.visible(x, y, 60)) continue;
        const roll = r();
        const fits = (rad) => x - rad > inner.x && x + rad < inner.x + inner.w && y - rad > inner.y && y + rad < inner.y + inner.h;
        if (key === "sunny") {
          if (roll < 0.42 && fits(40)) add(<Tree x={x} y={y} r={34 + r() * 16} tone={treeTones[Math.floor(r() * treeTones.length)]} />);
          else if (roll < 0.7 && fits(22)) add(<Bush x={x} y={y} r={16 + r() * 7} tone="#4caf50" flowers={r() > 0.5 ? ["#ff8fb1", "#fff", "#ffd34d", "#b48cff"] : null} />);
          else if (roll < 0.76 && fits(34)) add(<Bench x={x} y={y} angle={r() > 0.5 ? 0 : 90} />);
        } else if (key === "garage") {
          if (b.deck) continue; // deck blocks carry painted bays instead
          // decorative pillar: Obstacle draws a cell-(0,0) pillar centred on (50,50)
          if (roll < 0.22 && fits(36)) add(<g transform={`translate(${x - 50} ${y - 50})`}><Obstacle o={{ type: "pillar", row: 0, col: 0 }} world={world} /></g>);
          else if (roll < 0.34 && fits(14)) add(<Cone x={x} y={y} />);
          else if (roll < 0.42 && fits(12)) add(<Hydrant x={x} y={y} />);
        } else if (key === "mall") {
          if (roll < 0.25 && fits(50)) add(<PlanterBox x={x} y={y} w={86} h={38} />);
          else if (roll < 0.4 && fits(46)) add(<CartCorral x={x} y={y} n={3 + Math.floor(r() * 3)} />);
          else if (roll < 0.62 && fits(40)) add(<Tree x={x} y={y} r={30 + r() * 10} tone={treeTones[Math.floor(r() * 2)]} />);
          else if (roll < 0.7 && fits(34)) add(<Bench x={x} y={y} tone="#6b4a2f" />);
          else if (roll < 0.76 && fits(12)) add(<Bin x={x} y={y} />);
        } else if (key === "airport") {
          if (roll < 0.25 && fits(34)) add(<LuggageCart x={x} y={y} angle={Math.floor(r() * 4) * 90} />);
          else if (roll < 0.45 && fits(40)) add(<PlanterBox x={x} y={y} w={70} h={36} tone="#4a9e57" stone="#dfe5ea" />);
          else if (roll < 0.62 && fits(38)) add(<Tree x={x} y={y} r={28 + r() * 8} tone="#4a9e57" />);
          else if (roll < 0.72 && fits(10)) add(<Bollard x={x} y={y} />);
        } else {
          if (roll < 0.3 && fits(40)) add(<Tree x={x} y={y} r={30 + r() * 12} tone={treeTones[Math.floor(r() * 2)]} night />);
          else if (roll < 0.45 && fits(40)) add(<Lamp x={x} y={y} night />);
          else if (roll < 0.55 && fits(34)) add(<Bench x={x} y={y} tone="#4b3a2c" />);
          else if (roll < 0.62 && fits(12)) add(<Bin x={x} y={y} tone="#2c3446" />);
        }
      }
    }
    if (key === "sunny" && b.facing.length >= 2 && b.visible(b.x + b.w / 2, b.y + b.h / 2, 60)) {
      // a P sign at a corner nearest the lot
      const sx = b.facing.includes("right") ? b.x + b.w - WALK - 20 : b.x + WALK + 20;
      const sy = b.facing.includes("bottom") ? b.y + b.h - WALK - 8 : b.y + WALK + 40;
      if (r() > 0.5) add(<ParkingSign x={sx} y={sy} />);
    }
  }
  return out;
}

/* ------------------------------------------------------------- scene */

function Environment({ level, world, vb, graphics, uid }) {
  const sc = world.scene;
  const W = level.cols * CELL;
  const H = level.rows * CELL;
  const night = world.night;
  const key = world.key;
  const hi = graphics !== "low";

  const xb = [[vb.x - 50, -ROAD], [0, W], [W + ROAD, vb.x + vb.w + 50]];
  const yb = [[vb.y - 50, -ROAD], [0, H], [H + ROAD, vb.y + vb.h + 50]];
  const blocks = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;
      const [x0, x1] = xb[i];
      const [y0, y1] = yb[j];
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      const facing = [];
      if (i > 0) facing.push("left");
      if (i < 2) facing.push("right");
      if (j > 0) facing.push("top");
      if (j < 2) facing.push("bottom");
      blocks.push({
        x: x0, y: y0, w: x1 - x0, h: y1 - y0, facing,
        visible: (x, y, pad) => x + pad > vb.x && x - pad < vb.x + vb.w && y + pad > vb.y && y - pad < vb.y + vb.h,
      });
    }
  }
  // Decor depends on the viewport only coarsely, so resizes don't reshuffle it wildly.
  const seed = level.id * 977 + world.id * 31;
  const decor = decorate(world, blocks, seed, night);

  const groundTile = key === "sunny" ? grassTile(sc.ground) : concreteTile(sc.ground);
  const roadUrl = asphaltTile(sc.road);
  const lotUrl = asphaltTile(sc.lot);
  const walkUrl = paverTile(sc.walk);
  const roadLine = sc.roadLine;

  return (
    <g className="pj-env">
      <defs>
        <Pattern id={`${uid}-ground`} url={hi ? groundTile : ""} fallback={sc.ground} />
        <Pattern id={`${uid}-road`} url={hi ? roadUrl : ""} fallback={sc.road} />
        <Pattern id={`${uid}-lot`} url={hi ? lotUrl : ""} fallback={sc.lot} />
        <Pattern id={`${uid}-walk`} url={hi ? walkUrl : ""} size={128} fallback={sc.walk} />
        <radialGradient id={`${uid}-lotvig`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </radialGradient>
        <pattern id="pj-hazard" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)">
          <rect width="20" height="20" fill="#f2c230" />
          <rect width="10" height="20" fill="#26292e" />
        </pattern>
        <radialGradient id="pj-lamp-glow">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#ffd27a" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x={vb.x - 60} y={vb.y - 60} width={vb.w + 120} height={vb.h + 120} fill={`url(#${uid}-road)`} />

      {/* blocks: sidewalk band, inner ground, curb */}
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x - 10} y={b.y - 10} width={b.w + 20} height={b.h + 20} rx={34} fill="none" stroke={roadLine} strokeOpacity="0.55" strokeWidth="3" />
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={26} fill={`url(#${uid}-walk)`} />
          <rect x={b.x + WALK} y={b.y + WALK} width={Math.max(0, b.w - WALK * 2)} height={Math.max(0, b.h - WALK * 2)} rx={14}
            fill={`url(#${uid}-ground)`} />
          {key === "sunny" && hi && (
            <rect x={b.x + WALK} y={b.y + WALK} width={Math.max(0, b.w - WALK * 2)} height={Math.max(0, b.h - WALK * 2)} rx={14}
              fill="none" stroke={sc.groundDark} strokeWidth="6" opacity="0.6" />
          )}
          <rect x={b.x + 2} y={b.y + 4} width={b.w - 4} height={b.h - 4} rx={25} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="6" />
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={26} fill="none" stroke={sc.curb} strokeWidth="8" />
        </g>
      ))}

      {/* dashed centre line along every ring road */}
      {hi && (
        <g stroke={roadLine} strokeOpacity={night ? 0.35 : 0.5} strokeWidth="4" strokeDasharray="30 26" fill="none">
          <path d={`M ${vb.x - 60} ${-ROAD / 2} H ${vb.x + vb.w + 60} M ${vb.x - 60} ${H + ROAD / 2} H ${vb.x + vb.w + 60}`} />
          <path d={`M ${-ROAD / 2} ${vb.y - 60} V ${vb.y + vb.h + 60} M ${W + ROAD / 2} ${vb.y - 60} V ${vb.y + vb.h + 60}`} />
        </g>
      )}
      {/* neon curb light downtown */}
      {night && hi && blocks.map((b, i) => (
        <rect key={`n${i}`} x={b.x + 2} y={b.y + 2} width={b.w - 4} height={b.h - 4} rx={25} fill="none"
          stroke={i % 2 ? "#40e0ff" : "#ff4fa3"} strokeOpacity="0.45" strokeWidth="3" />
      ))}

      {/* crosswalks at the lot corners (shopping + airport + night) */}
      {(key === "mall" || key === "airport" || key === "night") && hi && [[-ROAD, -ROAD], [W, -ROAD], [-ROAD, H], [W, H]].map(([cx, cy], i) => (
        <g key={i} fill={roadLine} opacity="0.75">
          {Array.from({ length: 5 }, (_, s) => (
            <rect key={s} x={cx + 8 + s * 19} y={cy + (cy < 0 ? -58 : ROAD + 14)} width={11} height={44} rx={1} />
          ))}
        </g>
      ))}

      <LotSurface level={level} world={world} uid={uid} graphics={graphics} />
      {EDGE_LIST.map((edge) => level.closed[edge].map(([a, b]) => (
        <ClosedEdge key={`${edge}${a}`} edge={edge} a={a} b={b} level={level} world={world} />
      )))}
      {level.obstacles.map((o) => <Obstacle key={o.id} o={o} world={world} />)}
      <g className="pj-decor">{decor}</g>
    </g>
  );
}

const EDGE_LIST = ["top", "right", "bottom", "left"];

export default memo(Environment);
