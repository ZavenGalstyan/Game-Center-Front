import Button from "./Button.jsx";

/**
 * ErrorState component for displaying error messages with optional retry.
 *
 * @param {object} props
 * @param {string} props.message
 * @param {string} [props.title="Something went wrong"]
 * @param {function} [props.onRetry]
 * @param {string} [props.retryLabel="Try again"]
 * @param {string} [props.className]
 */
export default function ErrorState({
  message,
  title = "Something went wrong",
  onRetry,
  retryLabel = "Try again",
  className = "",
}) {
  const classNames = ["ui-error-state", className].filter(Boolean).join(" ");

  return (
    <div className={classNames} role="alert">
      <div className="ui-error-state__icon" aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="ui-error-state__title">{title}</h3>
      <p className="ui-error-state__message">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
