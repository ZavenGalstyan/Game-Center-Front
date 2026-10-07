/**
 * Pirate Cove — menu screens: Main Menu (3D harbour behind it), Statistics,
 * Settings and Controls. Adventure Select and Ships live in their own files.
 */
import { MenuScene } from "../three/MenuScene.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { TOTAL_ADVENTURES, getAdventure } from "../data/adventures.js";
import { SHIP_CLASSES } from "../data/ships.js";
import { REGIONS } from "../data/regions.js";

export function Logo({ small }) {
  return (
    <div className={`pc-logo${small ? " pc-logo--small" : ""}`}>
      <div className="pc-logo__title">
        <span>PIRATE</span>
        <span>COVE</span>
      </div>
      <div className="pc-logo__tag">SAIL • EXPLORE • CONQUER</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav, onAnyClick }) {
  const done = Object.keys(state.completed).length;
  const next = Math.min(state.unlocked, TOTAL_ADVENTURES);
  const nextAdv = getAdventure(done >= TOTAL_ADVENTURES ? state.lastAdventure || 1 : next);
  const look = { ...state.look, hullColor: "#6b4428", flag: "player" };
  return (
    <div className="pc-menu" onPointerDown={onAnyClick}>
      <div className="pc-menu__canvas">
        <MenuScene shipId={state.ship} look={look} />
      </div>
      <div className="pc-menu__veil" />
      <div className="pc-menu__content">
        <Logo />
        <nav className="pc-menu__nav">
          <button type="button" className="pc-menu-btn pc-menu-btn--primary" onClick={() => onPlay(nextAdv.id)}>
            <span>{done > 0 ? "CONTINUE" : "PLAY"}</span>
            <small>
              {nextAdv.id}. {nextAdv.name}
            </small>
          </button>
          <button type="button" className="pc-menu-btn" onClick={() => onNav("adventures")}>
            ADVENTURES
          </button>
          <button type="button" className="pc-menu-btn" onClick={() => onNav("ships")}>
            SHIPS
          </button>
          <button type="button" className="pc-menu-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="pc-menu-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="pc-menu-btn" onClick={() => onNav("controls")}>
            CONTROLS
          </button>
        </nav>
      </div>
      <div className="pc-menu__status">
        <span>
          <i className="pc-coin" /> {state.gold}
        </span>
        <span>
          {done}/{TOTAL_ADVENTURES} adventures
        </span>
        <span>{SHIP_CLASSES[state.ship].name}</span>
      </div>
    </div>
  );
}

function Screen({ title, onBack, children, wide }) {
  return (
    <div className="pc-screen">
      <div className={`pc-screen__panel${wide ? " pc-screen__panel--wide" : ""}`}>
        <div className="pc-screen__head">
          <button type="button" className="pc-back" onClick={onBack}>
            ← BACK
          </button>
          <h2>{title}</h2>
        </div>
        <div className="pc-screen__body">{children}</div>
      </div>
    </div>
  );
}

const fmtTime = (s) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};

export function Statistics({ state, onBack }) {
  const s = state.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const totalIslands = REGIONS.reduce((n, r) => n + r.islands.length, 0);
  const tiles = [
    ["Adventures Completed", `${Object.keys(state.completed).length} / ${TOTAL_ADVENTURES}`],
    ["Treasures Found", s.treasures],
    ["Enemy Ships Sunk", s.shipsSunk],
    ["Pirates Defeated", s.foes],
    ["Gold Collected", s.goldCollected],
    ["Distance Sailed", `${(s.distance / 1852).toFixed(1)} nmi`],
    ["Cannon Shots Fired", s.shots],
    ["Cannon Hits", `${s.hits} (${acc}%)`],
    ["Islands Discovered", `${s.islands.length} / ${totalIslands}`],
    ["Playtime", fmtTime(s.playtime)],
    ["Best Naval Battle", s.bestBattle == null ? "—" : fmtTime(s.bestBattle)],
    ["Gold in the Chest", state.gold],
  ];
  return (
    <Screen title="Captain's Log" onBack={onBack} wide>
      <div className="pc-stats">
        {tiles.map(([k, v]) => (
          <div key={k} className="pc-stat">
            <b>{v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function SettingsScreen({ settings, onChange, muted, onBack }) {
  return (
    <Screen title="Settings" onBack={onBack} wide>
      <SettingsPanel settings={settings} onChange={onChange} muted={muted} />
    </Screen>
  );
}

const SHIP_KEYS = [
  ["W / ↑", "Raise sails — more speed (stays set)"],
  ["S / ↓", "Lower sails — slow, then back slightly"],
  ["A / D", "Steer port / starboard"],
  ["Q", "Fire port (left) broadside"],
  ["E", "Fire starboard (right) broadside"],
  ["F", "Dock when the prompt appears"],
  ["Mouse", "Look around (eases back behind the ship)"],
  ["M", "Treasure map"],
];
const FOOT_KEYS = [
  ["WASD", "Move"],
  ["Mouse", "Camera"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["Left Mouse / J", "Sword attack (3-hit combo)"],
  ["Right Mouse / K", "Block (frontal)"],
  ["C", "Dodge roll"],
  ["E / F", "Interact · open · dig · board ship"],
  ["M", "Treasure map"],
];

export function ControlsList({ touch }) {
  return (
    <div className="pc-controls">
      <div className="pc-controls__col">
        <h3>⛵ Ship</h3>
        {touch ? (
          <ul>
            <li>Sail slider (left) sets your speed</li>
            <li>Drag the wheel to steer</li>
            <li>◀ FIRE / FIRE ▶ broadsides</li>
            <li>DOCK near a dock</li>
          </ul>
        ) : (
          <table>
            <tbody>
              {SHIP_KEYS.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="pc-controls__col">
        <h3>⚔ On Foot</h3>
        {touch ? (
          <ul>
            <li>Left stick moves (push fully to sprint)</li>
            <li>Drag the right side to look</li>
            <li>ATTACK · BLOCK · JUMP · DODGE · USE</li>
          </ul>
        ) : (
          <table>
            <tbody>
              {FOOT_KEYS.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="pc-controls__note">Esc / P pauses. Like, Restart, Mute and Fullscreen are the Game Center buttons around the game.</p>
    </div>
  );
}

export function ControlsScreen({ onBack, touch }) {
  return (
    <Screen title="Controls" onBack={onBack} wide>
      <ControlsList touch={touch} />
    </Screen>
  );
}

export { Screen };
