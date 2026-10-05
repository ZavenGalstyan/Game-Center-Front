/**
 * Island Conquest — shared UI pieces. Every icon is inline SVG drawn for this
 * game (no emoji, no icon fonts, nothing external).
 */
export function Icon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
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
    case "island":
      return (
        <svg {...p}>
          <path d="M3 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" />
          <path d="M6 15c1-3 4-5 6-5s5 2 6 5" />
          <path d="M12 10V4l4 2-4 2" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "boat":
      return (
        <svg {...p}>
          <path d="M3 15h18l-3 5H6z" />
          <path d="M12 3v12M12 4l6 8h-6" />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
      );
    case "skull":
      return (
        <svg {...p}>
          <path d="M5 11a7 7 0 1 1 14 0v3l-2 1v3H7v-3l-2-1z" />
          <circle cx="9.5" cy="11" r="1.4" fill="currentColor" />
          <circle cx="14.5" cy="11" r="1.4" fill="currentColor" />
        </svg>
      );
    case "shield":
      return (
        <svg {...p}>
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6" />
        </svg>
      );
    case "replay":
      return (
        <svg {...p}>
          <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "close":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "speed":
      return (
        <svg {...p}>
          <path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Stars({ n = 0, size = 16, max = 3 }) {
  return (
    <span className="ic-stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""}>
          <Icon name="star" size={size} />
        </span>
      ))}
    </span>
  );
}

export const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function Toggle({ label, value, onChange, hint }) {
  return (
    <button type="button" className={`ic-toggle${value ? " is-on" : ""}`} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span className="ic-toggle__txt">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <span className="ic-toggle__knob" aria-hidden="true" />
    </button>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="ic-seg">
      <span className="ic-seg__label">{label}</span>
      <div className="ic-seg__opts" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
