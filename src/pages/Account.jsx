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
    <div className="password-field">
      <span className="password-field__icon">
        <IconLock />
      </span>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`ui-input password-field__input${error ? " ui-input--error" : ""}`}
        required
      />
      <button
        type="button"
        className="password-field__toggle"
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
      if (data?.accessToken) tokenStore.set(data.accessToken);
      setValues({ currentPassword: "", newPassword: "", confirm: "" });
      toast.show("Password changed successfully", { type: "success" });
    } catch (err) {
      if (err.status === 401) {
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
    <div className="account-dashboard">
      {/* Ambient background decoration */}
      <div className="account-bg" aria-hidden="true">
        <div className="account-bg__glow account-bg__glow--1" />
        <div className="account-bg__glow account-bg__glow--2" />
        <svg className="account-bg__shape account-bg__shape--controller" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="0.5">
          <rect x="10" y="15" width="80" height="30" rx="8" />
          <circle cx="30" cy="30" r="8" />
          <circle cx="70" cy="30" r="5" />
          <circle cx="78" cy="24" r="3" />
          <circle cx="78" cy="36" r="3" />
          <rect x="42" y="28" width="16" height="4" rx="1" />
        </svg>
        <svg className="account-bg__shape account-bg__shape--diamond" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="0.6">
          <path d="M20 2 L38 20 L20 38 L2 20 Z" />
          <path d="M20 8 L32 20 L20 32 L8 20 Z" />
        </svg>
        <svg className="account-bg__shape account-bg__shape--dpad" viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="0.5">
          <rect x="18" y="5" width="14" height="40" rx="2" />
          <rect x="5" y="18" width="40" height="14" rx="2" />
        </svg>
        <svg className="account-bg__shape account-bg__shape--circle" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="0.5">
          <circle cx="20" cy="20" r="18" />
          <circle cx="20" cy="20" r="12" />
          <circle cx="20" cy="20" r="6" />
        </svg>
        <svg className="account-bg__shape account-bg__shape--pixels" viewBox="0 0 30 30" fill="currentColor">
          <rect x="0" y="0" width="8" height="8" opacity="0.3" />
          <rect x="11" y="11" width="8" height="8" opacity="0.2" />
          <rect x="22" y="5" width="5" height="5" opacity="0.25" />
          <rect x="5" y="22" width="6" height="6" opacity="0.2" />
        </svg>
        <svg className="account-bg__shape account-bg__shape--plus" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="0.6">
          <path d="M15 5 L15 25 M5 15 L25 15" />
        </svg>
      </div>

      <h1 className="page-title">Account</h1>

      {/* Profile Overview - Full Width */}
      <section className="profile-overview">
        <div className="profile-overview__content">
          {/* Left: Identity */}
          <div className="profile-overview__identity">
            <div className="profile-overview__avatar" aria-hidden="true">
              {userInitial}
            </div>
            <div className="profile-overview__user">
              <h2 className="profile-overview__name">{user?.username}</h2>
              <p className="profile-overview__email">{user?.email}</p>
              <Badge variant="primary" size="sm">{user?.role}</Badge>
            </div>
          </div>

          {/* Right: Stats Grid */}
          <div className="profile-overview__stats">
            <div className="profile-stat">
              <span className="profile-stat__label">Username</span>
              <span className="profile-stat__value">{user?.username}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat__label">Email</span>
              <span className="profile-stat__value">{user?.email}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat__label">Role</span>
              <span className="profile-stat__value">{user?.role}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat__label">Member since</span>
              <span className="profile-stat__value">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Subtle decoration */}
        <div className="profile-overview__decoration" aria-hidden="true" />
      </section>

      {/* Lower Section: Liked Games + Change Password */}
      <div className="account-dashboard__lower">
        {/* Liked Games - Primary Section */}
        <section className="account-dashboard__games">
          <LikedGamesSection />
        </section>

        {/* Change Password - Secondary Section */}
        <section className="account-dashboard__security">
          <Card className="security-card">
            <CardTitle>Change password</CardTitle>
            <CardBody>
              <form className="security-form" onSubmit={onSubmit} noValidate>
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
        </section>
      </div>
    </div>
  );
}
