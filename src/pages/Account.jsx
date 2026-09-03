import { useState } from "react";
import Field from "../components/Field.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { api, tokenStore } from "../lib/api.js";
import { mapServerErrors, validateNewPassword } from "../lib/validation.js";

export default function Account() {
  const { user, handleAuthExpired } = useAuth();
  const toast = useToast();

  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
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
      currentPassword: values.currentPassword ? null : "Current password is required",
      newPassword: validateNewPassword(values.newPassword, values.currentPassword),
      confirm:
        values.confirm !== values.newPassword ? "Passwords do not match" : null,
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
      const data = await api.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Backend returns a fresh token — replace the stored one.
      if (data?.accessToken) tokenStore.set(data.accessToken);
      setValues({ currentPassword: "", newPassword: "", confirm: "" });
      toast.show("Password changed successfully", { type: "success" });
    } catch (err) {
      if (err.status === 401) {
        // Either not authenticated anymore, or wrong current password.
        if (/current password/i.test(err.message || "")) {
          setErrors((p) => ({ ...p, currentPassword: err.message }));
        } else {
          handleAuthExpired();
          toast.show("Your session expired. Please log in again.", { type: "error" });
        }
      } else if (err.status === 400 && err.errors) {
        setErrors(mapServerErrors(err.errors));
      } else {
        setFormError(err.message || "Could not change password");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="account">
      <h1 className="page-title">Account</h1>

      <section className="card">
        <h2 className="card__title">Profile</h2>
        <dl className="profile">
          <div>
            <dt>Username</dt>
            <dd>{user?.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user?.role}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2 className="card__title">Change password</h2>
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {formError && <div className="form-alert">{formError}</div>}

          <Field
            label="Current password"
            error={errors.currentPassword}
            htmlFor="cur-pw"
          >
            <input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={setField("currentPassword")}
              disabled={submitting}
            />
          </Field>

          <Field
            label="New password"
            error={errors.newPassword}
            hint="8–128 characters, different from the current one"
            htmlFor="new-pw"
          >
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={values.newPassword}
              onChange={setField("newPassword")}
              disabled={submitting}
            />
          </Field>

          <Field label="Confirm new password" error={errors.confirm} htmlFor="conf-pw">
            <input
              id="conf-pw"
              type="password"
              autoComplete="new-password"
              value={values.confirm}
              onChange={setField("confirm")}
              disabled={submitting}
            />
          </Field>

          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}
