import { forwardRef } from "react";

/**
 * Button component with variant, size, and state support.
 * Designed for future design token integration via CSS custom properties.
 *
 * @param {object} props
 * @param {"primary" | "secondary" | "ghost" | "danger" | "link"} [props.variant="secondary"]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.loading=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {"button" | "submit" | "reset"} [props.type="button"]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    disabled = false,
    loading = false,
    fullWidth = false,
    type = "button",
    className = "",
    children,
    ...rest
  },
  ref
) {
  const classNames = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    fullWidth && "ui-btn--block",
    loading && "ui-btn--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classNames}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      <span className={loading ? "ui-btn__content--hidden" : ""}>{children}</span>
    </button>
  );
});

export default Button;
