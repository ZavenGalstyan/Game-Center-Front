/**
 * Parking Jam — vehicle art (SVG). Every vehicle is drawn in canonical pose
 * — nose pointing UP, centered on (0,0), one grid cell = 100 units — and the
 * scene rotates it into place. Direction is readable from the shape itself:
 * long hood + big windshield + pale headlights at the front, short trunk +
 * small rear window + red taillights at the back.
 *
 * The 2.5D look comes from three layers the scene stacks in WORLD space:
 * soft shadow (offset down-right), body "skirt" (offset straight down, so
 * the south-facing side of every car shows, whatever way it points), then
 * the top. Lighting therefore stays consistent when cars rotate.
 *
 * Shared gradients/filters live in <VehicleDefs>, rendered once per SVG.
 */
import { memo } from "react";
import { PAINT, shade, mix, luminance } from "./color.js";
import { CELL, vehicleGeometry, bodyPath } from "./geometry.js";

export { CELL, vehicleGeometry, bodyPath };

/** Paint + trim colors after the cosmetic skin is applied. */
export function paintFor(colorName, skin) {
  const base = (skin?.paint ? skin.paint(colorName) : PAINT[colorName]) || PAINT.blue;
  const matte = Boolean(skin?.matte);
  return {
    base,
    light: shade(base, matte ? 0.1 : 0.24),
    dark: shade(base, -0.3),
    deep: shade(base, -0.5),
    line: shade(base, -0.42),
    roof: skin?.roof || shade(base, matte ? 0.04 : 0.12),
    trim: skin?.trim || null,
    rim: skin?.rim || "#9aa3ad",
    bright: luminance(base) > 0.62,
  };
}

/** Shared defs — one copy per <svg>. `id` prefixes keep multiple SVGs apart. */
export function VehicleDefs({ id }) {
  return (
    <>
      <linearGradient id={`${id}-shade`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.34" />
        <stop offset="0.16" stopColor="#000" stopOpacity="0.06" />
        <stop offset="0.36" stopColor="#fff" stopOpacity="0.16" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0.04" />
        <stop offset="0.86" stopColor="#000" stopOpacity="0.1" />
        <stop offset="1" stopColor="#000" stopOpacity="0.36" />
      </linearGradient>
      <linearGradient id={`${id}-len`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.14" />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#5d7f9e" />
        <stop offset="0.45" stopColor="#2a3f55" />
        <stop offset="1" stopColor="#1a2735" />
      </linearGradient>
      <linearGradient id={`${id}-glassR`} x1="1" x2="0" y1="1" y2="0">
        <stop offset="0" stopColor="#4a6886" />
        <stop offset="0.5" stopColor="#24374b" />
        <stop offset="1" stopColor="#172330" />
      </linearGradient>
      <radialGradient id={`${id}-metal`} cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
        <stop offset="0.35" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-pearl`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#ffd6f5" stopOpacity="0.28" />
        <stop offset="0.5" stopColor="#c8f4ff" stopOpacity="0.18" />
        <stop offset="1" stopColor="#fff3c4" stopOpacity="0.26" />
      </linearGradient>
      <radialGradient id={`${id}-beam`} cx="0.5" cy="1" r="1">
        <stop offset="0" stopColor="#fff6cf" stopOpacity="0.55" />
        <stop offset="0.6" stopColor="#fff6cf" stopOpacity="0.14" />
        <stop offset="1" stopColor="#fff6cf" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </>
  );
}

function Wheels({ g, rim }) {
  const { W, L, y } = g;
  const cells = Math.round((L + 20) / CELL);
  const front = y(cells >= 3 ? 0.13 : 0.2);
  const rear = y(cells >= 3 ? 0.84 : 0.8);
  const axles = cells >= 4 ? [front, y(0.72), y(0.86)] : [front, rear];
  const x = W / 2 - 5;
  return (
    <g className="pj-wheels">
      {axles.map((wy, i) =>
        [-1, 1].map((sx) => (
          <g key={`${i}${sx}`} className={i === 0 ? "pj-wheel pj-wheel--front" : "pj-wheel"} transform={`translate(${sx * x} ${wy})`}>
            <rect x={-7.5} y={-14} width={15} height={28} rx={5} fill="#1b1d21" />
            <rect x={sx > 0 ? 3 : -6} y={-9} width={3} height={18} rx={1.5} fill={rim} opacity="0.7" />
          </g>
        )))}
    </g>
  );
}

/**
 * The visible top of a vehicle, nose up. Pure presentational; memoised
 * because only transforms change while a car drives.
 */
export const VehicleTop = memo(function VehicleTop({ type, cells, color, skin, defs, night = false, detail = "medium" }) {
  const g = vehicleGeometry(type, cells);
  const { s, W, L, y } = g;
  const p = paintFor(color, skin);
  const hw = W / 2;
  const body = bodyPath(W, L, s.rf, s.rr);
  const cw = W * s.cab; // cabin (greenhouse) width
  const rw = cw * 0.84; // roof width
  const yH = y(s.hood);
  const yWs = y(s.ws);
  const yRoof = y(s.roof);
  const yRw = y(s.rw);
  const big = cells >= 3;
  const hi = detail !== "low";
  const glassLine = "rgba(12, 20, 30, 0.55)";

  const windshield = `M ${-cw / 2} ${yH + 3} Q 0 ${yH - 3} ${cw / 2} ${yH + 3} L ${rw / 2} ${yWs} L ${-rw / 2} ${yWs} Z`;
  const rearGlass = `M ${-rw / 2} ${yRoof} L ${rw / 2} ${yRoof} L ${cw / 2 - 1} ${yRw - 2} Q 0 ${yRw + 1.5} ${-cw / 2 + 1} ${yRw - 2} Z`;

  return (
    <g className="pj-vtop">
      <Wheels g={g} rim={p.rim} />
      {/* mirrors sit just behind the windshield base */}
      {!big || type === "van" || type === "minibus" || type === "limo" ? (
        <g fill={p.dark} stroke={p.line} strokeWidth="1">
          <ellipse cx={-hw - 3} cy={yH + 6} rx={5} ry={3.4} />
          <ellipse cx={hw + 3} cy={yH + 6} rx={5} ry={3.4} />
        </g>
      ) : (
        <g fill="#2a2f36">
          <rect x={-hw - 6} y={yH + 2} width={5} height={9} rx={2} />
          <rect x={hw + 1} y={yH + 2} width={5} height={9} rx={2} />
        </g>
      )}

      {/* body */}
      <path d={body} fill={p.base} />
      <path d={body} fill={`url(#${defs}-shade)`} />
      <path d={body} fill={`url(#${defs}-len)`} />
      {skin?.metallic && hi && <path d={body} fill={`url(#${defs}-metal)`} />}
      {skin?.pearl && hi && <path d={body} fill={`url(#${defs}-pearl)`} />}
      <path d={body} fill="none" stroke={p.line} strokeWidth="1.6" />
      {hi && <path d={bodyPath(W - 7, L - 7, s.rf, s.rr)} fill="none" stroke="#fff" strokeOpacity={p.bright ? 0.35 : 0.16} strokeWidth="1.2" />}

      {/* stripes (coupe, retro / sport skins) */}
      {(s.stripes || skin?.stripes) && !big && (
        <g fill={skin?.stripes || (p.bright ? "#1f2328" : "#ffffff")} opacity="0.85">
          <rect x={-7} y={-L / 2 + 2} width={5} height={L - 4} rx={1} />
          <rect x={2} y={-L / 2 + 2} width={5} height={L - 4} rx={1} />
        </g>
      )}
      {skin?.checker && !big && (
        <g opacity="0.8">
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={i % 2 ? 0 : -6} y={yWs + i * ((yRoof - yWs) / 8)} width={6} height={(yRoof - yWs) / 8} fill="#1d2126" />
          ))}
        </g>
      )}

      {/* hood creases */}
      {hi && s.hood > 0.12 && (
        <g stroke={p.line} strokeOpacity="0.35" strokeWidth="1.2" fill="none">
          <path d={`M ${-cw * 0.3} ${yH - 2} Q ${-cw * 0.26} ${(y(0) + yH) / 2} ${-cw * 0.2} ${y(0) + 7}`} />
          <path d={`M ${cw * 0.3} ${yH - 2} Q ${cw * 0.26} ${(y(0) + yH) / 2} ${cw * 0.2} ${y(0) + 7}`} />
        </g>
      )}

      {/* cabin */}
      <path d={windshield} fill={`url(#${defs}-glass)`} stroke={glassLine} strokeWidth="1" />
      {hi && <path d={`M ${-cw * 0.34} ${yH + 4} L ${-cw * 0.12} ${yH + 1.5} L ${-rw * 0.2} ${yWs - 2} L ${-rw * 0.4} ${yWs - 2} Z`} fill="#fff" opacity="0.2" />}
      {/* side windows */}
      <path d={`M ${-cw / 2} ${yWs} L ${-rw / 2} ${yWs} L ${-rw / 2} ${yRoof} L ${-cw / 2} ${yRoof} Z`} fill={`url(#${defs}-glassR)`} />
      <path d={`M ${cw / 2} ${yWs} L ${rw / 2} ${yWs} L ${rw / 2} ${yRoof} L ${cw / 2} ${yRoof} Z`} fill={`url(#${defs}-glassR)`} />
      {s.windows && hi && (
        <g stroke={p.base} strokeWidth="2.2">
          {Array.from({ length: s.windows - 1 }, (_, i) => {
            const wy = yWs + ((i + 1) * (yRoof - yWs)) / s.windows;
            return <path key={i} d={`M ${-cw / 2} ${wy} L ${-rw / 2} ${wy} M ${cw / 2} ${wy} L ${rw / 2} ${wy}`} />;
          })}
        </g>
      )}
      {!s.windows && hi && !big && (
        <g stroke={p.base} strokeWidth="2">
          <path d={`M ${-cw / 2} ${(yWs + yRoof) / 2} L ${-rw / 2} ${(yWs + yRoof) / 2} M ${cw / 2} ${(yWs + yRoof) / 2} L ${rw / 2} ${(yWs + yRoof) / 2}`} />
        </g>
      )}
      {/* roof */}
      <rect x={-rw / 2} y={yWs - 0.5} width={rw} height={yRoof - yWs + 1} rx={big ? 6 : 8} fill={p.roof} />
      <rect x={-rw / 2} y={yWs - 0.5} width={rw} height={yRoof - yWs + 1} rx={big ? 6 : 8} fill={`url(#${defs}-shade)`} opacity="0.8" />
      {hi && <rect x={-rw / 2 + 4} y={yWs + 3} width={rw * 0.34} height={(yRoof - yWs) * 0.6} rx={6} fill="#fff" opacity={p.bright ? 0.28 : 0.14} />}
      {s.rw > s.roof && <path d={rearGlass} fill={`url(#${defs}-glassR)`} stroke={glassLine} strokeWidth="1" />}

      {/* class details */}
      {s.rails && (
        <g stroke={shade(p.base, -0.55)} strokeWidth="2.4" strokeLinecap="round" opacity="0.8">
          <path d={`M ${-rw / 2 + 5} ${yWs + 6} L ${-rw / 2 + 5} ${yRoof - 6}`} />
          <path d={`M ${rw / 2 - 5} ${yWs + 6} L ${rw / 2 - 5} ${yRoof - 6}`} />
        </g>
      )}
      {s.bed && (
        <g>
          <rect x={-hw + 6} y={yRw + 3} width={W - 12} height={L / 2 - yRw - 8} rx={4} fill={p.deep} />
          <g stroke={shade(p.base, -0.62)} strokeWidth="1.6">
            {[0.25, 0.5, 0.75].map((f) => (
              <path key={f} d={`M ${-hw + 9 + f * (W - 18)} ${yRw + 7} L ${-hw + 9 + f * (W - 18)} ${L / 2 - 9}`} />
            ))}
          </g>
        </g>
      )}
      {s.sign && (
        <g>
          <rect x={-13} y={(yWs + yRoof) / 2 - 6} width={26} height={12} rx={3} fill="#fffbe8" stroke="#8a6d10" strokeWidth="1.2" />
          <rect x={-9} y={(yWs + yRoof) / 2 - 2} width={18} height={4} rx={1} fill="#e2a90f" />
        </g>
      )}
      {s.checker && hi && (
        <g>
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i}>
              <rect x={-hw + 0.5} y={yH + i * 5} width={3.2} height={2.5} fill={i % 2 ? "#1d2126" : "#fff"} />
              <rect x={hw - 3.7} y={yH + i * 5} width={3.2} height={2.5} fill={i % 2 ? "#fff" : "#1d2126"} />
            </g>
          ))}
        </g>
      )}
      {s.sunroof && <rect x={-rw * 0.3} y={yWs + 12} width={rw * 0.6} height={(yRoof - yWs) * 0.28} rx={4} fill={`url(#${defs}-glass)`} opacity="0.9" />}
      {s.panels && hi && (
        <g stroke={p.line} strokeOpacity="0.45" strokeWidth="1.2">
          {Array.from({ length: s.panels }, (_, i) => {
            const py = yWs + ((i + 1) * (yRoof - yWs)) / (s.panels + 1);
            return <path key={i} d={`M ${-rw / 2 + 4} ${py} L ${rw / 2 - 4} ${py}`} />;
          })}
        </g>
      )}
      {s.hatchTop && <rect x={-10} y={(yWs + yRoof) / 2 - 10} width={20} height={20} rx={3} fill={shade(p.roof, -0.15)} stroke={p.line} strokeOpacity="0.5" />}
      {s.ac && (
        <g>
          <rect x={-rw * 0.3} y={yWs + (yRoof - yWs) * 0.3} width={rw * 0.6} height={(yRoof - yWs) * 0.2} rx={4} fill="#d9dde2" stroke="#8b9199" strokeWidth="1.2" />
          {hi && Array.from({ length: 4 }, (_, i) => (
            <path key={i} d={`M ${-rw * 0.22} ${yWs + (yRoof - yWs) * (0.33 + i * 0.045)} L ${rw * 0.22} ${yWs + (yRoof - yWs) * (0.33 + i * 0.045)}`} stroke="#9aa0a8" strokeWidth="1.1" />
          ))}
          <rect x={-9} y={yWs + (yRoof - yWs) * 0.66} width={18} height={18} rx={3} fill={shade(p.roof, -0.15)} stroke={p.line} strokeOpacity="0.5" />
          <rect x={-9} y={yWs + (yRoof - yWs) * 0.12} width={18} height={14} rx={3} fill={shade(p.roof, -0.15)} stroke={p.line} strokeOpacity="0.5" />
        </g>
      )}
      {s.band && (
        <g>
          <rect x={-hw + 1} y={yWs} width={4} height={yRoof - yWs} fill="#1f8fe0" />
          <rect x={hw - 5} y={yWs} width={4} height={yRoof - yWs} fill="#1f8fe0" />
        </g>
      )}
      {type === "bus" || type === "shuttle" ? (
        <rect x={-rw * 0.36} y={y(0) + 3} width={rw * 0.72} height={5} rx={2} fill="#1a1d22" />
      ) : null}
      {(s.spoiler || skin?.spoiler) && !big && <rect x={-hw + 4} y={L / 2 - 7} width={W - 8} height={4.5} rx={2} fill={p.deep} />}

      {/* trim (skins) */}
      {p.trim && hi && <path d={bodyPath(W - 2.5, L - 2.5, s.rf, s.rr)} fill="none" stroke={p.trim} strokeOpacity="0.55" strokeWidth="1" />}

      {/* lights: pale headlights at the nose, red at the tail */}
      <g className="pj-headlights">
        <path d={`M ${-hw + 4} ${y(0) + 11} Q ${-hw + 5} ${y(0) + 2} ${-hw + 19} ${y(0) + 0.5} L ${-hw + 18} ${y(0) + 7} Z`} fill={night ? "#fffbe0" : "#fffbea"} stroke="#6b6450" strokeWidth="0.8" />
        <path d={`M ${hw - 4} ${y(0) + 11} Q ${hw - 5} ${y(0) + 2} ${hw - 19} ${y(0) + 0.5} L ${hw - 18} ${y(0) + 7} Z`} fill={night ? "#fffbe0" : "#fffbea"} stroke="#6b6450" strokeWidth="0.8" />
        {!big && <path d={`M ${-hw + 21} ${y(0) + 3} Q 0 ${y(0) + 0.5} ${hw - 21} ${y(0) + 3}`} stroke="#1f2328" strokeOpacity="0.55" strokeWidth="2.4" fill="none" />}
      </g>
      <g fill="#e2352c" stroke="#6e1410" strokeWidth="0.8">
        <rect x={-hw + 3.5} y={L / 2 - 6.5} width={big ? 11 : 15} height={5} rx={2} />
        <rect x={hw - 3.5 - (big ? 11 : 15)} y={L / 2 - 6.5} width={big ? 11 : 15} height={5} rx={2} />
      </g>
    </g>
  );
});

/** A standalone car for menus / collection (nose right by default). */
export function VehicleBadge({ type = "sedan", cells = 2, color = "blue", skin, angle = 90, id = "pjb", size = 1 }) {
  const g = vehicleGeometry(type, cells);
  const span = g.L / 2 + 16;
  return (
    <svg viewBox={`${-span} ${-span} ${span * 2} ${span * 2}`} className="pj-badge" aria-hidden="true" style={{ transform: `scale(${size})` }}>
      <defs>
        <VehicleDefs id={id} />
      </defs>
      <g transform={`rotate(${angle})`} opacity="0.35" filter={`url(#${id}-soft)`}>
        <path d={bodyPath(g.W + 4, g.L + 4, g.s.rf, g.s.rr)} fill="#000" transform="translate(0 0)" />
      </g>
      <g transform={`translate(0 5) rotate(${angle})`}>
        <path d={bodyPath(g.W, g.L, g.s.rf, g.s.rr)} fill={mix(paintFor(color, skin).base, "#000000", 0.55)} />
      </g>
      <g transform={`rotate(${angle})`}>
        <VehicleTop type={type} cells={cells} color={color} skin={skin} defs={id} detail="high" />
      </g>
    </svg>
  );
}
