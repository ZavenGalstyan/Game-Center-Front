/** Jump Ball — small inline SVG icon set (no emoji, no icon font). */
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
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </>
  ),
  left: <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  right: <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  retry: (
    <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" />
      <path d="M3.8 11.2c5 1.8 11.4 1.8 16.4 0" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
      <circle cx="9" cy="8.6" r="2" fill="rgba(255,255,255,.7)" />
    </>
  ),
  up: <path d="M12 4l7 8h-4.5v8h-5v-8H5z" fill="currentColor" />,
  infinity: (
    <path
      d="M7 8.5c-2 0-3.5 1.6-3.5 3.5S5 15.5 7 15.5c3.5 0 6.5-7 10-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-6.5-7-10-7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
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
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  spring: (
    <path d="M5 20h14M7 17l10-2.5L7 12l10-2.5L7 7l10-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  flag: (
    <>
      <path d="M6 21V3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 4h12l-3 4 3 4H6z" fill="currentColor" />
    </>
  ),
};

export function Icon({ name, className = "", size }) {
  return (
    <svg className={`jb-icon ${className}`} viewBox="0 0 24 24" width={size || "1em"} height={size || "1em"} aria-hidden="true" focusable="false">
      {PATHS[name] || null}
    </svg>
  );
}
