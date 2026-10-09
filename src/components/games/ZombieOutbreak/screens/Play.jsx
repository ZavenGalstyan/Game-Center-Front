/**
 * Zombie Outbreak — one stage attempt.
 *
 * Owns the engine game, input, pointer lock, pause, the HUD feed and the
 * end-of-stage overlays. Mounted with a key per attempt, so Restart / Retry
 * is simply a fresh mount (permanent progress lives in the parent).
 *
 * Paused = the engine is not stepped (player, zombies, attacks, wave timers,
 * projectiles, effects all freeze) and the AudioContext is suspended. The
 * pointer is released while paused and on the end screens; resuming needs a
 * click (a real user gesture), as the Pointer Lock API requires.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createGame, STATE } from "../engine/game.js";
import { createInput, attachControls, requestLock } from "../engine/input.js";
import { createBot } from "../engine/bot.js";
import GameScene from "../three/GameScene.jsx";
import Hud from "../hud/Hud.jsx";
import { ClickToPlay, PauseMenu, GameOver, StageComplete } from "../hud/Overlays.jsx";
import { ENEMY_INFO, ZOMBIES } from "../data/enemies.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest, Sizer } from "../utils/testHooks.js";

const PICKUP_TOAST = { health: "+40 HEALTH", ammo: "+AMMO", armor: "+50 ARMOR", boost: "DAMAGE BOOST ×1.5 — 15s" };

function emptyFeed() {
  return { marker: null, pops: [], arcs: [], banner: null, toast: null, hurt: 0 };
}

export default function Play({ stage, loadout, settings, muted, audio, onResult, onRestart, onNext, onStageSelect, onMenu, onChangeSettings, hasNext, seenTypes }) {
  const quality = settings.graphics;
  const game = useMemo(() => createGame(stage, { seed: (Date.now() % 100000) + 1, loadout, maxActive: quality === "low" ? 10 : quality === "high" ? 15 : 13 }), [stage, loadout, quality]);
  const input = useMemo(() => createInput(), []);
  const containerRef = useRef(null);
  const hostRef = useRef(null);
  const [begun, setBegun] = useState(TEST);
  const [locked, setLocked] = useState(TEST);
  const [manualPause, setManualPause] = useState(false);
  const [phase, setPhase] = useState("play"); // play | dead | complete
  const [hud, setHud] = useState(() => game.hud());
  const [feed, setFeed] = useState(emptyFeed);
  const [final, setFinal] = useState(null);
  const [hints, setHints] = useState(stage.id <= 2);
  const feedRef = useRef(emptyFeed());
  const nextId = useRef(1);
  const reported = useRef(false);
  const seen = useRef(new Set(seenTypes || []));
  useCanvasWatchdog(hostRef);
  const touchOnly = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches, []);

  const ended = phase !== "play";
  const paused = !begun || ended || (!locked && !TEST) || manualPause;
  const showPause = begun && !ended && ((!locked && !TEST) || manualPause);

  // ------------------------------------------------ result reporting (exactly once)
  const report = useCallback(
    (extra = {}) => {
      if (reported.current) return null;
      reported.current = true;
      return onResult?.({ ...game.result(), ...extra });
    },
    [game, onResult],
  );
  useEffect(() => {
    reported.current = false; // re-arm after StrictMode's dev-only fake unmount
    return () => {
      if (!reported.current) report({ quit: true });
    };
  }, [report]);

  // ------------------------------------------------ controls + pointer lock
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    return attachControls(el, input, {
      touchMode: () => TEST,
      onLockChange: (isLocked) => setLocked(isLocked),
      onPause: () => {
        if (TEST) setManualPause((p) => !p);
        else if (document.pointerLockElement === el) document.exitPointerLock?.();
        else setManualPause(true);
      },
    });
  }, [input]);

  useEffect(() => {
    audio?.setPaused(paused && !ended);
  }, [audio, paused, ended]);

  useEffect(() => {
    if (ended && document.pointerLockElement) document.exitPointerLock?.();
  }, [ended]);

  useEffect(() => {
    if (!hints || !begun) return undefined;
    const id = setTimeout(() => setHints(false), 14000);
    return () => clearTimeout(id);
  }, [hints, begun]);

  // ------------------------------------------------ HUD snapshot + feed decay (20 Hz)
  useEffect(() => {
    const id = setInterval(() => {
      const f = feedRef.current;
      const now = performance.now();
      f.pops = f.pops.filter((p) => now - p.t < 900);
      f.arcs = f.arcs.filter((a) => now - a.t < 1300).map((a) => ({ ...a, k: 1 - (now - a.t) / 1300 }));
      if (f.marker && now - f.marker.t > 220) f.marker = null;
      if (f.banner && now - f.banner.t > (f.banner.dur || 2200)) f.banner = null;
      if (f.toast && now - f.toast.t > 2200) f.toast = null;
      f.hurt = Math.max(0, f.hurt - 0.06);
      setFeed({ ...f });
      setHud(game.hud());
    }, 50);
    return () => clearInterval(id);
  }, [game]);

  useEffect(() => {
    if (TEST) window.__zo = { ...(window.__zo || {}), game, input, bot: (o) => createBot(game, { ...(o || {}), input }), setManualPause };
  }, [game, input]);

  // ------------------------------------------------ engine events → feed / phases
  const onEvents = useCallback(
    (events) => {
      const f = feedRef.current;
      const now = performance.now();
      const id = () => nextId.current++;
      let flush = false;
      for (const e of events) {
        switch (e.type) {
          case "prepare":
            f.banner = { id: id(), t: now, text: stage.name.toUpperCase(), sub: "GET READY", kind: "stage", dur: 2600 };
            break;
          case "wave_start":
            f.banner = { id: id(), t: now, text: e.final ? "FINAL WAVE" : `WAVE ${e.n}`, sub: e.boss ? `${e.boss} IS COMING` : e.final ? "survive this and the area is clear" : `${e.total - e.n} more wave${e.total - e.n === 1 ? "" : "s"} after this`, kind: e.final ? "final" : "wave" };
            break;
          case "wave_clear":
            f.banner = { id: id(), t: now, text: e.final ? "AREA SECURED" : "WAVE COMPLETE", sub: `+${e.bonus} · ${e.final ? "" : "resupply and get ready"}`, kind: "clear" };
            break;
          case "boss_spawn":
            f.banner = { id: id(), t: now, text: e.name, sub: e.title, kind: "boss", dur: 3000 };
            break;
          case "boss_phase":
            f.banner = { id: id(), t: now, text: "ENRAGED", sub: "It's getting faster", kind: "boss" };
            break;
          case "boss_dead":
            f.banner = { id: id(), t: now, text: "BOSS DEFEATED", sub: e.name, kind: "clear", dur: 2600 };
            break;
          case "stage_clear":
            f.banner = { id: id(), t: now, text: "STAGE COMPLETE", sub: "", kind: "win", dur: 2600 };
            break;
          case "spawn":
            if (!seen.current.has(e.ztype) && ZOMBIES[e.ztype]) {
              seen.current.add(e.ztype);
              if (e.ztype !== "walker") f.toast = { id: id(), t: now, text: `NEW THREAT — ${ZOMBIES[e.ztype].name.toUpperCase()}: ${ENEMY_INFO[e.ztype]}` };
            }
            break;
          case "zhit":
            if (!e.splash || e.kill) {
              f.marker = { id: id(), t: now, kind: e.kill ? "kill" : e.zone === 0 ? "head" : e.zone === 3 ? "head" : "hit" };
              flush = true;
            }
            if (e.zone === 0 && !e.boss) {
              f.pops.push({ id: id(), t: now, text: "HEADSHOT!", kind: "head" });
            }
            if (e.zone === 3) f.pops.push({ id: id(), t: now, text: "WEAK POINT!", kind: "head" });
            break;
          case "kill":
            if (e.points > 0) {
              f.pops.push({ id: id(), t: now, text: `+${e.points}${e.combo > 1 ? `  x${e.combo}` : ""}`, kind: "kill" });
              flush = true;
            }
            break;
          case "phurt":
            f.hurt = Math.min(1, f.hurt + 0.35 + e.amount / 40);
            if (e.fx != null) f.arcs.push({ id: id(), t: now, fx: e.fx, fz: e.fz, k: 1 });
            flush = true;
            break;
          case "pickup":
            f.toast = { id: id(), t: now, text: PICKUP_TOAST[e.kind] || e.label };
            break;
          case "pickup_full":
            f.toast = { id: id(), t: now, text: "ALREADY FULL" };
            break;
          case "supply":
            f.toast = { id: id(), t: now, text: "SUPPLY DROP — AMMO BOX NEARBY" };
            break;
          case "pdead":
            setTimeout(() => {
              const r = { ...game.result(), died: true };
              report({ died: true });
              setFinal({ result: r, info: null });
              setPhase("dead");
            }, 1700);
            break;
          case "stage_complete": {
            setTimeout(() => {
              const r = game.result();
              const info = report();
              setFinal({ result: r, info });
              setPhase("complete");
            }, 900);
            break;
          }
          default:
            break;
        }
      }
      if (f.pops.length > 5) f.pops = f.pops.slice(-5);
      if (flush) setFeed({ ...f });
    },
    [game, report, stage],
  );

  // ------------------------------------------------ actions
  const lock = () => {
    if (!TEST) requestLock(containerRef.current);
  };
  const begin = () => {
    audio?.start();
    setBegun(true);
    setManualPause(false);
    lock();
  };
  const resume = () => {
    audio?.start();
    setManualPause(false);
    lock();
  };

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = false;
  };
  const dpr = quality === "low" ? [0.6, 0.85] : quality === "high" ? [1, 1.75] : [0.85, 1.25];
  const shadows = quality !== "low" && settings.shadows !== "off";

  return (
    <div className="zo-play" ref={containerRef} tabIndex={-1}>
      <div className="zo-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`q-${quality}-${settings.shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: settings.fov || 74, near: 0.05, far: 320, position: [game.player.x, 1.6, game.player.z] }}
            onCreated={onCreated}
          >
            <Sizer />
            <GameScene game={game} input={input} audio={audio} settings={settings} paused={paused} onEvents={onEvents} quality={quality} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      {begun && <Hud hud={hud} feed={feed} controlsHint={hints && !ended && !paused} />}
      {!begun && <ClickToPlay stage={stage} onBegin={begin} touch={touchOnly} />}
      {showPause && (
        <PauseMenu
          onResume={resume}
          onRestart={onRestart}
          onStageSelect={onStageSelect}
          onQuit={onMenu}
          settings={settings}
          onChangeSettings={onChangeSettings}
          muted={muted}
        />
      )}
      {phase === "dead" && final && <GameOver result={final.result} onRetry={onRestart} onStageSelect={onStageSelect} onMenu={onMenu} />}
      {phase === "complete" && final && (
        <StageComplete result={final.result} info={final.info} stage={stage} hasNext={hasNext} onNext={onNext} onRetry={onRestart} onMenu={onMenu} />
      )}
      {game.state === STATE.GAME_OVER && phase === "play" && <div className="zo-deathfade" />}
    </div>
  );
}
