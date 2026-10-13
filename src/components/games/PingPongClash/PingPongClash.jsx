/**
 * Ping Pong Clash — top-down table tennis vs an AI, for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One <canvas> is driven by a requestAnimationFrame loop
 * that steps the Match (engine.js) and draws it (render.js); React only
 * renders the menu, the scoreboard and overlays, and only re-renders when a
 * point is scored or a serve begins. On the menu the canvas plays an AI-vs-AI
 * demo rally behind the panel.
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh match at the same
 * difficulty. `muted` silences every sound. Fullscreen just resizes the
 * stage; a ResizeObserver refits the canvas.
 *
 * The chosen difficulty is remembered in localStorage (`ping-pong-clash-difficulty`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./PingPongClash.css";
import { Match, DIFFICULTY } from "./engine.js";
import { createView, resizeView, toWorld, draw } from "./render.js";
import { audio } from "./audio.js";

const STORE_KEY = "ping-pong-clash-difficulty";
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("pptest");

const BANNERS = {
  NET: "NET!",
  FAULT: "FAULT",
  OUT: "OUT!",
  MISSED: "POINT!",
  "DOUBLE BOUNCE": "POINT!",
  TIME: "POINT!",
};

function loadDifficulty() {
  try {
    const d = localStorage.getItem(STORE_KEY);
    return DIFFICULTY[d] ? d : "medium";
  } catch {
    return "medium";
  }
}

export default function PingPongClash({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const matchRef = useRef(null);
  const viewRef = useRef(null);
  const [screen, setScreen] = useState("menu"); // menu | how | play
  const [difficulty, setDifficulty] = useState(loadDifficulty);
  const [hud, setHud] = useState({ score: [0, 0], server: 0, phase: "serve" });
  const [banner, setBanner] = useState(null);
  const [result, setResult] = useState(null);

  /* ------------------------------------------------------------ events */
  const onEvent = useRef(null);
  onEvent.current = (type, d) => {
    const m = matchRef.current;
    if (!m || m.demo) return;
    if (type === "hit") {
      audio.hit(d.power);
      if (d.serve) setHud((h) => ({ ...h, phase: "live" }));
    }
    else if (type === "bounce") audio.bounce();
    else if (type === "serve") {
      setHud({ score: d.score, server: d.server, phase: "serve" });
      setBanner(null);
    } else if (type === "point") {
      if (d.reason === "NET") audio.net();
      audio.point(d.side === 0);
      setHud({ score: d.score, server: m.server, phase: "point" });
      const mine = d.side === 0;
      setBanner({
        key: d.score[0] + d.score[1],
        mine,
        text: d.winner >= 0 ? "GAME!" : BANNERS[d.reason] || "POINT!",
        sub: mine ? "Your point" : "CPU point",
      });
    } else if (type === "over") {
      audio.end(d.winner === 0);
      setResult({ won: d.winner === 0, score: d.score });
    }
  };

  /* ------------------------------------------------------------ loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const view = createView();
    viewRef.current = view;
    const match = new Match({ difficulty: loadDifficulty(), demo: true, onEvent: (t, d) => onEvent.current?.(t, d) });
    matchRef.current = match;

    const fit = () => {
      const r = rootRef.current.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      resizeView(view, canvas, r.width, r.height, window.devicePixelRatio || 1);
      draw(ctx, view, match);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);

    let raf = 0;
    let last = 0;
    const frame = (now) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      match.update(dt);
      draw(ctx, view, match);
      raf = requestAnimationFrame(frame);
    };
    if (TEST) {
      window.__pp = {
        match,
        view,
        fit,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) match.update(dt);
          draw(ctx, view, match);
        },
      };
    } else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      matchRef.current = null;
      if (TEST) delete window.__pp;
    };
  }, []);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ flow */
  const startMatch = useCallback(() => {
    audio.unlock();
    setResult(null);
    setBanner(null);
    setScreen("play");
    matchRef.current?.newMatch(difficulty, false);
  }, [difficulty]);

  const toMenu = useCallback(() => {
    audio.ui();
    setResult(null);
    setBanner(null);
    setScreen("menu");
    matchRef.current?.newMatch(difficulty, true);
  }, [difficulty]);

  const pickDifficulty = useCallback((d) => {
    audio.unlock();
    audio.ui();
    setDifficulty(d);
    try {
      localStorage.setItem(STORE_KEY, d);
    } catch {
      /* storage unavailable — keep it for this session only */
    }
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") startMatch();
  }, [restartSignal, screen, startMatch]);

  /* ------------------------------------------------------------ input */
  const inPlay = screen === "play" && !result;

  const aim = useCallback((ev) => {
    const m = matchRef.current;
    const v = viewRef.current;
    if (!m || !v || m.demo) return;
    const r = rootRef.current.getBoundingClientRect();
    const w = toWorld(v, ev.clientX - r.left, ev.clientY - r.top);
    // on touch, keep the paddle just ahead of the finger so it stays visible
    m.setPointer(w.x + (ev.pointerType === "touch" ? 0.16 : 0), w.y);
  }, []);

  const onPointerDown = useCallback(
    (ev) => {
      if (ev.target.closest("button")) return;
      if (ev.button !== undefined && ev.button !== 0) return;
      audio.unlock();
      aim(ev);
      matchRef.current?.serve();
    },
    [aim]
  );

  useEffect(() => {
    if (!inPlay) return undefined;
    const down = (ev) => {
      if (ev.code !== "Space" && ev.key !== " ") return;
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      ev.preventDefault();
      if (ev.repeat) return;
      audio.unlock();
      matchRef.current?.serve();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [inPlay]);

  /* ------------------------------------------------------------ view */
  const diffLabel = DIFFICULTY[difficulty].label;
  const myServe = hud.server === 0;
  const deuce = hud.score[0] >= 10 && hud.score[1] >= 10;

  return (
    <div
      ref={rootRef}
      className={`ppc${inPlay ? " ppc--play" : ""}`}
      onPointerMove={inPlay ? aim : undefined}
      onPointerDown={inPlay ? onPointerDown : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="ppc-canvas" aria-hidden="true" />

      {screen === "play" && (
        <div className="ppc-board" aria-live="polite">
          <div className={`ppc-board__side ppc-board__side--you${myServe ? " is-serving" : ""}`}>
            <span className="ppc-board__name">YOU</span>
            <i className="ppc-board__dot" aria-label={myServe ? "serving" : undefined} />
            <strong className="ppc-board__score" key={`a${hud.score[0]}`}>{hud.score[0]}</strong>
          </div>
          <div className="ppc-board__mid">{deuce ? "DEUCE" : "FIRST TO 11"}</div>
          <div className={`ppc-board__side ppc-board__side--cpu${!myServe ? " is-serving" : ""}`}>
            <strong className="ppc-board__score" key={`b${hud.score[1]}`}>{hud.score[1]}</strong>
            <i className="ppc-board__dot" aria-label={!myServe ? "serving" : undefined} />
            <span className="ppc-board__name">CPU · {diffLabel}</span>
          </div>
        </div>
      )}

      {inPlay && hud.phase === "serve" && (
        <div className="ppc-hint">{myServe ? "YOUR SERVE · CLICK, TAP OR SPACE" : "CPU SERVES…"}</div>
      )}

      {inPlay && banner && (
        <div key={banner.key} className={`ppc-banner${banner.mine ? " is-mine" : ""}`}>
          <strong>{banner.text}</strong>
          <span>{banner.sub}</span>
        </div>
      )}

      {screen === "menu" && (
        <div className="ppc-veil">
          <div className="ppc-panel ppc-menu">
            <p className="ppc-kicker">SERVE • SPIN • WIN</p>
            <h1 className="ppc-title">
              PING PONG <em>CLASH</em>
            </h1>
            <div className="ppc-diff" role="radiogroup" aria-label="Difficulty">
              {Object.entries(DIFFICULTY).map(([id, d]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === id}
                  className={`ppc-diff__btn${difficulty === id ? " is-on" : ""}`}
                  onClick={() => pickDifficulty(id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button type="button" className="ppc-btn ppc-btn--primary" onClick={startMatch}>
              PLAY
            </button>
            <button
              type="button"
              className="ppc-btn ppc-btn--ghost"
              onClick={() => {
                audio.unlock();
                audio.ui();
                setScreen("how");
              }}
            >
              HOW TO PLAY
            </button>
          </div>
        </div>
      )}

      {screen === "how" && (
        <div className="ppc-veil">
          <div className="ppc-panel ppc-how">
            <h2>HOW TO PLAY</h2>
            <ul>
              <li><b>Move</b> your red paddle with the mouse, or drag with a finger.</li>
              <li><b>Serve</b> with a click, a tap or <kbd>Space</kbd> when the ring glows under you.</li>
              <li><b>Aim</b> with where the ball meets your paddle — the edges send it wide.</li>
              <li><b>Spin</b> by sweeping the paddle sideways as you hit; push forward for pace.</li>
              <li>The ball must bounce on the CPU's half. First to <b>11</b>, win by <b>2</b>.</li>
              <li>Serve swaps every 2 points, and every point from 10–10.</li>
            </ul>
            <button
              type="button"
              className="ppc-btn ppc-btn--primary"
              onClick={() => {
                audio.ui();
                setScreen("menu");
              }}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="ppc-veil ppc-veil--result">
          <div className={`ppc-panel ppc-result${result.won ? " is-win" : ""}`}>
            <p className="ppc-kicker">{diffLabel.toUpperCase()} MATCH</p>
            <h2 className="ppc-result__title">{result.won ? "YOU WIN!" : "YOU LOSE"}</h2>
            <div className="ppc-result__score">
              <span>{result.score[0]}</span>
              <i>–</i>
              <span>{result.score[1]}</span>
            </div>
            <button type="button" className="ppc-btn ppc-btn--primary" onClick={startMatch}>
              PLAY AGAIN
            </button>
            <button type="button" className="ppc-btn ppc-btn--ghost" onClick={toMenu}>
              MAIN MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
