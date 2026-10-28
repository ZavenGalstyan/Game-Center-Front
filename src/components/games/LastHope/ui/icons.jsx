/**
 * Last Hope — SVG icon set (items, building pieces, HUD symbols).
 * Drawn on a 48 × 48 grid with a shared gradient language: warm wood,
 * cold steel, worn fabric. Unknown ids fall back to a crate.
 */
const W = "#8a5f38";
const WD = "#5c3d22";
const WL = "#b98a58";
const ST = "#9a958c";
const STD = "#6a665f";
const MT = "#a9b0b8";
const MTD = "#5d636b";
const OUT = "#1c1712";

const Defs = () => (
  <defs>
    <linearGradient id="lhg-steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#dfe5ea" />
      <stop offset="0.5" stopColor="#9aa2aa" />
      <stop offset="1" stopColor="#5d636b" />
    </linearGradient>
    <linearGradient id="lhg-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#c08e5a" />
      <stop offset="1" stopColor="#6a4626" />
    </linearGradient>
    <radialGradient id="lhg-glass" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
      <stop offset="0.3" stopColor="#bfe3f0" stopOpacity="0.6" />
      <stop offset="1" stopColor="#5a8aa0" stopOpacity="0.5" />
    </radialGradient>
  </defs>
);
const S = { stroke: OUT, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" };

const G = {
  wood: (
    <g {...S}>
      <rect x="6" y="20" width="34" height="11" rx="5.5" fill="url(#lhg-wood)" transform="rotate(-18 24 25)" />
      <ellipse cx="38" cy="19.5" rx="3.6" ry="5.4" fill="#d9b07a" transform="rotate(-18 38 19.5)" />
      <rect x="9" y="27" width="32" height="10" rx="5" fill="url(#lhg-wood)" transform="rotate(10 25 32)" />
      <ellipse cx="40" cy="34.5" rx="3.3" ry="5" fill="#d9b07a" transform="rotate(10 40 34.5)" />
      <path d="M37 18.5 a1.5 2 -18 1 0 2 1" fill="none" stroke="#8a6238" strokeWidth="1" />
    </g>
  ),
  stone: (
    <g {...S}>
      <path d="M9 32 L13 18 L24 12 L36 15 L41 27 L35 37 L18 39 Z" fill={ST} />
      <path d="M13 18 L24 12 L36 15 L29 22 L17 24 Z" fill="#b8b3aa" />
      <path d="M29 22 L41 27 L35 37 Z" fill={STD} stroke="none" />
    </g>
  ),
  fiber: (
    <g {...S}>
      {[-8, -4, 0, 4, 8].map((k) => (
        <path key={k} d={`M${24 + k * 0.4} 42 Q${24 + k * 1.4} 24 ${24 + k * 2} 7`} fill="none" stroke="#5e8a3a" strokeWidth="3" />
      ))}
      <rect x="17" y="27" width="14" height="5" rx="1.5" fill="#c9a86a" />
    </g>
  ),
  metal: (
    <g {...S}>
      <path d="M7 30 L21 13 L41 19 L33 37 Z" fill="url(#lhg-steel)" />
      <path d="M7 30 L33 37 L33 40 L7 33 Z" fill={MTD} />
      <circle cx="21" cy="21" r="1.8" fill={MTD} />
      <circle cx="31" cy="27" r="1.8" fill={MTD} />
      <path d="M24 30 l6 -3" stroke="#7a4a2e" strokeWidth="2" />
    </g>
  ),
  cloth: (
    <g {...S}>
      <path d="M8 18 Q24 11 40 18 L38 36 Q24 41 10 36 Z" fill="#c9b48e" />
      <path d="M10 24 Q24 19 38 24" fill="none" stroke="#8a7656" />
      <path d="M11 30 Q24 25 37 30" fill="none" stroke="#8a7656" strokeDasharray="2 2" />
    </g>
  ),
  rope: (
    <g {...S} fill="none">
      <ellipse cx="24" cy="25" rx="15" ry="11" stroke="#b08a50" strokeWidth="5" />
      <ellipse cx="24" cy="25" rx="9" ry="6" stroke="#c8a064" strokeWidth="4" />
      <path d="M36 32 Q42 38 38 43" stroke="#b08a50" strokeWidth="4" />
    </g>
  ),
  parts: (
    <g {...S}>
      <path d="M24 9 l3 4 5 -1 1 5 5 2 -2 5 3 4 -4 3 1 5 -5 1 -2 5 -5 -2 -4 3 -3 -4 -5 1 -1 -5 -5 -2 2 -5 -3 -4 4 -3 -1 -5 5 -1 2 -5 5 2 Z" fill="url(#lhg-steel)" />
      <circle cx="24" cy="25" r="5" fill="#2c3036" />
    </g>
  ),
  chemicals: (
    <g {...S}>
      <path d="M19 8 h10 v10 l9 18 a4 4 0 0 1 -4 6 H14 a4 4 0 0 1 -4 -6 l9 -18 Z" fill="url(#lhg-glass)" />
      <path d="M13.5 30 h21 l3 6 a4 4 0 0 1 -4 6 H14 a4 4 0 0 1 -4 -6 Z" fill="#7cd83a" stroke="none" opacity="0.9" />
      <circle cx="20" cy="35" r="1.6" fill="#d8ff9a" stroke="none" />
      <circle cx="27" cy="38" r="1.1" fill="#d8ff9a" stroke="none" />
    </g>
  ),
  berries: (
    <g {...S}>
      <path d="M24 10 Q32 6 36 14 Q28 16 24 10 Z" fill="#5e8a3a" />
      {[
        [18, 24, "#b2243a"],
        [28, 23, "#9a1e34"],
        [23, 32, "#c22c44"],
        [14, 33, "#5b2a7a"],
        [32, 33, "#b2243a"],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill={c} />
      ))}
      <circle cx="16" cy="22" r="1.5" fill="#fff" stroke="none" opacity="0.7" />
    </g>
  ),
  mushroom: (
    <g {...S}>
      <path d="M19 26 h10 l2 14 h-14 Z" fill="#efe6d2" />
      <path d="M7 27 Q9 10 24 9 Q39 10 41 27 Z" fill="#b8432e" />
      <circle cx="17" cy="19" r="2.2" fill="#f2e6c8" stroke="none" />
      <circle cx="28" cy="15" r="2" fill="#f2e6c8" stroke="none" />
      <circle cx="33" cy="22" r="1.6" fill="#f2e6c8" stroke="none" />
    </g>
  ),
  raw_meat: (
    <g {...S}>
      <path d="M8 26 Q8 12 24 12 Q38 12 38 24 Q38 36 22 37 Q8 38 8 26 Z" fill="#d86a6a" />
      <path d="M14 24 Q22 18 30 24" fill="none" stroke="#f2b0a8" strokeWidth="2.4" />
      <rect x="33" y="27" width="10" height="4" rx="2" fill="#efe6d2" transform="rotate(30 38 29)" />
    </g>
  ),
  cooked_meat: (
    <g {...S}>
      <path d="M8 26 Q8 12 24 12 Q38 12 38 24 Q38 36 22 37 Q8 38 8 26 Z" fill="#8a4a26" />
      <path d="M14 22 l14 -4 M13 28 l17 -4" fill="none" stroke="#4a2410" strokeWidth="2.4" />
      <rect x="33" y="27" width="10" height="4" rx="2" fill="#efe6d2" transform="rotate(30 38 29)" />
    </g>
  ),
  canned_food: (
    <g {...S}>
      <rect x="12" y="11" width="24" height="28" rx="3" fill="url(#lhg-steel)" />
      <rect x="12" y="18" width="24" height="14" fill="#c84a2a" />
      <ellipse cx="24" cy="25" rx="6" ry="4" fill="#f2d28a" stroke="none" />
      <path d="M12 14 h24 M12 36 h24" stroke={MTD} />
    </g>
  ),
  energy_bar: (
    <g {...S}>
      <rect x="6" y="18" width="36" height="13" rx="3" fill="#2a6ab8" transform="rotate(-12 24 24)" />
      <path d="M14 21 l20 -4" stroke="#ffd04a" strokeWidth="3" />
      <path d="M6 22 l-2 -2 M42 16 l2 -2" stroke={OUT} />
    </g>
  ),
  dirty_water: (
    <g {...S}>
      <rect x="18" y="6" width="12" height="6" rx="1.5" fill="#3a4a5a" />
      <path d="M16 12 h16 l3 8 v18 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V20 Z" fill="url(#lhg-glass)" />
      <path d="M13.5 24 h21 v14 a3 3 0 0 1 -3 3 H16.5 a3 3 0 0 1 -3 -3 Z" fill="#7a6a3a" stroke="none" opacity="0.85" />
    </g>
  ),
  water_bottle: (
    <g {...S}>
      <rect x="18" y="6" width="12" height="6" rx="1.5" fill="#2a6ab8" />
      <path d="M16 12 h16 l3 8 v18 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V20 Z" fill="url(#lhg-glass)" />
      <path d="M13.5 22 h21 v16 a3 3 0 0 1 -3 3 H16.5 a3 3 0 0 1 -3 -3 Z" fill="#4ab0e8" stroke="none" opacity="0.8" />
    </g>
  ),
  empty_bottle: (
    <g {...S}>
      <rect x="18" y="6" width="12" height="6" rx="1.5" fill="#5a6a7a" />
      <path d="M16 12 h16 l3 8 v18 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V20 Z" fill="url(#lhg-glass)" />
    </g>
  ),
  soda: (
    <g {...S}>
      <rect x="14" y="9" width="20" height="31" rx="4" fill="#c8302a" />
      <path d="M14 15 h20 M14 34 h20" stroke="#7a1a16" />
      <path d="M18 22 q6 -5 12 0 q-6 5 -12 0" fill="#fff" stroke="none" opacity="0.85" />
    </g>
  ),
  bandage: (
    <g {...S}>
      <ellipse cx="24" cy="26" rx="14" ry="12" fill="#f2efe6" />
      <ellipse cx="24" cy="26" rx="6" ry="5" fill="#d8d2c4" />
      <path d="M36 30 L44 38 L40 42 L32 34" fill="#f2efe6" />
      <path d="M22 15 h4 M24 13 v4" stroke="#c82828" strokeWidth="2" />
    </g>
  ),
  medkit: (
    <g {...S}>
      <rect x="7" y="14" width="34" height="25" rx="4" fill="#c82828" />
      <rect x="18" y="9" width="12" height="6" rx="2" fill="none" />
      <path d="M24 20 v14 M17 27 h14" stroke="#fff" strokeWidth="5" />
    </g>
  ),
  painkillers: (
    <g {...S}>
      <rect x="14" y="13" width="20" height="27" rx="3" fill="#e8a838" />
      <rect x="13" y="8" width="22" height="7" rx="2" fill="#f2f2ee" />
      <rect x="17" y="21" width="14" height="10" fill="#fff" stroke="none" />
      <path d="M21 26 h6" stroke="#c82828" strokeWidth="2" />
    </g>
  ),
  antidote: (
    <g {...S}>
      <rect x="9" y="20" width="26" height="8" rx="2" fill="url(#lhg-glass)" transform="rotate(-35 24 24)" />
      <rect x="11" y="21.5" width="15" height="5" fill="#7cd83a" stroke="none" transform="rotate(-35 24 24)" />
      <path d="M33 13 l6 -6 M30 10 l6 6" stroke={OUT} strokeWidth="2.2" />
      <path d="M10 36 l-4 4" stroke={MTD} strokeWidth="2" />
    </g>
  ),
  stone_axe: (
    <g {...S}>
      <rect x="22" y="8" width="4.5" height="36" rx="2" fill="url(#lhg-wood)" transform="rotate(25 24 26)" />
      <path d="M22 9 L36 7 L38 19 L25 18 Z" fill={ST} />
      <path d="M22 13 h6" stroke="#c9a86a" strokeWidth="3" />
    </g>
  ),
  stone_pickaxe: (
    <g {...S}>
      <rect x="22" y="12" width="4.5" height="32" rx="2" fill="url(#lhg-wood)" />
      <path d="M6 14 Q24 4 42 14 L40 17 Q24 10 8 17 Z" fill={ST} />
      <path d="M20 13 h8" stroke="#c9a86a" strokeWidth="3" />
    </g>
  ),
  iron_axe: (
    <g {...S}>
      <rect x="22" y="8" width="4.5" height="36" rx="2" fill="#4a3020" transform="rotate(25 24 26)" />
      <path d="M22 9 Q34 4 39 10 Q38 18 26 19 Z" fill="url(#lhg-steel)" />
    </g>
  ),
  iron_pickaxe: (
    <g {...S}>
      <rect x="22" y="12" width="4.5" height="32" rx="2" fill="#4a3020" />
      <path d="M5 16 Q24 3 43 16 L41 18 Q24 9 7 18 Z" fill="url(#lhg-steel)" />
    </g>
  ),
  wooden_club: (
    <g {...S}>
      <path d="M17 41 L21 42 L33 9 Q28 5 24 8 Z" fill="url(#lhg-wood)" transform="rotate(10 24 24)" />
      <circle cx="28" cy="13" r="1.6" fill={WD} />
      <circle cx="25" cy="19" r="1.4" fill={WD} />
    </g>
  ),
  wooden_spear: (
    <g {...S}>
      <rect x="22.5" y="11" width="3" height="34" rx="1.5" fill={WL} transform="rotate(35 24 28)" />
      <path d="M36 4 L40 12 L34 14 Z" fill="#d8b47a" />
      <path d="M33 14 l3 -2" stroke="#c9a86a" strokeWidth="3" />
    </g>
  ),
  crowbar: (
    <g {...S} fill="none">
      <path d="M12 42 L34 10 Q37 5 41 8" stroke="#3a3e44" strokeWidth="4" />
      <path d="M12 42 l-3 -2" stroke="#c82828" strokeWidth="5" />
    </g>
  ),
  machete: (
    <g {...S}>
      <path d="M14 34 L36 6 Q42 8 38 14 L19 38 Z" fill="url(#lhg-steel)" />
      <rect x="8" y="34" width="12" height="5" rx="2" fill="#2a2a2a" transform="rotate(-50 14 36)" />
    </g>
  ),
  fire_axe: (
    <g {...S}>
      <rect x="22" y="8" width="4.5" height="36" rx="2" fill="#d8b060" transform="rotate(25 24 26)" />
      <path d="M22 9 Q34 3 40 10 Q39 20 25 19 Z" fill="#c82a22" />
      <path d="M21 10 L12 6 L18 15 Z" fill="url(#lhg-steel)" />
    </g>
  ),
  bow: (
    <g {...S} fill="none">
      <path d="M14 5 Q38 24 14 43" stroke="#6a4628" strokeWidth="4" />
      <path d="M14 5 L14 43" stroke="#e8e0c8" strokeWidth="1.2" />
      <path d="M17 24 L42 24" stroke={WL} strokeWidth="2" />
      <path d="M42 24 l-4 -3 v6 Z" fill={MT} />
    </g>
  ),
  pistol: (
    <g {...S}>
      <path d="M8 14 h30 v8 H22 l-2 4 l3 14 h-8 l-3 -14 l-4 -4 Z" fill="#2c3036" />
      <rect x="8" y="14" width="30" height="4" fill="#4a5058" />
      <path d="M38 16 h4" stroke={OUT} strokeWidth="3" />
    </g>
  ),
  rifle: (
    <g {...S}>
      <path d="M3 20 h12 l4 -3 h20 v5 h6 v3 h-14 l-2 3 h-6 l-2 8 h-6 l1 -8 H3 Z" fill="#2c3228" />
      <rect x="25" y="13" width="9" height="4" fill="#1e2022" />
      <rect x="20" y="25" width="4" height="9" fill="#1e2022" transform="rotate(10 22 29)" />
    </g>
  ),
  arrow: (
    <g {...S}>
      <path d="M8 40 L38 10" stroke={WL} strokeWidth="2.6" />
      <path d="M38 10 l-8 2 l6 6 Z" fill={MT} />
      <path d="M8 40 l-2 -6 l5 3 l3 -5 l1 6 Z" fill="#e8e0c8" />
    </g>
  ),
  pistol_ammo: (
    <g {...S}>
      {[12, 20, 28].map((x) => (
        <g key={x}>
          <rect x={x} y="18" width="7" height="20" rx="1" fill="#c8a040" />
          <path d={`M${x} 18 q3.5 -9 7 0 Z`} fill="#b07a3a" />
        </g>
      ))}
    </g>
  ),
  rifle_ammo: (
    <g {...S}>
      {[10, 19, 28].map((x) => (
        <g key={x}>
          <rect x={x} y="16" width="7" height="25" rx="1" fill="#c8a040" />
          <path d={`M${x} 16 q3.5 -12 7 0 Z`} fill="#8a5a2a" />
        </g>
      ))}
    </g>
  ),
  padded_hood: (
    <g {...S}>
      <path d="M8 38 Q6 12 24 8 Q42 12 40 38 L33 38 Q34 22 24 20 Q14 22 15 38 Z" fill="#6a6a52" />
    </g>
  ),
  hard_hat: (
    <g {...S}>
      <path d="M8 30 Q8 12 24 11 Q40 12 40 30 Z" fill="#e8b828" />
      <rect x="4" y="29" width="40" height="5" rx="2.5" fill="#d0a020" />
      <path d="M24 11 v18" stroke="#b88a18" strokeWidth="3" />
    </g>
  ),
  scrap_helmet: (
    <g {...S}>
      <path d="M9 32 Q9 11 24 10 Q39 11 39 32 Z" fill="url(#lhg-steel)" />
      <path d="M12 26 h24" stroke={MTD} strokeWidth="2" />
      {[14, 22, 30].map((x) => (
        <circle key={x} cx={x + 2} cy="18" r="1.4" fill={MTD} />
      ))}
    </g>
  ),
  riot_helmet: (
    <g {...S}>
      <path d="M8 32 Q8 9 24 9 Q40 9 40 32 Z" fill="#232c3a" />
      <path d="M11 22 Q24 18 37 22 L37 31 Q24 34 11 31 Z" fill="url(#lhg-glass)" />
    </g>
  ),
  padded_vest: (
    <g {...S}>
      <path d="M12 8 L19 8 Q24 14 29 8 L36 8 L40 40 L8 40 Z" fill="#6a6a4a" />
      <path d="M10 18 h28 M9 28 h30" stroke="#4a4a32" />
    </g>
  ),
  scrap_armor: (
    <g {...S}>
      <path d="M12 8 L19 8 Q24 14 29 8 L36 8 L40 40 L8 40 Z" fill="#4a4a3a" />
      <rect x="13" y="16" width="22" height="16" rx="2" fill="url(#lhg-steel)" />
      {[16, 32].map((x) => [19, 29].map((y) => <circle key={x + y} cx={x} cy={y} r="1.3" fill={MTD} />))}
    </g>
  ),
  military_vest: (
    <g {...S}>
      <path d="M12 8 L19 8 Q24 14 29 8 L36 8 L40 40 L8 40 Z" fill="#4a5236" />
      {[13, 21, 29].map((x) => (
        <rect key={x} x={x} y="27" width="7" height="9" rx="1" fill="#3a4228" />
      ))}
      <rect x="14" y="14" width="20" height="10" rx="2" fill="#3a4228" />
    </g>
  ),
  cloth_pants: (
    <g {...S}>
      <path d="M12 7 H36 L39 42 H29 L24 18 L19 42 H9 Z" fill="#5a4a36" />
      <path d="M12 12 h24" stroke="#3a2e22" />
    </g>
  ),
  combat_pants: (
    <g {...S}>
      <path d="M12 7 H36 L39 42 H29 L24 18 L19 42 H9 Z" fill="#4a5236" />
      <rect x="10" y="26" width="7" height="7" rx="1" fill="#3a4228" />
      <rect x="31" y="26" width="7" height="7" rx="1" fill="#3a4228" />
    </g>
  ),
  work_boots: (
    <g {...S}>
      <path d="M10 8 H22 V30 H36 Q42 31 42 38 H10 Z" fill="#5a3a22" />
      <rect x="10" y="37" width="32" height="4" fill="#2a2018" />
      <path d="M13 14 h7 M13 19 h7 M13 24 h7" stroke="#c8a870" />
    </g>
  ),
  small_backpack: (
    <g {...S}>
      <path d="M12 14 Q12 7 24 7 Q36 7 36 14 V40 H12 Z" fill="#5a5a3a" />
      <rect x="15" y="25" width="18" height="11" rx="2" fill="#4a4a30" />
    </g>
  ),
  hiking_backpack: (
    <g {...S}>
      <path d="M11 12 Q11 5 24 5 Q37 5 37 12 V42 H11 Z" fill="#7a3a2a" />
      <rect x="14" y="26" width="20" height="12" rx="2" fill="#5a2a1e" />
      <rect x="12" y="3" width="24" height="6" rx="3" fill="#4a5a3a" />
    </g>
  ),
  survivor_map: (
    <g {...S}>
      <path d="M6 12 L17 8 L30 12 L42 8 V36 L30 40 L17 36 L6 40 Z" fill="#e8d8a8" />
      <path d="M17 8 V36 M30 12 V40" stroke="#b8a070" />
      <path d="M10 30 Q18 20 26 26 T38 16" fill="none" stroke="#c82828" strokeWidth="2" strokeDasharray="3 2" />
      <circle cx="38" cy="16" r="2.6" fill="none" stroke="#c82828" strokeWidth="2" />
    </g>
  ),
  bunker_card: (
    <g {...S}>
      <rect x="6" y="12" width="36" height="24" rx="3" fill="#2a5aa8" />
      <rect x="6" y="17" width="36" height="5" fill="#1a1a1a" />
      <rect x="10" y="26" width="12" height="6" rx="1" fill="#d8c060" />
      <path d="M27 28 h11 M27 31 h8" stroke="#bcd" />
    </g>
  ),
  security_card: (
    <g {...S}>
      <rect x="6" y="12" width="36" height="24" rx="3" fill="#b8302a" />
      <rect x="6" y="17" width="36" height="5" fill="#1a1a1a" />
      <rect x="10" y="26" width="12" height="6" rx="1" fill="#d8c060" />
      <path d="M27 28 h11 M27 31 h8" stroke="#fcc" />
    </g>
  ),
  gun_schematic: (
    <g {...S}>
      <rect x="6" y="8" width="36" height="32" rx="2" fill="#2a5aa8" />
      <path d="M12 18 h18 v5 h-9 l-1 3 l2 8 h-5 l-2 -8 l-3 -3 Z" fill="none" stroke="#cfe6ff" />
      <path d="M8 13 h32 M8 35 h32" stroke="#4a7ac8" strokeDasharray="2 2" />
    </g>
  ),
  /* -------- building pieces */
  b_wall: (
    <g {...S}>
      {[8, 15, 22, 29, 36].map((x, i) => (
        <g key={x}>
          <rect x={x} y={12 - (i % 2) * 2} width="6" height={30 + (i % 2) * 2} rx="2" fill="url(#lhg-wood)" />
          <path d={`M${x} ${12 - (i % 2) * 2} l3 -5 l3 5`} fill={WL} />
        </g>
      ))}
      <path d="M6 22 h36 M6 33 h36" stroke={WD} strokeWidth="2.4" />
    </g>
  ),
  b_door: (
    <g {...S}>
      <rect x="9" y="6" width="30" height="36" rx="1" fill={WD} />
      <rect x="13" y="10" width="22" height="32" fill="url(#lhg-wood)" />
      <path d="M13 18 h22 M13 34 h22 M13 34 L35 18" stroke={WD} strokeWidth="2" />
      <circle cx="31" cy="26" r="1.8" fill="#d8b04a" />
    </g>
  ),
  b_floor: (
    <g {...S}>
      <path d="M4 30 L24 20 L44 30 L24 40 Z" fill="url(#lhg-wood)" />
      <path d="M9 27.5 L29 37.5 M14 25 L34 35 M19 22.5 L39 32.5" stroke={WD} />
    </g>
  ),
  b_barricade: (
    <g {...S}>
      <path d="M6 38 L20 10 M14 38 L30 8 M22 38 L38 10 M34 38 L42 18" stroke={WL} strokeWidth="4" />
      <path d="M4 30 h40" stroke={WD} strokeWidth="5" />
    </g>
  ),
  b_campfire: (
    <g {...S}>
      <path d="M24 8 Q34 18 30 28 Q36 24 34 18 Q42 28 34 36 H14 Q6 28 14 18 Q12 26 18 28 Q14 18 24 8 Z" fill="#ff8a2a" />
      <path d="M24 18 Q28 24 26 30 H22 Q20 24 24 18 Z" fill="#ffe08a" />
      <path d="M8 40 L40 34 M8 34 L40 40" stroke={WD} strokeWidth="4" />
    </g>
  ),
  b_workbench: (
    <g {...S}>
      <rect x="5" y="18" width="38" height="6" fill="url(#lhg-wood)" />
      <path d="M9 24 v16 M39 24 v16 M9 34 h30" stroke={WD} strokeWidth="3" />
      <path d="M14 18 l6 -10 M18 10 l6 2" stroke="#9aa0a6" strokeWidth="3" />
      <rect x="27" y="11" width="10" height="7" fill={MT} />
    </g>
  ),
  b_chest: (
    <g {...S}>
      <rect x="7" y="20" width="34" height="20" rx="2" fill="url(#lhg-wood)" />
      <path d="M7 20 Q7 10 24 10 Q41 10 41 20 Z" fill={W} />
      <path d="M15 12 V40 M33 12 V40" stroke="#3a3a3a" strokeWidth="2.5" />
      <rect x="21" y="18" width="6" height="7" rx="1" fill="#d8b04a" />
    </g>
  ),
  b_collector: (
    <g {...S}>
      <path d="M6 12 L42 12 L28 24 H20 Z" fill="#4a7ab8" />
      <rect x="15" y="24" width="18" height="18" rx="3" fill="#2a5a8a" />
      <path d="M17 30 h14 M17 36 h14" stroke="#1a3a5a" />
      <path d="M24 4 v5 M18 6 v4 M30 6 v4" stroke="#8ac8ff" strokeWidth="2" />
    </g>
  ),
  b_bed: (
    <g {...S}>
      <rect x="6" y="22" width="36" height="14" rx="4" fill="#4a5a3a" />
      <rect x="7" y="18" width="10" height="9" rx="3" fill="#e8e0d0" />
      <rect x="18" y="20" width="23" height="12" rx="3" fill="#7a3a2a" />
    </g>
  ),
  /* -------- HUD */
  heart: <path d="M24 41 L8 25 Q2 15 12 10 Q20 7 24 15 Q28 7 36 10 Q46 15 40 25 Z" fill="#e8484a" {...S} />,
  food: (
    <g {...S}>
      <path d="M12 20 Q24 6 36 20 Q36 38 24 40 Q12 38 12 20 Z" fill="#e8a838" />
      <path d="M24 12 Q26 6 31 5" fill="none" stroke="#5e8a3a" strokeWidth="2.5" />
    </g>
  ),
  water: <path d="M24 5 Q38 22 38 30 Q38 42 24 42 Q10 42 10 30 Q10 22 24 5 Z" fill="#4ab0e8" {...S} />,
  stamina: <path d="M28 4 L12 27 H22 L18 44 L36 19 H26 Z" fill="#f2d24a" {...S} />,
  poison: (
    <g {...S}>
      <circle cx="24" cy="22" r="13" fill="#7cd83a" />
      <circle cx="19" cy="20" r="3" fill={OUT} />
      <circle cx="29" cy="20" r="3" fill={OUT} />
      <path d="M17 38 L31 30 M17 30 L31 38" stroke={OUT} strokeWidth="2.5" />
    </g>
  ),
  bag: (
    <g {...S}>
      <path d="M12 16 Q12 8 24 8 Q36 8 36 16 V40 H12 Z" fill="#8a6a44" />
      <rect x="15" y="24" width="18" height="10" rx="2" fill="#6a4e30" />
    </g>
  ),
  hammer: (
    <g {...S}>
      <rect x="21" y="14" width="5" height="30" rx="2" fill="url(#lhg-wood)" transform="rotate(30 24 28)" />
      <rect x="18" y="6" width="22" height="9" rx="2" fill="url(#lhg-steel)" transform="rotate(30 24 12)" />
    </g>
  ),
  map: (
    <g {...S}>
      <path d="M6 12 L17 8 L30 12 L42 8 V36 L30 40 L17 36 L6 40 Z" fill="#e8d8a8" />
      <path d="M17 8 V36 M30 12 V40" stroke="#b8a070" />
    </g>
  ),
  craft: (
    <g {...S}>
      <path d="M10 38 L26 22" stroke="#9aa0a6" strokeWidth="5" />
      <path d="M38 38 L22 22" stroke={WL} strokeWidth="5" />
      <circle cx="24" cy="16" r="8" fill="none" stroke="#f2d24a" strokeWidth="3" />
    </g>
  ),
  pause: (
    <g {...S}>
      <rect x="13" y="10" width="8" height="28" rx="2" fill="#e8e0d0" />
      <rect x="27" y="10" width="8" height="28" rx="2" fill="#e8e0d0" />
    </g>
  ),
  fist: (
    <g {...S}>
      <path d="M12 22 Q12 12 20 12 H32 Q38 12 38 20 V30 Q38 40 28 40 H20 Q12 40 12 30 Z" fill="#e0b08a" />
      <path d="M20 12 V22 M26 12 V22 M32 13 V22" stroke="#a87a5a" />
    </g>
  ),
  skull: (
    <g {...S}>
      <path d="M10 22 Q10 7 24 7 Q38 7 38 22 Q38 30 32 31 V38 H16 V31 Q10 30 10 22 Z" fill="#e8e0d0" />
      <circle cx="18" cy="22" r="4" fill={OUT} />
      <circle cx="30" cy="22" r="4" fill={OUT} />
    </g>
  ),
  lock: (
    <g {...S}>
      <path d="M15 22 V15 Q15 7 24 7 Q33 7 33 15 V22" fill="none" stroke="#c8ccd0" strokeWidth="4" />
      <rect x="10" y="21" width="28" height="20" rx="3" fill="#d8a838" />
      <circle cx="24" cy="30" r="3" fill={OUT} />
    </g>
  ),
  crate: (
    <g {...S}>
      <rect x="8" y="12" width="32" height="28" rx="2" fill="url(#lhg-wood)" />
      <path d="M8 12 L40 40 M40 12 L8 40" stroke={WD} strokeWidth="2.5" />
    </g>
  ),
};
G.fists = G.fist;

export function Icon({ id, size = 40, className = "" }) {
  const g = G[id] || G.crate;
  return (
    <svg className={`lh-ico ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <Defs />
      {g}
    </svg>
  );
}
export const pieceIcon = (kind) => `b_${kind}`;
void MT;
void STD;
void W;
