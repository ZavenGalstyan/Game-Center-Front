// Client-side mirrors of the backend validation rules (guide §5).

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(value) {
  const v = (value || "").trim();
  if (!v) return "Username is required";
  if (v.length < 3 || v.length > 30)
    return "Username must be 3–30 characters";
  if (!USERNAME_RE.test(v))
    return "Only letters, numbers, and _ . - are allowed";
  return null;
}

export function validateEmail(value) {
  const v = (value || "").trim();
  if (!v) return "Email is required";
  if (!EMAIL_RE.test(v)) return "A valid email address is required";
  return null;
}

export function validatePassword(value) {
  const v = value || "";
  if (!v) return "Password is required";
  if (v.length < 8 || v.length > 128)
    return "Password must be 8–128 characters";
  return null;
}

export function validateNewPassword(value, currentPassword) {
  const base = validatePassword(value);
  if (base) return base;
  if (value === currentPassword)
    return "New password must be different from the current one";
  return null;
}

/** Merge a backend errors[] array into a { field: message } object. */
export function mapServerErrors(errors) {
  const out = {};
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e && e.field && !out[e.field]) out[e.field] = e.message;
    }
  }
  return out;
}
