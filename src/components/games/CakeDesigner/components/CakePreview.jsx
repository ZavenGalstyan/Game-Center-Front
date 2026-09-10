/**
 * Cake Designer — the hero renderer.
 *
 * A single square-view-box SVG that draws the whole cake: an extruded, shaped,
 * multi-tier body with soft frosting finishes, organic drips, a cake stand,
 * contact shadows, rim highlights, scatter fields (sprinkles / pearls / gold
 * leaf / sparkles), placed toppings & decorations, a message plaque and
 * final-touch dusts.
 *
 * It is used everywhere a cake appears — the editor, the menu diorama, order
 * previews, collection cards and the result screen — so it stays presentational:
 * geometry comes from editor/geometry.js and editor/shapes.js, positions are
 * normalised, and the only interactivity is optional pick handlers on items.
 */

import { memo, useMemo } from "react";
import CakeDefs from "./CakeDefs.jsx";
import Sprite, { spriteSize } from "./CakeSprites.jsx";
import { COLOR_BY_ID, FROSTING_BY_ID, DRIP_BY_ID } from "../data/items.js";
import { VB, VB_CX, VIEWBOX, tierBoxes, placementField, toViewBox } from "../editor/geometry.js";
import { shapeOutline, outlinePath, sidePath, dripAnchors } from "../editor/shapes.js";

/* --------------------------------------------------------- deterministic --- */

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const col = (id) => COLOR_BY_ID[id] || COLOR_BY_ID.white;

/* ------------------------------------------------------------- one tier --- */

function Tier({ box, layer, index, cakeId, quality, finish, isTop, animate, drip }) {
  const { cx, rx, ry, h, topY } = box;
  const c = col(layer.color);
  const gid = `${cakeId}-t${index}`;
  const galaxy = finish === "galaxy";
  const dripInfo = drip && drip !== "none" ? DRIP_BY_ID[drip] : null;

  // the decorative shape lives on the bottom tier; tiers above are round, like
  // real tiered cakes. The extruded body uses a simple rounded silhouette for
  // the wavy shapes (flower/star) so the side never spikes.
  const faceShape = index === 0 ? box._shape : "round";
  const bodyShape = ["round", "square", "hexagon", "tall"].includes(faceShape) ? faceShape : "round";
  const steps = quality === "low" ? 44 : 72;
  const overhang = faceShape === "flower" || faceShape === "star" ? 1.05 : faceShape === "heart" ? 1.0 : 1;
  const pts = useMemo(
    () => shapeOutline(faceShape, cx, topY, rx * overhang, ry, steps),
    [faceShape, cx, topY, rx, ry, steps, overhang],
  );
  const bodyPts = useMemo(
    () => (bodyShape === faceShape ? null : shapeOutline(bodyShape, cx, topY, rx * 0.96, ry, steps)),
    [bodyShape, faceShape, cx, topY, rx, ry, steps],
  );
  const topD = outlinePath(pts);
  const sideD = sidePath(bodyPts || pts, topY, h);

  return (
    <g>
      <defs>
        <radialGradient id={`${gid}-top`} cx="0.4" cy="0.32" r="0.9">
          <stop offset="0" stopColor={galaxy ? "#5646a0" : c.spec} />
          <stop offset="0.55" stopColor={galaxy ? "#2c2560" : c.hex} />
          <stop offset="1" stopColor={galaxy ? "#150f38" : c.shade} />
        </radialGradient>
        <linearGradient id={`${gid}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={galaxy ? "#241a54" : c.hex} />
          <stop offset="0.6" stopColor={galaxy ? "#1a1442" : c.shade} />
          <stop offset="1" stopColor={galaxy ? "#0e0a26" : shade(c.shade, 0.82)} />
        </linearGradient>
      </defs>

      {/* contact shadow onto the tier below / the plate */}
      <ellipse cx={cx} cy={topY + h + ry * 0.2} rx={rx * 0.94} ry={ry * 0.6}
        fill="rgba(40,24,20,0.16)" filter="url(#cd-blur-sm)" />

      {/* extruded side */}
      <path d={sideD} fill={`url(#${gid}-side)`} />
      {/* front sheen */}
      <path d={sideD} fill="rgba(255,255,255,0.10)" style={{ mixBlendMode: "soft-light" }} />
      {/* base darkening */}
      <path d={sideD} fill="url(#cd-side-fade)" opacity="0.3" />

      {/* drip icing over the front edge (top tier only) */}
      {isTop && dripInfo && dripInfo.hex && (
        <Drips key={`${cakeId}-${drip}`} pts={bodyPts || pts} topY={topY} h={h}
          dripColor={dripInfo.hex} animate={animate} quality={quality} />
      )}

      {/* top surface */}
      <path d={topD} fill={`url(#${gid}-top)`} />
      {/* rim frosting highlight */}
      <path d={topD} fill="none" stroke={galaxy ? "rgba(150,130,220,0.6)" : shade(c.spec, 1.04)}
        strokeWidth={finish === "whip" ? 5 : 3.4} strokeLinejoin="round" opacity="0.9" />
      <path d={topD} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" strokeLinejoin="round" />
      {/* back-edge catch light */}
      <ellipse cx={cx} cy={topY - ry * 0.42} rx={rx * 0.52} ry={ry * 0.28}
        fill="rgba(255,255,255,0.2)" filter="url(#cd-blur-sm)" />

      <FinishOverlay finish={finish} pts={pts} box={box} color={c} cakeId={gid}
        quality={quality} animate={animate} />

      {/* top-left key light */}
      <ellipse cx={cx - rx * 0.32} cy={topY - ry * 0.2} rx={rx * 0.42} ry={ry * 0.5}
        fill="rgba(255,255,255,0.28)" filter="url(#cd-blur)" />
    </g>
  );
}

/* -------------------------------------------------------------- drips ----- */

function Drips({ pts, topY, h, dripColor, animate, quality }) {
  const n = quality === "low" ? 7 : quality === "medium" ? 10 : 13;
  const anchors = dripAnchors(pts, topY, n);
  const rnd = mulberry32(hash(anchors.map((a) => a.x | 0).join(",")));
  const drip = dripColor;
  const dripLite = shade(dripColor, 1.35);
  return (
    <g className={animate ? "cd-drips-in" : ""}>
      {anchors.map((a, i) => {
        if (rnd() < 0.22) return null; // gaps so the drip isn't a uniform fringe
        const long = rnd();
        const len = 5 + long * long * (h * 0.85);
        const w = 3.6 + rnd() * 4;
        const wob = (rnd() - 0.5) * 4;
        const d = `M${a.x - w} ${a.y - 3}
          C ${a.x - w} ${a.y + len * 0.5}, ${a.x - w + wob} ${a.y + len}, ${a.x + wob} ${a.y + len + w * 0.7}
          C ${a.x + w + wob} ${a.y + len}, ${a.x + w} ${a.y + len * 0.5}, ${a.x + w} ${a.y - 3} Z`;
        return (
          <g key={i}>
            <path d={d} fill={drip} />
            <ellipse cx={a.x + wob} cy={a.y + len + w * 0.4} rx={w * 0.95} ry={w * 0.95} fill={drip} />
            <ellipse cx={a.x + wob - w * 0.3} cy={a.y + len} rx={w * 0.3} ry={w * 0.5} fill={dripLite} opacity="0.7" />
          </g>
        );
      })}
    </g>
  );
}

/* --------------------------------------------------------- finish styles -- */

function FinishOverlay({ finish, pts, box, color, cakeId, quality, animate }) {
  const { cx, topY, rx, ry } = box;
  const clip = `${cakeId}-clip`;
  const inner = quality === "low" ? null : (
    <clipPath id={clip}><path d={outlinePath(pts)} /></clipPath>
  );

  if (finish === "swirl") {
    return (
      <>
        {inner}
        <g clipPath={`url(#${clip})`} opacity="0.5">
          {[0.75, 0.5, 0.28].map((k, i) => (
            <ellipse key={i} cx={cx} cy={topY} rx={rx * k} ry={ry * k}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
          ))}
          <path d={`M${cx} ${topY} q ${rx * 0.4} ${-ry} ${rx * 0.7} 0 q ${-rx * 0.3} ${ry} ${-rx * 0.7} 0`}
            fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
        </g>
      </>
    );
  }
  if (finish === "whip") {
    // fluffy scallops hugging the rim, front half only so it reads as cream
    const bumps = [];
    const stepN = quality === "low" ? 10 : 7;
    for (let i = 0; i < pts.length; i += stepN) {
      const p = pts[i];
      if (p.y < topY - ry * 0.35) continue;
      bumps.push(
        <circle key={i} cx={p.x} cy={p.y} r={4.5}
          fill={color.spec} stroke="rgba(255,255,255,0.7)" strokeWidth="1" />,
      );
    }
    return <g>{bumps}</g>;
  }
  if (finish === "matte") {
    return (
      <>
        {inner}
        <path d={`M${cx - rx * 0.7} ${topY - ry * 0.1} q ${rx * 0.7} ${-ry * 0.5} ${rx * 1.4} 0`}
          fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round"
          clipPath={inner ? `url(#${clip})` : undefined} />
      </>
    );
  }
  if (finish === "velvet") {
    return (
      <>
        {inner}
        <g clipPath={inner ? `url(#${clip})` : undefined}>
          <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill="rgba(20,6,24,0.32)" />
          <ellipse cx={cx - rx * 0.25} cy={topY - ry * 0.2} rx={rx * 0.5} ry={ry * 0.55}
            fill="rgba(255,210,255,0.16)" />
        </g>
      </>
    );
  }
  if (finish === "marble") {
    const rnd = mulberry32(hash(cakeId));
    const veins = Array.from({ length: quality === "low" ? 2 : 4 }).map((_, i) => {
      const y = topY + (rnd() - 0.5) * ry;
      return `M${cx - rx} ${y} q ${rx * 0.5} ${(rnd() - 0.5) * ry} ${rx} ${(rnd() - 0.5) * ry * 0.6} t ${rx} ${(rnd() - 0.5) * ry}`;
    });
    return (
      <>
        {inner}
        <g clipPath={inner ? `url(#${clip})` : undefined} opacity="0.5">
          {veins.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={i % 2 ? "rgba(60,40,25,0.5)" : "rgba(255,255,255,0.5)"}
              strokeWidth="1.6" />
          ))}
        </g>
      </>
    );
  }
  if (finish === "galaxy") {
    const rnd = mulberry32(hash(cakeId + "g"));
    const stars = Array.from({ length: quality === "low" ? 14 : quality === "medium" ? 26 : 44 }).map((_, i) => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      return { x: cx + Math.cos(a) * rx * r, y: topY + Math.sin(a) * ry * r, s: rnd() * 1.4 + 0.4 };
    });
    return (
      <>
        {inner}
        <g clipPath={inner ? `url(#${clip})` : undefined}>
          <ellipse cx={cx + rx * 0.2} cy={topY + ry * 0.1} rx={rx * 0.6} ry={ry * 0.7}
            fill={color.hex} opacity="0.25" style={{ mixBlendMode: "screen" }} />
          <ellipse cx={cx - rx * 0.3} cy={topY - ry * 0.2} rx={rx * 0.45} ry={ry * 0.5}
            fill="#5b8cff" opacity="0.22" style={{ mixBlendMode: "screen" }} />
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff"
              className={animate && i % 5 === 0 ? "cd-twinkle" : ""} />
          ))}
        </g>
      </>
    );
  }
  // "cream" — soft spatula strokes
  return (
    <>
      {inner}
      <g clipPath={inner ? `url(#${clip})` : undefined} opacity="0.4">
        {[0.2, -0.05, -0.3].map((off, i) => (
          <path key={i}
            d={`M${cx - rx * 0.8} ${topY + ry * off} q ${rx * 0.8} ${-ry * 0.35} ${rx * 1.6} 0`}
            fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
        ))}
      </g>
    </>
  );
}

/* ------------------------------------------------------- scatter fields -- */

function ScatterField({ id, boxes, cake, quality, animate }) {
  const top = boxes[boxes.length - 1];
  const density = quality === "low" ? 0.45 : quality === "medium" ? 0.72 : 1;
  const rnd = mulberry32(hash(id + cake.shape + cake.layers.length));

  const onTop = (count, spill = false) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      // most pieces sit on the top surface; a few drift just over the front rim
      const drift = spill && rnd() > 0.78;
      out.push({
        x: top.cx + Math.cos(a) * top.rx * r * 0.8,
        y: top.topY + Math.sin(a) * top.ry * r * 0.8 + (drift ? top.ry * 0.9 + rnd() * top.h * 0.4 : 0),
        rot: rnd() * 360,
        k: rnd(),
      });
    }
    return out;
  };

  if (id === "sprinkles") {
    const cols = ["#e0524f", "#f2a05a", "#f7db8a", "#8fce8f", "#7fa8e6", "#c9b8ec", "#ffffff"];
    return (
      <g className={animate ? "cd-fall-in" : ""}>
        {onTop(Math.round(46 * density), true).map((p, i) => (
          <rect key={i} x={p.x - 2.6} y={p.y - 1} width="5.2" height="2" rx="1"
            fill={cols[i % cols.length]} transform={`rotate(${p.rot} ${p.x} ${p.y})`} />
        ))}
      </g>
    );
  }
  if (id === "confetti") {
    const cols = ["#e0524f", "#7fa8e6", "#8fce8f", "#f7db8a", "#f7b8cf", "#9d7fd1"];
    return (
      <g className={animate ? "cd-fall-in" : ""}>
        {onTop(Math.round(34 * density), true).map((p, i) => (
          <rect key={i} x={p.x - 2.4} y={p.y - 2.4} width="4.8" height="4.8" rx="0.8"
            fill={cols[i % cols.length]} transform={`rotate(${p.rot} ${p.x} ${p.y})`} opacity="0.95" />
        ))}
      </g>
    );
  }
  if (id === "stars-conf") {
    const cols = ["#f7db8a", "#f7b8cf", "#8be0ff", "#fff"];
    return (
      <g className={animate ? "cd-fall-in" : ""}>
        {onTop(Math.round(26 * density), true).map((p, i) => (
          <path key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${0.4 + p.k * 0.4})`}
            d="M0 -6 L1.8 -1.8 L6 -1.8 L2.6 1.2 L4 6 L0 3 L-4 6 L-2.6 1.2 L-6 -1.8 L-1.8 -1.8 Z"
            fill={cols[i % cols.length]} />
        ))}
      </g>
    );
  }
  if (id === "pearls" || id === "gold-pearls") {
    const base = id === "pearls" ? "#f3ede2" : "#e8c46b";
    const hi = id === "pearls" ? "#ffffff" : "#fff0c0";
    return (
      <g>
        {onTop(Math.round(30 * density), true).map((p, i) => {
          const s = 2.4 + p.k * 2;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y + s * 0.5} r={s} fill="rgba(0,0,0,0.18)" />
              <circle cx={p.x} cy={p.y} r={s} fill={base} />
              <circle cx={p.x - s * 0.35} cy={p.y - s * 0.35} r={s * 0.35} fill={hi} />
            </g>
          );
        })}
      </g>
    );
  }
  if (id === "gold-leaf") {
    return (
      <g>
        {onTop(Math.round(20 * density), true).map((p, i) => {
          const s = 3 + p.k * 4;
          return (
            <path key={i}
              transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}
              d={`M${-s} ${-s * 0.6} L${s * 0.3} ${-s} L${s} ${s * 0.2} L${-s * 0.2} ${s} Z`}
              fill="url(#cd-gold)" opacity="0.92" />
          );
        })}
      </g>
    );
  }
  if (id === "sparkle-field") {
    return (
      <g>
        {onTop(Math.round(22 * density), true).map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) scale(${0.5 + p.k})`}
            className={animate ? "cd-twinkle" : ""} style={{ animationDelay: `${p.k * 2}s` }}>
            <path d="M0 -7 L1.4 -1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4 -1.4 Z"
              fill={i % 3 ? "#fff" : "#ffe9b0"} />
          </g>
        ))}
      </g>
    );
  }
  return null;
}

/* ---------------------------------------------------------- final touch -- */

function FinalTouch({ id, boxes, quality, animate }) {
  const all = boxes[0];
  const w = all.rx * 1.7;
  const top = boxes[boxes.length - 1].topY - 12;
  const bottom = boxes[0].topY + boxes[0].h * 0.4;
  const rnd = mulberry32(hash("ft" + id));
  const n = quality === "low" ? 16 : quality === "medium" ? 30 : 46;
  const pts = Array.from({ length: n }).map(() => ({
    x: VB_CX + (rnd() - 0.5) * w,
    y: top + rnd() * (bottom - top),
    k: rnd(),
  }));

  if (id === "sugar" || id === "gold-dust") {
    const fill = id === "sugar" ? "#ffffff" : "#f0d590";
    return (
      <g opacity="0.6">
        <ellipse cx={VB_CX} cy={boxes[boxes.length - 1].topY} rx={boxes[boxes.length - 1].rx}
          ry={boxes[boxes.length - 1].ry} fill={fill} opacity="0.22" filter="url(#cd-blur)" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.6 + p.k} fill={fill} opacity={0.4 + p.k * 0.4} />)}
      </g>
    );
  }
  if (id === "glitter") {
    return (
      <g>
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.8 + p.k * 1.2}
            fill={i % 2 ? "#fff" : "#ffe9b0"} className={animate && i % 3 === 0 ? "cd-twinkle" : ""}
            style={{ animationDelay: `${p.k * 2.5}s` }} opacity={0.5 + p.k * 0.4} />
        ))}
      </g>
    );
  }
  const shape = id === "hearts"
    ? "M0 2 C -3 -2 -7 1 0 6 C 7 1 3 -2 0 2 Z"
    : "M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z";
  const fill = id === "hearts" ? "#f7a8c4" : id === "stars-dust" ? "#ffe9b0" : "#fff";
  return (
    <g>
      {pts.slice(0, Math.round(n * 0.5)).map((p, i) => (
        <path key={i} transform={`translate(${p.x} ${p.y}) scale(${0.6 + p.k})`} d={shape} fill={fill}
          className={animate && i % 4 === 0 ? "cd-twinkle" : ""} opacity={0.6 + p.k * 0.3} />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------- message --- */

function MessagePlaque({ text, boxes }) {
  const b = boxes[0];
  const y = boxes.length > 1 ? boxes[1].baseY + 6 : b.topY + b.h * 0.5;
  const w = Math.min(b.rx * 1.8, 40 + text.length * 9);
  const fs = Math.max(9, Math.min(15, (w - 14) / (text.length * 0.62)));
  return (
    <g>
      <rect x={VB_CX - w / 2} y={y - 13} width={w} height="26" rx="9"
        fill="url(#cd-cream)" stroke="rgba(120,80,40,0.25)" strokeWidth="1" filter="url(#cd-soft)" />
      <text x={VB_CX} y={y + fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight="700"
        fontFamily="'Baloo 2','Trebuchet MS',system-ui,sans-serif" fill="#8a5a2c"
        letterSpacing="0.5">{text}</text>
    </g>
  );
}

/* -------------------------------------------------------------- stand ---- */

function CakeStand({ boxes }) {
  const b = boxes[0];
  const plateRx = b.rx * 1.35;
  const y = b.baseY;
  return (
    <g>
      <ellipse cx={VB_CX} cy={y + 58} rx={plateRx * 1.15} ry="18" fill="rgba(20,12,10,0.28)" filter="url(#cd-blur)" />
      {/* pedestal */}
      <path d={`M${VB_CX - plateRx * 0.5} ${y + 6} L${VB_CX - 10} ${y + 44} L${VB_CX + 10} ${y + 44} L${VB_CX + plateRx * 0.5} ${y + 6} Z`}
        fill="url(#cd-plate-edge)" />
      <ellipse cx={VB_CX} cy={y + 46} rx={plateRx * 0.62} ry="9" fill="url(#cd-plate)" />
      <ellipse cx={VB_CX} cy={y + 47} rx={plateRx * 0.62} ry="9" fill="none" stroke="rgba(0,0,0,0.1)" />
      {/* plate */}
      <ellipse cx={VB_CX} cy={y + 8} rx={plateRx} ry={plateRx * 0.24} fill="url(#cd-plate-edge)" />
      <ellipse cx={VB_CX} cy={y + 4} rx={plateRx} ry={plateRx * 0.24} fill="url(#cd-plate)" />
      <ellipse cx={VB_CX} cy={y + 2} rx={plateRx * 0.82} ry={plateRx * 0.19} fill="rgba(255,255,255,0.5)" />
      <ellipse cx={VB_CX} cy={y + 4} rx={plateRx} ry={plateRx * 0.24} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" />
    </g>
  );
}

/* ------------------------------------------------------------- the cake -- */

function CakePreviewImpl({
  cake,
  quality = "high",
  animate = true,
  showStand = true,
  scene = null,
  selectedUid = null,
  onPickItem,
  svgRef,
  interactive = false,
  dragGhost = null,
  className = "",
  style,
}) {
  const cakeId = useMemo(
    () => "cd" + hash(JSON.stringify([cake.shape, cake.layers, cake.drip])),
    [cake.shape, cake.layers, cake.drip],
  );
  const boxes = useMemo(() => {
    const b = tierBoxes(cake);
    b.forEach((x) => (x._shape = cake.shape));
    return b;
  }, [cake]);

  const rot = cake.rotation || 0;
  const items = useMemo(() => {
    const merged = [
      ...cake.decorations.map((d) => ({ ...d, kind: "decoration" })),
      ...cake.toppings.map((t) => ({ ...t, kind: "topping" })),
    ];
    return merged
      .map((it) => {
        const p = toViewBox(cake, it.x, it.y);
        return { ...it, vx: p.x, vy: p.y };
      })
      .sort((a, b) => a.vy - b.vy);
  }, [cake]);

  return (
    <svg
      ref={svgRef}
      viewBox={VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      className={`cd-cake ${className}`}
      style={style}
      role="img"
      aria-label="Cake preview"
    >
      <CakeDefs />
      <linearGradient id="cd-side-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
      </linearGradient>

      {scene && (
        <g>
          <rect x="0" y="0" width={VB} height={VB} fill={scene.bg0 || "#2a1430"} />
          <radialGradient id="cd-scene-glow" cx="0.5" cy="0.32" r="0.7">
            <stop offset="0" stopColor={scene.accent || "#ffd7ec"} stopOpacity="0.5" />
            <stop offset="1" stopColor={scene.accent || "#ffd7ec"} stopOpacity="0" />
          </radialGradient>
          <rect x="0" y="0" width={VB} height={VB} fill="url(#cd-scene-glow)" />
          <ellipse cx={VB_CX} cy={VB} rx={VB * 0.7} ry={VB * 0.28} fill="rgba(0,0,0,0.25)" />
        </g>
      )}

      {showStand && <CakeStand boxes={boxes} />}

      <g transform={`translate(${rot * 9} 0) rotate(${rot * 2.4} ${VB_CX} ${boxes[0].baseY})`}>
        {boxes.map((box, i) => (
          <Tier
            key={i}
            box={box}
            layer={cake.layers[i]}
            index={i}
            cakeId={cakeId}
            quality={quality}
            finish={(FROSTING_BY_ID[cake.layers[i].frosting] || FROSTING_BY_ID.vanilla).finish}
            isTop={i === boxes.length - 1}
            animate={animate}
            drip={cake.drip}
          />
        ))}

        {cake.scatter.map((s) => (
          <ScatterField key={s} id={s} boxes={boxes} cake={cake} quality={quality} animate={animate} />
        ))}

        {cake.message && <MessagePlaque text={String(cake.message).slice(0, 18)} boxes={boxes} />}

        {items.map((it) => {
          const base = spriteSize(it.id);
          const s = ((it.scale || 1) * base) / 24;
          const selected = selectedUid && it.uid === selectedUid;
          return (
            <g
              key={it.uid}
              transform={`translate(${it.vx} ${it.vy}) rotate(${it.rot || 0}) scale(${s})`}
              className={`cd-item${animate ? " cd-pop-in" : ""}${interactive ? " cd-item--live" : ""}`}
              onPointerDown={
                onPickItem
                  ? (e) => {
                      e.stopPropagation();
                      onPickItem(it.kind, it.uid, e);
                    }
                  : undefined
              }
            >
              {selected && (
                <circle r={base * 0.8} fill="none" stroke="#fff" strokeWidth="2.5"
                  strokeDasharray="4 3" className="cd-select-ring" />
              )}
              <Sprite id={it.id} animate={animate} seed={hash(it.uid) % 5} number={it.number} />
            </g>
          );
        })}

        {cake.finalTouches.map((ft) => (
          <FinalTouch key={ft} id={ft} boxes={boxes} quality={quality} animate={animate} />
        ))}
      </g>

      {dragGhost && (
        <g transform={`translate(${dragGhost.x} ${dragGhost.y}) scale(${spriteSize(dragGhost.id) / 24})`}
          opacity="0.7" style={{ pointerEvents: "none" }}>
          <Sprite id={dragGhost.id} animate={false} number={dragGhost.number} />
        </g>
      )}
    </svg>
  );
}

/* -------------------------------------------------------------- utils ---- */

function shade(hex, factor) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  r = Math.max(0, Math.min(255, Math.round(r * factor)));
  g = Math.max(0, Math.min(255, Math.round(g * factor)));
  b = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const CakePreview = memo(CakePreviewImpl);
export default CakePreview;
