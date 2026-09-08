import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "./Toast.jsx";
import { mapServerErrors, validateEmail } from "../lib/validation.js";
import { Alert, Button, FormField, Input } from "./ui";

export default function LoginForm({ onSuccess, onSwitchToRegister }) {
  const { login } = useAuth();
  const toast = useToast();

  const [values, setValues] = useState({ email: "", password: "" });
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
      email: validateEmail(values.email),
      password: values.password ? null : "Password is required",
    };
    setErrors(next);
    return !next.email && !next.password;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!clientValidate()) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const user = await login({
        email: values.email.trim(),
        password: values.password,
      });
      toast.show(`Welcome back, ${user.username}!`, { type: "success" });
      onSuccess?.(user);
    } catch (err) {
      if (err.status === 400 && err.errors) {
        setErrors(mapServerErrors(err.errors));
      } else {
        setFormError(err.message || "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {formError && <Alert variant="error">{formError}</Alert>}

      <FormField label="Email" error={errors.email} htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={setField("email")}
          disabled={submitting}
          error={Boolean(errors.email)}
        />
      </FormField>

      <FormField label="Password" error={errors.password} htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={setField("password")}
          disabled={submitting}
          error={Boolean(errors.password)}
        />
      </FormField>

      <Button variant="primary" fullWidth type="submit" loading={submitting}>
        {submitting ? "Logging in..." : "Log in"}
      </Button>

      <p className="auth-form__switch">
        Don&apos;t have an account?{" "}
        <Button variant="link" onClick={onSwitchToRegister}>
          Register
        </Button>
      </p>
    </form>
  );
}
