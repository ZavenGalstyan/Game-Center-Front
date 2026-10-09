/**
 * Pirate Cove — gameplay overlays: click-to-begin (pointer lock needs a
 * click), pause, ship lost, defeated ashore, and adventure complete.
 */
import { SettingsPanel } from "../screens/SettingsPanel.jsx";

export function ClickToBegin({ adv, region, onBegin, touch }) {
  return (
    <div className="pc-overlay pc-overlay--begin" onClick={onBegin}>
      <div className="pc-card pc-card--parchment">
        <div className="pc-card__kicker">
          {region.name} · Adventure {adv.id}
        </div>
        <h2 className="pc-card__title">{adv.name}</h2>
        <p className="pc-card__text">{adv.blurb}</p>
        <button type="button" className="pc-btn pc-btn--primary" onClick={onBegin}>
          {touch ? "TAP TO SET SAIL" : "CLICK TO SET SAIL"}
        </button>
        {!touch && <div className="pc-card__hint">Mouse look · Esc / P to pause</div>}
      </div>
    </div>
  );
}

export function PauseMenu({ onResume, onCheckpoint, onRestart, onQuit, settings, onChangeSettings, muted, onControls }) {
  return (
    <div className="pc-overlay">
      <div className="pc-card pc-card--wide">
        <h2 className="pc-card__title">Paused</h2>
        <div className="pc-pause">
          <div className="pc-pause__btns">
            <button type="button" className="pc-btn pc-btn--primary" onClick={onResume}>
              RESUME
            </button>
            <button type="button" className="pc-btn" onClick={onCheckpoint}>
              RESTART FROM CHECKPOINT
            </button>
            <button type="button" className="pc-btn" onClick={onRestart}>
              RESTART ADVENTURE
            </button>
            <button type="button" className="pc-btn" onClick={onControls}>
              CONTROLS
            </button>
            <button type="button" className="pc-btn pc-btn--dim" onClick={onQuit}>
              QUIT TO MENU
            </button>
          </div>
          <div className="pc-pause__settings">
            <SettingsPanel settings={settings} onChange={onChangeSettings} muted={muted} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LostScreen({ kind, onRetry, onQuit }) {
  const ship = kind === "ship";
  return (
    <div className="pc-overlay pc-overlay--lost">
      <div className="pc-card">
        <h2 className="pc-card__title pc-card__title--red">{ship ? "Ship Lost" : "Defeated"}</h2>
        <p className="pc-card__text">{ship ? "Your hull gave way and she went down. The crew swims back to the last safe point." : "You fall in the sand. Your crew drags you back to the last safe point."}</p>
        <p className="pc-card__hint">Progress and gold banked from earlier adventures are safe.</p>
        <div className="pc-row">
          <button type="button" className="pc-btn pc-btn--primary" onClick={onRetry}>
            RESTART FROM CHECKPOINT
          </button>
          <button type="button" className="pc-btn pc-btn--dim" onClick={onQuit}>
            QUIT
          </button>
        </div>
      </div>
    </div>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function CompleteScreen({ adv, result, hasNext, onNext, onMenu, onShips }) {
  const r = result.run;
  return (
    <div className="pc-overlay pc-overlay--complete">
      <div className="pc-card pc-card--parchment pc-card--wide">
        <div className="pc-card__kicker">Adventure Complete</div>
        <h2 className="pc-card__title">{adv.name}</h2>
        <div className="pc-results">
          <div>
            <b>{r.gold}</b>
            <span>Gold found</span>
          </div>
          {result.reward.bonus > 0 && (
            <div>
              <b>+{result.reward.bonus}</b>
              <span>Adventure bonus</span>
            </div>
          )}
          <div>
            <b>{r.shipsSunk}</b>
            <span>Ships sunk</span>
          </div>
          <div>
            <b>{r.foes}</b>
            <span>Foes defeated</span>
          </div>
          <div>
            <b>{r.treasures}</b>
            <span>Treasures</span>
          </div>
          <div>
            <b>{fmt(r.playtime)}</b>
            <span>Time</span>
          </div>
        </div>
        {result.reward.newShips?.length > 0 && <div className="pc-unlock">New ship unlocked: {result.reward.newShips.map((s) => s.toUpperCase()).join(", ")}!</div>}
        <div className="pc-row">
          {hasNext && (
            <button type="button" className="pc-btn pc-btn--primary" onClick={onNext}>
              NEXT ADVENTURE
            </button>
          )}
          <button type="button" className="pc-btn" onClick={onShips}>
            SHIPS &amp; UPGRADES
          </button>
          <button type="button" className="pc-btn pc-btn--dim" onClick={onMenu}>
            SEA CHART
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndingScreen({ state, onMenu }) {
  const s = state.stats;
  return (
    <div className="pc-overlay pc-overlay--complete">
      <div className="pc-card pc-card--parchment pc-card--wide">
        <div className="pc-card__kicker">The legend is yours</div>
        <h2 className="pc-card__title">The Treasure of Pirate Cove</h2>
        <p className="pc-card__text">From Palm Cove's little dock to the Black Crown's last broadside — every sea charted, every chest opened. The captains of the archipelago will tell this story for a hundred years.</p>
        <div className="pc-results">
          <div>
            <b>{state.gold}</b>
            <span>Gold</span>
          </div>
          <div>
            <b>{s.shipsSunk}</b>
            <span>Ships sunk</span>
          </div>
          <div>
            <b>{s.treasures}</b>
            <span>Treasures</span>
          </div>
          <div>
            <b>{s.foes}</b>
            <span>Foes defeated</span>
          </div>
        </div>
        <div className="pc-row">
          <button type="button" className="pc-btn pc-btn--primary" onClick={onMenu}>
            RETURN TO PORT
          </button>
        </div>
      </div>
    </div>
  );
}
