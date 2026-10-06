/** Color Platforms — small inline SVG icon set (no emoji, no icon font). */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };

const PATHS = {
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  star: <path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-4.9-4.4 6.5-.7z" fill="currentColor" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...S} strokeWidth="2.2" />
    </>
  ),
  left: <path d="M15 5l-7 7 7 7" {...S} strokeWidth="3" />,
  right: <path d="M9 5l7 7-7 7" {...S} strokeWidth="3" />,
  up: <path d="M5 15l7-7 7 7" {...S} strokeWidth="3" />,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" {...S} strokeWidth="2.6" />,
  retry: <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5" {...S} />,
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" />
    </>
  ),
  palette: (
    <>
      <circle cx="8" cy="9" r="3.4" fill="#3d8bff" />
      <circle cx="16" cy="9" r="3.4" fill="#ff4b5c" />
      <circle cx="12" cy="16" r="3.4" fill="#ffc531" />
    </>
  ),
  chart: (
    <>
      <rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" />
      <rect x="16" y="3.5" width="4" height="16.5" rx="1" fill="currentColor" />
    </>
  ),
  gear: (
    <path
      d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.2 4.8l1.8 1.4-2 3.4-2.2-.8a7.6 7.6 0 0 1-1.9 1.1L15.6 21h-4l-.4-2.4a7.6 7.6 0 0 1-1.9-1.1l-2.2.8-2-3.4 1.8-1.4a7.5 7.5 0 0 1 0-2.2L5.1 9.9l2-3.4 2.2.8a7.6 7.6 0 0 1 1.9-1.1L11.6 3h4l.4 2.4c.7.3 1.3.6 1.9 1.1l2.2-.8 2 3.4-1.8 1.4c.1.7.1 1.5 0 2.2z"
      fill="currentColor"
      transform="translate(-1.6 0)"
    />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <path d="M12 7.5V12l3 2" {...S} />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V3.5" {...S} strokeWidth="2.2" />
      <path d="M6 4h12l-3 4 3 4H6z" fill="currentColor" />
    </>
  ),
  fall: <path d="M12 4v13M6.5 12L12 17.5 17.5 12" {...S} />,
  next: <path d="M6 5.5v13l8.5-6.5zM16.5 5.5h2.5v13h-2.5z" fill="currentColor" />,
  home: <path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" fill="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" {...S} strokeWidth="3" />,
  circle: <circle cx="12" cy="12" r="6.5" {...S} strokeWidth="3" />,
  triangle: <path d="M12 5l7.5 13h-15z" fill="currentColor" />,
  diamond: <path d="M12 3.5l6.5 8.5-6.5 8.5-6.5-8.5z" fill="currentColor" />,
};

export function Icon({ name, className = "", size }) {
  return (
    <svg className={`cp-icon ${className}`} viewBox="0 0 24 24" width={size || "1em"} height={size || "1em"} aria-hidden="true" focusable="false">
      {PATHS[name] || null}
    </svg>
  );
}

export const COLOR_ICON = { BLUE: "circle", RED: "triangle", YELLOW: "diamond" };
