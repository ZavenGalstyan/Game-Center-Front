import Button from "./Button.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

/**
 * EmptyState component for displaying empty data states.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {React.ReactNode} [props.icon]
 * @param {{ label: string, onClick: function }} [props.action]
 * @param {string} [props.className]
 */
export default function EmptyState({
  title,
  message,
  icon,
  action,
  className = "",
}) {
  const { tn } = useTranslation();
  const classNames = ["ui-empty-state", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      {icon && (
        <div className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="ui-empty-state__title">{tn(title)}</p>
      {message && <p className="ui-empty-state__message">{tn(message)}</p>}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {tn(action.label)}
        </Button>
      )}
    </div>
  );
}
