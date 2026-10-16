/**
 * Tank Warfare 3D — menu and overlay screens (presentational React).
 * State lives in TankWarfare3D.jsx; these components only render it and
 * report clicks. The 3D backdrop (battlefield or garage) is drawn behind
 * them by the world renderer.
 */
import { useState } from "react";
import { MISSIONS, WORLDS, WORLD_ORDER, TANKS, TANK_ORDER, UPGRADES, UPGRADE_ORDER, MAX_UPGRADE, DIFFICULTY, DIFF_ORDER, upgradeCost, tankStats, TRAINING, SURVIVAL } from "./data.js";
import { canBuyTank } from "./progress.js";

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const CONTROLS = [
  ["W / S", "Drive forward / reverse (and brake)"],
  ["A / D", "Turn hull left / right (pivot when stopped)"],
  ["Mouse", "Aim turret and gun — the gun reticle shows where the shell will land"],
  ["Left mouse", "Fire main cannon"],
  ["Right mouse (hold)", "Zoom aiming view"],
  ["Shift", "Engine boost (drains, recharges)"],
  ["1 / 2 / 3", "Armor-piercing / High-explosive / Smoke shell"],
  ["C", "Switch camera: chase → gunner sight → cinematic"],
  ["R", "Use a repair kit (+HP, fixes tracks/turret/engine)"],
  ["Esc", "Pause & release the mouse"],
];

const STAGE_TEXT = {
  destroy: "Destroy enemy armour",
  intercept: "Intercept fleeing trucks",
  targets: "Destroy designated targets",
  reach: "Reach the waypoint",
  survive: "Survive enemy waves",
  defendZone: "Defend a location",
  defendHQ: "Defend the HQ",
  escort: "Escort allied vehicles",
  capture: "Capture a zone",
  boss: "Defeat an elite tank",
};

export function Btn({ children, onClick, kind = "", disabled, title, ...rest }) {
  return (
    <button type="button" className={`tw-btn${kind ? ` tw-btn--${kind}` : ""}`} onClick={onClick} disabled={disabled} title={title} {...rest}>
      {children}
    </button>
  );
}

function Credits({ value }) {
  return (
    <span className="tw-credits" title="Credits">
      <i aria-hidden="true">◆</i>
      {value.toLocaleString()}
    </span>
  );
}

/* ------------------------------------------------------------------ main menu */
export function MainMenu({ prog, onNav, onPlay, onDifficulty }) {
  const next = Math.min(prog.unlocked, MISSIONS.length);
  const m = MISSIONS[next - 1];
  return (
    <div className="tw-screen tw-menu">
      <div className="tw-menu__brand">
        <div className="tw-menu__eyebrow">Game Center · Shooter</div>
        <h1 className="tw-menu__title">
          TANK WARFARE <span>3D</span>
        </h1>
        <div className="tw-menu__tag">DRIVE • AIM • DESTROY</div>
      </div>
      <div className="tw-menu__panel">
        <Btn kind="primary big" onClick={onPlay}>
          <span className="tw-btn__main">Play</span>
          <span className="tw-btn__sub">
            Mission {m.id} · {m.title}
          </span>
        </Btn>
        <div className="tw-menu__grid">
          <Btn onClick={() => onNav("missions")}>Campaign</Btn>
          <Btn onClick={() => onNav("survival")}>Survival</Btn>
          <Btn onClick={() => onNav("training")}>Training</Btn>
          <Btn onClick={() => onNav("garage")}>Garage</Btn>
          <Btn onClick={() => onNav("how")}>How to Play</Btn>
          <Btn onClick={() => onNav("settings")}>Settings</Btn>
        </div>
        <div className="tw-menu__diff">
          <span>Enemy AI</span>
          {DIFF_ORDER.map((d) => (
            <button key={d} type="button" className={`tw-chip${prog.settings.difficulty === d ? " is-on" : ""}`} onClick={() => onDifficulty(d)}>
              {DIFFICULTY[d].name}
            </button>
          ))}
        </div>
        <div className="tw-menu__foot">
          <Credits value={prog.credits} />
          <span>
            Tank: <b>{TANKS[prog.tank].name}</b>
          </span>
          <span>
            Campaign <b>{Object.keys(prog.completed).length}</b>/15
          </span>
          <span>
            Survival best <b>{prog.survivalBest}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ campaign */
export function MissionSelect({ prog, world, onWorld, selected, onSelect, onDeploy, onBack }) {
  const list = MISSIONS.filter((m) => m.world === world);
  const m = MISSIONS.find((x) => x.id === selected) || list[0];
  const locked = m.id > prog.unlocked;
  return (
    <div className="tw-screen tw-split">
      <div className="tw-panel tw-panel--list">
        <div className="tw-head">
          <Btn kind="ghost" onClick={onBack}>
            ← Back
          </Btn>
          <h2>Campaign</h2>
          <Credits value={prog.credits} />
        </div>
        <div className="tw-tabs" role="tablist">
          {WORLD_ORDER.map((w) => (
            <button key={w} type="button" role="tab" aria-selected={world === w} className={`tw-tab${world === w ? " is-on" : ""}`} onClick={() => onWorld(w)}>
              {WORLDS[w].short}
            </button>
          ))}
        </div>
        <p className="tw-muted tw-world-blurb">{WORLDS[world].blurb}</p>
        <ol className="tw-missions">
          {list.map((x) => {
            const lk = x.id > prog.unlocked;
            const done = prog.completed[x.id];
            return (
              <li key={x.id}>
                <button type="button" className={`tw-mission${x.id === m.id ? " is-on" : ""}${lk ? " is-locked" : ""}`} onClick={() => onSelect(x.id)}>
                  <span className="tw-mission__n">{x.id}</span>
                  <span className="tw-mission__t">
                    {x.title}
                    <small>{lk ? "Locked" : done ? `Completed${prog.best[x.id] ? ` · best ${fmtTime(prog.best[x.id])}` : ""}` : "Available"}</small>
                  </span>
                  <span className="tw-mission__s" aria-hidden="true">
                    {lk ? "🔒" : done ? "✓" : "›"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="tw-panel tw-panel--brief">
        <div className="tw-brief__world">{WORLDS[m.world].name}</div>
        <h3 className="tw-brief__title">
          {m.id}. {m.title}
        </h3>
        <p className="tw-brief__text">{m.brief}</p>
        <div className="tw-brief__obj">
          <b>Objectives</b>
          <ol>
            {m.stages.map((s, i) => (
              <li key={i}>
                {s.label}
                <small> — {STAGE_TEXT[s.type]}</small>
              </li>
            ))}
          </ol>
        </div>
        <div className="tw-brief__row">
          <span>
            Reward <Credits value={m.reward} />
            {prog.completed[m.id] ? <small className="tw-muted"> (replay 40%)</small> : null}
          </span>
          {m.allies ? <span className="tw-pill tw-pill--blue">{m.allies.length} allied</span> : null}
          <span className="tw-pill">AI: {DIFFICULTY[prog.settings.difficulty].name}</span>
        </div>
        <div className="tw-brief__deploy">
          <span className="tw-muted">
            Tank: <b>{TANKS[prog.tank].name}</b>
          </span>
          <Btn kind="primary" disabled={locked} onClick={() => onDeploy(m.id)}>
            {locked ? `Complete mission ${m.id - 1} first` : "Deploy"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ survival / training */
export function SurvivalSelect({ prog, world, onWorld, onStart, onBack }) {
  return (
    <div className="tw-screen tw-center">
      <div className="tw-panel tw-panel--narrow">
        <div className="tw-head">
          <Btn kind="ghost" onClick={onBack}>
            ← Back
          </Btn>
          <h2>Survival</h2>
          <span />
        </div>
        <p className="tw-muted">Endless waves of enemy armour. Each cleared wave repairs 25 HP and resupplies shells; every second wave adds a repair kit. Every fifth wave brings a Warlord.</p>
        <div className="tw-worlds">
          {WORLD_ORDER.map((w) => (
            <button key={w} type="button" className={`tw-world${world === w ? " is-on" : ""}`} onClick={() => onWorld(w)}>
              <b>{WORLDS[w].name}</b>
              <small>{SURVIVAL.spawns[w].length} spawn points</small>
            </button>
          ))}
        </div>
        <div className="tw-brief__row">
          <span>
            Best: <b>{prog.survivalBest}</b> waves
          </span>
          <span className="tw-pill">AI: {DIFFICULTY[prog.settings.difficulty].name}</span>
        </div>
        <Btn kind="primary" onClick={onStart}>
          Start Survival
        </Btn>
      </div>
    </div>
  );
}

export function TrainingBrief({ prog, onStart, onBack }) {
  return (
    <div className="tw-screen tw-center">
      <div className="tw-panel tw-panel--narrow">
        <div className="tw-head">
          <Btn kind="ghost" onClick={onBack}>
            ← Back
          </Btn>
          <h2>Training Range</h2>
          <span />
        </div>
        <p className="tw-muted">A live-fire course in the desert. Targets never shoot back. Ammunition is restocked before every drill.</p>
        <ol className="tw-drills">
          {TRAINING.tasks.map((t) => (
            <li key={t.id}>{t.label}</li>
          ))}
        </ol>
        <div className="tw-brief__row">
          <span>
            Reward <Credits value={prog.trainingDone ? 60 : TRAINING.reward} />
          </span>
          {prog.trainingDone ? <span className="tw-pill tw-pill--green">Completed</span> : null}
        </div>
        <Btn kind="primary" onClick={onStart}>
          Start Training
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ garage */
function StatBar({ label, value, max, base }) {
  const f = Math.max(0, Math.min(1, value / max));
  const b = base != null ? Math.max(0, Math.min(1, base / max)) : f;
  return (
    <div className="tw-stat">
      <span>{label}</span>
      <div className="tw-stat__bar">
        <i style={{ width: `${b * 100}%` }} />
        {f > b + 0.001 && <u style={{ left: `${b * 100}%`, width: `${(f - b) * 100}%` }} />}
      </div>
    </div>
  );
}

export function Garage({ prog, sel, onSel, onBuyTank, onSelect, onUpgrade, onBack }) {
  const T = TANKS[sel];
  const owned = !!prog.tanks[sel];
  const up = prog.up[sel];
  const st = tankStats(sel, up);
  const base = tankStats(sel, {});
  const buy = canBuyTank(prog, sel);
  return (
    <div className="tw-screen tw-garage">
      <div className="tw-garage__top">
        <Btn kind="ghost" onClick={onBack}>
          ← Back
        </Btn>
        <h2>Garage</h2>
        <Credits value={prog.credits} />
      </div>
      <div className="tw-garage__tanks" role="tablist">
        {TANK_ORDER.map((id) => {
          const o = !!prog.tanks[id];
          const avail = canBuyTank(prog, id).ok;
          return (
            <button key={id} type="button" role="tab" aria-selected={sel === id} className={`tw-tankcard${sel === id ? " is-on" : ""}${o ? "" : " is-locked"}`} onClick={() => onSel(id)}>
              <b>{TANKS[id].name}</b>
              <small>{o ? (prog.tank === id ? "In use" : "Owned") : avail ? `Buy ◆${TANKS[id].cost}` : TANKS[id].unlock ? `Mission ${TANKS[id].unlock.mission}` : ""}</small>
            </button>
          );
        })}
      </div>
      <div className="tw-garage__info tw-panel">
        <div className="tw-garage__name">
          <h3>{T.name}</h3>
          <span className="tw-muted">{T.role}</span>
        </div>
        <p className="tw-muted tw-garage__blurb">{T.blurb}</p>
        <div className="tw-stats">
          <StatBar label={`Hull HP · ${Math.round(st.hp)}`} value={st.hp} max={170} base={base.hp} />
          <StatBar label={`Armor · ${Math.round(st.armor.front * 100)}%`} value={st.armor.front} max={0.75} base={base.armor.front} />
          <StatBar label={`Speed · ${Math.round(st.maxSpeed * 3.6)} km/h`} value={st.maxSpeed} max={24} base={base.maxSpeed} />
          <StatBar label={`Damage · ${Math.round(st.dmg)}`} value={st.dmg} max={80} base={base.dmg} />
          <StatBar label={`Reload · ${st.reload.toFixed(2)} s`} value={5 - st.reload} max={4} base={5 - base.reload} />
          <StatBar label={`Turret · ${Math.round((st.traverse * 180) / Math.PI)}°/s`} value={st.traverse} max={2.8} base={base.traverse} />
          <StatBar label={`Accuracy`} value={0.012 - st.dispersion} max={0.0095} base={0.012 - base.dispersion} />
        </div>
        <div className="tw-garage__kits tw-muted">
          Repair kits <b>{st.kits}</b> × {st.repair} HP{T.targeting ? " · Lead-marker fire control" : ""}
        </div>
        {owned ? (
          <>
            <div className="tw-ups">
              {UPGRADE_ORDER.map((k) => {
                const lv = up[k];
                const cost = upgradeCost(sel, k, lv);
                const maxed = lv >= MAX_UPGRADE;
                return (
                  <div key={k} className="tw-up">
                    <div className="tw-up__t">
                      <b>{UPGRADES[k].name}</b>
                      <small>{UPGRADES[k].desc}</small>
                    </div>
                    <div className="tw-up__pips" aria-label={`Level ${lv} of ${MAX_UPGRADE}`}>
                      {Array.from({ length: MAX_UPGRADE }, (_, i) => (
                        <i key={i} className={i < lv ? "on" : ""} />
                      ))}
                    </div>
                    <Btn kind="small" disabled={maxed || prog.credits < cost} onClick={() => onUpgrade(sel, k)}>
                      {maxed ? "MAX" : `◆${cost}`}
                    </Btn>
                  </div>
                );
              })}
            </div>
            <Btn kind="primary" disabled={prog.tank === sel} onClick={() => onSelect(sel)}>
              {prog.tank === sel ? "Selected" : "Use this tank"}
            </Btn>
          </>
        ) : (
          <div className="tw-garage__buy">
            <p className="tw-muted">{buy.ok ? `Available for ◆${T.cost}` : buy.why}</p>
            <Btn kind="primary" disabled={!buy.ok} onClick={() => onBuyTank(sel)}>
              {buy.ok ? `Unlock for ◆${T.cost}` : "Locked"}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ how to / settings */
export function HowTo({ onBack, inline = false }) {
  return (
    <div className={inline ? "tw-how" : "tw-screen tw-center"}>
      <div className={inline ? "" : "tw-panel tw-panel--wide"}>
        {!inline && (
          <div className="tw-head">
            <Btn kind="ghost" onClick={onBack}>
              ← Back
            </Btn>
            <h2>How to Play</h2>
            <span />
          </div>
        )}
        <div className="tw-how__cols">
          <table className="tw-keys">
            <tbody>
              {CONTROLS.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="tw-tips">
            <li>
              <b>Hull armour is directional.</b> Fronts are thick, sides thinner, rears weak. Keep your front to the enemy and flank theirs.
            </li>
            <li>
              <b>Shells are ballistic.</b> They fly, drop and take time to arrive. The gun reticle is the real predicted impact; lead moving targets.
            </li>
            <li>
              <b>AP</b> is fast and punches armour. <b>HE</b> is slower, weak on thick armour but wrecks groups, structures and props. <b>Smoke</b> blinds enemy gunners.
            </li>
            <li>
              <b>Hits can damage modules:</b> tracks (slow), turret drive (slow traverse), engine (less power). A repair kit fixes them.
            </li>
            <li>Moving and turning widens your dispersion circle. Stop for a precise shot.</li>
            <li>Watchtowers, crates, fences, sandbags and fuel barrels can be destroyed. Barrels explode.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onReset, onBack, inline = false, muted }) {
  const [confirm, setConfirm] = useState(false);
  const s = settings;
  const body = (
    <div className="tw-settings">
      <label className="tw-field">
        <span>Enemy AI difficulty</span>
        <span className="tw-seg">
          {DIFF_ORDER.map((d) => (
            <button key={d} type="button" className={`tw-chip${s.difficulty === d ? " is-on" : ""}`} onClick={() => onChange({ difficulty: d })}>
              {DIFFICULTY[d].name}
            </button>
          ))}
        </span>
      </label>
      <label className="tw-field">
        <span>Mouse sensitivity · {s.sens.toFixed(2)}</span>
        <input type="range" min="0.3" max="2.5" step="0.05" value={s.sens} onChange={(e) => onChange({ sens: Number(e.target.value) })} />
      </label>
      <label className="tw-field tw-field--row">
        <span>Invert vertical aim</span>
        <input type="checkbox" checked={s.invert} onChange={(e) => onChange({ invert: e.target.checked })} />
      </label>
      <label className="tw-field tw-field--row">
        <span>Camera shake</span>
        <input type="checkbox" checked={s.shake} onChange={(e) => onChange({ shake: e.target.checked })} />
      </label>
      <label className="tw-field">
        <span>Graphics quality</span>
        <span className="tw-seg">
          {["low", "medium", "high"].map((q) => (
            <button key={q} type="button" className={`tw-chip${s.quality === q ? " is-on" : ""}`} onClick={() => onChange({ quality: q })}>
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </span>
      </label>
      <label className="tw-field">
        <span>
          Game volume · {Math.round(s.volume * 100)}%{muted ? " (muted)" : ""}
        </span>
        <input type="range" min="0" max="1" step="0.05" value={s.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
      </label>
      {onReset && (
        <div className="tw-field tw-field--row">
          <span>Reset all progress</span>
          {confirm ? (
            <span className="tw-seg">
              <Btn kind="small danger" onClick={onReset}>
                Yes, reset
              </Btn>
              <Btn kind="small" onClick={() => setConfirm(false)}>
                Cancel
              </Btn>
            </span>
          ) : (
            <Btn kind="small" onClick={() => setConfirm(true)}>
              Reset…
            </Btn>
          )}
        </div>
      )}
    </div>
  );
  if (inline) return body;
  return (
    <div className="tw-screen tw-center">
      <div className="tw-panel tw-panel--narrow">
        <div className="tw-head">
          <Btn kind="ghost" onClick={onBack}>
            ← Back
          </Btn>
          <h2>Settings</h2>
          <span />
        </div>
        {body}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ in-game overlays */
export function Briefing({ title, sub, text, objectives, touch, onStart }) {
  return (
    <div className="tw-overlay tw-overlay--brief" onClick={onStart}>
      <div className="tw-panel tw-panel--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="tw-brief__world">{sub}</div>
        <h3 className="tw-brief__title">{title}</h3>
        {text && <p className="tw-brief__text">{text}</p>}
        {objectives && (
          <ol className="tw-drills">
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        )}
        <Btn kind="primary" onClick={onStart}>
          {touch ? "Tap to deploy" : "Click to deploy"}
        </Btn>
        {!touch && <p className="tw-muted tw-small">The mouse will be captured for aiming. Press Esc to pause and release it.</p>}
      </div>
    </div>
  );
}

export function PauseMenu({ onResume, onRestart, onMenu, settings, onSettings, muted }) {
  const [tab, setTab] = useState("main");
  return (
    <div className="tw-overlay">
      <div className="tw-panel tw-panel--pause">
        <h2>Paused</h2>
        {tab === "main" && (
          <div className="tw-pause__btns">
            <Btn kind="primary" onClick={onResume}>
              Resume
            </Btn>
            <Btn onClick={onRestart}>Restart</Btn>
            <Btn onClick={() => setTab("settings")}>Settings</Btn>
            <Btn onClick={() => setTab("how")}>Controls</Btn>
            <Btn kind="danger" onClick={onMenu}>
              Main Menu
            </Btn>
          </div>
        )}
        {tab === "settings" && (
          <>
            <SettingsPanel inline settings={settings} onChange={onSettings} muted={muted} />
            <Btn onClick={() => setTab("main")}>← Back</Btn>
          </>
        )}
        {tab === "how" && (
          <>
            <HowTo inline />
            <Btn onClick={() => setTab("main")}>← Back</Btn>
          </>
        )}
      </div>
    </div>
  );
}

export function Results({ r, onRetry, onNext, onMenu, onGarage, hasNext }) {
  const win = r.win;
  const title = r.mode === "survival" ? "SURVIVAL OVER" : r.mode === "training" ? (win ? "TRAINING COMPLETE" : "TRAINING FAILED") : win ? "MISSION COMPLETE" : "MISSION FAILED";
  return (
    <div className="tw-overlay tw-overlay--result">
      <div className={`tw-panel tw-result${win ? " is-win" : " is-fail"}`}>
        <div className="tw-result__sub">{r.subtitle}</div>
        <h2 className="tw-result__title">{title}</h2>
        {r.reason && !win && r.mode !== "survival" && <p className="tw-result__reason">{r.reason}</p>}
        <div className="tw-result__grid">
          {r.mode === "survival" && (
            <div>
              <small>Waves survived</small>
              <b>{r.waves}</b>
            </div>
          )}
          <div>
            <small>Enemies destroyed</small>
            <b>{r.kills}</b>
          </div>
          <div>
            <small>Damage dealt</small>
            <b>{r.dmgDealt}</b>
          </div>
          <div>
            <small>Damage taken</small>
            <b>{r.dmgTaken}</b>
          </div>
          <div>
            <small>Accuracy</small>
            <b>{r.shots ? Math.round((100 * r.hits) / r.shots) : 0}%</b>
          </div>
          <div>
            <small>{r.mode === "survival" ? "Time survived" : "Time"}</small>
            <b>{fmtTime(r.time)}</b>
          </div>
          <div className="tw-result__credits">
            <small>Credits earned</small>
            <b>◆ {r.reward.total}</b>
            <em>
              {r.reward.base ? `mission ${r.reward.base}` : ""}
              {r.reward.kills ? ` · kills ${r.reward.kills}` : ""}
              {r.reward.bonus ? ` · hull bonus ${r.reward.bonus}` : ""}
              {r.reward.firstClear ? " · first clear" : ""}
            </em>
          </div>
        </div>
        {r.notices?.length ? (
          <ul className="tw-result__notes">
            {r.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        <div className="tw-result__btns">
          <Btn onClick={onRetry}>{r.mode === "survival" ? "Play Again" : "Retry"}</Btn>
          {win && hasNext && (
            <Btn kind="primary" onClick={onNext}>
              Next Mission
            </Btn>
          )}
          {r.notices?.some((n) => n.includes("Garage")) && <Btn onClick={onGarage}>Garage</Btn>}
          <Btn kind="ghost" onClick={onMenu}>
            Main Menu
          </Btn>
        </div>
      </div>
    </div>
  );
}
