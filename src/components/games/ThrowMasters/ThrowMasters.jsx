/**
 * Throw Masters — turn-based 2D throwing duels, for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One <canvas> is driven by a requestAnimationFrame loop that
 * steps the active Battle (battle.js → physics.js / ai.js) and draws it
 * (render.js). React only renders menus, the HUD and overlays, and only
 * re-renders on battle events (turn change, hit, result) — never per frame.
 * Behind the menus the canvas plays an AI-vs-AI demo battle.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current battle. `muted`
 * silences every sound. Fullscreen just resizes the stage; a ResizeObserver
 * refits the canvas. Progress lives in localStorage (progress.js).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./ThrowMasters.css";
import { CHARACTERS, CHAR_BY_ID, SKIN_BY_ID, DIFFICULTY, ARENAS, ARENA_BY_ID, TOURNAMENT, DUEL_LAYOUTS, makeLayout } from "./data.js";
import { Battle } from "./battle.js";
import { createView, resizeView, toWorld, draw } from "./render.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, defaultProgress } from "./progress.js";
import { MainMenu, CharacterSelect, ModeSelect, DuelSetup, TournamentMap, HowTo, Settings, Hud, TutorialHint, PausePanel, ResultPanel } from "./screens.jsx";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tmtest");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SPINNERS = new Set(["axe", "knives", "hammer", "shuriken", "boomerang", "fireball"]);

function demoBattle() {
  const a = pick(CHARACTERS).id;
  let b = pick(CHARACTERS).id;
  if (b === a) b = CHARACTERS[(CHARACTERS.findIndex((c) => c.id === a) + 3) % CHARACTERS.length].id;
  return new Battle({
    mode: "demo",
    arena: pick(ARENAS).id,
    layout: makeLayout(pick(DUEL_LAYOUTS)),
    players: [{ charId: a, skill: 0.55 }, { charId: b, skill: 0.55 }],
  });
}

const EMPTY_HUD = { hp: [0, 0], maxHp: [1, 1], turn: 0, turnNo: 1, phase: "intro", throwsLeft: 0, score: 0, streak: 0 };

export default function ThrowMasters({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(null);
  const battleRef = useRef(null);
  const demoRef = useRef(null);
  const pausedRef = useRef(false);
  const configRef = useRef(null);
  const fitRef = useRef(null);
  const sndRef = useRef({ whoosh: 0, charge: -1 });

  const [progress, setProgress] = useState(loadProgress);
  const progRef = useRef(progress);
  progRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [flow, setFlow] = useState(null); // where character select leads: {next, p1}
  const [hud, setHud] = useState(EMPTY_HUD);
  const [info, setInfo] = useState("");
  const [banner, setBanner] = useState(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [tutor, setTutor] = useState(false);
  const [battleKey, setBattleKey] = useState(0);

  pausedRef.current = paused;

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  const updateProgress = useCallback((fn) => setProgress((p) => ({ ...p, ...fn(p) })), []);

  /* ------------------------------------------------------------ battle events */
  const onEvent = useRef(null);
  onEvent.current = (type, d) => {
    const b = battleRef.current;
    if (!b) return;
    switch (type) {
      case "turn": {
        setHud(b.hud());
        const local = b.mode === "local";
        const text = b.mode === "target" ? `THROW ${11 - b.throwsLeft}/10` : local ? `PLAYER ${d.side + 1}` : d.human ? "YOUR TURN" : "ENEMY TURN";
        setBanner({ key: `${d.turnNo}-${b.throwsLeft}`, text, enemy: !local && !d.human });
        audio.turn(d.human);
        break;
      }
      case "throw":
        audio.throw(d.weapon, d.power);
        sndRef.current.whoosh = 0.18;
        setBanner(null);
        setHud(b.hud());
        break;
      case "hit":
        audio.hit(d.zone);
        break;
      case "hp":
      case "hud":
        setHud(b.hud());
        break;
      case "impact":
        if (!d.burst) audio.impact(d.kind, d.weapon);
        break;
      case "burst":
        audio.burst(d.weapon);
        break;
      case "explode":
        audio.explode();
        break;
      case "bounce":
        audio.bounce();
        break;
      case "ricochet":
        audio.ricochet();
        break;
      case "catch":
        audio.catch();
        break;
      case "target":
        audio.target(d.bullseye);
        break;
      case "finish": {
        setHud(b.hud());
        const humanWon = b.mode === "target" || b.mode === "local" ? true : d.winner === 0;
        if (humanWon) audio.victory();
        else audio.defeat();
        break;
      }
      case "over":
        finishBattle(b, d);
        break;
      default:
        break;
    }
  };

  /* ------------------------------------------------------------ loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const view = createView();
    view.filter = typeof ctx.filter === "string";
    viewRef.current = view;
    demoRef.current = demoBattle();

    let redraw = () => {};
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return;
      resizeView(view, canvas, r.width, r.height, window.devicePixelRatio || 1);
      redraw(); // resizing clears the canvas — repaint now, not next frame
    };
    fitRef.current = fit;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);

    const step = (dt) => {
      let b = battleRef.current;
      if (!b) {
        b = demoRef.current;
        if (b.phase === "done") b = demoRef.current = demoBattle();
      }
      if (!pausedRef.current || !battleRef.current) {
        b.update(dt);
        // flight whooshes for spinning weapons
        if (battleRef.current && b.projectiles.length) {
          const s = sndRef.current;
          s.whoosh -= dt;
          const p = b.projectiles[0];
          if (s.whoosh <= 0 && SPINNERS.has(p.id)) {
            audio.whoosh(p.id);
            s.whoosh = p.id === "fireball" ? 0.22 : 0.3;
          }
        }
      }
      draw(ctx, view, b, { shake: progRef.current.settings.shake });
    };
    redraw = () => step(0);

    let raf = 0;
    let last = 0;
    const frame = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      step(dt);
      raf = requestAnimationFrame(frame);
    };
    if (TEST) {
      window.__tm = {
        battle: () => battleRef.current,
        demo: () => demoRef.current,
        view,
        fit,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) step(dt);
        },
      };
    } else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      battleRef.current = null;
      demoRef.current = null;
      if (TEST) delete window.__tm;
    };
  }, []);

  /* ------------------------------------------------------------ battles */
  const startBattle = useCallback((cfg) => {
    configRef.current = cfg;
    const p = progRef.current;
    const skin = p.skin;
    let players;
    let layout;
    let arena;
    let infoText;
    if (cfg.mode === "tournament") {
      const T = TOURNAMENT[cfg.index];
      arena = T.arena;
      layout = makeLayout(T.layout);
      players = [
        { charId: cfg.p1, human: true, skin },
        { charId: T.opponent, skill: T.skill, hpMul: T.hpMul },
      ];
      infoText = `BATTLE ${T.index + 1}/30${T.boss ? " · CHAMPION" : ""} · ${ARENA_BY_ID[arena].name.toUpperCase()}`;
    } else if (cfg.mode === "target") {
      arena = cfg.arena;
      layout = makeLayout({ dist: 900 });
      players = [{ charId: cfg.p1, human: true, skin }];
      infoText = `TARGET CHALLENGE · BEST ${p.bestTarget}`;
    } else if (cfg.mode === "local") {
      arena = cfg.arena;
      layout = makeLayout(cfg.layout);
      players = [
        { charId: cfg.p1, human: true, skin, name: "Player 1" },
        { charId: cfg.p2, human: true, skin, name: "Player 2" },
      ];
      infoText = `LOCAL 2 PLAYER · ${ARENA_BY_ID[arena].name.toUpperCase()}`;
    } else {
      arena = cfg.arena;
      layout = makeLayout(cfg.layout);
      players = [
        { charId: cfg.p1, human: true, skin },
        { charId: cfg.opponent, skill: DIFFICULTY[cfg.difficulty].skill },
      ];
      infoText = `CLASSIC DUEL · ${DIFFICULTY[cfg.difficulty].label.toUpperCase()} · ${ARENA_BY_ID[arena].name.toUpperCase()}`;
    }
    const b = new Battle({
      mode: cfg.mode,
      arena,
      layout,
      players,
      settings: p.settings,
      onEvent: (t, d) => onEvent.current?.(t, d),
    });
    battleRef.current = b;
    setHud(b.hud());
    setInfo(infoText);
    setResult(null);
    setPaused(false);
    setBanner({ key: `intro-${Date.now()}`, text: cfg.mode === "target" ? "READY?" : "FIGHT!", enemy: false });
    setTutor(!p.tutorialDone);
    setScreen("battle");
    setBattleKey((k) => k + 1);
    sndRef.current = { whoosh: 0, charge: -1 };
  }, []);

  const restartBattle = useCallback(() => {
    if (configRef.current) {
      audio.ui();
      startBattle(configRef.current);
    }
  }, [startBattle]);

  const toMenu = useCallback(() => {
    battleRef.current = null;
    configRef.current = null;
    setResult(null);
    setPaused(false);
    setScreen("menu");
    setFlow(null);
  }, []);

  function finishBattle(b, r) {
    const cfg = configRef.current;
    const p = progRef.current;
    const s = r.stats[0];
    const acc = s.throws ? Math.round((s.hits / s.throws) * 100) : 0;
    let coins = 0;
    let title;
    let sub;
    let win;
    let next = null;
    const rows = [];
    const patch = {};
    if (b.mode === "target") {
      win = true;
      coins = Math.floor(r.score / 10);
      const best = r.score > p.bestTarget;
      title = best ? "NEW BEST!" : "CHALLENGE OVER";
      sub = "TARGET CHALLENGE";
      rows.push(["Score", r.score], ["Best", Math.max(r.score, p.bestTarget)], ["Hits", `${s.hits}/${s.throws}`], ["Accuracy", `${acc}%`]);
      if (best) patch.bestTarget = r.score;
    } else if (b.mode === "local") {
      win = r.winner >= 0;
      title = r.winner >= 0 ? `PLAYER ${r.winner + 1} WINS!` : "DRAW!";
      sub = "LOCAL 2 PLAYER";
      const s2 = r.stats[1];
      rows.push(
        ["P1 damage", s.dmg],
        ["P2 damage", s2.dmg],
        ["P1 accuracy", `${acc}%`],
        ["P2 accuracy", `${s2.throws ? Math.round((s2.hits / s2.throws) * 100) : 0}%`]
      );
    } else {
      win = r.winner === 0;
      title = win ? "VICTORY!" : "DEFEAT";
      if (b.mode === "tournament") {
        const T = TOURNAMENT[cfg.index];
        sub = `TOURNAMENT · BATTLE ${T.index + 1}/30`;
        if (win) {
          const first = cfg.index >= p.tournament;
          coins = first ? T.reward : 25;
          if (first) patch.tournament = Math.max(p.tournament, cfg.index + 1);
          if (cfg.index + 1 < TOURNAMENT.length) next = cfg.index + 1;
          if (cfg.index === TOURNAMENT.length - 1) title = "CHAMPION!";
        } else coins = 10;
      } else {
        sub = `CLASSIC DUEL · ${DIFFICULTY[cfg.difficulty].label.toUpperCase()}`;
        coins = win ? DIFFICULTY[cfg.difficulty].reward + Math.round(acc / 5) : 10;
      }
      rows.push(["Damage dealt", s.dmg], ["Accuracy", `${acc}%`], ["Headshots", s.heads], ["Turns", r.turns]);
      if (win) patch.wins = p.wins + 1;
    }
    if (coins) {
      patch.coins = p.coins + coins;
      setTimeout(() => audio.coin(), 350);
    }
    if (Object.keys(patch).length) updateProgress(() => patch);
    setResult({ title, sub, win, coins, rows, next });
  }

  /* ------------------------------------------------------------ restart (GamePlayer) */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "battle" && configRef.current) startBattle(configRef.current);
  }, [restartSignal, screen, startBattle]);

  /* ------------------------------------------------------------ keyboard: pause */
  const inBattle = screen === "battle";
  useEffect(() => {
    if (!inBattle) return undefined;
    const down = (ev) => {
      if (ev.key !== "Escape" && ev.key !== "p" && ev.key !== "P") return;
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (result) return;
      if (ev.key === "Escape" && document.fullscreenElement) return; // browser leaves fullscreen
      battleRef.current?.cancelAim();
      setPaused((v) => !v);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [inBattle, result]);

  /* ------------------------------------------------------------ pointer aiming */
  const aimingRef = useRef(false);
  const toW = (ev) => {
    const r = rootRef.current.getBoundingClientRect();
    return toWorld(viewRef.current, battleRef.current.cam, ev.clientX - r.left, ev.clientY - r.top);
  };
  const onPointerDown = (ev) => {
    const b = battleRef.current;
    if (!b || pausedRef.current || ev.target.closest("button, .tm-hud__mid, .tm-fp")) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    audio.unlock();
    const w = toW(ev);
    if (b.pointerDown(w.x, w.y)) {
      aimingRef.current = true;
      sndRef.current.charge = -1;
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch {
        /* synthetic events can't be captured */
      }
      ev.preventDefault();
    }
  };
  const onPointerMove = (ev) => {
    const b = battleRef.current;
    if (!b || !aimingRef.current) return;
    const w = toW(ev);
    b.pointerMove(w.x, w.y);
    const step = Math.floor(b.current.aimPower * 10);
    if (step !== sndRef.current.charge) {
      sndRef.current.charge = step;
      if (b.aim?.valid) audio.charge(b.current.aimPower);
    }
  };
  const onPointerUp = () => {
    const b = battleRef.current;
    if (!b || !aimingRef.current) return;
    aimingRef.current = false;
    if (b.pointerUp() && tutor) {
      setTutor(false);
      updateProgress(() => ({ tutorialDone: true }));
    }
  };
  const onPointerCancel = () => {
    aimingRef.current = false;
    battleRef.current?.cancelAim();
  };

  /* ------------------------------------------------------------ navigation */
  const nav = useCallback(
    (id) => {
      audio.unlock();
      audio.ui();
      switch (id) {
        case "play":
          setFlow({ next: "modes" });
          setScreen("chars");
          break;
        case "tournament":
        case "target":
        case "local":
          setFlow({ next: id });
          setScreen("chars");
          break;
        case "chars":
          setFlow({ next: "browse" });
          setScreen("chars");
          break;
        default:
          setScreen(id);
      }
    },
    []
  );

  const goNext = useCallback(
    (next, charId) => {
      if (next === "modes") setScreen("modes");
      else if (next === "tournament") setScreen("tournament");
      else if (next === "duel") setScreen("duel");
      else if (next === "target") startBattle({ mode: "target", p1: charId, arena: pick(ARENAS).id });
      else if (next === "local") {
        setFlow({ next: "local2", p1: charId });
        setScreen("chars2");
      } else setScreen("menu");
    },
    [startBattle]
  );

  const onCharConfirm = (charId) => {
    audio.ui();
    updateProgress(() => ({ selected: charId }));
    goNext(flow?.next || "browse", charId);
  };

  const onUnlock = (charId) => {
    const c = CHAR_BY_ID[charId];
    const p = progRef.current;
    if (p.unlocked.includes(charId) || p.coins < c.price) return;
    audio.coin();
    updateProgress((q) => ({ coins: q.coins - c.price, unlocked: [...q.unlocked, charId], selected: charId }));
  };

  const onSkin = (skinId, buy) => {
    const s = SKIN_BY_ID[skinId];
    const p = progRef.current;
    if (buy) {
      if (p.skins.includes(skinId) || p.coins < s.price) return;
      audio.coin();
      updateProgress((q) => ({ coins: q.coins - s.price, skins: [...q.skins, skinId], skin: skinId }));
    } else {
      audio.ui();
      updateProgress(() => ({ skin: skinId }));
    }
  };

  const startDuel = ({ difficulty, arena }) => {
    audio.ui();
    const p1 = progRef.current.selected;
    const others = CHARACTERS.filter((c) => c.id !== p1);
    startBattle({
      mode: "duel",
      p1,
      opponent: pick(others).id,
      difficulty,
      arena: arena === "random" ? pick(ARENAS).id : arena,
      layout: pick(DUEL_LAYOUTS),
    });
  };

  const startTournament = (index) => {
    audio.ui();
    startBattle({ mode: "tournament", index, p1: progRef.current.selected });
  };

  const startLocal = (p2) => {
    audio.ui();
    startBattle({ mode: "local", p1: flow.p1, p2, arena: pick(ARENAS).id, layout: pick(DUEL_LAYOUTS) });
  };

  /* ------------------------------------------------------------ test hooks */
  useEffect(() => {
    if (!TEST || !window.__tm) return;
    Object.assign(window.__tm, {
      screen: () => screen,
      setScreen,
      progress: () => progRef.current,
      setProgress: (fn) => updateProgress(fn),
      start: (cfg) => startBattle(cfg),
      result: () => result,
      paused: () => paused,
    });
  });

  /* ------------------------------------------------------------ view */
  const b = battleRef.current;
  const showTutor = inBattle && tutor && !paused && !result && hud.phase === "aim" && b?.current?.human;

  return (
    <div
      ref={rootRef}
      className={`tm${inBattle ? " tm--battle" : ""}`}
      onPointerDown={inBattle ? onPointerDown : undefined}
      onPointerMove={inBattle ? onPointerMove : undefined}
      onPointerUp={inBattle ? onPointerUp : undefined}
      onPointerCancel={inBattle ? onPointerCancel : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="tm-canvas" aria-hidden="true" />

      {screen === "menu" && <MainMenu coins={progress.coins} onNav={nav} />}

      {screen === "chars" && (
        <CharacterSelect
          progress={progress}
          purpose={flow?.next === "browse" ? "browse" : "pick"}
          title={flow?.next === "local" ? "PLAYER 1 · PICK FIGHTER" : flow?.next === "browse" ? "CHARACTERS" : "CHOOSE YOUR FIGHTER"}
          onBack={() => {
            audio.ui();
            setScreen("menu");
          }}
          onConfirm={onCharConfirm}
          onUnlock={onUnlock}
          onSkin={onSkin}
        />
      )}

      {screen === "chars2" && (
        <CharacterSelect
          key="p2"
          progress={progress}
          purpose="p2"
          title="PLAYER 2 · PICK FIGHTER"
          onBack={() => {
            audio.ui();
            setFlow({ next: "local" });
            setScreen("chars");
          }}
          onConfirm={startLocal}
          onUnlock={onUnlock}
          onSkin={onSkin}
        />
      )}

      {screen === "modes" && (
        <ModeSelect
          progress={progress}
          onBack={() => {
            audio.ui();
            setScreen("chars");
          }}
          onPick={(m) => {
            audio.ui();
            if (m === "local") {
              setFlow({ next: "local2", p1: progRef.current.selected });
              setScreen("chars2");
            } else goNext(m, progRef.current.selected);
          }}
        />
      )}

      {screen === "duel" && (
        <DuelSetup
          onBack={() => {
            audio.ui();
            setScreen("modes");
          }}
          onStart={startDuel}
        />
      )}

      {screen === "tournament" && (
        <TournamentMap
          progress={progress}
          onBack={() => {
            audio.ui();
            setScreen("menu");
          }}
          onStart={startTournament}
        />
      )}

      {screen === "how" && (
        <HowTo
          onBack={() => {
            audio.ui();
            setScreen("menu");
          }}
        />
      )}

      {screen === "settings" && (
        <Settings
          progress={progress}
          onBack={() => {
            audio.ui();
            setScreen("menu");
          }}
          onChange={(s) => {
            audio.ui();
            updateProgress((q) => ({ settings: { ...q.settings, ...s } }));
          }}
          onReset={() => {
            audio.ui();
            setProgress(defaultProgress());
          }}
        />
      )}

      {inBattle && b && (
        <Hud
          key={battleKey}
          battle={b}
          hud={hud}
          info={info}
          turnBanner={!paused && !result ? banner : null}
          onPause={() => {
            audio.unlock();
            audio.ui();
            b.cancelAim();
            setPaused(true);
          }}
        />
      )}

      {showTutor && <TutorialHint aim={progress.settings.aim} />}

      {inBattle && paused && !result && (
        <PausePanel
          onResume={() => {
            audio.ui();
            setPaused(false);
          }}
          onRestart={restartBattle}
          onQuit={() => {
            audio.ui();
            toMenu();
          }}
        />
      )}

      {inBattle && result && (
        <ResultPanel
          result={result}
          onRetry={restartBattle}
          onNext={result.next != null ? () => startTournament(result.next) : null}
          onMenu={() => {
            audio.ui();
            toMenu();
          }}
        />
      )}
    </div>
  );
}
