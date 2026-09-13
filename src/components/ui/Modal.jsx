import { useEffect, useCallback } from "react";

/**
 * Modal component with enhanced accessibility and customization.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {function} props.onClose
 * @param {"sm" | "md" | "lg" | "fullscreen"} [props.size="md"]
 * @param {boolean} [props.closeOnOverlayClick=true]
 * @param {boolean} [props.closeOnEscape=true]
 * @param {boolean} [props.showCloseButton=true]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Modal({
  title,
  onClose,
  size = "md",
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = "",
  children,
}) {
  const handleKeyDown = useCallback(
    (e) => {
      if (closeOnEscape && e.key === "Escape") {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const classNames = [
    "ui-modal",
    `ui-modal--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-modal-overlay" onClick={handleOverlayClick}>
      <div
        className={classNames}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="ui-modal__head">
          <h2 id="modal-title" className="ui-modal__title">
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              className="ui-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * ModalFooter component for modal actions.
 */
export function ModalFooter({ children, className = "" }) {
  const classNames = ["ui-modal__footer", className].filter(Boolean).join(" ");
  return <div className={classNames}>{children}</div>;
}
