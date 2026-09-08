/**
 * PageHeader component for page-level headers with optional actions.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {string} [props.className]
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
}) {
  const classNames = ["ui-page-header", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      <div className="ui-page-header__text">
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}
