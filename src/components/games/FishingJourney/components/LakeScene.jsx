/**
 * Fishing Journey — the illustrated fishing environment.
 *
 * Pure CSS + inline SVG, no image assets. One component renders every location;
 * the `variant` prop (lake | river | marsh | ocean) only swaps the colour
 * palette and a couple of layer toggles via the `fj-scene--{variant}` class.
 *
 * Depth is built from parallax layers, back to front:
 *   sky (warm horizon) → sun + bloom + birds → clouds →
 *   3 gradient-shaded mountain ridges under an atmospheric haze →
 *   far shoreline pines → near sunlit pine band →
 *   water (horizon glow, sun reflection column, highlight lines, waves,
 *          sparkle glints) → underwater (reeds, rocks, drifting fish) →
 *   overlay (dock, rod, bobber)
 *
 *   quality   "low" drops the glow / reflections / sparkles / birds / haze and
 *             freezes motion, "medium" keeps a calm subset, "high" shows all
 *   children  overlay content drawn on top of the water
 */

/* deterministic pseudo-random so tree bands look organic but never reflow */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function Mountains() {
  return (
    <svg
      className="fj-scene__mountains"
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fjMtnFar" x1="0" y1="0" x2="0" y2="1">
          <stop className="fj-g fj-g--far-hi" offset="0" />
          <stop className="fj-g fj-g--far" offset="1" />
        </linearGradient>
        <linearGradient id="fjMtnMid" x1="0" y1="0" x2="0" y2="1">
          <stop className="fj-g fj-g--mid-hi" offset="0" />
          <stop className="fj-g fj-g--mid" offset="1" />
        </linearGradient>
        <linearGradient id="fjMtnNear" x1="0" y1="0" x2="0" y2="1">
          <stop className="fj-g fj-g--near-hi" offset="0" />
          <stop className="fj-g fj-g--near" offset="1" />
        </linearGradient>
      </defs>

      <path
        className="fj-scene__mtn fj-scene__mtn--far"
        d="M0 300V180l90-46 70 40 84-70 60 54 96-84 74 70 90-58 80 66 70-40 96 78 80-52 60 44V300Z"
      />
      <path
        className="fj-scene__mtn fj-scene__mtn--mid"
        d="M0 300V210l120-84 90 74 60-44 110 96 80-70 90 84 70-52 120 104 80-64 100 86 100-70V300Z"
      />
      {/* shadowed (west) faces of the near ridge */}
      <path
        className="fj-scene__mtn-shade"
        d="M160 148l90 74 8-58ZM470 150l110 96 6-60ZM760 152l110 96 4-58Z"
      />
      <path
        className="fj-scene__mtn fj-scene__mtn--near"
        d="M0 300V244l160-96 70 60 90-40 120 108 90-60 110 96 80-48 130 100 90-56 160 116V300Z"
      />
      <path
        className="fj-scene__mtn-snow"
        d="M160 148l24 20-13 3-11 12-11-13-14 4ZM470 150l26 22-14 3-11 13-12-14-15 4ZM760 152l25 22-13 3-11 13-12-14-14 3Z"
      />
      <path
        className="fj-scene__mtn-snow-shade"
        d="M160 168l11 13 11-12 13-3-11 22-13-3-11-8ZM470 172l12 14 11-13 14-3-12 24-13-3-12-8Z"
      />
      {/* atmospheric haze softening the distance */}
      <rect className="fj-scene__mtn-haze" x="0" y="0" width="1200" height="300" />
    </svg>
  );
}

function PineBand({ className, count, seed, viewH = 120, sunlit = false }) {
  const rand = rng(seed);
  const trees = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i + 0.5) * (1200 / count) + (rand() - 0.5) * 26;
    const h = viewH * (0.42 + rand() * 0.5);
    const w = h * (0.34 + rand() * 0.12);
    const b = viewH;
    trees.push(
      <path
        key={i}
        d={`M${x} ${b}
            L${x - w * 0.5} ${b} L${x - w * 0.34} ${b - h * 0.34}
            L${x - w * 0.22} ${b - h * 0.34} L${x - w * 0.3} ${b - h * 0.64}
            L${x - w * 0.16} ${b - h * 0.64} L${x} ${b - h}
            L${x + w * 0.16} ${b - h * 0.64} L${x + w * 0.3} ${b - h * 0.64}
            L${x + w * 0.22} ${b - h * 0.34} L${x + w * 0.34} ${b - h * 0.34}
            L${x + w * 0.5} ${b} Z`}
      />,
    );
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 1200 ${viewH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {sunlit && (
        <defs>
          <linearGradient id={`fjPine${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop className="fj-g fj-g--pine-hi" offset="0" />
            <stop className="fj-g fj-g--pine" offset="0.55" />
            <stop className="fj-g fj-g--pine-lo" offset="1" />
          </linearGradient>
        </defs>
      )}
      <g style={sunlit ? { fill: `url(#fjPine${seed})` } : undefined}>{trees}</g>
    </svg>
  );
}

function Birds() {
  return (
    <svg
      className="fj-scene__birds"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M40 30q4-5 8 0 4-5 8 0" />
      <path d="M58 24q3-4 6 0 3-4 6 0" />
      <path d="M30 40q3-4 6 0 3-4 6 0" />
    </svg>
  );
}

function Reeds() {
  return (
    <svg
      className="fj-scene__reeds"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g>
        <path d="M60 120c-4-40-10-64-2-92 6 22 10 46 8 92Z" />
        <path d="M78 120c2-34 0-58 10-80-2 24-2 48-2 80Z" />
        <path d="M1060 120c-4-46-10-70 0-100 6 24 8 52 6 100Z" />
        <path d="M1078 120c2-30 2-56 12-74-4 22-4 46-4 74Z" />
        <path d="M1120 120c0-30-4-52 6-70-2 20 0 42 0 70Z" />
      </g>
      <g className="fj-scene__rocks">
        <ellipse cx="240" cy="112" rx="34" ry="12" />
        <ellipse cx="900" cy="116" rx="46" ry="14" />
        <ellipse cx="620" cy="118" rx="26" ry="9" />
      </g>
    </svg>
  );
}

function DriftingFish() {
  return (
    <div className="fj-scene__deep" aria-hidden="true">
      <span className="fj-scene__silhouette fj-scene__silhouette--a">
        <FishGlyph />
      </span>
      <span className="fj-scene__silhouette fj-scene__silhouette--b">
        <FishGlyph />
      </span>
      <span className="fj-scene__silhouette fj-scene__silhouette--c">
        <FishGlyph />
      </span>
    </div>
  );
}

export function FishGlyph({ className = "" }) {
  return (
    <svg
      className={`fj-fish-glyph ${className}`}
      viewBox="0 0 64 32"
      aria-hidden="true"
    >
      <path d="M6 16C14 5 34 3 44 9c4 2.5 8 5 12 7-4 2-8 4.5-12 7-10 6-30 4-38-7Z" />
      <path d="M43 9c3-2 6-3 9-3.4-1 4-1 6 0 12.8-3-.4-6-1.4-9-3.4" />
      <path d="M20 8c-1 3-1 13 0 16" className="fj-fish-glyph__fin" />
      <circle cx="16" cy="14" r="2.1" className="fj-fish-glyph__eye" />
    </svg>
  );
}

export default function LakeScene({
  variant = "lake",
  quality = "high",
  children,
}) {
  const showClouds = quality !== "low";
  const showShimmer = quality !== "low";
  const showDeep = quality === "high";
  const showReeds = quality !== "low";
  const showGlints = quality === "high";
  const showBirds = quality !== "low" && variant !== "marsh";

  return (
    <div className={`fj-scene fj-scene--${variant}`} aria-hidden="true">
      <div className="fj-scene__sky">
        <div className="fj-scene__sunglow" />
        <div className="fj-scene__sun" />
        {showBirds && <Birds />}
        {showClouds && (
          <div className="fj-scene__clouds">
            <span className="fj-scene__cloud fj-scene__cloud--1" />
            <span className="fj-scene__cloud fj-scene__cloud--2" />
            <span className="fj-scene__cloud fj-scene__cloud--3" />
            <span className="fj-scene__cloud fj-scene__cloud--4" />
          </div>
        )}
      </div>

      <Mountains />
      <PineBand
        className="fj-scene__trees fj-scene__trees--far"
        count={34}
        seed={variant.length * 7 + 3}
      />
      <PineBand
        className="fj-scene__trees fj-scene__trees--near"
        count={20}
        seed={variant.length * 13 + 11}
        sunlit
      />

      <div className="fj-scene__water">
        <div className="fj-scene__horizon" />
        {quality !== "low" && <div className="fj-scene__sunpath" />}
        {showShimmer && <div className="fj-scene__shimmer" />}
        <div className="fj-scene__lines" />
        <div className="fj-scene__wave fj-scene__wave--1" />
        <div className="fj-scene__wave fj-scene__wave--2" />
        <div className="fj-scene__wave fj-scene__wave--3" />
        {showGlints && (
          <div className="fj-scene__glints">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {showDeep && <DriftingFish />}
        {showReeds && <Reeds />}
        <div className="fj-scene__depth" />
      </div>

      {variant === "marsh" && <div className="fj-scene__fog" />}

      <div className="fj-scene__vignette" />
      <div className="fj-scene__overlay">{children}</div>
    </div>
  );
}
