/**
 * Badge component for labels and status indicators.
 *
 * @param {object} props
 * @param {"default" | "primary" | "success" | "warning" | "danger"} [props.variant="default"]
 * @param {"sm" | "md"} [props.size="md"]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Badge({
  variant = "default",
  size = "md",
  className = "",
  children,
}) {
  const classNames = [
    "ui-badge",
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classNames}>{children}</span>;
}
