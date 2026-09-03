import { useState } from "react";
import Field from "./Field.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import {
  mapServerErrors,
  validateEmail,
  validatePassword,
  validateUsername,
} from "../lib/validation.js";

export default function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const { registerAndLogin } = useAuth();
  const toast = useToast();

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
      toast.show(`Welcome, ${user.username}!`, { type: "success" });
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
      {formError && <div className="form-alert">{formError}</div>}

      <Field
        label="Username"
        error={errors.username}
        hint="3–30 characters · letters, numbers, and _ . -"
        htmlFor="reg-username"
      >
        <input
          id="reg-username"
          type="text"
          autoComplete="username"
          value={values.username}
          onChange={setField("username")}
          disabled={submitting}
        />
      </Field>

      <Field label="Email" error={errors.email} htmlFor="reg-email">
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={setField("email")}
          disabled={submitting}
        />
      </Field>

      <Field
        label="Password"
        error={errors.password}
        hint="8–128 characters"
        htmlFor="reg-password"
      >
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={setField("password")}
          disabled={submitting}
        />
      </Field>

      <Field
        label="Confirm password"
        error={errors.confirmPassword}
        htmlFor="reg-confirm"
      >
        <input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={setField("confirmPassword")}
          disabled={submitting}
        />
      </Field>

      <button className="btn btn--primary btn--block" type="submit" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </button>

      <p className="auth-form__switch">
        Already have an account?{" "}
        <button type="button" className="linkbtn" onClick={onSwitchToLogin}>
          Log in
        </button>
      </p>
    </form>
  );
}
