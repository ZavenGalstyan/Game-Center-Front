/**
 * Cake Designer — small shared UI atoms (stars, coin pill, lock, tabs,
 * item tiles, colour swatches). Everything is scoped under `.cd`.
 */

import { COLOR_BY_ID } from "../data/items.js";

export function Stars({ value = 0, size = 16, className = "" }) {
  return (
    <span className={`cd-stars ${className}`} aria-label={`${value} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          className={i < value ? "cd-star cd-star--on" : "cd-star"}>
          <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.1 20.9l1.1-6.5L2.5 9.8l6.5-.9z" />
        </svg>
      ))}
    </span>
  );
}

export function CoinPill({ amount, className = "" }) {
  return (
    <span className={`cd-coin-pill ${className}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#f0c04a" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="#b98f2e" strokeWidth="1.6" />
        <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="800" fill="#8a5a2c">$</text>
      </svg>
      {amount.toLocaleString()}
    </span>
  );
}

export function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CategoryTabs({ tabs, active, onChange, done = {} }) {
  return (
    <div className="cd-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`cd-tab${active === t.id ? " cd-tab--active" : ""}${done[t.id] ? " cd-tab--done" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span className="cd-tab__icon" aria-hidden="true">{t.icon}</span>
          <span className="cd-tab__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ItemTile({ label, selected, locked, lockText, onClick, onPointerDown, children, tone }) {
  return (
    <button
      type="button"
      className={`cd-tile${selected ? " cd-tile--on" : ""}${locked ? " cd-tile--locked" : ""}`}
      onClick={locked ? undefined : onClick}
      onPointerDown={locked ? undefined : onPointerDown}
      disabled={locked}
      title={locked ? lockText : label}
      style={tone ? { "--tile-tone": tone } : undefined}
    >
      <span className="cd-tile__art">{children}</span>
      <span className="cd-tile__label">{label}</span>
      {locked && <span className="cd-tile__lock"><LockIcon /></span>}
    </button>
  );
}

export function Carousel({ children, className = "" }) {
  return (
    <div className={`cd-carousel ${className}`}>
      <div className="cd-carousel__track">{children}</div>
    </div>
  );
}

export function ColorSwatches({ colors, value, onPick, unlocked }) {
  return (
    <div className="cd-swatches">
      {colors.map((id) => {
        const c = COLOR_BY_ID[id];
        const locked = unlocked && !unlocked(id);
        return (
          <button
            key={id}
            type="button"
            className={`cd-swatch${value === id ? " cd-swatch--on" : ""}${locked ? " cd-swatch--locked" : ""}`}
            style={{ "--sw": c.hex, "--sw-sh": c.shade }}
            onClick={locked ? undefined : () => onPick(id)}
            disabled={locked}
            title={locked ? "Locked" : c.name}
            aria-label={c.name}
          >
            {locked && <span className="cd-swatch__lock"><LockIcon size={12} /></span>}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="cd-segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className={`cd-seg${value === o.value ? " cd-seg--on" : ""}`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
