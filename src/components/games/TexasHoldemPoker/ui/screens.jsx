/**
 * Menus and overlay screens. Each screen gets the app state it shows and
 * callbacks; none of them touch the poker engine directly.
 */
import { useState } from "react";
import { PlayingCard, ChipStack, Chip, fmt, fmtShort, Avatar } from "./pieces.jsx";
import { parseCards } from "../engine/cards.js";
import {
  levelInfo, ACHIEVEMENTS, THEMES, CARD_BACKS, CHIP_SETS, FRAMES, isUnlocked, MAX_LEVEL,
} from "../engine/progress.js";
import { TIERS, TIER_IDS, PAYOUTS, BLIND_LEVELS } from "../engine/tournament.js";
import { PROFILES } from "../engine/ai.js";

export function Panel({ title, onBack, children, wide = false, className = "" }) {
  return (
    <div className="thp-screen">
      <div className={`thp-panel${wide ? " thp-panel--wide" : ""} ${className}`}>
        <header className="thp-panel__head">
          {onBack && <button type="button" className="thp-back" onClick={onBack} aria-label="Back">‹</button>}
          <h2>{title}</h2>
        </header>
        <div className="thp-panel__body">{children}</div>
      </div>
    </div>
  );
}

function Seg({ label, value, options, onChange, fmtOpt = (o) => o }) {
  return (
    <div className="thp-field">
      <span className="thp-field__label">{label}</span>
      <div className="thp-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const v = typeof o === "object" ? o.value : o;
          const dis = typeof o === "object" && o.disabled;
          return (
            <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} disabled={dis} onClick={() => onChange(v)}>
              {typeof o === "object" ? o.label : fmtOpt(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LevelBadge({ profile }) {
  const li = levelInfo(profile.xp);
  return (
    <div className="thp-lvl">
      <span className="thp-lvl__n">{li.level}</span>
      <span className="thp-lvl__bar"><i style={{ width: `${li.max ? 100 : (li.into / li.need) * 100}%` }} /></span>
      <small>{li.max ? "MAX LEVEL" : `${li.into} / ${li.need} XP`}</small>
    </div>
  );
}

/* ------------------------------------------------------------ main menu */

export function MainMenu({ profile, hasSession, sessionLabel, onNav, onContinue, note }) {
  return (
    <div className="thp-screen thp-screen--menu">
      <div className="thp-menu">
        <div className="thp-menu__brand">
          <div className="thp-menu__cards" aria-hidden="true">
            {parseCards("As Ah Ks").map((c, i) => <PlayingCard key={c} card={c} size="md" style={{ "--r": `${(i - 1) * 12}deg` }} />)}
          </div>
          <h1>Texas Hold'em <em>Poker</em></h1>
          <p className="thp-tag">BET • BLUFF • WIN</p>
          <div className="thp-menu__status">
            <LevelBadge profile={profile} />
            <span className="thp-bank" title="Virtual play-money chips"><Chip denom={1000} /> {fmt(profile.bankroll)}</span>
          </div>
          {note && <p className="thp-note">{note}</p>}
        </div>
        <div className="thp-menu__main">
          {hasSession && (
            <button type="button" className="thp-btn thp-btn--gold" onClick={onContinue}>
              Continue <small>{sessionLabel}</small>
            </button>
          )}
          <button type="button" className={`thp-btn${hasSession ? "" : " thp-btn--gold"}`} onClick={() => onNav("quick")}>Quick Play <small>Cash table · 2–6 players</small></button>
          <button type="button" className="thp-btn" onClick={() => onNav("tourney")}>Tournament <small>6-player sit &amp; go</small></button>
          <button type="button" className="thp-btn" onClick={() => onNav("practice")}>Practice <small>Hints · no pressure</small></button>
          <div className="thp-menu__grid">
            <button type="button" className="thp-btn thp-btn--sm" onClick={() => onNav("profile")}>Profile</button>
            <button type="button" className="thp-btn thp-btn--sm" onClick={() => onNav("achievements")}>Achievements</button>
            <button type="button" className="thp-btn thp-btn--sm" onClick={() => onNav("themes")}>Table Themes</button>
            <button type="button" className="thp-btn thp-btn--sm" onClick={() => onNav("how")}>How to Play</button>
            <button type="button" className="thp-btn thp-btn--sm" onClick={() => onNav("settings")}>Settings</button>
          </div>
          <p className="thp-fine">Play-money chips only — no real-money gambling.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ setups */

const BLIND_OPTS = [[5, 10], [10, 20], [25, 50], [50, 100]];

export function QuickSetup({ profile, onStart, onBack, onRefill, warnSession }) {
  const [players, setPlayers] = useState(6);
  const [difficulty, setDifficulty] = useState("medium");
  const [blindIdx, setBlindIdx] = useState(1);
  const [depth, setDepth] = useState(100);
  const [sb, bb] = BLIND_OPTS[blindIdx];
  const stack = bb * depth;
  const afford = stack <= profile.bankroll;
  return (
    <Panel title="Quick Play" onBack={onBack}>
      <Seg label="Players" value={players} options={[2, 3, 4, 5, 6]} onChange={setPlayers} />
      <Seg label="AI difficulty" value={difficulty} options={["easy", "medium", "hard"]} onChange={setDifficulty} />
      <Seg label="Blinds" value={blindIdx} options={BLIND_OPTS.map(([s, b], i) => ({ value: i, label: `${s}/${b}` }))} onChange={setBlindIdx} />
      <Seg label="Buy-in" value={depth} options={[50, 100, 200].map((d) => ({ value: d, label: `${fmtShort(bb * d)} · ${d}bb`, disabled: bb * d > profile.bankroll }))} onChange={setDepth} />
      <p className="thp-sub">Bankroll <b>{fmt(profile.bankroll)}</b> → table stack <b>{fmt(stack)}</b>. Your stack returns to the bankroll when you leave.</p>
      {warnSession && <p className="thp-warn">Starting a new table closes your current one{warnSession === "tournament" ? " (the tournament entry is forfeited)" : ""}.</p>}
      <div className="thp-row">
        {afford ? (
          <button type="button" className="thp-btn thp-btn--gold" onClick={() => onStart({ players, difficulty, stack, blinds: { sb, bb } })}>Take a Seat</button>
        ) : profile.bankroll < 500 ? (
          <button type="button" className="thp-btn thp-btn--gold" onClick={onRefill}>Free chip refill</button>
        ) : (
          <button type="button" className="thp-btn" disabled>Not enough chips</button>
        )}
      </div>
    </Panel>
  );
}

export function PracticeSetup({ onStart, onBack, warnSession }) {
  const [players, setPlayers] = useState(4);
  const [difficulty, setDifficulty] = useState("easy");
  return (
    <Panel title="Practice" onBack={onBack}>
      <p className="thp-sub">Free chips, no turn timer, live hand-strength hints and explanations of every action. Practice hands don't change your stats, XP or bankroll.</p>
      <Seg label="Players" value={players} options={[2, 3, 4, 5, 6]} onChange={setPlayers} />
      <Seg label="AI difficulty" value={difficulty} options={["easy", "medium", "hard"]} onChange={setDifficulty} />
      {warnSession && <p className="thp-warn">Starting practice closes your current table{warnSession === "tournament" ? " (the tournament entry is forfeited)" : ""}.</p>}
      <div className="thp-row">
        <button type="button" className="thp-btn thp-btn--gold" onClick={() => onStart({ players, difficulty, stack: 2000, blinds: { sb: 10, bb: 20 } })}>Start Practice</button>
      </div>
    </Panel>
  );
}

export function TourneySetup({ profile, onStart, onBack, onRefill, warnSession }) {
  const lvl = levelInfo(profile.xp).level;
  const firstOpen = [...TIER_IDS].reverse().find((id) => TIERS[id].level <= lvl && TIERS[id].buyIn <= profile.bankroll) || "bronze";
  const [tier, setTier] = useState(firstOpen);
  const [speed, setSpeed] = useState("normal");
  const T = TIERS[tier];
  const hpl = speed === "turbo" ? Math.max(4, T.handsPerLevel - 4) : speed === "slow" ? T.handsPerLevel + 4 : T.handsPerLevel;
  const unlocked = T.level <= lvl;
  const afford = T.buyIn <= profile.bankroll;
  return (
    <Panel title="Poker Tournament" onBack={onBack} wide>
      <div className="thp-tiers">
        {TIER_IDS.map((id) => {
          const t = TIERS[id];
          const open = t.level <= lvl;
          return (
            <button type="button" key={id} className={`thp-tier thp-tier--${id}${tier === id ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => setTier(id)}>
              <b>{t.name}</b>
              <span>{open ? `Buy-in ${fmt(t.buyIn)}` : `Unlocks at level ${t.level}`}</span>
              <small>{fmt(t.stack)} chips · {t.difficulty} AI</small>
            </button>
          );
        })}
      </div>
      <Seg label="Blind speed" value={speed} options={[{ value: "turbo", label: "Turbo" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }]} onChange={setSpeed} />
      <p className="thp-sub">
        Six players, {fmt(T.stack)} chips each. Blinds start at {BLIND_LEVELS[0][0]}/{BLIND_LEVELS[0][1]} and rise every {hpl} hands.
        Prize pool <b>{fmt(T.buyIn * 6)}</b>: 1st {fmt(T.buyIn * 6 * PAYOUTS[0])} · 2nd {fmt(T.buyIn * 6 * PAYOUTS[1])} · 3rd {fmt(T.buyIn * 6 * PAYOUTS[2])}. XP ×{T.xpMult}.
      </p>
      {warnSession && <p className="thp-warn">Entering closes your current table{warnSession === "tournament" ? " (the current tournament entry is forfeited)" : ""}.</p>}
      <div className="thp-row">
        {!unlocked ? (
          <button type="button" className="thp-btn" disabled>Locked — reach level {T.level}</button>
        ) : afford ? (
          <button type="button" className="thp-btn thp-btn--gold" onClick={() => onStart({ tier, handsPerLevel: hpl })}>Enter · {fmt(T.buyIn)}</button>
        ) : profile.bankroll < 500 ? (
          <button type="button" className="thp-btn thp-btn--gold" onClick={onRefill}>Free chip refill</button>
        ) : (
          <button type="button" className="thp-btn" disabled>Not enough chips</button>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ profile & collection */

export function ProfileScreen({ profile, onBack, onRefill, hasQuick }) {
  const st = profile.stats;
  const li = levelInfo(profile.xp);
  const rows = [
    ["Hands played", fmt(st.handsPlayed)],
    ["Hands won", fmt(st.handsWon)],
    ["Win rate", st.handsPlayed ? `${Math.round((st.handsWon / st.handsPlayed) * 100)}%` : "—"],
    ["Showdowns won", fmt(st.showdownsWon)],
    ["Tournaments entered", fmt(st.tournamentsEntered)],
    ["Tournaments won", fmt(st.tournamentsWon)],
    ["Biggest pot won", fmt(st.biggestPot)],
    ["Total chips earned", fmt(st.chipsEarned)],
    ["Best win streak", fmt(st.bestStreak)],
    ["Total XP", fmt(profile.xp)],
  ];
  return (
    <Panel title="Player Profile" onBack={onBack} wide>
      <div className="thp-profile">
        <div className="thp-profile__id">
          <Avatar name="You" human frame={profile.cosmetics.frame} />
          <div>
            <b>Level {li.level}{li.max ? " · MAX" : ` of ${MAX_LEVEL}`}</b>
            <LevelBadge profile={profile} />
            <span className="thp-bank"><Chip denom={1000} /> {fmt(profile.bankroll)} chips</span>
            {profile.bankroll < 500 && !hasQuick && <button type="button" className="thp-btn thp-btn--sm thp-btn--gold" onClick={onRefill}>Free chip refill</button>}
          </div>
        </div>
        <div className="thp-stats">
          {rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
        <div className="thp-best">
          <span>Best hand achieved</span>
          {st.bestHand ? (
            <>
              <div className="thp-best__cards">{st.bestHand.cards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
              <b>{st.bestHand.desc}</b>
            </>
          ) : <b>Play a hand to the river to record one.</b>}
        </div>
      </div>
    </Panel>
  );
}

export function AchievementsScreen({ profile, onBack }) {
  const got = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;
  return (
    <Panel title={`Achievements · ${got}/${ACHIEVEMENTS.length}`} onBack={onBack} wide>
      <div className="thp-ach">
        {ACHIEVEMENTS.map((a) => {
          const at = profile.achievements[a.id];
          return (
            <div key={a.id} className={`thp-ach__item${at ? " is-done" : ""}`}>
              <span className="thp-ach__icon" aria-hidden="true">{at ? "★" : "☆"}</span>
              <div>
                <b>{a.name}</b>
                <small>{a.desc}</small>
              </div>
              <em>{at ? new Date(at).toLocaleDateString() : `+${a.xp} XP`}</em>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const SLOTS = [
  { slot: "theme", title: "Table", list: THEMES },
  { slot: "cardBack", title: "Card backs", list: CARD_BACKS },
  { slot: "chips", title: "Chips", list: CHIP_SETS },
  { slot: "frame", title: "Avatar frames", list: FRAMES },
];

export function ThemesScreen({ profile, onPick, onBack }) {
  const [tab, setTab] = useState("theme");
  const cur = SLOTS.find((s) => s.slot === tab);
  return (
    <Panel title="Table Themes & Cosmetics" onBack={onBack} wide>
      <div className="thp-tabs">
        {SLOTS.map((s) => <button type="button" key={s.slot} className={tab === s.slot ? "is-on" : ""} onClick={() => setTab(s.slot)}>{s.title}</button>)}
      </div>
      <div className="thp-swatches">
        {cur.list.map((it) => {
          const open = isUnlocked(profile, it);
          const on = profile.cosmetics[tab] === it.id;
          return (
            <button type="button" key={it.id} className={`thp-swatch${on ? " is-on" : ""}${open ? "" : " is-locked"}`} disabled={!open} onClick={() => onPick(tab, it.id)}>
              <span className={`thp-swatch__art thp-swatch--${tab}`} data-theme={tab === "theme" ? it.id : undefined}>
                {tab === "theme" && <i className="thp-mini-felt" />}
                {tab === "cardBack" && <PlayingCard card={null} faceUp={false} back={it.id} size="sm" />}
                {tab === "chips" && <span className={`thp-chipset--${it.id} thp-swatch__chips`}>{[1000, 500, 100, 25].map((d) => <Chip key={d} denom={d} />)}</span>}
                {tab === "frame" && <Avatar name="You" human frame={it.id} />}
              </span>
              <b>{it.name}</b>
              <small>{open ? (on ? "Selected" : "Tap to use") : `Level ${it.level}`}</small>
            </button>
          );
        })}
      </div>
      <p className="thp-fine">Cosmetics only — they never affect cards or opponents.</p>
    </Panel>
  );
}

/* ------------------------------------------------------------ rules */

export const RANKING_EXAMPLES = [
  ["Royal Flush", "A, K, Q, J, 10 of one suit", "Ah Kh Qh Jh Th"],
  ["Straight Flush", "Five in a row, one suit", "9s 8s 7s 6s 5s"],
  ["Four of a Kind", "Four cards of one rank", "Qc Qd Qh Qs 7d"],
  ["Full House", "Three of a kind + a pair", "Kc Kd Kh 4s 4d"],
  ["Flush", "Any five of one suit", "Ad Jd 8d 5d 2d"],
  ["Straight", "Five in a row (A-2-3-4-5 counts)", "Tc 9d 8h 7s 6c"],
  ["Three of a Kind", "Three cards of one rank", "8c 8d 8s Kh 3d"],
  ["Two Pair", "Two different pairs", "Jc Js 5h 5d Ac"],
  ["One Pair", "Two cards of one rank", "Tc Th 9s 6d 2c"],
  ["High Card", "Nothing else — highest card plays", "Ac Qd 9h 6s 3c"],
];

export function Rankings({ compact = false }) {
  return (
    <ol className={`thp-ranks${compact ? " is-compact" : ""}`}>
      {RANKING_EXAMPLES.map(([name, desc, cards], i) => (
        <li key={name}>
          <span className="thp-ranks__n">{i + 1}</span>
          <div className="thp-ranks__txt"><b>{name}</b><small>{desc}</small></div>
          <span className="thp-ranks__cards">{parseCards(cards).map((c) => <PlayingCard key={c} card={c} size="xs" />)}</span>
        </li>
      ))}
    </ol>
  );
}

export function HowToPlay({ onBack }) {
  const [tab, setTab] = useState("rules");
  return (
    <Panel title="How to Play" onBack={onBack} wide>
      <div className="thp-tabs">
        {[["rules", "Rules"], ["betting", "Betting"], ["ranks", "Hand Rankings"], ["players", "Opponents"]].map(([k, l]) => (
          <button type="button" key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "rules" && (
        <ul className="thp-how">
          <li>Everyone gets two private <b>hole cards</b>. Five shared <b>community cards</b> are dealt face up: three on the <b>flop</b>, one on the <b>turn</b>, one on the <b>river</b> (a card is burned before each).</li>
          <li>Your hand is the <b>best five cards</b> out of your two plus the five on the board — you may use both, one or none of your hole cards.</li>
          <li>Win the pot by having the best hand at <b>showdown</b>, or by betting so that everyone else folds.</li>
          <li>The <b>dealer button</b> moves one seat left every hand. The two players to its left post the <b>small</b> and <b>big blind</b>. Heads-up, the button posts the small blind and acts first before the flop.</li>
          <li>If players are all-in for different amounts, extra chips form <b>side pots</b> that only the players who covered them can win. Ties split the pot; an odd chip goes to the first winner left of the button.</li>
        </ul>
      )}
      {tab === "betting" && (
        <ul className="thp-how">
          <li><b>Fold</b> — give up the hand and any chips already in the pot.</li>
          <li><b>Check</b> — pass, only when nobody has bet this round.</li>
          <li><b>Call</b> — match the current bet (or go all-in for less if that's all you have).</li>
          <li><b>Bet</b> — open the betting; the minimum is one big blind.</li>
          <li><b>Raise</b> — increase the bet by at least the size of the last bet or raise (No-Limit: up to your whole stack).</li>
          <li><b>All-in</b> — commit every chip. An all-in raise smaller than a full raise doesn't reopen the betting for players who already acted.</li>
          <li>A round ends when everyone still in has matched the highest bet. Your turn timer auto-checks (or folds) when it runs out.</li>
        </ul>
      )}
      {tab === "ranks" && <Rankings />}
      {tab === "players" && (
        <div className="thp-opps">
          {Object.values(PROFILES).map((p) => (
            <div key={p.id} className="thp-opp">
              <Avatar name={p.name} color={p.color} />
              <div><b>{p.name}</b><small>{p.style}</small></div>
            </div>
          ))}
          <p className="thp-fine">Difficulty changes how they think: Easy reads hands loosely and makes mistakes; Medium uses position, pot odds and sensible ranges; Hard narrows your range from your actions, tracks your tendencies, picks bluffs by board texture and manages its stack.</p>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ settings */

export function SettingsScreen({ profile, onSet, onBack, onReset }) {
  const s = profile.settings;
  const [armed, setArmed] = useState(false);
  const Toggle = ({ k, label, desc }) => (
    <label className="thp-toggle">
      <span><b>{label}</b>{desc && <small>{desc}</small>}</span>
      <input type="checkbox" checked={!!s[k]} onChange={(e) => onSet(k, e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
  return (
    <Panel title="Settings" onBack={onBack}>
      <Seg label="Turn timer" value={s.timer} options={[{ value: 0, label: "Off" }, { value: 15, label: "15s" }, { value: 30, label: "30s" }, { value: 60, label: "60s" }]} onChange={(v) => onSet("timer", v)} />
      <Seg label="Game speed" value={s.speed} options={["slow", "normal", "fast"]} onChange={(v) => onSet("speed", v)} />
      <Toggle k="autoNext" label="Auto-deal next hand" desc="Start the next hand automatically after a short pause." />
      <Toggle k="hints" label="Hand strength label" desc="Show what your current hand is." />
      <Toggle k="fourColor" label="Four-color deck" desc="Diamonds blue, clubs green — easier to read." />
      <Toggle k="reducedMotion" label="Reduced motion" desc="Turn off dealing, flipping and chip animations." />
      <Toggle k="ambient" label="Poker-room ambience" desc="Soft background room sound." />
      <div className="thp-row">
        <button type="button" className={`thp-btn thp-btn--sm${armed ? " thp-btn--danger" : ""}`} onClick={() => (armed ? (onReset(), setArmed(false)) : setArmed(true))}>
          {armed ? "Tap again to erase all progress" : "Reset progress"}
        </button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ results */

export function TournamentResult({ session, standings, onAgain, onMenu, profile }) {
  const o = session.over;
  const tier = TIERS[session.tour.tier];
  const won = o.place === 1;
  return (
    <div className="thp-screen thp-screen--result">
      {won && <div className="thp-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>}
      <div className={`thp-panel thp-panel--result${won ? " is-win" : ""}`}>
        <p className="thp-tag">{tier.name.toUpperCase()}</p>
        <h2>{won ? "Champion!" : `You finished #${o.place}`}</h2>
        <div className="thp-result__rewards">
          <span><b>{o.prize ? `+${fmt(o.prize)}` : "0"}</b><small>prize chips</small></span>
          <span><b>+{fmt(o.xp)}</b><small>XP</small></span>
          <span><b>{levelInfo(profile.xp).level}</b><small>level</small></span>
        </div>
        <ol className="thp-standings">
          {o.pendingSim ? <li className="thp-standings__wait">Playing out the remaining hands…</li> : standings.map((r, k) => (
            <li key={r.id} className={r.id === "you" ? "is-you" : ""}>
              <span>{r.place ?? k + 1}</span><b>{r.id === "you" ? "You" : r.name}</b>
              <em>{r.place && r.place <= 3 ? `${fmt(Math.floor(session.tour.prizePool * PAYOUTS[r.place - 1]))}` : ""}</em>
            </li>
          ))}
        </ol>
        <div className="thp-row">
          <button type="button" className="thp-btn thp-btn--gold" onClick={onAgain}>Play Again</button>
          <button type="button" className="thp-btn" onClick={onMenu}>Main Menu</button>
        </div>
      </div>
    </div>
  );
}

export { ChipStack };
