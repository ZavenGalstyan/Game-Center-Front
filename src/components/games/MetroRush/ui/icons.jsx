/** Metro Rush — inline SVG icons (no icon fonts / assets). */
const S = ({ children, size = "1em", vb = "0 0 24 24", ...p }) => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true" focusable="false" {...p}>
    {children}
  </svg>
);

export const CoinIcon = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="10" fill="#ffc531" />
    <circle cx="12" cy="12" r="7.2" fill="none" stroke="#e09a00" strokeWidth="1.6" />
    <path d="M12 7.5l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="#fff3c4" />
  </S>
);
export const MagnetIcon = (p) => (
  <S {...p}>
    <path d="M5 4h4v8a3 3 0 006 0V4h4v8a7 7 0 01-14 0z" fill="#ff4a5a" />
    <path d="M5 4h4v3H5zM15 4h4v3h-4z" fill="#e9eef2" />
  </S>
);
export const MultIcon = (p) => (
  <S {...p}>
    <path d="M12 2l2.9 6.2 6.8.8-5 4.6 1.4 6.7L12 17l-6.1 3.3 1.4-6.7-5-4.6 6.8-.8z" fill="#a46bff" />
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#ffe53b" fontFamily="Arial">×2</text>
  </S>
);
export const ShieldIcon = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="10" fill="#29d8ff" opacity="0.35" />
    <circle cx="12" cy="12" r="10" fill="none" stroke="#29d8ff" strokeWidth="2" />
    <path d="M12 6l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V8z" fill="#ffffff" />
  </S>
);
export const BoardIcon = (p) => (
  <S {...p}>
    <rect x="2" y="9" width="20" height="5.5" rx="2.75" fill="#3fe07a" transform="rotate(-12 12 12)" />
    <rect x="5" y="10.6" width="14" height="1.6" rx=".8" fill="#ffffff" transform="rotate(-12 12 12)" />
    <ellipse cx="12" cy="19" rx="7" ry="1.6" fill="#3fe07a" opacity=".45" />
  </S>
);
export const BoostIcon = (p) => (
  <S {...p}>
    <path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill="#ff9a1f" stroke="#ffd29a" strokeWidth="1" strokeLinejoin="round" />
  </S>
);
export const POWER_ICONS = { magnet: MagnetIcon, mult: MultIcon, shield: ShieldIcon, board: BoardIcon, boost: BoostIcon };

export const PauseIcon = (p) => (
  <S {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </S>
);
export const PlayIcon = (p) => (
  <S {...p}>
    <path d="M8 5.5v13a1 1 0 001.5.86l10.4-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" fill="currentColor" />
  </S>
);
export const BackIcon = (p) => (
  <S {...p}>
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const NextIcon = (p) => (
  <S {...p}>
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const LockIcon = (p) => (
  <S {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
  </S>
);
export const CheckIcon = (p) => (
  <S {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const TrophyIcon = (p) => (
  <S {...p}>
    <path d="M7 3h10v4a5 5 0 01-10 0z" fill="#ffc531" />
    <path d="M7 5H3.5a3.5 3.5 0 004 4M17 5h3.5a3.5 3.5 0 01-4 4" fill="none" stroke="#ffc531" strokeWidth="1.8" />
    <path d="M10.5 12h3v4h-3z" fill="#e09a00" />
    <rect x="7" y="16" width="10" height="4" rx="1" fill="#ffc531" />
  </S>
);
export const TargetIcon = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
  </S>
);
export const RunnerIcon = (p) => (
  <S {...p}>
    <circle cx="14.5" cy="4" r="2.4" fill="currentColor" />
    <path d="M8 21l3-6 3 2.5V22M6 11.5l3.5-3 4 .5 2.5 3.5 3 .5M9.5 8.5L11 15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const ShopIcon = (p) => (
  <S {...p}>
    <path d="M4 9h16l-1.3 11H5.3z" fill="currentColor" />
    <path d="M8.5 9V7a3.5 3.5 0 017 0v2" fill="none" stroke="currentColor" strokeWidth="2.2" />
  </S>
);
export const GearIcon = (p) => (
  <S {...p}>
    <path
      d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.4 5l1.6 1.3-2 3.4-2-.7a7.8 7.8 0 01-1.8 1l-.3 2.1h-4l-.3-2.1a7.8 7.8 0 01-1.8-1l-2 .7-2-3.4 1.6-1.3a7.7 7.7 0 010-2l-1.6-1.3 2-3.4 2 .7a7.8 7.8 0 011.8-1l.3-2.1h4l.3 2.1c.6.3 1.3.6 1.8 1l2-.7 2 3.4-1.6 1.3a7.7 7.7 0 010 2z"
      fill="currentColor"
    />
  </S>
);
export const CityIcon = (p) => (
  <S {...p}>
    <path d="M3 21V10h5V5h6v6h3V8h4v13z" fill="currentColor" />
  </S>
);
export const CalendarIcon = (p) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </S>
);
export const FlameIcon = (p) => (
  <S {...p}>
    <path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 017 12.5C7 9 9.5 8 9.5 5c1.5 1 2.5 2.5 2.5 4.5C13 8 12.5 4.5 12 2z" fill="#ff7a1a" />
    <path d="M12 12c.6 1.8 2.5 2.6 2.5 4.5a2.5 2.5 0 01-5 0c0-1.6 1.4-2.3 2.5-4.5z" fill="#ffd23a" />
  </S>
);
export const RestartIcon = (p) => (
  <S {...p}>
    <path d="M19 12a7 7 0 11-2.05-4.95M19 4v4.5h-4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const HomeIcon = (p) => (
  <S {...p}>
    <path d="M3.5 11.5L12 4l8.5 7.5M6 10v10h4.5v-5.5h3V20H18V10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
