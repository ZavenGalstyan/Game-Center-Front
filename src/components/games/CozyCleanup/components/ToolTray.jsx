/**
 * Cozy Cleanup — the bottom tool tray. Only shows tools relevant to the
 * current room (per-level `tools` list), so the player is never staring at
 * fifteen icons. Selecting a tool gives it a small lift + soft glow —
 * nothing louder than that.
 */
const TOOL_META = {
  hand: { label: "Hand", icon: (c) => (
    <path d="M9 13V6a2 2 0 1 1 4 0v5m0-3a2 2 0 1 1 4 0v3m0-1a2 2 0 1 1 4 0v4m-12-1v-1a2 2 0 1 1 4 0v1m-4 0c0 6 3 9 7 9s7-3 7-8v-3" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ) },
  duster: { label: "Duster", icon: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round">
      <path d="M8 20 L15 13" />
      <path d="M14 4 Q10 6 12 10 Q14 6 18 6 Q17 10 20 11 Q15 12 14 4Z" fill={c} stroke="none" opacity="0.85" />
    </g>
  ) },
  vacuum: { label: "Vacuum", icon: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="4" width="7" height="11" rx="2" />
      <path d="M9 9 L4 12 L4 18" />
      <path d="M4 18 L8 18" />
    </g>
  ) },
  mop: { label: "Mop", icon: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 3 L8 19" />
      <path d="M5 19 Q8 22 11 19" />
    </g>
  ) },
  spray: { label: "Spray", icon: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="9" width="8" height="12" rx="2" />
      <path d="M11 9 V6 M9 6 H14 L16 3" />
      <path d="M18 3 L20 1 M19 5 L21 5 M17 6 L18.5 7.5" />
    </g>
  ) },
  cloth: { label: "Cloth", icon: (c) => (
    <path d="M5 8 L19 8 L16 19 Q12 21 8 19 Z" fill={c} opacity="0.85" stroke="none" />
  ) },
  sponge: { label: "Sponge", icon: (c) => (
    <g>
      <rect x="4" y="8" width="16" height="9" rx="3" fill={c} opacity="0.85" />
      <circle cx="8" cy="11.5" r="0.9" fill="#fff" opacity="0.7" />
      <circle cx="14" cy="13.5" r="0.9" fill="#fff" opacity="0.7" />
      <circle cx="11" cy="10.5" r="0.7" fill="#fff" opacity="0.6" />
    </g>
  ) },
  brush: { label: "Brush", icon: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round">
      <path d="M13 3 L8 17" />
      <path d="M6 17 Q6 21 10 21 Q13 21 12 17 Z" fill={c} stroke="none" opacity="0.85" />
    </g>
  ) },
  trashbag: { label: "Bag", icon: (c) => (
    <path d="M6 8h12l-1.4 11a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8Z M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke={c} strokeWidth="1.7" strokeLinejoin="round" />
  ) },
};

const COSMETIC_COLORS = {
  vacuum: { cream: "#d8ae63", sage: "#7fa66f", pink: "#e08a9c", lavender: "#a98fd2" },
  mop: { classic: "#8a6142", flower: "#e08a9c", modern: "#5c6670" },
  cloth: { plain: "#7fb0c2", dots: "#7a9cc9", floral: "#e08a9c" },
};

export default function ToolTray({ tools, active, onSelect, cosmetics, disabled = false, containerRef, highlightToolId = null }) {
  return (
    <div className="cc-tray" role="toolbar" aria-label="Cleaning tools" ref={containerRef}>
      {tools.map((id) => {
        const meta = TOOL_META[id];
        if (!meta) return null;
        const isActive = active === id;
        const isHighlighted = highlightToolId === id && !isActive;
        const cosmeticColor = cosmetics && COSMETIC_COLORS[id] ? COSMETIC_COLORS[id][cosmetics[id]] : null;
        const color = isActive ? "var(--cc-accent)" : (cosmeticColor || "var(--cc-tool-ink)");
        return (
          <button
            key={id}
            type="button"
            className={`cc-tray__tool${isActive ? " cc-tray__tool--active" : ""}${isHighlighted ? " cc-tray__tool--highlight" : ""}`}
            onClick={() => !disabled && onSelect(id)}
            aria-pressed={isActive}
            title={meta.label}
            disabled={disabled}
          >
            <svg viewBox="0 0 24 24" width="22" height="22">{meta.icon(color)}</svg>
            <span>{meta.label}</span>
            {isHighlighted && <span className="cc-tray__tool-arrow" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
