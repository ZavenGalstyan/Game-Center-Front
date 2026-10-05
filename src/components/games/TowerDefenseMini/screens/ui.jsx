/**
 * Tower Defense Mini — small shared UI pieces. No emoji anywhere: every icon
 * is inline SVG drawn for this game.
 */
import { useMemo } from "react";
import { buildPath } from "../engine/path.js";
import { worldOf } from "../data/worlds.js";

export function Icon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (name) {
    case "heart":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" />
        </svg>
      );
    case "coin":
      return (
        <svg {...p} stroke="none">
          <circle cx="12" cy="12" r="10" fill="#f2b630" />
          <circle cx="12" cy="12" r="7.4" fill="#ffd862" />
          <path d="M12 7.5v9M9.6 9.6h3.9a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h3.9" stroke="#b9801a" strokeWidth="1.8" fill="none" />
        </svg>
      );
    case "wave":
      return (
        <svg {...p}>
          <path d="M4 20V5l8-2 8 2v15" />
          <path d="M4 9h16M9 20v-5h6v5" />
        </svg>
      );
    case "skull":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M12 2.5c-4.7 0-8 3.2-8 7.5 0 2.4 1.1 4.2 2.7 5.3v3.2c0 .8.6 1.5 1.5 1.5h1v-2h1.6v2h2.4v-2h1.6v2h1c.9 0 1.5-.7 1.5-1.5v-3.2c1.6-1.1 2.7-2.9 2.7-5.3 0-4.3-3.3-7.5-8-7.5zM8.7 13.2a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8zm6.6 0a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8z" />
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
    case "up":
      return (
        <svg {...p}>
          <path d="M12 19V6M6 11l6-6 6 6" />
        </svg>
      );
    case "sell":
      return (
        <svg {...p}>
          <path d="M3 12h4l2-3h6l2 3h4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          <path d="M12 3v6M9.5 5.5L12 3l2.5 2.5" />
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
    case "tower":
      return (
        <svg {...p}>
          <path d="M6 21V9h12v12M4 9V4h3v2h3V4h4v2h3V4h3v5M10 21v-5h4v5" />
        </svg>
      );
    case "range":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "sword":
      return (
        <svg {...p}>
          <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "snow":
      return (
        <svg {...p}>
          <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />
        </svg>
      );
    case "splash":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...p}>
          <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" />
        </svg>
      );
    case "restart":
      return (
        <svg {...p}>
          <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    default:
      return null;
  }
}

export function TowerIcon({ type, size = 30 }) {
  const p = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true };
  switch (type) {
    case "archer":
      return (
        <svg {...p}>
          <path d="M7 13L16 5l9 8z" fill="#3f9a46" />
          <rect x="8" y="13" width="16" height="2.5" fill="#6e4524" />
          <path d="M10 15.5l-1.5 13M22 15.5l1.5 13M10.5 21h11" stroke="#9a6638" strokeWidth="2.2" fill="none" />
          <circle cx="16" cy="11" r="1.8" fill="#e8b88f" />
        </svg>
      );
    case "cannon":
      return (
        <svg {...p}>
          <path d="M6 29V17h20v12z" fill="#b3ada3" />
          <path d="M6 17v-3h3v2h3v-2h3v2h2v-2h3v2h3v-2h3v3z" fill="#8d877d" />
          <path d="M12 13l13-6 1.6 3.4-13 6z" fill="#4a4f58" />
          <circle cx="13" cy="15" r="3" fill="#2f333a" />
        </svg>
      );
    case "frost":
      return (
        <svg {...p}>
          <path d="M9 29l1.5-8h11l1.5 8z" fill="#9fb4c6" />
          <path d="M16 3l5 8-5 9-5-9z" fill="#7fe6ff" stroke="#e6fbff" strokeWidth="1" />
          <path d="M8 13l2.5 4-2.5 3-2-3.5zM24 13l2 3.5-2 3.5-2.5-3z" fill="#bff0ff" />
        </svg>
      );
    case "mage":
      return (
        <svg {...p}>
          <path d="M10 29l2-15h8l2 15z" fill="#8f88a8" />
          <path d="M9 14h14l-2 2.5H11z" fill="#7c4ad6" />
          <circle cx="16" cy="8" r="4.6" fill="#c79bff" />
          <circle cx="16" cy="8" r="2" fill="#fff" opacity=".8" />
        </svg>
      );
    default:
      return null;
  }
}

export function EnemyIcon({ type, size = 22 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true };
  switch (type) {
    case "raider":
      return (
        <svg {...p}>
          <path d="M6 22v-6a6 6 0 0 1 12 0v6z" fill="#c4473a" />
          <circle cx="12" cy="9" r="4.2" fill="#e8b88f" />
          <path d="M7.5 9a4.5 4.5 0 0 1 9 0l-1-5-3.5-1.5L8.5 4z" fill="#c4473a" />
          <rect x="8.3" y="8.4" width="7.4" height="1.6" fill="#2a2020" />
        </svg>
      );
    case "scout":
      return (
        <svg {...p}>
          <path d="M8 22l1-7a3.5 3.5 0 0 1 6 0l1 7z" fill="#e5b734" />
          <circle cx="12" cy="10" r="3.4" fill="#e8b88f" />
          <path d="M8.4 10a3.6 3.6 0 0 1 7.2 0L19 3z" fill="#c9952a" />
          <path d="M8 14h8" stroke="#4ab0a0" strokeWidth="2" />
        </svg>
      );
    case "brute":
      return (
        <svg {...p}>
          <ellipse cx="12" cy="16" rx="9" ry="7" fill="#7f6d95" />
          <circle cx="12" cy="7" r="3.6" fill="#7f6d95" />
          <path d="M10.4 9.3l.4 1.6M13.6 9.3l-.4 1.6" stroke="#f4efe2" strokeWidth="1.2" />
          <ellipse cx="12" cy="16.5" rx="5" ry="4" fill="#a596b6" />
        </svg>
      );
    case "armored":
      return (
        <svg {...p}>
          <path d="M7 22v-7a5 5 0 0 1 10 0v7z" fill="#b7c0cc" />
          <rect x="8.5" y="3.5" width="7" height="7.5" rx="2.5" fill="#b7c0cc" />
          <rect x="9" y="6.6" width="6" height="1.4" fill="#1d2128" />
          <path d="M11 3.5V1.5h2v2z" fill="#d03c3c" />
          <path d="M4 12h7v8.5l-3.5 1.5L4 20.5z" fill="#3f5a8c" />
        </svg>
      );
    case "swarmer":
      return (
        <svg {...p}>
          <ellipse cx="12" cy="13" rx="6.5" ry="7.5" fill="#e8692a" />
          <circle cx="12" cy="5" r="2.6" fill="#3a2220" />
          <circle cx="10" cy="12" r="1.3" fill="#4a1e14" />
          <circle cx="14" cy="15" r="1.3" fill="#4a1e14" />
          <path d="M5.5 10l-3-1.5M5.5 14H2.5M5.5 18l-3 1.5M18.5 10l3-1.5M18.5 14h3M18.5 18l3 1.5" stroke="#2a1a14" strokeWidth="1.3" />
        </svg>
      );
    case "boss":
    case "warlord":
      return (
        <svg {...p}>
          <path d="M4 23c0-6 3.5-10 8-10s8 4 8 10z" fill={type === "warlord" ? "#5a2a24" : "#7a4f8c"} />
          <circle cx="12" cy="9.5" r="4.4" fill={type === "warlord" ? "#5a2a24" : "#7a4f8c"} />
          <path d="M8.2 7.5L4 2.5l1 6zM15.8 7.5L20 2.5l-1 6z" fill="#efe6d2" />
          <circle cx="10.4" cy="9.6" r="1" fill="#ffd34a" />
          <circle cx="13.6" cy="9.6" r="1" fill="#ffd34a" />
          {type === "warlord" && <path d="M8.5 5.5l1-2 1.2 1.6L12 3l1.3 2.1 1.2-1.6 1 2z" fill="#f2c14e" />}
        </svg>
      );
    default:
      return null;
  }
}

export function Stars({ n = 0, of = 3, size = 16 }) {
  return (
    <span className="tdm-stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""}>
          <Icon name="star" size={size} />
        </span>
      ))}
    </span>
  );
}

/** SVG mini-map of a level, drawn from the same data the engine uses. */
export function MiniMap({ level, locked }) {
  const W = worldOf(level);
  const paths = useMemo(() => level.paths.map(buildPath), [level]);
  const end = level.paths[0][level.paths[0].length - 1];
  return (
    <svg className="tdm-minimap" viewBox="-15 -9 30 18" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="-15" y="-9" width="30" height="18" rx="1.2" fill={W.grass[0]} />
      {level.water.map(([x, z, rx, rz], i) => (
        <ellipse key={i} cx={x} cy={z} rx={rx} ry={rz} fill={W.water} />
      ))}
      {paths.map((p, i) => (
        <g key={i}>
          <polyline points={p.dense.map(([x, z]) => `${x},${z}`).join(" ")} fill="none" stroke={W.roadEdge} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={p.dense.map(([x, z]) => `${x},${z}`).join(" ")} fill="none" stroke={W.road} strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      {level.spots.map(([x, z], i) => (
        <circle key={i} cx={x} cy={z} r="0.75" fill="#cfc9bd" stroke="#8d877d" strokeWidth="0.2" />
      ))}
      <rect x={end[0] - 1.1} y={end[1] - 1.1} width="2.2" height="2.2" rx="0.3" fill="#3b6fd0" stroke="#fff" strokeWidth="0.25" />
      {level.paths.map((w, i) => (
        <circle key={i} cx={Math.max(-14.3, Math.min(14.3, w[0][0]))} cy={Math.max(-8.3, Math.min(8.3, w[0][1]))} r="0.8" fill="#7a2a9a" stroke="#e0b0ff" strokeWidth="0.2" />
      ))}
      {locked && <rect x="-15" y="-9" width="30" height="18" fill="rgba(10,14,20,0.55)" />}
    </svg>
  );
}
