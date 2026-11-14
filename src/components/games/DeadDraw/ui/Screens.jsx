/** Menus and story panels. All text is plain English literals (translated by the Game Center runtime). */
import { CARDS } from "../engine/cards.js";
import { dayOf, DAY_COUNT, ENDINGS, DEATHS } from "../engine/days.js";
import { choiceState, nightForecast } from "../engine/game.js";
import { totalDefense } from "../engine/rules.js";
import { CostChips } from "./Card.jsx";
import { FxChips } from "./Hud.jsx";
import { Icon } from "./Icons.jsx";

export function Loading({ p }) {
  return (
    <div className="dds-loading">
      <div className="dds-logo small">
        <span>Dead Draw</span>
        <i>Survival Bunker</i>
      </div>
      <div className="dds-bar">
        <i style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <p>Sealing the bunker…</p>
    </div>
  );
}

export function MainMenu({ canContinue, saveDay, onNew, onContinue, onHelp, onSettings, best }) {
  return (
    <div className="dds-menu">
      <div className="dds-logo">
        <span>Dead Draw</span>
        <i>Survival Bunker</i>
      </div>
      <p className="dds-tag">Every Card Is a Choice. Every Choice Could Be Your Last.</p>
      <div className="dds-menu-btns">
        {canContinue && (
          <button type="button" className="dds-btn primary" onClick={onContinue}>
            <span>Continue</span>
            <small>Day {saveDay}</small>
          </button>
        )}
        <button type="button" className={`dds-btn ${canContinue ? "" : "primary"}`} onClick={onNew}>
          New Game
        </button>
        <button type="button" className="dds-btn" onClick={onHelp}>
          How to Play
        </button>
        <button type="button" className="dds-btn" onClick={onSettings}>
          Settings
        </button>
      </div>
      {best > 0 && <p className="dds-best">Times rescued: {best}</p>}
    </div>
  );
}

export function ConfirmNew({ onYes, onNo }) {
  return (
    <div className="dds-modal">
      <div className="dds-panel narrow">
        <h2>Start a new game?</h2>
        <p>Your current survival run will be lost.</p>
        <div className="dds-row">
          <button type="button" className="dds-btn primary" onClick={onYes}>
            Start over
          </button>
          <button type="button" className="dds-btn" onClick={onNo}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const RULES = [
  ["moon", "Survive 15 days", "Each day you draw 3 cards and may play up to 2 of them. Then the day's event strikes, and night falls. Survive day 15 to reach the rescue."],
  ["hp", "Health is your life", "You start with 100 Health. At 0, the game is over. Wounds, hunger, thirst, sickness and night attacks all cost Health."],
  ["food", "Daily rations", "Every morning you eat 1 Food, drink 1 Water and the bunker burns 1 Power. If you can't pay, you lose Health instead. Well fed and watered, you recover a little."],
  ["power", "Power and Scrap", "Power runs lights, cameras and machines. Scrap repairs and reinforces. Many cards cost one or the other; a card you can't afford can't be played."],
  ["defense", "Nights", "Each night the danger tests your Defense. Defense comes from cards played today, permanent Fortification and allies. If the danger is stronger, you get hurt."],
  ["threat", "Danger", "Noise and risky choices raise Danger, which makes every night worse. Sealing, silence and caution lower it."],
  ["risk", "Risk cards", "Exploration and Risk cards can pay off hugely — or hurt you. The risk gauge on each card tells you how dangerous it is."],
  ["radio", "Your choices matter", "Every event's decision is remembered. Who you let in, what you seal, and whether you answer the radio decide how — and if — you get out."],
];

export function Help({ onClose }) {
  return (
    <div className="dds-modal">
      <div className="dds-panel wide">
        <h2>How to Play</h2>
        <div className="dds-rules">
          {RULES.map(([ico, h, p]) => (
            <div key={h} className="dds-rule">
              <Icon name={ico} />
              <div>
                <b>{h}</b>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="dds-keys">Mouse: look around · Click a card to select it, click again to play · Keys 1–3 select · Enter confirms · Esc pauses</p>
        <button type="button" className="dds-btn primary" onClick={onClose}>
          Understood
        </button>
      </div>
    </div>
  );
}

export function Settings({ settings, set, onClose, qualityNow }) {
  const Q = [
    ["auto", "Auto"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
  ];
  return (
    <div className="dds-modal">
      <div className="dds-panel">
        <h2>Settings</h2>
        <div className="dds-set">
          <label>Graphics</label>
          <div className="dds-seg">
            {Q.map(([k, label]) => (
              <button type="button" key={k} className={settings.quality === k ? "on" : ""} onClick={() => set("quality", k)}>
                {label}
              </button>
            ))}
          </div>
          {settings.quality === "auto" && qualityNow && <small className="dds-note">Currently: {{ high: "High", medium: "Medium", low: "Low" }[qualityNow]}</small>}
        </div>
        <div className="dds-set">
          <label>Volume</label>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => set("volume", +e.target.value)} aria-label="Volume" />
        </div>
        <div className="dds-set">
          <label>Brightness</label>
          <input type="range" min="0.7" max="1.5" step="0.05" value={settings.brightness} onChange={(e) => set("brightness", +e.target.value)} aria-label="Brightness" />
        </div>
        <div className="dds-set">
          <label>Camera motion</label>
          <div className="dds-seg">
            <button type="button" className={settings.shake ? "on" : ""} onClick={() => set("shake", true)}>
              On
            </button>
            <button type="button" className={!settings.shake ? "on" : ""} onClick={() => set("shake", false)}>
              Off
            </button>
          </div>
        </div>
        <button type="button" className="dds-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export function Pause({ onResume, onHelp, onSettings, onMenu }) {
  return (
    <div className="dds-modal">
      <div className="dds-panel narrow">
        <h2>Paused</h2>
        <div className="dds-menu-btns">
          <button type="button" className="dds-btn primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="dds-btn" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="dds-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="dds-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
        <small className="dds-note">Your progress is saved automatically.</small>
      </div>
    </div>
  );
}

const NOTE = {
  starving: ["food", "Not enough food. You go hungry.", "bad"],
  thirsty: ["water", "No water left. Your throat burns.", "bad"],
  dark: ["power", "The batteries are dead. Cold and darkness creep in.", "bad"],
  sick: ["sick", "The sickness drains you.", "bad"],
  generator: ["gen", "The broken generator burns extra Power.", "bad"],
  contaminated: ["toxic", "The water supply is still contaminated.", "bad"],
  rested: ["hp", "Fed and watered, you recover a little.", "good"],
};

export function Dawn({ S, onDraw, tutorial }) {
  const D = dayOf(S.day);
  const R = S.report || { fx: {}, notes: [], unlocked: [] };
  return (
    <div className="dds-dawn">
      <div className="dds-daycard">
        <span className="dds-daycard-n">Day {S.day}</span>
        <h1>{D.title}</h1>
        <p className="dds-daycard-obj">
          <b>Objective</b> {D.objective}
        </p>
        {S.day > 1 && (
          <div className="dds-report">
            <h3>Morning report</h3>
            <FxChips fx={R.fx} />
            {R.notes.map((n) => (
              <p key={n} className={`dds-note-line ${NOTE[n][2]}`}>
                <Icon name={NOTE[n][0]} />
                {NOTE[n][1]}
              </p>
            ))}
            {R.unlocked.length > 0 && (
              <div className="dds-unlock">
                <b>New cards in your deck</b>
                <span>
                  {R.unlocked.map((id) => (
                    <em key={id}>{CARDS[id].name}</em>
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
        {tutorial && (
          <div className="dds-tut">
            <p>You will draw 3 survival cards. Play up to 2 of them: each costs resources shown in its top corner and takes effect at once.</p>
            <p>After your actions, the day's event strikes. Then night falls, and your Defense decides how bad it gets.</p>
          </div>
        )}
        <button type="button" className="dds-btn primary big" onClick={onDraw}>
          Draw cards
        </button>
      </div>
    </div>
  );
}

export function EventPanel({ S, onChoose, revealed }) {
  const D = dayOf(S.day);
  return (
    <div className={`dds-event ${revealed ? "in" : ""}`}>
      <div className="dds-panel event">
        <span className="dds-event-tag">Day {S.day} · Event</span>
        <h2>{D.title}</h2>
        <p className="dds-event-text">{D.intro}</p>
        {S.eventPre && Object.keys(S.eventPre).length > 0 && <FxChips fx={S.eventPre} />}
        <div className="dds-choices">
          {D.choices.map((c, i) => {
            const st = choiceState(S, c);
            return (
              <button type="button" key={c.id} className={`dds-choice ${st.ok ? "" : "off"}`} disabled={!st.ok} onClick={() => onChoose(c.id)}>
                <span className="dds-choice-k">{i + 1}</span>
                <span className="dds-choice-b">
                  <b>{c.label}</b>
                  <small>{c.desc}</small>
                  {!st.ok && st.why !== "cost" && <em className="dds-req">{st.why}</em>}
                  {!st.ok && st.why === "cost" && <em className="dds-req">Not enough resources</em>}
                </span>
                {c.cost && (
                  <span className="dds-choice-cost">
                    <CostChips cost={c.cost} have={S.res} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Outcome({ title, text, tone, fx, onNext, nextLabel }) {
  return (
    <div className="dds-event in">
      <div className={`dds-panel outcome tone-${tone}`}>
        {title && <span className="dds-event-tag">{title}</span>}
        <p className="dds-event-text">{text}</p>
        <FxChips fx={fx} big />
        <button type="button" className="dds-btn primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

export function NightForecast({ S }) {
  const f = nightForecast(S);
  const bad = f.pressure > f.defense;
  return (
    <div className={`dds-forecast ${bad ? "bad" : "ok"}`}>
      <span>
        <Icon name="threat" />
        Tonight&apos;s danger <b>{f.pressure}</b>
      </span>
      <span>
        <Icon name="defense" />
        Your defense <b>{totalDefense(S)}</b>
      </span>
    </div>
  );
}

export function Night({ S, onNext }) {
  const N = S.night;
  const title = { quiet: "A quiet night", held: "The defenses held", breach: "Something got in" }[N.kind];
  return (
    <div className="dds-event in">
      <div className={`dds-panel outcome tone-${N.kind === "breach" ? "bad" : "calm"}`}>
        <span className="dds-event-tag">Night {S.day}</span>
        <h2>{title}</h2>
        <p className="dds-event-text">{N.text}</p>
        <div className="dds-forecast inline">
          <span>
            <Icon name="threat" />
            Danger <b>{N.pressure}</b>
          </span>
          <span>
            <Icon name="defense" />
            Defense <b>{N.defense}</b>
          </span>
        </div>
        <FxChips fx={N.fx} big />
        <button type="button" className="dds-btn primary" onClick={onNext}>
          {S.day + 1 >= DAY_COUNT ? "Face the last day" : "Next day"}
        </button>
      </div>
    </div>
  );
}

export function GameOver({ S, deathKey, onRetry, onRestartDay, onMenu }) {
  return (
    <div className="dds-end dead">
      <div className="dds-panel end">
        <span className="dds-event-tag">Game Over</span>
        <h1>You did not survive</h1>
        <p className="dds-event-text">{DEATHS[deathKey]}</p>
        <Stats S={S} />
        <div className="dds-row">
          <button type="button" className="dds-btn primary" onClick={onRestartDay}>
            Retry day {S.day}
          </button>
          <button type="button" className="dds-btn" onClick={onRetry}>
            New Game
          </button>
          <button type="button" className="dds-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Stats({ S }) {
  return (
    <div className="dds-stats">
      <span>
        <b>{S.phase === "won" ? DAY_COUNT : S.day - 1}</b>
        Days survived
      </span>
      <span>
        <b>{S.stats.cards}</b>
        Cards played
      </span>
      <span>
        <b>{S.stats.damage}</b>
        Damage taken
      </span>
      <span>
        <b>{S.stats.breaches}</b>
        Night breaches
      </span>
    </div>
  );
}

const DECISION_TEXT = {
  1: { seal: "Welded the blast door shut", auto: "Trusted the automatic lock" },
  3: { open: "Let Mara in", intercom: "Spoke to Mara through the intercom", silent: "Ignored the knocking" },
  5: { seal: "Sealed the vent", bait: "Trapped the thing in the walls", ignore: "Ignored the scratching" },
  7: { answer: "Answered the radio", listen: "Listened to the radio", off: "Switched the radio off" },
  10: { explore: "Explored Sector C", weld: "Welded Sector C shut", leave: "Left Sector C open" },
  13: { fight: "Fought the creature", flee: "Hid from the creature", lure: "Trapped the creature" },
};

export function Ending({ S, onMenu, onNew }) {
  const E = ENDINGS[S.ending] || ENDINGS.rescued;
  return (
    <div className="dds-end won">
      <div className="dds-panel end">
        <span className="dds-event-tag">Survived 15 days</span>
        <h1>{E.title}</h1>
        <p className="dds-event-text">{E.text}</p>
        <Stats S={S} />
        <div className="dds-decisions">
          <h3>Your choices</h3>
          {Object.entries(DECISION_TEXT).map(([d, m]) => (S.decisions[d] && m[S.decisions[d]] ? <p key={d}>{m[S.decisions[d]]}</p> : null))}
        </div>
        <div className="dds-row">
          <button type="button" className="dds-btn primary" onClick={onNew}>
            New Game
          </button>
          <button type="button" className="dds-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
