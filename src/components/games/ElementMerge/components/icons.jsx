/**
 * Element Merge — the icon system. No emoji anywhere, ever.
 *
 * The four starters (Fire, Water, Earth, Air) get bespoke, animated SVG
 * illustrations — they're on screen from second one and have to carry the
 * whole game's first impression. Every other element (hundreds, eventually)
 * is rendered by a small PROCEDURAL generator: each element's `family`
 * (data/elements.js) selects a palette + one of three shape templates, and
 * a deterministic hash of its id then varies hue/rotation/detail count so
 * elements in the same family are clearly related but never identical.
 * This is what makes 300+ original icons tractable without hand-drawing
 * each one — see the design brief's "procedural icon" allowance.
 */
import { useId } from "react";

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const FAMILY_PALETTE = {
  energy: { h: 26, hj: 26, s: 88, l: 58 },
  fluid: { h: 198, hj: 30, s: 78, l: 58 },
  mineral: { h: 28, hj: 40, s: 22, l: 56 },
  air: { h: 200, hj: 40, s: 30, l: 82 },
  organic: { h: 132, hj: 34, s: 48, l: 48 },
  creature: { h: 32, hj: 30, s: 42, l: 52 },
  human: { h: 258, hj: 20, s: 38, l: 62 },
  mechanical: { h: 210, hj: 20, s: 22, l: 62 },
  cosmic: { h: 268, hj: 40, s: 62, l: 62 },
};

function paletteFor(family, seed) {
  const p = FAMILY_PALETTE[family] || FAMILY_PALETTE.mineral;
  const jitter = ((seed % 100) / 100) * p.hj * 2 - p.hj;
  const hue = (p.h + jitter + 360) % 360;
  return {
    base: `hsl(${hue}, ${p.s}%, ${p.l}%)`,
    light: `hsl(${hue}, ${Math.min(95, p.s + 14)}%, ${Math.min(88, p.l + 18)}%)`,
    dark: `hsl(${hue}, ${p.s}%, ${Math.max(14, p.l - 22)}%)`,
    hue,
  };
}

/* ------------------------------------------------------------ starters */

function FireIcon({ animated }) {
  const gid = `em-fire-g-${useId()}`;
  return (
    <svg viewBox="0 0 64 64" className={`em-icon em-icon--fire${animated ? " em-icon--anim" : ""}`}>
      <defs>
        <radialGradient id={gid} cx="50%" cy="70%" r="65%">
          <stop offset="0%" stopColor="#fff2b8" />
          <stop offset="45%" stopColor="#ffb238" />
          <stop offset="100%" stopColor="#e0450f" />
        </radialGradient>
      </defs>
      <g className="em-fire-flame">
        <path
          d="M32 6C24 18 16 24 16 37a16 16 0 0 0 32 0c0-7-4-11-6-15 1 6-2 9-5 9-4 0-5-4-3-9-4 3-8 8-8 14a6 6 0 0 0 12 0c3 3 4 7 4 1C42 24 40 18 32 6Z"
          fill={`url(#${gid})`}
        />
      </g>
      <ellipse cx="32" cy="56" rx="12" ry="3" className="em-fire-glow" />
    </svg>
  );
}

function WaterIcon({ animated }) {
  const gid = `em-water-g-${useId()}`;
  return (
    <svg viewBox="0 0 64 64" className={`em-icon em-icon--water${animated ? " em-icon--anim" : ""}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a6e8ff" />
          <stop offset="55%" stopColor="#3aa8e0" />
          <stop offset="100%" stopColor="#1c6fb0" />
        </linearGradient>
      </defs>
      <path
        d="M32 6c9 14 17 24 17 34a17 17 0 1 1-34 0c0-10 8-20 17-34Z"
        fill={`url(#${gid})`}
      />
      <path className="em-water-wave" d="M17 40c4 3 8 3 15 0s11-3 15 0" fill="none" stroke="#e8fbff" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function EarthIcon() {
  const gid = `em-earth-g-${useId()}`;
  return (
    <svg viewBox="0 0 64 64" className="em-icon em-icon--earth">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b9895a" />
          <stop offset="100%" stopColor="#7a5232" />
        </linearGradient>
      </defs>
      <path d="M8 44c2-10 10-16 24-16s22 6 24 16c1 6-4 10-24 10S7 50 8 44Z" fill={`url(#${gid})`} />
      <path d="M14 40c4-6 12-9 18-9s14 3 18 9" fill="none" stroke="#5b3a20" strokeWidth="2" opacity="0.5" />
      <circle cx="22" cy="38" r="2" fill="#5b3a20" opacity="0.55" />
      <circle cx="36" cy="42" r="1.6" fill="#5b3a20" opacity="0.5" />
      <circle cx="42" cy="35" r="1.8" fill="#5b3a20" opacity="0.5" />
    </svg>
  );
}

function AirIcon({ animated }) {
  return (
    <svg viewBox="0 0 64 64" className={`em-icon em-icon--air${animated ? " em-icon--anim" : ""}`}>
      <g className="em-air-swirl" fill="none" stroke="#d9f2ff" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <path d="M12 24c8-8 20-8 28 0" />
        <path d="M10 34c12-10 28-10 40 0" />
        <path d="M16 44c8-6 18-6 26 0" />
      </g>
    </svg>
  );
}

const STARTER_ICONS = { fire: FireIcon, water: WaterIcon, earth: EarthIcon, air: AirIcon };

/* --------------------------------------------------------- procedural */

function shapePath(family, variant) {
  const V = {
    energy: [
      "M32 6 L40 26 L58 30 L44 42 L48 58 L32 48 L16 58 L20 42 L6 30 L24 26 Z",
      "M32 4 L44 20 L32 34 L44 48 L32 60 L20 48 L32 34 L20 20 Z",
      "M32 8c10 4 18 12 18 24a18 18 0 1 1-36 0c0-12 8-20 18-24Z",
    ],
    fluid: [
      "M32 8c10 14 18 24 18 34a18 18 0 1 1-36 0c0-10 8-20 18-34Z",
      "M10 34c6-10 16-14 22-14s16 4 22 14c-4 10-14 16-22 16s-18-6-22-16Z",
      "M32 10c8 6 22 16 22 28a22 22 0 1 1-44 0c0-12 14-22 22-28Z",
    ],
    mineral: [
      "M12 46 L20 18 L38 12 L54 24 L50 48 L30 56 Z",
      "M14 40 L26 16 L44 14 L54 34 L42 54 L22 54 Z",
      "M18 50 L14 28 L30 10 L50 20 L52 44 L34 56 Z",
    ],
    air: [
      "M10 24c8-8 20-8 28 0M8 34c12-10 28-10 40 0M14 44c8-6 18-6 26 0",
      "M12 20c10 10 10 24 0 34M28 14c10 10 10 26 0 36M44 20c10 10 10 24 0 34",
      "M32 8a24 24 0 1 0 0 48 18 18 0 1 1 0-36 12 12 0 1 0 0 24",
    ],
    organic: [
      "M32 8c14 4 22 16 22 28a22 22 0 1 1-44 0c0-12 8-24 22-28Z M32 14v34",
      "M18 54C10 40 12 20 32 8c8 10 6 26-2 34-4 4-8 8-12 12Z",
      "M32 6c6 10 20 14 20 28a20 20 0 1 1-40 0c0-14 14-18 20-28Z",
    ],
    creature: [
      "M20 20c-6-4-10 0-8 6 2 4 6 5 8 5-6 4-10 12-6 22 4 9 14 13 18 13s14-4 18-13c4-10 0-18-6-22 2 0 6-1 8-5 2-6-2-10-8-6-4-8-20-8-24 0Z",
      "M32 14c10 0 18 8 18 18 0 6-2 10-6 14 4 2 8 6 8 10H16c0-4 4-8 8-10-4-4-6-8-6-14 0-10 8-18 14-18Z",
      "M16 30c0-10 8-18 16-18s16 8 16 18c0 8-4 12-6 16 4 2 6 6 6 8H16c0-2 2-6 6-8-2-4-6-8-6-16Z",
    ],
    human: [
      "M32 10a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z M18 56c0-12 6-20 14-20s14 8 14 20Z",
      "M32 8a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z M16 56c2-14 8-22 16-22s14 8 16 22Z",
      "M32 12a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z M14 54c4-12 10-18 18-18s14 6 18 18Z",
    ],
    mechanical: [
      "M32 10l4 6h8l2 8 7 3-2 8 5 6-6 5 1 8-8 1-4 7-8-4-8 4-4-7-8-1 1-8-6-5 5-6-2-8 7-3 2-8h8Z",
      "M14 32a18 18 0 1 1 36 0 18 18 0 0 1-36 0Zm18-8v16m-8-8h16",
      "M20 20h24v10a12 12 0 1 1-24 0Z M26 44v8h12v-8",
    ],
    cosmic: [
      "M32 6l4 16 16 4-16 4-4 16-4-16-16-4 16-4Z",
      "M32 12a20 20 0 1 0 0 40 20 20 0 0 0 0-40Zm0 6a14 14 0 1 1 0 28",
      "M32 8l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z",
    ],
  };
  const set = V[family] || V.mineral;
  return set[variant % set.length];
}

function familyDetail(family, seed) {
  if (family === "energy") return { glow: true, rays: 2 + (seed % 3) };
  if (family === "cosmic") return { glow: true, sparkle: true };
  if (family === "fluid") return { shine: true };
  return {};
}

export function ElementIcon({ id, family, animated = true, className = "" }) {
  const Starter = STARTER_ICONS[id];
  if (Starter) return <Starter animated={animated} />;

  const seed = hashId(id);
  const pal = paletteFor(family, seed);
  const variant = seed % 3;
  const d = shapePath(family, variant);
  const detail = familyDetail(family, seed);
  const gid = `em-g-${useId()}`;

  return (
    <svg viewBox="0 0 64 64" className={`em-icon em-icon--proc em-icon--${family} ${className}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pal.light} />
          <stop offset="100%" stopColor={pal.dark} />
        </linearGradient>
      </defs>
      {detail.glow && <circle cx="32" cy="32" r="26" fill={pal.base} opacity="0.18" className="em-icon-glow" />}
      <path d={d} fill={`url(#${gid})`} stroke={pal.dark} strokeWidth="1.4" strokeLinejoin="round" />
      {detail.shine && <ellipse cx="26" cy="24" rx="6" ry="3" fill="#fff" opacity="0.35" />}
      {detail.sparkle && (
        <>
          <circle cx="48" cy="16" r="1.6" fill={pal.light} />
          <circle cx="14" cy="46" r="1.3" fill={pal.light} />
        </>
      )}
    </svg>
  );
}

export function CategoryBadgeDot({ family }) {
  const pal = paletteFor(family, hashId(family));
  return <span className="em-cat-dot" style={{ background: pal.base }} aria-hidden="true" />;
}
