import Spinner from "./Spinner.jsx";

/**
 * LoadingState component for displaying loading indicators.
 *
 * @param {object} props
 * @param {string} [props.message="Loading..."]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {string} [props.className]
 */
export default function LoadingState({
  message = "Loading...",
  size = "md",
  className = "",
}) {
  const classNames = ["ui-loading-state", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      <Spinner size={size} />
      {message && <p className="ui-loading-state__message">{message}</p>}
    </div>
  );
}
