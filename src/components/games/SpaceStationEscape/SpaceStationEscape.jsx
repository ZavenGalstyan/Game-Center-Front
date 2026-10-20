/**
 * Space Station Escape — first-person sci-fi escape room (Escape Room).
 *
 * Six connected sectors of Helios Station, each a plain Three.js room view
 * (scene.js) with clickable hotspots. All rules live in data.js and are
 * judged by the pure engine (engine.js): inventory, item use, sealed doors,
 * puzzle answers, oxygen, escalating hints and the save format. React draws
 * the HUD (oxygen, objective, inventory), journal, map and the puzzle panels
 * (Puzzles.jsx). Progress is saved to localStorage after every action.
 *
 * Oxygen drains only during active exploration (not on menus, panels or
 * pause). Restoring Life Support refills it and slows the drain; running out
 * offers a retry that keeps all progress.
 *
 * Controls: move the pointer to look (drag on touch) · click objects ·
 * select an inventory item, then click an object to use it · hold Space to
 * reveal hotspots · H hint · J journal · M map · Esc pause.
 *
 * GamePlayer: `restartSignal` starts a new game (ignored on the main menu),
 * `muted` silences audio. DEV hook: `?ssetest=1` exposes window.__sse.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./SpaceStationEscape.css";
import { createScene } from "./scene.js";
import { audio } from "./audio.js";
import { ITEMS, CLUES, ROOMS, ROOM_ORDER, PUZZLES, HOTSPOTS, O2 } from "./data.js";
import { newState, interact, travel as travelTo, consume, solve, takeHint, objective, serialize, deserialize, unlockedRooms, tickO2, retry, drainRate } from "./engine.js";
import { PUZZLE_UI } from "./Puzzles.jsx";

const STORE_KEY = "space-station-escape-progress";
const RECORD_KEY = "space-station-escape-records";
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ssetest");

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
    return JSON.parse(localStorage.getItem(RECORD_KEY) || "null") || { escapes: 0, bestTime: 0 };
  } catch {
    return { escapes: 0, bestTime: 0 };
  }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hasProgress = (s) => Boolean(s && !s.won && (s.inv.length || Object.keys(s.f).length));

export default function SpaceStationEscape({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const gsRef = useRef(null);
  if (!gsRef.current) gsRef.current = loadSave() || newState();

  const [gs, setGs] = useState(gsRef.current);
  const [screen, setScreenState] = useState("menu"); // menu | play | victory
  const [hasSave, setHasSave] = useState(() => hasProgress(loadSave()));
  const [records, setRecords] = useState(loadRecords);
  const [paused, setPausedState] = useState(false);
  const [modal, setModalState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [narration, setNarration] = useState(null);
  const [toast, setToast] = useState(null);
  const [hoverName, setHoverName] = useState(null);
  const [markers, setMarkers] = useState(null);
  const [showMarkers, setShowMarkers] = useState(false);
  const [fade, setFade] = useState(false);
  const [flash, setFlash] = useState(false);
  const [title, setTitle] = useState(null);
  const [shake, setShake] = useState(false);
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
    if (!m || m.type !== "puzzle") sceneRef.current?.focus(null);
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
    (text) => {
      const id = Date.now() + Math.random();
      setToast({ id, text });
      later(() => setToast((t) => (t && t.id === id ? null : t)), 2600);
    },
    [later],
  );
  const gotItems = useCallback(
    (ids) => {
      if (!ids?.length) return;
      showToast(`Acquired: ${ids.map((i) => ITEMS[i].name).join(", ")}`);
      setNewItems(ids);
      later(() => setNewItems([]), 1800);
    },
    [later, showToast],
  );

  /* ------------------------------------------------------------ scene */
  useEffect(() => {
    alive.current = true;
    const sc = createScene(stageRef.current);
    sceneRef.current = sc;
    sc.loadRoom(gsRef.current.won ? "command" : gsRef.current.room, gsRef.current, { enter: false });
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
  // klaxon while the station is on emergency power
  useEffect(() => {
    audio.alarm(screen === "play" && !paused && !gs.f.power);
    return () => audio.alarm(false);
  }, [screen, paused, gs.f.power]);

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
  const markVisited = (s, room) => (s.f["seen_" + room] ? [s, false] : [{ ...s, f: { ...s.f, ["seen_" + room]: 1 } }, true]);

  const startGame = useCallback(
    (fresh) => {
      audio.unlock();
      audio.ambient(0.9);
      audio.cue("ui");
      let s = fresh ? newState() : loadSave() || newState();
      if (s.won) s = newState();
      const [s2, first] = markVisited(s, s.room);
      commit(s2);
      setSelected(null);
      setNarration(null);
      setModal(null);
      setPaused(false);
      setFlash(false);
      setHasSave(true);
      setScreen("play");
      enterRoom(s2.room, s2, first || fresh);
    },
    [commit, enterRoom, setModal, setPaused, setScreen],
  );
  const toMenu = useCallback(() => {
    setModal(null);
    setPaused(false);
    setNarration(null);
    setSelected(null);
    audio.ambient(0.4);
    setHasSave(hasProgress(gsRef.current));
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
    audio.cue("launch");
    audio.ambient(0);
    sceneRef.current?.playEscape();
    const rec = loadRecords();
    const next = { escapes: rec.escapes + 1, bestTime: rec.bestTime ? Math.min(rec.bestTime, s.time) : s.time };
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setRecords(next);
    later(() => setFlash(true), 3200);
    later(() => {
      setScreen("victory");
      setHasSave(false);
    }, 4600);
  }, [later, setScreen]);

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
        later(() => setModal({ type: "puzzle", id: result.puzzle, hs: id }), result.say ? 1400 : 420);
        return;
      }
      narrate(result.say, id);
    },
    [commit, enterRoom, gotItems, later, narrate, selected, setModal],
  );

  const submitPuzzle = useCallback(
    (id, answer) => {
      const { state, result } = solve(gsRef.current, id, answer);
      if (!result.ok) {
        audio.cue("denied");
        setShake(true);
        later(() => setShake(false), 450);
        return false;
      }
      commit(state);
      audio.cue(id === "circuit" ? "power" : id === "pressure" ? "hiss" : "solve");
      if (id === "launch") {
        setModal({ ...modalRef.current, solved: true });
        later(() => {
          setModal(null);
          narrate(result.say);
          win();
        }, 900);
        return true;
      }
      setModal({ ...modalRef.current, solved: true });
      later(() => {
        const hs = modalRef.current?.hs || null;
        setModal(null);
        narrate(result.say, hs);
        gotItems(result.got);
      }, 800);
      return true;
    },
    [commit, gotItems, later, narrate, setModal, win],
  );

  const clickItem = useCallback((id) => {
    audio.cue("ui");
    setSelected((s) => (s === id ? null : id));
  }, []);
  const useSelected = useCallback(() => {
    const { state, result } = consume(gsRef.current, selected);
    audio.cue(result.sfx);
    if (result.ok) {
      commit(state);
      setSelected(null);
    }
    narrate(result.say);
  }, [commit, narrate, selected]);

  const hint = useCallback(() => {
    audio.cue("ui");
    const { state, hint: h } = takeHint(gsRef.current);
    if (!h) return;
    commit(state);
    setModal({ type: "hint", hint: h });
  }, [commit, setModal]);
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play" || gsRef.current.o2 <= 0) return;
    setPaused(!pausedRef.current);
  }, [setPaused]);
  const doRetry = useCallback(() => {
    audio.cue("hiss");
    commit(retry(gsRef.current));
    narrate("You jam a reserve hose into your suit. Oxygen restored — keep moving. Your progress is intact.");
  }, [commit, narrate]);

  /* ------------------------------------------------- clock + oxygen */
  // the mission clock runs during panels too; oxygen only drains while exploring
  const active = screen === "play" && !paused && gs.o2 > 0 && !gs.won;
  useEffect(() => {
    if (!active) return undefined;
    const iv = setInterval(() => {
      if (busy.current) return;
      const s = gsRef.current;
      const timed = { ...s, time: s.time + 1 };
      const n = modalRef.current ? timed : tickO2(timed, 1);
      gsRef.current = n;
      setGs(n);
      if (n.o2 <= 0) {
        audio.cue("dead");
        setSelected(null);
        writeSave(n);
      } else if (n.o2 < O2.low && Math.floor(n.time) % 6 === 0) audio.cue("warn");
      if (n.time % 5 === 0) writeSave(n);
    }, 1000);
    return () => clearInterval(iv);
  }, [active]);

  /* ------------------------------------------------------------ keys */
  useEffect(() => {
    const down = (e) => {
      if (screenRef.current !== "play") return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        e.preventDefault();
        if (modalRef.current) setModal(null);
        else togglePause();
        return;
      }
      if (pausedRef.current || modalRef.current?.type === "puzzle") return;
      if (k === "p") togglePause();
      else if (k === " ") {
        e.preventDefault();
        setShowMarkers(true);
      } else if (k === "h") hint();
      else if (k === "j") setModal(modalRef.current?.type === "journal" ? null : { type: "journal" });
      else if (k === "m") setModal(modalRef.current?.type === "map" ? null : { type: "map" });
    };
    const up = (e) => e.key === " " && setShowMarkers(false);
    const blur = () => setShowMarkers(false);
    const vis = () => document.hidden && screenRef.current === "play" && gsRef.current.o2 > 0 && setPaused(true);
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
  const canAct = () => screenRef.current === "play" && !pausedRef.current && !modalRef.current && !busy.current && gsRef.current.o2 > 0;
  const onMove = (e) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const r = stageRef.current.getBoundingClientRect();
    if (e.pointerType === "mouse") {
      if (!modalRef.current) sc.look((((e.clientX - r.left) / r.width) * 2 - 1) * 0.8, -(((e.clientY - r.top) / r.height) * 2 - 1) * 0.5);
    } else if (drag.current) {
      const d = drag.current;
      sc.nudgeLook((-(e.clientX - d.x) / r.width) * 1.6, ((e.clientY - d.y) / r.height) * 1.2);
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
    window.__sse = {
      get state() {
        return gsRef.current;
      },
      interact: (id, item) => {
        const { state, result } = interact(gsRef.current, id, item);
        commit(state);
        if (result.travel) sceneRef.current?.loadRoom(result.travel, state);
        return result;
      },
      goto: (room) => {
        const s = { ...gsRef.current, room, f: { ...gsRef.current.f, ["door_" + room]: 1 } };
        commit(s);
        sceneRef.current?.loadRoom(room, s);
      },
      set: (patch) => commit({ ...gsRef.current, ...patch }),
      start: (fresh = true) => startGame(fresh),
      open: (id) => setModal({ type: "puzzle", id, hs: null }),
      screens: () => sceneRef.current?.hotspotScreens(),
      pickAt: (x, y) => {
        const r = stageRef.current.getBoundingClientRect();
        return sceneRef.current?.pick(r.left + x, r.top + y);
      },
    };
    return () => {
      delete window.__sse;
    };
  }, [commit, setModal, startGame]);

  /* ------------------------------------------------------------ render */
  const room = ROOMS[gs.room];
  const Puzzle = modal?.type === "puzzle" ? PUZZLE_UI[modal.id] : null;
  const notes = modal?.type === "puzzle" ? gs.clues.filter((c) => CLUES[c].room === gs.room || (modal.id === "launch" && /Log|recorder|launch/i.test(c))) : [];
  const stop = (e) => e.stopPropagation();
  const unlocked = unlockedRooms(gs);
  const o2 = Math.max(0, gs.o2);
  const o2Low = o2 < O2.low;
  const minsLeft = Math.ceil(o2 / drainRate(gs) / 60);
  const puzzleDone = modal?.type === "puzzle" && !modal.solved && Boolean(gs.solved[modal.id]);
  const keyClick = () => audio.key();

  return (
    <div className={`sse${screen === "play" ? " is-playing" : ""}${selected ? " has-item" : ""}${screen === "play" && o2Low ? " is-low" : ""}${gs.f.power ? "" : " is-emergency"}`}>
      <div ref={stageRef} className={`sse-stage${hoverName ? " is-hover" : ""}`} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => (setHoverName(null), sceneRef.current?.hover(null))} />
      <div className="sse-vignette" />
      <div className="sse-scan" />
      <div className={`sse-fade${fade ? " is-on" : ""}`} />
      <div className={`sse-flash${flash ? " is-on" : ""}`} />

      {screen === "play" && (
        <>
          <div className="sse-top" onPointerUp={stop}>
            <div className="sse-left">
              <div className="sse-obj">
                <span className="sse-obj__room">SECTOR {ROOM_ORDER.indexOf(gs.room) + 1}/6 · {room.name}</span>
                <span className="sse-obj__text">{objective(gs)}</span>
              </div>
              <div className={`sse-o2${o2Low ? " is-low" : ""}${gs.f.lifeSupport ? " is-restored" : ""}`} title={`About ${minsLeft} min of oxygen left`}>
                <span className="sse-o2__label">O₂</span>
                <div className="sse-o2__bar">
                  <i style={{ width: `${o2}%` }} />
                </div>
                <span className="sse-o2__val">{Math.ceil(o2)}%</span>
                <small>{gs.f.lifeSupport ? "LIFE SUPPORT OK" : modal || paused ? "PAUSED" : `~${minsLeft} MIN`}</small>
              </div>
            </div>
            <div className="sse-tools">
              <span className="sse-time" title="Mission time">{fmtTime(gs.time)}</span>
              <button type="button" className="sse-tool" onClick={hint} title="Hint (H)">💡<span>Hint</span></button>
              <button type="button" className="sse-tool" onClick={() => (audio.cue("ui"), setModal({ type: "journal" }))} title="Logs (J)">📟<span>Logs</span></button>
              <button type="button" className="sse-tool" onClick={() => (audio.cue("ui"), setModal({ type: "map" }))} title="Map (M)">🛰️<span>Map</span></button>
              <button type="button" className={`sse-tool${showMarkers ? " is-on" : ""}`} onClick={() => setShowMarkers((v) => !v)} title="Scan for interactive objects (hold Space)">◎<span>Scan</span></button>
              <button type="button" className="sse-tool" onClick={togglePause} title="Pause (Esc)">❚❚</button>
            </div>
          </div>

          {title && (
            <div key={title.id} className="sse-title">
              <small>Sector {title.n} of 6</small>
              {title.name}
            </div>
          )}
          {hoverName && !modal && (
            <div className="sse-hovername" style={{ left: hoverName.x, top: hoverName.y }}>
              {selected ? `Use ${ITEMS[selected].name} on ${hoverName.name}` : hoverName.name}
            </div>
          )}
          {markers &&
            markers.map((m) => (
              <div key={m.id} className="sse-marker" style={{ left: m.x, top: m.y }}>
                <i />
                <span>{m.name}</span>
              </div>
            ))}
          {narration && (
            <div key={narration.id} className="sse-narration" onPointerUp={(e) => (stop(e), setNarration(null), sceneRef.current?.focus(null))}>
              {narration.text}
            </div>
          )}
          {toast && <div key={toast.id} className="sse-toast">{toast.text}</div>}

          <div className="sse-inv" onPointerUp={stop}>
            {selected && (
              <div className="sse-inv__sel">
                <span>
                  <b>{ITEMS[selected].name}</b> — click an object to use it.
                </span>
                {ITEMS[selected].o2 && (
                  <button type="button" className="sse-btn sse-btn--small sse-btn--go" onClick={useSelected}>Use now</button>
                )}
                <button type="button" className="sse-btn sse-btn--small" onClick={() => setModal({ type: "inspect", item: selected })}>Inspect</button>
              </div>
            )}
            <div className="sse-inv__slots">
              {gs.inv.length === 0 && <span className="sse-inv__empty">Inventory empty</span>}
              {gs.inv.map((id) => (
                <button type="button" key={id} className={`sse-item${selected === id ? " is-sel" : ""}${newItems.includes(id) ? " is-new" : ""}`} style={{ "--tint": ITEMS[id].tint }} onClick={() => clickItem(id)} onDoubleClick={() => setModal({ type: "inspect", item: id })} title={ITEMS[id].name}>
                  <span className="sse-item__icon">{ITEMS[id].icon}</span>
                  <span className="sse-item__name">{ITEMS[id].name}</span>
                </button>
              ))}
            </div>
          </div>

          {modal && modal.type !== "help" && (
            <div className="sse-modal" onPointerUp={stop} onPointerDown={stop} onPointerMove={stop} onClick={() => modal.type !== "puzzle" && setModal(null)}>
              <div className={`sse-card sse-card--${modal.type}${modal.type === "puzzle" ? ` sse-card--${modal.id}` : ""}${modal.solved ? " is-solved" : ""}${shake ? " is-shake" : ""}`} onClick={stop}>
                <button type="button" className="sse-close" onClick={() => setModal(null)} aria-label="Close">×</button>
                {Puzzle && (
                  <>
                    <h3>{PUZZLES[modal.id].title}</h3>
                    {puzzleDone ? <p className="sse-pz__lead">System already restored.</p> : <Puzzle key={modal.id} state={gs} submit={(a) => submitPuzzle(modal.id, a)} sfx={(k) => audio.cue(k)} keyClick={keyClick} />}
                    {notes.length > 0 && (
                      <details className="sse-notes">
                        <summary>Your logs ({notes.length})</summary>
                        {notes.map((c) => (
                          <p key={c}>
                            <b>{CLUES[c].title}:</b> {CLUES[c].text}
                          </p>
                        ))}
                      </details>
                    )}
                    {modal.solved && <div className="sse-solved">SYSTEM RESTORED</div>}
                  </>
                )}
                {modal.type === "inspect" && (
                  <div className="sse-inspect">
                    <div className="sse-inspect__icon" style={{ "--tint": ITEMS[modal.item].tint }}>{ITEMS[modal.item].icon}</div>
                    <h3>{ITEMS[modal.item].name}</h3>
                    <p>{ITEMS[modal.item].desc}</p>
                  </div>
                )}
                {modal.type === "journal" && (
                  <div className="sse-journal">
                    <h3>Station Logs</h3>
                    {gs.clues.length === 0 && <p className="sse-pz__lead">No logs recovered yet. Inspect terminals, notes and devices.</p>}
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
                  <div className="sse-map">
                    <h3>Helios Station</h3>
                    <div className="sse-map__grid">
                      {ROOM_ORDER.map((r, i) => {
                        const open = unlocked.includes(r);
                        return (
                          <button type="button" key={r} disabled={!open || r === gs.room} className={`sse-map__room${r === gs.room ? " is-here" : ""}${open ? "" : " is-locked"}`} onClick={() => doTravel(r)}>
                            <small>SECTOR {i + 1}</small>
                            {open ? ROOMS[r].name : "SEALED"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="sse-pz__note">Travel to any unsealed sector.</p>
                  </div>
                )}
                {modal.type === "hint" && (
                  <div className="sse-hint">
                    <h3>ARIA Assist</h3>
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
                        {modal.hint.level < modal.hint.max ? <button type="button" className="sse-btn" onClick={hint}>Clearer hint</button> : <p className="sse-pz__note">That's the full solution for this step.</p>}
                      </>
                    )}
                    {modal.hint.level === 0 && <button type="button" className="sse-btn" onClick={() => setModal({ type: "map" })}>Open map</button>}
                  </div>
                )}
              </div>
            </div>
          )}

          {gs.o2 <= 0 && !gs.won && (
            <div className="sse-overlay sse-overlay--dead" onPointerUp={stop}>
              <div className="sse-card sse-card--menu">
                <h2>Oxygen Depleted</h2>
                <p className="sse-pz__lead">Your vision tunnels to black… Everything you've done is still in place.</p>
                <button type="button" className="sse-btn sse-btn--go" onClick={doRetry}>Retry with fresh oxygen</button>
                <button type="button" className="sse-btn" onClick={toMenu}>Main menu</button>
              </div>
            </div>
          )}

          {paused && (
            <div className="sse-overlay" onPointerUp={stop}>
              <div className="sse-card sse-card--menu">
                <h2>Paused</h2>
                <p className="sse-pz__lead">
                  {room.name} · {fmtTime(gs.time)} · O₂ {Math.ceil(o2)}% · {gs.hintsUsed} hint{gs.hintsUsed === 1 ? "" : "s"}
                </p>
                <button type="button" className="sse-btn sse-btn--go" onClick={() => setPaused(false)}>Resume</button>
                <button
                  type="button"
                  className="sse-btn"
                  onClick={() => {
                    setPaused(false);
                    setModal({ type: "help" });
                  }}
                >
                  How to play
                </button>
                <button type="button" className="sse-btn" onClick={() => startGame(true)}>Restart mission</button>
                <button type="button" className="sse-btn" onClick={toMenu}>Save &amp; quit</button>
              </div>
            </div>
          )}
        </>
      )}

      {(screen === "menu" || modal?.type === "help") && (
        <div className={`sse-overlay${screen === "menu" ? " sse-overlay--menu" : ""}`} onPointerUp={stop}>
          {modal?.type === "help" || modal?.type === "howto" ? (
            <div className="sse-card sse-card--help">
              <h2>How to play</h2>
              <ul>
                <li><b>Look</b> — move the mouse (drag on touch).</li>
                <li><b>Interact</b> — click glowing objects: terminals, notes, lockers, machinery.</li>
                <li><b>Use items</b> — select an item, then click an object. O₂ canisters have a <b>Use now</b> button.</li>
                <li><b>Scan</b> — hold Space (or tap ◎) to mark everything you can interact with.</li>
                <li><b>Oxygen</b> drains while you explore — never on menus or panels. Restore Life Support to refill it. Run out and you can retry without losing progress.</li>
                <li><b>Logs</b> keep every clue; the <b>Map</b> takes you to any unsealed sector; <b>Hints</b> get clearer each time.</li>
              </ul>
              <button type="button" className="sse-btn sse-btn--go" onClick={() => setModal(null)}>Got it</button>
            </div>
          ) : (
            screen === "menu" && (
              <div className="sse-menu">
                <p className="sse-menu__kicker">HELIOS STATION · LOW EARTH ORBIT</p>
                <h1>
                  Space Station
                  <span>Escape</span>
                </h1>
                <p className="sse-menu__tag">REPAIR • UNLOCK • SURVIVE</p>
                <p className="sse-menu__about">A storm has crippled the station and its AI has sealed every sector. Restore power, hack the systems, keep breathing — and reach the last escape pod.</p>
                <div className="sse-menu__btns">
                  {hasSave && (
                    <button type="button" className="sse-btn sse-btn--go" onClick={() => startGame(false)}>
                      Continue
                      <small>
                        {ROOMS[gsRef.current.room]?.name} · {fmtTime(gsRef.current.time)}
                      </small>
                    </button>
                  )}
                  <button type="button" className={`sse-btn${hasSave ? "" : " sse-btn--go"}`} onClick={() => startGame(true)}>New Game</button>
                  <button type="button" className="sse-btn" onClick={() => setModal({ type: "howto" })}>How to Play</button>
                </div>
                {records.escapes > 0 && (
                  <p className="sse-menu__rec">
                    Escapes: {records.escapes} · Best time {fmtTime(records.bestTime)}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {screen === "victory" && (
        <div className="sse-overlay sse-overlay--victory" onPointerUp={stop}>
          <div className="sse-victory">
            <p className="sse-menu__kicker">POD-3 · RE-ENTRY TRAJECTORY LOCKED</p>
            <h1>You Escaped</h1>
            <p className="sse-victory__story">Helios Station shrinks to a glinting star behind you. Dr. Reyes was right — the spores were harmless; a storm-blinded AI did the rest. Earth fills the viewport. You're going home.</p>
            <div className="sse-stats">
              <div><b>{fmtTime(gs.time)}</b><small>Completion time</small></div>
              <div><b>6/6</b><small>Sectors</small></div>
              <div><b>{gs.clues.length}/{Object.keys(CLUES).length}</b><small>Logs found</small></div>
              <div><b>{gs.hintsUsed}</b><small>Hints used</small></div>
              <div><b>{gs.depleted}</b><small>O₂ blackouts</small></div>
            </div>
            <div className="sse-menu__btns">
              <button type="button" className="sse-btn sse-btn--go" onClick={() => startGame(true)}>Play again</button>
              <button
                type="button"
                className="sse-btn"
                onClick={() => {
                  setFlash(false);
                  sceneRef.current?.loadRoom("command", newState(), { enter: false });
                  toMenu();
                }}
              >
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
