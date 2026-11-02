import { memo } from "react";
import { GAMEPAD_PATH } from "./Emblems.jsx";

/*
 * Original key art for the custom game hero: a floating island whose left
 * half is still a holographic blueprint ("your imagination") and whose right
 * half is a finished low-poly world ("our creation"), projected into being by
 * a hovering gamepad. Pure SVG + CSS animation, no assets or 3D runtime.
 *
 * Island top face (2:1 isometric): L(168,262) T(318,187) R(468,262) B(318,337).
 */

const L = [168, 262];
const A = [150, -75]; // L → T
const Bv = [150, 75]; // L → B

const GRID = [1, 2, 3, 4, 5].flatMap((k) => {
  const f = k / 6;
  const s0 = [L[0] + A[0] * f, L[1] + A[1] * f];
  const t0 = [L[0] + Bv[0] * f, L[1] + Bv[1] * f];
  return [
    `M${s0[0]} ${s0[1]}l${Bv[0]} ${Bv[1]}`,
    `M${t0[0]} ${t0[1]}l${A[0]} ${A[1]}`,
  ];
}).join("");

// Rising particles along the "build front" and around the island.
const PARTICLES = [
  [318, 250, 1.6, 0], [326, 300, 1.2, 1.4], [306, 228, 1.4, 2.6], [312, 320, 1, 3.4],
  [240, 300, 1.2, 0.8], [410, 300, 1.4, 2], [460, 240, 1, 4], [196, 250, 1.2, 3],
  [360, 210, 1.1, 1.1], [280, 210, 1, 4.6], [500, 200, 1.3, 2.4], [140, 220, 1, 5.2],
];

const DUST = [
  [60, 210], [92, 260], [170, 120], [470, 180], [560, 250], [520, 380], [80, 380],
  [210, 410], [440, 420], [580, 120], [30, 300], [250, 30], [420, 22],
];

function Pine({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="2" cy="1" rx="11" ry="4" fill="#022016" opacity="0.55" />
      <rect x="-1.6" y="-6" width="3.2" height="7" fill="#3A2A18" />
      <path d="M-11-4 0-36V-4z" fill="#1FD08F" />
      <path d="M0-36 11-4H0z" fill="#0B7F57" />
      <path d="M-8-16 0-36 8-16z" fill="#36E6A3" opacity="0.5" />
    </g>
  );
}

function IsoCube({ x, y, w, h, H, top, left, right, stroke }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M${-w} 0 0 ${h}v${H}l${-w} ${-h}z`} fill={left} stroke={stroke} />
      <path d={`M0 ${h} ${w} 0v${H}L0 ${h + H}z`} fill={right} stroke={stroke} />
      <path d={`M${-w} 0 0 ${-h} ${w} 0 0 ${h}z`} fill={top} stroke={stroke} />
    </g>
  );
}

function WireCube({ x, y, w, h, H, className = "" }) {
  return (
    <g className={className} transform={`translate(${x} ${y})`} fill="none" stroke="#5BE7FF" strokeWidth="1.1" strokeLinejoin="round">
      <path d={`M${-w} 0 0 ${-h} ${w} 0 0 ${h}z`} />
      <path d={`M${-w} 0v${H}l${w} ${h}v${-H}M0 ${h + H}l${w} ${-h}V0`} />
      <path d={`M${-w} ${H}l${w} ${-h} ${w} ${h}M0 ${-h}v${H}`} strokeDasharray="2 3" opacity="0.55" />
    </g>
  );
}

function HeroArtwork() {
  return (
    <svg
      className="cg-art"
      viewBox="0 0 600 440"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="cgh-aura" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#00E88F" stopOpacity="0.30" />
          <stop offset="0.45" stopColor="#0FA7A0" stopOpacity="0.12" />
          <stop offset="1" stopColor="#020D0D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cgh-cyan" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3BD8FF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#3BD8FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cgh-grass" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#25D99A" />
          <stop offset="0.55" stopColor="#12A774" />
          <stop offset="1" stopColor="#0A7853" />
        </linearGradient>
        <linearGradient id="cgh-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0C5A43" />
          <stop offset="1" stopColor="#06352A" />
        </linearGradient>
        <linearGradient id="cgh-rock-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B3B32" />
          <stop offset="1" stopColor="#04201B" />
        </linearGradient>
        <linearGradient id="cgh-rock-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#072B25" />
          <stop offset="1" stopColor="#021412" />
        </linearGradient>
        <linearGradient id="cgh-holo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3BD8FF" stopOpacity="0.16" />
          <stop offset="1" stopColor="#00E88F" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="cgh-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5BE7FF" stopOpacity="0.34" />
          <stop offset="0.7" stopColor="#20F0A0" stopOpacity="0.08" />
          <stop offset="1" stopColor="#20F0A0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cgh-pad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#123F37" />
          <stop offset="0.6" stopColor="#081F1B" />
          <stop offset="1" stopColor="#040F0D" />
        </linearGradient>
        <linearGradient id="cgh-rim" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#65FFC0" />
          <stop offset="0.5" stopColor="#00E88F" stopOpacity="0.6" />
          <stop offset="1" stopColor="#3BD8FF" />
        </linearGradient>
        <linearGradient id="cgh-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8FFF5" stopOpacity="0" />
          <stop offset="0.35" stopColor="#E8FFF5" stopOpacity="0.95" />
          <stop offset="1" stopColor="#5BE7FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cgh-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9CF3FF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3BD8FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cgh-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D8FBFF" />
          <stop offset="1" stopColor="#3BD8FF" />
        </linearGradient>
        <linearGradient id="cgh-bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00E88F" />
          <stop offset="1" stopColor="#3BD8FF" />
        </linearGradient>
        <clipPath id="cgh-left-top">
          <path d="M168 262 318 187v150z" />
        </clipPath>
        <clipPath id="cgh-pad-clip">
          <path d={GAMEPAD_PATH} />
        </clipPath>
        <clipPath id="cgh-front-half">
          <rect x="0" y="262" width="600" height="200" />
        </clipPath>
        <filter id="cgh-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* ── Atmosphere ───────────────────────────── */}
      <ellipse cx="318" cy="262" rx="300" ry="210" fill="url(#cgh-aura)" />
      <ellipse className="cg-art__pulse" cx="470" cy="120" rx="140" ry="110" fill="url(#cgh-cyan)" />
      <g fill="#A8F5D4">
        {DUST.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.4} opacity={i % 2 ? 0.25 : 0.45} />
        ))}
      </g>

      {/* ── Far layer: holographic panels ───────── */}
      <g className="cg-art__layer cg-art__layer--far">
        <g className="cg-art__bob cg-art__bob--slow">
          {/* blueprint panel */}
          <g transform="translate(34 66) skewY(-8)">
            <rect width="132" height="84" rx="10" fill="url(#cgh-holo)" stroke="#5BE7FF" strokeOpacity="0.45" />
            <path d="M12 22h108M12 38h108M12 54h108M12 70h108M30 10v66M56 10v66M82 10v66M108 10v66" stroke="#5BE7FF" strokeOpacity="0.12" />
            <path className="cg-art__route" d="M20 66 42 50 62 56 84 30 108 36" fill="none" stroke="#20F0A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="66" r="3.2" fill="#020D0D" stroke="#20F0A0" strokeWidth="1.6" />
            <circle cx="84" cy="30" r="3" fill="#5BE7FF" />
            <path d="M104 30l4 6 4-6-4-6z" fill="#FFD27A" />
            <text x="12" y="-6" className="cg-art__label">LEVEL 01 · BLUEPRINT</text>
          </g>
        </g>
        <g className="cg-art__bob cg-art__bob--late">
          {/* build HUD */}
          <g transform="translate(440 54) skewY(6)">
            <rect width="128" height="52" rx="10" fill="url(#cgh-holo)" stroke="#20F0A0" strokeOpacity="0.45" />
            <text x="14" y="21" className="cg-art__label cg-art__label--strong">BUILDING WORLD</text>
            <rect x="14" y="31" width="100" height="6" rx="3" fill="#00E88F" fillOpacity="0.14" />
            <rect className="cg-art__progress" x="14" y="31" width="100" height="6" rx="3" fill="url(#cgh-bar)" />
          </g>
        </g>
        <g className="cg-art__bob">
          <WireCube x={92} y={210} w={18} h={9} H={22} className="cg-art__spin-soft" />
        </g>
        <g className="cg-art__bob cg-art__bob--late">
          <IsoCube x={540} y={170} w={16} h={8} H={18} top="#2BE5A2" left="#0F8A61" right="#085C42" stroke="#65FFC0" />
        </g>
      </g>

      {/* ── Orbit (back half) ───────────────────── */}
      <ellipse className="cg-art__orbit" cx="318" cy="268" rx="236" ry="74" fill="none" stroke="#5BE7FF" strokeOpacity="0.22" strokeDasharray="3 9" />

      {/* ── Island ───────────────────────────────── */}
      <g className="cg-art__layer cg-art__layer--mid">
        <g className="cg-art__bob cg-art__bob--island">
          <ellipse cx="318" cy="420" rx="120" ry="12" fill="#00E88F" opacity="0.10" filter="url(#cgh-soft)" />

          {/* underside — right (built) */}
          <path d="M318 363 322 410 360 384z" fill="url(#cgh-rock-b)" />
          <path d="M318 363 360 384 420 330 468 288z" fill="url(#cgh-rock-a)" />
          <path d="M360 384 420 330 388 372z" fill="#06231E" />
          {/* underside — left (blueprint) */}
          <g fill="#062A2D" fillOpacity="0.35" stroke="#5BE7FF" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round">
            <path d="M168 288 214 330 262 372 318 363z" />
            <path d="M262 372 306 404 322 410 318 363z" />
          </g>
          <path d="M214 330 318 363M188 306h40M240 352l40 4" stroke="#5BE7FF" strokeOpacity="0.25" strokeDasharray="2 4" fill="none" />

          {/* side faces */}
          <path d="M318 337 468 262v26l-150 75z" fill="url(#cgh-side)" />
          <path d="M318 337 468 262" stroke="#65FFC0" strokeOpacity="0.55" />
          <path d="M168 262 318 337v26l-150-75z" fill="#062A2D" fillOpacity="0.3" stroke="#5BE7FF" strokeOpacity="0.7" strokeLinejoin="round" />
          <path d="M193 274.5v26M218 287v26M243 299.5v26M268 312v26M293 324.5v26" stroke="#5BE7FF" strokeOpacity="0.25" />

          {/* waterfall over the right edge */}
          <path className="cg-art__water" d="M430 281l12-6v26l-12 6z" fill="#9CF3FF" fillOpacity="0.75" />
          <path className="cg-art__water" d="M431 306l10-5 2 70-12 2z" fill="url(#cgh-water)" />

          {/* top — left half: blueprint grid */}
          <path d="M168 262 318 187v150z" fill="#05303A" fillOpacity="0.35" />
          <g clipPath="url(#cgh-left-top)">
            <path d={GRID} stroke="#5BE7FF" strokeOpacity="0.38" strokeWidth="1" />
          </g>
          <path d="M318 187 168 262l150 75" fill="none" stroke="#5BE7FF" strokeOpacity="0.9" strokeWidth="1.2" strokeLinejoin="round" />

          {/* top — right half: finished world */}
          <path d="M318 187 468 262 318 337z" fill="url(#cgh-grass)" />
          <path d="M318 187 393 224.5 318 262z" fill="#3BF0B0" opacity="0.18" />
          <path d="M393 299.5 468 262l-75 0z" fill="#063F2E" opacity="0.18" />
          <path d="M318 187 468 262" stroke="#9CFFD8" strokeOpacity="0.7" />

          {/* pond feeding the waterfall */}
          <ellipse cx="428" cy="272" rx="17" ry="7.5" fill="#3BD8FF" fillOpacity="0.55" stroke="#C6FAFF" strokeOpacity="0.6" />
          <ellipse cx="424" cy="270" rx="6" ry="2" fill="#E8FFFF" opacity="0.6" />

          {/* blueprint objects (left) */}
          <WireCube x={262} y={262} w={20} h={10} H={26} />
          <g fill="none" stroke="#5BE7FF" strokeWidth="1.1" strokeLinejoin="round">
            <path d="M220 236l12-34 12 34zM232 236v6" />
            <path d="M226 220h12" strokeDasharray="2 3" opacity="0.6" />
          </g>
          <path d="M274 300l12-6 12 6-12 6z" fill="none" stroke="#5BE7FF" strokeOpacity="0.8" strokeDasharray="3 3" />

          {/* built objects (right) */}
          <path d="M334 228 380 166 386 236z" fill="#2FA884" />
          <path d="M380 166 424 224 386 236z" fill="#156B53" />
          <path d="M380 166 370 182 378 178 385 186 391 180z" fill="#EFFFF8" />
          <path d="M400 236 420 188 425 240z" fill="#279C79" />
          <path d="M420 188 447 232 425 240z" fill="#105B46" />
          <path d="M420 188 414 202 421 199 426 205z" fill="#EFFFF8" opacity="0.9" />

          {/* path stones crossing the build front */}
          <path d="M318 304l11-5.5 11 5.5-11 5.5z" fill="#BDF7DF" opacity="0.85" />
          <path d="M343 291l10-5 10 5-10 5z" fill="#BDF7DF" opacity="0.75" />

          {/* watchtower */}
          <path d="M377 272 393 280v-34l-16-8z" fill="#D9E8E1" />
          <path d="M393 280 409 272v-34l-16 8z" fill="#9FB8AE" />
          <path d="M398 258l6-3v8l-6 3z" className="cg-art__window" fill="#FFD27A" />
          <path d="M377 238 393 246 393 212z" fill="#0FB37A" />
          <path d="M393 246 409 238 393 212z" fill="#08744F" />

          <Pine x={352} y={300} />
          <Pine x={374} y={312} s={0.8} />
          <Pine x={446} y={282} s={0.7} />
          <Pine x={344} y={262} s={0.75} />

          {/* build front: where imagination becomes creation */}
          <path className="cg-art__front" d="M318 180v190" stroke="url(#cgh-front)" strokeWidth="2.4" />
          <path className="cg-art__front-glow" d="M318 180v190" stroke="#5BE7FF" strokeWidth="10" strokeOpacity="0.18" filter="url(#cgh-soft)" />
        </g>
      </g>

      {/* ── Orbit (front half) ──────────────────── */}
      <g clipPath="url(#cgh-front-half)">
        <ellipse className="cg-art__orbit" cx="318" cy="268" rx="236" ry="74" fill="none" stroke="#5BE7FF" strokeOpacity="0.4" strokeDasharray="3 9" />
      </g>

      {/* ── Near layer: gamepad + projection ────── */}
      <g className="cg-art__layer cg-art__layer--near">
        <path className="cg-art__beam" d="M282 146h44l132 112H170z" fill="url(#cgh-beam)" />
        <g className="cg-art__bob cg-art__bob--pad">
          <ellipse cx="304" cy="168" rx="62" ry="8" fill="#00E88F" opacity="0.25" filter="url(#cgh-soft)" />
          <g transform="translate(304 100) rotate(-7) translate(-99 -62) scale(3.1)">
            <path d={GAMEPAD_PATH} transform="translate(0 2.6)" fill="#021210" />
            <path d={GAMEPAD_PATH} fill="url(#cgh-pad)" />
            <g clipPath="url(#cgh-pad-clip)">
              <ellipse cx="32" cy="2" rx="34" ry="10" fill="#E8FFF5" opacity="0.10" />
            </g>
            <path d={GAMEPAD_PATH} fill="none" stroke="url(#cgh-rim)" strokeWidth="0.7" />
            {/* d-pad */}
            <path d="M13.5 11h5v3.5H22v5h-3.5V23h-5v-3.5H10v-5h3.5z" fill="#0A2A24" stroke="#20F0A0" strokeOpacity="0.6" strokeWidth="0.4" />
            <path d="M14.6 12.4h2.8v2" stroke="#65FFC0" strokeWidth="0.5" fill="none" opacity="0.8" />
            {/* sticks */}
            <circle cx="24" cy="26" r="3.8" fill="#04120F" stroke="#00E88F" strokeOpacity="0.5" strokeWidth="0.4" />
            <circle cx="23.6" cy="25.5" r="2.2" fill="#123F37" />
            <circle cx="40" cy="26" r="3.8" fill="#04120F" stroke="#00E88F" strokeOpacity="0.5" strokeWidth="0.4" />
            <circle cx="39.6" cy="25.5" r="2.2" fill="#123F37" />
            {/* face buttons */}
            <circle cx="47" cy="12" r="2.3" fill="#5BE7FF" className="cg-art__btn" />
            <circle cx="52" cy="17" r="2.3" fill="#00E88F" className="cg-art__btn cg-art__btn--b" />
            <circle cx="47" cy="22" r="2.3" fill="#A8F5D4" />
            <circle cx="42" cy="17" r="2.3" fill="#FFD27A" />
            {/* light bar */}
            <rect x="27.5" y="9" width="9" height="1.8" rx="0.9" fill="#00E88F" className="cg-art__lightbar" />
            <circle cx="32" cy="16.5" r="1.7" fill="#04120F" stroke="#65FFC0" strokeWidth="0.4" />
          </g>
        </g>
        <g className="cg-art__bob cg-art__bob--late">
          <g transform="translate(520 300)">
            <ellipse cx="0" cy="34" rx="12" ry="3" fill="#3BD8FF" opacity="0.25" />
            <path d="M0-20 11 0 0 22-11 0z" fill="url(#cgh-gem)" />
            <path d="M0-20 0 22-11 0z" fill="#FFFFFF" opacity="0.35" />
            <path d="M-11 0H11" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="0.8" />
          </g>
        </g>
        <g className="cg-art__bob">
          <IsoCube x={110} y={338} w={12} h={6} H={14} top="#1FD08F" left="#0B7F57" right="#06513A" stroke="#65FFC0" />
        </g>
        <g fill="#A8F5D4">
          {PARTICLES.map(([x, y, r, d], i) => (
            <circle
              key={i}
              className="cg-art__particle"
              cx={x}
              cy={y}
              r={r}
              style={{ animationDelay: `${-d}s` }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

export default memo(HeroArtwork);
