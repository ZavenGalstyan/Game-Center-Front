/**
 * Spider Royale — Spider Solitaire (104 cards, 10 columns, 5 stock deals) in
 * plain DOM/CSS. Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) replays the current deal from the
 * start; New Game deals a fresh one. `muted` silences the WebAudio blips.
 * localStorage: `spider-royale-settings`, `spider-royale-stats` (best score /
 * fastest win per mode + difficulty), `spider-royale-save` (unfinished game).
 * Rules: ./engine.js.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import "./SpiderRoyale.css";

const SETTINGS_KEY = "spider-royale-settings";
const STATS_KEY = "spider-royale-stats";
const SAVE_KEY = "spider-royale-save";
const SYM = { S: "♠︎", H: "♥︎", C: "♣︎", D: "♦︎" };
const SUIT_NAME = { S: "spades", H: "hearts", C: "clubs", D: "diamonds" };
const RATIO = 1.4;

const load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
};
const packSave = (s) => ({ ...s, elapsed: E.timeOf(s), since: null, paused: false, last: null, history: s.history.slice(-120) });

let ctx = null;
function blip(kind) {
  const notes = {
    pick: [[700, 0.04, 0.03]],
    place: [[520, 0.06, 0.04], [390, 0.05, 0.03]],
    deal: [[300, 0.05, 0.03], [360, 0.05, 0.03], [420, 0.05, 0.03]],
    bad: [[170, 0.15, 0.05]],
    run: [[523, 0.12, 0.05], [659, 0.12, 0.05], [784, 0.2, 0.05]],
    win: [[523, 0.2, 0.05], [659, 0.2, 0.05], [784, 0.2, 0.05], [1047, 0.5, 0.05]],
    lose: [[392, 0.25, 0.05], [311, 0.4, 0.05]],
  }[kind];
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach(([freq, dur, vol], k) => {
      const t = ctx.currentTime + k * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "bad" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  } catch {
    /* audio unavailable */
  }
}

const Crown = ({ r }) => (
  <svg className="sr-crown" viewBox="0 0 24 14" aria-hidden="true">
    {r === 11 ? <path d="M12 0.5 14.2 5.3 19.5 5.6 15.4 9 16.8 13.5 12 10.8 7.2 13.5 8.6 9 4.5 5.6 9.8 5.3Z" /> : <path d={r === 13 ? "M1 13 2 3 7 8 12 1 17 8 22 3 23 13Z" : "M3 13 4 5 8.5 9 12 3 15.5 9 20 5 21 13Z"} />}
  </svg>
);

export const CardFace = ({ suit, r }) => (
  <>
    <span className="sr-idx"><b>{E.RANKS[r]}</b><i>{SYM[suit]}</i></span>
    <span className="sr-corner">{SYM[suit]}</span>
    <span className={`sr-pip${r > 10 ? " is-court" : ""}`}>{r > 10 ? <><Crown r={r} /><b>{E.RANKS[r]}</b></> : SYM[suit]}</span>
    <span className="sr-idx is-bot"><b>{E.RANKS[r]}</b><i>{SYM[suit]}</i></span>
  </>
);

const Card = memo(function Card({ id, suit, r, up, x, y, z, cls, flip, anim }) {
  return (
    <div
      className={`sr-card ${up ? `is-up suit-${suit}` : "is-down"}${cls}`}
      data-id={id}
      style={{ translate: `${x}px ${y}px`, zIndex: z, ...anim }}
      aria-label={up ? `${E.RANKS[r]} of ${SUIT_NAME[suit]}` : "face-down card"}
    >
      {up ? <div key="f" className={`sr-face${flip ? " is-flip" : ""}`}><CardFace suit={suit} r={r} /></div> : <div key="b" className="sr-back" />}
    </div>
  );
});

function Clock({ s }) {
  const [now, setNow] = useState(() => Date.now());
  const running = s.since != null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  const t = running ? now : undefined;
  if (s.mode !== "timed") return E.formatTime(running ? E.timeOf(s, t) : s.elapsed);
  const left = running ? E.remainingOf(s, t) : Math.max(0, E.limitOf(s) - s.elapsed);
  return <span className={left < 60000 ? "sr-low" : ""}>{E.formatTime(left + 999)}</span>;
}

/** Card geometry for the board's pixel size. */
function geometry(w, h) {
  const gap = Math.max(2, w * 0.008);
  const cw = Math.max(16, Math.min((w - 11 * gap) / 10, (h * 0.94) / (RATIO * 3)));
  const ch = cw * RATIO;
  const left = (w - 10 * cw - 9 * gap) / 2;
  return { gap, cw, ch, left, top: Math.max(4, h * 0.02), h };
}
function columnYs(g, n, down) {
  const dOff = g.ch * 0.11, uOff = g.ch * (g.cw < 46 ? 0.33 : 0.27);
  const raw = Math.min(down, n) * dOff + Math.max(0, n - Math.max(down, 1)) * uOff;
  const avail = g.h - g.top - g.ch - 4;
  const f = raw > avail ? avail / raw : 1;
  const ys = [];
  let y = g.top;
  for (let k = 0; k < n; k++) ys.push(y), (y += (k < down ? dOff : uOff) * f);
  return ys;
}
const colX = (g, c) => g.left + c * (g.cw + g.gap);

export default function SpiderRoyale({ restartSignal = 0, muted = false }) {
  const [settings, setSettings] = useState(() => {
    const v = load(SETTINGS_KEY, { difficulty: "medium", mode: "classic", showTargets: true });
    return { ...v, difficulty: E.DIFFICULTIES[v.difficulty] ? v.difficulty : "medium", mode: E.MODES[v.mode] ? v.mode : "classic" };
  });
  const [stats, setStats] = useState(() => load(STATS_KEY, {}));
  const [restored] = useState(() => {
    const saved = load(SAVE_KEY, null);
    return E.validSave(saved) ? { ...saved, since: null, paused: false, last: null } : null;
  });
  const [s, setS] = useState(() => restored || E.newGame(settings));
  const [sel, setSel] = useState(null); // { col, i }
  const [drag, setDrag] = useState(null); // { col, i, dx, dy, over }
  const [fx, setFx] = useState(null); // { kind: "bad" | "hint", ids, cols, stock, n }
  const [note, setNote] = useState(restored ? "Welcome back — your unfinished game was restored." : null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [anchors, setAnchors] = useState({ stock: { x: 0, y: 0 }, found: [] });
  const rootRef = useRef(null);
  const boardRef = useRef(null);
  const stockRef = useRef(null);
  const foundRef = useRef(null);
  const ptr = useRef(null);
  const hintIdx = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const play = (kind) => !mutedRef.current && blip(kind);
  const sRef = useRef(s);
  sRef.current = s;

  const g = useMemo(() => geometry(size.w, size.h), [size]);
  const stuck = useMemo(() => E.stuck(s), [s]);
  const over = s.won || s.lost;
  const statKey = `${s.mode}-${s.difficulty}`;
  const best = stats[statKey];
  const dealsLeft = s.stock.length / 10;

  // ---- measuring ----
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = () => {
      const b = boardRef.current?.getBoundingClientRect();
      if (!b) return;
      setSize((p) => (p.w === b.width && p.h === b.height ? p : { w: b.width, h: b.height }));
      const rel = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left - b.left, y: r.top - b.top, w: r.width } : { x: 0, y: 0, w: 0 };
      };
      setAnchors({ stock: rel(stockRef.current), found: [...(foundRef.current?.children || [])].map(rel) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  // ---- game lifecycle ----
  const begin = useCallback((game, msg = null) => {
    setS(game);
    setSel(null);
    setDrag(null);
    setFx(null);
    setNote(msg);
    ptr.current = null;
  }, []);
  const newDeal = () => begin(E.newGame(settings));

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const cur = sRef.current;
    begin(E.newGame({ difficulty: cur.difficulty, mode: cur.mode, seed: cur.seed }), "Deal restarted.");
  }, [restartSignal, begin]);

  const changeSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    store(SETTINGS_KEY, next);
    if ((patch.difficulty || patch.mode) && (s.moves === 0 || over)) begin(E.newGame(next));
    else if (patch.difficulty || patch.mode) setNote("New settings apply when you start a New Game.");
  };

  // persistence: unfinished game (also on tab close), cleared once finished
  useEffect(() => {
    if (over) store(SAVE_KEY, null);
    else if (s.moves > 0) store(SAVE_KEY, packSave(s));
  }, [s, over]);
  useEffect(() => {
    const flush = () => {
      const cur = sRef.current;
      if (cur.moves > 0 && !cur.won && !cur.lost) store(SAVE_KEY, packSave(cur));
    };
    window.addEventListener("pagehide", flush);
    return () => (flush(), window.removeEventListener("pagehide", flush));
  }, []);

  // finished: sound + stats
  useEffect(() => {
    if (!over) return;
    play(s.won ? "win" : "lose");
    setStats((st) => {
      const p = st[statKey] || { wins: 0, losses: 0 };
      const rec = s.won
        ? { ...p, wins: p.wins + 1, best: Math.max(p.best || 0, s.score), fastest: Math.min(p.fastest ?? Infinity, s.elapsed), prevBest: p.best, prevFastest: p.fastest }
        : { ...p, losses: (p.losses || 0) + 1 };
      const next = { ...st, [statKey]: rec };
      store(STATS_KEY, next);
      return next;
    });
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timed Challenge: game over when the countdown runs out
  useEffect(() => {
    if (s.mode !== "timed" || s.since == null || over) return;
    const t = setTimeout(() => setS((cur) => (cur.since != null && !cur.won && E.remainingOf(cur) <= 0 ? E.expire(cur) : cur)), E.remainingOf(s) + 20);
    return () => clearTimeout(t);
  }, [s.mode, s.since, s.bonus, over]); // eslint-disable-line react-hooks/exhaustive-deps

  // pause when the tab is hidden
  useEffect(() => {
    const onHide = () => document.hidden && setS((cur) => (cur.since != null ? E.pause(cur) : cur));
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // transient effects clear themselves
  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), fx.kind === "hint" ? 2200 : 500);
    return () => clearTimeout(t);
  }, [fx]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2800);
    return () => clearTimeout(t);
  }, [note]);

  // ---- actions ----
  const commit = (next) => {
    if (!next) return false;
    let out = E.start(next);
    if (out.won) out = E.stop(out);
    hintIdx.current = 0;
    setS(out);
    setSel(null);
    setFx(null);
    if (!out.won) play(out.last?.removed?.length ? "run" : out.last?.kind === "deal" ? "deal" : "place");
    return true;
  };
  const bad = (msg, ids = [], cols = [], stock = false) => {
    play("bad");
    setFx({ kind: "bad", ids, cols, stock, n: Math.random() });
    if (msg) setNote(msg);
  };
  const live = () => !over && !s.paused;

  const tryMove = (from, i, to) => {
    if (commit(E.move(s, from, i, to))) return true;
    const col = s.cols[to];
    const run = s.cols[from].slice(i);
    bad(col.length ? `${E.RANKS[s.deck[run[0]].r]} needs a card exactly one rank higher (${E.RANKS[s.deck[run[0]].r + 1] || "none"}).` : null, [...run, ...(col.length ? [col[col.length - 1]] : [])], [to]);
    return false;
  };

  const whyStuck = (col, i) => {
    if (i < s.down[col]) return "That card is face-down.";
    return "Only a descending run of one suit can move together.";
  };

  const tap = (col, i) => {
    if (!live()) return;
    if (sel && col !== sel.col) {
      if (canTarget(col)) return void tryMove(sel.col, sel.i, col);
      if (i != null && E.movable(s, col, i)) return play("pick"), setSel({ col, i });
      return void tryMove(sel.col, sel.i, col);
    }
    if (i == null) return setSel(null);
    if (sel && sel.i === i) return setSel(null);
    if (E.movable(s, col, i)) return play("pick"), setSel({ col, i });
    setSel(null);
    bad(whyStuck(col, i), i < s.down[col] ? [s.cols[col][i]] : s.cols[col].slice(i));
  };

  const autoMove = (col, i) => {
    if (!live() || !E.movable(s, col, i)) return;
    const ts = E.targets(s, col, i);
    const id = s.cols[col][i];
    const rankOf = (to) => (s.cols[to].length ? (s.deck[s.cols[to].at(-1)].s === s.deck[id].s ? 2 : 1) : 0);
    const to = ts.sort((a, b) => rankOf(b) - rankOf(a))[0];
    if (to == null) return bad("No legal destination for that card.", s.cols[col].slice(i));
    commit(E.move(s, col, i, to));
  };

  const doDeal = () => {
    if (!live()) return;
    const why = E.dealBlock(s);
    if (why) return bad(why, [], s.cols.map((c, k) => (c.length ? -1 : k)).filter((k) => k >= 0), true);
    commit(E.deal(s));
  };
  const doUndo = () => live() && commit(E.undo(s));
  const doHint = () => {
    if (!live()) return;
    const list = E.hints(s);
    if (!list.length) return bad(s.stock.length ? "No moves — fill the empty columns or Undo." : "No moves left — try Undo or a New Game.");
    const h = list[hintIdx.current++ % list.length];
    setSel(null);
    if (h.deal) {
      setFx({ kind: "hint", ids: [], cols: [], stock: true, n: Math.random() });
      return setNote(list.length === 1 ? "No useful moves on the table — deal from the stock." : "Try dealing from the stock.");
    }
    const tgt = s.cols[h.to];
    setFx({ kind: "hint", ids: [...s.cols[h.from].slice(h.i), ...(tgt.length ? [tgt.at(-1)] : [])], cols: [h.to], n: Math.random() });
  };
  const togglePause = () => !over && setS((cur) => (cur.paused ? E.resume(cur) : E.pause(cur)));

  // ---- pointer: drag-and-drop + click / tap ----
  const colAt = (x) => Math.max(0, Math.min(9, Math.round((x - g.left - g.cw / 2) / (g.cw + g.gap))));
  const local = (e) => {
    const r = boardRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e) => {
    if (e.button > 0 || !live()) return;
    const p = local(e);
    const el = e.target.closest("[data-id]");
    const id = el ? Number(el.dataset.id) : null;
    const col = id != null ? s.cols.findIndex((c) => c.includes(id)) : colAt(p.x);
    const i = id != null ? s.cols[col].indexOf(id) : null;
    ptr.current = { x0: p.x, y0: p.y, col, i, dragging: false };
    try {
      boardRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
  };
  const onPointerMove = (e) => {
    const pt = ptr.current;
    if (!pt || pt.i == null) return;
    const p = local(e);
    const dx = p.x - pt.x0, dy = p.y - pt.y0;
    if (!pt.dragging) {
      if (Math.hypot(dx, dy) < 7 || !E.movable(s, pt.col, pt.i)) return;
      pt.dragging = true;
      setSel(null);
      play("pick");
    }
    setDrag({ col: pt.col, i: pt.i, dx, dy, over: colAt(colX(g, pt.col) + dx + g.cw / 2) });
  };
  const onPointerUp = (e) => {
    const pt = ptr.current;
    ptr.current = null;
    if (!pt) return;
    if (!pt.dragging) return tap(pt.col, pt.i);
    const p = local(e);
    const to = colAt(colX(g, pt.col) + p.x - pt.x0 + g.cw / 2);
    setDrag(null);
    if (to !== pt.col) tryMove(pt.col, pt.i, to);
  };
  const onPointerCancel = () => {
    ptr.current = null;
    setDrag(null);
  };
  const onDoubleClick = (e) => {
    const el = e.target.closest("[data-id]");
    if (!el) return;
    const id = Number(el.dataset.id);
    const col = s.cols.findIndex((c) => c.includes(id));
    autoMove(col, s.cols[col].indexOf(id));
  };

  // keyboard: H hint, U / Ctrl+Z undo, D deal, P pause, Esc deselect
  const keysRef = useRef(null);
  keysRef.current = { h: doHint, u: doUndo, z: doUndo, d: doDeal, p: togglePause, escape: () => setSel(null) };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, select, textarea") || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !(e.ctrlKey || e.metaKey)) return;
      if ((e.ctrlKey || e.metaKey) && k !== "z") return;
      if (keysRef.current[k]) {
        e.preventDefault();
        keysRef.current[k]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // DEV test hook (?srtest=1)
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("srtest")) return;
    window.__sr = { E, s: () => s, set: setS, tap, autoMove, deal: doDeal, undo: doUndo, hint: doHint, pause: togglePause, sel: () => sel, fx: () => fx, note: () => note, geo: () => g, newDeal };
  });

  // ---- layout ----
  const active = drag || sel;
  const legal = useMemo(() => (active && settings.showTargets ? new Set(E.targets(s, active.col, active.i)) : new Set()), [s, active?.col, active?.i, settings.showTargets]); // eslint-disable-line react-hooks/exhaustive-deps
  const canTarget = (to) => (sel ? E.canDrop(s, sel.col, sel.i, to) : false);

  const last = s.last;
  const dealt = last?.kind === "deal" ? new Set(last.ids) : null;
  const flipped = new Set(last?.flipped || []);
  const fxIds = new Set(fx?.ids || []);
  const cards = [];
  const slots = [];
  if (g.cw > 0 && size.w > 0) {
    s.cols.forEach((col, c) => {
      const x = colX(g, c);
      const ys = columnYs(g, col.length, s.down[c]);
      const hover = drag && drag.over === c && c !== drag.col;
      const tcls = legal.has(c) || (hover && E.canDrop(s, drag.col, drag.i, c)) ? " is-target" : hover ? " is-nope" : "";
      slots.push(
        <div key={c} className={`sr-slot${!col.length ? tcls : ""}${fx?.cols?.includes(c) && !col.length ? ` is-${fx.kind}` : ""}`} style={{ translate: `${x}px ${g.top}px` }} />,
      );
      col.forEach((id, k) => {
        const up = k >= s.down[c];
        const inDrag = drag && drag.col === c && k >= drag.i;
        const inSel = sel && sel.col === c && k >= sel.i;
        const topCard = k === col.length - 1;
        let cls = "";
        if (inDrag) cls += " is-drag";
        if (inSel) cls += " is-sel";
        if (topCard) cls += tcls;
        if (fxIds.has(id)) cls += ` is-${fx.kind}`;
        let anim;
        if (dealt?.has(id)) {
          cls += " is-dealt";
          anim = { "--fx": `${anchors.stock.x - x}px`, "--fy": `${anchors.stock.y - ys[k]}px`, "--dl": `${c * 45}ms` };
        }
        cards.push(
          <Card key={id} id={id} suit={s.deck[id].s} r={s.deck[id].r} up={up} x={inDrag ? x + drag.dx : x} y={inDrag ? ys[k] + drag.dy : ys[k]} z={inDrag ? 500 + k : k + 1} cls={cls} flip={flipped.has(id)} anim={anim} />,
        );
      });
    });
    // completed sequences fly to the foundation
    (last?.removed || []).forEach((rm, n) => {
      const ys = columnYs(g, rm.base + 13, Math.min(s.down[rm.col], rm.base));
      const f = anchors.found[s.done.length - (last.removed.length - n)] || anchors.stock;
      const x = colX(g, rm.col);
      rm.ids.forEach((id, k) => {
        const y = ys[rm.base + k];
        cards.push(
          <div key={`g${id}`} className={`sr-card is-up is-ghost suit-${s.deck[id].s}`} style={{ translate: `${x}px ${y}px`, zIndex: 600 + k, "--gx": `${f.x - x}px`, "--gy": `${f.y - y}px`, "--dl": `${(12 - k) * 35}ms` }}>
            <div className="sr-face"><CardFace suit={s.deck[id].s} r={s.deck[id].r} /></div>
          </div>,
        );
      });
    });
  }

  const finalBest = s.won && best && best.best === s.score && (best.prevBest == null || s.score > best.prevBest);
  const finalFast = s.won && best && best.fastest === s.elapsed && (best.prevFastest == null || s.elapsed < best.prevFastest);
  const pending = settings.difficulty !== s.difficulty || settings.mode !== s.mode;

  return (
    <div className="sr" ref={rootRef}>
      <div className="sr-layout">
        <aside className="sr-side">
          <header className="sr-head">
            <h2 className="sr-title">Spider <span>Royale</span></h2>
            <p className="sr-tag">STACK • STRATEGIZE • SOLVE</p>
          </header>

          <div className="sr-stats">
            <div className="sr-stat"><span>Score</span><strong>{s.score}</strong></div>
            <div className="sr-stat"><span>{s.mode === "timed" ? "Left" : "Time"}</span><strong><Clock s={s} /></strong></div>
            <div className="sr-stat"><span>Moves</span><strong>{s.moves}</strong></div>
            <div className="sr-stat"><span>Done</span><strong>{s.done.length}/8</strong></div>
          </div>

          <div className="sr-piles">
            <button type="button" ref={stockRef} className={`sr-stock${dealsLeft ? "" : " is-empty"}${fx?.stock ? ` is-${fx.kind}` : ""}`} onClick={doDeal} disabled={!dealsLeft || over} title="Deal (D)" aria-label={`Deal from stock, ${dealsLeft} deals left`}>
              {Array.from({ length: dealsLeft }, (_, k) => <span key={k} className="sr-back" style={{ "--k": k }} />)}
              <em>{dealsLeft ? `Deal ×${dealsLeft}` : "Empty"}</em>
            </button>
            <div className="sr-found" ref={foundRef} aria-label={`${s.done.length} of 8 sequences complete`}>
              {Array.from({ length: 8 }, (_, k) => (
                <span key={k} className={`sr-fslot${s.done[k] ? ` is-full suit-${s.done[k]}` : ""}`}>
                  {s.done[k] && <span className="sr-mini"><b>K</b><i>{SYM[s.done[k]]}</i></span>}
                </span>
              ))}
            </div>
          </div>

          <div className="sr-pickers">
            <label className="sr-pick">
              <span>Difficulty</span>
              <select value={settings.difficulty} onChange={(e) => changeSettings({ difficulty: e.target.value })}>
                {Object.entries(E.DIFFICULTIES).map(([id, d]) => <option key={id} value={id}>{d.label} · {d.suits} suit{d.suits > 1 ? "s" : ""}</option>)}
              </select>
            </label>
            <label className="sr-pick">
              <span>Mode</span>
              <select value={settings.mode} onChange={(e) => changeSettings({ mode: e.target.value })}>
                {Object.entries(E.MODES).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
              </select>
            </label>
          </div>

          <div className="sr-actions">
            <button type="button" className="sr-btn" onClick={doUndo} disabled={!live() || !s.history.length} title="Undo (U / Ctrl+Z)">Undo</button>
            <button type="button" className="sr-btn" onClick={doHint} disabled={!live()} title="Hint (H)">Hint</button>
            <button type="button" className="sr-btn" onClick={togglePause} disabled={over} title="Pause (P)">{s.paused ? "Resume" : "Pause"}</button>
            <button type="button" className={`sr-btn sr-btn--main${pending ? " is-pending" : ""}`} onClick={newDeal}>New Game</button>
          </div>

          <div className="sr-foot">
            <label className="sr-toggle">
              <input type="checkbox" checked={settings.showTargets} onChange={(e) => changeSettings({ showTargets: e.target.checked })} />
              <span>Highlight legal moves</span>
            </label>
            <p className="sr-best">
              {E.DIFFICULTIES[s.difficulty].label} · {s.mode === "timed" ? "Timed" : "Classic"} best: <strong>{best?.best != null ? `${best.best} pts · ${E.formatTime(best.fastest)}` : "—"}</strong>
            </p>
          </div>
        </aside>

        <div
          className={`sr-board${s.paused ? " is-paused" : ""}${drag ? " is-dragging" : ""}${g.cw < 46 ? " is-compact" : ""}`}
          ref={boardRef}
          style={{ "--cw": `${g.cw}px`, "--ch": `${g.ch}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          {slots}
          {cards}

          {note && <p className="sr-note" role="status">{note}</p>}

          {stuck && !s.paused && (
            <div className="sr-banner" role="alert">
              <strong>No moves left</strong>
              <div>
                <button type="button" className="sr-btn" onClick={doUndo} disabled={!s.history.length}>Undo</button>
                <button type="button" className="sr-btn sr-btn--main" onClick={newDeal}>New Game</button>
              </div>
            </div>
          )}

          {s.paused && (
            <div className="sr-overlay">
              <h3>Paused</h3>
              <button type="button" className="sr-btn sr-btn--main" onClick={togglePause}>Resume</button>
            </div>
          )}

          {over && (
            <div className={`sr-overlay${s.won ? " is-win" : " is-lose"}`}>
              <p className="sr-kicker">{s.won ? (finalBest ? "★ New best score ★" : finalFast ? "★ Fastest win ★" : `${E.DIFFICULTIES[s.difficulty].label} · ${E.MODES[s.mode].label}`) : "Time's up"}</p>
              <h3>{s.won ? "Royal Victory!" : "Challenge Over"}</h3>
              <div className="sr-stats">
                <div className="sr-stat"><span>Score</span><strong>{s.score}</strong></div>
                <div className="sr-stat"><span>Time</span><strong>{E.formatTime(s.elapsed)}</strong></div>
                <div className="sr-stat"><span>Moves</span><strong>{s.moves}</strong></div>
                <div className="sr-stat"><span>{s.won && s.mode === "timed" ? "Time bonus" : "Suits done"}</span><strong>{s.won && s.mode === "timed" ? `+${s.timeBonus}` : `${s.done.length}/8`}</strong></div>
              </div>
              {best && <p className="sr-record">Best {best.best ?? "—"} pts · Fastest {best.fastest != null ? E.formatTime(best.fastest) : "—"} · Wins {best.wins}</p>}
              <div className="sr-row">
                <button type="button" className="sr-btn sr-btn--main" onClick={newDeal}>Play Again</button>
                {s.lost && <button type="button" className="sr-btn" onClick={() => begin(E.newGame({ difficulty: s.difficulty, mode: s.mode, seed: s.seed }))}>Retry Deal</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
