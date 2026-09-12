/**
 * Liquid Sort — the liquid stacked inside one bottle.
 *
 * Renders `colors` (bottom -> top) clipped to the bottle's interior shape,
 * up to a continuous `displayUnits` height (may be fractional). This single
 * rule covers both directions of a pour:
 *   - destination (growing):  colors = the POST-pour array (longer),
 *     displayUnits animates oldLength -> newLength.
 *   - source (shrinking):     colors = the PRE-pour array (longer),
 *     displayUnits animates oldLength -> newLength (down).
 * In both cases the boundary band is drawn at its exact fractional height,
 * so the surface visibly rises/falls instead of jumping in whole units.
 *
 * A soft elliptical meniscus caps the exposed top surface, a couple of tiny
 * bubbles drift up right after `pourLandedNonce` changes, and the whole
 * liquid body gets a brief ripple squash at the same moment.
 */
import { useEffect, useRef, useState } from "react";
import { getBottleGeometry, clipId } from "./BottleGlass.jsx";
import { liquidGradId } from "./GameDefs.jsx";
import { colorInfo } from "../data/colors.js";
import { CAPACITY } from "../systems/pourRules.js";

export default function LiquidLayer({
  colors,
  displayUnits,
  styleId = "classic",
  capacity = CAPACITY,
  colorAssist = false,
  pourLandedNonce = 0,
  animationsOn = true,
}) {
  const geo = getBottleGeometry(styleId);
  const unitH = geo.liquidHeight / capacity;
  const units = displayUnits == null ? colors.length : displayUnits;

  const [ripple, setRipple] = useState(0);
  const [bubbles, setBubbles] = useState([]);
  const nonceRef = useRef(pourLandedNonce);
  useEffect(() => {
    if (pourLandedNonce === nonceRef.current) return;
    nonceRef.current = pourLandedNonce;
    if (!animationsOn) return;
    setRipple((r) => r + 1);
    const n = 1 + Math.floor(Math.random() * 3);
    const fresh = Array.from({ length: n }, (_, i) => ({
      id: `${pourLandedNonce}-${i}`,
      dx: (Math.random() - 0.5) * geo.bodyHalf * 0.9,
      delay: Math.random() * 220,
    }));
    setBubbles((b) => [...b, ...fresh]);
    const t = setTimeout(() => {
      setBubbles((b) => b.filter((x) => !fresh.some((f) => f.id === x.id)));
    }, 1000);
    return () => clearTimeout(t);
  }, [pourLandedNonce, animationsOn, geo.bodyHalf]);

  if (units <= 0) return null;

  const fullCount = Math.floor(units + 1e-6);
  const frac = units - fullCount;
  const bands = [];
  for (let i = 0; i < fullCount && i < colors.length; i++) {
    bands.push({ color: colors[i], height: unitH, index: i });
  }
  if (frac > 0.001 && fullCount < colors.length) {
    bands.push({ color: colors[fullCount], height: unitH * frac, index: fullCount });
  }

  // stack bottom -> top: band[0] sits on the bottle floor
  let yCursor = geo.liquidBottom;
  const positioned = bands.map((b) => {
    const yTop = yCursor - b.height;
    const rect = { ...b, yTop, yBottom: yCursor };
    yCursor = yTop;
    return rect;
  });
  const surfaceY = positioned.length ? positioned[positioned.length - 1].yTop : geo.liquidBottom;
  const topColor = positioned.length ? positioned[positioned.length - 1].color : null;
  const rectX = geo.cx - geo.bodyHalf - 3;
  const rectW = geo.bodyHalf * 2 + 6;

  return (
    <g clipPath={`url(#${clipId(styleId)})`}>
      <g className={ripple ? "ls-liquid-ripple" : undefined} key={ripple} style={{ transformOrigin: `${geo.cx}px ${geo.liquidBottom}px` }}>
        {positioned.map((b, idx) => {
          const nextColor = idx < positioned.length - 1 ? positioned[idx + 1].color : null;
          const showBoundary = nextColor !== null && nextColor !== b.color;
          return (
          <g key={b.index}>
            <rect x={rectX} y={b.yTop - 0.5} width={rectW} height={b.height + 1} fill={`url(#${liquidGradId(b.color)})`} />
            {/* boundary highlight only where two DIFFERENT colors actually meet */}
            {showBoundary && <rect x={rectX} y={b.yTop - 0.4} width={rectW} height="0.8" fill="#ffffff" opacity="0.16" />}
            {colorAssist && b.height > unitH * 0.6 && (
              <text
                x={geo.cx} y={b.yTop + b.height / 2 + 3.2}
                textAnchor="middle" fontSize="7.5" fill="#ffffff"
                stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" paintOrder="stroke"
                style={{ fontWeight: 700, pointerEvents: "none" }}
              >
                {colorInfo(b.color).glyph}
              </text>
            )}
          </g>
          );
        })}

        {/* meniscus: soft curved surface highlight on the exposed top layer */}
        {topColor && (
          <>
            <ellipse cx={geo.cx} cy={surfaceY} rx={geo.bodyHalf - 1} ry={Math.min(3.4, unitH * 0.35)} fill={colorInfo(topColor).top} opacity="0.9" />
            <ellipse cx={geo.cx - geo.bodyHalf * 0.28} cy={surfaceY - 0.6} rx={geo.bodyHalf * 0.32} ry={Math.min(1.4, unitH * 0.18)} fill="#ffffff" opacity="0.5" />
          </>
        )}
      </g>

      {/* thin glass reflection streak passing over the liquid, left third of the body */}
      <rect
        x={geo.cx - geo.bodyHalf * 0.62} y={geo.liquidTop} width={geo.bodyHalf * 0.22}
        height={geo.liquidBottom - geo.liquidTop} fill="#ffffff" opacity="0.07"
      />

      {/* bubbles */}
      {bubbles.map((bub) => (
        <circle
          key={bub.id}
          className="ls-bubble"
          cx={geo.cx + bub.dx}
          cy={geo.liquidBottom - unitH * 0.3}
          r={0.9 + Math.random() * 0.7}
          fill="#ffffff"
          opacity="0.55"
          style={{ animationDelay: `${bub.delay}ms`, transformOrigin: `${geo.cx + bub.dx}px ${geo.liquidBottom}px` }}
        />
      ))}
    </g>
  );
}
