/**
 * Lumberjack Life — the playing screen for one region session.
 *
 * Builds ONE world for this session (restored from the region's saved
 * snapshot). The parent keys this component by session, so the Game Center
 * Restart = a clean remount: old world, renderer, loop, listeners and loops
 * are dropped together — never duplicated. Fullscreen / pointer-lock changes
 * never remount it.
 *
 * Pause sources: Esc / P / pointer-lock loss (pause menu), hidden tab, and
 * the click-to-start gate. While paused the engine isn't stepped and every
 * continuous sound is silenced.
 *
 * Career: world events → applyEvents (objectives, stats, tutorial); the
 * order board / timber buyer interactions deliver and sell here, mutating the
 * live mill storage and paying exactly once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorldCanvas from "../three/WorldCanvas.jsx";
import Hud from "./Hud.jsx";
import TouchControls from "./TouchControls.jsx";
import { Equipment, SettingsPanel, ControlsHelp } from "./Menus.jsx";
import { createWorld, worldSnapshot, applyProgress } from "../engine/world.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import {
  applyEvents, deliverOrder, sellTimber, orderStatus, sellQuote, tutorialStep, markTutorial, flushWorldStats, toggleToolKind,
} from "../engine/career.js";
import { primaryTarget } from "../engine/player.js";
import { storageTotal } from "../engine/mill.js";
import { toolById } from "../data/equipment.js";

let toastSeq = 0;

export default function GameScreen({ region, progress, progressRef, updateProgress, settings, muted, touch, onQuit, onSaveWorld, session, worldRef }) {
  // progressRef is the ROOT's ref: always the latest committed career, so a
  // write from here can never clobber a purchase made a moment earlier.

  /* ---------------- world + input (once per session) */
  const world = useMemo(() => {
    const snap = session.fresh ? session.fresh : progress.worlds[region.id] || null;
    return createWorld({ region, progress, snapshot: snap });
  }, [session.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (import.meta.env.DEV) window.__llWorld = world;
    worldRef.current = world;
    return () => {
      if (worldRef.current === world) worldRef.current = null;
    };
  }, [world, worldRef]);
  const input = useMemo(() => createInput(), []);
  const live = useMemo(() => ({ paused: true, hud: null }), []);
  const rendererRef = useRef(null);

  /* ---------------- UI state */
  const [started, setStarted] = useState(!!touch || TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'workshop' | 'settings' | 'controls'
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const wrapRef = useRef(null);
  const pausedNow = !started || paused || hidden || !!panel;
  live.paused = pausedNow;
  input.enabled = !pausedNow || !started;

  const toast = useCallback((text, tone = "info", ms = 2600) => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /* ---------------- input wiring */
  useEffect(() => {
    const el = wrapRef.current;
    input.attach(el);
    if (TEST) input.lockFailed = true; // automation: no pointer lock, play straight away
    input.onLockChange = (locked) => {
      if (locked) {
        setStarted(true);
        setPaused(false);
      } else if (!input.lockFailed) {
        // the player left pointer lock (Esc) → pause; a refused lock request just falls back to drag-look
        setPaused(true);
      }
    };
    const onVis = () => {
      const h = document.visibilityState === "hidden" && !TEST;
      setHidden(h);
      if (h) {
        input.releaseAll();
        sound.stopLoops();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e) => {
      if ((e.code === "Escape" || e.code === "KeyP") && !input.locked) {
        setPaused((p) => !p);
        setPanel(null);
        input.releaseAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      input.onLockChange = null;
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [input]);

  useEffect(() => {
    if (pausedNow) {
      input.releaseAll();
      sound.stopLoops();
    }
  }, [pausedNow, input]);

  const begin = useCallback(() => {
    sound.unlock();
    if (touch || input.lockFailed) {
      setStarted(true);
      setPaused(false);
      return;
    }
    input.requestLock();
    setTimeout(() => {
      if (!input.locked) {
        input.lockFailed = true;
        setStarted(true);
        setPaused(false);
      }
    }, 450);
  }, [input, touch]);

  const resume = useCallback(() => {
    sound.uiClick();
    setPanel(null);
    if (touch || input.lockFailed) setPaused(false);
    else {
      input.requestLock();
      setTimeout(() => {
        if (!input.locked) {
          input.lockFailed = true;
          setPaused(false);
        }
      }, 450);
    }
  }, [input, touch]);

  const openPause = useCallback(() => {
    input.exitLock();
    setPaused(true);
  }, [input]);

  /* ---------------- save the world snapshot */
  const saveWorld = useCallback(() => {
    const p = flushWorldStats(progressRef.current, world.stats);
    onSaveWorld(region.id, worldSnapshot(world), p, session.key);
  }, [world, region.id, onSaveWorld, session.key]);
  const saveRef = useRef(saveWorld);
  saveRef.current = saveWorld;
  useEffect(() => {
    const id = setInterval(() => saveRef.current(), 9000);
    const onHide = () => {
      if (document.visibilityState === "hidden") saveRef.current();
    };
    const onUnload = () => saveRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      saveRef.current();
    };
  }, []);
  useEffect(() => {
    if (paused) saveRef.current();
  }, [paused]);

  /* ---------------- career events (exactly once per event: the renderer drains the queue) */
  const onEvents = useCallback((events) => {
    let p = progressRef.current;
    const r = applyEvents(p, region.id, events);
    p = r.progress;
    let saveSoon = false;
    for (const ev of events) {
      if (ev.type === "toast") toast(ev.text, ev.tone || "info");
      else if (ev.type === "treeFelled") {
        saveSoon = true;
      } else if (ev.type === "boardUse") {
        const res = deliverOrder(p, region.id, world.mill.storage);
        if (res.ok) {
          p = res.progress;
          sound.orderComplete();
          setBanner({ title: "Order complete!", sub: `${res.order.name} · +$${res.reward.toLocaleString()}`, unlock: res.unlocked.length ? `Unlocked: ${res.unlocked.join(", ")}` : null });
          setTimeout(() => setBanner(null), 3600);
          saveSoon = true;
          if (res.unlocked.length) setTimeout(() => sound.unlock(), 900);
        } else {
          sound.denied();
          const st = orderStatus(p, region.id, world.mill.storage);
          const missing = st.lines.find((l) => !l.done);
          if (missing) toast(`Not ready — ${missing.label}: ${missing.have}/${missing.n}`, "warn");
        }
      } else if (ev.type === "sellUse") {
        const res = sellTimber(p, region.id, world.mill.storage);
        if (res.ok) {
          p = res.progress;
          sound.coin();
          toast(`Sold ${res.n} planks · +$${res.money.toLocaleString()}`, "good");
          saveSoon = true;
        } else {
          sound.denied();
          toast("Nothing to sell — planks for your order are kept back", "warn");
        }
      } else if (ev.type === "planks") {
        // tutorial nudge when the first planks land
      }
    }
    if (p !== progressRef.current) updateProgress(() => p);
    if (saveSoon) setTimeout(() => saveRef.current(), 50);
  }, [region.id, world, toast, updateProgress]);

  /* ---------------- progress → world (tools, upgrades, vehicles) */
  const upgradesKey = JSON.stringify(progress.sawmillUpgrades) + JSON.stringify(progress.unlockedTools) + JSON.stringify(progress.unlockedVehicles) + progress.completedOrders.length;
  const lastUpg = useRef(upgradesKey);
  useEffect(() => {
    applyProgress(world, progress);
    if (lastUpg.current !== upgradesKey) {
      lastUpg.current = upgradesKey;
      if (rendererRef.current) rendererRef.current.rebuildMill(progress);
    }
  }, [world, progress, upgradesKey]);

  /* ---------------- HUD polling (~8 Hz; never per frame) */
  const movedRef = useRef({ x: world.player.x, z: world.player.z, d: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const p = progressRef.current;
      const st = orderStatus(p, region.id, world.mill.storage);
      world.orderPrompt = st.ready
        ? { label: `Deliver “${st.order.name}”`, sub: `+$${st.order.reward.toLocaleString()}`, ok: true, ready: true }
        : { label: `Order: ${st.order.name}`, sub: (() => {
          const m = st.lines.find((l) => !l.done);
          return m ? `${m.label} ${m.have}/${m.n}` : null;
        })(), ok: true };
      const q = sellQuote(p, region.id, world.mill.storage);
      world.sellPrompt = q.n > 0 ? { label: `Sell ${q.n} spare planks`, sub: `+$${q.money.toLocaleString()}`, ok: true } : { label: "Timber buyer", sub: "No spare planks to sell", ok: false };
      // Q: switch axe ↔ chainsaw
      if (input.take("tool")) {
        const np = toggleToolKind(p);
        if (np !== p) {
          updateProgress(() => np);
          toast(`Equipped ${toolById(np.selectedTool).name}`, "info", 1400);
        } else toast("No other tool owned yet — buy one in the Workshop", "info", 1800);
      }
      if (input.take("pause")) openPause();
      // tutorial steps the engine can't see
      const P = world.player;
      const mv = movedRef.current;
      mv.d += Math.hypot(P.x - mv.x, P.z - mv.z);
      mv.x = P.x;
      mv.z = P.z;
      let tp = progressRef.current;
      if (!tp.tutorial.move && mv.d > 4) tp = markTutorial(tp, "move");
      if (!tp.tutorial.approach) {
        const tg = primaryTarget(world, true);
        if (tg && tg.kind === "tree" && tg.surface < 1.8) tp = markTutorial(tp, "approach");
      }
      if (tp !== progressRef.current) updateProgress(() => tp);
      const h = live.hud;
      if (h) {
        setHud((prev) => {
          const next = {
            ...h,
            money: progressRef.current.money,
            order: st,
            storage: storageTotal(world.mill),
            storeCap: world.mill.storeCap,
            deck: world.mill.queue.length,
            deckCap: world.mill.cap,
            tutorial: tutorialStep(progressRef.current),
          };
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      }
    }, 125);
    return () => clearInterval(id);
  }, [world, region.id, input, live, toast, updateProgress, openPause]);

  const onReady = useCallback((r) => {
    rendererRef.current = r;
    if (import.meta.env.DEV && typeof window !== "undefined") window.__llRenderer = r;
  }, []);

  const canvasKey = `${settings.graphics}:${settings.shadows}:${settings.particles}`;

  return (
    <div ref={wrapRef} className={`ll-game${pausedNow ? " ll-game--paused" : ""}`}>
      <WorldCanvas key={canvasKey} world={world} input={input} live={live} settings={settings} progress={progress} onEvents={onEvents} onReady={onReady} />
      {started && hud && <Hud hud={hud} region={region} settings={settings} touch={touch} onPause={openPause} toasts={toasts} banner={banner} />}
      {started && touch && !pausedNow && <TouchControls input={input} hud={hud} onPause={openPause} />}
      {!started && (
        <div className="ll-gate" onClick={begin} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && begin()}>
          <div className="ll-gate__card">
            <div className="ll-gate__region">{region.name}</div>
            <div className="ll-gate__title">Click to start your shift</div>
            <div className="ll-gate__keys">
              <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
              <span><kbd>Mouse</kbd> look</span>
              <span><kbd>Click</kbd> chop</span>
              <span><kbd>E</kbd> interact</span>
              <span><kbd>Shift</kbd> sprint</span>
              <span><kbd>Esc</kbd> pause</span>
            </div>
          </div>
        </div>
      )}
      {started && (paused || panel) && !hidden && (
        <div className="ll-pause">
          {!panel && (
            <div className="ll-pause__card">
              <div className="ll-pause__title">Paused</div>
              <div className="ll-pause__sub">{region.name} · ${progress.money.toLocaleString()}</div>
              <button type="button" className="ll-btn ll-btn--primary" onClick={resume}>Resume</button>
              <button type="button" className="ll-btn" onClick={() => { sound.uiClick(); setPanel("workshop"); }}>Workshop</button>
              <button type="button" className="ll-btn" onClick={() => { sound.uiClick(); setPanel("settings"); }}>Settings</button>
              <button type="button" className="ll-btn" onClick={() => { sound.uiClick(); setPanel("controls"); }}>Controls</button>
              <button type="button" className="ll-btn ll-btn--ghost" onClick={() => { sound.uiClick(); saveRef.current(); onQuit(); }}>Save &amp; Main Menu</button>
            </div>
          )}
          {panel === "workshop" && (
            <div className="ll-pause__panel">
              <Equipment progress={progress} updateProgress={updateProgress} settings={settings} inGame onBack={() => setPanel(null)} />
            </div>
          )}
          {panel === "settings" && (
            <div className="ll-pause__panel">
              <SettingsPanel settings={settings} muted={muted} onChange={(patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }))} onBack={() => setPanel(null)} />
            </div>
          )}
          {panel === "controls" && (
            <div className="ll-pause__panel">
              <ControlsHelp onBack={() => setPanel(null)} />
            </div>
          )}
        </div>
      )}
      {hidden && started && <div className="ll-pause"><div className="ll-pause__card"><div className="ll-pause__title">Paused</div><div className="ll-pause__sub">Tab hidden</div></div></div>}
    </div>
  );
}
