/**
 * Texas Hold'em Poker — No-Limit Hold'em vs AI opponents (Card).
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). The rules live in engine/ (pure, headless-tested by
 * tools/engineTest.mjs); this file is the controller:
 *
 *  - one useReducer holds { profile, session, toasts } (engine/session.js);
 *    every table change is a reducer action stamped with the table `seq`, so
 *    a stale timer or a double click is simply ignored;
 *  - a single scheduler effect decides the next automatic step (AI decision,
 *    street advance, showdown, auto-deal) and owns exactly one timeout,
 *    cleared on every state change, pause and unmount;
 *  - randomness (shuffles, AI rolls) is produced here and passed into the
 *    reducer, keeping the reducer pure;
 *  - profile + session are saved together to localStorage after each change.
 *
 * `restartSignal` (GamePlayer Restart) re-deals the current table/tournament,
 * `muted` silences the synth. DEV: `?thptest=1` exposes `window.__thp`.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./TexasHoldemPoker.css";
import { reducer, initialApp, loadSave, writeSave, HUMAN } from "./engine/session.js";
import { legalActions, viewFor, potTotal, applyAction } from "./engine/table.js";
import { decide, hint, PROFILES, PROFILE_IDS } from "./engine/ai.js";
import { shuffledDeck, shuffle, secureInt } from "./engine/cards.js";
import { finishTournament } from "./engine/simulate.js";
import { standings, handsToNextLevel, blindsAt, TIERS } from "./engine/tournament.js";
import { levelInfo } from "./engine/progress.js";
import { audio } from "./audio.js";
import TableView, { describeOwn } from "./ui/Table.jsx";
import ActionBar from "./ui/ActionBar.jsx";
import { fmt } from "./ui/pieces.jsx";
import {
  MainMenu, QuickSetup, PracticeSetup, TourneySetup, ProfileScreen, AchievementsScreen, ThemesScreen,
  HowToPlay, SettingsScreen, TournamentResult, Rankings,
} from "./ui/screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("thptest");
const NOSAVE = TEST && PARAMS.has("nosave");
const SPEED = { slow: 1.5, normal: 1, fast: 0.55 };
const store = () => { try { return window.localStorage; } catch { return null; } };
const MODE_LABEL = { quick: "Quick Play", tournament: "Tournament", practice: "Practice" };

function buildRoster(mode, cfg) {
  const n = (mode === "tournament" ? 6 : cfg.players) - 1;
  const ids = shuffle(PROFILE_IDS.slice()).slice(0, n);
  return ids.map((id, k) => {
    let diff = cfg.difficulty;
    if (mode === "tournament") {
      const mixes = { bronze: ["easy", "easy", "easy", "medium", "medium"], silver: ["medium", "medium", "medium", "medium", "hard"], gold: ["hard", "hard", "hard", "medium", "medium"], diamond: ["hard", "hard", "hard", "hard", "hard"] };
      diff = (mixes[cfg.tier] || mixes.bronze)[k];
    }
    return { name: PROFILES[id].name, profile: id, diff };
  });
}

function sayAction(a, name) {
  const amt = (x) => fmt(x || 0);
  switch (a.type) {
    case "sb": return `${name} posts the small blind ${amt(a.amount)}`;
    case "bb": return `${name} posts the big blind ${amt(a.amount)}`;
    case "fold": return `${name} folds`;
    case "check": return `${name} checks`;
    case "call": return `${name} calls ${amt(a.amount)}`;
    case "bet": return `${name} bets ${amt(a.to)}`;
    case "raise": return `${name} raises to ${amt(a.to)}`;
    case "allin": return `${name} is all-in (${amt(a.to)})`;
    case "return": return `${amt(a.amount)} uncalled returned to ${name}`;
    default: return null;
  }
}

export default function TexasHoldemPoker({ restartSignal = 0, muted = false }) {
  const [boot] = useState(() => {
    const st = store();
    return st && !NOSAVE ? loadSave(st) : { profile: null, session: null, note: null };
  });
  const [app, dispatch] = useReducer(reducer, boot, initialApp);
  const [screen, setScreen] = useState("menu");
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState(null); // pause | rankings
  const [note, setNote] = useState(boot.note);
  const appRef = useRef(app);
  appRef.current = app;
  const rigRef = useRef(null); // DEV: next deck override
  const lockRef = useRef(""); // `${sid}:${seq}` of the last human submission

  const { profile, session: s } = app;
  const tb = s ? s.table : null;
  const settings = profile.settings;
  const speed = SPEED[settings.speed] || 1;
  const playing = screen === "play" && !!s;

  const deck = useCallback(() => {
    if (rigRef.current) { const d = rigRef.current; rigRef.current = null; return d; }
    return shuffledDeck();
  }, []);

  /* ---------------------------------------------------------- save */
  useEffect(() => {
    const st = store();
    if (st && !NOSAVE) writeSave(st, app.profile, app.session);
  }, [app.profile, app.session]);

  /* ---------------------------------------------------------- audio */
  useEffect(() => { audio.setMuted(muted); }, [muted]);
  useEffect(() => { audio.setAmbient(settings.ambient); }, [settings.ambient]);
  useEffect(() => () => audio.dispose(), []);

  const prevRef = useRef(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = tb;
    if (!tb || !prev || !playing) return;
    if (tb.handNo !== prev.handNo) {
      audio.shuffle();
      const dealt = tb.players.filter((p) => p.inHand).length * 2;
      for (let k = 0; k < dealt; k++) audio.deal(0.55 + k * 0.08);
      audio.chips(2, 0.3);
      return;
    }
    if (tb.actions.length > prev.actions.length) {
      const a = tb.actions[tb.actions.length - 1];
      if (a.type === "fold") audio.fold();
      else if (a.type === "check") audio.check();
      else if (a.type === "call") audio.chips(3);
      else if (a.type === "bet" || a.type === "raise") audio.raise();
      else if (a.type === "allin") audio.allIn();
    }
    if (tb.board.length > prev.board.length) {
      for (let k = 0; k < tb.board.length - prev.board.length; k++) audio.flip(k * 0.14);
    }
    if (prev.phase === "street-end" && tb.phase !== "street-end" && prev.players.some((p) => p.bet > 0)) audio.collect();
    if (tb.phase === "showdown" && prev.phase !== "showdown") audio.flip();
    if (tb.phase === "complete" && prev.phase !== "complete") {
      if (s.over?.kind === "tournament" && s.over.place === 1) audio.victory();
      else if (tb.result.winners.includes(HUMAN)) audio.win();
      else if (tb.players[HUMAN].inHand && tb.result.net[HUMAN] < 0) audio.loss();
      else audio.collect();
    }
  }, [tb, playing, s]);

  useEffect(() => {
    if (app.toasts.length) audio.notify();
  }, [app.toasts.length]);

  /* ---------------------------------------------------------- the scheduler */
  /** Performs the next automatic step for the current state; returns false if none. */
  const runNext = useCallback(() => {
    const cur = appRef.current.session;
    if (!cur || cur.over) return false;
    const t = cur.table;
    if (t.phase === "betting") {
      const p = t.players[t.toAct];
      if (!p.ai) return false;
      const action = decide(viewFor(t, t.toAct), {
        profile: PROFILES[p.profile], difficulty: p.diff, rand: Math.random, memory: cur.memory, tournament: cur.mode === "tournament",
      });
      dispatch({ type: "act", seq: t.seq, seat: t.toAct, action });
      return true;
    }
    if (t.phase === "street-end" || t.phase === "showdown") {
      dispatch({ type: "advance", seq: t.seq });
      return true;
    }
    return false;
  }, []);

  const nextHand = useCallback(() => {
    const cur = appRef.current.session;
    if (!cur || cur.table.phase !== "complete") return;
    audio.unlock();
    dispatch({ type: "next", seq: cur.table.seq, deck: deck() });
  }, [deck]);

  useEffect(() => {
    if (!playing || paused || !tb || s.over) return;
    const k = (window.__thpSpeed ?? 1) * speed;
    let delay = null, fn = runNext;
    if (tb.phase === "betting" && tb.players[tb.toAct].ai) delay = 650 + Math.random() * 850;
    else if (tb.phase === "street-end") delay = tb.runout ? 1250 : tb.players.some((p) => p.bet > 0) ? 820 : 450;
    else if (tb.phase === "showdown") delay = 1500;
    else if (tb.phase === "complete" && settings.autoNext && !s.busted && tb.players[HUMAN].stack > 0) { delay = 3800; fn = nextHand; }
    if (delay == null) return;
    const id = setTimeout(fn, delay * k);
    return () => clearTimeout(id);
  }, [playing, paused, tb, s, speed, settings.autoNext, runNext, nextHand]);

  /* ---------------------------------------------------------- human timer */
  const humanTurn = playing && tb && tb.phase === "betting" && tb.toAct === HUMAN && !s.over;
  const timerSec = s?.mode === "practice" ? 0 : settings.timer;
  const timerRef = useRef({ key: "", left: 0, start: 0 });
  const turnKey = humanTurn ? `${s.sid}:${tb.handNo}:${tb.seq}:${timerSec}` : "";
  useEffect(() => {
    if (!humanTurn || !timerSec || paused) return;
    const tr = timerRef.current;
    if (tr.key !== turnKey) { tr.key = turnKey; tr.left = timerSec * 1000; }
    tr.start = performance.now();
    const seq = tb.seq;
    const id = setTimeout(() => dispatch({ type: "timeout", seq }), Math.max(0, tr.left));
    return () => { clearTimeout(id); tr.left -= performance.now() - tr.start; };
  }, [humanTurn, timerSec, paused, tb, turnKey]);

  /* ---------------------------------------------------------- tournament play-out after you bust */
  useEffect(() => {
    if (!s || !s.over?.pendingSim) return;
    const id = setTimeout(() => {
      const cur = appRef.current.session;
      if (!cur?.over?.pendingSim) return;
      const r = finishTournament(cur.table, cur.tour, { rand: Math.random, randInt: secureInt, memory: cur.memory, sims: 50 });
      dispatch({ type: "tourSimulated", table: r.table, tour: r.tour });
    }, 900);
    return () => clearTimeout(id);
  }, [s]);

  /* ---------------------------------------------------------- toasts */
  useEffect(() => {
    if (!app.toasts.length) return;
    // drop anything hidden behind the two newest at once, then the oldest visible one after a beat
    const t0 = app.toasts[0];
    const id = setTimeout(() => dispatch({ type: "toastDone", id: t0.id }), app.toasts.length > 2 ? 0 : 3200);
    return () => clearTimeout(id);
  }, [app.toasts]);

  /* ---------------------------------------------------------- session control */
  const begin = useCallback((mode, cfg) => {
    audio.unlock();
    if (appRef.current.session) dispatch({ type: "leave" });
    const fullCfg = mode === "tournament" ? { ...cfg, players: 6, difficulty: TIERS[cfg.tier]?.difficulty, tier: cfg.tier } : cfg;
    const n = mode === "tournament" ? 6 : cfg.players;
    dispatch({ type: "start", mode, cfg, roster: buildRoster(mode, fullCfg), deck: deck(), dealer: secureInt(n), sid: secureInt(1e9) });
    setPaused(false);
    setOverlay(null);
    setNote(null);
    setScreen("play");
  }, [deck]);

  // GamePlayer Restart: re-deal the current table / tournament
  const seenRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenRestart.current) return;
    seenRestart.current = restartSignal;
    const cur = appRef.current.session;
    if (!cur || screen !== "play") return;
    const cfg = cur.mode === "tournament" ? { ...cur.cfg, players: 6 } : cur.cfg;
    dispatch({ type: "restart", roster: buildRoster(cur.mode, cfg), deck: deck(), dealer: secureInt(cfg.players), sid: secureInt(1e9) });
    lockRef.current = "";
    setPaused(false);
    setOverlay(null);
  }, [restartSignal, screen, deck]);

  // a failed restart (e.g. bankroll too small) leaves no session → back to the menu
  useEffect(() => { if (screen === "play" && !s) setScreen("menu"); }, [screen, s]);

  const onAct = useCallback((action) => {
    audio.unlock();
    const cur = appRef.current.session;
    if (!cur || paused) return;
    const t = cur.table;
    const key = `${cur.sid}:${t.seq}`;
    if (t.phase !== "betting" || t.toAct !== HUMAN || lockRef.current === key) return;
    if (applyAction(t, HUMAN, action).error) return; // never lock the controls on a rejected action
    lockRef.current = key;
    dispatch({ type: "act", seq: t.seq, seat: HUMAN, action });
  }, [paused]);

  // keyboard shortcuts on the table: F fold, C check/call, R raise, A all-in, Space next hand
  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" && e.target.type !== "range")) return;
      if (e.key === "Escape") { setPaused((p) => !p); setOverlay((o) => (o === "pause" ? null : "pause")); return; }
      const cur = appRef.current.session;
      if (!cur) return;
      if (e.key === " " && cur.table.phase === "complete") { e.preventDefault(); nextHand(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, nextHand]);

  /* ---------------------------------------------------------- derived view data */
  const la = humanTurn ? legalActions(tb, HUMAN) : null;
  const practiceHint = useMemo(() => {
    if (!humanTurn || s.mode !== "practice") return null;
    return hint(viewFor(tb, HUMAN));
  }, [humanTurn, s, tb]);

  const log = useMemo(() => {
    if (!tb) return [];
    return tb.actions.map((a) => sayAction(a, a.seat === HUMAN ? "You" : tb.players[a.seat].name)).filter(Boolean).slice(-5);
  }, [tb]);

  const tourStandings = useMemo(() => (s?.mode === "tournament" && s.over && !s.over.pendingSim ? standings(s.tour, s.table) : []), [s]);

  if (TEST) {
    window.__thp = {
      app: () => appRef.current, dispatch, screen: setScreen, begin, runNext, nextHand, onAct,
      rig: (d) => { rigRef.current = d; }, pause: setPaused, la: () => (appRef.current.session ? legalActions(appRef.current.session.table, HUMAN) : null),
    };
  }

  /* ---------------------------------------------------------- render */
  const rootCls = [
    "thp",
    `thp-chipset--${profile.cosmetics.chips}`,
    settings.fourColor ? "thp--4c" : "",
    settings.reducedMotion ? "thp--calm" : "",
  ].join(" ");

  const sessionLabel = s ? `${MODE_LABEL[s.mode]}${s.mode === "tournament" ? ` · ${TIERS[s.tour.tier].name}` : ""} · hand ${tb.handNo}` : "";
  const warnSession = s && !s.over ? s.mode : null;
  const back = () => setScreen("menu");
  const refill = () => dispatch({ type: "refill" });

  let body;
  if (screen === "play" && s) {
    const tour = s.tour;
    const human = tb.players[HUMAN];
    const res = tb.phase === "complete" ? tb.result : null;
    const alive = tb.players.filter((p) => !p.out).length;
    body = (
      <div className="thp-frame">
        <TableView table={tb} cosmetics={profile.cosmetics} settings={settings} timerSeconds={timerSec} timerKey={turnKey} paused={paused} humanName="You" />

        {/* HUD */}
        <div className="thp-hud">
          <span className="thp-hud__mode">{MODE_LABEL[s.mode]}</span>
          <span>Blinds <b>{fmt(tb.blinds.sb)}/{fmt(tb.blinds.bb)}</b></span>
          {tour && <span>Level <b>{tour.level + 1}</b> · next <b>{handsToNextLevel(tour)}</b> {handsToNextLevel(tour) === 1 ? "hand" : "hands"} ({fmt(blindsAt(tour.level + 1).sb)}/{fmt(blindsAt(tour.level + 1).bb)})</span>}
          {tour && <span><b>{alive}</b> left</span>}
          <span>Hand <b>#{tb.handNo}</b></span>
        </div>
        <div className="thp-hud thp-hud--right">
          <button type="button" className="thp-icon-btn" onClick={() => setOverlay(overlay === "rankings" ? null : "rankings")} aria-label="Hand rankings" title="Hand rankings">♠</button>
          <button type="button" className="thp-icon-btn" onClick={() => { setPaused(true); setOverlay("pause"); }} aria-label="Pause" title="Pause (Esc)">❚❚</button>
        </div>

        {/* bottom-left info */}
        <div className="thp-info">
          {human.inHand && !human.folded && describeOwn(tb) && (settings.hints || s.mode === "practice") && (
            <div className="thp-strength">
              <span>Your hand</span>
              <b>{describeOwn(tb)}</b>
              {practiceHint && (
                <span className="thp-meter" title="Estimated chance to win vs random hands">
                  <i style={{ width: `${Math.round(practiceHint.equity * 100)}%` }} />
                  <em>{Math.round(practiceHint.equity * 100)}% to win</em>
                </span>
              )}
            </div>
          )}
          {practiceHint && (
            <div className="thp-coach">
              <b>Coach</b> {practiceHint.advice}
              <ul>
                {la && <li><b>Fold</b> gives up this pot.</li>}
                {la?.canCheck && <li><b>Check</b> costs nothing — see the next card.</li>}
                {la?.canCall && <li><b>Call {fmt(la.toCall)}</b> to stay in{practiceHint.potOdds ? ` (pot odds: need ${Math.round(practiceHint.potOdds * 100)}%)` : ""}.</li>}
                {(la?.canBet || la?.canRaise) && <li><b>{la.canBet ? "Bet" : "Raise"}</b> from {fmt(la.minTo)} up to {fmt(la.maxTo)} to build the pot or bluff.</li>}
              </ul>
            </div>
          )}
          {!practiceHint && (
            <ol className="thp-log" aria-label="Recent actions">
              {log.map((l, k) => <li key={`${tb.handNo}-${tb.actions.length}-${k}`}>{l}</li>)}
            </ol>
          )}
        </div>

        {/* bottom-right: actions / result */}
        <div className="thp-dock">
          {la && <ActionBar la={la} onAct={onAct} disabled={paused || lockRef.current === `${s.sid}:${tb.seq}`} pot={potTotal(tb)} bb={tb.blinds.bb} />}
          {!la && tb.phase !== "complete" && (
            <div className="thp-wait">
              {human.folded ? "You folded — watching the hand" : !human.inHand ? (human.out ? "You're out of the tournament" : "Sitting out") : tb.runout ? "All-in — running the board" : tb.phase === "showdown" ? "Showdown!" : `${tb.players[tb.toAct]?.name ?? "Dealer"} ${tb.phase === "betting" ? "is thinking…" : "…"}`}
            </div>
          )}
          {res && !s.over && (
            <div className="thp-result">
              <ul>
                {res.pots.map((p, k) => (
                  <li key={k}>
                    <span>{res.pots.length > 1 ? (k === 0 ? "Main pot" : `Side pot ${k}`) : "Pot"} <b>{fmt(p.amount)}</b></span>
                    <span>
                      {p.winners.map((w) => (w === HUMAN ? "You" : tb.players[w].name)).join(" & ")}
                      {p.winners.length > 1 ? " split" : " win" + (p.winners[0] === HUMAN ? "" : "s")}
                      {res.showdown && p.winners[0] != null && res.hands[p.winners[0]] ? ` — ${res.hands[p.winners[0]].desc}` : res.showdown ? "" : " (uncontested)"}
                    </span>
                  </li>
                ))}
              </ul>
              {human.inHand && (
                <p className={`thp-result__me ${res.net[HUMAN] > 0 ? "is-up" : res.net[HUMAN] < 0 ? "is-down" : ""}`}>
                  {res.net[HUMAN] > 0 ? `You won ${fmt(res.net[HUMAN])}` : res.net[HUMAN] < 0 ? `You lost ${fmt(-res.net[HUMAN])}` : "You broke even"}
                  {s.lastXp && s.mode !== "practice" ? <small> · +{s.lastXp} XP</small> : null}
                </p>
              )}
              {s.busted ? (
                <div className="thp-row">
                  <span className="thp-sub">You're out of chips.</span>
                  <button type="button" className="thp-btn thp-btn--sm thp-btn--gold" disabled={profile.bankroll < s.cfg.stack} onClick={() => dispatch({ type: "rebuy" })}>Rebuy {fmt(s.cfg.stack)}</button>
                  <button type="button" className="thp-btn thp-btn--sm" onClick={() => { dispatch({ type: "leave" }); setScreen("menu"); }}>Leave</button>
                </div>
              ) : (
                <button type="button" className="thp-btn thp-btn--gold thp-next" onClick={nextHand}>
                  Next Hand {settings.autoNext && <small>auto</small>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* toasts */}
        <div className="thp-toasts" aria-live="polite">
          {app.toasts.slice(-2).map((t) => (
            <div key={t.id} className={`thp-toast thp-toast--${t.kind}`}>
              <b>{t.kind === "achievement" ? `★ ${t.title}` : t.title}</b>
              <small>{t.text}</small>
            </div>
          ))}
        </div>

        {overlay === "rankings" && (
          <div className="thp-pop" onClick={() => setOverlay(null)}>
            <div className="thp-pop__card" onClick={(e) => e.stopPropagation()}>
              <h3>Hand Rankings</h3>
              <Rankings compact />
              <button type="button" className="thp-btn thp-btn--sm" onClick={() => setOverlay(null)}>Close</button>
            </div>
          </div>
        )}

        {overlay === "pause" && (
          <div className="thp-pop">
            <div className="thp-pop__card thp-pause">
              <h3>Paused</h3>
              <p className="thp-sub">The table and your turn timer are on hold.</p>
              <button type="button" className="thp-btn thp-btn--gold" onClick={() => { setPaused(false); setOverlay(null); }}>Resume</button>
              <button type="button" className="thp-btn" onClick={() => setOverlay("rankings")}>Hand Rankings</button>
              <button type="button" className="thp-btn" onClick={() => { setPaused(false); setOverlay(null); setScreen("menu"); }}>Main Menu <small>table is saved</small></button>
              <button type="button" className="thp-btn thp-btn--danger" onClick={() => { dispatch({ type: "leave" }); setPaused(false); setOverlay(null); setScreen("menu"); }}>
                Leave Table <small>{s.mode === "quick" ? `cash out ${fmt(human.stack)}` : s.mode === "tournament" ? "forfeit the tournament" : "end practice"}</small>
              </button>
            </div>
          </div>
        )}

        {s.over?.kind === "tournament" && (
          <TournamentResult
            session={s}
            standings={tourStandings}
            profile={profile}
            onAgain={() => { const tier = s.tour.tier; const hpl = s.tour.handsPerLevel; dispatch({ type: "leave" }); setScreen("tourney"); if (profile.bankroll >= TIERS[tier].buyIn) begin("tournament", { tier, handsPerLevel: hpl }); }}
            onMenu={() => { dispatch({ type: "leave" }); setScreen("menu"); }}
          />
        )}
      </div>
    );
  } else {
    const common = { profile, onBack: back };
    switch (screen) {
      case "quick": body = <QuickSetup {...common} warnSession={warnSession} onRefill={refill} onStart={(cfg) => begin("quick", cfg)} />; break;
      case "practice": body = <PracticeSetup {...common} warnSession={warnSession} onStart={(cfg) => begin("practice", cfg)} />; break;
      case "tourney": body = <TourneySetup {...common} warnSession={warnSession} onRefill={refill} onStart={(cfg) => begin("tournament", cfg)} />; break;
      case "profile": body = <ProfileScreen {...common} onRefill={refill} hasQuick={s?.mode === "quick"} />; break;
      case "achievements": body = <AchievementsScreen {...common} />; break;
      case "themes": body = <ThemesScreen {...common} onPick={(slot, id) => dispatch({ type: "cosmetic", slot, id })} />; break;
      case "how": body = <HowToPlay onBack={back} />; break;
      case "settings": body = <SettingsScreen {...common} onSet={(key, value) => dispatch({ type: "setting", key, value })} onReset={() => dispatch({ type: "resetProgress" })} />; break;
      default:
        body = (
          <MainMenu
            profile={profile}
            hasSession={!!s && !s.over}
            sessionLabel={sessionLabel}
            note={note}
            onContinue={() => { audio.unlock(); setPaused(false); setScreen("play"); }}
            onNav={(sc) => { audio.unlock(); setScreen(sc); }}
          />
        );
    }
  }

  return (
    <div className={rootCls} data-theme={profile.cosmetics.theme} data-lvl={levelInfo(profile.xp).level}>
      <div className="thp-room" aria-hidden="true" />
      {body}
    </div>
  );
}
