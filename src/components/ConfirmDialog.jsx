import Modal from "./Modal.jsx";

/**
 * Small confirmation dialog for destructive admin actions.
 * `error` shows a server message (e.g. a 409) without closing the dialog.
 */
export default function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      {message && <p style={{ marginTop: 0 }}>{message}</p>}
      {error && <div className="form-alert">{error}</div>}
      <div className="dialog-actions">
        <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
