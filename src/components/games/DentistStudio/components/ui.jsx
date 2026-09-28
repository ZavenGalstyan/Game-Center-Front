/**
 * Dentist Studio — small shared UI pieces: line icons, star rows, and tool
 * icons rendered with the SAME canvas code as the in-game tool sprites.
 */
import { useEffect, useRef } from "react";
import { drawTool } from "../render/toolSprites.js";

const P = {
  back: <path d="M15 5l-7 7 7 7" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
      <circle cx="12" cy="12" r="7" />
    </>
  ),
  chart: <path d="M5 19V11M10 19V6M15 19v-5M20 19V9M3 19.5h18" />,
  hint: (
    <>
      <path d="M9 17h6M10 20.5h4" />
      <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M8 5l11 7-11 7z" />,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  replay: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.8h3.8" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  home: <path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5" />,
  tools: (
    <>
      <path d="M5 19L14 10" />
      <circle cx="16.5" cy="7.5" r="3.5" />
      <path d="M13 20l6-6" />
    </>
  ),
  studio: (
    <>
      <path d="M4 20h16M6 20V9h12v11M9 9V5h6v4" />
      <path d="M10 14h4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16 14.6c2.4.2 4.2 1.7 4.8 4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  zoomL: <path d="M14 6l-6 6 6 6" />,
  zoomR: <path d="M10 6l6 6-6 6" />,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name, size = 18, fill = false, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function Stars({ n = 0, of = 3, size = 16, className = "" }) {
  return (
    <span className={`dst-stars ${className}`} aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? "dst-star dst-star--on" : "dst-star"}>
          <Icon name="star" size={size} fill stroke={1.2} />
        </span>
      ))}
    </span>
  );
}

/** Tooth-shaped logo mark. */
export function ToothMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="dstToothG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3f3f0" />
        </linearGradient>
      </defs>
      <path d="M20 8c-8 0-13 6-13 14 0 7 3 11 5 17 2 7 3 17 8 17 4 0 4-10 7-14 1.5-2 3.5-2 5 0 3 4 3 14 7 14 5 0 6-10 8-17 2-6 5-10 5-17 0-8-5-14-13-14-5 0-7 3-12 3S25 8 20 8z" fill="url(#dstToothG)" stroke="#5fc9b4" strokeWidth="3" strokeLinejoin="round" />
      <path d="M16 20c1-4 4-6 8-6" fill="none" stroke="#bfeee4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M47 6l1.6 4.4L53 12l-4.4 1.6L47 18l-1.6-4.4L41 12l4.4-1.6z" fill="#ffd36a" />
    </svg>
  );
}

/** Tool icon — the real sprite, cropped so the working tip reads clearly. */
export function ToolIcon({ tool, set, size = 44, locked = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // per-tool framing: long-bodied tools (spray, suction) zoom out a little
    const frame = { water: [0.62, 0.2], suction: [0.7, 0.18], floss: [1.25, 0.26] }[tool] || [1, 0.26];
    const k = (size / 128) * frame[0];
    const tip = size * frame[1];
    if (locked) ctx.globalAlpha = 0.35;
    drawTool(ctx, tool, tip, tip, 0.785, k, { set, contact: 0, spin: 0.6, open: true, noShadow: true, foam: 0, time: 0 });
    if (locked) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(120, 140, 150, 0.9)";
      ctx.fillRect(0, 0, size, size);
    }
  }, [tool, set, size, locked]);
  return <canvas ref={ref} className="dst-toolicon" style={{ width: size, height: size }} aria-hidden="true" />;
}
