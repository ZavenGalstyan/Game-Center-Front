/**
 * Shared helpers for the game comments section.
 */

export const COMMENT_MAX_LENGTH = 1000;
export const COMMENT_PAGE_SIZE = 10;

/**
 * Client-side pre-check mirroring the backend rules (the backend stays
 * authoritative). Length is counted in JavaScript characters, which is
 * never more lenient than the backend's own count.
 * Returns an error message, or null when the content can be sent.
 */
export function validateCommentContent(content) {
  if (!content.trim()) return "Write something before posting.";
  if (content.length > COMMENT_MAX_LENGTH) {
    return `Comments can be at most ${COMMENT_MAX_LENGTH} characters.`;
  }
  return null;
}

/* --------------------------------- Avatars -------------------------------- */

// Gradient pairs that sit well on the dark Game Center surfaces.
const AVATAR_GRADIENTS = [
  ["#00E88F", "#008F5A"],
  ["#20C4F0", "#1666B8"],
  ["#F5B942", "#D9762B"],
  ["#B57CFF", "#6A3FD1"],
  ["#FF7A9C", "#C2386A"],
  ["#4DE0C8", "#178F86"],
  ["#9BE15D", "#3E9B2F"],
  ["#FF9E5E", "#C9502E"],
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function avatarGradient(seed) {
  const [from, to] = AVATAR_GRADIENTS[hashString(seed || "") % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

/** "jane_doe" -> "JD", "Zaven" -> "ZA", "x" -> "X". */
export function initialsOf(username) {
  const name = String(username || "").trim();
  if (!name) return "?";
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? [parts[0], parts[1]].map((p) => Array.from(p)[0]) : Array.from(name).slice(0, 2);
  return letters.join("").toUpperCase();
}

/* ---------------------------------- Dates --------------------------------- */

const RELATIVE_UNITS = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

let relativeFormatter = null;
let absoluteFormatter = null;

export function formatRelativeTime(iso, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.round((time - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  relativeFormatter ??= new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeFormatter.format(Math.round(seconds / size), unit);
    }
  }
  return relativeFormatter.format(Math.round(seconds / 60), "minute");
}

export function formatAbsoluteTime(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  absoluteFormatter ??= new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return absoluteFormatter.format(date);
}

/* --------------------------------- Errors --------------------------------- */

/** Seconds until a RATE_LIMITED request may be retried (header, then message). */
export function retryAfterSeconds(err) {
  if (err?.retryAfter > 0) return err.retryAfter;
  const match = /(\d+)\s*seconds?/i.exec(err?.message || "");
  return match ? Number(match[1]) : 30;
}

/** First field-level validation message, if the backend sent one. */
export function fieldError(err) {
  return err?.errors?.find?.((e) => e.field === "content")?.message || err?.errors?.[0]?.message || null;
}

/** Generic, human-readable message for comment request failures. */
export function commentErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return null;
  if (err.status === 0) return "Can't reach the server. Check your connection and try again.";
  if (err.status === 400) return fieldError(err) || err.message || "That comment isn't valid.";
  if (err.status >= 500) return "The server had a problem. Please try again in a moment.";
  return err.message || fallback;
}
