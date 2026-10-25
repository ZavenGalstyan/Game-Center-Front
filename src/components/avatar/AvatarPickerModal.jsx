import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { getAvatarName, resolveAvatarId } from "../../lib/avatars.js";
import { useToast } from "../Toast.jsx";
import { Alert, Button, Modal } from "../ui";
import Avatar from "./Avatar.jsx";
import { useAvatarCatalog } from "./useAvatarCatalog.js";

function retryAfterSeconds(err) {
  if (err?.retryAfter > 0) return err.retryAfter;
  // Retry-After isn't CORS-exposed, so fall back to the seconds in the message.
  const match = /(\d+)\s*seconds?/i.exec(err?.message || "");
  return match ? Number(match[1]) : 60;
}

function saveErrorMessage(err) {
  if (err?.status === 0) return "Can't reach the server. Check your connection and try again.";
  if (err?.status === 400) return "That avatar is not available. Please choose another one.";
  if (err?.status === 429) {
    const s = retryAfterSeconds(err);
    return `You're changing your avatar too often. Try again in ${s} second${s === 1 ? "" : "s"}.`;
  }
  return err?.message || "Couldn't save your avatar. Please try again.";
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * "Choose Your Avatar" dialog. Clicking a tile only changes the local
 * selection; nothing is sent until Save. On success the session user is
 * replaced with the backend's `data.user`, which updates every avatar on
 * screen (Header, Profile, own comments) at once.
 */
export default function AvatarPickerModal({ onClose }) {
  const { user, updateUser, handleAuthExpired } = useAuth();
  const toast = useToast();
  const catalog = useAvatarCatalog();

  const savedId = resolveAvatarId(user?.avatarId);
  const [selectedId, setSelectedId] = useState(savedId);
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // The Modal re-runs its focus setup whenever onClose changes identity, so
  // keep it stable and read `saving` through a ref (no closing mid-request).
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const requestClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  const visible = useMemo(
    () => (category === "all" ? catalog.avatars : catalog.avatars.filter((a) => a.category === category)),
    [catalog.avatars, category],
  );
  const categoryName = useMemo(
    () => Object.fromEntries(catalog.categories.map((c) => [c.id, c.name])),
    [catalog.categories],
  );
  const selected = catalog.avatars.find((a) => a.id === selectedId);

  /* ------------------------------ Keyboard grid ----------------------------- */
  const gridRef = useRef(null);
  const tileRefs = useRef(new Map());
  const focusIndex = visible.findIndex((a) => a.id === selectedId);
  const rovingIndex = focusIndex >= 0 ? focusIndex : 0;

  // Start on the current avatar (after the Modal's own first-element focus).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = tileRefs.current.get(savedId);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [savedId]);

  const onGridKeyDown = (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const current = visible.findIndex((a) => tileRefs.current.get(a.id) === document.activeElement);
    if (current < 0) return;
    e.preventDefault();
    const cols = gridRef.current
      ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").filter(Boolean).length || 1
      : 1;
    let next = current;
    if (e.key === "ArrowLeft") next = current - 1;
    if (e.key === "ArrowRight") next = current + 1;
    if (e.key === "ArrowUp") next = current - cols;
    if (e.key === "ArrowDown") next = current + cols;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = visible.length - 1;
    next = Math.max(0, Math.min(visible.length - 1, next));
    tileRefs.current.get(visible[next].id)?.focus();
  };

  /* ---------------------------------- Save --------------------------------- */
  const dirty = selectedId !== savedId;

  const save = async () => {
    if (!dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const data = await api.updateMyAvatar(selectedId);
      updateUser(data?.user || { avatarId: data?.avatarId || selectedId });
      toast.show("Avatar updated", { type: "success" });
      savingRef.current = false;
      onClose();
    } catch (err) {
      savingRef.current = false;
      if (!mountedRef.current) return;
      setSaving(false);
      if (err?.status === 401) {
        handleAuthExpired();
        toast.show("Your session expired. Please log in again.", { type: "error" });
        onClose();
        return;
      }
      setError(saveErrorMessage(err));
    }
  };

  return (
    <Modal title="Choose Your Avatar" onClose={requestClose} size="lg" className="avatar-picker">
      <div className="avatar-picker__layout">
        <aside className="avatar-picker__preview" aria-live="polite">
          <div className="avatar-picker__preview-art">
            <Avatar avatarId={selectedId} size="xl" alt="" loading="eager" />
          </div>
          <div className="avatar-picker__preview-text">
            <p className="avatar-picker__preview-name">{selected?.name || getAvatarName(selectedId)}</p>
            <p className="avatar-picker__preview-cat">{categoryName[selected?.category] || ""}</p>
            <span className={"avatar-picker__state" + (dirty ? " is-new" : "")}>
              {dirty ? "New selection" : "Current avatar"}
            </span>
          </div>
        </aside>

        <div className="avatar-picker__main">
          <div className="avatar-picker__chips" role="group" aria-label="Filter avatars by category">
            {[{ id: "all", name: "All" }, ...catalog.categories].map((c) => (
              <button
                key={c.id}
                type="button"
                className={"avatar-picker__chip" + (category === c.id ? " is-active" : "")}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="avatar-picker__scroll">
            <div
              ref={gridRef}
              className="avatar-picker__grid"
              role="radiogroup"
              aria-label="Avatars"
              onKeyDown={onGridKeyDown}
            >
              {visible.map((a, i) => {
                const isSelected = a.id === selectedId;
                const isCurrent = a.id === savedId;
                return (
                  <button
                    key={a.id}
                    ref={(el) => {
                      if (el) tileRefs.current.set(a.id, el);
                      else tileRefs.current.delete(a.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={a.name + (isCurrent ? " (current)" : "")}
                    tabIndex={i === rovingIndex ? 0 : -1}
                    className={"avatar-tile" + (isSelected ? " is-selected" : "") + (isCurrent ? " is-current" : "")}
                    onClick={() => {
                      setSelectedId(a.id);
                      setError(null);
                    }}
                  >
                    <span className="avatar-tile__art">
                      <Avatar avatarId={a.id} size="lg" alt="" />
                      {isSelected && (
                        <span className="avatar-tile__check">
                          <CheckIcon />
                        </span>
                      )}
                    </span>
                    <span className="avatar-tile__name">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="avatar-picker__footer">
        {error && (
          <Alert variant="error" className="avatar-picker__error">
            {error}
          </Alert>
        )}
        <div className="avatar-picker__actions">
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty} loading={saving}>
            {saving ? "Saving..." : "Save avatar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
