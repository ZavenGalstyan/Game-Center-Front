/**
 * Fishing Journey — inline SVG icon set.
 *
 * Small, stroke-based line icons that inherit `currentColor`, so the polished
 * UI never depends on emoji. Each is a plain function component taking an
 * optional `className`; size comes from CSS (`width`/`height` on the svg).
 */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconHook({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="4.5" r="2" />
      <path d="M9 6.5v8a4.5 4.5 0 0 0 9 0v-1.5" />
      <path d="m14.6 15.6 1.9-2.3 2.3 1.6" strokeWidth="1.5" />
    </svg>
  );
}

export function IconFish({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12c3-5 9-6 13-4 2 1 4 3 5 4-1 1-3 3-5 4-4 2-10 1-13-4Z" />
      <path d="M17 8.5c1.5-1 3.5-1.5 4-1.5-.5 2-.5 3 0 5-.5 0-2.5-.5-4-1.5" />
      <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconWave({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M2 9c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />
      <path d="M2 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />
    </svg>
  );
}

export function IconLock({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevronLeft({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 5 8 12l6.5 7" />
    </svg>
  );
}

export function IconRod({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20 19 5" />
      <path d="M5.5 15.5 8 18" />
      <circle cx="6" cy="19" r="1.6" />
      <path d="M19 5c1.4 3 .3 6-.8 7.2" />
    </svg>
  );
}

export function IconMap({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  );
}

export function IconBook({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v16H7.5A2.5 2.5 0 0 0 5 20.5Z" />
      <path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v4H7.5A2.5 2.5 0 0 1 5 20.5Z" />
    </svg>
  );
}

export function IconSliders({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </svg>
  );
}

export function IconSound({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M11 6 7 9H4v6h3l4 3Z" />
      <path d="M15.5 8.5a4 4 0 0 1 0 7M18 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

export function IconSparkle({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5c.8 3.8 1.7 4.7 5.5 5.5-3.8.8-4.7 1.7-5.5 5.5-.8-3.8-1.7-4.7-5.5-5.5C10.3 8.2 11.2 7.3 12 3.5Z" />
      <path d="M18.5 15c.4 1.7.8 2.1 2.5 2.5-1.7.4-2.1.8-2.5 2.5-.4-1.7-.8-2.1-2.5-2.5 1.7-.4 2.1-.8 2.5-2.5Z" />
    </svg>
  );
}

export function IconPine({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3 7 10h3l-4 6h5v5h2v-5h5l-4-6h3Z" />
    </svg>
  );
}

export function IconMountain({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 19 9.5 7l4 6 2.5-3.5L21 19Z" />
      <path d="m8 12 1.5 1.5L11 12" />
    </svg>
  );
}

export function IconCompass({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 6-4 1.5 2-6Z" fill="currentColor" stroke="none" opacity="0.5" />
      <path d="m15 9-2 6-4 1.5 2-6Z" />
    </svg>
  );
}
