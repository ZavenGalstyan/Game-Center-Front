/**
 * Mini Golf Journey — inline SVG icon set (stroke-based, inherits currentColor).
 * No emoji anywhere in the polished UI.
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

export function IconFlag({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 21V4" />
      <path d="M6 5h10l-2.5 3.5L16 12H6" />
    </svg>
  );
}
export function IconPlay({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M7 4.5 19 12 7 19.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconGrid({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
export function IconChart({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h16" />
      <rect x="6" y="11" width="3.5" height="7" rx="1" />
      <rect x="12" y="7" width="3.5" height="11" rx="1" />
      <rect x="18" y="13" width="0.5" height="5" rx="0.25" />
    </svg>
  );
}
export function IconGear({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7l2.1 1.2M17.7 15.8l2.1 1.2M4.2 17l2.1-1.2M17.7 8.2l2.1-1.2" />
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
export function IconChevronRight({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M9.5 5 16 12l-6.5 7" />
    </svg>
  );
}
export function IconLock({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}
export function IconStar({ className = "", filled = true }) {
  return (
    <svg {...base} className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9Z" />
    </svg>
  );
}
export function IconRestart({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8" />
      <path d="M4 3.5V8h4.5" />
    </svg>
  );
}
export function IconPause({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconTarget({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.5V5M12 19v3.5M1.5 12H5M19 12h3.5" />
    </svg>
  );
}
export function IconHome({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
    </svg>
  );
}
export function IconTrophy({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5A3.5 3.5 0 0 1 17 11" />
      <path d="M10 15h4M9 20h6M12 15v5" />
    </svg>
  );
}
export function IconBolt({ className = "" }) {
  return (
    <svg {...base} className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6Z" />
    </svg>
  );
}
