import { useEffect, useCallback, useRef } from "react";

/**
 * Modal component with enhanced accessibility and customization.
 *
 * Accessibility features:
 * - role="dialog" with aria-modal="true"
 * - aria-labelledby pointing to modal title
 * - Escape key closes modal (configurable)
 * - Focus trapped within modal while open
 * - Focus restored to trigger element on close
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
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (closeOnEscape && e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: Tab key cycles within modal
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    // Store the previously focused element
    previousActiveElement.current = document.activeElement;

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    // Focus the first focusable element in the modal
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElements?.[0]?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";

      // Restore focus to the trigger element
      previousActiveElement.current?.focus?.();
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
        ref={modalRef}
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
