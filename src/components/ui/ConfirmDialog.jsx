import Modal from "./Modal.jsx";
import Button from "./Button.jsx";
import Alert from "./Alert.jsx";

/**
 * ConfirmDialog component for confirmation prompts.
 *
 * @param {object} props
 * @param {string} [props.title="Are you sure?"]
 * @param {string} [props.message]
 * @param {"danger" | "warning" | "info"} [props.variant="danger"]
 * @param {string} [props.confirmLabel="Confirm"]
 * @param {string} [props.cancelLabel="Cancel"]
 * @param {boolean} [props.busy=false]
 * @param {string|null} [props.error=null]
 * @param {function} props.onConfirm
 * @param {function} props.onCancel
 */
export default function ConfirmDialog({
  title = "Are you sure?",
  message,
  variant = "danger",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const confirmVariant = variant === "danger" ? "danger" : "primary";

  return (
    <Modal title={title} onClose={onCancel} size="sm" closeOnOverlayClick={!busy}>
      <div className="ui-confirm">
        {message && <p className="ui-confirm__message">{message}</p>}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="ui-confirm__actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
