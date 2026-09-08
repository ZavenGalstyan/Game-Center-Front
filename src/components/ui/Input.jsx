import { forwardRef } from "react";

/**
 * Input component for text-based form inputs.
 *
 * @param {object} props
 * @param {"text" | "email" | "password" | "number" | "search" | "tel" | "url"} [props.type="text"]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.error=false]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.readOnly=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {string} [props.className]
 */
const Input = forwardRef(function Input(
  {
    type = "text",
    size = "md",
    error = false,
    disabled = false,
    readOnly = false,
    fullWidth = false,
    className = "",
    ...rest
  },
  ref
) {
  const classNames = [
    "ui-input",
    `ui-input--${size}`,
    error && "ui-input--error",
    fullWidth && "ui-input--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <input
      ref={ref}
      type={type}
      className={classNames}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={error}
      {...rest}
    />
  );
});

export default Input;
