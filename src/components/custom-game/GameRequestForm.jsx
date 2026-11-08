import { useEffect, useRef, useState } from "react";
import { useForm } from "../../hooks/useForm.js";
import { Alert, FormField, Input, Textarea } from "../ui";
import { CommissionBadge } from "./Emblems.jsx";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  EMAIL_MAX,
  NAME_MAX,
  initialRequestValues,
  requestValidators,
  validateGameRequest,
} from "./gameRequest.js";
import { useTranslation } from "../../i18n/useTranslation.js";

const FIELD_ORDER = ["firstName", "lastName", "email", "description"];

const ICONS = {
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  ),
};

export default function GameRequestForm({ user, initialValues, onDraftChange, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const initial = useRef(initialValues || initialRequestValues(user)).current;
  const { values, errors, formError, setField, setErrors, setFieldError, setFormError } =
    useForm(initial);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const fieldRefs = useRef({});

  const firstEmpty = FIELD_ORDER.find((f) => !initial[f]) || "description";

  // Keep the unsent values with the flow so they survive close / failure.
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChangeRef.current?.(values);
  }, [values]);

  const describe = (name, extra) =>
    [errors[name] ? `cgr-${name}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  const onBlur = (name) => () => {
    // Validate once something was typed; empty untouched fields stay quiet.
    if (values[name].trim()) setFieldError(name, requestValidators[name](values[name]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lock.current) return; // no double submissions
    const found = validateGameRequest(values);
    if (Object.keys(found).length) {
      setErrors(found);
      const first = FIELD_ORDER.find((f) => found[f]);
      fieldRefs.current[first]?.focus();
      return;
    }
    lock.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      const fieldErrors = err?.fieldErrors || {};
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors);
        const first = FIELD_ORDER.find((f) => fieldErrors[f]);
        fieldRefs.current[first]?.focus();
      }
      setFormError(err?.message || "Something went wrong. Please try again.");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  const nameField = (name, label, autoComplete) => (
    <FormField label={label} htmlFor={`cgr-${name}`} error={errors[name]} required>
      <div className="cg-control">
        <span className="cg-control__icon">{ICONS.user}</span>
        <Input
          ref={(el) => (fieldRefs.current[name] = el)}
          id={`cgr-${name}`}
          name={name}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={setField(name)}
          onBlur={onBlur(name)}
          maxLength={NAME_MAX}
          error={Boolean(errors[name])}
          aria-describedby={describe(name)}
          aria-required="true"
          disabled={submitting}
          data-autofocus={firstEmpty === name ? "" : undefined}
          className="cg-control__input"
          fullWidth
        />
      </div>
    </FormField>
  );

  const length = values.description.trim().length;
  const progress = Math.min(1, length / DESCRIPTION_MIN);
  const ready = length >= DESCRIPTION_MIN;

  return (
    <form className="cg-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
      <div className="cg-form__scroll">
        <header className="cg-form__head">
          <div className="cg-form__head-art" aria-hidden="true">
            <span className="cg-form__orb cg-form__orb--a" />
            <span className="cg-form__orb cg-form__orb--b" />
          </div>
          <div className="cg-form__title-row">
            <CommissionBadge />
            <div>
              <p className="cg-eyebrow">{t("Custom Game Request")}</p>
              <h2 id="cg-dialog-title" className="cg-dialog__title">
                {t("Let's Build Your Game")}
              </h2>
            </div>
          </div>
          <p id="cg-dialog-desc" className="cg-dialog__lead">
            {t("Tell us about your dream game. We'll review your idea and contact you by email to discuss the details and pricing.")}
          </p>
        </header>

        <div className="cg-form__body">
          {formError && <Alert variant="error">{formError}</Alert>}

          <div className="cg-form__row">
            {nameField("firstName", "First Name", "given-name")}
            {nameField("lastName", "Last Name", "family-name")}
          </div>

          <FormField label={t("Email Address")} htmlFor="cgr-email" error={errors.email} required>
            <div className="cg-control">
              <span className="cg-control__icon">{ICONS.mail}</span>
              <Input
                ref={(el) => (fieldRefs.current.email = el)}
                id="cgr-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={setField("email")}
                onBlur={onBlur("email")}
                maxLength={EMAIL_MAX}
                error={Boolean(errors.email)}
                aria-describedby={describe("email")}
                aria-required="true"
                disabled={submitting}
                data-autofocus={firstEmpty === "email" ? "" : undefined}
                className="cg-control__input"
                fullWidth
              />
            </div>
          </FormField>

          <FormField
            label={t("Describe Your Game")}
            htmlFor="cgr-description"
            error={errors.description}
            required
            className="cg-field--story"
          >
            <Textarea
              ref={(el) => (fieldRefs.current.description = el)}
              id="cgr-description"
              name="description"
              rows={6}
              value={values.description}
              onChange={setField("description")}
              onBlur={onBlur("description")}
              maxLength={DESCRIPTION_MAX}
              placeholder={t("Imagine your perfect game. What's the story, genre, gameplay, characters, visual style, or special feature you'd love to see?")}
              error={Boolean(errors.description)}
              aria-describedby={describe("description", "cgr-description-meta")}
              aria-required="true"
              disabled={submitting}
              data-autofocus={firstEmpty === "description" ? "" : undefined}
              className="cg-story"
              fullWidth
            />
            <div className="cg-story__meta" id="cgr-description-meta">
              <span className={`cg-story__hint${ready ? " is-ready" : ""}`}>
                <span className="cg-story__meter" aria-hidden="true">
                  <span style={{ transform: `scaleX(${progress})` }} />
                </span>
                {ready ? t("Great — that's enough to get started") : t("Minimum {count} characters", { count: DESCRIPTION_MIN })}
              </span>
              <span
                className={`cg-story__count${values.description.length >= DESCRIPTION_MAX ? " is-max" : ""}`}
              >
                <span aria-hidden="true">
                  {values.description.length} / {DESCRIPTION_MAX}
                </span>
                <span className="cg-sr-only">
                  {t("{count} of {max} characters used", { count: values.description.length, max: DESCRIPTION_MAX })}
                </span>
              </span>
            </div>
          </FormField>
        </div>
      </div>

      <footer className="cg-form__foot">
        <button type="button" className="cg-btn cg-btn--ghost" onClick={onCancel} disabled={submitting}>
          <span>{t("Cancel")}</span>
        </button>
        <button type="submit" className="cg-btn cg-btn--primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <span className="cg-btn__spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
            </svg>
          )}
          <span>{submitting ? t("Sending…") : t("Send Game Request")}</span>
        </button>
      </footer>
    </form>
  );
}
