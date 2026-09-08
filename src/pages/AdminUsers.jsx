import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Alert,
  LoadingState,
  Pagination,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableEmptyRow,
} from "../components/ui";

const ROLES = [
  { value: "", label: "All" },
  { value: "player", label: "Player" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Admin" },
];

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
              <option key={r.value || "all"} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingState message="Loading..." />}

      {!loading && data && (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell header>Username</TableCell>
                <TableCell header>Email</TableCell>
                <TableCell header>Role</TableCell>
                <TableCell header>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {data.users.length === 0 && (
                <TableEmptyRow colSpan={4}>
                  No users match this filter.
                </TableEmptyRow>
              )}
            </TableBody>
          </Table>

          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
