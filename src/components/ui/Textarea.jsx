import { forwardRef } from "react";

/**
 * Textarea component for multi-line text input.
 *
 * @param {object} props
 * @param {number} [props.rows=3]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.error=false]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.readOnly=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {"none" | "vertical" | "horizontal" | "both"} [props.resize="vertical"]
 * @param {string} [props.className]
 */
const Textarea = forwardRef(function Textarea(
  {
    rows = 3,
    size = "md",
    error = false,
    disabled = false,
    readOnly = false,
    fullWidth = false,
    resize = "vertical",
    className = "",
    ...rest
  },
  ref
) {
  const classNames = [
    "ui-textarea",
    `ui-textarea--${size}`,
    error && "ui-textarea--error",
    fullWidth && "ui-textarea--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <textarea
      ref={ref}
      rows={rows}
      className={classNames}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={error}
      style={{ resize }}
      {...rest}
    />
  );
});

export default Textarea;
