import ru from "./locales/ru.json";
import en from "./locales/en.json";

/**
 * Frontend-only localisation for the Game Center (English + Russian).
 *
 * Keys are the English source strings themselves (gettext style): a missing
 * Russian entry falls back to readable English instead of a raw key, and the
 * components stay readable. `en.json` only holds what English can't express
 * through the key alone (plural forms).
 *
 * The current language lives in a tiny external store so both React
 * (`useTranslation`, via useSyncExternalStore) and plain modules (`t`) read
 * the same value. It is persisted in localStorage, so it survives reloads and
 * route changes, and mirrored onto <html lang> for screen readers / fonts.
 *
 * Interpolation: "Hi, {name}" + { name: "Zav" }.
 * Plurals: a catalog value may be { one, few, many, other }; pass `count`.
 */

export const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "ru", label: "Русский", short: "RU" },
];

const CATALOGS = { en, ru };
const STORAGE_KEY = "gc-lang";
const DEFAULT_LANG = "en";

const isSupported = (code) => LANGUAGES.some((l) => l.code === code);

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch {
    /* storage blocked — fall through */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return nav.toLowerCase().startsWith("ru") ? "ru" : DEFAULT_LANG;
}

let currentLang = readInitialLang();
const listeners = new Set();

function applyDocumentLang(lang) {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}
applyDocumentLang(currentLang);

export function getLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  if (!isSupported(lang) || lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* non-persistent session is fine */
  }
  applyDocumentLang(lang);
  listeners.forEach((fn) => fn(lang));
}

export function subscribeLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const pluralRules = {};
function pluralForm(lang, count) {
  pluralRules[lang] ??= new Intl.PluralRules(lang);
  return pluralRules[lang].select(count);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m,
  );
}

/** Translate `key` into `lang` (defaults to the current language). */
export function translate(key, vars, lang = currentLang) {
  if (key === undefined || key === null) return "";
  const k = String(key);
  let entry = CATALOGS[lang]?.[k];
  if (entry === undefined && lang !== "en") entry = CATALOGS.en[k];
  if (entry && typeof entry === "object") {
    const count = Number(vars?.count ?? 0);
    entry = entry[pluralForm(lang, count)] ?? entry.other ?? entry.many ?? k;
  }
  return interpolate(typeof entry === "string" ? entry : k, vars);
}

/** Plain-module shorthand (non-React code: api errors, validators). */
export const t = (key, vars) => translate(key, vars);

/** Locale tag for Intl date/number formatting. */
export function getLocaleTag(lang = currentLang) {
  return lang === "ru" ? "ru-RU" : "en-US";
}
