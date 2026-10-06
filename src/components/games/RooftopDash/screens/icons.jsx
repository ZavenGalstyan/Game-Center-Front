/**
 * Rooftop Dash — inline SVG icons (stroke style matching the Game Center's
 * GameControls icons: 24 viewBox, round caps). No emoji, no icon font.
 */
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const IconStar = ({ filled = true, ...p }) => (
  <svg {...base} {...p} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
export const IconLock = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </svg>
);
export const IconPlay = (p) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2Z" />
  </svg>
);
export const IconBack = (p) => (
  <svg {...base} {...p}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);
export const IconNext = (p) => (
  <svg {...base} {...p}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
export const IconGear = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const IconChart = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const IconRunner = (p) => (
  <svg {...base} {...p}>
    <circle cx="14.5" cy="4.5" r="2" />
    <path d="m8 21 3-6 3 2v5M6.5 11.5 9.5 8l4 .5 2.5 3.5 3 1M11 15l-1.5-3.5" />
  </svg>
);
export const IconMap = (p) => (
  <svg {...base} {...p}>
    <path d="M3 21V9l4-2 4 3 4-6 3 2v15" />
    <path d="M7 21v-6M11 21v-8M15 21V11M19 21v-9" />
  </svg>
);
export const IconTimer = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M10 2.5h4" />
  </svg>
);
export const IconFlag = (p) => (
  <svg {...base} {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const IconRetry = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
export const IconPause = (p) => (
  <svg {...base} {...p}>
    <path d="M9 5v14M15 5v14" />
  </svg>
);
export const IconCheck = (p) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconBolt = (p) => (
  <svg {...base} {...p} fill="currentColor" stroke="none">
    <path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2z" />
  </svg>
);
export const IconFall = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v13M7 11l5 5 5-5M5 21h14" />
  </svg>
);
export const IconWave = (p) => (
  <svg {...base} {...p}>
    <path d="M2 14c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4" />
  </svg>
);
export const IconHome = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5" />
  </svg>
);
