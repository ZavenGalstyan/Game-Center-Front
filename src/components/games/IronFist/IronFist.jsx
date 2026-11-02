/**
 * Iron Fist: Arena Champions — a 3D arena fighting game for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Plain Three.js renders the world (render/world.js); the
 * fight is ONE deterministic fixed-step simulation (engine/fight.js) used by
 * both modes — only the input source of fighter 2 changes (engine/session.js):
 *   Arcade    P1 keyboard vs AI · 30 battles / 3 tournaments, progress saved
 *   Local VS  P1 keyboard vs P2 keyboard on the same computer (no AI)
 * React renders menus and the HUD; per-frame HUD values are written to the
 * DOM directly from the world's frame hook (no React re-render per frame).
 *
 * GamePlayer: `restartSignal` restarts the current fight (menu otherwise);
 * `muted` silences all audio; Fullscreen is handled by GamePlayer (the canvas
 * follows the stage via ResizeObserver).
 *
 * Save: localStorage `iron-fist-arena-progress` (unlocked battles, stars,
 * selected fighters, VS arena, graphics quality).
 * DEV test hooks: `?ifatest=1` → no rAF loop, window.__ifa (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./IronFist.css";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { createMatch } from "./engine/fight.js";
import { createSession } from "./engine/session.js";
import { createKeyboard, isEditable } from "./engine/input.js";
import { FIGHTERS, FIGHTER_BY_ID } from "./engine/fighters.js";
import { BATTLES, battleConfig, starsFor } from "./engine/arcade.js";
import { loadSave, writeSave, applyResult } from "./engine/save.js";
import { WINS_NEEDED } from "./engine/constants.js";
import { ARENAS } from "./render/arenas.js";
import { MainMenu, Controls, FighterSelect, TournamentSelect, ArenaSelect, Versus, Result, Champion, Pause } from "./ui/Screens.jsx";
import { FightHud, useHudRefs, updateHud } from "./ui/Hud.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("ifatest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => {
  if (NOSAVE) return memStore;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};
const IDS = FIGHTERS.map((f) => f.id);
const wrap = (i, n) => ((i % n) + n) % n;
const KEYS_HINT = {
  arcade: "Move A/D · Jump W · Block S · Punch F · Kick G · Special H · Dodge R   (arrows + J K L O work too) · Esc pause",
  vs: "P1: A/D W S · F G H · R      P2: ← → ↑ ↓ · J K L · O      Esc pause",
};

/** Menu keys → actions. Returns [action, player|null]. */
function menuAction(code) {
  switch (code) {
    case "KeyA":
      return ["left", 0];
    case "ArrowLeft":
      return ["left", 1];
    case "KeyD":
      return ["right", 0];
    case "ArrowRight":
      return ["right", 1];
    case "KeyW":
      return ["up", 0];
    case "ArrowUp":
      return ["up", 1];
    case "KeyS":
      return ["down", 0];
    case "ArrowDown":
      return ["down", 1];
    case "KeyF":
      return ["ok", 0];
    case "KeyJ":
      return ["ok", 1];
    case "Enter":
    case "Space":
      return ["ok", null];
    case "KeyG":
      return ["back", 0];
    case "KeyK":
      return ["back", 1];
    case "Escape":
    case "Backspace":
    case "KeyP":
      return ["back", null];
    default:
      return null;
  }
}

export default function IronFist({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const kbRef = useRef(null);
  const sessionRef = useRef(null);
  const cfgRef = useRef(null);
  const timers = useRef(new Set());
  const hudRefs = useHudRefs();

  const [boot, setBoot] = useState({ p: 0, err: null });
  const [screen, setScreenS] = useState("loading");
  const screenRef = useRef("loading");
  const [saveState] = useState(() => loadSave(store()));
  const [save, setSaveS] = useState(saveState.save);
  const saveRef = useRef(saveState.save);
  const [portraits, setPortraits] = useState({});
  const [mode, setMode] = useState("arcade");
  const [sel, setSel] = useState({ p1: saveState.save.selected, p2: saveState.save.vs.p2, ok1: false, ok2: false });
  const [battleId, setBattleId] = useState(saveState.save.unlocked);
  const [arenaSel, setArenaSel] = useState(saveState.save.vs.arena);
  const [cfg, setCfg] = useState(null);
  const [paused, setPausedS] = useState(false);
  const pausedRef = useRef(false);
  const [showPauseControls, setShowPauseControls] = useState(false);
  const [announce, setAnnounce] = useState(null);
  const [banner, setBanner] = useState(null);
  const [combos, setCombos] = useState([null, null]);
  const [wins, setWins] = useState([0, 0]);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const [hint, setHint] = useState(false);
  const [toast, setToast] = useState(saveState.corrupt ? "Your previous save was damaged and has been reset." : null);
  const [quality, setQualityS] = useState(saveState.save.quality);
  const [controlsFrom, setControlsFrom] = useState("menu");

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
  }, []);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenS(s);
  }, []);
  const commitSave = useCallback((fn) => {
    const next = fn(saveRef.current);
    saveRef.current = next;
    writeSave(next, store());
    setSaveS(next);
  }, []);

  /* ------------------------------------------------------------ keyboard state */
  const syncKeyboard = useCallback(() => {
    const kb = kbRef.current;
    if (!kb) return;
    kb.setEnabled(screenRef.current === "fight" && !pausedRef.current && !resultRef.current);
  }, []);
  const setPaused = useCallback(
    (v) => {
      pausedRef.current = v;
      setPausedS(v);
      worldRef.current?.setPaused(v);
      kbRef.current?.clear();
      if (!v) setShowPauseControls(false);
      syncKeyboard();
    },
    [syncKeyboard]
  );
  const togglePause = useCallback(() => {
    const m = worldRef.current?.match;
    if (screenRef.current !== "fight" || !m || m.phase === "matchOver" || resultRef.current) return;
    setPaused(!pausedRef.current);
  }, [setPaused]);

  /* ------------------------------------------------------------ world */
  useEffect(() => {
    const host = stageRef.current;
    const world = createWorld(host, { quality: saveRef.current.quality, test: TEST });
    worldRef.current = world;
    const kb = createKeyboard({ onPause: () => togglePause() });
    kb.attach();
    kb.setEnabled(false);
    kbRef.current = kb;
    let alive = true;
    world.setQuality(saveRef.current.quality);
    world.ready
      .then(() => {
        if (!alive) return null;
        setBoot({ p: 0.8, err: null });
        return world.portraits(IDS);
      })
      .then((p) => {
        if (!alive || !p) return null;
        setPortraits(p);
        setBoot({ p: 0.92, err: null });
        // the menu shows the Grand Arena: build it first so its materials warm up too
        world.setArena("grand");
        return world.warmup();
      })
      .then(() => {
        if (!alive) return;
        setBoot({ p: 1, err: null });
        setScreen("menu");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setBoot({ p: 0, err: "The fighter models failed to load. Check your connection and press Restart." });
      });
    const fit = () => {
      const r = host.getBoundingClientRect();
      world.resize(r.width || 1280, r.height || 720);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(host);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    const offFrame = world.onFrame((m, dt) => {
      if (screenRef.current === "fight") updateHud(hudRefs, m, dt);
    });
    // pause when the window loses focus mid-fight (keys are released by the keyboard module)
    const onBlur = () => {
      const m = world.match;
      if (screenRef.current === "fight" && m && m.phase !== "matchOver" && !pausedRef.current && !resultRef.current) setPaused(true);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      alive = false;
      clearTimers();
      offFrame();
      ro?.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", fit);
      kb.detach();
      kbRef.current = null;
      world.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ fight events */
  const finish = useCallback(
    (m) => {
      const c = cfgRef.current;
      if (!c || !m.result) return;
      const r = { ...m.result, stars: c.mode === "arcade" ? starsFor(m.result) : 0 };
      if (c.mode === "arcade") commitSave((s) => applyResult(s, c.battle, c.fighters[0], m.result, Math.round(m.time)));
      resultRef.current = r;
      setResult(r);
      syncKeyboard();
      if (c.mode === "arcade" && c.battle === BATTLES.length && r.winner === 0) {
        audio.fanfare();
        setScreen("champion");
        worldRef.current?.setShowcase({ arena: "grand", fighters: [{ id: c.fighters[0], x: 0, facing: 1, state: "win" }], look: [0, 1.1, 0], dist: 3.6, height: 1.5, yaw: 0.6, orbit: 0.9 });
      } else if (r.winner === 0 || c.mode === "vs") audio.fanfare();
    },
    [commitSave, setScreen, syncKeyboard]
  );

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return undefined;
    let comboKey = 0;
    let annKey = 0;
    const ann = (text, kind = "big", sub = null, ms = 1100) => {
      const key = ++annKey;
      setAnnounce({ text, kind, sub, key });
      later(() => setAnnounce((a) => (a?.key === key ? null : a)), ms);
    };
    return world.onEvent((e, m) => {
      if (!m || screenRef.current !== "fight") {
        if (e.type === "quality") {
          setQualityS(e.quality);
          commitSave((s) => ({ ...s, quality: e.quality }));
        }
        return;
      }
      const c = cfgRef.current;
      switch (e.type) {
        case "round":
          setWins([...m.wins]);
          setBanner(null);
          ann(e.final ? "FINAL ROUND" : `ROUND ${e.round}`, "round", null, 1500);
          audio.say(e.final ? "Final round" : `Round ${e.round}`);
          break;
        case "fight":
          ann("FIGHT!", "fight", null, 800);
          audio.say("Fight!", { rate: 1.1 });
          break;
        case "ko":
          ann(e.double ? "DOUBLE K.O." : "K.O.", "ko", null, 1600);
          audio.say(e.double ? "Double K O" : "K O", { rate: 0.8 });
          break;
        case "timeUp":
          ann("TIME!", "ko", null, 1400);
          audio.say("Time");
          break;
        case "roundEnd": {
          setWins([...m.wins]);
          later(() => {
            if (screenRef.current !== "fight") return;
            const w = e.winner;
            const nm = w < 0 ? null : c.mode === "vs" ? `Player ${w + 1}` : w === 0 ? FIGHTER_BY_ID[c.fighters[0]].name : `${c.alt?.[1] ? "Dark " : ""}${FIGHTER_BY_ID[c.fighters[1]].name}`;
            setBanner({ key: Date.now(), text: w < 0 ? "DRAW ROUND" : `${nm} wins round ${e.round}`, sub: e.reason === "perfect" ? "PERFECT!" : e.reason === "time" ? "Time out — more health remaining" : e.reason === "double" ? "Double knock-out" : null });
            if (e.reason === "perfect") audio.say("Perfect!");
          }, 1300);
          break;
        }
        case "matchOver":
          setWins([...m.wins]);
          later(() => {
            setBanner(null);
            if (screenRef.current === "fight" && worldRef.current?.match === m) finish(m);
          }, 2600);
          break;
        case "hit":
          if (e.combo >= 2) {
            const key = ++comboKey;
            setCombos((cs) => {
              const n = [...cs];
              n[e.side] = { n: e.combo, key };
              return n;
            });
            later(() => setCombos((cs) => (cs[e.side]?.key === key ? (e.side ? [cs[0], null] : [null, cs[1]]) : cs)), 1200);
          }
          break;
        case "quality":
          setQualityS(e.quality);
          commitSave((s) => ({ ...s, quality: e.quality }));
          setToast("Graphics lowered to Medium to keep the fight smooth.");
          break;
        default:
          break;
      }
    });
  }, [screen === "loading" ? 0 : 1, later, finish, commitSave]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ fights */
  const buildCfg = useCallback(
    (m) => {
      if (m === "arcade") {
        const c = battleConfig(battleId, sel.p1);
        return { mode: "arcade", battle: c.battle.id, fighters: c.match.fighters, arena: c.battle.arena, alt: c.match.alt, mods: c.match.mods, boss: [false, c.battle.boss], ai: c.ai, battleTitle: c.battle.title };
      }
      return { mode: "vs", fighters: [sel.p1, sel.p2], arena: arenaSel, alt: [false, sel.p1 === sel.p2], mods: [{}, {}], boss: [false, false] };
    },
    [battleId, sel.p1, sel.p2, arenaSel]
  );

  const beginFight = useCallback(
    (c) => {
      const world = worldRef.current;
      const kb = kbRef.current;
      if (!world || !kb || screenRef.current === "loading") return;
      clearTimers();
      cfgRef.current = c;
      setCfg(c);
      const m = createMatch({ fighters: c.fighters, arena: c.arena, mode: c.mode, mods: c.mods, alt: c.alt, battle: c.battle });
      const session = createSession({ mode: c.mode, keyboard: kb, ai: c.ai, seed: (Date.now() & 0xffff) + 1 });
      sessionRef.current = session;
      world.startMatch(m, session, { boss: c.boss });
      hudRefs.lagV = [1, 1];
      resultRef.current = null;
      setResult(null);
      setBanner(null);
      setAnnounce(null);
      setCombos([null, null]);
      setWins([0, 0]);
      pausedRef.current = false;
      setPausedS(false);
      setShowPauseControls(false);
      setScreen("fight");
      kb.clear();
      syncKeyboard();
      setHint(true);
      later(() => setHint(false), 7000);
    },
    [clearTimers, setScreen, syncKeyboard, later, hudRefs]
  );

  const showVersus = useCallback(
    (c) => {
      cfgRef.current = c;
      setCfg(c);
      setScreen("versus");
      clearTimers();
      worldRef.current?.setShowcase({ arena: c.arena, fighters: [{ id: c.fighters[0], alt: c.alt[0], x: -0.95, facing: 1 }, { id: c.fighters[1], alt: c.alt[1], boss: c.boss[1], x: 0.95, facing: -1 }], look: [0, 1.15, 0], dist: 5.4, height: 1.5, yaw: 0, orbit: 0.15 });
      audio.say(`${FIGHTER_BY_ID[c.fighters[0]].name} versus ${FIGHTER_BY_ID[c.fighters[1]].name}`, { rate: 0.95 });
      later(() => {
        if (screenRef.current === "versus") beginFight(c);
      }, 2600);
    },
    [setScreen, clearTimers, later, beginFight]
  );

  const leaveFight = useCallback(() => {
    clearTimers();
    worldRef.current?.stopMatch();
    worldRef.current?.setPaused(false);
    pausedRef.current = false;
    setPausedS(false);
    resultRef.current = null;
    setResult(null);
    setBanner(null);
    setAnnounce(null);
    syncKeyboard();
  }, [clearTimers, syncKeyboard]);

  const goMenu = useCallback(() => {
    leaveFight();
    setScreen("menu");
    syncKeyboard();
  }, [leaveFight, setScreen, syncKeyboard]);

  const restartFight = useCallback(() => {
    const c = cfgRef.current;
    if (!c) return;
    beginFight(c);
  }, [beginFight]);

  // GamePlayer Restart
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    if (screenRef.current === "loading") return;
    if (screenRef.current === "fight" && cfgRef.current) restartFight();
    else goMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  /* ------------------------------------------------------------ showcases per screen */
  useEffect(() => {
    const w = worldRef.current;
    if (!w || screen === "loading") return;
    if (screen === "menu" || screen === "controls") w.setShowcase({ arena: "grand", fighters: [{ id: "ryuzen", x: -1.0, facing: 1 }, { id: "storm", x: 1.0, facing: -1 }], look: [0, 1.15, 0], dist: 5.0, height: 1.4, yaw: 0.3, orbit: 0.35 });
    else if (screen === "select") {
      if (mode === "vs") w.setShowcase({ arena: "grand", fighters: [{ id: sel.p1, x: -0.85, facing: 1 }, { id: sel.p2, alt: sel.p1 === sel.p2, x: 0.85, facing: -1 }], look: [0, 1.15, 0], dist: 4.1, height: 1.35, yaw: 0, orbit: 0.12 });
      else w.setShowcase({ arena: "grand", fighters: [{ id: sel.p1, x: 0.15, facing: 1 }], look: [0.45, 1.1, 0], dist: 3.3, height: 1.4, yaw: 0.85, orbit: 0.18 });
    } else if (screen === "tournament") {
      const b = BATTLES[battleId - 1];
      w.setShowcase({ arena: b.arena, fighters: [{ id: sel.p1, x: -0.9, facing: 1 }, { id: b.opponent, alt: b.opponent === sel.p1, boss: b.boss, x: 0.9, facing: -1 }], look: [0.2, 1.15, 0], dist: 4.6, height: 1.45, yaw: 0.15, orbit: 0.12 });
    } else if (screen === "arena") w.setShowcase({ arena: arenaSel, fighters: [{ id: sel.p1, x: -0.95, facing: 1 }, { id: sel.p2, alt: sel.p1 === sel.p2, x: 0.95, facing: -1 }], look: [0, 1.3, 0], dist: 6.2, height: 1.9, yaw: 0.2, orbit: 0.3 });
  }, [screen, mode, sel.p1, sel.p2, battleId, arenaSel]);

  /* ------------------------------------------------------------ menu navigation */
  const openSelect = useCallback(
    (m) => {
      setMode(m);
      setSel((s) => ({ ...s, ok1: false, ok2: false }));
      setScreen("select");
    },
    [setScreen]
  );

  const pick = useCallback(
    (id, who) => {
      audio.ui("move");
      setSel((s) => {
        if (mode !== "vs") return { ...s, p1: id };
        const p = who ?? (!s.ok1 ? 0 : 1);
        if (p === 0 && !s.ok1) return { ...s, p1: id };
        if (p === 1 && !s.ok2) return { ...s, p2: id };
        return s;
      });
    },
    [mode]
  );
  const confirmSelect = useCallback(
    (who = null) => {
      audio.ui("ok");
      if (mode !== "vs") {
        commitSave((s) => ({ ...s, selected: sel.p1 }));
        setBattleId((b) => Math.min(b, saveRef.current.unlocked));
        setScreen("tournament");
        return;
      }
      const next = { ...sel };
      if (who === 0) next.ok1 = true;
      else if (who === 1) next.ok2 = true;
      else if (!next.ok1) next.ok1 = true;
      else next.ok2 = true;
      setSel(next);
      if (next.ok1 && next.ok2) {
        commitSave((s) => ({ ...s, vs: { ...s.vs, p1: next.p1, p2: next.p2 } }));
        later(() => screenRef.current === "select" && setScreen("arena"), 450);
      }
    },
    [mode, sel, commitSave, setScreen, later]
  );

  const startArcade = useCallback(() => {
    if (battleId > saveRef.current.unlocked) {
      audio.ui("locked");
      return;
    }
    audio.ui("ok");
    showVersus(buildCfg("arcade"));
  }, [battleId, buildCfg, showVersus]);
  const startVs = useCallback(() => {
    audio.ui("ok");
    commitSave((s) => ({ ...s, vs: { ...s.vs, arena: arenaSel } }));
    showVersus(buildCfg("vs"));
  }, [arenaSel, buildCfg, commitSave, showVersus]);

  const nextBattle = useCallback(() => {
    const c = cfgRef.current;
    if (!c?.battle) return;
    const nb = Math.min(BATTLES.length, c.battle + 1);
    leaveFight();
    setBattleId(nb);
    const bc = battleConfig(nb, c.fighters[0]);
    showVersus({ mode: "arcade", battle: nb, fighters: bc.match.fighters, arena: bc.battle.arena, alt: bc.match.alt, mods: bc.match.mods, boss: [false, bc.battle.boss], ai: bc.ai, battleTitle: bc.battle.title });
  }, [leaveFight, showVersus]);

  const setQuality = useCallback(
    (k) => {
      worldRef.current?.setQuality(k);
      setQualityS(k);
      commitSave((s) => ({ ...s, quality: k }));
    },
    [commitSave]
  );

  const menuRef = useRef(null);
  menuRef.current = (act, who, e) => {
    const s = screenRef.current;
    if (s === "menu") {
      const btns = [...(rootRef.current?.querySelectorAll(".ifa-menu__nav > .ifa-btn") || [])];
      const i = Math.max(0, btns.indexOf(document.activeElement));
      if (act === "up" || act === "down") {
        btns[wrap(i + (act === "up" ? -1 : 1), btns.length)]?.focus();
        audio.ui("move");
      } else if (act === "ok") {
        if (document.activeElement && btns.includes(document.activeElement)) document.activeElement.click();
        else btns[0]?.click();
        e?.preventDefault();
      }
    } else if (s === "controls") {
      if (act === "back" || act === "ok") setScreen(controlsFrom);
    } else if (s === "select") {
      if (act === "left" || act === "right") {
        const d = act === "left" ? -1 : 1;
        if (mode === "vs") {
          const p = who ?? 0;
          if (p === 0 && !sel.ok1) pick(IDS[wrap(IDS.indexOf(sel.p1) + d, IDS.length)], 0);
          if (p === 1 && !sel.ok2) pick(IDS[wrap(IDS.indexOf(sel.p2) + d, IDS.length)], 1);
        } else pick(IDS[wrap(IDS.indexOf(sel.p1) + d, IDS.length)]);
      } else if (act === "ok") confirmSelect(mode === "vs" ? who : null);
      else if (act === "back") {
        audio.ui("back");
        if (mode === "vs" && who === 0 && sel.ok1) setSel({ ...sel, ok1: false });
        else if (mode === "vs" && who === 1 && sel.ok2) setSel({ ...sel, ok2: false });
        else setScreen("menu");
      }
    } else if (s === "tournament") {
      const b = BATTLES[battleId - 1];
      if (act === "left" || act === "right") {
        const nb = Math.max(1, Math.min(BATTLES.length, battleId + (act === "left" ? -1 : 1)));
        if (Math.floor((nb - 1) / 10) === b.tIndex) {
          setBattleId(nb);
          audio.ui("move");
        }
      } else if (act === "up" || act === "down") {
        const t = Math.max(0, Math.min(2, b.tIndex + (act === "up" ? -1 : 1)));
        const first = t * 10 + 1;
        if (first <= saveRef.current.unlocked) {
          setBattleId(Math.min(saveRef.current.unlocked, first + 9));
          audio.ui("move");
        } else audio.ui("locked");
      } else if (act === "ok") startArcade();
      else if (act === "back") {
        audio.ui("back");
        setScreen("menu");
      }
    } else if (s === "arena") {
      const ids = ARENAS.map((a) => a.id);
      if (act === "left" || act === "right") {
        setArenaSel(ids[wrap(ids.indexOf(arenaSel) + (act === "left" ? -1 : 1), ids.length)]);
        audio.ui("move");
      } else if (act === "ok") startVs();
      else if (act === "back") {
        audio.ui("back");
        setSel((x) => ({ ...x, ok1: false, ok2: false }));
        setScreen("select");
      }
    } else if (s === "versus") {
      if (act === "ok") {
        clearTimers();
        beginFight(cfgRef.current);
      }
    } else if (s === "fight") {
      if (pausedRef.current) {
        if (act === "back") setPaused(false);
      } else if (resultRef.current) {
        if (act === "ok") {
          const go = rootRef.current?.querySelector(".ifa-result .ifa-btn--go");
          go?.click();
        }
      }
    } else if (s === "champion") {
      if (act === "ok" || act === "back") goMenu();
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      // the fight keyboard (registered first) already handled it — e.g. Esc that just paused
      if (e.defaultPrevented || isEditable(e.target)) return;
      const s = screenRef.current;
      if (s === "loading") return;
      // during live combat the fight keyboard owns the keys
      if (s === "fight" && !pausedRef.current && !resultRef.current) return;
      const a = menuAction(e.code);
      if (!a) return;
      // only claim keys while the game is on screen
      const r = rootRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.code.startsWith("Arrow") || e.code === "Space" || e.code === "Backspace") e.preventDefault();
      if (e.repeat && a[0] === "ok") return;
      menuRef.current(a[0], a[1], e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // first gesture unlocks audio
  useEffect(() => {
    const el = rootRef.current;
    const unlock = () => audio.unlock();
    el?.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      el?.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // focus the first menu button so Enter works immediately
  useEffect(() => {
    if (screen === "menu") rootRef.current?.querySelector(".ifa-menu__nav > .ifa-btn")?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  /* ------------------------------------------------------------ DEV test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ifa = {
      get world() {
        return worldRef.current;
      },
      get match() {
        return worldRef.current?.match;
      },
      get session() {
        return sessionRef.current;
      },
      get keyboard() {
        return kbRef.current;
      },
      get screen() {
        return screenRef.current;
      },
      get save() {
        return saveRef.current;
      },
      get paused() {
        return pausedRef.current;
      },
      get result() {
        return resultRef.current;
      },
      fight(c) {
        beginFight(c);
      },
      arcade(id, fighter) {
        const bc = battleConfig(id, fighter);
        beginFight({ mode: "arcade", battle: id, fighters: bc.match.fighters, arena: bc.battle.arena, alt: bc.match.alt, mods: bc.match.mods, boss: [false, bc.battle.boss], ai: bc.ai, battleTitle: bc.battle.title });
      },
      vs(a, b, arena = "temple") {
        beginFight({ mode: "vs", fighters: [a, b], arena, alt: [false, a === b], mods: [{}, {}], boss: [false, false] });
      },
      menu: () => goMenu(),
      go: (s) => setScreen(s),
      pause: (v) => setPaused(v),
    };
    return () => {
      delete window.__ifa;
    };
  }, [beginFight, goMenu, setScreen, setPaused]);

  /* ------------------------------------------------------------ render */
  const inFight = screen === "fight" && cfg;
  return (
    <div className="ifa" ref={rootRef} tabIndex={-1} onContextMenu={(e) => e.preventDefault()}>
      <div className="ifa-stage" ref={stageRef} />
      {screen === "loading" && (
        <div className="ifa-screen ifa-loading">
          <div className="ifa-logo">
            <div className="ifa-logo__top">IRON FIST</div>
            <div className="ifa-logo__sub">ARENA CHAMPIONS</div>
          </div>
          {boot.err ? (
            <p className="ifa-error">{boot.err}</p>
          ) : (
            <>
              <div className="ifa-loadbar">
                <i style={{ transform: `scaleX(${Math.max(0.06, boot.p)})` }} />
              </div>
              <p className="dim">Preparing fighters…</p>
            </>
          )}
        </div>
      )}
      {screen === "menu" && (
        <MainMenu
          save={save}
          quality={quality}
          onQuality={setQuality}
          onArcade={() => {
            audio.ui("ok");
            openSelect("arcade");
          }}
          onVs={() => {
            audio.ui("ok");
            openSelect("vs");
          }}
          onControls={() => {
            setControlsFrom("menu");
            setScreen("controls");
          }}
        />
      )}
      {screen === "controls" && <Controls onBack={() => setScreen(controlsFrom)} />}
      {screen === "select" && <FighterSelect mode={mode} sel={sel} portraits={portraits} onPick={pick} onConfirm={confirmSelect} onBack={() => setScreen("menu")} />}
      {screen === "tournament" && (
        <TournamentSelect
          save={save}
          fighter={sel.p1}
          battleId={Math.min(battleId, BATTLES.length)}
          portraits={portraits}
          onSelect={(id) => {
            audio.ui("move");
            setBattleId(id);
          }}
          onFight={startArcade}
          onFighter={() => openSelect("arcade")}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "arena" && <ArenaSelect arena={arenaSel} onPick={(a) => (audio.ui("move"), setArenaSel(a))} onConfirm={startVs} onBack={() => setScreen("select")} />}
      {screen === "versus" && cfg && <Versus cfg={cfg} portraits={portraits} />}
      {inFight && <FightHud cfg={cfg} wins={wins} need={WINS_NEEDED} refs={hudRefs} portraits={portraits} announce={announce} banner={banner} combos={combos} hint={hint && !paused} keysHint={KEYS_HINT[cfg.mode]} />}
      {inFight && paused && (
        <Pause
          showControls={showPauseControls}
          onResume={() => setPaused(false)}
          onRestart={restartFight}
          onControls={() => setShowPauseControls((v) => !v)}
          onQuit={goMenu}
        />
      )}
      {inFight && result && (
        <Result
          result={result}
          cfg={cfg}
          onNext={cfg.mode === "arcade" && result.winner === 0 && cfg.battle < BATTLES.length ? nextBattle : null}
          onRetry={restartFight}
          onTournament={() => {
            leaveFight();
            setBattleId(Math.min(saveRef.current.unlocked, cfg.battle + (result.winner === 0 ? 1 : 0)));
            setScreen("tournament");
          }}
          onFighters={() => {
            leaveFight();
            openSelect(cfg.mode);
          }}
          onArena={() => {
            leaveFight();
            setScreen("arena");
          }}
          onMenu={goMenu}
        />
      )}
      {screen === "champion" && cfg && (
        <Champion
          fighter={cfg.fighters[0]}
          save={save}
          onMenu={goMenu}
          onTournament={() => {
            leaveFight();
            setBattleId(BATTLES.length);
            setScreen("tournament");
          }}
        />
      )}
      {toast && <div className="ifa-toast">{toast}</div>}
    </div>
  );
}
