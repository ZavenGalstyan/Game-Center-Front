/**
 * Water Tanks — one glass tank, drawn in SVG at its real pixel size.
 *
 * Layers, back to front: back wall tint → water (clipped to the interior) →
 * measurement marks → target lines → front glass (walls, reflections) → rim →
 * steel foot. The water is one tall gradient block translated to the surface
 * height (a CSS transform, so level changes are GPU-cheap and can transition
 * in lock-step with the pour), and counter-rotated against the glass tilt so
 * the surface stays level while the tank leans.
 */
import { memo } from "react";
import { interiorPath, glassPath, levelY } from "./geometry.js";

function marksFor(capacity) {
  const step = capacity <= 12 ? 1 : 2;
  const out = [];
  for (let k = 1; k <= capacity; k++) out.push({ k, major: k % step === 0 || k === capacity });
  return out;
}

function TankGlass({
  uid, geo, capacity, amount, tilt = 0, waterMs = 320, waterEase = "cubic-bezier(.3,.7,.3,1)",
  tiltMs = 0, receiving = false, receiveX = null, draining = false, filling = false,
  targets = [], showNumbers = true, locked = false, success = false,
}) {
  const g = geo;
  const ly = levelY(g, amount, capacity);
  const depth = Math.max(0, g.yBottom - ly);
  const clip = `wt-clip-${uid}`;
  const wg = `wt-water-${uid}`;
  const gg = `wt-glass-${uid}`;
  const ri = `wt-rim-${uid}`;
  const ft = `wt-foot-${uid}`;
  const big = g.w * 3;
  const zone = g.yBottom - g.yFull;
  const tickL = g.x0 + 2;
  const tickW = Math.max(5, (g.x1 - g.x0) * 0.13);
  const fs = Math.max(8, Math.min(13, zone / capacity * 0.62, g.w * 0.11));
  const recX = receiveX ?? g.cx;

  return (
    <svg className="wt-glass" width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true">
      <defs>
        <clipPath id={clip}><path d={interiorPath(g)} /></clipPath>
        <linearGradient id={wg} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={zone + 6}>
          <stop offset="0" style={{ stopColor: "var(--wt-water-top)" }} />
          <stop offset="0.35" style={{ stopColor: "var(--wt-water-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--wt-water-deep)" }} />
        </linearGradient>
        <linearGradient id={gg} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--wt-glass-edge)", stopOpacity: 0.55 }} />
          <stop offset="0.18" style={{ stopColor: "var(--wt-glass-tint)", stopOpacity: 0.1 }} />
          <stop offset="0.75" style={{ stopColor: "var(--wt-glass-tint)", stopOpacity: 0.06 }} />
          <stop offset="1" style={{ stopColor: "var(--wt-glass-edge)", stopOpacity: 0.45 }} />
        </linearGradient>
        <linearGradient id={ri} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--wt-rim-hi)" }} />
          <stop offset="1" style={{ stopColor: "var(--wt-rim-lo)" }} />
        </linearGradient>
        <linearGradient id={ft} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--wt-metal-lo)" }} />
          <stop offset="0.35" style={{ stopColor: "var(--wt-metal-hi)" }} />
          <stop offset="0.65" style={{ stopColor: "var(--wt-metal-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--wt-metal-lo)" }} />
        </linearGradient>
      </defs>

      {/* back wall */}
      <path className="wt-glass__back" d={interiorPath(g)} />

      {/* water */}
      <g clipPath={`url(#${clip})`}>
        <g
          className="wt-water"
          style={{ transform: `translateY(${ly}px)`, transition: `transform ${waterMs}ms ${waterEase}`, "--wt-depth": `${depth}px` }}
        >
          <g style={{ transform: `rotate(${-tilt}deg)`, transformOrigin: `${g.cx}px 0px`, transition: `transform ${tiltMs}ms cubic-bezier(.45,.05,.35,1)` }}>
            <rect x={-g.w} y={0} width={big} height={big} fill={`url(#${wg})`} />
            <rect className="wt-water__glow" x={-g.w} y={0} width={big} height={Math.max(4, g.h * 0.08)} />
            <g className="wt-water__wave">
              <path d={wavePath(-g.w, big, 2.2, Math.max(16, g.w * 0.32))} className="wt-water__surface" />
            </g>
            <rect className="wt-water__line" x={-g.w} y={-0.5} width={big} height={1.6} />
            <g className="wt-water__bubbles">
              {[0.22, 0.48, 0.71].map((f, i) => (
                <circle key={i} cx={g.x0 + (g.x1 - g.x0) * f} cy={0} r={Math.max(1.2, g.w * 0.016) * (1 + (i % 2) * 0.5)} style={{ animationDelay: `${i * 1.3}s`, animationDuration: `${3.2 + i * 0.9}s` }} />
              ))}
            </g>
            {receiving && (
              <g className="wt-water__splash">
                <ellipse cx={recX} cy={1} rx={g.w * 0.12} ry={2.2} />
                <ellipse cx={recX} cy={1} rx={g.w * 0.12} ry={2.2} style={{ animationDelay: "160ms" }} />
              </g>
            )}
          </g>
        </g>
        {draining && depth > 0 && <ellipse className="wt-drain-swirl" cx={g.cx} cy={g.yBottom - 3} rx={g.w * 0.16} ry={3} />}
        {filling && <rect className="wt-fill-foam" x={g.cx - 3} y={g.yFull - 12} width={6} height={g.yBottom - g.yFull + 12} />}
      </g>

      {/* measurement marks */}
      <g className="wt-marks">
        {marksFor(capacity).map(({ k, major }) => {
          const y = g.yBottom - (k / capacity) * zone;
          return (
            <g key={k}>
              <line x1={tickL} x2={tickL + (major ? tickW : tickW * 0.55)} y1={y} y2={y} className={major ? "is-major" : ""} />
              {showNumbers && major && zone / capacity >= 9 && (
                <text x={tickL + tickW + 3} y={y + fs * 0.35} fontSize={fs}>{k}</text>
              )}
            </g>
          );
        })}
      </g>

      {/* target lines */}
      {targets.map((t, i) => {
        const y = g.yBottom - (t.amount / capacity) * zone;
        return (
          <g key={i} className={`wt-target-line${t.bound ? " is-bound" : ""}${t.met ? " is-met" : ""}`}>
            <line x1={g.x0} x2={g.x1} y1={y} y2={y} />
            <path d={`M${g.x1 - 1},${y} l-7,-4.5 v9 Z`} />
          </g>
        );
      })}

      {/* front glass */}
      <path className="wt-glass__body" d={interiorPath(g)} fill={`url(#${gg})`} />
      <rect className="wt-glass__streak" x={g.x0 + (g.x1 - g.x0) * 0.1} y={g.yFull - 2} width={Math.max(3, (g.x1 - g.x0) * 0.07)} height={(g.yBottom - g.yFull) * 0.82} rx={3} />
      <rect className="wt-glass__streak wt-glass__streak--thin" x={g.x1 - (g.x1 - g.x0) * 0.13} y={g.yFull + zone * 0.08} width={Math.max(1.5, (g.x1 - g.x0) * 0.025)} height={zone * 0.55} rx={1} />
      <path className="wt-glass__wall-outer" d={glassPath(g)} strokeWidth={g.wall + 1.5} />
      <path className="wt-glass__wall" d={glassPath(g)} strokeWidth={g.wall} />
      <path className="wt-glass__wall-hi" d={glassPath(g)} strokeWidth={Math.max(1, g.wall * 0.3)} />
      {success && <path className="wt-glass__success" d={glassPath(g)} strokeWidth={g.wall + 4} />}

      {/* rim */}
      <rect className="wt-glass__rim" x={g.x0 - g.wall - 1.5} y={g.rimY} width={g.x1 - g.x0 + 2 * g.wall + 3} height={g.rimH} rx={g.rimH / 2} fill={`url(#${ri})`} />
      <rect className="wt-glass__rim-hi" x={g.x0 - g.wall + 2} y={g.rimY + 1.2} width={g.x1 - g.x0 + 2 * g.wall - 4} height={Math.max(1.2, g.rimH * 0.22)} rx={1} />

      {/* steel foot */}
      <rect className="wt-glass__foot" x={1} y={g.bodyBottom - 1} width={g.w - 2} height={g.foot} rx={Math.min(5, g.foot / 2)} fill={`url(#${ft})`} />
      <rect className="wt-glass__foot-line" x={4} y={g.bodyBottom + g.foot * 0.42} width={g.w - 8} height={1} />

      {locked && (
        <g className="wt-glass__locked">
          <path d={interiorPath(g)} />
        </g>
      )}
    </svg>
  );
}

function wavePath(x, width, amp, period) {
  let d = `M${x},0`;
  const n = Math.ceil(width / period) + 1;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * period;
    d += ` q${period / 4},${-amp} ${period / 2},0 t${period / 2},0`;
    if (x0 > x + width) break;
  }
  return `${d} V${amp * 3} H${x} Z`;
}

export default memo(TankGlass);
