/**
 * Laser Maze — SVG drawing primitives for every board object.
 *
 * All pieces draw in a 100×100 cell centered on (0,0) and are positioned by
 * their parent <g>. Nothing here owns state or handlers; Board.jsx wires
 * interaction on top. `uid` prefixes gradient/filter ids so several boards
 * (gameplay + menu demo + world previews) can coexist on one page.
 */
import { memo } from "react";
import { colorOf } from "../engine/constants.js";

const PORTAL_HUES = { 1: ["#b14dff", "#3df2ff"], 2: ["#ff8a3d", "#ffe45c"], 3: ["#3dff9e", "#3d8bff"] };
export const portalColors = (pair) => PORTAL_HUES[pair] || PORTAL_HUES[1];

/* ------------------------------------------------------------------ walls */

/**
 * Walls are drawn in two passes for a 2.5D look: every wall's darker side
 * face first (offset down), then every top face. Adjacent walls are bridged
 * so runs of wall read as one structure rather than a row of tiles.
 */
export function WallLayer({ level, world, uid }) {
  const set = new Set(level.walls.map((w) => `${w.x},${w.y}`));
  const has = (x, y) => set.has(`${x},${y}`);
  const I = 5; // inset
  const shapes = level.walls.map(({ x, y }) => {
    const x0 = x * 100 + (has(x - 1, y) ? 0 : I);
    const x1 = x * 100 + 100 - (has(x + 1, y) ? 0 : I);
    const y0 = y * 100 + (has(x, y - 1) ? 0 : I);
    const y1 = y * 100 + 100 - (has(x, y + 1) ? 0 : I);
    return { x, y, x0, y0, x1, y1 };
  });
  const r = world.wall === "hedge" || world.wall === "asteroid" ? 22 : world.wall === "crystal" ? 14 : 8;
  return (
    <g className="lm-walls">
      {shapes.map((s) => (
        <rect key={`s${s.x},${s.y}`} x={s.x0} y={s.y0 + 12} width={s.x1 - s.x0} height={s.y1 - s.y0}
          rx={r} fill={`url(#${uid}-wallside)`} />
      ))}
      {shapes.map((s) => (
        <rect key={`t${s.x},${s.y}`} x={s.x0} y={s.y0} width={s.x1 - s.x0} height={s.y1 - s.y0}
          rx={r} fill={`url(#${uid}-walltop)`} stroke={`url(#${uid}-walledge)`} strokeWidth="2" />
      ))}
      {shapes.map((s) => (
        <g key={`d${s.x},${s.y}`} transform={`translate(${s.x * 100 + 50} ${s.y * 100 + 50})`}>
          <WallDetail style={world.wall} world={world} seed={s.x * 7 + s.y * 13} />
        </g>
      ))}
    </g>
  );
}

export function wallGradients(world, uid) {
  const W = {
    lab: ["#24476e", "#132a47", "#0a1a2e", "#5fd8ff"],
    crystal: ["#3a2c5c", "#231a3c", "#130d22", "#b58cff"],
    hedge: ["#2f7a4a", "#1d5233", "#0e2c1b", "#8ff0b0"],
    stone: ["#8a7048", "#5f4b2d", "#33271a", "#ffd88a"],
    glass: ["#5a5696", "#3a3670", "#1e1b3e", "#ffffff"],
    ice: ["#b9e6ff", "#6fb4d9", "#2c5f80", "#ffffff"],
    circuit: ["#2a2a44", "#1a1a2d", "#0c0c16", "#ff2bd6"],
    obsidian: ["#2c1f48", "#1a1030", "#0b0616", "#b14dff"],
    brass: ["#c08a3e", "#8a5e25", "#4a3013", "#ffe0a0"],
    asteroid: ["#4b4868", "#2e2c48", "#16152a", "#9fb4ff"],
  }[world.wall];
  return (
    <>
      <linearGradient id={`${uid}-walltop`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={W[0]} />
        <stop offset="1" stopColor={W[1]} />
      </linearGradient>
      <linearGradient id={`${uid}-wallside`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={W[2]} />
        <stop offset="1" stopColor="#000" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id={`${uid}-walledge`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={W[3]} stopOpacity="0.55" />
        <stop offset="0.5" stopColor={W[3]} stopOpacity="0.08" />
        <stop offset="1" stopColor={W[3]} stopOpacity="0.3" />
      </linearGradient>
    </>
  );
}

function WallDetail({ style, world, seed }) {
  const a = world.accent;
  const v = seed % 3;
  switch (style) {
    case "lab":
      return (
        <g opacity="0.9">
          <rect x="-30" y="-30" width="60" height="60" rx="6" fill="none" stroke={a} strokeOpacity="0.18" />
          {[[-30, -30], [30, -30], [-30, 30], [30, 30]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.6" fill="#8fb6d9" opacity="0.55" />
          ))}
          <path d="M-22 -8 H22" stroke={a} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "crystal":
      return (
        <g>
          <path d={v === 0 ? "M-18 22 L-8 -26 L4 20 Z" : v === 1 ? "M-4 24 L8 -22 L20 22 Z" : "M-24 20 L-14 -10 L-4 22 Z"}
            fill="#b58cff" opacity="0.55" />
          <path d={v === 0 ? "M6 24 L16 -8 L26 22 Z" : v === 1 ? "M-24 22 L-14 -4 L-6 22 Z" : "M2 22 L12 -24 L24 22 Z"}
            fill="#6fd6ff" opacity="0.5" />
          <path d="M-8 -26 L-4 20" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
        </g>
      );
    case "hedge":
      return (
        <g>
          {[[-18, -14, 16], [12, -18, 15], [-4, 6, 19], [20, 12, 14], [-22, 18, 12]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#3c9460" opacity="0.55" />
          ))}
          {[[-12, -20], [16, 4], [-20, 14], [6, 22]].slice(0, 2 + v).map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              {[0, 72, 144, 216, 288].map((r) => (
                <ellipse key={r} rx="3" ry="5.5" cy="-4" transform={`rotate(${r})`} fill={i % 2 ? "#ffd1ec" : "#ff7ac6"} />
              ))}
              <circle r="2.5" fill="#ffe86b" />
            </g>
          ))}
        </g>
      );
    case "stone":
      return (
        <g>
          <rect x="-34" y="-34" width="68" height="68" rx="4" fill="none" stroke="#2a1f10" strokeOpacity="0.5" strokeWidth="3" />
          <path d={["M-14 -16 L0 -24 L14 -16 L14 8 L0 18 L-14 8 Z", "M-16 -8 H16 M0 -22 V20 M-10 14 L10 -16", "M-12 -18 A 16 16 0 1 0 12 -18 M0 -8 V14"][v]}
            fill="none" stroke="#ffc35a" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "glass":
      return (
        <g>
          <path d="M-36 -36 L0 -8 L36 -36 M0 -8 L0 36 M-36 36 L0 -8 L36 36" stroke="#fff" strokeOpacity="0.16" strokeWidth="2" fill="none" />
          <path d="M-30 -30 L-6 -30 L-30 -6 Z" fill="#fff" opacity="0.18" />
          <rect x="-36" y="-36" width="72" height="72" fill="url(#rainbowSheen)" opacity="0.18" />
        </g>
      );
    case "ice":
      return (
        <g>
          <path d="M-40 -30 Q-20 -40 0 -32 T40 -30 L40 -40 L-40 -40 Z" fill="#fff" opacity="0.85" />
          <path d={["M-14 -6 L-2 8 L-10 22 M-2 8 L14 12", "M10 -10 L0 6 L8 24 M0 6 L-14 14", "M-18 0 L0 -4 L16 10 M0 -4 L4 -18"][v]}
            stroke="#fff" strokeOpacity="0.6" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case "circuit":
      return (
        <g>
          <path d={["M-30 -14 H-6 L6 -2 H30", "M-30 10 H-10 L2 -2 V-30", "M-14 30 V10 L0 -4 H30"][v]}
            stroke="#2bffe9" strokeOpacity="0.4" strokeWidth="2.5" fill="none" />
          <circle cx={v === 1 ? 2 : 6} cy={v === 1 ? -30 : -2} r="3.5" fill="#2bffe9" opacity="0.7" />
          <rect x="-36" y="26" width="72" height="4" rx="2" fill="#ff2bd6" opacity="0.8" />
        </g>
      );
    case "obsidian":
      return (
        <g>
          <path d="M-30 -20 L-6 -34 L28 -18 L34 14 L6 34 L-28 22 Z" fill="#000" opacity="0.35" />
          <path d="M-6 -34 L0 0 L34 14 M0 0 L-28 22" stroke="#b14dff" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
        </g>
      );
    case "brass":
      return (
        <g>
          <g opacity="0.55">
            <circle r="17" fill="none" stroke="#3a220b" strokeWidth="7" strokeDasharray="6 5" />
            <circle r="9" fill="#3a220b" />
            <circle r="4" fill="#ffd08a" />
          </g>
          {[[-34, -34], [34, -34], [-34, 34], [34, 34]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.2" fill="#ffe0a0" opacity="0.7" />
          ))}
        </g>
      );
    case "asteroid":
      return (
        <g>
          <circle cx={v * 6 - 10} cy="-10" r="8" fill="#000" opacity="0.28" />
          <circle cx="14" cy={12 - v * 4} r="5" fill="#000" opacity="0.25" />
          <circle cx="-16" cy="16" r="3.5" fill="#000" opacity="0.22" />
          <circle cx="20" cy="-22" r="1.6" fill="#fff" opacity="0.8" />
        </g>
      );
    default:
      return null;
  }
}

/* ----------------------------------------------------------------- source */

export const Source = memo(function Source({ d, c, uid, active = true }) {
  const col = colorOf(c);
  return (
    <g transform={`rotate(${(d - 1) * 90})`}>
      <ellipse cx="2" cy="16" rx="36" ry="12" fill="#000" opacity="0.35" />
      {/* housing */}
      <rect x="-36" y="-26" width="46" height="52" rx="14" fill={`url(#${uid}-metal)`} stroke="#ffffff" strokeOpacity="0.14" strokeWidth="2" />
      <rect x="-30" y="-19" width="12" height="38" rx="5" fill={col.hex} opacity="0.85" />
      <rect x="-30" y="-19" width="12" height="38" rx="5" fill="url(#lmShine)" opacity="0.5" />
      {/* barrel */}
      <rect x="2" y="-13" width="32" height="26" rx="6" fill={`url(#${uid}-metal)`} stroke="#ffffff" strokeOpacity="0.12" />
      <rect x="30" y="-16" width="10" height="32" rx="4" fill="#1a2233" stroke={col.hex} strokeOpacity="0.7" strokeWidth="2" />
      {/* emission point */}
      {active && <circle cx="40" cy="0" r="16" fill={`url(#${uid}-g${c})`} className="lm-emit" />}
      <circle cx="40" cy="0" r="5.5" fill={col.core} />
    </g>
  );
});

/* ----------------------------------------------------------------- target */

export const Target = memo(function Target({ c, lit, wrong, style, uid, pulseKey }) {
  const col = colorOf(c);
  const housing = TARGET_HOUSINGS[style] || TARGET_HOUSINGS.lens;
  return (
    <g className={`lm-target${lit ? " is-lit" : ""}${wrong ? " is-wrong" : ""}`}>
      <ellipse cy="18" rx="34" ry="12" fill="#000" opacity="0.35" />
      {lit && <circle r="58" fill={`url(#${uid}-g${c})`} className="lm-target__halo" />}
      <g className="lm-target__housing">{housing(col, lit)}</g>
      <circle r="15" fill={lit ? col.core : "#0b1020"} stroke={col.hex} strokeWidth="4" />
      <circle r="15" fill={col.hex} opacity={lit ? 0.55 : 0.28} />
      {lit && <circle r="7" fill="#fff" opacity="0.95" />}
      {!lit && <circle r="5" cx="-4" cy="-5" fill="#fff" opacity="0.25" />}
      {wrong && <circle r="24" fill="none" stroke="#ffb347" strokeWidth="3" strokeDasharray="5 5" className="lm-target__wrong" />}
      {lit && <circle key={pulseKey} r="22" fill="none" stroke={col.hex} strokeWidth="4" className="lm-target__burst" />}
    </g>
  );
});

const ring = (n, r, f) => Array.from({ length: n }, (_, i) => f((360 / n) * i, i));

const TARGET_HOUSINGS = {
  lens: (col, lit) => (
    <g>
      <circle r="31" fill="#10213b" stroke="#5fd8ff" strokeOpacity="0.45" strokeWidth="3" />
      {ring(4, 31, (a) => <rect key={a} x="-4" y="-38" width="8" height="12" rx="2" fill="#5fd8ff" opacity={lit ? 0.9 : 0.35} transform={`rotate(${a + 45})`} />)}
      <circle r="23" fill="none" stroke={col.hex} strokeOpacity={lit ? 0.9 : 0.35} strokeWidth="2" />
    </g>
  ),
  geode: (col, lit) => (
    <g>
      <path d="M0 -36 L31 -18 L31 18 L0 36 L-31 18 L-31 -18 Z" fill="#231a3c" stroke="#b58cff" strokeOpacity="0.6" strokeWidth="3" />
      {ring(6, 30, (a) => <path key={a} d="M0 -34 L6 -24 L-6 -24 Z" fill={col.hex} opacity={lit ? 0.9 : 0.35} transform={`rotate(${a})`} />)}
    </g>
  ),
  bloom: (col, lit) => (
    <g>
      {ring(6, 0, (a) => <ellipse key={a} cy="-24" rx="12" ry="18" fill={lit ? col.hex : "#2f6a4a"} opacity={lit ? 0.75 : 0.9} stroke="#ff9fd6" strokeOpacity="0.5" transform={`rotate(${a})`} />)}
      <circle r="21" fill="#173a29" />
    </g>
  ),
  sun: (col, lit) => (
    <g>
      {ring(12, 0, (a) => <path key={a} d="M-4 -26 L0 -40 L4 -26 Z" fill="#ffc35a" opacity={lit ? 1 : 0.45} transform={`rotate(${a})`} />)}
      <circle r="27" fill="#3d2a10" stroke="#ffc35a" strokeWidth="4" />
    </g>
  ),
  facet: (col, lit) => (
    <g>
      <path d="M0 -38 L34 0 L0 38 L-34 0 Z" fill="#221f44" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.5" />
      <path d="M0 -38 L0 38 M-34 0 L34 0" stroke="#fff" strokeOpacity="0.15" />
      <path d="M0 -38 L34 0 L0 38 L-34 0 Z" fill="url(#rainbowSheen)" opacity={lit ? 0.5 : 0.2} />
    </g>
  ),
  snowflake: (col, lit) => (
    <g>
      {ring(6, 0, (a) => (
        <g key={a} transform={`rotate(${a})`} stroke="#dff6ff" strokeWidth="3.5" strokeLinecap="round" opacity={lit ? 1 : 0.6}>
          <path d="M0 -20 V-38 M0 -30 L-7 -36 M0 -30 L7 -36" fill="none" />
        </g>
      ))}
      <circle r="23" fill="#16324a" stroke="#9fe8ff" strokeWidth="3" />
    </g>
  ),
  node: (col, lit) => (
    <g>
      {ring(4, 0, (a) => <path key={a} d="M-12 -30 V-38 M0 -30 V-38 M12 -30 V-38" stroke="#2bffe9" strokeOpacity={lit ? 0.9 : 0.4} strokeWidth="3" transform={`rotate(${a})`} />)}
      <rect x="-30" y="-30" width="60" height="60" rx="10" fill="#15152a" stroke="#ff2bd6" strokeOpacity="0.7" strokeWidth="3" />
    </g>
  ),
  ring: (col, lit) => (
    <g>
      <circle r="32" fill="#150c28" stroke="#b14dff" strokeWidth="5" strokeOpacity="0.8" />
      <circle r="32" fill="none" stroke="#3df2ff" strokeWidth="2" strokeDasharray="10 12" className="lm-spin-slow" opacity={lit ? 1 : 0.5} />
    </g>
  ),
  dial: (col, lit) => (
    <g>
      <circle r="31" fill="#4a3013" stroke="#ffd08a" strokeWidth="9" strokeDasharray="7 5.3" opacity="0.9" />
      <circle r="25" fill="#2a1d12" stroke="#c08a3e" strokeWidth="3" />
      {ring(12, 0, (a) => <path key={a} d="M0 -21 V-17" stroke="#ffd08a" strokeWidth="2" transform={`rotate(${a})`} />)}
    </g>
  ),
  star: (col, lit) => (
    <g>
      <path d="M0 -40 L9 -9 L40 0 L9 9 L0 40 L-9 9 L-40 0 L-9 -9 Z" fill="#12123a" stroke="#7cf0ff" strokeOpacity="0.7" strokeWidth="2.5" />
      <circle r="24" fill="#0a0a22" stroke={col.hex} strokeOpacity={lit ? 0.9 : 0.4} strokeWidth="2" />
    </g>
  ),
};

/* ---------------------------------------------------------------- mirrors */

/**
 * Mirror / splitter visual. The plate's CSS rotation is derived ONLY from
 * the logical orientation ("/" = -45°, "\" = +45°), so what you see is
 * always what the tracer uses; the transition just animates between them.
 */
export function MirrorBody({ o, kind = "mirror", variant = "rotatable", world, uid, reducedMotion }) {
  const angle = o === "/" ? -45 : 45;
  const isSplit = kind === "splitter";
  return (
    <g>
      <ellipse cy="16" rx="30" ry="10" fill="#000" opacity="0.3" />
      <circle r="30" fill={`url(#${uid}-pedestal)`} stroke="#fff" strokeOpacity="0.1" strokeWidth="2" />
      {variant === "rotatable" && (
        <g className="lm-mirror__ring">
          <circle r="34" fill="none" stroke={world.accent} strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="16 10" />
          <path d="M24 -30 l8 4 l-9 3" fill="none" stroke={world.accent} strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {variant === "fixed" && [[-20, -20], [20, -20], [-20, 20], [20, 20]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#6b7890" />
      ))}
      {variant === "movable" && (
        <g className="lm-mirror__ring" stroke="#e8fbff" strokeOpacity="0.7" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle r="34" strokeOpacity="0.35" />
          {[0, 90, 180, 270].map((a) => <path key={a} d="M-5 -38 L0 -44 L5 -38" transform={`rotate(${a})`} />)}
        </g>
      )}
      {variant === "geared" && (
        <circle r="33" fill="none" stroke="#c08a3e" strokeWidth="8" strokeDasharray="6 5" opacity="0.85" />
      )}
      <g className="lm-mirror__plate" style={{ transform: `rotate(${angle}deg)`, transition: reducedMotion ? "none" : undefined }}>
        <rect x="-44" y="-7" width="88" height="14" rx="5"
          fill={isSplit ? `url(#${uid}-splitter)` : `url(#${uid}-mirror)`}
          stroke={isSplit ? world.accent2 : "#ffffff"} strokeOpacity={isSplit ? 0.9 : 0.55} strokeWidth="2" />
        {isSplit ? (
          <path d="M-38 0 H38" stroke="#fff" strokeWidth="2" strokeDasharray="4 5" opacity="0.8" />
        ) : (
          <path d="M-38 -2.5 H38" stroke="#fff" strokeWidth="2" opacity="0.85" strokeLinecap="round" />
        )}
      </g>
      <circle r="6" fill="#1b2336" stroke="#fff" strokeOpacity="0.3" />
    </g>
  );
}

/* ------------------------------------------------------------- mechanisms */

export function Prism({ uid }) {
  return (
    <g>
      <ellipse cy="20" rx="32" ry="10" fill="#000" opacity="0.3" />
      <path d="M0 -34 L32 24 L-32 24 Z" fill={`url(#${uid}-prism)`} stroke="#fff" strokeOpacity="0.8" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M0 -34 L0 24 M0 -34 L-10 24" stroke="#fff" strokeOpacity="0.25" />
      <path d="M-24 18 H24" stroke="url(#rainbowSheen)" strokeWidth="4" opacity="0.9" />
      <g opacity="0.95" fontSize="10" fontWeight="800" textAnchor="middle">
        <circle cx="-26" cy="-26" r="5" fill={colorOf(1).hex} />
        <circle cx="0" cy="-44" r="5" fill={colorOf(2).hex} />
        <circle cx="26" cy="-26" r="5" fill={colorOf(4).hex} />
      </g>
    </g>
  );
}

export function Filter({ c }) {
  const col = colorOf(c);
  return (
    <g>
      <rect x="-30" y="-30" width="60" height="60" rx="10" fill="#0c0c18" stroke={col.hex} strokeWidth="3" />
      <rect x="-22" y="-22" width="44" height="44" rx="6" fill={col.hex} opacity="0.42" />
      <path d="M-18 -14 L-8 -22 M-18 -2 L4 -22" stroke="#fff" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      {[[-30, 0], [30, 0], [0, -30], [0, 30]].map(([x, y], i) => (
        <rect key={i} x={x - 4} y={y - 4} width="8" height="8" rx="2" fill={col.hex} />
      ))}
    </g>
  );
}

export function Portal({ pair, uid, active }) {
  const [a, b] = portalColors(pair);
  return (
    <g className={active ? "lm-portal is-active" : "lm-portal"}>
      <ellipse cy="18" rx="34" ry="11" fill="#000" opacity="0.35" />
      <circle r="36" fill={`url(#${uid}-portal${pair})`} />
      <circle r="33" fill="none" stroke={a} strokeWidth="5" />
      <g className="lm-spin">
        <circle r="25" fill="none" stroke={b} strokeWidth="3" strokeDasharray="14 9" />
        <circle r="15" fill="none" stroke={a} strokeWidth="2" strokeDasharray="6 7" />
      </g>
      <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" opacity="0.8">{pair}</text>
    </g>
  );
}

export function Switch({ on, world, id }) {
  return (
    <g className={on ? "lm-switch is-on" : "lm-switch"}>
      <rect x="-32" y="-32" width="64" height="64" rx="12" fill="#1a140a" stroke={on ? "#ffe3a3" : "#6b5227"} strokeWidth="3" />
      <path d="M0 -22 L19 0 L0 22 L-19 0 Z" fill={on ? "#ffc35a" : "#3d2a10"} stroke="#ffc35a" strokeOpacity={on ? 1 : 0.5} strokeWidth="2.5" />
      <text y="5" textAnchor="middle" fontSize="14" fontWeight="900" fill={on ? "#3d2a10" : "#ffc35a"}>{id}</text>
      {on && <circle r="40" fill="none" stroke={world.accent} strokeOpacity="0.6" strokeWidth="2" className="lm-ping" />}
    </g>
  );
}

/** Portcullis grate — reads as a barrier from any beam direction; when its
 *  switch is lit the grate sinks into the floor and only the frame remains. */
export function Gate({ open, id }) {
  return (
    <g className={open ? "lm-gate is-open" : "lm-gate"}>
      <rect x="-44" y="-44" width="88" height="88" rx="10" fill="#0c0905" opacity="0.6" />
      <rect x="-44" y="-44" width="88" height="88" rx="10" fill="none" stroke="#8a6424" strokeWidth="5" />
      <g className="lm-gate__bars">
        {[-24, 0, 24].map((v) => (
          <g key={v}>
            <rect x={v - 5} y="-38" width="10" height="76" rx="3" fill="url(#lmGold)" stroke="#2a1f10" strokeWidth="1.5" />
            <rect x="-38" y={v - 4} width="76" height="8" rx="3" fill="url(#lmGold)" stroke="#2a1f10" strokeWidth="1.5" opacity="0.9" />
          </g>
        ))}
      </g>
      <circle cx="31" cy="-31" r="9" fill="#1a140a" stroke="#ffc35a" strokeWidth="2" />
      <text x="31" y="-27" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffe3a3">{id}</text>
    </g>
  );
}

export function Slot({ active }) {
  return (
    <g className={active ? "lm-slot is-active" : "lm-slot"}>
      <circle r="30" fill="#000" opacity="0.28" />
      {active && <circle r="34" fill="#7fe3ff" opacity="0.22" className="lm-slot__glow" />}
      <circle r="30" fill="none" stroke={active ? "#7fe3ff" : "#dff6ff"} strokeOpacity={active ? 1 : 0.4}
        strokeWidth={active ? 4 : 2.5} strokeDasharray="7 6" />
      <circle r={active ? 7 : 4} fill={active ? "#ffffff" : "#dff6ff"} opacity={active ? 0.95 : 0.5} />
    </g>
  );
}

export function Crank({ phase, phases, reducedMotion }) {
  const turn = (360 / phases) * phase;
  return (
    <g className="lm-crank">
      <ellipse cy="18" rx="34" ry="11" fill="#000" opacity="0.35" />
      <g className="lm-crank__wheel" style={{ transform: `rotate(${turn}deg)`, transition: reducedMotion ? "none" : undefined }}>
        <circle r="34" fill="#8a5e25" stroke="#ffd08a" strokeWidth="9" strokeDasharray="8 6.2" />
        <circle r="24" fill="#4a3013" stroke="#c08a3e" strokeWidth="3" />
        <rect x="-4" y="-30" width="8" height="30" rx="3" fill="#ffd08a" />
        <circle cy="-26" r="7" fill="#ffe8c2" stroke="#8a5e25" strokeWidth="2" />
        <circle r="7" fill="#ffd08a" />
      </g>
      <g className="lm-crank__pips">
        {Array.from({ length: phases }, (_, i) => (
          <circle key={i} cx={(i - (phases - 1) / 2) * 12} cy="44" r="4" fill={i === phase ? "#ffd08a" : "#4a3013"} stroke="#ffd08a" strokeWidth="1.2" />
        ))}
      </g>
    </g>
  );
}

export function Shutter({ open }) {
  return (
    <g className={open ? "lm-shutter is-open" : "lm-shutter"}>
      <rect x="-42" y="-42" width="84" height="84" rx="10" fill="#1e140b" stroke="#8a5e25" strokeWidth="3" />
      <g className="lm-shutter__blades">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <path key={a} d="M0 0 L0 -34 A34 34 0 0 1 29.4 -17 Z" fill="url(#lmBrass)" stroke="#3a220b" strokeWidth="1.5" transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r="34" fill="none" stroke="#ffd08a" strokeOpacity="0.6" strokeWidth="2" />
    </g>
  );
}
