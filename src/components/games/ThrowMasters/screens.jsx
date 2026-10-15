/**
 * Throw Masters — menu screens, HUD and overlays (plain React + CSS). The
 * main component owns the state; these are presentational and call back up.
 */
import { useEffect, useRef, useState } from "react";
import { CHARACTERS, CHAR_BY_ID, WEAPONS, SKINS, SKIN_BY_ID, DIFFICULTY, ARENAS, TOURNAMENT, TARGET_THROWS } from "./data.js";
import { drawPortrait, drawFighter, drawWeapon, stubFighter } from "./art.js";

const NO_RAF = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tmtest");

/* ---------------------------------------------------------------- small pieces */

export function Coins({ value, className = "" }) {
  return (
    <span className={`tm-coins ${className}`}>
      <i className="tm-coin" aria-hidden="true" />
      <b>{value}</b>
    </span>
  );
}

export function Portrait({ char, size = 64, skin = null, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    drawPortrait(c, char, size, skin);
  }, [char, size, skin]);
  return <canvas ref={ref} className={`tm-portrait ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Animated full-body preview: idle → aim → throw loop. */
function FighterPreview({ char, skin }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const c = cv.getContext("2d");
    const f = stubFighter(char, skin);
    let raf = 0;
    let t0 = 0;
    const draw = (now) => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      const cyc = t % 4.2;
      if (cyc < 1.6) {
        f.anim = "idle";
        f.animT = cyc;
        f.holding = true;
        f.blink = Math.sin(t * 1.7) > 0.97 ? -0.05 : 1;
      } else if (cyc < 2.9) {
        f.anim = "aim";
        f.animT = cyc - 1.6;
        f.aimAngle = 38;
        f.aimPower = Math.min(1, (cyc - 1.6) / 1.1);
        f.holding = true;
      } else {
        f.anim = "throw";
        f.animT = cyc - 2.9;
        f.holding = cyc > 3.8;
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      const s = h / 230;
      c.setTransform(s, 0, 0, s, w * 0.44, h * 0.93);
      drawFighter(c, f, t);
      if (!NO_RAF) raf = requestAnimationFrame(draw);
    };
    if (NO_RAF) draw(1000);
    else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [char, skin]);
  return <canvas ref={ref} className="tm-preview" aria-hidden="true" />;
}

function WeaponIcon({ id, skin, size = 56 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const len = { spear: 120, arrow: 74, axe: 60, hammer: 70, knives: 44 }[id] || 46;
    const s = (size * 0.9) / len;
    c.translate(size / 2, size / 2);
    c.rotate(-Math.PI / 4);
    c.scale(s, s);
    drawWeapon(c, id, skin, 0.3);
  }, [id, skin, size]);
  return <canvas ref={ref} className="tm-wicon" style={{ width: size, height: size }} aria-hidden="true" />;
}

function Bar({ label, value }) {
  return (
    <div className="tm-stat">
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.round(Math.max(0.06, Math.min(1, value)) * 100)}%` }} />
      </i>
    </div>
  );
}

function statsFor(c) {
  const w = WEAPONS[c.weapon];
  const dmg = w.blast ? w.blast.dmg : w.dmg * (w.count || 1) + (w.burst ? w.burst.dmg : 0);
  return [
    ["Health", (c.hp - 70) / 60],
    ["Damage", dmg / 38],
    ["Speed", (w.speed * c.power - 1050) / 500],
    ["Precision", (c.prec - 0.7) / 0.7],
    ["Weight", (w.grav - 0.1) / 1.3],
  ];
}

/* ---------------------------------------------------------------- menu */

export function MainMenu({ coins, onNav }) {
  const items = [
    ["play", "PLAY", "primary"],
    ["tournament", "TOURNAMENT"],
    ["target", "TARGET CHALLENGE"],
    ["local", "LOCAL 2 PLAYER"],
    ["chars", "CHARACTERS"],
    ["how", "HOW TO PLAY"],
  ];
  return (
    <div className="tm-veil tm-veil--menu">
      <div className="tm-topbar">
        <Coins value={coins} />
        <button type="button" className="tm-icon-btn" onClick={() => onNav("settings")} aria-label="Settings">
          ⚙
        </button>
      </div>
      <div className="tm-menu">
        <p className="tm-kicker">AIM • THROW • WIN</p>
        <h1 className="tm-title">
          THROW <em>MASTERS</em>
        </h1>
        <div className="tm-menu__list">
          {items.map(([id, label, kind]) => (
            <button key={id} type="button" className={`tm-btn ${kind === "primary" ? "tm-btn--primary tm-btn--big" : ""}`} onClick={() => onNav(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- character select */

export function CharacterSelect({ progress, purpose, title, onBack, onConfirm, onUnlock, onSkin, exclude = null }) {
  const [focus, setFocus] = useState(progress.selected);
  const [tab, setTab] = useState("fighters");
  const c = CHAR_BY_ID[focus];
  const owned = progress.unlocked.includes(focus);
  const w = WEAPONS[c.weapon];
  const skin = SKIN_BY_ID[progress.skin];
  const canAfford = progress.coins >= c.price;
  const confirmLabel = purpose === "browse" ? "SELECT" : "CONTINUE";
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-chars">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>{title}</h2>
          <Coins value={progress.coins} />
        </header>
        <div className="tm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "fighters"} className={tab === "fighters" ? "is-on" : ""} onClick={() => setTab("fighters")}>
            FIGHTERS
          </button>
          <button type="button" role="tab" aria-selected={tab === "skins"} className={tab === "skins" ? "is-on" : ""} onClick={() => setTab("skins")}>
            WEAPON SKINS
          </button>
        </div>
        {tab === "fighters" ? (
          <div className="tm-chars__body">
            <div className="tm-chars__hero">
              <FighterPreview char={c} skin={skin} />
              <div className="tm-chars__info">
                <h3>{c.name}</h3>
                <p className="tm-chars__title">{c.title}</p>
                <div className="tm-chars__weapon">
                  <WeaponIcon id={c.weapon} skin={skin} size={40} />
                  <div>
                    <b>{w.name}</b>
                    <span>{w.blurb}</span>
                  </div>
                </div>
                {statsFor(c).map(([l, v]) => (
                  <Bar key={l} label={l} value={v} />
                ))}
              </div>
            </div>
            <div className="tm-chars__grid">
              {CHARACTERS.map((ch) => {
                const own = progress.unlocked.includes(ch.id);
                const blocked = exclude === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`tm-card${focus === ch.id ? " is-focus" : ""}${own ? "" : " is-locked"}${progress.selected === ch.id && purpose !== "p2" ? " is-selected" : ""}`}
                    onClick={() => setFocus(ch.id)}
                    aria-label={`${ch.name}${own ? "" : ", locked"}`}
                    disabled={blocked}
                  >
                    <Portrait char={ch} size={58} />
                    <span className="tm-card__name">{ch.name}</span>
                    {!own && (
                      <span className="tm-card__price">
                        🔒 <Coins value={ch.price} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <SkinShop progress={progress} weapon={c.weapon} onSkin={onSkin} />
        )}
        <footer className="tm-foot">
          {tab === "fighters" &&
            (owned ? (
              <button type="button" className="tm-btn tm-btn--primary" onClick={() => onConfirm(focus)}>
                {confirmLabel}
              </button>
            ) : (
              <button type="button" className="tm-btn tm-btn--gold" disabled={!canAfford} onClick={() => onUnlock(focus)}>
                UNLOCK FOR <Coins value={c.price} />
              </button>
            ))}
          {tab === "fighters" && !owned && !canAfford && <span className="tm-foot__note">Win battles to earn more coins</span>}
        </footer>
      </div>
    </div>
  );
}

function SkinShop({ progress, weapon, onSkin }) {
  return (
    <div className="tm-skins">
      {SKINS.map((s) => {
        const own = progress.skins.includes(s.id);
        const on = progress.skin === s.id;
        return (
          <div key={s.id} className={`tm-skin${on ? " is-on" : ""}`}>
            <WeaponIcon id={weapon} skin={s} size={64} />
            <b>{s.name}</b>
            {on ? (
              <span className="tm-skin__tag">EQUIPPED</span>
            ) : own ? (
              <button type="button" className="tm-btn tm-btn--small" onClick={() => onSkin(s.id, false)}>
                EQUIP
              </button>
            ) : (
              <button type="button" className="tm-btn tm-btn--small tm-btn--gold" disabled={progress.coins < s.price} onClick={() => onSkin(s.id, true)}>
                <Coins value={s.price} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- modes */

export function ModeSelect({ progress, onBack, onPick }) {
  const modes = [
    ["duel", "CLASSIC DUEL", "1v1 against the computer. Pick the difficulty and arena."],
    ["tournament", "TOURNAMENT", `30 battles, 5 arenas. ${progress.tournament}/30 cleared.`],
    ["target", "TARGET CHALLENGE", `${TARGET_THROWS} throws, score as many points as you can. Best: ${progress.bestTarget}.`],
    ["local", "LOCAL 2 PLAYER", "Two players take turns on one device."],
  ];
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-modes">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>CHOOSE MODE</h2>
          <Coins value={progress.coins} />
        </header>
        <div className="tm-modes__grid">
          {modes.map(([id, name, desc]) => (
            <button key={id} type="button" className={`tm-mode tm-mode--${id}`} onClick={() => onPick(id)}>
              <b>{name}</b>
              <span>{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DuelSetup({ onBack, onStart, title = "CLASSIC DUEL", showDifficulty = true }) {
  const [diff, setDiff] = useState("medium");
  const [arena, setArena] = useState("random");
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-setup">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>{title}</h2>
          <span />
        </header>
        {showDifficulty && (
          <>
            <p className="tm-label">DIFFICULTY</p>
            <div className="tm-seg" role="radiogroup" aria-label="Difficulty">
              {Object.values(DIFFICULTY).map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={diff === d.id} className={diff === d.id ? "is-on" : ""} onClick={() => setDiff(d.id)}>
                  {d.label}
                  <small>
                    win <Coins value={d.reward} />
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="tm-label">ARENA</p>
        <div className="tm-arenas" role="radiogroup" aria-label="Arena">
          {[{ id: "random", name: "Random" }, ...ARENAS].map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={arena === a.id} className={`tm-arena tm-arena--${a.id}${arena === a.id ? " is-on" : ""}`} onClick={() => setArena(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
        <footer className="tm-foot">
          <button type="button" className="tm-btn tm-btn--primary tm-btn--big" onClick={() => onStart({ difficulty: diff, arena })}>
            FIGHT!
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tournament */

export function TournamentMap({ progress, onBack, onStart }) {
  const next = progress.tournament;
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-tour">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>TOURNAMENT · {Math.min(next, 30)}/30</h2>
          <Coins value={progress.coins} />
        </header>
        <div className="tm-tour__rows">
          {ARENAS.map((a, ai) => (
            <div key={a.id} className={`tm-tour__row tm-arena--${a.id}`}>
              <span className="tm-tour__arena">{a.name}</span>
              <div className="tm-tour__nodes">
                {TOURNAMENT.slice(ai * 6, ai * 6 + 6).map((T) => {
                  const done = T.index < next;
                  const open = T.index <= next;
                  const opp = CHAR_BY_ID[T.opponent];
                  return (
                    <button
                      key={T.index}
                      type="button"
                      className={`tm-node${done ? " is-done" : ""}${T.index === next ? " is-next" : ""}${T.boss ? " is-boss" : ""}`}
                      disabled={!open}
                      onClick={() => onStart(T.index)}
                      aria-label={`Battle ${T.index + 1} versus ${opp.name}${done ? ", cleared" : open ? "" : ", locked"}`}
                      title={`Battle ${T.index + 1}: ${opp.name}${T.boss ? " (champion)" : ""}`}
                    >
                      {open ? <Portrait char={opp} size={40} /> : <span className="tm-node__lock">🔒</span>}
                      <span className="tm-node__n">{T.index + 1}</span>
                      {T.boss && <span className="tm-node__crown">♛</span>}
                      {done && <span className="tm-node__check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- how to / settings */

export function HowTo({ onBack }) {
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-how">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>HOW TO PLAY</h2>
          <span />
        </header>
        <div className="tm-how__body">
          <div className="tm-how__demo" aria-hidden="true">
            <span className="tm-how__fighter" />
            <span className="tm-how__arrow" />
            <span className="tm-how__hand" />
          </div>
          <ul>
            <li>
              <b>Aim:</b> press anywhere on the arena and <b>drag backwards</b> like a slingshot — the arrow points where your weapon will fly. (You can switch to “drag towards target” in Settings.)
            </li>
            <li>
              <b>Power:</b> the further you drag, the harder you throw. The ring and % show your power, the ° shows the angle.
            </li>
            <li>
              <b>Throw:</b> release. Drag back to your start point to cancel.
            </li>
            <li>
              <b>Hits:</b> headshots deal bonus damage, leg hits less. Watch the wind arrow in later battles.
            </li>
            <li>
              Every fighter has a unique weapon: bombs bounce then blow up, boomerangs hook back, shuriken ricochet once, fireballs and crystals burst on impact.
            </li>
            <li>Win battles to earn coins, then unlock new fighters and weapon skins.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Settings({ progress, onBack, onChange, onReset }) {
  const [confirm, setConfirm] = useState(false);
  const s = progress.settings;
  return (
    <div className="tm-veil">
      <div className="tm-panel tm-settings">
        <header className="tm-head">
          <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={onBack}>
            ← BACK
          </button>
          <h2>SETTINGS</h2>
          <span />
        </header>
        <p className="tm-label">AIM STYLE</p>
        <div className="tm-seg">
          <button type="button" className={s.aim === "pull" ? "is-on" : ""} onClick={() => onChange({ aim: "pull" })}>
            Pull back
            <small>slingshot</small>
          </button>
          <button type="button" className={s.aim === "point" ? "is-on" : ""} onClick={() => onChange({ aim: "point" })}>
            Point
            <small>drag towards target</small>
          </button>
        </div>
        <p className="tm-label">TRAJECTORY PREVIEW</p>
        <div className="tm-seg">
          <button type="button" className={s.preview ? "is-on" : ""} onClick={() => onChange({ preview: true })}>
            On
          </button>
          <button type="button" className={!s.preview ? "is-on" : ""} onClick={() => onChange({ preview: false })}>
            Off
          </button>
        </div>
        <p className="tm-label">SCREEN SHAKE</p>
        <div className="tm-seg">
          <button type="button" className={s.shake ? "is-on" : ""} onClick={() => onChange({ shake: true })}>
            On
          </button>
          <button type="button" className={!s.shake ? "is-on" : ""} onClick={() => onChange({ shake: false })}>
            Off
          </button>
        </div>
        <footer className="tm-foot">
          {confirm ? (
            <>
              <span className="tm-foot__note">Erase coins, unlocks and tournament progress?</span>
              <button type="button" className="tm-btn tm-btn--danger tm-btn--small" onClick={() => { setConfirm(false); onReset(); }}>
                YES, RESET
              </button>
              <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={() => setConfirm(false)}>
                CANCEL
              </button>
            </>
          ) : (
            <button type="button" className="tm-btn tm-btn--ghost tm-btn--small" onClick={() => setConfirm(true)}>
              RESET PROGRESS
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- battle HUD */

function FighterPanel({ f, hp, maxHp, right, label, active }) {
  const pct = Math.max(0, hp / maxHp);
  return (
    <div className={`tm-fp${right ? " tm-fp--right" : ""}${active ? " is-active" : ""}`}>
      <Portrait char={f.char} size={44} className="tm-fp__face" />
      <div className="tm-fp__main">
        <div className="tm-fp__name">
          <b>{label}</b>
          <span>{f.char.name}</span>
        </div>
        <div className={`tm-hp${pct < 0.3 ? " is-low" : ""}`}>
          <i className="tm-hp__lag" style={{ width: `${pct * 100}%` }} />
          <i className="tm-hp__fill" style={{ width: `${pct * 100}%` }} />
          <em>{hp}</em>
        </div>
      </div>
    </div>
  );
}

export function Hud({ battle, hud, info, onPause, turnBanner }) {
  if (!battle) return null;
  const [f0, f1] = battle.fighters;
  const wind = battle.world.wind;
  const target = battle.mode === "target";
  const local = battle.mode === "local";
  const cur = battle.fighters[hud.turn];
  let turnText = "";
  if (hud.phase === "intro") turnText = "GET READY";
  else if (hud.phase === "over" || hud.phase === "done") turnText = "";
  else if (target) turnText = "YOUR THROW";
  else if (local) turnText = `PLAYER ${hud.turn + 1}'S TURN`;
  else turnText = cur?.human ? "YOUR TURN" : "ENEMY TURN";
  return (
    <div className="tm-hud">
      <FighterPanel f={f0} hp={hud.hp[0]} maxHp={hud.maxHp[0]} label={local ? "P1" : "YOU"} active={hud.turn === 0 && hud.phase === "aim"} />
      <div className="tm-hud__mid">
        <span className="tm-hud__info">{info}</span>
        {turnText && <span className={`tm-hud__turn${hud.turn === 1 && !local ? " is-enemy" : ""}`}>{turnText}</span>}
        <div className="tm-hud__row">
          <button type="button" className="tm-icon-btn tm-hud__pause" onClick={onPause} aria-label="Pause">
            ❚❚
          </button>
          {wind !== 0 && (
            <span className="tm-wind" title="Wind">
              <i style={{ transform: `scaleX(${wind > 0 ? 1 : -1})` }}>➜</i>
              {Math.round(Math.abs(wind) / 10)}
            </span>
          )}
        </div>
      </div>
      {target ? (
        <div className="tm-fp tm-fp--right tm-score">
          <div className="tm-fp__main">
            <div className="tm-fp__name">
              <b>SCORE</b>
              <span>{hud.streak > 1 ? `streak x${hud.streak}` : ""}</span>
            </div>
            <strong>{hud.score}</strong>
            <span className="tm-score__throws">
              {Array.from({ length: TARGET_THROWS }, (_, i) => (
                <i key={i} className={i < hud.throwsLeft ? "is-left" : ""} />
              ))}
            </span>
          </div>
        </div>
      ) : (
        <FighterPanel f={f1} hp={hud.hp[1]} maxHp={hud.maxHp[1]} right label={local ? "P2" : "CPU"} active={hud.turn === 1 && hud.phase === "aim"} />
      )}
      {turnBanner && (
        <div key={turnBanner.key} className={`tm-banner${turnBanner.enemy ? " is-enemy" : ""}`}>
          {turnBanner.text}
        </div>
      )}
    </div>
  );
}

export function TutorialHint({ aim }) {
  return (
    <div className="tm-tutor" aria-live="polite">
      <div className="tm-tutor__demo" aria-hidden="true">
        <span className="tm-how__hand" />
      </div>
      <p>
        {aim === "pull" ? (
          <>
            <b>Press and drag backwards</b>, away from the enemy. Longer drag = more power. Release to throw!
          </>
        ) : (
          <>
            <b>Press and drag towards the enemy</b>. Longer drag = more power. Release to throw!
          </>
        )}
      </p>
    </div>
  );
}

export function PausePanel({ onResume, onRestart, onQuit }) {
  return (
    <div className="tm-veil tm-veil--dim">
      <div className="tm-panel tm-pause">
        <h2>PAUSED</h2>
        <button type="button" className="tm-btn tm-btn--primary" onClick={onResume}>
          RESUME
        </button>
        <button type="button" className="tm-btn" onClick={onRestart}>
          RESTART BATTLE
        </button>
        <button type="button" className="tm-btn tm-btn--ghost" onClick={onQuit}>
          QUIT TO MENU
        </button>
      </div>
    </div>
  );
}

export function ResultPanel({ result, onRetry, onNext, onMenu }) {
  const { title, sub, win, coins, rows } = result;
  return (
    <div className="tm-veil tm-veil--dim">
      <div className={`tm-panel tm-result${win ? " is-win" : " is-lose"}`}>
        <p className="tm-kicker">{sub}</p>
        <h2 className="tm-result__title">{title}</h2>
        {coins > 0 && (
          <div className="tm-result__coins">
            + <Coins value={coins} />
          </div>
        )}
        <dl className="tm-result__stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="tm-result__btns">
          {onNext && (
            <button type="button" className="tm-btn tm-btn--primary" onClick={onNext}>
              NEXT BATTLE
            </button>
          )}
          <button type="button" className={`tm-btn ${onNext ? "" : "tm-btn--primary"}`} onClick={onRetry}>
            {win ? "PLAY AGAIN" : "RETRY"}
          </button>
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

