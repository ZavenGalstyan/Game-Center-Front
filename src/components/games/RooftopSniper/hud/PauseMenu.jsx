/**
 * Rooftop Sniper — shown whenever pointer lock is lost mid-mission (Esc, or
 * the very first click before the player has ever locked in). Restart here
 * restarts only the current mission attempt — see RooftopSniper.jsx.
 */
import { useState } from "react";

export default function PauseMenu({ onResume, onRestart, onExit }) {
  const [showControls, setShowControls] = useState(false);

  if (showControls) {
    return (
      <div className="rs-pause">
        <div className="rs-pause__card">
          <h2>Controls</h2>
          <ul className="rs-pause__controls">
            <li><span>Mouse</span> Aim</li>
            <li><span>Left Click</span> Shoot</li>
            <li><span>Right Click</span> Scope</li>
            <li><span>Wheel</span> Zoom</li>
            <li><span>R</span> Reload</li>
            <li><span>Shift</span> Hold breath</li>
            <li><span>Esc</span> Pause</li>
          </ul>
          <button type="button" className="rs-btn" onClick={() => setShowControls(false)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rs-pause">
      <div className="rs-pause__card">
        <h2>PAUSED</h2>
        <button type="button" className="rs-btn rs-btn--primary" onClick={onResume}>Resume</button>
        <button type="button" className="rs-btn" onClick={() => setShowControls(true)}>Controls</button>
        <button type="button" className="rs-btn" onClick={onRestart}>Restart Mission</button>
        <button type="button" className="rs-btn" onClick={onExit}>Mission Select</button>
      </div>
    </div>
  );
}
