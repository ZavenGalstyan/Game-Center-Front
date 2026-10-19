/**
 * Menu screens: main menu, mode select, how to play, rules (generated from
 * the active rules object), statistics, settings, match result and pause.
 */
import { makeCard, RA, RK, RQ, RJ } from "../engine/deck.js";
import { VARIANT_OPTIONS, PRESET_IDS, makeRules, strainsFor, NT, AT } from "../engine/rules.js";
import { THEMES, BACKS, LANGS, SPEEDS, TARGETS } from "../engine/save.js";
import { LANG_NAMES } from "../i18n.js";
import { CardFace, CardBackArt, EternityPath, PomegranatePath, STAR8, Suit } from "./art.jsx";
import { strainName } from "./Table.jsx";

function Ornament({ className = "" }) {
  return (
    <svg className={`ab-orn ${className}`} viewBox="0 0 240 24" aria-hidden="true">
      <path d="M0 12h92M148 12h92" stroke="var(--gold)" strokeWidth="1" />
      <path d="M96 12l6-6 6 6-6 6zM132 12l6-6 6 6-6 6z" fill="var(--gold)" opacity=".8" />
      <g transform="translate(120 12) scale(.9)"><path d={STAR8} fill="var(--gold)" /></g>
    </svg>
  );
}

function Screen({ title, onBack, t, children, wide = false }) {
  return (
    <div className={`ab-screen${wide ? " ab-screen--wide" : ""}`}>
      <div className="ab-screen__card">
        <header className="ab-screen__head">
          <button type="button" className="ab-btn ab-btn--ghost ab-btn--sm" onClick={onBack}>← {t("back")}</button>
          <h2>{title}</h2>
          <span />
        </header>
        <Ornament />
        <div className="ab-screen__body">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ main menu */

const HALO = (
  <svg className="ab-menu__halo" viewBox="-60 -60 120 120">
    <circle r="56" fill="none" stroke="var(--gold)" strokeWidth=".5" />
    <circle r="50" fill="none" stroke="var(--gold)" strokeWidth=".35" strokeDasharray="1 3" />
    <EternityPath r={44} fill="var(--gold)" />
  </svg>
);

export function MainMenu({ t, hasSave, saveInfo, note, onNav, onContinue }) {
  const fan = [makeCard(RJ, 3), makeCard(RQ, 0), makeCard(RK, 2), makeCard(RA, 0)];
  return (
    <div className="ab-menu">
      <div className="ab-menu__light" aria-hidden="true" />
      <div className="ab-menu__brand">
        <svg className="ab-menu__emblem" viewBox="-60 -60 120 120" aria-hidden="true">
          <circle r="56" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
          <circle r="50" fill="none" stroke="var(--gold)" strokeWidth=".6" strokeDasharray="1.5 3.5" />
          <EternityPath r={40} fill="var(--gold)" />
        </svg>
        <h1 className="ab-menu__title">{t("title")}</h1>
        <p className="ab-menu__sub">{t("subtitle")}</p>
        <Ornament />
        <p className="ab-menu__tag">{t("tagline")}</p>
        <nav className="ab-menu__nav">
          <button type="button" className="ab-btn ab-btn--gold ab-btn--lg" onClick={() => onNav("modes")}>{t("play")}</button>
          <button type="button" className="ab-btn ab-btn--lg" disabled={!hasSave} onClick={onContinue}>
            {t("continue")}
            <small>{hasSave ? saveInfo : t("noSave")}</small>
          </button>
          <div className="ab-menu__row">
            <button type="button" className="ab-btn" onClick={() => onNav("how")}>{t("howTo")}</button>
            <button type="button" className="ab-btn" onClick={() => onNav("rules")}>{t("rules")}</button>
          </div>
          <div className="ab-menu__row">
            <button type="button" className="ab-btn" onClick={() => onNav("stats")}>{t("statistics")}</button>
            <button type="button" className="ab-btn" onClick={() => onNav("settings")}>{t("settings")}</button>
          </div>
        </nav>
        {note && <p className="ab-note">{note}</p>}
        <p className="ab-menu__offline">{t("offline")}</p>
      </div>
      <div className="ab-menu__fan" aria-hidden="true">
        {HALO}
        {fan.map((c, i) => (
          <div key={c} className="ab-card ab-card--face ab-menu__fcard" style={{ "--i": i }}>
            <CardFace card={c} />
          </div>
        ))}

      </div>
    </div>
  );
}

/* ------------------------------------------------------------ mode select */

export function ModeSelect({ t, settings, rules, onStart, onBack, onSet, inProgress }) {
  const modes = [
    { id: "classic", title: t("modeClassic"), desc: t("modeClassicDesc"), target: rules.targets[settings.target] },
    { id: "quick", title: t("modeQuick"), desc: t("modeQuickDesc"), target: rules.targets.quick },
    { id: "practice", title: t("modePractice"), desc: t("modePracticeDesc"), target: rules.targets.quick },
  ];
  return (
    <Screen title={t("chooseMode")} onBack={onBack} t={t} wide>
      {inProgress && <p className="ab-note">{t("confirmNew")}</p>}
      <div className="ab-modes">
        {modes.map((md, i) => (
          <button key={md.id} type="button" className={`ab-mode ab-mode--${md.id}`} onClick={() => onStart(md.id)}>
            <span className="ab-mode__icon" aria-hidden="true">
              {i === 0 && <Suit suit={0} />}
              {i === 1 && <Suit suit={1} />}
              {i === 2 && <Suit suit={3} />}
            </span>
            <b>{md.title}</b>
            <span>{md.desc}</span>
            <em>{t("target")}: {md.target}</em>
          </button>
        ))}
      </div>
      <div className="ab-setrow ab-setrow--center">
        <span>{t("difficulty")}</span>
        <Seg value={settings.difficulty} options={["easy", "medium", "hard"]} label={(v) => t(v)} onChange={(v) => onSet("difficulty", v)} />
      </div>
      <div className="ab-setrow ab-setrow--center">
        <span>{t("matchTarget")}</span>
        <Seg value={settings.target} options={TARGETS} label={(v) => t(`target_${v}`, { n: rules.targets[v] })} onChange={(v) => onSet("target", v)} />
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ how to play */

export function HowToPlay({ t, onBack }) {
  return (
    <Screen title={t("howTo")} onBack={onBack} t={t} wide>
      <p className="ab-lead">{t("howIntro")}</p>
      <div className="ab-how">
        {[1, 2, 3, 4, 5, 6].map((k) => (
          <section key={k} className="ab-how__item">
            <h4>{t(`how${k}t`)}</h4>
            <p>{t(`how${k}`)}</p>
          </section>
        ))}
      </div>
      <div className="ab-how__cards" aria-hidden="true">
        {[makeCard(RJ, 0), makeCard(2, 0), makeCard(RA, 0), makeCard(3, 0), makeCard(RK, 0), makeCard(RQ, 0)].map((c) => (
          <div key={c} className="ab-card ab-card--face ab-how__card"><CardFace card={c} /></div>
        ))}
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ rules */

export function RulesScreen({ t, rules, onBack }) {
  const r = rules;
  const yes = (v) => t(v ? "on" : "off");
  const list = strainsFor(r).map((s) => strainName(s, t)).join(", ");
  const sections = [
    ["r_deal", [t("rd_deal1", { p: r.dealPattern.join("-") }), t("rd_deal2", { who: t(`val_${r.allPass}`) })]],
    ["r_auction", [
      t("rd_auc4"),
      t("rd_auc1", { min: r.minBid, max: r.maxBid, step: r.bidStep }),
      t("rd_auc2", { list }),
      r.allowContra ? t("rd_auc3", { c: r.contraMult, r: r.allowRecontra ? r.recontraMult : "—" }) : t("rd_auc3off"),
    ]],
    ["r_play", [
      t("rd_play1", { partner: r.overtrumpOnTrumpLead ? t("rd_play1p") : "" }),
      t("rd_play2"),
      t(r.partnerException ? "rd_play3on" : "rd_play3off"),
      t(r.undertrumpRequired ? "rd_play4on" : "rd_play4off"),
      t("rd_play5", { who: t(`val_${r.firstLead}`) }),
      t("how4"),
      ...(r.allowNoTrump || r.allowAllTrump ? [t("rd_play6")] : []),
    ]],
    ["r_decl", [
      t("rd_decl1", { a: r.seqValues[3], b: r.seqValues[4], c: r.seqValues[5], j: r.quadValues[4], n: r.quadValues[2], q: r.quadValues[7] }),
      t("rd_decl2", { tie: t(`val_${r.declTie}`) }),
    ]],
    ["r_belote", [t("rd_belote", { v: r.beloteValue, award: t(`val_${r.beloteAward}`) })]],
    ["r_scoring", [
      r.scoring === "points" ? t("rd_score_points", { h: r.handValue }) : t("rd_score_bazaar", { h: r.handValue, cap: r.capotValue, k: r.kaputBid }),
      t("rd_score2", { beat: r.mustBeatDefenders ? t("rd_score2b") : "" }),
      t("rd_score3", { f: t(`val_${r.failedDecl}`) }),
    ]],
    ["r_match", [t("rd_match", { q: r.targets.quick, s: r.targets.standard, l: r.targets.long })]],
  ];
  return (
    <Screen title={`${t("rules")} — ${t(`preset_${r.id}`)}`} onBack={onBack} t={t} wide>
      <p className="ab-lead">{t("rulesIntro")}</p>
      <div className="ab-rules">
        {sections.map(([k, items]) => (
          <section key={k} className="ab-rules__sec">
            <h4>{t(k)}</h4>
            <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="ab-dim ab-small">{t("variations")}: {Object.keys(VARIANT_OPTIONS).map((k) => `${t(`opt_${k}`)} — ${typeof r[k] === "boolean" ? yes(r[k]) : t(`val_${r[k]}`)}`).join(" · ")}</p>
    </Screen>
  );
}

/* ------------------------------------------------------------ statistics */

export function StatsScreen({ t, stats, onBack, onReset }) {
  const rate = stats.matchesPlayed ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0;
  const tiles = [
    ["statsMatches", stats.matchesPlayed], ["statsWon", stats.matchesWon], ["statsLost", stats.matchesLost], ["statsWinRate", `${rate}%`],
    ["statsHands", stats.handsPlayed], ["statsTricks", stats.tricksWon], ["statsMyTricks", stats.myTricks], ["statsContractsWon", stats.contractsWon],
    ["statsContractsFailed", stats.contractsFailed], ["statsHighest", stats.highestScore], ["statsStreak", stats.bestStreak],
  ];
  return (
    <Screen title={t("statistics")} onBack={onBack} t={t} wide>
      <div className="ab-stats">
        {tiles.map(([k, v]) => (
          <div key={k} className="ab-stat">
            <b>{v}</b>
            <span>{t(k)}</span>
          </div>
        ))}
      </div>
      <div className="ab-setrow ab-setrow--center">
        <button type="button" className="ab-btn ab-btn--sm ab-btn--red" onClick={onReset}>{t("resetStats")}</button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ settings */

function Seg({ value, options, label, onChange }) {
  return (
    <span className="ab-seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={value === o} className={value === o ? "is-on" : ""} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </span>
  );
}

export function SettingsScreen({ t, settings, onSet, onBack, inMatch }) {
  const rules = makeRules(settings.preset, settings.variants);
  const setVariant = (k, v) => onSet("variants", { ...settings.variants, [k]: v });
  return (
    <Screen title={t("settings")} onBack={onBack} t={t} wide>
      <div className="ab-settings">
        <section>
          <div className="ab-setrow"><span>{t("language")}</span><Seg value={settings.lang} options={LANGS} label={(v) => LANG_NAMES[v]} onChange={(v) => onSet("lang", v)} /></div>
          <div className="ab-setrow"><span>{t("difficulty")}</span><Seg value={settings.difficulty} options={["easy", "medium", "hard"]} label={(v) => t(v)} onChange={(v) => onSet("difficulty", v)} /></div>
          <div className="ab-setrow"><span>{t("animSpeed")}</span><Seg value={settings.speed} options={SPEEDS} label={(v) => t(v)} onChange={(v) => onSet("speed", v)} /></div>
          <div className="ab-setrow">
            <span>{t("volume")}</span>
            <input type="range" min="0" max="100" value={Math.round(settings.volume * 100)} onChange={(e) => onSet("volume", +e.target.value / 100)} aria-label={t("volume")} />
          </div>
          <div className="ab-setrow"><span>{t("ambience")}</span><Seg value={settings.ambience} options={[true, false]} label={(v) => t(v ? "on" : "off")} onChange={(v) => onSet("ambience", v)} /></div>
          <div className="ab-setrow"><span>{t("reducedMotion")}</span><Seg value={settings.reducedMotion} options={[true, false]} label={(v) => t(v ? "on" : "off")} onChange={(v) => onSet("reducedMotion", v)} /></div>
          <div className="ab-setrow"><span>{t("hints")}</span><Seg value={settings.hints} options={[true, false]} label={(v) => t(v ? "on" : "off")} onChange={(v) => onSet("hints", v)} /></div>
          <div className="ab-setrow"><span>{t("matchTarget")}</span><Seg value={settings.target} options={TARGETS} label={(v) => t(`target_${v}`, { n: rules.targets[v] })} onChange={(v) => onSet("target", v)} /></div>
        </section>
        <section>
          <h4>{t("cardBack")}</h4>
          <div className="ab-picks">
            {BACKS.map((b) => (
              <button key={b} type="button" className={`ab-pick${settings.back === b ? " is-on" : ""}`} onClick={() => onSet("back", b)} aria-pressed={settings.back === b}>
                <span className="ab-card ab-card--back ab-pick__card"><CardBackArt back={b} /></span>
                <small>{t(`back_${b}`)}</small>
              </button>
            ))}
          </div>
          <h4>{t("tableTheme")}</h4>
          <div className="ab-picks">
            {THEMES.map((th) => (
              <button key={th} type="button" className={`ab-pick${settings.theme === th ? " is-on" : ""}`} onClick={() => onSet("theme", th)} aria-pressed={settings.theme === th}>
                <span className="ab-swatch" data-swatch={th}><i /></span>
                <small>{t(`theme_${th}`)}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="ab-settings__rules">
          <h4>{t("rulesPreset")}</h4>
          <Seg value={settings.preset} options={PRESET_IDS} label={(v) => t(`preset_${v}`)} onChange={(v) => onSet("preset", v)} />
          <h4>{t("variations")}</h4>
          {inMatch && <p className="ab-note ab-small">{t("rulesLocked")}</p>}
          <div className="ab-settings__vars">
            {Object.entries(VARIANT_OPTIONS).map(([k, opts]) => (
              <div key={k} className="ab-setrow ab-setrow--rule">
                <span>{t(`opt_${k}`)}</span>
                <Seg value={rules[k]} options={opts} label={(v) => (typeof v === "boolean" ? t(v ? "on" : "off") : t(`val_${v}`))} onChange={(v) => setVariant(k, v)} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ match result */

export function MatchResult({ t, m, onAgain, onMenu }) {
  const won = m.over.winner === 0;
  return (
    <div className="ab-overlay">
      <div className={`ab-victory ${won ? "is-won" : "is-lost"}`} role="dialog" aria-label={won ? t("victory") : t("defeat")}>
        <svg className="ab-victory__emblem" viewBox="-60 -60 120 120" aria-hidden="true">
          <circle r="56" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
          {won ? <EternityPath r={42} fill="var(--gold)" /> : <g transform="scale(.9)"><PomegranatePath fill="var(--gold)" seed="var(--burgundy)" leaf="var(--gold-dk)" /></g>}
        </svg>
        <h2>{won ? t("victory") : t("defeat")}</h2>
        <p>{won ? t("victoryText") : t("defeatText")}</p>
        <Ornament />
        <div className="ab-victory__score">
          <div className="ab-team--a"><i className="ab-teamdot" /><span>{t("teamAFull")}</span><b>{m.scores[0]}</b></div>
          <div className="ab-team--b"><i className="ab-teamdot" /><span>{t("teamBFull")}</span><b>{m.scores[1]}</b></div>
        </div>
        <p className="ab-dim ab-small">{t("finalScore")} · {t("target")} {m.target} · {t("handNo", { n: m.handNo })}</p>
        <div className="ab-victory__btns">
          <button type="button" className="ab-btn ab-btn--gold" onClick={onAgain} autoFocus>{t("playAgain")}</button>
          <button type="button" className="ab-btn" onClick={onMenu}>{t("mainMenu")}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pause */

export function PauseMenu({ t, onResume, onRules, onRestart, onMenu, onLeave }) {
  return (
    <div className="ab-overlay">
      <div className="ab-pause" role="dialog" aria-label={t("paused")}>
        <h2>{t("paused")}</h2>
        <Ornament />
        <button type="button" className="ab-btn ab-btn--gold" onClick={onResume} autoFocus>{t("resume")}</button>
        <button type="button" className="ab-btn" onClick={onRules}>{t("rules")}</button>
        <button type="button" className="ab-btn" onClick={onRestart}>{t("restartMatch")}</button>
        <button type="button" className="ab-btn" onClick={onMenu}>{t("mainMenu")} <small>{t("matchSaved")}</small></button>
        <button type="button" className="ab-btn ab-btn--red" onClick={onLeave}>{t("leaveMatch")}</button>
      </div>
    </div>
  );
}

export { NT, AT };
