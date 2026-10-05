/**
 * Tower Defense Mini — menu screens (DOM over the live 3D diorama).
 */
import { useState } from "react";
import { LEVELS, levelsOfWorld } from "../data/levels.js";
import { WORLDS } from "../data/worlds.js";
import { TOWERS, TOWER_IDS, towerStats } from "../data/towers.js";
import { ENEMIES } from "../data/enemies.js";
import { parseWave } from "../engine/engine.js";
import { isUnlocked, isCleared, totalStars, favoriteTower, nextLevelId } from "../utils/storage.js";
import { Icon, TowerIcon, EnemyIcon, Stars, MiniMap } from "./ui.jsx";

function Header({ title, onBack, children }) {
  return (
    <div className="tdm-head">
      <button type="button" className="tdm-iconbtn" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <h2>{title}</h2>
      <div className="tdm-head__right">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ main menu */
export function MainMenu({ progress, onPlay, onLevels, onTowers, onStats, onSettings }) {
  const next = nextLevelId(progress);
  const stars = totalStars(progress);
  return (
    <div className="tdm-screen tdm-menu tdm-ui">
      <div className="tdm-menu__brand">
        <span className="tdm-menu__kicker">STRATEGY</span>
        <h1>
          <span>TOWER</span>
          <span>DEFENSE</span>
          <em>MINI</em>
        </h1>
        <p className="tdm-menu__tag">BUILD • DEFEND • SURVIVE</p>
      </div>
      <div className="tdm-menu__actions">
        <button type="button" className="tdm-btn tdm-btn--primary tdm-btn--big" onClick={onPlay}>
          <Icon name="play" size={20} />
          PLAY
          <small>LEVEL {next}</small>
        </button>
        <button type="button" className="tdm-btn" onClick={onLevels}>
          <Icon name="map" size={18} /> LEVELS
        </button>
        <div className="tdm-menu__row">
          <button type="button" className="tdm-btn" onClick={onTowers}>
            <Icon name="tower" size={18} /> TOWERS
          </button>
          <button type="button" className="tdm-btn" onClick={onStats}>
            <Icon name="chart" size={18} /> STATISTICS
          </button>
        </div>
        <button type="button" className="tdm-btn tdm-btn--ghost" onClick={onSettings}>
          <Icon name="gear" size={18} /> SETTINGS
        </button>
      </div>
      <div className="tdm-menu__foot">
        <span>
          <Icon name="star" size={15} /> {stars} / {LEVELS.length * 3}
        </span>
        <span>
          <Icon name="trophy" size={15} /> {Object.keys(progress.levels).length} / {LEVELS.length} CLEARED
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ level select */
const NODE_POS = [
  [11, 72],
  [27, 42],
  [43, 70],
  [59, 40],
  [74, 68],
  [89, 38],
];
export function LevelSelect({ progress, world, onWorld, onPlay, onBack, selected, onSelect }) {
  const W = WORLDS[world - 1];
  const list = levelsOfWorld(world);
  const worldOpen = list.length > 0 && isUnlocked(progress, list[0].id);
  const sel = list.find((l) => l.id === selected) || list.find((l) => isUnlocked(progress, l.id) && !isCleared(progress, l.id)) || list[0];
  const selOpen = sel && isUnlocked(progress, sel.id);
  const pts = NODE_POS.slice(0, Math.max(1, list.length));
  return (
    <div className="tdm-screen tdm-levels tdm-ui" style={{ "--w1": W.ui[0], "--w2": W.ui[1] }}>
      <Header title="SELECT LEVEL" onBack={onBack}>
        <span className="tdm-head__stars">
          <Icon name="star" size={16} /> {totalStars(progress)} / {LEVELS.length * 3}
        </span>
      </Header>
      <div className="tdm-worldtabs" role="tablist">
        {WORLDS.map((w) => {
          const first = levelsOfWorld(w.id)[0];
          const open = first && isUnlocked(progress, first.id);
          const stars = levelsOfWorld(w.id).reduce((a, l) => a + (progress.levels[l.id]?.stars || 0), 0);
          return (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === world}
              className={`tdm-worldtab${w.id === world ? " is-on" : ""}${open ? "" : " is-locked"}`}
              style={{ "--w1": w.ui[0], "--w2": w.ui[1] }}
              onClick={() => onWorld(w.id)}
            >
              <span className="tdm-worldtab__n">{w.id}</span>
              <span className="tdm-worldtab__name">{w.name.toUpperCase()}</span>
              <span className="tdm-worldtab__meta">{open ? <>
                    <Icon name="star" size={11} /> {stars}/{levelsOfWorld(w.id).length * 3}
                  </> : <Icon name="lock" size={12} />}</span>
            </button>
          );
        })}
      </div>
      <div className="tdm-levels__body">
        <div className={`tdm-trail${worldOpen ? "" : " is-locked"}`} style={{ "--g1": W.grass[0], "--g2": W.grass[3], "--road": W.road }}>
          <svg className="tdm-trail__path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--road)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 9 }} />
            <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.55)" strokeDasharray="2 10" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }} />
          </svg>
          <div className="tdm-trail__title">
            <b>{W.name.toUpperCase()}</b>
            <span>{W.blurb}</span>
          </div>
          {list.map((l, i) => {
            const open = isUnlocked(progress, l.id);
            const st = progress.levels[l.id]?.stars || 0;
            const [x, y] = NODE_POS[i] || [50, 50];
            return (
              <button
                key={l.id}
                type="button"
                className={`tdm-node${open ? "" : " is-locked"}${sel && sel.id === l.id ? " is-on" : ""}${st ? " is-done" : ""}${i === 5 ? " is-boss" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => onSelect(l.id)}
                onDoubleClick={() => open && onPlay(l.id)}
                aria-label={`Level ${l.id}${open ? "" : " (locked)"}`}
              >
                <span className="tdm-node__n">{open ? l.id : <Icon name="lock" size={18} />}</span>
                <Stars n={st} size={12} />
              </button>
            );
          })}
          {!list.length && <div className="tdm-trail__soon">COMING SOON</div>}
          {!worldOpen && list.length > 0 && (
            <div className="tdm-trail__lock">
              <Icon name="lock" size={30} />
              <span>Clear level {list[0].id - 1} to open {W.name}</span>
            </div>
          )}
        </div>
        {sel && (
          <div className="tdm-levelcard">
            <div className="tdm-levelcard__map">
              <MiniMap level={sel} locked={!selOpen} />
            </div>
            <div className="tdm-levelcard__info">
              <span className="tdm-levelcard__kicker">
                LEVEL {sel.id} · {W.name.toUpperCase()}
              </span>
              <b>{sel.name}</b>
              <div className="tdm-levelcard__meta">
                <span>
                  <Icon name="wave" size={14} /> {sel.waves.length} waves
                </span>
                <span>
                  <Icon name="coin" size={14} /> {sel.coins}
                </span>
                <span>
                  <Icon name="heart" size={14} /> {sel.lives}
                </span>
                {sel.paths.length > 1 && (
                  <span>
                    <Icon name="map" size={14} /> 2 roads
                  </span>
                )}
              </div>
              <div className="tdm-levelcard__foes">
                {Object.keys(sel.waves.reduce((acc, w) => Object.assign(acc, parseWave(w).counts), {}))
                  .sort((a, b) => Object.keys(ENEMIES).indexOf(a) - Object.keys(ENEMIES).indexOf(b))
                  .map((k) => (
                    <span key={k} title={ENEMIES[k].name} className={ENEMIES[k].boss ? "is-boss" : ""}>
                      <EnemyIcon type={k} size={20} />
                    </span>
                  ))}
              </div>
              <div className="tdm-levelcard__foot">
                <Stars n={progress.levels[sel.id]?.stars || 0} size={18} />
                <button type="button" className="tdm-btn tdm-btn--primary" disabled={!selOpen} onClick={() => onPlay(sel.id)}>
                  {selOpen ? (
                    <>
                      <Icon name="play" size={16} /> PLAY
                    </>
                  ) : (
                    <>
                      <Icon name="lock" size={16} /> LOCKED
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ towers */
export function TowersScreen({ type, level, onType, onLevel, onBack }) {
  const T = TOWERS[type];
  const stats = [1, 2, 3].map((l) => towerStats(type, l));
  const counters = {
    archer: ["raider", "scout"],
    cannon: ["swarmer", "raider"],
    frost: ["scout", "boss"],
    mage: ["armored", "brute", "boss"],
  }[type];
  return (
    <div className="tdm-screen tdm-towers tdm-ui" style={{ "--c": T.color }}>
      <Header title="TOWERS" onBack={onBack} />
      <div className="tdm-towers__body">
        <div className="tdm-towers__list" role="tablist">
          {TOWER_IDS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={id === type} className={`tdm-towertab${id === type ? " is-on" : ""}`} style={{ "--c": TOWERS[id].color }} onClick={() => onType(id)}>
              <TowerIcon type={id} size={34} />
              <span>{TOWERS[id].short}</span>
              <small>
                <Icon name="coin" size={11} /> {TOWERS[id].levels[0].cost}
              </small>
            </button>
          ))}
        </div>
        <div className="tdm-card tdm-towers__info">
          <span className="tdm-towers__role">{T.role.toUpperCase()}</span>
          <h3>{T.name}</h3>
          <p>{T.special}</p>
          <table className="tdm-statable">
            <thead>
              <tr>
                <th />
                {[1, 2, 3].map((l) => (
                  <th key={l}>
                    <button type="button" className={`tdm-lvchip${l === level ? " is-on" : ""}`} onClick={() => onLevel(l)}>
                      LV {l}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <Icon name="coin" size={13} /> Cost
                </td>
                {[0, 1, 2].map((i) => (
                  <td key={i}>{T.levels[i].cost}</td>
                ))}
              </tr>
              <tr>
                <td>
                  <Icon name="sword" size={13} /> Damage
                </td>
                {stats.map((s, i) => (
                  <td key={i}>{s.damage}</td>
                ))}
              </tr>
              <tr>
                <td>
                  <Icon name="clock" size={13} /> Speed
                </td>
                {stats.map((s, i) => (
                  <td key={i}>{s.attackSpeed.toFixed(2)}/s</td>
                ))}
              </tr>
              <tr>
                <td>
                  <Icon name="range" size={13} /> Range
                </td>
                {stats.map((s, i) => (
                  <td key={i}>{s.range.toFixed(1)}</td>
                ))}
              </tr>
              {type === "cannon" || type === "frost" ? (
                <tr>
                  <td>
                    <Icon name="splash" size={13} /> Splash
                  </td>
                  {stats.map((s, i) => (
                    <td key={i}>{s.splashRadius ? s.splashRadius.toFixed(2) : "—"}</td>
                  ))}
                </tr>
              ) : null}
              {type === "frost" && (
                <tr>
                  <td>
                    <Icon name="snow" size={13} /> Slow
                  </td>
                  {stats.map((s, i) => (
                    <td key={i}>
                      {Math.round(s.slowAmount * 100)}% · {s.slowDuration}s
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <td>
                  <Icon name="shield" size={13} /> vs Armour
                </td>
                <td colSpan={3}>{T.armorEffectiveness >= 1 ? "Ignores armour" : T.armorEffectiveness > 0 ? "Pierces half" : "Fully blocked"}</td>
              </tr>
            </tbody>
          </table>
          <div className="tdm-towers__counters">
            <span>STRONG AGAINST</span>
            {counters.map((k) => (
              <i key={k} title={ENEMIES[k].name}>
                <EnemyIcon type={k} size={22} />
                {ENEMIES[k].name}
              </i>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ statistics */
const fmtTime = (ms) => {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};
export function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const fav = favoriteTower(progress);
  const tiles = [
    ["trophy", "Levels completed", `${s.levelsCompleted} / ${LEVELS.length}`],
    ["star", "Stars earned", `${totalStars(progress)} / ${LEVELS.length * 3}`],
    ["sword", "Enemies defeated", s.enemiesDefeated],
    ["skull", "Bosses defeated", s.bossesDefeated],
    ["wave", "Waves survived", s.wavesSurvived],
    ["heart", "Perfect levels", s.perfectLevels],
    ["tower", "Towers built", s.towersBuilt],
    ["up", "Tower upgrades", s.towerUpgrades],
    ["coin", "Coins earned", s.coinsEarned],
    ["sell", "Coins spent", s.coinsSpent],
    ["clock", "Play time", fmtTime(s.playMs)],
  ];
  return (
    <div className="tdm-screen tdm-stats tdm-ui">
      <Header title="STATISTICS" onBack={onBack} />
      <div className="tdm-stats__grid">
        {tiles.map(([icon, label, v]) => (
          <div key={label} className="tdm-tile">
            <Icon name={icon} size={18} />
            <b>{v}</b>
            <span>{label}</span>
          </div>
        ))}
        <div className="tdm-tile tdm-tile--fav">
          {fav ? <TowerIcon type={fav} size={30} /> : <Icon name="tower" size={18} />}
          <b>{fav ? TOWERS[fav].short : "—"}</b>
          <span>Favourite tower</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */
function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="tdm-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={value} className={`tdm-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}
function Segment({ label, value, options, onChange }) {
  return (
    <div className="tdm-set">
      <span>{label}</span>
      <div className="tdm-seg">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" className={v === value ? "is-on" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
export function Settings({ settings, onChange, onBack, inGame }) {
  const set = (k) => (v) => onChange({ ...settings, [k]: v });
  return (
    <div className={`tdm-screen tdm-settings tdm-ui${inGame ? " is-ingame" : ""}`}>
      <Header title="SETTINGS" onBack={onBack} />
      <div className="tdm-settings__cols">
        <div className="tdm-card">
          <h3>AUDIO</h3>
          <Toggle label="Sound effects" value={settings.sound} onChange={set("sound")} />
          <Toggle label="Music" value={settings.music} onChange={set("music")} />
          <h3>GAMEPLAY</h3>
          <Segment label="Default speed" value={settings.speed} options={[[1, "1x"], [2, "2x"]]} onChange={set("speed")} />
          <Toggle label="Damage numbers" value={settings.damageNumbers} onChange={set("damageNumbers")} />
        </div>
        <div className="tdm-card">
          <h3>GRAPHICS</h3>
          <Segment label="Quality" value={settings.graphics} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} onChange={set("graphics")} />
          <Toggle label="Particles" value={settings.particles} onChange={set("particles")} />
          <Toggle label="Camera motion" value={settings.cameraMotion} onChange={set("cameraMotion")} hint="Gentle sway and impact shake" />
          <Toggle label="Reduced motion" value={settings.reducedMotion} onChange={set("reducedMotion")} hint="No shake, fewer effects" />
        </div>
      </div>
    </div>
  );
}

export { WORLDS };
