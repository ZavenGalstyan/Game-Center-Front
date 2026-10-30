/**
 * Shadow Arena: Ultimate Fighters — 2D one-on-one fighting game.
 * Rendered on one <canvas> inside the shared <GamePlayer> (registered by
 * name in ../registry.js); menus are React overlays, the fight HUD is drawn
 * on the canvas.
 *
 * Modes: 2 Player VS (two humans on one keyboard, ui/input.js) and Arcade
 * (one human vs the AI through 30 battles, data/arcade.js). The fight
 * simulation (engine/fight.js) runs at a fixed 60 Hz; React only re-renders
 * on screen changes. Behind the menus an AI-vs-AI demo bout plays.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current match; `muted`
 * silences the WebAudio synth. Arcade progress, stats and settings live
 * under `shadow-arena-save`.
 */
import { useEffect, useRef, useState } from "react";
import { DT, VIEW_W, VIEW_H, FIGHTERS, ARENAS } from "./engine/data.js";
import { createMatch, step } from "./engine/fight.js";
import { createAI, aiParams, aiInput } from "./engine/ai.js";
import { BATTLES } from "./data/arcade.js";
import { loadSave, writeSave, recordArcade, recordVs, fresh } from "./engine/save.js";
import { bakeArena } from "./render/arenas.js";
import { drawFrame, spawnFx, stepFx, followCam, MAX_ZOOM } from "./render/draw.js";
import { createInput, NAV } from "./ui/input.js";
import { MainMenu, ModeSelect, FighterSelect, ArenaSelect, Ladder, PauseMenu, ResultScreen, HelpOverlay, SettingsOverlay } from "./ui/screens.jsx";
import { audio } from "./audio.js";
import "./ShadowArena.css";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && /[?&]satest=1/.test(window.location.search);
const MANUAL = TEST && /[?&]samanual=1/.test(window.location.search);
const NOSAVE = TEST && /[?&]nosave=1/.test(window.location.search);
const HITBOXES = TEST && /[?&]sabox=1/.test(window.location.search);

const RESULT_DELAY = 110; // frames of the winner banner before the result card

let demoSeed = 1;
function newDemo() {
  const n = demoSeed++;
  const a = FIGHTERS[(n * 5) % 6].id;
  const b = FIGHTERS[(n * 5 + 2 + (n % 3)) % 6].id;
  return {
    m: createMatch({ fighters: [a, b], arena: ARENAS[n % 4].id, roundTime: 99, mode: "demo" }),
    ai: [createAI(aiParams(0.6), n * 13 + 1), createAI(aiParams(0.6), n * 29 + 7)],
  };
}

function namesFor(m) {
  const [a, b] = m.f.map((f) => f.def);
  const mirror = a.id === b.id;
  if (m.cfg.mode === "arcade") return { hud: [`YOU · ${a.name.toUpperCase()}`, `${mirror ? "CPU · " : ""}${b.name.toUpperCase()}`], banner: mirror ? ["YOU", `CPU ${b.short.toUpperCase()}`] : [a.short.toUpperCase(), b.short.toUpperCase()] };
  return {
    hud: [`P1 · ${a.name.toUpperCase()}`, `${b.name.toUpperCase()} · P2`],
    banner: mirror ? [`P1 ${a.short.toUpperCase()}`, `P2 ${b.short.toUpperCase()}`] : [a.short.toUpperCase(), b.short.toUpperCase()],
  };
}

export default function ShadowArena({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const matchRef = useRef(null);
  const aiRef = useRef(null);
  const cfgRef = useRef(null);
  const demoRef = useRef(null);
  if (!demoRef.current) demoRef.current = newDemo();
  const fxRef = useRef([]);
  const viewRef = useRef({ w: 1, h: 1, dpr: 1, scale: 1, ox: 0, oy: 0 });
  const bakeRef = useRef({ key: "", canvas: null });
  const accRef = useRef(0);
  const timeRef = useRef(0);
  const camRef = useRef({ x: VIEW_W / 2, z: 1, m: null, dt: 0 });
  const doneRef = useRef(false);

  const [save, setSaveState] = useState(() => (NOSAVE ? fresh() : loadSave()));
  const saveRef = useRef(save);
  const setSave = (fn) => {
    const next = typeof fn === "function" ? fn(saveRef.current) : fn;
    saveRef.current = next;
    setSaveState(next);
    if (!NOSAVE) writeSave(next);
  };

  const [screen, setScreenState] = useState("menu"); // menu | modes | select | arena | ladder | fight
  const [overlay, setOverlayState] = useState(null); // null | help | settings | pause | result
  const [mode, setMode] = useState("vs");
  const [modeCursor, setModeCursor] = useState(0);
  const [sel, setSel] = useState({ cur: [0, 1], locked: [false, false] });
  const [arenaCursor, setArenaCursor] = useState(0);
  const [ladderCursor, setLadderCursor] = useState(0);
  const [battleId, setBattleId] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);
  const [, setResultTick] = useState(0);

  // refs mirror the UI state for the loop and key handler
  const ui = useRef({});
  ui.current = { screen, overlay, mode, modeCursor, sel, arenaCursor, ladderCursor, battleId };
  const setScreen = (s) => {
    ui.current.screen = s;
    setScreenState(s);
  };
  const setOverlay = (o) => {
    ui.current.overlay = o;
    setOverlayState(o);
  };

  audio.muted = muted || !save.settings.sound;

  /* ------------------------------------------------------------ flow */

  const startFight = (cfg, aiCfg) => {
    cfgRef.current = cfg;
    matchRef.current = createMatch(cfg);
    aiRef.current = aiCfg ? createAI(aiCfg, (Date.now() & 0xffff) + 1) : null;
    fxRef.current = [];
    accRef.current = 0;
    doneRef.current = false;
    inputRef.current.clear();
    setOverlay(null);
    setScreen("fight");
    draw();
  };
  const startVs = (f0, f1, arena) => startFight({ mode: "vs", fighters: [f0, f1], arena, roundTime: saveRef.current.settings.roundTime });
  const startArcade = (id) => {
    const b = BATTLES[id - 1];
    if (!b || id > saveRef.current.arcade.unlocked) return;
    ui.current.battleId = id;
    setBattleId(id);
    setLadderCursor(id - 1);
    startFight({ mode: "arcade", fighters: [saveRef.current.arcade.fighter, b.opp], arena: b.arena, roundTime: b.roundTime, hpMul: [1, b.hpMul], dmgMul: [1, b.dmgMul], battle: id }, b.ai);
  };
  const rematch = () => {
    const c = cfgRef.current;
    if (!c) return;
    if (c.mode === "arcade") startArcade(c.battle);
    else startFight(c);
  };
  const nextBattle = () => startArcade(Math.min(30, ui.current.battleId + 1));
  const pause = () => {
    if (ui.current.screen === "fight" && !ui.current.overlay && matchRef.current?.phase !== "over") {
      inputRef.current.clear();
      setOverlay("pause");
    }
  };
  const resume = () => {
    if (ui.current.overlay === "pause") {
      accRef.current = 0;
      inputRef.current.clear();
      setOverlay(null);
    }
  };
  const leaveFight = (to) => {
    matchRef.current = null;
    aiRef.current = null;
    fxRef.current = [];
    setOverlay(null);
    setScreen(to);
  };
  const openSelect = (m) => {
    setMode(m);
    ui.current.mode = m;
    const i = Math.max(0, FIGHTERS.findIndex((f) => f.id === saveRef.current.arcade.fighter));
    setSel(m === "arcade" ? { cur: [i, 1], locked: [false, false] } : { cur: [ui.current.sel.cur[0], ui.current.sel.cur[1]], locked: [false, false] });
    setScreen("select");
  };
  const pickMode = (m) => {
    audio.click();
    if (m === "vs") openSelect("vs");
    else {
      setMode("arcade");
      ui.current.mode = "arcade";
      const a = saveRef.current.arcade;
      if (a.unlocked > 1 || a.cleared.length) {
        setLadderCursor(Math.min(a.unlocked, 30) - 1);
        setScreen("ladder");
      } else openSelect("arcade");
    }
  };
  const pickArena = (i) => {
    audio.click();
    const id = i >= ARENAS.length ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : ARENAS[i].id;
    const s = ui.current.sel;
    startVs(FIGHTERS[s.cur[0]].id, FIGHTERS[s.cur[1]].id, id);
  };
  const lock = (side, idx) => {
    setSel((s) => {
      if (s.locked[side]) return s;
      const cur = [...s.cur];
      if (idx != null) cur[side] = idx;
      const locked = [...s.locked];
      locked[side] = true;
      return { cur, locked };
    });
    audio.tone(660, 0.12, 0.05, 1.5, "square");
  };
  const clickFighter = (i) => {
    const s = ui.current.sel;
    if (ui.current.mode === "arcade") lock(0, i);
    else if (!s.locked[0]) lock(0, i);
    else if (!s.locked[1]) lock(1, i);
  };

  // both fighters locked → arena (VS) or ladder (Arcade)
  useEffect(() => {
    if (screen !== "select") return undefined;
    const done = mode === "arcade" ? sel.locked[0] : sel.locked[0] && sel.locked[1];
    if (!done) return undefined;
    const id = setTimeout(() => {
      if (ui.current.screen !== "select") return;
      if (mode === "arcade") {
        const fighter = FIGHTERS[sel.cur[0]].id;
        setSave((p) => ({ ...p, arcade: { ...p.arcade, fighter } }));
        setLadderCursor(Math.min(saveRef.current.arcade.unlocked, 30) - 1);
        setScreen("ladder");
      } else {
        setArenaCursor(0);
        setScreen("arena");
      }
    }, 650);
    return () => clearTimeout(id);
  }, [screen, mode, sel]);

  const onMatchOver = (m) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (m.cfg.mode === "arcade") setSave((p) => recordArcade(p, m.cfg.battle, m.winner === 0));
    else setSave((p) => recordVs(p, m.winner));
    setOverlay("result");
    setResultTick((n) => n + 1);
  };

  /* ------------------------------------------------------------ loop */

  function draw() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const fighting = ui.current.screen === "fight" && matchRef.current;
    const m = fighting ? matchRef.current : demoRef.current.m;
    if (!fighting && ui.current.screen === "arena" && ui.current.arenaCursor < ARENAS.length) m.cfg.arena = ARENAS[ui.current.arenaCursor].id;
    const v = viewRef.current;
    const key = `${m.cfg.arena}:${v.scale * v.dpr}`;
    if (bakeRef.current.key !== key) bakeRef.current = { key, canvas: bakeArena(m.cfg.arena, v.scale * v.dpr * MAX_ZOOM) };
    const cam = camRef.current;
    followCam(cam, m, cam.dt, cam.m !== m || m.phase === "intro");
    cam.m = m;
    cam.dt = 0;
    const names = fighting ? namesFor(m) : null;
    drawFrame(ctx, m, v, fxRef.current, bakeRef.current.canvas, timeRef.current, fighting ? { names: names.hud, bannerNames: names.banner, hitboxes: HITBOXES, cam } : { noHud: true, cam });
  }

  const tick = (m, ins, sound) => {
    for (const e of step(m, ins)) {
      if (sound) audio.event(e);
      spawnFx(fxRef.current, e, m);
    }
  };

  const frame = (dt) => {
    camRef.current.dt += dt;
    const { screen: sc, overlay: ov } = ui.current;
    const m = matchRef.current;
    if (sc === "fight" && m) {
      if (ov !== "pause") {
        timeRef.current += dt;
        accRef.current = Math.min(accRef.current + dt, 0.1);
        while (accRef.current >= DT) {
          accRef.current -= DT;
          const ins = inputRef.current.sample();
          if (aiRef.current) ins[1] = aiInput(aiRef.current, m, 1);
          tick(m, ins, true);
        }
        stepFx(fxRef.current, dt);
        if (m.phase === "over" && m.t >= RESULT_DELAY && !ov) onMatchOver(m);
      }
    } else {
      timeRef.current += dt;
      const d = demoRef.current;
      accRef.current = Math.min(accRef.current + dt, 0.1);
      while (accRef.current >= DT) {
        accRef.current -= DT;
        tick(d.m, [aiInput(d.ai[0], d.m, 0), aiInput(d.ai[1], d.m, 1)], false);
      }
      stepFx(fxRef.current, dt);
      if (d.m.phase === "over" && d.m.t > 150) {
        demoRef.current = newDemo();
        fxRef.current = [];
      }
    }
    draw();
  };
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    if (MANUAL) return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop); // scheduled first so one bad frame can't stop the loop
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frameRef.current(dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // fit the 960×540 view into the stage (letterboxed) at device resolution
  useEffect(() => {
    const el = stageRef.current;
    const fit = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvasRef.current;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const scale = Math.min(w / VIEW_W, h / VIEW_H);
      Object.assign(viewRef.current, { w, h, dpr, scale, ox: (w - VIEW_W * scale) / 2, oy: (h - VIEW_H * scale) / 2 });
      draw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  /* ------------------------------------------------------------ input */

  const inFight = screen === "fight" && !overlay;
  useEffect(() => {
    inputRef.current.setEnabled(inFight);
  }, [inFight]);

  const actions = useRef({});
  actions.current = { pause, resume, rematch, nextBattle, leaveFight, pickMode, pickArena, lock, openSelect, startArcade, setScreen, setOverlay, setSel, setModeCursor, setArenaCursor, setLadderCursor };

  useEffect(() => {
    const input = inputRef.current;
    const navOf = (code, merge) => {
      for (const side of [0, 1]) {
        const a = NAV[side][code];
        if (a) return [merge ? 0 : side, a];
      }
      if (code === "Enter" || code === "NumpadEnter") return [-1, "ok"];
      if (code === "Escape" || code === "Backspace") return [-1, "back"];
      return null;
    };
    const onDown = (e) => {
      audio.unlock();
      if (input.down(e)) return; // a fighter key while fighting
      if (e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      const u = ui.current;
      const a = actions.current;
      const k = e.code;
      const handled = () => e.preventDefault();

      if (u.screen === "fight") {
        if (k === "Escape" || k === "KeyP") {
          handled();
          if (u.overlay === "pause") a.resume();
          else if (!u.overlay) a.pause();
        } else if ((k === "Enter" || k === "NumpadEnter") && !e.repeat) {
          handled();
          if (u.overlay === "pause") a.resume();
          else if (u.overlay === "result") {
            const m = matchRef.current;
            if (m?.cfg.mode === "arcade" && m.winner === 0 && u.battleId < 30) a.nextBattle();
            else a.rematch();
          }
        } else if (u.overlay && (k.startsWith("Arrow") || k === "Space")) handled();
        return;
      }
      if (u.overlay) {
        if (k === "Escape" || ((k === "Enter" || k === "NumpadEnter") && u.overlay === "help")) {
          handled();
          a.setOverlay(null);
        }
        return;
      }
      if (e.repeat && !k.startsWith("Arrow") && !/^Key[ADWS]$/.test(k)) return;
      const nav = navOf(k, u.screen !== "select" || u.mode === "arcade");
      if (!nav) return;
      handled();
      const [side, act] = nav;
      switch (u.screen) {
        case "menu":
          if (act === "ok") a.setScreen("modes");
          break;
        case "modes":
          if (act === "left" || act === "right" || act === "up" || act === "down") a.setModeCursor((c) => 1 - c);
          else if (act === "ok") a.pickMode(u.modeCursor === 0 ? "vs" : "arcade");
          else if (act === "back") a.setScreen("menu");
          break;
        case "select": {
          const s = u.sel;
          const who = side < 0 ? (u.mode === "arcade" || !s.locked[0] ? 0 : 1) : side;
          if (act === "back") {
            if (s.locked[who]) a.setSel((x) => ({ ...x, locked: x.locked.map((l, i) => (i === who ? false : l)) }));
            else if (side < 0 || (!s.locked[0] && !s.locked[1])) {
              if (u.mode === "arcade" && (saveRef.current.arcade.unlocked > 1 || saveRef.current.arcade.cleared.length)) a.setScreen("ladder");
              else a.setScreen("modes");
            }
          } else if (act === "ok") a.lock(who);
          else if (!s.locked[who]) {
            const d = { left: -1, right: 1, up: -3, down: 3 }[act];
            a.setSel((x) => {
              const cur = [...x.cur];
              cur[who] = (cur[who] + d + 6) % 6;
              return { ...x, cur };
            });
            audio.click();
          }
          break;
        }
        case "arena":
          if (act === "left" || act === "up") a.setArenaCursor((c) => (c + 4) % 5);
          else if (act === "right" || act === "down") a.setArenaCursor((c) => (c + 1) % 5);
          else if (act === "ok") a.pickArena(u.arenaCursor);
          else if (act === "back") {
            a.setSel((x) => ({ ...x, locked: [false, false] }));
            a.setScreen("select");
          }
          break;
        case "ladder": {
          const max = Math.min(saveRef.current.arcade.unlocked, 30) - 1;
          const d = { left: -1, right: 1, up: -6, down: 6 }[act];
          if (d) a.setLadderCursor((c) => Math.max(0, Math.min(max, c + d)));
          else if (act === "ok") a.startArcade(u.ladderCursor + 1);
          else if (act === "back") a.setScreen("menu");
          break;
        }
        default:
      }
    };
    const onUp = (e) => input.up(e);
    const onBlur = () => {
      input.clear();
      actions.current.pause();
    };
    const onVis = () => document.hidden && onBlur();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (ui.current.screen === "fight") actions.current.rematch();
  }, [restartSignal]);

  if (TEST) {
    window.__sa = {
      match: () => matchRef.current,
      demo: () => demoRef.current,
      screen: () => ui.current.screen,
      overlay: () => ui.current.overlay,
      sel: () => ui.current.sel,
      save: () => saveRef.current,
      setSave,
      input: inputRef.current,
      ai: () => aiRef.current,
      startVs: (a, b, arena = "temple") => startVs(a, b, arena),
      startArcade: (id) => actions.current.startArcade(id),
      pause: () => actions.current.pause(),
      resume: () => actions.current.resume(),
      rematch: () => actions.current.rematch(),
      setScreen,
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) frameRef.current(dt);
      },
    };
  }

  /* ------------------------------------------------------------ view */

  const m = matchRef.current;
  const battle = BATTLES[battleId - 1];
  const dim = screen !== "fight";
  const unlock = () => audio.unlock();

  return (
    <div className="sa" onPointerDown={unlock}>
      <div ref={stageRef} className="sa-stage">
        <canvas ref={canvasRef} className="sa-canvas" />
        {dim && <div className="sa-dim" />}

        {screen === "fight" && !overlay && (
          <button type="button" className="sa-pause-btn" onClick={pause} aria-label="Pause" title="Pause (Esc / P)">❚❚</button>
        )}

        {screen === "menu" && !overlay && <MainMenu save={save} onPlay={() => setScreen("modes")} onHelp={() => setOverlay("help")} onSettings={() => setOverlay("settings")} />}
        {screen === "modes" && <ModeSelect cursor={modeCursor} save={save} onPick={pickMode} onBack={() => setScreen("menu")} />}
        {screen === "select" && (
          <FighterSelect
            mode={mode}
            sel={sel}
            onClickFighter={clickFighter}
            onBack={() => (mode === "arcade" && (save.arcade.unlocked > 1 || save.arcade.cleared.length) ? setScreen("ladder") : setScreen("modes"))}
          />
        )}
        {screen === "arena" && (
          <ArenaSelect
            cursor={arenaCursor}
            fighters={[FIGHTERS[sel.cur[0]].id, FIGHTERS[sel.cur[1]].id]}
            onPick={(i) => {
              setArenaCursor(i);
              pickArena(i);
            }}
            onBack={() => {
              setSel((x) => ({ ...x, locked: [false, false] }));
              setScreen("select");
            }}
          />
        )}
        {screen === "ladder" && <Ladder save={save} cursor={ladderCursor} onPick={startArcade} onChangeFighter={() => openSelect("arcade")} onBack={() => setScreen("menu")} />}

        {overlay === "help" && <HelpOverlay onClose={() => setOverlay(null)} />}
        {overlay === "settings" && (
          <SettingsOverlay
            save={save}
            onChange={(o) => setSave((p) => ({ ...p, settings: { ...p.settings, ...o } }))}
            confirmReset={confirmReset}
            setConfirmReset={setConfirmReset}
            onReset={() => {
              setSave((p) => ({ ...p, arcade: fresh().arcade }));
              setConfirmReset(false);
            }}
            onClose={() => {
              setConfirmReset(false);
              setOverlay(null);
            }}
          />
        )}
        {overlay === "pause" && (
          <PauseMenu
            mode={m?.cfg.mode}
            onResume={resume}
            onRestart={rematch}
            onFighters={() => {
              leaveFight("select");
              openSelect("vs");
            }}
            onLadder={() => leaveFight("ladder")}
            onMenu={() => leaveFight("menu")}
          />
        )}
        {overlay === "result" && m && (
          <ResultScreen
            mode={m.cfg.mode}
            match={m}
            battle={m.cfg.mode === "arcade" ? battle : null}
            names={namesFor(m).banner}
            onRematch={rematch}
            onNext={nextBattle}
            onFighters={() => {
              leaveFight("select");
              openSelect("vs");
            }}
            onLadder={() => leaveFight("ladder")}
            onMenu={() => leaveFight("menu")}
          />
        )}
      </div>
    </div>
  );
}
