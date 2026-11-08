import { useCallback, useSyncExternalStore } from "react";
import { getLanguage, getLocaleTag, setLanguage, subscribeLanguage, translate } from "./i18n.js";

/**
 * React binding for the i18n store. Every component that calls this
 * re-renders when the language changes, so switching the flag updates the
 * whole visible UI in place — no reload, and the choice carries across pages.
 *
 *   const { t, lang, setLanguage } = useTranslation();
 *   t("Log in"); t("Hi, {name}", { name });
 *
 * `tn` is for shared UI primitives that receive their text as props: it
 * translates a plain string and passes any other React node through as-is,
 * so <EmptyState title="No games yet" /> and <EmptyState title={<b>…</b>} />
 * both work.
 */
export function useTranslation() {
  const lang = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  const tr = useCallback((key, vars) => translate(key, vars, lang), [lang]);
  const tn = useCallback(
    (node, vars) => (typeof node === "string" ? translate(node, vars, lang) : node),
    [lang],
  );
  return { t: tr, tn, lang, locale: getLocaleTag(lang), setLanguage };
}
