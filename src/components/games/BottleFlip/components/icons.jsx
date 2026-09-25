/** Bottle Flip — inline SVG icons (stroke = currentColor). */
const P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  width: "1em",
  height: "1em",
  "aria-hidden": true,
};

export const Icon = {
  pause: () => (
    <svg {...P}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  ),
  play: () => (
    <svg {...P}>
      <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
    </svg>
  ),
  back: () => (
    <svg {...P}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  restart: () => (
    <svg {...P}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  grid: () => (
    <svg {...P}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  ),
  home: () => (
    <svg {...P}>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8Z" />
    </svg>
  ),
  next: () => (
    <svg {...P}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  star: () => (
    <svg {...P} strokeWidth={1.6}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" fill="currentColor" />
    </svg>
  ),
  lock: () => (
    <svg {...P}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  fall: () => (
    <svg {...P}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  ),
  arrow: () => (
    <svg {...P}>
      <path d="M4 12h15M14 7l5 5-5 5" />
    </svg>
  ),
  bottle: () => (
    <svg {...P}>
      <path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3V2Z" />
      <path d="M8 12h8" />
    </svg>
  ),
  chart: () => (
    <svg {...P}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  gear: () => (
    <svg {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
  check: () => (
    <svg {...P}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  ),
};
