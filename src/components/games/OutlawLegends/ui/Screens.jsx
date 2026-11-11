/**
 * Menus and overlays of Outlaw Legends. All text is plain English in the
 * markup; the Game Center's runtime translator swaps it for Russian.
 */
import { useState } from "react";
import { MISSIONS, MISSION_BY_ID, CHAPTERS, THEME_LABEL } from "../engine/missions.js";
import { WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES, UPGRADE_MAX, CHAR_UPGRADES, ABILITIES, WEAPON_UNLOCK_TEXT, weaponUpgradeCost, charUpgradeCost, levelFromXp, xpForLevel, MAX_LEVEL, playerStats } from "../engine/data.js";
import { missionUnlocked, nextMissionId } from "../engine/save.js";
import { WeaponIcon } from "./Hud.jsx";

const RANK_ICON = { Legend: "★★★", Gunslinger: "★★", Drifter: "★" };

export function PlayerCard({ progress }) {
  const lv = levelFromXp(progress.xp);
  const a = xpForLevel(lv), b = xpForLevel(Math.min(MAX_LEVEL, lv + 1));
  const pct = lv >= MAX_LEVEL ? 100 : ((progress.xp - a) / Math.max(1, b - a)) * 100;
  const done = Object.keys(progress.completed).length;
  return (
    <div className="ol-card">
      <div className="ol-card-row">
        <span className="ol-card-lv">{`Level ${lv}`}</span>
        <span className="ol-card-money">${progress.money}</span>
      </div>
      <div className="ol-xpbar big">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="ol-card-row small">
        <span>{lv >= MAX_LEVEL ? "Maximum level" : `${progress.xp - a} / ${b - a} XP`}</span>
        <span>{`Missions ${done}/20`}</span>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="ol-logo">
      <div className="ol-logo-top">Outlaw Legends</div>
      <div className="ol-logo-rule" aria-hidden="true">
        <i />
        <b>✦</b>
        <i />
      </div>
      <div className="ol-logo-sub">Wild Frontier</div>
      <div className="ol-logo-tag">Draw Fast. Fight Hard. Become a Legend.</div>
    </div>
  );
}

export function MainMenu({ progress, onPlay, onContinue, onMissions, onShop, onHelp, onSettings }) {
  const started = Object.keys(progress.completed).length > 0;
  const next = MISSION_BY_ID[nextMissionId(progress)];
  return (
    <div className="ol-screen ol-menu">
      <div className="ol-menu-col">
        <Logo />
        <nav className="ol-menu-buttons">
          <button type="button" className="ol-btn primary" onClick={onPlay}>
            Play
          </button>
          <button type="button" className="ol-btn" onClick={onContinue} disabled={!started}>
            Continue
          </button>
          {started && <div className="ol-menu-next">{`Next: Mission ${next.id} · ${next.name}`}</div>}
          <button type="button" className="ol-btn" onClick={onMissions}>
            Mission Select
          </button>
          <button type="button" className="ol-btn" onClick={onShop}>
            Upgrades
          </button>
          <button type="button" className="ol-btn" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="ol-btn" onClick={onSettings}>
            Settings
          </button>
        </nav>
      </div>
      <div className="ol-menu-side">
        <PlayerCard progress={progress} />
        {progress.finished && <div className="ol-legend-badge">Legend of the Frontier</div>}
      </div>
    </div>
  );
}

function Poster({ m, small }) {
  return (
    <div className={`ol-poster ${small ? "small" : ""}`}>
      <div className="ol-poster-head">{m.wanted ? "Wanted" : `Mission ${m.id}`}</div>
      <div className="ol-poster-face" aria-hidden="true">
        <svg viewBox="0 0 60 60">
          <path d="M8 22h44v4H8z M18 10h24v13H18z M30 28c-9 0-12 7-12 14s5 12 12 12 12-5 12-12-3-14-12-14z M10 60c2-10 10-13 20-13s18 3 20 13z" fill="currentColor" />
        </svg>
      </div>
      {m.wanted ? <div className="ol-poster-name">{m.wanted.name}</div> : <div className="ol-poster-name">{m.name}</div>}
      {m.wanted && <div className="ol-poster-bounty">{`Reward $${m.wanted.bounty}`}</div>}
    </div>
  );
}

export function MissionSelect({ progress, onPick, onBack }) {
  return (
    <div className="ol-screen ol-panel-screen">
      <div className="ol-panel wide">
        <header className="ol-panel-head">
          <h2>Mission Select</h2>
          <PlayerCard progress={progress} />
        </header>
        <div className="ol-scroll">
          {CHAPTERS.map((c) => (
            <section key={c.id} className="ol-chapter">
              <h3>{`Chapter ${c.id} · ${c.name}`}</h3>
              <div className="ol-mgrid">
                {c.missions.map((id) => {
                  const m = MISSION_BY_ID[id];
                  const open = missionUnlocked(progress, id);
                  const done = progress.completed[id];
                  return (
                    <button type="button" key={id} className={`ol-mcard ${open ? "" : "locked"} ${done ? "done" : ""}`} onClick={() => open && onPick(id)} disabled={!open} aria-label={`Mission ${id}: ${m.name}`}>
                      <span className="ol-mcard-num">{id}</span>
                      <span className="ol-mcard-name">{m.name}</span>
                      <span className="ol-mcard-loc">{m.location}</span>
                      <span className="ol-mcard-meta">
                        <span className={`ol-theme t-${m.theme}`}>{THEME_LABEL[m.theme]}</span>
                        {done ? <span className="ol-rank">{RANK_ICON[done.rank]}</span> : open ? <span className="ol-new">New</span> : <span className="ol-lock">Locked</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="ol-panel-foot">
          <button type="button" className="ol-btn" onClick={onBack}>
            Back
          </button>
        </footer>
      </div>
    </div>
  );
}

const STEP_ICON = { talk: "💬", reach: "➤", kill: "✦", targets: "◎", interact: "✋", collect: "✚", survive: "⏱", defend: "⛨", duel: "⚔" };

export function Briefing({ id, progress, onStart, onShop, onBack }) {
  const m = MISSION_BY_ID[id];
  const done = progress.completed[id];
  const stats = playerStats(progress);
  return (
    <div className="ol-screen ol-panel-screen">
      <div className="ol-panel brief">
        <div className="ol-brief-left">
          <Poster m={m} />
          <div className="ol-brief-meta">
            <div>
              <span>Location</span>
              <b>{m.location}</b>
            </div>
            <div>
              <span>Time</span>
              <b>{THEME_LABEL[m.theme]}</b>
            </div>
            <div>
              <span>Reward</span>
              <b>{`$${done ? Math.round(m.reward.money / 2) : m.reward.money} · ${done ? Math.round(m.reward.xp / 2) : m.reward.xp} XP`}</b>
            </div>
            {m.unlock && (
              <div>
                <span>Unlocks</span>
                <b>{WEAPONS[m.unlock].name}</b>
              </div>
            )}
          </div>
        </div>
        <div className="ol-brief-right">
          <div className="ol-brief-kicker">{`Mission ${m.id} of 20`}</div>
          <h2>{m.name}</h2>
          <p className="ol-brief-text">{m.brief}</p>
          <h4>Objectives</h4>
          <ol className="ol-brief-steps">
            {m.steps.map((s, i) => (
              <li key={i}>
                <span aria-hidden="true">{STEP_ICON[s.type] || "•"}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
          <div className="ol-brief-loadout">
            <span>Your guns</span>
            {stats.owned.map((w) => (
              <WeaponIcon key={w} id={w} className="ol-loadout-icon" />
            ))}
          </div>
          {done && <div className="ol-brief-done">{`Completed · Best rank: ${done.rank}`}</div>}
          <div className="ol-brief-buttons">
            <button type="button" className="ol-btn primary" onClick={onStart}>
              Ride Out
            </button>
            <button type="button" className="ol-btn" onClick={onShop}>
              Upgrades
            </button>
            <button type="button" className="ol-btn" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pips({ n, max }) {
  return (
    <span className="ol-pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

function StatBar({ label, v }) {
  return (
    <div className="ol-statbar">
      <span>{label}</span>
      <div>
        <i style={{ width: `${Math.max(4, Math.min(100, v * 100))}%` }} />
      </div>
    </div>
  );
}

export function Shop({ progress, onBuyWeapon, onBuyChar, onBuyAbility, onBack }) {
  const [tab, setTab] = useState("weapons");
  const stats = playerStats(progress);
  const lv = levelFromXp(progress.xp);
  return (
    <div className="ol-screen ol-panel-screen">
      <div className="ol-panel wide">
        <header className="ol-panel-head">
          <h2>Gunsmith &amp; Upgrades</h2>
          <PlayerCard progress={progress} />
        </header>
        <div className="ol-tabs" role="tablist">
          {[
            ["weapons", "Weapons"],
            ["char", "Character"],
            ["abilities", "Abilities"],
          ].map(([k, label]) => (
            <button type="button" role="tab" aria-selected={tab === k} key={k} className={`ol-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="ol-scroll">
          {tab === "weapons" && (
            <div className="ol-shop-grid">
              {WEAPON_ORDER.map((wid) => {
                const owned = progress.weapons.includes(wid);
                const w = stats.weapons[wid];
                const W = WEAPONS[wid];
                return (
                  <div key={wid} className={`ol-shop-card ${owned ? "" : "locked"}`}>
                    <div className="ol-shop-title">
                      <WeaponIcon id={wid} className="ol-shop-icon" />
                      <div>
                        <b>{W.name}</b>
                        <p>{W.desc}</p>
                      </div>
                    </div>
                    <div className="ol-stats">
                      <StatBar label="Damage" v={(w.dmg * w.pellets) / 110} />
                      <StatBar label="Fire rate" v={0.12 / w.rate} />
                      <StatBar label="Capacity" v={w.mag / 12} />
                      <StatBar label="Range" v={w.range / 75} />
                      <StatBar label="Accuracy" v={1 - w.spread / 0.09} />
                      <StatBar label="Reload Speed" v={(w.reloadType === "round" ? 0.6 : 1) / (w.reload * (w.reloadType === "round" ? 1 : 1)) / 1.2} />
                    </div>
                    {owned ? (
                      WEAPON_UPGRADES.map((u) => {
                        const lvl = progress.upgrades[wid][u.id];
                        const max = lvl >= UPGRADE_MAX;
                        const cost = max ? 0 : weaponUpgradeCost(wid, lvl);
                        return (
                          <div key={u.id} className="ol-up-row">
                            <div className="ol-up-name">
                              <b>{u.name}</b>
                              <span>{u.desc}</span>
                            </div>
                            <Pips n={lvl} max={UPGRADE_MAX} />
                            <button type="button" className="ol-btn small buy" disabled={max || progress.money < cost} onClick={() => onBuyWeapon(wid, u.id)}>
                              {max ? "Maxed" : `$${cost}`}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="ol-locked-note">{WEAPON_UNLOCK_TEXT[wid]}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === "char" && (
            <div className="ol-shop-list">
              <div className="ol-char-summary">
                <span>{`Max health ${stats.maxHp}`}</span>
                <span>{`Stamina ${stats.maxStamina}`}</span>
                <span>{`Melee power ${Math.round(stats.melee * 100)}%`}</span>
              </div>
              {CHAR_UPGRADES.map((c) => {
                const lvl = progress.upgrades.char[c.id];
                const max = lvl >= c.max;
                const cost = max ? 0 : charUpgradeCost(c.id, lvl);
                return (
                  <div key={c.id} className="ol-up-row big">
                    <div className="ol-up-name">
                      <b>{c.name}</b>
                      <span>{c.desc}</span>
                    </div>
                    <Pips n={lvl} max={c.max} />
                    <button type="button" className="ol-btn small buy" disabled={max || progress.money < cost} onClick={() => onBuyChar(c.id)}>
                      {max ? "Maxed" : `$${cost}`}
                    </button>
                  </div>
                );
              })}
              <p className="ol-note">Each character level also adds 4 maximum health.</p>
            </div>
          )}
          {tab === "abilities" && (
            <div className="ol-shop-list">
              {ABILITIES.map((a) => {
                const own = !!progress.abilities[a.id];
                const lvOk = lv >= a.level;
                return (
                  <div key={a.id} className={`ol-up-row big ${own ? "owned" : ""}`}>
                    <div className="ol-up-name">
                      <b>{a.name}</b>
                      <span>{a.desc}</span>
                      {!own && !lvOk && <em className="ol-req">{`Requires level ${a.level}`}</em>}
                    </div>
                    <button type="button" className="ol-btn small buy" disabled={own || !lvOk || progress.money < a.cost} onClick={() => onBuyAbility(a.id)}>
                      {own ? "Owned" : `$${a.cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <footer className="ol-panel-foot">
          <button type="button" className="ol-btn" onClick={onBack}>
            Back
          </button>
        </footer>
      </div>
    </div>
  );
}

const CONTROLS = [
  ["W A S D", "Move"],
  ["Mouse", "Rotate camera"],
  ["Left click", "Shoot (punch when guns are holstered)"],
  ["Right click", "Aim down the sights"],
  ["R", "Reload"],
  ["E", "Interact · takedown (hold for long actions)"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["Q", "Dodge roll"],
  ["F", "Punch (tap repeatedly for a three-hit combo)"],
  ["V", "Kick (breaks guards, knocks enemies down)"],
  ["X", "Block (hold)"],
  ["C", "Crouch behind cover"],
  ["Z", "Dead Eye (once unlocked)"],
  ["1 – 4 · Wheel", "Switch weapons"],
  ["Esc", "Pause"],
];

export function Help({ onBack }) {
  return (
    <div className="ol-screen ol-panel-screen ol-over">
      <div className="ol-panel wide">
        <header className="ol-panel-head">
          <h2>How to Play</h2>
        </header>
        <div className="ol-scroll ol-help">
          <section>
            <h3>Controls</h3>
            <table className="ol-controls">
              <tbody>
                {CONTROLS.map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <span className="ol-key wide">{k}</span>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ol-note">Click the game to capture the mouse. Press Esc to release it and pause.</p>
          </section>
          <section>
            <h3>Gunfights</h3>
            <p>Hold right click to aim: your shots get far more accurate and the rifle zooms in. Headshots deal double damage. Each gun has its own damage, range, capacity and reload — the shotgun knocks enemies flat up close, the rifle owns long distances.</p>
            <p>If the crosshair shows a cross, something is between your gun and the target. Step out from behind the corner first.</p>
          </section>
          <section>
            <h3>Cover</h3>
            <p>Press C next to crates, barrels, wagons or sandbags to crouch. Bullets that hit cover don't hit you. Enemies hide and peek too — flank them or wait for them to stand up.</p>
          </section>
          <section>
            <h3>Fists and takedowns</h3>
            <p>Punch with F: three quick punches make a combo whose last hit knocks the enemy down. Kick with V to break a brawler's guard. Hold X to block — with Counter Strike, a block at the last moment stuns the attacker. Press Q to roll through attacks.</p>
            <p>Walk up behind an unaware enemy, or to one who is knocked down, and press E for a takedown.</p>
          </section>
          <section>
            <h3>Duels</h3>
            <p>In a duel you face one gunslinger. Keep still until DRAW! appears and the bell rings, then aim at your opponent and click. Shoot before they do. Drawing early loses the duel — but you can always retry.</p>
          </section>
          <section>
            <h3>Progress</h3>
            <p>Defeated outlaws drop money, ammunition and tonics. Missions pay rewards and experience. Spend your money at the gunsmith on damage, accuracy and reload upgrades, more health and harder fists, and learn abilities like Dead Eye. Every objective is a checkpoint.</p>
          </section>
        </div>
        <footer className="ol-panel-foot">
          <button type="button" className="ol-btn" onClick={onBack}>
            Back
          </button>
        </footer>
      </div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="ol-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button type="button" role="radio" aria-checked={value === v} key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Settings({ settings, setSetting, onReset, onBack, inMission }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="ol-screen ol-panel-screen ol-over">
      <div className="ol-panel narrow">
        <header className="ol-panel-head">
          <h2>Settings</h2>
        </header>
        <div className="ol-scroll ol-settings">
          <label className="ol-set-row">
            <span>Mouse sensitivity</span>
            <input type="range" min="0.3" max="2.5" step="0.05" value={settings.sens} onChange={(e) => setSetting("sens", Number(e.target.value))} aria-label="Mouse sensitivity" />
            <em>{settings.sens.toFixed(2)}</em>
          </label>
          <div className="ol-set-row">
            <span>Invert vertical look</span>
            <Seg
              value={settings.invertY}
              options={[
                [false, "Off"],
                [true, "On"],
              ]}
              onChange={(v) => setSetting("invertY", v)}
            />
          </div>
          <div className="ol-set-row">
            <span>Difficulty</span>
            <Seg
              value={settings.difficulty}
              options={[
                ["easy", "Easy"],
                ["normal", "Normal"],
                ["hard", "Hard"],
              ]}
              onChange={(v) => setSetting("difficulty", v)}
            />
          </div>
          {inMission && <p className="ol-note">Difficulty changes apply from the next mission start.</p>}
          <label className="ol-set-row">
            <span>Sound volume</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => setSetting("volume", Number(e.target.value))} aria-label="Sound volume" />
            <em>{Math.round(settings.volume * 100)}</em>
          </label>
          <label className="ol-set-row">
            <span>Music volume</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => setSetting("music", Number(e.target.value))} aria-label="Music volume" />
            <em>{Math.round(settings.music * 100)}</em>
          </label>
          <div className="ol-set-row">
            <span>Tutorial hints</span>
            <Seg
              value={settings.hints}
              options={[
                [true, "On"],
                [false, "Off"],
              ]}
              onChange={(v) => setSetting("hints", v)}
            />
          </div>
          <div className="ol-set-row">
            <span>Graphics</span>
            <Seg
              value={settings.quality}
              options={[
                ["high", "High"],
                ["low", "Low"],
                ["off", "No shadows"],
              ]}
              onChange={(v) => setSetting("quality", v)}
            />
          </div>
          {!inMission && (
            <div className="ol-set-row danger">
              <span>Reset all progress</span>
              {confirm ? (
                <span className="ol-confirm">
                  <button type="button" className="ol-btn small danger" onClick={() => (onReset(), setConfirm(false))}>
                    Yes, erase everything
                  </button>
                  <button type="button" className="ol-btn small" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="ol-btn small" onClick={() => setConfirm(true)}>
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="ol-panel-foot">
          <button type="button" className="ol-btn" onClick={onBack}>
            Back
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Pause({ mission, onResume, onCheckpoint, onRestart, onSettings, onHelp, onQuit }) {
  return (
    <div className="ol-screen ol-dim">
      <div className="ol-panel narrow center">
        <div className="ol-brief-kicker">{`Mission ${mission.id} · ${mission.name}`}</div>
        <h2>Paused</h2>
        <div className="ol-stack">
          <button type="button" className="ol-btn primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="ol-btn" onClick={onCheckpoint}>
            Restart from Checkpoint
          </button>
          <button type="button" className="ol-btn" onClick={onRestart}>
            Restart Mission
          </button>
          <button type="button" className="ol-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="ol-btn" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="ol-btn" onClick={onQuit}>
            Quit to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Death({ reason, onCheckpoint, onRestart, onQuit, early }) {
  const title = reason === "duel" ? (early ? "Too early!" : "Outdrawn!") : reason === "objective" ? "Objective failed" : "You died";
  const text =
    reason === "duel"
      ? early
        ? "You drew before the signal. A gunslinger never draws early."
        : "Your opponent was faster this time. Steady your hand and try again."
      : reason === "objective"
        ? "The outlaws destroyed what you were protecting."
        : "The frontier is unforgiving. Use cover, keep moving and reload behind a wall.";
  return (
    <div className="ol-screen ol-dim red">
      <div className="ol-panel narrow center">
        <h2 className="ol-dead-title">{title}</h2>
        <p className="ol-center">{text}</p>
        <div className="ol-stack">
          <button type="button" className="ol-btn primary" onClick={onCheckpoint}>
            {reason === "duel" ? "Retry Duel" : "Retry from Checkpoint"}
          </button>
          <button type="button" className="ol-btn" onClick={onRestart}>
            Restart Mission
          </button>
          <button type="button" className="ol-btn" onClick={onQuit}>
            Quit to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Complete({ r, onNext, onShop, onMissions, onReplay, onMenu }) {
  const m = MISSION_BY_ID[r.id];
  const hasNext = r.id < MISSIONS.length;
  return (
    <div className="ol-screen ol-dim">
      <div className="ol-panel center complete">
        <div className="ol-brief-kicker">{`Mission ${m.id} · ${m.name}`}</div>
        <h2 className="ol-complete-title">Mission Complete</h2>
        <div className="ol-rank-badge">
          <span className="ol-rank-stars">{RANK_ICON[r.rank]}</span>
          <b>{r.rank}</b>
        </div>
        <div className="ol-results">
          <div>
            <span>Time</span>
            <b>{`${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, "0")}`}</b>
          </div>
          <div>
            <span>Outlaws defeated</span>
            <b>{r.kills}</b>
          </div>
          <div>
            <span>Headshots</span>
            <b>{r.headshots}</b>
          </div>
          <div>
            <span>Accuracy</span>
            <b>{`${r.accuracy}%`}</b>
          </div>
          <div>
            <span>Takedowns</span>
            <b>{r.takedowns}</b>
          </div>
          <div>
            <span>Deaths</span>
            <b>{r.deaths}</b>
          </div>
        </div>
        <div className="ol-rewards">
          <div>
            <span>Mission reward</span>
            <b>{`$${r.missionMoney} · ${r.missionXp} XP`}</b>
          </div>
          <div>
            <span>Loot and combat</span>
            <b>{`$${r.lootMoney} · ${r.combatXp} XP`}</b>
          </div>
          {!r.first && <div className="ol-note">Replays pay half the mission reward.</div>}
        </div>
        {r.levelAfter > r.levelBefore && <div className="ol-levelup">{`Level up! You are now level ${r.levelAfter}.`}</div>}
        {r.newWeapon && <div className="ol-levelup">{`New weapon: ${WEAPONS[r.newWeapon].name}`}</div>}
        <div className="ol-stack row">
          {hasNext && (
            <button type="button" className="ol-btn primary" onClick={onNext}>
              Next Mission
            </button>
          )}
          <button type="button" className="ol-btn" onClick={onShop}>
            Upgrades
          </button>
          <button type="button" className="ol-btn" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="ol-btn" onClick={onMissions}>
            Mission Select
          </button>
          <button type="button" className="ol-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Victory({ r, progress, onMenu, onMissions }) {
  const done = Object.values(progress.completed);
  const legends = done.filter((c) => c.rank === "Legend").length;
  return (
    <div className="ol-screen ol-victory">
      <div className="ol-victory-inner">
        <div className="ol-victory-kicker">Silas Crowe has fallen</div>
        <h1 className="ol-victory-title">A Legend Is Born</h1>
        <p>The Crowe gang is finished. Red Mesa rebuilds, the trains run on time again, and every saloon from here to the border tells the story of the drifter who outdrew them all.</p>
        <p>They don't call you a drifter anymore. They call you a legend.</p>
        <div className="ol-results wide">
          <div>
            <span>Final mission rank</span>
            <b>{r?.rank}</b>
          </div>
          <div>
            <span>Level</span>
            <b>{levelFromXp(progress.xp)}</b>
          </div>
          <div>
            <span>Missions completed</span>
            <b>{done.length}</b>
          </div>
          <div>
            <span>Legend ranks</span>
            <b>{legends}</b>
          </div>
        </div>
        <div className="ol-stack row">
          <button type="button" className="ol-btn primary" onClick={onMenu}>
            Main Menu
          </button>
          <button type="button" className="ol-btn" onClick={onMissions}>
            Mission Select
          </button>
        </div>
      </div>
    </div>
  );
}
