import { useCallback, useEffect, useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useGameTypes } from "../data/gameTypes.jsx";
import { api } from "../lib/api.js";
import { getMainCategory, getSecondaryCategories } from "../lib/gameHelpers.jsx";
import RatingBadge from "../components/rating/RatingBadge.jsx";
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
import { useTranslation } from "../i18n/useTranslation.js";
import { getLocaleTag } from "../i18n/i18n.js";

const PAGE_SIZE = 20;

// Page numbers to show: first, last, current ±1, with "..." for gaps.
function getPageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (i > 0 && p - prev === 2) items.push(prev + 1);
    else if (i > 0 && p - prev > 2) items.push("...");
    items.push(p);
  });
  return items;
}

/**
 * Server errors for list items come back as `secondaryCategories[2]`; show
 * them on the field itself.
 */
function mapGameServerErrors(errors) {
  const out = {};
  for (const [field, message] of Object.entries(mapServerErrors(errors))) {
    const key = field.replace(/\[\d+\]$/, "");
    if (!out[key]) out[key] = message;
  }
  return out;
}

function GameFormModal({ initial, types, onClose, onSaved }) {
  const { t } = useTranslation();
  const editing = Boolean(initial);
  const { handleAuthExpired } = useAuth();
  const initialMain = initial?.mainCategory?.id || initial?.type?.id || "";
  const [values, setValues] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    mainCategory: initialMain,
    secondaryCategories: (initial?.secondaryCategories || [])
      .map((c) => c.id)
      .filter((id) => id !== initialMain),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors((p) => ({ ...p, [name]: undefined }));
    setFormError(null);
  };

  // A category can't be both main and secondary: picking it as main drops it
  // from the secondary list.
  const setMainCategory = (e) => {
    const id = e.target.value;
    setValues((v) => ({
      ...v,
      mainCategory: id,
      secondaryCategories: v.secondaryCategories.filter((s) => s !== id),
    }));
    setErrors((p) => ({ ...p, mainCategory: undefined, secondaryCategories: undefined }));
    setFormError(null);
  };

  const toggleSecondary = (id) => {
    setValues((v) => ({
      ...v,
      secondaryCategories: v.secondaryCategories.includes(id)
        ? v.secondaryCategories.filter((s) => s !== id)
        : [...v.secondaryCategories, id],
    }));
    setErrors((p) => ({ ...p, secondaryCategories: undefined }));
    setFormError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const secondary = values.secondaryCategories;
    const next = {
      name: validateGameName(values.name),
      description: validateGameDescription(values.description),
      mainCategory: values.mainCategory ? null : "Pick a main category",
      secondaryCategories: secondary.includes(values.mainCategory)
        ? "The main category can't also be a secondary category"
        : new Set(secondary).size !== secondary.length
        ? "Secondary categories must be unique"
        : null,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        mainCategory: values.mainCategory,
        secondaryCategories: secondary,
      };
      if (editing) await api.updateGame(initial.id, payload);
      else await api.createGame(payload);
      onSaved(editing ? "Game updated" : "Game created");
    } catch (err) {
      if (err.status === 401) handleAuthExpired();
      else if (err.status === 400 && err.errors) setErrors(mapGameServerErrors(err.errors));
      else setFormError(err.message || "Could not save game");
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));
  const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
  const secondaryOptions = types.filter((t) => t.id !== values.mainCategory);
  const selectedSecondaryNames = values.secondaryCategories
    .map((id) => typeNames[id])
    .filter(Boolean);

  return (
    <Modal title={editing ? t("Edit {name}", { name: initial.name }) : t("Add game")} onClose={onClose} className="admin-games-modal">
      <p className="admin-games-modal__subtitle">
        {editing ? t("Update game information and category") : t("Add a new game to Game Center")}
      </p>
      <form className="admin-games-modal__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField label={t("Name")} error={errors.name} hint={t("2–120 characters")} htmlFor="g-name" required>
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
          label={t("Description")}
          error={errors.description}
          hint={t("2–2000 characters")}
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
        <FormField label={t("Main category")} error={errors.mainCategory} htmlFor="g-type" required>
          <Select
            id="g-type"
            value={values.mainCategory}
            onChange={setMainCategory}
            disabled={submitting}
            error={Boolean(errors.mainCategory)}
            options={typeOptions}
            placeholder={t("Select a main category...")}
            required
          />
        </FormField>
        <FormField
          label={t("Secondary categories")}
          error={errors.secondaryCategories}
          hint={
            selectedSecondaryNames.length > 0
              ? t("Selected ({count}): {names}", { count: selectedSecondaryNames.length, names: selectedSecondaryNames.map((n) => t(n)).join(", ") })
              : t("Optional - the game also appears on these category pages")
          }
          htmlFor="g-secondary"
        >
          <div
            id="g-secondary"
            className="admin-games-modal__chips"
            role="group"
            aria-label={t("Secondary categories")}
          >
            {secondaryOptions.map((t) => {
              const selected = values.secondaryCategories.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={
                    selected
                      ? "admin-games-modal__chip admin-games-modal__chip--selected"
                      : "admin-games-modal__chip"
                  }
                  aria-pressed={selected}
                  onClick={() => toggleSecondary(t.id)}
                  disabled={submitting}
                >
                  {selected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {t.name}
                </button>
              );
            })}
          </div>
        </FormField>
        <div className="admin-games-modal__footer">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? t("Saving...") : editing ? t("Save changes") : t("Create game")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminGames() {
  const { t } = useTranslation();
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
          <h1 className="page-title">{t("Games")}</h1>
          <p className="admin-games__subtitle">{t("Manage and organize games available in Game Center")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setFormFor({})}
          disabled={types.length === 0}
          title={types.length === 0 ? t("Create a game type first") : undefined}
        >
          {t("Add game")}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingState message={t("Loading games...")} />}

      {!loading && !error && (
        <div className="admin-games__card">
          <div className="admin-games__table-wrap">
            <table className="admin-games__table">
              <thead>
                <tr>
                  <th>{t("Name")}</th>
                  <th>{t("Categories")}</th>
                  <th>{t("Rating")}</th>
                  <th>{t("Created")}</th>
                  <th aria-label={t("Actions")}></th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <span className="admin-games__game-name">{g.name}</span>
                    </td>
                    <td>
                      {getMainCategory(g)?.name ? (
                        <div className="admin-games__categories">
                          <span className="admin-games__type-badge" title={t("Main category")}>
                            {getMainCategory(g).name}
                          </span>
                          {getSecondaryCategories(g).map((c) => (
                            <span
                              key={c.id}
                              className="admin-games__type-badge admin-games__type-badge--secondary"
                              title={t("Secondary category")}
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="admin-games__type-empty">—</span>
                      )}
                    </td>
                    <td className="admin-games__rating">
                      <RatingBadge game={g} />
                    </td>
                    <td className="admin-games__date">
                      {new Date(g.createdAt).toLocaleDateString(getLocaleTag(), {
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
                    <td colSpan={5} className="admin-games__empty">
                      {t("No games yet. Click \"Add game\" to create one.")}
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
                {t("Prev")}
              </Button>
              <div className="admin-games__pages">
                {getPageItems(page, totalPages).map((item, i) =>
                  item === "..." ? (
                    <span key={`gap-${i}`} className="admin-games__page-gap">
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === page ? "primary" : "secondary"}
                      size="sm"
                      className="admin-games__page-btn"
                      aria-current={item === page ? "page" : undefined}
                      onClick={() => item !== page && setOffset((item - 1) * PAGE_SIZE)}
                    >
                      {item}
                    </Button>
                  )
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setOffset(page * PAGE_SIZE)}
              >
                {t("Next")}
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
          title={t('Delete "{name}"?', { name: deleting.name })}
          message={t("This action cannot be undone. The game will be permanently removed.")}
          confirmLabel={t("Delete game")}
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
