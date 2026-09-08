import { useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useGameTypes } from "../data/gameTypes.jsx";
import { api } from "../lib/api.js";
import { mapServerErrors, validateSlug, validateTypeName } from "../lib/validation.js";
import {
  Alert,
  Button,
  LoadingState,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableEmptyRow,
  TableActions,
  Modal,
  ConfirmDialog,
  FormField,
  Input,
} from "../components/ui";

function TypeFormModal({ initial, onClose, onSaved }) {
  const editing = Boolean(initial);
  const { handleAuthExpired } = useAuth();
  const [values, setValues] = useState({
    name: initial?.name || "",
    slug: initial?.slug || "",
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
      name: validateTypeName(values.name),
      slug: validateSlug(values.slug),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { name: values.name.trim(), slug: values.slug.trim().toLowerCase() };
      if (editing) await api.updateGameType(initial.id, payload);
      else await api.createGameType(payload);
      onSaved(editing ? "Game type updated" : "Game type created");
    } catch (err) {
      if (err.status === 401) {
        handleAuthExpired();
      } else if (err.status === 400 && err.errors) {
        setErrors(mapServerErrors(err.errors));
      } else {
        setFormError(err.message || "Could not save game type");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${initial.name}` : "Add game type"} onClose={onClose}>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField label="Name" error={errors.name} hint="2–60 characters" htmlFor="gt-name">
          <Input
            id="gt-name"
            value={values.name}
            onChange={setField("name")}
            disabled={submitting}
            error={Boolean(errors.name)}
          />
        </FormField>
        <FormField
          label="Slug"
          error={errors.slug}
          hint="lowercase · a–z 0–9 _"
          htmlFor="gt-slug"
        >
          <Input
            id="gt-slug"
            value={values.slug}
            onChange={setField("slug")}
            disabled={submitting}
            error={Boolean(errors.slug)}
          />
        </FormField>
        <Button variant="primary" fullWidth type="submit" loading={submitting}>
          {submitting ? "Saving..." : editing ? "Save changes" : "Create game type"}
        </Button>
      </form>
    </Modal>
  );
}

export default function AdminGameTypes() {
  const { types, loading, error, reload } = useGameTypes();
  const { handleAuthExpired } = useAuth();
  const toast = useToast();

  const [formFor, setFormFor] = useState(null); // null | {} (create) | type (edit)
  const [deleting, setDeleting] = useState(null); // type being deleted
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const onSaved = (msg) => {
    setFormFor(null);
    reload();
    toast.show(msg, { type: "success" });
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteGameType(deleting.id);
      setDeleting(null);
      reload();
      toast.show("Game type deleted", { type: "success" });
    } catch (err) {
      if (err.status === 401) handleAuthExpired();
      else setDeleteError(err.message || "Could not delete game type");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="admin">
      <div className="admin__head">
        <h1 className="page-title">Game types</h1>
        <Button variant="primary" onClick={() => setFormFor({})}>
          Add game type
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingState message="Loading..." />}

      {!loading && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell header>Name</TableCell>
              <TableCell header>Slug</TableCell>
              <TableCell header>Created</TableCell>
              <TableCell header aria-label="Actions" />
            </TableRow>
          </TableHead>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell className="muted">{t.slug}</TableCell>
                <TableCell className="muted">
                  {new Date(t.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <TableActions
                    onEdit={() => setFormFor(t)}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleting(t);
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {types.length === 0 && (
              <TableEmptyRow colSpan={4}>No game types yet.</TableEmptyRow>
            )}
          </TableBody>
        </Table>
      )}

      {formFor && (
        <TypeFormModal
          initial={formFor.id ? formFor : null}
          onClose={() => setFormFor(null)}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Games using this type must be reassigned or deleted first."
          confirmLabel="Delete"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
