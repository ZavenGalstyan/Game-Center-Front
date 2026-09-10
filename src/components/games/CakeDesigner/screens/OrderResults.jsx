/**
 * Cake Designer — order result screen.
 *
 * The finished cake stays large and visible; the score sits beside it, never a
 * full-screen modal over it. 3-star clears get a tasteful confetti sweep.
 */

import { useEffect, useRef } from "react";
import CakePreview from "../components/CakePreview.jsx";
import ScoreBreakdown from "../components/ScoreBreakdown.jsx";
import { Stars, CoinPill } from "../components/bits.jsx";
import { customer } from "../data/customers.js";

export default function OrderResults({
  order, score, cake, coinsAwarded, firstClear, improvedStars,
  nextAvailable, animate, quality, onNext, onReplay, onSelect,
}) {
  const canvasRef = useRef(null);
  const incomplete = score.stars < 1;

  useEffect(() => {
    if (score.stars < 3 || !animate || !canvasRef.current) return;
    return runConfetti(canvasRef.current);
  }, [score.stars, animate]);

  const cust = customer(order.customer);

  return (
    <div className="cd-result">
      {score.stars === 3 && animate && <canvas ref={canvasRef} className="cd-confetti" />}

      <div className="cd-result__cake">
        <CakePreview cake={{ ...cake, rotation: 0 }} quality={quality} animate={animate} />
      </div>

      <div className="cd-result__panel">
        <p className="cd-result__eyebrow">{cust.name} · {order.occasion}</p>
        <h2 className="cd-result__title">{incomplete ? "Not quite ready" : "Order Complete"}</h2>

        <div className="cd-result__scoreline">
          <div className="cd-result__match">
            <span className="cd-result__pct">{score.matchPct}%</span>
            <span className="cd-result__pct-label">design match</span>
          </div>
          <Stars value={score.stars} size={30} />
        </div>

        {!incomplete && (
          <div className="cd-result__reward">
            {coinsAwarded > 0 ? (
              <><CoinPill amount={coinsAwarded} /> <span>{firstClear ? "earned" : improvedStars ? "bonus for improving" : ""}</span></>
            ) : (
              <span className="cd-result__reward-none">No new coins — you&rsquo;ve already been paid for this order</span>
            )}
          </div>
        )}

        <ScoreBreakdown categories={score.categories} />

        {incomplete && (
          <p className="cd-result__hint">Get to 50% design match to complete the order. Check the customer&rsquo;s list and try again.</p>
        )}

        <div className="cd-result__actions">
          {!incomplete && nextAvailable && (
            <button className="cd-btn cd-btn--primary" onClick={onNext}>Next Order</button>
          )}
          <button className="cd-btn" onClick={onReplay}>{incomplete ? "Try Again" : "Replay"}</button>
          <button className="cd-btn cd-btn--ghost" onClick={onSelect}>Order Select</button>
        </div>
      </div>
    </div>
  );
}

/* lightweight confetti — no library, self-clearing */
function runConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  const cols = ["#ff9ec7", "#ffd166", "#8be0ff", "#8fce8f", "#c9b8ec"];
  const parts = Array.from({ length: 120 }).map(() => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.4,
    r: (4 + Math.random() * 5) * dpr,
    vy: (2 + Math.random() * 3) * dpr,
    vx: (Math.random() - 0.5) * 2 * dpr,
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.3,
    c: cols[(Math.random() * cols.length) | 0],
  }));
  let raf;
  let frames = 0;
  const tick = () => {
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.02 * dpr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    }
    if (frames < 240) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  window.addEventListener("resize", resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}
