/**
 * Ultimate MMA Championship 3D — realistic 3D MMA for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Plain Three.js does the 3D (render/world.js); the fight is
 * a deterministic fixed-timestep simulation (engine/*) stepped by the world;
 * React renders menus and a HUD refreshed ~10×/s from a snapshot.
 *
 * Modes: Quick Fight · Career (amateur → three world titles) · 8-man
 * Tournament · Training (lessons + adjustable dummy).
 *
 * GamePlayer: `restartSignal` restarts the current fight (or returns to the
 * main menu outside a fight); `muted` silences all audio; Fullscreen is
 * handled by GamePlayer (the canvas follows the stage size).
 *
 * DEV test hooks: `?umctest=1` → no rAF loop, window.__umc (see tools/harness.mjs).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./UltimateMMA3D.css";
import { createWorld } from "./render/world.js";
import { loadAssets } from "./render/assets.js";
import { audio } from "./audio.js";
import { Match } from "./engine/match.js";
import { createAI } from "./engine/ai.js";
import { overallHealth, staMax } from "./engine/fighter.js";
import { groundOptions, clinchDom, enterGround } from "./engine/grapple.js";
import { MOVES } from "./engine/moves.js";
import { loadSave, writeSave, loadSettings, writeSettings } from "./engine/save.js";
import { newCareer, applyResult, train, equip, careerFighterData, pendingScene, markScene, unlockedArenaTier } from "./engine/career.js";
import { newTournament, advance, reportPlayer } from "./engine/tournament.js";
import { FIGHTER_BY_ID } from "./data/fighters.js";
import { ARENA_BY_ID } from "./data/arenas.js";
import { TIERS, BELTS, RIVAL_BY_ID, COACH_REACT, ANNOUNCER } from "./data/career.js";
import { LESSONS, DUMMIES } from "./data/training.js";
import { createControls } from "./ui/controls.js";
import { FightHud, Popups, IntroCard, RoundBreak, ResultPanel, PauseMenu, TouchPad } from "./ui/Hud.jsx";
import { MainMenu, QuickFight, Settings, ControlsHelp } from "./ui/Screens.jsx";
import { CareerCreate, CareerHub, Dialogue } from "./ui/CareerScreens.jsx";
import { TournamentSetup, Bracket, TrainingMenu, LessonPanel } from "./ui/ModeScreens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("umctest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : null);
const isTouch = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default function UltimateMMA3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const controlsRef = useRef(null);
  if (!controlsRef.current) controlsRef.current = createControls();
  const matchRef = useRef(null);
  const aiRef = useRef(null);
  const fightRef = useRef(null); // current fight config
  const seqRef = useRef(null); // finishing sequence
  const hudLag = useRef([100, 100]);
  const lessonRef = useRef({});
  const moveRef = useRef(null);
  const stepT = useRef([0, 0]);

  const [boot, setBoot] = useState({ p: 0, err: null });
  const [screen, setScreenState] = useState("loading");
  const screenRef = useRef("loading");
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [popups, setPopups] = useState([]);
  const [introStep, setIntroStep] = useState(0);
  const [saveState, setSaveState] = useState(() => loadSave(store() || undefined));
  const save = saveState.save;
  const [settings, setSettings] = useState(() => loadSettings(store() || undefined));
  const [outcome, setOutcome] = useState(null);
  const [scene, setScene] = useState(null);
  const [lessonProg, setLessonProg] = useState({});
  const [dummy, setDummyState] = useState("sparring");
  const [toast, setToast] = useState(saveState.status.corrupt ? "Your previous save was damaged and has been set aside — starting fresh." : null);
  const [quickInit, setQuickInit] = useState(null);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);

  /* ------------------------------------------------------------ persistence */
  const commitSave = useCallback((fn) => {
    setSaveState((prev) => {
      const next = { ...prev, save: fn(prev.save) };
      writeSave(next.save, store() || undefined);
      return next;
    });
  }, []);
  const setSetting = useCallback((k, v) => {
    setSettings((s) => {
      const n = { ...s, [k]: v };
      writeSettings(n, store() || undefined);
      if (k === "quality") worldRef.current?.setQuality(v);
      if (k === "master" || k === "sfx" || k === "crowd") audio.setVolumes({ [k]: v });
      return n;
    });
  }, []);

  /* ------------------------------------------------------------ popups */
  const popId = useRef(0);
  const pop = useCallback((text, kind = "info", ms = 1300) => {
    const id = ++popId.current;
    setPopups((p) => [...p.slice(-3), { id, text, kind }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), ms);
  }, []);

  /* ------------------------------------------------------------ world */
  useEffect(() => {
    const host = stageRef.current;
    const world = createWorld(host, { quality: settings.quality, test: TEST });
    worldRef.current = world;
    let alive = true;
    loadAssets((p) => alive && setBoot((b) => ({ ...b, p }))).catch(() => {});
    world.ready
      .then(() => {
        if (!alive) return;
        world.setArena("underground");
        setBoot({ p: 1, err: null });
        setScreen("menu");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setBoot({ p: 0, err: "The fighter models failed to load. Check your connection and retry." });
      });
    const fit = () => {
      const r = host.getBoundingClientRect();
      world.resize(r.width || 1280, r.height || 720);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(host);
    window.addEventListener("resize", fit);
    return () => {
      alive = false;
      ro?.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => {
    audio.setVolumes({ master: settings.master, sfx: settings.sfx, crowd: settings.crowd });
    return () => audio.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ hud snapshot */
  const publishHud = useCallback(() => {
    const m = matchRef.current;
    if (!m) return;
    const f = m.f.map((x, i) => {
      const hp = overallHealth(x);
      hudLag.current[i] = Math.max(hp, hudLag.current[i] - 2.5);
      return { name: x.name, flag: x.data.flag, record: `${x.data.record?.[0] ?? 0}-${x.data.record?.[1] ?? 0}`, hp, hpLag: hudLag.current[i], head: x.hp.head, body: x.hp.body, legs: x.hp.legs, sta: x.sta, staMax: staMax(x), staBase: x.staMaxBase, kd: x.kdRound, daze: x.daze };
    });
    setHud({
      phase: m.phase,
      round: m.round,
      rounds: m.cfg.rounds,
      clock: m.clock,
      training: !!m.cfg.training,
      title: m.cfg.titleLabel || null,
      f,
      ctx: m.sub ? "sub" : m.transition ? "transition" : m.ground ? "ground" : m.clinch ? "clinch" : "stand",
      ground: m.ground ? { pos: m.ground.pos, top: m.ground.top === 0 } : null,
      options: m.ground ? groundOptions(m, m.f[0]) : [],
      clinchDom: m.clinch ? clinchDom(m, m.f[0]) : 0,
      sub: m.sub ? { type: m.sub.type, att: m.sub.att, prog: m.sub.prog, esc: m.sub.esc, marker: m.sub.marker, zones: { 0: m.sub.zones[0], 1: m.sub.zones[1] } } : null,
    });
  }, []);

  /* ------------------------------------------------------------ events → audio / popups / lessons */
  const lessonCount = useCallback((k, n = 1) => {
    lessonRef.current = { ...lessonRef.current, [k]: (lessonRef.current[k] || 0) + n };
  }, []);
  const onEvent = useCallback(
    (e) => {
      const m = matchRef.current;
      if (!m) return;
      const mine = (s) => s === 0;
      switch (e.type) {
        case "swing":
          audio.whoosh(MOVES[e.move]?.kind === "kick" ? 0.9 : 0.4);
          break;
        case "hit": {
          const kind = e.kind;
          if (kind === "kick" || kind === "knee") audio.kick(Math.min(1, e.dmg / 10));
          else audio.punch(Math.min(1, e.dmg / 8));
          if (e.heavy) audio.ooh(0.8);
          if (e.counter && e.by === 0) pop("COUNTER!", "gold", 900);
          if (e.by === 0) {
            const mv = e.move;
            lessonCount(`land:${mv}`);
            if (mv === "hookL" || mv === "hookR") lessonCount("land:hook");
            if (e.zone === "body" && MOVES[mv]?.kind === "punch") lessonCount("land:body");
            if (e.counter) lessonCount("counter");
          }
          break;
        }
        case "block":
          if (MOVES[e.move]?.kind === "kick") audio.kick(0.5, true);
          else audio.punch(0.4, true);
          if (e.side === 0) {
            lessonCount("block");
            if (e.zone !== "head") lessonCount("blockBody");
          }
          break;
        case "evade":
          if (e.side === 0) lessonCount("evade");
          break;
        case "combo":
          if (e.side === 0) {
            pop(e.signature ? `★ ${e.name}` : e.name, e.signature ? "gold" : "combo", 1100);
            lessonCount(`combo:${e.id}`);
          }
          break;
        case "knockdown":
          audio.thud();
          audio.roar(1);
          audio.ref("stop");
          pop(e.training ? "DOWN!" : "KNOCKDOWN!", "big", 1800);
          break;
        case "clinch":
          lessonCount("clinch");
          audio.thud();
          break;
        case "takedown":
          audio.thud();
          audio.ooh(1);
          pop("TAKEDOWN!", "info", 1100);
          if (e.by === 0) lessonCount("td");
          break;
        case "tdStuffed":
          if (e.by === 0) {
            pop(e.sprawl ? "SPRAWL!" : "STUFFED!", "info", 900);
            lessonCount("sprawl");
          }
          break;
        case "position":
          if (e.top === 0 && e.adv) lessonCount("advance");
          if (e.top === 0 && e.pos === "mount") lessonCount("pos:mount");
          if (e.sweep) pop("SWEEP!", "info", 900);
          break;
        case "gnp":
          if (!e.blocked) audio.punch(0.6);
          else audio.punch(0.3, true);
          if (e.by === 0) lessonCount("gnp");
          break;
        case "sub":
          pop(`${e.sub === "rnc" ? "REAR-NAKED CHOKE" : e.sub.toUpperCase()}!`, "big", 1200);
          audio.ooh(1.2);
          if (e.side === 0) lessonCount("subAtt");
          break;
        case "subTap":
          if (e.side === 0) audio.tap(e.good);
          break;
        case "subEscape":
          pop("ESCAPED!", "info", 1000);
          break;
        case "tap":
          if (e.by === 0) lessonCount("tap");
          break;
        case "ref":
          audio.ref(e.text === "BREAK!" ? "break" : "stop");
          pop(`Referee: ${e.text}`, "ref", 1400);
          break;
        case "roundStart":
          pop(m.cfg.training ? "TRAINING" : `ROUND ${e.round}`, "big", 1300);
          break;
        case "bell":
          audio.bell(e.end ? 3 : 1);
          if (e.start) {
            pop("FIGHT!", "big", 900);
            audio.ref("fight");
          }
          if (e.end) audio.roar(0.6);
          break;
        case "finish":
          audio.roar(1.4);
          if (e.method === "KO" || e.method === "TKO") pop(e.method === "KO" ? "KNOCKOUT!" : "TKO!", "huge", 2600);
          else if (e.method === "SUB") pop("SUBMISSION!", "huge", 2600);
          seqRef.current = { stage: "finish", t: 0, method: e.method };
          break;
        case "replayEnd":
          if (seqRef.current) seqRef.current = { ...seqRef.current, stage: "victory", t: 0 };
          break;
        default:
          break;
      }
      if (mine(e.side) && e.type === "dodge") audio.whoosh(0.3);
    },
    [pop, lessonCount]
  );
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    return w.onEvent((e) => onEvent(e));
  }, [onEvent, boot.p]);

  /* ------------------------------------------------------------ per-frame tick */
  const hudAcc = useRef(0);
  const tick = useCallback(
    (dt) => {
      const w = worldRef.current;
      if (!w) return;
      w.frame(dt);
      const m = matchRef.current;
      if (!m || screenRef.current !== "fight") return;
      // intro timeline
      if (overlayRef.current === "intro") {
        const t = w.introT;
        const s = t < 3.2 ? 0 : t < 6.4 ? 1 : t < 9.6 ? 2 : 3;
        setIntroStep((p) => (p === s ? p : s));
        if (t > 11.6) endIntro();
      }
      // footsteps + crowd bed
      for (const f of m.f) {
        const sp = Math.hypot(f.vel.x, f.vel.z);
        stepT.current[f.side] -= dt * sp;
        if (sp > 0.4 && stepT.current[f.side] <= 0) {
          stepT.current[f.side] = 0.45;
          audio.step();
        }
      }
      audio.crowd(Math.min(1, 0.25 + (m.phase === "fight" ? 0.15 : 0) + (m.ground || m.sub ? 0.25 : 0)));
      // training: movement drills
      if (m.cfg.training && moveRef.current) {
        const p = m.f[0];
        const o = m.f[1];
        const dx = p.pos.x - moveRef.current.x;
        const dz = p.pos.z - moveRef.current.z;
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const fwd = dx * fx + dz * fz;
        const lat = Math.abs(dx * fz - dz * fx);
        if (fwd > 0) lessonCount("moveF", fwd);
        else lessonCount("moveB", -fwd);
        lessonCount("moveL", lat);
        moveRef.current = { x: p.pos.x, z: p.pos.z };
        void o;
      }
      // phase-driven overlays
      if (m.phase === "rest" && overlayRef.current !== "rest" && overlayRef.current !== "pause") setOverlay("rest");
      const sq = seqRef.current;
      if (sq) {
        sq.t += dt;
        if (sq.stage === "finish") {
          const isKO = sq.method === "KO" || sq.method === "TKO";
          if (isKO && sq.t > 1.7) {
            if (w.startReplay(3.4)) {
              sq.stage = "replay";
              setOverlay("replay");
            } else {
              sq.stage = "victory";
              sq.t = 0;
            }
          } else if (!isKO && sq.t > (sq.method === "SUB" ? 2.4 : 1.2)) {
            sq.stage = "victory";
            sq.t = 0;
          }
        } else if (sq.stage === "victory") {
          if (sq.t < dt * 1.5) {
            w.victoryCam();
            setOverlay(null);
            if (m.result?.winner === 0 && fightRef.current?.title) audio.fanfare();
          }
          if (sq.t > 2.2) {
            sq.stage = "result";
            setOverlay("result");
            publishHud();
          }
        }
      }
      hudAcc.current += dt;
      if (hudAcc.current >= 0.1) {
        hudAcc.current = 0;
        publishHud();
        if (m.cfg.training) setLessonProg(lessonRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishHud, setOverlay, lessonCount]
  );
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (TEST) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      tickRef.current(dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------ fights */
  const beforeStep = useCallback((dt) => {
    const m = matchRef.current;
    if (!m) return;
    m.setButtons(0, controlsRef.current.buttons());
    aiRef.current?.update(dt);
  }, []);

  const startFight = useCallback(
    (cfg) => {
      const w = worldRef.current;
      if (!w) return;
      audio.unlock();
      controlsRef.current.clear();
      seqRef.current = null;
      hudLag.current = [100, 100];
      const training = cfg.mode === "training";
      const m = new Match({
        fighters: [{ data: cfg.a }, { data: cfg.b }],
        rounds: training ? 1 : cfg.rounds || 3,
        roundTime: training ? Infinity : cfg.roundTime || settings.roundTime,
        restTime: 90,
        training,
        title: cfg.boardTitle || (cfg.title ? `${cfg.title.toUpperCase()}` : "MAIN EVENT"),
        seed: (Math.random() * 1e9) | 0,
      });
      m.cfg.titleLabel = cfg.titleLabel || null;
      matchRef.current = m;
      fightRef.current = cfg;
      aiRef.current = createAI(m, 1, cfg.difficulty || settings.difficulty, cfg.dummy ? { dummy: DUMMIES[cfg.dummy] } : {});
      w.paused = false;
      w.setArena(cfg.arena || "underground");
      w.hideShowcase();
      w.attachMatch(m, { playerSide: 0, beforeStep, intro: !training && cfg.intro !== false });
      lessonRef.current = {};
      setLessonProg({});
      moveRef.current = { x: m.f[0].pos.x, z: m.f[0].pos.z };
      if (training) {
        m.begin();
        m.setPhase("fight");
        const L = LESSONS.find((l) => l.id === cfg.lesson);
        if (L?.startGround) enterGround(m, m.f[0], m.f[1], L.startGround, { x: 0, z: 0 }, -Math.PI / 2);
        setOverlay(null);
      } else if (cfg.intro === false) {
        m.begin(); // restarts / rematches skip the walkout
        setOverlay(null);
      } else {
        setIntroStep(0);
        setOverlay("intro");
      }
      setScreen("fight");
      publishHud();
      rootRef.current?.focus();
    },
    [beforeStep, publishHud, setOverlay, setScreen, settings.difficulty, settings.roundTime]
  );

  const endIntro = useCallback(() => {
    const w = worldRef.current;
    const m = matchRef.current;
    if (!w || !m || overlayRef.current !== "intro") return;
    w.endIntro();
    m.begin();
    setOverlay(null);
  }, [setOverlay]);

  const restartFight = useCallback(() => {
    if (!fightRef.current) return;
    startFight({ ...fightRef.current, intro: false });
  }, [startFight]);

  const leaveFight = useCallback(
    (to = "menu") => {
      const w = worldRef.current;
      matchRef.current = null;
      aiRef.current = null;
      seqRef.current = null;
      if (w) {
        w.paused = false;
        w.stopReplay();
        w.detachMatch();
      }
      setOverlay(null);
      setHud(null);
      setScreen(to);
    },
    [setOverlay, setScreen]
  );

  const togglePause = useCallback(() => {
    const w = worldRef.current;
    const m = matchRef.current;
    if (screenRef.current !== "fight" || !w || !m) return;
    if (overlayRef.current === "pause") {
      w.paused = false;
      setOverlay(m.phase === "rest" ? "rest" : null);
      controlsRef.current.clear();
    } else if (!overlayRef.current || overlayRef.current === "rest") {
      w.paused = true;
      setOverlay("pause");
    }
  }, [setOverlay]);
  useEffect(() => {
    controlsRef.current.onPause = togglePause;
  }, [togglePause]);

  /* ------------------------------------------------------------ keyboard */
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");
    const down = (e) => {
      audio.unlock();
      if (typing(e)) return;
      if (screenRef.current !== "fight") return;
      if (overlayRef.current === "intro" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
        e.preventDefault();
        endIntro();
        return;
      }
      if (overlayRef.current === "replay" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
        e.preventDefault();
        worldRef.current?.stopReplay();
        if (seqRef.current) seqRef.current = { ...seqRef.current, stage: "victory", t: 0 };
        return;
      }
      if (overlayRef.current && overlayRef.current !== "pause" && e.code !== "Escape") return;
      if (controlsRef.current.keydown(e)) e.preventDefault();
    };
    const up = (e) => controlsRef.current.keyup(e);
    const blur = () => controlsRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [endIntro]);

  /* ------------------------------------------------------------ GamePlayer restart */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "fight" && fightRef.current) restartFight();
    else if (screenRef.current !== "loading") {
      worldRef.current?.hideShowcase();
      setScreen("menu");
    }
  }, [restartSignal, restartFight, setScreen]);

  /* ------------------------------------------------------------ previews */
  const preview = useCallback((data) => {
    const w = worldRef.current;
    if (!w || !w.assets || matchRef.current) return;
    w.showcase(data);
  }, []);
  const toMenu = useCallback(() => {
    worldRef.current?.hideShowcase();
    worldRef.current?.setArena("underground");
    setScreen("menu");
  }, [setScreen]);

  /* ------------------------------------------------------------ modes */
  const career = save.career;
  const unlockedTier = Math.max(unlockedArenaTier(career), 0);

  const quickStart = useCallback(
    ({ me, opp, arena, difficulty, rounds }) => {
      setQuickInit({ me, opp, arena, rounds });
      commitSave((s) => ({ ...s, lastQuick: { me, opp, arena, difficulty, rounds } }));
      const A = FIGHTER_BY_ID[me];
      const B = FIGHTER_BY_ID[opp];
      startFight({ mode: "quick", a: A, b: B, arena, difficulty, rounds, announce: ANNOUNCER.pre(A.name, B.name, rounds === 5, "Main event", rounds) });
    },
    [startFight, commitSave]
  );

  const careerFight = useCallback(
    (offer) => {
      const c = save.career;
      const me = careerFighterData(c);
      const T = TIERS[offer.tier];
      const rival = offer.rival ? RIVAL_BY_ID[offer.rival] : null;
      startFight({
        mode: "career",
        a: me,
        b: offer.opp,
        offer,
        arena: offer.arena,
        rounds: offer.rounds,
        title: offer.title ? BELTS[offer.title].name : null,
        titleLabel: offer.title ? `${BELTS[offer.title].name.toUpperCase()} TITLE` : null,
        boardTitle: offer.title ? `${BELTS[offer.title].name.toUpperCase()} TITLE FIGHT` : T.name.toUpperCase(),
        announce: ANNOUNCER.pre(me.name, offer.opp.name, !!offer.title, T.name, offer.rounds),
        trash: rival ? pick(rival.trash) : null,
      });
    },
    [save.career, startFight]
  );

  const tournamentFight = useCallback(
    (pm) => {
      const t = save.tournament;
      const opp = pm.a === t.player ? pm.b : pm.a;
      const A = FIGHTER_BY_ID[t.player];
      const B = FIGHTER_BY_ID[opp];
      const titles = ["Tournament Quarterfinal", "Tournament Semifinal", "Tournament Final"];
      startFight({ mode: "tournament", a: A, b: B, arena: t.arena, difficulty: t.difficulty, rounds: 3, roundTime: t.roundTime, boardTitle: titles[t.round].toUpperCase(), titleLabel: t.round === 2 ? "TOURNAMENT FINAL" : null, announce: ANNOUNCER.pre(A.name, B.name, false, titles[t.round], 3) });
    },
    [save.tournament, startFight]
  );

  const trainingStart = useCallback(
    ({ me, lesson, dummy: d }) => {
      const L = LESSONS.find((l) => l.id === lesson);
      const dd = L ? L.dummy : d || "sparring";
      setDummyState(dd);
      startFight({ mode: "training", a: FIGHTER_BY_ID[me], b: FIGHTER_BY_ID[me === "castillo" ? "beridze" : "castillo"], arena: "underground", lesson, dummy: dd, difficulty: "normal" });
    },
    [startFight]
  );

  /* ------------------------------------------------------------ results */
  const finishResult = useCallback(() => {
    const m = matchRef.current;
    const cfg = fightRef.current;
    if (!m || !cfg) return leaveFight("menu");
    const r = m.result;
    if (cfg.mode === "quick") {
      commitSave((s) => ({ ...s, records: { ...s.records, qfWins: s.records.qfWins + (r.winner === 0 ? 1 : 0), qfLosses: s.records.qfLosses + (r.winner === 1 ? 1 : 0) } }));
      leaveFight("quick");
      return;
    }
    if (cfg.mode === "career") {
      const res = { won: r.winner === 0 ? true : r.winner < 0 ? null : false, method: r.method === "DRAW" ? "DEC" : r.method, round: r.round, dmgTaken: m.totals[1].dmg };
      const out = applyResult(save.career, cfg.offer, res);
      commitSave((s) => ({ ...s, career: out.career }));
      const rival = cfg.offer.rival ? RIVAL_BY_ID[cfg.offer.rival] : null;
      const key = res.won ? (r.method === "SUB" ? "winSUB" : r.method === "DEC" ? "winDEC" : "winKO") : res.won === null ? "draw" : "lose";
      setOutcome({ ...out, coach: pick(COACH_REACT[key]), rivalLine: rival ? (res.won ? rival.winLine : rival.loseLine) : null });
      leaveFight("career");
      return;
    }
    if (cfg.mode === "tournament") {
      const won = r.winner === 0 || (r.winner < 0 && m.totals[0].dmg >= m.totals[1].dmg);
      const t = reportPlayer(save.tournament, won, r.method === "DRAW" ? "DEC" : r.method, r.detail);
      commitSave((s) => ({ ...s, tournament: t, records: { ...s.records, tournaments: s.records.tournaments + (t.done && t.champion === t.player ? 1 : 0) } }));
      leaveFight("tournament");
      return;
    }
    leaveFight("menu");
  }, [commitSave, leaveFight, save.career, save.tournament]);

  /* ------------------------------------------------------------ lessons */
  const lessonDone = useMemo(() => {
    const cfg = fightRef.current;
    if (!cfg || cfg.mode !== "training" || !cfg.lesson) return false;
    const L = LESSONS.find((l) => l.id === cfg.lesson);
    return L.goals.every((g) => (lessonProg[g.k] || 0) >= g.n);
  }, [lessonProg]);
  useEffect(() => {
    const cfg = fightRef.current;
    if (lessonDone && cfg?.lesson && !save.records.trainingDone.includes(cfg.lesson)) {
      commitSave((s) => ({ ...s, records: { ...s.records, trainingDone: [...s.records.trainingDone, cfg.lesson] } }));
      pop("LESSON COMPLETE", "gold", 1600);
    }
  }, [lessonDone, commitSave, pop, save.records.trainingDone]);
  const nextLesson = useCallback(() => {
    const cfg = fightRef.current;
    const i = LESSONS.findIndex((l) => l.id === cfg?.lesson);
    const n = LESSONS[i + 1];
    if (n) trainingStart({ me: cfg.a.id, lesson: n.id });
    else leaveFight("training");
  }, [trainingStart, leaveFight]);
  const setDummy = useCallback((id) => {
    setDummyState(id);
    const m = matchRef.current;
    if (m) aiRef.current = createAI(m, 1, "normal", { dummy: DUMMIES[id] });
  }, []);

  /* ------------------------------------------------------------ career scenes */
  useEffect(() => {
    if (screen === "career" && career && !outcome && !scene) {
      const s = pendingScene(career);
      if (s) setScene(s);
    }
  }, [screen, career, outcome, scene]);

  /* ------------------------------------------------------------ DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    window.__umc = {
      world: () => worldRef.current,
      match: () => matchRef.current,
      ai: () => aiRef.current,
      controls: controlsRef.current,
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tickRef.current(dt);
      },
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      setScreen,
      startFight,
      quickStart,
      careerFight,
      tournamentFight,
      trainingStart,
      endIntro,
      finishResult,
      togglePause,
      save: () => saveState,
      commitSave,
      setSetting,
      leaveFight,
    };
  });

  /* ------------------------------------------------------------ render */
  const touchMode = settings.touch === "on" || (settings.touch === "auto" && isTouch());
  const m = matchRef.current;
  const cfg = fightRef.current;
  const names = m ? m.f.map((f) => f.name) : ["", ""];
  const statsRows = m
    ? [
        ["Significant strikes", m.totals[0].landedSig, m.totals[1].landedSig],
        ["Damage dealt", Math.round(m.totals[0].dmg), Math.round(m.totals[1].dmg)],
        ["Takedowns", `${m.totals[0].td}/${m.totals[0].tdAtt}`, `${m.totals[1].td}/${m.totals[1].tdAtt}`],
        ["Knockdowns", m.totals[0].kd, m.totals[1].kd],
        ["Control time", `${Math.round(m.totals[0].ctrl)}s`, `${Math.round(m.totals[1].ctrl)}s`],
        ["Submission attempts", m.totals[0].subAtt, m.totals[1].subAtt],
      ]
    : null;
  const advice = (() => {
    if (!m) return "";
    const me = m.f[0];
    const op = m.f[1];
    if (me.sta < staMax(me) * 0.35) return "You're gassing — breathe, pick your shots, don't chase.";
    if (op.hp.legs < 55) return "His lead leg is going. Keep chopping it with low kicks!";
    if (me.hp.body < 60) return "Keep your elbows tight — he's hunting the body. Drop to the body guard (SPACE+S).";
    if (m.totals[1].td > m.totals[0].td) return "He's shooting on you. Watch the level change and sprawl (SHIFT)!";
    if (op.hp.head < 60) return "He's hurt upstairs. Double up the jab and land the cross behind it.";
    return "Work behind the jab, move your head after you punch, and mix in a kick.";
  })();

  return (
    <div
      ref={rootRef}
      className={`umc umc--${screen}${touchMode ? " umc--touch" : ""}`}
      tabIndex={-1}
      onPointerDown={() => audio.unlock()}
    >
      <div ref={stageRef} className="umc-stage" />
      <div className="umc-vignette" />

      {screen === "loading" && (
        <div className="umc-loading">
          <div className="umc-brand__title">
            ULTIMATE <span>MMA</span> CHAMPIONSHIP <em>3D</em>
          </div>
          {boot.err ? (
            <>
              <p className="umc-err">{boot.err}</p>
              <button className="umc-btn umc-btn--primary" onClick={() => window.location.reload()}>
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="umc-loadbar">
                <i style={{ width: `${Math.round(boot.p * 100)}%` }} />
              </div>
              <p className="umc-dim">Loading fighters & arena… {Math.round(boot.p * 100)}%</p>
            </>
          )}
        </div>
      )}

      {screen === "menu" && (
        <MainMenu
          hasCareer={!!career}
          hasTournament={!!save.tournament && !save.tournament.done && !save.tournament.eliminated}
          careerLabel={career ? `${career.fighter.name} · ${TIERS[career.tier].name} · ${career.record.w}-${career.record.l}` : ""}
          onPick={(id) => {
            audio.unlock();
            audio.click();
            if (id === "career") setScreen(career ? "career" : "careerCreate");
            else if (id === "tournament") setScreen(save.tournament ? "bracket" : "tournamentSetup");
            else setScreen(id);
          }}
        />
      )}
      {screen === "quick" && <QuickFight settings={settings} unlockedTier={unlockedTier} onPreview={preview} onStart={quickStart} onBack={toMenu} initial={quickInit || save.lastQuick} />}
      {screen === "settings" && (
        <Settings
          settings={settings}
          setSetting={setSetting}
          onBack={toMenu}
          hasCareer={!!career}
          onResetCareer={() => {
            if (window.confirm?.("Delete your career save? This cannot be undone.") ?? true) commitSave((s) => ({ ...s, career: null }));
          }}
        />
      )}
      {screen === "controls" && <ControlsHelp onBack={toMenu} />}
      {screen === "careerCreate" && (
        <CareerCreate
          onPreview={preview}
          onBack={toMenu}
          onCreate={(f) => {
            commitSave((s) => ({ ...s, career: newCareer(f) }));
            setScreen("career");
          }}
        />
      )}
      {screen === "career" && career && (
        <CareerHub
          career={career}
          onPreview={preview}
          onBack={toMenu}
          onFight={careerFight}
          onTrain={(id) => commitSave((s) => ({ ...s, career: train(s.career, id) }))}
          onEquip={(id) => commitSave((s) => ({ ...s, career: equip(s.career, id) }))}
          outcome={outcome}
          clearOutcome={() => setOutcome(null)}
        />
      )}
      {screen === "career" && scene && !outcome && (
        <Dialogue
          scene={scene}
          career={career}
          onDone={() => {
            commitSave((s) => ({ ...s, career: markScene(s.career, scene) }));
            setScene(null);
          }}
        />
      )}
      {screen === "tournamentSetup" && (
        <TournamentSetup
          settings={settings}
          unlockedTier={unlockedTier}
          onPreview={preview}
          onBack={toMenu}
          onCreate={({ me, arena, difficulty }) => {
            const t = advance(newTournament(me, { difficulty, arena, roundTime: settings.roundTime }));
            commitSave((s) => ({ ...s, tournament: t }));
            setScreen("bracket");
          }}
        />
      )}
      {screen === "bracket" && save.tournament && (
        <Bracket
          t={save.tournament}
          onBack={toMenu}
          onFight={tournamentFight}
          onAbandon={() => {
            commitSave((s) => ({ ...s, tournament: null }));
            setScreen("tournamentSetup");
          }}
        />
      )}
      {screen === "training" && <TrainingMenu done={save.records.trainingDone} onPreview={preview} onBack={toMenu} onStart={trainingStart} />}

      {screen === "fight" && m && (
        <>
          {overlay !== "intro" && overlay !== "replay" && <FightHud hud={hud} hints={settings.hints} onPause={togglePause} touchMode={touchMode} />}
          <Popups items={popups} />
          {cfg?.mode === "training" && (
            <>
              <LessonPanel lesson={cfg.lesson} progress={lessonProg} dummy={dummy} setDummy={setDummy} onNext={nextLesson} />
              <button className="umc-btn umc-btn--ghost umc-btn--small umc-leave" onClick={() => leaveFight("training")}>
                Leave training
              </button>
            </>
          )}
          {touchMode && !overlay && <TouchPad controls={controlsRef.current} ctx={hud?.ctx} />}
          {overlay === "intro" && cfg && <IntroCard step={introStep} fight={{ ...cfg, fighters: [cfg.a, cfg.b], arenaName: ARENA_BY_ID[cfg.arena]?.name }} onSkip={endIntro} />}
          {overlay === "replay" && (
            <div className="umc-replay">
              <span>● REPLAY</span>
              <button
                className="umc-skip"
                onClick={() => {
                  worldRef.current?.stopReplay();
                  if (seqRef.current) seqRef.current = { ...seqRef.current, stage: "victory", t: 0 };
                }}
              >
                Skip ▸
              </button>
            </div>
          )}
          {overlay === "rest" && hud && (
            <RoundBreak
              hud={hud}
              cards={m.cards}
              advice={advice}
              onContinue={() => {
                m.nextRound();
                setOverlay(null);
                controlsRef.current.clear();
              }}
            />
          )}
          {overlay === "pause" && (
            <PauseMenu
              training={cfg?.mode === "training"}
              quality={settings.quality}
              setQuality={(q) => setSetting("quality", q)}
              onResume={togglePause}
              onRestart={restartFight}
              onControls={() => {
                leaveFight("controls");
              }}
              onQuit={() => leaveFight(cfg?.mode === "training" ? "training" : cfg?.mode === "career" ? "career" : cfg?.mode === "tournament" ? "bracket" : "menu")}
            />
          )}
          {overlay === "result" && m.result && (
            <ResultPanel
              result={m.result}
              names={names}
              cards={m.cards}
              stats={statsRows}
              extra={cfg?.mode === "career" && cfg.offer.title && m.result.winner === 0 ? <div className="umc-gold umc-result__belt">★ NEW {BELTS[cfg.offer.title].name.toUpperCase()} ★</div> : null}
              buttons={
                cfg?.mode === "quick"
                  ? [
                      { label: "Rematch", primary: true, onClick: restartFight },
                      { label: "New Fight", onClick: finishResult },
                      { label: "Main Menu", onClick: () => leaveFight("menu") },
                    ]
                  : [{ label: "Continue", primary: true, onClick: finishResult }]
              }
            />
          )}
        </>
      )}
      {toast && (
        <div className="umc-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
