/**
 * Menu screens and overlays for Shadow Arena. Pure presentational
 * components: all state lives in ShadowArena.jsx and comes in as props.
 */
import { useEffect, useRef } from "react";
import { FIGHTERS, FIGHTER_BY_ID, ARENAS, ROUND_TIMES } from "../engine/data.js";
import { makeFighter } from "../engine/fight.js";
import { drawFighter } from "../render/fighterArt.js";
import { bakeArena } from "../render/arenas.js";
import { BATTLES, TIERS } from "../data/arcade.js";

/* ------------------------------------------------------------ portraits */

export function Portrait({ id, alt = false, mirror = false, animate = false, pose = "idle", className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const def = FIGHTER_BY_ID[id];
    const f = makeFighter(def, mirror ? 1 : 0, { alt });
    f.x = 80;
    f.face = mirror ? -1 : 1;
    f.state = pose;
    const ctx = c.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 160 * dpr;
    c.height = 190 * dpr;
    let raf = 0;
    const t0 = performance.now();
    const paint = (now) => {
      const time = (now - t0) / 1000;
      f.t = Math.floor(time * 60);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 160, 190);
      const s = 1.2 / def.scale;
      ctx.translate(80, 0);
      ctx.scale(s, s);
      ctx.translate(-80, 0);
      drawFighter(ctx, f, 182 / s, time);
      if (animate) raf = requestAnimationFrame(paint);
    };
    paint(t0);
    return () => cancelAnimationFrame(raf);
  }, [id, alt, mirror, animate, pose]);
  return <canvas ref={ref} className={`sa-portrait ${className}`} aria-hidden="true" />;
}

const thumbCache = new Map();
export function ArenaThumb({ id }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!thumbCache.has(id)) thumbCache.set(id, bakeArena(id, 0.4));
    const img = thumbCache.get(id);
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
  }, [id]);
  return <canvas ref={ref} className="sa-thumb" aria-hidden="true" />;
}

/* ------------------------------------------------------------ controls */

export function Keys({ side, compact = false }) {
  const k = side === 0
    ? [["A", "D", "Move"], ["W", null, "Jump"], ["S", null, "Block"], ["F", null, "Punch"], ["G", null, "Kick"], ["H", null, "Special"]]
    : [["←", "→", "Move"], ["↑", null, "Jump"], ["↓", null, "Block"], ["J", null, "Punch"], ["K", null, "Kick"], ["L", null, "Special"]];
  return (
    <div className={`sa-keys${compact ? " is-compact" : ""}`}>
      {k.map(([a, b, label]) => (
        <div key={label} className="sa-key">
          <span>
            <kbd>{a}</kbd>
            {b && <kbd>{b}</kbd>}
          </span>
          <em>{label}</em>
        </div>
      ))}
      {side === 1 && !compact && <small className="sa-alt">Alt: Numpad 1 / 2 / 3 = Punch / Kick / Special</small>}
    </div>
  );
}

/* ------------------------------------------------------------ menu */

const touchOnly = typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

export function MainMenu({ save, onPlay, onHelp, onSettings }) {
  const s = save.stats;
  return (
    <div className="sa-screen sa-screen--menu">
      <div className="sa-logo">
        <span className="sa-logo-top">Shadow Arena</span>
        <span className="sa-logo-sub">Ultimate Fighters</span>
      </div>
      <p className="sa-tag">Choose Your Fighter. Defeat Your Rival.</p>
      <div className="sa-menu-btns">
        <button type="button" className="sa-btn sa-btn--big" onClick={onPlay}>Play</button>
        <button type="button" className="sa-btn" onClick={onHelp}>How to Play</button>
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onSettings}>Settings</button>
      </div>
      {touchOnly && <p className="sa-warn">Shadow Arena is played with a keyboard — connect one to fight.</p>}
      <small className="sa-foot">
        Arcade {save.arcade.cleared.length}/30 cleared · VS matches {s.vsMatches} (P1 {s.vsP1} · P2 {s.vsP2}{s.vsDraws ? ` · draws ${s.vsDraws}` : ""})
      </small>
    </div>
  );
}

export function ModeSelect({ cursor, onPick, onBack, save }) {
  const modes = [
    { id: "vs", title: "2 Player VS", text: "Two players, one keyboard. Pick fighters and an arena — best of 3 rounds.", icon: "⚔" },
    { id: "arcade", title: "Arcade", text: `Climb 30 battles against the AI, from novice to champion. ${save.arcade.cleared.length}/30 cleared.`, icon: "🏆" },
  ];
  return (
    <div className="sa-screen">
      <h2 className="sa-h2">Select Mode</h2>
      <div className="sa-modes">
        {modes.map((m, i) => (
          <button key={m.id} type="button" className={`sa-mode${cursor === i ? " is-cursor" : ""}`} onClick={() => onPick(m.id)}>
            <span className="sa-mode-icon">{m.icon}</span>
            <strong>{m.title}</strong>
            <span>{m.text}</span>
          </button>
        ))}
      </div>
      <div className="sa-row">
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onBack}>← Back</button>
      </div>
      <small className="sa-foot">A/D or ←/→ to choose · F, J or Enter to confirm</small>
    </div>
  );
}

/* ------------------------------------------------------------ fighters */

function Stat({ label, v }) {
  return (
    <div className="sa-stat">
      <span>{label}</span>
      <i>{[1, 2, 3, 4, 5].map((n) => <b key={n} className={n <= v ? "on" : ""} />)}</i>
    </div>
  );
}

function SidePanel({ side, id, locked, mode, alt }) {
  const def = FIGHTER_BY_ID[id];
  const label = mode === "arcade" ? (side === 0 ? "You" : "AI") : `Player ${side + 1}`;
  return (
    <div className={`sa-side sa-side--p${side + 1}${locked ? " is-locked" : ""}`}>
      <div className="sa-side-tag">{label}{locked ? " · READY" : ""}</div>
      <Portrait id={id} alt={alt} mirror={side === 1} animate pose={locked ? "win" : "idle"} className="sa-portrait--big" />
      <div className="sa-side-name">{def.name}</div>
      <div className="sa-side-special">
        <b>{def.special}</b> · {def.specialHint}
      </div>
      <div className="sa-stats">
        <Stat label="Power" v={def.stats.power} />
        <Stat label="Speed" v={def.stats.speed} />
        <Stat label="Range" v={def.stats.range} />
      </div>
      {(mode === "vs" || side === 0) && <Keys side={side} compact />}
    </div>
  );
}

export function FighterSelect({ mode, sel, onClickFighter, onBack }) {
  const p2same = FIGHTERS[sel.cur[0]].id === FIGHTERS[sel.cur[1]].id;
  return (
    <div className="sa-screen sa-screen--select">
      <h2 className="sa-h2">{mode === "vs" ? "Choose Your Fighters" : "Choose Your Fighter"}</h2>
      <div className="sa-select">
        <SidePanel side={0} id={FIGHTERS[sel.cur[0]].id} locked={sel.locked[0]} mode={mode} />
        <div className="sa-grid">
          {FIGHTERS.map((f, i) => {
            const c0 = sel.cur[0] === i;
            const c1 = mode === "vs" && sel.cur[1] === i;
            return (
              <button key={f.id} type="button" className={`sa-card${c0 ? " is-p1" : ""}${c1 ? " is-p2" : ""}`} onClick={() => onClickFighter(i)} aria-label={f.name}>
                <Portrait id={f.id} />
                <span className="sa-card-name">{f.short}</span>
                {c0 && <i className="sa-cursor sa-cursor--p1">{mode === "vs" ? "P1" : "YOU"}</i>}
                {c1 && <i className="sa-cursor sa-cursor--p2">P2</i>}
              </button>
            );
          })}
        </div>
        {mode === "vs" ? (
          <SidePanel side={1} id={FIGHTERS[sel.cur[1]].id} locked={sel.locked[1]} mode={mode} alt={p2same} />
        ) : (
          <div className="sa-side sa-side--info">
            <div className="sa-side-tag">Arcade</div>
            <p>Your fighter takes on 30 AI opponents across five tiers. Lose a battle and you can retry it as often as you like.</p>
            <Keys side={0} />
            <p className="sa-note">Arrow keys + J also work in menus.</p>
          </div>
        )}
      </div>
      <div className="sa-row">
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onBack}>← Back</button>
      </div>
      <small className="sa-foot">
        {mode === "vs" ? "P1: A/D/W/S + F to lock, G to undo · P2: arrows + J to lock, K to undo · or click a fighter" : "A/D/W/S + F to choose · click a fighter"}
      </small>
    </div>
  );
}

/* ------------------------------------------------------------ arena */

export function ArenaSelect({ cursor, onPick, onBack, fighters }) {
  return (
    <div className="sa-screen">
      <h2 className="sa-h2">Choose the Arena</h2>
      <p className="sa-sub">
        {FIGHTER_BY_ID[fighters[0]].name} <span className="sa-vs">VS</span> {FIGHTER_BY_ID[fighters[1]].name}
      </p>
      <div className="sa-arenas">
        {ARENAS.map((a, i) => (
          <button key={a.id} type="button" className={`sa-arena${cursor === i ? " is-cursor" : ""}`} style={{ "--accent": a.accent }} onClick={() => onPick(i)}>
            <ArenaThumb id={a.id} />
            <strong>{a.name}</strong>
            <span>{a.blurb}</span>
          </button>
        ))}
        <button type="button" className={`sa-arena sa-arena--random${cursor === 4 ? " is-cursor" : ""}`} onClick={() => onPick(4)}>
          <span className="sa-random">?</span>
          <strong>Random</strong>
          <span>Let fate decide</span>
        </button>
      </div>
      <div className="sa-row">
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onBack}>← Fighters</button>
      </div>
      <small className="sa-foot">Either player: A/D or ←/→ to choose · F, J or Enter to fight</small>
    </div>
  );
}

/* ------------------------------------------------------------ arcade ladder */

export function Ladder({ save, cursor, onPick, onChangeFighter, onBack }) {
  const a = save.arcade;
  const me = FIGHTER_BY_ID[a.fighter];
  return (
    <div className="sa-screen sa-screen--ladder">
      <h2 className="sa-h2">Arcade Ladder</h2>
      <p className="sa-sub">
        Fighting as <b>{me.name}</b> · {a.cleared.length}/30 cleared{a.completions ? ` · completed ${a.completions}×` : ""}
      </p>
      <div className="sa-ladder">
        {TIERS.map((tier, t) => (
          <div key={tier} className="sa-tier">
            <span className="sa-tier-name">{tier}</span>
            {BATTLES.slice(t * 6, t * 6 + 6).map((b) => {
              const open = b.id <= a.unlocked;
              const done = a.cleared.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={!open}
                  className={`sa-rung${done ? " is-done" : ""}${open ? "" : " is-locked"}${b.boss ? " is-boss" : ""}${cursor === b.id - 1 ? " is-cursor" : ""}`}
                  onClick={() => onPick(b.id)}
                  title={open ? `${b.id}. ${FIGHTER_BY_ID[b.opp].name} · ${b.arena}` : "Locked"}
                >
                  <b>{b.id}</b>
                  {open ? <Portrait id={b.opp} mirror /> : <span className="sa-lock">🔒</span>}
                  {open && <span>{FIGHTER_BY_ID[b.opp].short}</span>}
                  {done && <i className="sa-check">✓</i>}
                  {b.boss && <i className="sa-boss">BOSS</i>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sa-row">
        <button type="button" className="sa-btn sa-btn--big" onClick={() => onPick(Math.min(a.unlocked, 30))}>
          {a.cleared.length >= 30 ? "Replay Battle 30" : `Fight Battle ${Math.min(a.unlocked, 30)}`}
        </button>
        <button type="button" className="sa-btn" onClick={onChangeFighter}>Change Fighter</button>
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onBack}>Main Menu</button>
      </div>
      <small className="sa-foot">A/D/W/S or arrows to browse · F, J or Enter to fight</small>
    </div>
  );
}

/* ------------------------------------------------------------ overlays */

export function PauseMenu({ mode, onResume, onRestart, onFighters, onMenu, onLadder }) {
  return (
    <div className="sa-screen sa-screen--modal">
      <h2 className="sa-h2">Paused</h2>
      <div className="sa-menu-btns">
        <button type="button" className="sa-btn sa-btn--big" onClick={onResume}>Resume</button>
        <button type="button" className="sa-btn" onClick={onRestart}>Restart Match</button>
        {mode === "arcade" ? (
          <button type="button" className="sa-btn" onClick={onLadder}>Arcade Ladder</button>
        ) : (
          <button type="button" className="sa-btn" onClick={onFighters}>Change Fighters</button>
        )}
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onMenu}>Main Menu</button>
      </div>
      <div className="sa-pause-keys">
        <Keys side={0} compact />
        {mode === "vs" && <Keys side={1} compact />}
      </div>
      <small className="sa-foot">Esc / P to resume</small>
    </div>
  );
}

export function ResultScreen({ mode, match, battle, names, onRematch, onNext, onFighters, onLadder, onMenu }) {
  const w = match.winner;
  const f = match.f;
  const human = mode === "arcade";
  const won = human && w === 0;
  const title = w < 0 ? "Draw!" : human ? (won ? "Victory!" : "Defeat") : `${names[w]} Wins!`;
  const last = battle && battle.id === 30;
  return (
    <div className={`sa-screen sa-screen--modal sa-screen--result${won || (!human && w >= 0) ? " is-win" : ""}`}>
      {human && <p className="sa-sub">Battle {battle.id} · {battle.tierName}{battle.boss ? " Boss" : ""}</p>}
      <h2 className="sa-h2 sa-h2--big">{title}</h2>
      {human && won && last && <p className="sa-badge">★ Arcade Champion! All 30 battles conquered ★</p>}
      {w >= 0 && <Portrait id={f[w].def.id} alt={f[w].pal === f[w].def.alt} mirror={w === 1} animate pose="win" className="sa-portrait--result" />}
      <div className="sa-score">
        <div>
          <span>{names[0]}</span>
          <strong>{match.wins[0]}</strong>
          <small>{f[0].stats.hits} hits · {f[0].stats.dmg} dmg</small>
        </div>
        <div className="sa-score-vs">—</div>
        <div>
          <span>{names[1]}</span>
          <strong>{match.wins[1]}</strong>
          <small>{f[1].stats.hits} hits · {f[1].stats.dmg} dmg</small>
        </div>
      </div>
      <div className="sa-menu-btns sa-menu-btns--row">
        {human ? (
          <>
            {won && !last ? (
              <button type="button" className="sa-btn sa-btn--big" onClick={onNext}>Next Battle →</button>
            ) : (
              <button type="button" className="sa-btn sa-btn--big" onClick={onRematch}>{won ? "Fight Again" : "Retry Battle"}</button>
            )}
            <button type="button" className="sa-btn" onClick={onLadder}>Arcade Ladder</button>
          </>
        ) : (
          <>
            <button type="button" className="sa-btn sa-btn--big" onClick={onRematch}>Rematch</button>
            <button type="button" className="sa-btn" onClick={onFighters}>Change Fighters</button>
          </>
        )}
        <button type="button" className="sa-btn sa-btn--ghost" onClick={onMenu}>Main Menu</button>
      </div>
      <small className="sa-foot">Enter: {human ? (won && !last ? "next battle" : "retry") : "rematch"}</small>
    </div>
  );
}

export function HelpOverlay({ onClose }) {
  return (
    <div className="sa-screen sa-screen--modal sa-screen--help">
      <h2 className="sa-h2">How to Play</h2>
      <div className="sa-help">
        <div className="sa-help-col sa-help-col--p1">
          <h3>Player 1</h3>
          <Keys side={0} />
        </div>
        <div className="sa-help-col sa-help-col--p2">
          <h3>Player 2</h3>
          <Keys side={1} />
        </div>
      </div>
      <ul className="sa-help-list">
        <li>Win 2 rounds to take the match. A round ends on a K.O. or when the timer runs out (most health wins).</li>
        <li>Hold <b>Block</b> to stop punches and kicks completely. Specials still chip a little through a guard. You can&apos;t attack while blocking or block in the air.</li>
        <li>Each fighter has one <b>Special</b> with a cooldown — watch the meter under your health bar.</li>
        <li>Every attack hits once. After being hit you flash briefly and can&apos;t be hit again for a moment.</li>
        <li>Both players can move, jump, block and attack at the same time. Some keyboards can&apos;t register many keys at once — Player 2 can use Numpad 1/2/3 to attack instead.</li>
        <li><kbd>Esc</kbd> / <kbd>P</kbd> pauses.</li>
      </ul>
      <button type="button" className="sa-btn" onClick={onClose}>Got it</button>
    </div>
  );
}

export function SettingsOverlay({ save, onChange, onReset, confirmReset, setConfirmReset, onClose }) {
  const s = save.settings;
  return (
    <div className="sa-screen sa-screen--modal">
      <h2 className="sa-h2">Settings</h2>
      <div className="sa-settings">
        <div className="sa-setting">
          <span>Sound</span>
          <button type="button" className={`sa-toggle${s.sound ? " is-on" : ""}`} onClick={() => onChange({ sound: !s.sound })}>
            {s.sound ? "On" : "Off"}
          </button>
        </div>
        <div className="sa-setting">
          <span>Round time (VS)</span>
          <div className="sa-seg">
            {ROUND_TIMES.map((t) => (
              <button key={t} type="button" className={s.roundTime === t ? "is-on" : ""} onClick={() => onChange({ roundTime: t })}>
                {t}s
              </button>
            ))}
          </div>
        </div>
        <div className="sa-setting">
          <span>Arcade progress</span>
          {confirmReset ? (
            <span className="sa-confirm">
              <button type="button" className="sa-danger" onClick={onReset}>Erase</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="sa-toggle" onClick={() => setConfirmReset(true)}>Reset…</button>
          )}
        </div>
      </div>
      <button type="button" className="sa-btn" onClick={onClose}>Done</button>
    </div>
  );
}
