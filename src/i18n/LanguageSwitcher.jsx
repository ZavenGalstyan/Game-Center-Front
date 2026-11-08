import { LANGUAGES } from "./i18n.js";
import { useTranslation } from "./useTranslation.js";

/** Inline SVG flags — emoji flags don't render on Windows. */
function FlagRU() {
  return (
    <svg viewBox="0 0 9 6" aria-hidden="true" focusable="false">
      <rect width="9" height="2" y="0" fill="#fff" />
      <rect width="9" height="2" y="2" fill="#0039a6" />
      <rect width="9" height="2" y="4" fill="#d52b1e" />
    </svg>
  );
}

function FlagUS() {
  const stripes = [];
  for (let i = 0; i < 13; i++) {
    stripes.push(<rect key={i} y={i * 10} width="190" height="10" fill={i % 2 ? "#fff" : "#b22234"} />);
  }
  const stars = [];
  for (let r = 0; r < 9; r++) {
    const cols = r % 2 ? 5 : 6;
    for (let c = 0; c < cols; c++) {
      stars.push(<circle key={`${r}-${c}`} cx={(r % 2 ? 12.7 : 6.3) + c * 12.7} cy={5.4 + r * 5.4} r="2" fill="#fff" />);
    }
  }
  return (
    <svg viewBox="0 0 190 130" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      {stripes}
      <rect width="76" height="70" fill="#3c3b6e" />
      {stars}
    </svg>
  );
}

const FLAGS = { ru: FlagRU, en: FlagUS };

/**
 * Two flag buttons in the header (USA = English, Russia = Russian). The active
 * language is pressed; the choice is persisted by the i18n store.
 */
export default function LanguageSwitcher() {
  const { t, lang, setLanguage } = useTranslation();
  return (
    <div className="lang-switch" role="group" aria-label={t("Language")}>
      {LANGUAGES.map(({ code, label }) => {
        const Flag = FLAGS[code];
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            className={`lang-switch__btn${active ? " is-active" : ""}`}
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            lang={code}
          >
            <span className="lang-switch__flag">
              <Flag />
            </span>
          </button>
        );
      })}
    </div>
  );
}
