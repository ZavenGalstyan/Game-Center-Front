/**
 * Motel 6: Last Guest — psychological horror desk sim (Horror / Simulation /
 * Puzzle / Strategy). Seven night shifts at a roadside motel: inspect each
 * guest's ID, reservation, room, answers and CCTV against a growing rulebook,
 * then ACCEPT or REJECT. Between guests, walk the lobby, hallway and storage
 * room for evidence. The last guest arrives on Halloween.
 *
 * Architecture: engine.js (pure state machine, saved verbatim) · guests.js /
 * data.js (deterministic content) · scene.js (plain Three.js motel) · Panels /
 * Screens (React UI). One rAF loop drives the world; React state only changes
 * on game events. `restartSignal` restarts the current night, `muted` silences
 * audio. DEV hook: `?m6test=1` (+`&nosave=1`) → window.__m6, no rAF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Motel6LastGuest.css";
import { createWorld } from "./scene.js";
import { audio } from "./audio.js";
import * as E from "./engine.js";
import { GUESTS } from "./guests.js";
import { NIGHTS, CALLS, NOTES, SAVE_KEY, SETTINGS_KEY, RECORDS_KEY, RESIDENT_PLATES, CRITICAL, FAIL_SUSPICION, rulesForNight } from "./data.js";
import { portraitURL } from "./portrait.js";
import { Icon, IdCard, Terminal, RoomBoard, Questions, Rulebook, EvidenceLog, DocViewer, Keypad, CCTVOverlay } from "./Panels.jsx";
import { MainMenu, NightIntro, Summary, Failed, Pause, EndingScreen } from "./Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("m6test");
const NOSAVE = TEST && PARAMS.has("nosave");
const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || PARAMS.has("m6touch"));
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
const CAR_COLORS = [0x6a6f78, 0x3a4a62, 0x6a2a24, 0x2f4a36, 0x8a8170, 0x232428];

function store(key, val) {
  if (NOSAVE) return;
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage blocked — the game still plays */
  }
}
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
const readSave = () => (NOSAVE ? null : E.sanitize(load(SAVE_KEY)));
const readRecords = () => E.sanitizeRecords(NOSAVE ? null : load(RECORDS_KEY));
function loadSettings() {
  const s = load(SETTINGS_KEY) || {};
  return {
    volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : 0.8,
    sens: Number.isFinite(s.sens) ? Math.min(2.5, Math.max(0.3, s.sens)) : 1,
    scares: s.scares === "reduced" ? "reduced" : "full",
    hints: s.hints !== false,
  };
}
const stepKey = (s) => `${s.night}|${s.step}|${s.queue.length}|${s.queue[0] ? JSON.stringify(s.queue[0]) : ""}|${s.phase}`;
const hexColor = (h) => parseInt(h.slice(1), 16);
const AREA = { lobby: "Reception", hallway: "Hallway — Rooms 1–12", storage: "Storage room" };

/* ================================================================== component */
export default function Motel6LastGuest({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);

  const [screen, setScreenS] = useState("menu"); // menu | game | ending
  const [menuView, setMenuView] = useState("main");
  const [save, setSave] = useState(readSave);
  const [records, setRecords] = useState(readRecords);
  const [settings, setSettingsS] = useState(loadSettings);
  const [gs, setGsS] = useState(null);
  const [mode, setModeS] = useState("desk"); // desk | walk | cctv
  const [panel, setPanelS] = useState(null);
  const [idOpen, setIdOpen] = useState(false);
  const [enc, setEncS] = useState(null);
  const [call, setCallS] = useState(null);
  const [note, setNote] = useState(null);
  const [doc, setDoc] = useState(null);
  const [keypad, setKeypad] = useState(false);
  const [paused, setPausedS] = useState(false);
  const [pauseView, setPauseView] = useState("main");
  const [cam, setCamS] = useState(0);
  const [still, setStill] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [sub, setSub] = useState(null);
  const [scare, setScare] = useState(false);
  const [shake, setShake] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [stamp, setStamp] = useState(null);
  const [cinema, setCinema] = useState(null);
  const [glitch, setGlitch] = useState(false);
  const [faceGlitch, setFaceGlitch] = useState(false);

  const screenRef = useRef(screen), gsRef = useRef(gs), modeRef = useRef(mode), encRef = useRef(enc), callRef = useRef(call), pausedRef = useRef(paused), settingsRef = useRef(settings), camRef = useRef(cam);
  const modalRef = useRef(false);
  const runKey = useRef(null);
  const stills = useRef({});
  const keys = useRef(new Set());
  const look = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const joy = useRef({ x: 0, y: 0 });
  const targetRef = useRef(null);
  const promptRef = useRef(null);
  const areaRef = useRef(null);
  const timers = useRef(new Set());
  const amb = useRef({ lightning: 30, flicker: 40, hall: 50 });

  const setScreen = (s) => { screenRef.current = s; setScreenS(s); };
  const setGs = (s) => { gsRef.current = s; setGsS(s); };
  const setMode = (m) => { modeRef.current = m; setModeS(m); };
  const setEnc = (e) => { encRef.current = e; setEncS(e); };
  const setCall = (c) => { callRef.current = c; setCallS(c); };
  const setPaused = (p) => { pausedRef.current = p; setPausedS(p); };
  const setCam = (c) => { camRef.current = c; setCamS(c); worldRef.current?.setCCTV(c); };
  const setPanel = setPanelS;
  settingsRef.current = settings;
  modalRef.current = !!(doc || keypad || note || rejecting);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };
  const tid = useRef(0);
  const toast = useCallback((text, kind = "info", ms = 3600) => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    later(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, [later]);
  const subtitle = useCallback((text, ms = 4200) => {
    const id = ++tid.current;
    setSub({ id, text });
    later(() => setSub((s) => (s && s.id === id ? null : s)), ms);
  }, [later]);

  /* ------------------------------------------------------------ saving */
  const commit = useCallback((s) => {
    setGs(s);
    store(SAVE_KEY, s);
    setSave(s);
    if (s && s.reached) {
      setRecords((r) => {
        if (r.best >= s.reached) return r;
        const n = { ...r, best: s.reached };
        store(RECORDS_KEY, n);
        return n;
      });
    }
  }, []);
  const unlockEnding = (id) => {
    setRecords((r) => {
      const n = { ...r, endings: r.endings.includes(id) ? r.endings : [...r.endings, id], runs: r.runs + 1 };
      store(RECORDS_KEY, n);
      return n;
    });
  };
  const updateSettings = (patch) => {
    setSettingsS((s) => {
      const n = { ...s, ...patch };
      store(SETTINGS_KEY, n);
      return n;
    });
  };

  /* ------------------------------------------------------------ UI reset */
  const resetUI = useCallback(() => {
    clearTimers();
    runKey.current = null;
    setEnc(null);
    setCall(null);
    audio.ring(false);
    worldRef.current?.setPhoneRinging(false);
    setNote(null);
    setPanel(null);
    setIdOpen(false);
    setRejecting(false);
    setKeypad(false);
    setDoc(null);
    setStill(null);
    setCinema(null);
    setStamp(null);
    setScare(false);
    setMode("desk");
    keys.current.clear();
    const w = worldRef.current;
    if (w) {
      w.clearGuest();
      w.setGuestCar(null);
      w.setView("desk");
    }
  }, []);

  /* ------------------------------------------------------------ flow: menu */
  const startGame = (s) => {
    audio.unlock();
    resetUI();
    const st = s.phase === "play" ? { ...s, phase: "intro" } : s;
    commit(st);
    setScreen(st.phase === "ended" ? "ending" : "game");
    setPaused(false);
    worldRef.current?.setView("desk");
  };
  const newGame = () => {
    setMenuView("main");
    startGame(E.newGame());
  };
  const continueGame = () => {
    const s = readSave() || save;
    if (s) startGame(s);
  };
  const playNight = (n) => {
    const s = save && E.restartNight(save, n);
    if (s) {
      setMenuView("main");
      startGame(s);
    }
  };
  const toMenu = () => {
    resetUI();
    setPaused(false);
    setScreen("menu");
    setMenuView("main");
    worldRef.current?.setView("menu");
    worldRef.current?.setPower(true);
  };
  const beginShift = () => {
    audio.unlock();
    resetUI();
    commit(E.beginShift(gsRef.current));
  };
  const restartNight = () => {
    if (!gsRef.current) return;
    resetUI();
    setPaused(false);
    commit(E.restartNight(gsRef.current));
    setScreen("game");
  };

  /* ------------------------------------------------------------ flow: steps */
  const runFx = useCallback((fx) => {
    const w = worldRef.current;
    const full = settingsRef.current.scares === "full";
    switch (fx) {
      case "flicker": w?.flicker(1.6); audio.flicker(); break;
      case "knock": audio.knock(3); subtitle("*knock — knock — knock* … from the hallway."); break;
      case "knock13": audio.knock(4, true); later(() => audio.knock(4, true), 1800); subtitle("Knocking from the end of the hallway — where there is no door."); break;
      case "whispers": audio.whisper(); subtitle("Whispering behind the storage door. It says your name, then the date: October thirty-first."); break;
      case "outage": audio.powerDown(); subtitle("The power dies. Red emergency lights flicker on."); break;
      case "door13": audio.static(0.6); setGlitch(true); later(() => setGlitch(false), 700); toast("CAM 3 is glitching. Something is wrong in the hallway.", "warn", 5000); break;
      case "dorsey": audio.static(0.4); subtitle("The Room Board blinks: Room 5 — NOT RESPONDING."); break;
      case "vanish": if (gsRef.current?.decisions?.n4_brooks?.d === "accept") { audio.knock(2, true); subtitle("Room 4 — Elena Brooks — isn't answering either. Her door is open."); } break;
      case "incident": audio.alarm(); toast("Security incident: a room reports a break-in. Someone you let in wasn't who they said.", "bad", 5200); break;
      case "scare_window":
        if (modeRef.current === "desk") w?.scareWindow();
        audio.sting();
        setShake(true);
        later(() => setShake(false), 500);
        break;
      case "scare_face":
        audio.sting();
        if (full) { setScare(true); later(() => setScare(false), 650); }
        w?.flicker(0.8);
        break;
      default: break;
    }
  }, [later, subtitle, toast]);

  useEffect(() => {
    if (screen !== "game" || !gs || gs.phase !== "play" || paused) return;
    const st = E.currentStep(gs);
    if (!st) return;
    const key = stepKey(gs);
    if (runKey.current === key) return;
    runKey.current = key;
    if (st.t === "call") {
      setCall({ id: st.id, idx: -1 });
      audio.ring(true);
      worldRef.current?.setPhoneRinging(true);
    } else if (st.t === "note") {
      setNote(st.id);
    } else if (st.t === "fx") {
      runFx(st.fx);
      later(() => {
        const cur = gsRef.current;
        if (cur && stepKey(cur) === key) commit(E.applyFx(cur, st.fx));
      }, 1200);
    } else if (st.t === "task") {
      if (gs.flags[st.flag]) commit(E.settleTask(gs));
      else toast(st.objective, "warn", 5200);
    } else if (st.t === "guest" || st.t === "final") {
      setEnc({ id: st.id, final: st.t === "final", phase: "waiting", asked: {}, uv: false, opened: {}, t: 0, shifted: false, line: null, tutorial: !!st.tutorial });
    }
  }, [gs, screen, paused, commit, later, runFx, toast]);

  /* ------------------------------------------------------------ phone */
  const answerCall = () => {
    const c = callRef.current;
    if (!c || c.idx >= 0) return;
    audio.ring(false);
    worldRef.current?.setPhoneRinging(false);
    audio.pickup();
    audio.voice(CALLS[c.id].eerie);
    setCall({ ...c, idx: 0 });
  };
  const nextLine = () => {
    const c = callRef.current;
    if (!c) return;
    if (c.idx < 0) return answerCall();
    const lines = CALLS[c.id].lines;
    if (c.idx + 1 < lines.length) {
      audio.voice(CALLS[c.id].eerie);
      setCall({ ...c, idx: c.idx + 1 });
      return;
    }
    setCall(null);
    audio.pickup();
    const cur = gsRef.current;
    const st = cur && E.currentStep(cur);
    if (st && st.t === "call" && st.id === c.id) commit(E.completeStep(cur));
  };
  const closeNote = () => {
    setNote(null);
    const cur = gsRef.current;
    const st = cur && E.currentStep(cur);
    if (st && st.t === "note") commit(E.completeStep(cur));
  };

  /* ------------------------------------------------------------ guests */
  const guest = enc ? GUESTS[enc.id] : null;
  const power = gs ? !!gs.flags.power : true;
  const callGuest = () => {
    const e = encRef.current;
    const w = worldRef.current;
    if (!e || e.phase !== "waiting" || !gsRef.current?.flags.power || !w) return;
    if (modeRef.current !== "desk") toDesk();
    const g = GUESTS[e.id];
    w.setGuestCar(g.car ? { plate: g.car, color: hexColor(g.carColor) } : null);
    w.spawnGuest(g.face, g.cctv, { mood: g.mood, seed: g.id });
    audio.door();
    setEnc({ ...e, phase: "arriving" });
  };
  const markOpened = (k) => {
    const e = encRef.current;
    if (e && !e.opened[k]) setEnc({ ...e, opened: { ...e.opened, [k]: true } });
  };
  const togglePanel = (p) => {
    audio.paper();
    setPanel((cur) => (cur === p ? null : p));
    markOpened(p);
  };
  const toggleId = () => {
    if (!encRef.current || encRef.current.phase !== "talk") return;
    audio.paper();
    setIdOpen((v) => !v);
    markOpened("id");
  };
  const ask = (q) => {
    const e = encRef.current;
    if (!e || e.phase !== "talk") return;
    const g = GUESTS[e.id];
    audio.voice(false);
    setEnc({ ...e, asked: { ...e.asked, [q]: true }, line: E.answerFor(g, q) });
  };
  const toggleUV = () => {
    const e = encRef.current;
    if (!e) return;
    audio.beep();
    setEnc({ ...e, uv: !e.uv });
  };
  const decideNow = (d, reason = null) => {
    const e = encRef.current;
    if (!e || e.phase !== "talk" || e.final) return;
    const g = GUESTS[e.id];
    const { state, result } = E.decide(gsRef.current, e.id, d, reason);
    audio.stamp(d === "accept");
    setStamp(d);
    later(() => setStamp(null), 1100);
    setRejecting(false);
    setPanel(null);
    setIdOpen(false);
    setEnc({ ...e, phase: "leaving", line: d === "accept" ? g.lines.accept || "Thank you." : g.lines.reject || "Fine.", pending: state, result });
    worldRef.current?.guestLeave(d === "accept");
    if (result.cited && result.truth === "forger") toast(`ID kept as evidence: ${g.doc.name}.`, "good");
    // safety net: if the guest never finishes walking (hidden tab etc.) the decision still commits
    later(() => { if (encRef.current?.id === e.id) finishLeave(); }, 9000);
  };
  const finishLeave = () => {
    const e = encRef.current;
    if (!e || e.phase !== "leaving") return;
    worldRef.current?.clearGuest();
    worldRef.current?.setGuestCar(null);
    setEnc(null);
    if (e.pending) commit(e.pending);
  };
  const finalDecision = (choice) => {
    const e = encRef.current;
    if (!e || e.phase !== "talk" || !e.final) return;
    const s = E.decideFinal(gsRef.current, choice);
    const w = worldRef.current;
    setPanel(null);
    setIdOpen(false);
    setRejecting(false);
    setEnc({ ...e, phase: "finale", line: choice === "accept" ? GUESTS.n7_voss.lines.accept : choice === "reject" ? GUESTS.n7_voss.lines.reject : "(you open the 1979 register and start to write)" });
    setCinema(s.ending);
    audio.stamp(choice !== "accept");
    if (s.ending === "bad") {
      w?.guestLeave(true);
      later(() => { w?.setPower(false); audio.powerDown(); }, 1600);
      later(() => { audio.sting(); if (settingsRef.current.scares === "full") setScare(true); }, 3000);
      later(() => setScare(false), 3700);
    } else if (s.ending === "good") {
      w?.guestLeave(false);
      later(() => { w?.lightning(); audio.knock(1, true); }, 2400);
    } else {
      later(() => { w?.flicker(2); audio.whisper(); }, 900);
      later(() => audio.powerUp(), 2600);
    }
    later(() => {
      unlockEnding(s.ending);
      commit(s);
      resetUI();
      setScreen("ending");
    }, 4600);
  };

  /* ------------------------------------------------------------ exploring */
  const canExplore = !enc || enc.phase === "waiting";
  const toDesk = () => {
    setMode("desk");
    worldRef.current?.setView("desk");
  };
  const toggleExplore = () => {
    if (modeRef.current === "walk") return toDesk();
    if (modeRef.current === "cctv") return;
    const e = encRef.current;
    if (e && e.phase !== "waiting") return;
    setPanel(null);
    setIdOpen(false);
    setMode("walk");
    worldRef.current?.setView("walk");
  };
  const doInteract = (id) => {
    const cur = gsRef.current;
    if (!cur || !id) return;
    const wasPower = cur.flags.power;
    const r = E.interact(cur, id);
    if (r.keypad) {
      setKeypad(true);
      return;
    }
    if (r.msg) subtitle(r.msg, 5200);
    if (id === "breaker" && !wasPower && r.state.flags.power) {
      audio.powerUp();
      if (r.state.flags.uv && !cur.flags.uv) toast("UV lamp added to the desk. Use it on every ID.", "good", 5200);
    }
    if (r.got) {
      audio.pickup();
      setDoc({ id: r.got });
    }
    if (r.state !== cur) commit(r.state);
  };
  const tryCode = (code) => {
    const r = E.tryLockbox(gsRef.current, code);
    if (!r.ok) {
      audio.buzz();
      return false;
    }
    audio.pickup();
    commit(r.state);
    setKeypad(false);
    setDoc({ id: r.got });
    return true;
  };

  /* ------------------------------------------------------------ CCTV */
  const openCCTV = () => {
    if (modeRef.current === "walk") return;
    audio.static(0.25);
    setPanel(null);
    setMode("cctv");
    worldRef.current?.setCCTV(camRef.current);
    worldRef.current?.setView("cctv");
    markOpened("cctv");
  };
  const exitCCTV = () => {
    setStill(null);
    toDesk();
  };
  const switchCam = (i) => {
    audio.static(0.18);
    setStill(null);
    setCam(i);
  };
  const doCapture = () => {
    const cur = gsRef.current;
    const w = worldRef.current;
    if (!cur || !w || !cur.flags.power) return;
    audio.beep();
    const url = w.captureStill(camRef.current);
    setStill(url);
    const r = E.capture(cur, camRef.current + 1);
    toast(r.msg, r.got ? "good" : "info");
    if (r.got) {
      stills.current[r.got] = url;
      commit(r.state);
      audio.sting();
      later(() => setDoc({ id: r.got }), 900);
    }
  };

  // the guest's lips move while their line is on screen
  useEffect(() => {
    if (enc?.line && (enc.phase === "talk" || enc.phase === "leaving")) worldRef.current?.guestTalk(Math.min(3.2, 0.6 + enc.line.length * 0.035));
  }, [enc?.line, enc?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ restart / mute */
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current === "game" && gsRef.current) restartNight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);

  /* ------------------------------------------------------------ world sync */
  const prevPower = useRef(true);
  const lotKey = useRef("");
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    if (!gs || screen === "menu") {
      if (!prevPower.current) w.setPower(true);
      prevPower.current = true;
      w.setProps({ key5: false, diary: false, door13: false });
      const k = "menu";
      if (lotKey.current !== k) {
        lotKey.current = k;
        w.setLot([{ plate: "NE 1RD-440", color: CAR_COLORS[0] }, { plate: "KS 7TG-902", color: CAR_COLORS[2] }]);
      }
      return;
    }
    if (prevPower.current !== gs.flags.power && !cinema) {
      w.setPower(gs.flags.power);
      prevPower.current = gs.flags.power;
    }
    const st = E.currentStep(gs);
    w.setProps({ key5: E.propVisible(gs, "key5"), diary: E.propVisible(gs, "diary"), door13: !!gs.flags["n:door13"] || st?.t === "final" });
    const cars = (RESIDENT_PLATES[gs.night] || []).map((p, i) => ({ plate: p, color: CAR_COLORS[(i + gs.night) % CAR_COLORS.length] }));
    for (const [id, d] of Object.entries(gs.decisions)) {
      const g = GUESTS[id];
      if (g && g.night === gs.night && d.d === "accept" && g.car) cars.push({ plate: g.car, color: hexColor(g.carColor) });
    }
    const k = gs.night + ":" + cars.map((c) => c.plate).join(",");
    if (lotKey.current !== k) {
      lotKey.current = k;
      w.setLot(cars);
    }
    const clock = E.clockFor(gs.night, gs.step);
    const [hm, ap] = clock.split(" ");
    const [h, m] = hm.split(":").map(Number);
    w.setClock(ap === "PM" ? h : h, m);
  }, [gs, screen, cinema]);
  // CRT shows the current lookup
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    if (!guest || !enc || enc.phase === "waiting" || enc.phase === "arriving") {
      w.setTerminal(["ROUTE 6 MOTOR LODGE", "RESERVATION SYSTEM v2.3", "", gs ? `NIGHT AUDIT  ${E.fmtDate(NIGHTS[gs.night].date)}` : "", "", "> READY_"]);
      return;
    }
    const r = guest.res;
    w.setTerminal(["ROUTE 6 MOTOR LODGE", `> SEARCH ${guest.doc.name.toUpperCase()}`, "", ...(r ? [`GUEST  ${r.name.toUpperCase()}`, `IN     ${E.fmtDate(r.checkIn)}`, `ROOM   ${r.room}`, `ID     ****${r.idLast4}`, `CODE   ${r.code}`] : ["NO RECORD FOUND"]), "", "> _"]);
  }, [guest, enc?.phase, gs?.night]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ per-frame tick */
  const tickRef = useRef(null);
  tickRef.current = (dt) => {
    const w = worldRef.current;
    if (!w) return;
    const scr = screenRef.current;
    const s = gsRef.current;
    const e = encRef.current;
    // guest arrival / departure
    if (e && e.phase === "arriving" && w.guestState() === "idle") {
      audio.bell();
      setEnc({ ...e, phase: "talk", line: GUESTS[e.id].lines.greet || "Evening.", t: 0 });
    } else if (e && e.phase === "leaving" && !w.guestState()) finishLeave();
    // entity guests "change appearance" once, after you've looked closely
    if (e && e.phase === "talk" && !e.shifted && GUESTS[e.id].truth === "entity") {
      e.t += dt;
      if (e.t > 7 && Object.keys(e.opened).length >= 2) {
        e.shifted = true;
        w.guestShift(0.3);
        audio.static(0.2);
        setFaceGlitch(true);
        later(() => setFaceGlitch(false), 450);
      }
    }
    // interaction prompt
    if (modeRef.current === "walk") {
      const t = w.target();
      targetRef.current = t;
      if (promptRef.current) {
        promptRef.current.textContent = t ? `${TOUCH ? "Tap USE" : "E / click"} — ${t.label}` : "";
        promptRef.current.style.opacity = t ? "1" : "0";
      }
      if (areaRef.current) areaRef.current.textContent = AREA[w.area()] || "";
    }
    // ambience + random atmosphere (never during cinematics/menus' UI)
    const inPlay = scr === "game" && s && s.phase === "play" && !pausedRef.current;
    const dread = s ? s.stats.suspicion / FAIL_SUSPICION : 0;
    audio.ambience({ outside: scr === "menu" ? 1 : 0.15, power: s ? !!s.flags.power || scr !== "game" : true, dread: scr === "game" ? dread : 0.1 });
    const a = amb.current;
    a.lightning -= dt;
    if (a.lightning <= 0) {
      a.lightning = 35 + Math.random() * 50;
      w.lightning();
      later(() => audio.knock(1, true), 1200);
    }
    if (inPlay) {
      a.flicker -= dt;
      a.hall -= dt * (0.4 + dread * 1.6);
      if (a.flicker <= 0) {
        a.flicker = 30 + Math.random() * 45;
        w.flicker(0.5 + Math.random() * 0.6);
        audio.flicker();
      }
      if (a.hall <= 0) {
        a.hall = 50 + Math.random() * 40;
        if (dread > 0.25) audio.knock(2, true);
        else audio.step(true);
      }
    }
  };
  const buildInput = () => {
    const k = keys.current;
    const l = look.current;
    const inp = {
      fwd: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + -joy.current.y,
      strafe: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + joy.current.x,
      turn: (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      lookX: l.x, lookY: l.y, px: l.px, py: l.py, sens: settingsRef.current.sens,
    };
    l.x = 0;
    l.y = 0;
    if (pausedRef.current || modalRef.current || modeRef.current !== "walk") { inp.fwd = 0; inp.strafe = 0; inp.turn = 0; }
    return inp;
  };

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const host = stageRef.current;
    const world = createWorld(host, { test: TEST });
    worldRef.current = world;
    world.setView("menu");
    world.onStep((surf) => audio.step(surf === "carpet"));
    const fit = () => world.resize(host.clientWidth, host.clientHeight);
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(host);
    window.addEventListener("resize", fit);
    const step = (dt) => {
      tickRef.current?.(dt);
      world.update(dt, buildInput());
      world.render();
    };
    let raf = 0, last = performance.now();
    if (!TEST) {
      const loop = (t) => {
        raf = requestAnimationFrame(loop);
        const dt = (t - last) / 1000;
        last = t;
        step(dt);
      };
      raf = requestAnimationFrame(loop);
    } else {
      window.__m6Advance = (frames = 1, dt = 1 / 60) => { for (let i = 0; i < frames; i++) step(dt); };
      window.__m6Fit = fit;
      step(0.016);
    }
    const vis = () => { if (document.hidden && screenRef.current === "game" && gsRef.current?.phase === "play" && !TEST) setPaused(true); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", vis);
      clearTimers();
      audio.ring(false);
      audio.stopAll();
      world.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ keyboard */
  useEffect(() => {
    const down = (ev) => {
      if (screenRef.current !== "game") return;
      const t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const root = rootRef.current;
      if (!root || !root.isConnected) return;
      const code = ev.code;
      if (MOVE_KEYS.has(code) && modeRef.current === "walk") ev.preventDefault();
      if (code === "Escape") {
        ev.preventDefault();
        if (pausedRef.current) return setPaused(false);
        if (modalRef.current) { setDoc(null); setKeypad(false); setRejecting(false); return; }
        if (modeRef.current === "cctv") return exitCCTV();
        if (panel || idOpen) { setPanel(null); setIdOpen(false); return; }
        setPauseView("main");
        return setPaused(true);
      }
      if (pausedRef.current || modalRef.current || ev.repeat && !MOVE_KEYS.has(code)) {
        if (modeRef.current === "walk" && MOVE_KEYS.has(code)) keys.current.add(code);
        return;
      }
      const s = gsRef.current;
      if (!s || s.phase !== "play") return;
      if (callRef.current && (code === "Space" || code === "Enter")) { ev.preventDefault(); return nextLine(); }
      const m = modeRef.current;
      if (m === "walk") {
        if (MOVE_KEYS.has(code)) keys.current.add(code);
        if (code === "KeyE") doInteract(targetRef.current?.id);
        if (code === "KeyF" || code === "Tab") { ev.preventDefault(); toDesk(); }
        return;
      }
      if (m === "cctv") {
        if (/^Digit[1-4]$/.test(code)) switchCam(Number(code.slice(5)) - 1);
        if (code === "Space") { ev.preventDefault(); doCapture(); }
        if (code === "KeyC") exitCCTV();
        return;
      }
      const map = { KeyT: "terminal", KeyB: "board", KeyQ: "questions", KeyR: "rules", KeyJ: "evidence" };
      if (map[code]) togglePanel(map[code]);
      if (code === "KeyI") toggleId();
      if (code === "KeyC") openCCTV();
      if (code === "KeyF") toggleExplore();
      if ((code === "Space" || code === "Enter") && encRef.current?.phase === "waiting") { ev.preventDefault(); callGuest(); }
    };
    const up = (ev) => keys.current.delete(ev.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  /* ------------------------------------------------------------ pointer */
  const drag = useRef(null);
  const onPointerDown = (ev) => {
    if (screenRef.current !== "game") return;
    drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: 0 };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
  };
  const onPointerMove = (ev) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (r && modeRef.current === "desk") {
      look.current.px = ((ev.clientX - r.left) / r.width) * 2 - 1;
      look.current.py = ((ev.clientY - r.top) / r.height) * 2 - 1;
    }
    const d = drag.current;
    if (!d || d.id !== ev.pointerId) return;
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    d.x = ev.clientX;
    d.y = ev.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (modeRef.current === "walk") {
      look.current.x += dx * (TOUCH ? 1.6 : 1);
      look.current.y += dy * (TOUCH ? 1.6 : 1);
    }
  };
  const onPointerUp = (ev) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== ev.pointerId) return;
    if (d.moved < 8 && modeRef.current === "walk" && !TOUCH) doInteract(targetRef.current?.id);
  };

  /* ------------------------------------------------------------ test hooks */
  useEffect(() => {
    if (!TEST) return;
    window.__m6 = {
      world: worldRef.current, E, GUESTS,
      gs: () => gsRef.current, enc: () => encRef.current, call: () => callRef.current, screen: () => screenRef.current, mode: () => modeRef.current,
      step: () => gsRef.current && E.currentStep(gsRef.current),
      advance: (n, dt) => window.__m6Advance(n, dt), fit: () => window.__m6Fit(),
      newGame, continueGame, beginShift, toMenu, restartNight, playNight, commit,
      answerCall, nextLine, closeNote, callGuest, ask, toggleId, togglePanel, toggleUV, decide: decideNow, finalDecision, setRejecting,
      toggleExplore, toDesk, doInteract, tryCode, openCCTV, exitCCTV, switchCam, doCapture, pause: setPaused,
      target: () => targetRef.current, keys: keys.current, look: look.current, setDoc, setNote,
    };
  });

  /* ------------------------------------------------------------ render */
  const night = gs ? NIGHTS[gs.night] : null;
  const st = gs && gs.phase === "play" ? E.currentStep(gs) : null;
  const task = st && st.t === "task" ? st : null;
  const board = useMemo(() => (gs ? E.boardFor(gs) : null), [gs]);
  const crit = gs ? E.criticalCount(gs) : 0;
  const talking = enc && enc.phase === "talk";
  const guestHere = enc && (enc.phase === "talk" || enc.phase === "arriving");
  const faceURL = useMemo(() => (guest ? portraitURL(guest.face, { id: "live" }) : null), [guest]);
  const voidURL = useMemo(() => (guest ? portraitURL(guest.face, { id: "void", variant: "void" }) : null), [guest]);
  const dread = gs ? gs.stats.suspicion / FAIL_SUSPICION : 0;

  const cctvInfo = (() => {
    if (!gs) return null;
    if (cam === 0) {
      if (!guestHere) return [{ text: "SUBJECTS AT DESK: 0" }];
      const f = guest.cctv;
      if (f === "absent") return [{ text: "SUBJECTS AT DESK: 0" }, { text: "CLERK: 1" }];
      if (f === "twisted" || f === "other") return [{ text: "SUBJECTS AT DESK: 1" }, { text: "FACE TRACKING: ERROR" }];
      return [{ text: "SUBJECTS AT DESK: 1" }, { text: "FACE TRACKING: OK" }];
    }
    if (cam === 1) {
      const plates = [...(RESIDENT_PLATES[gs.night] || [])];
      for (const [id, d] of Object.entries(gs.decisions)) {
        const g = GUESTS[id];
        if (g && g.night === gs.night && d.d === "accept" && g.car) plates.push(g.car);
      }
      if (guestHere && guest.car) plates.push(guest.car);
      return [{ text: "PLATE READER" }, ...(plates.length ? plates.map((p) => ({ text: `▸ ${p}` })) : [{ text: "NO VEHICLES" }])];
    }
    if (cam === 2) return [{ text: gs.flags["n:door13"] ? "MOTION: END OF HALL" : "MOTION: NONE" }, { text: gs.flags["n:missing5"] ? "ROOM 5: DOOR OPEN" : "DOORS: CLOSED" }];
    return [{ text: "TEMP: 41°F" }, { text: gs.flags.power ? "BREAKER: ON" : "BREAKER: TRIPPED" }];
  })();

  const tutorial = enc && enc.tutorial && settings.hints && talking;
  const rejectRules = gs ? rulesForNight(gs.night) : [];
  const modal = doc || keypad;

  return (
    <div
      ref={rootRef}
      className={`m6 m6--${screen} m6--${mode}${shake ? " is-shake" : ""}${!power && screen === "game" ? " is-dark" : ""}${cinema ? ` m6--cinema-${cinema}` : ""}${(panel || idOpen) && mode === "desk" ? " has-dock" : ""}`}
      style={{ "--dread": dread }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={stageRef}
        className="m6-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="m6-vignette" />
      <div className="m6-grain" />

      {/* ------------------------------------------------ menu */}
      {screen === "menu" && (
        <MainMenu view={menuView} setView={setMenuView} save={save} records={records} onContinue={continueGame} onNew={newGame} onNight={playNight} settings={settings} onSettings={updateSettings} />
      )}

      {/* ------------------------------------------------ game */}
      {screen === "game" && gs && (
        <>
          {mode === "cctv" && (
            <CCTVOverlay cam={cam} onCam={switchCam} onCapture={doCapture} onExit={exitCCTV} power={power} clock={`${E.fmtDate(night.date)} ${E.clockFor(gs.night, gs.step)}`} info={cctvInfo} still={still}
              glitch={glitch || (guestHere && cam === 0 && guest.cctv !== "normal")} />
          )}

          {/* top HUD */}
          <div className="m6-hud">
            <div className="m6-hud__night">
              <b>Night {gs.night}</b>
              <span>{E.clockFor(gs.night, gs.step)}</span>
            </div>
            <div className={`m6-hud__sus${dread > 0.6 ? " is-high" : ""}`} title="Suspicion — mistakes feed it. At 100% the motel keeps you.">
              <span>Suspicion</span>
              <i><em style={{ width: `${gs.stats.suspicion}%` }} /></i>
            </div>
            <div className="m6-hud__ev" title="Evidence collected">
              <Icon id="evidence" size={15} /> {gs.evidence.length} <small>· critical {crit}/{CRITICAL.length}</small>
            </div>
            <button type="button" className="m6-iconbtn" onClick={() => { setPauseView("main"); setPaused(true); }} aria-label="Pause"><Icon id="pause" /></button>
          </div>

          {/* objective / task */}
          {gs.phase === "play" && (task || (mode === "walk" && enc?.phase === "waiting")) && (
            <div className="m6-objective">{task ? task.objective : "The lobby is empty. Return to the desk (F) when you're ready for the next guest."}</div>
          )}

          {/* phone */}
          {call && call.idx < 0 && (
            <button type="button" className="m6-ring" onClick={answerCall}>
              <Icon id="phone" size={18} /> The phone is ringing — <b>Answer</b>
            </button>
          )}
          {call && call.idx >= 0 && (
            <div className={`m6-call${CALLS[call.id].eerie ? " is-eerie" : ""}`} onClick={nextLine} role="button" tabIndex={0}>
              <div className="m6-call__from"><Icon id="phone" size={15} /> {CALLS[call.id].from}</div>
              <p>{CALLS[call.id].lines[call.idx]}</p>
              <span className="m6-call__next">{call.idx + 1 < CALLS[call.id].lines.length ? "Next ▸" : "Hang up ▸"}</span>
            </div>
          )}

          {/* walk HUD */}
          {mode === "walk" && (
            <>
              <div className="m6-cross" />
              <div className="m6-prompt" ref={promptRef} />
              <div className="m6-area" ref={areaRef} />
              <div className="m6-walkbar">
                <button type="button" className="m6-btn" onClick={toDesk}><Icon id="desk" size={16} /> Back to desk <kbd>F</kbd></button>
              </div>
              {TOUCH && <TouchControls joy={joy} onUse={() => doInteract(targetRef.current?.id)} />}
            </>
          )}

          {/* desk */}
          {mode === "desk" && gs.phase === "play" && !cinema && (
            <>
              <div className="m6-tools">
                <ToolBtn id="id" label="ID" k="I" on={idOpen} disabled={!talking} onClick={toggleId} />
                <ToolBtn id="terminal" label="Terminal" k="T" on={panel === "terminal"} onClick={() => togglePanel("terminal")} />
                <ToolBtn id="board" label="Rooms" k="B" on={panel === "board"} onClick={() => togglePanel("board")} />
                <ToolBtn id="questions" label="Ask" k="Q" on={panel === "questions"} disabled={!talking} onClick={() => togglePanel("questions")} />
                <ToolBtn id="cctv" label="CCTV" k="C" onClick={openCCTV} />
                <ToolBtn id="rules" label="Rules" k="R" on={panel === "rules"} onClick={() => togglePanel("rules")} />
                <ToolBtn id="evidence" label="Evidence" k="J" on={panel === "evidence"} onClick={() => togglePanel("evidence")} />
                <ToolBtn id="walk" label="Explore" k="F" disabled={!canExplore} onClick={toggleExplore} />
              </div>

              {idOpen && talking && (
                <div className="m6-dock m6-dock--left">
                  <IdCard g={guest} night={gs.night} uvAvailable={!!gs.flags.uv} uv={enc.uv} onUV={toggleUV} />
                </div>
              )}
              {panel && (
                <div className="m6-dock m6-dock--right">
                  <div className="m6-panel">
                    <div className="m6-panel__head">
                      <Icon id={panel} size={16} />
                      <h3>{{ terminal: "Reservation terminal", board: "Room board", questions: "Questioning", rules: "Rulebook", evidence: "Evidence" }[panel]}</h3>
                      <button type="button" className="m6-iconbtn" onClick={() => setPanel(null)} aria-label="Close"><Icon id="x" size={15} /></button>
                    </div>
                    <div className="m6-panel__body">
                      {panel === "terminal" && <Terminal g={guestHere ? guest : null} night={gs.night} date={night.date} power={power} />}
                      {panel === "board" && <RoomBoard board={board} night={gs.night} />}
                      {panel === "questions" && <Questions g={talking ? guest : null} night={gs.night} asked={enc?.asked || {}} onAsk={ask} />}
                      {panel === "rules" && <Rulebook night={gs.night} />}
                      {panel === "evidence" && <EvidenceLog evidence={gs.evidence} confiscated={gs.confiscated} onOpen={(id) => setDoc({ id })} />}
                    </div>
                  </div>
                </div>
              )}

              {enc && enc.phase === "waiting" && !call && !task && (
                <div className="m6-next">
                  <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={callGuest} disabled={!power}>
                    <Icon id="bell" /> {enc.final ? "Headlights in the lot…" : "Next guest"} <kbd>Space</kbd>
                  </button>
                  <small>{power ? "The lobby is empty. Press F to explore first, if you dare." : "No power — the terminal is dead. Reset the breaker first."}</small>
                </div>
              )}
            </>
          )}

          {/* dialogue */}
          {enc && enc.line && (enc.phase === "talk" || enc.phase === "leaving" || enc.phase === "finale") && mode !== "walk" && (
            <div className={`m6-dialog${mode === "cctv" ? " is-cctv" : ""}`}>
              <img className={`m6-dialog__face${faceGlitch ? " is-glitch" : ""}`} src={faceGlitch ? voidURL : faceURL} alt="Guest" draggable={false} />
              <div className="m6-dialog__text">
                <span className="m6-dialog__who">Guest</span>
                <p>{enc.line}</p>
                {guest.behavior && enc.phase === "talk" && <em>{guest.behavior}</em>}
                {tutorial && (
                  <div className="m6-tut">
                    <b>First guest</b>
                    <span className={enc.opened.id ? "is-done" : ""}>1. Open the ID card <kbd>I</kbd> and compare its photo with the guest</span>
                    <span className={enc.opened.terminal ? "is-done" : ""}>2. Open the terminal <kbd>T</kbd> — name and dates must match</span>
                    <span>3. Stamp ACCEPT — or REJECT and cite the broken rule</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* decision */}
          {talking && mode === "desk" && !enc.final && (
            <div className="m6-decide">
              <button type="button" className="m6-stampbtn is-accept" onClick={() => decideNow("accept")}>ACCEPT</button>
              <button type="button" className="m6-stampbtn is-reject" onClick={() => setRejecting(true)}>REJECT</button>
            </div>
          )}
          {talking && mode === "desk" && enc.final && (
            <div className="m6-decide m6-decide--final">
              <p>Critical evidence <b>{crit}/{CRITICAL.length}</b></p>
              <button type="button" className="m6-stampbtn is-accept" onClick={() => finalDecision("accept")}>ACCEPT <small>Let her sign the register</small></button>
              <button type="button" className="m6-stampbtn is-reject" onClick={() => finalDecision("reject")}>REJECT <small>Turn her away</small></button>
              {crit === CRITICAL.length && (
                <button type="button" className="m6-stampbtn is-secret" onClick={() => finalDecision("name")}>WRITE HER TRUE NAME <small>in the 1979 register</small></button>
              )}
            </div>
          )}
          {rejecting && talking && (
            <div className="m6-modal" onClick={() => setRejecting(false)}>
              <div className="m6-reason" onClick={(e) => e.stopPropagation()}>
                <h3>Reason for rejection</h3>
                <p className="m6-dim">Cite the rule this guest broke.</p>
                <div className="m6-reason__list">
                  {rejectRules.map((r) => (
                    <button key={r.id} type="button" className="m6-btn" onClick={() => decideNow("reject", r.id)}>{r.title}</button>
                  ))}
                  <button type="button" className="m6-btn m6-btn--ghost" onClick={() => decideNow("reject", null)}>Just a bad feeling</button>
                </div>
                <button type="button" className="m6-btn m6-btn--ghost" onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </div>
          )}
          {stamp && <div className={`m6-stamp is-${stamp}`}>{stamp === "accept" ? "ACCEPTED" : "REJECTED"}</div>}

          {/* note */}
          {note && NOTES[note] && (
            <div className="m6-modal">
              <div className="m6-doc">
                <div className="m6-doc__head"><Icon id="note" size={18} /><h3>{NOTES[note].title}</h3></div>
                <div className="m6-doc__text">{NOTES[note].text}</div>
                <button type="button" className="m6-btn m6-btn--primary" onClick={closeNote} autoFocus>Got it</button>
              </div>
            </div>
          )}

          {gs.phase === "intro" && <NightIntro gs={gs} onBegin={beginShift} />}
          {gs.phase === "summary" && !enc && (
            <Summary gs={gs} summary={E.nightSummary(gs)} onNext={() => { resetUI(); commit(E.nextNight(gs)); }} onRetry={restartNight} />
          )}
          {gs.phase === "failed" && !enc && <Failed gs={gs} onRetry={restartNight} onMenu={toMenu} />}
          {paused && (
            <Pause onResume={() => setPaused(false)} onRestart={restartNight} onQuit={toMenu} view={pauseView} setView={setPauseView}
              settings={settings} onSettings={updateSettings} rulebook={<Rulebook night={gs.night} />} />
          )}
        </>
      )}

      {screen === "ending" && gs && (
        <EndingScreen gs={gs} records={records} onMenu={toMenu} onReplay={() => { resetUI(); commit(E.restartNight(gs, 7)); setScreen("game"); }} />
      )}

      {modal && doc && <DocViewer id={doc.id} still={stills.current[doc.id]} confiscated={gs?.confiscated || []} onClose={() => setDoc(null)} />}
      {modal && keypad && <Keypad onTry={tryCode} onClose={() => setKeypad(false)} />}

      {sub && <div className="m6-sub" key={sub.id}>{sub.text}</div>}
      <div className="m6-toasts">
        {toasts.map((t) => <div key={t.id} className={`m6-toast is-${t.kind}`}>{t.text}</div>)}
      </div>
      {scare && <div className="m6-scare"><img src={portraitURL(GUESTS.n7_voss.face, { variant: "void", id: "scare" })} alt="" /></div>}
      {cinema === "secret" && <div className="m6-whiteout" />}
    </div>
  );
}

function ToolBtn({ id, label, k, on, disabled, onClick }) {
  return (
    <button type="button" className={`m6-tool${on ? " is-on" : ""}`} onClick={onClick} disabled={disabled} aria-pressed={!!on} aria-label={label}>
      <Icon id={id} size={18} />
      <span>{label}</span>
      <kbd>{k}</kbd>
    </button>
  );
}

function TouchControls({ joy, onUse }) {
  const base = useRef(null);
  const knob = useRef(null);
  const pid = useRef(null);
  const move = (ev) => {
    const r = base.current.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (ev.clientX - cx) / (r.width / 2), y = (ev.clientY - cy) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    joy.current.x = x;
    joy.current.y = y;
    if (knob.current) knob.current.style.transform = `translate(${x * 40}%, ${y * 40}%)`;
  };
  const end = () => {
    pid.current = null;
    joy.current.x = 0;
    joy.current.y = 0;
    if (knob.current) knob.current.style.transform = "";
  };
  return (
    <>
      <div
        ref={base}
        className="m6-joy"
        onPointerDown={(e) => { e.stopPropagation(); pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (pid.current === e.pointerId) { e.stopPropagation(); move(e); } }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="m6-joy__knob" />
      </div>
      <button type="button" className="m6-use" onPointerDown={(e) => e.stopPropagation()} onClick={onUse}>USE</button>
    </>
  );
}
