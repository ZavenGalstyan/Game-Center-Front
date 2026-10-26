/**
 * Escape Quest: Hidden Rooms — a 2D point-and-click escape game: 50
 * handcrafted rooms in 5 chapters. SVG scenes inside the shared <GamePlayer>
 * (registered by name in ../registry.js); Restart / Mute / Fullscreen / Like
 * stay there.
 *
 * engine.js judges every tap, item use, combine and puzzle answer; levels/
 * is pure data; tools/simTest.mjs replays and fuzzes every level. Progress
 * (unlocked rooms, stars, best times, an in-progress room) persists under
 * `escape-quest-progress`. `restartSignal` restarts the room being played;
 * `muted` silences the WebAudio effects.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LEVELS, CHAPTERS } from "./levels/index.js";
import { newState, clone, tap, solve, combine, visible, hintFor, itemDef, stepDone, runStep } from "./engine.js";
import { Room, RoomShade, SceneDefs, W, H } from "./rooms.jsx";
import { Prop } from "./props.jsx";
import { ItemIcon, ItemSvg } from "./icons.jsx";
import { ClueCard, PuzzleModal } from "./Puzzles.jsx";
import { SFX, setMuted } from "./audio.js";
import "./EscapeQuest.css";

const KEY = "escape-quest-progress";
const DEFAULTS = { unlocked: 1, stars: {}, best: {}, sound: true, current: null, seenIntro: {} };

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p ? { ...DEFAULTS, ...p } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

const THUMB_STATES = LEVELS.map((L) => newState(L));
const noop = () => {};
const starsFor = (hints) => (hints === 0 ? 3 : hints <= 2 ? 2 : 1);
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/* ---------------- scene ---------------- */

function Hotspot({ level, s, h, onTap, pulse, selItem }) {
  if (h.k === "none") return null;
  // Pure clue spots (a crate with a painted arrow, a portrait) keep their closed art.
  const open = h.k !== "item" && !!s.opened[h.id] && !(h.clue && !h.lock && !h.gives && !h.reveals);
  const p = h.k === "item" ? null : h.p || {};
  const it = h.take ? itemDef(level, h.take) : null;
  return (
    <g
      className={`eq-hs${h.take ? " eq-hs--item" : ""}${selItem ? " eq-hs--target" : ""}${pulse ? " eq-hs--pulse" : ""}`}
      transform={`translate(${h.x} ${h.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onTap(h);
      }}
      role="button"
      aria-label={h.label}
    >
      <title>{h.label}</title>
      <g className="eq-hs__art">
        {h.k === "item" ? (
          <g className="eq-bob">
            <ellipse cx={h.w / 2} cy={h.h - 1} rx={h.w * 0.38} ry={h.w * 0.08} fill="#000" opacity="0.18" />
            <ItemIcon icon={it ? it.icon : h.p.icon} c={it ? it.c : h.p.c} size={h.w} />
          </g>
        ) : (
          <Prop kind={h.k} w={h.w} h={h.h} open={open} p={p} />
        )}
      </g>
      <rect className="eq-hs__hit" x="-6" y="-6" width={h.w + 12} height={h.h + 12} rx="10" />
      {pulse && <rect className="eq-hs__ring" x="-10" y="-10" width={h.w + 20} height={h.h + 20} rx="14" />}
    </g>
  );
}

export function Scene({ level, s, onTap, pulseId, onBackground }) {
  const view = s.view;
  return (
    <svg className="eq-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onClick={onBackground}>
      <SceneDefs />
      <Room theme={level.theme} view={view} />
      {level.decor
        .filter((d) => (d.v || 0) === view)
        .map((d, i) => (
          <g key={`d${i}`} transform={`translate(${d.x} ${d.y})`} pointerEvents="none">
            <Prop kind={d.k} w={d.w} h={d.h} p={d.p || {}} />
          </g>
        ))}
      {level.hotspots
        .filter((h) => h.v === view && visible(level, s, h))
        .map((h) => (
          <Hotspot key={h.id} level={level} s={s} h={h} onTap={onTap} pulse={pulseId === h.id} selItem={!!s.sel} />
        ))}
      <RoomShade theme={level.theme} />
    </svg>
  );
}

/* ---------------- screens ---------------- */

function Stars({ n, size = 16 }) {
  return (
    <span className="eq-stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 80 80" width={size} height={size} className={i < n ? "on" : ""}>
          <path d="M40 4 L51 29 L78 30 L57 47 L64 74 L40 59 L16 74 L23 47 L2 30 L29 29 Z" />
        </svg>
      ))}
    </span>
  );
}

function Menu({ prog, onPlay, onLevels, sound, toggleSound }) {
  const total = Object.values(prog.stars).reduce((a, b) => a + b, 0);
  const done = Object.keys(prog.stars).length;
  const resume = prog.current && LEVELS[prog.current.id - 1];
  return (
    <div className="eq-menu">
      <div className="eq-menu__bg" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <SceneDefs />
          <Room theme="library" />
          <g transform="translate(90 120)">
            <Prop kind="bookshelf" w={170} h={280} p={{ rows: 4 }} />
          </g>
          <g transform="translate(760 150)">
            <Prop kind="door" w={130} h={250} open p={{}} />
          </g>
          <g transform="translate(330 330)">
            <Prop kind="chest" w={140} h={95} open p={{}} />
          </g>
          <g transform="translate(610 300)">
            <Prop kind="safe" w={100} h={100} p={{ face: "keypad" }} />
          </g>
          <RoomShade theme="library" />
        </svg>
      </div>
      <div className="eq-menu__card eq-pop">
        <div className="eq-menu__kicker">Find Clues · Solve Puzzles · Escape!</div>
        <h2 className="eq-menu__title">
          Escape Quest
          <span>Hidden Rooms</span>
        </h2>
        <div className="eq-menu__stats">
          <span>
            <b>{done}</b>/50 rooms
          </span>
          <span>
            <b>{total}</b>/150 ★
          </span>
        </div>
        <div className="eq-menu__btns">
          <button className="eq-btn eq-btn--primary eq-btn--lg" onClick={() => onPlay(resume ? resume.id : Math.min(prog.unlocked, 50))}>
            {resume ? `Continue · Room ${resume.id}` : done ? `Play · Room ${Math.min(prog.unlocked, 50)}` : "Start Adventure"}
          </button>
          <button className="eq-btn eq-btn--lg" onClick={onLevels}>
            Select Room
          </button>
          <button className="eq-btn eq-btn--ghost eq-btn--sm" onClick={toggleSound}>
            Sound: {sound ? "On" : "Off"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelSelect({ prog, onPick, onBack }) {
  const [ch, setCh] = useState(() => Math.floor((Math.min(prog.unlocked, 50) - 1) / 10));
  const chapter = CHAPTERS[ch];
  const levels = LEVELS.filter((l) => l.chapter === ch);
  return (
    <div className="eq-levels">
      <div className="eq-levels__top">
        <button className="eq-btn eq-btn--sm" onClick={onBack}>
          ← Menu
        </button>
        <div className="eq-levels__title">Select Room</div>
        <span />
      </div>
      <div className="eq-levels__tabs" role="tablist">
        {CHAPTERS.map((c, i) => {
          const locked = i * 10 + 1 > prog.unlocked;
          return (
            <button key={c.name} role="tab" aria-selected={i === ch} className={`eq-tab${i === ch ? " on" : ""}`} style={{ "--chc": c.color }} onClick={() => setCh(i)} disabled={locked}>
              <span className="eq-tab__n">{i + 1}</span>
              <span className="eq-tab__name">{locked ? "Locked" : c.name}</span>
            </button>
          );
        })}
      </div>
      <div className="eq-levels__grid" style={{ "--chc": chapter.color }}>
        {levels.map((l) => {
          const locked = l.id > prog.unlocked;
          return (
            <button key={l.id} className={`eq-lvl${locked ? " locked" : ""}${prog.stars[l.id] ? " done" : ""}`} disabled={locked} onClick={() => onPick(l.id)}>
              <span className="eq-lvl__thumb" aria-hidden="true">
                {locked ? <span className="eq-lvl__lock">🔒</span> : <Scene level={l} s={THUMB_STATES[l.id - 1]} onTap={noop} onBackground={noop} />}
                <span className="eq-lvl__num">{l.id}</span>
              </span>
              <span className="eq-lvl__name">{locked ? "???" : l.name}</span>
              {!locked && <Stars n={prog.stars[l.id] || 0} size={13} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */

export default function EscapeQuest({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(loadProgress);
  const [screen, setScreen] = useState("menu"); // menu | levels | play
  const [lvlId, setLvlId] = useState(1);
  const level = LEVELS[lvlId - 1];
  const [s, setS] = useState(() => newState(LEVELS[0]));
  const [toast, setToast] = useState(null);
  const [clue, setClue] = useState(null);
  const [puzzle, setPuzzle] = useState(null);
  const [found, setFound] = useState(null);
  const [hint, setHint] = useState(null);
  const [intro, setIntro] = useState(false);
  const [win, setWin] = useState(null);
  const [escaping, setEscaping] = useState(false);
  const [shakeInv, setShakeInv] = useState(0);
  const [sec, setSec] = useState(0);
  const timeRef = useRef(0);
  const toastT = useRef(null);
  const foundT = useRef(null);
  const hintT = useRef(null);
  const progRef = useRef(prog);
  progRef.current = prog;

  useEffect(() => setMuted(muted || !prog.sound), [muted, prog.sound]);
  useEffect(() => saveProgress(prog), [prog]);

  // Running clock for the room (paused behind modals/menus).
  const paused = screen !== "play" || !!win || intro || escaping;
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => {
      timeRef.current += 1;
      setSec(timeRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [paused]);

  // Keep an in-progress room so a refresh resumes where the player was.
  useEffect(() => {
    if (screen !== "play" || win) return;
    setProg((p) => ({ ...p, current: { id: level.id, state: s, time: timeRef.current } }));
  }, [s, screen, win, level.id]);

  const say = useCallback((text, kind = "") => {
    clearTimeout(toastT.current);
    setToast({ text, kind, k: Date.now() });
    toastT.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const clearOverlays = () => {
    setClue(null);
    setPuzzle(null);
    setFound(null);
    setHint(null);
    setToast(null);
    setWin(null);
    setEscaping(false);
  };

  const startLevel = useCallback(
    (id, fresh = false) => {
      const L = LEVELS[id - 1];
      const cur = progRef.current.current;
      const resume = !fresh && cur && cur.id === id && cur.state && !cur.state.escaped;
      clearOverlays();
      setLvlId(id);
      setS(resume ? cur.state : newState(L));
      timeRef.current = resume ? cur.time || 0 : 0;
      setSec(timeRef.current);
      setScreen("play");
      setIntro(!resume);
      SFX.view();
    },
    [],
  );

  // GamePlayer's Restart restarts the room being played.
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screen === "play") startLevel(lvlId, true);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(
    (state) => {
      setEscaping(true);
      SFX.door();
      setTimeout(() => {
        const stars = starsFor(state.hints);
        const t = timeRef.current;
        setProg((p) => ({
          ...p,
          unlocked: Math.max(p.unlocked, Math.min(50, level.id + 1)),
          stars: { ...p.stars, [level.id]: Math.max(p.stars[level.id] || 0, stars) },
          best: { ...p.best, [level.id]: p.best[level.id] ? Math.min(p.best[level.id], t) : t },
          current: null,
        }));
        setEscaping(false);
        setWin({ stars, time: t, hints: state.hints, moves: state.moves });
        SFX.win();
      }, 1100);
    },
    [level],
  );

  const applyEvent = useCallback(
    (next, ev) => {
      setS(next);
      if (ev.gained.length) {
        const it = ev.gained[ev.gained.length - 1];
        clearTimeout(foundT.current);
        setFound({ id: it, k: Date.now() });
        foundT.current = setTimeout(() => setFound(null), 1500);
        SFX.pick();
      } else if (ev.unlocked.length) SFX.unlock();
      else if (ev.ok) SFX.open();
      if (ev.wrong) {
        SFX.wrong();
        setShakeInv((n) => n + 1);
      }
      if (ev.msgs.length) say(ev.msgs[ev.msgs.length - 1], ev.wrong ? "bad" : ev.ok ? "good" : "");
      if (ev.clue) {
        setTimeout(() => {
          SFX.clue();
          setClue(ev.clue);
        }, ev.gained.length ? 650 : 120);
      }
      if (ev.puzzle) {
        SFX.tap();
        setPuzzle(ev.puzzle);
      }
      if (ev.escaped) finish(next);
      if (hint && (ev.ok || ev.escaped)) setHint(null);
    },
    [say, finish, hint],
  );

  const onTap = useCallback(
    (h) => {
      if (escaping || win) return;
      const next = clone(s);
      const ev = tap(level, next, h.id, s.sel);
      if (!ev.ok && !ev.wrong && !ev.puzzle && !ev.msgs.length) SFX.tap();
      applyEvent(next, ev);
    },
    [s, level, applyEvent, escaping, win],
  );

  const onInv = (id) => {
    if (s.sel === id) {
      setS({ ...s, sel: null });
      SFX.tap();
      return;
    }
    const recipe = s.sel && level.combos.some((c) => (c.a === s.sel && c.b === id) || (c.a === id && c.b === s.sel));
    if (recipe) {
      const next = clone(s);
      const ev = combine(level, next, s.sel, id);
      SFX.combine();
      applyEvent(next, ev);
      return;
    }
    SFX.tap();
    setS({ ...s, sel: id });
    say(`${itemDef(level, id).name} selected — tap something in the room to use it.`);
  };

  const inspect = () => {
    const it = itemDef(level, s.sel);
    SFX.clue();
    setClue(it.clue || { title: it.name, text: it.desc || "It might be useful somewhere in this room." });
  };

  const onSolve = (input) => {
    const next = clone(s);
    const ev = solve(level, next, puzzle, input);
    if (ev.ok) {
      setTimeout(() => {
        setPuzzle(null);
        applyEvent(next, ev);
      }, 500);
      SFX.unlock();
      return true;
    }
    SFX.wrong();
    setS(next);
    return false;
  };

  const goView = (d) => {
    SFX.view();
    setS({ ...s, view: (s.view + d + level.views) % level.views });
  };

  const askHint = () => {
    const hnt = hintFor(level, s);
    if (!hnt) return;
    SFX.hint();
    setS({ ...s, hints: s.hints + 1 });
    setHint(hnt);
    clearTimeout(hintT.current);
    hintT.current = setTimeout(() => setHint(null), 9000);
  };

  // Keyboard: arrows switch walls, Esc closes overlays / deselects.
  useEffect(() => {
    if (screen !== "play") return undefined;
    const k = (e) => {
      if (puzzle || clue || win || intro) return;
      if (level.views > 1 && e.key === "ArrowLeft") goView(-1);
      else if (level.views > 1 && e.key === "ArrowRight") goView(1);
      else if (e.key === "Escape" && s.sel) setS({ ...s, sel: null });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // QA hook (?eqtest=1): jump to rooms, set the wall, replay solution steps.
  const qa = useRef({});
  qa.current = { level, s, setS, startLevel, setIntro, setScreen, setProg, prog };
  useEffect(() => {
    if (typeof window === "undefined" || !/[?&]eqtest=1/.test(window.location.search)) return undefined;
    window.__eq = {
      go: (id) => qa.current.startLevel(id, true),
      skipIntro: () => qa.current.setIntro(false),
      view: (v) => qa.current.setS({ ...qa.current.s, view: v }),
      steps: (n) => {
        const { level: L, s: st } = qa.current;
        const next = clone(st);
        L.solution.slice(0, n).forEach((step) => !stepDone(L, next, step) && runStep(L, next, step));
        qa.current.setS(next);
        return next;
      },
      state: () => qa.current.s,
      unlockAll: () => qa.current.setProg((p) => ({ ...p, unlocked: 50 })),
      screen: (sc) => qa.current.setScreen(sc),
    };
    return () => delete window.__eq;
  }, []);

  const toggleSound = () => setProg((p) => ({ ...p, sound: !p.sound }));
  const toMenu = () => {
    clearOverlays();
    setScreen("menu");
  };

  const pulseId = hint && hint.view === s.view ? hint.id : null;
  const pulseArrow = hint && hint.id && hint.view !== s.view;
  const pz = puzzle && level.hotspots.find((h) => h.id === puzzle);
  const chapter = CHAPTERS[level.chapter];

  if (screen === "menu")
    return (
      <div className="eq">
        <Menu prog={prog} onPlay={(id) => startLevel(id)} onLevels={() => setScreen("levels")} sound={prog.sound} toggleSound={toggleSound} />
      </div>
    );
  if (screen === "levels")
    return (
      <div className="eq">
        <LevelSelect prog={prog} onPick={(id) => startLevel(id)} onBack={() => setScreen("menu")} />
      </div>
    );

  return (
    <div className="eq eq--play" style={{ "--chc": chapter.color }}>
      <div className="eq-hud">
        <button className="eq-iconbtn" onClick={toMenu} aria-label="Menu" title="Menu">
          ☰
        </button>
        <button className="eq-iconbtn" onClick={() => setScreen("levels")} aria-label="Rooms" title="Select room">
          ▦
        </button>
        <div className="eq-hud__title">
          <span className="eq-hud__num">{level.id}</span>
          <span className="eq-hud__name">{level.name}</span>
        </div>
        <span className="eq-hud__time">{fmt(sec)}</span>
        <button className="eq-iconbtn" onClick={() => startLevel(level.id, true)} aria-label="Restart room" title="Restart room">
          ↻
        </button>
        <button className="eq-iconbtn" onClick={toggleSound} aria-label={prog.sound ? "Sound off" : "Sound on"} title="Sound">
          {prog.sound && !muted ? "🔊" : "🔇"}
        </button>
        <button className="eq-hintbtn" onClick={askHint} title="Hint (costs a star)">
          💡 Hint{s.hints ? ` · ${s.hints}` : ""}
        </button>
      </div>

      <div className="eq-main">
        <div className={`eq-stage${s.sel ? " eq-stage--holding" : ""}${escaping ? " eq-stage--escape" : ""}`}>
          <Scene level={level} s={s} onTap={onTap} pulseId={pulseId} onBackground={() => s.sel && setS({ ...s, sel: null })} />
          {level.views > 1 && (
            <>
              <button className={`eq-viewbtn eq-viewbtn--l${pulseArrow ? " pulse" : ""}`} onClick={() => goView(-1)} aria-label="Turn left">
                ‹
              </button>
              <button className={`eq-viewbtn eq-viewbtn--r${pulseArrow ? " pulse" : ""}`} onClick={() => goView(1)} aria-label="Turn right">
                ›
              </button>
              <div className="eq-dots">
                {Array.from({ length: level.views }, (_, i) => (
                  <span key={i} className={i === s.view ? "on" : ""} />
                ))}
              </div>
            </>
          )}
          {toast && (
            <div key={`t${toast.k}`} className={`eq-toast eq-toast--${toast.kind}`}>
              {toast.text}
            </div>
          )}
          {hint && (
            <div className="eq-hint eq-pop" onClick={() => setHint(null)}>
              <b>💡 Hint</b> {hint.text}
              {pulseArrow && <em> (Look at another wall — use the arrows.)</em>}
            </div>
          )}
          {found && (
            <div key={`f${found.k}`} className="eq-found">
              <ItemSvg icon={itemDef(level, found.id).icon} c={itemDef(level, found.id).c} className="eq-found__icon" />
              <span>{itemDef(level, found.id).name}</span>
            </div>
          )}
          {escaping && <div className="eq-flash" />}
        </div>

        <div className={`eq-inv`} key={shakeInv ? `s${shakeInv}` : "inv"}>
          <div className="eq-inv__label">Bag</div>
          <div className={`eq-inv__slots${shakeInv ? " eq-shake" : ""}`}>
            {s.inv.map((id) => {
              const it = itemDef(level, id);
              const hl = hint && (hint.item === id || (hint.items && hint.items.includes(id)));
              return (
                <button key={id} className={`eq-slot${s.sel === id ? " sel" : ""}${hl ? " pulse" : ""}`} onClick={() => onInv(id)} title={it.name} aria-label={it.name} aria-pressed={s.sel === id}>
                  <ItemSvg icon={it.icon} c={it.c} />
                </button>
              );
            })}
            {Array.from({ length: Math.max(0, 6 - s.inv.length) }, (_, i) => (
              <span key={`e${i}`} className="eq-slot eq-slot--empty" />
            ))}
          </div>
          {s.sel && (
            <button className="eq-btn eq-btn--sm eq-inv__inspect" onClick={inspect}>
              🔍 Inspect
            </button>
          )}
        </div>
      </div>

      {intro && (
        <div className="eq-modal" onPointerDown={() => setIntro(false)}>
          <div className="eq-card eq-card--intro eq-pop">
            <div className="eq-card__kicker" style={{ color: chapter.color }}>
              Chapter {level.chapter + 1} · {chapter.name}
            </div>
            <div className="eq-card__title">
              Room {level.id}: {level.name}
            </div>
            <p>{level.intro}</p>
            <p className="eq-card__tips">Tap objects to search them · Tap an item in your bag, then tap where to use it · Select one item and tap another to combine.</p>
            <button className="eq-btn eq-btn--primary" onClick={() => setIntro(false)}>
              Let's go!
            </button>
          </div>
        </div>
      )}
      {clue && <ClueCard clue={clue} onClose={() => setClue(null)} />}
      {pz && <PuzzleModal hotspotLabel={pz.label} p={pz.lock.puzzle} onSubmit={onSolve} onClose={() => setPuzzle(null)} />}
      {win && (
        <div className="eq-modal">
          <div className="eq-card eq-card--win eq-pop">
            <div className="eq-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ "--i": i }} />
              ))}
            </div>
            <div className="eq-card__kicker">You escaped!</div>
            <div className="eq-card__title">{level.name}</div>
            <Stars n={win.stars} size={40} />
            <div className="eq-win__stats">
              <span>
                Time <b>{fmt(win.time)}</b>
              </span>
              <span>
                Hints <b>{win.hints}</b>
              </span>
              <span>
                Best <b>{fmt(prog.best[level.id] ?? win.time)}</b>
              </span>
            </div>
            {win.stars < 3 && <p className="eq-card__tips">Escape without hints for 3 stars.</p>}
            <div className="eq-win__btns">
              {level.id < 50 ? (
                <button className="eq-btn eq-btn--primary eq-btn--lg" onClick={() => startLevel(level.id + 1, true)}>
                  Next Room →
                </button>
              ) : (
                <p className="eq-win__final">🏆 You escaped all 50 rooms! You are a true Escape Quest master.</p>
              )}
              <button className="eq-btn" onClick={() => startLevel(level.id, true)}>
                Replay
              </button>
              <button className="eq-btn" onClick={() => setScreen("levels")}>
                Rooms
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

