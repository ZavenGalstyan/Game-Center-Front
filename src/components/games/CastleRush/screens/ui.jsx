/**
 * Castle Rush — shared UI pieces. No emoji anywhere: every icon and unit
 * portrait is inline SVG drawn for this game.
 */

export function Icon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (name) {
    case "coin":
      return (
        <svg {...p} stroke="none">
          <circle cx="12" cy="12" r="10" fill="#e9a823" />
          <circle cx="12" cy="12" r="7.6" fill="#ffd453" />
          <path d="M8.5 9.5l3.5-2.5 3.5 2.5-3.5 7z" fill="#e9a823" />
          <path d="M8.5 9.5h7" stroke="#fff3c0" strokeWidth="1.1" />
        </svg>
      );
    case "castle":
      return (
        <svg {...p}>
          <path d="M3 21V9h3V6h3v3h2V5h2v4h2V6h3v3h3v12z" />
          <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
        </svg>
      );
    case "pause":
      return (
        <svg {...p}>
          <path d="M8 5v14M16 5v14" />
        </svg>
      );
    case "play":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M7 4.5v15l12.5-7.5z" />
        </svg>
      );
    case "back":
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "next":
      return (
        <svg {...p}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      );
    case "close":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "star":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...p}>
          <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
        </svg>
      );
    case "gear":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      );
    case "map":
      return (
        <svg {...p}>
          <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />
        </svg>
      );
    case "army":
      return (
        <svg {...p}>
          <path d="M5 4l9 9M3 6l2-2M12 15l3-3M14 13l3 3-2 2-3-3" />
          <path d="M19 4l-9 9M21 6l-2-2M12 15l-3-3M10 13l-3 3 2 2 3-3" />
        </svg>
      );
    case "swords":
      return (
        <svg {...p}>
          <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
          <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "chest":
      return (
        <svg {...p}>
          <path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9H3z" />
          <path d="M3 12h18M10.5 12v3h3v-3" />
        </svg>
      );
    case "crown":
      return (
        <svg {...p}>
          <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
        </svg>
      );
    case "restart":
      return (
        <svg {...p}>
          <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
      );
    case "people":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0-1-5.8M21 20a6 6 0 0 0-4-5.6" />
        </svg>
      );
    case "skull":
      return (
        <svg {...p}>
          <path d="M5 11a7 7 0 1 1 14 0c0 2-1 3.5-2 4.3V19H7v-3.7C6 14.5 5 13 5 11z" />
          <circle cx="9.5" cy="11" r="1.2" />
          <circle cx="14.5" cy="11" r="1.2" />
        </svg>
      );
    case "up":
      return (
        <svg {...p}>
          <path d="M12 19V6M6 11l6-6 6 6" />
        </svg>
      );
    default:
      return null;
  }
}

/** compact heraldic portraits of the four soldiers (team blue by default) */
export function UnitIcon({ type, size = 44, side = "player" }) {
  const cloth = side === "player" ? "#2f72d6" : "#c7362b";
  const clothD = side === "player" ? "#1f4f9c" : "#86211a";
  const trim = side === "player" ? "#f3c64f" : "#2b2427";
  const steel = "#cfd6de";
  const steelD = "#8e98a6";
  const skin = "#e7b48c";
  const p = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true };
  switch (type) {
    case "swordsman":
      return (
        <svg {...p}>
          <path d="M37 6l3 3-15 15-3-3z" fill="#e6ebf0" stroke="#7d8794" strokeWidth="1" />
          <path d="M20 20l8 8M18 26l4 4" stroke={trim} strokeWidth="3" strokeLinecap="round" />
          <path d="M8 46c0-9 6-14 16-14s16 5 16 14z" fill={cloth} />
          <path d="M20 32h8v14h-8z" fill={trim} opacity=".9" />
          <circle cx="24" cy="22" r="8" fill={skin} />
          <path d="M15 21a9 9 0 0 1 18 0z" fill={steel} />
          <path d="M14.5 21h19" stroke={steelD} strokeWidth="2" />
          <path d="M24 21v6" stroke={steelD} strokeWidth="2.2" />
        </svg>
      );
    case "archer":
      return (
        <svg {...p}>
          <path d="M37 5c6 8 6 22 0 30" fill="none" stroke="#8b5a2e" strokeWidth="3" strokeLinecap="round" />
          <path d="M37 5v30" stroke="#f2ead8" strokeWidth="1" />
          <path d="M8 46c0-9 6-14 16-14s16 5 16 14z" fill="#2a8a4a" />
          <path d="M16 31l8 4 8-4v15H16z" fill="#8a5a32" />
          <path d="M13 26c0-9 4-15 11-15s11 6 11 15c-2-3-5-4-11-4s-9 1-11 4z" fill="#2a8a4a" />
          <circle cx="24" cy="24" r="6.5" fill={skin} />
          <path d="M14 26c2-4 5-6 10-6s8 2 10 6c-1-6-4-11-10-11s-9 5-10 11z" fill="#23753e" />
        </svg>
      );
    case "shield":
      return (
        <svg {...p}>
          <path d="M8 46c0-9 6-14 16-14s16 5 16 14z" fill={steelD} />
          <circle cx="22" cy="20" r="8" fill={steelD} />
          <path d="M16 19h12" stroke="#2a2420" strokeWidth="2" />
          <path d="M26 12h16v20c0 7-8 12-8 12s-8-5-8-12z" fill={cloth} stroke={trim} strokeWidth="2" />
          <path d="M34 15v26M28 24h12" stroke={trim} strokeWidth="2.4" />
          <path d="M6 4l2 2" stroke="#e6ebf0" strokeWidth="3" strokeLinecap="round" />
          <path d="M8 6l6 36" stroke="#8b5a2e" strokeWidth="2.2" />
        </svg>
      );
    case "knight":
      return (
        <svg {...p}>
          <path d="M9 3l3 1 3 30-3 2-3-2z" fill="#eef2f6" stroke="#7d8794" strokeWidth="1" />
          <path d="M5 34h14" stroke={trim} strokeWidth="3" strokeLinecap="round" />
          <path d="M6 46c0-10 7-15 18-15s18 5 18 15z" fill={steel} />
          <path d="M18 31h12v15H18z" fill={cloth} />
          <path d="M16 12h16v12a8 8 0 0 1-16 0z" fill={steel} stroke={steelD} strokeWidth="1.2" />
          <path d="M16 19h16" stroke="#2a2420" strokeWidth="2.2" />
          <path d="M24 19v9" stroke="#2a2420" strokeWidth="1.6" />
          <path d="M24 12c-1-6 5-9 10-8-4 1-6 4-6 8z" fill={side === "player" ? "#4aa8ff" : "#ff4b3a"} />
          <path d="M22 4h4v8h-4z" fill={trim} opacity=".0" />
          <path d="M17 31h14l-2 3H19z" fill={clothD} />
        </svg>
      );
    default:
      return null;
  }
}

export function Stars({ n = 0, max = 3, size = 16, className = "" }) {
  return (
    <span className={`cr-stars ${className}`} aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""}>
          <Icon name="star" size={size} />
        </span>
      ))}
    </span>
  );
}

export const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(t / 60);
  const ss = String(t % 60).padStart(2, "0");
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${ss}`;
};
export const fmtNum = (n) => Math.round(n || 0).toLocaleString("en-US");
