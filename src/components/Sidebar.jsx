import { Link, useSearchParams } from "react-router-dom";
import { useGameTypes } from "../data/gameTypes.jsx";

export default function Sidebar({ open, onNavigate }) {
  const { types, loading, error } = useGameTypes();
  const [params] = useSearchParams();
  const activeTypeId = params.get("typeId");

  const linkClass = (isActive) =>
    `sidebar__link${isActive ? " is-active" : ""}`;

  return (
    <>
      <div
        className={`sidebar__backdrop${open ? " is-open" : ""}`}
        onClick={onNavigate}
        aria-hidden="true"
      />
      <aside className={`sidebar${open ? " is-open" : ""}`}>
        <h2 className="sidebar__title">Categories</h2>
        <nav className="sidebar__nav">
          <Link
            to="/"
            className={linkClass(!activeTypeId)}
            onClick={onNavigate}
          >
            All Games
          </Link>

          {loading && <span className="sidebar__meta">Loading…</span>}
          {error && <span className="sidebar__meta">Couldn&rsquo;t load categories</span>}

          {types.map((t) => (
            <Link
              key={t.id}
              to={`/?typeId=${t.id}`}
              className={linkClass(activeTypeId === t.id)}
              onClick={onNavigate}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
