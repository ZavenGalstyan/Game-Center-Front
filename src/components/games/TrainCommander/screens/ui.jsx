/**
 * Train Commander — shared UI pieces. Every icon is inline SVG drawn for this
 * game (no emoji, no external assets).
 */
import { MODULES } from "../data/modules.js";

const base = (size) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true });

export function Icon({ name, size = 20 }) {
  const p = base(size);
  switch (name) {
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
    case "fast":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M3 5.5v13l9-6.5zM12 5.5v13l9-6.5z" />
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
          <path d="M12 2.8l2.75 5.9 6.45.75-4.8 4.4 1.3 6.35L12 17l-5.7 3.2 1.3-6.35-4.8-4.4 6.45-.75z" />
        </svg>
      );
    case "scrap":
      return (
        <svg {...p} stroke="none">
          <path d="M12 2l2 2.6 3.2-.6.6 3.2L20.4 9 19 12l1.4 3-2.6 1.8-.6 3.2-3.2-.6L12 22l-2-2.6-3.2.6-.6-3.2L3.6 15 5 12 3.6 9l2.6-1.8.6-3.2 3.2.6z" fill="#e9a823" />
          <circle cx="12" cy="12" r="4.6" fill="#ffd453" />
          <circle cx="12" cy="12" r="2" fill="#b57812" />
        </svg>
      );
    case "loco":
      return (
        <svg {...p}>
          <path d="M3 17h17l1.5-3H17V8h-4v6H8V6H4v11z" />
          <circle cx="7" cy="19" r="1.6" />
          <circle cx="16" cy="19" r="1.6" />
          <path d="M11 6V3" />
        </svg>
      );
    case "train":
      return (
        <svg {...p}>
          <rect x="2" y="8" width="7" height="8" rx="1" />
          <rect x="11" y="8" width="5" height="8" rx="1" />
          <rect x="18" y="8" width="4" height="8" rx="1" />
          <path d="M9 13h2M16 13h2M4 8V5h3" />
          <circle cx="4.5" cy="18" r="1.3" />
          <circle cx="13.5" cy="18" r="1.3" />
          <circle cx="20" cy="18" r="1.3" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...p}>
          <path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-1-1-3z" />
        </svg>
      );
    case "up":
      return (
        <svg {...p}>
          <path d="M12 19V6M6 11l6-6 6 6" />
        </svg>
      );
    case "recycle":
      return (
        <svg {...p}>
          <path d="M4 12a8 8 0 0 1 13.5-5.8L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.5 5.8L4 15.5M4 20v-4.5h4.5" />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
      );
    case "boss":
      return (
        <svg {...p}>
          <path d="M4 7l3 3 5-6 5 6 3-3-2 11H6z" />
          <path d="M9 14h6" />
        </svg>
      );
    case "warn":
      return (
        <svg {...p}>
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v5M12 18v.5" />
        </svg>
      );
    case "map":
      return (
        <svg {...p}>
          <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
      );
    case "stats":
      return (
        <svg {...p}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "gear":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "rail":
      return (
        <svg {...p}>
          <path d="M8 2l-3 20M16 2l3 20M6.5 7h11M6 12h12M5.3 17h13.4" />
        </svg>
      );
    case "rotate":
      return (
        <svg {...p}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
        </svg>
      );
    default:
      return null;
  }
}

/** module pictograms (coloured per module) */
export function ModuleIcon({ type, size = 30 }) {
  const c = MODULES[type]?.color || "#fff";
  const p = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true };
  switch (type) {
    case "gunner":
      return (
        <svg {...p}>
          <rect x="5" y="17" width="14" height="8" rx="2" fill="#2b3440" stroke={c} strokeWidth="1.6" />
          <path d="M6 17c0-5 4-8 8-8s5 2 5 4" fill="none" stroke={c} strokeWidth="2" />
          <rect x="15" y="12.5" width="13" height="2.4" rx="1" fill={c} />
          <rect x="15" y="16.5" width="13" height="2.4" rx="1" fill={c} />
          <circle cx="29" cy="13.7" r="1.5" fill="#fff6c8" />
        </svg>
      );
    case "cannon":
      return (
        <svg {...p}>
          <path d="M4 25h17l2-6-4-5H8l-4 5z" fill="#2b3440" stroke={c} strokeWidth="1.6" />
          <rect x="16" y="13" width="13" height="5" rx="1.5" fill={c} transform="rotate(-14 16 15)" />
          <circle cx="9" cy="20" r="1.4" fill={c} />
          <circle cx="13" cy="20" r="1.4" fill={c} />
        </svg>
      );
    case "lancer":
      return (
        <svg {...p}>
          <path d="M20 4c-6 4-6 20 0 24" fill="none" stroke={c} strokeWidth="2.4" />
          <path d="M20 4L11 16l9 12" fill="none" stroke="#e8e2cf" strokeWidth="1.2" />
          <rect x="4" y="14.8" width="24" height="2.4" rx="1" fill="#c9b48a" />
          <path d="M28 16l-4-3v6z" fill={c} />
        </svg>
      );
    case "repair":
      return (
        <svg {...p}>
          <circle cx="11" cy="20" r="6.5" fill="none" stroke={c} strokeWidth="2.4" strokeDasharray="3 2" />
          <circle cx="11" cy="20" r="2.2" fill={c} />
          <path d="M18 14l7-7m-2-2 4 4-2.5 2.5-4-4z" fill="none" stroke="#e8e2cf" strokeWidth="2" strokeLinecap="round" />
          <path d="M25 22l3 3" stroke="#ffd24a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** enemy silhouettes for intro banners / route cards */
export function EnemyIcon({ type, size = 30 }) {
  const p = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true };
  const red = "#ff6a4a";
  const body = "#2a1f1c";
  const wheels = (xs, r = 3.6) => xs.map((x) => <circle key={x} cx={x} cy={25} r={r} fill={body} stroke={red} strokeWidth="1.4" />);
  switch (type) {
    case "raider":
    case "scout":
      return (
        <svg {...p}>
          {wheels([8, 24])}
          <path d="M8 25l5-7h8l3 7" fill="none" stroke={red} strokeWidth="1.8" />
          <circle cx="16" cy="8" r="2.6" fill={red} />
          <path d="M15 11l-2 7h6l1-5" fill={body} stroke={red} strokeWidth="1.4" />
          {type === "scout" ? <path d="M6 20V8l6 3-6 3" fill="#d9b53a" /> : <path d="M19 12l6-4" stroke="#d8cdb4" strokeWidth="2" />}
        </svg>
      );
    case "armored":
      return (
        <svg {...p}>
          {wheels([7, 25], 4)}
          <path d="M5 21h22l-2-6H9z" fill="#55504c" stroke={red} strokeWidth="1.4" />
          <path d="M13 6l3-2 3 2v5h-6z" fill="#6d6863" stroke={red} strokeWidth="1.2" />
          <rect x="21" y="5" width="6" height="5" fill="#5c5853" stroke={red} strokeWidth="1.2" />
        </svg>
      );
    case "ranged":
      return (
        <svg {...p}>
          {wheels([6, 18, 27], 3.2)}
          <rect x="15" y="15" width="14" height="6" rx="2" fill={body} stroke={red} strokeWidth="1.4" />
          <path d="M18 12l10-4M26 5c2 3 2 6 0 8" fill="none" stroke="#d8cdb4" strokeWidth="1.6" />
        </svg>
      );
    case "vehicle":
    case "hauler":
    case "warwagon":
    case "captain":
      return (
        <svg {...p}>
          {wheels([7, 17, 26], 3.6)}
          <path d="M3 21V13h14l2-4h7l3 7v5z" fill={body} stroke={red} strokeWidth="1.6" />
          <path d="M29 14l2 2-2 2" fill="#d8cdb4" />
          <rect x="6" y="8" width="7" height="5" fill={red} opacity="0.7" />
        </svg>
      );
    case "walker":
      return (
        <svg {...p}>
          <rect x="7" y="7" width="18" height="9" rx="2" fill={body} stroke={red} strokeWidth="1.6" />
          <path d="M10 16l-3 6 2 6M22 16l3 6-2 6M14 16v12M18 16v12" stroke={red} strokeWidth="1.8" fill="none" />
          <path d="M20 7l6-4" stroke="#d8cdb4" strokeWidth="2.4" />
        </svg>
      );
    case "leviathan":
      return (
        <svg {...p}>
          <rect x="2" y="11" width="11" height="10" rx="1.5" fill={body} stroke={red} strokeWidth="1.4" />
          <rect x="15" y="12" width="9" height="9" rx="1.5" fill={body} stroke={red} strokeWidth="1.4" />
          <path d="M25 21V13h5l1 8z" fill={body} stroke={red} strokeWidth="1.4" />
          {wheels([5, 10, 18, 22, 28], 2.2)}
          <path d="M7 11V7h6" stroke="#d8cdb4" strokeWidth="1.8" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}

export function Stars({ n, max = 3, size = 16 }) {
  return (
    <span className="tc-stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""}>
          <Icon name="star" size={size} />
        </span>
      ))}
    </span>
  );
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <button type="button" className={`tc-toggle${value ? " is-on" : ""}`} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span className="tc-toggle__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="tc-toggle__track">
        <span className="tc-toggle__knob" />
      </span>
    </button>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="tc-seg" role="radiogroup" aria-label={label}>
      <span className="tc-seg__label">{label}</span>
      <div className="tc-seg__opts">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(ss).padStart(2, "0")}`;
};
export const fmtKm = (u) => `${(u / 100).toFixed(1)} km`;
