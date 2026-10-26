/**
 * Strike Force — menu screens (main, deploy, modes, maps, loadout,
 * settings, career, loading, results). All are overlays on the live 3D map
 * preview; they fit the stage with container-query units, scrolling only
 * inside their own panels.
 */
import { useEffect, useMemo, useState } from "react";
import { Icon, MapArt } from "./icons.jsx";
import { MAPS, mapMeta } from "../engine/maps/index.js";
import { MODES, DIFFICULTY, SIZES, STREAKS } from "../engine/config.js";
import { CATEGORIES, PRIMARIES, SECONDARIES, WEAPON_BY_ID, statBars } from "../engine/weapons.js";
import { rankOf } from "../progress.js";

const MODE_ICON = { tdm: Icon.tdm, ffa: Icon.ffa, dom: Icon.dom };
const TIPS = [
  "Aiming down sights tightens your spread dramatically — tap or burst at range.",
  "Crouching steadies your aim and makes you harder to spot from afar.",
  "The Viper SMX is suppressed: its shots don't alert distant enemies.",
  "Walk over a fallen soldier's weapon of your type to refill ammo; press F to swap for another.",
  "Three kills in a row launches a Recon UAV that reveals enemies on your radar.",
  "Firing interrupts a shotgun's shell-by-shell reload — you're never fully defenceless.",
  "Health regenerates after a few seconds out of fire. Break line of sight to recover.",
  "Domination points capture faster with more teammates inside the ring.",
  "Switching to your pistol is faster than reloading in a close fight.",
];

function Screen({ title, sub, onBack, children, wide = false, className = "" }) {
  return (
    <div className={`sf-screen ${wide ? "sf-screen--wide" : ""} ${className}`}>
      <header className="sf-screen__head">
        {onBack && (
          <button className="sf-back" onClick={onBack} aria-label="Back">
            <Icon.back size={18} />
            <span>Back</span>
          </button>
        )}
        <div>
          <h2 className="sf-screen__title">{title}</h2>
          {sub && <p className="sf-screen__sub">{sub}</p>}
        </div>
      </header>
      <div className="sf-screen__body">{children}</div>
    </div>
  );
}

function Logo({ small = false }) {
  return (
    <div className={`sf-logo ${small ? "sf-logo--small" : ""}`}>
      <div className="sf-logo__mark">
        <svg viewBox="0 0 48 48" aria-hidden>
          <path d="M24 3 42 10v13c0 11-7.8 19-18 22C13.8 42 6 34 6 23V10z" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M14 26 24 14l10 12h-6v8h-8v-8z" fill="currentColor" />
        </svg>
      </div>
      <div className="sf-logo__text">
        <span className="sf-logo__top">STRIKE FORCE</span>
        <span className="sf-logo__bottom">ELITE COMBAT</span>
      </div>
    </div>
  );
}

function RankBadge({ xp }) {
  const r = rankOf(xp);
  return (
    <div className="sf-rank" title={`${r.into} / ${r.need} XP`}>
      <div className="sf-rank__lvl">{r.level}</div>
      <div className="sf-rank__info">
        <span>RANK {r.level}</span>
        <div className="sf-rank__bar">
          <i style={{ width: `${(r.into / r.need) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== main */
export function MainMenu({ save, go, deploy, thumbs, previewBusy }) {
  const su = save.setup;
  const map = mapMeta(su.map);
  const p = WEAPON_BY_ID[save.loadout.primary];
  const s2 = WEAPON_BY_ID[save.loadout.secondary];
  useEffect(() => {
    const k = (e) => {
      if ((e.code === "Enter" || e.code === "NumpadEnter") && document.activeElement?.tagName !== "BUTTON") go("deploy");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);
  return (
    <div className="sf-main">
      <div className="sf-main__left">
        <Logo />
        <p className="sf-tagline">Lock In. Aim Sharp. Dominate.</p>
        <nav className="sf-nav">
          <button className="sf-nav__play" onClick={() => go("deploy")}>
            <Icon.play size={20} />
            <span>PLAY</span>
            <small>{MODES[su.mode].name} · {map.name}</small>
          </button>
          <button onClick={() => go("modes")}>
            <Icon.modes size={18} />
            <span>Game Modes</span>
          </button>
          <button onClick={() => go("maps")}>
            <Icon.map size={18} />
            <span>Map Selection</span>
          </button>
          <button onClick={() => go("loadout")}>
            <Icon.loadout size={18} />
            <span>Loadout</span>
          </button>
          <button onClick={() => go("settings")}>
            <Icon.settings size={18} />
            <span>Settings</span>
          </button>
          <button onClick={() => go("stats")}>
            <Icon.stats size={18} />
            <span>Career</span>
          </button>
        </nav>
      </div>
      <div className="sf-main__right">
        <RankBadge xp={save.stats.xp} />
        <div className="sf-card sf-summary">
          <div className="sf-summary__map">
            <MapArt id={su.map} />
            <div className="sf-summary__mapname">
              <b>{map.name}</b>
              <span>{map.time}</span>
            </div>
            {previewBusy && <div className="sf-summary__busy">Loading preview…</div>}
          </div>
          <div className="sf-summary__row">
            <span className="sf-chip">{MODES[su.mode].short}</span>
            <span className="sf-chip">{DIFFICULTY[su.difficulty].name} bots</span>
            <span className="sf-chip">{SIZES[su.size].name}</span>
          </div>
          <div className="sf-summary__guns">
            {[p, s2].map((w) => (
              <div key={w.id} className="sf-summary__gun">
                {thumbs[w.id] && <img src={thumbs[w.id]} alt="" />}
                <span>{w.name}</span>
              </div>
            ))}
          </div>
          <button className="sf-btn sf-btn--primary sf-btn--block" onClick={deploy}>
            DEPLOY NOW
          </button>
        </div>
        <p className="sf-disclaimer">Single-player vs AI soldiers · Original game · Progress saved on this device</p>
      </div>
    </div>
  );
}

/* ====================================================================== deploy */
export function Deploy({ save, commit, back, deploy, thumbs, go }) {
  const su = save.setup;
  const set = (patch) => commit((s) => ({ ...s, setup: { ...s.setup, ...patch } }));
  useEffect(() => {
    const k = (e) => {
      if ((e.code === "Enter" || e.code === "NumpadEnter") && document.activeElement?.tagName !== "BUTTON") deploy();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [deploy]);
  const p = WEAPON_BY_ID[save.loadout.primary];
  const s2 = WEAPON_BY_ID[save.loadout.secondary];
  return (
    <Screen title="Match Setup" sub="Choose how you want to fight" onBack={back} wide>
      <div className="sf-deploy">
        <div className="sf-deploy__col">
          <label className="sf-label">Game Mode</label>
          <div className="sf-seg sf-seg--modes">
            {Object.values(MODES).map((m) => {
              const I = MODE_ICON[m.id];
              return (
                <button key={m.id} className={su.mode === m.id ? "is-on" : ""} onClick={() => set({ mode: m.id })}>
                  <I size={20} />
                  <b>{m.name}</b>
                  <small>{m.id === "dom" ? `${m.limit} pts` : `${m.limit} kills`} · {Math.round(m.time / 60)} min</small>
                </button>
              );
            })}
          </div>
          <label className="sf-label">Map</label>
          <div className="sf-maprow">
            {MAPS.map((m) => (
              <button key={m.id} className={`sf-mapchip ${su.map === m.id ? "is-on" : ""}`} onClick={() => set({ map: m.id })} style={{ "--acc": m.accent }}>
                <MapArt id={m.id} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <div className="sf-deploy__pair">
            <div>
              <label className="sf-label">Bot Difficulty</label>
              <div className="sf-seg">
                {Object.values(DIFFICULTY).map((d) => (
                  <button key={d.id} className={su.difficulty === d.id ? "is-on" : ""} onClick={() => set({ difficulty: d.id })}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="sf-label">Match Size</label>
              <div className="sf-seg">
                {Object.values(SIZES).map((z) => (
                  <button key={z.id} className={su.size === z.id ? "is-on" : ""} onClick={() => set({ size: z.id })}>
                    {su.mode === "ffa" ? `${z.ffa} players` : z.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="sf-deploy__side">
          <div className="sf-card sf-deploy__load">
            <div className="sf-card__head">
              <span>Loadout</span>
              <button className="sf-link" onClick={() => go("loadout")}>
                Edit
              </button>
            </div>
            {[p, s2].map((w) => (
              <div key={w.id} className="sf-loadrow">
                {thumbs[w.id] && <img src={thumbs[w.id]} alt="" />}
                <div>
                  <b>{w.name}</b>
                  <small>{CATEGORIES.find((c) => c.id === w.cat).name}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="sf-card sf-deploy__brief">
            <b>{MODES[su.mode].name}</b>
            <p>{MODES[su.mode].blurb}</p>
            <p className="sf-muted">{mapMeta(su.map).blurb}</p>
          </div>
          <button className="sf-btn sf-btn--primary sf-btn--xl" onClick={deploy}>
            <Icon.play size={18} /> DEPLOY
          </button>
        </div>
      </div>
    </Screen>
  );
}

/* ====================================================================== modes */
export function Modes({ save, commit, back }) {
  const pick = (id) => commit((s) => ({ ...s, setup: { ...s.setup, mode: id } }));
  const rules = {
    tdm: ["Vanguard vs Obsidian", "Every kill scores for your team", "First to 50 or most kills at time"],
    ffa: ["Everyone is an enemy", "Only your own kills count", "First to 20 kills wins"],
    dom: ["Capture A, B and C", "Held points score every 3 s", "More allies on a point capture faster"],
  };
  return (
    <Screen title="Game Modes" sub="All modes are played against AI-controlled soldiers" onBack={back} wide>
      <div className="sf-modes">
        {Object.values(MODES).map((m) => {
          const I = MODE_ICON[m.id];
          const on = save.setup.mode === m.id;
          return (
            <button key={m.id} className={`sf-mode ${on ? "is-on" : ""}`} onClick={() => pick(m.id)}>
              <div className="sf-mode__icon">
                <I size={34} />
              </div>
              <b className="sf-mode__name">{m.name}</b>
              <p>{m.blurb}</p>
              <ul>
                {rules[m.id].map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <span className="sf-mode__meta">
                {m.id === "dom" ? `${m.limit} points` : `${m.limit} kills`} · {Math.round(m.time / 60)}:00
              </span>
              {on && (
                <span className="sf-mode__sel">
                  <Icon.check size={16} /> Selected
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/* ====================================================================== maps */
export function Maps({ save, commit, back, previewBusy }) {
  const pick = (id) => commit((s) => ({ ...s, setup: { ...s.setup, map: id } }));
  const won = save.stats.maps || {};
  return (
    <Screen title="Map Selection" sub={previewBusy ? "Loading live preview…" : "The background shows the selected map live"} onBack={back} wide className="sf-screen--maps">
      <div className="sf-maps">
        {MAPS.map((m) => {
          const on = save.setup.map === m.id;
          return (
            <button key={m.id} className={`sf-mapcard ${on ? "is-on" : ""}`} onClick={() => pick(m.id)} style={{ "--acc": m.accent }}>
              <div className="sf-mapcard__art">
                <MapArt id={m.id} />
                <span className="sf-mapcard__time">{m.time}</span>
              </div>
              <div className="sf-mapcard__info">
                <b>{m.name}</b>
                <p>{m.blurb}</p>
                <small>
                  {won[m.id]?.played ? `${won[m.id].won}/${won[m.id].played} won` : "Not played yet"}
                </small>
              </div>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/* ====================================================================== loadout */
export function Loadout({ save, setLoadoutLive, back, thumbs, inGame = false }) {
  const [slot, setSlot] = useState("primary");
  const lo = save.loadout;
  const [focus, setFocus] = useState(lo.primary);
  useEffect(() => setFocus(slot === "primary" ? lo.primary : lo.secondary), [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = slot === "primary" ? PRIMARIES : SECONDARIES;
  const w = WEAPON_BY_ID[focus] || list[0];
  const bars = statBars(w);
  const kills = save.stats.weapons || {};
  const equip = (id) => {
    setFocus(id);
    setLoadoutLive({ ...lo, [slot]: id });
  };
  const groups = useMemo(() => CATEGORIES.filter((c) => list.some((x) => x.cat === c.id)), [list]);
  const modeName = { auto: "Full-auto", semi: "Semi-auto", burst: "3-round burst", bolt: "Bolt-action", pump: "Pump-action" };
  return (
    <Screen title="Loadout" sub={inGame ? "Changes apply on your next spawn" : "Choose your primary and sidearm"} onBack={back} wide className="sf-screen--loadout">
      <div className="sf-loadout">
        <div className="sf-loadout__list">
          <div className="sf-seg sf-seg--tabs">
            <button className={slot === "primary" ? "is-on" : ""} onClick={() => setSlot("primary")}>
              Primary
            </button>
            <button className={slot === "secondary" ? "is-on" : ""} onClick={() => setSlot("secondary")}>
              Secondary
            </button>
          </div>
          <div className="sf-scroll">
            {groups.map((g) => (
              <div key={g.id} className="sf-wgroup">
                <span className="sf-label">{g.name}</span>
                {list
                  .filter((x) => x.cat === g.id)
                  .map((x) => {
                    const equipped = lo[slot] === x.id;
                    return (
                      <button key={x.id} className={`sf-wrow ${focus === x.id ? "is-focus" : ""} ${equipped ? "is-equipped" : ""}`} onClick={() => equip(x.id)}>
                        {thumbs[x.id] ? <img src={thumbs[x.id]} alt="" /> : <span className="sf-wrow__ph" />}
                        <span className="sf-wrow__name">{x.name}</span>
                        {equipped && <Icon.check size={16} className="sf-wrow__check" />}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
        <div className="sf-loadout__stage" aria-hidden />
        <div className="sf-loadout__info sf-card">
          <span className="sf-label">{CATEGORIES.find((c) => c.id === w.cat).name}</span>
          <h3 className="sf-wname">{w.name}</h3>
          <p className="sf-muted">{w.blurb}</p>
          <div className="sf-bars">
            {[
              ["Damage", bars.damage],
              ["Fire rate", bars.fireRate],
              ["Range", bars.range],
              ["Accuracy", bars.accuracy],
              ["Mobility", bars.mobility],
              ["Handling", bars.handling],
            ].map(([n, v]) => (
              <div key={n} className="sf-bar">
                <span>{n}</span>
                <div>
                  <i style={{ width: `${Math.round(v * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="sf-specs">
            <div>
              <small>Action</small>
              <b>{modeName[w.mode]}</b>
            </div>
            <div>
              <small>Fire rate</small>
              <b>{w.rpm} rpm</b>
            </div>
            <div>
              <small>Magazine</small>
              <b>
                {w.mag} / {w.reserve}
              </b>
            </div>
            <div>
              <small>Reload</small>
              <b>{w.perShell ? `${w.shellTime}s / shell` : `${w.reload}s`}</b>
            </div>
            <div>
              <small>Damage</small>
              <b>
                {w.pellets > 1 ? `${w.pellets}×${w.dmg}` : w.dmg}–{w.pellets > 1 ? `${w.pellets}×${w.dmgMin}` : w.dmgMin}
              </b>
            </div>
            <div>
              <small>Kills</small>
              <b>{kills[w.id] || 0}</b>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* ====================================================================== settings */
function Slider({ label, value, min, max, step = 0.05, fmt = (v) => v.toFixed(2), onChange }) {
  return (
    <label className="sf-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <b>{fmt(value)}</b>
    </label>
  );
}
function Toggle({ label, value, onChange }) {
  return (
    <button className={`sf-toggle ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span>{label}</span>
      <i />
    </button>
  );
}
export function SettingsPanel({ save, commit, toggleFullscreen }) {
  const s = save.settings;
  const set = (patch) => commit((sv) => ({ ...sv, settings: { ...sv.settings, ...patch } }));
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="sf-settings">
      <section className="sf-card">
        <h4>Graphics</h4>
        <div className="sf-seg sf-seg--q">
          {["auto", "low", "medium", "high"].map((q) => (
            <button key={q} className={s.quality === q ? "is-on" : ""} onClick={() => set({ quality: q })}>
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
        <p className="sf-muted sf-small">
          Low: no shadows/post-effects, reduced resolution. Medium: soft shadows, bloom, 2× MSAA. High: sharper shadows, 4× MSAA, more lights and particles, high-res ground textures (applies on next map load).
        </p>
        <Slider label="Field of view" value={s.fov} min={75} max={115} step={1} fmt={(v) => `${v}°`} onChange={(v) => set({ fov: v })} />
        <Toggle label="Show FPS counter" value={s.showFps} onChange={(v) => set({ showFps: v })} />
        <button className="sf-btn sf-btn--ghost" onClick={toggleFullscreen}>
          <Icon.fullscreen size={16} /> Toggle fullscreen
        </button>
      </section>
      <section className="sf-card">
        <h4>Controls</h4>
        <Slider label="Mouse sensitivity" value={s.sens} min={0.1} max={4} onChange={(v) => set({ sens: v })} />
        <Slider label="Aim (ADS) sensitivity" value={s.adsSens} min={0.2} max={1.5} onChange={(v) => set({ adsSens: v })} />
        <Slider label="Touch sensitivity" value={s.touchSens} min={0.2} max={3} onChange={(v) => set({ touchSens: v })} />
        <Toggle label="Invert vertical look" value={s.invert} onChange={(v) => set({ invert: v })} />
        <Toggle label="Toggle aim (instead of hold)" value={s.toggleAds} onChange={(v) => set({ toggleAds: v })} />
      </section>
      <section className="sf-card">
        <h4>Audio</h4>
        <Slider label="Master volume" value={s.master} min={0} max={1} fmt={pct} onChange={(v) => set({ master: v })} />
        <Slider label="Effects volume" value={s.sfx} min={0} max={1} fmt={pct} onChange={(v) => set({ sfx: v })} />
        <Slider label="Music volume" value={s.music} min={0} max={1} fmt={pct} onChange={(v) => set({ music: v })} />
      </section>
      <section className="sf-card sf-keys">
        <h4>Keyboard &amp; mouse</h4>
        <dl>
          {[
            ["W A S D", "Move"],
            ["Mouse", "Look"],
            ["Left click", "Fire"],
            ["Right click", "Aim down sights"],
            ["Shift", "Sprint"],
            ["C / Ctrl", "Crouch (toggle / hold)"],
            ["Space", "Jump · climb ladders with W"],
            ["R", "Reload"],
            ["1 · 2 · Q · Wheel", "Switch weapon"],
            ["F", "Swap for a dropped weapon"],
            ["I", "Inspect weapon"],
            ["Tab", "Scoreboard"],
            ["Esc", "Pause"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
export function Settings(props) {
  return (
    <Screen title="Settings" sub="Saved automatically on this device" onBack={props.back} wide>
      <div className="sf-scroll sf-scroll--settings">
        <SettingsPanel {...props} />
      </div>
    </Screen>
  );
}

/* ====================================================================== career */
export function Stats({ save, back, thumbs }) {
  const st = save.stats;
  const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
  const fav = Object.entries(st.weapons || {}).sort((a, b) => b[1] - a[1])[0];
  const r = rankOf(st.xp);
  const tiles = [
    ["Matches", st.matches],
    ["Win rate", st.matches ? `${Math.round((st.wins / st.matches) * 100)}%` : "—"],
    ["K / D", kd],
    ["Kills", st.kills],
    ["Headshot %", st.kills ? `${Math.round((st.headshots / st.kills) * 100)}%` : "—"],
    ["Accuracy", st.shots ? `${Math.round((st.hits / st.shots) * 100)}%` : "—"],
    ["Best streak", st.bestStreak],
    ["Captures", st.captures],
    ["Assists", st.assists],
    ["Time played", `${Math.floor(st.time / 3600)}h ${Math.floor((st.time % 3600) / 60)}m`],
  ];
  return (
    <Screen title="Career" sub={`Rank ${r.level} · ${st.xp.toLocaleString()} XP`} onBack={back} wide>
      <div className="sf-scroll">
        <div className="sf-tiles">
          {tiles.map(([k, v]) => (
            <div key={k} className="sf-tile">
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="sf-career">
          <div className="sf-card">
            <h4>Favourite weapon</h4>
            {fav ? (
              <div className="sf-loadrow">
                {thumbs[fav[0]] && <img src={thumbs[fav[0]]} alt="" />}
                <div>
                  <b>{WEAPON_BY_ID[fav[0]]?.name}</b>
                  <small>{fav[1]} kills</small>
                </div>
              </div>
            ) : (
              <p className="sf-muted">Play a match to find out.</p>
            )}
          </div>
          <div className="sf-card">
            <h4>Modes</h4>
            {Object.values(MODES).map((m) => (
              <div key={m.id} className="sf-kv">
                <span>{m.name}</span>
                <b>
                  {st.modes?.[m.id]?.won || 0} / {st.modes?.[m.id]?.played || 0} won
                </b>
              </div>
            ))}
          </div>
          <div className="sf-card">
            <h4>Kill streaks</h4>
            {STREAKS.map((s) => (
              <div key={s.id} className="sf-kv">
                <span>
                  {s.kills} kills — {s.name}
                </span>
                <b className="sf-muted">{s.blurb}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  );
}

/* ====================================================================== loading */
export function Loading({ setup, progress }) {
  const map = mapMeta(setup.map);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  return (
    <div className="sf-loading">
      <div className="sf-loading__art">
        <MapArt id={setup.map} />
      </div>
      <div className="sf-loading__panel">
        <Logo small />
        <span className="sf-label">{MODES[setup.mode].name}</span>
        <h2>{map.name}</h2>
        <p className="sf-muted">{map.blurb}</p>
        <div className="sf-progress">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="sf-tip">
          <b>TIP</b> {tip}
        </p>
      </div>
    </div>
  );
}

/* ====================================================================== results */
export function Results({ results, onAgain, onMenu, go, save }) {
  const { snap, result, mode, stats, xp } = results;
  const title = result?.draw ? "DRAW" : result?.won ? "VICTORY" : "DEFEAT";
  const teams = mode.teams;
  const rows = [...snap.combatants].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
  const r = rankOf(save.stats.xp);
  return (
    <div className={`sf-results sf-results--${title.toLowerCase()}`}>
      <div className="sf-results__banner">
        <span className="sf-label">{mode.name}</span>
        <h1>{title}</h1>
        {teams ? (
          <div className="sf-results__score">
            <span className="t0">{snap.scores[snap.team]}</span>
            <i>—</i>
            <span className="t1">{snap.scores[1 - snap.team]}</span>
          </div>
        ) : (
          <div className="sf-results__score">
            <span className="t0">#{result.place}</span>
          </div>
        )}
      </div>
      <div className="sf-results__body">
        <div className="sf-tiles sf-tiles--compact">
          {[
            ["Score", stats.score],
            ["Kills", stats.kills],
            ["Deaths", stats.deaths],
            ["Assists", stats.assists],
            ["Headshots", stats.headshots],
            ["Accuracy", `${acc}%`],
            ["Best streak", stats.best],
            ...(mode.id === "dom" ? [["Captures", stats.caps]] : []),
          ].map(([k, v]) => (
            <div key={k} className="sf-tile">
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="sf-card sf-results__table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Soldier</th>
                <th>Score</th>
                <th>K</th>
                <th>D</th>
                <th>A</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} className={`${c.isPlayer ? "is-you" : ""} ${teams ? (c.team === snap.team ? "is-ally" : "is-enemy") : ""}`}>
                  <td>{i + 1}</td>
                  <td>
                    {!teams && <i className="sf-dot" style={{ background: c.color }} />}
                    {c.name}
                    {result.mvp === c.id && <em className="sf-mvp">MVP</em>}
                  </td>
                  <td>{c.score}</td>
                  <td>{c.kills}</td>
                  <td>{c.deaths}</td>
                  <td>{c.assists}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sf-results__xp">
          <span>+{xp} XP</span>
          <div className="sf-rank__bar">
            <i style={{ width: `${(r.into / r.need) * 100}%` }} />
          </div>
          <small>Rank {r.level}</small>
        </div>
        <div className="sf-results__actions">
          <button className="sf-btn sf-btn--primary" onClick={onAgain}>
            Play again
          </button>
          <button className="sf-btn" onClick={() => go("deploy")}>
            Change setup
          </button>
          <button className="sf-btn sf-btn--ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
