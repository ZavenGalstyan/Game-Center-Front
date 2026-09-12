/**
 * Liquid Sort — the glass bottle shell (SVG).
 *
 * One shared coordinate system (viewBox 0 0 100 190) for every cosmetic
 * style: a style only tweaks neck width/height, shoulder height, body width
 * and corner rounding, so capacity/liquid math never has to special-case a
 * style. `getBottleGeometry()` is the single source of truth for where the
 * neck, shoulders, body and liquid-fillable region sit — <LiquidLayer> and
 * the pour-animation code both import it instead of re-deriving numbers.
 *
 * Silhouette: flat rim -> short neck -> smooth rounded-shoulder curve ->
 * straight body walls -> rounded (elliptical arc) bottom — a compact
 * potion/lab-bottle proportion (body ~76-84% of width, neck ~32-38%, neck
 * height ~18-24% of total height), not a tall thin cylinder.
 *
 * All defs (clip paths, glass gradients) depend only on the STYLE, not on
 * which bottle instance is on screen, so they are declared once in
 * <GameDefs> and referenced here by id — no per-bottle duplication.
 */
export const VB_W = 100;
export const VB_H = 190;

const STYLE_GEOMETRY = {
  classic: { neckW: 34, neckH: 36, shoulderH: 30, bodyW: 80, bottomRy: 28 },
  round: { neckW: 30, neckH: 28, shoulderH: 38, bodyW: 84, bottomRy: 36 },
  tall: { neckW: 30, neckH: 40, shoulderH: 24, bodyW: 70, bottomRy: 24 },
  lab: { neckW: 28, neckH: 26, shoulderH: 42, bodyW: 82, bottomRy: 32 },
  elegant: { neckW: 28, neckH: 42, shoulderH: 20, bodyW: 66, bottomRy: 22 },
  legend: { neckW: 32, neckH: 34, shoulderH: 32, bodyW: 78, bottomRy: 32 },
};

export const STYLE_IDS = Object.keys(STYLE_GEOMETRY);

const RIM_Y = 8;

export function getBottleGeometry(styleId = "classic") {
  const g = STYLE_GEOMETRY[styleId] || STYLE_GEOMETRY.classic;
  const cx = VB_W / 2;
  const neckHalf = g.neckW / 2;
  const bodyHalf = g.bodyW / 2;
  const rimY = RIM_Y;
  const neckBottomY = rimY + g.neckH;
  const bodyTopY = neckBottomY + g.shoulderH;
  const bottomWallY = VB_H - g.bottomRy - 6; // leave a little floor margin
  const bottomTipY = bottomWallY + g.bottomRy;

  return {
    cx, neckHalf, bodyHalf, rimY, neckBottomY, bodyTopY, bottomWallY, bottomTipY,
    bottomRy: g.bottomRy,
    liquidTop: bodyTopY,
    liquidBottom: bottomTipY,
    liquidHeight: bottomTipY - bodyTopY,
  };
}

/**
 * Outer glass silhouette path (rim through rounded bottom, mirrored).
 * The shoulder curve control points sit further out (0.62/0.38 split) than
 * a plain S-curve so the transition reads as a rounded shoulder rather than
 * a sharp taper.
 */
export function bottlePath(geo) {
  const { cx, neckHalf, bodyHalf, rimY, neckBottomY, bodyTopY, bottomWallY, bottomRy } = geo;
  const shoulderH = bodyTopY - neckBottomY;
  return [
    `M ${cx - neckHalf} ${rimY}`,
    `L ${cx - neckHalf} ${neckBottomY}`,
    `C ${cx - neckHalf} ${neckBottomY + shoulderH * 0.62}, ${cx - bodyHalf} ${bodyTopY - shoulderH * 0.38}, ${cx - bodyHalf} ${bodyTopY}`,
    `L ${cx - bodyHalf} ${bottomWallY}`,
    `A ${bodyHalf} ${bottomRy} 0 0 0 ${cx + bodyHalf} ${bottomWallY}`,
    `L ${cx + bodyHalf} ${bodyTopY}`,
    `C ${cx + bodyHalf} ${bodyTopY - shoulderH * 0.38}, ${cx + neckHalf} ${neckBottomY + shoulderH * 0.62}, ${cx + neckHalf} ${neckBottomY}`,
    `L ${cx + neckHalf} ${rimY}`,
    "Z",
  ].join(" ");
}

/** Interior-liquid clip path: body + rounded bottom only, no neck/shoulder. */
export function liquidClipPath(geo) {
  const { cx, bodyHalf, bodyTopY, bottomWallY, bottomRy } = geo;
  return [
    `M ${cx - bodyHalf} ${bodyTopY}`,
    `L ${cx - bodyHalf} ${bottomWallY}`,
    `A ${bodyHalf} ${bottomRy} 0 0 0 ${cx + bodyHalf} ${bottomWallY}`,
    `L ${cx + bodyHalf} ${bodyTopY}`,
    "Z",
  ].join(" ");
}

export const clipId = (styleId) => `ls-clip-${styleId}`;
export const glassGradId = (styleId) => `ls-glass-${styleId}`;
export const rimGradId = (styleId) => `ls-rim-${styleId}`;

/**
 * One clipPath + gradients per style — rendered once (by <GameDefs>),
 * reused by every bottle of that style on screen.
 */
export function BottleStyleDefs({ styleId }) {
  const geo = getBottleGeometry(styleId);
  return (
    <g>
      <clipPath id={clipId(styleId)}>
        <path d={liquidClipPath(geo)} />
      </clipPath>
      {/* left-third bright reflection / right-third dimmer reflection, over a mostly-transparent middle */}
      <linearGradient id={glassGradId(styleId)} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="10%" stopColor="#ffffff" stopOpacity="0.5" />
        <stop offset="22%" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="70%" stopColor="#ffffff" stopOpacity="0.02" />
        <stop offset="86%" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={rimGradId(styleId)} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
      </linearGradient>
    </g>
  );
}

export function BottleGlassBack({ styleId = "classic" }) {
  const geo = getBottleGeometry(styleId);
  const path = bottlePath(geo);
  return (
    <>
      <ellipse cx={geo.cx} cy={geo.bottomTipY + 7} rx={geo.bodyHalf * 0.9} ry="6" fill="#000" opacity="0.4" />
      <path d={path} fill="rgba(255,255,255,0.025)" />
    </>
  );
}

/**
 * Glass front: bright outer contour (must read clearly against a dark
 * background), a left/right reflection sweep, a rim highlight, a subtle
 * warm-tinted "thicker base" band, and a faint accent-colored environment
 * reflection so the glass feels lit by the room rather than flat white.
 */
export function BottleGlassFront({ styleId = "classic" }) {
  const geo = getBottleGeometry(styleId);
  const path = bottlePath(geo);
  return (
    <>
      {/* soft outer glow so the contour separates from a dark backdrop */}
      <path d={path} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4.5" />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.1" />
      <path d={path} fill={`url(#${glassGradId(styleId)})`} opacity="0.95" />

      {/* faint ambient accent reflection along the right edge */}
      <path
        d={path}
        fill="none"
        stroke="var(--ls-accent, #22d3ee)"
        strokeOpacity="0.16"
        strokeWidth="2.2"
        style={{ mixBlendMode: "screen" }}
      />

      <ellipse
        cx={geo.cx} cy={geo.rimY} rx={geo.neckHalf} ry="3.2"
        fill={`url(#${rimGradId(styleId)})`} stroke="rgba(255,255,255,0.75)" strokeWidth="0.8"
      />
      <ellipse cx={geo.cx} cy={geo.rimY} rx={geo.neckHalf * 0.62} ry="1.6" fill="rgba(4,8,14,0.55)" />

      {/* thicker glass base band + soft refraction glow */}
      <ellipse
        cx={geo.cx} cy={geo.bottomTipY - geo.bottomRy * 0.22} rx={geo.bodyHalf * 0.94} ry={geo.bottomRy * 0.24}
        fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.4"
      />
      <ellipse
        cx={geo.cx} cy={geo.bottomTipY - geo.bottomRy * 0.35} rx={geo.bodyHalf * 0.5} ry={geo.bottomRy * 0.3}
        fill="#ffffff" opacity="0.08"
      />
    </>
  );
}

export { STYLE_GEOMETRY };
