import { lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import NotFound from "./pages/NotFound.jsx";

// The home page ships in the main bundle; every other route is its own chunk
// (Layout renders them inside a Suspense boundary, so the shell stays up).
const loadGameDetail = () => import("./pages/GameDetail.jsx");
const GameDetail = lazy(loadGameDetail);
const Account = lazy(() => import("./pages/Account.jsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.jsx"));
const AdminGameTypes = lazy(() => import("./pages/AdminGameTypes.jsx"));
const AdminGames = lazy(() => import("./pages/AdminGames.jsx"));
const AdminGameRequests = lazy(() => import("./pages/AdminGameRequests.jsx"));
import { RequireAuth, RequireAdmin, RequireGameRequestsAdmin } from "./routes/guards.jsx";

export default function App() {
  // Opening a game is the main path out of the catalog: fetch its page chunk
  // once the browser is idle so that click doesn't wait on the network.
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => loadGameDetail(), { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(loadGameDetail, 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<GamesPage />} />
        <Route path="games/:id" element={<GameDetail />} />
        <Route
          path="account"
          element={
            <RequireAuth>
              <Account />
            </RequireAuth>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/game-types"
          element={
            <RequireAdmin>
              <AdminGameTypes />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/games"
          element={
            <RequireAdmin>
              <AdminGames />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/game-requests"
          element={
            <RequireGameRequestsAdmin>
              <AdminGameRequests />
            </RequireGameRequestsAdmin>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
