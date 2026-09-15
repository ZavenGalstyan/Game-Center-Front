/**
 * Supermarket Rush — the pause menu (Esc while playing). Separate from the
 * "click to play" pointer-lock overlay in Hud.jsx: this is an explicit
 * pause the player asked for, with Controls and a compact Settings panel
 * inline (no navigating away from the shift in progress).
 */
import { useState } from "react";

export default function PauseMenu({ onResume, onRestart, onExit, settings, onChangeSettings }) {
  const [view, setView] = useState("menu");

  if (view === "controls") {
    return (
      <div className="sr-pause">
        <div className="sr-pause__card">
          <h2>Controls</h2>
          <ul className="sr-pause__controls">
            <li><span>WASD</span> Move</li>
            <li><span>Mouse</span> Look</li>
            <li><span>E</span> Interact / Restock / Scan</li>
            <li><span>Q</span> Drop</li>
            <li><span>Shift</span> Sprint</li>
            <li><span>Tab</span> Task list</li>
            <li><span>Esc</span> Pause</li>
          </ul>
          <button type="button" className="sr-btn" onClick={() => setView("menu")}>Back</button>
        </div>
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className="sr-pause">
        <div className="sr-pause__card">
          <h2>Settings</h2>
          <label className="sr-pause__row">
            Graphics
            <select value={settings.graphics} onChange={(e) => onChangeSettings({ graphics: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="sr-pause__row">
            Shadows
            <input type="checkbox" checked={settings.shadows} onChange={(e) => onChangeSettings({ shadows: e.target.checked })} />
          </label>
          <label className="sr-pause__row">
            Music
            <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => onChangeSettings({ music: Number(e.target.value) })} />
          </label>
          <label className="sr-pause__row">
            Sound Effects
            <input type="range" min="0" max="1" step="0.05" value={settings.sfx} onChange={(e) => onChangeSettings({ sfx: Number(e.target.value) })} />
          </label>
          <label className="sr-pause__row">
            Mouse Sensitivity
            <input type="range" min="0.4" max="2" step="0.1" value={settings.sensitivity} onChange={(e) => onChangeSettings({ sensitivity: Number(e.target.value) })} />
          </label>
          <button type="button" className="sr-btn" onClick={() => setView("menu")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sr-pause">
      <div className="sr-pause__card">
        <h2>Paused</h2>
        <button type="button" className="sr-btn sr-btn--primary" onClick={onResume}>Resume</button>
        <button type="button" className="sr-btn" onClick={() => setView("controls")}>Controls</button>
        <button type="button" className="sr-btn" onClick={() => setView("settings")}>Settings</button>
        <button type="button" className="sr-btn" onClick={onRestart}>Restart Shift</button>
        <button type="button" className="sr-btn" onClick={onExit}>Main Menu</button>
      </div>
    </div>
  );
}
