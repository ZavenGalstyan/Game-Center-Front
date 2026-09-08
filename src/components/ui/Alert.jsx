/**
 * Alert component for displaying feedback messages.
 *
 * @param {object} props
 * @param {"info" | "success" | "warning" | "error"} [props.variant="info"]
 * @param {React.ReactNode} props.children
 * @param {function} [props.onDismiss]
 * @param {string} [props.className]
 */
export default function Alert({
  variant = "info",
  children,
  onDismiss,
  className = "",
}) {
  const classNames = ["ui-alert", `ui-alert--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} role="alert">
      <div className="ui-alert__content">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="ui-alert__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
