/**
 * Street Basketball — arcade 1v1 street basketball for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes; every screen is internal state:
 *
 *   menu | career | vs | game | result | quick | training | drillResult
 *   | player | collection | stats | settings
 *
 * `restartSignal` (GamePlayer Restart) restarts ONLY the current match or
 * training session — by bumping the attempt key, which remounts the game
 * screen with a brand-new engine (so there is never a second ball, AI or
 * render loop). Career, cosmetics, stats and settings are never touched.
 * `muted` (GamePlayer Mute) silences everything immediately without changing
 * the saved Sound/Music settings. Fullscreen is GamePlayer's; the canvas just
 * resizes.
 *
 * Progress lives in localStorage under `street-basketball-progress`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./StreetBasketball.css";
import MainMenu from "./screens/MainMenu.jsx";
import Career, { VsIntro } from "./screens/Career.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import { MatchResult, DrillResult } from "./screens/Result.jsx";
import { QuickMatch, Training, Statistics, Settings } from "./screens/Screens.jsx";
import { PlayerScreen, Collection } from "./screens/PlayerScreen.jsx";
import { OPPONENTS, opponentById } from "./data/opponents.js";
import { courtById } from "./data/courts.js";
import { BALLS, byId } from "./data/cosmetics.js";
import {
  loadProgress, saveProgress, applyMatchResult, applyTraining, playerRatings, playerLook, opponentLook,
  upgradeSkill, isUnlocked,
} from "./utils/progress.js";
import { sound } from "./audio/sound.js";

const MENU_SCREENS = new Set(["career", "quick", "training", "player", "collection", "stats", "settings", "result", "drillResult", "vs"]);

/** Sparring partner for Defense Practice — a mid-level balanced attacker. */
const SPARRING = { ...OPPONENTS[6], id: "sparring", first: "Coach", nickname: "Sparring", last: "Partner", display: 'COACH "SPARRING" PARTNER', target: 99 };

let tokenSeq = 0;
const newToken = (kind) => `${kind}-${Date.now().toString(36)}-${(++tokenSeq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export default function StreetBasketball({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [session, setSession] = useState(null); // { kind, mode, opponentId, courtId, target, attempt, seed, token, quick }
  const [outcome, setOutcome] = useState(null);

  /* ------------------------------------------------------------- save */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progress), 120);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => saveProgress(progressRef.current), []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const inMenus = MENU_SCREENS.has(screen);
  useEffect(() => {
    if (inMenus) {
      sound.crowd(0);
      sound.setMusic(settings.music && !muted, "menu");
    }
  }, [inMenus, settings.music, muted]);
  useEffect(() => () => sound.dispose(), []);

  /* ----------------------------------------------------------- layout */
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches;
    } catch {
      coarse = false;
    }
    const measure = () => setTouch(coarse || el.getBoundingClientRect().width < 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----------------------------------------------------------- player */
  const look = useMemo(() => playerLook(progress), [progress]);
  const ratings = useMemo(() => playerRatings(progress), [progress]);
  const ballSkin = byId(BALLS, progress.selectedBall);

  /* -------------------------------------------------------- navigation */
  const go = useCallback((s) => {
    sound.ui();
    setScreen(s);
  }, []);

  const startCareer = useCallback((opponentId) => {
    setSession({ kind: "match", mode: "match", opponentId, courtId: opponentById(opponentId).court, target: opponentById(opponentId).target, attempt: 0, seed: (Date.now() % 1e6) + 1, token: newToken("m"), quick: false });
    setOutcome(null);
    sound.ui();
    setScreen("vs");
  }, []);

  const startQuick = useCallback((opponentId, courtId, target) => {
    setSession({ kind: "match", mode: "match", opponentId, courtId, target, attempt: 0, seed: (Date.now() % 1e6) + 1, token: newToken("q"), quick: true });
    setOutcome(null);
    sound.ui();
    setScreen("vs");
  }, []);

  const startDrill = useCallback((mode) => {
    setSession({ kind: "drill", mode, opponentId: mode === "defense" ? "sparring" : null, courtId: "neighborhood", target: 99, attempt: 0, seed: (Date.now() % 1e6) + 1, token: newToken("t") });
    setOutcome(null);
    sound.ui();
    setScreen("game");
  }, []);

  const restartSession = useCallback(() => {
    setSession((s) => (s ? { ...s, attempt: s.attempt + 1, seed: s.seed + 101, token: newToken(s.kind === "match" ? "m" : "t") } : s));
    setScreen("game");
  }, []);

  /* GamePlayer Restart → restart the current match / drill only. */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "game") restartSession();
  }, [restartSignal, screen, restartSession]);

  /* -------------------------------------------------------- results */
  const onFinish = useCallback((payload) => {
    const s = session;
    if (!s) return;
    if (payload.kind === "match") {
      const r = payload.result;
      const { progress: next, rewards } = applyMatchResult(progressRef.current, {
        token: s.token,
        opponentId: s.opponentId,
        mode: s.quick ? "quick" : "career",
        winner: r.winner,
        score: r.score,
        stats: r.stats.p,
        timeSec: r.time,
      });
      progressRef.current = next;
      setProgress(next);
      setOutcome({ kind: "match", result: r, rewards });
      setScreen("result");
    } else {
      const r = payload.result || {};
      const data = { token: s.token, timeSec: 0, score: r.score || 0 };
      if (s.mode === "free") {
        Object.assign(data, { makes: payload.free?.makes || 0, attempts: payload.free?.attempts || 0, perfect: payload.free?.perfect || 0, bestStreak: payload.free?.best || 0, score: payload.free?.makes || 0 });
      }
      if (s.mode === "dribble") data.score = r.time || 0;
      const before = progressRef.current.trainingRecords;
      const { progress: next, record, unlocks } = applyTraining(progressRef.current, s.mode, data);
      progressRef.current = next;
      setProgress(next);
      const best = s.mode === "dribble" ? (before.dribble.best ? before.dribble.best.toFixed(2) + "s" : null) : s.mode === "free" ? before.free.bestStreak : before[s.mode]?.best;
      setOutcome({ kind: "drill", mode: s.mode, result: s.mode === "free" ? { ...r, makes: payload.free?.makes || 0, score: payload.free?.makes || 0 } : r, record, unlocks, best });
      setScreen("drillResult");
    }
  }, [session]);

  /* -------------------------------------------------------- cosmetics */
  const onSelect = useCallback((kind, id) => {
    sound.ui();
    setProgress((p) => {
      if (!isUnlocked(p, kind, id)) return p;
      if (kind === "outfit") return { ...p, selectedOutfit: id };
      if (kind === "ball") return { ...p, selectedBall: id };
      if (kind === "headband") return { ...p, headband: id };
      if (kind === "wristband") return { ...p, wristband: id };
      return p;
    });
  }, []);

  const onChangeSettings = useCallback((patch) => {
    sound.ui();
    setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, []);

  /* -------------------------------------------------------------- view */
  const opp = session && session.opponentId ? (session.opponentId === "sparring" ? SPARRING : opponentById(session.opponentId)) : null;
  const court = session ? courtById(session.courtId) : null;
  const config = useMemo(() => {
    if (!session) return null;
    return {
      mode: session.mode,
      court,
      opponent: opp,
      target: session.target,
      seed: session.seed,
      playerRatings: ratings,
      playerLook: look,
      opponentLook: opp ? opponentLook(opp) : null,
      playerDunks: progress.unlockedDunks,
      ball: ballSkin,
      playerName: progress.player.name,
    };
    // the config is frozen per attempt: changing cosmetics mid-game is impossible anyway
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextOpponent = outcome?.kind === "match" && session && !session.quick
    ? OPPONENTS.find((o) => !progress.defeated.includes(o.id))
    : null;

  return (
    <div ref={rootRef} className={`sb${touch ? " sb--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      {screen === "menu" && (
        <MainMenu settings={settings} look={look} ballSkin={ballSkin} progress={progress} muted={muted} onNav={(id) => setScreen(id)} />
      )}
      {screen === "career" && <Career progress={progress} onPlay={startCareer} onBack={() => go("menu")} />}
      {screen === "vs" && session && opp && (
        <VsIntro playerLook={look} playerName={progress.player.name} opponent={{ ...opp, target: session.target }} court={court} reduced={settings.reducedMotion} onDone={() => setScreen("game")} />
      )}
      {screen === "game" && config && (
        <GameScreen
          key={`${session.token}:${session.attempt}`}
          config={config}
          settings={settings}
          muted={muted}
          touch={touch}
          showRules={!progress.seenRules}
          onRulesSeen={() => setProgress((p) => (p.seenRules ? p : { ...p, seenRules: true }))}
          onFinish={onFinish}
          onRestart={restartSession}
          onQuit={() => go(session.kind === "drill" ? "training" : session.quick ? "quick" : "career")}
        />
      )}
      {screen === "result" && outcome?.kind === "match" && opp && (
        <MatchResult
          result={outcome.result}
          rewards={outcome.rewards}
          opponent={opp}
          playerLook={look}
          playerName={progress.player.name}
          mode={session.quick ? "quick" : "career"}
          hasNext={!!nextOpponent && nextOpponent.id !== opp.id}
          onNext={() => nextOpponent && startCareer(nextOpponent.id)}
          onReplay={() => (session.quick ? startQuick(session.opponentId, session.courtId, session.target) : startCareer(session.opponentId))}
          onCareer={() => go(session.quick ? "quick" : "career")}
        />
      )}
      {screen === "drillResult" && outcome?.kind === "drill" && (
        <DrillResult mode={outcome.mode} result={outcome.result} record={outcome.record} unlocks={outcome.unlocks} best={outcome.best} onRetry={() => startDrill(outcome.mode)} onBack={() => go("training")} />
      )}
      {screen === "quick" && <QuickMatch progress={progress} onPlay={startQuick} onBack={() => go("menu")} />}
      {screen === "training" && <Training progress={progress} onStart={startDrill} onBack={() => go("menu")} />}
      {screen === "player" && (
        <PlayerScreen
          progress={progress}
          onChange={(player) => setProgress((p) => ({ ...p, player }))}
          onUpgrade={(k) => { sound.ui(); setProgress((p) => upgradeSkill(p, k)); }}
          onBack={() => go("menu")}
        />
      )}
      {screen === "collection" && <Collection progress={progress} onSelect={onSelect} onBack={() => go("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go("menu")} />}
    </div>
  );
}
