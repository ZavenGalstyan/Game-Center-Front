import { useCallback, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";
import AuthModal from "./AuthModal.jsx";

export default function Layout() {
  const [authMode, setAuthMode] = useState(null); // "login" | "register" | null
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Optional callback run once the visitor actually logs in / registers from
  // the modal opened by this call (e.g. resume "request a custom game").
  const onAuthenticatedRef = useRef(null);

  const openAuth = useCallback((mode, options) => {
    onAuthenticatedRef.current = options?.onAuthenticated ?? null;
    setAuthMode(mode);
  }, []);
  const closeAuth = useCallback(() => {
    onAuthenticatedRef.current = null;
    setAuthMode(null);
  }, []);
  const handleAuthenticated = useCallback(() => {
    const cb = onAuthenticatedRef.current;
    onAuthenticatedRef.current = null;
    cb?.();
  }, []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  return (
    <div className="app-shell">
      <Header
        onOpenAuth={openAuth}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
        onSearch={handleSearch}
      />
      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} />
        <main className="app-main">
          <Outlet context={{ openAuth, searchQuery }} />
        </main>
      </div>

      {authMode && (
        <AuthModal
          initialMode={authMode}
          onClose={closeAuth}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}
