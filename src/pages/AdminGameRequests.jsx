import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Alert, Button, EmptyState, ErrorState, LoadingState, Modal, Select } from "../components/ui";
import "./adminGameRequests.css";

const PAGE_SIZE = 10;
const SEARCH_MAX = 100;
const SEARCH_DEBOUNCE_MS = 300;

const REQUEST_STATUSES = ["pending", "reviewing", "contacted", "completed", "rejected"];

const STATUS_LABELS = {
  pending: "Pending",
  reviewing: "Reviewing",
  contacted: "Contacted",
  completed: "Completed",
  rejected: "Rejected",
};

const FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

const statusLabel = (s) => STATUS_LABELS[s] || s || "Unknown";

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const fullName = (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed";

/** Copy for a failed load (request() error shape). 401 is handled before this. */
function describeLoadError(err) {
  switch (true) {
    case err?.status === 0:
      return { title: "Can't reach the server", message: "Check your connection and try again." };
    case err?.status === 400:
      return {
        title: "Invalid filters",
        message: err.message && err.message !== "Request failed"
          ? err.message
          : "The server rejected these search filters.",
      };
    case err?.status === 403:
      return {
        title: "Not authorized",
        message: "The server says this account doesn't have admin access to game requests.",
      };
    case err?.status === 404:
      return {
        title: "Game requests unavailable",
        message: "The game requests endpoint wasn't found on the server.",
      };
    case err?.status >= 500:
      return { title: "Server error", message: "The server ran into a problem. Please try again shortly." };
    default:
      return { title: "Couldn't load requests", message: err?.message || "Something went wrong." };
  }
}

/** Copy for a failed status update. 401 is handled before this. */
function describeSaveError(err) {
  switch (true) {
    case err?.status === 0:
      return "Can't reach the server — the status was not changed.";
    case err?.status === 400:
      return err.message && err.message !== "Request failed"
        ? err.message
        : "The server rejected this status.";
    case err?.status === 403:
      return "The server says this account isn't allowed to change request statuses.";
    case err?.status === 404:
      return "This request no longer exists. The list has been refreshed.";
    case err?.status >= 500:
      return "The server ran into a problem — the status was not changed. Please try again.";
    default:
      return err?.message || "The status could not be updated.";
  }
}

function StatusBadge({ status }) {
  return (
    <span className={`agr-status agr-status--${REQUEST_STATUSES.includes(status) ? status : "unknown"}`}>
      <span className="agr-status__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function RequestDetails({ request, onClose, onSaved, onGone, onAuthExpired }) {
  const [status, setStatus] = useState(request.status);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type, message }
  const savingRef = useRef(false);

  const dirty = status !== request.status;

  const save = async () => {
    if (savingRef.current || !dirty) return;
    savingRef.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateGameRequestStatus(request.id, status);
      // Confirmed HTTP 200: prefer the server's copy of the record.
      const updated = res?.request ?? res;
      const next =
        updated && updated.id === request.id
          ? { ...request, ...updated }
          : { ...request, status };
      onSaved(next);
      setStatus(next.status);
      setFeedback({ type: "success", message: `Status updated to ${statusLabel(next.status)}.` });
    } catch (err) {
      if (err?.status === 401) {
        onAuthExpired();
        return;
      }
      if (err?.status === 404) onGone();
      setFeedback({ type: "error", message: describeSaveError(err) });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Escape / overlay / ✕ are ignored mid-save so the result is never lost.
  const safeClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  return (
    <Modal title={fullName(request)} onClose={safeClose} size="lg" className="agr-modal">
      <div className="agr-detail">
        <div className="agr-detail__top">
          <a className="agr-detail__email" href={`mailto:${request.email}`}>
            {request.email}
          </a>
          <StatusBadge status={request.status} />
        </div>

        <dl className="agr-detail__meta">
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(request.createdAt, true)}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDate(request.updatedAt, true)}</dd>
          </div>
          <div className="agr-detail__meta-wide">
            <dt>User ID</dt>
            <dd className="agr-mono">{request.userId || "—"}</dd>
          </div>
        </dl>

        <section className="agr-detail__section" aria-labelledby="agr-desc-heading">
          <h3 id="agr-desc-heading" className="agr-detail__label">Game description</h3>
          <p className="agr-detail__description">{request.description}</p>
        </section>

        <section className="agr-detail__section agr-detail__status" aria-labelledby="agr-status-heading">
          <h3 id="agr-status-heading" className="agr-detail__label">Update status</h3>
          {feedback && (
            <Alert variant={feedback.type === "success" ? "success" : "error"}>{feedback.message}</Alert>
          )}
          <div className="agr-detail__status-row">
            <label className="agr-sr-only" htmlFor="agr-status-select">
              Request status
            </label>
            <div className="agr-native-select">
              <select
                id="agr-status-select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setFeedback(null);
                }}
                disabled={saving}
              >
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              Save Status
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

export default function AdminGameRequests() {
  const { handleAuthExpired } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  // Debounced search; a new term always starts from page 1.
  useEffect(() => {
    const term = searchInput.trim().slice(0, SEARCH_MAX);
    if (term === search) return undefined;
    const t = setTimeout(() => {
      setPage(1);
      setSearch(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    api
      .listGameRequests({ page, limit: PAGE_SIZE, search: search || undefined, status: status || undefined })
      .then((res) => {
        if (id !== seq.current) return; // a newer query superseded this one
        const totalPages = res?.pagination?.totalPages ?? 0;
        // The current page emptied out (e.g. after a status change): step back.
        if (page > 1 && totalPages > 0 && page > totalPages) {
          setPage(totalPages);
          return;
        }
        setData({
          requests: Array.isArray(res?.requests) ? res.requests : [],
          pagination: res?.pagination ?? null,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (id !== seq.current) return;
        if (err?.status === 401) {
          handleAuthExpired();
          return;
        }
        setError(err);
        setLoading(false);
      });
  }, [page, search, status, reloadKey, handleAuthExpired]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const closeDetails = useCallback(() => setSelected(null), []);

  const onSaved = useCallback(
    (next) => {
      setSelected(next);
      setData((d) =>
        d ? { ...d, requests: d.requests.map((r) => (r.id === next.id ? next : r)) } : d,
      );
      // The record no longer matches the active status filter: refetch.
      if (status && next.status !== status) reload();
    },
    [status, reload],
  );

  const pagination = data?.pagination;
  const total = pagination?.total ?? null;
  const filtered = Boolean(search || status);
  const requests = data?.requests ?? [];
  const errorCopy = error ? describeLoadError(error) : null;

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="agr">
      <header className="agr__header">
        <div className="agr__heading">
          <p className="agr__eyebrow">Admin</p>
          <h1 className="page-title">Game requests</h1>
          <p className="agr__subtitle">Custom game ideas submitted by players.</p>
        </div>
        <div className="agr__total" aria-live="polite">
          <span className="agr__total-value">{total === null ? "—" : total}</span>
          <span className="agr__total-label">
            {filtered ? "matching" : "total"} request{total === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="agr__card">
        <div className="agr__toolbar">
          <div className="agr__search">
            <SearchIcon />
            <label className="agr-sr-only" htmlFor="agr-search">
              Search requests
            </label>
            <input
              id="agr-search"
              type="search"
              className="agr__search-input"
              placeholder="Search name, email or description…"
              value={searchInput}
              maxLength={SEARCH_MAX}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="agr__filter">
            <span className="agr__filter-label" id="agr-status-filter-label">
              Status
            </span>
            <Select
              id="agr-status-filter"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              options={FILTER_OPTIONS}
              className="agr__filter-select"
            />
          </div>
        </div>

        {loading && !data && !error && (
          <div className="agr__state">
            <LoadingState message="Loading game requests…" />
          </div>
        )}

        {errorCopy && (
          <div className="agr__state">
            <ErrorState title={errorCopy.title} message={errorCopy.message} onRetry={reload} />
          </div>
        )}

        {!error && data && requests.length === 0 && !loading && (
          <div className="agr__state">
            {filtered ? (
              <EmptyState
                icon={<SearchIcon />}
                title="No matching requests"
                message="Try a different search term or status."
                action={{ label: "Clear filters", onClick: clearFilters }}
              />
            ) : (
              <EmptyState
                icon={<InboxIcon />}
                title="No game requests yet"
                message="When players submit custom game ideas, they'll appear here."
              />
            )}
          </div>
        )}

        {!error && data && requests.length > 0 && (
          <div className={`agr__results${loading ? " is-refreshing" : ""}`} aria-busy={loading}>
            <table className="agr__table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Game idea</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">
                    <span className="agr-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)}>
                    <td>
                      <div className="agr__customer">
                        <span className="agr__initials" aria-hidden="true">
                          {(r.firstName?.[0] || "") + (r.lastName?.[0] || "")}
                        </span>
                        <div className="agr__customer-text">
                          <span className="agr__name">{fullName(r)}</span>
                          <span className="agr__email">{r.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="agr__preview">{r.description}</p>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="agr__date">{formatDate(r.createdAt)}</td>
                    <td className="agr__action">
                      <button
                        type="button"
                        className="agr__view"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                        aria-label={`View request from ${fullName(r)}`}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="agr__cards">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="agr__mcard"
                    onClick={() => setSelected(r)}
                    aria-label={`View request from ${fullName(r)}`}
                  >
                    <span className="agr__mcard-top">
                      <span className="agr__customer-text">
                        <span className="agr__name">{fullName(r)}</span>
                        <span className="agr__email">{r.email}</span>
                      </span>
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="agr__preview">{r.description}</span>
                    <span className="agr__mcard-foot">
                      <span className="agr__date">{formatDate(r.createdAt)}</span>
                      <span className="agr__mcard-view" aria-hidden="true">
                        View
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!error && pagination && pagination.totalPages > 0 && (
          <nav className="agr__footer" aria-label="Pagination">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !(pagination.hasPrevPage ?? page > 1)}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="agr__page-info">
              Page {pagination.page} of {pagination.totalPages}
              <span className="agr__page-total"> · {pagination.total} total</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !(pagination.hasNextPage ?? page < pagination.totalPages)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </div>

      {selected && (
        <RequestDetails
          key={selected.id}
          request={selected}
          onClose={closeDetails}
          onSaved={onSaved}
          onGone={reload}
          onAuthExpired={handleAuthExpired}
        />
      )}
    </div>
  );
}
