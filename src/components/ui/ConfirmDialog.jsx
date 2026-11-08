import Modal from "./Modal.jsx";
import Button from "./Button.jsx";
import Alert from "./Alert.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

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
 * @param {string} [props.className]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
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
  className = "",
  size = "md",
  onConfirm,
  onCancel,
}) {
  const { tn } = useTranslation();
  const confirmVariant = variant === "danger" ? "danger" : "primary";

  return (
    <Modal title={tn(title)} onClose={onCancel} size={size} closeOnOverlayClick={!busy} className={className}>
      <div className="ui-confirm">
        {message && <p className="ui-confirm__message">{tn(message)}</p>}
        {error && <Alert variant="error">{tn(error)}</Alert>}
        <div className="ui-confirm__actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {tn(cancelLabel)}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={busy}>
            {tn(confirmLabel)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
