/**
 * Block Escape — a 6×6 sliding-block puzzle: slide the red block out of the
 * exit on the right. Rendered inside the shared <GamePlayer> (registered by
 * name in ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) resets the current level; `muted`
 * silences the WebAudio knocks. Rules + BFS solver live in ./engine.js; the
 * 100 levels in ./levels.js are generated and validated by ./tools. Progress
 * (unlocked level, stars, best moves) and settings are saved under
 * `block-escape-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { LEVELS } from "./levels.js";
import { createAudio } from "./audio.js";
import "./BlockEscape.css";

const SAVE_KEY = "block-escape-progress";
const TIERS = [
  { id: "easy", name: "Easy" },
  { id: "medium", name: "Medium" },
  { id: "hard", name: "Hard" },
];
const tierOf = (i) => LEVELS[i][2];
const tierName = (i) => TIERS.find((t) => t.id === tierOf(i)).name;
const DEFAULT = { unlocked: 0, stars: {}, best: {}, guides: true };

const load = () => {
  try {
    const p = { ...DEFAULT, ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
    p.unlocked = Math.min(LEVELS.length - 1, Math.max(0, p.unlocked | 0));
    return p;
  } catch {
    return DEFAULT;
  }
};
const persist = (p) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
};

export default function BlockEscape({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(load);
  const [screen, setScreen] = useState("menu"); // menu | levels | game
  const [tab, setTab] = useState(() => tierOf(load().unlocked));
  const [overlay, setOverlay] = useState(null); // pause | rules | win
  const [lvl, setLvl] = useState(0);
  const [pos, setPos] = useState([]);
  const [hist, setHist] = useState([]); // [block, from, to]
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null); // { i, d } — offset in cells while dragging
  const [hint, setHint] = useState(null); // { i, q }
  const [hintsUsed, setHintsUsed] = useState(0);
  const [won, setWon] = useState(null); // { moves, stars, best, first }
  const [bump, setBump] = useState(null);

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);

  const level = useMemo(() => E.parse(LEVELS[lvl][0]), [lvl]);
  const par = LEVELS[lvl][1];
  const { blocks } = level;
  const solved = pos.length > 0 && E.isSolved(blocks, pos);
  const live = screen === "game" && !overlay && !solved;

  const saveProg = useCallback((fn) => {
    setProg((p) => {
      const next = fn(p);
      persist(next);
      return next;
    });
  }, []);

  /* ---------- level flow ---------- */
  const winTimer = useRef(0);
  useEffect(() => {
    if (screen !== "game") clearTimeout(winTimer.current);
  }, [screen]);
  useEffect(() => () => clearTimeout(winTimer.current), []);
  const open = useCallback(
    (i) => {
      clearTimeout(winTimer.current);
      setLvl(i);
      setPos(E.parse(LEVELS[i][0]).pos);
      setHist([]);
      setSel(null);
      setDrag(null);
      setHint(null);
      setHintsUsed(0);
      setWon(null);
      setOverlay(null);
      setTab(tierOf(i));
      setScreen("game");
    },
    [],
  );
  const reset = () => {
    if (!hist.length && !solved) return;
    clearTimeout(winTimer.current);
    setPos(level.pos);
    setHist([]);
    setSel(null);
    setHint(null);
    setWon(null);
    setOverlay(null);
    audio.play("undo");
  };
  const undo = () => {
    if (!live || !hist.length) return;
    const [i, from] = hist[hist.length - 1];
    setPos((p) => p.map((v, k) => (k === i ? from : v)));
    setHist((h) => h.slice(0, -1));
    setHint(null);
    audio.play("undo");
  };

  // GamePlayer Restart → reset the current level
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "game") open(lvl);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Slide block i to q (one move). */
  const commit = (i, q) => {
    if (!live || q === pos[i]) return;
    const [lo, hi] = E.range(blocks, pos, i);
    if (q < lo || q > hi) return;
    const next = pos.map((v, k) => (k === i ? q : v));
    setPos(next);
    setHist((h) => [...h, [i, pos[i], q]]);
    setHint(null);
    audio.play("slide");
    if (E.isSolved(blocks, next)) {
      const moves = hist.length + 1;
      const st = E.stars(moves, par);
      const first = !prog.stars[lvl];
      const best = Math.min(prog.best[lvl] ?? Infinity, moves);
      saveProg((p) => ({
        ...p,
        unlocked: Math.max(p.unlocked, Math.min(LEVELS.length - 1, lvl + 1)),
        stars: { ...p.stars, [lvl]: Math.max(p.stars[lvl] ?? 0, st) },
        best: { ...p.best, [lvl]: best },
      }));
      setSel(null);
      winTimer.current = setTimeout(() => {
        audio.play("win");
        setWon({ moves, stars: st, best, first, last: lvl === LEVELS.length - 1 });
        setOverlay("win");
      }, 650);
    }
  };

  /* ---------- pointer: drag to slide, tap to select ---------- */
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const onDown = (e, i) => {
    if (!live || e.button > 0 || dragRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const [lo, hi] = E.range(blocks, pos, i);
    dragRef.current = { i, id: e.pointerId, x: e.clientX, y: e.clientY, cell: boardRef.current.getBoundingClientRect().width / E.N, lo: lo - pos[i], hi: hi - pos[i], moved: false, d: 0 };
    audio.play("pick");
  };
  const onMove = (e) => {
    const r = dragRef.current;
    if (!r || e.pointerId !== r.id) return;
    const px = blocks[r.i].h ? e.clientX - r.x : e.clientY - r.y;
    if (!r.moved && Math.abs(px) < 6) return;
    r.moved = true;
    const raw = px / r.cell;
    // a little rubber-band past the limits so collisions read as physical
    r.d = raw < r.lo ? r.lo - Math.min(0.12, (r.lo - raw) * 0.15) : raw > r.hi ? r.hi + Math.min(0.12, (raw - r.hi) * 0.15) : raw;
    setDrag({ i: r.i, d: r.d });
  };
  const onUp = (e) => {
    const r = dragRef.current;
    if (!r || e.pointerId !== r.id) return;
    dragRef.current = null;
    setDrag(null);
    if (!r.moved) {
      setSel((s) => (s === r.i ? null : r.i));
      return;
    }
    const step = Math.max(r.lo, Math.min(r.hi, Math.round(r.d)));
    if (step) commit(r.i, pos[r.i] + step);
    else if (r.d < r.lo - 0.02 || r.d > r.hi + 0.02) (audio.play("bump"), setBump({ i: r.i, n: Math.random() }));
    setSel(null);
  };
  const onCancel = (e) => {
    const r = dragRef.current;
    if (!r || e.pointerId !== r.id) return;
    dragRef.current = null;
    setDrag(null);
  };
  // drop any half-finished drag when the game pauses / leaves the board
  useEffect(() => {
    if (!live) {
      dragRef.current = null;
      setDrag(null);
    }
  }, [live]);

  const doHint = () => {
    if (!live) return;
    const path = E.solve(blocks, pos);
    if (!path?.length) return;
    const [i, q] = path[0];
    setHint({ i, q, left: path.length });
    setSel(i);
    setHintsUsed((n) => n + 1);
    audio.play("hint");
  };

  // keyboard: arrows slide the selected block, Tab cycles, U / Ctrl+Z undo, R reset, H hint, P / Esc pause
  const keys = useRef(null);
  keys.current = (e) => {
    if (screen !== "game") return false;
    const k = e.key.toLowerCase();
    if (k === "escape" || k === "p") return overlay === "pause" ? setOverlay(null) : !overlay && setOverlay("pause"), true;
    if (!live) return false;
    if (k === "u" || (k === "z" && (e.ctrlKey || e.metaKey))) return undo(), true;
    if (k === "r" && !e.ctrlKey && !e.metaKey) return reset(), true;
    if (k === "h") return doHint(), true;
    if (k === "tab") return setSel((s) => (s == null ? 0 : (s + (e.shiftKey ? blocks.length - 1 : 1)) % blocks.length)), true;
    const dir = { arrowleft: [-1, true], arrowright: [1, true], arrowup: [-1, false], arrowdown: [1, false] }[k];
    if (dir) {
      const i = sel ?? 0;
      if (blocks[i].h !== dir[1]) return true;
      const [lo, hi] = E.range(blocks, pos, i);
      const q = pos[i] + dir[0];
      if (q < lo || q > hi) audio.play("bump"), setBump({ i, n: Math.random() });
      else commit(i, q);
      if (sel == null) setSel(0);
      return true;
    }
    return false;
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, select, textarea") || e.altKey) return;
      if (keys.current(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // DEV test hook (?betest=1)
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("betest")) return;
    window.__be = { E, LEVELS, open, commit, undo, reset, hint: doHint, pos: () => pos, hist: () => hist, hintState: () => hint, sel: () => sel, won: () => won, prog: () => prog, screen: () => screen, overlay: () => overlay, setOverlay, setScreen, blocks: () => blocks, lvl: () => lvl };
  });

  /* ---------- render ---------- */
  const totalStars = Object.values(prog.stars).reduce((a, b) => a + b, 0);
  const solvedCount = Object.keys(prog.stars).length;
  const ghosts = useMemo(() => {
    if (!live || sel == null || !prog.guides || drag) return [];
    const [lo, hi] = E.range(blocks, pos, sel);
    const out = [];
    for (let q = lo; q <= hi; q++) if (q !== pos[sel]) out.push(q);
    return out;
  }, [live, sel, prog.guides, drag, blocks, pos]);

  return (
    <div className="be">
      <div className="be-bg" />

      {screen === "menu" && (
        <div className="be-screen be-menu">
          <MenuArt />
          <h1 className="be-logo">
            <span>BLOCK</span>
            <em>ESCAPE</em>
          </h1>
          <p className="be-tagline">SLIDE • THINK • ESCAPE</p>
          <div className="be-menu__btns">
            <button type="button" className="be-btn be-btn--big" onClick={() => open(nextUnsolved(prog))}>
              {solvedCount ? `Continue · Level ${nextUnsolved(prog) + 1}` : "Play"}
            </button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => setScreen("levels")}>Levels</button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => setOverlay("rules")}>How to play</button>
          </div>
          <p className="be-menu__stats">
            <span>★ {totalStars} / {LEVELS.length * 3}</span>
            <span>{solvedCount} / {LEVELS.length} solved</span>
          </p>
          <label className="be-toggle">
            <input type="checkbox" checked={prog.guides} onChange={(e) => saveProg((p) => ({ ...p, guides: e.target.checked }))} />
            <span>Show move guides on tap</span>
          </label>
        </div>
      )}

      {screen === "levels" && (
        <div className="be-screen be-levels">
          <div className="be-levels__head">
            <button type="button" className="be-icon" onClick={() => setScreen("menu")} aria-label="Back">‹</button>
            <h2 className="be-h">Select Level</h2>
            <span className="be-pill">★ {totalStars}</span>
          </div>
          <div className="be-tabs" role="tablist">
            {TIERS.map((t) => {
              const ids = LEVELS.map((l, i) => (l[2] === t.id ? i : -1)).filter((i) => i >= 0);
              const done = ids.filter((i) => prog.stars[i]).length;
              return (
                <button type="button" role="tab" key={t.id} aria-selected={tab === t.id} className={`be-tab be-tab--${t.id}${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                  {t.name}
                  <small>{done}/{ids.length}</small>
                </button>
              );
            })}
          </div>
          <div className="be-grid">
            {LEVELS.map((l, i) =>
              l[2] !== tab ? null : (
                <button type="button" key={i} className={`be-lv${i > prog.unlocked ? " is-locked" : ""}${i === nextUnsolved(prog) ? " is-next" : ""}`} disabled={i > prog.unlocked} onClick={() => open(i)} aria-label={`Level ${i + 1}${i > prog.unlocked ? " (locked)" : ""}`}>
                  {i > prog.unlocked ? <LockIcon /> : <b>{i + 1}</b>}
                  <span className="be-lv__stars">{[1, 2, 3].map((s) => <i key={s} className={(prog.stars[i] ?? 0) >= s ? "on" : ""}>★</i>)}</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {screen === "game" && pos.length > 0 && (
        <div className="be-game">
          <aside className="be-hud">
            <div className="be-hud__top">
              <button type="button" className="be-icon" onClick={() => setScreen("levels")} aria-label="Levels" title="Levels">‹</button>
              <div className="be-hud__title">
                <small className={`be-tier be-tier--${tierOf(lvl)}`}>{tierName(lvl)}</small>
                <strong>Level {lvl + 1}</strong>
              </div>
              <button type="button" className="be-icon" onClick={() => setOverlay("pause")} aria-label="Pause" title="Pause (P)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              </button>
            </div>
            <div className="be-stats">
              <div><small>Moves</small><b key={hist.length} className="be-bumpnum">{hist.length}</b></div>
              <div><small>Par</small><b>{par}</b></div>
              <div><small>Best</small><b>{prog.best[lvl] ?? "–"}</b></div>
            </div>
            <div className="be-stars-live" aria-label="Stars at this pace">
              {[1, 2, 3].map((s) => <i key={s} className={E.stars(Math.max(hist.length, 0), par) >= s ? "on" : ""}>★</i>)}
            </div>
            <div className="be-actions">
              <button type="button" className="be-act" onClick={undo} disabled={!live || !hist.length} title="Undo (U)"><UndoIcon />Undo</button>
              <button type="button" className="be-act" onClick={reset} disabled={(!hist.length && !solved) || overlay === "win"} title="Reset level (R)"><ResetIcon />Reset</button>
              <button type="button" className="be-act be-act--hint" onClick={doHint} disabled={!live} title="Hint (H)"><BulbIcon />Hint</button>
            </div>
            <p className="be-hint-text">
              {hint ? `Hint: slide the ${blocks[hint.i].target ? "red" : "glowing"} block ${dirWord(blocks[hint.i], hint.q - pos[hint.i])} · ${hint.left} move${hint.left > 1 ? "s" : ""} to go` : sel != null && live ? "Drag, use the arrow keys, or tap a guide to slide" : "Drag a block along its track"}
            </p>
          </aside>

          <div className="be-boardwrap">
            <div className="be-board" ref={boardRef}>
              <div className="be-cells" aria-hidden="true">
                {Array.from({ length: 36 }, (_, k) => <i key={k} />)}
              </div>
              <div className={`be-exit${solved ? " is-open" : ""}`} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 4l8 8-8 8" /></svg>
              </div>
              {ghosts.map((q) => {
                const b = blocks[sel];
                return (
                  <button type="button" key={`g${q}`} className="be-ghost" style={geom(b, q)} onClick={() => commit(sel, q)} aria-label={`Slide to ${q + 1}`} />
                );
              })}
              {hint && !drag && <div className="be-ghost be-ghost--hint" style={geom(blocks[hint.i], hint.q)} aria-hidden="true" />}
              {blocks.map((b, i) => {
                const d = drag?.i === i ? drag.d : 0;
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${b.target ? "Red target" : b.h ? "Horizontal" : "Vertical"} block`}
                    className={`be-block ${b.h ? "is-h" : "is-v"} be-c${b.target ? "t" : (i * 7) % 8} len-${b.len}${drag?.i === i ? " is-drag" : ""}${sel === i ? " is-sel" : ""}${hint?.i === i ? " is-hint" : ""}${solved && b.target ? " is-out" : ""}${bump?.i === i ? " is-bump" : ""}`}
                    style={{ ...geom(b, pos[i]), "--d": d }}
                    onPointerDown={(e) => onDown(e, i)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                    onLostPointerCapture={onCancel}
                    onAnimationEnd={() => setBump(null)}
                  >
                    <span className="be-block__face">
                      {b.target ? <svg viewBox="0 0 24 24" className="be-arrow" aria-hidden="true"><path d="M5 12h12M12 6l6 6-6 6" /></svg> : <span className="be-grip" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {overlay === "pause" && (
        <div className="be-screen be-screen--dim">
          <div className="be-panel be-panel--small">
            <h2 className="be-h">Paused</h2>
            <p className="be-sub">Level {lvl + 1} · {hist.length} moves</p>
            <button type="button" className="be-btn" onClick={() => setOverlay(null)}>Resume</button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => open(lvl)}>Reset Level</button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => setOverlay("rulesP")}>How to play</button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => (setOverlay(null), setScreen("levels"))}>Level Select</button>
            <button type="button" className="be-btn be-btn--ghost" onClick={() => (setOverlay(null), setScreen("menu"))}>Main Menu</button>
          </div>
        </div>
      )}

      {overlay === "win" && won && (
        <div className="be-screen be-screen--dim">
          <div className="be-panel be-win">
            <p className="be-kicker">{tierName(lvl)} · Level {lvl + 1}</p>
            <h2 className="be-h">{won.stars === 3 ? "Perfect escape!" : "Escaped!"}</h2>
            <div className="be-win__stars">
              {[1, 2, 3].map((s) => (
                <i key={s} className={won.stars >= s ? "on" : ""} style={{ animationDelay: `${0.15 + s * 0.18}s` }} onAnimationStart={() => won.stars >= s && audio.play("star")}>★</i>
              ))}
            </div>
            <div className="be-stats be-stats--win">
              <div><small>Moves</small><b>{won.moves}</b></div>
              <div><small>Par</small><b>{par}</b></div>
              <div><small>Best</small><b>{won.best}</b></div>
            </div>
            <p className="be-sub">
              {won.stars === 3 ? "Solved in the minimum number of moves." : `Solve it in ${par} moves for three stars.`}
              {hintsUsed ? ` (${hintsUsed} hint${hintsUsed > 1 ? "s" : ""} used)` : ""}
            </p>
            <div className="be-row">
              {!won.last && <button type="button" className="be-btn" onClick={() => open(lvl + 1)}>Next Level</button>}
              <button type="button" className="be-btn be-btn--ghost" onClick={() => open(lvl)}>Replay</button>
              <button type="button" className="be-btn be-btn--ghost" onClick={() => (setOverlay(null), setScreen("levels"))}>Levels</button>
            </div>
            {won.last && <p className="be-sub">You cleared all {LEVELS.length} puzzles!</p>}
          </div>
        </div>
      )}

      {overlay?.startsWith("rules") && <Rules onClose={() => setOverlay(overlay === "rulesP" ? "pause" : null)} />}
    </div>
  );
}

const nextUnsolved = (p) => {
  for (let i = 0; i <= p.unlocked; i++) if (!p.stars[i]) return i;
  return p.unlocked;
};
const dirWord = (b, delta) => `${b.h ? (delta > 0 ? "right" : "left") : delta > 0 ? "down" : "up"} ${Math.abs(delta)} space${Math.abs(delta) > 1 ? "s" : ""}`;
/** CSS geometry of block b at position p, in board percentages. */
function geom(b, p) {
  const x = b.h ? p : b.line, y = b.h ? b.line : p;
  return { "--x": x, "--y": y, "--w": b.h ? b.len : 1, "--hgt": b.h ? 1 : b.len };
}

function MenuArt() {
  // a tiny decorative board
  const demo = [
    { x: 0, y: 2, w: 2, h: 1, c: "t" },
    { x: 2, y: 0, w: 1, h: 3, c: 1 },
    { x: 3, y: 1, w: 1, h: 2, c: 4 },
    { x: 0, y: 0, w: 2, h: 1, c: 6 },
    { x: 4, y: 3, w: 2, h: 1, c: 2 },
    { x: 1, y: 3, w: 1, h: 2, c: 5 },
    { x: 3, y: 5, w: 3, h: 1, c: 3 },
  ];
  return (
    <div className="be-menu__art" aria-hidden="true">
      <div className="be-board be-board--mini">
        <div className="be-cells">{Array.from({ length: 36 }, (_, k) => <i key={k} />)}</div>
        <div className="be-exit"><svg viewBox="0 0 24 24"><path d="M8 4l8 8-8 8" /></svg></div>
        {demo.map((b, k) => (
          <div key={k} className={`be-block be-c${b.c} ${b.w > 1 ? "is-h" : "is-v"}${b.c === "t" ? " is-demo" : ""}`} style={{ "--x": b.x, "--y": b.y, "--w": b.w, "--hgt": b.h, "--d": 0 }}>
            <span className="be-block__face">{b.c === "t" ? <svg viewBox="0 0 24 24" className="be-arrow"><path d="M5 12h12M12 6l6 6-6 6" /></svg> : <span className="be-grip" />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rules({ onClose }) {
  return (
    <div className="be-screen be-screen--dim">
      <div className="be-panel be-rules">
        <h2 className="be-h">How to play</h2>
        <div className="be-rules__body">
          <p><b>Goal:</b> slide the <b>red block</b> out through the exit on the right side of the board.</p>
          <p><b>Blocks slide only along their length:</b> horizontal blocks move left and right, vertical blocks move up and down. They can't pass through each other or leave the board.</p>
          <p><b>Moves:</b> each slide counts as one move, however far the block travels. <b>Par</b> is the fewest moves possible — match it for ★★★.</p>
          <p><b>Controls:</b> drag a block (mouse or finger). Or tap a block to select it and tap a dashed guide to slide there. Keyboard: <kbd>Tab</kbd> select · arrows slide · <kbd>U</kbd> undo · <kbd>R</kbd> reset · <kbd>H</kbd> hint · <kbd>P</kbd> pause.</p>
          <p><b>Hint</b> shows the next move of a shortest solution from where you are now. <b>Undo</b> takes back your last move.</p>
          <p><b>Levels:</b> 100 puzzles in Easy, Medium and Hard. Solving a level unlocks the next.</p>
        </div>
        <button type="button" className="be-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

const LockIcon = () => <svg className="be-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" strokeWidth="2.4" stroke="currentColor" /></svg>;
const UndoIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
const ResetIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" /></svg>;
const BulbIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>;
