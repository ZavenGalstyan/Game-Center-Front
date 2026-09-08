/**
 * Spinner component for loading indicators.
 *
 * @param {object} props
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {string} [props.className]
 */
export default function Spinner({ size = "md", className = "" }) {
  const classNames = ["ui-spinner", `ui-spinner--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} role="status" aria-label="Loading">
      <svg
        className="ui-spinner__svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          className="ui-spinner__track"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="ui-spinner__arc"
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
