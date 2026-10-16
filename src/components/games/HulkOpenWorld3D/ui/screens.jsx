/**
 * Hulk: Open World 3D — React menus (rendered over the live 3D city).
 * Everything here is presentational: actions come in as callbacks.
 */
import { MISSIONS, ACTIVITIES } from "../data/missions.js";
import { UPGRADES, MAX_RANK, upgradeCost, levelInfo, pointsLeft, computeStats } from "../engine/progress.js";
import { DISTRICTS } from "../engine/city.js";
import { MAX_LEVEL } from "../engine/config.js";

const TYPE_OF = (m) => {
  const t = m.steps.map((s) => s.type);
  if (t.includes("boss")) return "Boss";
  if (t.includes("protect") || t.includes("rescue")) return "Protect";
  if (t.includes("defend")) return "Defend";
  if (t.includes("waves")) return "Survive";
  if (t.includes("roofs")) return "Rooftops";
  if (t.includes("convoy")) return "Pursuit";
  if (t.includes("destroy")) return "Destroy";
  return "Combat";
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function MainMenu({ prog, onPlay, onContinue, onFree, onScreen }) {
  const L = levelInfo(prog.xp);
  const next = MISSIONS.find((m) => !prog.completed.includes(m.id) && m.id <= prog.unlocked) || null;
  return (
    <div className="hk-menu">
      <div className="hk-menu__brand">
        <div className="hk-menu__title">
          HULK<span>: OPEN WORLD 3D</span>
        </div>
        <div className="hk-menu__tag">SMASH • LEAP • DOMINATE</div>
      </div>
      <div className="hk-menu__buttons">
        <button className="hk-btn hk-btn--primary" onClick={onPlay}>
          Play
          <small>{next ? `Mission ${next.id}: ${next.title}` : "All missions complete — replay any"}</small>
        </button>
        <button className="hk-btn" onClick={onContinue}>
          Continue
          <small>{prog.free ? "Back to the city where you left off" : next ? `Resume the story` : "Free Roam"}</small>
        </button>
        <button className="hk-btn" onClick={onFree}>
          Free Roam
          <small>Explore, fight patrols, activities, landmarks</small>
        </button>
        <button className="hk-btn" onClick={() => onScreen("missions")}>
          Missions
          <small>
            {prog.completed.length} / {MISSIONS.length} complete
          </small>
        </button>
        <button className="hk-btn" onClick={() => onScreen("upgrades")}>
          Upgrades
          <small>{pointsLeft(prog) > 0 ? `${pointsLeft(prog)} point${pointsLeft(prog) === 1 ? "" : "s"} to spend` : `Level ${L.level}`}</small>
        </button>
        <div className="hk-menu__row">
          <button className="hk-btn hk-btn--small" onClick={() => onScreen("how")}>
            How to Play
          </button>
          <button className="hk-btn hk-btn--small" onClick={() => onScreen("settings")}>
            Settings
          </button>
        </div>
      </div>
      <div className="hk-menu__stats">
        <div className="hk-lvl">
          <span>LV {L.level}</span>
          <div className="hk-bar">
            <i style={{ transform: `scaleX(${L.frac})` }} />
          </div>
          <em>{L.level >= MAX_LEVEL ? "MAX" : `${Math.floor(L.into)} / ${L.need} XP`}</em>
        </div>
        <div className="hk-menu__chips">
          <span>Bosses {Object.values(prog.bosses).filter(Boolean).length}/3</span>
          <span>Landmarks {prog.discovered.length}/10</span>
          <span>Defeated {prog.totals.kills}</span>
        </div>
      </div>
    </div>
  );
}

export function MissionSelect({ prog, onBack, onPick }) {
  return (
    <div className="hk-panel hk-panel--wide">
      <header className="hk-panel__head">
        <button className="hk-back" onClick={onBack}>
          ← Back
        </button>
        <h2>Missions</h2>
        <span className="hk-panel__sub">
          {prog.completed.length} / {MISSIONS.length} complete
        </span>
      </header>
      <div className="hk-missions">
        {MISSIONS.map((m) => {
          const locked = m.id > prog.unlocked;
          const done = prog.completed.includes(m.id);
          const best = prog.best[m.id];
          return (
            <button key={m.id} className={`hk-mcard${locked ? " is-locked" : ""}${done ? " is-done" : ""}${m.boss ? " is-boss" : ""}`} disabled={locked} onClick={() => onPick(m.id)}>
              <span className="hk-mcard__n">{m.id}</span>
              <span className="hk-mcard__t">{m.title}</span>
              <span className="hk-mcard__meta">
                <i style={{ background: DISTRICTS[m.district].color }} />
                {DISTRICTS[m.district].name} · {TYPE_OF(m)}
              </span>
              <span className="hk-mcard__s">{locked ? "🔒 Locked" : done ? `✔ Complete${best ? ` · ${fmt(best.time)}` : ""}` : `${m.xp} XP`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Briefing({ mission, onStart, onBack, hints }) {
  return (
    <div className="hk-brief">
      <div className="hk-brief__card">
        <div className="hk-brief__kicker">
          Mission {mission.id} · {DISTRICTS[mission.district].name} · {TYPE_OF(mission)}
        </div>
        <h2>{mission.title}</h2>
        <p>{mission.brief}</p>
        <ol className="hk-brief__steps">
          {mission.steps.map((s, i) => (
            <li key={i}>{s.label}</li>
          ))}
        </ol>
        <div className="hk-brief__reward">Reward: {mission.xp} XP{mission.boss ? " + boss bonus + 2 upgrade points" : " + 1 upgrade point"}</div>
        {hints && <div className="hk-brief__hint">Click the game to capture the mouse. ESC pauses. M opens the city map, Tab the upgrades.</div>}
        <div className="hk-brief__actions">
          <button className="hk-btn hk-btn--primary" onClick={onStart}>
            Start Mission
          </button>
          <button className="hk-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpgradesPanel({ prog, onBuy, onReset, onBack, inGame }) {
  const L = levelInfo(prog.xp);
  const pts = pointsLeft(prog);
  const st = computeStats(prog);
  return (
    <div className={`hk-panel hk-panel--wide${inGame ? " hk-panel--overlay" : ""}`}>
      <header className="hk-panel__head">
        <button className="hk-back" onClick={onBack}>
          ← {inGame ? "Resume" : "Back"}
        </button>
        <h2>Upgrades</h2>
        <span className="hk-panel__sub">
          Level {L.level} · <b className={pts > 0 ? "hk-pts" : ""}>{pts} point{pts === 1 ? "" : "s"}</b>
        </span>
      </header>
      <div className="hk-upg__level">
        <div className="hk-bar hk-bar--xp">
          <i style={{ transform: `scaleX(${L.frac})` }} />
        </div>
        <span>{L.level >= MAX_LEVEL ? "MAX LEVEL" : `${Math.floor(L.into)} / ${L.need} XP to level ${L.level + 1}`}</span>
        <span className="hk-upg__stats">
          HP {st.maxHp} · Defense {Math.round((1 - st.defense) * 100)}% · Rage {st.rageMax} for {st.rageDur.toFixed(1)}s
        </span>
      </div>
      <div className="hk-upgrades">
        {UPGRADES.map((u) => {
          const r = prog.up[u.id];
          const max = r >= MAX_RANK;
          const cost = upgradeCost(r);
          return (
            <div key={u.id} className={`hk-upg${max ? " is-max" : ""}`}>
              <div className="hk-upg__icon">{u.icon}</div>
              <div className="hk-upg__body">
                <div className="hk-upg__name">{u.name}</div>
                <div className="hk-upg__desc">{u.desc}</div>
                <div className="hk-upg__pips">
                  {Array.from({ length: MAX_RANK }, (_, i) => (
                    <i key={i} className={i < r ? "on" : ""} />
                  ))}
                  <span>
                    {u.fmt(r)}
                    {!max && <em> → {u.fmt(r + 1)}</em>}
                  </span>
                </div>
              </div>
              <button className="hk-btn hk-btn--buy" disabled={max || pts < cost} onClick={() => onBuy(u.id)}>
                {max ? "MAX" : `+ ${cost} pt${cost > 1 ? "s" : ""}`}
              </button>
            </div>
          );
        })}
      </div>
      <footer className="hk-panel__foot">
        <span>Earn points by levelling up (XP from combat, destruction, missions, activities, landmarks), completing missions (+1) and beating bosses (+2).</span>
        <button className="hk-btn hk-btn--small" onClick={onReset} disabled={prog.spent === 0}>
          Refund all
        </button>
      </footer>
    </div>
  );
}

export function HowTo({ onBack, touch }) {
  return (
    <div className="hk-panel hk-panel--wide">
      <header className="hk-panel__head">
        <button className="hk-back" onClick={onBack}>
          ← Back
        </button>
        <h2>How to Play</h2>
      </header>
      <div className="hk-how">
        <section>
          <h3>Controls</h3>
          <dl>
            <dt>WASD</dt>
            <dd>Move (C toggles walk)</dd>
            <dt>Mouse</dt>
            <dd>Rotate the camera</dd>
            <dt>Shift</dt>
            <dd>Sprint — and smash through cars, fences and street furniture</dd>
            <dt>Space</dt>
            <dd>Tap to jump · HOLD to charge a SUPER LEAP, release to launch (steer in the air)</dd>
            <dt>Left mouse</dt>
            <dd>Punch combo (3 hits) · in the air: dive slam · carrying: THROW where you aim</dd>
            <dt>Right mouse</dt>
            <dd>Heavy punch · HOLD to charge a RAGE PUNCH</dd>
            <dt>Q</dt>
            <dd>Ground Smash shockwave (in the air: dive slam)</dd>
            <dt>F</dt>
            <dd>Thunder Clap — a forward blast that also swats projectiles</dd>
            <dt>E</dt>
            <dd>Grab / lift cars, barrels, crates, barriers · drop · start activities</dd>
            <dt>R</dt>
            <dd>Unleash RAGE when the meter is full: more damage, less damage taken</dd>
            <dt>M / Tab</dt>
            <dd>City map / Upgrades</dd>
            <dt>ESC</dt>
            <dd>Pause and release the mouse</dd>
          </dl>
          {touch && <p className="hk-how__note">Touch: left stick moves, drag the right side to look, on-screen buttons for every action.</p>}
        </section>
        <section>
          <h3>Tips</h3>
          <ul>
            <li>Land a fall from 11 m or more — or a dive slam — to create a damaging shockwave.</li>
            <li>Thrown cars explode on impact and crush everything nearby. They're your best weapon against armour and bosses.</li>
            <li>Enemies telegraph big attacks: a "!" over their health bar, red laser sights, glowing robots. Move!</li>
            <li>Bosses shrug off most damage. Wait for a weakness window — overheated vents, a stuck hammer, an exposed core — then go all in.</li>
            <li>Rage fills when you hit and get hit. Save it for big fights.</li>
            <li>Walls stop your punches and enemy bullets alike — use buildings as cover.</li>
            <li>Free Roam: discover landmarks, clear patrols and try the five blue activity rings for XP.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onBack, inGame }) {
  const S = settings;
  const set = (k, v) => onChange({ ...S, [k]: v });
  return (
    <div className={`hk-panel${inGame ? " hk-panel--overlay" : ""}`}>
      <header className="hk-panel__head">
        <button className="hk-back" onClick={onBack}>
          ← Back
        </button>
        <h2>Settings</h2>
      </header>
      <div className="hk-settings">
        <label>
          Mouse sensitivity <b>{S.sensitivity.toFixed(2)}</b>
          <input type="range" min="0.2" max="3" step="0.05" value={S.sensitivity} onChange={(e) => set("sensitivity", Number(e.target.value))} />
        </label>
        <label className="hk-check">
          <input type="checkbox" checked={S.invertY} onChange={(e) => set("invertY", e.target.checked)} /> Invert Y axis
        </label>
        <label>
          Field of view <b>{S.fov}°</b>
          <input type="range" min="55" max="95" step="1" value={S.fov} onChange={(e) => set("fov", Number(e.target.value))} />
        </label>
        <label>
          Volume <b>{Math.round(S.volume * 100)}%</b>
          <input type="range" min="0" max="1" step="0.05" value={S.volume} onChange={(e) => set("volume", Number(e.target.value))} />
        </label>
        <label className="hk-check">
          <input type="checkbox" checked={S.music} onChange={(e) => set("music", e.target.checked)} /> Music
        </label>
        <label className="hk-check">
          <input type="checkbox" checked={S.shake} onChange={(e) => set("shake", e.target.checked)} /> Camera shake
        </label>
        <label className="hk-check">
          <input type="checkbox" checked={S.hints} onChange={(e) => set("hints", e.target.checked)} /> Show hints
        </label>
        <div className="hk-seg">
          <span>Graphics</span>
          {["low", "medium", "high"].map((q) => (
            <button key={q} className={S.quality === q ? "on" : ""} onClick={() => set("quality", q)}>
              {q}
            </button>
          ))}
        </div>
        <div className="hk-seg">
          <span>Difficulty</span>
          {["easy", "normal", "hard"].map((q) => (
            <button key={q} className={S.difficulty === q ? "on" : ""} onClick={() => set("difficulty", q)}>
              {q}
            </button>
          ))}
        </div>
        <p className="hk-settings__note">Graphics changes rebuild the city renderer. Difficulty applies from the next mission or session.</p>
      </div>
    </div>
  );
}

export function PauseMenu({ mode, onResume, onRestart, onSettings, onMenu, onUpgrades }) {
  return (
    <div className="hk-pause">
      <div className="hk-pause__card">
        <h2>Paused</h2>
        <button className="hk-btn hk-btn--primary" onClick={onResume}>
          Resume
        </button>
        <button className="hk-btn" onClick={onRestart}>
          {mode === "mission" ? "Restart Mission" : "Restart Session"}
        </button>
        <button className="hk-btn" onClick={onUpgrades}>
          Upgrades
        </button>
        <button className="hk-btn" onClick={onSettings}>
          Settings
        </button>
        <button className="hk-btn" onClick={onMenu}>
          Main Menu
        </button>
        <p className="hk-pause__hint">Click Resume (or the game) to capture the mouse again.</p>
      </div>
    </div>
  );
}

export function Results({ r, onRetry, onNext, onMenu, hasNext }) {
  return (
    <div className="hk-result">
      <div className={`hk-result__card${r.win ? " is-win" : " is-fail"}`}>
        <div className="hk-result__kicker">Mission {r.mission}</div>
        <h2>{r.win ? "MISSION COMPLETE" : "MISSION FAILED"}</h2>
        <div className="hk-result__title">{r.title}</div>
        {!r.win && <div className="hk-result__reason">{r.reason}</div>}
        <div className="hk-result__grid">
          <div>
            <b>{r.xp}</b>
            <span>XP earned</span>
          </div>
          <div>
            <b>{r.kills}</b>
            <span>Enemies defeated</span>
          </div>
          <div>
            <b>{r.destruction}</b>
            <span>Destruction score</span>
          </div>
          <div>
            <b>{fmt(r.time)}</b>
            <span>Time</span>
          </div>
        </div>
        <div className="hk-result__xp">
          {r.win ? `Mission ${r.missionXp} XP · combat ${r.combatXp} XP${r.bossXp ? ` · boss ${r.bossXp} XP` : ""}` : `Combat XP kept: ${r.combatXp}`}
        </div>
        {r.notices && r.notices.length > 0 && (
          <ul className="hk-result__notices">
            {r.notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <div className="hk-result__actions">
          <button className="hk-btn" onClick={onRetry}>
            Retry
          </button>
          {r.win && hasNext && (
            <button className="hk-btn hk-btn--primary" onClick={onNext}>
              Continue
            </button>
          )}
          <button className="hk-btn" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export { ACTIVITIES };
