/**
 * Small shared UI pieces: chip amounts, HTML cards, rival portraits (engraved
 * tintype silhouettes drawn in SVG from each rival's look), icons.
 */
import { memo } from "react";
import { cardImage } from "../render/cardFaces.js";
import { getLanguage } from "../../../../i18n/i18n.js";

const NF = new Map();
export function fmt(n, lang = getLanguage()) {
  const k = lang === "ru" ? "ru-RU" : "en-US";
  if (!NF.has(k)) NF.set(k, new Intl.NumberFormat(k));
  return NF.get(k).format(Math.round(n || 0));
}

export const Card = memo(function Card({ card, size = "m", glow = false, dim = false, back = false }) {
  const src = cardImage(back || card == null || card < 0 ? null : card);
  return <img className={`wws-card wws-card--${size}${glow ? " is-glow" : ""}${dim ? " is-dim" : ""}`} src={src} alt="" draggable={false} />;
});

const HAT_PATHS = {
  cattleman: "M14 34 Q32 28 50 34 Q46 30 44 22 Q38 16 32 20 Q26 16 20 22 Q18 30 14 34 Z",
  sheriff: "M10 34 Q32 27 54 34 Q46 29 44 19 Q38 13 32 18 Q26 13 20 19 Q18 29 10 34 Z",
  outlaw: "M6 35 Q32 31 58 35 Q46 31 43 23 Q38 18 32 21 Q26 18 21 23 Q18 31 6 35 Z",
  stetson: "M12 34 Q32 30 52 34 Q45 31 44 19 Q32 15 20 19 Q19 31 12 34 Z",
  gambler: "M14 34 Q32 31 50 34 Q44 32 43 23 L21 23 Q20 32 14 34 Z",
  derby: "M18 34 Q32 31 46 34 Q44 31 43 26 Q42 17 32 17 Q22 17 21 26 Q20 31 18 34 Z",
};
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, "0")}`;

/** Engraved-style portrait: head, hat, moustache, collar, coat — from the rival's look. */
export const Portrait = memo(function Portrait({ rival, size = 64, out = false }) {
  const L = rival.look;
  const skin = L.skin > 0.55 ? "#8a5a3c" : L.skin > 0.3 ? "#b98a66" : "#d9b08c";
  const hat = L.hat && L.hat !== "none" ? HAT_PATHS[L.hat] || HAT_PATHS.cattleman : null;
  const coat = L.coat && L.coat !== "none" ? hex(L.coatColor ?? 0x3a3530) : L.vest != null ? hex(L.vest) : hex(L.shirt ?? 0xd8cdb4);
  const shirt = hex(L.shirt ?? 0xd8cdb4);
  const hair = hex(L.hairColor ?? 0x3a2a1e);
  const id = `p-${rival.id}`;
  return (
    <svg className={`wws-portrait${out ? " is-out" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#e8d6ae" />
          <stop offset="100%" stopColor="#8a6a40" />
        </radialGradient>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed={rival.id.length} />
          <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.14  0 0 0 0 0.08  0 0 0 0.25 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="64" height="64" rx="6" fill={`url(#${id}-bg)`} />
      {/* shoulders */}
      <path d="M6 64 Q8 46 22 44 L42 44 Q56 46 58 64 Z" fill={coat} />
      <path d="M26 44 L32 56 L38 44 Z" fill={shirt} />
      {L.bandana != null && <path d="M25 43 L32 52 L39 43 Z" fill={hex(L.bandana)} />}
      {L.badge && <path d="M44 52 l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#e2d6b0" />}
      {/* neck + head */}
      <rect x="28" y="36" width="8" height="9" fill={skin} />
      <ellipse cx="32" cy="30" rx="9.5" ry="11.5" fill={skin} />
      {L.hair === "Long" && <path d="M22 26 Q20 44 25 46 L26 30 Z M42 26 Q44 44 39 46 L38 30 Z" fill={hair} />}
      {L.beard && <path d="M23 31 Q24 43 32 43 Q40 43 41 31 Q36 37 32 37 Q28 37 23 31 Z" fill={hair} />}
      {L.stache && L.stache !== "none" && (
        <path d={L.stache === "handlebar" ? "M25 33 Q28 30 32 32 Q36 30 39 33 Q41 30 42 29 Q40 34 32 33.5 Q24 34 22 29 Q23 30 25 33 Z" : L.stache === "pencil" ? "M27 32.6 Q32 31.4 37 32.6 Q32 32.2 27 32.6 Z" : "M25 34 Q32 29 39 34 Q32 32.5 25 34 Z"} fill={hair} />
      )}
      <path d="M27.5 27 h3 M33.5 27 h3" stroke="#3a2618" strokeWidth="1" strokeLinecap="round" />
      {hat ? <path d={hat} fill={hex(L.hatColor ?? 0x5a4632)} stroke="#2a1a10" strokeWidth="0.6" /> : <path d="M22.5 26 Q24 17 32 17 Q40 17 41.5 26 Q36 21 32 21 Q28 21 22.5 26 Z" fill={hair} />}
      <rect width="64" height="64" rx="6" filter={`url(#${id}-grain)`} />
      <rect x="1" y="1" width="62" height="62" rx="5.5" fill="none" stroke="#3a2614" strokeWidth="2" />
    </svg>
  );
});

export const Icon = {
  pause: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <circle cx="12" cy="14" r="5" fill="currentColor" />
      <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 3v3M4.5 7.5l2 2M19.5 7.5l-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  chips: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <ellipse cx="12" cy="16" rx="8" ry="3" fill="currentColor" opacity="0.6" />
      <ellipse cx="12" cy="12" rx="8" ry="3" fill="currentColor" opacity="0.8" />
      <ellipse cx="12" cy="8" rx="8" ry="3" fill="currentColor" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="currentColor" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
};
