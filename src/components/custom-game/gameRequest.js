// Custom game request — validation, payload shape, submission and error
// mapping for POST /api/game-requests.

import { api } from "../../lib/api.js";
import { mapServerErrors, validateEmail } from "../../lib/validation.js";
import { t } from "../../i18n/i18n.js";

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 2000;

/** Backend rate limit: submissions per user per window. */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MIN = 15;

export const EMPTY_REQUEST = Object.freeze({
  firstName: "",
  lastName: "",
  email: "",
  description: "",
});

const FIELDS = Object.keys(EMPTY_REQUEST);

function validateName(value, label) {
  const v = (value || "").trim();
  if (!v) return t("{label} is required", { label: t(label) });
  if (v.length < NAME_MIN) return t("{label} must be at least {count} characters", { label: t(label), count: NAME_MIN });
  if (v.length > NAME_MAX) return t("{label} must be {count} characters or fewer", { label: t(label), count: NAME_MAX });
  return null;
}

function validateRequestEmail(value) {
  const base = validateEmail(value);
  if (base) return base;
  if ((value || "").trim().length > EMAIL_MAX)
    return t("Email must be {count} characters or fewer", { count: EMAIL_MAX });
  return null;
}

function validateDescription(value) {
  const v = (value || "").trim();
  if (!v) return "Please describe your game idea";
  if (v.length < DESCRIPTION_MIN) {
    const missing = DESCRIPTION_MIN - v.length;
    return t("Add a little more detail — {count} more characters needed", { count: missing });
  }
  if (v.length > DESCRIPTION_MAX)
    return t("Description must be {count} characters or fewer", { count: DESCRIPTION_MAX });
  return null;
}

/** Per-field validators, keyed like the payload. Return an error string or null. */
export const requestValidators = {
  firstName: (v) => validateName(v, "First name"),
  lastName: (v) => validateName(v, "Last name"),
  email: validateRequestEmail,
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
 * The exact body POST /api/game-requests receives.
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
 * Sends the request to the backend. Resolves only on a confirmed HTTP 201;
 * anything else rejects with the request() error shape.
 */
export function submitGameRequest(payload) {
  return api.createGameRequest(payload);
}

function waitText(seconds) {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return t("{count} seconds", { count: seconds });
  const minutes = Math.ceil(seconds / 60);
  return t("{count} minutes", { count: minutes });
}

/**
 * Turns a failed submission (request() error shape) into what the form shows:
 * `fieldErrors` for inputs the backend rejected, `message` for the banner.
 * 401 is handled by the caller (session expiry) before this is used.
 * @returns {{ fieldErrors: Record<string, string>, message: string | null }}
 */
export function describeSubmitError(err) {
  const status = err?.status;

  if (status === 400) {
    const mapped = mapServerErrors(err.errors);
    const fieldErrors = {};
    for (const field of FIELDS) if (mapped[field]) fieldErrors[field] = mapped[field];
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      fieldErrors,
      message: hasFields
        ? "Please fix the highlighted fields and try again."
        : err.message || "Some details could not be accepted. Please review the form.",
    };
  }
  if (status === 429) {
    const wait = waitText(err.retryAfter);
    return {
      fieldErrors: {},
      message:
        t("You've reached the limit of {max} requests per {minutes} minutes.", { max: RATE_LIMIT_MAX, minutes: RATE_LIMIT_WINDOW_MIN }) +
        " " +
        (wait ? t("Please try again in {wait}.", { wait }) : t("Please try again a little later.")),
    };
  }
  if (status === 0) {
    return {
      fieldErrors: {},
      message: "We couldn't reach the server. Check your connection and try again.",
    };
  }
  if (status >= 500) {
    return {
      fieldErrors: {},
      message: "Our server ran into a problem. Your details are still here — please try again shortly.",
    };
  }
  if (status === 403) {
    return {
      fieldErrors: {},
      message: "Your account isn't allowed to send game requests right now.",
    };
  }
  return {
    fieldErrors: {},
    message: err?.message && err.message !== "Request failed"
      ? err.message
      : "Something went wrong while sending your request. Please try again.",
  };
}
