/**
 * Farm Life — small original SVG item icons, driven by each item's `icon`
 * descriptor in data/items.js (shape + color + accent). No image assets.
 */
import { getItem } from "../data/items.js";

export default function ItemIcon({ itemId, size = 32 }) {
  const def = getItem(itemId);
  if (!def) return null;
  const { shape, color = "#8a5a34", accent = "#c9c9c9" } = def.icon || {};

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="fl-itemicon" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill={color} opacity="0.28" />
      {(shape === "hoe" || shape === "axe" || shape === "pickaxe" || shape === "shovel") && (
        <>
          <rect x="14.5" y="7" width="3" height="20" rx="1.5" fill="#6b4526" />
          {shape === "hoe" && <rect x="9" y="4" width="14" height="4.5" rx="1.5" fill={accent} transform="rotate(-8 16 6)" />}
          {shape === "axe" && <path d="M17 8 L27 12 L17 17 Z" fill={accent} />}
          {shape === "pickaxe" && <path d="M5 11 Q16 4 27 11 L23 15 Q16 10 9 15 Z" fill={accent} />}
          {shape === "shovel" && <rect x="10.5" y="3" width="11" height="9" rx="2.5" fill={accent} />}
        </>
      )}
      {shape === "wateringCan" && (
        <>
          <rect x="8" y="15" width="14" height="10" rx="3" fill={color} />
          <path d="M22 17 L28 13 M28 13 L28 16 M28 13 L25 13" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <rect x="12" y="9" width="4" height="7" rx="2" fill={color} />
        </>
      )}
      {shape === "seedBag" && (
        <>
          <path d="M10 12 L22 12 L20 27 L12 27 Z" fill={color} />
          <path d="M13 12 Q16 6 19 12" stroke={accent} strokeWidth="2" fill="none" />
        </>
      )}
      {shape === "wheat" && (
        <>
          <rect x="15" y="16" width="2" height="12" fill="#7a9c46" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse cx="16" cy={9 + i * 2.6} rx="3.1" ry="1.6" fill={color} />
              <ellipse cx="12.8" cy={10.5 + i * 2.6} rx="2.4" ry="1.3" fill={accent} />
              <ellipse cx="19.2" cy={10.5 + i * 2.6} rx="2.4" ry="1.3" fill={accent} />
            </g>
          ))}
        </>
      )}
      {shape === "carrot" && (
        <>
          <path d="M16 10 L21 24 Q16 28 11 24 Z" fill={color} />
          <path d="M16 10 L13 3 M16 9 L16 2 M16 10 L19 3" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {shape === "potato" && (
        <ellipse cx="16" cy="17" rx="9" ry="7" fill={color} transform="rotate(-14 16 17)" />
      )}
      {shape === "egg" && <ellipse cx="16" cy="17" rx="7.5" ry="9.5" fill={color} stroke={accent} strokeWidth="1.5" />}
      {shape === "feed" && (
        <>
          <path d="M9 26 L23 26 L20 13 L12 13 Z" fill={color} />
          <circle cx="14" cy="10" r="1.6" fill={accent} />
          <circle cx="18" cy="8.5" r="1.6" fill={accent} />
          <circle cx="17" cy="11.5" r="1.6" fill={accent} />
        </>
      )}
    </svg>
  );
}
