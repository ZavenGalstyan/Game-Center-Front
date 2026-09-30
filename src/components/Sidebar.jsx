import { Link, useSearchParams } from "react-router-dom";
import { useGameTypes } from "../data/gameTypes.jsx";
import { getCategoryIcon } from "../lib/gameHelpers.jsx";

export default function Sidebar({ open, onNavigate }) {
  const { types, loading, error } = useGameTypes();
  const [params] = useSearchParams();
  const activeTypeId = params.get("typeId");

  const linkClass = (isActive) =>
    `sidebar__link${isActive ? " is-active" : ""}`;

  const linkProps = (isActive) => ({
    className: linkClass(isActive),
    onClick: onNavigate,
    ...(isActive && { "aria-current": "page" }),
  });

  // Navigation items
  const mainNav = [
    { to: "/", label: "All Games", icon: "home", isActive: !activeTypeId },
  ];

  return (
    <>
      <div
        className={`sidebar__backdrop${open ? " is-open" : ""}`}
        onClick={onNavigate}
        aria-hidden="true"
      />
      <aside id="sidebar-nav" className={`sidebar${open ? " is-open" : ""}`}>
        {/* Main Navigation */}
        <nav className="sidebar__nav sidebar__nav--main" aria-label="Main navigation">
          {mainNav.map((item) => (
            <Link key={item.to} to={item.to} {...linkProps(item.isActive)}>
              <span className="sidebar__icon" aria-hidden="true">
                {getCategoryIcon(item.icon)}
              </span>
              <span className="sidebar__label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="sidebar__divider" />

        {/* Categories */}
        <h2 className="sidebar__title">Categories</h2>
        <nav className="sidebar__nav sidebar__nav--categories" aria-label="Game categories">
          {loading && <span className="sidebar__meta">Loading...</span>}
          {error && <span className="sidebar__meta">Couldn&rsquo;t load categories</span>}

          {types.map((t) => (
            <Link key={t.id} to={`/?typeId=${t.id}`} {...linkProps(activeTypeId === t.id)}>
              <span className="sidebar__icon" aria-hidden="true">
                {getCategoryIcon(t.name)}
              </span>
              <span className="sidebar__label">{t.name}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
