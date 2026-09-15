/**
 * Supermarket Rush — lifetime statistics screen.
 */
function formatTime(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Statistics({ state, onBack }) {
  const s = state.stats;
  const rows = [
    ["Shifts Completed", s.shiftsCompleted],
    ["Products Restocked", s.productsRestocked],
    ["Customers Served", s.customersServed],
    ["Items Scanned", s.itemsScanned],
    ["Carts Collected", s.cartsCollected],
    ["Money Earned", `$${s.moneyEarned}`],
    ["Best Shift Time", formatTime(s.bestShiftTimeSec)],
  ];
  return (
    <div className="sr-screen sr-stats">
      <header className="sr-screen__header">
        <button type="button" className="sr-btn sr-btn--icon" onClick={onBack}>‹</button>
        <h1>Statistics</h1>
      </header>
      <div className="sr-stats__grid">
        {rows.map(([label, value]) => (
          <div key={label} className="sr-stats__row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
