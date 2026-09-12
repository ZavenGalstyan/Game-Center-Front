/**
 * Liquid Sort — the visible liquid stream during a pour.
 *
 * Rendered as a single absolutely-positioned SVG overlay covering the whole
 * board (position:absolute; inset:0; pointer-events:none), so it can draw a
 * path directly in board-pixel coordinates from the source bottle's neck to
 * the destination bottle's opening. A gentle downward bow gives it a
 * gravity-fed look; an animated dash pattern reads as continuous flow.
 */
import { streamGradId } from "./GameDefs.jsx";

export default function LiquidStream({ x1, y1, x2, y2, color, visible }) {
  if (!visible) return null;

  const midX = (x1 + x2) / 2;
  const bow = Math.max(10, Math.abs(x2 - x1) * 0.06);
  const path = `M ${x1} ${y1} Q ${midX} ${Math.max(y1, y2) + bow}, ${x2} ${y2}`;
  const width = Math.max(2.5, Math.min(6, Math.abs(x2 - x1) * 0.012 + 3));

  return (
    <svg className="ls-stream" aria-hidden="true">
      {/* soft luminous glow behind the stream — reads well against a dark background */}
      <path
        d={path}
        fill="none"
        stroke={`url(#${streamGradId(color)})`}
        strokeWidth={width * 2.2}
        strokeLinecap="round"
        className="ls-stream__glow"
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#${streamGradId(color)})`}
        strokeWidth={width}
        strokeLinecap="round"
        className="ls-stream__flow"
      />
      <path
        d={path}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth={Math.max(1, width * 0.24)}
        strokeLinecap="round"
        strokeDasharray="5 7"
        className="ls-stream__shimmer"
        transform={`translate(-${width * 0.16}, 0)`}
      />
      {/* small splash where the stream meets the destination */}
      <circle cx={x2} cy={y2} r={width * 0.9} fill={`url(#${streamGradId(color)})`} opacity="0.6" className="ls-stream__splash" />
    </svg>
  );
}
