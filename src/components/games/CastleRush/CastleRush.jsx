/**
 * Castle Rush — real-time lane strategy for the Game Center (React Three
 * Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session. Menus show a live demo
 * battle (two AI commanders) behind them; the battle engine (engine/engine.js)
 * is ticked by a single useFrame (three/Scene.jsx → <Driver>), never by React.
 *
 * Shared controls:
 *   restartSignal  restarts the CURRENT battle from its starting state (castles,
 *                  gold, units, arrows, AI, clock, cooldowns, result) — saved
 *                  progress is untouched. Ignored on menu screens.
 *   muted          silences every sound and the music immediately.
 *   Fullscreen     only resizes the canvas; the battle keeps running as is.
 * Progress: localStorage `castle-rush-progress` (see utils/storage.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import "./CastleRush.css";
import { Engine } from "./engine/engine.js";
import { audio } from "./audio/audio.js";
import { UNITS, UNIT_IDS } from "./data/units.js";
import { BATTLES, getBattle } from "./data/battles.js";
import { kingdomOf } from "./data/kingdoms.js";
import { loadProgress, saveProgress, applyResult, isUnlocked, nextBattleId } from "./utils/storage.js";
import { Driver, CameraRig, Lights, World, Units, Projectiles, Effects, Floaters, Showcase } from "./three/Scene.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { hasWebGL, useCanvasWatchdog, SceneErrorBoundary } from "./three/CanvasGuard.jsx";
import { TopBar, UnitBar, Banner, Hint, PauseOverlay, ResultOverlay } from "./screens/Hud.jsx";
import { MainMenu, BattlesScreen, ArmyScreen, StatsScreen, SettingsScreen } from "./screens/Menus.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** the menu backdrop: both sides AI, castles never fall */
function demoBattle(kingdom) {
  return { id: 100 + kingdom, kingdom, name: "Demo", playerHp: 1e6, enemyHp: 1e6, startGold: 150, enemyGold: 150, playerUnits: UNIT_IDS, enemyUnits: UNIT_IDS, ai: { level: "normal", push: 0, think: 1.6, counter: 0.5 }, upgrades: false };
}

function Scene3D({ engine, view, bus, fx, kingdom, settings, mode, showcase, layer }) {
  const k = kingdomOf(kingdom);
  const q = settings.graphics;
  const shadows = settings.shadows && q !== "low";
  const motion = settings.cameraMotion && !settings.reducedMotion;
  return (
    <>
      <Driver engine={engine} bus={bus} />
      <Sizer />
      <color attach="background" args={[k.sky]} />
      <fog attach="fog" args={[k.fog, k.fogNear, k.fogFar]} />
      <Lights k={k} shadows={shadows} quality={q} />
      <World k={k} quality={q} engine={engine} bus={bus} fx={fx} view={view} settings={settings} />
      <Units engine={engine} quality={q} view={view} />
      <Projectiles engine={engine} />
      <Effects engine={engine} bus={bus} fx={fx} settings={settings} k={k} />
      <Floaters bus={bus} layer={layer} view={view} settings={settings} engine={engine} />
      {mode === "army" && <Showcase type={showcase} />}
      <CameraRig mode={mode} view={view} motion={motion} kingdomId={kingdom} />
    </>
  );
}

export default function CastleRush({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const [webgl] = useState(hasWebGL);
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasStuck = useCanvasWatchdog(stageRef);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const view = useRef({ shake: 0 }).current;
  const bus = useRef({ handlers: new Set() }).current;
  const fx = useRef(null);

  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settings = progress.settings;
  const [screen, setScreen] = useState("menu");
  const [battleId, setBattleId] = useState(1);
  const [kingdom, setKingdom] = useState(() => getBattle(nextBattleId(loadProgress()))?.kingdom || 1);
  const [mapKingdom, setMapKingdom] = useState(kingdom);
  const [mapSel, setMapSel] = useState(null);
  const [showcase, setShowcase] = useState("swordsman");
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(false);
  const [end, setEnd] = useState(null);
  const [banner, setBanner] = useState(null);
  const [ingameSettings, setIngameSettings] = useState(false);
  const [goldFlash, setGoldFlash] = useState(0);
  const [tut, setTut] = useState(null); // tutorial step text + highlight
  const [touch] = useState(isTouch);
  const applied = useRef(true);
  const inPlay = screen === "play";
  const battle = getBattle(battleId) || BATTLES[0];

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ boot: menu demo */
  useEffect(() => {
    engine.load(demoBattle(kingdom), { demo: true });
    return () => {
      engine.unload();
      audio.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /* ------------------------------------------------ fold a battle once */
  const fold = useCallback(
    (summary) => {
      if (applied.current) return null;
      applied.current = true;
      const out = applyResult(progressRef.current, summary);
      commit(out.progress);
      return out;
    },
    [commit]
  );
  const abandon = useCallback(() => {
    if (applied.current || engine.mode !== "play") return;
    const r = engine.run;
    if (r.time < 10 && !r.deployed) {
      applied.current = true;
      return;
    }
    fold({ result: "abandoned", battleId: engine.battle.id, stars: 0, castleHp: 0, castleMax: 1, run: { ...r, deployedByType: { ...r.deployedByType } } });
  }, [engine, fold]);

  /* ------------------------------------------------ banners */
  const bannerTimer = useRef(0);
  const showBanner = useCallback((b, ms = 2400) => {
    clearTimeout(bannerTimer.current);
    setBanner({ ...b, key: Date.now() + Math.random() });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  /* ------------------------------------------------ tutorial (battle 1) */
  const tutRef = useRef(null); // { step, t }
  const setStep = useCallback((step, t) => {
    tutRef.current = step < 0 ? null : { step, t };
    const T = [
      { text: "Gold grows automatically — watch the counter climb.", hl: null },
      { text: touch ? "Tap SWORDSMAN to deploy a soldier from your gate." : "Click SWORDSMAN (or press 1) to deploy a soldier.", hl: "swordsman" },
      { text: "Your soldiers march and fight on their own.", hl: null },
      { text: "Keep deploying — break their army and destroy the enemy castle!", hl: null },
    ];
    setTut(step < 0 ? null : T[step]);
  }, [touch]);

  /* ------------------------------------------------ engine callbacks */
  const lastGold = useRef(0);
  useEffect(() => {
    engine.cb = {
      hud: (h) => {
        if (engine.mode !== "play") return;
        // soft tick when a unit becomes affordable
        for (const t of h.roster) {
          const c = UNITS[t].cost;
          if (lastGold.current < c && h.gold >= c && h.phase === "playing") {
            audio.goldTick();
            break;
          }
        }
        lastGold.current = h.gold;
        setHud(h);
        const tr = tutRef.current;
        if (tr) {
          const t = engine.run.time;
          if (tr.step === 0 && t - tr.t > 3.2) setStep(1, t);
          else if (tr.step === 2 && t - tr.t > 7) setStep(3, t);
          else if (tr.step === 3 && t - tr.t > 6.5) setStep(-1, t);
        }
      },
      over: (summary) => {
        if (engine.mode !== "play") return;
        const out = fold(summary);
        if (summary.battleId === 1 && !progressRef.current.tutorialDone) commit({ ...progressRef.current, tutorialDone: true });
        if (summary.result === "won") audio.victory();
        else audio.defeat();
        setBanner(null);
        setStep(-1, 0);
        setEnd({ summary, out });
      },
    };
    if (TEST) window.__cr = { engine, view, audio, bus, get progress() { return progressRef.current; } };
    return () => {
      if (TEST) delete window.__cr;
    };
  }, [engine, fold, view, bus, commit, setStep]);

  /* sound + tutorial from battle events */
  useEffect(() => {
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        switch (e.type) {
          case "deploy":
            if (e.side === "player") {
              audio.deploy(e.unit);
              const tr = tutRef.current;
              if (tr && tr.step <= 1) setStep(2, engine.run.time);
            } else audio.enemyDeploy();
            break;
          case "swing":
            if (UNITS[e.unit] && !UNITS[e.unit].ranged) audio.swing(e.unit);
            break;
          case "shoot":
            audio.arrowShot();
            break;
          case "hit":
            if (e.kind === "arrow") audio.arrowHit(e.blocked);
            else if (e.by === "knight") audio.swordHit(true);
            else if (e.unit === "shield") audio.shieldHit();
            else if (e.unit === "knight") audio.armorHit();
            else audio.swordHit(false);
            break;
          case "fizzle":
            audio.arrowMiss();
            break;
          case "kill":
            audio.defeat_unit(e.unit);
            if (e.bounty > 0 && e.side === "enemy") audio.coin();
            if (tutRef.current && tutRef.current.step === 2 && e.side === "enemy") setStep(3, engine.run.time);
            break;
          case "castleHit":
            audio.castleHit(e.kind);
            break;
          case "castleDestroyed":
            audio.castleDestroyed();
            showBanner({ kind: e.side === "enemy" ? "win" : "lose", text: e.side === "enemy" ? "ENEMY CASTLE DESTROYED" : "YOUR CASTLE HAS FALLEN" }, 1900);
            break;
          case "treasury":
            if (e.side === "player") {
              audio.treasury();
              showBanner({ kind: "info", text: "TREASURY UPGRADED", sub: `+${3} gold every second` }, 1500);
            }
            break;
          default:
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, engine, showBanner, setStep]);

  /* ------------------------------------------------ audio + settings */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const shownKingdom = inPlay ? battle.kingdom : kingdom;
  useEffect(() => {
    audio.setMusic(settings.music && !muted && !end && !paused, inPlay ? "battle" : "menu", shownKingdom);
  }, [settings.music, muted, inPlay, shownKingdom, end, paused]);

  const updateSettings = useCallback(
    (s) => {
      audio.unlock();
      audio.ui();
      commit({ ...progressRef.current, settings: s });
    },
    [commit]
  );

  /* ------------------------------------------------ flow */
  const resetBattleUi = () => {
    setEnd(null);
    setBanner(null);
    setPaused(false);
    setIngameSettings(false);
    setStep(-1, 0);
    lastGold.current = 0;
  };

  const startBattle = useCallback(
    (id) => {
      const B = getBattle(id);
      if (!B || !isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      resetBattleUi();
      engine.load(B);
      engine.setSpeed(progressRef.current.settings.speed);
      applied.current = false;
      setBattleId(id);
      setKingdom(B.kingdom);
      setMapKingdom(B.kingdom);
      setHud(engine.hud());
      setScreen("play");
      const k = kingdomOf(B.kingdom);
      showBanner({ kind: "intro", kicker: `${k.name.toUpperCase()} · BATTLE ${B.id}`, text: B.name.toUpperCase(), sub: B.tutorial ? null : B.intro === "treasury" ? "New: the Treasury upgrade raises your income" : null, unit: B.intro && B.intro !== "treasury" ? B.intro : null }, B.intro && B.intro !== "treasury" ? 3600 : 2400);
      if (B.tutorial && !progressRef.current.tutorialDone) setStep(0, 0);
      if (progressRef.current.lastBattle !== id) commit({ ...progressRef.current, lastBattle: id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, commit, showBanner, setStep]
  );

  const toScreen = useCallback(
    (to, k) => {
      audio.unlock();
      audio.ui();
      abandon();
      resetBattleUi();
      setHud(null);
      const kk = k || kingdom;
      if (engine.mode !== "demo" || engine.battle?.kingdom !== kk) engine.load(demoBattle(kk), { demo: true });
      engine.setSpeed(1);
      setKingdom(kk);
      setScreen(to);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, kingdom]
  );

  const togglePause = useCallback(
    (p) => {
      if (!inPlay || end) return;
      audio.ui();
      setPaused(p);
      engine.setPaused(p);
      if (!p) setIngameSettings(false);
    },
    [engine, inPlay, end]
  );

  /* GamePlayer Restart → the current battle from its starting state */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (inPlay) startBattle(battleId);
  }, [restartSignal, inPlay, battleId, startBattle]);

  /* hidden tab → suspend the clock and pause the battle */
  useEffect(() => {
    const vis = () => {
      const hidden = document.visibilityState === "hidden" && !TEST;
      engine.setHidden(hidden);
      if (hidden && engine.mode === "play" && engine.active) {
        setPaused(true);
        engine.setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [engine]);

  /* ------------------------------------------------ actions */
  const deploy = useCallback(
    (type) => {
      if (!inPlay || paused || end) return;
      audio.unlock();
      const r = engine.deploy("player", type);
      if (!r.ok) {
        if (r.reason === "gold") {
          audio.error();
          setGoldFlash((n) => n + 1);
        } else if (r.reason === "cap") {
          audio.error();
          showBanner({ kind: "info", text: "ARMY FULL", sub: "20 soldiers on the field" }, 1200);
        }
      }
    },
    [engine, inPlay, paused, end, showBanner]
  );
  const treasury = useCallback(() => {
    if (!inPlay || paused || end) return;
    audio.unlock();
    const r = engine.upgradeTreasury("player");
    if (!r.ok && r.reason === "gold") {
      audio.error();
      setGoldFlash((n) => n + 1);
    }
  }, [engine, inPlay, paused, end]);
  const toggleSpeed = useCallback(() => {
    audio.ui();
    engine.setSpeed(engine.speed === 2 ? 1 : 2);
  }, [engine]);

  /* keyboard: 1-4 deploy · T treasury · S speed · P/Esc pause */
  useEffect(() => {
    const key = (e) => {
      if (!inPlay) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.repeat) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (ingameSettings) setIngameSettings(false);
        else togglePause(!paused);
        return;
      }
      if (paused || end) return;
      if (/^Digit[1-4]$/.test(e.code)) {
        const type = engine.roster?.player?.[+e.code.slice(5) - 1];
        if (type) deploy(type);
      } else if (e.code === "KeyT") treasury();
      else if (e.code === "KeyS") toggleSpeed();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [inPlay, paused, end, ingameSettings, togglePause, deploy, treasury, toggleSpeed, engine]);

  /* ------------------------------------------------ render */
  const mode = screen === "army" ? "army" : inPlay ? "battle" : screen === "battles" ? "map" : "menu";
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const hasNext = end && getBattle(battle.id + 1) && isUnlocked(progress, battle.id + 1);
  const sceneKingdom = inPlay ? battle.kingdom : kingdom;
  const settingsMemo = useMemo(() => settings, [settings]);

  return (
    <div ref={rootRef} className={`cr${inPlay ? " cr--play" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"} onContextMenu={(e) => e.preventDefault()}>
      <div className="cr-stage" ref={stageRef}>
        {webgl ? (
          <SceneErrorBoundary
            key={canvasKey}
            fallback={(msg, retry) => (
              <div className="cr-glfail" role="alert">
                <strong>The 3D view stopped</strong>
                <span>{msg}</span>
                <button type="button" className="cr-btn cr-btn--primary" onClick={() => (retry(), setCanvasKey((k) => k + 1))}>
                  RETRY
                </button>
              </div>
            )}
          >
            <Canvas
              className="cr-canvas"
              frameloop={frameloop}
              dpr={dpr}
              shadows={settings.shadows && q !== "low"}
              gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
              camera={{ fov: 34, position: [-17, 5, 18], near: 0.3, far: 700 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.0;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
            >
              <Scene3D engine={engine} view={view} bus={bus} fx={fx} kingdom={sceneKingdom} settings={settingsMemo} mode={mode} showcase={showcase} layer={layerRef} />
            </Canvas>
          </SceneErrorBoundary>
        ) : (
          <div className="cr-glfail" role="alert">
            <strong>3D graphics are not available</strong>
            <span>Castle Rush needs WebGL 2. Enable hardware acceleration in your browser settings and reload.</span>
          </div>
        )}
        {webgl && canvasStuck && (
          <div className="cr-glfail cr-glfail--soft" role="alert">
            <strong>The 3D view has not started</strong>
            <button type="button" className="cr-btn cr-btn--primary" onClick={() => setCanvasKey((k) => k + 1)}>
              RETRY
            </button>
          </div>
        )}
      </div>
      <div className="cr-floats" ref={layerRef} aria-hidden="true" />
      {!inPlay && <div className="cr-vignette" aria-hidden="true" />}

      {inPlay && hud && (
        <>
          <TopBar hud={hud} battle={battle} onPause={() => togglePause(true)} onSpeed={toggleSpeed} />
          {!end && <UnitBar hud={hud} onDeploy={deploy} onTreasury={treasury} highlight={tut?.hl} flash={goldFlash} />}
          {!end && <Banner banner={banner} />}
          {!end && !paused && <Hint text={tut?.text} />}
        </>
      )}

      {inPlay && paused && !end && !ingameSettings && (
        <PauseOverlay
          onResume={() => togglePause(false)}
          onRestart={() => startBattle(battleId)}
          onSettings={() => (audio.ui(), setIngameSettings(true))}
          onQuit={() => {
            setMapSel(battle.id);
            setMapKingdom(battle.kingdom);
            toScreen("battles", battle.kingdom);
          }}
        />
      )}
      {inPlay && paused && ingameSettings && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => (audio.ui(), setIngameSettings(false))} inGame />}

      {inPlay && end && (
        <ResultOverlay
          end={end}
          battle={battle}
          hasNext={hasNext}
          onNext={() => startBattle(battle.id + 1)}
          onReplay={() => startBattle(battle.id)}
          onLevels={() => {
            const id = hasNext ? battle.id + 1 : battle.id;
            const kk = getBattle(id).kingdom;
            setMapSel(id);
            setMapKingdom(kk);
            toScreen("battles", kk);
          }}
        />
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startBattle(nextBattleId(progressRef.current))}
          onBattles={() => {
            const id = nextBattleId(progressRef.current);
            const kk = getBattle(id).kingdom;
            setMapSel(id);
            setMapKingdom(kk);
            toScreen("battles", kk);
          }}
          onArmy={() => toScreen("army")}
          onStats={() => toScreen("stats")}
          onSettings={() => toScreen("settings")}
        />
      )}
      {screen === "battles" && (
        <BattlesScreen
          progress={progress}
          kingdom={mapKingdom}
          selected={mapSel}
          onKingdom={(kk) => {
            audio.ui();
            setMapKingdom(kk);
            setMapSel(null);
            if (engine.battle?.kingdom !== kk) engine.load(demoBattle(kk), { demo: true });
            setKingdom(kk);
          }}
          onSelect={(id) => {
            audio.ui();
            setMapSel(id);
          }}
          onPlay={startBattle}
          onBack={() => toScreen("menu", getBattle(nextBattleId(progressRef.current)).kingdom)}
        />
      )}
      {screen === "army" && (
        <ArmyScreen
          progress={progress}
          type={showcase}
          onType={(t) => {
            audio.ui();
            setShowcase(t);
          }}
          onBack={() => toScreen("menu")}
        />
      )}
      {screen === "stats" && <StatsScreen progress={progress} onBack={() => toScreen("menu")} />}
      {screen === "settings" && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => toScreen("menu")} />}
    </div>
  );
}
