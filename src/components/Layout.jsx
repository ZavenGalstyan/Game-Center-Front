import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";
import AuthModal from "./AuthModal.jsx";

export default function Layout() {
  const [authMode, setAuthMode] = useState(null); // "login" | "register" | null
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openAuth = useCallback((mode) => setAuthMode(mode), []);
  const closeAuth = useCallback(() => setAuthMode(null), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-shell">
      <Header
        onOpenAuth={openAuth}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} />
        <main className="app-main">
          <Outlet context={{ openAuth }} />
        </main>
      </div>

      {authMode && <AuthModal initialMode={authMode} onClose={closeAuth} />}
    </div>
  );
}
