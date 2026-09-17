import { useMemo, useState } from "react";
import { ElementIcon } from "../components/icons.jsx";
import { IconBack } from "../components/uiIcons.jsx";
import { ELEMENTS, getElement } from "../data/elements.js";
import { CHAPTERS } from "../data/chapters.js";
import { recipesForResult } from "../engine/discoveryEngine.js";
import { recipeKey } from "../data/recipes.js";

function BookEntry({ el, discovered, discoveryNumber, foundKeys }) {
  if (!discovered) {
    return (
      <div className="em-book-entry em-book-entry--locked">
        <div className="em-book-entry__art em-book-entry__art--silhouette" />
        <span className="em-book-entry__name">???</span>
      </div>
    );
  }
  const recipes = recipesForResult(el.id);
  return (
    <div className="em-book-entry">
      <div className="em-book-entry__art"><ElementIcon id={el.id} family={el.family} /></div>
      <span className="em-book-entry__name">{el.name}</span>
      <span className="em-book-entry__num">#{discoveryNumber}</span>
      <p className="em-book-entry__desc">{el.desc}</p>
      {recipes.length > 0 && (
        <div className="em-book-entry__recipes">
          {recipes.map(([a, b], i) => {
            const found = foundKeys.has(recipeKey(a, b));
            return (
              <span key={i} className="em-book-entry__recipe">
                {found ? `${getElement(a)?.name} + ${getElement(b)?.name}` : "??? + ???"}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DiscoveryBook({ discoveredIds, discoveredRecipeKeys, onBack }) {
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");

  const discoveredSet = useMemo(() => new Set(discoveredIds), [discoveredIds]);
  const discoveryNumber = useMemo(() => {
    const m = new Map();
    discoveredIds.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [discoveredIds]);
  const foundKeys = useMemo(() => new Set(discoveredRecipeKeys), [discoveredRecipeKeys]);

  const q = query.trim().toLowerCase();

  const chapters = CHAPTERS.filter((c) => chapterFilter === "all" || c.id === chapterFilter).map((c) => {
    const els = ELEMENTS.filter((e) => e.chapter === c.id).filter((e) => {
      if (!q) return true;
      if (!discoveredSet.has(e.id)) return false;
      return e.name.toLowerCase().includes(q);
    });
    const discoveredInChapter = ELEMENTS.filter((e) => e.chapter === c.id && discoveredSet.has(e.id)).length;
    const totalInChapter = ELEMENTS.filter((e) => e.chapter === c.id).length;
    return { c, els, discoveredInChapter, totalInChapter };
  }).filter((g) => g.els.length > 0);

  return (
    <div className="em-screen em-book">
      <div className="em-screen__head">
        <button type="button" className="em-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Discovery Book</h2>
        <span className="em-book__total">{discoveredIds.length} / {ELEMENTS.length}</span>
      </div>

      <div className="em-book__controls">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search discovered elements…"
          className="em-book__search"
          aria-label="Search discovery book"
        />
        <div className="em-book__filters">
          <button type="button" className={`em-chip${chapterFilter === "all" ? " em-chip--active" : ""}`} onClick={() => setChapterFilter("all")}>All</button>
          {CHAPTERS.map((c) => (
            <button key={c.id} type="button" className={`em-chip${chapterFilter === c.id ? " em-chip--active" : ""}`} onClick={() => setChapterFilter(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>

      <div className="em-book__scroll">
        {chapters.map(({ c, els, discoveredInChapter, totalInChapter }) => (
          <section key={c.id} className="em-book__chapter">
            <div className="em-book__chapter-head">
              <h3>{c.name}</h3>
              <span>{discoveredInChapter} / {totalInChapter}</span>
              {discoveredInChapter === totalInChapter && <span className="em-book__complete-badge">Complete</span>}
            </div>
            <div className="em-book__grid">
              {els.map((el) => (
                <BookEntry
                  key={el.id}
                  el={el}
                  discovered={discoveredSet.has(el.id)}
                  discoveryNumber={discoveryNumber.get(el.id)}
                  foundKeys={foundKeys}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
