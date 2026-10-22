/**
 * My Little Buddy — the three Playroom mini-games and the overlay that hosts
 * them (intro → play → result). Each game calls `onEnd(result)` exactly once;
 * the host turns that into coins via logic.finishGame.
 */
import { useEffect, useRef, useState } from "react";
import { FOODS } from "./data.js";
import { FoodArt, Icon } from "./art.jsx";
import { GAME_COST } from "./logic.js";

export const GAMES = {
  stars: { name: "Catch Falling Stars", icon: "star", rules: "Slide the star jar to catch falling stars. Rainbow stars are worth 3! Dodge the storm clouds — 3 hits and it's over.", unit: "stars" },
  memory: { name: "Memory Match", icon: "cards", rules: "Flip two cards at a time and find all 6 food pairs. Fewer moves = more coins.", unit: "moves" },
  bubbles: { name: "Bubble Pop", icon: "bubbles", rules: "Pop as many bubbles as you can in 30 seconds. Golden bubbles give +5 — grumpy purple ones take 3 away!", unit: "points" },
};
const DUR = 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEV_TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mlbtest");

/* ---------------- Catch Falling Stars (canvas) ---------------- */
function starPath(g, x, y, R, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (Math.PI / 5) * i - Math.PI / 2, r = i % 2 ? R * 0.45 : R;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

function StarsGame({ onEnd, sfx }) {
  const ref = useRef(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const st = { x: 0.5, items: [], pops: [], score: 0, lives: 3, t: 0, next: 0.5, keys: {}, done: false };
    const sky = Array.from({ length: 40 }, () => [Math.random(), Math.random() * 0.8, Math.random() * 1.5 + 0.5]);
    let W = 1, H = 1, dpr = 1, raf = 0, last = performance.now();
    const fit = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(cv);
    const move = (e) => {
      const r = cv.getBoundingClientRect();
      st.x = clamp((e.clientX - r.left) / r.width, 0.06, 0.94);
    };
    const key = (e) => {
      if (!["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) return;
      st.keys[e.code] = e.type === "keydown";
      e.preventDefault();
    };
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerdown", move);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);

    const half = () => Math.min(0.1, (H * 0.17) / W);
    const step = (dt) => {
      st.t += dt;
      const k = st.keys, dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      st.x = clamp(st.x + dir * dt * 0.95, 0.06, 0.94);
      if ((st.next -= dt) <= 0) {
        st.next = Math.max(0.3, 0.72 - st.t * 0.012) * (0.7 + Math.random() * 0.6);
        const r = Math.random();
        st.items.push({ x: 0.07 + Math.random() * 0.86, y: -0.08, vy: 0.3 + st.t * 0.008 + Math.random() * 0.12, kind: r < 0.15 ? "cloud" : r < 0.23 ? "rainbow" : "star", rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4 });
      }
      for (const it of st.items) {
        it.y += it.vy * dt;
        it.rot += it.spin * dt;
        if (it.y > 0.79 && it.y < 0.9 && Math.abs(it.x - st.x) < half() + 0.015) {
          it.gone = true;
          if (it.kind === "cloud") {
            st.lives--;
            sfx("miss");
            st.pops.push({ x: it.x, y: it.y, t: 0, text: "−♥", c: "#ff8fa8" });
          } else {
            const n = it.kind === "rainbow" ? 3 : 1;
            st.score += n;
            sfx(n > 1 ? "coin" : "star");
            st.pops.push({ x: it.x, y: it.y, t: 0, text: `+${n}`, c: "#ffe27a" });
          }
        }
      }
      st.items = st.items.filter((it) => !it.gone && it.y < 1.1);
      st.pops = st.pops.filter((p) => (p.t += dt) < 0.7);
      if (!st.done && (st.t >= DUR || st.lives <= 0)) {
        st.done = true;
        endRef.current({ score: st.score });
      }
    };
    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#1b1650");
      bg.addColorStop(1, "#5b3a9e");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,.55)";
      for (const [x, y, r] of sky) g.fillRect(x * W, y * H, r, r);
      g.fillStyle = "#3a2a78";
      g.fillRect(0, H * 0.9, W, H * 0.1);
      const R = H * 0.045;
      for (const it of st.items) {
        const x = it.x * W, y = it.y * H;
        if (it.kind === "cloud") {
          g.fillStyle = "#7d8299";
          for (const [dx, dy, r] of [[-0.9, 0.1, 0.8], [0, -0.3, 1.05], [0.9, 0.1, 0.8], [0, 0.3, 0.8]]) {
            g.beginPath();
            g.arc(x + dx * R, y + dy * R, r * R, 0, 7);
            g.fill();
          }
          g.fillStyle = "#ffe27a";
          g.beginPath();
          g.moveTo(x, y + 0.6 * R); g.lineTo(x - 0.4 * R, y + 1.5 * R); g.lineTo(x, y + 1.4 * R); g.lineTo(x - 0.2 * R, y + 2.2 * R); g.lineTo(x + 0.5 * R, y + 1.1 * R); g.lineTo(x + 0.1 * R, y + 1.2 * R);
          g.fill();
        } else {
          starPath(g, x, y, it.kind === "rainbow" ? R * 1.25 : R, it.rot);
          g.fillStyle = it.kind === "rainbow" ? `hsl(${(st.t * 300 + it.x * 360) % 360} 95% 65%)` : "#ffd84a";
          g.shadowColor = g.fillStyle;
          g.shadowBlur = R * 0.6;
          g.fill();
          g.shadowBlur = 0;
        }
      }
      // the star jar
      const bx = st.x * W, by = H * 0.84, bw = half() * W;
      g.fillStyle = "rgba(190,240,255,.35)";
      g.strokeStyle = "#bdf0ff";
      g.lineWidth = Math.max(2, H * 0.008);
      g.beginPath();
      g.moveTo(bx - bw, by - H * 0.04);
      g.lineTo(bx - bw * 0.85, by + H * 0.06);
      g.quadraticCurveTo(bx, by + H * 0.085, bx + bw * 0.85, by + H * 0.06);
      g.lineTo(bx + bw, by - H * 0.04);
      g.fill();
      g.stroke();
      g.fillStyle = "#8ee6c0";
      g.fillRect(bx - bw * 1.05, by - H * 0.055, bw * 2.1, H * 0.022);
      // HUD
      g.font = `800 ${Math.round(H * 0.06)}px Nunito, system-ui, sans-serif`;
      g.textBaseline = "top";
      g.fillStyle = "#ffe27a";
      g.fillText(`★ ${st.score}`, W * 0.03, H * 0.04);
      g.textAlign = "right";
      g.fillStyle = "#ff8fa8";
      g.fillText("♥".repeat(Math.max(0, st.lives)) + "♡".repeat(3 - Math.max(0, st.lives)), W * 0.97, H * 0.04);
      g.textAlign = "left";
      g.fillStyle = "rgba(255,255,255,.2)";
      g.fillRect(W * 0.3, H * 0.06, W * 0.4, H * 0.025);
      g.fillStyle = "#8ee6c0";
      g.fillRect(W * 0.3, H * 0.06, W * 0.4 * clamp(1 - st.t / DUR, 0, 1), H * 0.025);
      g.textAlign = "center";
      for (const p of st.pops) {
        g.globalAlpha = 1 - p.t / 0.7;
        g.fillStyle = p.c;
        g.fillText(p.text, p.x * W, p.y * H - p.t * H * 0.15 - H * 0.08);
      }
      g.globalAlpha = 1;
      g.textAlign = "left";
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!st.done) step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    if (DEV_TEST) window.__mlbStars = { st, step, draw };
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerdown", move);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, [sfx]);
  return <canvas ref={ref} className="mlb-stars" />;
}

/* ---------------- Memory Match (DOM) ---------------- */
function deal() {
  const ids = [...FOODS].sort(() => Math.random() - 0.5).slice(0, 6).map((f) => f.id);
  return [...ids, ...ids].sort(() => Math.random() - 0.5).map((food, i) => ({ i, food, open: false, done: false }));
}

function MemoryGame({ onEnd, sfx }) {
  const [cards, setCards] = useState(deal);
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);
  const t0 = useRef(performance.now());
  const ended = useRef(false);

  const flip = (i) => {
    const c = cards[i];
    if (lock.current || c.open || c.done) return;
    const next = cards.map((x) => (x.i === i ? { ...x, open: true } : x));
    const open = next.filter((x) => x.open && !x.done);
    sfx("flip");
    if (open.length < 2) return setCards(next);
    setMoves((m) => m + 1);
    const total = moves + 1;
    if (open[0].food === open[1].food) {
      const done = next.map((x) => (x.open && !x.done ? { ...x, done: true } : x));
      setCards(done);
      sfx("match");
      if (done.every((x) => x.done) && !ended.current) {
        ended.current = true;
        lock.current = true;
        setTimeout(() => onEnd({ moves: total, time: (performance.now() - t0.current) / 1000 }), 600);
      }
    } else {
      setCards(next);
      lock.current = true;
      setTimeout(() => {
        lock.current = false;
        setCards((cs) => cs.map((x) => (x.done ? x : { ...x, open: false })));
      }, 750);
    }
  };

  return (
    <div className="mlb-mem">
      <div className="mlb-mem__hud">Moves <strong>{moves}</strong> · Pairs <strong>{cards.filter((c) => c.done).length / 2}/6</strong></div>
      <div className="mlb-mem__grid">
        {cards.map((c) => (
          <button key={c.i} type="button" className={`mlb-card${c.open || c.done ? " is-open" : ""}${c.done ? " is-done" : ""}`} onClick={() => flip(c.i)} aria-label={c.open || c.done ? c.food : "Hidden card"}>
            <span className="mlb-card__in">
              <span className="mlb-card__back"><Icon name="paw" /></span>
              <span className="mlb-card__face"><FoodArt id={c.food} /></span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Bubble Pop (DOM) ---------------- */
function BubblesGame({ onEnd, sfx }) {
  const [bubbles, setBubbles] = useState([]);
  const [pops, setPops] = useState([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DUR);
  const scoreRef = useRef(0);
  const area = useRef(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const start = performance.now();
    let id = 0, nextAt = 0, done = false;
    const timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      setLeft(Math.max(0, DUR - t));
      while (t >= nextAt && !done) {
        nextAt += Math.max(0.28, 0.5 - t * 0.008);
        const r = Math.random();
        setBubbles((bs) => [...bs, { id: ++id, x: 4 + Math.random() * 82, s: 9 + Math.random() * 8, dur: Math.max(2.4, 4.8 - t * 0.06) + Math.random() * 1.2, kind: r < 0.09 ? "gold" : r < 0.2 ? "grump" : "blue", hue: Math.floor(Math.random() * 360) }]);
      }
      if (t >= DUR && !done) {
        done = true;
        clearInterval(timer);
        setBubbles([]);
        endRef.current({ score: scoreRef.current });
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const pop = (b, e) => {
    e.preventDefault();
    const n = b.kind === "gold" ? 5 : b.kind === "grump" ? -3 : 1;
    scoreRef.current = Math.max(0, scoreRef.current + n);
    setScore(scoreRef.current);
    sfx(n < 0 ? "miss" : n > 1 ? "coin" : "pop");
    const ar = area.current.getBoundingClientRect(), br = e.currentTarget.getBoundingClientRect();
    const p = { id: b.id, x: ((br.left + br.width / 2 - ar.left) / ar.width) * 100, y: ((br.top + br.height / 2 - ar.top) / ar.height) * 100, n };
    setBubbles((bs) => bs.filter((x) => x.id !== b.id));
    setPops((ps) => [...ps, p]);
    setTimeout(() => setPops((ps) => ps.filter((x) => x !== p)), 600);
  };

  return (
    <div className="mlb-bub" ref={area}>
      <div className="mlb-bub__hud"><span>Score <strong>{score}</strong></span><span>{Math.ceil(left)}s</span></div>
      {bubbles.map((b) => (
        <button key={b.id} type="button" aria-label="Bubble" className={`mlb-bubble is-${b.kind}`} style={{ left: `${b.x}%`, "--s": b.s, "--h": b.hue, animationDuration: `${b.dur}s` }} onPointerDown={(e) => pop(b, e)} onAnimationEnd={() => setBubbles((bs) => bs.filter((x) => x.id !== b.id))}>
          {b.kind === "grump" && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7l3 1.5M15 7l-3 1.5M7 14q3-2.5 6 0" stroke="#2d2340" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>}
        </button>
      ))}
      {pops.map((p) => (
        <span key={p.id} className={`mlb-pop${p.n < 0 ? " is-bad" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.n > 0 ? `+${p.n}` : p.n}</span>
      ))}
    </div>
  );
}

const PLAY = { stars: StarsGame, memory: MemoryGame, bubbles: BubblesGame };

/* ---------------- host overlay ---------------- */
export function GameOverlay({ game, autoStart, onFinish, onClose, onReplay, canReplay, sfx }) {
  const [phase, setPhase] = useState(autoStart ? "play" : "intro");
  const [result, setResult] = useState(null);
  const G = GAMES[game], Play = PLAY[game];
  const end = (r) => {
    const info = onFinish(game, r);
    setResult(info);
    setPhase("result");
    sfx("win");
  };
  return (
    <div className="mlb-game" role="dialog" aria-label={G.name}>
      <div className="mlb-game__bar">
        <Icon name={G.icon} /><span>{G.name}</span>
        <button type="button" className="mlb-x" onClick={onClose} aria-label="Leave game"><Icon name="close" /></button>
      </div>
      <div className="mlb-game__body">
        {phase === "play" && <Play onEnd={end} sfx={sfx} />}
        {phase === "intro" && (
          <div className="mlb-card-panel">
            <Icon name={G.icon} className="mlb-ico mlb-ico--big" />
            <h3>{G.name}</h3>
            <p>{G.rules}</p>
            <p className="mlb-dim">Costs {GAME_COST} energy when finished · Earn coins &amp; XP</p>
            <button type="button" className="mlb-btn mlb-btn--go" onClick={() => setPhase("play")}>Start!</button>
          </div>
        )}
        {phase === "result" && result && (
          <div className="mlb-card-panel">
            <h3>{game === "memory" ? "All pairs found!" : "Time's up!"}</h3>
            <p className="mlb-big">{result.score} <small>{G.unit}</small></p>
            {result.best && <p className="mlb-badge">New best!</p>}
            <p className="mlb-earn"><Icon name="coin" /> +{result.coins} coins</p>
            <div className="mlb-row">
              <button type="button" className="mlb-btn mlb-btn--go" disabled={!canReplay} onClick={onReplay}>{canReplay ? "Play again" : "Too tired!"}</button>
              <button type="button" className="mlb-btn" onClick={onClose}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
