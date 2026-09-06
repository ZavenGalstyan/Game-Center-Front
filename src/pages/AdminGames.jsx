import { useCallback, useEffect, useState } from "react";
import Modal from "../components/Modal.jsx";
import Field from "../components/Field.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useGameTypes } from "../data/gameTypes.jsx";
import { api } from "../lib/api.js";
import {
  mapServerErrors,
  validateGameDescription,
  validateGameName,
} from "../lib/validation.js";

const PAGE_SIZE = 20;

function GameFormModal({ initial, types, onClose, onSaved }) {
  const editing = Boolean(initial);
  const { handleAuthExpired } = useAuth();
  const [values, setValues] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    typeId: initial?.type?.id || "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors((p) => ({ ...p, [name]: undefined }));
    setFormError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const next = {
      name: validateGameName(values.name),
      description: validateGameDescription(values.description),
      typeId: values.typeId ? null : "Pick a game type",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        typeId: values.typeId,
      };
      if (editing) await api.updateGame(initial.id, payload);
      else await api.createGame(payload);
      onSaved(editing ? "Game updated" : "Game created");
    } catch (err) {
      if (err.status === 401) handleAuthExpired();
      else if (err.status === 400 && err.errors) setErrors(mapServerErrors(err.errors));
      else setFormError(err.message || "Could not save game");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${initial.name}` : "Add game"} onClose={onClose}>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && <div className="form-alert">{formError}</div>}
        <Field label="Name" error={errors.name} hint="2–120 characters" htmlFor="g-name">
          <input
            id="g-name"
            value={values.name}
            onChange={setField("name")}
            disabled={submitting}
          />
        </Field>
        <Field
          label="Description"
          error={errors.description}
          hint="2–2000 characters"
          htmlFor="g-desc"
        >
          <textarea
            id="g-desc"
            rows={4}
            value={values.description}
            onChange={setField("description")}
            disabled={submitting}
          />
        </Field>
        <Field label="Game type" error={errors.typeId} htmlFor="g-type">
          <select
            id="g-type"
            value={values.typeId}
            onChange={setField("typeId")}
            disabled={submitting}
          >
            <option value="">Select a type…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn btn--primary btn--block" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create game"}
        </button>
      </form>
    </Modal>
  );
}

export default function AdminGames() {
  const { types } = useGameTypes();
  const { handleAuthExpired } = useAuth();
  const toast = useToast();

  const [offset, setOffset] = useState(0);
  const [games, setGames] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formFor, setFormFor] = useState(null); // null | {} | game
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, pagination } = await api.listGames({ limit: PAGE_SIZE, offset });
      setGames(data);
      setPagination(pagination);
    } catch (err) {
      if (err.status === 401) handleAuthExpired();
      else setError(err.message || "Could not load games");
    } finally {
      setLoading(false);
    }
  }, [offset, handleAuthExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = (msg) => {
    setFormFor(null);
    setOffset(0);
    load();
    toast.show(msg, { type: "success" });
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteGame(deleting.id);
      setDeleting(null);
      load();
      toast.show("Game deleted", { type: "success" });
    } catch (err) {
      if (err.status === 401) handleAuthExpired();
      else setDeleteError(err.message || "Could not delete game");
    } finally {
      setDeleteBusy(false);
    }
  };

  const page = pagination ? Math.floor(pagination.offset / PAGE_SIZE) + 1 : 1;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / PAGE_SIZE)) : 1;

  return (
    <div className="admin">
      <div className="admin__head">
        <h1 className="page-title">Games</h1>
        <button
          className="btn btn--primary"
          onClick={() => setFormFor({})}
          disabled={types.length === 0}
          title={types.length === 0 ? "Create a game type first" : undefined}
        >
          Add game
        </button>
      </div>

      {error && <div className="form-alert">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && !error && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="muted">{g.type?.name || "—"}</td>
                    <td className="muted">
                      {new Date(g.createdAt).toLocaleDateString()}
                    </td>
                    <td className="table__actions">
                      <button className="linkbtn" onClick={() => setFormFor(g)}>
                        Edit
                      </button>
                      <button
                        className="linkbtn linkbtn--danger"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(g);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No games yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > PAGE_SIZE && (
            <div className="pager">
              <button
                className="btn btn--ghost"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </button>
              <span className="pager__info">
                Page {page} of {totalPages} · {pagination.total} total
              </span>
              <button
                className="btn btn--ghost"
                disabled={!pagination.hasMore}
                onClick={() => setOffset(pagination.nextOffset)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {formFor && (
        <GameFormModal
          initial={formFor.id ? formFor : null}
          types={types}
          onClose={() => setFormFor(null)}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This removes the game metadata from the backend."
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
