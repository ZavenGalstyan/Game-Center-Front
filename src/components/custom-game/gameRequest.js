// Custom game request — validation, payload shape and submission seam.
// Frontend only: nothing here talks to a server yet.

import { validateEmail } from "../../lib/validation.js";

export const NAME_MIN = 2;
export const NAME_MAX = 50;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 2000;

export const EMPTY_REQUEST = Object.freeze({
  firstName: "",
  lastName: "",
  email: "",
  description: "",
});

function validateName(value, label) {
  const v = (value || "").trim();
  if (!v) return `${label} is required`;
  if (v.length < NAME_MIN) return `${label} must be at least ${NAME_MIN} characters`;
  if (v.length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or fewer`;
  return null;
}

function validateDescription(value) {
  const v = (value || "").trim();
  if (!v) return "Please describe your game idea";
  if (v.length < DESCRIPTION_MIN) {
    const missing = DESCRIPTION_MIN - v.length;
    return `Add a little more detail — ${missing} more character${missing === 1 ? "" : "s"} needed`;
  }
  if (v.length > DESCRIPTION_MAX)
    return `Description must be ${DESCRIPTION_MAX} characters or fewer`;
  return null;
}

/** Per-field validators, keyed like the payload. Return an error string or null. */
export const requestValidators = {
  firstName: (v) => validateName(v, "First name"),
  lastName: (v) => validateName(v, "Last name"),
  email: validateEmail,
  description: validateDescription,
};

/** Validates every field; returns { field: message } for the invalid ones only. */
export function validateGameRequest(values) {
  const errors = {};
  for (const [field, validate] of Object.entries(requestValidators)) {
    const message = validate(values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

/**
 * The payload a future backend endpoint will receive.
 * @returns {{ firstName: string, lastName: string, email: string, description: string }}
 */
export function buildGameRequestPayload(values) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    description: values.description.trim(),
  };
}

/** Prefill from the signed-in profile. Only fields the profile actually has. */
export function initialRequestValues(user) {
  return {
    ...EMPTY_REQUEST,
    firstName: typeof user?.firstName === "string" ? user.firstName : "",
    lastName: typeof user?.lastName === "string" ? user.lastName : "",
    email: typeof user?.email === "string" ? user.email : "",
  };
}

/**
 * Submission seam. Online submissions are not available yet, so this resolves
 * to `{ delivered: false }` without any network activity, and the UI shows the
 * "coming soon" state. When the backend is ready, replace the body with the
 * real API call (add it to `api` in lib/api.js) and return `{ delivered: true }`
 * on success; a thrown `{ status: 401 }` is already handled as an expired
 * session by the caller.
 *
 * @param {ReturnType<typeof buildGameRequestPayload>} _payload
 * @returns {Promise<{ delivered: boolean }>}
 */
export async function submitGameRequest(_payload) {
  return { delivered: false };
}
