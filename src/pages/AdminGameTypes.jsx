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
  TableActions,
  Modal,
  ConfirmDialog,
  FormField,
  Input,
} from "../components/ui";
import { useTranslation } from "../i18n/useTranslation.js";
import { getLocaleTag } from "../i18n/i18n.js";

function TypeFormModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
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
    <Modal title={editing ? t("Edit {name}", { name: initial.name }) : t("Add game type")} onClose={onClose} className="admin-gametypes-modal">
      <p className="admin-gametypes-modal__subtitle">
        {editing ? t("Update game type information") : t("Create a new category for games")}
      </p>
      <form className="admin-gametypes-modal__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField label={t("Name")} error={errors.name} hint={t("2–60 characters")} htmlFor="gt-name" required>
          <Input
            id="gt-name"
            value={values.name}
            onChange={setField("name")}
            disabled={submitting}
            error={Boolean(errors.name)}
            required
          />
        </FormField>
        <FormField
          label={t("Slug")}
          error={errors.slug}
          hint={t("lowercase · a–z 0–9 _")}
          htmlFor="gt-slug"
          required
        >
          <Input
            id="gt-slug"
            value={values.slug}
            onChange={setField("slug")}
            disabled={submitting}
            error={Boolean(errors.slug)}
            required
            className="admin-gametypes__slug-input"
          />
        </FormField>
        <div className="admin-gametypes-modal__footer">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? t("Saving...") : editing ? t("Save changes") : t("Create game type")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminGameTypes() {
  const { t } = useTranslation();
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
    <div className="admin-gametypes">
      <div className="admin-gametypes__header">
        <div className="admin-gametypes__header-text">
          <h1 className="page-title">{t("Game Types")}</h1>
          <p className="admin-gametypes__subtitle">{t("Manage categories for organizing games")}</p>
        </div>
        <Button variant="primary" onClick={() => setFormFor({})}>
          {t("Add game type")}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingState message={t("Loading game types...")} />}

      {!loading && !error && (
        <div className="admin-gametypes__card">
          <div className="admin-gametypes__table-wrap">
            <table className="admin-gametypes__table">
              <thead>
                <tr>
                  <th>{t("Name")}</th>
                  <th>{t("Slug")}</th>
                  <th>{t("Created")}</th>
                  <th aria-label={t("Actions")}></th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="admin-gametypes__type-name">{t.name}</span>
                    </td>
                    <td>
                      <code className="admin-gametypes__slug">{t.slug}</code>
                    </td>
                    <td className="admin-gametypes__date">
                      {new Date(t.createdAt).toLocaleDateString(getLocaleTag(), {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <TableActions
                        onEdit={() => setFormFor(t)}
                        onDelete={() => {
                          setDeleteError(null);
                          setDeleting(t);
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td colSpan={4} className="admin-gametypes__empty">
                      {t("No game types yet. Click \"Add game type\" to create one.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
          title={t("Delete {name}?", { name: deleting.name })}
          message={t("Games using this type must be reassigned or deleted first.")}
          confirmLabel={t("Delete")}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
