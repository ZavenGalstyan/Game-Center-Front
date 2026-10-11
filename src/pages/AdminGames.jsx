import { useCallback, useEffect, useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useGameTypes } from "../data/gameTypes.jsx";
import { api } from "../lib/api.js";
import {
  mapServerErrors,
  validateGameDescription,
  validateGameName,
} from "../lib/validation.js";
import {
  Alert,
  Button,
  LoadingState,
  TableActions,
  Modal,
  ConfirmDialog,
  FormField,
  Input,
  Textarea,
  Select,
} from "../components/ui";

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

  const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));

  return (
    <Modal title={editing ? `Edit ${initial.name}` : "Add game"} onClose={onClose} className="admin-games-modal">
      <p className="admin-games-modal__subtitle">
        {editing ? "Update game information and category" : "Add a new game to Game Center"}
      </p>
      <form className="admin-games-modal__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField label="Name" error={errors.name} hint="2–120 characters" htmlFor="g-name" required>
          <Input
            id="g-name"
            value={values.name}
            onChange={setField("name")}
            disabled={submitting}
            error={Boolean(errors.name)}
            required
          />
        </FormField>
        <FormField
          label="Description"
          error={errors.description}
          hint="2–2000 characters"
          htmlFor="g-desc"
          required
        >
          <Textarea
            id="g-desc"
            rows={4}
            value={values.description}
            onChange={setField("description")}
            disabled={submitting}
            error={Boolean(errors.description)}
            required
          />
        </FormField>
        <FormField label="Game type" error={errors.typeId} htmlFor="g-type" required>
          <Select
            id="g-type"
            value={values.typeId}
            onChange={setField("typeId")}
            disabled={submitting}
            error={Boolean(errors.typeId)}
            options={typeOptions}
            placeholder="Select a type..."
            required
          />
        </FormField>
        <div className="admin-games-modal__footer">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? "Saving..." : editing ? "Save changes" : "Create game"}
          </Button>
        </div>
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
    <div className="admin-games">
      <div className="admin-games__header">
        <div className="admin-games__header-text">
          <h1 className="page-title">Games</h1>
          <p className="admin-games__subtitle">Manage and organize games available in Game Center</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setFormFor({})}
          disabled={types.length === 0}
          title={types.length === 0 ? "Create a game type first" : undefined}
        >
          Add game
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingState message="Loading games..." />}

      {!loading && !error && (
        <div className="admin-games__card">
          <div className="admin-games__table-wrap">
            <table className="admin-games__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <span className="admin-games__game-name">{g.name}</span>
                    </td>
                    <td>
                      {g.type?.name ? (
                        <span className="admin-games__type-badge">{g.type.name}</span>
                      ) : (
                        <span className="admin-games__type-empty">—</span>
                      )}
                    </td>
                    <td className="admin-games__date">
                      {new Date(g.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <TableActions
                        onEdit={() => setFormFor(g)}
                        onDelete={() => {
                          setDeleteError(null);
                          setDeleting(g);
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan={4} className="admin-games__empty">
                      No games yet. Click "Add game" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination && totalPages > 1 && (
            <div className="admin-games__footer">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setOffset((page - 2) * PAGE_SIZE)}
              >
                Prev
              </Button>
              <span className="admin-games__page-info">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setOffset(page * PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
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
          title={`Delete "${deleting.name}"?`}
          message="This action cannot be undone. The game will be permanently removed."
          confirmLabel="Delete game"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          className="admin-games-modal"
        />
      )}
    </div>
  );
}
