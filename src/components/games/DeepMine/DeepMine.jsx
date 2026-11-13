/**
 * Deep Mine: The Forgotten Ones — a first-person horror shooter with simple
 * escape-room puzzles across twelve levels of an abandoned mine.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). engine/sim.js is the framework-free simulation, stepped
 * here at ≤ 1/60 s; render/world.js mirrors it in plain Three.js; React draws
 * menus and a HUD refreshed ~10×/s (crosshair, hit marker, vignette and the
 * objective marker are imperative). Progress persists in localStorage.
 *
 * GamePlayer: `restartSignal` restarts the current level; `muted` silences
 * audio; fullscreen is GamePlayer's (the canvas follows the stage size).
 *
 * DEV hooks: `?dmtest=1` (+`&nosave=1` keeps saves in memory, `&dmmanual=1`
 * stops requestAnimationFrame) exposes window.__dm — see tools/harness.mjs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DeepMine.css";
import { createSim, step as simStep, objectiveInfo, objectiveTarget, bossInfo, levelReport, enterCode, WEAPONS } from "./engine/sim.js";
import { LEVELS, LEVEL_BY_ID } from "./engine/levels.js";
import { loadProgress, saveProgress, freshProgress, completeLevel, continueLevel, SAVE_KEY } from "./engine/save.js";
import { createWorld } from "./render/world.js";
import { createInput, lockKeyboard, GAME_KEYS } from "./ui/input.js";
import { audio } from "./audio.js";
import { Hud } from "./ui/Hud.jsx";
import { MainMenu, LevelSelect, Briefing, Help, Settings, Pause, GameOver, LevelComplete, Victory, NoteView, Keypad } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("dmtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const MANUAL = TEST && PARAMS.has("dmmanual");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => {
  if (NOSAVE) return memStore;
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
};
const STEP = 1 / 60;
const MENU_SCREENS = new Set(["menu", "levels", "briefing", "victory"]);

export default function DeepMine({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const botRef = useRef(null);
  const T = useRef({ hud: 0, hpLag: 100, hitT: 9, hitKind: "", deadT: 0, doneT: 0, objFlash: 0, armorPh: new Map() });
  const fx = { cross: useRef(null), hit: useRef(null), vignette: useRef(null), blackout: useRef(null), dir: useRef(null), marker: useRef(null), markerDist: useRef(null) };

  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("menu");
  const screenRef = useRef("menu");
  const [overlay, setOverlayState] = useState(null); // pause | dead | complete
  const overlayRef = useRef(null);
  const [sub, setSubState] = useState(null); // help | settings | {note} | {keypad}
  const [kpEntry, setKpEntry] = useState("");
  const [kpStatus, setKpStatus] = useState("");
  const kpRef = useRef({ entry: "", busy: false });
  const subRef = useRef(null);
  const [levelId, setLevelId] = useState(1);
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [report, setReport] = useState(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lockPausedAt = useRef(0);
  const [webglError, setWebglError] = useState(null);
  const settings = progress.settings;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const setSub = useCallback((s) => {
    subRef.current = s;
    setSubState(s);
  }, []);
  const openSub = useCallback(
    (s) => {
      subRef.current = s;
      setSubState(s);
      inputRef.current.clear();
      try {
        if (document.pointerLockElement) document.exitPointerLock?.();
      } catch {
        /* ignore */
      }
    },
    [],
  );
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressState(p);
    saveProgress(p, store());
  }, []);
  const setSetting = useCallback(
    (k, v) => {
      const p = progressRef.current;
      setProgress({ ...p, settings: { ...p.settings, [k]: v } });
    },
    [setProgress],
  );

  /* ------------------------------------------------------------ toasts */
  const toastId = useRef(0);
  const toastTimers = useRef(new Set());
  const toast = useCallback((text, kind = "info", ms = 2400) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.filter((t) => t.text !== text).slice(-2), { id, text, kind }]);
    const tm = setTimeout(() => {
      toastTimers.current.delete(tm);
      setToasts((l) => l.filter((x) => x.id !== id));
    }, ms);
    toastTimers.current.add(tm);
  }, []);
  const clearToasts = useCallback(() => {
    for (const tm of toastTimers.current) clearTimeout(tm);
    toastTimers.current.clear();
    setToasts([]);
  }, []);
  useEffect(() => clearToasts, [clearToasts]);

  /* ------------------------------------------------------------ settings → input / audio / gfx */
  useEffect(() => {
    inputRef.current.sens = settings.sens;
    inputRef.current.invertY = settings.invertY;
  }, [settings.sens, settings.invertY]);
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setVolume(settings.volume);
  }, [settings.volume]);
  useEffect(() => {
    audio.setAmbience(settings.music);
  }, [settings.music]);
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
  }, [settings.quality]);
  useEffect(() => {
    worldRef.current?.setBrightness(settings.brightness);
  }, [settings.brightness]);
  useEffect(() => () => audio.stopAll(), []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) return;
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* drag-to-look fallback */
    }
  }, []);
  const releaseLock = useCallback(() => {
    inputRef.current.clear();
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      if (!l) {
        inputRef.current.clear();
        const S = simRef.current;
        if (screenRef.current === "play" && !overlayRef.current && !subRef.current && S && S.status === "play") {
          lockPausedAt.current = performance.now();
          setOverlay("pause");
        }
      }
    };
    const onFs = () => lockKeyboard(!!document.fullscreenElement && !!rootRef.current && document.fullscreenElement.contains(rootRef.current));
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("fullscreenchange", onFs);
      lockKeyboard(false);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ level flow */
  const startLevel = useCallback(
    (id) => {
      const S = createSim(id, { difficulty: progressRef.current.settings.difficulty });
      simRef.current = S;
      worldRef.current?.setLevel(S);
      const Tm = T.current;
      Tm.deadT = 0;
      Tm.doneT = 0;
      Tm.hpLag = 100;
      Tm.hud = 0;
      Tm.hitT = 9;
      Tm.armorPh = new Map();
      inputRef.current.clear();
      clearToasts();
      setReport(null);
      setLevelId(id);
      setSub(null);
      setOverlay(null);
      setScreen("play");
      setHud(null);
      audio.unlock();
      audio.stopAmbient();
      audio.startAmbient(id, S.L.theme === "machinery" || S.L.theme === "lab" || S.L.theme === "elevator");
      requestLock();
      if (TEST) lockedRef.current = true;
    },
    [clearToasts, requestLock, setOverlay, setScreen, setSub],
  );

  const toMenu = useCallback(
    (s = "menu") => {
      releaseLock();
      simRef.current = null;
      clearToasts();
      setOverlay(null);
      setSub(null);
      setScreen(s);
      audio.stopAmbient();
    },
    [clearToasts, releaseLock, setOverlay, setScreen, setSub],
  );

  const openBriefing = useCallback(
    (id) => {
      audio.unlock();
      setLevelId(id);
      setScreen("briefing");
    },
    [setScreen],
  );

  /* ------------------------------------------------------------ sim events → audio / HUD */
  const handleEvents = useCallback(
    (S, evs) => {
      const Tm = T.current;
      const P = S.P;
      for (const e of evs) {
        switch (e.type) {
          case "shot":
            if (e.w === "shotgun") audio.shotgun();
            else if (e.w === "flare") audio.flare();
            else audio.pistol();
            if (e.hit) {
              Tm.hitT = 0;
              Tm.hitKind = e.head ? "head" : "";
              audio.hitmark(e.head);
            }
            break;
          case "dry":
            audio.dry();
            break;
          case "reload":
            audio.reload(e.w);
            break;
          case "switch":
            if (e.s) audio.lever(false);
            else audio.switchWeapon();
            break;
          case "seqFail":
            audio.lever(true);
            break;
          case "flash":
            audio.flashClick(e.on);
            break;
          case "hurt":
            if (e.dmg > 0) audio.hurt(e.kind);
            break;
          case "edie":
            audio.enemyDie(e.e.type, e.e.x, e.e.z);
            Tm.hitT = 0;
            Tm.hitKind = "kill";
            if (e.e.type === "brute" && S.id !== 12) toast("The cave brute is down!", "good", 2400);
            break;
          case "alert":
          case "growl":
            audio.voice(e.e.type, e.e.x, e.e.z, e.type === "alert" ? 1 : 0.7);
            break;
          case "roarSmall":
            audio.voice("brute", e.e.x, e.e.z, 1.1);
            break;
          case "strike":
            audio.enemyStrike(e.e.type, e.e.x, e.e.z);
            break;
          case "spawn":
            audio.rockBreak(e.e.x, e.e.z, false);
            break;
          case "bossIntro":
            audio.bossIntro(e.e.x, e.e.z);
            toast(S.id === 12 ? "The Forgotten King awakens!" : "A cave brute blocks your way!", "warn", 3200);
            break;
          case "roar":
            audio.roar(e.e.x, e.e.z);
            if (!e.summon) toast("The brute is enraged!", "warn", 2400);
            break;
          case "bruteWind":
            if (e.atk === "charge") audio.chargeWarn(e.e.x, e.e.z);
            break;
          case "slam":
          case "crash":
            audio.slam(e.e.x, e.e.z);
            if (e.type === "crash") toast("The brute is dazed! Hit it now!", "good", 1800);
            break;
          case "throw":
          case "charge":
            audio.whoosh(e.e.x, e.e.z);
            break;
          case "boom":
            audio.boom(e.x, e.z);
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land();
            break;
          case "note":
            audio.paper();
            openSub({ note: e.n });
            break;
          case "keypad":
            audio.keypadBeep();
            openSub({ keypad: e.k });
            break;
          case "codeOk":
            audio.code(true);
            break;
          case "codeFail":
            audio.code(false);
            break;
          case "machine":
            if (e.m.kind === "g") audio.generator(e.m.x, e.m.z);
            else audio.elevator(e.m.x, e.m.z);
            break;
          case "cart":
            audio.cart(e.c.x, e.c.z);
            break;
          case "crackHit":
            audio.rockBreak(e.ck.x, e.ck.z, false);
            break;
          case "crack":
            audio.rockBreak(e.ck.x, e.ck.z, true);
            break;
          case "door":
            audio.door(e.d.x, e.d.z, false);
            if (e.forced) toast("Something broke through a door!", "warn", 1800);
            break;
          case "gate":
            audio.door(e.x, e.z, true);
            break;
          case "doorBang":
            audio.doorBang(e.d.x, e.d.z);
            break;
          case "denied":
            audio.denied();
            break;
          case "pickup":
            audio.pickup(e.kind);
            if (e.text) toast(e.text, "GSYkux".includes(e.kind) ? "good" : "info", "GSY".includes(e.kind) ? 3400 : 1800);
            break;
          case "msg":
            toast(e.text, e.kind || "info", 2800);
            break;
          case "wave":
            toast(`Wave ${e.n} of ${e.of}`, "warn", 2200);
            audio.voice("crawler", P.x + 6, P.z, 1.2);
            break;
          case "step":
            audio.objective();
            Tm.objFlash = 1.2;
            Tm.hud = 0;
            break;
          case "exitOpen":
            if (S.step > 0) toast("The exit is unlocked!", "good", 2600);
            break;
          case "scare":
            audio.scare(e.kind, e.x, e.z);
            break;
          case "foot":
            audio.step(P.x, P.z, false);
            break;
          case "complete":
            audio.complete();
            break;
          default:
        }
      }
      worldRef.current?.onEvents(evs);
    },
    [toast, openSub],
  );

  /* ------------------------------------------------------------ HUD snapshot */
  const snapshot = useCallback((S) => {
    const P = S.P;
    const Tm = T.current;
    const A = P.w ? P.ammo[P.w] : null;
    let status = null;
    if (A) {
      if (P.reloadT > 0) status = "Reloading…";
      else if (A.mag === 0 && A.res > 0) status = "Press R to reload";
      else if (A.mag === 0 && A.res === 0) status = "Out of ammo";
    }
    return {
      level: S.id,
      levelName: S.L.name,
      obj: objectiveInfo(S),
      objFlash: Tm.objFlash > 0,
      hp: P.hp,
      maxHp: P.maxHp,
      hpLag: Tm.hpLag,
      stamina: P.stamina,
      w: P.w,
      owned: { ...P.owned },
      flash: P.flash,
      battery: P.battery,
      keys: S.keys,
      carry: ["u", "x"].filter((k) => S.machines.some((m) => !m.on && m.need.item === k) && (S.count[k] || 0) > 0).map((k) => ({ kind: k, n: S.count[k] })),
      mag: A ? A.mag : 0,
      res: A ? A.res : 0,
      prompt: S.prompt,
      boss: bossInfo(S),
      status,
    };
  }, []);

  /* ------------------------------------------------------------ main loop */
  const tick = useCallback(
    (dt) => {
      const w = worldRef.current;
      if (!w) return;
      const scr = screenRef.current;
      if (MENU_SCREENS.has(scr) || !simRef.current) {
        inputRef.current.frame();
        if (!menuSimRef.current) menuSimRef.current = createSim(2);
        w.renderMenu(menuSimRef.current, dt);
        return;
      }
      const S = simRef.current;
      const Tm = T.current;
      const playing = scr === "play" && !overlayRef.current && !subRef.current;
      if (playing) {
        let inp = inputRef.current.frame();
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          if (botRef.current) inp = botRef.current(S, h);
          // one-shot presses only in the first sub-step; held buttons (auto fire) stay held
          const evs = simStep(S, h, i === 0 || botRef.current ? inp : { ...inp, dYaw: 0, dPitch: 0, fireP: false, reload: false, jump: false, interact: false, weapon: 0, wheel: 0 });
          if (evs.length) handleEvents(S, evs);
          if (simRef.current !== S) return;
        }
        // heavy brute footsteps
        for (const e of S.E) {
          if (e.type !== "brute" || !e.alive || e.speed < 0.3) continue;
          const ph = Math.floor((e.walkPh * 2.2) / Math.PI);
          if (Tm.armorPh.get(e.id) !== ph) {
            Tm.armorPh.set(e.id, ph);
            audio.step(e.x, e.z, true);
          }
        }
        audio.listen(S.P.x, S.P.z, S.P.yaw);
        audio.heartbeat(S.P.alive ? Math.max(0, 1 - S.P.hp / 35) : 0);
        if (S.status === "dead") {
          Tm.deadT += dt;
          if (Tm.deadT > 1.4 && !overlayRef.current) {
            releaseLock();
            setOverlay("dead");
          }
        }
        if (S.status === "complete") {
          Tm.doneT += dt;
          if (Tm.doneT > 0.9 && !overlayRef.current && screenRef.current === "play") {
            const r = levelReport(S);
            setReport(r);
            setProgress(completeLevel(progressRef.current, r));
            releaseLock();
            audio.stopAmbient();
            if (S.id === LEVELS.length) {
              audio.victory();
              simRef.current = null;
              setScreen("victory");
            } else setOverlay("complete");
          }
        }
      } else inputRef.current.frame();
      if (!simRef.current) return;
      w.render(S, playing ? dt : 0);
      const P = S.P;
      // imperative HUD bits
      Tm.hpLag += (Math.max(P.hp, 0) - Tm.hpLag) * Math.min(1, dt * (Tm.hpLag > P.hp ? 1.6 : 8));
      Tm.objFlash = Math.max(0, Tm.objFlash - dt);
      const cross = fx.cross.current;
      if (cross) {
        const W = P.w ? WEAPONS[P.w] : null;
        const spread = W ? W.spread + (W.aimSpread - W.spread) * P.aim + Math.min(1, P.moving / 4) * W.moveSpread + (P.grounded ? 0 : 0.02) : 0.01;
        cross.style.setProperty("--sp", `${(5 + spread * 700 + P.recoil * 18).toFixed(1)}px`);
        cross.style.opacity = P.sprinting || !P.alive || !P.w ? "0.3" : "1";
      }
      Tm.hitT += dt;
      const hm = fx.hit.current;
      if (hm) {
        hm.style.opacity = Tm.hitT < 0.2 ? String(1 - Tm.hitT / 0.2) : "0";
        hm.className = `dm-hitmark ${Tm.hitKind}`;
      }
      const vg = fx.vignette.current;
      if (vg) {
        const low = Math.max(0, 1 - P.hp / 40);
        vg.style.opacity = String(Math.min(1, P.hurtT * 1.8 + low * 0.6 + (P.alive ? 0 : 0.9)));
      }
      const bo = fx.blackout.current;
      if (bo) bo.style.opacity = String(Math.min(0.5, S.blackout * 0.35));
      const dir = fx.dir.current;
      if (dir) {
        dir.style.opacity = String(Math.min(1, P.hurtT * 2.4));
        dir.style.transform = `translate(-50%, -50%) rotate(${(-P.hurtDir * 180) / Math.PI}deg)`;
      }
      const mk = fx.marker.current;
      if (mk) {
        const tg = S.status === "play" ? objectiveTarget(S) : null;
        const pr = tg ? w.project(tg.x, 1.3, tg.z) : null;
        if (pr && pr.ok) {
          const d = Math.round(Math.hypot(tg.x - P.x, tg.z - P.z));
          mk.style.opacity = d < 3 ? "0" : "1";
          mk.style.transform = `translate(${pr.x}px, ${pr.y}px)`;
          if (Tm.markerEl !== fx.markerDist.current) {
            Tm.markerEl = fx.markerDist.current;
            Tm.markerD = null;
          }
          if (fx.markerDist.current && Tm.markerD !== d) {
            Tm.markerD = d; // only on change, so the page translator's text isn't overwritten every frame
            fx.markerDist.current.textContent = `${d} m`;
          }
        } else mk.style.opacity = "0";
      }
      Tm.hud -= dt;
      if (scr === "play" && Tm.hud <= 0) {
        Tm.hud = 0.1;
        setHud(snapshot(S));
      }
    },
    [handleEvents, releaseLock, setOverlay, setProgress, setScreen, snapshot],
  );
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: MANUAL });
    } catch (err) {
      setWebglError(String(err?.message || err));
      return undefined;
    }
    worldRef.current = world;
    world.setQuality(progressRef.current.settings.quality);
    world.setBrightness(progressRef.current.settings.brightness);
    if (simRef.current) world.setLevel(simRef.current);
    const fit = () => world.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        tickRef.current(dt);
      } catch (err) {
        console.error("[DeepMine] frame error", err);
      }
    };
    if (!MANUAL) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ notes + keypads */
  const closeSub = useCallback(() => {
    const sb = subRef.current;
    setSub(null);
    setKpEntry("");
    setKpStatus("");
    kpRef.current = { entry: "", busy: false };
    if (sb && typeof sb === "object" && screenRef.current === "play" && !overlayRef.current) requestLock();
  }, [requestLock, setSub]);
  const kpDigit = useCallback((d) => {
    const k = kpRef.current;
    if (k.busy || k.entry.length >= 4) return;
    k.entry += d;
    setKpEntry(k.entry);
    setKpStatus("");
    audio.keypadBeep();
  }, []);
  const kpClear = useCallback(() => {
    if (kpRef.current.busy) return;
    kpRef.current.entry = "";
    setKpEntry("");
    setKpStatus("");
  }, []);
  const kpTimer = useRef(0);
  useEffect(() => () => clearTimeout(kpTimer.current), []);
  const kpEnter = useCallback(() => {
    const k = kpRef.current;
    const sb = subRef.current;
    const S = simRef.current;
    if (k.busy || !sb?.keypad || !S) return;
    const okCode = enterCode(S, sb.keypad.id, k.entry);
    k.busy = true;
    setKpStatus(okCode ? "ok" : "fail");
    clearTimeout(kpTimer.current);
    kpTimer.current = setTimeout(() => {
      k.busy = false;
      k.entry = "";
      setKpEntry("");
      if (okCode) closeSub();
      else setKpStatus("");
    }, okCode ? 700 : 900);
  }, [closeSub]);

  /* ------------------------------------------------------------ keyboard / mouse */
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const S = simRef.current;
    if (!S || S.status !== "play") return;
    if (overlayRef.current === "pause") {
      if (subRef.current) return;
      setOverlay(null);
      requestLock();
    } else if (!overlayRef.current) {
      setOverlay("pause");
      releaseLock();
    }
  }, [releaseLock, requestLock, setOverlay]);

  useEffect(() => {
    const active = () => screenRef.current === "play" && !overlayRef.current && !subRef.current;
    const kd = (e) => {
      if (!rootRef.current?.isConnected) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const sb = subRef.current;
      if (sb && typeof sb === "object") {
        // note / keypad: typed digits, E / Esc to close
        if (e.code === "Escape" || (sb.note && e.code === "KeyE")) {
          e.preventDefault();
          closeSub();
          return;
        }
        if (sb.keypad) {
          if (/^(Digit|Numpad)\d$/.test(e.code)) kpDigit(e.code.slice(-1));
          else if (e.code === "Backspace") kpClear();
          else if (e.code === "Enter" || e.code === "NumpadEnter") kpEnter();
          e.preventDefault();
        }
        return;
      }
      if (subRef.current && e.code === "Escape") {
        setSub(null);
        return;
      }
      if (screenRef.current !== "play") return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (performance.now() - lockPausedAt.current > 400) togglePause();
        return;
      }
      if (!active()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      audio.unlock();
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const ku = (e) => inputRef.current.keyUp(e.code);
    const blur = () => {
      inputRef.current.clear();
      const S = simRef.current;
      if (screenRef.current === "play" && !overlayRef.current && S?.status === "play" && !TEST) setOverlay("pause");
    };
    const mu = (e) => inputRef.current.mouseUp(e.button);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    window.addEventListener("mouseup", mu);
    const root = rootRef.current;
    const wh = (e) => {
      if (screenRef.current !== "play" || overlayRef.current || subRef.current) return;
      e.preventDefault();
      inputRef.current.wheel(e.deltaY);
    };
    root?.addEventListener("wheel", wh, { passive: false });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      window.removeEventListener("mouseup", mu);
      root?.removeEventListener("wheel", wh);
    };
  }, [setOverlay, setSub, togglePause, closeSub, kpDigit, kpClear, kpEnter]);

  const drag = useRef(null);
  const onMouseDown = (e) => {
    if (screenRef.current !== "play" || overlayRef.current || subRef.current) return;
    if (e.target.closest?.("button")) return;
    e.preventDefault();
    audio.unlock();
    if (TEST) {
      inputRef.current.mouseDown(e.button);
      return;
    }
    if (!lockedRef.current) {
      requestLock();
      drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    inputRef.current.mouseDown(e.button);
  };
  const onMouseMove = (e) => {
    if (lockedRef.current) inputRef.current.mouseMove(e.movementX || 0, e.movementY || 0);
    else if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      inputRef.current.mouseMove(dx, dy);
    }
  };
  const onMouseUp = () => {
    drag.current = null;
  };

  /* ------------------------------------------------------------ GamePlayer restart */
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    const S = simRef.current;
    if (S && screenRef.current === "play") startLevel(S.id);
  }, [restartSignal, startLevel]);

  /* ------------------------------------------------------------ dev hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dm = {
      sim: () => simRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      sub: () => subRef.current,
      progress: () => progressRef.current,
      setProgress: (fn) => setProgress(typeof fn === "function" ? fn(progressRef.current) : fn),
      play: (id) => startLevel(id),
      brief: (id) => openBriefing(id),
      setScreen: (s) => setScreen(s),
      toMenu: (s) => toMenu(s),
      resume: () => {
        setSub(null);
        setOverlay(null);
      },
      pause: () => togglePause(),
      setBot: (fn) => {
        botRef.current = fn;
      },
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tickRef.current(dt);
      },
      fit: () => worldRef.current?.resize(stageRef.current.clientWidth, stageRef.current.clientHeight),
      closeSub: () => closeSub(),
      kpType: (code) => {
        for (const d of String(code)) kpDigit(d);
        kpEnter();
      },
    };
    return () => {
      delete window.__dm;
    };
  });

  const S = simRef.current;
  const inPlay = screen === "play";
  const L = LEVEL_BY_ID[levelId] || LEVELS[0];
  return (
    <div
      ref={rootRef}
      className={`dm ${inPlay ? "dm-playing" : ""} ${locked ? "dm-locked" : ""}`}
      tabIndex={-1}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onPointerDown={() => audio.unlock()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className="dm-stage" />
      {MENU_SCREENS.has(screen) && <div className="dm-menu-shade" />}

      {webglError && (
        <div className="dm-screen dm-dim">
          <div className="dm-panel narrow center">
            <h2>3D isn't available</h2>
            <p className="dm-desc">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {inPlay && S && <Hud h={hud} fx={fx} hints={settings.hints} onPause={togglePause} />}
      {inPlay && !TEST && !locked && !overlay && !sub && hud && S?.status === "play" && <div className="dm-clickhint">Click to look around with the mouse</div>}
      <div className="dm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`dm-toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => openBriefing(1)}
          onContinue={() => openBriefing(continueLevel(progressRef.current))}
          onLevels={() => setScreen("levels")}
          onHelp={() => setSub("help")}
          onSettings={() => setSub("settings")}
        />
      )}
      {screen === "levels" && <LevelSelect progress={progress} onPick={openBriefing} onBack={() => setScreen("menu")} />}
      {screen === "briefing" && <Briefing level={L} onStart={() => startLevel(L.id)} onBack={() => setScreen("menu")} />}

      {inPlay && overlay === "pause" && S && (
        <Pause
          level={S.L}
          onResume={() => {
            setOverlay(null);
            requestLock();
          }}
          onRestart={() => startLevel(S.id)}
          onHelp={() => setSub("help")}
          onSettings={() => setSub("settings")}
          onQuit={() => toMenu("menu")}
        />
      )}
      {inPlay && overlay === "dead" && S && <GameOver level={S.L} onRestart={() => startLevel(S.id)} onQuit={() => toMenu("menu")} />}
      {inPlay && overlay === "complete" && report && (
        <LevelComplete
          r={report}
          level={LEVEL_BY_ID[report.id]}
          onNext={() => {
            toMenu("briefing");
            setLevelId(Math.min(LEVELS.length, report.id + 1));
          }}
          onReplay={() => startLevel(report.id)}
          onQuit={() => toMenu("menu")}
        />
      )}
      {screen === "victory" && <Victory progress={progress} onMenu={() => toMenu("menu")} onLevels={() => toMenu("levels")} />}

      {sub === "settings" && (
        <Settings
          settings={settings}
          setSetting={setSetting}
          inGame={inPlay}
          onReset={() => {
            try {
              store()?.removeItem(SAVE_KEY);
            } catch {
              /* ignore */
            }
            setProgress({ ...freshProgress(), settings: progressRef.current.settings });
          }}
          onBack={() => setSub(null)}
        />
      )}
      {sub === "help" && <Help onBack={() => setSub(null)} />}
      {sub?.note && <NoteView note={sub.note} onClose={closeSub} />}
      {sub?.keypad && <Keypad entry={kpEntry} status={kpStatus} onDigit={kpDigit} onClear={kpClear} onEnter={kpEnter} onClose={closeSub} />}
    </div>
  );
}
