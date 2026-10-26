/**
 * Escape Quest — themed props (museum, island, lab, castle). Same contract
 * as props.jsx: draw inside a local w×h box, `open` is the opened state.
 * Merged into the main prop table by props.jsx.
 */
import { Glyph, Arrow, COLORS } from "./glyphs.jsx";
import { ItemIcon, OL, shade } from "./icons.jsx";

const S = { stroke: OL, strokeWidth: 3.5, strokeLinejoin: "round", strokeLinecap: "round" };
const col = (c, d) => COLORS[c] || c || d;
const Shadow = ({ w, h, k = 0.9 }) => <ellipse cx={w / 2} cy={h - 2} rx={(w / 2) * k} ry={Math.max(5, w * 0.06)} fill="#000" opacity="0.18" />;
const txt = (x, y, size, t, fill = OL, extra = {}) => (
  <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="900" fill={fill} fontFamily="'Trebuchet MS', Verdana, sans-serif" {...extra}>
    {t}
  </text>
);

export const K2 = {
  shed({ w, h, p }) {
    const c = col(p.c, "#c98a54");
    return (
      <g>
        <rect x="10" y={h * 0.25} width={w - 20} height={h * 0.75} fill={c} {...S} />
        {Array.from({ length: Math.floor((w - 20) / 34) }, (_, i) => (
          <path key={i} d={`M${10 + (i + 1) * 34} ${h * 0.27} V${h}`} stroke={shade(c, -0.18)} strokeWidth="3" />
        ))}
        <path d={`M-10 ${h * 0.3} L${w / 2} 0 L${w + 10} ${h * 0.3} Z`} fill={col(p.roof, "#ec4f4f")} {...S} />
        <rect x={w * 0.08} y={h * 0.4} width={w * 0.18} height={h * 0.2} fill="#9fdcf5" {...S} />
        <path d={`M${w * 0.17} ${h * 0.4} V${h * 0.6} M${w * 0.08} ${h * 0.5} H${w * 0.26}`} stroke={OL} strokeWidth="2.5" />
      </g>
    );
  },

  tub({ w, h, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M0 ${h * 0.3} H${w} Q${w} ${h * 0.95} ${w * 0.8} ${h * 0.95} H${w * 0.2} Q0 ${h * 0.95} 0 ${h * 0.3} Z`} fill={col(p.c, "#f6f6f6")} {...S} />
        <rect x="-6" y={h * 0.24} width={w + 12} height={h * 0.1} rx="5" fill="#e6ecf2" {...S} />
        <path d={`M${w * 0.12} ${h * 0.24} V${h * 0.05} H${w * 0.2}`} stroke="#9aa7b4" strokeWidth="6" fill="none" />
        {[0.3, 0.45, 0.6].map((f) => (
          <circle key={f} cx={w * f} cy={h * 0.2} r={h * 0.06} fill="#e6f4fa" stroke="#9fc9e0" strokeWidth="2" />
        ))}
        <rect x={w * 0.15} y={h * 0.95} width="10" height={h * 0.05} fill="#9aa7b4" />
        <rect x={w * 0.85 - 10} y={h * 0.95} width="10" height={h * 0.05} fill="#9aa7b4" />
      </g>
    );
  },

  sink({ w, h, p }) {
    return (
      <g>
        <rect x={w * 0.38} y={h * 0.35} width={w * 0.24} height={h * 0.65} fill="#e6ecf2" {...S} />
        <path d={`M0 ${h * 0.12} H${w} Q${w * 0.95} ${h * 0.42} ${w / 2} ${h * 0.42} Q${w * 0.05} ${h * 0.42} 0 ${h * 0.12} Z`} fill={col(p.c, "#f6f6f6")} {...S} />
        <path d={`M${w / 2} ${h * 0.12} V0 H${w * 0.62}`} stroke="#9aa7b4" strokeWidth="6" fill="none" />
        <ellipse cx={w / 2} cy={h * 0.16} rx={w * 0.38} ry={h * 0.05} fill="#cfe7f5" />
      </g>
    );
  },

  car({ w, h, p }) {
    const c = col(p.c, "#ec4f4f");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.22} ${h * 0.45} L${w * 0.32} ${h * 0.12} H${w * 0.68} L${w * 0.8} ${h * 0.45} Z`} fill={shade(c, -0.08)} {...S} />
        <path d={`M${w * 0.3} ${h * 0.43} L${w * 0.36} ${h * 0.2} H${w * 0.49} V${h * 0.43} Z M${w * 0.53} ${h * 0.43} V${h * 0.2} H${w * 0.65} L${w * 0.72} ${h * 0.43} Z`} fill="#9fdcf5" {...S} strokeWidth="2.5" />
        <rect x="0" y={h * 0.42} width={w} height={h * 0.36} rx={h * 0.12} fill={c} {...S} />
        <circle cx={w * 0.22} cy={h * 0.8} r={h * 0.17} fill="#3b3f46" {...S} />
        <circle cx={w * 0.78} cy={h * 0.8} r={h * 0.17} fill="#3b3f46" {...S} />
        <circle cx={w * 0.22} cy={h * 0.8} r={h * 0.07} fill="#c9d3dd" />
        <circle cx={w * 0.78} cy={h * 0.8} r={h * 0.07} fill="#c9d3dd" />
        <rect x={w * 0.92} y={h * 0.5} width={w * 0.06} height={h * 0.08} rx="2" fill="#f7d23e" />
      </g>
    );
  },

  block({ w, h, p }) {
    const c = col(p.c, "#3f8ef0");
    return (
      <g>
        <Shadow w={w} h={h + 3} k={0.7} />
        <rect width={w} height={h} rx="6" fill={c} {...S} />
        <rect x="5" y="5" width={w - 10} height={h - 10} rx="4" fill="none" stroke={shade(c, 0.25)} strokeWidth="2.5" />
        {txt(w / 2, h * 0.68, h * 0.55, p.letter || "A", "#fff", { stroke: OL, strokeWidth: 1.5 })}
        {p.num != null && (
          <g>
            <circle cx={w * 0.8} cy={h * 0.8} r={h * 0.15} fill="#fff" {...S} strokeWidth="2" />
            {txt(w * 0.8, h * 0.86, h * 0.18, p.num)}
          </g>
        )}
      </g>
    );
  },

  pond({ w, h, open, p }) {
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#a8a08a" {...S} />
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 8} ry={h / 2 - 6} fill={col(p.c, "#3fa0e8")} />
        <path d={`M${w * 0.25} ${h * 0.45} q12 -6 24 0 M${w * 0.6} ${h * 0.6} q12 -6 24 0`} stroke="#bfe6ff" strokeWidth="3" fill="none" />
        {p.lily !== false && <ellipse cx={w * 0.72} cy={h * 0.38} rx={w * 0.09} ry={h * 0.12} fill="#47c06a" {...S} strokeWidth="2" />}
        {p.glint && !open && (
          <g className="eq-sparkle">
            <Glyph name="star" x={w * 0.4} y={h * 0.55} size={Math.min(w, h) * 0.22} c="#fffbe0" />
          </g>
        )}
      </g>
    );
  },

  fence({ w, h, p }) {
    const n = Math.max(3, Math.round(w / 34));
    return (
      <g>
        <rect y={h * 0.3} width={w} height="10" fill={col(p.c, "#fff6e8")} {...S} strokeWidth="2.5" />
        <rect y={h * 0.65} width={w} height="10" fill={col(p.c, "#fff6e8")} {...S} strokeWidth="2.5" />
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={`M${(i * w) / n + 4} ${h} V${h * 0.12} L${(i * w) / n + 14} 0 L${(i * w) / n + 24} ${h * 0.12} V${h} Z`} fill={col(p.c, "#fff6e8")} {...S} strokeWidth="2.5" />
        ))}
      </g>
    );
  },

  books({ w, h, open, p }) {
    const cs = p.cs || ["red", "blue", "green", "yellow"];
    const bw = (w - 10) / cs.length;
    return (
      <g>
        <rect y={h - 10} width={w} height="10" rx="3" fill="#a8714a" {...S} strokeWidth="2.5" />
        {cs.map((k, i) => (
          <g key={i}>
            <rect x={5 + i * bw + 2} y={h * (0.1 + ((i * 7) % 4) * 0.04)} width={bw - 4} height={h * (0.9 - ((i * 7) % 4) * 0.04) - 10} rx="3" fill={COLORS[k] || k} {...S} strokeWidth="2.5" />
            <path d={`M${5 + i * bw + 6} ${h * 0.3} H${5 + (i + 1) * bw - 6}`} stroke="#fff8" strokeWidth="3" />
          </g>
        ))}
        {open && <rect width={w} height={h} fill="#f7d23e" opacity="0.18" />}
      </g>
    );
  },

  plaque({ w, h, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="5" fill={col(p.c, "#d9a54a")} {...S} />
        <rect x="6" y="6" width={w - 12} height={h - 12} rx="3" fill="none" stroke={shade(col(p.c, "#d9a54a"), 0.25)} strokeWidth="2" />
        {p.text
          ? txt(w / 2, h * 0.62, Math.min(h * 0.38, (w / p.text.length) * 1.5), p.text, shade(col(p.c, "#d9a54a"), -0.5))
          : [0.38, 0.62].map((f) => <path key={f} d={`M${w * 0.18} ${h * f} H${w * 0.82}`} stroke={shade(col(p.c, "#d9a54a"), -0.35)} strokeWidth="3" />)}
      </g>
    );
  },

  case({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.7} />
        <rect x={w * 0.05} y={h * 0.55} width={w * 0.9} height={h * 0.45} fill={col(p.c, "#5a3a2a")} {...S} />
        {p.item && !open && <ItemIcon icon={p.item} c={col(p.ic, "#ec4f4f")} size={w * 0.4} x={w * 0.3} y={h * 0.18} />}
        <rect x={w * 0.08} y="0" width={w * 0.84} height={h * 0.56} rx="4" fill="#cdeefa" opacity={open ? 0.15 : 0.45} {...S} />
        <path d={`M${w * 0.2} ${h * 0.1} L${w * 0.32} ${h * 0.04}`} stroke="#fff" strokeWidth="4" />
        {!open && (
          <g>
            <rect x={w * 0.36} y={h * 0.64} width={w * 0.28} height={h * 0.2} rx="3" fill="#2b2f36" {...S} strokeWidth="2" />
            <rect x={w * 0.4} y={h * 0.68} width={w * 0.2} height={h * 0.05} fill="#39e08a" />
          </g>
        )}
      </g>
    );
  },

  reader({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="6" fill={col(p.c, "#3b4350")} {...S} />
        <rect x={w * 0.2} y={h * 0.12} width={w * 0.6} height={h * 0.2} rx="3" fill={open ? "#39e08a" : "#ec4f4f"} {...S} strokeWidth="2" />
        <rect x={w * 0.15} y={h * 0.5} width={w * 0.7} height={h * 0.08} rx="2" fill={OL} />
        <path d={`M${w * 0.3} ${h * 0.75} H${w * 0.7}`} stroke="#9aa7b4" strokeWidth="3" />
      </g>
    );
  },

  tablet({ w, h, open, p }) {
    const c = col(p.c, "#cfc0a0");
    const seq = p.seq || [];
    const rows = p.rows || [seq];
    return (
      <g>
        <path d={`M0 ${h * 0.08} Q0 0 ${w * 0.08} 0 H${w * 0.92} Q${w} 0 ${w} ${h * 0.08} V${h} H0 Z`} fill={c} {...S} />
        {p.crack && <path d={`M${w * 0.7} 0 L${w * 0.62} ${h * 0.3} L${w * 0.75} ${h * 0.5}`} stroke={shade(c, -0.3)} strokeWidth="3" fill="none" />}
        {p.hideUntilOpen && !open && <rect width={w} height={h} fill="#120d20" opacity="0.82" />}
        {(!p.hideUntilOpen || open) &&
          rows.map((r, ri) =>
            r.map((g, i) => {
              const cx = (w * (i + 0.5)) / r.length;
              const cy = (h * (ri + 0.5)) / rows.length;
              const sz = Math.min(w / r.length, h / rows.length) * 0.6;
              if (typeof g === "object")
                return (
                  <g key={`${ri}-${i}`}>
                    <Glyph name={g.g} x={cx} y={cy - sz * 0.25} size={sz * 0.6} c={shade(c, -0.45)} />
                    <circle cx={cx} cy={cy + sz * 0.42} r={sz * 0.18} fill={COLORS[g.c]} {...S} strokeWidth="2" />
                  </g>
                );
              if ("UDLR".includes(g) && g.length === 1) return <Arrow key={`${ri}-${i}`} dir={g} x={cx} y={cy} size={sz * 0.9} c={shade(c, -0.45)} />;
              return COLORS[g] ? <circle key={`${ri}-${i}`} cx={cx} cy={cy} r={sz * 0.35} fill={COLORS[g]} {...S} strokeWidth="2" /> : <Glyph key={`${ri}-${i}`} name={g} x={cx} y={cy} size={sz} c={shade(c, -0.45)} />;
            }),
          )}
      </g>
    );
  },

  sarcophagus({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        {open && <path d={`M${w * 0.1} ${h * 0.1} H${w * 0.9} V${h} H${w * 0.1} Z`} fill="#2b2033" {...S} />}
        <g transform={open ? `translate(${w * 0.55} ${h * 0.15}) rotate(18)` : undefined} style={{ transition: "transform .6s" }}>
          <path d={`M${w * 0.3} 0 H${w * 0.7} Q${w * 0.92} ${h * 0.1} ${w * 0.9} ${h * 0.35} L${w * 0.82} ${h} H${w * 0.18} L${w * 0.1} ${h * 0.35} Q${w * 0.08} ${h * 0.1} ${w * 0.3} 0 Z`} fill="#f5c542" {...S} />
          <path d={`M${w * 0.3} ${h * 0.04} Q${w / 2} ${-h * 0.02} ${w * 0.7} ${h * 0.04} L${w * 0.75} ${h * 0.28} H${w * 0.25} Z`} fill="#3f8ef0" {...S} strokeWidth="2.5" />
          <ellipse cx={w / 2} cy={h * 0.18} rx={w * 0.14} ry={h * 0.1} fill="#e8b878" {...S} strokeWidth="2.5" />
          <circle cx={w * 0.45} cy={h * 0.17} r="2.5" fill={OL} />
          <circle cx={w * 0.55} cy={h * 0.17} r="2.5" fill={OL} />
          {[0.42, 0.55, 0.68, 0.81].map((f, i) => (
            <path key={f} d={`M${w * 0.18} ${h * f} H${w * 0.82}`} stroke={i % 2 ? "#3f8ef0" : "#ec4f4f"} strokeWidth="5" />
          ))}
        </g>
      </g>
    );
  },

  orrery({ w, h, open, p }) {
    const cs = p.cs || ["#9aa7b4", "#f7d23e", "#3f8ef0", "#ec4f4f"];
    return (
      <g>
        <path d={`M${w / 2} ${h * 0.55} V${h}`} stroke={OL} strokeWidth="6" />
        <ellipse cx={w / 2} cy={h - 6} rx={w * 0.25} ry="7" fill="#a8714a" {...S} strokeWidth="2.5" />
        {cs.map((c, i) => (
          <ellipse key={i} cx={w / 2} cy={h * 0.4} rx={w * (0.14 + i * 0.1)} ry={h * (0.06 + i * 0.04)} fill="none" stroke="#d9a54a" strokeWidth="2" />
        ))}
        <circle cx={w / 2} cy={h * 0.4} r={w * 0.08} fill="#f59a3a" {...S} />
        {cs.map((c, i) => (
          <circle key={`p${i}`} cx={w / 2 + w * (0.14 + i * 0.1) * (i % 2 ? -0.8 : 0.85)} cy={h * 0.4 + h * (0.06 + i * 0.04) * (i % 2 ? 0.6 : -0.5)} r={w * 0.035 + i * 1.2} fill={open ? c : shade("#9aa7b4", -0.1)} {...S} strokeWidth="2" />
        ))}
      </g>
    );
  },

  rocket({ w, h, open, p }) {
    const c = col(p.c, "#f6f0e6");
    const decals = p.decals || [];
    return (
      <g transform={open && p.launch ? `translate(0 ${-h * 0.15})` : undefined} style={{ transition: "transform 1s" }}>
        {(open || p.flame) && <path d={`M${w * 0.35} ${h * 0.88} Q${w / 2} ${h * 1.2} ${w * 0.65} ${h * 0.88} Z`} fill="#ff8a2e" className="eq-flicker" {...S} strokeWidth="2" />}
        <path d={`M${w * 0.2} ${h * 0.7} L0 ${h * 0.9} V${h * 0.75} L${w * 0.25} ${h * 0.5} Z M${w * 0.8} ${h * 0.7} L${w} ${h * 0.9} V${h * 0.75} L${w * 0.75} ${h * 0.5} Z`} fill="#ec4f4f" {...S} />
        <path d={`M${w / 2} 0 Q${w * 0.85} ${h * 0.25} ${w * 0.78} ${h * 0.88} H${w * 0.22} Q${w * 0.15} ${h * 0.25} ${w / 2} 0 Z`} fill={c} {...S} />
        <path d={`M${w / 2} 0 Q${w * 0.68} ${h * 0.08} ${w * 0.72} ${h * 0.16} H${w * 0.28} Q${w * 0.32} ${h * 0.08} ${w / 2} 0 Z`} fill="#ec4f4f" {...S} strokeWidth="2.5" />
        {decals.length ? (
          decals.map((g, i) => <Glyph key={i} name={g} x={w / 2} y={h * (0.3 + (i * 0.5) / decals.length)} size={w * 0.3} c={["#3f8ef0", "#ec4f4f", "#47c06a", "#a364e8"][i % 4]} sw={1.5} />)
        ) : (
          <circle cx={w / 2} cy={h * 0.38} r={w * 0.14} fill="#9fdcf5" {...S} />
        )}
        <rect x={w * 0.3} y={h * 0.86} width={w * 0.4} height={h * 0.06} fill="#5d6b7a" {...S} strokeWidth="2" />
      </g>
    );
  },

  easel({ w, h, open, p }) {
    return (
      <g>
        <path d={`M${w * 0.2} ${h} L${w * 0.45} 0 M${w * 0.8} ${h} L${w * 0.55} 0 M${w / 2} ${h * 0.3} V${h}`} stroke="#a8714a" strokeWidth="7" strokeLinecap="round" />
        <rect x={w * 0.05} y={h * 0.08} width={w * 0.9} height={h * 0.58} rx="2" fill="#fffdf6" {...S} />
        {(p.blobs || ["red", "yellow", "blue"]).map((k, i, a) => (
          <circle key={i} cx={w * (0.22 + (i * 0.56) / Math.max(1, a.length - 1))} cy={h * 0.32} r={w * 0.08} fill={COLORS[k]} {...S} strokeWidth="2" />
        ))}
        <path d={`M${w * 0.15} ${h * 0.52} H${w * 0.85}`} stroke="#c9b89a" strokeWidth="3" />
        <rect x={w * 0.02} y={h * 0.64} width={w * 0.96} height="8" rx="3" fill="#a8714a" {...S} strokeWidth="2" />
      </g>
    );
  },

  wrapped({ w, h, open, p }) {
    return (
      <g>
        <rect x="4" y="6" width={w} height={h} fill="#000" opacity="0.15" />
        <rect width={w} height={h} rx="3" fill={open ? "#fffdf6" : "#c9a46a"} {...S} />
        {open ? (
          p.text && txt(w / 2, h * 0.62, Math.min(h * 0.4, (w / p.text.length) * 1.4), p.text, col(p.tc, OL))
        ) : (
          <g>
            <path d={`M0 ${h / 2} H${w} M${w / 2} 0 V${h}`} stroke="#e8d9b0" strokeWidth="6" />
            <path d={`M${w * 0.1} ${h * 0.2} L${w * 0.3} ${h * 0.35} M${w * 0.7} ${h * 0.7} L${w * 0.9} ${h * 0.85}`} stroke={shade("#c9a46a", -0.2)} strokeWidth="2" />
          </g>
        )}
      </g>
    );
  },

  locker({ w, h, open, p }) {
    const c = col(p.c, "#5a8ac0");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="4" fill={shade(c, -0.18)} {...S} />
        {open ? (
          <g>
            <rect x="5" y="5" width={w - 10} height={h - 10} fill="#2b2f36" {...S} strokeWidth="2.5" />
            <path d={`M5 ${h * 0.25} H${w - 5}`} stroke="#5d6b7a" strokeWidth="4" />
            <path d={`M5 5 L${-w * 0.45} ${h * 0.05} V${h * 0.95} L5 ${h - 5} Z`} fill={c} {...S} />
          </g>
        ) : (
          <g>
            <rect x="5" y="5" width={w - 10} height={h - 10} rx="3" fill={c} {...S} />
            {[0.08, 0.13, 0.18].map((f) => (
              <rect key={f} x={w * 0.25} y={h * f} width={w * 0.5} height={h * 0.02} rx="1" fill={OL} />
            ))}
            <rect x={w * 0.68} y={h * 0.45} width={w * 0.16} height={h * 0.12} rx="3" fill={p.keypad ? "#2b2f36" : "#c9d3dd"} {...S} strokeWidth="2" />
          </g>
        )}
        {p.label && txt(w / 2, h * 0.38, w * 0.22, p.label, "#fff", { stroke: OL, strokeWidth: 1 })}
      </g>
    );
  },

  gearslot({ w, h, open, p }) {
    return (
      <g>
        <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} fill="#5d4a3a" {...S} />
        <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.12} fill="#c9d3dd" {...S} strokeWidth="2" />
        {open ? <ItemIcon icon="gear" c={col(p.gc, "#c9a14a")} size={Math.min(w, h)} x={(w - Math.min(w, h)) / 2} y={(h - Math.min(w, h)) / 2} /> : <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.38} fill="none" stroke="#c9d3dd" strokeWidth="2" strokeDasharray="6 5" />}
      </g>
    );
  },

  stand({ w, h, open, p }) {
    return (
      <g>
        <path d={`M${w / 2} ${h * 0.45} V${h - 6} M${w * 0.25} ${h} L${w / 2} ${h * 0.86} L${w * 0.75} ${h}`} stroke={OL} strokeWidth="5" />
        <path d={`M${w * 0.05} ${h * 0.06} H${w * 0.95} L${w * 0.88} ${h * 0.46} H${w * 0.12} Z`} fill="#3b3f46" {...S} />
        {!p.empty && (
          <g>
            <rect x={w * 0.16} y={h * 0.02} width={w * 0.32} height={h * 0.38} fill="#fffdf6" {...S} strokeWidth="2" />
            {[0.12, 0.2, 0.28].map((f) => (
              <path key={f} d={`M${w * 0.2} ${h * f} H${w * 0.44}`} stroke="#9a8a7a" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </g>
    );
  },

  drum({ w, h, p }) {
    const c = col(p.c, "#ec4f4f");
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect y={h * 0.18} width={w} height={h * 0.72} fill={c} {...S} />
        <path d={`M0 ${h * 0.2} L${w * 0.25} ${h * 0.88} L${w / 2} ${h * 0.2} L${w * 0.75} ${h * 0.88} L${w} ${h * 0.2}`} stroke="#f7d23e" strokeWidth="3" fill="none" />
        <ellipse cx={w / 2} cy={h * 0.18} rx={w / 2} ry={h * 0.12} fill="#fff6e8" {...S} />
        <ellipse cx={w / 2} cy={h * 0.9} rx={w / 2} ry={h * 0.08} fill={shade(c, -0.2)} {...S} />
      </g>
    );
  },

  boat({ w, h, open, p }) {
    const c = col(p.c, "#c98a54");
    return (
      <g>
        {p.oars || open ? <path d={`M${w * 0.3} ${h * 0.35} L${w * 0.05} ${h * 0.9} M${w * 0.7} ${h * 0.35} L${w * 0.95} ${h * 0.9}`} stroke="#a8714a" strokeWidth="7" strokeLinecap="round" /> : null}
        <path d={`M0 ${h * 0.35} H${w} Q${w * 0.92} ${h * 0.95} ${w * 0.7} ${h} H${w * 0.3} Q${w * 0.08} ${h * 0.95} 0 ${h * 0.35} Z`} fill={c} {...S} />
        <path d={`M${w * 0.05} ${h * 0.55} H${w * 0.95}`} stroke="#fff6e8" strokeWidth="6" />
        <path d={`M0 ${h * 0.35} H${w}`} stroke={shade(c, -0.3)} strokeWidth="6" />
        {p.name && txt(w / 2, h * 0.84, h * 0.18, p.name, "#fff6e8")}
        {p.rope && !open && <path d={`M${w * 0.95} ${h * 0.4} Q${w * 1.1} ${h * 0.6} ${w * 1.15} ${h}`} stroke="#c9a46a" strokeWidth="5" fill="none" />}
      </g>
    );
  },

  tiki({ w, h, p }) {
    const c = col(p.c, "#a8714a");
    return (
      <g>
        <Shadow w={w} h={h + 3} k={0.7} />
        <rect width={w} height={h} rx={w * 0.25} fill={c} {...S} />
        <path d={`M${w * 0.12} ${h * 0.12} H${w * 0.88}`} stroke={shade(c, -0.25)} strokeWidth="4" />
        <ellipse cx={w * 0.3} cy={h * 0.32} rx={w * 0.14} ry={h * 0.07} fill="#fff6e8" {...S} strokeWidth="2.5" />
        <ellipse cx={w * 0.7} cy={h * 0.32} rx={w * 0.14} ry={h * 0.07} fill="#fff6e8" {...S} strokeWidth="2.5" />
        <circle cx={w * 0.3} cy={h * 0.32} r={w * 0.05} fill={OL} />
        <circle cx={w * 0.7} cy={h * 0.32} r={w * 0.05} fill={OL} />
        <path d={`M${w / 2} ${h * 0.38} V${h * 0.52}`} stroke={OL} strokeWidth="4" />
        <rect x={w * 0.2} y={h * 0.58} width={w * 0.6} height={h * 0.14} rx="4" fill="#fff6e8" {...S} strokeWidth="2.5" />
        <path d={`M${w * 0.35} ${h * 0.58} V${h * 0.72} M${w / 2} ${h * 0.58} V${h * 0.72} M${w * 0.65} ${h * 0.58} V${h * 0.72}`} stroke={OL} strokeWidth="2" />
        {p.g && <Glyph name={p.g} x={w / 2} y={h * 0.86} size={w * 0.36} c={col(p.gc, "#f7d23e")} sw={1.5} />}
      </g>
    );
  },

  hanging({ w, h, open, p }) {
    return (
      <g>
        {!open && <path d={`M${w / 2} 0 V${h * 0.5}`} stroke="#c9a46a" strokeWidth="5" />}
        <g transform={open ? `translate(0 ${h * 0.55})` : undefined} style={{ transition: "transform .5s cubic-bezier(.5,0,1,1)" }}>
          <path d={`M${w * 0.15} ${h * 0.55} Q${w / 2} ${h * 0.3} ${w * 0.85} ${h * 0.55}`} fill="none" stroke={OL} strokeWidth="5" />
          <path d={`M0 ${h * 0.55} H${w} L${w * 0.85} ${h * 0.98} H${w * 0.15} Z`} fill="#d9a560" {...S} />
          {[0.68, 0.82].map((f) => (
            <path key={f} d={`M${w * 0.05} ${h * f} H${w * 0.95}`} stroke="#a8714a" strokeWidth="3" />
          ))}
        </g>
      </g>
    );
  },

  beacon({ w, h, open, p }) {
    return (
      <g>
        {open && <path d={`M${w / 2} ${h * 0.4} L${-w * 2} ${-h * 0.3} V${h * 1.1} Z M${w / 2} ${h * 0.4} L${w * 3} ${-h * 0.3} V${h * 1.1} Z`} fill="#fff3a0" opacity="0.35" />}
        <rect x={w * 0.1} y={h * 0.72} width={w * 0.8} height={h * 0.28} rx="4" fill="#ec4f4f" {...S} />
        <rect x={w * 0.15} y={h * 0.15} width={w * 0.7} height={h * 0.58} rx="8" fill={open ? "#fff3a0" : "#cfe7f5"} opacity="0.95" {...S} />
        <path d={`M${w * 0.15} ${h * 0.44} H${w * 0.85}`} stroke={OL} strokeWidth="2" opacity="0.5" />
        <path d={`M${w * 0.05} ${h * 0.15} Q${w / 2} -${h * 0.1} ${w * 0.95} ${h * 0.15} Z`} fill="#3b3f46" {...S} />
        {!open && <circle cx={w / 2} cy={h * 0.44} r={w * 0.1} fill="none" stroke="#9aa7b4" strokeWidth="3" strokeDasharray="4 4" />}
      </g>
    );
  },

  boards({ w, h, open, p }) {
    const rows = p.rows || 4;
    const cols = p.cols || 4;
    return (
      <g>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return <rect key={i} x={(c * w) / cols + 1} y={(r * h) / rows + 1} width={w / cols - 2} height={h / rows - 2} rx="2" fill={(r + c) % 2 ? "#8a5c36" : "#7a5030"} stroke={OL} strokeWidth="1.5" />;
        })}
        {open && <rect width={w} height={h} fill="#f7d23e" opacity="0.2" />}
      </g>
    );
  },

  machine({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="8" fill={col(p.c, "#9fb8c9")} {...S} />
        <rect x={w * 0.1} y={h * 0.1} width={w * 0.5} height={h * 0.3} rx="4" fill={open ? "#0f2a24" : "#1d2229"} {...S} strokeWidth="2.5" />
        {open && txt(w * 0.35, h * 0.3, h * 0.12, p.okText || "OK", "#39e08a")}
        <path d={`M${w * 0.75} ${h * 0.05} V${h * 0.4} Q${w * 0.75} ${h * 0.5} ${w * 0.68} ${h * 0.5}`} stroke="#c9d3dd" strokeWidth="8" fill="none" />
        <path d={`M${w * 0.68} ${h * 0.05} H${w * 0.82} L${w * 0.78} ${h * 0.15} H${w * 0.72} Z`} fill="#e6f4fa" {...S} strokeWidth="2.5" />
        {[0.2, 0.4, 0.6].map((f, i) => (
          <circle key={f} cx={w * f} cy={h * 0.62} r={w * 0.05} fill={open ? ["#39e08a", "#f7d23e", "#3f8ef0"][i] : "#5d6b7a"} {...S} strokeWidth="2" />
        ))}
        <rect x={w * 0.1} y={h * 0.76} width={w * 0.8} height={h * 0.14} rx="3" fill="#5d6b7a" {...S} strokeWidth="2.5" />
      </g>
    );
  },

  chart({ w, h, p }) {
    const cells = p.cells || [];
    const cols = p.cols || 5;
    const rows = Math.ceil(cells.length / cols);
    return (
      <g>
        <rect width={w} height={h} rx="3" fill="#fffdf6" {...S} />
        {p.title && txt(w / 2, h * 0.13, h * 0.08, p.title)}
        {cells.map((c, i) => {
          const cw = (w - 16) / cols;
          const ch = (h * 0.78) / rows;
          const x = 8 + (i % cols) * cw;
          const y = h * 0.18 + Math.floor(i / cols) * ch;
          return (
            <g key={i}>
              <rect x={x + 2} y={y + 2} width={cw - 4} height={ch - 4} rx="3" fill={["#ffd2d2", "#d2e6ff", "#d8f5d8", "#fff2c2", "#ead8ff"][i % 5]} stroke={OL} strokeWidth="1.5" />
              {txt(x + cw / 2, y + ch * 0.36, ch * 0.24, c.n, OL)}
              {txt(x + cw / 2, y + ch * 0.8, ch * 0.4, c.s, OL)}
            </g>
          );
        })}
      </g>
    );
  },

  rack({ w, h, open, p }) {
    const n = 6;
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx="4" fill="#2b2f36" {...S} />
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <rect x="8" y={10 + (i * (h - 20)) / n} width={w - 16} height={(h - 20) / n - 6} rx="2" fill="#3b4350" stroke="#1d2229" strokeWidth="2" />
            {[0, 1, 2].map((k) => (
              <circle key={k} cx={w - 18 - k * 9} cy={10 + (i * (h - 20)) / n + ((h - 20) / n - 6) / 2} r="2.5" fill={(i + k + (open ? 1 : 0)) % 3 === 0 ? "#ec4f4f" : "#39e08a"} className="eq-blink" style={{ animationDelay: `${(i * 3 + k) * 0.17}s` }} />
            ))}
          </g>
        ))}
        {p.label && txt(w * 0.3, h * 0.08 + 12, 14, p.label, "#f7d23e")}
        {open && <rect x={w * 0.15} y={h * 0.4} width={w * 0.7} height={h * 0.2} fill="#1d2229" {...S} strokeWidth="2" />}
      </g>
    );
  },

  pipes({ w, h, open, p }) {
    const c = col(p.c, "#9aa7b4");
    return (
      <g>
        <rect y={h * 0.4} width={w * 0.38} height={h * 0.2} fill={c} {...S} />
        <rect x={w * 0.62} y={h * 0.4} width={w * 0.38} height={h * 0.2} fill={c} {...S} />
        {open ? (
          <rect x={w * 0.36} y={h * 0.38} width={w * 0.28} height={h * 0.24} rx="3" fill={shade(c, 0.1)} {...S} />
        ) : (
          <g className="eq-steam">
            <circle cx={w / 2} cy={h * 0.4} r={h * 0.12} fill="#fff" opacity="0.7" />
            <circle cx={w * 0.55} cy={h * 0.22} r={h * 0.09} fill="#fff" opacity="0.5" />
          </g>
        )}
        <rect x={w * 0.34} y={h * 0.34} width={w * 0.05} height={h * 0.32} rx="2" fill={shade(c, -0.2)} {...S} strokeWidth="2" />
        <rect x={w * 0.61} y={h * 0.34} width={w * 0.05} height={h * 0.32} rx="2" fill={shade(c, -0.2)} {...S} strokeWidth="2" />
      </g>
    );
  },

  pod({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect width={w} height={h} rx={w * 0.45} fill="#c9d3dd" {...S} />
        <rect x={w * 0.14} y={h * 0.1} width={w * 0.72} height={h * 0.62} rx={w * 0.35} fill={open ? "#2b2033" : "#bfe8f5"} opacity="0.9" {...S} />
        {!open && <path d={`M${w * 0.3} ${h * 0.2} L${w * 0.4} ${h * 0.15} M${w * 0.28} ${h * 0.32} L${w * 0.5} ${h * 0.18}`} stroke="#fff" strokeWidth="4" />}
        <rect x={w * 0.3} y={h * 0.78} width={w * 0.4} height={h * 0.1} rx="3" fill="#2b2f36" {...S} strokeWidth="2" />
        {p.num != null && txt(w / 2, h * 0.86, h * 0.08, p.num, "#3fd0e0")}
      </g>
    );
  },

  solar({ w, h, open, p }) {
    return (
      <g>
        <path d={`M${w / 2} ${h * 0.6} V${h}`} stroke={OL} strokeWidth="7" />
        <g transform={`skewX(-12)`}>
          <rect x={w * 0.1} y="0" width={w * 0.85} height={h * 0.62} rx="4" fill="#2f5ab0" {...S} />
          {[1, 2, 3].map((i) => (
            <path key={i} d={`M${w * 0.1 + (i * w * 0.85) / 4} 0 V${h * 0.62}`} stroke="#9fd8f0" strokeWidth="2" />
          ))}
          <path d={`M${w * 0.1} ${h * 0.31} H${w * 0.95}`} stroke="#9fd8f0" strokeWidth="2" />
          {!open && <rect x={w * 0.1} y="0" width={w * 0.85} height={h * 0.62} rx="4" fill="#a89a80" opacity="0.85" />}
        </g>
      </g>
    );
  },

  rover({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect x={w * 0.1} y={h * 0.3} width={w * 0.8} height={h * 0.38} rx="8" fill={col(p.c, "#f6f0e6")} {...S} />
        <rect x={w * 0.55} y={h * 0.05} width={w * 0.3} height={h * 0.3} rx="6" fill="#9fdcf5" {...S} />
        <path d={`M${w * 0.2} ${h * 0.3} V${h * 0.1}`} stroke={OL} strokeWidth="3" />
        <circle cx={w * 0.2} cy={h * 0.08} r="5" fill="#ec4f4f" {...S} strokeWidth="2" />
        {[0.2, 0.5, 0.8].map((f) => (
          <circle key={f} cx={w * f} cy={h * 0.8} r={h * 0.17} fill="#3b3f46" {...S} />
        ))}
        {p.name && txt(w * 0.32, h * 0.6, h * 0.2, p.name, "#ec4f4f")}
        {open && <rect x={w * 0.12} y={h * 0.42} width={w * 0.38} height={h * 0.2} fill="#2b2033" />}
      </g>
    );
  },

  seal({ w, h, open, p }) {
    const r = Math.min(w, h) / 2;
    return (
      <g transform={`translate(${w / 2} ${h / 2})`} opacity={open ? 0.25 : 1}>
        <circle r={r} fill={col(p.c, "#a364e8")} opacity="0.35" />
        <circle r={r * 0.9} fill="none" stroke={col(p.c, "#a364e8")} strokeWidth="5" className="eq-spin" />
        <path d={`M0 ${-r * 0.75} L${r * 0.65} ${r * 0.4} H${-r * 0.65} Z M0 ${r * 0.75} L${r * 0.65} ${-r * 0.4} H${-r * 0.65} Z`} fill="none" stroke="#fff" strokeWidth="3" />
      </g>
    );
  },

  throne({ w, h, open, p }) {
    const c = col(p.c, "#f5c542");
    return (
      <g transform={open ? `translate(${w * 0.6} 0)` : undefined} style={{ transition: "transform .8s" }}>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.15} ${h * 0.6} V${h * 0.1} L${w * 0.3} 0 L${w / 2} ${h * 0.08} L${w * 0.7} 0 L${w * 0.85} ${h * 0.1} V${h * 0.6} Z`} fill={c} {...S} />
        <rect x={w * 0.25} y={h * 0.14} width={w * 0.5} height={h * 0.42} rx="6" fill="#ec4f4f" {...S} />
        <rect x={w * 0.05} y={h * 0.55} width={w * 0.9} height={h * 0.18} rx="6" fill="#ec4f4f" {...S} />
        <rect x={w * 0.05} y={h * 0.7} width={w * 0.9} height={h * 0.3} rx="4" fill={c} {...S} />
        <circle cx={w / 2} cy={h * 0.06} r="6" fill="#3f8ef0" {...S} strokeWidth="2" />
        {p.cushion && <rect x={w * 0.35} y={h * 0.48} width={w * 0.3} height={h * 0.1} rx="5" fill="#a364e8" {...S} strokeWidth="2" />}
      </g>
    );
  },

  mousehole({ w, h, open, p }) {
    return (
      <g>
        <path d={`M0 ${h} V${h * 0.5} Q0 0 ${w / 2} 0 Q${w} 0 ${w} ${h * 0.5} V${h} Z`} fill="#1d1a26" {...S} />
        {!open && (
          <g>
            <circle cx={w * 0.35} cy={h * 0.55} r="3" fill="#f7d23e" />
            <circle cx={w * 0.55} cy={h * 0.55} r="3" fill="#f7d23e" />
          </g>
        )}
      </g>
    );
  },

  brick({ w, h, open, p }) {
    const c = col(p.c, "#8a8a9a");
    return (
      <g>
        <rect width={w} height={h} fill="#1d1a26" />
        <g transform={open ? `translate(${w * 0.2} ${h * 1.6}) rotate(12)` : undefined} style={{ transition: "transform .5s" }}>
          <rect width={w} height={h} rx="4" fill={c} {...S} />
          <path d={`M${w * 0.15} ${h * 0.3} L${w * 0.35} ${h * 0.5}`} stroke={shade(c, -0.25)} strokeWidth="2" />
        </g>
      </g>
    );
  },

  tally({ w, h, p }) {
    const n = p.n || 5;
    const groups = [];
    const gw = 44;
    for (let g = 0; g * 5 < n; g++) {
      const k = Math.min(5, n - g * 5);
      const x0 = g * gw + 4;
      const lines = [];
      for (let i = 0; i < Math.min(4, k); i++) lines.push(<path key={i} d={`M${x0 + i * 8} 4 L${x0 + i * 8 + 2} ${h - 4}`} />);
      if (k === 5) lines.push(<path key="x" d={`M${x0 - 4} ${h - 10} L${x0 + 30} 10`} />);
      groups.push(
        <g key={g} transform={`translate(${(g % 3) * 0} ${0})`}>
          {lines}
        </g>,
      );
    }
    return (
      <g stroke={col(p.c, "#e6dcc8")} strokeWidth="3.5" strokeLinecap="round" fill="none">
        {groups}
      </g>
    );
  },

  lectern({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} k={0.6} />
        <path d={`M${w * 0.35} ${h * 0.35} H${w * 0.65} L${w * 0.6} ${h * 0.92} H${w * 0.4} Z`} fill="#8a5a3b" {...S} />
        <rect x={w * 0.2} y={h * 0.9} width={w * 0.6} height={h * 0.1} rx="3" fill="#6a4428" {...S} />
        <path d={`M0 ${h * 0.32} L${w * 0.12} ${h * 0.08} H${w * 0.88} L${w} ${h * 0.32} Z`} fill="#a8714a" {...S} />
        <path d={`M${w * 0.14} ${h * 0.26} Q${w * 0.32} ${h * 0.12} ${w / 2} ${h * 0.24} Q${w * 0.68} ${h * 0.12} ${w * 0.86} ${h * 0.26} L${w * 0.82} ${h * 0.3} H${w * 0.18} Z`} fill={open ? "#fff3a0" : "#fffdf6"} {...S} strokeWidth="2.5" />
        {open && <ellipse cx={w / 2} cy={h * 0.18} rx={w * 0.6} ry={h * 0.2} fill="url(#eq-lampglow)" />}
      </g>
    );
  },

  treasure({ w, h, open, p }) {
    const coins = [];
    for (let i = 0; i < 16; i++) coins.push(<ellipse key={i} cx={w * (0.12 + ((i * 0.37) % 0.78))} cy={h * (0.45 + ((i * 0.23) % 0.5))} rx={w * 0.07} ry={w * 0.035} fill={i % 3 ? "#f5c542" : "#e8b22a"} stroke={OL} strokeWidth="2" />);
    return (
      <g>
        <path d={`M0 ${h} Q${w * 0.1} ${h * 0.3} ${w / 2} ${h * 0.25} Q${w * 0.9} ${h * 0.3} ${w} ${h} Z`} fill="#f5c542" {...S} />
        {coins}
        <ItemIcon icon="gem" c="#ec4f4f" size={w * 0.2} x={w * 0.6} y={h * 0.2} />
        <ItemIcon icon="crown" c="#f5c542" size={w * 0.26} x={w * 0.18} y={h * 0.1} />
      </g>
    );
  },

  musicbox({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <rect y={h * 0.38} width={w} height={h * 0.62} rx="5" fill="#f27ab8" {...S} />
        <path d={`M${w * 0.1} ${h * 0.6} H${w * 0.9}`} stroke="#f7d23e" strokeWidth="4" />
        <path d={`M2 ${h * 0.38} L${w * 0.06} ${-h * 0.05} H${w * 0.94} L${w - 2} ${h * 0.38} Z`} fill="#d95ca0" {...S} />
        <ellipse cx={w / 2} cy={h * 0.3} rx={w * 0.12} ry={h * 0.06} fill="#f7d23e" {...S} strokeWidth="2" />
        <path d={`M${w / 2} ${h * 0.3} V${h * 0.08}`} stroke={OL} strokeWidth="3" />
        <circle cx={w / 2} cy={h * 0.08} r="5" fill="#fff" {...S} strokeWidth="2" />
        {p.crank && <path d={`M${w} ${h * 0.68} H${w * 1.12} V${h * 0.5}`} stroke="#c9d3dd" strokeWidth="6" fill="none" />}
        {open && <Glyph name="note" x={w * 0.85} y={-h * 0.1} size={w * 0.22} c="#a364e8" />}
      </g>
    );
  },

  dragon({ w, h, open, p }) {
    const c = col(p.c, "#47b06a");
    const asleep = open;
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.9} ${h * 0.75} Q${w * 1.05} ${h * 0.6} ${w * 0.98} ${h * 0.45} L${w * 1.04} ${h * 0.4} L${w * 0.94} ${h * 0.38}`} fill="none" stroke={OL} strokeWidth="14" strokeLinecap="round" />
        <path d={`M${w * 0.9} ${h * 0.75} Q${w * 1.05} ${h * 0.6} ${w * 0.98} ${h * 0.45}`} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" />
        <path d={`M${w * 0.35} ${h * 0.35} L${w * 0.5} 0 L${w * 0.62} ${h * 0.32} Z`} fill={shade(c, -0.15)} {...S} />
        <path d={`M${w * 0.55} ${h * 0.35} L${w * 0.78} ${h * 0.05} L${w * 0.8} ${h * 0.38} Z`} fill={shade(c, -0.2)} {...S} />
        <ellipse cx={w * 0.6} cy={h * 0.7} rx={w * 0.35} ry={h * 0.28} fill={c} {...S} />
        <ellipse cx={w * 0.6} cy={h * 0.78} rx={w * 0.22} ry={h * 0.14} fill="#f7e08a" {...S} strokeWidth="2.5" />
        <path d={`M${w * 0.3} ${h * 0.6} Q${w * 0.15} ${h * 0.4} ${w * 0.18} ${h * 0.3}`} fill="none" stroke={OL} strokeWidth="26" strokeLinecap="round" />
        <path d={`M${w * 0.3} ${h * 0.6} Q${w * 0.15} ${h * 0.4} ${w * 0.18} ${h * 0.3}`} fill="none" stroke={c} strokeWidth="19" strokeLinecap="round" />
        <g transform={asleep ? `rotate(35 ${w * 0.18} ${h * 0.3}) translate(0 ${h * 0.08})` : undefined} style={{ transition: "transform 1s" }}>
          <ellipse cx={w * 0.16} cy={h * 0.24} rx={w * 0.15} ry={h * 0.13} fill={c} {...S} />
          <ellipse cx={w * 0.05} cy={h * 0.28} rx={w * 0.07} ry={h * 0.07} fill={shade(c, 0.1)} {...S} strokeWidth="2.5" />
          <path d={`M${w * 0.16} ${h * 0.12} L${w * 0.2} ${h * 0.02} L${w * 0.24} ${h * 0.13}`} fill="#f7e08a" {...S} strokeWidth="2.5" />
          {asleep ? <path d={`M${w * 0.12} ${h * 0.2} q6 5 12 0`} stroke={OL} strokeWidth="3" fill="none" /> : <g><circle cx={w * 0.17} cy={h * 0.2} r={w * 0.035} fill="#fff" {...S} strokeWidth="2" /><circle cx={w * 0.175} cy={h * 0.2} r={w * 0.015} fill={OL} /></g>}
          <circle cx={w * 0.03} cy={h * 0.27} r="2.5" fill={OL} />
        </g>
        {asleep && (
          <g className="eq-zzz" fill="#fff" stroke={OL} strokeWidth="1">
            {txt(w * 0.1, -h * 0.02, h * 0.14, "Z", "#fff")}
            {txt(w * 0.2, -h * 0.14, h * 0.1, "z", "#fff")}
          </g>
        )}
      </g>
    );
  },

  fountain({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M0 ${h * 0.65} H${w} L${w * 0.92} ${h} H${w * 0.08} Z`} fill="#c9c4b8" {...S} />
        <ellipse cx={w / 2} cy={h * 0.65} rx={w / 2} ry={h * 0.08} fill={open ? "#5ab0f0" : "#8a8070"} {...S} />
        <rect x={w * 0.44} y={h * 0.3} width={w * 0.12} height={h * 0.35} fill="#c9c4b8" {...S} />
        <ellipse cx={w / 2} cy={h * 0.3} rx={w * 0.22} ry={h * 0.05} fill={open ? "#5ab0f0" : "#8a8070"} {...S} />
        {open && (
          <g className="eq-water">
            <path d={`M${w / 2} ${h * 0.28} Q${w * 0.35} ${h * 0.05} ${w * 0.25} ${h * 0.6} M${w / 2} ${h * 0.28} Q${w * 0.65} ${h * 0.05} ${w * 0.75} ${h * 0.6}`} stroke="#9fdcff" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  },

  well({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.15} ${h * 0.5} V${h * 0.05} M${w * 0.85} ${h * 0.5} V${h * 0.05}`} stroke="#8a5a3b" strokeWidth="8" />
        <path d={`M0 ${h * 0.12} L${w / 2} -${h * 0.1} L${w} ${h * 0.12} Z`} fill="#ec4f4f" {...S} />
        <path d={`M${w / 2} ${h * 0.12} V${h * 0.38}`} stroke="#c9a46a" strokeWidth="3" />
        <rect x={w * 0.42} y={h * 0.36} width={w * 0.16} height={h * 0.1} rx="2" fill="#a8714a" {...S} strokeWidth="2" />
        <rect y={h * 0.5} width={w} height={h * 0.5} rx="6" fill="#9aa0ad" {...S} />
        {[0.62, 0.78].map((f, r) => [0, 1, 2, 3].map((i) => <rect key={`${r}${i}`} x={(i + (r % 2) * 0.5) * (w / 4) - 4} y={h * f} width={w / 4 - 6} height={h * 0.12} rx="3" fill="#b0b6c2" stroke={OL} strokeWidth="1.5" />))}
        <ellipse cx={w / 2} cy={h * 0.5} rx={w / 2} ry={h * 0.07} fill={open ? "#7fd0ff" : "#1d1a26"} {...S} />
        {open && (
          <g className="eq-sparkle">
            <Glyph name="star" x={w / 2} y={h * 0.38} size={w * 0.2} c="#fffbe0" />
          </g>
        )}
      </g>
    );
  },

  altar({ w, h, open, p }) {
    const gems = p.gems || ["red", "blue", "purple"];
    return (
      <g>
        <Shadow w={w} h={h + 4} />
        <path d={`M${w * 0.05} ${h * 0.3} H${w * 0.95} L${w * 0.85} ${h} H${w * 0.15} Z`} fill={col(p.c, "#7a6aa0")} {...S} />
        <rect y={h * 0.2} width={w} height={h * 0.14} rx="4" fill={shade(col(p.c, "#7a6aa0"), 0.1)} {...S} />
        {gems.map((g, i) => {
          const x = (w * (i + 0.5)) / gems.length;
          return (
            <g key={i}>
              <circle cx={x} cy={h * 0.55} r={w * 0.08} fill="#2b2033" {...S} strokeWidth="2.5" />
              {p.filled && p.filled[i] ? <ItemIcon icon="gem" c={COLORS[g]} size={w * 0.16} x={x - w * 0.08} y={h * 0.55 - w * 0.08} /> : <circle cx={x} cy={h * 0.55} r={w * 0.04} fill={COLORS[g]} opacity="0.35" />}
            </g>
          );
        })}
        {open && <ellipse cx={w / 2} cy={h * 0.2} rx={w * 0.7} ry={h * 0.4} fill="url(#eq-lampglow)" />}
      </g>
    );
  },

  portal({ w, h, open, p }) {
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#5a4a7a" {...S} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          const x = w / 2 + Math.sin(a) * (w / 2 - 9);
          const y = h / 2 - Math.cos(a) * (h / 2 - 9);
          return <rect key={i} x="-8" y="-11" width="16" height="22" rx="3" fill="#7a6aa0" {...S} strokeWidth="2" transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI})`} />;
        })}
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 18} ry={h / 2 - 18} fill={open ? "url(#eq-portal)" : "#1d1a33"} {...S} />
        {open && (
          <g className="eq-spin">
            <Glyph name="spiral" x={w / 2} y={h / 2} size={w * 0.5} c="#fff" />
          </g>
        )}
        {(p.runes || []).map((r, i, a) => (
          <g key={i}>
            <circle cx={w / 2 + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / a.length) * (w / 2 + 4)} cy={h / 2 + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / a.length) * (h / 2 + 4)} r="13" fill={p.lit && p.lit[i] ? "#3fd0e0" : "#3b3f46"} {...S} strokeWidth="2.5" />
            <Glyph name={r} x={w / 2 + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / a.length) * (w / 2 + 4)} y={h / 2 + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / a.length) * (h / 2 + 4)} size="16" c="#fff" />
          </g>
        ))}
      </g>
    );
  },

  board({ w, h, open, p }) {
    return (
      <g>
        <rect x="-6" y="-6" width={w + 12} height={h + 12} rx="4" fill={col(p.frame, "#9aa7b4")} {...S} />
        <rect width={w} height={h} fill={col(p.c, "#fbfdff")} {...S} strokeWidth="2.5" />
        {(p.lines || [[0.2, 0.25, 0.6], [0.2, 0.42, 0.75], [0.2, 0.59, 0.5]]).map(([x, y, l], i) => (
          <path key={i} d={`M${w * x} ${h * y} q${w * l * 0.25} -6 ${w * l * 0.5} 0 t${w * l * 0.5} 0`} stroke={["#3f8ef0", "#47c06a", "#ec4f4f"][i % 3]} strokeWidth="3" fill="none" />
        ))}
        {p.text && (!p.hidden || open) && txt(w / 2, h * 0.85, Math.min(h * 0.2, (w / p.text.length) * 1.5), p.text, col(p.tc, "#ec4f4f"))}
        <rect x={w * 0.6} y={h + 2} width={w * 0.3} height="6" rx="2" fill="#c9d3dd" {...S} strokeWidth="1.5" />
      </g>
    );
  },

  slot({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="6" fill={col(p.c, "#5d6b7a")} {...S} />
        <rect x={w * 0.15} y={h * 0.15} width={w * 0.7} height={h * 0.7} rx="4" fill="#1d1a26" {...S} strokeWidth="2.5" />
        {open && p.item ? <ItemIcon icon={p.item} c={col(p.ic, "#f5c542")} size={Math.min(w, h) * 0.65} x={(w - Math.min(w, h) * 0.65) / 2} y={(h - Math.min(w, h) * 0.65) / 2} /> : p.hintIcon && <g opacity="0.3"><ItemIcon icon={p.hintIcon} c="#fff" size={Math.min(w, h) * 0.55} x={(w - Math.min(w, h) * 0.55) / 2} y={(h - Math.min(w, h) * 0.55) / 2} /></g>}
        {p.light !== false && <circle cx={w - 9} cy="9" r="4" fill={open ? "#39e08a" : "#ec4f4f"} {...S} strokeWidth="1.5" />}
      </g>
    );
  },

  keyslot({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="8" fill={col(p.c, "#3b4350")} {...S} />
        <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.3} fill="#c9d3dd" {...S} />
        <g transform={open ? `rotate(90 ${w / 2} ${h / 2})` : undefined} style={{ transition: "transform .4s" }}>
          <rect x={w / 2 - 3} y={h / 2 - Math.min(w, h) * 0.18} width="6" height={Math.min(w, h) * 0.36} rx="2" fill={OL} />
        </g>
        <circle cx={w / 2} cy={h * 0.12} r="4" fill={open ? "#39e08a" : "#ec4f4f"} />
      </g>
    );
  },

  kettle({ w, h, open, p }) {
    return (
      <g>
        <Shadow w={w} h={h + 3} k={0.7} />
        {open && (
          <g className="eq-steam">
            <circle cx={w * 0.85} cy={h * 0.1} r="7" fill="#fff" opacity="0.7" />
            <circle cx={w * 0.95} cy={-h * 0.08} r="5" fill="#fff" opacity="0.5" />
          </g>
        )}
        <path d={`M${w * 0.7} ${h * 0.5} L${w * 0.95} ${h * 0.25}`} stroke={OL} strokeWidth="10" strokeLinecap="round" />
        <path d={`M${w * 0.7} ${h * 0.5} L${w * 0.95} ${h * 0.25}`} stroke={col(p.c, "#ec4f4f")} strokeWidth="5" strokeLinecap="round" />
        <path d={`M${w * 0.1} ${h} Q0 ${h * 0.3} ${w * 0.45} ${h * 0.25} Q${w * 0.9} ${h * 0.3} ${w * 0.8} ${h} Z`} fill={col(p.c, "#ec4f4f")} {...S} />
        <path d={`M${w * 0.2} ${h * 0.3} Q${w * 0.45} -${h * 0.1} ${w * 0.7} ${h * 0.3}`} stroke={OL} strokeWidth="5" fill="none" />
        <rect x={w * 0.25} y={h * 0.55} width={w * 0.4} height={h * 0.15} rx="4" fill={open ? "#f7d23e" : "#fff6e8"} {...S} strokeWidth="2" />
      </g>
    );
  },

  vines({ w, h, open, p }) {
    if (open)
      return (
        <g>
          {[0.1, 0.9].map((f) => (
            <path key={f} d={`M${w * f} 0 Q${w * (f + (f < 0.5 ? 0.05 : -0.05))} ${h * 0.3} ${w * f} ${h * 0.45}`} stroke="#2f8a40" strokeWidth="6" fill="none" />
          ))}
        </g>
      );
    return (
      <g>
        {Array.from({ length: 7 }, (_, i) => (
          <g key={i}>
            <path d={`M${(w * (i + 0.5)) / 7} 0 Q${(w * (i + 0.5)) / 7 + 12} ${h * 0.5} ${(w * (i + 0.5)) / 7 - 4} ${h}`} stroke="#2f8a40" strokeWidth="7" fill="none" />
            {[0.2, 0.45, 0.7, 0.9].map((f) => (
              <ellipse key={f} cx={(w * (i + 0.5)) / 7 + (f * 20) % 12} cy={h * f} rx="11" ry="6" fill={i % 2 ? "#47c06a" : "#3ea85a"} stroke={OL} strokeWidth="2" transform={`rotate(${(i * 40 + f * 100) % 70 - 35} ${(w * (i + 0.5)) / 7} ${h * f})`} />
            ))}
          </g>
        ))}
      </g>
    );
  },

  waterfall({ w, h, open, p }) {
    return (
      <g>
        <path d={`M0 0 H${w} V${h} H0 Z`} fill="#6a8a9a" {...S} />
        <rect x={w * 0.2} width={w * 0.6} height={h * 0.85} fill="#7fd0ff" className="eq-water" />
        {[0.3, 0.45, 0.6, 0.7].map((f) => (
          <path key={f} d={`M${w * f} ${h * 0.05} V${h * 0.8}`} stroke="#d8f3ff" strokeWidth="3" strokeDasharray="20 14" className="eq-flow" />
        ))}
        <ellipse cx={w / 2} cy={h * 0.88} rx={w * 0.48} ry={h * 0.1} fill="#5ab0f0" {...S} />
      </g>
    );
  },

  crystals({ w, h, open, p }) {
    const cs = ["#9fd8f0", "#d8b8ff", "#f27ab8", "#3fd0e0", "#a364e8"];
    return (
      <g>
        {Array.from({ length: 7 }, (_, i) => {
          const x = w * (0.1 + i * 0.13);
          const ch = h * (0.45 + ((i * 3) % 5) * 0.11);
          return <path key={i} d={`M${x} ${h} L${x - w * 0.06} ${h - ch * 0.7} L${x} ${h - ch} L${x + w * 0.06} ${h - ch * 0.7} Z`} fill={open ? cs[i % 5] : shade(cs[i % 5], -0.35)} {...S} strokeWidth="2.5" />;
        })}
        {open && <ellipse cx={w / 2} cy={h / 2} rx={w * 0.7} ry={h * 0.7} fill="url(#eq-lampglow)" />}
      </g>
    );
  },

  runes({ w, h, open, p }) {
    const n = p.n || 9;
    const cols = Math.round(Math.sqrt(n));
    return (
      <g>
        <rect width={w} height={h} rx="8" fill="#3b3f46" {...S} />
        {Array.from({ length: n }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const cw = (w - 16) / cols;
          const ch = (h - 16) / Math.ceil(n / cols);
          return (
            <g key={i}>
              <rect x={8 + c * cw + 3} y={8 + r * ch + 3} width={cw - 6} height={ch - 6} rx="4" fill={open ? "#3fd0e0" : "#5d6b7a"} stroke={OL} strokeWidth="2" />
              <Glyph name={["star", "moon", "sun", "drop", "leaf", "bolt", "eye", "heart", "diamond"][i % 9]} x={8 + c * cw + cw / 2} y={8 + r * ch + ch / 2} size={Math.min(cw, ch) * 0.45} c={open ? "#fff" : "#9aa7b4"} />
            </g>
          );
        })}
      </g>
    );
  },

  mushrooms({ w, h, open, p }) {
    const cs = ["#a364e8", "#3fd0e0", "#f27ab8", "#47c06a", "#f7d23e"];
    return (
      <g>
        {open && <ellipse cx={w / 2} cy={h * 0.6} rx={w * 0.7} ry={h * 0.7} fill="url(#eq-lampglow)" />}
        {[0.12, 0.3, 0.5, 0.68, 0.86].map((f, i) => {
          const mh = h * (0.45 + ((i * 3) % 5) * 0.11);
          const mw = w * 0.17;
          const x = w * f;
          return (
            <g key={i}>
              <rect x={x - mw * 0.14} y={h - mh * 0.6} width={mw * 0.28} height={mh * 0.6} rx="3" fill="#f6efe0" {...S} strokeWidth="2" />
              <path d={`M${x - mw / 2} ${h - mh * 0.55} Q${x} ${h - mh * 1.15} ${x + mw / 2} ${h - mh * 0.55} Z`} fill={open ? cs[i] : shade(cs[i], -0.45)} {...S} strokeWidth="2.5" />
              {open && <circle cx={x} cy={h - mh * 0.75} r={mw * 0.12} fill="#fff" opacity="0.8" />}
            </g>
          );
        })}
      </g>
    );
  },

  fireflies({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="10" fill="#1d2a4a" opacity="0.8" {...S} />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={w * (0.1 + ((i * 0.37) % 0.8))} cy={h * (0.15 + ((i * 0.29) % 0.7))} r="4" fill={open ? "#f7f07a" : "#6a7a5a"} className={open ? "eq-blink" : undefined} style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </g>
    );
  },

  stonedisk({ w, h, open, p }) {
    const r = Math.min(w, h) / 2;
    return (
      <g transform={`translate(${w / 2} ${h / 2})`}>
        <circle r={r} fill="#9aa08a" {...S} />
        <circle r={r * 0.8} fill="none" stroke="#7a806a" strokeWidth="4" />
        <g transform={open ? undefined : "rotate(70)"}>
          <Glyph name="sun" size={r * 1.1} c={open ? "#f7d23e" : "#c4c8b0"} />
        </g>
        {!open && <path d={`M${-r * 0.7} ${-r * 0.1} L${r * 0.7} ${r * 0.2} M${-r * 0.2} ${-r * 0.7} L${r * 0.1} ${r * 0.7}`} stroke="#7a806a" strokeWidth="3" />}
      </g>
    );
  },

  page({ w, h, open, p }) {
    return (
      <g transform={`rotate(${open ? 0 : 4} ${w / 2} ${h / 2})`}>
        <rect x="3" y="4" width={w} height={h} fill="#000" opacity="0.15" />
        <rect width={w} height={h} fill="#f6ead0" {...S} />
        <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#c9b89a" strokeWidth="2" strokeDasharray={open ? "0" : "6 4"} />
        {open && p.text && txt(w / 2, h * 0.6, Math.min(h * 0.3, (w / p.text.length) * 1.4), p.text)}
        {!open && <path d={`M${w * 0.2} ${h * 0.3} H${w * 0.4} M${w * 0.6} ${h * 0.7} H${w * 0.85}`} stroke="#9a8a7a" strokeWidth="3" />}
      </g>
    );
  },

  banners({ w, h, open, p }) {
    const cs = p.cs || ["green", "red", "yellow", "blue"];
    const bw = w / cs.length;
    return (
      <g>
        <rect x="-4" y="-6" width={w + 8} height="8" rx="4" fill="#a8714a" {...S} strokeWidth="2.5" />
        {cs.map((k, i) => (
          <path key={i} d={`M${i * bw + 4} 0 H${(i + 1) * bw - 4} V${h} L${i * bw + bw / 2} ${h * 0.82} L${i * bw + 4} ${h} Z`} fill={COLORS[k]} {...S} />
        ))}
        {open && <rect width={w} height={h} fill="#f7d23e" opacity="0.15" />}
      </g>
    );
  },

  orbs({ w, h, open, p }) {
    const cs = p.cs || ["red", "blue", "green", "white"];
    const gl = p.gs || ["sun", "drop", "leaf", "wave"];
    return (
      <g>
        <rect y={h * 0.7} width={w} height={h * 0.3} rx="5" fill="#5a4a7a" {...S} />
        {cs.map((k, i) => {
          const x = (w * (i + 0.5)) / cs.length;
          return (
            <g key={i}>
              <circle cx={x} cy={h * 0.45} r={Math.min(w / cs.length, h) * 0.32} fill={COLORS[k]} {...S} opacity={open ? 1 : 0.85} />
              <Glyph name={gl[i]} x={x} y={h * 0.45} size={Math.min(w / cs.length, h) * 0.34} c="#fff" />
            </g>
          );
        })}
      </g>
    );
  },

  rods({ w, h, open, p }) {
    const hs = p.hs || [0.6, 0.9, 0.4, 0.75];
    const cs = p.cs || ["red", "blue", "green", "yellow"];
    return (
      <g>
        <rect width={w} height={h} rx="6" fill="#2b362b" {...S} />
        {hs.map((f, i) => {
          const x = (w * (i + 0.5)) / hs.length;
          return <rect key={i} x={x - 8} y={h - 8 - (h - 20) * f} width="16" height={(h - 20) * f} rx="4" fill={COLORS[cs[i]]} {...S} strokeWidth="2" />;
        })}
        {open && <rect width={w} height={h} rx="6" fill="#39e08a" opacity="0.18" />}
      </g>
    );
  },

  sandpit({ w, h, open, p }) {
    return (
      <g>
        <rect width={w} height={h} rx="8" fill="#a8714a" {...S} />
        <rect x="8" y="8" width={w - 16} height={h - 16} rx="5" fill="#f0d79a" />
        {open ? <ellipse cx={w / 2} cy={h / 2} rx={w * 0.2} ry={h * 0.25} fill="#c9a46a" {...S} strokeWidth="2.5" /> : <path d={`M${w * 0.4} ${h * 0.4} l12 12 M${w * 0.52} ${h * 0.4} l-12 12`} stroke="#ec4f4f" strokeWidth="5" />}
      </g>
    );
  },

  cloth({ w, h, open, p }) {
    if (open) return <g />;
    return (
      <g>
        <path d={`M${w * 0.1} ${h} Q0 ${h * 0.3} ${w / 2} 0 Q${w} ${h * 0.3} ${w * 0.9} ${h} Q${w / 2} ${h * 0.9} ${w * 0.1} ${h} Z`} fill={col(p.c, "#a364e8")} {...S} />
        <path d={`M${w * 0.35} ${h * 0.2} Q${w * 0.3} ${h * 0.6} ${w * 0.32} ${h * 0.95} M${w * 0.62} ${h * 0.18} Q${w * 0.7} ${h * 0.6} ${w * 0.68} ${h * 0.95}`} stroke={shade(col(p.c, "#a364e8"), -0.2)} strokeWidth="3" fill="none" />
      </g>
    );
  },

  parrot({ w, h, open, p }) {
    return (
      <g>
        <path d={`M0 ${h * 0.86} H${w}`} stroke="#8a5a3b" strokeWidth="7" strokeLinecap="round" />
        <path d={`M${w / 2} ${h * 0.86} V${h}`} stroke="#8a5a3b" strokeWidth="6" />
        <path d={`M${w * 0.42} ${h * 0.8} L${w * 0.3} ${h * 1.0} L${w * 0.5} ${h * 0.84} Z`} fill="#3f8ef0" {...S} strokeWidth="2.5" />
        <ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.22} ry={h * 0.3} fill="#ec4f4f" {...S} />
        <path d={`M${w * 0.55} ${h * 0.45} Q${w * 0.8} ${h * 0.6} ${w * 0.6} ${h * 0.8}`} fill="#47c06a" {...S} strokeWidth="2.5" />
        <circle cx={w * 0.5} cy={h * 0.28} r={w * 0.17} fill="#ec4f4f" {...S} />
        <path d={`M${w * 0.36} ${h * 0.26} Q${w * 0.22} ${h * 0.3} ${w * 0.32} ${h * 0.4} L${w * 0.4} ${h * 0.34} Z`} fill="#f7d23e" {...S} strokeWidth="2.5" />
        <circle cx={w * 0.52} cy={h * 0.24} r="3.5" fill={OL} />
        {open && (
          <g>
            <path d={`M${w * 0.65} ${h * 0.05} Q${w * 1.2} -${h * 0.1} ${w * 1.1} ${h * 0.15} L${w * 0.75} ${h * 0.2} Z`} fill="#fff" {...S} strokeWidth="2" />
            {txt(w * 0.92, h * 0.1, h * 0.1, "♪!", OL)}
          </g>
        )}
      </g>
    );
  },
};
