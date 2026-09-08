import { useState, useCallback } from "react";

/**
 * Custom hook for form state management.
 * Consolidates the form pattern used across LoginForm, RegisterForm, and admin modals.
 *
 * @param {object} initialValues - Initial form values
 * @param {function} [validate] - Optional validation function returning { fieldName: errorMessage }
 * @returns {object} Form state and handlers
 */
export function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Creates a change handler for a specific field.
   * Clears the field error and form error on change.
   */
  const setField = useCallback(
    (name) => (e) => {
      const value =
        e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setValues((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: undefined }));
      setFormError(null);
    },
    []
  );

  /**
   * Sets a specific field value directly.
   */
  const setFieldValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setFormError(null);
  }, []);

  /**
   * Sets a specific field error.
   */
  const setFieldError = useCallback((name, error) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  /**
   * Creates a submit handler that validates and calls the provided onSubmit.
   * Returns a function to be used as form onSubmit.
   */
  const handleSubmit = useCallback(
    (onSubmit) => async (e) => {
      e.preventDefault();

      // Clear previous errors
      setFormError(null);

      // Run validation if provided
      const validationErrors = validate ? validate(values) : {};
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      setSubmitting(true);
      try {
        await onSubmit(values);
      } catch (err) {
        // Handle error - could be string message or Error object
        const message = err.message || String(err);
        setFormError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [values, validate]
  );

  /**
   * Resets the form to initial values and clears all errors.
   */
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }, [initialValues]);

  /**
   * Resets the form with new initial values.
   */
  const resetWith = useCallback((newValues) => {
    setValues(newValues);
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }, []);

  /**
   * Checks if a specific field has an error.
   */
  const hasError = useCallback(
    (name) => Boolean(errors[name]),
    [errors]
  );

  /**
   * Gets the error message for a specific field.
   */
  const getError = useCallback(
    (name) => errors[name] || null,
    [errors]
  );

  return {
    // State
    values,
    errors,
    formError,
    submitting,

    // Setters
    setValues,
    setErrors,
    setFormError,
    setField,
    setFieldValue,
    setFieldError,

    // Handlers
    handleSubmit,
    reset,
    resetWith,

    // Helpers
    hasError,
    getError,
  };
}

export default useForm;
