/**
 * Fishing Journey — the coin balance pill.
 *
 * When the amount changes the pill gives a small bump and a "+N" (or "−N")
 * floats up beside it and fades. Purely presentational — reads the `coins`
 * prop, never writes anything.
 */
import { useEffect, useRef, useState } from "react";

export default function CoinDisplay({ coins, className = "" }) {
  const [bump, setBump] = useState(false);
  const [delta, setDelta] = useState(null); // { key, amount }
  const prev = useRef(coins);

  useEffect(() => {
    if (coins !== prev.current) {
      const diff = coins - prev.current;
      prev.current = coins;
      setBump(true);
      setDelta({ key: Date.now(), amount: diff });
      const t1 = setTimeout(() => setBump(false), 460);
      const t2 = setTimeout(() => setDelta(null), 1100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [coins]);

  return (
    <div
      className={`fj-coins ${bump ? "fj-coins--bump" : ""} ${className}`}
      title={`${coins.toLocaleString()} coins`}
    >
      <span className="fj-coins__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9.5" className="fj-coins__coin" />
          <circle cx="12" cy="12" r="9.5" className="fj-coins__edge" />
          <circle cx="12" cy="12" r="6" className="fj-coins__ring" />
          <path d="M12 8v8M9.5 10h3.2a1.7 1.7 0 0 1 0 3.4H9.7" className="fj-coins__glyph" />
        </svg>
      </span>
      <span className="fj-coins__value">{coins.toLocaleString()}</span>

      {delta && (
        <span
          key={delta.key}
          className={`fj-coins__delta ${
            delta.amount < 0 ? "fj-coins__delta--down" : ""
          }`}
        >
          {delta.amount > 0 ? "+" : "−"}
          {Math.abs(delta.amount)}
        </span>
      )}
    </div>
  );
}
