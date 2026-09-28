/**
 * Dentist Studio — original stylised patient, assembled from parts.
 *
 * viewBox 0 0 200 220: head centred near (100, 92), shoulders below.
 * Reactions are deliberately subtle: a slow blink, eyes that drift a
 * little toward `look`, and a relaxed → happy smile. Never pain or fear.
 *
 * props: patient (getPatient()), mood "calm" | "smile" | "beam",
 *        bib (dental bib over the shoulders), look (-1..1), head (head only)
 */
import { shade } from "../render/color.js";

const HEAD = {
  round: { rx: 52, ry: 55 },
  oval: { rx: 47, ry: 58 },
  heart: { rx: 50, ry: 56 },
  square: { rx: 50, ry: 55 },
};

function facePath(shape, cx, cy, rx, ry) {
  if (shape === "heart") {
    return `M${cx - rx},${cy - 8} C${cx - rx},${cy - ry - 4} ${cx + rx},${cy - ry - 4} ${cx + rx},${cy - 8}
      C${cx + rx},${cy + ry * 0.45} ${cx + 16},${cy + ry} ${cx},${cy + ry}
      C${cx - 16},${cy + ry} ${cx - rx},${cy + ry * 0.45} ${cx - rx},${cy - 8}Z`;
  }
  if (shape === "square") {
    return `M${cx - rx},${cy - 10} C${cx - rx},${cy - ry - 2} ${cx + rx},${cy - ry - 2} ${cx + rx},${cy - 10}
      L${cx + rx - 2},${cy + ry * 0.5} C${cx + rx - 6},${cy + ry - 2} ${cx + 22},${cy + ry} ${cx},${cy + ry}
      C${cx - 22},${cy + ry} ${cx - rx + 6},${cy + ry - 2} ${cx - rx + 2},${cy + ry * 0.5}Z`;
  }
  return `M${cx - rx},${cy} A${rx},${ry} 0 1,1 ${cx + rx},${cy} A${rx},${ry} 0 1,1 ${cx - rx},${cy}Z`;
}

function HairBack({ style, color, cx, cy, rx, ry }) {
  const d = shade(color, -0.12);
  switch (style) {
    case "long":
      return <path d={`M${cx - rx - 8},${cy - 10} C${cx - rx - 14},${cy + 60} ${cx - rx - 6},${cy + 104} ${cx - rx + 6},${cy + 112} L${cx + rx - 6},${cy + 112} C${cx + rx + 6},${cy + 104} ${cx + rx + 14},${cy + 60} ${cx + rx + 8},${cy - 10}Z`} fill={d} />;
    case "bob":
      return <path d={`M${cx - rx - 9},${cy - 14} C${cx - rx - 12},${cy + 30} ${cx - rx - 8},${cy + 52} ${cx - rx + 8},${cy + 56} L${cx + rx - 8},${cy + 56} C${cx + rx + 8},${cy + 52} ${cx + rx + 12},${cy + 30} ${cx + rx + 9},${cy - 14}Z`} fill={d} />;
    case "wavy":
      return <path d={`M${cx - rx - 8},${cy - 10} q-10,20 0,40 q-10,20 4,44 L${cx + rx + 4},${cy + 74} q14,-24 4,-44 q10,-20 0,-40Z`} fill={d} />;
    case "afro":
      return <circle cx={cx} cy={cy - 16} r={rx + 26} fill={d} />;
    case "pigtails":
      return (
        <g fill={d}>
          <circle cx={cx - rx - 14} cy={cy + 8} r="17" />
          <circle cx={cx + rx + 14} cy={cy + 8} r="17" />
        </g>
      );
    case "puffs":
      return (
        <g fill={d}>
          <circle cx={cx - rx + 6} cy={cy - ry + 2} r="24" />
          <circle cx={cx + rx - 6} cy={cy - ry + 2} r="24" />
        </g>
      );
    case "ponytail":
      return <path d={`M${cx + rx - 10},${cy - 30} q34,10 26,60 q-6,26 -20,30 q6,-30 -14,-60Z`} fill={d} />;
    case "bun":
      return <circle cx={cx} cy={cy - ry - 8} r="19" fill={d} />;
    default:
      return null;
  }
}

function HairFront({ style, color, cx, cy, rx, ry }) {
  const hi = shade(color, 0.18);
  const top = cy - ry;
  switch (style) {
    case "bald":
      return (
        <g fill={color}>
          <path d={`M${cx - rx},${cy - 4} q2,-18 12,-24 l2,20Z`} />
          <path d={`M${cx + rx},${cy - 4} q-2,-18 -12,-24 l-2,20Z`} />
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          {[-44, -30, -14, 2, 18, 34, 46].map((dx, i) => (
            <circle key={i} cx={cx + dx} cy={top + 10 + Math.abs(dx) * 0.28} r="15" />
          ))}
        </g>
      );
    case "afro":
      return (
        <path d={`M${cx - rx - 2},${cy - 6} C${cx - rx - 4},${top - 10} ${cx + rx + 4},${top - 10} ${cx + rx + 2},${cy - 6} C${cx + 30},${top + 16} ${cx - 30},${top + 16} ${cx - rx - 2},${cy - 6}Z`} fill={color} />
      );
    case "spiky":
      return (
        <path d={`M${cx - rx - 2},${cy - 4} L${cx - rx + 4},${top - 2} L${cx - 26},${top + 2} L${cx - 18},${top - 14} L${cx - 4},${top} L${cx + 6},${top - 16} L${cx + 16},${top + 2} L${cx + 30},${top - 10} L${cx + rx - 4},${top + 6} L${cx + rx + 2},${cy - 4} C${cx + 20},${top + 20} ${cx - 20},${top + 20} ${cx - rx - 2},${cy - 4}Z`} fill={color} />
      );
    case "side":
      return (
        <g>
          <path d={`M${cx - rx - 3},${cy - 2} C${cx - rx - 6},${top - 8} ${cx + rx + 6},${top - 8} ${cx + rx + 3},${cy - 4} C${cx + rx - 8},${top + 22} ${cx - 10},${top + 30} ${cx - rx + 4},${top + 30} Z`} fill={color} />
          <path d={`M${cx - 20},${top + 6} q24,-6 46,6`} stroke={hi} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      );
    case "short":
      return <path d={`M${cx - rx - 2},${cy - 6} C${cx - rx - 4},${top - 8} ${cx + rx + 4},${top - 8} ${cx + rx + 2},${cy - 6} C${cx + rx - 10},${top + 16} ${cx - rx + 10},${top + 16} ${cx - rx - 2},${cy - 6}Z`} fill={color} />;
    case "bob":
      return (
        <path d={`M${cx - rx - 8},${cy + 30} C${cx - rx - 12},${top - 12} ${cx + rx + 12},${top - 12} ${cx + rx + 8},${cy + 30} L${cx + rx - 4},${cy + 30} C${cx + rx - 6},${top + 30} ${cx + 10},${top + 22} ${cx - 6},${top + 26} C${cx - 26},${top + 30} ${cx - rx + 4},${top + 36} ${cx - rx + 4},${cy + 30}Z`} fill={color} />
      );
    default: {
      // long / wavy / pigtails / puffs / ponytail / bun — a centre-parted cap
      return (
        <g>
          <path d={`M${cx - rx - 5},${cy + 10} C${cx - rx - 8},${top - 12} ${cx + rx + 8},${top - 12} ${cx + rx + 5},${cy + 10} C${cx + rx - 2},${top + 18} ${cx + 6},${top + 10} ${cx},${top + 6} C${cx - 6},${top + 10} ${cx - rx + 2},${top + 18} ${cx - rx - 5},${cy + 10}Z`} fill={color} />
          <path d={`M${cx - 28},${top + 10} q14,-10 26,-6`} stroke={hi} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
        </g>
      );
    }
  }
}

export default function PatientFigure({ patient: p, mood = "calm", bib = false, look = 0, head = false, className = "" }) {
  const child = p.age === "child";
  const senior = p.age === "senior";
  const H = HEAD[p.face] || HEAD.round;
  const rx = H.rx * (child ? 1.04 : 1);
  const ry = H.ry * (child ? 0.98 : 1);
  const cx = 100;
  const cy = 92;
  const eyeY = cy + (child ? 8 : 4);
  const eyeDX = child ? 20 : 19;
  const eyeR = child ? 6.4 : 5.4;
  const lx = look * 2.2;
  const skin = p.skin;
  const outfit = p.outfit;
  const mouthY = cy + (child ? 30 : 30);
  const hairGrey = senior;
  const hairColor = p.hair.color;
  const vb = head ? "12 2 176 172" : "0 0 200 220";

  return (
    <svg className={`dst-patient ${className}`} viewBox={vb} aria-hidden="true">
      {!head && (
        <g>
          <path d="M28 220 C30 180 58 160 100 160 C142 160 170 180 172 220Z" fill={outfit} />
          <path d="M28 220 C30 180 58 160 100 160" fill="none" stroke={shade(outfit, 0.25)} strokeWidth="4" opacity="0.6" />
          <path d="M84 158 L100 176 L116 158" fill={shade(outfit, -0.12)} />
        </g>
      )}
      <rect x={cx - 13} y={cy + ry - 10} width="26" height="26" rx="10" fill={p.shade} />
      <HairBack style={p.hair.style} color={hairColor} cx={cx} cy={cy} rx={rx} ry={ry} />
      {/* ears */}
      <ellipse cx={cx - rx + 2} cy={cy + 6} rx="8" ry="11" fill={p.shade} />
      <ellipse cx={cx + rx - 2} cy={cy + 6} rx="8" ry="11" fill={p.shade} />
      {p.accessory === "earrings" && (
        <g fill="#ffd36a" stroke="#d9a53a" strokeWidth="1">
          <circle cx={cx - rx + 1} cy={cy + 20} r="3.6" />
          <circle cx={cx + rx - 1} cy={cy + 20} r="3.6" />
        </g>
      )}
      <path d={facePath(p.face, cx, cy, rx, ry)} fill={skin} />
      <path d={facePath(p.face, cx, cy, rx, ry)} fill="none" stroke={p.shade} strokeWidth="1.5" opacity="0.5" />
      {/* cheeks */}
      <ellipse cx={cx - 30} cy={eyeY + 18} rx="10" ry="6.5" fill={p.blush} opacity={mood === "calm" ? 0.45 : 0.65} />
      <ellipse cx={cx + 30} cy={eyeY + 18} rx="10" ry="6.5" fill={p.blush} opacity={mood === "calm" ? 0.45 : 0.65} />
      {p.accessory === "freckles" && (
        <g fill={shade(p.shade, -0.1)} opacity="0.7">
          {[[-34, 12], [-28, 16], [-38, 17], [30, 12], [36, 16], [26, 17]].map(([dx, dy], i) => (
            <circle key={i} cx={cx + dx} cy={eyeY + dy} r="1.4" />
          ))}
        </g>
      )}
      {p.accessory === "beard" && (
        <path d={`M${cx - rx + 8},${cy + 12} C${cx - rx + 10},${cy + ry + 8} ${cx + rx - 10},${cy + ry + 8} ${cx + rx - 8},${cy + 12} C${cx + 22},${cy + 34} ${cx - 22},${cy + 34} ${cx - rx + 8},${cy + 12}Z`} fill={hairGrey ? "#cfcac4" : hairColor} opacity="0.92" />
      )}
      {/* eyes (blink via CSS) */}
      <g className="dst-eyes" style={{ transformOrigin: `${cx}px ${eyeY}px` }}>
        {mood === "beam" ? (
          <g fill="none" stroke="#3a2a24" strokeWidth="3" strokeLinecap="round">
            <path d={`M${cx - eyeDX - 6},${eyeY + 1} q6,-7 12,0`} />
            <path d={`M${cx + eyeDX - 6},${eyeY + 1} q6,-7 12,0`} />
          </g>
        ) : (
          <g>
            <ellipse cx={cx - eyeDX + lx} cy={eyeY} rx={eyeR * 0.9} ry={eyeR} fill={p.eyes} />
            <ellipse cx={cx + eyeDX + lx} cy={eyeY} rx={eyeR * 0.9} ry={eyeR} fill={p.eyes} />
            <circle cx={cx - eyeDX + lx + 1.8} cy={eyeY - 2} r={eyeR * 0.36} fill="#fff" />
            <circle cx={cx + eyeDX + lx + 1.8} cy={eyeY - 2} r={eyeR * 0.36} fill="#fff" />
          </g>
        )}
      </g>
      {/* brows */}
      <g stroke={hairGrey ? "#b9b4ae" : shade(hairColor, -0.05)} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d={`M${cx - eyeDX - 7},${eyeY - 12} q7,${mood === "calm" ? -4 : -6} 14,-1`} />
        <path d={`M${cx + eyeDX - 7},${eyeY - 13} q7,${mood === "calm" ? -3 : -6} 14,1`} />
      </g>
      {senior && (
        <g stroke={p.shade} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8">
          <path d={`M${cx - eyeDX - 13},${eyeY - 2} q-3,4 0,8`} />
          <path d={`M${cx + eyeDX + 13},${eyeY - 2} q3,4 0,8`} />
        </g>
      )}
      {p.accessory === "glasses" && (
        <g fill="rgba(220,240,255,0.25)" stroke="#4a5568" strokeWidth="2.4">
          <circle cx={cx - eyeDX} cy={eyeY} r="11.5" />
          <circle cx={cx + eyeDX} cy={eyeY} r="11.5" />
          <path d={`M${cx - eyeDX + 11.5},${eyeY - 1} q${eyeDX - 11.5},-5 ${2 * (eyeDX - 11.5)},0`} fill="none" />
        </g>
      )}
      {/* nose */}
      <path d={`M${cx - 1},${eyeY + 8} q-5,9 2,11`} stroke={p.shade} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* mouth */}
      {mood === "calm" && <path d={`M${cx - 10},${mouthY} q10,7 20,0`} stroke={shade(p.lip, -0.25)} strokeWidth="3" fill="none" strokeLinecap="round" />}
      {mood !== "calm" && (
        <g>
          <path d={`M${cx - 15},${mouthY - 2} q15,${mood === "beam" ? 20 : 15} 30,0 Z`} fill={shade(p.lip, -0.35)} />
          <path d={`M${cx - 13},${mouthY - 1.5} q13,4 26,0 l-1.5,4 q-11.5,3 -23,0Z`} fill="#fffdf6" />
          <path d={`M${cx - 15},${mouthY - 2} q15,${mood === "beam" ? 20 : 15} 30,0`} stroke={shade(p.lip, -0.25)} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      <HairFront style={p.hair.style} color={hairColor} cx={cx} cy={cy} rx={rx} ry={ry} />
      {p.accessory === "headband" && <path d={`M${cx - rx + 2},${cy - 22} C${cx - rx + 10},${cy - ry - 8} ${cx + rx - 10},${cy - ry - 8} ${cx + rx - 2},${cy - 22}`} stroke={shade(outfit, -0.15)} strokeWidth="7" fill="none" strokeLinecap="round" />}
      {p.accessory === "clip" && (
        <path d={`M${cx + 30},${cy - ry + 14} l3,6 6.5,1 -4.7,4.5 1.1,6.4 -5.9,-3.1 -5.9,3.1 1.1,-6.4 -4.7,-4.5 6.5,-1z`} fill="#ffd36a" stroke="#e0a93e" strokeWidth="1" />
      )}
      {bib && !head && (
        <g>
          <path d="M58 184 C70 172 130 172 142 184 L136 220 L64 220Z" fill="#aee3f5" />
          <path d="M58 184 C70 172 130 172 142 184" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.8" />
          <path d="M60 180 L46 168 M140 180 L154 168" stroke="#c8d4dc" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
