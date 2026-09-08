import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { api, tokenStore } from "../lib/api.js";
import { mapServerErrors, validateNewPassword } from "../lib/validation.js";
import { Alert, Button, FormField, Input, Card, CardTitle, CardBody } from "../components/ui";

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

      <Card className="card" style={{ maxWidth: 520 }}>
        <CardTitle>Profile</CardTitle>
        <CardBody>
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
        </CardBody>
      </Card>

      <Card className="card" style={{ maxWidth: 520 }}>
        <CardTitle>Change password</CardTitle>
        <CardBody>
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {formError && <Alert variant="error">{formError}</Alert>}

            <FormField
              label="Current password"
              error={errors.currentPassword}
              htmlFor="cur-pw"
            >
              <Input
                id="cur-pw"
                type="password"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={setField("currentPassword")}
                disabled={submitting}
                error={Boolean(errors.currentPassword)}
              />
            </FormField>

            <FormField
              label="New password"
              error={errors.newPassword}
              hint="8–128 characters, different from the current one"
              htmlFor="new-pw"
            >
              <Input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                value={values.newPassword}
                onChange={setField("newPassword")}
                disabled={submitting}
                error={Boolean(errors.newPassword)}
              />
            </FormField>

            <FormField label="Confirm new password" error={errors.confirm} htmlFor="conf-pw">
              <Input
                id="conf-pw"
                type="password"
                autoComplete="new-password"
                value={values.confirm}
                onChange={setField("confirm")}
                disabled={submitting}
                error={Boolean(errors.confirm)}
              />
            </FormField>

            <Button variant="primary" type="submit" loading={submitting}>
              {submitting ? "Saving..." : "Change password"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
