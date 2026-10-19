/**
 * Vector artwork: suit symbols, all 32 card faces, four card backs,
 * Armenian ornaments (eternity rosette, pomegranate, star lattice) and
 * avatars. Faces/backs are defined once as <symbol>s in <ArtDefs/> (mounted
 * at the game root) and drawn with <use>, so a full table stays light.
 */
import { memo } from "react";
import { suitOf, rankOf, RANKS, RED } from "../engine/deck.js";

const RED_INK = "#a8162d";
const BLACK_INK = "#17181d";
export const inkOf = (s) => (RED[s] ? RED_INK : BLACK_INK);

/* ------------------------------------------------------------ suits (100×100) */
export const SUIT_D = [
  // hearts
  "M50 91C24 70 7 54 7 33 7 18 18 8 31 8c9 0 15 5 19 12 4-7 10-12 19-12 13 0 24 10 24 25 0 21-17 37-43 58z",
  // diamonds
  "M50 5C42 22 30 38 15 50c15 12 27 28 35 45 8-17 20-33 35-45C70 38 58 22 50 5z",
  // clubs
  "M50 6c-11 0-20 9-20 20 0 5 2 10 5 13-3-2-7-3-11-3C13 36 5 45 5 56s8 20 19 20c9 0 15-5 19-11-1 11-5 18-13 25h40c-8-7-12-14-13-25 4 6 10 11 19 11 11 0 19-9 19-20S87 36 76 36c-4 0-8 1-11 3 3-3 5-8 5-13C70 15 61 6 50 6z",
  // spades
  "M50 5C37 25 9 38 9 60c0 13 10 22 22 22 7 0 12-3 16-8-1 9-5 15-13 21h32c-8-6-12-12-13-21 4 5 9 8 16 8 12 0 22-9 22-22C91 38 63 25 50 5z",
];

export function Suit({ suit, className = "", title }) {
  return (
    <svg className={`ab-suit ${className}`} viewBox="0 0 100 100" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={SUIT_D[suit]} fill={inkOf(suit)} />
    </svg>
  );
}

/* ------------------------------------------------------------ ornaments */

/** Armenian eternity sign (arevakhach): eight swirling blades. */
export function EternityPath({ r = 40, fill = "currentColor" }) {
  const k = r / 40;
  return (
    <g fill={fill}>
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} transform={`rotate(${i * 45}) scale(${k})`} d="M3 -3C8 -18 24 -30 40 -24 30 -22 21 -15 17 -4 15 2 11 5 5 5 1 5 1 0 3 -3Z" />
      ))}
      <circle r={5 * k} />
    </g>
  );
}

/** Pomegranate (nur) — body, crown and two leaves; centred at 0,0, ~60 tall. */
export function PomegranatePath({ fill = "#c9a25a", seed = "#7a1424", leaf = "#c9a25a" }) {
  return (
    <g>
      <path fill={leaf} d="M-6 -27C-22 -38 -36 -32 -40 -22-28 -26-16 -24-6 -27Z" />
      <path fill={leaf} d="M6 -27C22 -38 36 -32 40 -22 28 -26 16 -24 6 -27Z" />
      <path fill={fill} d="M-11 -24 -8 -36-3 -28 0 -40 3 -28 8 -36 11 -24Z" />
      <circle cy="2" r="27" fill={fill} />
      <path fill={seed} opacity=".85" d="M-15 2a15 13 0 0 0 30 0 15 9 0 0 0-30 0Z" />
      <g fill={fill} opacity=".9">
        {[[-8, 0], [-2, -2], [4, 0], [9, 2], [-5, 5], [1, 4], [6, 6], [-10, 4]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.9" />)}
      </g>
      <path fill="none" stroke={seed} strokeOpacity=".35" strokeWidth="1.4" d="M-20 -12a26 26 0 0 1 12-9" />
    </g>
  );
}

/** Eight-pointed star (Armenian khachkar / carpet motif). */
export const STAR8 = "M0 -10 2.6 -6.2 7.1 -7.1 6.2 -2.6 10 0 6.2 2.6 7.1 7.1 2.6 6.2 0 10 -2.6 6.2 -7.1 7.1 -6.2 2.6 -10 0 -6.2 -2.6 -7.1 -7.1 -2.6 -6.2Z";

/* ------------------------------------------------------------ card faces */

// pip centres per rank index (7 8 9 10) in a 250×350 card
const PIPS = {
  0: [[85, 85], [165, 85], [125, 130], [85, 175], [165, 175], [85, 265], [165, 265]],
  1: [[85, 85], [165, 85], [125, 130], [85, 175], [165, 175], [125, 220], [85, 265], [165, 265]],
  2: [[85, 85], [165, 85], [85, 145], [165, 145], [125, 175], [85, 205], [165, 205], [85, 265], [165, 265]],
  3: [[85, 85], [165, 85], [125, 117], [85, 145], [165, 145], [85, 205], [165, 205], [125, 233], [85, 265], [165, 265]],
};

const ROBE = [
  { robe: "#8c1d2f", robe2: "#5e0f1d", trim: "#d9b46a", bg: "#f6ead6" }, // hearts — garnet
  { robe: "#b0532a", robe2: "#7c3216", trim: "#e2c27a", bg: "#f7ecd8" }, // diamonds — apricot
  { robe: "#1f5e45", robe2: "#123d2c", trim: "#d4b46e", bg: "#eef0e0" }, // clubs — emerald
  { robe: "#25345f", robe2: "#141d3b", trim: "#d2b26c", bg: "#ebedf0" }, // spades — lapis
];

/** Upper half of a court figure (drawn in the 250×350 card space, y < 175). */
function Figure({ rank, suit }) {
  const c = ROBE[suit];
  const id = `abfig-${rank}-${suit}`;
  const king = rank === 6, queen = rank === 5;
  return (
    <g id={id}>
      {/* robe & shoulders */}
      <path fill={`url(#abRobe${suit})`} d="M56 176C60 150 84 132 110 127L140 127C166 132 190 150 194 176Z" />
      <path fill="none" stroke={c.trim} strokeWidth="3" d="M100 130C108 146 142 146 150 130" />
      <path fill={c.trim} d="M125 140l5 8-5 8-5-8z" />
      <g fill={c.trim} opacity=".9">
        {[70, 86, 164, 180].map((x) => <circle key={x} cx={x} cy={x < 125 ? 168 - (x - 70) * 0.5 : 168 - (180 - x) * 0.5} r="2.6" />)}
      </g>
      <path fill="none" stroke={c.trim} strokeWidth="1.6" strokeDasharray="2 4" d="M64 172C70 154 90 140 112 136M186 172C180 154 160 140 138 136" />
      {/* veil (queen) behind the head */}
      {queen && <path fill="#efe2c8" stroke={c.trim} strokeWidth="1.2" d="M104 74C92 94 90 118 98 132L152 132C160 118 158 94 146 74Z" />}
      {/* neck + head */}
      <path fill="#e8c3a0" d="M116 112h18v18h-18z" />
      <ellipse cx="125" cy="100" rx="17" ry="20" fill="#f0d0ae" />
      {/* hair */}
      {king && <path fill="#3b2a20" d="M108 104c0 18 7 30 17 30s17-12 17-30c-4 9-9 12-17 12s-13-3-17-12z" />}
      {!king && !queen && <path fill="#4a3022" d="M108 96c-2-12 6-20 17-20s19 8 17 20c-3-7-9-10-17-10s-14 3-17 10z" />}
      {queen && <path fill="#3a2418" d="M108 98c0-12 7-19 17-19s17 7 17 19c-2-6-8-9-17-9s-15 3-17 9zM107 98c-3 10-2 20 2 26l4-2c-3-8-4-15-6-24zM143 98c3 10 2 20-2 26l-4-2c3-8 4-15 6-24z" />}
      {/* face */}
      <g fill="#2a1c16">
        <ellipse cx="118.5" cy="99" rx="2" ry="1.5" />
        <ellipse cx="131.5" cy="99" rx="2" ry="1.5" />
      </g>
      <path fill="none" stroke="#2a1c16" strokeWidth="1.2" strokeLinecap="round" d="M115 94.5q3.5-2 7 0M128 94.5q3.5-2 7 0M125 101v6l-2 1" />
      <path fill="none" stroke={king ? "#5a3a2a" : "#9a4a3a"} strokeWidth="1.4" strokeLinecap="round" d={king ? "M120 113q5 2 10 0" : "M121 112q4 2 8 0"} />
      {king && <path fill="#3b2a20" d="M117 109q8-4 16 0q-8 3-16 0z" />}
      {/* headwear */}
      {king && (
        <g>
          <path fill={c.robe2} stroke={c.trim} strokeWidth="2" d="M105 84 107 52 125 44 143 52 145 84Z" />
          <path fill={c.trim} transform="translate(125 64) scale(.85)" d={STAR8} />
          <path fill="none" stroke={c.trim} strokeWidth="1.4" d="M107 60l-6-6M143 60l6-6" />
          <rect x="103" y="80" width="44" height="6" rx="2" fill={c.trim} />
          {[109, 117, 125, 133, 141].map((x) => <circle key={x} cx={x} cy="83" r="1.6" fill={c.robe2} />)}
        </g>
      )}
      {queen && (
        <g>
          <path fill={c.trim} d="M106 82 104 64 112 72 118 58 125 70 132 58 138 72 146 64 144 82Z" />
          <circle cx="125" cy="76" r="3" fill={c.robe} />
          <rect x="105" y="80" width="40" height="5" rx="2" fill={c.trim} />
        </g>
      )}
      {!king && !queen && (
        <g>
          <path fill={c.robe} stroke={c.trim} strokeWidth="1.6" d="M106 86C104 70 112 60 128 60c12 0 20 6 22 14-6-2-10 0-12 4l8 8Z" />
          <path fill="none" stroke={c.trim} strokeWidth="1.2" d="M107 84h40" />
          <path fill={c.trim} d="M146 66c10-14 22-16 30-12-10 0-18 6-26 16z" opacity=".9" />
        </g>
      )}
      {/* held item */}
      {king && (
        <g>
          <path stroke={c.trim} strokeWidth="4" strokeLinecap="round" d="M172 176V96" />
          <path fill={c.trim} transform="translate(172 88) scale(1.05)" d={STAR8} />
          <circle cx="172" cy="88" r="3" fill={c.robe2} />
        </g>
      )}
      {queen && (
        <g transform="translate(80 146) scale(.42)">
          <PomegranatePath fill={c.trim} seed={c.robe2} leaf="#6f8b4a" />
        </g>
      )}
      {!king && !queen && (
        <g>
          <path stroke="#8a7a62" strokeWidth="3.4" strokeLinecap="round" d="M174 176V92" />
          <path fill={c.trim} d="M174 70l7 16h-14z" />
          <path fill="none" stroke={c.trim} strokeWidth="1.6" d="M166 96h16" />
        </g>
      )}
    </g>
  );
}

function Corner({ rank, suit }) {
  const ink = inkOf(suit);
  const ten = rank === 3;
  return (
    <g>
      <text x="31" y="58" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize={ten ? 42 : 50} letterSpacing={ten ? -3 : 0} fill={ink}>
        {RANKS[rank]}
      </text>
      <path fill={ink} transform="translate(16 66) scale(.3)" d={SUIT_D[suit]} />
    </g>
  );
}

function FaceSymbol({ card }) {
  const s = suitOf(card), r = rankOf(card);
  const ink = inkOf(s);
  const court = r >= 4 && r <= 6;
  let body;
  if (r <= 3) {
    body = PIPS[r].map(([x, y], i) => (
      <path key={i} fill={ink} transform={`translate(${x} ${y})${y > 175 ? " rotate(180)" : ""} translate(-19 -19) scale(.38)`} d={SUIT_D[s]} />
    ));
  } else if (r === 7) {
    body = (
      <g>
        <circle cx="125" cy="175" r="74" fill="none" stroke="url(#abGold)" strokeWidth="1.6" />
        <circle cx="125" cy="175" r="66" fill="none" stroke="url(#abGold)" strokeWidth=".8" strokeDasharray="1.5 4" />
        <g transform="translate(125 175)" opacity=".16">
          <EternityPath r={64} fill={ink} />
        </g>
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} fill="url(#abGold)" transform={`rotate(${i * 45} 125 175) translate(125 101) scale(.42)`} d={STAR8} />
        ))}
        <path fill={ink} transform="translate(125 175) translate(-40 -40) scale(.8)" d={SUIT_D[s]} />
      </g>
    );
  } else {
    body = (
      <g>
        <rect x="60" y="46" width="130" height="258" rx="7" fill={ROBE[s].bg} stroke="url(#abGold)" strokeWidth="2" />
        <clipPath id={`abclip-${card}`}>
          <rect x="61" y="47" width="128" height="128" />
        </clipPath>
        <g clipPath={`url(#abclip-${card})`}>
          <use href={`#abfig-${r}-${s}`} />
        </g>
        <g clipPath={`url(#abclip-${card})`} transform="rotate(180 125 175)">
          <use href={`#abfig-${r}-${s}`} />
        </g>
        <path stroke="url(#abGold)" strokeWidth="1.4" d="M62 175h126" />
        <path fill="url(#abGold)" d="M125 168l7 7-7 7-7-7z" />
        <path fill={ink} transform="translate(65 52) scale(.18)" d={SUIT_D[s]} />
        <path fill={ink} transform="rotate(180 125 175) translate(65 52) scale(.18)" d={SUIT_D[s]} />
      </g>
    );
  }
  return (
    <symbol id={`abface-${card}`} viewBox="0 0 250 350">
      <rect x="1" y="1" width="248" height="348" rx="18" fill="url(#abIvory)" />
      <rect x="9" y="9" width="232" height="332" rx="12" fill="none" stroke="url(#abGold)" strokeWidth={court ? 1 : 1.3} opacity=".75" />
      {body}
      <Corner rank={r} suit={s} />
      <g transform="rotate(180 125 175)">
        <Corner rank={r} suit={s} />
      </g>
    </symbol>
  );
}

/* ------------------------------------------------------------ card backs */

function BackFrame({ bg, line, inner }) {
  return (
    <>
      <rect x="1" y="1" width="248" height="348" rx="18" fill={bg} />
      <rect x="11" y="11" width="228" height="328" rx="11" fill={inner} stroke={line} strokeWidth="2.2" />
      <rect x="17" y="17" width="216" height="316" rx="8" fill="none" stroke={line} strokeWidth="1" opacity=".7" />
    </>
  );
}

function BackSymbols() {
  return (
    <>
      {/* Armenian Ornament — burgundy, gold star lattice, eternity medallion */}
      <symbol id="abback-ornament" viewBox="0 0 250 350">
        <BackFrame bg="#5c0d1c" line="#d8b46a" inner="url(#abPatStars)" />
        <rect x="58" y="108" width="134" height="134" rx="67" fill="#4a0915" stroke="#d8b46a" strokeWidth="2.4" />
        <circle cx="125" cy="175" r="58" fill="none" stroke="#d8b46a" strokeWidth="1" strokeDasharray="2 5" />
        <g transform="translate(125 175)"><EternityPath r={48} fill="#e3c27a" /></g>
        {[[125, 40], [125, 310]].map(([x, y]) => <path key={y} fill="#d8b46a" transform={`translate(${x} ${y}) scale(1.4)`} d={STAR8} />)}
        {[[40, 175], [210, 175]].map(([x, y]) => <path key={x} fill="#d8b46a" transform={`translate(${x} ${y})`} d="M0-14 7 0 0 14-7 0Z" />)}
      </symbol>
      {/* Golden Pomegranate — garnet with a gold pomegranate and vines */}
      <symbol id="abback-pomegranate" viewBox="0 0 250 350">
        <BackFrame bg="#3d0a14" line="#e0bd72" inner="url(#abPatVine)" />
        <ellipse cx="125" cy="175" rx="70" ry="92" fill="#2e0810" stroke="#e0bd72" strokeWidth="2.4" />
        <ellipse cx="125" cy="175" rx="62" ry="84" fill="none" stroke="#e0bd72" strokeWidth=".9" opacity=".7" />
        <g transform="translate(125 182) scale(1.55)"><PomegranatePath fill="#e0bd72" seed="#7d1426" leaf="#c9a55e" /></g>
        {[[125, 64, 0], [125, 286, 180]].map(([x, y, a]) => (
          <g key={y} transform={`translate(${x} ${y}) rotate(${a}) scale(.42)`}><PomegranatePath fill="#e0bd72" seed="#7d1426" leaf="#c9a55e" /></g>
        ))}
      </symbol>
      {/* Royal Burgundy — damask rhombus lattice, crowned star */}
      <symbol id="abback-burgundy" viewBox="0 0 250 350">
        <BackFrame bg="#6e1428" line="#e6c98a" inner="url(#abPatDamask)" />
        <path d="M125 92 196 175 125 258 54 175Z" fill="#561020" stroke="#e6c98a" strokeWidth="2.4" />
        <path d="M125 106 184 175 125 244 66 175Z" fill="none" stroke="#e6c98a" strokeWidth="1" opacity=".8" />
        <path fill="#f0d79c" transform="translate(125 175) scale(3.4)" d={STAR8} />
        <path fill="#561020" transform="translate(125 175) scale(1.6)" d={STAR8} />
        <circle cx="125" cy="175" r="5" fill="#f0d79c" />
      </symbol>
      {/* Classic Geometric — deep emerald, carpet-like rhombus grid */}
      <symbol id="abback-geometric" viewBox="0 0 250 350">
        <BackFrame bg="#0d3b2c" line="#d6b56e" inner="url(#abPatGeo)" />
        <rect x="70" y="120" width="110" height="110" fill="#0a2e22" stroke="#d6b56e" strokeWidth="2.2" transform="rotate(45 125 175)" />
        <rect x="84" y="134" width="82" height="82" fill="none" stroke="#d6b56e" strokeWidth="1" transform="rotate(45 125 175)" />
        <g fill="#d6b56e">
          <path transform="translate(125 175) scale(2.2)" d={STAR8} />
          <circle cx="125" cy="175" r="6" fill="#0a2e22" />
        </g>
        {[[125, 46], [125, 304], [42, 175], [208, 175]].map(([x, y]) => <path key={`${x}${y}`} fill="#d6b56e" transform={`translate(${x} ${y})`} d="M0-9 9 0 0 9-9 0Z" />)}
      </symbol>
    </>
  );
}

/** All shared SVG definitions; render once per game root. */
export const ArtDefs = memo(function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="abIvory" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".55" stopColor="#f8f0de" />
          <stop offset="1" stopColor="#efe2c6" />
        </linearGradient>
        <linearGradient id="abGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b88a3a" />
          <stop offset=".5" stopColor="#e6c77e" />
          <stop offset="1" stopColor="#a57a2e" />
        </linearGradient>
        {ROBE.map((c, s) => (
          <linearGradient key={s} id={`abRobe${s}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.robe} />
            <stop offset="1" stopColor={c.robe2} />
          </linearGradient>
        ))}
        <pattern id="abPatStars" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill="#5c0d1c" />
          <path fill="#c9a258" opacity=".55" transform="translate(13 13) scale(.62)" d={STAR8} />
          <path fill="none" stroke="#c9a258" strokeOpacity=".28" strokeWidth=".8" d="M0 0 26 26M26 0 0 26" />
        </pattern>
        <pattern id="abPatVine" width="30" height="30" patternUnits="userSpaceOnUse">
          <rect width="30" height="30" fill="#3d0a14" />
          <path fill="none" stroke="#c9a55e" strokeOpacity=".38" strokeWidth="1.1" d="M0 15c7-9 15-9 15 0s8 9 15 0" />
          <circle cx="15" cy="15" r="1.6" fill="#c9a55e" opacity=".6" />
        </pattern>
        <pattern id="abPatDamask" width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill="#6e1428" />
          <path fill="none" stroke="#e6c98a" strokeOpacity=".35" strokeWidth=".9" d="M11 0 22 11 11 22 0 11Z" />
          <circle cx="11" cy="11" r="1.5" fill="#e6c98a" opacity=".55" />
        </pattern>
        <pattern id="abPatGeo" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#0d3b2c" />
          <path fill="#d6b56e" opacity=".22" d="M10 2 18 10 10 18 2 10Z" />
          <path fill="#0d3b2c" d="M10 6 14 10 10 14 6 10Z" />
          <path fill="#d6b56e" opacity=".4" d="M10 8.5 11.5 10 10 11.5 8.5 10Z" />
        </pattern>
        {[4, 5, 6].flatMap((r) => [0, 1, 2, 3].map((s) => <Figure key={`${r}${s}`} rank={r} suit={s} />))}
        {Array.from({ length: 32 }, (_, c) => <FaceSymbol key={c} card={c} />)}
        <BackSymbols />
      </defs>
    </svg>
  );
});

/* ------------------------------------------------------------ card element */

export function CardFace({ card }) {
  return (
    <svg className="ab-card__svg" viewBox="0 0 250 350" aria-hidden="true">
      <use href={`#abface-${card}`} />
    </svg>
  );
}
export function CardBackArt({ back = "ornament" }) {
  return (
    <svg className="ab-card__svg" viewBox="0 0 250 350" aria-hidden="true">
      <use href={`#abback-${back}`} />
    </svg>
  );
}

/* ------------------------------------------------------------ avatars */

const AV = [
  { bg: "#2a4a3a", fg: "#e9d9b4" },
  { bg: "#5c1a26", fg: "#f0d9a8" },
  { bg: "#1f3a5c", fg: "#e6d3a6" },
  { bg: "#4a3218", fg: "#f2dcae" },
];
export function Avatar({ seat, initial }) {
  const c = AV[seat];
  return (
    <svg className="ab-avatar__svg" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill={c.bg} />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke="#d6b26a" strokeWidth="1.2" strokeDasharray="1.5 3" />
      {seat === 0 ? (
        <g fill={c.fg}>
          <circle cx="32" cy="25" r="9.5" />
          <path d="M14 52c2-10 9-15 18-15s16 5 18 15a27 27 0 0 1-36 0z" />
        </g>
      ) : (
        <text x="32" y="41" textAnchor="middle" fontFamily="'Noto Serif Armenian', 'Noto Serif', Georgia, serif" fontSize="25" fontWeight="700" fill={c.fg}>{initial}</text>
      )}
    </svg>
  );
}
