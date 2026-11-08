import Spinner from "./Spinner.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

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
  const { tn } = useTranslation();
  const classNames = ["ui-loading-state", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      <Spinner size={size} />
      {message && <p className="ui-loading-state__message">{tn(message)}</p>}
    </div>
  );
}
