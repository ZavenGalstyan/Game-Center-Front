/**
 * Legacy Field component - maintained for backward compatibility.
 * New code should import FormField from "./ui" instead.
 *
 * This wrapper maps the old API to the new FormField component
 * while preserving the original CSS classes for visual compatibility.
 */
export default function Field({ label, error, hint, children, htmlFor }) {
  // Keep using original CSS classes for backward compatibility
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__msg field__msg--error">{error}</p>
      ) : hint ? (
        <p className="field__msg">{hint}</p>
      ) : null}
    </div>
  );
}

// Re-export new FormField for gradual migration
export { default as FormField } from "./ui/FormField.jsx";
