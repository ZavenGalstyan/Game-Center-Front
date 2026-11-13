/**
 * Menus and overlays: title, campaign map + briefing, victory rewards,
 * defeat, final ending, Sanctum (talents / deck upgrades / armory),
 * settings, how-to-play, pause and the first-battle tutorial.
 * All text is plain English in whole text nodes — the Game Center
 * translator localises it (Russian) at runtime.
 */
import { useMemo, useState } from "react";
import { BATTLES, BATTLE_BY_ID, ENVS, MODS } from "../engine/battles.js";
import { ENEMIES } from "../engine/enemies.js";
import { CARDS, CARD_IDS, cardStats, STATUS_INFO } from "../engine/cards.js";
import { TALENTS, xpForLevel, MAX_LEVEL, profileOf, canTalent, canUpgrade, upgradeCost, canRemove, REMOVE_COST, canBuy, buyCost, DECK_MAX, DECK_MIN } from "../engine/progress.js";
import { Card } from "./Card.jsx";
import { Icon } from "./Icons.jsx";

const ACTS = [
  { name: "Act I · The Restless Dead", ids: [1, 2, 3, 4, 5] },
  { name: "Act II · The Haunted Halls", ids: [6, 7, 8, 9, 10] },
  { name: "Act III · Blood and Iron", ids: [11, 12, 13, 14, 15] },
  { name: "Act IV · The Shadow Throne", ids: [16, 17, 18, 19, 20] },
];

function Stars({ n = 0, max = 3 }) {
  return (
    <span className="dos-stars" aria-label={`${n} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="star" className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

export function Btn({ children, onClick, kind = "", disabled = false, icon = null, title }) {
  return (
    <button type="button" className={`dos-btn ${kind}`} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

export function Loading({ p, text }) {
  return (
    <div className="dos-loading">
      <div className="dos-loading__sigil" />
      <p>{text || "Summoning the darkness…"}</p>
      <div className="dos-bar">
        <i style={{ width: `${Math.round((p || 0) * 100)}%` }} />
      </div>
    </div>
  );
}

export function MainMenu({ progress, onContinue, onCampaign, onSanctum, onSettings, onHelp }) {
  const started = Object.keys(progress.battles).length > 0 || progress.current;
  const cont = progress.current ? BATTLE_BY_ID[progress.current.battleId] : null;
  return (
    <div className="dos-screen dos-menu">
      <div className="dos-title">
        <h1>
          <span className="a">Deck of Shadows</span>
        </h1>
        <h2>Monster Hunt</h2>
        <p className="dos-tag">Twenty hunts. Nine horrors. One deck between you and the dark.</p>
      </div>
      <nav className="dos-menu__nav">
        {cont && (
          <Btn kind="primary" icon="sword" onClick={onContinue}>
            {`Continue: Battle ${cont.id}`}
          </Btn>
        )}
        <Btn kind={cont ? "" : "primary"} icon="skull" onClick={onCampaign}>
          {started ? "Campaign" : "Begin the Hunt"}
        </Btn>
        <Btn icon="up" onClick={onSanctum}>
          Sanctum
        </Btn>
        <Btn icon="gear" onClick={onSettings}>
          Settings
        </Btn>
        <Btn icon="book" onClick={onHelp}>
          How to Play
        </Btn>
      </nav>
      <div className="dos-menu__stats">
        <span>{`Hunter level ${progress.level}`}</span>
        <span>{`${Object.keys(progress.battles).length} / 20 battles won`}</span>
        <span className="sh">
          <Icon name="shard" />
          {`${progress.shards} Soul Shards`}
        </span>
      </div>
    </div>
  );
}

export function CampaignMap({ progress, onPick, onBack, onSanctum }) {
  return (
    <div className="dos-screen dos-map">
      <header className="dos-head">
        <Btn icon="back" onClick={onBack}>
          Back
        </Btn>
        <h2>The Hunt</h2>
        <Btn icon="up" onClick={onSanctum}>
          Sanctum
        </Btn>
      </header>
      <div className="dos-map__acts">
        {ACTS.map((a) => (
          <section key={a.name} className="dos-act">
            <h3>{a.name}</h3>
            <div className="dos-act__row">
              {a.ids.map((id) => {
                const B = BATTLE_BY_ID[id];
                const E = ENEMIES[B.enemy];
                const rec = progress.battles[id];
                const locked = id > progress.unlocked;
                return (
                  <button key={id} type="button" className={`dos-node env-${B.env} ${E.boss ? "boss" : ""} ${B.elite ? "elite" : ""} ${locked ? "locked" : ""} ${rec ? "won" : ""}`} disabled={locked} onClick={() => onPick(id)}>
                    <span className="n">{id}</span>
                    <span className="en">{E.name}</span>
                    <span className="lo">{ENVS[B.env].name}</span>
                    {E.boss ? <span className="tag boss">Boss</span> : B.elite ? <span className="tag">Elite</span> : null}
                    {locked ? <Icon name="lock" className="lk" /> : <Stars n={rec?.stars || 0} />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function Briefing({ id, progress, art, onFight, onBack }) {
  const B = BATTLE_BY_ID[id];
  const E = ENEMIES[B.enemy];
  const rec = progress.battles[id];
  const P = profileOf(progress);
  return (
    <div className="dos-screen dos-dim">
      <div className="dos-panel dos-brief">
        <div className="dos-brief__head">
          <span className="dos-kicker">{`Battle ${id} · ${ENVS[B.env].name}`}</span>
          <h2>{B.title}</h2>
          <h3 className={E.boss ? "boss" : ""}>{E.name}</h3>
          <p className="dos-lore">{E.lore}</p>
        </div>
        <div className="dos-brief__grid">
          <div>
            <h4>Threat</h4>
            <ul className="dos-facts">
              <li>{`Health ${Math.round(E.hp * B.hpMul)}`}</li>
              <li>{E.boss ? "Boss — changes tactics when wounded" : B.elite ? "Elite hunt" : "Standard hunt"}</li>
              {B.mods.map((m) => (
                <li key={m} className="mod">
                  <b>{MODS[m].name}</b>
                  <span>{MODS[m].desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Rewards</h4>
            <ul className="dos-facts">
              <li>{`${rec ? Math.round(B.xp * 0.4) : B.xp} XP`}</li>
              <li>{`${rec ? Math.round(B.shards * 0.5) : B.shards} Soul Shards`}</li>
              {B.unlock && !rec && <li className="unlock">{`New card: ${CARDS[B.unlock].name}`}</li>}
              {rec && <li>{`Best: ${rec.stars} ★`}</li>}
            </ul>
            <h4>Your hunter</h4>
            <ul className="dos-facts">
              <li>{`Health ${P.maxHp} · Energy ${P.energy} · Hand ${5 + P.drawBonus}`}</li>
              <li>{`Deck: ${progress.deck.length} cards`}</li>
            </ul>
          </div>
        </div>
        {B.unlock && !rec && (
          <div className="dos-brief__card">
            <Card refId={B.unlock} art={art(CARDS[B.unlock].art)} size="sm" />
          </div>
        )}
        <div className="dos-row">
          <Btn icon="back" onClick={onBack}>
            Back
          </Btn>
          <Btn kind="primary" icon="sword" onClick={onFight}>
            Fight
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Reward({ report, progress, art, onPick, onContinue }) {
  const [picked, setPicked] = useState(null);
  const B = BATTLE_BY_ID[report.battleId];
  const need = xpForLevel(progress.level);
  return (
    <div className="dos-screen dos-dim">
      <div className="dos-panel dos-reward">
        <span className="dos-kicker">{`Battle ${B.id} · ${B.title}`}</span>
        <h2 className="dos-win">Victory</h2>
        <Stars n={report.stars} />
        <div className="dos-reward__gains">
          <span>{`+${report.xp} XP`}</span>
          <span>
            <Icon name="shard" />
            {`+${report.shards} Soul Shards`}
          </span>
        </div>
        <div className="dos-xp">
          <span>{`Level ${progress.level}`}</span>
          <div className="dos-bar xp">
            <i style={{ width: `${progress.level >= MAX_LEVEL ? 100 : Math.round((progress.xp / need) * 100)}%` }} />
          </div>
        </div>
        {report.levelsGained.length > 0 && <p className="dos-levelup">{`Level up! You reached level ${report.levelsGained.at(-1)} — spend your talent points in the Sanctum.`}</p>}
        {report.unlocked && (
          <div className="dos-reward__unlock">
            <h4>New card unlocked</h4>
            <Card refId={report.unlocked} art={art(CARDS[report.unlocked].art)} size="sm" />
          </div>
        )}
        {report.choices.length > 0 && !picked && progress.deck.length < DECK_MAX && (
          <>
            <h4>Choose a card to add to your deck</h4>
            <div className="dos-reward__choices">
              {report.choices.map((id) => (
                <Card
                  key={id}
                  refId={id}
                  art={art(CARDS[id].art)}
                  size="sm"
                  onClick={() => {
                    setPicked(id);
                    onPick(id);
                  }}
                />
              ))}
            </div>
          </>
        )}
        {picked && <p className="dos-note">{`${CARDS[picked].name} joins your deck.`}</p>}
        <div className="dos-row">
          <Btn kind="primary" icon="check" onClick={onContinue}>
            {report.final ? "Witness the Ending" : picked || !report.choices.length ? "Continue" : "Skip and Continue"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Defeat({ battleId, onRetry, onMap, onSanctum }) {
  const B = BATTLE_BY_ID[battleId];
  return (
    <div className="dos-screen dos-dim red">
      <div className="dos-panel narrow center">
        <h2 className="dos-lose">You Have Fallen</h2>
        <p className="dos-lore">{`${ENEMIES[B.enemy].name} stands over your body. The hunt is not over — rise and try again.`}</p>
        <p className="dos-note">Tip: upgrade cards, thin your deck and spend talent points in the Sanctum.</p>
        <div className="dos-row">
          <Btn icon="up" onClick={onSanctum}>
            Sanctum
          </Btn>
          <Btn icon="back" onClick={onMap}>
            Campaign
          </Btn>
          <Btn kind="primary" icon="sword" onClick={onRetry}>
            Retry Battle
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Ending({ progress, onMenu }) {
  const stars = Object.values(progress.battles).reduce((a, b) => a + (b.stars || 0), 0);
  return (
    <div className="dos-screen dos-dim">
      <div className="dos-panel narrow center dos-ending">
        <Icon name="crown" className="big" />
        <h2 className="dos-win">The Shadows Lift</h2>
        <p className="dos-lore">The Final Shadow Lord is gone, and every card he dealt has burned to ash. Dawn reaches the graveyard for the first time in a hundred years.</p>
        <p className="dos-note">{`Hunter level ${progress.level} · ${stars} / 60 stars`}</p>
        <p className="dos-note">Replay any battle to earn more stars and perfect your deck.</p>
        <div className="dos-row">
          <Btn kind="primary" icon="check" onClick={onMenu}>
            Main Menu
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Sanctum({ progress, art, onChange, onBack }) {
  const [tab, setTab] = useState("talents");
  const P = profileOf(progress);
  const deckRows = useMemo(() => progress.deck.map((r, i) => ({ r, i })).sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : a.i - b.i)), [progress.deck]);
  const [sel, setSel] = useState(null);
  return (
    <div className="dos-screen dos-dim">
      <div className="dos-panel wide dos-sanctum">
        <header className="dos-head">
          <Btn icon="back" onClick={onBack}>
            Back
          </Btn>
          <h2>Sanctum</h2>
          <span className="dos-wallet">
            <Icon name="shard" />
            {`${progress.shards} Soul Shards`}
          </span>
        </header>
        <div className="dos-tabs" role="tablist">
          {[
            ["talents", "Talents"],
            ["deck", "Your Deck"],
            ["armory", "Armory"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => (setTab(k), setSel(null))}>
              {l}
            </button>
          ))}
        </div>
        {tab === "talents" && (
          <div className="dos-talents">
            <div className="dos-hunter">
              <span>{`Level ${progress.level}`}</span>
              <span>{`Health ${P.maxHp}`}</span>
              <span>{`Energy ${P.energy}`}</span>
              <span>{`Hand ${5 + P.drawBonus}`}</span>
              <span className="sp">{`Talent points: ${progress.sp}`}</span>
            </div>
            <div className="dos-talents__grid">
              {Object.entries(TALENTS).map(([k, T]) => {
                const why = canTalent(progress, k);
                return (
                  <div key={k} className={`dos-talent ${progress.talents[k] >= T.max ? "max" : ""}`}>
                    <h4>{T.name}</h4>
                    <p>{T.desc}</p>
                    <div className="pips">
                      {Array.from({ length: T.max }, (_, i) => (
                        <i key={i} className={i < progress.talents[k] ? "on" : ""} />
                      ))}
                    </div>
                    <Btn kind="small" disabled={!!why} onClick={() => onChange("talent", k)}>
                      {why === "max" ? "Mastered" : why === "level" ? `Requires level ${T.req}` : `Learn (${T.cost} pt)`}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab === "deck" && (
          <div className="dos-deckview">
            <p className="dos-note">{`${progress.deck.length} cards (minimum ${DECK_MIN}, maximum ${DECK_MAX}). Select a card to upgrade or remove it.`}</p>
            <div className="dos-cardgrid">
              {deckRows.map(({ r, i }) => (
                <Card key={`${r}-${i}`} refId={r} art={art(CARDS[r.replace("+", "")].art)} size="xs" className={sel === i ? "is-sel" : ""} onClick={() => setSel(i)} tiltable={false} />
              ))}
            </div>
            {sel != null && progress.deck[sel] && (
              <div className="dos-deckview__act">
                <span>{cardStats(progress.deck[sel]).name}</span>
                <Btn kind="small" icon="up" disabled={!!canUpgrade(progress, sel)} onClick={() => (onChange("upgrade", sel), setSel(null))}>
                  {canUpgrade(progress, sel) === "no" ? "Already upgraded" : `Upgrade (${upgradeCost(progress.deck[sel])} shards)`}
                </Btn>
                <Btn kind="small danger" icon="close" disabled={!!canRemove(progress, sel)} onClick={() => (onChange("remove", sel), setSel(null))}>
                  {canRemove(progress, sel) === "min" ? "Deck at minimum" : `Remove (${REMOVE_COST} shards)`}
                </Btn>
              </div>
            )}
          </div>
        )}
        {tab === "armory" && (
          <div className="dos-deckview">
            <p className="dos-note">Buy extra copies of cards you have unlocked. New cards are unlocked by winning battles.</p>
            <div className="dos-cardgrid">
              {CARD_IDS.map((id) => {
                const locked = !progress.collection.includes(id);
                const why = canBuy(progress, id);
                return (
                  <div key={id} className={`dos-shopcard ${locked ? "locked" : ""}`}>
                    {locked ? (
                      <div className="dos-card xs is-back locked">
                        <div className="dos-card__back">
                          <div className="dos-card__backsigil" />
                          <Icon name="lock" className="lk" />
                        </div>
                      </div>
                    ) : (
                      <Card refId={id} art={art(CARDS[id].art)} size="xs" tiltable={false} />
                    )}
                    <Btn kind="small" disabled={!!why} onClick={() => onChange("buy", id)}>
                      {locked ? "Locked" : why === "max" ? "Deck full" : `Buy (${buyCost(id)})`}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Settings({ settings, set, onReset, onBack, quality }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="dos-screen dos-dim top">
      <div className="dos-panel narrow dos-settings">
        <h2>Settings</h2>
        <label className="dos-field">
          <span>Graphics quality</span>
          <div className="dos-seg">
            {[
              ["auto", "Auto"],
              ["high", "High"],
              ["medium", "Medium"],
              ["low", "Low"],
            ].map(([k, l]) => (
              <button key={k} type="button" className={settings.quality === k ? "on" : ""} onClick={() => set("quality", k)}>
                {l}
              </button>
            ))}
          </div>
        </label>
        {settings.quality === "auto" && quality && <p className="dos-note">{`Auto is currently using ${quality === "high" ? "High" : quality === "medium" ? "Medium" : "Low"} quality.`}</p>}
        <label className="dos-field">
          <span>Master volume</span>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => set("volume", +e.target.value)} />
        </label>
        <label className="dos-field">
          <span>Music and ambience</span>
          <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => set("music", +e.target.value)} />
        </label>
        <label className="dos-field">
          <span>Brightness</span>
          <input type="range" min="0.7" max="1.4" step="0.05" value={settings.brightness} onChange={(e) => set("brightness", +e.target.value)} />
        </label>
        <label className="dos-field check">
          <input type="checkbox" checked={settings.shake} onChange={(e) => set("shake", e.target.checked)} />
          <span>Camera shake on heavy hits</span>
        </label>
        <label className="dos-field check">
          <input type="checkbox" checked={settings.fast} onChange={(e) => set("fast", e.target.checked)} />
          <span>Faster combat animations</span>
        </label>
        <div className="dos-row">
          {!confirm ? (
            <Btn kind="small danger" onClick={() => setConfirm(true)}>
              Reset progress
            </Btn>
          ) : (
            <>
              <span className="dos-note">Erase all progress?</span>
              <Btn kind="small danger" onClick={() => (onReset(), setConfirm(false))}>
                Yes, erase
              </Btn>
              <Btn kind="small" onClick={() => setConfirm(false)}>
                Cancel
              </Btn>
            </>
          )}
        </div>
        <div className="dos-row">
          <Btn kind="primary" icon="check" onClick={onBack}>
            Done
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Help({ onBack }) {
  return (
    <div className="dos-screen dos-dim top">
      <div className="dos-panel dos-help">
        <h2>How to Play</h2>
        <ol>
          <li>Each turn you draw five cards and get three Energy. Each card's cost is in its top-left gem.</li>
          <li>Click or tap a card to play it. Attacks strike the monster; skills defend, heal or curse.</li>
          <li>The icon above the monster shows its next move. A sword means it will attack for the number shown.</li>
          <li>Block absorbs damage until the start of your next turn. Play defence when a big attack is coming.</li>
          <li>Press End Turn when you are done. Unplayed cards are discarded and the monster acts.</li>
          <li>Win battles to earn XP, Soul Shards and new cards. Spend them in the Sanctum between hunts.</li>
          <li>Keyboard: number keys play cards, E ends the turn, Esc pauses.</li>
        </ol>
        <h3>Effects</h3>
        <ul className="dos-glossary">
          {Object.entries(STATUS_INFO).map(([k, s]) => (
            <li key={k}>
              <Icon name={k} />
              <b>{s.name}</b>
              <span>{s.desc}</span>
            </li>
          ))}
          <li>
            <Icon name="dread" />
            <b>Exhaust</b>
            <span>The card is removed until the battle ends.</span>
          </li>
        </ul>
        <div className="dos-row">
          <Btn kind="primary" icon="check" onClick={onBack}>
            Got it
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Pause({ battleId, onResume, onRestart, onSettings, onHelp, onQuit }) {
  const B = BATTLE_BY_ID[battleId];
  return (
    <div className="dos-screen dos-dim top">
      <div className="dos-panel narrow center">
        <span className="dos-kicker">{`Battle ${B.id} · ${B.title}`}</span>
        <h2>Paused</h2>
        <div className="dos-col">
          <Btn kind="primary" icon="sword" onClick={onResume}>
            Resume
          </Btn>
          <Btn icon="up" onClick={onRestart}>
            Restart Battle
          </Btn>
          <Btn icon="gear" onClick={onSettings}>
            Settings
          </Btn>
          <Btn icon="book" onClick={onHelp}>
            How to Play
          </Btn>
          <Btn icon="back" onClick={onQuit}>
            Leave Battle
          </Btn>
        </div>
        <p className="dos-note">Your battle is saved — Continue from the main menu to resume it later.</p>
      </div>
    </div>
  );
}

const TUTORIAL = [
  { at: "hand", text: "These are your cards. Each costs Energy, shown in the gem on its corner." },
  { at: "energy", text: "You have 3 Energy each turn. Spend it wisely." },
  { at: "intent", text: "The monster shows its next move. A sword with a number means an attack is coming." },
  { at: "player", text: "Block from Dark Barrier absorbs damage. Watch your health here." },
  { at: "end", text: "When you are done, press End Turn and the monster will act." },
];

export function Tutorial({ step, onNext, onSkip }) {
  const T = TUTORIAL[step];
  if (!T) return null;
  return (
    <div className={`dos-tut at-${T.at}`} role="dialog">
      <p>{T.text}</p>
      <div className="dos-row">
        <Btn kind="small" onClick={onSkip}>
          Skip tutorial
        </Btn>
        <Btn kind="small primary" onClick={onNext}>
          {step === TUTORIAL.length - 1 ? "Start fighting" : "Next"}
        </Btn>
      </div>
    </div>
  );
}
export const TUTORIAL_STEPS = TUTORIAL.length;
