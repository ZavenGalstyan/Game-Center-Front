import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import GameDetail from "./pages/GameDetail.jsx";
import Account from "./pages/Account.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminGameTypes from "./pages/AdminGameTypes.jsx";
import AdminGames from "./pages/AdminGames.jsx";
import NotFound from "./pages/NotFound.jsx";
import { RequireAuth, RequireAdmin } from "./routes/guards.jsx";

export default function App() {
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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
