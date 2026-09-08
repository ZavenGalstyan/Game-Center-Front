import Button from "./Button.jsx";

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
  const classNames = ["ui-empty-state", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      {icon && (
        <div className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="ui-empty-state__title">{title}</p>
      {message && <p className="ui-empty-state__message">{message}</p>}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
