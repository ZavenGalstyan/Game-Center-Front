/** Night Corridor — the controls reference. */
const ROWS = [
  ["W A S D", "Move"],
  ["Mouse", "Look"],
  ["Shift", "Sprint"],
  ["E", "Interact · Open · Hide · Pick up"],
  ["F", "Flashlight"],
  ["C / Ctrl", "Crouch (hold)"],
  ["Esc / P", "Pause"],
];

export default function ControlsList() {
  return (
    <div className="nc-controls">
      {ROWS.map(([k, v]) => (
        <div key={k} className="nc-controls__row">
          <span className="nc-controls__keys">
            {k.split(" / ").map((part, i) => (
              <span key={part}>
                {i > 0 && <span className="nc-controls__or">/</span>}
                <kbd>{part}</kbd>
              </span>
            ))}
          </span>
          <span className="nc-controls__what">{v}</span>
        </div>
      ))}
      <p className="nc-controls__note">
        There is no way to fight it. Close doors behind you, hide in lockers, and keep your stamina for when it counts.
        The flashlight dims as the battery runs low and recovers while switched off.
      </p>
    </div>
  );
}
