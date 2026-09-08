/**
 * FormField component - wrapper for form inputs with label, error, and hint support.
 * Enhanced version of the existing Field component.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.htmlFor]
 * @param {string|null} [props.error]
 * @param {string|null} [props.hint]
 * @param {boolean} [props.required=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  disabled = false,
  className = "",
  children,
}) {
  const classNames = [
    "ui-field",
    error && "ui-field--error",
    disabled && "ui-field--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames}>
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="ui-field__msg ui-field__msg--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ui-field__msg">{hint}</p>
      ) : null}
    </div>
  );
}
