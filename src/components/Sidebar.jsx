import { NavLink } from "react-router-dom";
import { GAME_CATEGORIES } from "../data/categories.js";

export default function Sidebar({ open, onNavigate }) {
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
          {GAME_CATEGORIES.map((cat) => (
            <NavLink
              key={cat.slug}
              to={cat.slug === "all" ? "/" : `/category/${cat.slug}`}
              end={cat.slug === "all"}
              className={({ isActive }) =>
                `sidebar__link${isActive ? " is-active" : ""}`
              }
              onClick={onNavigate}
            >
              {cat.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
