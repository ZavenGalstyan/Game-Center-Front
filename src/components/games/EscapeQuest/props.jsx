/**
 * Escape Quest — room props. Each kind draws itself inside a local w×h box
 * (origin top-left) in the shared cartoon style: flat fills, a dark rounded
 * outline, one highlight and one shade. `open` is the hotspot's opened state
 * (drawer pulled out, chest lid up, door ajar…); `p` carries per-level
 * parameters (colours, picture, clock time, painted marks…).
 *
 * Marks (`p.mark`, or `p.inside` once open) are how clues get painted onto
 * the room itself — a digit on a vase, a glyph inside a cupboard.
 */
import { Glyph, Arrow, COLORS } from "./glyphs.jsx";
import { ItemIcon, OL, shade } from "./icons.jsx";
import { PICS } from "./pics.jsx";
import { K2 } from "./props2.jsx";

const S = { stroke: OL, strokeWidth: 3.5, strokeLinejoin: "round", strokeLinecap: "round" };
const col = (c, d) => COLORS[c] || c || d;

function Shadow({ w, h, k = 0.9 }) {
  return <ellipse cx={w / 2} cy={h - 2} rx={(w / 2) * k} ry={Math.max(5, w * 0.06)} fill="#000" opacity="0.18" />;
}

function Knob({ x, y, r = 5, c = "#f5c542" }) {
  return <circle cx={x} cy={y} r={r} fill={c} {...S} strokeWidth="2.5" />;
}

function Keyhole({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="9" fill="#f5c542" {...S} strokeWidth="2.5" />
      <circle cy="-2" r="3" fill={OL} />
      <path d="M-2 0 H2 L3 6 H-3 Z" fill={OL} />
    </g>
  );
}

function Wood({ x, y, w, h, c }) {
  const lines = [];
  for (let i = 1; i < 4; i++) lines.push(<path key={i} d={`M${x + 6} ${y + (h * i) / 4} q${w * 0.25} -4 ${w * 0.5} 0 t${w * 0.4} 0`} stroke={shade(c, -0.12)} strokeWidth="2" fill="none" />);
  return <g opacity="0.6">{lines}</g>;
}

/** Text / glyph / sequence marks painted onto a prop. */
export function Mark({ m, w, h }) {
  if (!m) return null;
  const x = (m.at ? m.at[0] : 0.5) * w;
  const y = (m.at ? m.at[1] : 0.5) * h;
  const size = m.size || Math.min(w, h) * 0.35;
  const c = col(m.c, OL);
  if (m.t != null)
    return (
      <text x={x} y={y + size * 0.36} textAnchor="middle" fontSize={size} fontWeight="900" fill={c} stroke={m.c === "white" ? OL : "none"} strokeWidth="1.5" fontFamily="'Trebuchet MS', Verdana, sans-serif" opacity={m.o || 1}>
        {m.t}
      </text>
    );
  if (m.g) return <Glyph name={m.g} x={x} y={y} size={size} c={c} sw={1.5} />;
  if (m.arrow) return <Arrow dir={m.arrow} x={x} y={y} size={size} c={c} />;
  if (m.seq) {
    const gap = size * 1.15;
    const x0 = x - ((m.seq.length - 1) * gap) / 2;
    return (
      <g>
        {m.seq.map((s, i) =>
          COLORS[s] ? (
            <circle key={i} cx={x0 + i * gap} cy={y} r={size * 0.45} fill={COLORS[s]} {...S} strokeWidth="2" />
          ) : s.length === 1 && "UDLR".includes(s) ? (
            <Arrow key={i} dir={s} x={x0 + i * gap} y={y} size={size} c="#f7d23e" />
          ) : (
            <Glyph key={i} name={s} x={x0 + i * gap} y={y} size={size} c={m.c ? c : "#f7d23e"} sw={1.5} />
          ),
        )}
      </g>
    );
  }
  return null;
}

function Frame({ w, h, c, pic, open, bare }) {
  const f = Math.max(8, Math.min(w, h) * 0.1);
  const Pic = PICS[pic] || PICS.landscape;
  return (
    <g transform={open ? `translate(${w * 0.55} ${h * 0.12}) rotate(12)` : undefined} style={{ transition: "transform .5s" }}>
      <rect x="4" y="6" width={w} height={h} rx="4" fill="#000" opacity="0.15" />
      <rect width={w} height={h} rx="4" fill={c} {...S} />
      <rect x={f * 0.35} y={f * 0.35} width={w - f * 0.7} height={h - f * 0.7} rx="2" fill="none" stroke={shade(c, 0.2)} strokeWidth="2" />
      <svg x={f} y={f} width={w - 2 * f} height={h - 2 * f} overflow="hidden">
        {!bare && Pic(w - 2 * f, h - 2 * f)}
      </svg>
      <rect x={f} y={f} width={w - 2 * f} height={h - 2 * f} fill="none" {...S} strokeWidth="2.5" />
    </g>
  );
}

function Screen({ w, h, text, on, c = "#39e08a" }) {
  return (
    <g>
      <rect width={w} height={h} rx="4" fill={on ? "#0f2a24" : "#1d2229"} {...S} strokeWidth="2.5" />
      {on && text && (
        <text x={w / 2} y={h / 2 + Math.min(h * 0.18, 14)} textAnchor="middle" fontSize={Math.min(h * 0.45, 30)} fill={c} fontFamily="'Courier New', monospace" fontWeight="700">
          {text}
        </text>
      )}
      {!on && <path d={`M${w * 0.15} ${h * 0.2} L${w * 0.3} ${h * 0.2}`} stroke="#fff3" strokeWidth="4" />}
    </g>
  );
}

const K = {
  door({ w, h, open, p }) {
    const c = col(p.c, "#b8733f");
    const v = p.variant || "wood";
    const arch = v === "arch" || v === "hut";
    const outline = arch ? `M0 ${h} V${w * 0.5} Q0 0 ${w / 2} 0 Q${w} 0 ${w} ${w * 0.5} V${h} Z` : `M0 ${h} V0 H${w} V${h} Z`;
    const glow = p.glow || "#fff7c9";
    return (
      <g>
        <path d={outline} transform={`translate(-10 -10) scale(${(w + 20) / w} ${(h + 10) / h})`} fill={v === "metal" || v === "vault" ? "#5d6b7a" : shade(c, -0.25)} {...S} />
        <path d={outline} fill={open ? glow : "#2b2033"} {...S} />
        {open && (
          <g>
            <path d={outline} fill={`url(#eq-doorglow)`} />
            <path d={`M0 ${h} V${arch ? w * 0.5 : 0} L${-w * 0.18} ${arch ? w * 0.42 : -6} V${h + 8} Z`} fill={c} {...S} />
          </g>
        )}
        {!open && (
          <g>
            <path d={outline} fill={c} {...S} />
            {v === "wood" && (
              <g fill="none" stroke={shade(c, -0.2)} strokeWidth="3">
                <rect x={w * 0.14} y={h * 0.08} width={w * 0.72} height={h * 0.36} rx="4" />
                <rect x={w * 0.14} y={h * 0.52} width={w * 0.72} height={h * 0.4} rx="4" />
              </g>
            )}
            {v === "metal" && (
              <g>
                <rect x={w * 0.1} y={h * 0.08} width={w * 0.8} height={h * 0.2} rx="4" fill="#9fd8f0" opacity="0.65" {...S} strokeWidth="2" />
                <path d={`M${w * 0.1} ${h * 0.45} H${w * 0.9} M${w * 0.1} ${h * 0.7} H${w * 0.9}`} stroke={shade(c, -0.25)} strokeWidth="3" />
                <path d={`M0 ${h * 0.93} H${w}`} stroke="#f7d23e" strokeWidth="10" strokeDasharray="12 12" />
              </g>
            )}
            {v === "vault" && (
              <g>
                <circle cx={w / 2} cy={h * 0.48} r={w * 0.3} fill={shade(c, -0.1)} {...S} />
                {[0, 60, 120].map((a) => (
                  <rect key={a} x={w / 2 - 4} y={h * 0.48 - w * 0.26} width="8" height={w * 0.52} rx="3" fill="#c9d3dd" {...S} strokeWidth="2" transform={`rotate(${a} ${w / 2} ${h * 0.48})`} />
                ))}
                <circle cx={w / 2} cy={h * 0.48} r="10" fill="#f5c542" {...S} strokeWidth="2.5" />
              </g>
            )}
            {(v === "arch" || v === "hut") && (
              <g stroke={shade(c, -0.22)} strokeWidth="3">
                {[0.25, 0.5, 0.75].map((f) => (
                  <path key={f} d={`M${w * f} ${f === 0.5 ? 4 : w * 0.12} V${h}`} />
                ))}
                {v === "arch" && <path d={`M0 ${h * 0.35} H${w} M0 ${h * 0.75} H${w}`} stroke="#5d6b7a" strokeWidth="9" />}
              </g>
            )}
            {v === "gate" && (
              <g stroke="#3b3f46" strokeWidth="6">
                {[0.15, 0.32, 0.5, 0.68, 0.85].map((f) => (
                  <path key={f} d={`M${w * f} 0 V${h}`} />
                ))}
              </g>
            )}
            {v !== "vault" && v !== "gate" && <Knob x={w * 0.82} y={h * 0.55} r={7} />}
            {p.keyhole && <Keyhole x={w * 0.82} y={h * 0.63} />}
            {p.sign && (
              <g>
                <rect x={w * 0.2} y={h * 0.18} width={w * 0.6} height={h * 0.12} rx="4" fill="#47c06a" {...S} strokeWidth="2" />
                <text x={w / 2} y={h * 0.27} textAnchor="middle" fontSize={h * 0.075} fontWeight="900" fill="#fff">
                  EXIT
                </text>
              </g>
            )}
          </g>
        )}
      </g>
    );
  },

  drawer({ w, h, open, p }) {
    const c = col(p.c, "#c98a54");
    return (
      <g>
        {open ? (
          <g>
            <rect x="-2" y="-2" width={w + 4} height={h + 4} fill="#2b2033" />
            <path d={`M-6 ${h * 0.35} H${w + 6} L${w + 14} ${h + 14} H-14 Z`} fill={shade(c, -0.3)} {...S} />
            <rect x="-14" y={h + 2} width={w + 28} height={h * 0.75} rx="3" fill={c} {...S} />
            <Knob x={w / 2} y={h + 2 + h * 0.37} />
          </g>
        ) : (
          <g>
            <rect width={w} height={h} rx="3" fill={c} {...S} />
            <rect x="5" y="5" width={w - 10} height={h - 10} rx="2" fill="none" stroke={shade(c, -0.15)} strokeWidth="2" />
            <Knob x={w / 2} y={h / 2} />
            {p.keyhole && <Keyhole x={w / 2} y={h / 2 + 12} s={0.7} />}
          </g>
        )}
      </g>
    );
  },

  dresser({ w, h, p }) {
    const c = col(p.c, "#c98a54");
    const n = p.n || 3;
    const top = h * 0.08;
    const dh = (h - top - 20) / n;
    return (
      <g>
        <Shadow w={w} h={h + 6} />
        <rect x="-6" width={w + 12} height={top} rx="3" fill={shade(c, 0.08)} {...S} />
        <rect y={top} width={w} height={h - top - 8} fill={shade(c, -0.12)} {...S} />
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <rect x="8" y={top + 6 + i * dh} width={w - 16} height={dh - 8} rx="3" fill={c} {...S} strokeWidth="2.5" />
            <Knob x={w / 2} y={top + 6 + i * dh + (dh - 8) / 2} r={4} />
          </g>
        ))}
        <rect x="6" y={h - 10} width="12" height="10" fill={shade(c, -0.3)} {...S} strokeWidth="2" />
        <rect x={w - 18} y={h - 10} width="12" height="10" fill={shade(c, -0.3)} {...S} strokeWidth="2" />
      </g>
    );
  },

  cabinet({ w, h, open, p }) {
    const c = col(p.c, "#7fb8d8");
    return (
      <g>
        {p.floor !== false && <Shadow w={w} h={h + 6} />}
        <rect width={w} height={h} rx="4" fill={shade(c, -0.15)} {...S} />
        {open ? (
          <g>
            <rect x="8" y="8" width={w - 16} height={h - 16} fill="#3a2c3e" {...S} strokeWidth="2.5" />
            <path d={`M8 ${h * 0.5} H${w - 8}`} stroke={shade(c, -0.3)} strokeWidth="5" />
            <path d={`M8 8 L-${w * 0.18} 0 V${h} L8 ${h - 8} Z`} fill={c} {...S} />
            <path d={`M${w - 8} 8 L${w + w * 0.18} 0 V${h} L${w - 8} ${h - 8} Z`} fill={c} {...S} />
          </g>
        ) : (
          <g>
            <rect x="8" y="8" width={w / 2 - 10} height={h - 16} rx="3" fill={c} {...S} strokeWidth="2.5" />
            <rect x={w / 2 + 2} y="8" width={w / 2 - 10} height={h - 16} rx="3" fill={c} {...S} strokeWidth="2.5" />
            <Knob x={w / 2 - 9} y={h / 2} r={4} />
            <Knob x={w / 2 + 9} y={h / 2} r={4} />
            {p.keyhole && <Keyhole x={w / 2} y={h / 2 + 18} s={0.7} />}
          </g>
        )}
      </g>
    );
  },

  safe({ w, h, open, p }) {
    const c = col(p.c, "#6f7f92");
    return (
      <g>
        {p.floor !== false && <Shadow w={w} h={h + 6} />}
        <rect width={w} height={h} rx="8" fill={shade(c, -0.15)} {...S} />
        {open ? (
          <g>
            <rect x="10" y="10" width={w - 20} height={h - 20} rx="4" fill="#1d1a26" {...S} />
            <path d={`M10 10 L${-w * 0.35} ${h * 0.08} V${h * 0.92} L10 ${h - 10} Z`} fill={c} {...S} />
          </g>
        ) : (
          <g>
            <rect x="10" y="10" width={w - 20} height={h - 20} rx="5" fill={c} {...S} />
            {p.face === "keypad" ? (
              <g transform={`translate(${w / 2 - 18} ${h / 2 - 24})`}>
                <rect width="36" height="48" rx="4" fill="#2b2f36" {...S} strokeWidth="2" />
                <rect x="5" y="5" width="26" height="9" rx="2" fill="#39e08a" />
                {[0, 1, 2].map((r) => [0, 1, 2].map((q) => <rect key={`${r}${q}`} x={6 + q * 9} y={19 + r * 9} width="6" height="6" rx="1.5" fill="#c9d3dd" />))}
              </g>
            ) : (
              <g>
                <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.2} fill="#c9d3dd" {...S} />
                <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.07} fill={shade(c, -0.2)} {...S} strokeWidth="2" />
                {Array.from({ length: 12 }, (_, i) => (
                  <path key={i} d={`M${w / 2} ${h / 2 - Math.min(w, h) * 0.2} v6`} stroke={OL} strokeWidth="2" transform={`rotate(${i * 30} ${w / 2} ${h / 2})`} />
                ))}
              </g>
            )}
            <rect x={w - 20} y={h * 0.35} width="6" height={h * 0.3} rx="3" fill="#c9d3dd" {...S} strokeWidth="2" />
          </g>
        )}
      </g>
    );
  },

  chest({ w, h, open, p }) {
    const c = col(p.c, "#b8733f");
    const lid = h * 0.4;
    return (
      <g>
        <Shadow w={w} h={h + 6} />
        <rect y={lid} width={w} height={h - lid} rx="5" fill={c} {...S} />
        <Wood x={0} y={lid} w={w} h={h - lid} c={c} />
        <rect x={w * 0.12} y={lid} width={w * 0.08} height={h - lid} fill="#f5c542" {...S} strokeWidth="2.5" />
        <rect x={w * 0.8} y={lid} width={w * 0.08} height={h - lid} fill="#f5c542" {...S} strokeWidth="2.5" />
        {open ? (
          <g>
            <path d={`M0 ${lid} Q${w / 2} ${lid - 16} ${w} ${lid}`} fill="#2b2033" {...S} />
            <path d={`M0 ${lid} L${w * 0.04} ${lid - h * 0.75} Q${w / 2} ${lid - h * 0.95} ${w * 0.96} ${lid - h * 0.75} L${w} ${lid} Z`} fill={shade(c, -0.15)} {...S} />
            <path d={`M${w * 0.2} ${lid - 4} Q${w / 2} ${lid - 30} ${w * 0.8} ${lid - 4}`} fill="#f7d23e" opacity="0.7" />
          </g>
        ) : (
          <g>
            <path d={`M0 ${lid} V${lid * 0.45} Q${w / 2} ${-lid * 0.25} ${w} ${lid * 0.45} V${lid} Z`} fill={shade(c, 0.06)} {...S} />
            <path d={`M${w * 0.12} ${lid} V${lid * 0.3} M${w * 0.88} ${lid} V${lid * 0.3}`} stroke="#f5c542" strokeWidth="8" />
            <rect x={w / 2 - 12} y={lid - 10} width="24" height="26" rx="4" fill="#f5c542" {...S} strokeWidth="2.5" />
            <circle cx={w / 2} cy={lid + 2} r="3.5" fill={OL} />
          </g>
        )}
      </g>
    );
  },

  box({ w, h, open, p }) {
    const c = col(p.c, "#e86b8f");
    const lid = h * 0.32;
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect y={lid} width={w} height={h - lid} rx="4" fill={c} {...S} />
        <path d={`M${w * 0.1} ${lid + 6} H${w * 0.9}`} stroke={shade(c, 0.25)} strokeWidth="3" />
        {open ? (
          <path d={`M2 ${lid} L${w * 0.08} ${lid - h * 0.55} H${w * 0.92} L${w - 2} ${lid} Z`} fill={shade(c, -0.18)} {...S} />
        ) : (
          <g>
            <rect x="-4" width={w + 8} height={lid} rx="4" fill={shade(c, 0.08)} {...S} />
            {p.lock !== false && <rect x={w / 2 - 8} y={lid - 6} width="16" height="16" rx="3" fill="#f5c542" {...S} strokeWidth="2.5" />}
            {p.dial && <circle cx={w / 2} cy={lid + (h - lid) / 2 + 4} r="7" fill="#c9d3dd" {...S} strokeWidth="2" />}
          </g>
        )}
      </g>
    );
  },

  painting({ w, h, open, p }) {
    return <Frame w={w} h={h} c={col(p.c, "#d9a54a")} pic={p.pic} open={open && p.swing} bare={p.bare} />;
  },

  clock({ w, h, open, p }) {
    const r = Math.min(w, h) / 2;
    const [hh, mm] = (open && p.timeOpen) || p.time || [3, 0];
    const c = col(p.c, "#e8504f");
    const ha = ((hh % 12) + mm / 60) * 30;
    const ma = mm * 6;
    return (
      <g transform={`translate(${w / 2} ${h / 2})`}>
        <circle r={r} fill={c} {...S} />
        <circle r={r * 0.82} fill="#fffaf0" {...S} strokeWidth="2.5" />
        {Array.from({ length: 12 }, (_, i) => (
          (!p.numbers || i % 3) && <circle key={i} cx={0} cy={-r * 0.68} r={i % 3 === 0 ? 3.2 : 1.8} fill={OL} transform={`rotate(${i * 30})`} />
        ))}
        {p.numbers &&
          [12, 3, 6, 9].map((n, i) => (
            <text key={n} x={Math.sin((i * Math.PI) / 2) * r * 0.55} y={-Math.cos((i * Math.PI) / 2) * r * 0.55 + 5} textAnchor="middle" fontSize={r * 0.28} fontWeight="800" fill={OL}>
              {n}
            </text>
          ))}
        <path d={`M0 0 V${-r * 0.42}`} stroke={OL} strokeWidth="5" strokeLinecap="round" transform={`rotate(${ha})`} />
        <path d={`M0 0 V${-r * 0.64}`} stroke={OL} strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${ma})`} />
        <circle r="4" fill="#f5c542" {...S} strokeWidth="2" />
      </g>
    );
  },

  plant({ w, h, open, p }) {
    const c = col(p.c, "#e8774f");
    const potH = h * 0.36;
    const v = p.variant || "fern";
    const tipped = open && p.tip;
    return (
      <g transform={tipped ? `rotate(-14 ${w / 2} ${h})` : undefined}>
        <Shadow w={w} h={h + 4} k={0.7} />
        {v === "cactus" ? (
          <g>
            <path d={`M${w * 0.4} ${h - potH} V${h * 0.15} Q${w * 0.5} ${h * 0.02} ${w * 0.6} ${h * 0.15} V${h - potH} Z`} fill="#47c06a" {...S} />
            <path d={`M${w * 0.4} ${h * 0.45} H${w * 0.25} V${h * 0.3}`} fill="none" stroke={OL} strokeWidth="13" strokeLinecap="round" />
            <path d={`M${w * 0.4} ${h * 0.45} H${w * 0.25} V${h * 0.3}`} fill="none" stroke="#47c06a" strokeWidth="7" strokeLinecap="round" />
            <path d={`M${w * 0.6} ${h * 0.38} H${w * 0.75} V${h * 0.24}`} fill="none" stroke={OL} strokeWidth="13" strokeLinecap="round" />
            <path d={`M${w * 0.6} ${h * 0.38} H${w * 0.75} V${h * 0.24}`} fill="none" stroke="#47c06a" strokeWidth="7" strokeLinecap="round" />
          </g>
        ) : v === "flower" ? (
          <g>
            {[-0.2, 0, 0.2].map((d, i) => (
              <g key={i}>
                <path d={`M${w / 2} ${h - potH} Q${w * (0.5 + d)} ${h * 0.5} ${w * (0.5 + d * 1.4)} ${h * (0.22 + Math.abs(d))}`} stroke="#3ea85a" strokeWidth="4" fill="none" />
                <Glyph name="flower" x={w * (0.5 + d * 1.4)} y={h * (0.2 + Math.abs(d))} size={w * 0.34} c={col((p.fc || [])[i], ["#f27ab8", "#f7d23e", "#a364e8"][i])} sw={1.5} />
              </g>
            ))}
          </g>
        ) : v === "empty" ? (
          <ellipse cx={w / 2} cy={h - potH} rx={w * 0.34} ry="6" fill="#6a4a2c" />
        ) : v === "sprout" ? (
          <g>
            <path d={`M${w / 2} ${h - potH} V${h * 0.45}`} stroke="#3ea85a" strokeWidth="5" />
            <path d={`M${w / 2} ${h * 0.5} q-22 -4 -24 -20 q18 0 24 20 M${w / 2} ${h * 0.47} q22 -4 24 -20 q-18 0 -24 20`} fill="#47c06a" {...S} strokeWidth="2.5" />
          </g>
        ) : v === "wilted" ? (
          <g>
            <path d={`M${w / 2} ${h - potH} Q${w * 0.5} ${h * 0.3} ${w * 0.3} ${h * 0.42}`} stroke="#9a8a3a" strokeWidth="5" fill="none" />
            {[-1, 1].map((d) => (
              <path key={d} d={`M${w / 2} ${h * 0.55} q${d * 20} 0 ${d * 26} ${h * 0.14} q${-d * 14} -2 ${-d * 26} ${-h * 0.14}`} fill="#b8a84a" {...S} strokeWidth="2.5" />
            ))}
            <circle cx={w * 0.3} cy={h * 0.44} r={w * 0.1} fill="#a8714a" {...S} strokeWidth="2.5" />
          </g>
        ) : (
          <g>
            {[-60, -35, -12, 12, 35, 60].map((a, i) => (
              <path key={i} d={`M${w / 2} ${h - potH} q${a * 0.25} ${-h * 0.25} ${a * 0.7} ${-h * 0.5 + Math.abs(a) * 0.5} q${-a * 0.25} ${h * 0.25} ${-a * 0.7} ${h * 0.5 - Math.abs(a) * 0.5}`} fill={i % 2 ? "#47c06a" : "#3ea85a"} {...S} strokeWidth="2.5" />
            ))}
          </g>
        )}
        <path d={`M${w * 0.15} ${h - potH} H${w * 0.85} L${w * 0.75} ${h} H${w * 0.25} Z`} fill={c} {...S} />
        <rect x={w * 0.1} y={h - potH - 6} width={w * 0.8} height="12" rx="4" fill={shade(c, 0.1)} {...S} strokeWidth="2.5" />
      </g>
    );
  },

  rug({ w, h, open, p }) {
    const c = col(p.c, "#e86b6b");
    const c2 = col(p.c2, "#f7d23e");
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={c} {...S} />
        <ellipse cx={w / 2} cy={h / 2} rx={w * 0.38} ry={h * 0.32} fill="none" stroke={c2} strokeWidth="5" strokeDasharray="14 8" />
        <ellipse cx={w / 2} cy={h / 2} rx={w * 0.18} ry={h * 0.15} fill={c2} opacity="0.8" />
        {open && <path d={`M${w * 0.62} ${h * 0.98} Q${w * 0.86} ${h * 0.95} ${w * 0.97} ${h * 0.6} Q${w * 0.7} ${h * 0.4} ${w * 0.62} ${h * 0.98} Z`} fill={shade(c, -0.25)} {...S} />}
      </g>
    );
  },

  lamp({ w, h, open, p }) {
    const on = p.on ? !open : open;
    const c = col(p.c, "#f59a3a");
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.5} />
        {on && <ellipse cx={w / 2} cy={h * 0.28} rx={w * 1.1} ry={h * 0.35} fill="url(#eq-lampglow)" />}
        <path d={`M${w / 2} ${h * 0.3} V${h - 8}`} stroke={OL} strokeWidth="6" />
        <ellipse cx={w / 2} cy={h - 6} rx={w * 0.3} ry="6" fill="#5d4a3a" {...S} strokeWidth="2.5" />
        <path d={`M${w * 0.18} ${h * 0.32} L${w * 0.3} 0 H${w * 0.7} L${w * 0.82} ${h * 0.32} Z`} fill={on ? "#ffe9a0" : c} {...S} />
      </g>
    );
  },

  window({ w, h, open, p }) {
    const sky = { day: "#9fdcf5", night: "#283070", sea: "#7fd0f0", space: "#140f33", jungle: "#9be0a6", snow: "#dff1fb", sunset: "#ffb98a" }[p.sky || "day"];
    const curt = col(p.c, "#f27ab8");
    return (
      <g>
        <rect x="-8" y="-8" width={w + 16} height={h + 16} rx="6" fill="#fff6e8" {...S} />
        <rect width={w} height={h} fill={sky} {...S} />
        {p.sky === "night" || p.sky === "space" ? (
          <g>
            <Glyph name="moon" x={w * 0.7} y={h * 0.3} size={Math.min(w, h) * 0.25} c="#f7e9a0" />
            {[0.2, 0.4, 0.55, 0.3, 0.8].map((f, i) => (
              <circle key={i} cx={w * f} cy={h * (0.2 + (i % 3) * 0.22)} r="2.2" fill="#fff" />
            ))}
          </g>
        ) : p.sky === "jungle" ? (
          <path d={`M0 ${h} V${h * 0.5} Q${w * 0.2} ${h * 0.3} ${w * 0.35} ${h * 0.55} Q${w * 0.6} ${h * 0.25} ${w} ${h * 0.5} V${h} Z`} fill="#3ea85a" />
        ) : p.sky === "sea" ? (
          <g>
            <rect y={h * 0.6} width={w} height={h * 0.4} fill="#2f7fe0" />
            <circle cx={w * 0.3} cy={h * 0.3} r={h * 0.1} fill="#f7d23e" />
          </g>
        ) : (
          <g>
            <circle cx={w * 0.72} cy={h * 0.3} r={h * 0.1} fill="#f7d23e" />
            <ellipse cx={w * 0.3} cy={h * 0.35} rx={w * 0.16} ry={h * 0.07} fill="#fff" />
            <path d={`M0 ${h} V${h * 0.75} Q${w * 0.4} ${h * 0.6} ${w} ${h * 0.78} V${h} Z`} fill="#5cc46e" />
          </g>
        )}
        <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#fff6e8" strokeWidth="7" />
        <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke={OL} strokeWidth="1.5" opacity="0.4" />
        {p.curtains !== false && (
          <g>
            <path d={`M-14 -14 H${open ? w * 0.12 : w * 0.45} Q${open ? 0 : w * 0.3} ${h * 0.5} ${open ? w * 0.06 : w * 0.4} ${h + 16} H-14 Z`} fill={curt} {...S} />
            <path d={`M${w + 14} -14 H${open ? w * 0.88 : w * 0.55} Q${open ? w : w * 0.7} ${h * 0.5} ${open ? w * 0.94 : w * 0.6} ${h + 16} H${w + 14} Z`} fill={curt} {...S} />
            <rect x="-22" y="-24" width={w + 44} height="10" rx="5" fill="#a8714a" {...S} strokeWidth="2.5" />
          </g>
        )}
      </g>
    );
  },

  bookshelf({ w, h, p }) {
    const c = col(p.c, "#a8714a");
    const rows = p.rows || 3;
    const rh = (h - 12) / rows;
    const pal = p.books || ["#ec4f4f", "#3f8ef0", "#47c06a", "#f7d23e", "#a364e8", "#f59a3a", "#3fd0e0", "#f27ab8"];
    const books = [];
    for (let r = 0; r < rows; r++) {
      let x = 10;
      let i = r * 3;
      while (x < w - 22) {
        const bw = 10 + ((i * 7) % 9);
        const bh = rh - 14 - ((i * 5) % 12);
        if ((i * 13) % 11 === 5) {
          x += 14;
          i++;
          continue;
        }
        books.push(<rect key={`${r}-${i}`} x={x} y={6 + r * rh + (rh - bh) - 4} width={bw} height={bh} rx="2" fill={pal[i % pal.length]} {...S} strokeWidth="2" />);
        x += bw + 2;
        i++;
      }
    }
    return (
      <g>
        <Shadow w={w} h={h + 6} />
        <rect width={w} height={h} rx="4" fill={c} {...S} />
        <rect x="6" y="6" width={w - 12} height={h - 12} fill={shade(c, -0.3)} />
        {books}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <rect key={r} x="4" y={2 + r * rh} width={w - 8} height="7" fill={shade(c, 0.08)} {...S} strokeWidth="2" />
        ))}
      </g>
    );
  },

  book({ w, h, open, p }) {
    const c = col(p.c, "#3f8ef0");
    return (
      <g transform={open ? `rotate(-18 ${w / 2} ${h})` : undefined}>
        <rect width={w} height={h} rx="3" fill={c} {...S} />
        <path d={`M3 ${h * 0.18} H${w - 3} M3 ${h * 0.82} H${w - 3}`} stroke="#f7d23e" strokeWidth="3" />
      </g>
    );
  },

  vase({ w, h, open, p }) {
    const c = col(p.c, "#3fb0e0");
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.6} />
        <path d={`M${w * 0.32} 0 H${w * 0.68} V${h * 0.18} Q${w} ${h * 0.4} ${w * 0.85} ${h * 0.8} Q${w * 0.75} ${h} ${w / 2} ${h} Q${w * 0.25} ${h} ${w * 0.15} ${h * 0.8} Q0 ${h * 0.4} ${w * 0.32} ${h * 0.18} Z`} fill={c} {...S} />
        <path d={`M${w * 0.25} ${h * 0.5} Q${w / 2} ${h * 0.58} ${w * 0.75} ${h * 0.5}`} stroke="#fff" strokeWidth="4" fill="none" opacity="0.7" />
        <path d={`M${w * 0.28} ${h * 0.35} Q${w * 0.22} ${h * 0.55} ${w * 0.3} ${h * 0.7}`} stroke="#fff" strokeWidth="4" fill="none" opacity="0.5" />
      </g>
    );
  },

  pillow({ w, h, open, p }) {
    const c = col(p.c, "#a364e8");
    return (
      <g transform={open ? `translate(${w * 0.3} ${-h * 0.25}) rotate(15)` : undefined}>
        <path d={`M6 6 Q${w / 2} 0 ${w - 6} 6 Q${w} ${h / 2} ${w - 6} ${h - 6} Q${w / 2} ${h} 6 ${h - 6} Q0 ${h / 2} 6 6 Z`} fill={c} {...S} />
        <path d={`M${w * 0.25} ${h * 0.3} Q${w / 2} ${h * 0.45} ${w * 0.75} ${h * 0.3}`} stroke={shade(c, 0.25)} strokeWidth="3" fill="none" />
      </g>
    );
  },

  sofa({ w, h, p }) {
    const c = col(p.c, "#3fb0a0");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect x={w * 0.08} y="0" width={w * 0.84} height={h * 0.6} rx="18" fill={shade(c, -0.08)} {...S} />
        <rect x={w * 0.06} y={h * 0.45} width={w * 0.88} height={h * 0.35} rx="12" fill={c} {...S} />
        <path d={`M${w / 2} ${h * 0.47} V${h * 0.78}`} stroke={shade(c, -0.2)} strokeWidth="3" />
        <rect x="0" y={h * 0.3} width={w * 0.13} height={h * 0.6} rx="12" fill={shade(c, 0.06)} {...S} />
        <rect x={w * 0.87} y={h * 0.3} width={w * 0.13} height={h * 0.6} rx="12" fill={shade(c, 0.06)} {...S} />
        <rect x={w * 0.1} y={h * 0.88} width="10" height={h * 0.12} fill="#5d4a3a" />
        <rect x={w * 0.88} y={h * 0.88} width="10" height={h * 0.12} fill="#5d4a3a" />
      </g>
    );
  },

  bed({ w, h, p }) {
    const c = col(p.c, "#3f8ef0");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect x="0" y="0" width={w * 0.1} height={h} rx="6" fill="#a8714a" {...S} />
        <rect x={w * 0.08} y={h * 0.42} width={w * 0.9} height={h * 0.38} rx="8" fill="#fff6e8" {...S} />
        <path d={`M${w * 0.32} ${h * 0.38} H${w * 0.98} V${h * 0.85} Q${w * 0.65} ${h * 0.95} ${w * 0.32} ${h * 0.85} Z`} fill={c} {...S} />
        <rect x={w * 0.12} y={h * 0.3} width={w * 0.2} height={h * 0.2} rx="10" fill="#fff" {...S} />
        <rect x={w * 0.92} y={h * 0.3} width={w * 0.08} height={h * 0.7} rx="4" fill="#a8714a" {...S} />
      </g>
    );
  },

  table({ w, h, p }) {
    const c = col(p.c, "#c98a54");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect x={w * 0.08} y="10" width="12" height={h - 10} fill={shade(c, -0.2)} {...S} strokeWidth="2.5" />
        <rect x={w * 0.92 - 12} y="10" width="12" height={h - 10} fill={shade(c, -0.2)} {...S} strokeWidth="2.5" />
        <rect x="0" y="0" width={w} height="16" rx="4" fill={c} {...S} />
        {p.cloth && <path d={`M0 6 H${w} L${w * 0.95} ${h * 0.4} Q${w / 2} ${h * 0.48} ${w * 0.05} ${h * 0.4} Z`} fill={col(p.cloth)} {...S} strokeWidth="2.5" />}
      </g>
    );
  },

  desk({ w, h, p }) {
    const c = col(p.c, "#a8714a");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect x="6" y="14" width={w * 0.38} height={h - 14} fill={shade(c, -0.12)} {...S} />
        <rect x={w - 14} y="14" width="10" height={h - 14} fill={shade(c, -0.2)} {...S} strokeWidth="2.5" />
        <rect x="0" y="0" width={w} height="18" rx="4" fill={c} {...S} />
      </g>
    );
  },

  shelf({ w, h, p }) {
    const c = col(p.c, "#a8714a");
    return (
      <g>
        <rect width={w} height={h} rx="3" fill={c} {...S} />
        <path d={`M${w * 0.15} ${h} l10 14 M${w * 0.85} ${h} l-10 14`} stroke={OL} strokeWidth="4" />
      </g>
    );
  },

  counter({ w, h, p }) {
    const c = col(p.c, "#7fc0e0");
    return (
      <g>
        <rect y="14" width={w} height={h - 14} fill={c} {...S} />
        <rect x="-6" width={w + 12} height="18" rx="3" fill={col(p.top, "#f6f0e0")} {...S} />
        {Array(Math.max(1, Math.round(w / 90))).fill(0).map((_, i, a) => (
          <g key={i}>
            <rect x={8 + (i * (w - 16)) / a.length} y="26" width={(w - 16) / a.length - 8} height={h - 36} rx="3" fill={shade(c, 0.06)} {...S} strokeWidth="2.5" />
            <rect x={8 + (i * (w - 16)) / a.length + ((w - 16) / a.length - 8) / 2 - 10} y="34" width="20" height="5" rx="2" fill="#c9d3dd" />
          </g>
        ))}
      </g>
    );
  },

  monitor({ w, h, open, p }) {
    const on = p.on || open;
    return (
      <g>
        <rect x={w * 0.42} y={h * 0.8} width={w * 0.16} height={h * 0.14} fill="#5d6b7a" {...S} strokeWidth="2.5" />
        <rect x={w * 0.25} y={h * 0.92} width={w * 0.5} height={h * 0.08} rx="3" fill="#5d6b7a" {...S} strokeWidth="2.5" />
        <rect width={w} height={h * 0.82} rx="6" fill={col(p.c, "#3b4350")} {...S} />
        <g transform={`translate(${w * 0.06} ${h * 0.07})`}>
          <Screen w={w * 0.88} h={h * 0.66} text={on ? p.text : null} on={on} c={p.tc} />
        </g>
      </g>
    );
  },

  panel({ w, h, open, p }) {
    const c = col(p.c, "#5d6b7a");
    const st = p.style || "keypad";
    return (
      <g>
        <rect width={w} height={h} rx="6" fill={c} {...S} />
        <circle cx="8" cy="8" r="2.5" fill={OL} />
        <circle cx={w - 8} cy="8" r="2.5" fill={OL} />
        <circle cx="8" cy={h - 8} r="2.5" fill={OL} />
        <circle cx={w - 8} cy={h - 8} r="2.5" fill={OL} />
        {st === "keypad" && (
          <g>
            <rect x={w * 0.14} y={h * 0.1} width={w * 0.72} height={h * 0.18} rx="3" fill={open ? "#39e08a" : "#1d2229"} {...S} strokeWidth="2" />
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2].map((q) => <rect key={`${r}${q}`} x={w * (0.18 + q * 0.23)} y={h * (0.36 + r * 0.15)} width={w * 0.18} height={h * 0.1} rx="2" fill="#c9d3dd" {...S} strokeWidth="1.5" />),
            )}
          </g>
        )}
        {st === "buttons" && (
          <g>
            {(p.colors || ["red", "yellow", "green", "blue"]).map((k, i, a) => (
              <circle key={i} cx={(w * (i + 0.5)) / a.length} cy={h * 0.6} r={Math.min(w / a.length, h) * 0.3} fill={COLORS[k]} {...S} strokeWidth="2.5" />
            ))}
            <rect x={w * 0.25} y={h * 0.12} width={w * 0.5} height={h * 0.18} rx="3" fill={open ? "#39e08a" : "#e8504f"} {...S} strokeWidth="2" />
          </g>
        )}
        {st === "dials" && (
          <g>
            {Array(p.n || 3).fill(0).map((_, i, a) => (
              <g key={i}>
                <circle cx={(w * (i + 0.5)) / a.length} cy={h * 0.55} r={Math.min(w / a.length, h) * 0.32} fill="#c9d3dd" {...S} strokeWidth="2.5" />
                <path d={`M${(w * (i + 0.5)) / a.length} ${h * 0.55} v${-Math.min(w / a.length, h) * 0.25}`} stroke={OL} strokeWidth="3" />
              </g>
            ))}
            <circle cx={w / 2} cy={h * 0.16} r="5" fill={open ? "#39e08a" : "#e8504f"} {...S} strokeWidth="2" />
          </g>
        )}
        {st === "grid" && (
          <g>
            {Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x={w * (0.16 + (i % 3) * 0.24)} y={h * (0.16 + Math.floor(i / 3) * 0.24)} width={w * 0.2} height={h * 0.2} rx="3" fill={open ? "#f7d23e" : "#3b4350"} {...S} strokeWidth="2" />
            ))}
          </g>
        )}
        {st === "arrows" && (
          <g>
            {["U", "L", "R", "D"].map((d, i) => (
              <Arrow key={d} dir={d} x={w * [0.5, 0.25, 0.75, 0.5][i]} y={h * [0.28, 0.55, 0.55, 0.8][i]} size={Math.min(w, h) * 0.22} c="#c9d3dd" />
            ))}
          </g>
        )}
        {st === "letters" && (
          <g>
            {Array(p.n || 4).fill(0).map((_, i, a) => (
              <rect key={i} x={w * 0.1 + (i * w * 0.8) / a.length + 2} y={h * 0.3} width={(w * 0.8) / a.length - 4} height={h * 0.4} rx="3" fill="#fff6e0" {...S} strokeWidth="2" />
            ))}
          </g>
        )}
        {st === "slots" && (
          <g>
            {Array(p.n || 3).fill(0).map((_, i, a) => (
              <rect key={i} x={w * 0.12 + (i * w * 0.76) / a.length + 3} y={h * 0.3} width={(w * 0.76) / a.length - 6} height={h * 0.45} rx="3" fill="#1d2229" {...S} strokeWidth="2" />
            ))}
          </g>
        )}
      </g>
    );
  },

  fusebox({ w, h, open, p }) {
    const c = col(p.c, "#9aa7b4");
    return (
      <g>
        <rect width={w} height={h} rx="4" fill={shade(c, -0.15)} {...S} />
        {open ? (
          <g>
            <rect x="6" y="6" width={w - 12} height={h - 12} fill="#2b2f36" {...S} strokeWidth="2.5" />
            {[0, 1, 2].map((i) => (
              <rect key={i} x={w * 0.2} y={h * (0.18 + i * 0.25)} width={w * 0.6} height={h * 0.13} rx="3" fill={p.filled ? "#f59a3a" : "#5d6b7a"} {...S} strokeWidth="2" />
            ))}
            <path d={`M6 6 L${-w * 0.4} ${h * 0.12} V${h * 0.88} L6 ${h - 6} Z`} fill={c} {...S} />
          </g>
        ) : (
          <g>
            <rect x="6" y="6" width={w - 12} height={h - 12} rx="3" fill={c} {...S} />
            <path d={`M${w / 2 - 8} ${h * 0.3} L${w / 2 + 4} ${h * 0.3} L${w / 2 - 4} ${h * 0.5} H${w / 2 + 8} L${w / 2 - 6} ${h * 0.75} L${w / 2 - 2} ${h * 0.55} H${w / 2 - 10} Z`} fill="#f7d23e" {...S} strokeWidth="2" />
          </g>
        )}
      </g>
    );
  },

  lever({ w, h, open, p }) {
    const c = col(p.c, "#e8504f");
    const ang = open ? 40 : -40;
    return (
      <g>
        <rect x={w * 0.2} y={h * 0.55} width={w * 0.6} height={h * 0.45} rx="4" fill="#5d6b7a" {...S} />
        {p.missing && !open ? (
          <circle cx={w / 2} cy={h * 0.68} r="6" fill={OL} />
        ) : (
          <g transform={`rotate(${ang} ${w / 2} ${h * 0.68})`} style={{ transition: "transform .4s" }}>
            <rect x={w / 2 - 5} y={h * 0.12} width="10" height={h * 0.58} rx="4" fill="#c9d3dd" {...S} strokeWidth="2.5" />
            <circle cx={w / 2} cy={h * 0.12} r={Math.min(w * 0.18, 14)} fill={c} {...S} />
          </g>
        )}
      </g>
    );
  },

  toolbox({ w, h, open, p }) {
    const c = col(p.c, "#e8504f");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.3} ${h * 0.3} V${h * 0.08} H${w * 0.7} V${h * 0.3}`} fill="none" stroke={OL} strokeWidth="9" />
        <path d={`M${w * 0.3} ${h * 0.3} V${h * 0.08} H${w * 0.7} V${h * 0.3}`} fill="none" stroke="#9aa7b4" strokeWidth="4" />
        <rect y={h * 0.3} width={w} height={h * 0.7} rx="5" fill={c} {...S} />
        {open ? <path d={`M0 ${h * 0.3} L${-w * 0.05} ${h * 0.02} H${w * 0.6} L${w * 0.5} ${h * 0.3} Z`} fill={shade(c, -0.15)} {...S} /> : <rect x="-3" y={h * 0.26} width={w + 6} height={h * 0.18} rx="4" fill={shade(c, 0.1)} {...S} />}
        <rect x={w / 2 - 9} y={h * 0.38} width="18" height="10" rx="2" fill="#c9d3dd" {...S} strokeWidth="2" />
      </g>
    );
  },

  crate({ w, h, open, p }) {
    const c = col(p.c, "#d9a560");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="3" fill={c} {...S} />
        <rect x="7" y="7" width={w - 14} height={h - 14} fill="none" stroke={shade(c, -0.25)} strokeWidth="5" />
        <path d={`M10 10 L${w - 10} ${h - 10}`} stroke={shade(c, -0.25)} strokeWidth="7" />
        {open && <path d={`M-4 -2 H${w + 4} L${w - 6} ${-h * 0.3} H6 Z`} fill="#2b2033" {...S} />}
        {p.label && (
          <g>
            <circle cx={w / 2} cy={h * 0.62} r={Math.min(w, h) * 0.2} fill="#fff6e0" {...S} strokeWidth="2.5" />
            <text x={w / 2} y={h * 0.62 + Math.min(w, h) * 0.09} textAnchor="middle" fontSize={Math.min(w, h) * 0.26} fontWeight="900" fill={OL}>
              {p.label}
            </text>
          </g>
        )}
      </g>
    );
  },

  barrel({ w, h, open, p }) {
    const c = col(p.c, "#b8733f");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.08} ${h * 0.08} Q0 ${h / 2} ${w * 0.08} ${h * 0.92} Q${w / 2} ${h * 1.02} ${w * 0.92} ${h * 0.92} Q${w} ${h / 2} ${w * 0.92} ${h * 0.08} Z`} fill={c} {...S} />
        <path d={`M${w * 0.03} ${h * 0.28} Q${w / 2} ${h * 0.35} ${w * 0.97} ${h * 0.28} M${w * 0.03} ${h * 0.72} Q${w / 2} ${h * 0.79} ${w * 0.97} ${h * 0.72}`} stroke="#5d6b7a" strokeWidth="7" fill="none" />
        <ellipse cx={w / 2} cy={h * 0.08} rx={w * 0.42} ry={h * 0.07} fill={open ? "#2b2033" : shade(c, 0.1)} {...S} />
      </g>
    );
  },

  bin({ w, h, open, p }) {
    const c = col(p.c, "#47a0c0");
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.7} />
        <path d={`M${w * 0.1} ${h * 0.15} H${w * 0.9} L${w * 0.8} ${h} H${w * 0.2} Z`} fill={c} {...S} />
        <path d={`M${w * 0.35} ${h * 0.3} V${h * 0.85} M${w * 0.5} ${h * 0.3} V${h * 0.85} M${w * 0.65} ${h * 0.3} V${h * 0.85}`} stroke={shade(c, -0.2)} strokeWidth="3" />
        {open ? (
          <rect x={w * 0.6} y={h * 0.6} width={w * 0.8} height={h * 0.12} rx="4" fill={shade(c, 0.1)} {...S} transform={`rotate(70 ${w * 0.6} ${h * 0.6})`} />
        ) : (
          <rect x="0" y={h * 0.04} width={w} height={h * 0.13} rx="4" fill={shade(c, 0.1)} {...S} />
        )}
      </g>
    );
  },

  fridge({ w, h, open, p }) {
    const c = col(p.c, "#e8f4fb");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="10" fill={shade(c, -0.08)} {...S} />
        {open ? (
          <g>
            <rect x="6" y="6" width={w - 12} height={h - 12} rx="6" fill="#d8f0ff" {...S} />
            {[0.3, 0.55, 0.78].map((f) => (
              <path key={f} d={`M8 ${h * f} H${w - 8}`} stroke="#9fc9e0" strokeWidth="4" />
            ))}
            <path d={`M${w - 6} 6 L${w + w * 0.4} ${h * 0.05} V${h * 0.95} L${w - 6} ${h - 6} Z`} fill={c} {...S} />
          </g>
        ) : (
          <g>
            <rect x="6" y="6" width={w - 12} height={h * 0.32} rx="6" fill={c} {...S} />
            <rect x="6" y={h * 0.32 + 10} width={w - 12} height={h * 0.68 - 16} rx="6" fill={c} {...S} />
            <rect x={w - 20} y={h * 0.14} width="7" height={h * 0.14} rx="3" fill="#9aa7b4" {...S} strokeWidth="2" />
            <rect x={w - 20} y={h * 0.42} width="7" height={h * 0.2} rx="3" fill="#9aa7b4" {...S} strokeWidth="2" />
          </g>
        )}
      </g>
    );
  },

  oven({ w, h, open, p }) {
    const c = col(p.c, "#f0f0f0");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="6" fill={c} {...S} />
        <rect x="6" y="6" width={w - 12} height={h * 0.16} rx="3" fill="#3b4350" {...S} strokeWidth="2.5" />
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <circle key={f} cx={w * f} cy={6 + h * 0.08} r="5" fill="#c9d3dd" {...S} strokeWidth="2" />
        ))}
        {open ? (
          <g>
            <rect x="10" y={h * 0.28} width={w - 20} height={h * 0.62} rx="4" fill="#2b2033" {...S} />
            <path d={`M10 ${h * 0.9} L-6 ${h + 20} H${w + 6} L${w - 10} ${h * 0.9} Z`} fill={shade(c, -0.1)} {...S} />
          </g>
        ) : (
          <g>
            <rect x="10" y={h * 0.28} width={w - 20} height={h * 0.62} rx="4" fill={shade(c, -0.06)} {...S} />
            <rect x="22" y={h * 0.4} width={w - 44} height={h * 0.38} rx="4" fill="#3b2a24" {...S} strokeWidth="2.5" />
            <rect x="18" y={h * 0.31} width={w - 36} height="6" rx="3" fill="#9aa7b4" />
          </g>
        )}
      </g>
    );
  },

  mirror({ w, h, p }) {
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={col(p.c, "#d9a54a")} {...S} />
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 8} ry={h / 2 - 8} fill="#cdeefa" {...S} strokeWidth="2.5" />
        <path d={`M${w * 0.3} ${h * 0.3} L${w * 0.45} ${h * 0.18} M${w * 0.32} ${h * 0.45} L${w * 0.58} ${h * 0.22}`} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  },

  note({ w, h, p }) {
    const c = col(p.c, "#fff6c8");
    return (
      <g transform={`rotate(${p.tilt ?? -3} ${w / 2} ${h / 2})`}>
        <rect x="3" y="4" width={w} height={h} fill="#000" opacity="0.12" />
        <rect width={w} height={h} fill={c} {...S} strokeWidth="2.5" />
        <circle cx={w / 2} cy="7" r="4.5" fill="#e8504f" {...S} strokeWidth="2" />
        {!p.text &&
          [0.35, 0.52, 0.69].map((f) => (
            <path key={f} d={`M${w * 0.15} ${h * f} H${w * (f > 0.6 ? 0.6 : 0.85)}`} stroke="#9a8a7a" strokeWidth="3" />
          ))}
        {p.text && (
          <text x={w / 2} y={h * 0.62} textAnchor="middle" fontSize={p.fs || Math.min(h * 0.32, (w / p.text.length) * 1.4)} fontWeight="900" fill={col(p.tc, OL)} fontFamily="'Trebuchet MS', Verdana, sans-serif">
            {p.text}
          </text>
        )}
      </g>
    );
  },

  poster({ w, h, p }) {
    const c = col(p.c, "#3fb0e0");
    return (
      <g>
        <rect width={w} height={h} rx="3" fill="#fff6e8" {...S} />
        <rect x="6" y="6" width={w - 12} height={h - 12} rx="2" fill={c} />
        {p.title && (
          <text x={w / 2} y={h * 0.22} textAnchor="middle" fontSize={Math.min(h * 0.13, (w / p.title.length) * 1.5)} fontWeight="900" fill="#fff" stroke={OL} strokeWidth="0.8">
            {p.title}
          </text>
        )}
        {p.icon && <Glyph name={p.icon} x={w / 2} y={h * 0.58} size={Math.min(w, h) * 0.5} c="#f7d23e" sw={2} />}
      </g>
    );
  },

  globe({ w, h, open, p }) {
    const r = w * 0.38;
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.5} />
        <path d={`M${w / 2} ${h * 0.8} V${h - 6}`} stroke={OL} strokeWidth="6" />
        <ellipse cx={w / 2} cy={h - 6} rx={w * 0.3} ry="7" fill="#a8714a" {...S} strokeWidth="2.5" />
        <g transform={open ? `rotate(25 ${w / 2} ${r + 6})` : undefined}>
          <circle cx={w / 2} cy={r + 6} r={r} fill="#3f8ef0" {...S} />
          <path d={`M${w / 2 - r * 0.6} ${r * 0.6} q${r * 0.3} ${-r * 0.2} ${r * 0.5} ${r * 0.2} q${r * 0.1} ${r * 0.4} ${-r * 0.3} ${r * 0.6} Z M${w / 2 + r * 0.1} ${r + 6} q${r * 0.4} ${-r * 0.3} ${r * 0.6} 0 q0 ${r * 0.5} ${-r * 0.4} ${r * 0.6} Z`} fill="#47c06a" {...S} strokeWidth="2" />
        </g>
        <path d={`M${w / 2 - r - 6} ${r + 6} A${r + 6} ${r + 6} 0 0 0 ${w / 2 + r + 6} ${r + 6}`} fill="none" stroke="#d9a54a" strokeWidth="5" transform={`rotate(-30 ${w / 2} ${r + 6})`} />
      </g>
    );
  },

  telescope({ w, h, p }) {
    return (
      <g>
        <path d={`M${w / 2} ${h * 0.45} L${w * 0.15} ${h} M${w / 2} ${h * 0.45} L${w * 0.85} ${h} M${w / 2} ${h * 0.45} V${h}`} stroke="#5d4a3a" strokeWidth="6" />
        <g transform={`rotate(-28 ${w / 2} ${h * 0.4})`}>
          <rect x={w * 0.05} y={h * 0.32} width={w * 0.9} height={h * 0.16} rx="6" fill={col(p.c, "#d9a54a")} {...S} />
          <rect x={w * 0.8} y={h * 0.28} width={w * 0.18} height={h * 0.24} rx="4" fill="#3b4350" {...S} />
        </g>
      </g>
    );
  },

  piano({ w, h, p }) {
    const c = col(p.c, "#2b2033");
    const n = 10;
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="8" fill={c} {...S} />
        <rect x="8" y={h * 0.45} width={w - 16} height={h * 0.25} fill="#fff" {...S} strokeWidth="2" />
        {Array.from({ length: n - 1 }, (_, i) => (
          <path key={i} d={`M${8 + ((w - 16) * (i + 1)) / n} ${h * 0.45} V${h * 0.7}`} stroke={OL} strokeWidth="1.5" />
        ))}
        {[0, 1, 3, 4, 5, 7, 8].map((i) => (
          <rect key={i} x={8 + ((w - 16) * (i + 1)) / n - 4} y={h * 0.45} width="8" height={h * 0.14} fill={OL} />
        ))}
        <rect x={w * 0.3} y={h * 0.12} width={w * 0.4} height={h * 0.2} rx="3" fill="#fff6e0" {...S} strokeWidth="2" />
        <rect x="10" y={h * 0.88} width="12" height={h * 0.12} fill={c} />
        <rect x={w - 22} y={h * 0.88} width="12" height={h * 0.12} fill={c} />
      </g>
    );
  },

  aquarium({ w, h, p }) {
    const fish = p.fish || 3;
    const fc = col(p.fc, "#f59a3a");
    return (
      <g>
        <rect width={w} height={h} rx="6" fill="#7fd6f5" opacity="0.85" {...S} />
        <rect width={w} height={h * 0.12} rx="5" fill="#3b4350" {...S} />
        <path d={`M0 ${h * 0.86} Q${w * 0.3} ${h * 0.78} ${w * 0.6} ${h * 0.86} T${w} ${h * 0.84} V${h} H0 Z`} fill="#f0d79a" />
        <path d={`M${w * 0.15} ${h * 0.86} q-6 -20 4 -36 q8 16 -4 36 M${w * 0.82} ${h * 0.86} q-8 -24 4 -44 q10 20 -4 44`} fill="#3ea85a" />
        {Array.from({ length: fish }, (_, i) => (
          <Glyph key={i} name="fish" x={w * (0.2 + ((i * 0.37) % 0.65))} y={h * (0.3 + ((i * 0.23) % 0.45))} size={Math.min(w, h) * 0.18} c={Array.isArray(p.fc) ? COLORS[p.fc[i]] : fc} sw={1.5} />
        ))}
        <circle cx={w * 0.7} cy={h * 0.25} r="3" fill="#fff" opacity="0.8" />
        <circle cx={w * 0.73} cy={h * 0.18} r="2" fill="#fff" opacity="0.8" />
      </g>
    );
  },

  statue({ w, h, open, p }) {
    const c = col(p.c, "#d6d0c4");
    return (
      <g transform={open && p.slide ? `translate(${w * 0.5} 0)` : undefined} style={{ transition: "transform .6s" }}>
        <Shadow w={w} h={h + 4} k={0.6} />
        <rect x={w * 0.15} y={h * 0.7} width={w * 0.7} height={h * 0.3} rx="3" fill={shade(c, -0.1)} {...S} />
        <path d={`M${w * 0.25} ${h * 0.7} Q${w * 0.2} ${h * 0.4} ${w / 2} ${h * 0.38} Q${w * 0.8} ${h * 0.4} ${w * 0.75} ${h * 0.7} Z`} fill={c} {...S} />
        <circle cx={w / 2} cy={h * 0.22} r={w * 0.2} fill={c} {...S} />
        <path d={`M${w * 0.36} ${h * 0.14} Q${w / 2} ${h * 0.02} ${w * 0.64} ${h * 0.14}`} fill={shade(c, -0.12)} {...S} strokeWidth="2.5" />
      </g>
    );
  },

  pedestal({ w, h, open, p }) {
    const c = col(p.c, "#e6dcc8");
    const gem = col(p.gem, "#ec4f4f");
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.6} />
        <rect x={w * 0.2} y={h * 0.28} width={w * 0.6} height={h * 0.62} fill={c} {...S} />
        <path d={`M${w * 0.33} ${h * 0.32} V${h * 0.86} M${w * 0.5} ${h * 0.32} V${h * 0.86} M${w * 0.67} ${h * 0.32} V${h * 0.86}`} stroke={shade(c, -0.12)} strokeWidth="3" />
        <rect x={w * 0.08} y={h * 0.2} width={w * 0.84} height={h * 0.1} rx="3" fill={shade(c, 0.05)} {...S} />
        <rect x={w * 0.08} y={h * 0.88} width={w * 0.84} height={h * 0.12} rx="3" fill={shade(c, 0.05)} {...S} />
        <ellipse cx={w / 2} cy={h * 0.2} rx={w * 0.2} ry={h * 0.035} fill="#2b2033" />
        {open && p.item && <ItemIcon icon={p.item} c={gem} size={w * 0.5} x={w * 0.25} y={h * 0.2 - w * 0.48} />}
        {p.mark && <Mark m={p.mark} w={w} h={h} />}
      </g>
    );
  },

  candle({ w, h, open, p }) {
    const lit = p.lit ? !open : open;
    return (
      <g>
        {lit && <ellipse cx={w / 2} cy={h * 0.15} rx={w * 1.4} ry={h * 0.5} fill="url(#eq-lampglow)" />}
        <rect x={w * 0.3} y={h * 0.25} width={w * 0.4} height={h * 0.62} rx="3" fill={col(p.c, "#fff3d6")} {...S} />
        <ellipse cx={w / 2} cy={h * 0.92} rx={w * 0.48} ry={h * 0.07} fill="#d9a54a" {...S} />
        <path d={`M${w / 2} ${h * 0.25} V${h * 0.16}`} stroke={OL} strokeWidth="2.5" />
        {lit && <path d={`M${w / 2} 0 Q${w * 0.72} ${h * 0.12} ${w / 2} ${h * 0.2} Q${w * 0.28} ${h * 0.12} ${w / 2} 0 Z`} fill="#ffb02e" className="eq-flicker" {...S} strokeWidth="1.5" />}
      </g>
    );
  },

  fireplace({ w, h, open, p }) {
    const c = col(p.c, "#c9604a");
    const lit = p.lit ? !open : open;
    const bricks = [];
    for (let r = 0; r < 6; r++)
      for (let i = 0; i < 6; i++) bricks.push(<rect key={`${r}-${i}`} x={(i + (r % 2) * 0.5) * (w / 6) - w / 12} y={h * 0.12 + r * (h * 0.145)} width={w / 6 - 3} height={h * 0.13} fill={shade(c, ((r + i) % 3) * 0.04 - 0.04)} />);
    return (
      <g>
        <svg width={w} height={h} overflow="hidden">
          <rect width={w} height={h} fill={c} />
          {bricks}
        </svg>
        <rect width={w} height={h} fill="none" {...S} />
        <rect x="-10" y="0" width={w + 20} height={h * 0.12} rx="3" fill="#a8714a" {...S} />
        <path d={`M${w * 0.18} ${h} V${h * 0.5} Q${w / 2} ${h * 0.3} ${w * 0.82} ${h * 0.5} V${h} Z`} fill="#2b2033" {...S} />
        <path d={`M${w * 0.3} ${h - 8} H${w * 0.7}`} stroke="#6a4a3a" strokeWidth="10" strokeLinecap="round" />
        {lit && (
          <g className="eq-flicker">
            <path d={`M${w * 0.32} ${h - 10} Q${w * 0.3} ${h * 0.68} ${w * 0.42} ${h * 0.58} Q${w * 0.44} ${h * 0.72} ${w / 2} ${h * 0.55} Q${w * 0.6} ${h * 0.7} ${w * 0.62} ${h * 0.6} Q${w * 0.72} ${h * 0.72} ${w * 0.68} ${h - 10} Z`} fill="#ff8a2e" {...S} strokeWidth="2" />
            <path d={`M${w * 0.4} ${h - 10} Q${w * 0.42} ${h * 0.75} ${w / 2} ${h * 0.68} Q${w * 0.58} ${h * 0.78} ${w * 0.6} ${h - 10} Z`} fill="#ffe36a" />
          </g>
        )}
      </g>
    );
  },

  tv({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h * 0.85} rx="8" fill="#3b4350" {...S} />
        <g transform={`translate(${w * 0.05} ${h * 0.06})`}>
          <Screen w={w * 0.9} h={h * 0.72} text={(p.on || open) && p.text} on={p.on || open} c={p.tc || "#9fe8ff"} />
        </g>
        <path d={`M${w * 0.3} ${h} L${w * 0.4} ${h * 0.85} M${w * 0.7} ${h} L${w * 0.6} ${h * 0.85}`} stroke={OL} strokeWidth="5" />
      </g>
    );
  },

  radio({ w, h, open, p }) {
    const c = col(p.c, "#e86b6b");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.2} ${h * 0.12} L${w * 0.85} -4`} stroke={OL} strokeWidth="3" />
        <rect y={h * 0.12} width={w} height={h * 0.88} rx="10" fill={c} {...S} />
        <circle cx={w * 0.3} cy={h * 0.56} r={h * 0.26} fill={shade(c, -0.2)} {...S} />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={w * 0.3} cy={h * 0.56} r={h * (0.08 + i * 0.06)} fill="none" stroke={OL} strokeWidth="1.5" opacity="0.5" />
        ))}
        <rect x={w * 0.6} y={h * 0.28} width={w * 0.32} height={h * 0.16} rx="3" fill={open ? "#f7d23e" : "#fff6e0"} {...S} strokeWidth="2" />
        <circle cx={w * 0.68} cy={h * 0.68} r="7" fill="#c9d3dd" {...S} strokeWidth="2" />
        <circle cx={w * 0.85} cy={h * 0.68} r="7" fill="#c9d3dd" {...S} strokeWidth="2" />
      </g>
    );
  },

  rock({ w, h, open, p }) {
    const c = col(p.c, "#9aa0ad");
    return (
      <g transform={open ? `translate(${w * 0.55} ${h * 0.1}) rotate(18 ${w / 2} ${h})` : undefined} style={{ transition: "transform .5s" }}>
        <Shadow w={w} h={h + 2} />
        <path d={`M${w * 0.05} ${h} Q0 ${h * 0.4} ${w * 0.3} ${h * 0.15} Q${w * 0.6} 0 ${w * 0.85} ${h * 0.3} Q${w} ${h * 0.6} ${w * 0.95} ${h} Z`} fill={c} {...S} />
        <path d={`M${w * 0.3} ${h * 0.3} Q${w * 0.45} ${h * 0.2} ${w * 0.6} ${h * 0.25}`} stroke={shade(c, 0.2)} strokeWidth="4" fill="none" />
      </g>
    );
  },

  palm({ w, h, p }) {
    return (
      <g>
        <path d={`M${w * 0.5} ${h} Q${w * 0.42} ${h * 0.6} ${w * 0.52} ${h * 0.22}`} stroke={OL} strokeWidth="18" fill="none" strokeLinecap="round" />
        <path d={`M${w * 0.5} ${h} Q${w * 0.42} ${h * 0.6} ${w * 0.52} ${h * 0.22}`} stroke="#b8733f" strokeWidth="11" fill="none" strokeLinecap="round" />
        {[-150, -110, -60, -20, 30].map((a, i) => (
          <path key={i} d={`M0 0 Q${w * 0.25} ${-h * 0.08} ${w * 0.45} ${h * 0.06} Q${w * 0.25} ${h * 0.02} 0 0 Z`} transform={`translate(${w * 0.52} ${h * 0.22}) rotate(${a + 90})`} fill={i % 2 ? "#47c06a" : "#3ea85a"} {...S} strokeWidth="2.5" />
        ))}
        {p.coconuts && [-1, 1].map((d) => <circle key={d} cx={w * 0.52 + d * 9} cy={h * 0.26} r="8" fill="#8a5a3b" {...S} strokeWidth="2.5" />)}
      </g>
    );
  },

  shellBig({ w, h, open, p }) {
    const c = col(p.c, "#f6b8a8");
    return (
      <g transform={open ? `rotate(-25 ${w / 2} ${h})` : undefined}>
        <Shadow w={w} h={h + 2} />
        <path d={`M${w / 2} ${h} L0 ${h * 0.45} Q${w / 2} -${h * 0.2} ${w} ${h * 0.45} Z`} fill={c} {...S} />
        {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
          <path key={f} d={`M${w / 2} ${h} L${w * f} ${h * 0.12 + Math.abs(f - 0.5) * h * 0.5}`} stroke={shade(c, -0.18)} strokeWidth="3" />
        ))}
      </g>
    );
  },

  mushroomBig({ w, h, open, p }) {
    const c = col(p.c, "#ec4f4f");
    return (
      <g>
        <Shadow w={w} h={h + 2} k={0.6} />
        <path d={`M${w * 0.38} ${h * 0.5} H${w * 0.62} L${w * 0.66} ${h} H${w * 0.34} Z`} fill="#f6efe0" {...S} />
        <path d={`M0 ${h * 0.55} Q0 0 ${w / 2} 0 Q${w} 0 ${w} ${h * 0.55} Z`} fill={c} {...S} />
        {[[0.25, 0.3], [0.55, 0.18], [0.75, 0.38], [0.42, 0.42]].map(([x, y], i) => (
          <circle key={i} cx={w * x} cy={h * y} r={w * 0.06} fill="#fff" />
        ))}
      </g>
    );
  },

  cauldron({ w, h, open, p }) {
    const brew = col(p.brew, "#47c06a");
    return (
      <g>
        <Shadow w={w} h={h + 2} />
        {p.fire !== false && <path d={`M${w * 0.25} ${h} Q${w * 0.3} ${h * 0.75} ${w * 0.4} ${h * 0.85} Q${w / 2} ${h * 0.65} ${w * 0.6} ${h * 0.85} Q${w * 0.7} ${h * 0.75} ${w * 0.75} ${h} Z`} fill="#ff8a2e" className="eq-flicker" />}
        <path d={`M${w * 0.05} ${h * 0.25} H${w * 0.95} Q${w} ${h * 0.85} ${w / 2} ${h * 0.88} Q0 ${h * 0.85} ${w * 0.05} ${h * 0.25} Z`} fill="#3b3f46" {...S} />
        <ellipse cx={w / 2} cy={h * 0.25} rx={w * 0.47} ry={h * 0.1} fill={open ? col(p.brew2, "#a364e8") : brew} {...S} />
        <circle cx={w * 0.38} cy={h * 0.08} r="6" fill={open ? col(p.brew2, "#a364e8") : brew} opacity="0.8" className="eq-bubble" />
        <circle cx={w * 0.6} cy={h * 0.02} r="4" fill={open ? col(p.brew2, "#a364e8") : brew} opacity="0.7" className="eq-bubble" style={{ animationDelay: ".6s" }} />
      </g>
    );
  },

  crystalBall({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 2} k={0.6} />
        <path d={`M${w * 0.2} ${h} L${w * 0.28} ${h * 0.75} H${w * 0.72} L${w * 0.8} ${h} Z`} fill="#a8714a" {...S} />
        <circle cx={w / 2} cy={h * 0.45} r={w * 0.38} fill={open ? "#d8b8ff" : "#b8e6ff"} {...S} />
        <path d={`M${w * 0.3} ${h * 0.35} Q${w * 0.35} ${h * 0.2} ${w * 0.48} ${h * 0.16}`} stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
    );
  },

  bones({ w, h, p }) {
    const c = "#f3ead6";
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.1} ${h * 0.3} Q${w * 0.5} ${h * 0.05} ${w * 0.85} ${h * 0.35}`} stroke={OL} strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={`M${w * 0.1} ${h * 0.3} Q${w * 0.5} ${h * 0.05} ${w * 0.85} ${h * 0.35}`} stroke={c} strokeWidth="8" fill="none" strokeLinecap="round" />
        {[0.25, 0.4, 0.55, 0.7].map((f) => (
          <path key={f} d={`M${w * f} ${h * 0.22} Q${w * (f + 0.02)} ${h * 0.45} ${w * (f - 0.04)} ${h * 0.55}`} stroke={c} strokeWidth="6" fill="none" {...{ stroke: c }} />
        ))}
        <path d={`M${w * 0.82} ${h * 0.25} Q${w * 1.02} ${h * 0.2} ${w} ${h * 0.42} L${w * 0.86} ${h * 0.46} Z`} fill={c} {...S} />
        <circle cx={w * 0.92} cy={h * 0.31} r="3" fill={OL} />
        {[0.28, 0.42, 0.62, 0.75].map((f) => (
          <path key={f} d={`M${w * f} ${h * 0.4} V${h}`} stroke={c} strokeWidth="8" />
        ))}
        <rect x={w * 0.05} y={h * 0.94} width={w * 0.9} height={h * 0.06} rx="3" fill="#a8714a" {...S} strokeWidth="2" />
      </g>
    );
  },

  vent({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="3" fill="#2b2033" {...S} />
        <g transform={open ? `translate(0 ${h * 0.95}) rotate(70) translate(0 ${-h})` : undefined}>
          <rect width={w} height={h} rx="3" fill="#c9d3dd" {...S} />
          {Array.from({ length: 4 }, (_, i) => (
            <rect key={i} x={w * 0.12} y={h * (0.18 + i * 0.18)} width={w * 0.76} height={h * 0.08} rx="2" fill="#5d6b7a" />
          ))}
          {!open && [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#7b8794" {...S} strokeWidth="1.5" />)}
        </g>
      </g>
    );
  },

  mailbox({ w, h, open, p }) {
    const c = col(p.c, "#3f8ef0");
    return (
      <g>
        <rect x={w * 0.42} y={h * 0.4} width={w * 0.16} height={h * 0.6} fill="#a8714a" {...S} />
        <path d={`M0 ${h * 0.45} V${h * 0.2} Q0 0 ${w * 0.35} 0 H${w} V${h * 0.45} Z`} fill={c} {...S} />
        {open ? <rect x="-6" y={h * 0.05} width="8" height={h * 0.4} fill={shade(c, -0.2)} {...S} /> : <path d={`M4 ${h * 0.42} V${h * 0.22} Q4 6 ${w * 0.3} 6`} fill="none" stroke={shade(c, -0.25)} strokeWidth="3" />}
        <path d={`M${w * 0.8} ${h * 0.3} V${-h * 0.1} H${w * 0.98} V${h * 0.02} H${w * 0.84}`} fill="#ec4f4f" {...S} strokeWidth="2.5" />
      </g>
    );
  },

  cage({ w, h, open, p }) {
    return (
      <g>
        <path d={`M${w / 2} 0 V${h * 0.1}`} stroke={OL} strokeWidth="4" />
        <path d={`M${w * 0.1} ${h * 0.92} V${h * 0.4} Q${w * 0.1} ${h * 0.1} ${w / 2} ${h * 0.1} Q${w * 0.9} ${h * 0.1} ${w * 0.9} ${h * 0.4} V${h * 0.92}`} fill="#fff5" stroke={col(p.c, "#d9a54a")} strokeWidth="5" />
        {[0.25, 0.4, 0.6, 0.75].map((f) => (
          <path key={f} d={`M${w * f} ${h * 0.92} V${h * 0.18}`} stroke={col(p.c, "#d9a54a")} strokeWidth="3" />
        ))}
        {open && <rect x={w * 0.38} y={h * 0.5} width={w * 0.24} height={h * 0.42} fill="#fff8" />}
        <rect x={w * 0.05} y={h * 0.9} width={w * 0.9} height={h * 0.1} rx="3" fill={col(p.c, "#d9a54a")} {...S} />
        {p.bird && <Glyph name="heart" x={w / 2} y={h * 0.62} size={w * 0.25} c="#47c0e0" sw={1.5} />}
      </g>
    );
  },

  robot({ w, h, open, p }) {
    const c = col(p.c, "#9fb8c9");
    const on = p.on || open;
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.6} />
        <path d={`M${w / 2} ${h * 0.08} V0`} stroke={OL} strokeWidth="3" />
        <circle cx={w / 2} cy="0" r="5" fill={on ? "#ec4f4f" : "#7b8794"} {...S} strokeWidth="2" />
        <rect x={w * 0.2} y={h * 0.08} width={w * 0.6} height={h * 0.3} rx="10" fill={c} {...S} />
        <circle cx={w * 0.38} cy={h * 0.22} r={w * 0.07} fill={on ? "#39e08a" : "#3b4350"} {...S} strokeWidth="2" />
        <circle cx={w * 0.62} cy={h * 0.22} r={w * 0.07} fill={on ? "#39e08a" : "#3b4350"} {...S} strokeWidth="2" />
        <rect x={w * 0.12} y={h * 0.42} width={w * 0.76} height={h * 0.38} rx="10" fill={shade(c, -0.08)} {...S} />
        <rect x={w * 0.32} y={h * 0.5} width={w * 0.36} height={h * 0.16} rx="3" fill={on ? "#0f2a24" : "#3b4350"} {...S} strokeWidth="2" />
        {on && p.text && (
          <text x={w / 2} y={h * 0.62} textAnchor="middle" fontSize={h * 0.1} fill="#39e08a" fontFamily="monospace" fontWeight="700">
            {p.text}
          </text>
        )}
        <rect x={w * 0.22} y={h * 0.8} width={w * 0.18} height={h * 0.2} rx="4" fill="#5d6b7a" {...S} />
        <rect x={w * 0.6} y={h * 0.8} width={w * 0.18} height={h * 0.2} rx="4" fill="#5d6b7a" {...S} />
        {!on && p.slot && <rect x={w * 0.42} y={h * 0.7} width={w * 0.16} height={h * 0.06} fill={OL} />}
      </g>
    );
  },

  beakers({ w, h, p }) {
    const cs = p.cs || ["green", "purple", "blue"];
    return (
      <g>
        <rect y={h * 0.82} width={w} height={h * 0.18} rx="3" fill="#a8714a" {...S} />
        {cs.map((k, i) => {
          const bx = (w * (i + 0.5)) / cs.length;
          const bw = (w / cs.length) * 0.7;
          return (
            <g key={i}>
              <path d={`M${bx - bw * 0.25} ${h * 0.2} V${h * 0.4} L${bx - bw / 2} ${h * 0.82} H${bx + bw / 2} L${bx + bw * 0.25} ${h * 0.4} V${h * 0.2} Z`} fill="#e6f4fa" {...S} />
              <path d={`M${bx - bw * 0.38} ${h * 0.6} H${bx + bw * 0.38} L${bx + bw * 0.48} ${h * 0.8} H${bx - bw * 0.48} Z`} fill={COLORS[k] || k} />
              {p.marks && (
                <text x={bx} y={h * 0.76} textAnchor="middle" fontSize={bw * 0.42} fontWeight="900" fill="#fff" stroke={OL} strokeWidth="1">
                  {p.marks[i]}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  },

  lantern({ w, h, open, p }) {
    const lit = p.lit ? !open : open;
    return (
      <g>
        <path d={`M${w / 2} 0 V${h * 0.12}`} stroke={OL} strokeWidth="3" />
        {lit && <ellipse cx={w / 2} cy={h * 0.55} rx={w * 1.6} ry={h * 0.9} fill="url(#eq-lampglow)" />}
        <path d={`M${w * 0.25} ${h * 0.2} H${w * 0.75} L${w * 0.65} ${h * 0.12} H${w * 0.35} Z`} fill="#3b3f46" {...S} />
        <rect x={w * 0.2} y={h * 0.2} width={w * 0.6} height={h * 0.62} rx="4" fill={lit ? "#ffe36a" : "#cfe0e8"} opacity="0.9" {...S} />
        <path d={`M${w / 2} ${h * 0.2} V${h * 0.82}`} stroke="#3b3f46" strokeWidth="3" />
        <rect x={w * 0.15} y={h * 0.82} width={w * 0.7} height={h * 0.12} rx="3" fill="#3b3f46" {...S} />
      </g>
    );
  },

  wheel({ w, h, open, p }) {
    const r = Math.min(w, h) / 2;
    return (
      <g transform={`translate(${w / 2} ${h / 2}) rotate(${open ? 60 : 0})`} style={{ transition: "transform .6s" }}>
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 45})`}>
            <rect x="-4" y={-r} width="8" height={r} fill="#a8714a" {...S} strokeWidth="2.5" />
            <circle cy={-r} r="6" fill="#a8714a" {...S} strokeWidth="2.5" />
          </g>
        ))}
        <circle r={r * 0.72} fill="none" stroke={OL} strokeWidth="13" />
        <circle r={r * 0.72} fill="none" stroke="#c98a54" strokeWidth="7" />
        <circle r={r * 0.2} fill="#d9a54a" {...S} />
      </g>
    );
  },

  armor({ w, h, p }) {
    const c = col(p.c, "#b8c4d0");
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.6} />
        <rect x={w * 0.36} y={h * 0.6} width={w * 0.1} height={h * 0.36} fill={c} {...S} />
        <rect x={w * 0.54} y={h * 0.6} width={w * 0.1} height={h * 0.36} fill={c} {...S} />
        <path d={`M${w * 0.25} ${h * 0.25} H${w * 0.75} L${w * 0.7} ${h * 0.62} H${w * 0.3} Z`} fill={c} {...S} />
        <path d={`M${w * 0.32} ${h * 0.24} Q${w * 0.32} 0 ${w / 2} 0 Q${w * 0.68} 0 ${w * 0.68} ${h * 0.24} Z`} fill={shade(c, 0.05)} {...S} />
        <path d={`M${w * 0.38} ${h * 0.12} H${w * 0.62}`} stroke={OL} strokeWidth="4" />
        <path d={`M${w * 0.5} 0 Q${w * 0.6} -${h * 0.06} ${w * 0.7} 0`} stroke="#ec4f4f" strokeWidth="6" fill="none" />
        <path d={`M${w * 0.12} ${h * 0.95} L${w * 0.2} ${h * 0.15}`} stroke={OL} strokeWidth="6" />
      </g>
    );
  },

  shield({ w, h, p }) {
    const c = col(p.c, "#3f8ef0");
    return (
      <g>
        <path d={`M0 0 H${w} V${h * 0.45} Q${w} ${h * 0.85} ${w / 2} ${h} Q0 ${h * 0.85} 0 ${h * 0.45} Z`} fill={c} {...S} />
        <path d={`M${w / 2} 0 V${h} M0 ${h * 0.35} H${w}`} stroke="#f7d23e" strokeWidth="7" />
        <path d={`M0 0 H${w} V${h * 0.45} Q${w} ${h * 0.85} ${w / 2} ${h} Q0 ${h * 0.85} 0 ${h * 0.45} Z`} fill="none" {...S} />
      </g>
    );
  },

  banner({ w, h, p }) {
    const c = col(p.c, "#ec4f4f");
    return (
      <g>
        <rect x="-6" y="-6" width={w + 12} height="8" rx="4" fill="#a8714a" {...S} strokeWidth="2.5" />
        <path d={`M0 0 H${w} V${h} L${w / 2} ${h * 0.82} L0 ${h} Z`} fill={c} {...S} />
      </g>
    );
  },

  torch({ w, h, open, p }) {
    const lit = p.lit ? !open : open;
    return (
      <g>
        {lit && <ellipse cx={w / 2} cy={h * 0.2} rx={w * 2.4} ry={h * 0.7} fill="url(#eq-lampglow)" />}
        <path d={`M${w * 0.35} ${h * 0.35} H${w * 0.65} L${w * 0.58} ${h} H${w * 0.42} Z`} fill="#8a5a3b" {...S} />
        <rect x={w * 0.2} y={h * 0.28} width={w * 0.6} height={h * 0.1} rx="2" fill="#5d6b7a" {...S} strokeWidth="2.5" />
        {lit && (
          <g className="eq-flicker">
            <path d={`M${w / 2} 0 Q${w} ${h * 0.18} ${w * 0.65} ${h * 0.3} H${w * 0.35} Q0 ${h * 0.18} ${w / 2} 0 Z`} fill="#ff8a2e" {...S} strokeWidth="2" />
            <path d={`M${w / 2} ${h * 0.1} Q${w * 0.68} ${h * 0.2} ${w * 0.58} ${h * 0.29} H${w * 0.42} Q${w * 0.32} ${h * 0.2} ${w / 2} ${h * 0.1} Z`} fill="#ffe36a" />
          </g>
        )}
      </g>
    );
  },

  valve({ w, h, open, p }) {
    const c = col(p.c, "#ec4f4f");
    return (
      <g>
        <rect x={-w * 0.4} y={h * 0.4} width={w * 1.8} height={h * 0.2} fill="#9aa7b4" {...S} />
        <g transform={`translate(${w / 2} ${h / 2}) rotate(${open ? 90 : 0})`} style={{ transition: "transform .5s" }}>
          <circle r={w * 0.42} fill="none" stroke={OL} strokeWidth="11" />
          <circle r={w * 0.42} fill="none" stroke={c} strokeWidth="6" />
          <path d={`M${-w * 0.42} 0 H${w * 0.42} M0 ${-w * 0.42} V${w * 0.42}`} stroke={c} strokeWidth="5" />
          <circle r={w * 0.1} fill="#5d6b7a" {...S} strokeWidth="2" />
        </g>
      </g>
    );
  },

  sign({ w, h, p }) {
    const c = col(p.c, "#c98a54");
    if (p.warn)
      return (
        <g>
          <path d={`M${w / 2} 4 L${w - 4} ${h - 6} H4 Z`} fill={c} {...S} strokeWidth="4" />
          <path d={`M${w / 2} 18 L${w - 16} ${h - 14} H16 Z`} fill="none" stroke={OL} strokeWidth="2.5" />
          <text x={w / 2} y={h * 0.82} textAnchor="middle" fontSize={h * 0.5} fontWeight="900" fill={OL}>
            !
          </text>
        </g>
      );
    return (
      <g>
        {p.post !== false && <rect x={w * 0.45} y={h * 0.5} width={w * 0.1} height={h * 0.5} fill="#8a5a3b" {...S} />}
        <rect width={w} height={h * 0.55} rx="5" fill={c} {...S} />
        {p.text && (
          <text x={w / 2} y={h * 0.36} textAnchor="middle" fontSize={Math.min(h * 0.24, (w / p.text.length) * 1.5)} fontWeight="900" fill="#fff6e0" stroke={OL} strokeWidth="0.8">
            {p.text}
          </text>
        )}
      </g>
    );
  },

  hole({ w, h, open, p }) {
    return (
      <g>
        {open ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#3a2a20" {...S} />
        ) : (
          <g>
            <path d={`M0 ${h} Q${w * 0.2} ${h * 0.2} ${w / 2} ${h * 0.15} Q${w * 0.8} ${h * 0.2} ${w} ${h} Z`} fill={col(p.c, "#e8c98a")} {...S} />
            <path d={`M${w * 0.3} ${h * 0.6} l6 -6 M${w * 0.6} ${h * 0.5} l6 6`} stroke={OL} strokeWidth="3" />
          </g>
        )}
      </g>
    );
  },

  tree({ w, h, p }) {
    const c = col(p.c, "#47c06a");
    return (
      <g>
        <rect x={w * 0.42} y={h * 0.55} width={w * 0.16} height={h * 0.45} fill="#a8714a" {...S} />
        <circle cx={w * 0.5} cy={h * 0.32} r={w * 0.34} fill={c} {...S} />
        <circle cx={w * 0.28} cy={h * 0.45} r={w * 0.22} fill={shade(c, -0.08)} {...S} />
        <circle cx={w * 0.72} cy={h * 0.45} r={w * 0.22} fill={shade(c, -0.05)} {...S} />
      </g>
    );
  },

  bush({ w, h, open, p }) {
    const c = col(p.c, "#3ea85a");
    return (
      <g transform={open ? `translate(${-w * 0.15} 0)` : undefined}>
        <circle cx={w * 0.3} cy={h * 0.6} r={h * 0.4} fill={c} {...S} />
        <circle cx={w * 0.7} cy={h * 0.6} r={h * 0.42} fill={shade(c, 0.05)} {...S} />
        <circle cx={w * 0.5} cy={h * 0.42} r={h * 0.42} fill={shade(c, 0.1)} {...S} />
        <rect x="0" y={h * 0.82} width={w} height={h * 0.18} fill={shade(c, 0.05)} />
      </g>
    );
  },

  column({ w, h, p }) {
    const c = col(p.c, "#e6dcc8");
    return (
      <g>
        <rect x={w * 0.15} y={h * 0.06} width={w * 0.7} height={h * 0.88} fill={c} {...S} />
        {[0.32, 0.5, 0.68].map((f) => (
          <path key={f} d={`M${w * f} ${h * 0.08} V${h * 0.92}`} stroke={shade(c, -0.14)} strokeWidth="3" />
        ))}
        <rect width={w} height={h * 0.07} rx="2" fill={shade(c, 0.04)} {...S} />
        <rect y={h * 0.93} width={w} height={h * 0.07} rx="2" fill={shade(c, 0.04)} {...S} />
      </g>
    );
  },

  frame({ w, h, open, p }) {
    return <Frame w={w} h={h} c={col(p.c, "#f27ab8")} pic={p.pic || "cat"} open={false} bare={p.bare} />;
  },

  trophy({ w, h, p }) {
    const c = col(p.c, "#f5c542");
    return (
      <g>
        <path d={`M${w * 0.2} ${h * 0.05} H${w * 0.8} Q${w * 0.8} ${h * 0.55} ${w / 2} ${h * 0.58} Q${w * 0.2} ${h * 0.55} ${w * 0.2} ${h * 0.05} Z`} fill={c} {...S} />
        <path d={`M${w * 0.2} ${h * 0.12} Q0 ${h * 0.12} ${w * 0.08} ${h * 0.3} Q${w * 0.14} ${h * 0.4} ${w * 0.24} ${h * 0.38} M${w * 0.8} ${h * 0.12} Q${w} ${h * 0.12} ${w * 0.92} ${h * 0.3} Q${w * 0.86} ${h * 0.4} ${w * 0.76} ${h * 0.38}`} fill="none" stroke={OL} strokeWidth="4" />
        <rect x={w * 0.44} y={h * 0.58} width={w * 0.12} height={h * 0.2} fill={c} {...S} strokeWidth="2.5" />
        <rect x={w * 0.25} y={h * 0.78} width={w * 0.5} height={h * 0.2} rx="3" fill="#a8714a" {...S} />
      </g>
    );
  },

  jar({ w, h, open, p }) {
    const c = col(p.c, "#f7d23e");
    return (
      <g>
        <Shadow w={w} h={h + 2} k={0.6} />
        <rect x={w * 0.1} y={h * 0.2} width={w * 0.8} height={h * 0.8} rx="10" fill="#e6f4fa" opacity="0.9" {...S} />
        <rect x={w * 0.14} y={h * 0.5} width={w * 0.72} height={h * 0.46} rx="8" fill={c} opacity="0.9" />
        {!open && <rect x={w * 0.05} y="0" width={w * 0.9} height={h * 0.22} rx="4" fill="#ec4f4f" {...S} />}
      </g>
    );
  },

  basket({ w, h, open, p }) {
    const c = col(p.c, "#d9a560");
    return (
      <g>
        <Shadow w={w} h={h + 2} />
        <path d={`M${w * 0.2} ${h * 0.35} Q${w / 2} -${h * 0.25} ${w * 0.8} ${h * 0.35}`} fill="none" stroke={OL} strokeWidth="9" />
        <path d={`M${w * 0.2} ${h * 0.35} Q${w / 2} -${h * 0.25} ${w * 0.8} ${h * 0.35}`} fill="none" stroke={c} strokeWidth="4" />
        <path d={`M0 ${h * 0.35} H${w} L${w * 0.88} ${h} H${w * 0.12} Z`} fill={c} {...S} />
        {[0.5, 0.65, 0.8].map((f) => (
          <path key={f} d={`M${w * 0.04} ${h * f} H${w * 0.96}`} stroke={shade(c, -0.2)} strokeWidth="3" />
        ))}
      </g>
    );
  },

  switches({ w, h, open, p }) {
    const n = p.n || 4;
    return (
      <g>
        <rect width={w} height={h} rx="6" fill={col(p.c, "#f6f0e0")} {...S} />
        {Array.from({ length: n }, (_, i) => {
          const x = (w * (i + 0.5)) / n;
          const up = open ? (p.final ? p.final[i] : true) : false;
          return (
            <g key={i}>
              <rect x={x - 8} y={h * 0.25} width="16" height={h * 0.5} rx="6" fill="#3b4350" {...S} strokeWidth="2" />
              <rect x={x - 6} y={up ? h * 0.27 : h * 0.5} width="12" height={h * 0.22} rx="4" fill={up ? "#39e08a" : "#c9d3dd"} {...S} strokeWidth="1.5" />
            </g>
          );
        })}
      </g>
    );
  },

  spot({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} fill="transparent" />
        {p.crack && <path d={`M${w * 0.2} ${h * 0.2} L${w * 0.45} ${h * 0.5} L${w * 0.35} ${h * 0.6} L${w * 0.7} ${h * 0.85}`} stroke={OL} strokeWidth="3" fill="none" />}
        {p.sparkle && !open && (
          <g className="eq-sparkle">
            <Glyph name="star" x={w / 2} y={h / 2} size={Math.min(w, h) * 0.45} c="#fffbe0" />
          </g>
        )}
      </g>
    );
  },

  computer({ w, h, open, p }) {
    return (
      <g>
        <rect x={w * 0.1} y={h * 0.82} width={w * 0.8} height={h * 0.18} rx="4" fill="#c9d3dd" {...S} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={w * (0.15 + i * 0.07)} y={h * 0.86} width={w * 0.05} height={h * 0.05} rx="1" fill="#7b8794" />
        ))}
        <rect width={w} height={h * 0.78} rx="6" fill="#e6ecf2" {...S} />
        <g transform={`translate(${w * 0.06} ${h * 0.06})`}>
          <Screen w={w * 0.88} h={h * 0.62} text={(open || p.on) && p.text} on={open || p.on} c={p.tc} />
        </g>
      </g>
    );
  },

  stove({ w, h, p }) {
    return K.oven({ w, h, open: false, p });
  },
};

Object.assign(K, K2);
export const PROP_KINDS = Object.keys(K);

/** Draws a prop of `kind` in its local box, plus any painted marks. */
export function Prop({ kind, w, h, open = false, p = {} }) {
  const draw = K[kind];
  if (!draw) return <rect width={w} height={h} fill="#f0f" />;
  return (
    <g>
      {draw({ w, h, open, p })}
      {kind !== "pedestal" && p.mark && (!p.markOpen || open) && !(p.markShut && open) && <Mark m={p.mark} w={w} h={h} />}
      {open && p.inside && <Mark m={p.inside} w={w} h={h} />}
    </g>
  );
}
