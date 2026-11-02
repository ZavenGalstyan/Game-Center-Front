/**
 * Menu-side screens for Iron Fist. Pure presentational components: every
 * action goes back to the shell through props. The live 3D world renders
 * behind all of them (showcases), so panels stay translucent and compact.
 */
import { FIGHTERS, FIGHTER_BY_ID } from "../engine/fighters.js";
import { BATTLES, TOURNAMENTS, tierName } from "../engine/arcade.js";
import { ARENAS, ARENA_BY_ID } from "../render/arenas.js";

export function Portrait({ id, src, className = "", alt = false }) {
  const f = FIGHTER_BY_ID[id];
  return (
    <div className={`ifa-portrait ${className}`} style={{ "--fc": f?.color, "--fa": f?.accent }}>
      {src ? <img src={src} alt={f?.name} draggable={false} className={alt ? "ifa-alt" : ""} /> : <span>{f?.name?.[0]}</span>}
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div className="ifa-stat">
      <span>{label}</span>
      <i>
        {[1, 2, 3, 4, 5].map((k) => (
          <b key={k} className={k <= v ? "on" : ""} />
        ))}
      </i>
    </div>
  );
}

export function FighterInfo({ id, side = 0, tag }) {
  const f = FIGHTER_BY_ID[id];
  if (!f) return null;
  return (
    <div className={`ifa-info ifa-info--${side}`} style={{ "--fc": f.color, "--fa": f.accent }}>
      {tag && <div className="ifa-info__tag">{tag}</div>}
      <h2>{f.name}</h2>
      <h3>{f.title}</h3>
      <p className="ifa-info__style">{f.style}</p>
      <p className="ifa-info__blurb">{f.blurb}</p>
      <Stat label="Power" v={f.rating.power} />
      <Stat label="Speed" v={f.rating.speed} />
      <Stat label="Defense" v={f.rating.defense} />
      <Stat label="Range" v={f.rating.range} />
      <div className="ifa-info__special">
        <span>Special</span> {f.specialName}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- main menu */
export function MainMenu({ onArcade, onVs, onControls, save, quality, onQuality }) {
  const beaten = Object.keys(save.best).length;
  return (
    <div className="ifa-screen ifa-menu">
      <div className="ifa-logo">
        <div className="ifa-logo__top">IRON FIST</div>
        <div className="ifa-logo__sub">ARENA CHAMPIONS</div>
        <div className="ifa-logo__tag">Enter the Arena. Master Your Power.</div>
      </div>
      <nav className="ifa-menu__nav">
        <button className="ifa-btn ifa-btn--big" onClick={onArcade} data-k="arcade">
          <b>Arcade</b>
          <small>1 Player · 30 battles · {beaten}/30 won</small>
        </button>
        <button className="ifa-btn ifa-btn--big" onClick={onVs} data-k="vs">
          <b>Local VS</b>
          <small>2 Players · one keyboard</small>
        </button>
        <button className="ifa-btn" onClick={onControls}>
          Controls
        </button>
        <div className="ifa-quality">
          <span>Graphics</span>
          {["low", "medium", "high"].map((k) => (
            <button key={k} className={quality === k ? "on" : ""} onClick={() => onQuality(k)}>
              {k}
            </button>
          ))}
        </div>
      </nav>
      {save.champion && <div className="ifa-menu__crown">★ World Champion{save.champions.length ? ` · ${save.champions.map((c) => FIGHTER_BY_ID[c].name).join(", ")}` : ""}</div>}
      <div className="ifa-menu__hint">↑ ↓ choose · Enter select</div>
    </div>
  );
}

/* ---------------------------------------------------------------- controls */
const P1_ROWS = [
  ["Move", "A / D"],
  ["Jump", "W"],
  ["Block", "S (hold)"],
  ["Punch", "F"],
  ["Kick", "G"],
  ["Special", "H"],
  ["Dodge", "R / Left Shift"],
];
const P2_ROWS = [
  ["Move", "← / →"],
  ["Jump", "↑"],
  ["Block", "↓ (hold)"],
  ["Punch", "J"],
  ["Kick", "K"],
  ["Special", "L"],
  ["Dodge", "O / Right Shift"],
];
export function Controls({ onBack }) {
  return (
    <div className="ifa-screen ifa-controls">
      <h1 className="ifa-title">Controls</h1>
      <div className="ifa-controls__grid">
        <div className="ifa-panel">
          <h2 className="ifa-p1">Player 1</h2>
          <table>
            <tbody>
              {P1_ROWS.map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>
                    <kbd>{b}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ifa-panel">
          <h2 className="ifa-p2">Player 2</h2>
          <table>
            <tbody>
              {P2_ROWS.map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>
                    <kbd>{b}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ifa-panel ifa-controls__notes">
          <h2>Fighting</h2>
          <ul>
            <li>
              <b>3-hit combos:</b> press Punch or Kick again as each hit lands — P P P = Jab · Cross · Uppercut, K K K = Low · Mid · Roundhouse, mix them (P K K…). The third hit knocks down.
            </li>
            <li>
              <b>Special:</b> each fighter has one signature move with a cooldown (meter under the health bar).
            </li>
            <li>
              <b>Block</b> faces the opponent and stops normal hits; specials still chip.
            </li>
            <li>
              <b>Dodge</b> side-steps into the background with a short invincible window.
            </li>
            <li>Jump + Punch/Kick = flying kick. Low kicks pass under a jumper.</li>
            <li>
              <b>Esc</b> or <b>P</b> pauses. In Arcade either key set works.
            </li>
            <li className="dim">Some keyboards can't register many keys at once (ghosting). The two key groups are kept far apart to minimise this.</li>
          </ul>
        </div>
      </div>
      <button className="ifa-btn" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- fighter select */
export function FighterSelect({ mode, sel, portraits, onPick, onConfirm, onBack }) {
  const vs = mode === "vs";
  return (
    <div className="ifa-screen ifa-select">
      <h1 className="ifa-title">{vs ? "Choose Your Fighters" : "Select Your Fighter"}</h1>
      <div className="ifa-select__infos">
        <FighterInfo id={sel.p1} side={0} tag={vs ? (sel.ok1 ? "P1 READY" : "PLAYER 1") : "PLAYER"} />
        {vs && <FighterInfo id={sel.p2} side={1} tag={sel.ok2 ? "P2 READY" : "PLAYER 2"} />}
      </div>
      <div className="ifa-roster">
        {FIGHTERS.map((f) => {
          const a = sel.p1 === f.id;
          const b = vs && sel.p2 === f.id;
          return (
            <button
              key={f.id}
              className={`ifa-card ${a ? "is-p1" : ""} ${b ? "is-p2" : ""}`}
              style={{ "--fc": f.color, "--fa": f.accent }}
              onClick={() => onPick(f.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (vs) onPick(f.id, 1);
              }}
              onDoubleClick={() => onConfirm()}
            >
              <Portrait id={f.id} src={portraits[f.id]} />
              <span className="ifa-card__name">{f.name}</span>
              {a && <em className="ifa-card__p1">{vs ? (sel.ok1 ? "P1 ✓" : "P1") : "✓"}</em>}
              {b && <em className="ifa-card__p2">{sel.ok2 ? "P2 ✓" : "P2"}</em>}
            </button>
          );
        })}
      </div>
      <div className="ifa-select__bar">
        <button className="ifa-btn" onClick={onBack}>
          Back
        </button>
        <span className="ifa-select__keys">{vs ? "P1: A / D move · F ready · G cancel     P2: ← / → move · J ready · K cancel     (mouse: left-click P1, right-click P2)" : "A / D or ← / → choose · F, J or Enter confirm"}</span>
        <button className="ifa-btn ifa-btn--go" onClick={() => onConfirm()}>
          {vs ? (sel.ok1 && sel.ok2 ? "Continue" : "Ready") : "Confirm"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tournament ladder */
export function TournamentSelect({ save, fighter, battleId, portraits, onSelect, onFight, onFighter, onBack }) {
  const b = BATTLES[battleId - 1];
  const T = TOURNAMENTS[b.tIndex];
  const opp = FIGHTER_BY_ID[b.opponent];
  const best = save.best[b.id];
  const locked = b.id > save.unlocked;
  return (
    <div className="ifa-screen ifa-tour">
      <div className="ifa-tour__tabs">
        {TOURNAMENTS.map((t, i) => {
          const first = i * 10 + 1;
          const lock = first > save.unlocked;
          const won = BATTLES.slice(i * 10, i * 10 + 10).filter((x) => save.best[x.id]).length;
          return (
            <button key={t.id} className={`ifa-tab ${b.tIndex === i ? "on" : ""} ${lock ? "locked" : ""}`} style={{ "--tc": t.color }} onClick={() => !lock && onSelect(Math.min(save.unlocked, first + 9))}>
              <b>{t.name}</b>
              <small>{lock ? "🔒 Locked" : `${t.sub} · ${won}/10`}</small>
            </button>
          );
        })}
      </div>
      <div className="ifa-ladder" style={{ "--tc": T.color }}>
        {BATTLES.slice(b.tIndex * 10, b.tIndex * 10 + 10).map((x) => {
          const st = save.best[x.id]?.stars || 0;
          const lk = x.id > save.unlocked;
          return (
            <button key={x.id} className={`ifa-node ${x.id === b.id ? "on" : ""} ${lk ? "locked" : ""} ${x.boss ? "boss" : ""} ${st ? "won" : ""}`} onClick={() => onSelect(x.id)} title={`Battle ${x.id}`}>
              <Portrait id={x.opponent} src={portraits[x.opponent]} alt={x.opponent === fighter} />
              <span className="ifa-node__n">{x.boss ? "BOSS" : x.num}</span>
              <span className="ifa-node__stars">{lk ? "🔒" : "★".repeat(st) + "☆".repeat(3 - st)}</span>
            </button>
          );
        })}
      </div>
      <div className="ifa-tour__detail ifa-panel" style={{ "--fc": opp.color }}>
        <div className="ifa-tour__head">
          <span className="ifa-tour__label">
            {T.name} · Battle {b.num}/10
          </span>
          {b.boss && <span className="ifa-badge">BOSS</span>}
        </div>
        <h2>
          {fighter === b.opponent ? `Dark ${opp.name}` : opp.name}
          {b.title && <small> — {b.title}</small>}
        </h2>
        <p>
          {opp.style} · {opp.specialName}
        </p>
        <div className="ifa-tour__facts">
          <span>Arena: {ARENA_BY_ID[b.arena].name}</span>
          <span>Difficulty: {tierName(b.level)}</span>
          {b.boss && <span>+{Math.round((b.mods.hpMul - 1) * 100)}% health</span>}
          <span>Best: {best ? `${"★".repeat(best.stars)} · ${Math.round(best.hp * 100)}% hp` : "—"}</span>
        </div>
        <div className="ifa-tour__actions">
          <button className="ifa-btn" onClick={onBack}>
            Menu
          </button>
          <button className="ifa-btn" onClick={onFighter}>
            Fighter: {FIGHTER_BY_ID[fighter].name}
          </button>
          <button className="ifa-btn ifa-btn--go" disabled={locked} onClick={onFight}>
            {locked ? "Locked" : "Fight!"}
          </button>
        </div>
      </div>
      <div className="ifa-tour__hint">← / → battle · ↑ / ↓ tournament · Enter fight · Esc back</div>
    </div>
  );
}

/* ---------------------------------------------------------------- arena select */
export function ArenaSelect({ arena, onPick, onConfirm, onBack }) {
  return (
    <div className="ifa-screen ifa-arenas">
      <h1 className="ifa-title">Choose the Arena</h1>
      <div className="ifa-arenas__row">
        {ARENAS.map((a) => (
          <button key={a.id} className={`ifa-arena ${arena === a.id ? "on" : ""}`} style={{ "--ac": a.color }} onClick={() => onPick(a.id)} onDoubleClick={onConfirm}>
            <b>{a.name}</b>
            <small>{a.sub}</small>
          </button>
        ))}
      </div>
      <div className="ifa-select__bar">
        <button className="ifa-btn" onClick={onBack}>
          Back
        </button>
        <span className="ifa-select__keys">← / → choose · Enter, F or J fight</span>
        <button className="ifa-btn ifa-btn--go" onClick={onConfirm}>
          Fight!
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- versus splash */
export function Versus({ cfg, portraits }) {
  const [a, b] = cfg.fighters;
  const A = FIGHTER_BY_ID[a];
  const B = FIGHTER_BY_ID[b];
  const battle = cfg.battle ? BATTLES[cfg.battle - 1] : null;
  return (
    <div className="ifa-screen ifa-versus">
      <div className="ifa-versus__side ifa-versus__side--0" style={{ "--fc": A.color }}>
        <Portrait id={a} src={portraits[a]} className="ifa-portrait--xl" alt={cfg.alt?.[0]} />
        <h2>{A.name}</h2>
        <p>{cfg.mode === "vs" ? "Player 1" : A.title}</p>
      </div>
      <div className="ifa-versus__vs">VS</div>
      <div className="ifa-versus__side ifa-versus__side--1" style={{ "--fc": B.color }}>
        <Portrait id={b} src={portraits[b]} className="ifa-portrait--xl" alt={cfg.alt?.[1]} />
        <h2>{cfg.alt?.[1] && cfg.mode === "arcade" ? `Dark ${B.name}` : B.name}</h2>
        <p>{cfg.mode === "vs" ? "Player 2" : battle?.title || B.title}</p>
      </div>
      <div className="ifa-versus__foot">
        {battle ? `${TOURNAMENTS[battle.tIndex].name} · ${battle.boss ? "BOSS BATTLE" : `Battle ${battle.num}`}` : "Local VS"} · {ARENA_BY_ID[cfg.arena].name}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- results */
export function Result({ result, cfg, onNext, onRetry, onTournament, onFighters, onArena, onMenu }) {
  const vs = cfg.mode === "vs";
  const w = result.winner;
  const names = cfg.fighters.map((id) => FIGHTER_BY_ID[id].name);
  const rec = result.rec;
  const title = vs ? (w < 0 ? "Draw" : `Player ${w + 1} Wins`) : w === 0 ? "Victory" : w < 0 ? "Draw" : "Defeat";
  const sub = vs ? (w < 0 ? "Nobody takes the belt" : `${names[w]} takes the match ${result.wins[w]}–${result.wins[1 - w]}`) : w === 0 ? `${names[0]} defeats ${cfg.alt?.[1] ? "Dark " : ""}${names[1]}` : `${names[1]} wins ${result.wins[1]}–${result.wins[0]}`;
  const battle = cfg.battle ? BATTLES[cfg.battle - 1] : null;
  return (
    <div className="ifa-screen ifa-result">
      <div className={`ifa-panel ifa-result__card ${!vs && w === 0 ? "win" : !vs ? "lose" : ""}`}>
        <h1>{title}</h1>
        <p className="ifa-result__sub">{sub}</p>
        {!vs && w === 0 && (
          <div className="ifa-result__stars">
            {[1, 2, 3].map((k) => (
              <span key={k} className={k <= result.stars ? "on" : ""}>
                ★
              </span>
            ))}
          </div>
        )}
        {battle?.boss && w === 0 && battle.id < 30 && <div className="ifa-result__boss">{TOURNAMENTS[battle.tIndex].name} conquered!</div>}
        <table className="ifa-result__stats">
          <thead>
            <tr>
              <th />
              <th>{vs ? "P1" : "You"}</th>
              <th>{vs ? "P2" : "Rival"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rounds</td>
              <td>{result.wins[0]}</td>
              <td>{result.wins[1]}</td>
            </tr>
            <tr>
              <td>Hits landed</td>
              <td>{rec[0].hits}</td>
              <td>{rec[1].hits}</td>
            </tr>
            <tr>
              <td>Best combo</td>
              <td>{rec[0].maxCombo}</td>
              <td>{rec[1].maxCombo}</td>
            </tr>
            <tr>
              <td>Damage</td>
              <td>{rec[0].dmg}</td>
              <td>{rec[1].dmg}</td>
            </tr>
            <tr>
              <td>Blocks</td>
              <td>{rec[0].blocked}</td>
              <td>{rec[1].blocked}</td>
            </tr>
          </tbody>
        </table>
        <div className="ifa-result__actions">
          {vs ? (
            <>
              <button className="ifa-btn ifa-btn--go" onClick={onRetry} data-k="rematch">
                Rematch
              </button>
              <button className="ifa-btn" onClick={onFighters}>
                Change Fighters
              </button>
              <button className="ifa-btn" onClick={onArena}>
                Change Arena
              </button>
              <button className="ifa-btn" onClick={onMenu}>
                Main Menu
              </button>
            </>
          ) : (
            <>
              {w === 0 && onNext && (
                <button className="ifa-btn ifa-btn--go" onClick={onNext} data-k="next">
                  Next Battle
                </button>
              )}
              <button className={`ifa-btn ${w !== 0 ? "ifa-btn--go" : ""}`} onClick={onRetry} data-k="retry">
                {w === 0 ? "Fight Again" : "Retry"}
              </button>
              <button className="ifa-btn" onClick={onTournament}>
                Tournament
              </button>
              <button className="ifa-btn" onClick={onFighters}>
                Change Fighter
              </button>
              <button className="ifa-btn" onClick={onMenu}>
                Main Menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Champion({ fighter, save, onMenu, onTournament }) {
  const f = FIGHTER_BY_ID[fighter];
  const stars = Object.values(save.best).reduce((s, b) => s + b.stars, 0);
  return (
    <div className="ifa-screen ifa-champion">
      <div className="ifa-champion__crown">🏆</div>
      <h1>World Champion</h1>
      <h2 style={{ color: f.color }}>{f.name}</h2>
      <p>
        Rising Fighters, the Underground Championship and the World Masters — all conquered. {stars}/90 stars earned.
      </p>
      <div className="ifa-result__actions">
        <button className="ifa-btn ifa-btn--go" onClick={onTournament}>
          Tournament
        </button>
        <button className="ifa-btn" onClick={onMenu}>
          Main Menu
        </button>
      </div>
    </div>
  );
}

export function Pause({ onResume, onRestart, onControls, onQuit, showControls }) {
  return (
    <div className="ifa-screen ifa-pause">
      {showControls ? (
        <Controls onBack={onControls} />
      ) : (
        <div className="ifa-panel ifa-pause__card">
          <h1>Paused</h1>
          <button className="ifa-btn ifa-btn--go" onClick={onResume} data-k="resume">
            Resume
          </button>
          <button className="ifa-btn" onClick={onRestart}>
            Restart Fight
          </button>
          <button className="ifa-btn" onClick={onControls}>
            Controls
          </button>
          <button className="ifa-btn" onClick={onQuit}>
            Quit to Menu
          </button>
          <p className="dim">Esc / P resume</p>
        </div>
      )}
    </div>
  );
}

