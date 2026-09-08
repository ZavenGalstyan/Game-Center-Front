import { forwardRef } from "react";

/**
 * Select component for dropdown selections.
 *
 * @param {object} props
 * @param {Array<{value: string, label: string}>} props.options
 * @param {string} [props.placeholder]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.error=false]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {string} [props.className]
 */
const Select = forwardRef(function Select(
  {
    options = [],
    placeholder,
    size = "md",
    error = false,
    disabled = false,
    fullWidth = false,
    className = "",
    value,
    ...rest
  },
  ref
) {
  const classNames = [
    "ui-select",
    `ui-select--${size}`,
    error && "ui-select--error",
    fullWidth && "ui-select--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <select
      ref={ref}
      className={classNames}
      disabled={disabled}
      aria-invalid={error}
      value={value}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

export default Select;
