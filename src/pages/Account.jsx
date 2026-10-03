import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { api, tokenStore } from "../lib/api.js";
import { mapServerErrors, validateNewPassword } from "../lib/validation.js";
import { Alert, Button, FormField, Card, CardTitle, CardBody, Badge } from "../components/ui";
import LikedGamesSection from "../components/LikedGamesSection.jsx";

function IconLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordInput({ id, value, onChange, disabled, error, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrapper">
      <span className="password-input-icon password-input-icon--lock">
        <IconLock />
      </span>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`ui-input password-input${error ? " ui-input--error" : ""}`}
        required
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

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

  const userInitial = user?.username?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="account-page">
      <h1 className="page-title">Account</h1>

      <div className="account-layout">
        {/* Left Column: Profile + Change Password */}
        <div className="account-layout__left">
          <Card className="account-card account-card--profile">
            <CardBody>
              {/* Profile Header */}
              <div className="profile-header">
                <div className="profile-avatar" aria-hidden="true">
                  {userInitial}
                </div>
                <div className="profile-header__info">
                  <h2 className="profile-header__name">{user?.username}</h2>
                  <p className="profile-header__email">{user?.email}</p>
                  <Badge variant="success" size="sm">{user?.role}</Badge>
                </div>
              </div>

              {/* Profile Details */}
              <dl className="profile-details">
                <div className="profile-details__row">
                  <dt>Username</dt>
                  <dd>{user?.username}</dd>
                </div>
                <div className="profile-details__row">
                  <dt>Email</dt>
                  <dd>{user?.email}</dd>
                </div>
                <div className="profile-details__row">
                  <dt>Role</dt>
                  <dd>{user?.role}</dd>
                </div>
                <div className="profile-details__row">
                  <dt>Member since</dt>
                  <dd>
                    {user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
              </dl>

              {/* Profile Decoration */}
              <div className="profile-decoration" aria-hidden="true" />
            </CardBody>
          </Card>

          <Card className="account-card account-card--password">
            <CardTitle>Change password</CardTitle>
            <CardBody>
              <form className="auth-form" onSubmit={onSubmit} noValidate>
                {formError && <Alert variant="error">{formError}</Alert>}

                <FormField
                  label="Current password"
                  error={errors.currentPassword}
                  htmlFor="cur-pw"
                  required
                >
                  <PasswordInput
                    id="cur-pw"
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
                  required
                >
                  <PasswordInput
                    id="new-pw"
                    autoComplete="new-password"
                    value={values.newPassword}
                    onChange={setField("newPassword")}
                    disabled={submitting}
                    error={Boolean(errors.newPassword)}
                  />
                </FormField>

                <FormField label="Confirm new password" error={errors.confirm} htmlFor="conf-pw" required>
                  <PasswordInput
                    id="conf-pw"
                    autoComplete="new-password"
                    value={values.confirm}
                    onChange={setField("confirm")}
                    disabled={submitting}
                    error={Boolean(errors.confirm)}
                  />
                </FormField>

                <Button variant="primary" type="submit" loading={submitting} fullWidth>
                  {submitting ? "Saving..." : "Change password"}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Liked Games */}
        <div className="account-layout__right">
          <LikedGamesSection />
        </div>
      </div>
    </div>
  );
}
