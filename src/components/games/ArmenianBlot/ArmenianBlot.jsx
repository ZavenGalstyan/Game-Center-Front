/**
 * Armenian Blot Heritage — offline four-player Armenian Blot (Card).
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). The rules live in engine/ (pure functions, headless-tested
 * by tools/engineTest.mjs); this file is the controller:
 *
 *  - one useReducer holds { settings, stats, match }; every match change is
 *    a reducer action stamped with the match `seq`, so a stale timer or a
 *    double click is ignored;
 *  - a single scheduler effect performs the next automatic step (AI bid or
 *    card, trick collection, redeal) and owns exactly one timeout, cleared
 *    on every state change, pause and unmount;
 *  - randomness (decks, AI rolls) is produced here and passed in, keeping
 *    the reducer pure; animations are derived from state, never saved;
 *  - settings + stats + match are written to localStorage after each change.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current match, `muted`
 * silences the synth. DEV: `?abtest=1` exposes `window.__ab`.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./ArmenianBlot.css";
import { shuffledDeck, secureInt } from "./engine/deck.js";
import { makeRules } from "./engine/rules.js";
import { newMatch, bid, play, collect, redeal, nextHand, viewFor, legalFor } from "./engine/match.js";
import { isLegalBid } from "./engine/bidding.js";
import { decide, hintFor } from "./engine/ai.js";
import { loadSave, writeSave, sanitizeSettings, recordHand, recordMatch, defaultStats } from "./engine/save.js";
import { audio } from "./audio.js";
import { t as translate } from "./i18n.js";
import { ArtDefs } from "./ui/art.jsx";
import Table from "./ui/Table.jsx";
import { Scoreboard, ContractPanel, BidPanel, Banners, Coach, HandResult } from "./ui/panels.jsx";
import { MainMenu, ModeSelect, HowToPlay, RulesScreen, StatsScreen, SettingsScreen, MatchResult, PauseMenu } from "./ui/screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("abtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const SPEED = { slow: 1.45, normal: 1, fast: 0.6 };
const store = () => { try { return window.localStorage; } catch { return null; } };
const BANNER_TYPES = new Set(["declare", "declResult", "belote", "rebelote", "contract"]);

/* ------------------------------------------------------------ reducer */

function withMatch(app, r) {
  if (!r || r.error || !r.match) return app;
  let stats = app.stats;
  const m = r.match;
  if (m.hand.phase === "scored" && app.match && app.match.hand.phase !== "scored") {
    stats = recordHand(stats, m);
    if (m.over) stats = recordMatch(stats, m);
  }
  return { ...app, match: m, stats };
}

function reducer(app, a) {
  const m = app.match;
  const stale = () => !m || a.seq !== m.seq || a.id !== m.id;
  switch (a.type) {
    case "settings": return { ...app, settings: sanitizeSettings({ ...app.settings, [a.key]: a.value }) };
    case "newMatch": return { ...app, match: a.match };
    case "leave": return { ...app, match: null };
    case "resetStats": return { ...app, stats: defaultStats() };
    case "bid": return stale() ? app : withMatch(app, bid(m, a.seat, a.action));
    case "play": return stale() ? app : withMatch(app, play(m, a.seat, a.card));
    case "collect": return stale() ? app : withMatch(app, collect(m));
    case "redeal": return stale() ? app : withMatch(app, redeal(m, a.deck));
    case "next": return stale() ? app : withMatch(app, nextHand(m, a.deck));
    default: return app;
  }
}

/* ------------------------------------------------------------ component */

export default function ArmenianBlot({ restartSignal = 0, muted = false }) {
  const [boot] = useState(() => (NOSAVE ? loadSave(null) : loadSave(store())));
  const [app, dispatch] = useReducer(reducer, boot, (b) => ({ settings: b.settings, stats: b.stats, match: b.match }));
  const [screen, setScreen] = useState("menu");
  const [overlay, setOverlay] = useState(null); // pause | rules
  const [rulesFrom, setRulesFrom] = useState("menu");
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dealing, setDealing] = useState(false);
  const [banners, setBanners] = useState([]);
  const [showFinal, setShowFinal] = useState(false);
  const [note, setNote] = useState(boot.note === "damaged" ? "saveDamaged" : null);
  const appRef = useRef(app);
  appRef.current = app;
  const lockRef = useRef(""); // `${id}:${seq}` of the last human action
  const rigRef = useRef(null); // DEV: next deck override

  const { settings, stats, match: m } = app;
  const t = useCallback((k, v) => translate(settings.lang, k, v), [settings.lang]);
  const speedK = (SPEED[settings.speed] || 1) * (TEST && window.__abSpeed ? window.__abSpeed : 1);
  const playing = screen === "play" && !!m;
  const h = m ? m.hand : null;

  const deck = useCallback(() => {
    if (rigRef.current) { const d = rigRef.current; rigRef.current = null; return d; }
    return shuffledDeck();
  }, []);

  /* ---------------------------------------------------------- save */
  useEffect(() => {
    if (NOSAVE) return;
    writeSave(store(), app);
  }, [app]);

  /* ---------------------------------------------------------- audio */
  useEffect(() => { audio.setMuted(muted); }, [muted]);
  useEffect(() => { audio.setVolume(settings.volume); }, [settings.volume]);
  useEffect(() => { audio.setAmbience(settings.ambience); }, [settings.ambience]);
  useEffect(() => () => audio.dispose(), []);

  /* ---------------------------------------------------------- dealing animation (derived, never saved) */
  const dealKey = m ? `${m.id}:${m.handNo}:${m.redeals}` : "";
  const dealSeen = useRef("");
  const dealTimer = useRef(null);
  useEffect(() => {
    if (!playing || dealSeen.current === dealKey) return;
    dealSeen.current = dealKey;
    const fresh = h.phase === "bidding" && h.auction.history.length === 0;
    if (!fresh) return;
    setDealing(true);
    audio.shuffle();
    const ms = (650 + 32 * 38 + 450) * speedK;
    for (let k = 0; k < 8; k++) audio.deal((0.65 + k * 0.16) * speedK);
    clearTimeout(dealTimer.current);
    dealTimer.current = setTimeout(() => setDealing(false), ms);
  }, [playing, dealKey, h, speedK]);
  useEffect(() => () => clearTimeout(dealTimer.current), []);
  // a cancelled deal timer (pause, unmount) must not leave the table stuck "dealing"
  useEffect(() => { if (!playing && dealing) setDealing(false); }, [playing, dealing]);

  /* ---------------------------------------------------------- events → sounds + banners */
  const evSeen = useRef({ key: "", n: 0 });
  useEffect(() => {
    if (!m) return;
    const key = `${m.id}:${m.handNo}:${m.redeals}`;
    const es = evSeen.current;
    if (es.key !== key) { es.key = key; es.n = 0; }
    if (!playing) { es.n = h.evn; return; }
    const fresh = h.events.filter((e) => e.n > es.n);
    es.n = h.evn;
    const add = [];
    for (const e of fresh) {
      switch (e.type) {
        case "bid": e.action.type === "pass" ? audio.pass() : e.action.type === "contra" || e.action.type === "recontra" ? audio.contra() : audio.bid(); break;
        case "contract": audio.contract(); break;
        case "play": audio.place(); break;
        case "trick": audio.collect(); break;
        case "declare": audio.declare(); break;
        case "declResult": if (e.team != null) audio.declare(); break;
        case "belote": case "rebelote": audio.belote(); break;
        case "scored": {
          if (m.over) { if (m.over.winner === 0) audio.victory(); else audio.lose(); }
          else if (h.result && h.result.score[0] > h.result.score[1]) audio.win();
          else audio.lose();
          break;
        }
        default:
      }
      if (BANNER_TYPES.has(e.type)) add.push({ id: `${key}:${e.n}`, e });
    }
    if (add.length) setBanners((b) => b.concat(add).slice(-2));
  }, [m, h, playing]);

  useEffect(() => {
    if (h && h.phase === "redeal" && playing) setBanners((b) => b.concat([{ id: `redeal:${dealKey}`, redeal: true }]).slice(-3));
  }, [h, playing, dealKey]);

  useEffect(() => {
    if (!banners.length) return;
    const id = setTimeout(() => setBanners((b) => b.slice(1)), 2300 * Math.max(0.6, speedK));
    return () => clearTimeout(id);
  }, [banners, speedK]);

  /* ---------------------------------------------------------- the scheduler */
  /** Performs the next automatic step for the current state; returns false if none. */
  const runNext = useCallback(() => {
    const cur = appRef.current.match;
    if (!cur || cur.over) return false;
    const hh = cur.hand;
    if ((hh.phase === "bidding" || hh.phase === "play") && hh.turn !== 0) {
      const d = decide(viewFor(cur, hh.turn), Math.random);
      if (!d) return false;
      if (d.kind === "bid") dispatch({ type: "bid", id: cur.id, seq: cur.seq, seat: hh.turn, action: d.action });
      else dispatch({ type: "play", id: cur.id, seq: cur.seq, seat: hh.turn, card: d.card });
      return true;
    }
    if (hh.phase === "trickEnd") { dispatch({ type: "collect", id: cur.id, seq: cur.seq }); return true; }
    if (hh.phase === "redeal") { dispatch({ type: "redeal", id: cur.id, seq: cur.seq, deck: deck() }); return true; }
    return false;
  }, [deck]);

  useEffect(() => {
    if (!playing || paused || dealing || !h || m.over) return;
    let delay = null;
    if ((h.phase === "bidding" || h.phase === "play") && h.turn !== 0) delay = h.phase === "bidding" ? 650 + Math.random() * 600 : 480 + Math.random() * 420;
    else if (h.phase === "trickEnd") delay = 820 + 420 + 60;
    else if (h.phase === "redeal") delay = 1500;
    if (delay == null) return;
    const id = setTimeout(runNext, delay * speedK);
    return () => clearTimeout(id);
  }, [playing, paused, dealing, h, m, speedK, runNext]);

  /* ---------------------------------------------------------- match control */
  const begin = useCallback((mode) => {
    audio.unlock();
    const st = appRef.current.settings;
    const rules = makeRules(st.preset, st.variants);
    const target = mode === "classic" ? rules.targets[st.target] : rules.targets.quick;
    const match = newMatch({ rules, mode, difficulty: st.difficulty, target, deck: deck(), dealer: secureInt(4), id: secureInt(1e9) });
    dispatch({ type: "newMatch", match });
    setSelected(null);
    setPaused(false);
    setOverlay(null);
    setShowFinal(false);
    setBanners([]);
    setNote(null);
    setScreen("play");
  }, [deck]);

  const restartCurrent = useCallback(() => {
    const cur = appRef.current.match;
    if (!cur) return;
    audio.unlock();
    const match = newMatch({ rules: cur.rules, mode: cur.mode, difficulty: cur.difficulty, target: cur.target, deck: deck(), dealer: secureInt(4), id: secureInt(1e9) });
    dispatch({ type: "newMatch", match });
    setSelected(null);
    setPaused(false);
    setOverlay(null);
    setShowFinal(false);
    setBanners([]);
    setScreen("play");
  }, [deck]);

  // GamePlayer Restart → restart the current match
  const seenRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenRestart.current) return;
    seenRestart.current = restartSignal;
    if (screen === "play" && appRef.current.match) restartCurrent();
  }, [restartSignal, screen, restartCurrent]);

  const toNextHand = useCallback(() => {
    const cur = appRef.current.match;
    if (!cur || cur.hand.phase !== "scored" || cur.over) return;
    audio.unlock();
    dispatch({ type: "next", id: cur.id, seq: cur.seq, deck: deck() });
  }, [deck]);

  /* ---------------------------------------------------------- human input */
  const humanBidTurn = playing && h.phase === "bidding" && h.turn === 0 && !m.over;
  const humanPlayTurn = playing && h.phase === "play" && h.turn === 0 && !m.over;
  const legalInfo = useMemo(() => (humanPlayTurn ? legalFor(m, 0) : null), [humanPlayTurn, m]);
  const legalSet = useMemo(() => (legalInfo ? new Set(legalInfo.cards) : null), [legalInfo]);

  useEffect(() => { setSelected(null); }, [m?.seq]);

  const onBid = useCallback((action) => {
    audio.unlock();
    const cur = appRef.current.match;
    if (!cur || paused || dealing) return;
    const hh = cur.hand;
    const key = `${cur.id}:${cur.seq}`;
    if (hh.phase !== "bidding" || hh.turn !== 0 || lockRef.current === key) return;
    if (!isLegalBid(hh.auction, 0, action, cur.rules)) return;
    lockRef.current = key;
    dispatch({ type: "bid", id: cur.id, seq: cur.seq, seat: 0, action });
  }, [paused, dealing]);

  const playCard = useCallback((card) => {
    const cur = appRef.current.match;
    if (!cur || paused) return;
    const hh = cur.hand;
    const key = `${cur.id}:${cur.seq}`;
    if (hh.phase !== "play" || hh.turn !== 0 || lockRef.current === key) return;
    if (!legalFor(cur, 0).cards.includes(card)) return;
    lockRef.current = key;
    dispatch({ type: "play", id: cur.id, seq: cur.seq, seat: 0, card });
  }, [paused]);

  const onCard = useCallback((card) => {
    audio.unlock();
    if (selected === card) { playCard(card); return; }
    audio.select();
    setSelected(card);
  }, [selected, playCard]);

  // keyboard: Esc pause · Enter plays the selected card · Space next hand
  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOverlay((o) => (o ? null : "pause"));
        setPaused((p) => !p);
        return;
      }
      if (e.target && e.target.tagName === "INPUT") return;
      const cur = appRef.current.match;
      if (!cur) return;
      if (e.key === "Enter" && selected != null && cur.hand.phase === "play") { e.preventDefault(); playCard(selected); }
      if (e.key === " " && cur.hand.phase === "scored" && !cur.over) { e.preventDefault(); toNextHand(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, selected, playCard, toNextHand]);

  /* ---------------------------------------------------------- practice hints */
  const practice = m?.mode === "practice";
  const hint = useMemo(() => {
    if (!practice || !(humanBidTurn || humanPlayTurn)) return null;
    return hintFor(viewFor(m, 0));
  }, [practice, humanBidTurn, humanPlayTurn, m]);

  // DEV hooks are (re)attached after commit, so they never point at a discarded render
  useEffect(() => {
    if (!TEST) return;
    window.__ab = {
      app: () => appRef.current, dispatch, screen: setScreen, begin, runNext, toNextHand, onBid, playCard, restart: restartCurrent,
      rig: (d) => { rigRef.current = d; }, pause: setPaused, dealing: () => dealing, setDealing, overlay: setOverlay,
    };
  });

  /* ---------------------------------------------------------- render */
  const settingsSet = (key, value) => dispatch({ type: "settings", key, value });
  const back = () => setScreen("menu");
  let body;

  if (screen === "play" && m) {
    const thinkingSeat = (h.phase === "bidding" || h.phase === "play") && h.turn !== 0 && !dealing && !paused ? h.turn : null;
    body = (
      <div className="ab-frame">
        <Table
          m={m}
          t={t}
          back={settings.back}
          legal={legalSet}
          selected={selected}
          onCard={onCard}
          hintCard={hint && hint.kind === "play" ? hint.card : null}
          thinkingSeat={thinkingSeat}
          dealing={dealing}
          dealKey={dealKey}
          speedK={speedK}
          canAct={humanPlayTurn && !paused}
        />
        <Scoreboard m={m} t={t} />
        <ContractPanel m={m} t={t} practice={practice} onPause={() => { setPaused(true); setOverlay("pause"); }} onRules={() => { setPaused(true); setOverlay("rules"); }} />
        {humanBidTurn && !dealing && (
          <BidPanel m={m} t={t} onBid={onBid} disabled={paused} suggestion={hint && hint.kind === "bid" ? hint.action : null} />
        )}
        {humanPlayTurn && (
          <div className="ab-turnpill" role="status">
            <b>{t("yourTurn")}</b>
            <span>{selected != null ? (
              <button type="button" className="ab-btn ab-btn--gold ab-btn--sm" onClick={() => playCard(selected)}>{t("playCard")}</button>
            ) : t("selectHint")}</span>
          </div>
        )}
        {dealing && <div className="ab-dealnote">{t("dealing")}</div>}
        <Coach m={m} t={t} practice={practice} showWhy={settings.hints} reason={legalInfo ? legalInfo.reason : null} suggestion={hint && hint.kind === "play" ? hint.card : null} />
        <Banners items={banners} t={t} />
        {h.phase === "scored" && (!m.over || !showFinal) && (
          <HandResult m={m} t={t} onNext={toNextHand} />
        )}
        {m.over && !showFinal && h.phase === "scored" && (
          <button type="button" className="ab-btn ab-btn--gold ab-finalbtn" onClick={() => setShowFinal(true)}>{m.over.winner === 0 ? t("victory") : t("defeat")} →</button>
        )}
        {m.over && showFinal && (
          <MatchResult t={t} m={m} onAgain={restartCurrent} onMenu={() => { dispatch({ type: "leave" }); setShowFinal(false); setScreen("menu"); }} />
        )}
        {overlay === "pause" && (
          <PauseMenu
            t={t}
            onResume={() => { setPaused(false); setOverlay(null); }}
            onRules={() => setOverlay("rules")}
            onRestart={restartCurrent}
            onMenu={() => { setPaused(false); setOverlay(null); setScreen("menu"); }}
            onLeave={() => { dispatch({ type: "leave" }); setPaused(false); setOverlay(null); setScreen("menu"); }}
          />
        )}
        {overlay === "rules" && (
          <div className="ab-overlay ab-overlay--screen">
            <RulesScreen t={t} rules={m.rules} onBack={() => { setOverlay(null); setPaused(false); }} />
          </div>
        )}
      </div>
    );
  } else {
    switch (screen) {
      case "modes":
        body = <ModeSelect t={t} settings={settings} rules={makeRules(settings.preset, settings.variants)} inProgress={!!m && !m.over} onSet={settingsSet} onBack={back} onStart={begin} />;
        break;
      case "how": body = <HowToPlay t={t} onBack={back} />; break;
      case "rules": body = <RulesScreen t={t} rules={rulesFrom === "match" && m ? m.rules : makeRules(settings.preset, settings.variants)} onBack={back} />; break;
      case "stats": body = <StatsScreen t={t} stats={stats} onBack={back} onReset={() => dispatch({ type: "resetStats" })} />; break;
      case "settings": body = <SettingsScreen t={t} settings={settings} onSet={settingsSet} onBack={back} inMatch={!!m && !m.over} />; break;
      default: {
        const hasSave = !!m && !m.over;
        const info = hasSave ? `${t(m.mode === "classic" ? "modeClassic" : m.mode === "quick" ? "modeQuick" : "modePractice")} · ${m.scores[0]}–${m.scores[1]} · ${t("handNo", { n: m.handNo })}` : "";
        body = (
          <MainMenu
            t={t}
            hasSave={hasSave}
            saveInfo={info}
            note={note ? t(note) : null}
            onContinue={() => { audio.unlock(); setPaused(false); setOverlay(null); setShowFinal(false); setScreen("play"); }}
            onNav={(sc) => { audio.unlock(); setRulesFrom("menu"); setScreen(sc); }}
          />
        );
      }
    }
  }

  const rootCls = ["ab", settings.reducedMotion ? "ab--calm" : "", paused ? "is-paused" : ""].join(" ");
  return (
    <div className={rootCls} data-theme={settings.theme} lang={settings.lang}>
      <ArtDefs />
      <div className="ab-room" aria-hidden="true" />
      {screen === "play" && m ? body : <div className="ab-frame ab-frame--menu">{body}</div>}
    </div>
  );
}
