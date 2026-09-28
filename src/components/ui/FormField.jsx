/**
 * FormField component - wrapper for form inputs with label, error, and hint support.
 * Enhanced version of the existing Field component.
 *
 * The error and hint messages have IDs that can be used for aria-describedby:
 * - Error: `${htmlFor}-error`
 * - Hint: `${htmlFor}-hint`
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

  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;

  return (
    <div className={classNames}>
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="ui-field__msg ui-field__msg--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="ui-field__msg">{hint}</p>
      ) : null}
    </div>
  );
}
