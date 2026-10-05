import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Header({ onOpenAuth, onToggleSidebar, sidebarOpen, onSearch }) {
  const { status, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchParams] = useSearchParams();
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  // Current pathname for hiding redundant menu items
  const pathname = location.pathname;

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Handle search input
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchValue(value);
    if (onSearch) {
      onSearch(value);
    }
  }, [onSearch]);

  // Handle search submit
  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    // Navigate to home with search if not already there
    const currentTypeId = searchParams.get("typeId");
    if (currentTypeId) {
      navigate("/");
    }
    if (onSearch) {
      onSearch(searchValue);
    }
  }, [searchValue, onSearch, searchParams, navigate]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchValue("");
    if (onSearch) {
      onSearch("");
    }
    searchInputRef.current?.focus();
  }, [onSearch]);

  return (
    <header className="header">
      <div className="header__left">
        <button
          className="header__hamburger"
          onClick={onToggleSidebar}
          aria-label="Open navigation menu"
          aria-expanded={sidebarOpen}
          aria-controls="sidebar-nav"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <Link to="/" className="header__brand">
          <span className="header__logo" aria-hidden="true">◆</span>
          Game Center
        </Link>
      </div>

      {/* Search */}
      <form className="header__search" onSubmit={handleSearchSubmit} role="search">
        <div className="header__search-wrapper">
          <svg
            className="header__search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            className="header__search-input"
            placeholder="Search games and categories..."
            value={searchValue}
            onChange={handleSearchChange}
            aria-label="Search games"
          />
          {searchValue && (
            <button
              type="button"
              className="header__search-clear"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </form>

      <div className="header__right">
        {status === "loading" && <span className="header__muted">...</span>}

        {status === "guest" && (
          <>
            <button className="btn btn--ghost" onClick={() => onOpenAuth("login")}>
              Log in
            </button>
            <button className="btn btn--primary" onClick={() => onOpenAuth("register")}>
              Register
            </button>
          </>
        )}

        {status === "authenticated" && user && (
          <div className="usermenu" ref={menuRef}>
            <button
              className="usermenu__trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="usermenu-panel"
            >
              <span className="usermenu__avatar" aria-hidden="true">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="usermenu__name">Hi, {user.username}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {menuOpen && (
              <div id="usermenu-panel" className="usermenu__panel">
                {pathname !== "/account" && (
                  <button
                    type="button"
                    className="usermenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/account");
                    }}
                  >
                    Account &amp; password
                  </button>
                )}
                {isAdmin && pathname !== "/admin/users" && (
                  <button
                    type="button"
                    className="usermenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/admin/users");
                    }}
                  >
                    Admin · Users
                  </button>
                )}
                {isAdmin && pathname !== "/admin/game-types" && (
                  <button
                    type="button"
                    className="usermenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/admin/game-types");
                    }}
                  >
                    Admin · Game types
                  </button>
                )}
                {isAdmin && pathname !== "/admin/games" && (
                  <button
                    type="button"
                    className="usermenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/admin/games");
                    }}
                  >
                    Admin · Games
                  </button>
                )}
                <button
                  type="button"
                  className="usermenu__item"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
