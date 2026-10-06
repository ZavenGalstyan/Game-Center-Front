/**
 * Lost Toy — menu screens shared by the menu flow and the in-game pause:
 * Settings and Controls help. (Main Menu, Level Select, Toy, Memories and
 * Statistics live in their own files.)
 */
import { Btn, Toggle, Slider, Segmented } from "./ui.jsx";
import { Icon } from "./icons.jsx";

export function SettingsPanel({ settings, muted, onChange, onBack, inGame = false }) {
  const s = settings;
  return (
    <div className="lt-panel lt-panel--settings">
      <div className="lt-panel__head">
        <Btn kind="ghost icon" onClick={onBack} title="Back">
          <Icon name="back" />
        </Btn>
        <h2>Settings</h2>
        {muted && <span className="lt-chip lt-chip--warn">Muted by the Game Center</span>}
      </div>
      <div className="lt-panel__body lt-settings">
        <section>
          <h3>Sound</h3>
          <Slider label="Master" value={s.master} onChange={(v) => onChange({ master: v })} />
          <Slider label="Music" value={s.music} onChange={(v) => onChange({ music: v })} />
          <Slider label="Effects" value={s.sfx} onChange={(v) => onChange({ sfx: v })} />
        </section>
        <section>
          <h3>Graphics</h3>
          <Segmented
            label="Quality"
            value={s.graphics}
            options={[
              ["low", "Low"],
              ["medium", "Medium"],
              ["high", "High"],
            ]}
            onChange={(v) => onChange({ graphics: v })}
          />
          <Toggle label="Reduced motion" hint="Calmer camera, fewer moving details" value={s.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
        </section>
        <section>
          <h3>Camera</h3>
          <Slider label="Sensitivity" value={s.sensitivity} min={0.2} max={3} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ sensitivity: v })} />
          <Segmented
            label="Camera shake"
            value={s.cameraShake}
            options={[
              ["off", "Off"],
              ["low", "Low"],
              ["normal", "Normal"],
            ]}
            onChange={(v) => onChange({ cameraShake: v })}
          />
          <Toggle label="Invert Y" value={s.invertY} onChange={(v) => onChange({ invertY: v })} />
        </section>
        <section>
          <h3>Help</h3>
          <Toggle label="Control hints" value={s.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
          <Toggle label="Show timer" hint="Off by default — Lost Toy isn't a race" value={s.showTimer} onChange={(v) => onChange({ showTimer: v })} />
          <Toggle label="Platforming Assist" hint={inGame ? "Applies when the level restarts" : "Longer coyote time, stronger ledge grab"} value={s.assist} onChange={(v) => onChange({ assist: v })} />
        </section>
      </div>
    </div>
  );
}

export function ControlsHelp({ onBack, touch }) {
  const rows = touch
    ? [
        ["Left stick", "Walk / run (hold at the rim to sprint)"],
        ["Drag right side", "Look around"],
        ["JUMP", "Jump — hold for higher"],
        ["USE", "Appears next to cranks, switches and buttons"],
      ]
    : [
        ["W A S D", "Walk / run"],
        ["Mouse", "Look around (click to capture the mouse)"],
        ["Shift", "Sprint"],
        ["Space", "Jump — tap for a hop, hold for higher"],
        ["E", "Use cranks, switches, buttons"],
        ["Esc / P", "Pause"],
      ];
  const moves = [
    ["Ledges", "Jump at an edge and Pip grabs it and pulls up"],
    ["Push", "Walk into toy blocks to slide them"],
    ["Bounce", "Land on pillows and cushions — hold jump to go higher"],
    ["Ride", "Hop on moving toys; they carry you"],
    ["Climb", "Jump onto hanging cloth and hold forward"],
    ["Balance", "Pencils and rails are narrow — go steady"],
  ];
  return (
    <div className="lt-panel lt-panel--controls">
      <div className="lt-panel__head">
        <Btn kind="ghost icon" onClick={onBack} title="Back">
          <Icon name="back" />
        </Btn>
        <h2>Controls</h2>
      </div>
      <div className="lt-panel__body lt-controls">
        <div className="lt-controls__col">
          {rows.map(([k, v]) => (
            <div key={k} className="lt-controls__row">
              <kbd className="wide">{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="lt-controls__col">
          {moves.map(([k, v]) => (
            <div key={k} className="lt-controls__row">
              <b>{k}</b>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
