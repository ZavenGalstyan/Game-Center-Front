import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../lib/api.js";

const ROLES = ["", "player", "moderator", "admin"];

export default function AdminUsers() {
  const { handleAuthExpired } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers({ page, limit: 10, role: role || undefined });
      setData(res);
    } catch (err) {
      if (err.status === 401) {
        handleAuthExpired();
        return;
      }
      setError(err.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [page, role, handleAuthExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const pagination = data?.pagination;

  return (
    <div className="admin">
      <h1 className="page-title">Users</h1>

      <div className="admin__filters">
        <label>
          Role:{" "}
          <select
            value={role}
            onChange={(e) => {
              setPage(1);
              setRole(e.target.value);
            }}
          >
            {ROLES.map((r) => (
              <option key={r || "all"} value={r}>
                {r || "All"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="form-alert">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && data && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No users match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="pager">
              <button
                className="btn btn--ghost"
                disabled={!pagination.hasPrevPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pager__info">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total}{" "}
                total
              </span>
              <button
                className="btn btn--ghost"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
