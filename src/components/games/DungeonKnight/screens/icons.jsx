/**
 * Dungeon Knight — inline SVG icons (no emoji, no icon fonts). 24×24 grid,
 * stroke = currentColor so CSS controls the colour.
 */
const S = ({ children, size = 20, fill = "none", sw = 1.8, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const Icon = {
  sword: (p) => (
    <S {...p}>
      <path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15Z" />
      <path d="M6.5 13.5 10.5 17.5" />
      <path d="M3 21 5 19" />
    </S>
  ),
  swords: (p) => (
    <S {...p}>
      <path d="M14 4h6v6L9 21l-3-3z" />
      <path d="M10 4H4v6l3.5 3.5" />
      <path d="M17 17l3 3M16 20l4-4" />
    </S>
  ),
  shield: (p) => (
    <S {...p}>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </S>
  ),
  armor: (p) => (
    <S {...p}>
      <path d="M8 3h8l4 3-2 4v10H6V10L4 6z" />
      <path d="M9 3c0 2 1.3 3 3 3s3-1 3-3" />
    </S>
  ),
  potion: (p) => (
    <S {...p}>
      <path d="M10 3h4M10.5 3v5L6 15a5 5 0 0 0 4.5 6h3A5 5 0 0 0 18 15l-4.5-7V3" />
      <path d="M7.5 14h9" />
    </S>
  ),
  heart: (p) => (
    <S {...p}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </S>
  ),
  bolt: (p) => (
    <S {...p}>
      <path d="M13 3 5 13h6l-1 8 8-10h-6z" />
    </S>
  ),
  coin: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
    </S>
  ),
  chest: (p) => (
    <S {...p}>
      <path d="M4 10h16v9H4z" />
      <path d="M4 10a8 5 0 0 1 16 0" />
      <path d="M11 12h2v3h-2z" />
    </S>
  ),
  skull: (p) => (
    <S {...p}>
      <path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.5 5v3h9v-3c1.3-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7z" />
      <circle cx="9.5" cy="11" r="1.4" />
      <circle cx="14.5" cy="11" r="1.4" />
      <path d="M10.5 18v3M13.5 18v3" />
    </S>
  ),
  crown: (p) => (
    <S {...p}>
      <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
    </S>
  ),
  door: (p) => (
    <S {...p}>
      <path d="M5 21V9a7 7 0 0 1 14 0v12z" />
      <path d="M12 2v19M15 13h.01" />
    </S>
  ),
  map: (p) => (
    <S {...p}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </S>
  ),
  knight: (p) => (
    <S {...p}>
      <path d="M7 21v-3a5 5 0 0 1 10 0v3" />
      <path d="M8 9a4 4 0 0 1 8 0v3H8z" />
      <path d="M8 10.5h8" />
      <path d="M12 2v3" />
    </S>
  ),
  stats: (p) => (
    <S {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </S>
  ),
  gear: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </S>
  ),
  play: (p) => (
    <S {...p} fill="currentColor" sw={0}>
      <path d="M7 4.5v15l12-7.5z" />
    </S>
  ),
  back: (p) => (
    <S {...p}>
      <path d="M15 5l-7 7 7 7" />
    </S>
  ),
  lock: (p) => (
    <S {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </S>
  ),
  check: (p) => (
    <S {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </S>
  ),
  plus: (p) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  trash: (p) => (
    <S {...p}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </S>
  ),
  pause: (p) => (
    <S {...p}>
      <path d="M8 5v14M16 5v14" />
    </S>
  ),
  retry: (p) => (
    <S {...p}>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v4h4" />
    </S>
  ),
  dodge: (p) => (
    <S {...p}>
      <path d="M4 16c3 0 4-8 9-8 3 0 4 2 7 2" />
      <path d="M17 7l3 3-3 3" />
    </S>
  ),
  hand: (p) => (
    <S {...p}>
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-2L8 14" />
    </S>
  ),
  heavy: (p) => (
    <S {...p}>
      <path d="M12 2v13" />
      <path d="M8 6h8" />
      <path d="M9 15h6l-3 7z" />
    </S>
  ),
  star: (p) => (
    <S {...p}>
      <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
    </S>
  ),
  bag: (p) => (
    <S {...p}>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </S>
  ),
  clock: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </S>
  ),
};

/** Room-type symbol (matches the 3D door plaques). */
export function RoomIcon({ type, size = 18 }) {
  if (type === "combat") return <Icon.swords size={size} />;
  if (type === "treasure") return <Icon.chest size={size} />;
  if (type === "healing") return <Icon.potion size={size} />;
  if (type === "elite") return <Icon.crown size={size} />;
  if (type === "boss") return <Icon.skull size={size} />;
  return <Icon.door size={size} />;
}

export function SlotIcon({ slot, size = 18 }) {
  if (slot === "weapon") return <Icon.sword size={size} />;
  if (slot === "armor") return <Icon.armor size={size} />;
  return <Icon.shield size={size} />;
}
