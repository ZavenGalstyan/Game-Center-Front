import { useMemo, useState } from "react";
import ElementToken from "./ElementToken.jsx";
import { getElement } from "../data/elements.js";
import { CHAPTERS } from "../data/chapters.js";

const TABS = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recent" },
  { id: "favorites", label: "Favorites" },
];

/**
 * The discovered-element library — required scale features (search, chapter
 * filters, Recent, Favorites) live here per the design brief. Spawning is a
 * pointerdown handed to the parent Workspace screen, which owns the actual
 * drag-ghost + drop-onto-canvas logic (it needs the canvas's DOM rect).
 */
export default function LibraryPanel({
  discoveredIds,
  favorites,
  recentIds,
  onToggleFavorite,
  onSpawnPointerDown,
  onSpawnDoubleClick,
}) {
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [tab, setTab] = useState("all");

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const items = useMemo(() => {
    let ids = discoveredIds;
    if (tab === "recent") ids = recentIds;
    else if (tab === "favorites") ids = discoveredIds.filter((id) => favSet.has(id));

    const q = query.trim().toLowerCase();
    return ids
      .map((id) => getElement(id))
      .filter(Boolean)
      .filter((el) => (chapterFilter === "all" ? true : el.chapter === chapterFilter))
      .filter((el) => (q ? el.name.toLowerCase().includes(q) : true));
  }, [discoveredIds, recentIds, favSet, tab, chapterFilter, query]);

  return (
    <div className="em-library">
      <div className="em-library__search">
        <svg viewBox="0 0 24 24" className="em-library__search-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements…"
          aria-label="Search elements"
        />
      </div>

      <div className="em-library__tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`em-chip${tab === t.id ? " em-chip--active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="em-library__filters">
        <button type="button" className={`em-chip${chapterFilter === "all" ? " em-chip--active" : ""}`} onClick={() => setChapterFilter("all")}>All</button>
        {CHAPTERS.map((c) => (
          <button key={c.id} type="button" className={`em-chip${chapterFilter === c.id ? " em-chip--active" : ""}`} onClick={() => setChapterFilter(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="em-library__grid">
        {items.length === 0 && <p className="em-library__empty">No elements found.</p>}
        {items.map((el) => (
          <div key={el.id} className="em-library__cell">
            <ElementToken
              elementId={el.id}
              variant="library"
              favorite={favSet.has(el.id)}
              onPointerDown={(e) => onSpawnPointerDown(el.id, e)}
              onDoubleClick={() => onSpawnDoubleClick(el.id)}
            />
            <button
              type="button"
              className={`em-library__fav-btn${favSet.has(el.id) ? " em-library__fav-btn--on" : ""}`}
              onClick={() => onToggleFavorite(el.id)}
              aria-label={favSet.has(el.id) ? `Unfavorite ${el.name}` : `Favorite ${el.name}`}
              title={favSet.has(el.id) ? "Unfavorite" : "Favorite"}
            >
              ★
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
