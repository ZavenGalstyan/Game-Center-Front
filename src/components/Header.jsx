import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Header({ onOpenAuth, onToggleSidebar, sidebarOpen }) {
  const { status, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

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
          ☰
        </button>
        <Link to="/" className="header__brand">
          <span className="header__logo" aria-hidden="true">◆</span>
          Game Center
        </Link>
      </div>

      <div className="header__right">
        {status === "loading" && <span className="header__muted">…</span>}

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
              <span aria-hidden="true">▾</span>
            </button>

            {menuOpen && (
              <div id="usermenu-panel" className="usermenu__panel">
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
                {isAdmin && (
                  <>
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
                  </>
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
