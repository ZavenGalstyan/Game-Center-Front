/**
 * Escape Quest — framed pictures. Painted inside paintings and photo frames,
 * and cut into tiles by the rotate puzzle. Each draws a w×h picture at 0,0.
 */
import { Glyph } from "./glyphs.jsx";
import { OL } from "./icons.jsx";

export const PICS = {
  landscape: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#9fdcf5" />
      <circle cx={w * 0.75} cy={h * 0.3} r={h * 0.13} fill="#f7d23e" />
      <path d={`M0 ${h * 0.75} Q${w * 0.3} ${h * 0.45} ${w * 0.55} ${h * 0.7} T${w} ${h * 0.6} V${h} H0 Z`} fill="#5cc46e" />
      <path d={`M0 ${h * 0.9} Q${w * 0.5} ${h * 0.7} ${w} ${h * 0.85} V${h} H0 Z`} fill="#3ea85a" />
    </g>
  ),
  sea: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#ffd9a8" />
      <circle cx={w * 0.5} cy={h * 0.55} r={h * 0.2} fill="#f59a3a" />
      <rect y={h * 0.55} width={w} height={h * 0.45} fill="#3f8ef0" />
      <path d={`M${w * 0.15} ${h * 0.72} q10 -6 20 0 M${w * 0.55} ${h * 0.82} q10 -6 20 0`} stroke="#fff" strokeWidth="3" fill="none" />
      <path d={`M${w * 0.3} ${h * 0.55} L${w * 0.38} ${h * 0.3} L${w * 0.38} ${h * 0.55} Z`} fill="#fff" stroke={OL} strokeWidth="2" />
    </g>
  ),
  mountain: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#c6e6ff" />
      <path d={`M0 ${h} L${w * 0.35} ${h * 0.25} L${w * 0.6} ${h * 0.65} L${w * 0.75} ${h * 0.45} L${w} ${h} Z`} fill="#8b7fb8" stroke={OL} strokeWidth="2" />
      <path d={`M${w * 0.27} ${h * 0.4} L${w * 0.35} ${h * 0.25} L${w * 0.43} ${h * 0.4} Z`} fill="#fff" />
    </g>
  ),
  flower: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#fde2ef" />
      <path d={`M${w / 2} ${h * 0.9} V${h * 0.45}`} stroke="#3ea85a" strokeWidth="4" />
      <Glyph name="flower" x={w / 2} y={h * 0.38} size={h * 0.45} c="#f27ab8" />
    </g>
  ),
  portrait: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#b9a6e6" />
      <path d={`M${w * 0.2} ${h} Q${w * 0.5} ${h * 0.55} ${w * 0.8} ${h} Z`} fill="#3f8ef0" stroke={OL} strokeWidth="2" />
      <circle cx={w / 2} cy={h * 0.45} r={h * 0.2} fill="#f6c9a0" stroke={OL} strokeWidth="2" />
      <path d={`M${w * 0.32} ${h * 0.4} Q${w / 2} ${h * 0.12} ${w * 0.68} ${h * 0.4}`} fill="#7a4a2a" />
      <circle cx={w * 0.44} cy={h * 0.47} r="2" fill={OL} />
      <circle cx={w * 0.56} cy={h * 0.47} r="2" fill={OL} />
    </g>
  ),
  night: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#26306b" />
      <Glyph name="moon" x={w * 0.7} y={h * 0.32} size={h * 0.3} c="#f7e9a0" />
      {[0.15, 0.35, 0.5, 0.2, 0.85].map((f, i) => (
        <circle key={i} cx={w * f} cy={h * (0.2 + (i % 3) * 0.18)} r="2" fill="#fff" />
      ))}
      <path d={`M0 ${h * 0.85} Q${w / 2} ${h * 0.7} ${w} ${h * 0.85} V${h} H0 Z`} fill="#1a2148" />
    </g>
  ),
  cat: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#ffe7a8" />
      <path d={`M${w * 0.3} ${h * 0.35} L${w * 0.35} ${h * 0.15} L${w * 0.45} ${h * 0.3} L${w * 0.55} ${h * 0.3} L${w * 0.65} ${h * 0.15} L${w * 0.7} ${h * 0.35} Q${w * 0.8} ${h * 0.9} ${w * 0.5} ${h * 0.9} Q${w * 0.2} ${h * 0.9} ${w * 0.3} ${h * 0.35} Z`} fill="#f59a3a" stroke={OL} strokeWidth="2" />
      <circle cx={w * 0.42} cy={h * 0.45} r="3" fill={OL} />
      <circle cx={w * 0.58} cy={h * 0.45} r="3" fill={OL} />
    </g>
  ),
  abstract: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#fff6e0" />
      <circle cx={w * 0.3} cy={h * 0.4} r={h * 0.22} fill="#ec4f4f" />
      <rect x={w * 0.45} y={h * 0.2} width={w * 0.35} height={h * 0.4} fill="#3f8ef0" />
      <path d={`M${w * 0.2} ${h * 0.9} L${w * 0.5} ${h * 0.55} L${w * 0.8} ${h * 0.9} Z`} fill="#f7d23e" />
    </g>
  ),
  ship: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#bfe6ff" />
      <rect y={h * 0.7} width={w} height={h * 0.3} fill="#3f8ef0" />
      <path d={`M${w * 0.2} ${h * 0.68} H${w * 0.8} L${w * 0.7} ${h * 0.82} H${w * 0.3} Z`} fill="#a8714a" stroke={OL} strokeWidth="2" />
      <path d={`M${w * 0.5} ${h * 0.68} V${h * 0.18} L${w * 0.75} ${h * 0.6} Z`} fill="#fff" stroke={OL} strokeWidth="2" />
    </g>
  ),
  space: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#1b1640" />
      <circle cx={w * 0.4} cy={h * 0.5} r={h * 0.22} fill="#f59a3a" stroke={OL} strokeWidth="2" />
      <ellipse cx={w * 0.4} cy={h * 0.5} rx={h * 0.38} ry={h * 0.08} fill="none" stroke="#f7d23e" strokeWidth="3" />
      <circle cx={w * 0.8} cy={h * 0.2} r="2" fill="#fff" />
      <circle cx={w * 0.15} cy={h * 0.8} r="2" fill="#fff" />
    </g>
  ),
  blank: (w, h) => <rect width={w} height={h} fill="#f6f0e0" />,
  sunburst: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#3fb0e0" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={`M${w / 2} ${h / 2} L${w / 2 + Math.cos((i * Math.PI) / 6) * w} ${h / 2 + Math.sin((i * Math.PI) / 6) * w} L${w / 2 + Math.cos(((i + 0.5) * Math.PI) / 6) * w} ${h / 2 + Math.sin(((i + 0.5) * Math.PI) / 6) * w} Z`} fill={i % 2 ? "#f7d23e" : "#f59a3a"} />
      ))}
      <circle cx={w / 2} cy={h / 2} r={w * 0.2} fill="#ec4f4f" stroke={OL} strokeWidth="3" />
      <circle cx={w * 0.43} cy={h * 0.46} r={w * 0.025} fill={OL} />
      <circle cx={w * 0.57} cy={h * 0.46} r={w * 0.025} fill={OL} />
      <path d={`M${w * 0.42} ${h * 0.56} Q${w / 2} ${h * 0.63} ${w * 0.58} ${h * 0.56}`} stroke={OL} strokeWidth="3" fill="none" />
      <path d={`M0 ${h * 0.92} H${w}`} stroke="#47c06a" strokeWidth={h * 0.16} />
    </g>
  ),
  mosaic: (w, h) => (
    <g>
      <rect width={w} height={h} fill="#40357a" />
      <path d={`M${w / 2} ${h * 0.08} L${w * 0.85} ${h / 2} L${w / 2} ${h * 0.92} L${w * 0.15} ${h / 2} Z`} fill="#d8b8ff" stroke={OL} strokeWidth="3" />
      <path d={`M${w / 2} ${h * 0.08} L${w / 2} ${h * 0.92} M${w * 0.15} ${h / 2} H${w * 0.85}`} stroke="#a364e8" strokeWidth="3" />
      <circle cx={w / 2} cy={h / 2} r={w * 0.12} fill="#f27ab8" stroke={OL} strokeWidth="3" />
      <path d={`M${w * 0.08} ${h * 0.08} L${w * 0.25} ${h * 0.12} L${w * 0.12} ${h * 0.26} Z M${w * 0.92} ${h * 0.92} L${w * 0.75} ${h * 0.88} L${w * 0.88} ${h * 0.74} Z`} fill="#3fd0e0" />
    </g>
  ),
};

/** A picture with a code or word written across it (rotate-puzzle pages). */
export function TextPic({ pic, text, w, h }) {
  const Pic = PICS[pic] || PICS.blank;
  return (
    <g>
      {Pic(w, h)}
      {text && (
        <g>
          <rect x={w * 0.1} y={h * 0.36} width={w * 0.8} height={h * 0.28} rx={h * 0.05} fill="#fff6e0" stroke={OL} strokeWidth="3" />
          <text x={w / 2} y={h * 0.585} textAnchor="middle" fontSize={Math.min(h * 0.22, (w * 0.75) / (text.length * 0.65))} fontWeight="900" fill={OL} fontFamily="'Trebuchet MS', Verdana, sans-serif" letterSpacing="2">
            {text}
          </text>
        </g>
      )}
    </g>
  );
}

