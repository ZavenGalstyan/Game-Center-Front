/**
 * Menus and full screens: loading, main menu, frontier map, stage briefing,
 * intro captions, stage results, the champion ending, pause, how-to-play and
 * settings. Pure presentation — the parent owns every state change.
 */
import { useState } from "react";
import { Card, Portrait, Icon, fmt } from "./bits.jsx";
import { STAGES, STAGE_COUNT, titleFor, blindLevels } from "../engine/stages.js";
import { RIVALS, ARCHETYPES } from "../engine/rivals.js";
import { parseCards } from "../engine/poker.js";

export function Loading({ p, text }) {
  return (
    <div className="wws-loading">
      <div className="wws-loading__badge">{Icon.star}</div>
      <div className="wws-loading__title">Wild West: Card Showdown</div>
      <div className="wws-loading__bar">
        <span style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      <div className="wws-loading__txt">{text || "Riding into town…"}</div>
    </div>
  );
}

export function MainMenu({ progress, completed, onPlay, onContinue, onNew, onMap, onHelp, onSettings, lang }) {
  const canContinue = !!progress.current;
  return (
    <div className="wws-menu">
      <div className="wws-menu__brand">
        <div className="wws-menu__kicker">A 3D Western Card Tournament</div>
        <h1 className="wws-menu__title">
          <span>Wild West</span>
          <small>Card Showdown</small>
        </h1>
        <div className="wws-menu__tag">Play Your Hand. Rule the Wild West.</div>
      </div>
      <div className="wws-menu__buttons">
        <button type="button" className="wws-btn wws-btn--big wws-btn--gold" onClick={onPlay}>
          {completed === 0 && !canContinue ? "Play" : completed >= STAGE_COUNT ? "Play again" : "Play"}
        </button>
        <button type="button" className="wws-btn wws-btn--big" disabled={!canContinue} onClick={onContinue}>
          Continue
        </button>
        {(completed > 0 || canContinue) && (
          <button type="button" className="wws-btn wws-btn--big" onClick={onNew}>
            New Game
          </button>
        )}
        <button type="button" className="wws-btn wws-btn--big" onClick={onMap}>
          Tournament Map
        </button>
        <button type="button" className="wws-btn wws-btn--big" onClick={onHelp}>
          How to Play
        </button>
        <button type="button" className="wws-btn wws-btn--big" onClick={onSettings}>
          Settings
        </button>
      </div>
      <div className="wws-menu__stats">
        <span>{titleFor(completed)}</span>
        <span>{`Stages won: ${completed} / ${STAGE_COUNT}`}</span>
        <span>{`Winnings: ${fmt(progress.winnings, lang)} chips`}</span>
      </div>
      <div className="wws-menu__note">Fictional chips only — no real money, no purchases.</div>
    </div>
  );
}

/** The frontier map: towns along the trail from east to west. */
export function MapScreen({ progress, onPick, onBack, lang }) {
  const [hover, setHover] = useState(null);
  const pts = STAGES.map((s) => s.map.slice(0, 2));
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const sel = hover ?? Math.min(progress.unlocked, STAGE_COUNT);
  const st = STAGES[sel - 1];
  return (
    <div className="wws-map">
      <div className="wws-map__paper">
        <div className="wws-map__head">
          <h2>The Frontier Trail</h2>
          <span className="wws-map__sub">{`${Object.keys(progress.completed).length} of ${STAGE_COUNT} saloons conquered`}</span>
        </div>
        <svg className="wws-map__svg" viewBox="0 0 100 62" role="img" aria-label="Tournament map">
          <defs>
            <filter id="wws-rough">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
              <feDisplacementMap in="SourceGraphic" scale="0.6" />
            </filter>
          </defs>
          {/* terrain: mesas, river, desert dunes */}
          <path d="M0 52 Q20 46 34 54 T70 50 T100 55 L100 62 L0 62 Z" fill="#c9a36a" opacity="0.35" />
          <path d="M58 0 Q55 14 62 22 T60 40 Q58 50 66 62" stroke="#6f8aa0" strokeWidth="1.1" fill="none" opacity="0.55" />
          {[[18, 12], [30, 8], [74, 10], [86, 14], [10, 52], [46, 54]].map(([x, y], i) => (
            <path key={i} d={`M${x - 5} ${y + 3} L${x - 3} ${y - 1} L${x + 3} ${y - 1} L${x + 5} ${y + 3} Z`} fill="#a0623a" opacity="0.45" />
          ))}
          {[[40, 30], [24, 38], [80, 34], [64, 58], [6, 30]].map(([x, y], i) => (
            <g key={`c${i}`} stroke="#4f6a3a" strokeWidth="0.5" opacity="0.55">
              <path d={`M${x} ${y + 2} V${y - 2} M${x} ${y} H${x - 1} V${y - 1} M${x} ${y - 0.5} H${x + 1} V${y - 1.6}`} fill="none" />
            </g>
          ))}
          <path d={path} stroke="#6a3a1a" strokeWidth="0.55" strokeDasharray="1.2 1" fill="none" filter="url(#wws-rough)" />
          {STAGES.map((s, i) => {
            const [x, y] = s.map;
            const done = !!progress.completed[s.id];
            const open = s.id <= progress.unlocked;
            return (
              <g
                key={s.id}
                className={`wws-town${done ? " is-done" : ""}${open ? " is-open" : " is-locked"}${sel === s.id ? " is-sel" : ""}`}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => open && onPick(s.id)}
                role="button"
                tabIndex={open ? 0 : -1}
                aria-label={`${s.town}, ${s.saloon}`}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open && onPick(s.id)}
              >
                <circle cx={x} cy={y} r={s.id === 15 ? 2.6 : 2.1} />
                <text x={x} y={y + 0.9} textAnchor="middle" className="wws-town__n">
                  {s.id}
                </text>
                <text x={x} y={s.map[2] ? y + 4.6 : y - 3.1} textAnchor="middle" className="wws-town__name">
                  {s.town}
                </text>
                {i === 0 && <text x={x} y={y - 3.2} textAnchor="middle" className="wws-town__start">START</text>}
              </g>
            );
          })}
          <g opacity="0.7" transform="translate(92 6)">
            <circle r="3.4" fill="none" stroke="#6a3a1a" strokeWidth="0.3" />
            <path d="M0 -3 L0.8 0 L0 3 L-0.8 0 Z" fill="#6a3a1a" />
            <text y="-4" textAnchor="middle" className="wws-town__start">N</text>
          </g>
        </svg>
        <div className="wws-map__card">
          {st && (
            <>
              <div className="wws-map__stage">{`Stage ${st.id} · ${st.saloon}`}</div>
              <div className="wws-map__town">{st.town}</div>
              <div className="wws-map__rivals">
                {st.rivals.map((r) => (
                  <span key={r} className="wws-map__rival">
                    <Portrait rival={RIVALS[r]} size={34} />
                    <span>{RIVALS[r].name}</span>
                  </span>
                ))}
              </div>
              <div className="wws-map__meta">
                {progress.completed[st.id] ? <span className="wws-tag wws-tag--gold">Conquered</span> : st.id <= progress.unlocked ? <span className="wws-tag">Open</span> : <span className="wws-tag wws-tag--dim">{Icon.lock} Locked</span>}
                <span>{`Purse ${fmt(st.purse, lang)}`}</span>
              </div>
              <button type="button" className="wws-btn wws-btn--gold" disabled={st.id > progress.unlocked} onClick={() => onPick(st.id)}>
                {st.id > progress.unlocked ? "Win the previous stage to unlock" : "Ride to town"}
              </button>
            </>
          )}
        </div>
      </div>
      <button type="button" className="wws-btn wws-back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

export function Briefing({ stage, onStart, onBack, record, savedTown, lang }) {
  const lv = blindLevels(stage.bb);
  return (
    <div className="wws-modal">
      <div className="wws-panel wws-brief">
        <div className="wws-brief__kicker">{`Stage ${stage.id} of ${STAGE_COUNT}`}</div>
        <h2 className="wws-brief__title">{stage.town}</h2>
        <div className="wws-brief__saloon">{stage.saloon}</div>
        <p className="wws-brief__story">{stage.story}</p>
        <div className="wws-brief__goal">
          <span className="wws-brief__goalk">Objective</span>
          <span>{stage.goal}</span>
        </div>
        <div className="wws-brief__rivals">
          {stage.rivals.map((r) => {
            const rv = RIVALS[r];
            const a = ARCHETYPES[rv.archetype];
            return (
              <div key={r} className="wws-rival">
                <Portrait rival={rv} size={56} />
                <div>
                  <div className="wws-rival__name">{rv.name}</div>
                  <div className="wws-rival__nick">{rv.nick}</div>
                  <div className="wws-rival__arch">{a.label}</div>
                  <div className="wws-rival__blurb">{a.blurb}</div>
                </div>
              </div>
            );
          })}
        </div>
        <ul className="wws-brief__rules">
          <li>{`Everyone starts with ${fmt(stage.stack, lang)} chips.`}</li>
          <li>{`Blinds start at ${fmt(lv[0].sb, lang)}/${fmt(lv[0].bb, lang)} and rise every ${stage.handsPerLevel} hands.`}</li>
          <li>{`Win every chip at the table. If the sun sets after ${stage.sundown} hands, the biggest stack wins.`}</li>
          <li>Lose all your chips and the stage is lost — you can retry at any time.</li>
          <li>{`Purse: ${fmt(stage.purse, lang)} chips (difficulty: ${stage.diff === "easy" ? "easy" : stage.diff === "medium" ? "medium" : "hard"})`}</li>
        </ul>
        {savedTown && <div className="wws-brief__warn">{`Taking this seat abandons your unfinished tournament in ${savedTown}.`}</div>}
        {record && <div className="wws-brief__record">{`Best win: ${record.bestHands} hands · Won ${record.wins} times`}</div>}
        <div className="wws-row">
          <button type="button" className="wws-btn" onClick={onBack}>
            Back to map
          </button>
          <button type="button" className="wws-btn wws-btn--gold" onClick={onStart}>
            Take a seat
          </button>
        </div>
      </div>
    </div>
  );
}

export function IntroCaption({ rival, stage, onSkip }) {
  const rv = rival ? RIVALS[rival] : null;
  return (
    <div className="wws-intro">
      {!rv && (
        <div className="wws-intro__stage">
          <div className="wws-intro__kicker">{`Stage ${stage.id}`}</div>
          <div className="wws-intro__town">{stage.town}</div>
          <div className="wws-intro__saloon">{stage.saloon}</div>
        </div>
      )}
      {rv && (
        <div className="wws-intro__lower">
          <div className="wws-intro__name">{rv.name}</div>
          <div className="wws-intro__nick">{`${rv.nick} · ${ARCHETYPES[rv.archetype].label}`}</div>
          <div className="wws-intro__line">{`“${rv.line}”`}</div>
        </div>
      )}
      <button type="button" className="wws-btn wws-btn--small wws-intro__skip" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}

export function Result({ stage, match, progress, onNext, onRetry, onMap, onMenu, milestone, lang }) {
  const won = match.result.won;
  const reason = match.result.reason;
  const isFinal = stage.id === STAGE_COUNT;
  return (
    <div className="wws-modal">
      <div className={`wws-panel wws-result ${won ? "is-won" : "is-lost"}`}>
        <div className="wws-result__kicker">{won ? "Stage complete" : "Tournament defeat"}</div>
        <h2 className="wws-result__title">{won ? (isFinal ? "Grand Champion!" : `${stage.town} is yours`) : reason === "sundown" ? "The sun has set" : "Busted"}</h2>
        <p className="wws-result__text">
          {won
            ? reason === "sundown"
              ? `You held the biggest stack when the sun went down after ${match.handsPlayed} hands.`
              : `You took every chip at the ${stage.saloon} in ${match.handsPlayed} hands.`
            : reason === "sundown"
              ? `After ${match.handsPlayed} hands another player held the biggest stack. You finished in place ${match.result.place}.`
              : `You lost your last chip after ${match.handsPlayed} hands and finished in place ${match.result.place}.`}
        </p>
        {won && (
          <div className="wws-result__rows">
            <div>
              <span>Purse</span>
              <b>{`+${fmt(stage.purse, lang)}`}</b>
            </div>
            <div>
              <span>Total winnings</span>
              <b>{fmt(progress.winnings, lang)}</b>
            </div>
            {milestone && (
              <div className="wws-result__milestone">
                <span>New title</span>
                <b>{milestone}</b>
              </div>
            )}
            {!isFinal && stage.id + 1 <= STAGE_COUNT && (
              <div>
                <span>Unlocked</span>
                <b>{`${STAGES[stage.id].town} — ${STAGES[stage.id].saloon}`}</b>
              </div>
            )}
          </div>
        )}
        <div className="wws-row">
          {won && !isFinal && (
            <button type="button" className="wws-btn wws-btn--gold" onClick={onNext}>
              Next stage
            </button>
          )}
          {won && isFinal && (
            <button type="button" className="wws-btn wws-btn--gold" onClick={onNext}>
              Ride into the sunset
            </button>
          )}
          {!won && (
            <button type="button" className="wws-btn wws-btn--gold" onClick={onRetry}>
              Retry stage
            </button>
          )}
          {won && (
            <button type="button" className="wws-btn" onClick={onRetry}>
              Replay stage
            </button>
          )}
          <button type="button" className="wws-btn" onClick={onMap}>
            Tournament Map
          </button>
          <button type="button" className="wws-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Ending({ progress, onMenu, onMap, lang }) {
  return (
    <div className="wws-modal wws-modal--ending">
      <div className="wws-panel wws-ending">
        <div className="wws-ending__star">{Icon.star}</div>
        <div className="wws-result__kicker">The legend of the West</div>
        <h2 className="wws-result__title">Grand Champion of the West</h2>
        <p>You rode into Dusty Creek an unknown traveler with a deck of cards in your saddlebag. Fifteen saloons later, the Colonel has tipped his hat and pushed his last chip across the felt.</p>
        <p>From the Rookie Saloon to the Last Sunset, every gambler on the frontier now knows your name. The cards will keep calling — and the trail is always open for one more hand.</p>
        <div className="wws-result__rows">
          <div>
            <span>Total winnings</span>
            <b>{fmt(progress.winnings, lang)}</b>
          </div>
          <div>
            <span>Tournaments played</span>
            <b>{progress.matchesPlayed}</b>
          </div>
        </div>
        <div className="wws-row">
          <button type="button" className="wws-btn wws-btn--gold" onClick={onMap}>
            Tournament Map
          </button>
          <button type="button" className="wws-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onHelp, onSettings, onRestart, onMap, onMenu }) {
  return (
    <div className="wws-modal">
      <div className="wws-panel wws-panel--narrow">
        <h2>Paused</h2>
        <div className="wws-col">
          <button type="button" className="wws-btn wws-btn--gold" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="wws-btn" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="wws-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="wws-btn" onClick={onRestart}>
            Restart stage
          </button>
          <button type="button" className="wws-btn" onClick={onMap}>
            Leave table (progress saved)
          </button>
          <button type="button" className="wws-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

const RANK_EXAMPLES = [
  ["Royal Flush", "Ah Kh Qh Jh Th", "Ace-high straight, all one suit."],
  ["Straight Flush", "9s 8s 7s 6s 5s", "Five in a row, all one suit."],
  ["Four of a Kind", "Qc Qd Qh Qs 4d", "Four cards of the same rank."],
  ["Full House", "Kc Kd Kh 7s 7c", "Three of a kind plus a pair."],
  ["Flush", "Ad Jd 9d 6d 2d", "Five cards of one suit."],
  ["Straight", "5c 4d 3h 2s Ac", "Five in a row — the ace can play low (the wheel) or high."],
  ["Three of a Kind", "8c 8d 8h Kd 3s", "Three cards of one rank."],
  ["Two Pair", "Jc Jd 4h 4s Ac", "Two different pairs."],
  ["One Pair", "Tc Td Ah 7s 2c", "Two cards of one rank."],
  ["High Card", "Ac Jd 8h 6s 3c", "Nothing better — the highest card plays."],
];

export function Help({ onClose }) {
  const [tab, setTab] = useState("rules");
  return (
    <div className="wws-modal">
      <div className="wws-panel wws-help">
        <div className="wws-help__tabs" role="tablist">
          {[
            ["rules", "Texas Hold'em"],
            ["hands", "Hand Rankings"],
            ["tour", "Tournaments"],
            ["controls", "Controls"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`wws-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="wws-help__body">
          {tab === "rules" && (
            <ol className="wws-help__list">
              <li>Each player is dealt two private cards. Five community cards are shared by everyone.</li>
              <li>The two players left of the dealer button post the small and big blinds before the cards are dealt.</li>
              <li>Pre-flop: starting left of the big blind, everyone folds, calls or raises.</li>
              <li>The flop (three community cards), the turn (a fourth) and the river (a fifth) each bring a new betting round, starting left of the button.</li>
              <li>On your turn: Fold gives up the hand. Check passes when there is no bet. Call matches the current bet. Bet or Raise puts in more. All-in pushes every chip you have.</li>
              <li>A raise must be at least as large as the previous bet or raise. A short all-in does not reopen the betting.</li>
              <li>At the showdown the best five-card hand from your two cards and the five on the board wins the pot. Equal hands split it.</li>
              <li>If you go all-in for less, you can only win the main pot; the rest forms side pots for the players who covered it.</li>
            </ol>
          )}
          {tab === "hands" && (
            <div className="wws-ranks">
              {RANK_EXAMPLES.map(([n, c, d], i) => (
                <div key={n} className="wws-ranks__row">
                  <span className="wws-ranks__n">{i + 1}</span>
                  <span className="wws-ranks__cards">
                    {parseCards(c).map((x, k) => (
                      <Card key={k} card={x} size="xs" />
                    ))}
                  </span>
                  <span className="wws-ranks__txt">
                    <b>{n}</b>
                    <span>{d}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {tab === "tour" && (
            <ul className="wws-help__list">
              <li>The trail runs through fifteen frontier towns. Win a stage to unlock the next saloon.</li>
              <li>Every stage is a freezeout: all players buy in with the same stack of fictional chips.</li>
              <li>The blinds rise every few hands, so waiting forever is not an option.</li>
              <li>Bust every rival to win. If the sun sets first (the hand limit shown at the top), the biggest stack wins.</li>
              <li>Rookies call too much, gamblers and outlaws bluff and pressure you, sheriffs play tight, and veteran card sharks read your bets.</li>
              <li>Progress is saved after every action. Continue resumes the exact hand you left.</li>
              <li>All chips are fictional. There is no real money, no purchases and no cash-out.</li>
            </ul>
          )}
          {tab === "controls" && (
            <ul className="wws-help__list wws-help__keys">
              <li>
                <kbd>F</kbd> Fold
              </li>
              <li>
                <kbd>C</kbd> Check / Call
              </li>
              <li>
                <kbd>R</kbd> Bet / Raise (the amount set on the slider)
              </li>
              <li>
                <kbd>A</kbd> All-in
              </li>
              <li>
                <kbd>↑</kbd> <kbd>↓</kbd> Adjust the bet by one big blind
              </li>
              <li>
                <kbd>Space</kbd> Next hand / skip the intro
              </li>
              <li>
                <kbd>Esc</kbd> Pause
              </li>
              <li>Move the mouse to look around the saloon from your seat.</li>
            </ul>
          )}
        </div>
        <div className="wws-row">
          <button type="button" className="wws-btn wws-btn--gold" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings({ settings, set, qualityNow, onClose, onReset }) {
  const [confirm, setConfirm] = useState(false);
  const qLabel = { auto: "Auto", high: "High", medium: "Medium", low: "Low" };
  return (
    <div className="wws-modal">
      <div className="wws-panel wws-settings">
        <h2>Settings</h2>
        <div className="wws-set">
          <span className="wws-set__k">Graphics</span>
          <div className="wws-seg">
            {["auto", "high", "medium", "low"].map((q) => (
              <button key={q} type="button" className={settings.quality === q ? "is-on" : ""} onClick={() => set("quality", q)}>
                {qLabel[q]}
              </button>
            ))}
          </div>
          {settings.quality === "auto" && qualityNow && <span className="wws-set__note">{`Now: ${qLabel[qualityNow]}`}</span>}
        </div>
        <p className="wws-set__hint">High: best lighting, shadows and depth of field. Medium: balanced. Low: fastest, simplified scenery.</p>
        {[
          ["volume", "Master volume"],
          ["music", "Piano music"],
          ["ambience", "Saloon ambience"],
        ].map(([k, l]) => (
          <label key={k} className="wws-set">
            <span className="wws-set__k">{l}</span>
            <input type="range" min="0" max="1" step="0.05" value={settings[k]} onChange={(e) => set(k, +e.target.value)} className="wws-range" aria-label={l} />
            <span className="wws-set__v">{`${Math.round(settings[k] * 100)}%`}</span>
          </label>
        ))}
        <div className="wws-set">
          <span className="wws-set__k">Game speed</span>
          <div className="wws-seg">
            {[
              ["slow", "Slow"],
              ["normal", "Normal"],
              ["fast", "Fast"],
            ].map(([k, l]) => (
              <button key={k} type="button" className={settings.speed === k ? "is-on" : ""} onClick={() => set("speed", k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="wws-set wws-set--check">
          <input type="checkbox" checked={settings.cardAssist} onChange={(e) => set("cardAssist", e.target.checked)} />
          <span>Show my cards large and hand strength</span>
        </label>
        <label className="wws-set wws-set--check">
          <input type="checkbox" checked={settings.motion} onChange={(e) => set("motion", e.target.checked)} />
          <span>Camera breathing and sway</span>
        </label>
        <div className="wws-set wws-set--danger">
          {!confirm ? (
            <button type="button" className="wws-btn wws-btn--small" onClick={() => setConfirm(true)}>
              Reset all progress
            </button>
          ) : (
            <>
              <span>Erase every stage, winnings and the saved game?</span>
              <button type="button" className="wws-btn wws-btn--small wws-btn--fold" onClick={() => { setConfirm(false); onReset(); }}>
                Erase
              </button>
              <button type="button" className="wws-btn wws-btn--small" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </>
          )}
        </div>
        <div className="wws-row">
          <button type="button" className="wws-btn wws-btn--gold" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function Confirm({ text, yes, no, onYes, onNo }) {
  return (
    <div className="wws-modal">
      <div className="wws-panel wws-panel--narrow">
        <p>{text}</p>
        <div className="wws-row">
          <button type="button" className="wws-btn" onClick={onNo}>
            {no}
          </button>
          <button type="button" className="wws-btn wws-btn--gold" onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}
