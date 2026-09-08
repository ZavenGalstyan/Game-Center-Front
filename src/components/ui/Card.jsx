/**
 * Card component for contained content sections.
 *
 * @param {object} props
 * @param {"elevated" | "outlined" | "flat"} [props.variant="elevated"]
 * @param {"none" | "sm" | "md" | "lg"} [props.padding="md"]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Card({
  variant = "elevated",
  padding = "md",
  className = "",
  children,
  ...rest
}) {
  const classNames = [
    "ui-card",
    `ui-card--${variant}`,
    padding !== "none" && `ui-card--pad-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} {...rest}>
      {children}
    </div>
  );
}

/**
 * CardHeader component for card titles.
 */
export function CardHeader({ children, className = "" }) {
  const classNames = ["ui-card__header", className].filter(Boolean).join(" ");
  return <div className={classNames}>{children}</div>;
}

/**
 * CardTitle component for card heading text.
 */
export function CardTitle({ children, className = "", as: Tag = "h3" }) {
  const classNames = ["ui-card__title", className].filter(Boolean).join(" ");
  return <Tag className={classNames}>{children}</Tag>;
}

/**
 * CardBody component for card content.
 */
export function CardBody({ children, className = "" }) {
  const classNames = ["ui-card__body", className].filter(Boolean).join(" ");
  return <div className={classNames}>{children}</div>;
}

/**
 * CardFooter component for card actions.
 */
export function CardFooter({ children, className = "" }) {
  const classNames = ["ui-card__footer", className].filter(Boolean).join(" ");
  return <div className={classNames}>{children}</div>;
}
