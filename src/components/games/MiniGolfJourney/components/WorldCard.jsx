/**
 * Mini Golf Journey — a world tile on the Level Select map.
 *
 * Themed banner (SVG mini-scene tinted from the world palette), progress bar,
 * star total, and a clear locked state. Reads like a game map node, not a
 * dashboard row.
 */
import { IconLock, IconChevronRight, IconStar } from "./Icons.jsx";

export default function WorldCard({ world, locked, completed, total, stars, maxStars, onClick }) {
  const pal = world.palette;
  return (
    <button
      type="button"
      className={`mgj-world ${locked ? "is-locked" : ""}`}
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{ "--w-accent": pal.accent, "--w-band": pal.edgeBand }}
    >
      <span className="mgj-world__scene">
        <WorldScene world={world} />
        {locked && (
          <span className="mgj-world__lock">
            <IconLock />
          </span>
        )}
      </span>

      <span className="mgj-world__body">
        <span className="mgj-world__top">
          <span className="mgj-world__no">World {world.id}</span>
          <span className="mgj-world__diff">{world.difficulty}</span>
        </span>
        <span className="mgj-world__name">{world.name}</span>
        <span className="mgj-world__tag">{world.tag}</span>

        {locked ? (
          <span className="mgj-world__hint">Clear World {world.id - 1} to unlock</span>
        ) : (
          <span className="mgj-world__prog">
            <span className="mgj-world__bar">
              <span className="mgj-world__bar-fill" style={{ width: `${(completed / total) * 100}%` }} />
            </span>
            <span className="mgj-world__prog-txt">
              {completed}/{total}
            </span>
            <span className="mgj-world__stars">
              <IconStar /> {stars}/{maxStars}
            </span>
          </span>
        )}
      </span>

      {!locked && (
        <span className="mgj-world__go">
          <IconChevronRight />
        </span>
      )}
    </button>
  );
}

function WorldScene({ world }) {
  const p = world.palette;
  const sky = world.id === 5 ? p.backdrop : [p.backdrop[0], p.backdrop[p.backdrop.length - 1]];
  return (
    <svg viewBox="0 0 120 60" preserveAspectRatio="none" className="mgj-wscene" aria-hidden="true">
      <defs>
        <linearGradient id={`ws-sky-${world.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[sky.length - 1]} />
        </linearGradient>
        <linearGradient id={`ws-grn-${world.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.groundHi} />
          <stop offset="1" stopColor={p.groundLo} />
        </linearGradient>
      </defs>
      <rect width="120" height="60" fill={`url(#ws-sky-${world.id})`} />
      {world.id === 5 && (
        <>
          <circle cx="92" cy="14" r="7" fill="rgba(220,230,255,0.9)" />
          <rect x="8" y="30" width="12" height="16" fill="rgba(20,20,40,0.6)" />
          <rect x="24" y="24" width="10" height="22" fill="rgba(20,20,40,0.6)" />
          <rect x="90" y="28" width="12" height="18" fill="rgba(20,20,40,0.6)" />
        </>
      )}
      {world.id === 3 && (
        <>
          <path d="M0 34 L26 14 L52 34 Z" fill="rgba(255,255,255,0.85)" />
          <path d="M40 36 L70 12 L100 36 Z" fill="rgba(255,255,255,0.7)" />
        </>
      )}
      <path d="M0 60 L0 40 Q 40 30 70 40 T 120 38 L120 60 Z" fill={p.hills[0]} opacity="0.8" />
      <rect x="0" y="42" width="120" height="18" fill={`url(#ws-grn-${world.id})`} />
      <rect x="0" y="41" width="120" height="2" fill={p.fairwayHi} opacity="0.7" />
      {/* cup + flag */}
      <ellipse cx="90" cy="50" rx="3.4" ry="2" fill={p.cup} />
      <path d="M90 49 L90 36" stroke="#e8e3d6" strokeWidth="1.2" />
      <path d="M90 36 L99 38.5 L90 41 Z" fill={p.flag} />
      {/* ball */}
      <circle cx="24" cy="51" r="2.6" fill="#fff" />
      <circle cx="23" cy="50" r="1" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}
