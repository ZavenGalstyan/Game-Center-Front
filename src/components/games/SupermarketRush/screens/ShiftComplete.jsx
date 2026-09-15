/**
 * Supermarket Rush — the shift results screen: tasks, customers, time,
 * pay breakdown, stars earned, then Next Shift / Replay / Levels.
 */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ShiftComplete({ result, hasNext, onNext, onReplay, onLevels }) {
  return (
    <div className="sr-screen sr-complete">
      <div className="sr-complete__card">
        <h1>SHIFT COMPLETE</h1>
        <div className="sr-complete__stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < result.stars ? "sr-star sr-star--on sr-star--big" : "sr-star sr-star--big"}>★</span>
          ))}
        </div>

        <div className="sr-complete__stats">
          <div><span>Tasks</span><strong>{result.tasksComplete.done}/{result.tasksComplete.total}</strong></div>
          <div><span>Customers Served</span><strong>{result.customersServed}</strong></div>
          <div><span>Satisfaction</span><strong>{result.satisfaction}%</strong></div>
          <div><span>Time</span><strong>{formatTime(result.timeSec)}</strong></div>
        </div>

        <div className="sr-complete__pay">
          <div><span>Base Pay</span><span>${result.basePay}</span></div>
          {result.bonusCustomers > 0 && <div><span>Customers</span><span>+${result.bonusCustomers}</span></div>}
          {result.bonusFast > 0 && <div><span>Fast Checkout</span><span>+${result.bonusFast}</span></div>}
          {result.bonusClean > 0 && <div><span>Store Care</span><span>+${result.bonusClean}</span></div>}
          {result.bonusTime > 0 && <div><span>Time Bonus</span><span>+${result.bonusTime}</span></div>}
          <div className="sr-complete__total"><span>TOTAL</span><span>${result.totalPay}</span></div>
        </div>

        <div className="sr-complete__buttons">
          {hasNext && <button type="button" className="sr-btn sr-btn--primary" onClick={onNext}>NEXT SHIFT</button>}
          <button type="button" className="sr-btn" onClick={onReplay}>REPLAY</button>
          <button type="button" className="sr-btn" onClick={onLevels}>LEVELS</button>
        </div>
      </div>
    </div>
  );
}
