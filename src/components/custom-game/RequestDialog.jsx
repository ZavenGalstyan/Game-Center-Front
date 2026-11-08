import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../i18n/useTranslation.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Single dialog shell for the custom game request flow. The content (`view`)
 * can change while it stays mounted, so there is never more than one overlay,
 * keydown handler or scroll lock. Focus moves to `[data-autofocus]` in each
 * new view (else the first focusable) and returns to the trigger on unmount.
 */
export default function RequestDialog({
  view,
  size = "md",
  closing = false,
  labelledBy,
  describedBy,
  onClose,
  children,
}) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount-only: scroll lock, key handling, focus restore.
  useEffect(() => {
    const trigger = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      const root = dialogRef.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  // Each view: move focus into it.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const target =
      root.querySelector("[data-autofocus]") || focusables(root)[0] || root;
    target.focus({ preventScroll: true });
  }, [view]);

  const onOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={`cg-overlay${closing ? " is-closing" : ""}`}
      onMouseDown={onOverlayMouseDown}
    >
      <div
        ref={dialogRef}
        className={`cg-dialog cg-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <button
          type="button"
          className="cg-dialog__close"
          onClick={() => onClose()}
          aria-label={t("Close")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div key={view} className="cg-dialog__view">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
