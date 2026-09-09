/**
 * Delivery Rush — speedometer.
 *
 * A 240-degree analogue arc with a live needle and a digital read-out in the
 * middle, drawn as inline SVG so it stays crisp at any size and costs nothing
 * to animate — only the needle transform and two text nodes change.
 *
 * The arc is tinted toward the district accent as the needle climbs, which
 * gives peripheral feedback about speed without the player looking at it.
 */

const START = 215; // compass-style bearing: 215 is lower-left
const SWEEP = 250;

function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, from, to) {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export default function Speedometer({ speed = 0, max = 130, gear = "N", braking = false }) {
  const kmh = Math.max(0, Math.round(speed));
  const frac = Math.max(0, Math.min(1, speed / max));
  const angle = START + SWEEP * frac;
  const cx = 60;
  const cy = 60;

  const ticks = [];
  for (let i = 0; i <= 8; i++) {
    const deg = START + (SWEEP * i) / 8;
    const [x0, y0] = polar(cx, cy, 46, deg);
    const [x1, y1] = polar(cx, cy, i % 2 === 0 ? 37 : 41, deg);
    ticks.push(
      <line
        key={i}
        x1={x0} y1={y0} x2={x1} y2={y1}
        className={i % 2 === 0 ? "dr-speedo__tick dr-speedo__tick--major" : "dr-speedo__tick"}
      />,
    );
  }

  return (
    <div className={`dr-speedo${braking ? " is-braking" : ""}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d={arcPath(cx, cy, 46, START, START + SWEEP)} className="dr-speedo__track" />
        <path
          d={arcPath(cx, cy, 46, START, Math.max(START + 0.01, angle))}
          className="dr-speedo__fill"
        />
        {ticks}
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "60px 60px" }}>
          <path d="M60 22 L62.6 60 L57.4 60 Z" className="dr-speedo__needle" />
        </g>
        <circle cx={cx} cy={cy} r="6.5" className="dr-speedo__hub" />
      </svg>
      <div className="dr-speedo__read">
        <span className="dr-speedo__num">{kmh}</span>
        <span className="dr-speedo__unit">KM/H</span>
      </div>
      <span className={`dr-speedo__gear dr-speedo__gear--${gear.toLowerCase()}`}>{gear}</span>
    </div>
  );
}
