/**
 * School Life Simulator 3D — a third-person school life sim for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Sim (sim.js)
 * with delta time and draws it with plain Three.js (world.js). The HUD is
 * written straight to DOM refs ~10×/s, so walking around never re-renders
 * React; React renders menus, the character creator and the overlays
 * (dialogue, lessons, exams, homework, cafeteria, map, profile, journal…).
 *
 * Controls: WASD move · mouse camera · Shift run · Space jump · E interact ·
 * F sit/stand · LMB / hold E shoot & kick · X quit activity · M map ·
 * Tab profile · J journal · Esc pause (releases the pointer).
 *
 * GamePlayer: `restartSignal` restarts the current school day from 08:00
 * (progression is kept); `muted` silences all audio. Pointer Lock is released
 * on pause, overlays, menus and unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./SchoolLife3D.css";
import { Sim, getLayout } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { drawMap } from "./mapdraw.js";
import { loadSave, writeSave, freshSave, sanitizeLook } from "./progress.js";
import { fmtTime, subjectInfo, MAX_LEVEL, xpToNext, SUBJECTS } from "./data.js";
import { MainMenu, Creator, HowTo, SettingsPanel, PauseOverlay, TalkOverlay, FoodOverlay, MapOverlay, ProfileOverlay, JournalOverlay, DayReport, dayName } from "./screens.jsx";
import { LessonOverlay, ExamOverlay, StudyOverlay, ComputerOverlay } from "./minigames.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("sltest");
const NOSAVE = TEST && PARAMS.has("nosave");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyF", "KeyM", "KeyJ", "KeyX", "Space", "Tab", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);
const AUTOSAVE = 20;
const BLOCKING = new Set(["talk", "lesson", "exam", "study", "computer", "food", "report", "locker", "pause", "map", "profile", "journal", "settings"]);
const SURFACE = (zone, x, z) => {
  if (!zone) return "grass";
  if (zone.outdoor) return zone.id === "court" || zone.id === "track" ? "court" : (Math.abs(x) < 3 && z < -14) || zone.id === "courtyard" ? "tile" : "grass";
  return ["math101", "eng102", "hist201", "study202", "music", "slounge", "club", "principal", "library", "tlounge", "gym"].includes(zone.id) ? "wood" : "tile";
};

/* ================================================================== component */
export default function SchoolLife3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const saveRef = useRef(null);
  if (!saveRef.current) saveRef.current = loadSave(storage());
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const edges = useRef({});
  const mouseDown = useRef(false);
  const camRef = useRef({ yaw: 0, pitch: 0.28, distMul: 1 });
  const hud = useRef({});
  const miniRef = useRef(null);
  const timers = useRef({ hud: 0, save: AUTOSAVE, mini: 0, lastStep: 0, t: 0 });
  const creatorRef = useRef({ yaw: 0, wave: 0, celebrate: 0 });

  const [screen, setScreenState] = useState("menu"); // menu | creator | how | settings | play
  const [overlay, setOverlayState] = useState(null); // { type, ... }
  const [locked, setLocked] = useState(false);
  const [creator, setCreator] = useState(null); // { look, mode }
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [subtitle, setSubtitle] = useState(null);
  const [saveTick, setSaveTick] = useState(0);
  const [saved, setSaved] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [touch] = useState(() => typeof window !== "undefined" && (PARAMS.has("sltouch") || !!window.matchMedia?.("(pointer: coarse)").matches));
  const save = saveRef.current;
  const settings = save.settings;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const refresh = useCallback(() => setSaveTick((n) => n + 1), []);

  /* ------------------------------------------------------------ saving */
  const persist = useCallback(() => {
    const sim = simRef.current;
    if (sim && screenRef.current === "play") sim.exportState();
    if (!NOSAVE) writeSave(storage(), saveRef.current);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST || touch) {
      lockedRef.current = true;
      setLocked(true);
      return;
    }
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* not allowed right now — the pause overlay stays up */
    }
  }, [touch]);
  const releaseLock = useCallback(() => {
    if (TEST || touch) {
      lockedRef.current = false;
      setLocked(false);
    }
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, [touch]);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      if (!l) {
        keys.current.clear();
        mouseDown.current = false;
        if (screenRef.current === "play" && !overlayRef.current) {
          setOverlay({ type: "pause" });
          persist();
        }
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [persist, setOverlay]);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200);
  }, []);
  const showBanner = useCallback((title, sub, kind = "info", ms = 3200) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);
  const showSub = useCallback((name, text) => {
    const id = ++fid.current;
    setSubtitle({ id, name, text });
    setTimeout(() => setSubtitle((s) => (s && s.id === id ? null : s)), 4200);
  }, []);

  /* ------------------------------------------------------------ session flow */
  const makeMenuSim = useCallback(() => {
    const clone = freshSave();
    clone.look = { ...saveRef.current.look };
    menuSimRef.current = new Sim({ save: clone, seed: 3, fresh: true, startTime: 640 });
    return menuSimRef.current;
  }, []);
  const openOverlay = useCallback((o) => {
    persist();
    setOverlay(o);
    releaseLock();
    keys.current.clear();
    mouseDown.current = false;
    refresh();
  }, [persist, refresh, releaseLock, setOverlay]);
  const closeOverlay = useCallback(() => {
    audio.unlock();
    const sim = simRef.current;
    if (sim && overlayRef.current?.type === "talk") sim.endTalk();
    setOverlay(null);
    persist();
    if (screenRef.current === "play") requestLock();
    refresh();
  }, [persist, refresh, requestLock, setOverlay]);

  const startPlay = useCallback((fresh = false) => {
    audio.unlock();
    audio.ui();
    const S = saveRef.current;
    S.started = true;
    const sim = new Sim({ save: S, seed: (Date.now() % 1e9) | 0, fresh: fresh || !S.dayState });
    simRef.current = sim;
    camRef.current.yaw = sim.player.yaw;
    camRef.current.pitch = 0.28;
    camRef.current.distMul = S.settings.camDist;
    worldRef.current?.resetCam();
    keys.current.clear();
    edges.current = {};
    timers.current.save = AUTOSAVE;
    setFeed([]);
    setOverlay(null);
    setScreen("play");
    const t = sim.schedInfo();
    showBanner(`DAY ${S.day} · ${dayName(S.day).toUpperCase()}`, `${t.clock} — ${t.next ? `Next: ${t.next.name} at ${t.next.at} (${t.next.room})` : t.activity}`, "start", 4200);
    if (!NOSAVE) writeSave(storage(), S);
    requestLock();
    refresh();
  }, [refresh, requestLock, setOverlay, setScreen, showBanner]);

  const toMenu = useCallback(() => {
    if (screenRef.current === "play") persist();
    releaseLock();
    audio.silence();
    simRef.current = null;
    setOverlay(null);
    setCreator(null);
    makeMenuSim();
    setScreen("menu");
    refresh();
  }, [makeMenuSim, persist, refresh, releaseLock, setOverlay, setScreen]);

  // GamePlayer Restart → restart today's session (progression kept); menus → main menu
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const sim = simRef.current;
    if (screenRef.current === "play" && sim) {
      sim.restartDay();
      setOverlay(null);
      camRef.current.yaw = sim.player.yaw;
      worldRef.current?.resetCam();
      persist();
      toast("Day restarted from 08:00 — your progress is safe.", "good");
      showBanner(`DAY ${sim.day}`, "Back at the gate. 08:00", "start");
      requestLock();
      refresh();
    } else toMenu();
  }, [restartSignal, persist, refresh, requestLock, setOverlay, showBanner, toMenu, toast]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ sim events */
  const handleEvents = useCallback((sim) => {
    const p = sim.player;
    const near = (x, z, y = p.y, r = 14) => Math.hypot(x - p.x, z - p.z) < r && Math.abs(y - p.y) < 3;
    for (const e of sim.events.splice(0)) {
      switch (e.type) {
        case "bell":
          audio.bell(e.end ? 1 : 0.85);
          toast(e.end ? "🔔 Final bell — school's out!" : `🔔 Bell · ${fmtTime(e.at)}`, "bell");
          break;
        case "block":
          if (e.text) toast(e.text, "info");
          break;
        case "say":
          if (e.kind === "teacher") {
            const n = sim.npcById.get(e.npc);
            if (n && near(n.x, n.z, n.y, 22)) showSub(e.name, e.text);
          }
          break;
        case "warning":
          audio.warning();
          toast(`⚠ ${e.text}`, "bad");
          break;
        case "late":
          toast(`⏰ Late for ${subjectInfo(e.subject).name} by ${e.by} min — reputation −`, "bad");
          break;
        case "open":
          switch (e.what) {
            case "talk":
              openOverlay({ type: "talk", npc: e.npc });
              break;
            case "food":
              openOverlay({ type: "food", menu: e.menu });
              break;
            case "locker":
              openOverlay({ type: "locker", look: { ...saveRef.current.look, acc: { ...saveRef.current.look.acc } } });
              break;
            case "map":
              openOverlay({ type: "map" });
              break;
            case "study":
              openOverlay({ type: "study" });
              break;
            case "computer":
              openOverlay({ type: "computer" });
              break;
            case "lesson":
              openOverlay({ type: "lesson", slot: e.slot, subject: e.subject });
              break;
            case "exam":
              openOverlay({ type: "exam", slot: e.slot, subjects: e.subjects });
              break;
            default:
          }
          audio.ui();
          break;
        case "homework":
          toast(`📝 New homework: ${SUBJECTS[e.hw.subject].name} — due day ${e.hw.due}`, "info");
          break;
        case "xp":
          toast(`+${e.n} XP · ${e.why}`, "xp");
          break;
        case "levelUp":
          audio.levelUp();
          showBanner(`LEVEL ${e.level}!`, e.unlocks.length ? `Unlocked: ${e.unlocks.join(" · ")}` : "Keep it up!", "level", 4200);
          worldRef.current?.burst(p.x, p.y + 1.6, p.z);
          persist();
          break;
        case "mission":
          audio.mission();
          showBanner("MISSION COMPLETE", `${e.title} · +${e.xp} XP${e.pts ? ` · +${e.pts} pts` : ""}`, "win", 3800);
          worldRef.current?.burst(p.x, p.y + 1.6, p.z, 120);
          persist();
          break;
        case "friendMade":
          audio.success();
          showBanner("NEW FRIEND", `${e.name} is now your friend ♥`, "win");
          break;
        case "favor":
        case "quest":
        case "pickup":
          audio.pickup();
          toast(e.text, "good");
          break;
        case "toast":
          if (e.kind === "bad") audio.wrong();
          toast(e.text, e.kind || "info");
          break;
        case "door":
          if (near(e.x, e.z, e.y, 9)) audio.door(e.open);
          break;
        case "jump":
          audio.jump();
          break;
        case "land":
          audio.land(Math.min(1.5, e.impact / 8));
          break;
        case "shoot":
          audio.shoot();
          break;
        case "basket":
          audio.swish();
          audio.cheer(0.5);
          toast(`🏀 Basket! +${e.pts}${e.swish ? " · swish!" : ""}`, "good");
          break;
        case "rim":
          audio.rim();
          break;
        case "board":
          audio.board();
          break;
        case "bounce":
          audio.bounce(Math.min(1, e.v / 5));
          break;
        case "kick":
          audio.kick();
          break;
        case "goal":
          audio.cheer(e.target ? 1 : 0.7);
          toast(e.target ? "⚽ TOP CORNER! +4" : "⚽ Goal! +2", "good");
          if (e.target) worldRef.current?.burst(sim.L.goal.x, 1.8, sim.L.goal.z, 80);
          break;
        case "saved":
          audio.aww();
          toast("🧤 Saved by the keeper!", "bad");
          break;
        case "miss":
          audio.aww();
          break;
        case "checkpoint":
          audio.checkpoint();
          break;
        case "go":
          audio.whistle();
          break;
        case "activityStart":
          audio.whistle();
          showBanner(e.title.toUpperCase(), e.desc, "start", 4200);
          break;
        case "activityEnd":
          if (e.cancelled) toast(`${e.title} cancelled.`, "info");
          else {
            showBanner(e.win ? "YOU WIN! 🏆" : "CHALLENGE OVER", `${e.summary}${e.grade ? ` · PE grade ${e.grade}` : ""}${e.team ? " · with a friend" : ""}`, e.win ? "win" : "info", 4600);
            if (e.win) {
              audio.success();
              worldRef.current?.burst(p.x, p.y + 1.5, p.z);
            } else audio.fail();
            if (e.feedback) showSub(sim.npcById.get("harris").name, e.feedback);
          }
          persist();
          break;
        case "buy":
          break;
        case "eatStart":
          audio.eat();
          break;
        case "eat":
          audio.eat();
          toast(`😋 ${e.name}: +${e.energy} energy`, "good");
          break;
        case "teacherQ":
          audio.beep(true);
          toast("✋ The teacher asked a question — press E to raise your hand!", "info");
          break;
        case "participate":
          audio.correct();
          toast("✋ You answered correctly! +participation", "good");
          break;
        case "dayEnd":
          releaseLock();
          setOverlay({ type: "report", summary: e.summary });
          persist();
          audio.bell(0.6);
          break;
        case "schoolOut":
          toast("🏫 School's out! Walk through the main gate (or open the Journal) to end the day.", "info");
          break;
        case "piano":
          audio.piano();
          break;
        case "sit":
          // face the way the seat faces (the board, the table…)
          camRef.current.yaw = sim.player.yaw;
          camRef.current.pitch = Math.max(camRef.current.pitch, 0.32);
          audio.click();
          break;
        case "stand":
          audio.click();
          break;
        case "homeworkDone":
          toast(`📝 Homework handed in: ${e.score}/100`, "good");
          break;
        default:
      }
    }
  }, [openOverlay, persist, releaseLock, setOverlay, showBanner, showSub, toast]);

  /* ------------------------------------------------------------ HUD writer */
  const writeHud = useCallback((sim) => {
    const h = hud.current;
    const L = h.last || (h.last = {});
    const set = (k, v) => {
      if (L[k] !== v && h[k]) {
        L[k] = v;
        h[k].textContent = v;
      }
    };
    const bar = (k, f) => {
      if (h[k]) h[k].style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
    };
    const S = sim.save;
    const info = sim.schedInfo();
    set("clock", info.clock);
    set("day", `Day ${S.day} · ${dayName(S.day)}`);
    set("activity", `${info.activity}${info.room ? ` · ${info.room}` : ""}`);
    set("next", info.next ? `Next: ${info.next.name} ${info.next.at} · ${info.next.room}${info.next.in <= 30 ? ` (in ${info.next.in} min)` : ""}` : sim.time >= 900 ? "Classes are over" : "No more classes today");
    const blk = info.block;
    bar("remain", blk.end > blk.start && blk.end < 1440 ? (sim.time - blk.start) / (blk.end - blk.start) : 1);
    set("remainTxt", blk.end < 1440 ? `${info.remaining} min left` : "");
    const ob = sim.objective();
    set("obTitle", ob ? ob.title : "");
    set("obDesc", ob ? ob.desc : "");
    if (h.obj) h.obj.dataset.kind = ob ? ob.kind : "";
    // distance to objective
    if (ob && ob.target) {
      const d = Math.hypot(ob.target.x - sim.player.x, ob.target.z - sim.player.z);
      const fl = (ob.target.y || 0) > 2.3 ? 1 : 0;
      const pf = sim.player.y > 2.3 ? 1 : 0;
      set("obDist", d < 2 ? "here" : `${Math.round(d)} m${fl !== pf ? (fl ? " · upstairs" : " · downstairs") : ""}`);
    } else set("obDist", "");
    const E = sim.ds.energy;
    bar("energyBar", E / 100);
    set("energyTxt", `${Math.round(E)}`);
    bar("repBar", S.rep / 100);
    set("repTxt", `${Math.round(S.rep)}`);
    bar("happyBar", S.happy / 100);
    set("happyTxt", `${Math.round(S.happy)}`);
    if (h.stats) h.stats.dataset.tired = E < 15 ? "1" : "0";
    set("lvl", String(S.level));
    bar("xpBar", S.level >= MAX_LEVEL ? 1 : S.xp / xpToNext(S.level));
    set("xpTxt", S.level >= MAX_LEVEL ? "MAX" : `${Math.floor(S.xp)}/${xpToNext(S.level)} XP`);
    set("pts", `${S.points} pts`);
    set("loc", sim.player.zone ? `${sim.player.zone.name}${sim.player.y > 2.3 && !sim.player.zone.outdoor ? " · 1F" : ""}` : "");
    // prompt
    const pr = sim.prompt;
    if (h.prompt) {
      h.prompt.dataset.on = pr ? "1" : "0";
      set("promptKey", pr ? pr.key : "");
      if (h.promptKey) h.promptKey.style.display = pr && pr.key ? "" : "none";
      set("promptTxt", pr ? pr.text : "");
      const alt = pr && pr.alt;
      if (h.promptAlt) h.promptAlt.style.display = alt ? "" : "none";
      set("promptAltKey", alt ? alt.key : "");
      set("promptAltTxt", alt ? alt.text : "");
    }
    // activity meter
    const a = sim.activity;
    if (h.meter) {
      const show = !!(a && (a.kind === "basketball" || a.kind === "football") && a.countdown <= 0);
      h.meter.dataset.on = show ? "1" : "0";
      if (show) {
        h.meterFill.style.transform = `scaleY(${(a.power || 0).toFixed(3)})`;
        if (a.kind === "basketball") {
          const w = sim.shotPowerWindow();
          h.meterZone.style.display = "";
          h.meterZone.style.bottom = `${((w.ideal - w.width) * 100).toFixed(1)}%`;
          h.meterZone.style.height = `${(w.width * 200).toFixed(1)}%`;
        } else h.meterZone.style.display = "none";
      }
    }
    if (h.actHint) h.actHint.dataset.on = a ? "1" : "0";
    // chips
    const chips = [];
    const p = sim.player;
    if (p.carry && p.carry.food) chips.push(`🍱 ${p.carry.name}`);
    if (p.carry && p.carry.item === "notebook") chips.push("📓 Lily's notebook");
    const fol = sim.followers();
    if (fol.length) chips.push(`🤝 ${fol.map((n) => n.name.split(" ")[0]).join(", ")} with you`);
    if (sim.ds.focus) chips.push("🧠 Focused");
    if (E < 15) chips.push("😴 Tired — eat something");
    if (p.running) chips.push("🏃 Running");
    const nh = sim.openHomework().filter((x) => x.due <= S.day).length;
    if (nh) chips.push(`📝 ${nh} homework due today`);
    const key = chips.join("|");
    if (L.chips !== key && h.chips) {
      L.chips = key;
      h.chips.replaceChildren(...chips.map((c) => {
        const d = document.createElement("span");
        d.className = "sl-chip";
        d.textContent = c;
        return d;
      }));
    }
  }, []);

  /* ------------------------------------------------------------ input → sim */
  const touchMove = useRef({ active: false, x: 0, y: 0, id: null, ox: 0, oy: 0, run: false });
  const touchLook = useRef({ id: null, x: 0, y: 0 });
  const buildInput = () => {
    const K = keys.current;
    const E = edges.current;
    const T = touchMove.current;
    let mx = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0);
    let mz = (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0) - (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0);
    if (T.active) {
      mx = T.x;
      mz = -T.y;
    }
    const sim = simRef.current;
    const inAct = !!(sim && sim.activity);
    const inp = {
      mx,
      mz,
      camYaw: camRef.current.yaw,
      run: K.has("ShiftLeft") || K.has("ShiftRight") || T.run,
      jump: !!E.jump,
      interact: !!E.interact && !inAct,
      sit: !!E.sit,
      action: mouseDown.current || (inAct && K.has("KeyE")) || !!E.touchAction,
      actionDown: !!E.actionDown,
      actionUp: !!E.actionUp,
      cancel: !!E.cancel,
    };
    edges.current = {};
    return inp;
  };

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    const tm = timers.current;
    tm.t += dt;
    const s = screenRef.current;
    if (s !== "play" || !simRef.current) {
      const C = creatorRef.current;
      C.wave = Math.max(0, C.wave - dt);
      C.celebrate = Math.max(0, C.celebrate - dt);
      let ms = menuSimRef.current;
      if (s === "menu" || s === "how" || s === "settings") {
        if (!ms) ms = makeMenuSim();
        ms.step({}, Math.min(dt, 0.05));
        ms.events.length = 0;
        if (ms.time > 700) ms.time = 640;
      }
      world.render({ sim: s === "creator" ? null : ms, mode: s === "creator" ? "creator" : "menu", look: creator?.look || saveRef.current.look, creatorYaw: C.yaw, creatorWave: C.wave, creatorCelebrate: C.celebrate }, dt);
      return;
    }
    const sim = simRef.current;
    const ov = overlayRef.current;
    const active = lockedRef.current && !ov && !sim.dayOver;
    if (active) {
      let left = dt;
      while (left > 1e-4) {
        const h = Math.min(left, 1 / 30);
        sim.step(buildInput(), h);
        left -= h;
      }
    }
    handleEvents(sim);
    const wardrobe = ov && ov.type === "locker";
    world.render({ sim, mode: wardrobe ? "wardrobe" : "play", cam: camRef.current, look: wardrobe ? ov.look : null }, dt);
    // footsteps from the gait phase
    const p = sim.player;
    if (active && p.onGround && p.speed > 0.8) {
      const ph = Math.floor(p.anim.phase / Math.PI);
      if (ph !== tm.lastPhase) {
        tm.lastPhase = ph;
        audio.footstep(SURFACE(p.zone, p.x, p.z), p.running ? 1 : 0.7, p.running);
      }
    }
    // ambience
    let crowd = 0;
    for (const n of sim.npcs) if (!n.hidden && Math.abs(n.y - p.y) < 3 && Math.abs(n.x - p.x) < 12 && Math.abs(n.z - p.z) < 12) crowd++;
    const z = p.zone;
    const cls = sim.currentClass();
    audio.step({
      dt,
      active: !!active || (ov && !["pause", "report"].includes(ov.type)),
      zone: !z || z.outdoor ? "outdoor" : z.id.startsWith("hall") || z.id === "lockers" || z.id === "lobby" || z.id === "reception" || z.id.startsWith("stairs") ? "hall" : z.id === "cafeteria" ? "cafeteria" : z.id === "library" || z.id === "study202" ? "library" : z.id === "gym" ? "gym" : z.kind === "class" ? "class" : "room",
      crowd: Math.min(1, crowd / 8),
      lesson: !!(cls && cls.room === z?.id && cls.status !== "done"),
    });
    tm.hud -= dt;
    if (tm.hud <= 0) {
      tm.hud = 0.1;
      writeHud(sim);
    }
    tm.mini -= dt;
    if (tm.mini <= 0 && saveRef.current.settings.minimap) {
      tm.mini = 0.2;
      const c = miniRef.current;
      if (c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth || 150;
        if (c.width !== Math.round(w * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(w * dpr);
        }
        drawMap(c.getContext("2d"), { sim, w, h: w, scale: dpr, view: "mini", t: tm.t });
      }
    }
    tm.save -= dt;
    if (tm.save <= 0 && active) {
      tm.save = AUTOSAVE;
      persist();
    }
  };

  /* ------------------------------------------------------------ world lifecycle */
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "sl-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    getLayout();
    const world = createWorld(canvas, { preserve: TEST, quality: saveRef.current.settings.quality });
    worldRef.current = world;
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      world.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);
    if (!menuSimRef.current) makeMenuSim();
    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__sl = {
        world,
        fit,
        sim: () => simRef.current,
        menuSim: () => menuSimRef.current,
        save: () => saveRef.current,
        keys: keys.current,
        edges,
        cam: camRef.current,
        mouse: mouseDown,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) frameRef.current(dt);
        },
      };
      setSaveTick((n) => n + 1);
    } else raf = requestAnimationFrame(loop);
    const onUnload = () => persist();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("beforeunload", onUnload);
      persist();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
      if (TEST) delete window.__sl;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
  }, [settings.quality]);

  // leaving the tab pauses
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play" && !TEST) {
        persist();
        if (!overlayRef.current) {
          releaseLock();
          setOverlay({ type: "pause" });
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [persist, releaseLock, setOverlay]);

  /* ------------------------------------------------------------ keyboard & mouse */
  const toggleOverlay = useCallback((type) => {
    const ov = overlayRef.current;
    if (ov && ov.type === type) closeOverlay();
    else if (!ov || ["map", "profile", "journal", "pause"].includes(ov.type)) openOverlay({ type });
  }, [closeOverlay, openOverlay]);
  const input = useRef({});
  input.current.kd = (e) => {
    if (screenRef.current !== "play") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    const ov = overlayRef.current;
    if (GAME_KEYS.has(e.code) && (!ov || ["map", "profile", "journal"].includes(ov.type) || e.code === "Tab")) e.preventDefault();
    const sim = simRef.current;
    if (!e.repeat && sim && !sim.dayOver) {
      if (e.code === "Tab" && (!ov || ["map", "profile", "journal", "pause"].includes(ov.type))) return toggleOverlay("profile");
      if (e.code === "KeyM" && (!ov || ["map", "profile", "journal", "pause"].includes(ov.type))) return toggleOverlay("map");
      if (e.code === "KeyJ" && (!ov || ["map", "profile", "journal", "pause"].includes(ov.type))) return toggleOverlay("journal");
      if (e.code === "Escape" && ov && ["map", "profile", "journal", "food", "locker", "settings"].includes(ov.type)) {
        // Esc can't re-grab the pointer, so drop into the pause menu
        setOverlay({ type: "pause" });
        return;
      }
      if (e.code === "Escape" && TEST) {
        if (ov && ov.type === "pause") closeOverlay();
        else if (!ov) openOverlay({ type: "pause" });
        return;
      }
    }
    if (!lockedRef.current || ov) return;
    keys.current.add(e.code);
    if (e.repeat) return;
    audio.unlock();
    const E = edges.current;
    switch (e.code) {
      case "Space":
        E.jump = true;
        break;
      case "KeyE":
        E.interact = true;
        if (sim && sim.activity) E.actionDown = true;
        break;
      case "KeyF":
        E.sit = true;
        break;
      case "KeyX":
        E.cancel = true;
        break;
      default:
    }
  };
  input.current.ku = (e) => {
    keys.current.delete(e.code);
    if (e.code === "KeyE" && simRef.current?.activity) edges.current.actionUp = true;
    if (screenRef.current === "play" && GAME_KEYS.has(e.code) && !overlayRef.current) e.preventDefault();
  };
  const lookBy = (dx, dy) => {
    const st = saveRef.current.settings;
    const c = camRef.current;
    const k = 0.0024 * st.sens;
    c.yaw -= dx * k;
    c.pitch += dy * k * (st.invertY ? -1 : 1);
    c.pitch = Math.max(-0.45, Math.min(1.15, c.pitch));
  };
  input.current.mm = (e) => {
    if (screenRef.current !== "play" || !lockedRef.current || overlayRef.current) return;
    lookBy(e.movementX || 0, e.movementY || 0);
  };
  useEffect(() => {
    const kd = (e) => input.current.kd(e);
    const ku = (e) => input.current.ku(e);
    const mm = (e) => input.current.mm(e);
    const mu = (e) => {
      if (e.button === 0 && mouseDown.current) {
        mouseDown.current = false;
        edges.current.actionUp = true;
      }
    };
    const blur = () => {
      keys.current.clear();
      mouseDown.current = false;
    };
    const wheel = (e) => {
      if (screenRef.current !== "play" || overlayRef.current) return;
      e.preventDefault();
      const c = camRef.current;
      c.distMul = Math.max(0.5, Math.min(1.7, c.distMul * (e.deltaY > 0 ? 1.08 : 0.93)));
    };
    const root = rootRef.current;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", blur);
    root.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", blur);
      root.removeEventListener("wheel", wheel);
    };
  }, []);
  const onStageMouseDown = (e) => {
    if (screenRef.current !== "play" || touch) return;
    if (overlayRef.current) return;
    if (!lockedRef.current) {
      audio.unlock();
      requestLock();
      return;
    }
    if (e.button === 0) {
      mouseDown.current = true;
      edges.current.actionDown = true;
    }
  };

  /* ------------------------------------------------------------ touch */
  const onTouchStart = (e) => {
    if (screenRef.current !== "play" || overlayRef.current) return;
    audio.unlock();
    for (const t of e.changedTouches) {
      const r = rootRef.current.getBoundingClientRect();
      if (t.target.closest && t.target.closest(".sl-tbtn")) continue;
      const x = t.clientX - r.left;
      if (x < r.width * 0.42 && touchMove.current.id == null) touchMove.current = { ...touchMove.current, active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
      else if (touchLook.current.id == null) touchLook.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const onTouchMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.current.id) {
        const m = touchMove.current;
        m.x = Math.max(-1, Math.min(1, (t.clientX - m.ox) / 50));
        m.y = Math.max(-1, Math.min(1, (t.clientY - m.oy) / 50));
      } else if (t.identifier === touchLook.current.id) {
        lookBy((t.clientX - touchLook.current.x) * 2, (t.clientY - touchLook.current.y) * 2);
        touchLook.current.x = t.clientX;
        touchLook.current.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.current.id) touchMove.current = { ...touchMove.current, active: false, id: null, x: 0, y: 0 };
      if (t.identifier === touchLook.current.id) touchLook.current.id = null;
    }
  };
  const tap = (k) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    audio.unlock();
    const sim = simRef.current;
    if (k === "action") {
      if (sim && sim.activity) {
        edges.current.actionDown = true;
        edges.current.touchAction = true;
        setTimeout(() => (edges.current.actionUp = true), 0);
      } else edges.current.interact = true;
      return;
    }
    if (k === "run") {
      touchMove.current.run = !touchMove.current.run;
      e.currentTarget.classList.toggle("is-on", touchMove.current.run);
      return;
    }
    if (k === "map" || k === "journal" || k === "profile") return toggleOverlay(k);
    if (k === "pause") return openOverlay({ type: "pause" });
    edges.current[k] = true;
  };
  // hold-to-charge for touch shooting
  const actHold = {
    onTouchStart: (e) => {
      e.stopPropagation();
      const sim = simRef.current;
      if (sim && sim.activity) {
        edges.current.actionDown = true;
        mouseDown.current = true;
      } else edges.current.interact = true;
    },
    onTouchEnd: (e) => {
      e.stopPropagation();
      if (mouseDown.current) {
        mouseDown.current = false;
        edges.current.actionUp = true;
      }
    },
  };

  /* ------------------------------------------------------------ settings */
  const setSetting = (k, v) => {
    saveRef.current.settings = { ...saveRef.current.settings, [k]: v };
    if (k === "camDist") camRef.current.distMul = v;
    if (!NOSAVE) writeSave(storage(), saveRef.current);
    refresh();
  };

  /* ------------------------------------------------------------ menu actions */
  const beginNew = () => {
    audio.unlock();
    audio.ui();
    if (saveRef.current.started && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    setConfirmNew(false);
    const keepSettings = saveRef.current.settings;
    const prevLook = saveRef.current.look;
    const S = freshSave();
    S.settings = keepSettings;
    S.look = { ...prevLook, acc: { ...prevLook.acc } };
    saveRef.current = S;
    creatorRef.current.yaw = 0;
    setCreator({ look: sanitizeLook(S.look), mode: "new" });
    setScreen("creator");
  };
  const openCreator = () => {
    audio.unlock();
    audio.ui();
    creatorRef.current.yaw = 0;
    setCreator({ look: sanitizeLook(saveRef.current.look), mode: "edit" });
    setScreen("creator");
  };
  const creatorDone = () => {
    const look = sanitizeLook(creator.look);
    saveRef.current.look = look;
    if (menuSimRef.current) menuSimRef.current.save.look = look;
    if (creator.mode === "new") {
      saveRef.current.dayState = null;
      startPlay(true);
      setCreator(null);
    } else {
      if (!NOSAVE) writeSave(storage(), saveRef.current);
      setCreator(null);
      setScreen("menu");
    }
    audio.success();
  };

  /* ------------------------------------------------------------ test hooks */
  useEffect(() => {
    if (!TEST || !window.__sl) return;
    Object.assign(window.__sl, { startPlay, toMenu, openOverlay, closeOverlay, setOverlay, persist, screen: () => screenRef.current, overlay: () => overlayRef.current, beginNew, openCreator, creatorDone, setCreatorLook: (l) => setCreator((c) => (c ? { ...c, look: l } : c)), setSetting, locked: () => lockedRef.current, requestLock, releaseLock });
  });

  /* ------------------------------------------------------------ render */
  const sim = simRef.current;
  const ov = overlay;
  void saveTick;
  return (
    <div
      ref={rootRef}
      className={`sl${screen === "play" && locked && !ov ? " sl--locked" : ""}${touch ? " sl--touch" : ""}`}
      onMouseDown={onStageMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      tabIndex={-1}
    >
      {/* ---------------- menus */}
      {screen === "menu" && (
        <div className="sl-screen sl-screen--menu">
          <MainMenu save={saveRef.current} onPlay={beginNew} onContinue={() => startPlay(false)} onCreator={openCreator} onHow={() => setScreen("how")} onSettings={() => setScreen("settings")} />
          {confirmNew && (
            <div className="sl-confirm">
              <div className="sl-card">
                <h3>Start a new school year?</h3>
                <p>Your current progress (Day {saveRef.current.day}, Level {saveRef.current.level}) will be replaced.</p>
                <div className="sl-row">
                  <button type="button" className="sl-btn sl-btn--ghost" onClick={() => setConfirmNew(false)}>
                    Cancel
                  </button>
                  <button type="button" className="sl-btn sl-btn--danger" onClick={beginNew}>
                    Yes, start over
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {screen === "how" && (
        <div className="sl-screen sl-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && (
        <div className="sl-screen sl-screen--dim">
          <SettingsPanel settings={saveRef.current.settings} onChange={setSetting} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "creator" && creator && (
        <Creator
          look={creator.look}
          setLook={(l) => setCreator((c) => ({ ...c, look: l }))}
          level={creator.mode === "new" ? 1 : saveRef.current.level}
          mode={creator.mode}
          onDone={creatorDone}
          onCancel={() => {
            setCreator(null);
            setScreen("menu");
          }}
          onRotate={(d) => (creatorRef.current.yaw += d)}
          onPose={(k) => {
            creatorRef.current[k] = k === "wave" ? 2 : 1.6;
            audio.ui();
          }}
        />
      )}

      {/* ---------------- gameplay HUD */}
      {screen === "play" && sim && (
        <div className={`sl-hud${ov && ov.type !== "locker" ? " sl-hud--dim" : ""}${ov && ov.type === "locker" ? " sl-hud--hidden" : ""}`}>
          <div className="sl-hud__clock">
            <div className="sl-hud__time">
              <b ref={(el) => (hud.current.clock = el)}>08:00</b>
              <span ref={(el) => (hud.current.day = el)} />
            </div>
            <div className="sl-hud__act" ref={(el) => (hud.current.activity = el)} />
            <div className="sl-hud__remain">
              <i>
                <b ref={(el) => (hud.current.remain = el)} />
              </i>
              <span ref={(el) => (hud.current.remainTxt = el)} />
            </div>
            <div className="sl-hud__next" ref={(el) => (hud.current.next = el)} />
          </div>
          <div className="sl-hud__obj" ref={(el) => (hud.current.obj = el)}>
            <small>★ Objective</small>
            <b ref={(el) => (hud.current.obTitle = el)} />
            <p ref={(el) => (hud.current.obDesc = el)} />
            <em ref={(el) => (hud.current.obDist = el)} />
          </div>
          <div className="sl-hud__mini" style={{ display: saveRef.current.settings.minimap ? "" : "none" }}>
            <canvas ref={miniRef} />
            <span ref={(el) => (hud.current.loc = el)} />
          </div>
          <div className="sl-hud__stats" ref={(el) => (hud.current.stats = el)}>
            <div className="sl-hud__lvl">
              <b>
                LV <span ref={(el) => (hud.current.lvl = el)}>1</span>
              </b>
              <i>
                <em ref={(el) => (hud.current.xpBar = el)} />
              </i>
              <small ref={(el) => (hud.current.xpTxt = el)} />
            </div>
            {[["energy", "⚡ Energy", "#2fbf71"], ["rep", "⭐ Reputation", "#f2b20f"], ["happy", "😊 Happiness", "#ff7a59"]].map(([k, label, c]) => (
              <div className="sl-bar" key={k}>
                <span>{label}</span>
                <i>
                  <b ref={(el) => (hud.current[`${k}Bar`] = el)} style={{ background: c }} />
                </i>
                <em ref={(el) => (hud.current[`${k}Txt`] = el)} />
              </div>
            ))}
            <div className="sl-hud__pts" ref={(el) => (hud.current.pts = el)} />
          </div>
          <div className="sl-hud__chips" ref={(el) => (hud.current.chips = el)} />
          <div className="sl-prompt" ref={(el) => (hud.current.prompt = el)} data-on="0">
            <span>
              <kbd ref={(el) => (hud.current.promptKey = el)} />
              <b ref={(el) => (hud.current.promptTxt = el)} />
            </span>
            <span ref={(el) => (hud.current.promptAlt = el)}>
              <kbd ref={(el) => (hud.current.promptAltKey = el)} />
              <b ref={(el) => (hud.current.promptAltTxt = el)} />
            </span>
          </div>
          <div className="sl-meter" ref={(el) => (hud.current.meter = el)} data-on="0">
            <i ref={(el) => (hud.current.meterZone = el)} />
            <b ref={(el) => (hud.current.meterFill = el)} />
            <span>POWER</span>
          </div>
          <div className="sl-acthint" ref={(el) => (hud.current.actHint = el)} data-on="0">
            <kbd>X</kbd> quit activity
          </div>
          {subtitle && (
            <div className="sl-subtitle" key={subtitle.id}>
              <b>{subtitle.name}:</b> {subtitle.text}
            </div>
          )}
          {!touch && (
            <div className="sl-hud__keys">
              <kbd>M</kbd> Map <kbd>J</kbd> Journal <kbd>Tab</kbd> Profile <kbd>Esc</kbd> Pause
            </div>
          )}
          {!locked && !ov && !touch && (
            <button type="button" className="sl-clickplay" onClick={requestLock}>
              Click to play
            </button>
          )}
        </div>
      )}
      {screen === "play" && touch && !ov && (
        <div className="sl-touch">
          <div className="sl-touch__stick" style={{ "--x": touchMove.current.x, "--y": touchMove.current.y }} />
          <div className="sl-touch__btns">
            <button type="button" className="sl-tbtn sl-tbtn--big" {...actHold}>
              E
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("sit")}>
              F
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("jump")}>
              ⤒
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("run")}>
              🏃
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("cancel")}>
              X
            </button>
          </div>
          <div className="sl-touch__top">
            <button type="button" className="sl-tbtn" onTouchStart={tap("map")}>
              🗺
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("journal")}>
              📓
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("profile")}>
              🎓
            </button>
            <button type="button" className="sl-tbtn" onTouchStart={tap("pause")}>
              ⏸
            </button>
          </div>
        </div>
      )}

      {/* ---------------- feedback */}
      <div className="sl-feed" aria-live="polite">
        {feed.map((f) => (
          <div key={f.id} className={`sl-toast sl-toast--${f.kind}`}>
            {f.text}
          </div>
        ))}
      </div>
      {banner && (
        <div className={`sl-banner sl-banner--${banner.kind}`} key={banner.id}>
          <b>{banner.title}</b>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}

      {/* ---------------- overlays */}
      {screen === "play" && sim && ov && (
        <div className={`sl-overlay${ov.type === "locker" ? " sl-overlay--side" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
          {ov.type === "pause" && (
            <PauseOverlay
              saved={saved}
              onResume={closeOverlay}
              onSave={() => {
                persist();
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              }}
              onSettings={() => setOverlay({ type: "settings" })}
              onMenu={toMenu}
            />
          )}
          {ov.type === "settings" && <SettingsPanel compact settings={saveRef.current.settings} onChange={setSetting} onBack={() => setOverlay({ type: "pause" })} />}
          {ov.type === "talk" && sim.npcById.get(ov.npc) && <TalkOverlay sim={sim} npc={sim.npcById.get(ov.npc)} onClose={closeOverlay} />}
          {ov.type === "food" && <FoodOverlay sim={sim} menu={ov.menu} onClose={closeOverlay} />}
          {ov.type === "map" && <MapOverlay sim={sim} onClose={closeOverlay} />}
          {ov.type === "profile" && <ProfileOverlay sim={sim} onClose={closeOverlay} />}
          {ov.type === "journal" && (
            <JournalOverlay
              sim={sim}
              onClose={closeOverlay}
              onEndDay={() => {
                sim.finishDay("journal");
                handleEvents(sim);
              }}
            />
          )}
          {ov.type === "lesson" && (
            <LessonOverlay
              subject={ov.subject}
              teacher={sim.teacherFor(ov.subject)?.name || "Teacher"}
              hints={sim.lessonHelpers()}
              focus={sim.focusMul()}
              onFinish={(r) => sim.finishLesson(ov.slot, r)}
              onClose={closeOverlay}
            />
          )}
          {ov.type === "exam" && <ExamOverlay subjects={ov.subjects} focus={sim.focusMul()} onFinish={(r) => sim.finishExam(r)} onClose={closeOverlay} />}
          {ov.type === "study" && (
            <StudyOverlay homework={sim.openHomework()} focus={sim.focusMul()} onHomework={(id, r) => sim.finishHomework(id, r)} onStudy={(s, r) => sim.finishStudy(s, r)} onClose={closeOverlay} />
          )}
          {ov.type === "computer" && <ComputerOverlay onFinish={(r) => sim.finishComputer(r)} onClose={closeOverlay} />}
          {ov.type === "locker" && (
            <Creator
              look={ov.look}
              setLook={(l) => {
                setOverlay({ ...ov, look: l });
                sim.setLook(l);
              }}
              level={saveRef.current.level}
              mode="wardrobe"
              onDone={() => {
                sim.setLook(ov.look);
                toast("👕 New look saved!", "good");
                closeOverlay();
              }}
              onCancel={closeOverlay}
              onRotate={() => {}}
              onPose={() => {}}
            />
          )}
          {ov.type === "report" && (
            <DayReport
              summary={ov.summary}
              sim={sim}
              onNext={() => {
                sim.nextDay();
                camRef.current.yaw = sim.player.yaw;
                worldRef.current?.resetCam();
                setOverlay(null);
                persist();
                showBanner(`DAY ${sim.day} · ${dayName(sim.day).toUpperCase()}`, "A new school day begins at the gate.", "start", 3800);
                requestLock();
                refresh();
              }}
              onMenu={() => {
                sim.nextDay();
                persist();
                toMenu();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
