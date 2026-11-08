import { useCallback, useEffect, useState, useRef } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Alert,
  LoadingState,
  Badge,
  Button,
} from "../components/ui";
import Avatar from "../components/avatar/Avatar.jsx";
import { useTranslation } from "../i18n/useTranslation.js";
import { getLocaleTag } from "../i18n/i18n.js";

const ROLES = [
  { value: "", label: "All" },
  { value: "player", label: "Player" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Admin" },
];

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function RoleDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((o) => !o);
    }
  };

  return (
    <div className="role-dropdown" ref={ref}>
      <button
        type="button"
        className={`role-dropdown__trigger${open ? " role-dropdown__trigger--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="role-dropdown__value">{selected.label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ul className="role-dropdown__menu" role="listbox">
          {options.map((opt) => (
            <li
              key={opt.value || "all"}
              role="option"
              aria-selected={opt.value === value}
              className={`role-dropdown__option${opt.value === value ? " role-dropdown__option--selected" : ""}`}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const variant = role === "admin" ? "primary" : role === "moderator" ? "warning" : "default";
  return (
    <Badge variant={variant} size="sm">
      {role}
    </Badge>
  );
}

export default function AdminUsers() {
  const { t } = useTranslation();
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
  const totalUsers = pagination?.total ?? data?.users?.length ?? 0;

  return (
    <div className="admin-users">
      {/* Page Header */}
      <div className="admin-users__header">
        <h1 className="page-title">{t("Users")}</h1>
        <p className="admin-users__subtitle">
          {t("Manage registered users and review their roles and account information.")}
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Users Card */}
      <div className="admin-users__card">
        {/* Toolbar */}
        <div className="admin-users__toolbar">
          <div className="admin-users__filter">
            <label className="admin-users__filter-label" id="role-filter-label">
              {t("Role")}
            </label>
            <RoleDropdown
              value={role}
              onChange={(val) => {
                setPage(1);
                setRole(val);
              }}
              options={ROLES}
            />
          </div>
          <div className="admin-users__count">
            {loading ? t("Loading...") : t("{count} users", { count: totalUsers })}
          </div>
        </div>

        {/* Table */}
        {loading && (
          <div className="admin-users__loading">
            <LoadingState message={t("Loading users...")} />
          </div>
        )}

        {!loading && data && (
          <>
            <div className="admin-users__table-wrap">
              <table className="admin-users__table">
                <thead>
                  <tr>
                    <th>{t("User")}</th>
                    <th>{t("Email")}</th>
                    <th>{t("Role")}</th>
                    <th>{t("Created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-users__user-cell">
                          <Avatar avatarId={u.avatarId} size="sm" alt="" />
                          <span className="admin-users__username">{u.username}</span>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <RoleBadge role={u.role} />
                      </td>
                      <td>
                        {new Date(u.createdAt).toLocaleDateString(getLocaleTag(), {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                  {data.users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="admin-users__empty">
                        {t("No users match this filter.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {pagination && pagination.totalPages > 0 && (
              <div className="admin-users__footer">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t("Prev")}
                </Button>
                <span className="admin-users__page-info">
                  {t("Page {page} of {totalPages}", { page: pagination.page, totalPages: pagination.totalPages })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t("Next")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
