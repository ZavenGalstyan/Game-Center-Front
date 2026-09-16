/**
 * Farm Life — top HUD: coins (top-right, with day/time/season alongside per
 * spec) and the current objective (top-left, via QuestPanel). Kept compact
 * so the world stays the star of the screen.
 */
export default function Hud({ money, clockDisplay, wateringCan }) {
  return (
    <div className="fl-hud-top">
      <div className="fl-hud-time">
        <span className="fl-hud-time__season">{clockDisplay.season} {clockDisplay.seasonDay}</span>
        <span className="fl-hud-time__clock">{clockDisplay.time}</span>
      </div>
      <div className="fl-hud-right">
        <div className="fl-hud-can" title="Watering can water">
          💧 {wateringCan.water}/{wateringCan.capacity}
        </div>
        <div className="fl-hud-coins">
          <span className="fl-coin-icon">🪙</span>
          <span>{money}</span>
        </div>
      </div>
    </div>
  );
}
