/**
 * Haunted Mansion Escape — first-person point-and-click escape room (Escape Room).
 *
 * Ten connected rooms of Ashcroft Hall, each a plain Three.js room view
 * (scene.js) with clickable hotspots. Every rule lives in data.js and is
 * judged by the pure engine (engine.js): inventory, item use/combination,
 * locked doors, puzzle answers, escalating hints and the save format.
 * React draws the HUD, inventory, journal, map and the puzzle modals
 * (Puzzles.jsx). Progress is saved to localStorage after every action.
 *
 * Controls: move the pointer to look around (drag on touch) · click objects
 * to inspect / interact · click an inventory item to select it, then click an
 * object to use it (or another item to combine) · hold Space to reveal
 * hotspots · H hint · J journal · M map · Esc pause.
 *
 * GamePlayer: `restartSignal` starts a new game (ignored on the main menu),
 * `muted` silences audio, Fullscreen just resizes the stage.
 * DEV hook: `?hmetest=1` exposes window.__hme.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./HauntedMansionEscape.css";
import { createScene } from "./scene.js";
import { audio } from "./audio.js";
import { ITEMS, CLUES, ROOMS, ROOM_ORDER, PUZZLES, HOTSPOTS } from "./data.js";
import { newState, interact, travel as travelTo, combine, solve, takeHint, objective, serialize, deserialize, unlockedRooms } from "./engine.js";
import { PUZZLE_UI } from "./Puzzles.jsx";

const STORE_KEY = "haunted-mansion-escape-progress";
const RECORD_KEY = "haunted-mansion-escape-records";
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("hmetest");

function loadSave() {
  try {
    return deserialize(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    return null;
  }
}
function writeSave(s) {
  try {
    localStorage.setItem(STORE_KEY, serialize(s));
  } catch {
    /* storage blocked — progress just won't persist */
  }
}
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY) || "null") || { escapes: 0, bestTime: 0, fewestHints: null };
  } catch {
    return { escapes: 0, bestTime: 0, fewestHints: null };
  }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function HauntedMansionEscape({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const gsRef = useRef(null);
  if (!gsRef.current) gsRef.current = loadSave() || newState();

  const [gs, setGs] = useState(gsRef.current);
  const [screen, setScreenState] = useState("menu"); // menu | play | victory
  const [hasSave, setHasSave] = useState(() => {
    const s = loadSave();
    return Boolean(s && !s.won && (s.inv.length || Object.keys(s.f).length));
  });
  const [records, setRecords] = useState(loadRecords);
  const [paused, setPausedState] = useState(false);
  const [modal, setModalState] = useState(null); // {type:'puzzle'|'inspect'|'journal'|'map'|'hint'|'help', ...}
  const [selected, setSelected] = useState(null);
  const [narration, setNarration] = useState(null);
  const [toast, setToast] = useState(null);
  const [hoverName, setHoverName] = useState(null);
  const [markers, setMarkers] = useState(null);
  const [showMarkers, setShowMarkers] = useState(false);
  const [fade, setFade] = useState(false);
  const [white, setWhite] = useState(false);
  const [title, setTitle] = useState(null);
  const [shake, setShakeState] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const screenRef = useRef("menu");
  const modalRef = useRef(null);
  const pausedRef = useRef(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const timers = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  }, []);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
    sceneRef.current?.setMode(s === "play" ? "play" : "menu");
  }, []);
  const setModal = useCallback((m) => {
    modalRef.current = m;
    setModalState(m);
    if (!m || m.type !== "puzzle") sceneRef.current?.focus(m?.focus || null);
  }, []);
  const setPaused = useCallback((p) => {
    pausedRef.current = p;
    setPausedState(p);
  }, []);
  const commit = useCallback((s) => {
    gsRef.current = s;
    setGs(s);
    sceneRef.current?.setState(s);
    writeSave(s);
  }, []);
  const narrate = useCallback(
    (text, focus = null) => {
      if (!text) return;
      const id = Date.now() + Math.random();
      setNarration({ id, text });
      sceneRef.current?.focus(focus);
      later(() => {
        setNarration((n) => (n && n.id === id ? null : n));
        if (!modalRef.current) sceneRef.current?.focus(null);
      }, Math.max(3800, text.length * 55));
    },
    [later],
  );
  const showToast = useCallback(
    (text, kind = "item") => {
      const id = Date.now() + Math.random();
      setToast({ id, text, kind });
      later(() => setToast((t) => (t && t.id === id ? null : t)), 2600);
    },
    [later],
  );
  const gotItems = useCallback(
    (ids) => {
      if (!ids?.length) return;
      showToast(`Obtained: ${ids.map((i) => ITEMS[i].name).join(", ")}`);
      setNewItems(ids);
      later(() => setNewItems([]), 1800);
    },
    [later, showToast],
  );

  /* ------------------------------------------------------------ scene */
  useEffect(() => {
    alive.current = true;
    const sc = createScene(stageRef.current, {
      onGhost: () => audio.cue("whisper"),
      onFlicker: () => audio.cue("creak"),
    });
    sceneRef.current = sc;
    sc.loadRoom(gsRef.current.won ? "hall" : gsRef.current.room, gsRef.current, { enter: false });
    sc.setMode("menu");
    const tset = timers.current;
    return () => {
      alive.current = false;
      tset.forEach(clearTimeout);
      tset.clear();
      sc.dispose();
      sceneRef.current = null;
    };
  }, []);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ flow */
  const enterRoom = useCallback(
    (room, s, first) => {
      setFade(true);
      busy.current = true;
      audio.cue("door");
      later(() => {
        sceneRef.current?.loadRoom(room, s);
        setFade(false);
        busy.current = false;
        setTitle({ id: Date.now(), name: ROOMS[room].name, n: ROOM_ORDER.indexOf(room) + 1 });
        later(() => setTitle(null), 2600);
        if (first) later(() => narrate(ROOMS[room].intro), 500);
      }, 520);
    },
    [later, narrate],
  );
  const markVisited = (s, room) => {
    if (s.f["seen_" + room]) return [s, false];
    return [{ ...s, f: { ...s.f, ["seen_" + room]: 1 } }, true];
  };

  const startGame = useCallback(
    (fresh) => {
      audio.unlock();
      audio.ambient(0.9);
      audio.cue("ui");
      let s = fresh ? newState() : loadSave() || newState();
      const [s2, first] = markVisited(s, s.room);
      s = s2;
      commit(s);
      setSelected(null);
      setNarration(null);
      setModal(null);
      setPaused(false);
      setWhite(false);
      setHasSave(true);
      setScreen("play");
      enterRoom(s.room, s, first || fresh);
    },
    [commit, enterRoom, setModal, setPaused, setScreen],
  );

  const toMenu = useCallback(() => {
    setModal(null);
    setPaused(false);
    setNarration(null);
    setSelected(null);
    audio.ambient(0.5);
    setHasSave(!gsRef.current.won);
    setScreen("menu");
  }, [setModal, setPaused, setScreen]);

  const doTravel = useCallback(
    (room) => {
      const { state, result } = travelTo(gsRef.current, room);
      if (!result.ok) return;
      const [s, first] = markVisited(state, room);
      commit(s);
      setModal(null);
      enterRoom(room, s, first);
    },
    [commit, enterRoom, setModal],
  );

  const win = useCallback(() => {
    const s = gsRef.current;
    audio.cue("escape");
    audio.ambient(0);
    sceneRef.current?.playEscape();
    const rec = loadRecords();
    const next = {
      escapes: rec.escapes + 1,
      bestTime: rec.bestTime ? Math.min(rec.bestTime, s.time) : s.time,
      fewestHints: rec.fewestHints == null ? s.hintsUsed : Math.min(rec.fewestHints, s.hintsUsed),
    };
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setRecords(next);
    later(() => setWhite(true), 2600);
    later(() => {
      setScreen("victory");
      setHasSave(false);
    }, 4200);
  }, [later, setScreen]);

  /** Click on a hotspot, with the selected item if any. */
  const activate = useCallback(
    (id) => {
      const item = selected;
      const { state, result } = interact(gsRef.current, id, item);
      setSelected(null);
      if (!result.ok) {
        if (result.sfx) audio.cue(result.sfx);
        if (result.say) narrate(result.say);
        return;
      }
      commit(state);
      if (result.sfx) audio.cue(result.sfx);
      gotItems(result.got);
      if (result.travel) {
        if (result.say) narrate(result.say);
        const [s, first] = markVisited(state, result.travel);
        commit(s);
        later(() => enterRoom(result.travel, s, first), result.say ? 900 : 0);
        return;
      }
      if (result.puzzle) {
        sceneRef.current?.focus(id);
        setNarration(null);
        if (result.say) narrate(result.say, id);
        if (result.puzzle === "mirror" && result.sfx) audio.cue("reveal");
        later(() => setModal({ type: "puzzle", id: result.puzzle, hs: id }), result.say ? 1400 : 420);
        return;
      }
      narrate(result.say, id);
    },
    [commit, enterRoom, gotItems, later, narrate, selected, setModal],
  );

  const submitPuzzle = useCallback(
    (id, answer, opts = {}) => {
      const { state, result } = solve(gsRef.current, id, answer);
      if (!result.ok) {
        if (!opts.quiet) {
          audio.cue("wrong");
          setShakeState(true);
          later(() => setShakeState(false), 450);
        }
        return false;
      }
      commit(state);
      audio.cue(id === "circuit" ? "power" : id === "musicbox" ? "musicbox" : "solve");
      if (id === "exit") {
        setModal(null);
        win();
        return true;
      }
      later(() => {
        setModal(null);
        narrate(result.say, modalRef.current?.hs || null);
        gotItems(result.got);
      }, 700);
      setModal({ ...modalRef.current, solved: true });
      return true;
    },
    [commit, gotItems, later, narrate, setModal, win],
  );

  const clickItem = useCallback(
    (id) => {
      audio.cue("ui");
      if (selected && selected !== id) {
        const { state, result } = combine(gsRef.current, selected, id);
        if (result.ok) {
          commit(state);
          audio.cue("pickup");
          narrate(result.say);
          gotItems(result.got);
          setSelected(null);
          return;
        }
      }
      setSelected((s) => (s === id ? null : id));
    },
    [commit, gotItems, narrate, selected],
  );

  const hint = useCallback(() => {
    audio.cue("ui");
    const { state, hint: h } = takeHint(gsRef.current);
    if (!h) return;
    commit(state);
    setModal({ type: "hint", hint: h });
  }, [commit, setModal]);

  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    setPaused(!pausedRef.current);
  }, [setPaused]);

  /* ------------------------------------------------------------ timer */
  useEffect(() => {
    if (screen !== "play" || paused) return undefined;
    const iv = setInterval(() => {
      const s = gsRef.current;
      if (s.won) return;
      const n = { ...s, time: s.time + 1 };
      gsRef.current = n;
      setGs(n);
      if (n.time % 5 === 0) writeSave(n);
    }, 1000);
    return () => clearInterval(iv);
  }, [screen, paused]);

  /* ------------------------------------------------------------ keys */
  useEffect(() => {
    const down = (e) => {
      if (screenRef.current !== "play") return;
      const k = e.key.toLowerCase();
      if (k === "escape" || k === "p") {
        e.preventDefault();
        if (modalRef.current && k === "escape") setModal(null);
        else togglePause();
        return;
      }
      if (pausedRef.current || (modalRef.current && modalRef.current.type === "puzzle")) return;
      if (k === " ") {
        e.preventDefault();
        setShowMarkers(true);
      } else if (k === "h") hint();
      else if (k === "j") setModal(modalRef.current?.type === "journal" ? null : { type: "journal" });
      else if (k === "m") setModal(modalRef.current?.type === "map" ? null : { type: "map" });
    };
    const up = (e) => e.key === " " && setShowMarkers(false);
    const blur = () => setShowMarkers(false);
    const vis = () => document.hidden && screenRef.current === "play" && setPaused(true);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [hint, setModal, setPaused, togglePause]);

  // hotspot markers follow the camera while shown
  useEffect(() => {
    if (!showMarkers || screen !== "play") {
      setMarkers(null);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      setMarkers(sceneRef.current?.hotspotScreens() || []);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [showMarkers, screen]);

  /* ------------------------------------------------------------ pointer */
  const drag = useRef(null);
  const canAct = () => screenRef.current === "play" && !pausedRef.current && !modalRef.current && !busy.current;
  const onMove = (e) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const r = stageRef.current.getBoundingClientRect();
    if (e.pointerType === "mouse") {
      if (!modalRef.current) sc.look((((e.clientX - r.left) / r.width) * 2 - 1) * 0.8, -(((e.clientY - r.top) / r.height) * 2 - 1) * 0.5);
    } else if (drag.current) {
      const d = drag.current;
      sc.nudgeLook(-(e.clientX - d.x) / r.width * 1.6, (e.clientY - d.y) / r.height * 1.2);
      d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
    }
    if (!canAct() || e.pointerType !== "mouse") return;
    const id = sc.pick(e.clientX, e.clientY);
    sc.hover(id);
    setHoverName(id ? { name: HOTSPOTS[id].name, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };
  const onDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!canAct() || (d && d.moved > 10)) return;
    audio.unlock();
    const id = sceneRef.current?.pick(e.clientX, e.clientY);
    if (id) {
      sceneRef.current.hover(null);
      setHoverName(null);
      activate(id);
    } else if (selected) setSelected(null);
    else if (narration) setNarration(null);
  };

  /* ------------------------------------------------------------ GamePlayer */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current !== "menu") startGame(true);
  }, [restartSignal, startGame]);

  useEffect(() => {
    if (!TEST) return undefined;
    window.__hme = {
      get state() {
        return gsRef.current;
      },
      interact: (id, item) => {
        setSelected(item || null);
        const { state, result } = interact(gsRef.current, id, item);
        commit(state);
        if (result.travel) sceneRef.current?.loadRoom(result.travel, state);
        return result;
      },
      solve: (id, a) => submitPuzzle(id, a),
      goto: (room) => {
        const s = { ...gsRef.current, room, f: { ...gsRef.current.f, ["door_" + room]: 1 } };
        commit(s);
        sceneRef.current?.loadRoom(room, s);
      },
      set: (patch) => commit({ ...gsRef.current, ...patch }),
      start: (fresh = true) => startGame(fresh),
      focus: (id) => sceneRef.current?.focus(id),
      screens: () => sceneRef.current?.hotspotScreens(),
      pickAt: (x, y) => {
        const r = stageRef.current.getBoundingClientRect();
        return sceneRef.current?.pick(r.left + x, r.top + y);
      },
      open: (id) => setModal({ type: "puzzle", id, hs: null }),
    };
    return () => {
      delete window.__hme;
    };
  }, [commit, setModal, startGame, submitPuzzle]);

  /* ------------------------------------------------------------ render */
  const room = ROOMS[gs.room];
  const Puzzle = modal?.type === "puzzle" ? PUZZLE_UI[modal.id] : null;
  const roomClues = modal?.type === "puzzle" ? gs.clues.filter((c) => CLUES[c].room === gs.room || (modal.id === "altar" && c === "crest") || (modal.id === "exit" && c === "mirrorMsg") || (modal.id === "piano" && c === "sheet")) : [];
  const stop = (e) => e.stopPropagation();
  const unlocked = unlockedRooms(gs);
  const puzzleBlocked = modal?.type === "puzzle" && !modal.solved && Boolean(gs.solved[modal.id]);

  return (
    <div className={`hme${screen === "play" ? " is-playing" : ""}${selected ? " has-item" : ""}`}>
      <div ref={stageRef} className={`hme-stage${hoverName ? " is-hover" : ""}`} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => (setHoverName(null), sceneRef.current?.hover(null))} />
      <div className="hme-vignette" />
      <div className={`hme-fade${fade ? " is-on" : ""}`} />
      <div className={`hme-white${white ? " is-on" : ""}`} />

      {screen === "play" && (
        <>
          {/* top HUD */}
          <div className="hme-top" onPointerUp={stop}>
            <div className="hme-obj">
              <span className="hme-obj__room">{ROOM_ORDER.indexOf(gs.room) + 1}/10 · {room.name}</span>
              <span className="hme-obj__text">{objective(gs)}</span>
            </div>
            <div className="hme-tools">
              <span className="hme-time" title="Time in the mansion">{fmtTime(gs.time)}</span>
              <button type="button" className="hme-tool" onClick={hint} title="Hint (H)">💡<span>Hint</span></button>
              <button type="button" className="hme-tool" onClick={() => (audio.cue("ui"), setModal({ type: "journal" }))} title="Journal (J)">📖<span>Journal</span></button>
              <button type="button" className="hme-tool" onClick={() => (audio.cue("ui"), setModal({ type: "map" }))} title="Map (M)">🗺️<span>Map</span></button>
              <button type="button" className={`hme-tool${showMarkers ? " is-on" : ""}`} onClick={() => setShowMarkers((v) => !v)} title="Show hotspots (hold Space)">👁<span>Reveal</span></button>
              <button type="button" className="hme-tool" onClick={togglePause} title="Pause (Esc)">❚❚</button>
            </div>
          </div>

          {title && (
            <div key={title.id} className="hme-title">
              <small>Room {title.n} of 10</small>
              {title.name}
            </div>
          )}

          {hoverName && !modal && (
            <div className="hme-hovername" style={{ left: hoverName.x, top: hoverName.y }}>
              {selected ? `Use ${ITEMS[selected].name} on ${hoverName.name}` : hoverName.name}
            </div>
          )}
          {markers && markers.map((m) => (
            <div key={m.id} className="hme-marker" style={{ left: m.x, top: m.y }}>
              <i />
              <span>{m.name}</span>
            </div>
          ))}

          {narration && (
            <div key={narration.id} className="hme-narration" onPointerUp={(e) => (stop(e), setNarration(null), sceneRef.current?.focus(null))}>
              {narration.text}
            </div>
          )}
          {toast && <div key={toast.id} className="hme-toast">{toast.text}</div>}

          {/* inventory */}
          <div className="hme-inv" onPointerUp={stop}>
            <div className="hme-inv__slots">
              {gs.inv.length === 0 && <span className="hme-inv__empty">Your pockets are empty.</span>}
              {gs.inv.map((id) => (
                <button
                  type="button"
                  key={id}
                  className={`hme-item${selected === id ? " is-sel" : ""}${newItems.includes(id) ? " is-new" : ""}`}
                  style={{ "--tint": ITEMS[id].tint }}
                  onClick={() => clickItem(id)}
                  onDoubleClick={() => setModal({ type: "inspect", item: id })}
                  title={ITEMS[id].name}
                >
                  <span className="hme-item__icon">{ITEMS[id].icon}</span>
                  <span className="hme-item__name">{ITEMS[id].name}</span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="hme-inv__sel">
                <span>
                  <b>{ITEMS[selected].name}</b> — click an object to use it, or another item to combine.
                </span>
                <button type="button" className="hme-btn hme-btn--small" onClick={() => setModal({ type: "inspect", item: selected })}>🔍 Inspect</button>
              </div>
            )}
          </div>

          {/* modals */}
          {modal && modal.type !== "help" && (
            <div className="hme-modal" onPointerUp={stop} onPointerDown={stop} onPointerMove={stop} onClick={() => modal.type !== "puzzle" && setModal(null)}>
              <div className={`hme-card hme-card--${modal.type}${modal.type === "puzzle" ? ` hme-card--${modal.id}` : ""}${modal.solved ? " is-solved" : ""}${shake ? " is-shake" : ""}`} onClick={stop}>
                <button type="button" className="hme-close" onClick={() => setModal(null)} aria-label="Close">×</button>
                {Puzzle && (
                  <>
                    <h3>{PUZZLES[modal.id].title}</h3>
                    {puzzleBlocked ? (
                      <p className="hme-pz__lead">Nothing more to do here right now.</p>
                    ) : (
                      <Puzzle key={modal.id} state={gs} inv={gs.inv} submit={(a, o) => submitPuzzle(modal.id, a, o)} sfx={(k) => audio.cue(k)} note={(n) => audio.note(n)} />
                    )}
                    {roomClues.length > 0 && (
                      <details className="hme-notes">
                        <summary>Your notes ({roomClues.length})</summary>
                        {roomClues.map((c) => (
                          <p key={c}>
                            <b>{CLUES[c].title}:</b> {CLUES[c].text}
                          </p>
                        ))}
                      </details>
                    )}
                    {modal.solved && <div className="hme-solved">✦ Solved ✦</div>}
                  </>
                )}
                {modal.type === "inspect" && (
                  <div className="hme-inspect">
                    <div className="hme-inspect__icon" style={{ "--tint": ITEMS[modal.item].tint }}>{ITEMS[modal.item].icon}</div>
                    <h3>{ITEMS[modal.item].name}</h3>
                    <p>{ITEMS[modal.item].desc}</p>
                  </div>
                )}
                {modal.type === "journal" && (
                  <div className="hme-journal">
                    <h3>Journal</h3>
                    {gs.clues.length === 0 && <p className="hme-pz__lead">You haven't found any clues yet. Inspect notes, plaques and paintings.</p>}
                    {ROOM_ORDER.filter((r) => gs.clues.some((c) => CLUES[c].room === r)).map((r) => (
                      <section key={r}>
                        <h4>{ROOMS[r].name}</h4>
                        {gs.clues.filter((c) => CLUES[c].room === r).map((c) => (
                          <p key={c}>
                            <b>{CLUES[c].title}</b>
                            {CLUES[c].text}
                          </p>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
                {modal.type === "map" && (
                  <div className="hme-map">
                    <h3>Ashcroft Hall</h3>
                    <div className="hme-map__grid">
                      {ROOM_ORDER.map((r, i) => {
                        const open = unlocked.includes(r);
                        return (
                          <button type="button" key={r} disabled={!open || r === gs.room} className={`hme-map__room${r === gs.room ? " is-here" : ""}${open ? "" : " is-locked"}`} onClick={() => doTravel(r)}>
                            <small>{i + 1}</small>
                            {open ? ROOMS[r].name : "Locked"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="hme-pz__note">Travel to any room you have unlocked.</p>
                  </div>
                )}
                {modal.type === "hint" && (
                  <div className="hme-hint">
                    <h3>Hint</h3>
                    {modal.hint.level === 0 ? (
                      <p>{modal.hint.text}</p>
                    ) : (
                      <>
                        {modal.hint.all.map((t, i) => (
                          <p key={i} className={i === modal.hint.all.length - 1 ? "is-new" : "is-old"}>
                            <small>Hint {i + 1}</small>
                            {t}
                          </p>
                        ))}
                        {modal.hint.level < modal.hint.max ? (
                          <button type="button" className="hme-btn" onClick={hint}>Stronger hint</button>
                        ) : (
                          <p className="hme-pz__note">That's the full solution for this step.</p>
                        )}
                      </>
                    )}
                    {modal.hint.level === 0 && unlocked.length > 1 && <button type="button" className="hme-btn" onClick={() => setModal({ type: "map" })}>Open map</button>}
                  </div>
                )}
              </div>
            </div>
          )}

          {paused && (
            <div className="hme-overlay" onPointerUp={stop}>
              <div className="hme-card hme-card--menu">
                <h2>Paused</h2>
                <p className="hme-pz__lead">
                  {room.name} · {fmtTime(gs.time)} · {gs.hintsUsed} hint{gs.hintsUsed === 1 ? "" : "s"} used
                </p>
                <button type="button" className="hme-btn hme-btn--gold" onClick={() => setPaused(false)}>Resume</button>
                <button type="button" className="hme-btn" onClick={() => {
                    setPaused(false);
                    setModal({ type: "help" });
                  }}>How to play</button>
                <button type="button" className="hme-btn" onClick={toMenu}>Save &amp; quit to menu</button>
              </div>
            </div>
          )}
        </>
      )}

      {(screen === "menu" || modal?.type === "help") && (
        <div className={`hme-overlay${screen === "menu" ? " hme-overlay--menu" : ""}`} onPointerUp={stop}>
          {modal?.type === "help" || (screen === "menu" && modal?.type === "howto") ? (
            <div className="hme-card hme-card--help">
              <h2>How to play</h2>
              <ul>
                <li><b>Look</b> — move the mouse (drag on touch).</li>
                <li><b>Interact</b> — click glowing objects to inspect them, open puzzles and pick things up.</li>
                <li><b>Use items</b> — click an item in your inventory, then click an object.</li>
                <li><b>Combine</b> — select one item, then click another item.</li>
                <li><b>Reveal</b> — hold Space (or tap 👁) to show every interactive object.</li>
                <li><b>Journal</b> keeps every clue you read; the <b>Map</b> lets you revisit unlocked rooms.</li>
                <li><b>Hints</b> escalate from a nudge to the full answer. Progress saves automatically.</li>
              </ul>
              <button type="button" className="hme-btn hme-btn--gold" onClick={() => setModal(null)}>Got it</button>
            </div>
          ) : (
            screen === "menu" && (
              <div className="hme-menu">
                <p className="hme-menu__kicker">Ashcroft Hall · 1887</p>
                <h1>
                  Haunted Mansion
                  <span>Escape</span>
                </h1>
                <p className="hme-menu__tag">EXPLORE • SOLVE • ESCAPE</p>
                <p className="hme-menu__about">Ten rooms. Ten secrets. One way out. Follow the clues through the abandoned Ashcroft mansion before the house claims another visitor.</p>
                <div className="hme-menu__btns">
                  {hasSave && (
                    <button type="button" className="hme-btn hme-btn--gold" onClick={() => startGame(false)}>
                      Continue
                      <small>{ROOMS[gsRef.current.room]?.name} · {fmtTime(gsRef.current.time)}</small>
                    </button>
                  )}
                  <button type="button" className={`hme-btn${hasSave ? "" : " hme-btn--gold"}`} onClick={() => startGame(true)}>New Game</button>
                  <button type="button" className="hme-btn" onClick={() => setModal({ type: "howto" })}>How to Play</button>
                </div>
                {records.escapes > 0 && (
                  <p className="hme-menu__rec">
                    Escapes: {records.escapes} · Best time {fmtTime(records.bestTime)} · Fewest hints {records.fewestHints}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {screen === "victory" && (
        <div className="hme-overlay hme-overlay--victory" onPointerUp={stop}>
          <div className="hme-victory">
            <p className="hme-menu__kicker">Dawn breaks over Ashcroft Hall</p>
            <h1>You Escaped</h1>
            <p className="hme-victory__story">You spoke her name, and Clara Ashcroft was finally let go. The doors of the mansion open one by one behind you — and for the first time in a century, the house is silent.</p>
            <div className="hme-stars">
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < (gs.hintsUsed === 0 ? 3 : gs.hintsUsed <= 6 ? 2 : 1) ? "is-on" : ""} style={{ animationDelay: `${0.4 + i * 0.25}s` }}>★</span>
              ))}
            </div>
            <div className="hme-stats">
              <div><b>{fmtTime(gs.time)}</b><small>Time</small></div>
              <div><b>10/10</b><small>Rooms</small></div>
              <div><b>{gs.clues.length}/{Object.keys(CLUES).length}</b><small>Clues found</small></div>
              <div><b>{gs.hintsUsed}</b><small>Hints used</small></div>
            </div>
            <div className="hme-menu__btns">
              <button type="button" className="hme-btn hme-btn--gold" onClick={() => startGame(true)}>Play again</button>
              <button type="button" className="hme-btn" onClick={() => (setWhite(false), sceneRef.current?.loadRoom("hall", newState(), { enter: false }), toMenu())}>Main menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
