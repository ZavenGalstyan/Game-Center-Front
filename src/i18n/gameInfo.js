import { getLanguage } from "./i18n.js";
import ru from "./locales/gameInfo.ru.json";

/**
 * Display title and description of a backend game. Both are stored in English
 * on the backend, keyed here by the English name; `game.name` itself stays the
 * game's identity (registry, artwork), so only display code goes through these.
 * A game added on the backend without a translation shows its English text.
 */
function russianInfo(game, lang) {
  return lang === "ru" ? ru[game?.name] : undefined;
}

export function gameTitle(game, lang = getLanguage()) {
  return russianInfo(game, lang)?.name ?? game?.name ?? "";
}

export function gameDescription(game, lang = getLanguage()) {
  return russianInfo(game, lang)?.description ?? game?.description ?? "";
}
