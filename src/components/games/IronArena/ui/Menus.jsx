/**
 * Iron Arena — menu screens: main menu, battle setup, maps, modes,
 * settings, loading and results. The 3D world (garage turntable or map
 * fly-over) renders behind every screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Icon, Coins, Header, ABILITY_ICON, fmtTime } from "./common.jsx";
import { MAP_LIST } from "../engine/maps/index.js";
import { MODES, MODE_IDS, DIFFICULTY } from "../engine/modes.js";
import { TANK_BY_ID, ABILITIES, tankStats, skinFor } from "../engine/tanks.js";
import { mapImage } from "./mapImage.js";

const TIPS = [
  "Angle your hull toward the enemy — sloped front armour is your best friend.",
  "Hold right mouse (or Scope on touch) to zoom; the Sniper zooms furthest.",
  "Your gun marker shows where the barrel will actually hit — wait for it to settle on target.",
  "Health regenerates slowly after 6 seconds out of combat. Break line of sight to recover.",
  "Splash damage from HE shells and plasma bolts reaches tanks hiding behind low cover.",
  "In Capture the Flag you can only score while your own flag is safe at home.",
  "Touch your team's dropped flag to send it straight back to base.",
  "Shallow water and ice slow you down — and ice makes you slide.",
  "Thunder's Overclock doubles fire rate without using ammo. Time it with a fresh magazine.",
  "Phantom's cloak breaks the moment it fires — pick your first shot carefully.",
];

export function MainMenu({ save, go, deploy, previewBusy }) {
  const tk = TANK_BY_ID[save.selected];
  const st = tankStats(save.selected, save.tanks[save.selected].up);
  const ab = ABILITIES[st.ability];
  const items = [
    ["play", "Play", "play", "Deploy into battle"],
    ["garage", "Garage", "garage", "Upgrades & skins"],
    ["tanks", "Tanks", "tanks", "Compare all 8"],
    ["maps", "Maps", "map", "5 battlefields"],
    ["modes", "Game Modes", "modes", "DM · Team · CTF"],
    ["settings", "Settings", "settings", "Audio · graphics"],
  ];
  return (
    <div className="ia-screen ia-main">
      <div className="ia-main__brand">
        <div className="ia-logo">
          <span className="ia-logo__iron">IRON</span>
          <span className="ia-logo__arena">ARENA</span>
          <span className="ia-logo__sub">TANK BATTLES</span>
        </div>
        <p className="ia-tagline">Arm Your Tank. Rule the Arena.</p>
        <nav className="ia-main__nav">
          {items.map(([id, label, icon, sub], i) => (
            <button key={id} className={`ia-navbtn${i === 0 ? " ia-navbtn--primary" : ""}`} onClick={() => (id === "play" ? go("play") : go(id))} style={{ animationDelay: `${i * 0.05}s` }}>
              <Icon name={icon} />
              <span>
                <b>{label}</b>
                <small>{sub}</small>
              </span>
            </button>
          ))}
        </nav>
      </div>
      <div className="ia-main__side">
        <Coins value={save.coins} big />
        <div className="ia-tankcard">
          <span className="ia-tankcard__cls">{tk.cls}</span>
          <h3>{tk.name}</h3>
          <p>{tk.role}</p>
          <div className="ia-tankcard__row">
            <span>
              <Icon name="damage" /> {st.weapon.name}
            </span>
            <span>
              <Icon name={ABILITY_ICON[ab.key]} /> {ab.name}
            </span>
          </div>
          <button className="ia-btn ia-btn--ghost" onClick={() => go("garage")}>
            Customize
          </button>
        </div>
        <button className="ia-deploy" onClick={() => deploy()} disabled={previewBusy}>
          <span>Quick Battle</span>
          <small>
            {MODES[save.setup.mode].name} · {MAP_LIST.find((m) => m.id === save.setup.map).name}
          </small>
        </button>
      </div>
    </div>
  );
}

export function Play({ save, commit, back, deploy, go }) {
  const s = save.setup;
  const set = (patch) => commit((sv) => ({ ...sv, setup: { ...sv.setup, ...patch } }));
  const tk = TANK_BY_ID[save.selected];
  const skin = skinFor(save.selected, save.tanks[save.selected].skin);
  return (
    <div className="ia-screen ia-play">
      <Header title="Battle Setup" sub="Choose a mode, a battlefield and the enemy's skill" onBack={back} right={<Coins value={save.coins} />} />
      <div className="ia-play__body">
        <section>
          <h4>Game mode</h4>
          <div className="ia-modes">
            {MODE_IDS.map((id) => (
              <button key={id} className={`ia-mode${s.mode === id ? " is-on" : ""}`} onClick={() => set({ mode: id })}>
                <b>{MODES[id].name}</b>
                <small>{id === "dm" ? "6 tanks · free for all" : "4 vs 4 · " + (id === "tdm" ? "team kills" : "flag captures")}</small>
              </button>
            ))}
          </div>
          <h4>Battlefield</h4>
          <div className="ia-maps ia-maps--compact">
            {MAP_LIST.map((m) => (
              <button key={m.id} className={`ia-mapcard${s.map === m.id ? " is-on" : ""}`} onClick={() => set({ map: m.id })}>
                <MapThumb id={m.id} />
                <span>
                  <b>{m.name}</b>
                  <small>{m.tag}</small>
                </span>
              </button>
            ))}
          </div>
          <h4>Difficulty</h4>
          <div className="ia-seg">
            {Object.entries(DIFFICULTY).map(([id, d]) => (
              <button key={id} className={s.difficulty === id ? "is-on" : ""} onClick={() => set({ difficulty: id })} title={d.blurb}>
                {d.name}
                <small>×{d.coins} coins</small>
              </button>
            ))}
          </div>
        </section>
        <aside className="ia-play__side">
          <div className="ia-tankcard ia-tankcard--small">
            <span className="ia-tankcard__cls">Your tank</span>
            <h3>{tk.name}</h3>
            <p>
              {skin.name} · {tk.cls}
            </p>
            <button className="ia-btn ia-btn--ghost" onClick={() => go("garage")}>
              Change tank
            </button>
          </div>
          <p className="ia-play__rules">{MODES[s.mode].blurb}</p>
          <button className="ia-deploy" onClick={() => deploy()}>
            <span>Deploy</span>
            <small>{DIFFICULTY[s.difficulty].name} AI</small>
          </button>
        </aside>
      </div>
    </div>
  );
}

function MapThumb({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    // build lazily, one per frame, so opening the screen stays snappy
    const t = setTimeout(() => setUrl(mapImage(id, 192, "card").url), 30);
    return () => clearTimeout(t);
  }, [id]);
  return <span className="ia-mapthumb" style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

export function Maps({ save, commit, back, previewBusy }) {
  const cur = save.setup.map;
  const meta = MAP_LIST.find((m) => m.id === cur);
  const blurbs = {
    desert: "Golden dunes surround a walled hilltop fortress. Rocky mesas on the flanks give long firing lanes; concrete bunkers and sandbag lines provide hull-down cover.",
    neon: "A rain-slick downtown at night. Two avenues link the team plazas, an elevated highway crosses the map above a central holo-plaza, and alleys open flanking routes.",
    forest: "Rolling hills split by a shallow river. Cross on two wooden bridges or wade slowly through the water. Pine stands, an old farmstead and stone walls give cover.",
    snow: "A frozen industrial base. Fight through a drive-through hangar and a fuel farm, slide across frozen ponds, or take the covered tunnels through the ridges.",
    harbor: "A dock peninsula between two basins. Container stacks form lanes, gantry cranes straddle the quays, and a raised loading platform holds the high ground.",
  };
  return (
    <div className="ia-screen ia-mapsel">
      <Header title="Maps" sub="Five original battlefields — the preview flies over the selected one" onBack={back} right={<Coins value={save.coins} />} />
      <div className="ia-mapsel__list">
        {MAP_LIST.map((m) => (
          <button key={m.id} className={`ia-mapcard${cur === m.id ? " is-on" : ""}`} onClick={() => commit((sv) => ({ ...sv, setup: { ...sv.setup, map: m.id } }))}>
            <MapThumb id={m.id} />
            <span>
              <b>{m.name}</b>
              <small>{m.tag}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="ia-mapsel__info">
        <h3>{meta.name}</h3>
        <p>{blurbs[cur]}</p>
        {previewBusy && <span className="ia-pill">Loading preview…</span>}
      </div>
    </div>
  );
}

export function Modes({ save, commit, back }) {
  const cur = save.setup.mode;
  const rules = {
    dm: ["6 tanks, every tank for itself", "First to 15 kills wins", "Or most kills after 5 minutes", "Respawn after 4 seconds"],
    tdm: ["Blue vs Red, 4 tanks per team", "Teams field the same tank types", "First team to 25 kills wins", "7-minute time limit · 5 s respawn"],
    ctf: ["Each team defends a flag at its base", "Drive over the enemy flag to take it", "Capture by reaching your base while your flag is home", "Touch your dropped flag to return it · 3 captures win"],
  };
  return (
    <div className="ia-screen ia-modesel">
      <Header title="Game Modes" sub="All three run against AI crews" onBack={back} right={<Coins value={save.coins} />} />
      <div className="ia-modesel__grid">
        {MODE_IDS.map((id) => (
          <button key={id} className={`ia-modecard${cur === id ? " is-on" : ""}`} onClick={() => commit((sv) => ({ ...sv, setup: { ...sv.setup, mode: id } }))}>
            <span className="ia-modecard__icon">
              <Icon name={id === "dm" ? "skull" : id === "tdm" ? "tanks" : "flag"} />
            </span>
            <h3>{MODES[id].name}</h3>
            <ul>
              {rules[id].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {cur === id && <span className="ia-pill">Selected</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings({ save, commit, back, toggleFullscreen, inGame = false, onReset }) {
  const s = save.settings;
  const set = (patch) => commit((sv) => ({ ...sv, settings: { ...sv.settings, ...patch } }));
  const [confirm, setConfirm] = useState(false);
  // plain render helpers (not components) so sliders keep focus while dragging
  const slider = (label, k, min = 0, max = 1, step = 0.05, fmt = (v) => Math.round(v * 100) + "%") => (
    <label className="ia-field" key={k}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} />
      <b>{fmt(s[k])}</b>
    </label>
  );
  const toggle = (label, k) => (
    <label className="ia-field ia-field--toggle" key={k}>
      <span>{label}</span>
      <button className={`ia-toggle${s[k] ? " is-on" : ""}`} onClick={() => set({ [k]: !s[k] })} aria-pressed={s[k]}>
        <i />
      </button>
    </label>
  );
  return (
    <div className={`ia-screen ia-settings${inGame ? " ia-settings--ingame" : ""}`}>
      {!inGame && <Header title="Settings" sub="Saved automatically" onBack={back} right={<Coins value={save.coins} />} />}
      <div className="ia-settings__cols">
        <section>
          <h4>Graphics</h4>
          <div className="ia-field">
            <span>Quality</span>
            <div className="ia-seg ia-seg--small">
              {["auto", "low", "medium", "high"].map((q) => (
                <button key={q} className={s.quality === q ? "is-on" : ""} onClick={() => set({ quality: q })}>
                  {q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {slider("Field of view", "fov", 50, 80, 1, (v) => Math.round(v) + "°")}
          {toggle("Camera shake", "shake")}
          {toggle("Show FPS", "showFps")}
          <div className="ia-field">
            <span>Display</span>
            <button className="ia-btn ia-btn--ghost" onClick={toggleFullscreen}>
              <Icon name="expand" /> Toggle fullscreen
            </button>
          </div>
        </section>
        <section>
          <h4>Audio</h4>
          {slider("Master", "master")}
          {slider("Music", "music")}
          {slider("Effects", "sfx")}
          <h4>Controls</h4>
          {slider("Mouse sensitivity", "sens", 0.2, 3, 0.05, (v) => v.toFixed(2))}
          {slider("Touch sensitivity", "touchSens", 0.2, 3, 0.05, (v) => v.toFixed(2))}
          {toggle("Invert vertical aim", "invert")}
          {toggle("Toggle scope (instead of hold)", "toggleScope")}
        </section>
      </div>
      {!inGame && (
        <div className="ia-settings__foot">
          <div className="ia-keys">
            <span><kbd>W A S D</kbd> drive</span>
            <span><kbd>Mouse</kbd> aim turret</span>
            <span><kbd>LMB</kbd> fire</span>
            <span><kbd>RMB</kbd> scope</span>
            <span><kbd>Wheel</kbd> zoom</span>
            <span><kbd>Space</kbd>/<kbd>E</kbd> ability</span>
            <span><kbd>Tab</kbd> scores</span>
            <span><kbd>C</kbd> centre camera</span>
            <span><kbd>Esc</kbd> pause</span>
          </div>
          {onReset &&
            (confirm ? (
              <span className="ia-confirm">
                Erase all coins, tanks and upgrades?
                <button className="ia-btn ia-btn--danger" onClick={() => (onReset(), setConfirm(false))}>
                  Erase
                </button>
                <button className="ia-btn ia-btn--ghost" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="ia-btn ia-btn--ghost" onClick={() => setConfirm(true)}>
                Reset progress
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function Loading({ setup, progress, tank }) {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const meta = MAP_LIST.find((m) => m.id === setup.map);
  const img = useMemo(() => mapImage(setup.map, 256, "card").url, [setup.map]);
  return (
    <div className="ia-screen ia-loading">
      <div className="ia-loading__card">
        <span className="ia-loading__map" style={{ backgroundImage: `url(${img})` }} />
        <div>
          <span className="ia-pill">{MODES[setup.mode].name}</span>
          <h2>{meta.name}</h2>
          <p>
            {DIFFICULTY[setup.difficulty].name} AI · driving the {tank}
          </p>
          <div className="ia-progress">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <small className="ia-loading__pct">Preparing battlefield… {Math.round(progress * 100)}%</small>
        </div>
      </div>
      <p className="ia-tip">
        <b>TIP</b> {tip}
      </p>
    </div>
  );
}

export function Results({ results, save, onAgain, onMenu, onGarage }) {
  const { result, mode, board, player, reward, team, time, unlockable } = results;
  const title = result === "win" ? "VICTORY" : result === "draw" ? "DRAW" : "DEFEAT";
  const sorted = [...board].sort((a, b) => (mode.teams ? a.team - b.team : 0) || b.kills - a.kills || a.deaths - b.deaths || b.score - a.score);
  return (
    <div className={`ia-screen ia-results ia-results--${result}`}>
      <div className="ia-results__banner">
        <span className="ia-results__mode">
          {mode.name} · {fmtTime(time)}
        </span>
        <h1>{title}</h1>
        {mode.teams && (
          <div className="ia-results__score">
            <b className="ia-blue">{results.scores[0]}</b>
            <span>{mode.id === "ctf" ? "captures" : "kills"}</span>
            <b className="ia-red">{results.scores[1]}</b>
          </div>
        )}
        {!mode.teams && <div className="ia-results__score"><span>You placed</span><b>#{results.place}</b><span>of {board.length}</span></div>}
      </div>
      <div className="ia-results__body">
        <div className="ia-results__board">
          <table>
            <thead>
              <tr>
                <th>Commander</th>
                <th>Tank</th>
                <th>K</th>
                <th>D</th>
                <th>A</th>
                {mode.id === "ctf" && <th>Caps</th>}
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className={`${r.isPlayer ? "is-you" : ""} ${mode.teams ? (r.team === team ? "is-ally" : "is-enemy") : ""}`}>
                  <td>
                    <i className="ia-dot" style={{ background: mode.teams ? (r.team ? "#ff5245" : "#3fa9ff") : r.color }} />
                    {r.name}
                  </td>
                  <td>{r.tank}</td>
                  <td>{r.kills}</td>
                  <td>{r.deaths}</td>
                  <td>{r.assists}</td>
                  {mode.id === "ctf" && <td>{r.caps}</td>}
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ia-results__side">
          <h4>Rewards</h4>
          <ul className="ia-reward">
            {reward.lines.map(([label, v]) => (
              <li key={label}>
                <span>{label}</span>
                <b>+{v}</b>
              </li>
            ))}
            {reward.diff !== 1 && (
              <li>
                <span>Difficulty multiplier</span>
                <b>×{reward.diff}</b>
              </li>
            )}
            <li className="ia-reward__total">
              <span>Total</span>
              <b>+{reward.total}</b>
            </li>
          </ul>
          <div className="ia-results__wallet">
            <Coins value={save.coins} big animate />
          </div>
          <div className="ia-results__personal">
            <span>
              <Icon name="skull" /> {player.kills} kills
            </span>
            <span>
              <Icon name="damage" /> {Math.round(player.damage)} damage
            </span>
            <span>
              <Icon name="star" /> best streak {player.bestStreak}
            </span>
          </div>
          {unlockable && (
            <button className="ia-unlockhint" onClick={onGarage}>
              <Icon name="lock" /> You can now afford the <b>{unlockable}</b>! Visit the garage
            </button>
          )}
          <div className="ia-results__btns">
            <button className="ia-deploy" onClick={onAgain}>
              <span>Play again</span>
            </button>
            <button className="ia-btn" onClick={onGarage}>
              <Icon name="garage" /> Garage
            </button>
            <button className="ia-btn ia-btn--ghost" onClick={onMenu}>
              Main menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
