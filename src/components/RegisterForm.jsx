import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import {
  mapServerErrors,
  validateEmail,
  validatePassword,
  validateUsername,
} from "../lib/validation.js";
import { Alert, Button, FormField, Input } from "./ui";
import { useTranslation } from "../i18n/useTranslation.js";

export default function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const { registerAndLogin } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setFormError(null);
  };

  const clientValidate = () => {
    const next = {
      username: validateUsername(values.username),
      email: validateEmail(values.email),
      password: validatePassword(values.password),
      confirmPassword:
        values.confirmPassword !== values.password
          ? "Passwords do not match"
          : null,
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!clientValidate()) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const user = await registerAndLogin({
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      toast.show(t("Welcome, {name}!", { name: user.username }), { type: "success" });
      onSuccess?.(user);
    } catch (err) {
      if (err.status === 400 && err.errors) {
        setErrors(mapServerErrors(err.errors));
      } else if (err.status === 409) {
        const msg = err.message || "That account already exists";
        if (/username/i.test(msg)) setErrors((p) => ({ ...p, username: msg }));
        else setErrors((p) => ({ ...p, email: msg }));
      } else {
        setFormError(err.message || "Registration failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {formError && <Alert variant="error">{formError}</Alert>}

      <FormField
        label={t("Username")}
        error={errors.username}
        hint={t("3–30 characters · letters, numbers, and _ . -")}
        htmlFor="reg-username"
        required
      >
        <Input
          id="reg-username"
          type="text"
          autoComplete="username"
          value={values.username}
          onChange={setField("username")}
          disabled={submitting}
          error={Boolean(errors.username)}
          required
        />
      </FormField>

      <FormField label={t("Email")} error={errors.email} htmlFor="reg-email" required>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={setField("email")}
          disabled={submitting}
          error={Boolean(errors.email)}
          required
        />
      </FormField>

      <FormField
        label={t("Password")}
        error={errors.password}
        hint={t("8–128 characters")}
        htmlFor="reg-password"
        required
      >
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={setField("password")}
          disabled={submitting}
          error={Boolean(errors.password)}
          required
        />
      </FormField>

      <FormField
        label={t("Confirm password")}
        error={errors.confirmPassword}
        htmlFor="reg-confirm"
        required
      >
        <Input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={setField("confirmPassword")}
          disabled={submitting}
          error={Boolean(errors.confirmPassword)}
          required
        />
      </FormField>

      <Button variant="primary" fullWidth type="submit" loading={submitting}>
        {submitting ? t("Creating account...") : t("Create account")}
      </Button>

      <p className="auth-form__switch">
        {t("Already have an account?")}{" "}
        <Button variant="link" onClick={onSwitchToLogin}>
          {t("Log in")}
        </Button>
      </p>
    </form>
  );
}
