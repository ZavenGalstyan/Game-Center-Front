/**
 * Penalty Kick — menu screens and overlays (DOM over the live 3D canvas).
 * No emoji: every icon is inline SVG. Results use SHAPES as well as colour
 * (filled circle = scored, cross = missed/saved, ring = still to kick).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MATCHES, STAGES, VENUES, KEEPER_TYPES, TAKER_TYPES, getMatch } from "../data/career.js";
import { BALLS, KIT_OPTIONS } from "../data/cosmetics.js";
import { ballTexture } from "../three/textures.js";
import { isUnlocked, nextMatchId, ballUnlocked, totalStars, matchesWon, cleanName } from "../utils/storage.js";

/* ---------------------------------------------------------------- icons */
export function Icon({ name, size = 20 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (name) {
    case "pause":
      return (
        <svg {...p}>
          <path d="M8 5v14M16 5v14" />
        </svg>
      );
    case "back":
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "star":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "ball":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5l3.8 2.8-1.5 4.5H9.7l-1.5-4.5z" fill="currentColor" stroke="none" />
          <path d="M12 3v4.5M20.3 9.6l-4.5.7M17 19.4l-2.7-4.6M7 19.4l2.7-4.6M3.7 9.6l4.5.7" strokeWidth="1.4" />
        </svg>
      );
    case "glove":
      return (
        <svg {...p}>
          <path d="M7 21v-6L5 11V7a1.5 1.5 0 0 1 3 0v3V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v8l-2 4v3z" />
        </svg>
      );
    case "target":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case "shirt":
      return (
        <svg {...p}>
          <path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 2-2 3-4 3s-3.5-1-4-3z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...p}>
          <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
        </svg>
      );
    case "gear":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" />
        </svg>
      );
    case "whistle":
      return (
        <svg {...p}>
          <circle cx="9" cy="14" r="5" />
          <path d="M12.5 10.5L21 6v5h-6" />
        </svg>
      );
    default:
      return null;
  }
}

/** Kick marker: shape AND colour. */
export function Mark({ r, current }) {
  if (r === "goal")
    return (
      <svg className="pk-mark pk-mark--goal" viewBox="0 0 20 20" aria-label="scored">
        <circle cx="10" cy="10" r="8" />
        <path d="M6 10.5l2.8 2.8L14.5 7.5" />
      </svg>
    );
  if (r === "saved" || r === "missed")
    return (
      <svg className="pk-mark pk-mark--miss" viewBox="0 0 20 20" aria-label={r}>
        <path d="M5 5l10 10M15 5L5 15" />
      </svg>
    );
  return (
    <svg className={`pk-mark pk-mark--todo${current ? " is-current" : ""}`} viewBox="0 0 20 20" aria-label="to kick">
      <circle cx="10" cy="10" r="7" />
    </svg>
  );
}

const Stars = ({ n, of = 3 }) => (
  <span className="pk-stars" aria-label={`${n} of ${of} stars`}>
    {Array.from({ length: of }, (_, i) => (
      <span key={i} className={i < n ? "is-on" : ""}>
        <Icon name="star" size={16} />
      </span>
    ))}
  </span>
);

function Header({ title, onBack, children }) {
  return (
    <div className="pk-head">
      <button type="button" className="pk-iconbtn" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <h2>{title}</h2>
      <div className="pk-head__extra">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- main menu */
export function MainMenu({ progress, onCareer, onTraining, onPlayer, onBalls, onStats, onSettings }) {
  const next = nextMatchId(progress);
  const M = getMatch(next);
  const won = matchesWon(progress);
  return (
    <div className="pk-screen pk-menu">
      <div className="pk-menu__brand">
        <span className="pk-menu__kicker">ARCADE SHOOTOUT</span>
        <h1>
          PENALTY <b>KICK</b>
        </h1>
      </div>
      <div className="pk-menu__actions">
        <button type="button" className="pk-btn pk-btn--primary pk-btn--xl" onClick={onCareer}>
          <Icon name="trophy" size={22} />
          <span>
            CAREER
            <small>{won >= MATCHES.length ? "ALL 30 MATCHES WON" : `MATCH ${M.id} · ${M.club.toUpperCase()}`}</small>
          </span>
        </button>
        <button type="button" className="pk-btn pk-btn--wide" onClick={onTraining}>
          <Icon name="whistle" /> TRAINING
        </button>
        <div className="pk-menu__row">
          <button type="button" className="pk-btn" onClick={onPlayer}>
            <Icon name="shirt" /> PLAYER
          </button>
          <button type="button" className="pk-btn" onClick={onBalls}>
            <Icon name="ball" /> BALLS
          </button>
        </div>
        <div className="pk-menu__row">
          <button type="button" className="pk-btn" onClick={onStats}>
            <Icon name="chart" /> STATS
          </button>
          <button type="button" className="pk-btn" onClick={onSettings}>
            <Icon name="gear" /> SETTINGS
          </button>
        </div>
      </div>
      <div className="pk-menu__foot">
        <span>
          <Icon name="trophy" size={14} /> {won}/30 WON
        </span>
        <span>
          <Icon name="star" size={14} /> {totalStars(progress)}/90
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- career path */
export function Career({ progress, stage, onStage, onPick, onBack }) {
  const S = STAGES.find((s) => s.id === stage) || STAGES[0];
  const V = VENUES[S.venue];
  const ids = [];
  for (let i = S.matches[0]; i <= S.matches[1]; i++) ids.push(i);
  const [sel, setSel] = useState(null);
  const pick = sel && getMatch(sel);
  return (
    <div className="pk-screen pk-career">
      <Header title="CAREER" onBack={onBack}>
        <span className="pk-chip">
          <Icon name="star" size={14} /> {totalStars(progress)}/90
        </span>
      </Header>
      <div className="pk-tabs" role="tablist">
        {STAGES.map((s) => {
          const open = isUnlocked(progress, s.matches[0]);
          return (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === stage} className={`pk-tab${s.id === stage ? " is-on" : ""}`} onClick={() => onStage(s.id)} disabled={!open}>
              {!open && <Icon name="lock" size={13} />}
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>
      <div className="pk-stagebox">
        <div className="pk-stagebox__info">
          <strong>{S.name}</strong>
          <span>{V.name}</span>
          <p>{S.blurb}</p>
        </div>
        <ol className="pk-path">
          {ids.map((id, i) => {
            const M = getMatch(id);
            const rec = progress.matches[id];
            const open = isUnlocked(progress, id);
            const current = open && !rec;
            return (
              <li key={id} className={`pk-node${rec ? " is-won" : ""}${current ? " is-current" : ""}${!open ? " is-locked" : ""}${M.final ? " is-final" : ""}`} style={{ "--i": i }}>
                <button type="button" disabled={!open} onClick={() => setSel(id)} aria-label={`Match ${id} ${M.club}${rec ? ", won" : open ? "" : ", locked"}`}>
                  <span className="pk-node__crest" style={{ "--c1": M.kit.shirt, "--c2": M.kit.shorts }}>
                    {open ? id : <Icon name="lock" size={16} />}
                  </span>
                  <span className="pk-node__name">{M.final ? "FINAL · " : ""}{M.club}</span>
                  {rec ? <Stars n={rec.stars} /> : current ? <span className="pk-node__next">NEXT</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {pick && (
        <div className="pk-veil" onClick={() => setSel(null)}>
          <div className="pk-panel pk-preview" onClick={(e) => e.stopPropagation()}>
            <span className="pk-preview__stage">
              {getStageName(pick.stage)} · MATCH {pick.id}
              {pick.final ? " · STAGE FINAL" : ""}
            </span>
            <h3>
              <span className="pk-crest" style={{ "--c1": pick.kit.shirt, "--c2": pick.kit.shorts }} />
              {pick.club}
            </h3>
            <p className="pk-preview__venue">{VENUES[pick.venue].name}</p>
            <div className="pk-scout">
              <div>
                <span>GOALKEEPER</span>
                <strong>
                  {pick.keeper.name} · {KEEPER_TYPES[pick.keeper.type].label}
                </strong>
                <small>{KEEPER_TYPES[pick.keeper.type].note}</small>
              </div>
              <div>
                <span>PENALTY TAKERS</span>
                {[...new Set(pick.takers.map((t) => t.type))].map((t) => (
                  <small key={t}>
                    <b>{TAKER_TYPES[t].label}</b> — {TAKER_TYPES[t].note}
                  </small>
                ))}
              </div>
            </div>
            {progress.matches[pick.id] && (
              <p className="pk-preview__rec">
                Best {progress.matches[pick.id].best} · <Stars n={progress.matches[pick.id].stars} />
              </p>
            )}
            <p className="pk-preview__rule">Win: 1 star · inside five kicks: 2 · score all your kicks: 3</p>
            <div className="pk-panel__btns">
              <button type="button" className="pk-btn pk-btn--primary" onClick={() => onPick(pick.id)}>
                KICK OFF
              </button>
              <button type="button" className="pk-btn pk-btn--ghost" onClick={() => setSel(null)}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const getStageName = (id) => (STAGES.find((s) => s.id === id) || STAGES[0]).name.toUpperCase();

/* ---------------------------------------------------------------- training */
export function Training({ progress, onStart, onBack }) {
  const s = progress.stats;
  const cards = [
    { mode: "practice", icon: "ball", title: "Penalty Practice", text: "Unlimited kicks against a steady keeper. Try power, height and curve.", best: `${s.practiceShots} practice kicks` },
    { mode: "targets", icon: "target", title: "Target Shooting", text: "Ten kicks at an empty goal. Hit the ring — closer to the middle scores more.", best: `Best ${s.bestTargetScore} pts` },
    { mode: "keeper", icon: "glove", title: "Goalkeeper Practice", text: "Ten penalties against you. Swipe or tap where the ball is going.", best: `Best ${s.keeperBestSaves}/10 saves` },
  ];
  return (
    <div className="pk-screen pk-training">
      <Header title="TRAINING" onBack={onBack} />
      <div className="pk-cards">
        {cards.map((c) => (
          <button key={c.mode} type="button" className="pk-card" onClick={() => onStart(c.mode)}>
            <span className="pk-card__icon">
              <Icon name={c.icon} size={28} />
            </span>
            <strong>{c.title}</strong>
            <span className="pk-card__text">{c.text}</span>
            <span className="pk-card__best">{c.best}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- player */
function Swatches({ label, list, value, onPick }) {
  return (
    <div className="pk-swatches">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label}>
        {list.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === value} className={c === value ? "is-on" : ""} style={{ "--sw": c }} onClick={() => onPick(c)} aria-label={`${label} ${c}`} />
        ))}
      </div>
    </div>
  );
}

export function PlayerFigure({ kit, keeper = false }) {
  const shirt = keeper ? kit.keeperShirt : kit.shirt;
  return (
    <svg className="pk-figure" viewBox="0 0 120 200" aria-hidden="true">
      <ellipse cx="60" cy="192" rx="36" ry="6" fill="rgba(0,0,0,.25)" />
      <rect x="44" y="118" width="13" height="58" rx="6" fill={kit.skin} />
      <rect x="63" y="118" width="13" height="58" rx="6" fill={kit.skin} />
      <rect x="43" y="146" width="15" height="32" rx="5" fill={kit.shorts === "#f4f4f0" ? "#dfe3e8" : kit.shorts} opacity=".85" />
      <rect x="62" y="146" width="15" height="32" rx="5" fill={kit.shorts === "#f4f4f0" ? "#dfe3e8" : kit.shorts} opacity=".85" />
      <rect x="38" y="176" width="21" height="10" rx="4" fill={kit.boots} />
      <rect x="61" y="176" width="21" height="10" rx="4" fill={kit.boots} />
      <rect x="40" y="104" width="40" height="30" rx="8" fill={kit.shorts} />
      <path d="M36 50 L84 50 L90 108 L30 108 Z" fill={shirt} />
      <rect x="18" y="52" width="16" height="50" rx="8" fill={keeper ? shirt : kit.skin} transform="rotate(8 26 52)" />
      <rect x="86" y="52" width="16" height="50" rx="8" fill={keeper ? shirt : kit.skin} transform="rotate(-8 94 52)" />
      <path d="M24 42 L40 48 L36 64 L22 60 Z" fill={shirt} />
      <path d="M96 42 L80 48 L84 64 L98 60 Z" fill={shirt} />
      {keeper && (
        <>
          <circle cx="20" cy="104" r="9" fill={kit.gloves} />
          <circle cx="100" cy="104" r="9" fill={kit.gloves} />
        </>
      )}
      {!keeper && <text x="60" y="92" textAnchor="middle" fontSize="26" fontWeight="900" fill="rgba(255,255,255,.9)" stroke="rgba(0,0,0,.25)" strokeWidth=".8">{kit.number}</text>}
      <rect x="53" y="36" width="14" height="14" fill={kit.skin} />
      <circle cx="60" cy="26" r="17" fill={kit.skin} />
      <path d="M43 24 Q44 8 60 8 Q77 8 77 24 Q70 16 60 17 Q50 16 43 24Z" fill="#2a1d14" />
    </svg>
  );
}

export function Player({ progress, onKit, onBack }) {
  const kit = progress.kit;
  const [name, setName] = useState(kit.name);
  return (
    <div className="pk-screen pk-player">
      <Header title="PLAYER" onBack={onBack} />
      <div className="pk-player__body">
        <div className="pk-player__preview">
          <PlayerFigure kit={kit} />
          <PlayerFigure kit={kit} keeper />
          <div className="pk-player__tag">
            <strong>{kit.name}</strong>
            <span>#{kit.number}</span>
          </div>
        </div>
        <div className="pk-player__opts">
          <label className="pk-field">
            <span>SHIRT NAME</span>
            <input
              value={name}
              maxLength={10}
              onChange={(e) => setName(cleanName(e.target.value))}
              onBlur={() => onKit({ name: cleanName(name).trim() || "ROOKIE" })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <div className="pk-field">
            <span>NUMBER</span>
            <div className="pk-stepper">
              <button type="button" onClick={() => onKit({ number: kit.number > 1 ? kit.number - 1 : 99 })} aria-label="Lower number">
                −
              </button>
              <b>{kit.number}</b>
              <button type="button" onClick={() => onKit({ number: kit.number < 99 ? kit.number + 1 : 1 })} aria-label="Higher number">
                +
              </button>
            </div>
          </div>
          <Swatches label="SHIRT" list={KIT_OPTIONS.shirt} value={kit.shirt} onPick={(c) => onKit({ shirt: c })} />
          <Swatches label="SHORTS" list={KIT_OPTIONS.shorts} value={kit.shorts} onPick={(c) => onKit({ shorts: c })} />
          <Swatches label="BOOTS" list={KIT_OPTIONS.boots} value={kit.boots} onPick={(c) => onKit({ boots: c })} />
          <Swatches label="KEEPER SHIRT" list={KIT_OPTIONS.keeperShirt} value={kit.keeperShirt} onPick={(c) => onKit({ keeperShirt: c })} />
          <Swatches label="GLOVES" list={KIT_OPTIONS.gloves} value={kit.gloves} onPick={(c) => onKit({ gloves: c })} />
          <Swatches label="SKIN TONE" list={KIT_OPTIONS.skin} value={kit.skin} onPick={(c) => onKit({ skin: c })} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- balls */
function BallThumb({ ball }) {
  const url = useMemo(() => {
    try {
      return ballTexture(ball).image.toDataURL();
    } catch {
      return null;
    }
  }, [ball]);
  return <span className="pk-ballthumb" style={{ backgroundImage: url ? `url(${url})` : undefined, backgroundColor: ball.base }} />;
}

export function Balls({ progress, onSelect, onBack }) {
  return (
    <div className="pk-screen pk-balls">
      <Header title="BALLS" onBack={onBack} />
      <p className="pk-note">Balls are cosmetic only — every ball flies exactly the same.</p>
      <div className="pk-grid">
        {BALLS.map((b) => {
          const open = ballUnlocked(progress, b);
          const on = progress.selectedBall === b.id;
          return (
            <button key={b.id} type="button" className={`pk-ballcard${on ? " is-on" : ""}${open ? "" : " is-locked"}`} disabled={!open} onClick={() => onSelect(b.id)} aria-pressed={on}>
              <BallThumb ball={b} />
              <strong>{b.name}</strong>
              <small>{open ? (on ? "SELECTED" : "TAP TO USE") : b.note}</small>
              {!open && (
                <span className="pk-ballcard__lock">
                  <Icon name="lock" size={16} />
                </span>
              )}
              {on && (
                <span className="pk-ballcard__on">
                  <Icon name="check" size={16} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- stats */
export function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const mins = Math.round(s.playMs / 60000);
  const groups = [
    ["CAREER", [["Matches played", s.matchesPlayed], ["Won", s.matchesWon], ["Lost", s.matchesLost], ["Sudden deaths", s.suddenDeaths], ["Clean sheets", s.cleanSheets], ["Career stars", `${totalStars(progress)}/90`]]],
    ["SHOOTING", [["Penalties taken", s.penaltiesTaken], ["Scored", s.goalsScored], ["Conversion", pct(s.goalsScored, s.penaltiesTaken)], ["Saved by keeper", s.shotsSaved], ["Missed", s.shotsMissed], ["Woodwork", s.woodwork], ["Top corners", s.topCorners], ["Curled shots", s.curledShots], ["Overpowered", s.overpowered], ["Best scoring run", s.bestStreak]]],
    ["GOALKEEPING", [["Penalties faced", s.penaltiesFaced], ["Saves", s.saves], ["Save rate", pct(s.saves, s.penaltiesFaced)], ["Catches", s.catches], ["Goals conceded", s.goalsConceded]]],
    ["TRAINING", [["Practice kicks", s.practiceShots], ["Targets hit", s.targetsHit], ["Best target score", s.bestTargetScore], ["Best keeper session", `${s.keeperBestSaves}/10`], ["Time played", `${mins} min`]]],
  ];
  return (
    <div className="pk-screen pk-stats">
      <Header title="STATISTICS" onBack={onBack} />
      <div className="pk-statgroups">
        {groups.map(([h, rows]) => (
          <section key={h} className="pk-statgroup">
            <h3>{h}</h3>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- settings */
function Toggle({ label, value, onChange }) {
  return (
    <div className="pk-setting">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={value} aria-label={label} className={`pk-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}
function Choice({ label, value, options, onChange }) {
  return (
    <div className="pk-setting">
      <span>{label}</span>
      <div className="pk-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "is-on" : ""} onClick={() => onChange(o)}>
            {o.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings({ settings: s, onChange, onBack }) {
  const lmh = ["low", "medium", "high"];
  return (
    <div className="pk-screen pk-settings">
      <Header title="SETTINGS" onBack={onBack} />
      <div className="pk-settinglist">
        <Toggle label="Sound" value={s.sound} onChange={(v) => onChange({ sound: v })} />
        <Toggle label="Music" value={s.music} onChange={(v) => onChange({ music: v })} />
        <Choice label="Graphics" value={s.graphics} options={lmh} onChange={(v) => onChange({ graphics: v })} />
        <Toggle label="Shadows" value={s.shadows} onChange={(v) => onChange({ shadows: v })} />
        <Choice label="Crowd" value={s.crowd} options={["off", ...lmh]} onChange={(v) => onChange({ crowd: v })} />
        <Toggle label="Particles" value={s.particles} onChange={(v) => onChange({ particles: v })} />
        <Toggle label="Camera motion" value={s.cameraMotion} onChange={(v) => onChange({ cameraMotion: v })} />
        <Choice label="Aim sensitivity" value={s.aimSens} options={lmh} onChange={(v) => onChange({ aimSens: v })} />
        <Choice label="Swipe sensitivity" value={s.swipeSens} options={lmh} onChange={(v) => onChange({ swipeSens: v })} />
        <Toggle label="Control help" value={s.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
        <Toggle label="Reduced motion" value={s.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- in-play */
export function Scoreboard({ so, homeName, awayName, awayKit, playerKit }) {
  const n = Math.max(5, so.player.length, so.rival.length + (so.player.length > so.rival.length ? 1 : 0));
  const row = (arr, turn) =>
    Array.from({ length: n }, (_, i) => <Mark key={i} r={arr[i]} current={turn && i === arr.length} />);
  const pg = so.player.filter((r) => r === "goal").length;
  const rg = so.rival.filter((r) => r === "goal").length;
  const pTurn = !so.over && so.player.length <= so.rival.length;
  return (
    <div className={`pk-board${so.suddenDeath ? " is-sd" : ""}`} aria-label={`${homeName} ${pg}, ${awayName} ${rg}`}>
      <div className="pk-board__team">
        <span className="pk-crest pk-crest--sm" style={{ "--c1": playerKit.shirt, "--c2": playerKit.shorts }} />
        <b>{homeName}</b>
        <div className="pk-board__marks">{row(so.player, pTurn)}</div>
      </div>
      <div className="pk-board__score">
        <span>{pg}</span>
        <i>–</i>
        <span>{rg}</span>
        {so.suddenDeath && <em>SUDDEN DEATH</em>}
      </div>
      <div className="pk-board__team pk-board__team--away">
        <span className="pk-crest pk-crest--sm" style={{ "--c1": awayKit.shirt, "--c2": awayKit.shorts }} />
        <b>{awayName}</b>
        <div className="pk-board__marks">{row(so.rival, !so.over && !pTurn)}</div>
      </div>
    </div>
  );
}

const WHY = {
  clean: "",
  "past-keeper": "THROUGH THE KEEPER",
  "in-off-woodwork": "IN OFF THE WOODWORK",
  catch: "CAUGHT",
  keeper: "SAVED",
  woodwork: "OFF THE WOODWORK",
  over: "OVER THE BAR",
  wide: "WIDE",
  stopped: "",
  timeout: "",
};

export function ResultBanner({ entry }) {
  if (!entry) return null;
  const mine = entry.role === "shoot";
  const good = mine ? entry.result === "GOAL" : entry.result !== "GOAL";
  const head = entry.result === "GOAL" ? "GOAL" : entry.result === "SAVED" ? (mine ? "SAVED" : "GREAT SAVE") : "MISSED";
  let sub = WHY[entry.why] || "";
  if (entry.result === "GOAL" && entry.lineP && entry.lineP[1] > 1.75 && Math.abs(entry.lineP[0]) > 2.6) sub = "TOP CORNER";
  if (entry.points != null) sub = entry.points ? `TARGET +${entry.points}` : "NO TARGET";
  return (
    <div className={`pk-banner ${good ? "is-good" : "is-bad"}`}>
      <strong>{head}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/**
 * Power + curve gauges. Updated straight from the engine every animation
 * frame (no React re-render per frame).
 */
export function PowerMeter({ engine, onCurve }) {
  const bar = useRef(null);
  const knob = useRef(null);
  const root = useRef(null);
  useEffect(() => {
    let id = 0;
    const loop = () => {
      const pw = engine.power();
      if (bar.current) {
        bar.current.style.height = `${Math.round(pw * 100)}%`;
        bar.current.classList.toggle("is-over", pw > 0.86);
      }
      if (root.current) root.current.classList.toggle("is-active", !!engine.charge);
      if (knob.current) knob.current.style.left = `${50 + engine.curve * 50}%`;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [engine]);
  return (
    <div className="pk-power" ref={root}>
      <div className="pk-power__bar" aria-hidden="true">
        <i ref={bar} />
        <em style={{ bottom: "86%" }} />
      </div>
      <span className="pk-power__label">POWER</span>
      <div className="pk-curve">
        <button type="button" onClick={() => onCurve(-0.25)} aria-label="Curve left">
          ‹
        </button>
        <div className="pk-curve__track" aria-label="Curve">
          <i ref={knob} />
        </div>
        <button type="button" onClick={() => onCurve(0.25)} aria-label="Curve right">
          ›
        </button>
        <span>CURVE</span>
      </div>
    </div>
  );
}
