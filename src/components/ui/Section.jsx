/**
 * Section component for grouping related content.
 *
 * @param {object} props
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {"none" | "sm" | "md" | "lg"} [props.spacing="md"]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Section({
  title,
  subtitle,
  actions,
  spacing = "md",
  className = "",
  children,
}) {
  const classNames = [
    "ui-section",
    spacing !== "none" && `ui-section--spacing-${spacing}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hasHeader = title || actions;

  return (
    <section className={classNames}>
      {hasHeader && (
        <div className="ui-section__header">
          <div className="ui-section__text">
            {title && <h2 className="ui-section__title">{title}</h2>}
            {subtitle && <p className="ui-section__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ui-section__actions">{actions}</div>}
        </div>
      )}
      <div className="ui-section__content">{children}</div>
    </section>
  );
}
