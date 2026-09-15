/**
 * Cozy Cleanup — the guidance-arrow overlay. This is the "most important
 * upgrade" the redesign asked for: whenever a tool is selected, an
 * animated arrow sweeps from that tool (or from a movable object, for the
 * Hand tool) toward the nearest place it's needed.
 *
 * Two arrow modes, one renderer:
 *   - 'tool'   surface tools (duster/vacuum/mop/spray/cloth/sponge/brush):
 *              arrow runs from the active tool-tray button up to the
 *              dirty region. Needs real DOM measurement (tray button +
 *              room box) since those live in different flex boxes.
 *   - 'object' Hand tool: arrow runs from the misplaced object's own
 *              position to where it belongs — both already in room-percent
 *              space, so no cross-container measurement is needed.
 *
 * Rendered as one absolutely-positioned SVG covering the whole `.cc-gameplay`
 * root, pointer-events:none, so it never steals a single cleaning stroke.
 */
import { useEffect, useRef, useState } from "react";
import { buildArrowGeometry } from "../engine/guidance.js";

export default function GuidanceOverlay({ gameplayRef, roomRef, trayRef, target, mode, visible, label }) {
  const [geom, setGeom] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!visible || !target) { setGeom(null); return undefined; }

    const compute = () => {
      const gpEl = gameplayRef.current;
      const roomEl = roomRef.current;
      if (!gpEl || !roomEl) return;
      const gpRect = gpEl.getBoundingClientRect();
      const roomRect = roomEl.getBoundingClientRect();
      const region = target.region;
      const tx = roomRect.left - gpRect.left + ((region.x + region.w / 2) / 100) * roomRect.width;
      const ty = roomRect.top - gpRect.top + ((region.y + region.h / 2) / 100) * roomRect.height;

      let ox = null, oy = null;
      if (mode === "object" && target.from) {
        ox = roomRect.left - gpRect.left + (target.from.x / 100) * roomRect.width;
        oy = roomRect.top - gpRect.top + (target.from.y / 100) * roomRect.height;
      } else if (trayRef?.current) {
        const btn = trayRef.current.querySelector(".cc-tray__tool--active");
        if (btn) {
          const bRect = btn.getBoundingClientRect();
          ox = bRect.left - gpRect.left + bRect.width / 2;
          oy = bRect.top - gpRect.top + bRect.height * 0.1;
        }
      }
      if (ox == null) { setGeom(null); return; }
      setGeom({ w: gpRect.width, h: gpRect.height, x1: ox, y1: oy, x2: tx, y2: ty });
    };

    compute();
    const schedule = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(compute); };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (ro && gameplayRef.current) ro.observe(gameplayRef.current);
    window.addEventListener("resize", schedule);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, target, mode, gameplayRef, roomRef, trayRef]);

  if (!geom) return null;
  const { x1, y1, x2, y2 } = geom;
  const { d, head, chevrons } = buildArrowGeometry(x1, y1, x2, y2);

  return (
    <svg className="cc-guide-arrow" width={geom.w} height={geom.h} viewBox={`0 0 ${geom.w} ${geom.h}`} aria-hidden="true">
      <defs>
        <marker id="cc-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--cc-guide-color, #e0955f)" />
        </marker>
      </defs>
      <path d={d} className="cc-guide-arrow__glow" />
      <path d={d} className="cc-guide-arrow__line" markerEnd="url(#cc-arrowhead)" />
      {chevrons.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.angle})`}>
          <polygon className="cc-guide-arrow__chevron" style={{ animationDelay: `${c.delay}s` }} points="-4.5,-4 4.5,0 -4.5,4" />
        </g>
      ))}
      <circle className="cc-guide-arrow__target" cx={x2} cy={y2} r="14" />
      {label && (
        <text x={head.x} y={head.y - 12} textAnchor="middle" className="cc-guide-arrow__label">{label}</text>
      )}
    </svg>
  );
}
