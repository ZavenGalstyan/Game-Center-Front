/**
 * 60 Seconds: Last Shelter — a two-phase survival strategy game for the
 * Game Center.
 *
 *  Phase A  a 60-second scramble through a stylised 3D house (plain
 *           Three.js, render/house3d.js) to grab supplies and lead the
 *           family to the shelter hatch (engine/scavenge.js).
 *  Phase B  day-by-day survival in an illustrated SVG shelter: rations,
 *           sickness, morale, 97 events, expeditions and nine endings
 *           (engine/shelter.js, expedition.js, endings.js, data/events/).
 *
 * Rendered inside the shared <GamePlayer> (registered in ../registry.js).
 *  - Restart (`restartSignal`): restarts the 60 seconds in the house; in the
 *    shelter it asks before starting a new game.
 *  - Mute (`muted`): silences the master bus.
 *  - Fullscreen: GamePlayer's button, or Settings → Fullscreen.
 * Progress is saved to localStorage (persist.js) after every decision, when
 * pausing and when the tab is hidden; losing focus pauses the house clock.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./LastShelter.css";
import { createScavenge, tickScavenge, summary, serializeScavenge, timeLeft, usedSlots, interact } from "./engine/scavenge.js";
import { createShelter, chooseEvent, togglePlan, suggestPlan, doAction, startExpedition, endDay, serializeShelter, present } from "./engine/shelter.js";
import { ENDINGS, epilogue } from "./engine/endings.js";
import { HATCH } from "./data/house.js";
import { BY_ID, FAMILY } from "./data/family.js";
import { createInput } from "./input.js";
import { sound } from "./audio.js";
import { loadSave, saveInfo, writeSave, clearSave, loadSettings, storeSettings, loadEndings, recordEnding } from "./persist.js";
import { HouseHUD } from "./ui/HouseHUD.jsx";
import { Bunker } from "./ui/Bunker.jsx";
import { MainMenu, RunnerSelect, HowTo, Settings, Pause, Confirm, EndingScreen, EndingsGallery } from "./ui/Menus.jsx";
import { TEST, TEST_TOUCH, NO_SAVE } from "./testHooks.js";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const coarse = () => {
  try {
    return window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches);
  } catch {
    return false;
  }
};
const resolveQuality = (q) => (q === "auto" ? (coarse() ? "low" : "medium") : q);
const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;

/** Without WebGL there is no house to run through: the family scrambles down on its own. */
function quickSummary(seed, runner) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tools = ["flashlight", "radio", "toolkit", "map", "gasmask", "books", "backpack"].sort(() => r() - 0.5).slice(0, 3);
  const delivered = { water: 3 + Math.floor(r() * 3), food: 3 + Math.floor(r() * 3), medkit: 1, batteries: 1, flashlight: 0, radio: 0, toolkit: 0, map: 0, gasmask: 0, books: 0, backpack: 0 };
  for (const t of tools) delivered[t] = 1;
  const others = FAMILY.map((f) => f.id).filter((id) => id !== runner);
  return { runner, survivors: [runner, ...others], saved: others, lost: [], delivered, timeUsed: 60 };
}

export default function LastShelter({ restartSignal = 0, muted = false }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [screen, setScreenState] = useState("menu");
  const [overlay, setOverlayState] = useState(null);
  const [hud, setHud] = useState(null);
  const [version, setVersion] = useState(0);
  const [info, setInfo] = useState(saveInfo);
  const [endings, setEndings] = useState(loadEndings);
  const [ending, setEnding] = useState(null);
  const [transition, setTransition] = useState(null);
  const [dayFlash, setDayFlash] = useState(null);
  const [touch, setTouch] = useState(false);
  const [webgl] = useState(hasWebGL);
  const [glLost, setGlLost] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [toast, setToast] = useState(null);
  const rootRef = useRef(null);
  const hostRef = useRef(null);
  const worldRef = useRef(null);
  const scavRef = useRef(null);
  const shelterRef = useRef(null);
  const screenRef = useRef(screen);
  const overlayRef = useRef(overlay);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const hudKey = useRef("");
  const stepT = useRef(0);
  const blockedT = useRef(0);
  const endTimer = useRef(0);
  const input = useMemo(() => createInput(), []);

  const setScreen = useCallback(
    (s) => {
      screenRef.current = s;
      input.S.active = s === "house";
      if (s !== "house") input.clear();
      setScreenState(s);
    },
    [input],
  );
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    if (scavRef.current) scavRef.current.paused = !!o;
    setOverlayState(o);
  }, []);
  useLayoutEffect(() => setTouch(coarse() || TEST_TOUCH), []);

  /* ---------------------------------------------------------------- settings / audio */
  const setSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch };
      storeSettings(n);
      return n;
    });
  }, []);
  useEffect(() => {
    sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);
  useEffect(() => {
    worldRef.current?.setQuality(resolveQuality(settings.quality));
  }, [settings.quality]);
  useEffect(() => sound.setMuted(muted), [muted]);

  /* ---------------------------------------------------------------- saving */
  const save = useCallback(() => {
    if (NO_SAVE) return;
    const sc = screenRef.current;
    if (sc === "house" && scavRef.current && !scavRef.current.ended) writeSave("house", serializeScavenge(scavRef.current));
    else if (sc === "bunker" && shelterRef.current && !shelterRef.current.ending) writeSave("bunker", serializeShelter(shelterRef.current));
  }, []);

  /* ---------------------------------------------------------------- 3D world */
  useEffect(() => {
    if (!webgl || !hostRef.current) return undefined;
    let world;
    try {
      // dynamic import keeps the Three.js house out of the shelter-only path
      let disposed = false;
      import("./render/house3d.js").then(({ createHouseWorld }) => {
        if (disposed || !hostRef.current) return;
        world = createHouseWorld(hostRef.current, { quality: resolveQuality(settingsRef.current.quality) });
        worldRef.current = world;
        world.renderer.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setGlLost(true);
        });
        world.resize();
      });
      const ro = new ResizeObserver(() => worldRef.current?.resize());
      ro.observe(hostRef.current);
      return () => {
        disposed = true;
        ro.disconnect();
        worldRef.current?.dispose();
        worldRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [webgl]);

  /* ---------------------------------------------------------------- house loop */
  const finishGame = useCallback(
    (S, id, extra = null) => {
      const day = S ? S.day : 0;
      setEndings(recordEnding(id, day));
      if (!NO_SAVE) clearSave();
      setInfo(null);
      const paragraphs = S ? epilogue(S, id) : epilogue({ fam: {}, lostInHouse: extra?.lost || [], day: 0 }, id);
      if (extra?.saved?.length) paragraphs.push(`${extra.saved.map((x) => BY_ID[x].name).join(" and ")} made it below. They will have to manage without you.`);
      const stats = S
        ? [
            ["days survived", S.day],
            ["meals shared", S.stats.meals],
            ["expeditions", S.stats.expeditions],
            ["decisions made", S.stats.events],
          ]
        : [
            ["seconds", 60],
            ["family saved", extra?.saved?.length || 0],
            ["items grabbed", extra?.items || 0],
          ];
      setEnding({ id, paragraphs, stats, fam: S ? S.fam : null, lost: S ? S.lostInHouse : extra?.lost || [] });
      sound.stopAll();
      const good = ENDINGS[id].kind !== "bad";
      setTimeout(() => {
        sound.play("ending", good);
        sound.music(good ? "ending" : null);
      }, 400);
      setScreen("ending");
      setOverlay(null);
    },
    [setScreen, setOverlay],
  );

  const enterShelter = useCallback(
    (sum, seed) => {
      const S = createShelter({ seed, summary: sum });
      shelterRef.current = S;
      setVersion((v) => v + 1);
      setScreen("bunker");
      setTransition(null);
      sound.siren(false);
      sound.ambience(true);
      sound.music("shelter");
      if (!NO_SAVE) writeSave("bunker", serializeShelter(S));
      setInfo(saveInfo());
    },
    [setScreen],
  );

  const onHouseEnd = useCallback(
    (S) => {
      sound.sirenCut();
      sound.play("boom");
      const sum = summary(S);
      if (S.ended === "failed") {
        setTransition({ kind: "failed" });
        endTimer.current = setTimeout(() => {
          const items = Object.values(sum.delivered).reduce((a, b) => a + b, 0);
          finishGame(null, "failed_evac", { saved: sum.saved, lost: [S.runner, ...sum.lost], items });
          setTransition(null);
        }, 2600);
      } else {
        setTimeout(() => sound.play("hatch"), 500);
        setTransition({ kind: "safe", sum });
        endTimer.current = setTimeout(() => enterShelter(sum, S.seed), 3600);
      }
    },
    [finishGame, enterShelter],
  );

  const houseStep = useCallback(
    (dt) => {
      const S = scavRef.current;
      const world = worldRef.current;
      let events = [];
      if (S && screenRef.current === "house") {
        if (!overlayRef.current && !S.ended) {
          const intent = input.frame();
          const before = Math.ceil(S.intro);
          tickScavenge(S, intent, dt);
          if (S.intro > 0 && Math.ceil(S.intro) !== before) sound.play("count");
        }
        events = S.events.splice(0);
        for (const ev of events) {
          if (ev.type === "pickup") sound.play("pickup", ["food", "water"].includes(ev.kind) ? 0 : 3);
          else if (ev.type === "rescue") sound.play("rescue");
          else if (ev.type === "saved") sound.play("saved");
          else if (ev.type === "deposit") sound.play("deposit");
          else if (ev.type === "go") {
            sound.play("go");
            sound.siren(true, 0);
          } else if (ev.type === "blocked") {
            if (performance.now() - blockedT.current > 600) {
              blockedT.current = performance.now();
              sound.play("blocked");
            }
          } else if (ev.type === "second") {
            if (ev.left <= 10) {
              sound.play("beep");
              sound.play("heart");
            } else sound.play("tick");
            sound.siren(true, Math.max(0, 1 - ev.left / 40));
          } else if (ev.type === "end") onHouseEnd(S);
        }
        if (!S.ended && !overlayRef.current && (S.P.speed || 0) > 1) {
          stepT.current -= dt;
          if (stepT.current <= 0) {
            stepT.current = 0.28;
            sound.play("step");
          }
        }
      }
      const sc = screenRef.current;
      if (world && (sc === "menu" || sc === "runner" || sc === "house" || sc === "ending" || sc === "transition-house")) {
        world.frame(dt, sc === "house" ? S : null, { mode: sc === "house" ? "run" : "menu", events, shakeOn: settingsRef.current.shake, zoom: settingsRef.current.zoom });
      }
      // HUD snapshot (only re-render React when something visible changed)
      if (S && sc === "house") {
        let hatch = null;
        if (world) {
          const p = world.project(HATCH.x, 0.6, HATCH.z);
          if (p.on) hatch = { on: true, x: Math.round(p.x), y: Math.round(p.y - 40) };
          else {
            const cx = p.w / 2;
            const cy = p.h / 2;
            let dx = p.x - cx;
            let dy = p.y - cy;
            // keep clear of the top bar and the carry slots at the bottom
            const t = Math.min((cx - 46) / Math.max(1e-3, Math.abs(dx)), (dy < 0 ? cy - 110 : cy - 130) / Math.max(1e-3, Math.abs(dy)));
            hatch = { on: false, ex: Math.round(cx + dx * t), ey: Math.round(cy + dy * t), ang: Math.round(Math.atan2(dy, dx) * 20) / 20 };
          }
        }
        const left = timeLeft(S);
        const tg = S.target ? { ...S.target } : null;
        const snap = {
          left: S.intro > 0 ? 60 : left,
          intro: S.intro,
          cap: S.cap,
          used: usedSlots(S),
          carry: S.carry.slice(),
          escort: S.escort,
          backpack: S.backpack,
          family: S.family.map((f) => ({ id: f.id, state: f.state })),
          delivered: { ...S.delivered },
          target: tg,
          inHatch: S.inHatch,
          ended: S.ended,
          hatch,
          runner: S.runner,
        };
        const key = JSON.stringify([Math.ceil(snap.left), Math.ceil(snap.intro), snap.carry, snap.escort, snap.family, snap.delivered, tg && [tg.id, tg.blocked], snap.inHatch, snap.ended, hatch && [hatch.on, hatch.x >> 2, hatch.y >> 2, hatch.ex >> 2, hatch.ey >> 2], snap.cap]);
        if (key !== hudKey.current) {
          hudKey.current = key;
          setHud(snap);
        }
      }
    },
    [input, onHouseEnd],
  );

  useEffect(() => {
    input.attach();
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      houseStep(dt);
    };
    raf = requestAnimationFrame(loop);
    if (TEST) window.__lsAdvance = (frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) houseStep(dt);
    };
    return () => {
      cancelAnimationFrame(raf);
      input.detach();
      clearTimeout(endTimer.current);
      sound.stopAll();
    };
  }, [houseStep, input]);

  /* ---------------------------------------------------------------- focus / visibility */
  useEffect(() => {
    const pauseIfRunning = () => {
      if (screenRef.current === "house" && !overlayRef.current && scavRef.current && !scavRef.current.ended && scavRef.current.intro <= 0) {
        setOverlay("pause");
        sound.siren(false);
      }
      save();
    };
    const vis = () => {
      if (document.hidden) {
        pauseIfRunning();
        sound.suspend();
      } else sound.resume();
    };
    const blur = () => pauseIfRunning();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", save);
    const fs = () => setIsFs(!!fsEl() && rootRef.current && (fsEl() === rootRef.current || fsEl().contains(rootRef.current)));
    document.addEventListener("fullscreenchange", fs);
    document.addEventListener("webkitfullscreenchange", fs);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("fullscreenchange", fs);
      document.removeEventListener("webkitfullscreenchange", fs);
      save();
    };
  }, [save, setOverlay]);

  /* ---------------------------------------------------------------- flow */
  const startRun = useCallback(
    (runner, seed = newSeed()) => {
      sound.unlock();
      sound.music(null);
      sound.ambience(false);
      clearTimeout(endTimer.current);
      setTransition(null);
      setEnding(null);
      shelterRef.current = null;
      if (!worldRef.current) {
        // no 3D: skip straight to the shelter with a sensible scramble
        enterShelter(quickSummary(seed, runner), seed);
        setToast("Your browser can't show the 3D house — the family scrambled down on their own.");
        return;
      }
      const S = createScavenge({ seed, runner });
      scavRef.current = S;
      hudKey.current = "";
      setOverlay(null);
      setScreen("house");
      if (!NO_SAVE) writeSave("house", serializeScavenge(S));
      sound.siren(true, 0);
    },
    [enterShelter, setOverlay, setScreen],
  );

  const continueGame = useCallback(() => {
    sound.unlock();
    const d = loadSave();
    if (!d) {
      setInfo(null);
      return;
    }
    if (d.phase === "house") {
      if (!worldRef.current) {
        enterShelter(quickSummary(d.house.seed, d.house.runner), d.house.seed);
        return;
      }
      const S = d.house;
      S.intro = Math.max(S.intro, 2.2);
      scavRef.current = S;
      hudKey.current = "";
      setOverlay(null);
      setScreen("house");
      sound.music(null);
      sound.siren(true, 0);
    } else {
      shelterRef.current = d.shelter;
      setVersion((v) => v + 1);
      setScreen("bunker");
      setOverlay(null);
      sound.ambience(true);
      sound.music("shelter");
    }
  }, [enterShelter, setOverlay, setScreen]);

  const toMenu = useCallback(() => {
    save();
    clearTimeout(endTimer.current);
    sound.stopAll();
    setTransition(null);
    setOverlay(null);
    setScreen("menu");
    setInfo(saveInfo());
    setTimeout(() => sound.music("menu"), 200);
  }, [save, setOverlay, setScreen]);

  const newGame = useCallback(() => {
    sound.unlock();
    sound.play("click");
    setOverlay(null);
    setScreen("runner");
  }, [setOverlay, setScreen]);

  // first interaction starts the menu music
  const firstGesture = useRef(false);
  const onAnyPointer = useCallback(() => {
    if (firstGesture.current) return;
    firstGesture.current = true;
    sound.unlock();
    if (screenRef.current === "menu") sound.music("menu");
  }, []);

  // GamePlayer Restart
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (lastRestart.current === restartSignal) return;
    lastRestart.current = restartSignal;
    const sc = screenRef.current;
    if (sc === "house" && scavRef.current) startRun(scavRef.current.runner);
    else if (sc === "bunker") setOverlay("confirmNew");
    else setScreen("runner");
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- shelter actions */
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    if (!NO_SAVE && shelterRef.current && !shelterRef.current.ending) writeSave("bunker", serializeShelter(shelterRef.current));
  }, []);
  const checkEnd = useCallback(() => {
    const S = shelterRef.current;
    if (S && S.ending) {
      setTimeout(() => finishGame(S, S.ending.id), 900);
      return true;
    }
    return false;
  }, [finishGame]);
  const B = useMemo(
    () => ({
      choose(i) {
        const S = shelterRef.current;
        const r = chooseEvent(S, i);
        if (!r) return;
        const good = r.changes.filter((c) => c.good).length;
        const bad = r.changes.filter((c) => !c.good).length;
        sound.play("page");
        setTimeout(() => sound.play(good > bad ? "good" : bad > good ? "bad" : "click"), 150);
        if (r.changes.some((c) => c.k === "death")) sound.play("death");
        bump();
        checkEnd();
      },
      toggle(kind, id) {
        if (togglePlan(shelterRef.current, kind, id)) sound.play("click");
        else sound.play("blocked");
        bump();
      },
      suggest() {
        suggestPlan(shelterRef.current);
        sound.play("click");
        bump();
      },
      action(k) {
        const r = doAction(shelterRef.current, k);
        if (r) sound.play(k === "listen" ? "static" : "good");
        bump();
      },
      send(who, dest, gear) {
        if (startExpedition(shelterRef.current, who, dest, gear)) sound.play("depart");
        bump();
      },
      endDay() {
        const S = shelterRef.current;
        if (!S || (S.event && !S.event.quiet && !S.event.done)) return;
        const deathsBefore = S.stats.deaths;
        endDay(S);
        sound.play("newday");
        if (S.stats.deaths > deathsBefore) setTimeout(() => sound.play("death"), 300);
        bump();
        if (!checkEnd()) {
          setDayFlash({ day: S.day, k: S.day });
          setTimeout(() => setDayFlash(null), 1500);
        }
      },
    }),
    [bump, checkEnd],
  );

  /* ---------------------------------------------------------------- misc UI */
  const toggleFs = useCallback(async () => {
    const el = rootRef.current?.closest(".game-player") || rootRef.current;
    try {
      if (fsEl()) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      else await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.());
    } catch {
      /* not allowed here */
    }
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  // Escape / P pause the house; Escape closes dialogs
  useEffect(() => {
    input.S.onKey = (code) => {
      if (code !== "Escape" && code !== "KeyP") return false;
      const o = overlayRef.current;
      if (o === "settings" || o === "howto" || o === "endings") {
        setOverlay(screenRef.current === "house" || screenRef.current === "bunker" ? "pause" : null);
        return true;
      }
      if (o === "pause") {
        setOverlay(null);
        if (screenRef.current === "house") sound.siren(true, 0);
        return true;
      }
      if (!o && (screenRef.current === "house" || screenRef.current === "bunker") && !transition) {
        setOverlay("pause");
        if (screenRef.current === "house") sound.siren(false);
        save();
        return true;
      }
      return false;
    };
    return () => {
      input.S.onKey = null;
    };
  }, [input, setOverlay, save, transition]);

  /* ---------------------------------------------------------------- test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ls = {
      get: () => ({ screen: screenRef.current, overlay: overlayRef.current, S: scavRef.current, B: shelterRef.current, hud, world: worldRef.current }),
      start: (runner = "hollis", seed = 1) => startRun(runner, seed),
      cont: continueGame,
      menu: toMenu,
      grab: () => scavRef.current && interact(scavRef.current),
      teleport: (x, z) => {
        if (scavRef.current) Object.assign(scavRef.current.P, { x, z });
      },
      setTime: (t) => scavRef.current && (scavRef.current.t = t),
      skipIntro: () => scavRef.current && (scavRef.current.intro = 0.01),
      descend: () => {
        input.S.descendQ = true;
      },
      choose: (i) => B.choose(i),
      endDay: () => B.endDay(),
      suggest: () => B.suggest(),
      send: (w, d, g) => B.send(w, d, g || []),
      action: (k) => B.action(k),
      toggle: (k, id) => B.toggle(k, id),
      present: () => (shelterRef.current ? present(shelterRef.current) : []),
      overlay: setOverlay,
    };
    return undefined;
  });

  const S2 = shelterRef.current;
  const inHouse = screen === "house";
  const show3D = screen === "menu" || screen === "runner" || inHouse;
  return (
    <div ref={rootRef} className={`lsh-root lsh-screen--${screen}${touch ? " is-touch" : ""}`} onPointerDown={onAnyPointer} onContextMenu={(e) => inHouse && e.preventDefault()}>
      <div ref={hostRef} className="lsh-3d" style={{ visibility: show3D ? "visible" : "hidden" }} />
      {!webgl && show3D && <div className="lsh-nogl" />}

      {screen === "menu" && (
        <MainMenu info={info} endings={endings} webgl={webgl} onContinue={continueGame} onNew={newGame} onHowTo={() => setOverlay("howto")} onSettings={() => setOverlay("settings")} onEndings={() => setOverlay("endings")} />
      )}
      {screen === "runner" && <RunnerSelect onPick={(id) => startRun(id)} onBack={() => setScreen("menu")} />}
      {inHouse && <HouseHUD hud={hud} touch={touch} input={input} onPause={() => (setOverlay("pause"), sound.siren(false), save())} onGrab={() => (input.S.grabQ = true)} onDescend={() => (input.S.descendQ = true)} />}
      {screen === "bunker" && S2 && <Bunker S={S2} version={version} onChoose={B.choose} onToggle={B.toggle} onSuggest={B.suggest} onAction={B.action} onSend={B.send} onEndDay={B.endDay} onPause={() => setOverlay("pause")} dayFlash={dayFlash} />}
      {screen === "ending" && ending && <EndingScreen {...ending} endings={endings} onNew={newGame} onMenu={toMenu} />}

      {transition && (
        <div className={`lsh-transition is-${transition.kind}`} onClick={() => transition.kind === "safe" && (clearTimeout(endTimer.current), enterShelter(transition.sum, scavRef.current?.seed || 1))}>
          <div className="lsh-transition__flash" />
          <div className="lsh-transition__card">
            {transition.kind === "safe" ? (
              <>
                <h2>The hatch slams shut.</h2>
                <p>
                  {transition.sum.survivors.length === 4 ? "Everyone made it down." : `${transition.sum.survivors.length} of the Barlows made it down.`} The ground shakes for a long, long time.
                </p>
                <span className="lsh-muted">Day 1 begins… (tap to continue)</span>
              </>
            ) : (
              <>
                <h2>Too late.</h2>
                <p>The light came before you reached the hatch.</p>
              </>
            )}
          </div>
        </div>
      )}

      {overlay === "pause" && (
        <Pause
          phase={screen}
          onResume={() => {
            setOverlay(null);
            if (screenRef.current === "house") sound.siren(true, 0);
          }}
          onSettings={() => setOverlay("settings")}
          onHowTo={() => setOverlay("howto")}
          onQuit={toMenu}
        />
      )}
      {overlay === "howto" && <HowTo touch={touch} onClose={() => setOverlay(screen === "house" || screen === "bunker" ? "pause" : null)} />}
      {overlay === "settings" && <Settings s={settings} set={setSettings} isFs={isFs} onFullscreen={toggleFs} onClose={() => setOverlay(screen === "house" || screen === "bunker" ? "pause" : null)} />}
      {overlay === "endings" && <EndingsGallery endings={endings} onClose={() => setOverlay(null)} />}
      {overlay === "confirmNew" && <Confirm title="Start over?" text="Your current shelter will be lost. The endings you've found are kept." yes="New game" onNo={() => setOverlay(null)} onYes={() => (clearSave(), setInfo(null), newGame())} />}
      {glLost && (
        <div className="lsh-toast is-bad" role="alert">
          The 3D view was lost (graphics driver reset). Your progress is saved — reload the page to continue.
        </div>
      )}
      {toast && <div className="lsh-toast">{toast}</div>}
    </div>
  );
}
