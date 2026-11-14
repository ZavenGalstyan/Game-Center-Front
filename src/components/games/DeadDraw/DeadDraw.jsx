/**
 * Dead Draw: Survival Bunker — a 3D survival-horror card game. Fifteen days
 * locked in a bunker: each day draw 3 survival cards, play up to 2, face the
 * day's event, survive the night. Food, Water, Power, Scrap and Health are
 * managed through 21 cards; 15 story events remember your decisions; four
 * rescue endings.
 *
 * engine/   framework-free rules (cards, days/events, state machine, saves)
 * render/   plain Three.js bunker, lighting, CCTV, creature, card illustrations
 * ui/       React HUD, cards and screens; audio.js is synthesised Web Audio.
 *
 * Rendered inside the shared <GamePlayer> (registered in ../registry.js):
 * `restartSignal` restarts the current day from its dawn, `muted` silences
 * audio, fullscreen belongs to GamePlayer (the canvas follows the stage size).
 * Text is English; the Game Center translator localises it at runtime.
 *
 * DEV hooks: `?ddstest=1` (+`&nosave=1`) exposes window.__dds — see tools/harness.mjs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DeadDraw.css";
import { newGame, draw, play, endPlay, choose, night, next, cardPlayable, validSave, deathOf, choiceState } from "./engine/game.js";
import { CARDS } from "./engine/cards.js";
import { dayOf } from "./engine/days.js";
import { canPay } from "./engine/rules.js";
import { audio } from "./audio.js";
import { Card } from "./ui/Card.jsx";
import { Hud, FxChips } from "./ui/Hud.jsx";
import { Loading, MainMenu, ConfirmNew, Help, Settings, Pause, Dawn, EventPanel, Outcome, NightForecast, Night, GameOver, Ending } from "./ui/Screens.jsx";
import { createWorld } from "./render/world.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("ddstest");
const NOSAVE = TEST && PARAMS.has("nosave");
const SAVE_KEY = "dead-draw-save";
const SETTINGS_KEY = "dead-draw-settings";
const WINS_KEY = "dead-draw-wins";
const DEFAULT_SETTINGS = { quality: "auto", volume: 0.8, brightness: 1, shake: true };

const mem = new Map();
const memStore = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
function store() {
  if (NOSAVE) return memStore;
  try {
    return typeof localStorage !== "undefined" ? localStorage : memStore;
  } catch {
    return memStore;
  }
}
function readJSON(key) {
  try {
    const raw = store().getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJSON(key, v) {
  try {
    if (v == null) store().removeItem(key);
    else store().setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the run continues unsaved */
  }
}
/** A save is { S, dawn } — dawn is the state at the start of the current day (for Retry day). */
function loadSave() {
  const s = readJSON(SAVE_KEY);
  if (!s || !validSave(s.S) || !validSave(s.dawn)) return null;
  return s;
}
function loadSettings() {
  const s = readJSON(SETTINGS_KEY) || {};
  const out = { ...DEFAULT_SETTINGS };
  if (["auto", "high", "medium", "low"].includes(s.quality)) out.quality = s.quality;
  if (Number.isFinite(s.volume)) out.volume = Math.max(0, Math.min(1, s.volume));
  if (Number.isFinite(s.brightness)) out.brightness = Math.max(0.7, Math.min(1.5, s.brightness));
  if (typeof s.shake === "boolean") out.shake = s.shake;
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms * ((TEST && window.__ddsSpeed) || 1)));

/** How the bunker looks for a given state (lights, persistent props). */
function moodOf(S) {
  const power = S.res.power <= 0 ? 0.12 : S.status.generatorBroken ? 0.62 : 1;
  return { power, generator: !S.status.generatorBroken && S.res.power > 0 };
}
function persistentOf(S) {
  const d10 = S.decisions[10];
  return { companion: !!S.companion, ventSealed: !!S.flags.ventSealed, sector: d10 === "explore" || d10 === "leave" ? "open" : "closed" };
}

export default function DeadDraw({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const [screen, setScreenState] = useState("boot"); // boot | menu | game
  const screenRef = useRef("boot");
  const [overlay, setOverlay] = useState(null); // help | settings | pause | confirm
  const [loadP, setLoadP] = useState(0);
  const [webglError, setWebglError] = useState(false);
  const [settings, setSettingsState] = useState(loadSettings);
  const [qualityNow, setQualityNow] = useState(null);
  const [S, setSState] = useState(null);
  const SRef = useRef(null);
  const dawnRef = useRef(null);
  const [save, setSave] = useState(loadSave);
  const [wins, setWins] = useState(() => readJSON(WINS_KEY) || 0);
  const [, setArtV] = useState(0);
  const artRef = useRef(null);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const [sel, setSel] = useState(-1);
  const [playing, setPlaying] = useState(-1);
  const [dealt, setDealt] = useState(0);
  const [toast, setToast] = useState(null); // card outcome
  const [revealed, setRevealed] = useState(false);
  const [pulse, setPulse] = useState(null);
  const [showEnding, setShowEnding] = useState(false);
  const token = useRef(0);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setBusy = useCallback((b) => {
    busyRef.current = b;
    setBusyState(b);
  }, []);

  /** Commit a new game state: React, the save, HUD pulses. */
  const commit = useCallback((next, { fx = null } = {}) => {
    SRef.current = next;
    setSState(next);
    if (next.phase === "dawn") dawnRef.current = next;
    if (fx && Object.keys(fx).length) setPulse({ ...fx, n: Date.now() });
    if (next.phase === "won" || next.phase === "dead") {
      writeJSON(SAVE_KEY, next.phase === "dead" ? { S: next, dawn: dawnRef.current } : null);
      setSave(next.phase === "dead" ? { S: next, dawn: dawnRef.current } : null);
    } else {
      const sv = { S: next, dawn: dawnRef.current || next };
      writeJSON(SAVE_KEY, sv);
      setSave(sv);
    }
  }, []);

  /* ------------------------------------------------------------ world */
  useEffect(() => {
    const el = stageRef.current;
    let world;
    try {
      world = createWorld(el, {
        quality: settings.quality,
        brightness: settings.brightness,
        shake: settings.shake,
        onQuality: (q) => setQualityNow(q),
      });
    } catch {
      setWebglError(true);
      return undefined;
    }
    worldRef.current = world;
    setQualityNow(world.quality());
    const fit = () => world.resize(el.clientWidth, el.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    let alive = true;
    world
      .load((p) => alive && setLoadP(p))
      .then((ok) => {
        if (!alive || !ok) return;
        world.setMenu(true);
        world.focus("room", 0.01);
        if (screenRef.current === "boot") setScreen("menu");
        import("./render/cardArt.js").then(({ generateCardArt, cardArtUrl, ART_KEYS }) => {
          artRef.current = cardArtUrl;
          let n = 0;
          generateCardArt(ART_KEYS, () => {
            n++;
            if (alive && (n % 3 === 0 || n === ART_KEYS.length)) setArtV((v) => v + 1);
          });
        });
      })
      .catch((err) => {
        if (!alive) return;
        if (import.meta.env.DEV) {
          console.error("[DeadDraw] load failed", err);
          window.__ddsErr = String(err?.stack || err);
        }
        setWebglError(true);
      });
    return () => {
      alive = false;
      token.current++;
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
      audio.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setVolume(settings.volume);
  }, [settings.volume]);
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
    setQualityNow(worldRef.current?.quality() || null);
  }, [settings.quality]);
  useEffect(() => {
    worldRef.current?.setBrightness(settings.brightness);
  }, [settings.brightness]);
  useEffect(() => {
    worldRef.current?.setShake(settings.shake);
  }, [settings.shake]);
  useEffect(() => () => audio.dispose(), []);

  const setSetting = useCallback((k, v) => {
    setSettingsState((s) => {
      const n = { ...s, [k]: v };
      writeJSON(SETTINGS_KEY, n);
      return n;
    });
  }, []);

  // look around with the mouse (a gentle, limited head turn)
  const onPointerMove = useCallback((e) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !worldRef.current) return;
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    worldRef.current.pointer(x * 0.9, y * 0.6);
  }, []);

  /* ------------------------------------------------------------ flow */
  const enterDay = useCallback((St) => {
    const w = worldRef.current;
    w?.reset(moodOf(St));
    w?.setPersistent(persistentOf(St));
    w?.setMenu(false);
    w?.focus("room", 1.6);
    audio.tension(Math.min(1, (St.day - 1) / 13));
    setSel(-1);
    setToast(null);
    setRevealed(false);
    setDealt(0);
    setShowEnding(false);
  }, []);

  /** Bring the 3D scene + UI in line with a (possibly restored) state. */
  const resume = useCallback(
    async (St) => {
      const my = ++token.current;
      audio.unlock();
      audio.startAmbience({ generator: !St.status.generatorBroken });
      dawnRef.current = loadSave()?.dawn || St;
      commit(St);
      setScreen("game");
      setOverlay(null);
      enterDay(St);
      if (St.phase === "play") setDealt(St.hand.length);
      if (St.phase === "event") {
        setBusy(true);
        await worldRef.current?.cue(dayOf(St.day).scene);
        if (token.current !== my) return;
        setBusy(false);
        setRevealed(true);
      }
      if (St.phase === "won") setShowEnding(true);
    },
    [commit, enterDay, setBusy, setScreen],
  );

  const startNew = useCallback(() => {
    token.current++;
    audio.unlock();
    audio.stopAmbience();
    audio.startAmbience();
    const St = newGame();
    dawnRef.current = St;
    commit(St);
    setScreen("game");
    setOverlay(null);
    enterDay(St);
    worldRef.current?.cue("intro");
  }, [commit, enterDay, setScreen]);

  const onNew = useCallback(() => {
    if (save && save.S.phase !== "dead") setOverlay("confirm");
    else startNew();
  }, [save, startNew]);

  const onContinue = useCallback(() => {
    const sv = loadSave();
    if (!sv) {
      setSave(null);
      return;
    }
    if (sv.S.phase === "dead") resume(sv.dawn);
    else resume(sv.S);
  }, [resume]);

  const restartDay = useCallback(() => {
    const d = dawnRef.current;
    if (!d) return;
    token.current++;
    audio.stopAmbience();
    resume(structuredClone(d));
  }, [resume]);

  const toMenu = useCallback(() => {
    token.current++;
    setOverlay(null);
    setScreen("menu");
    setBusy(false);
    audio.stopAmbience();
    const w = worldRef.current;
    w?.reset({ power: 1 });
    w?.setMenu(true);
    w?.focus("room", 1.2);
  }, [setBusy, setScreen]);

  const onDraw = useCallback(async () => {
    const St = SRef.current;
    if (!St || St.phase !== "dawn" || busyRef.current) return;
    audio.unlock();
    audio.shuffle();
    const n = draw(St);
    commit(n);
    worldRef.current?.focus("desk", 1.2);
    setDealt(0);
    for (let i = 0; i < n.hand.length; i++) {
      await sleep(160);
      audio.draw();
      setDealt(i + 1);
    }
  }, [commit]);

  const reactToCard = useCallback((id, out) => {
    const w = worldRef.current;
    if (!w) return;
    if (out.fx?.hp < 0) w.cue("hurt");
    switch (id) {
      case "barricade_door":
      case "emergency_lockdown":
      case "reinforce_shelter":
        audio.bang();
        w.kick(0.015);
        break;
      case "recharge_battery":
      case "repair_generator":
        audio.powerUp();
        w.setMood(moodOf(SRef.current));
        break;
      case "unknown_signal":
        audio.radioVoice();
        break;
      case "investigate_noise":
      case "strange_footsteps":
        audio.footsteps(4, 0.4);
        break;
      default:
        if (out.tone === "good") audio.gain();
    }
  }, []);

  const playIndex = useCallback(
    async (i) => {
      const St = SRef.current;
      if (!St || St.phase !== "play" || busyRef.current) return;
      const id = St.hand[i];
      if (!id || !cardPlayable(St, id)) return;
      const my = token.current;
      setBusy(true);
      setPlaying(i);
      audio.flip();
      await sleep(520);
      if (token.current !== my) return;
      const n = play(St, i);
      audio.play(n.lastCard.tone !== "bad");
      setPlaying(-1);
      setSel(-1);
      setDealt(n.hand.length);
      commit(n, { fx: n.lastCard.fx });
      setToast({ ...n.lastCard, key: Date.now() });
      reactToCard(id, n.lastCard);
      setBusy(false);
    },
    [commit, reactToCard, setBusy],
  );

  const onCardClick = useCallback(
    (i) => {
      const St = SRef.current;
      if (!St || St.phase !== "play" || busyRef.current) return;
      audio.click();
      if (sel === i) playIndex(i);
      else setSel(i);
    },
    [playIndex, sel],
  );

  const toEvent = useCallback(async () => {
    const St = SRef.current;
    if (!St || St.phase !== "play" || busyRef.current) return;
    const my = token.current;
    setBusy(true);
    setSel(-1);
    setToast(null);
    const n = endPlay(St);
    commit(n, { fx: n.eventPre });
    setRevealed(false);
    if (n.phase === "dead") {
      setBusy(false);
      return;
    }
    await worldRef.current?.cue(dayOf(n.day).scene);
    if (token.current !== my) return;
    setBusy(false);
    setRevealed(true);
  }, [commit, setBusy]);

  const OUTCOME_CUE = { 9: { fight: "nightBreach", lock: "nightHeld", hide: "nightQuiet" }, 13: { fight: "creatureFight", flee: "creatureFlee", lure: "creatureLure" } };
  const onChoose = useCallback(
    async (cid) => {
      const St = SRef.current;
      if (!St || St.phase !== "event" || busyRef.current) return;
      const c = dayOf(St.day).choices.find((x) => x.id === cid);
      if (!c || !choiceState(St, c).ok) return;
      audio.click();
      const n = choose(St, cid);
      commit(n, { fx: n.lastEvent.fx });
      const w = worldRef.current;
      const cueName = OUTCOME_CUE[St.day]?.[cid];
      if (cueName) w?.cue(cueName);
      else if (n.lastEvent.fx?.hp < 0) w?.cue("hurt");
      // persistent consequences show up in the bunker right away
      w?.setPersistent(persistentOf(n));
      w?.setMood(moodOf(n));
      if (St.day === 9) w?.cue("intruderGone");
      if (n.phase === "won") {
        audio.rescueChord();
        w?.cue("escape");
      }
      if (St.day === 4) {
        if (cid === "repair") audio.powerUp();
        else audio.generator(false);
      }
      if (St.day === 7) audio.static(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  const onNightFall = useCallback(async () => {
    const St = SRef.current;
    if (!St || St.phase !== "aftermath" || busyRef.current) return;
    const my = token.current;
    setBusy(true);
    const w = worldRef.current;
    w?.reset(moodOf(St));
    w?.setPersistent(persistentOf(St));
    w?.setMood({ power: Math.min(0.35, moodOf(St).power) });
    w?.focus("door", 2.2);
    audio.heartbeat(2);
    await sleep(1500);
    if (token.current !== my) return;
    const n = night(St);
    commit(n, { fx: n.night.fx });
    await w?.cue({ quiet: "nightQuiet", held: "nightHeld", breach: "nightBreach" }[n.night.kind]);
    if (token.current !== my) return;
    setBusy(false);
  }, [commit, setBusy]);

  const onNextDay = useCallback(() => {
    const St = SRef.current;
    if (!St || St.phase !== "dusk" || busyRef.current) return;
    const n = next(St);
    dawnRef.current = n;
    commit(n, { fx: n.report?.fx });
    enterDay(n);
    if (n.phase === "dawn") audio.gain();
  }, [commit, enterDay]);

  // the run ended: count rescues
  useEffect(() => {
    if (S?.phase === "won" && !S.counted) {
      const w = (readJSON(WINS_KEY) || 0) + 1;
      writeJSON(WINS_KEY, w);
      setWins(w);
      SRef.current = { ...S, counted: true };
    }
    if (S?.phase === "dead") {
      audio.sting();
      worldRef.current?.flash(0.4, 0, 0, 0.8);
    }
  }, [S]);

  // GamePlayer restart → retry the current day from its dawn
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current === "game" && dawnRef.current) restartDay();
  }, [restartSignal, restartDay]);

  /* ------------------------------------------------------------ keys */
  useEffect(() => {
    const onKey = (e) => {
      if (screenRef.current !== "game") return;
      const St = SRef.current;
      if (!St) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOverlay((o) => (o ? null : "pause"));
        return;
      }
      if (overlay) return;
      const k = e.key;
      if (St.phase === "play" && ["1", "2", "3"].includes(k)) {
        const i = +k - 1;
        if (i < St.hand.length) onCardClick(i);
      } else if (St.phase === "event" && revealed && /^[1-4]$/.test(k)) {
        const c = dayOf(St.day).choices[+k - 1];
        if (c) onChoose(c.id);
      } else if (k === "Enter") {
        if (St.phase === "dawn") onDraw();
        else if (St.phase === "play") {
          if (sel >= 0) playIndex(sel);
          else toEvent();
        } else if (St.phase === "aftermath") onNightFall();
        else if (St.phase === "dusk") onNextDay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, revealed, sel, onCardClick, onChoose, onDraw, playIndex, toEvent, onNightFall, onNextDay]);

  /* ------------------------------------------------------------ test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dds = {
      get S() {
        return SRef.current;
      },
      get screen() {
        return screenRef.current;
      },
      get busy() {
        return busyRef.current;
      },
      get revealed() {
        return revealed;
      },
      world: () => worldRef.current,
      start: startNew,
      cont: onContinue,
      draw: onDraw,
      play: playIndex,
      toEvent,
      choose: onChoose,
      nightFall: onNightFall,
      nextDay: onNextDay,
      restartDay,
      toMenu,
      set(St) {
        commit(St);
      },
    };
    return undefined;
  });

  /* ------------------------------------------------------------ render */
  const art = (key) => (artRef.current ? artRef.current(key) : null);
  const inGame = screen === "game" && S;
  const D = S ? dayOf(S.day) : null;

  return (
    <div className={`dds ${inGame ? "ingame" : ""} ${S?.phase === "dead" ? "is-dead" : ""}`} onPointerMove={onPointerMove}>
      <div className="dds-stage" ref={stageRef} />
      <div className="dds-grain" />

      {webglError && (
        <div className="dds-modal">
          <div className="dds-panel narrow">
            <h2>3D graphics unavailable</h2>
            <p>Dead Draw needs WebGL. Please enable hardware acceleration or try another browser.</p>
          </div>
        </div>
      )}

      {!webglError && screen === "boot" && <Loading p={loadP} />}

      {screen === "menu" && !overlay && (
        <MainMenu
          canContinue={!!save}
          saveDay={save?.S.phase === "dead" ? save.dawn.day : save?.S.day}
          best={wins}
          onNew={onNew}
          onContinue={onContinue}
          onHelp={() => setOverlay("help")}
          onSettings={() => setOverlay("settings")}
        />
      )}

      {inGame && (
        <>
          <Hud S={S} pulse={pulse} onPause={() => setOverlay("pause")} showActions={S.phase === "play"} />

          {S.phase === "dawn" && <Dawn S={S} onDraw={onDraw} tutorial={S.day === 1} />}

          {S.phase === "play" && (
            <>
              <div className="dds-hand">
                {S.hand.map((id, i) => {
                  const ok = cardPlayable(S, id);
                  return (
                    <div key={`${S.day}-${S.played.length}-${i}-${id}`} className={`dds-slot ${i < dealt ? "shown" : ""} ${playing === i ? "playing" : ""}`} style={{ "--i": i, "--n": S.hand.length, "--o": Math.abs(i - (S.hand.length - 1) / 2) }}>
                      <Card id={id} art={art(CARDS[id].art)} playable={ok} selected={sel === i} onClick={() => onCardClick(i)} have={S.res} deal={i} />
                      {sel === i && (
                        <div className="dds-slot-act">
                          {ok ? (
                            <button type="button" className="dds-btn primary small" onClick={() => playIndex(i)}>
                              Play card
                            </button>
                          ) : (
                            <span className="dds-req">{S.actions <= 0 ? "No actions left" : canPay(S, CARDS[id].cost) ? "Can't play now" : "Not enough resources"}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="dds-side">
                <NightForecast S={S} />
                <button type="button" className="dds-btn primary" onClick={toEvent} disabled={busy}>
                  {S.actions > 0 && S.hand.length > 0 ? "End actions" : "Face the day's event"}
                </button>
                {S.day === 1 && S.played.length === 0 && <p className="dds-hint">Click a card to inspect it, click again (or press Play card) to play it. Each card costs the resources in its corner.</p>}
              </div>
              {toast && (
                <div key={toast.key} className={`dds-toast tone-${toast.tone}`}>
                  <b>{CARDS[toast.id].name}</b>
                  <p>{toast.text}</p>
                  <FxChips fx={toast.fx} />
                </div>
              )}
            </>
          )}

          {S.phase === "event" && <EventPanel S={S} onChoose={onChoose} revealed={revealed} />}

          {S.phase === "aftermath" && S.lastEvent && (
            <Outcome title={D.title} text={S.lastEvent.text} tone={S.lastEvent.tone} fx={S.lastEvent.fx} onNext={onNightFall} nextLabel={busy ? "Night falls…" : "Night falls"} />
          )}

          {S.phase === "dusk" && S.night && !busy && <Night S={S} onNext={onNextDay} />}

          {S.phase === "won" && !showEnding && S.lastEvent && <Outcome title={D.title} text={S.lastEvent.text} tone="good" fx={S.lastEvent.fx} onNext={() => setShowEnding(true)} nextLabel="Climb out" />}
          {S.phase === "won" && showEnding && <Ending S={S} onMenu={toMenu} onNew={startNew} />}

          {S.phase === "dead" && <GameOver S={S} deathKey={deathOf(S)} onRetry={startNew} onRestartDay={restartDay} onMenu={toMenu} />}
        </>
      )}

      {overlay === "help" && <Help onClose={() => setOverlay(screen === "game" ? "pause" : null)} />}
      {overlay === "settings" && <Settings settings={settings} set={setSetting} qualityNow={qualityNow} onClose={() => setOverlay(screen === "game" ? "pause" : null)} />}
      {overlay === "pause" && <Pause onResume={() => setOverlay(null)} onHelp={() => setOverlay("help")} onSettings={() => setOverlay("settings")} onMenu={toMenu} />}
      {overlay === "confirm" && (
        <ConfirmNew
          onYes={() => {
            setOverlay(null);
            startNew();
          }}
          onNo={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
