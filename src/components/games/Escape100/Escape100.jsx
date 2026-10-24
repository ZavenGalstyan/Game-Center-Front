/**
 * Escape 100: Mystery Doors — a 3D escape-room game: 100 authored rooms in 10
 * chapters (prison → mansion → lab → temple → bunker → hotel → factory →
 * space station → dimensional maze → final facility).
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); its Restart restarts the current room and its Mute
 * silences all sound. The puzzle rules live in ./engine.js (pure, validated
 * headlessly by tools/levelTest.mjs), the levels in ./levels, the plain
 * Three.js world in ./world.js. Progress + settings: `escape100-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { LEVELS } from "./levels/index.js";
import { THEMES } from "./themes.js";
import { createWorld } from "./world.js";
import { createAudio } from "./audio.js";
import * as P from "./progress.js";
import { Icon, I, Keypad, Wires, Reader, Inspector, Hints, LevelSelect, Settings } from "./ui.jsx";
import "./Escape100.css";

const TEST = import.meta.env.DEV && typeof location !== "undefined" && /[?&]e100test=1/.test(location.search);
const load = () => {
  try {
    return P.normalize(JSON.parse(localStorage.getItem(P.SAVE_KEY)));
  } catch {
    return P.normalize(null);
  }
};
const persist = (p) => {
  try {
    localStorage.setItem(P.SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
};
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Escape100({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(load);
  const [screen, setScreen] = useState("menu"); // menu | levels | play
  const [L, setL] = useState(null);
  const [gs, setGs] = useState(null);
  const [overlay, setOverlay] = useState(null); // pause | settings | hints | keypad | wires | reader | inspect | win | final | newgame
  const [panel, setPanel] = useState(null); // { id } / { item } / { title, content }
  const [sel, setSel] = useState(null); // selected inventory item
  const [toast, setToast] = useState(null);
  const [hover, setHover] = useState(null);
  const [focused, setFocused] = useState(null);
  const [hintShown, setHintShown] = useState({}); // stage → count shown
  const [shake, setShake] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [winStats, setWinStats] = useState(null);
  const [coach, setCoach] = useState(null);
  const [, setTick] = useState(0);

  const host = useRef(null);
  const rootRef = useRef(null);
  const world = useRef(null);
  const gsRef = useRef(null);
  gsRef.current = gs;
  const LRef = useRef(null);
  LRef.current = L;
  const t0 = useRef(0);
  const hintsUsed = useRef(0);
  const toastT = useRef(0);
  const progRef = useRef(prog);
  progRef.current = prog;

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => {
    audio.set({ master: prog.settings.master, sfx: prog.settings.sfx, amb: prog.settings.amb });
    audio.setMuted(muted || prog.settings.muted);
  }, [audio, muted, prog.settings]);

  const saveProg = useCallback((next) => {
    setProg(next);
    persist(next);
  }, []);

  const say = useCallback((text, bad = false, ms = 2600) => {
    clearTimeout(toastT.current);
    setToast({ text, bad, id: Math.random() });
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);

  /* ---------- world lifecycle ---------- */
  useEffect(() => {
    const w = createWorld(host.current, {
      quality: progRef.current.settings.quality,
      sensitivity: () => progRef.current.settings.sens,
      onHover: (oid) => {
        const o = oid && LRef.current ? E.objDef(LRef.current, oid) : null;
        setHover(o ? o.label || (o.kind === "door" ? "Exit Door" : null) : null);
      },
      onPick: (hit) => pickRef.current?.(hit),
      onExitDone: () => exitDoneRef.current?.(),
    });
    world.current = w;
    if (TEST && /[?&]e100manual=1/.test(location.search)) w.setManual(true);
    return () => {
      w.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => world.current?.setQuality(prog.settings.quality), [prog.settings.quality]);
  useEffect(() => world.current?.setPaused(overlay === "pause" || overlay === "settings"), [overlay]);

  /* ---------- level flow ---------- */
  const startLevel = useCallback(
    (id) => {
      const lv = LEVELS.find((x) => x.id === id);
      if (!lv) return;
      const s = E.initState(lv);
      setL(lv);
      LRef.current = lv;
      setGs(s);
      gsRef.current = s;
      setOverlay(null);
      setPanel(null);
      setSel(null);
      setFocused(null);
      setHintShown({});
      setWinStats(null);
      hintsUsed.current = 0;
      t0.current = performance.now();
      setScreen("play");
      world.current?.loadLevel(lv, s);
      const theme = THEMES[Math.floor((id - 1) / 10)];
      audio.ambience(theme.ambience);
      saveProg({ ...progRef.current, current: id });
      setCoach(id === 1 ? "look" : lv.intro ? "intro" : null);
      say(`${theme.chapter} — Room ${id}: ${lv.name}`, false, 3200);
    },
    [audio, saveProg, say],
  );
  const restart = useCallback(() => {
    if (screen !== "play" || !L) return;
    audio.play("close");
    startLevel(L.id);
  }, [screen, L, startLevel, audio]);
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play" && L) startLevel(L.id);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMenu = () => {
    setOverlay(null);
    setScreen("menu");
    setL(null);
    world.current?.showMenu();
    audio.ambience(null);
  };

  /* ---------- actions ---------- */
  const dispatch = useCallback(
    (a) => {
      const lv = LRef.current, s = gsRef.current;
      if (!lv || !s || s.won) return null;
      const r = E.act(lv, s, a);
      gsRef.current = r.state;
      setGs(r.state);
      world.current?.sync(r.state);
      world.current?.fx(r.fx);
      const o = a.id ? E.objDef(lv, a.id) : null;
      // sounds
      if (r.ok) {
        if (a.a === "click" && o) {
          const st = r.state.obj[o.id];
          if (o.kind === "switch") audio.play("lever");
          else if (o.kind === "dial") audio.play("dial");
          else if (o.kind === "movable") audio.play("move");
          else if (o.kind === "container") audio.play(st.open ? (o.style?.includes("rawer") ? "drawer" : "open") : "close");
          else if (o.kind === "timed") audio.play("press");
          else if (o.kind === "clue") audio.play("page");
          else if (o.kind === "slot") audio.play("place");
        }
        if (a.a === "press") audio.play(o.style === "bells" ? "bell" : "press", o.style === "bells" ? 440 * Math.pow(1.26, o.buttons.findIndex((b) => b.id === a.b)) : undefined);
        if (a.a === "use") audio.play(r.fx.some((f) => f.type === "place") ? "place" : "unlock");
        if (a.a === "rotate") audio.play("dial");
        if (a.a === "combine") audio.play("combine");
      }
      let gotMsg = null;
      for (const f of r.fx) {
        if (f.type === "sfx") audio.play(f.name);
        else if (f.type === "msg") say(f.text, f.bad);
        else if (f.type === "get") {
          audio.play("pickup");
          gotMsg = `Got: ${E.itemName(lv, f.item)}`;
        } else if (f.type === "solve") audio.play("solve");
        else if (f.type === "doorUnlock") {
          audio.play("unlock");
          say("The exit door unlocked!", false, 3000);
        } else if (f.type === "unlock" && f.id !== "door") audio.play("unlock");
        else if (f.type === "win") {
          audio.play("door");
          setOverlay(null);
          setPanel(null);
          setFocused(null);
          world.current?.playExit();
        }
      }
      if (gotMsg) {
        say(gotMsg);
        setCoach((c) => (lv.id === 1 && !c?.startsWith?.("inv") ? "inv" : c));
      }
      return r;
    },
    [audio, say],
  );

  const exitDoneRef = useRef(null);
  exitDoneRef.current = () => {
    const lv = LRef.current, s = gsRef.current;
    if (!lv) return;
    const time = (performance.now() - t0.current) / 1000;
    const next = P.recordEscape(progRef.current, lv.id, { hints: hintsUsed.current, moves: s.moves, time });
    saveProg(next);
    setWinStats({ time, hints: hintsUsed.current, moves: s.moves, chapterEnd: lv.id % 10 === 0 });
    audio.play(lv.id === 100 ? "final" : "win");
    setOverlay(lv.id === 100 ? "final" : "win");
  };

  /* ---------- picking (from the 3D view) ---------- */
  const pickRef = useRef(null);
  pickRef.current = (hit) => {
    const lv = LRef.current, s = gsRef.current;
    if (!lv || !s || s.won || overlay) return;
    if (!hit) return;
    const o = E.objDef(lv, hit.oid);
    if (!o) return;
    setCoach((c) => (c === "look" || c === "tap" ? (c === "look" ? "tap" : null) : c));
    world.current?.focusOn(o.id);
    setFocused(o.id);
    setHover(o.label || (o.kind === "door" ? "Exit Door" : null));
    if (sel) {
      dispatch({ a: "use", item: sel, id: o.id });
      setSel(null);
      return;
    }
    if (o.needs && !E.test(lv, s, o.needs.cond)) return dispatch({ a: "click", id: o.id });
    switch (o.kind) {
      case "container": {
        if (hit.part?.startsWith("item:")) return dispatch({ a: "take", id: o.id, item: hit.part.slice(5) });
        // an open container with something inside: tapping it reaches in rather than closing it
        const st = s.obj[o.id];
        if (st.open && st.contents.length) return dispatch({ a: "take", id: o.id, item: st.contents[0] });
        return dispatch({ a: "click", id: o.id });
      }
      case "buttons":
        if (hit.part) dispatch({ a: "press", id: o.id, b: hit.part });
        return;
      case "mirrors":
        if (hit.part?.startsWith("cell:")) dispatch({ a: "rotate", id: o.id, cell: +hit.part.slice(5) });
        return;
      case "keypad":
        audio.play("tap");
        setPanel({ id: o.id });
        setOverlay("keypad");
        return;
      case "wires":
        if (s.obj[o.id].solved) return say("It's already wired.");
        audio.play("tap");
        setPanel({ id: o.id });
        setOverlay("wires");
        return;
      case "clue":
        dispatch({ a: "click", id: o.id });
        setPanel({ title: o.label || "Note", content: o.content });
        setOverlay("reader");
        return;
      default:
        dispatch({ a: "click", id: o.id });
    }
  };

  const back = useCallback(() => {
    if (overlay && overlay !== "win" && overlay !== "final") return setOverlay(null);
    if (sel) return setSel(null);
    if (world.current?.focusId) {
      world.current.unfocus();
      setFocused(null);
      setHover(null);
    }
  }, [overlay, sel]);

  /* ---------- inventory ---------- */
  const tapItem = (it) => {
    audio.play("tap");
    if (sel && sel !== it) {
      dispatch({ a: "combine", x: sel, y: it });
      setSel(null);
      return;
    }
    if (sel === it) {
      dispatch({ a: "inspect", item: it });
      setSel(null);
      setPanel({ item: it });
      setOverlay("inspect");
      return;
    }
    setSel(it);
    setCoach((c) => (c === "inv" ? "use" : c));
  };

  /* ---------- timers (timed buttons) ---------- */
  useEffect(() => {
    if (screen !== "play") return;
    const id = setInterval(() => {
      const lv = LRef.current, s = gsRef.current;
      if (!lv || !s || overlay === "pause") return;
      const active = lv.objects.some((o) => o.kind === "timed" && (s.obj[o.id].until ?? 0) > s.time);
      const expired = E.tick(lv, s, 0.1);
      if (active) {
        world.current?.sync(s);
        setTick((t) => t + 1);
        const left = Math.min(...lv.objects.filter((o) => o.kind === "timed" && s.obj[o.id].until > s.time).map((o) => s.obj[o.id].until - s.time));
        if (Number.isFinite(left) && Math.abs(left - Math.round(left)) < 0.051) audio.play("timer");
      }
      if (expired.length) say("The timer ran out.", true);
    }, 100);
    return () => clearInterval(id);
  }, [screen, overlay, audio, say]);

  /* ---------- fullscreen ---------- */
  const fsTarget = () => rootRef.current?.closest(".game-player") || rootRef.current;
  useEffect(() => {
    const sync = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => (document.removeEventListener("fullscreenchange", sync), document.removeEventListener("webkitfullscreenchange", sync));
  }, []);
  const canFs = typeof document !== "undefined" && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      else await (fsTarget().requestFullscreen?.() ?? fsTarget().webkitRequestFullscreen?.());
    } catch {
      say("Fullscreen isn't available here.", true);
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (!rootRef.current?.isConnected || e.target?.closest?.("input")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (screen === "play" && !overlay && !sel && !world.current?.focusId) setOverlay("pause");
        else back();
      } else if (screen === "play" && !overlay && (e.key === "h" || e.key === "H")) openHints();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- hints ---------- */
  const stage = L && gs ? E.hintStage(L, gs) : 0;
  const openHints = () => {
    audio.play("hint");
    setOverlay("hints");
  };
  const moreHint = () => {
    setHintShown((h) => ({ ...h, [stage]: Math.min(3, (h[stage] || 0) + 1) }));
    hintsUsed.current++;
    audio.play("hint");
  };

  /* ---------- settings ---------- */
  const changeSettings = (patch) => saveProg(P.normalize({ ...prog, settings: { ...prog.settings, ...patch } }));

  /* ---------- DEV test hooks ---------- */
  useEffect(() => {
    if (!TEST) return;
    window.__e100 = {
      E,
      LEVELS,
      L: () => LRef.current,
      gs: () => gsRef.current,
      prog: () => progRef.current,
      screen: () => screen,
      overlay: () => overlay,
      world: () => world.current,
      play: (id) => startLevel(id),
      dispatch,
      setOverlay,
      sel: () => sel,
      hover: () => hover,
      focused: () => world.current?.focusId,
      pick: (hit) => pickRef.current(hit),
    };
  });

  /* ---------- render ---------- */
  const theme = L ? THEMES[Math.floor((L.id - 1) / 10)] : THEMES[0];
  const completed = P.completedCount(prog);
  const timedLeft = L && gs ? Math.max(0, ...L.objects.filter((o) => o.kind === "timed").map((o) => (gs.obj[o.id].until ?? 0) - gs.time)) : 0;
  const panelObj = panel?.id && L ? E.objDef(L, panel.id) : null;

  return (
    <div ref={rootRef} className={`e100 e100--${screen}`} style={{ "--tc": theme.color }} onContextMenu={(e) => e.preventDefault()}>
      <div className="e100-stage" ref={host} />

      {screen === "menu" && (
        <div className="e100-menu">
          <div className="e100-menu__title">
            <span className="e100-menu__kicker">Escape 100</span>
            <h1>Mystery Doors</h1>
            <p>100 Doors. 100 Mysteries. One Way Out.</p>
          </div>
          <div className="e100-menu__btns">
            {completed > 0 && (
              <button className="e100-btn e100-btn--big e100-btn--go" onClick={() => (audio.unlock(), startLevel(prog.current))}>
                <Icon d={I.play} /> Continue · Room {prog.current}
              </button>
            )}
            <button
              className={`e100-btn e100-btn--big${completed ? "" : " e100-btn--go"}`}
              onClick={() => {
                audio.unlock();
                if (completed) setOverlay("newgame");
                else startLevel(1);
              }}
            >
              <Icon d={I.door} /> New Game
            </button>
            <button className="e100-btn e100-btn--big" onClick={() => (audio.play("tap"), setScreen("levels"))}>
              <Icon d={I.grid} /> Select Room
            </button>
            <div className="e100-menu__row">
              <button className="e100-btn" onClick={() => setOverlay("settings")}>
                <Icon d={I.gear} /> Settings
              </button>
              {canFs && (
                <button className="e100-btn" onClick={toggleFs}>
                  <Icon d={isFs ? I.exitFull : I.full} /> {isFs ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              )}
            </div>
          </div>
          <div className="e100-menu__foot">
            {completed} / 100 rooms escaped · Chapter {Math.floor((prog.current - 1) / 10) + 1}: {THEMES[Math.floor((prog.current - 1) / 10)].chapter}
          </div>
        </div>
      )}

      {screen === "levels" && <LevelSelect levels={LEVELS} prog={prog} onPick={(id) => (audio.unlock(), startLevel(id))} onBack={() => setScreen("menu")} />}

      {screen === "play" && L && gs && (
        <>
          <div className="e100-hud">
            <button className="e100-icon" onClick={() => setOverlay("pause")} aria-label="Pause menu">
              <Icon d={I.menu} />
            </button>
            <div className="e100-hud__title">
              <span>
                Ch {Math.floor((L.id - 1) / 10) + 1} · {theme.chapter}
              </span>
              <b>
                Room {L.id} — {L.name}
              </b>
            </div>
            <div className="e100-hud__obj">
              <Icon d={gs.obj.door.locked ? I.lock : I.door} /> {gs.obj.door.locked ? L.objective : "The exit is open — go!"}
            </div>
            <div className="e100-hud__right">
              <button className="e100-icon e100-icon--hint" onClick={openHints} aria-label="Hints">
                <Icon d={I.bulb} />
              </button>
              <button className="e100-icon" onClick={restart} aria-label="Restart room">
                <Icon d={I.restart} />
              </button>
              <button className="e100-icon" onClick={() => changeSettings({ muted: !prog.settings.muted })} aria-label={prog.settings.muted ? "Unmute" : "Mute"}>
                <Icon d={prog.settings.muted ? I.mute : I.sound} />
              </button>
              {canFs && (
                <button className="e100-icon e100-hide-sm" onClick={toggleFs} aria-label="Fullscreen">
                  <Icon d={isFs ? I.exitFull : I.full} />
                </button>
              )}
            </div>
          </div>

          {(focused || sel) && !overlay && (
            <button className="e100-back" onClick={back}>
              <Icon d={I.back} /> {sel ? "Cancel" : "Back"}
            </button>
          )}
          {timedLeft > 0 && !gs.won && <div className="e100-timer">{timedLeft.toFixed(1)}s</div>}
          {hover && !overlay && <div className="e100-label">{sel ? `Use ${E.itemName(L, sel)} on ${hover}` : hover}</div>}
          {coach && !overlay && (
            <div className="e100-coach" onClick={() => setCoach(null)}>
              {coach === "look" && (
                <>
                  <b>Look around</b> Drag to turn. Scroll or pinch to zoom.
                </>
              )}
              {coach === "tap" && (
                <>
                  <b>Investigate</b> Tap anything that looks interesting. <em>Back</em> returns to the room view.
                </>
              )}
              {coach === "intro" && <>{L.intro}</>}
              {coach === "inv" && (
                <>
                  <b>Inventory</b> Tap an item to select it, then tap where to use it. Tap it again to inspect it.
                </>
              )}
              {coach === "use" && (
                <>
                  <b>Item selected</b> Now tap the object to use it on — or another item to combine.
                </>
              )}
            </div>
          )}

          <div className={`e100-inv${sel ? " has-sel" : ""}`}>
            {gs.inv.length === 0 && <span className="e100-inv__empty">Inventory empty</span>}
            {gs.inv.map((it) => {
              const def = L.items[it];
              const icon = world.current?.itemIcon(it, def);
              return (
                <button key={it} className={`e100-item${sel === it ? " is-sel" : ""}`} onClick={() => tapItem(it)} aria-label={def.name} title={def.name} data-item={it}>
                  {icon ? <img src={icon} alt="" /> : <span>{def.name[0]}</span>}
                  <i>{def.name}</i>
                </button>
              );
            })}
          </div>
        </>
      )}

      {toast && (
        <div className={`e100-toast${toast.bad ? " is-bad" : ""}`} key={toast.id}>
          {toast.text}
        </div>
      )}

      {/* ---------- overlays ---------- */}
      {overlay && overlay !== "win" && overlay !== "final" && <div className="e100-scrim" onClick={() => !["newgame"].includes(overlay) && setOverlay(null)} />}
      {overlay === "keypad" && panelObj && (
        <Keypad
          o={panelObj}
          shake={shake}
          onKey={(i) => audio.play("key", i)}
          onClose={() => setOverlay(null)}
          onSubmit={(v) => {
            const r = dispatch({ a: "code", id: panelObj.id, v });
            if (r?.ok) setTimeout(() => setOverlay((o) => (o === "keypad" ? null : o)), 350);
            else setShake((x) => x + 1);
          }}
        />
      )}
      {overlay === "wires" && panelObj && (
        <Wires
          o={panelObj}
          onClose={() => setOverlay(null)}
          onSubmit={(map) => {
            const r = dispatch({ a: "wire", id: panelObj.id, map });
            if (r?.ok) setOverlay(null);
          }}
        />
      )}
      {overlay === "reader" && panel?.content && <Reader title={panel.title} content={panel.content} onClose={() => setOverlay(null)} />}
      {overlay === "inspect" && panel?.item && L && (
        <Inspector
          item={panel.item}
          def={L.items[panel.item]}
          inspect={world.current?.inspect}
          onClose={() => setOverlay(null)}
          onUse={() => {
            setSel(panel.item);
            setOverlay(null);
          }}
        />
      )}
      {overlay === "hints" && L && <Hints stage={stage} hints={L.hints} shown={hintShown[stage] || 0} onMore={moreHint} onClose={() => setOverlay(null)} />}
      {overlay === "settings" && <Settings settings={prog.settings} onChange={changeSettings} onClose={() => setOverlay(screen === "play" ? "pause" : null)} onReset={() => (saveProg(P.normalize(null)), setOverlay(null), toMenu())} />}
      {overlay === "newgame" && (
        <div className="e100-panel e100-confirm">
          <div className="e100-panel__head">
            <b>Start a new game?</b>
          </div>
          <p>Your escaped rooms are kept — this just takes you back to Room 1.</p>
          <div className="e100-panel__row">
            <button className="e100-btn" onClick={() => setOverlay(null)}>
              Cancel
            </button>
            <button className="e100-btn e100-btn--go" onClick={() => startLevel(1)}>
              Room 1
            </button>
          </div>
        </div>
      )}
      {overlay === "pause" && L && (
        <div className="e100-panel e100-pause">
          <div className="e100-panel__head">
            <b>Paused</b>
            <span>
              Room {L.id} · {L.name}
            </span>
          </div>
          <p className="e100-panel__tip">{L.objective}</p>
          <div className="e100-pause__btns">
            <button className="e100-btn e100-btn--go" onClick={() => setOverlay(null)}>
              <Icon d={I.play} /> Resume
            </button>
            <button className="e100-btn" onClick={restart}>
              <Icon d={I.restart} /> Restart Room
            </button>
            <button className="e100-btn" onClick={() => (setOverlay(null), setScreen("levels"), world.current?.showMenu(), audio.ambience(null))}>
              <Icon d={I.grid} /> Select Room
            </button>
            <button className="e100-btn" onClick={() => setOverlay("settings")}>
              <Icon d={I.gear} /> Settings
            </button>
            <button className="e100-btn" onClick={toMenu}>
              <Icon d={I.door} /> Main Menu
            </button>
          </div>
        </div>
      )}
      {overlay === "win" && L && winStats && (
        <div className="e100-win">
          <div className="e100-win__rays" />
          <div className="e100-panel e100-win__card">
            <span className="e100-win__kicker">{winStats.chapterEnd ? `Chapter ${L.id / 10} complete!` : `Room ${L.id}`}</span>
            <h2>Escaped!</h2>
            <p className="e100-win__name">{L.name}</p>
            <div className="e100-win__stats">
              <span>
                <b>{fmtTime(winStats.time)}</b>time
              </span>
              <span>
                <b>{winStats.moves}</b>actions
              </span>
              <span>
                <b>{winStats.hints}</b>hints
              </span>
            </div>
            {winStats.chapterEnd && L.id < 100 && <p className="e100-panel__tip">Next: Chapter {L.id / 10 + 1} — {THEMES[L.id / 10].chapter}</p>}
            <div className="e100-panel__row">
              <button className="e100-btn" onClick={() => startLevel(L.id)}>
                <Icon d={I.restart} /> Replay
              </button>
              <button className="e100-btn" onClick={() => (setOverlay(null), setScreen("levels"), world.current?.showMenu(), audio.ambience(null))}>
                <Icon d={I.grid} /> Rooms
              </button>
              <button className="e100-btn e100-btn--go" onClick={() => startLevel(Math.min(100, L.id + 1))} autoFocus>
                Next Room <Icon d={I.next} />
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && (
        <div className="e100-final">
          <div className="e100-final__light" />
          <div className="e100-final__card">
            <span className="e100-win__kicker">Room 100 · The Last Door</span>
            <h2>You Escaped.</h2>
            <p>One hundred doors, one hundred mysteries — and at last, daylight. The building falls silent behind you.</p>
            <div className="e100-win__stats">
              <span>
                <b>{P.completedCount(prog)}</b>rooms escaped
              </span>
              <span>
                <b>{Object.values(prog.done).reduce((s, d) => s + d.hints, 0)}</b>hints used
              </span>
            </div>
            <div className="e100-panel__row">
              <button className="e100-btn" onClick={() => (setOverlay(null), setScreen("levels"), world.current?.showMenu())}>
                <Icon d={I.grid} /> All Rooms
              </button>
              <button className="e100-btn e100-btn--go" onClick={toMenu}>
                <Icon d={I.door} /> Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
