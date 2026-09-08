import { forwardRef } from "react";

/**
 * IconButton component for icon-only buttons with accessibility support.
 *
 * @param {object} props
 * @param {React.ReactNode} props.icon - The icon element to display
 * @param {string} props.label - Accessible label (aria-label)
 * @param {"primary" | "secondary" | "ghost"} [props.variant="secondary"]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.loading=false]
 * @param {boolean} [props.pressed] - For toggle buttons (aria-pressed)
 * @param {string} [props.className]
 */
const IconButton = forwardRef(function IconButton(
  {
    icon,
    label,
    variant = "secondary",
    size = "md",
    disabled = false,
    loading = false,
    pressed,
    className = "",
    ...rest
  },
  ref
) {
  const classNames = [
    "ui-icon-btn",
    `ui-icon-btn--${variant}`,
    `ui-icon-btn--${size}`,
    loading && "ui-icon-btn--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type="button"
      className={classNames}
      disabled={disabled || loading}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <span className="ui-icon-btn__spinner" aria-hidden="true" /> : icon}
    </button>
  );
});

export default IconButton;
