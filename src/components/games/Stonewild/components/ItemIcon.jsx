/**
 * Stonewild — small original SVG item icons, driven entirely by each item's
 * `icon` descriptor in game/items.js (shape + color + accent). No image
 * assets, no copied iconography — a handful of inline shapes reused across
 * every block/tool/resource.
 */

import { getItem } from "../game/items.js";

export default function ItemIcon({ itemId, size = 32 }) {
  const def = getItem(itemId);
  if (!def) return null;
  const { shape, color = "#9a978d", accent = "#c9c9c9" } = def.icon || {};

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="sw-itemicon" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="6" fill={color} />
      {shape === "block" && (
        <>
          <rect x="1" y="1" width="30" height="9" rx="6" fill="#ffffff" opacity="0.22" />
          <rect x="1" y="22" width="30" height="9" rx="6" fill="#000000" opacity="0.2" />
        </>
      )}
      {shape === "log" && (
        <>
          <circle cx="16" cy="16" r="10" fill="none" stroke="#000000" strokeOpacity="0.3" strokeWidth="2" />
          <circle cx="16" cy="16" r="5" fill="none" stroke="#000000" strokeOpacity="0.25" strokeWidth="1.5" />
        </>
      )}
      {shape === "sapling" && (
        <path d="M16 27 L16 15 M16 15 L10 9 M16 15 L22 9" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
      {shape === "stick" && (
        <rect x="4" y="14" width="24" height="4" rx="2" transform="rotate(-32 16 16)" fill="#000000" opacity="0.28" />
      )}
      {(shape === "axe" || shape === "pickaxe" || shape === "shovel") && (
        <>
          <rect x="14.5" y="6" width="3" height="21" rx="1.5" fill="#5a3d22" />
          {shape === "axe" && <path d="M17 8 L28 12 L17 17 Z" fill={accent} />}
          {shape === "pickaxe" && <path d="M5 11 Q16 4 27 11 L23 15 Q16 10 9 15 Z" fill={accent} />}
          {shape === "shovel" && <rect x="10.5" y="3" width="11" height="9" rx="2.5" fill={accent} />}
        </>
      )}
    </svg>
  );
}
