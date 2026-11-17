/**
 * Wild West: Card Showdown — a 3D western No-Limit Texas Hold'em tournament
 * adventure: fifteen saloons along the frontier trail, five kinds of cowboy
 * rivals, fictional chips only.
 *
 * engine/   rules layer: stages, rivals/AI personalities, tournament match,
 *           saves (the poker rules + AI come from the Game Center's tested
 *           Hold'em engine in ../TexasHoldemPoker/engine)
 * render/   plain Three.js: saloons, table, cards, chips, cowboys, camera
 * ui/       React HUD + screens; audio.js is synthesised Web Audio
 *
 * Rendered inside the shared <GamePlayer> (registered in ../registry.js):
 * `restartSignal` restarts the current stage, `muted` silences audio,
 * fullscreen belongs to GamePlayer (the canvas follows the stage size). Text
 * is English; the Game Center translator localises it (Russian) at runtime.
 *
 * DEV hooks: `?wwstest=1` (+`&nosave=1`) exposes window.__wws — see tools/harness.mjs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./WildWestShowdown.css";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { STAGE_COUNT, stageById, milestoneAt } from "./engine/stages.js";
import { RIVALS, ARCHETYPES } from "./engine/rivals.js";
import { createMatch, dealNext, act, step, aiMove, afterHand, HUMAN, handsToNextLevel, handsLeft } from "./engine/match.js";
import { legalActions, describeHand, holeLabel, equity, evaluate, buildPots } from "./engine/poker.js";
import { loadProgress, loadSettings, writeJSON, recordResult, completedCount, freshProgress, SAVE_KEY, SETTINGS_KEY, sanitizeSettings } from "./engine/save.js";
import { TopBar, SeatPlates, PlayerPanel, ActionBar, Feed, HandBanner, actionText } from "./ui/Hud.jsx";
import { Loading, MainMenu, MapScreen, Briefing, IntroCaption, Result, Ending, Pause, Help, Settings, Confirm } from "./ui/Screens.jsx";
import { fmt } from "./ui/bits.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("wwstest");
const NOSAVE = TEST && PARAMS.has("nosave");
const mem = new Map();
const memStore = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const store = () => (NOSAVE ? memStore : undefined);

const SPEED = { slow: 1.45, normal: 1, fast: 0.55 };
let speedMul = 1;
const trace = (s) => {
  if (TEST) (window.__wwsTrace = window.__wwsTrace || []).push(`${Math.round(performance.now())} ${s}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speedMul * ((TEST && window.__wwsSpeed) || 1)));

export default function WildWestShowdown({ restartSignal = 0, muted = false }) {
  const { lang } = useTranslation();
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const [screen, setScreenS] = useState("boot");
  const screenRef = useRef("boot");
  const [overlay, setOverlayS] = useState(null);
  const overlayRef = useRef(null);
  const [loadP, setLoadP] = useState(0);
  const [webglError, setWebglError] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings(store()));
  const [qualityNow, setQualityNow] = useState(null);
  const [progress, setProgressS] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [stageId, setStageId] = useState(() => progress.current?.stageId || Math.min(progress.unlocked, STAGE_COUNT));
  const [match, setMatchS] = useState(null);
  const matchRef = useRef(null);
  const [la, setLa] = useState(null);
  const [thinking, setThinking] = useState(-1);
  const [lastAct, setLastAct] = useState({});
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [introRival, setIntroRival] = useState(null);
  const [handInfo, setHandInfo] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const [stageLoading, setStageLoading] = useState(false);
  const loadedStage = useRef(0);
  const loopTok = useRef(0);
  const humanRes = useRef(null);
  const bannerRes = useRef(null);
  const plateRefs = useRef([]);
  const betRefs = useRef([]);
  const potRef = useRef(null);
  const feedId = useRef(0);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenS(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = typeof o === "function" ? o(overlayRef.current) : o;
    setOverlayS(overlayRef.current);
  }, []);
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressS(p);
    writeJSON(SAVE_KEY, p, store());
  }, []);
  const stage = stageById(stageId);

  /* ------------------------------------------------------------ world */
  useEffect(() => {
    const el = stageRef.current;
    let world;
    try {
      world = createWorld(el, {
        quality: settings.quality,
        motion: settings.motion,
        onQuality: (q) => setQualityNow(q),
        audio,
        preserve: TEST,
        manual: TEST && PARAMS.has("wwsmanual"),
        maxDt: TEST ? 0.6 : 0.1,
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error("[WildWest] WebGL init failed", e);
      setWebglError(true);
      return undefined;
    }
    worldRef.current = world;
    setQualityNow(world.quality());
    const fit = () => world.resize(el.clientWidth, el.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    world.bindHud({ seats: plateRefs.current, pot: null, bets: betRefs.current });
    let alive = true;
    const loop = loopTok;
    const first = stageById(progressRef.current.current?.stageId || Math.min(progressRef.current.unlocked, STAGE_COUNT));
    world
      .loadStage(first, (p) => alive && setLoadP(p))
      .then((ok) => {
        if (!alive || !ok) return;
        loadedStage.current = first.id;
        world.menu();
        if (screenRef.current === "boot") setScreen("menu");
      })
      .catch((err) => {
        if (!alive) return;
        if (import.meta.env.DEV) {
          console.error("[WildWest] load failed", err);
          window.__wwsErr = String(err?.stack || err);
        }
        setWebglError(true);
      });
    return () => {
      alive = false;
      loop.current++;
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
      audio.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setVolume({ master: settings.volume, music: settings.music, ambience: settings.ambience });
  }, [settings.volume, settings.music, settings.ambience]);
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
    setQualityNow(worldRef.current?.quality() || null);
  }, [settings.quality]);
  useEffect(() => {
    speedMul = SPEED[settings.speed] || 1;
    worldRef.current?.setSpeed(1 / speedMul);
  }, [settings.speed]);
  useEffect(() => {
    worldRef.current?.setMotion(settings.motion);
  }, [settings.motion]);

  const setSetting = useCallback((k, v) => {
    setSettings((s) => {
      const n = sanitizeSettings({ ...s, [k]: v });
      writeJSON(SETTINGS_KEY, n, store());
      return n;
    });
  }, []);

  /** Make sure the 3D saloon of stage `id` is built. */
  const ensureStage = useCallback(async (id) => {
    const w = worldRef.current;
    if (!w) return false;
    if (loadedStage.current === id) return true;
    setStageLoading(true);
    setLoadP(0);
    const ok = await w.loadStage(stageById(id), (p) => setLoadP(p));
    setStageLoading(false);
    if (ok) loadedStage.current = id;
    return ok;
  }, []);

  /* ------------------------------------------------------------ match state */
  const commit = useCallback(
    (m) => {
      matchRef.current = m;
      setMatchS(m);
      const p = progressRef.current;
      if (m && !m.done) setProgress({ ...p, current: m });
    },
    [setProgress],
  );
  const say = useCallback((text, tone = null) => {
    const id = ++feedId.current;
    setFeed((f) => [...f.slice(-3), { id, text, tone }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200);
  }, []);
  const nameOf = (m, seat) => (seat === HUMAN ? "You" : RIVALS[m.table.players[seat].id]?.name || "");

  /** Hand-strength readout for the human. */
  const updateInfo = useCallback((m) => {
    const t = m.table;
    const me = t.players[HUMAN];
    if (!me.inHand || me.folded || me.hole.length !== 2) return setHandInfo(null);
    const opp = t.players.filter((p, i) => i !== HUMAN && p.inHand && !p.folded).length;
    let label, best = null;
    if (t.board.length >= 3) {
      const ev = evaluate([...me.hole, ...t.board]);
      label = describeHand(ev.score);
      best = ev.best;
    } else label = holeLabel(me.hole);
    const eq = opp > 0 ? equity(me.hole, t.board, opp, 360, Math.random) : 1;
    setHandInfo({ label, equity: eq, best });
  }, []);

  /* ------------------------------------------------------------ the hand loop */
  const waitUnpaused = async (tok) => {
    while (overlayRef.current && tok === loopTok.current) await sleep(120);
  };

  const finish = useCallback(
    async (m, tok) => {
      const W = worldRef.current;
      const won = m.result.won;
      const prog = recordResult(progressRef.current, m);
      const ms = won && !progressRef.current.completed[m.stageId] ? milestoneAt(Object.keys(prog.completed).length)?.title || null : null;
      setMilestone(ms);
      setProgress(prog);
      setLa(null);
      setThinking(-1);
      if (won) {
        audio.fanfare(m.stageId === STAGE_COUNT);
        W?.victory();
      } else {
        audio.sting();
        W?.defeat(m.result.reason === "sundown" ? m.result.leader : m.table.players.findIndex((p, i) => i !== HUMAN && !p.out));
      }
      await sleep(1600);
      if (tok !== loopTok.current) return;
      setScreen("result");
    },
    [setProgress, setScreen],
  );

  const run = useCallback(
    async (tok) => {
      const W = worldRef.current;
      const alive = () => tok === loopTok.current && worldRef.current;
      let revealedHand = -1;
      while (alive()) {
        await waitUnpaused(tok);
        if (!alive()) return;
        let m = matchRef.current;
        if (!m) return;
        if (m.done) return finish(m, tok);
        const t = m.table;
        if (t.phase === "waiting" || t.phase === "complete") {
          const prev = t;
          const r = dealNext(m);
          if (r.error) return;
          m = r.match;
          setLastAct({});
          setBanner(null);
          commit(m);
          say(m.table.dealer === HUMAN ? `Hand ${m.table.handNo} — you have the button` : `Hand ${m.table.handNo} — ${nameOf(m, m.table.dealer)} has the button`);
          trace("deal");
          await W.dealHand(m.table, prev.phase === "complete" ? prev : null);
          trace("dealt");
          if (!alive()) return;
          updateInfo(m);
          continue;
        }
        if (t.phase === "betting") {
          const seat = t.toAct;
          let a;
          if (seat === HUMAN) {
            updateInfo(m);
            setLa(legalActions(t, HUMAN));
            setThinking(-1);
            audio.turn();
            a = await new Promise((res) => (humanRes.current = res));
            humanRes.current = null;
            setLa(null);
            if (!alive() || !a) return;
          } else {
            setThinking(seat);
            W.turn(seat);
            const arche = ARCHETYPES[RIVALS[t.players[seat].id].archetype];
            const [lo, hi] = arche.tempo;
            const view = legalActions(t, seat);
            // big decisions take longer
            const weight = view && view.toCall > t.blinds.bb * 6 ? 1.35 : 1;
            await sleep((lo + Math.random() * (hi - lo)) * 1000 * weight);
            await waitUnpaused(tok);
            if (!alive()) return;
            a = aiMove(matchRef.current);
            setThinking(-1);
          }
          m = matchRef.current;
          const prev = m.table;
          const r = act(m, seat, a);
          if (r.error) {
            if (seat === HUMAN) continue;
            return;
          }
          m = r.match;
          const rec = m.table.players[seat].lastAction;
          commit(m);
          setLastAct((o) => ({ ...o, [seat]: rec }));
          say(actionText(rec, nameOf(m, seat), seat === HUMAN), rec.type === "allin" ? "hot" : null);
          if (rec.type === "allin") audio.allIn();
          trace(`action ${seat} ${rec.type}`);
          await W.action(seat, rec, prev, m.table);
          trace("acted");
          if (!alive()) return;
          continue;
        }
        if (t.phase === "street-end") {
          const prev = t;
          m = step(m).match;
          commit(m);
          trace("street");
          await W.street(prev, m.table);
          trace("streeted");
          if (!alive()) return;
          setLastAct((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && (v.type === "fold" || v.type === "allin"))));
          if (m.table.runout && revealedHand !== m.table.handNo) {
            revealedHand = m.table.handNo;
            say("All-in! The cards are turned face up.", "hot");
            await W.reveal(m.table);
          }
          if (m.table.phase === "complete") await handDone(m, tok);
          else updateInfo(m);
          continue;
        }
        if (t.phase === "showdown") {
          if (revealedHand !== t.handNo) {
            revealedHand = t.handNo;
            await W.reveal(t);
          }
          await sleep(500);
          m = step(m).match;
          commit(m);
          await handDone(m, tok);
          continue;
        }
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, say, updateInfo, finish],
  );

  /** Pots paid: banner, reactions, eliminations, blinds, then the next hand. */
  const handDone = async (mIn, tok) => {
    const W = worldRef.current;
    const t = mIn.table;
    const res = t.result;
    const alive = () => tok === loopTok.current && worldRef.current;
    const lines = [];
    const winners = res.winners;
    const nm = (i) => (i === HUMAN ? "You" : RIVALS[t.players[i].id].name);
    res.pots.forEach((p, k) => {
      if (!p.winners.length) return;
      const hand = res.showdown ? describeHand(res.hands[p.winners[0]].score) : null;
      const amt = Object.values(p.shares).reduce((a, b) => a + b, 0);
      const pot = res.pots.length > 1 ? (k === 0 ? "Main pot" : "Side pot") : null;
      const a$ = fmt(amt, lang);
      let text;
      if (p.winners.length > 1) {
        const who = p.winners.map(nm).join(" & ");
        text = hand ? `${who} split ${a$} with ${hand}` : `${who} split ${a$}`;
      } else if (p.winners[0] === HUMAN) text = hand ? `You win ${a$} with ${hand}` : `You take ${a$}`;
      else text = hand ? `${nm(p.winners[0])} wins ${a$} with ${hand}` : `${nm(p.winners[0])} takes ${a$}`;
      lines.push({ pot, text });
    });
    const humanWon = winners.includes(HUMAN);
    const humanIn = t.players[HUMAN].inHand && !t.players[HUMAN].folded;
    setBanner({ title: humanWon ? (winners.length > 1 ? "Split pot" : "You win the pot") : res.showdown ? "Showdown" : "Pot taken", lines, tone: humanWon ? "win" : humanIn ? "lose" : "neutral", winners });
    if (humanWon) audio.winHand();
    else if (humanIn && res.showdown) audio.loseHand();
    trace("award");
    await W.award(t);
    trace("awarded");
    if (!alive()) return;
    for (let i = 1; i < t.players.length; i++) {
      if (winners.includes(i)) continue;
      const p = t.players[i];
      if (p.inHand && !p.folded && res.showdown && p.startStack > t.blinds.bb * 10 && p.stack < p.startStack * 0.5) W.react(i, "lose");
    }
    // tournament book-keeping
    const { match: m, events } = afterHand(mIn);
    commit(m);
    if (events) {
      for (const e of events.eliminated) {
        if (e.seat === HUMAN) say("You are out of chips.", "bad");
        else {
          say(`${RIVALS[e.id].name} is out of the tournament`, "good");
          W.react(e.seat, "busted");
          audio.door();
        }
      }
      if (events.levelUp) {
        say(`Blinds rise to ${fmt(events.levelUp.sb, lang)}/${fmt(events.levelUp.bb, lang)}`, "warn");
        audio.levelUp();
      }
    }
    // let the player read the result (Space / button skips)
    const hold = humanIn || res.pots.length > 1 ? 3200 : 2200;
    await Promise.race([sleep(hold), new Promise((r) => (bannerRes.current = r))]);
    bannerRes.current = null;
    if (!alive()) return;
    setBanner(null);
    trace("collect");
    await W.collect();
    trace("collected");
  };

  const startLoop = useCallback(() => {
    const tok = ++loopTok.current;
    humanRes.current?.(null);
    run(tok);
  }, [run]);

  const onAct = useCallback((a) => {
    const m = matchRef.current;
    if (!m || !humanRes.current) return;
    const lg = legalActions(m.table, HUMAN);
    if (!lg) return;
    if (a.type === "check" && !lg.canCheck) return;
    if (a.type === "call" && !lg.canCall) return;
    if ((a.type === "bet" && !lg.canBet) || (a.type === "raise" && !lg.canRaise)) return;
    if (a.type === "allin" && !lg.canAllIn) return;
    audio.click();
    humanRes.current(a);
  }, []);

  /* ------------------------------------------------------------ navigation */
  const enterSaloonAudio = (st) => {
    audio.unlock();
    audio.stopAll();
    audio.startAmbience({ wind: st.env.sky === "night" ? 0.8 : 0.5, crowd: st.env.dark ? 0.4 : 0.7, night: st.env.sky === "night" });
    audio.startMusic(st.env.fancy ? 0.9 : 1);
  };

  const beginMatch = useCallback(
    async (id, { resume = null, intro = true } = {}) => {
      loopTok.current++;
      humanRes.current?.(null);
      const st = stageById(id);
      setStageId(id);
      setOverlay(null);
      setBanner(null);
      setFeed([]);
      setLastAct({});
      setHandInfo(null);
      setLa(null);
      setScreen("intro");
      setIntroRival(null);
      trace(`begin ${id} intro=${intro} resume=${!!resume}`);
      const ok = await ensureStage(id);
      trace(`stage ready ${ok}`);
      if (!ok) return;
      const W = worldRef.current;
      const m = resume || createMatch(id);
      commit(m);
      W.syncTable(m.table);
      enterSaloonAudio(st);
      if (intro && !resume) {
        const tok = loopTok.current;
        await W.intro((i) => setIntroRival(i > 0 ? st.rivals[i - 1] : null));
        if (tok !== loopTok.current) return;
      } else W.setMode("seat", 1.2);
      setIntroRival(null);
      setScreen("play");
      startLoop();
    },
    [commit, ensureStage, setOverlay, setScreen, startLoop],
  );

  const skipIntro = useCallback(() => {
    if (screenRef.current !== "intro") return;
    worldRef.current?.skipCine();
  }, []);

  const toMenu = useCallback(() => {
    loopTok.current++;
    humanRes.current?.(null);
    setOverlay(null);
    setLa(null);
    setScreen("menu");
    worldRef.current?.menu();
    audio.stopMusic();
  }, [setOverlay, setScreen]);
  const toMap = useCallback(() => {
    loopTok.current++;
    humanRes.current?.(null);
    setOverlay(null);
    setLa(null);
    setScreen("map");
    worldRef.current?.menu();
    audio.unlock();
  }, [setOverlay, setScreen]);
  const pickStage = useCallback(
    (id) => {
      if (id > progressRef.current.unlocked) return;
      audio.click();
      setStageId(id);
      setScreen("brief");
      ensureStage(id).then(() => screenRef.current === "brief" && worldRef.current?.menu());
    },
    [ensureStage, setScreen],
  );
  const startStage = useCallback(() => {
    const p = progressRef.current;
    // starting fresh abandons a saved game on another stage
    if (p.current && p.current.stageId !== stageId) setProgress({ ...p, current: null });
    beginMatch(stageId, { resume: p.current && p.current.stageId === stageId ? p.current : null });
  }, [beginMatch, setProgress, stageId]);
  const onContinue = useCallback(() => {
    const p = progressRef.current;
    if (!p.current) return;
    beginMatch(p.current.stageId, { resume: p.current, intro: false });
  }, [beginMatch]);
  const onPlay = useCallback(() => {
    audio.unlock();
    const p = progressRef.current;
    if (p.current) return onContinue();
    pickStage(Math.min(p.unlocked, STAGE_COUNT));
  }, [onContinue, pickStage]);
  const restartStage = useCallback(() => {
    const p = progressRef.current;
    setProgress({ ...p, current: null });
    beginMatch(stageId, { intro: false });
  }, [beginMatch, setProgress, stageId]);
  const nextStage = useCallback(() => {
    if (stageId >= STAGE_COUNT) {
      setScreen("ending");
      worldRef.current?.victory();
      return;
    }
    pickStage(stageId + 1);
  }, [pickStage, setScreen, stageId]);
  const resetAll = useCallback(() => {
    loopTok.current++;
    setProgress(freshProgress());
    setStageId(1);
    setOverlay(null);
    setScreen("menu");
    worldRef.current?.menu();
  }, [setOverlay, setProgress, setScreen]);

  // GamePlayer's restart button → restart the current stage
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current === "play" || screenRef.current === "result") restartStage();
  }, [restartSignal, restartStage]);

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" && e.target.type !== "range") return;
      const sc = screenRef.current;
      if (e.key === "Escape") {
        if (sc === "play") {
          e.preventDefault();
          setOverlay((o) => (o ? null : "pause"));
        } else if (overlayRef.current) setOverlay(null);
        return;
      }
      if (sc === "intro" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        skipIntro();
        return;
      }
      if (sc !== "play" || overlayRef.current) return;
      const k = e.key.toLowerCase();
      if ((k === " " || k === "enter") && bannerRes.current) {
        e.preventDefault();
        bannerRes.current();
        return;
      }
      const m = matchRef.current;
      const lg = m && humanRes.current ? legalActions(m.table, HUMAN) : null;
      if (!lg) return;
      if (k === "f") onAct({ type: "fold" });
      else if (k === "c") onAct(lg.canCheck ? { type: "check" } : { type: "call" });
      else if (k === "a") onAct({ type: "allin" });
      else if (k === "r") document.querySelector(".wws-btn--raise")?.click();
      else if (k === "arrowup" || k === "arrowdown") {
        const r = document.querySelector(".wws-actions .wws-range");
        if (r && !r.disabled) {
          e.preventDefault();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(r, String(+r.value + (k === "arrowup" ? 1 : -1) * m.table.blinds.bb));
          r.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAct, setOverlay, skipIntro]);

  const onPointerMove = useCallback((e) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !worldRef.current) return;
    worldRef.current.pointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }, []);

  /* ------------------------------------------------------------ test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__wws = {
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      match: () => matchRef.current,
      progress: () => progressRef.current,
      setProgress: (fn) => setProgress(typeof fn === "function" ? fn(progressRef.current) : fn),
      world: () => worldRef.current,
      la: () => (humanRes.current && matchRef.current ? legalActions(matchRef.current.table, HUMAN) : null),
      act: onAct,
      start: (id, opts) => beginMatch(id, opts),
      skipIntro,
      pick: pickStage,
      startStage,
      cont: onContinue,
      toMenu,
      toMap,
      next: () => bannerRes.current?.(),
      restart: restartStage,
      setOverlay,
      banner: () => banner,
      setMatch: (m) => commit(m),
      setSetting,
      settings: () => settings,
      loopTok: () => loopTok.current,
    };
    return undefined;
  });

  /* ------------------------------------------------------------ render */
  const inTable = (screen === "play" || screen === "intro" || screen === "result") && match && match.stageId === stageId;
  const pots = useMemo(() => {
    if (!match) return { total: 0, side: [] };
    const t = match.table;
    if (t.phase === "complete" || t.phase === "waiting") return { total: 0, side: [] };
    const collected = t.players.reduce((a, p) => a + p.total - p.bet, 0);
    const ps = buildPots(t.players.map((p) => ({ total: p.total - p.bet, folded: p.folded })));
    return { total: collected, side: ps.length > 1 ? ps.map((p) => p.amount) : [] };
  }, [match]);
  useEffect(() => {
    worldRef.current?.bindHud({ seats: plateRefs.current, pot: potRef.current, bets: betRefs.current });
  });

  const completed = completedCount(progress);
  const t = match?.table;
  return (
    <div className={`wws${screen === "play" ? " is-play" : ""}`} onPointerMove={onPointerMove} lang={lang === "ru" ? "ru" : "en"}>
      <div className="wws-stage" ref={stageRef} />
      <div className="wws-vignette" />

      {webglError && (
        <div className="wws-modal">
          <div className="wws-panel wws-panel--narrow">
            <h2>3D graphics unavailable</h2>
            <p>Wild West: Card Showdown needs WebGL. Please enable hardware acceleration or try another browser.</p>
          </div>
        </div>
      )}
      {!webglError && (screen === "boot" || stageLoading) && <Loading p={loadP} text={screen === "boot" ? "Riding into town…" : `Riding to ${stage?.town}…`} />}

      {screen === "menu" && !overlay && (
        <MainMenu progress={progress} completed={completed} lang={lang} onPlay={onPlay} onContinue={onContinue} onNew={() => setOverlay("confirmNew")} onMap={toMap} onHelp={() => setOverlay("help")} onSettings={() => setOverlay("settings")} />
      )}
      {screen === "map" && !overlay && <MapScreen progress={progress} lang={lang} onPick={pickStage} onBack={toMenu} />}
      {screen === "brief" && stage && !overlay && !stageLoading && (
        <Briefing stage={stage} lang={lang} record={progress.completed[stage.id]} savedTown={progress.current && progress.current.stageId !== stage.id ? stageById(progress.current.stageId).town : null} onStart={startStage} onBack={toMap} />
      )}
      {screen === "intro" && stage && !stageLoading && <IntroCaption stage={stage} rival={introRival} onSkip={skipIntro} />}

      {inTable && t && (
        <div className={`wws-hud${screen === "play" ? "" : " is-hidden"}`}>
          <TopBar stage={stage} blinds={t.blinds} level={match.level} toLevel={handsToNextLevel(match)} left={handsLeft(match)} handNo={t.handNo} onPause={() => setOverlay("pause")} />
          <SeatPlates table={t} rivals={stage.rivals} toAct={t.phase === "betting" ? t.toAct : -1} thinking={thinking >= 0} plateRefs={plateRefs} betRefs={betRefs} potRef={potRef} pots={pots} lastAct={lastAct} winners={banner?.winners} />
          <Feed items={feed} />
          <HandBanner banner={banner} onNext={banner ? () => bannerRes.current?.() : null} auto />
          <div className="wws-bottom">
            <PlayerPanel table={t} info={handInfo} assist={settings.cardAssist} isTurn={!!la} winner={banner?.winners?.includes(HUMAN)} />
            <ActionBar la={la} pot={pots.total + t.players.reduce((a, p) => a + p.bet, 0)} bb={t.blinds.bb} onAct={onAct} disabled={!!overlay} />
          </div>
          {la && <div className="wws-yourturn">Your move</div>}
        </div>
      )}

      {screen === "result" && match?.result && stage && (
        <Result stage={stage} match={match} progress={progress} milestone={milestone} lang={lang} onNext={nextStage} onRetry={restartStage} onMap={toMap} onMenu={toMenu} />
      )}
      {screen === "ending" && <Ending progress={progress} lang={lang} onMenu={toMenu} onMap={toMap} />}

      {overlay === "pause" && (
        <Pause
          onResume={() => setOverlay(null)}
          onHelp={() => setOverlay("help")}
          onSettings={() => setOverlay("settings")}
          onRestart={() => setOverlay("confirmRestart")}
          onMap={toMap}
          onMenu={toMenu}
        />
      )}
      {overlay === "confirmRestart" && <Confirm text="Restart this stage? The current tournament will be lost." yes="Restart" no="Cancel" onYes={restartStage} onNo={() => setOverlay("pause")} />}
      {overlay === "confirmNew" && (
        <Confirm
          text="Start a new career? Every stage, your winnings and the saved tournament will be erased."
          yes="New Game"
          no="Cancel"
          onYes={() => {
            resetAll();
            pickStage(1);
          }}
          onNo={() => setOverlay(null)}
        />
      )}
      {overlay === "help" && <Help onClose={() => setOverlay(screenRef.current === "play" ? "pause" : null)} />}
      {overlay === "settings" && <Settings settings={settings} set={setSetting} qualityNow={qualityNow} onReset={resetAll} onClose={() => setOverlay(screenRef.current === "play" ? "pause" : null)} />}
    </div>
  );
}
