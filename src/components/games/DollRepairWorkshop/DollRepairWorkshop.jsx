/**
 * Doll Repair Workshop — a cozy 3D doll restoration & workshop sim for the
 * Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop advances the repair
 * session (engine/session.js) with delta time and draws the plain Three.js
 * world (render/world.js). React renders menus and the HUD; the HUD
 * refreshes on a throttled tick so dragging tools never waits on React.
 *
 * Controls: drag = rotate the doll (no tool) · left mouse = use tool ·
 * right drag = rotate (tool active) / pan · wheel = zoom (or rotate a part
 * you're fitting) · Q/E rotate part · Esc = drop tool / pause.
 * Touch: one finger = tool or rotate, two fingers = pinch zoom + pan.
 *
 * GamePlayer: `restartSignal` restarts the current repair job from scratch
 * (supplies it used are refunded, progression is kept); `muted` silences
 * all audio. Progress lives in localStorage (engine/progress.js).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import "./DollRepairWorkshop.css";
import { createWorld } from "./render/world.js";
import { buildDoll } from "./render/dollModel.js";
import { RepairSession, applySnapshot } from "./engine/session.js";
import { audio } from "./audio.js";
import * as P from "./engine/progress.js";
import { ORDER_BY_ID } from "./data/orders.js";
import { PAINT_COLORS } from "./data/dolls.js";
import { TOOLS, PARTS, UPGRADES, unlocksAt } from "./data/items.js";
import { MainMenu, OrderBoard, CustomerDialog, ShopScreen, GalleryScreen, ResultScreen, HowTo, SettingsPanel, PauseOverlay, money } from "./ui/screens.jsx";
import Hud from "./ui/Hud.jsx";
import { Icon } from "./ui/icons.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("drwtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const storage = () => (typeof localStorage !== "undefined" && !NOSAVE ? localStorage : null);
const AUTOSAVE = 10;

const REACT = {
  delighted: ["It's perfect! She looks brand new — thank you so much!", "Oh my goodness… it's like the day I got her. You're a wonder!"],
  happy: ["Wonderful work, thank you! I'll tell my friends about you.", "She looks lovely. Thank you for taking such good care of her."],
  okay: ["Thanks… it's alright. Not quite what I hoped, but alright.", "Hm, it's better than before, I suppose."],
  disappointed: ["Oh. This isn't what I asked for at all…", "I'm afraid I expected much more care than this."],
};

export default function DollRepairWorkshop({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const saveRef = useRef(null);
  if (!saveRef.current) saveRef.current = P.loadSave(storage());
  const sessionRef = useRef(null);
  const orderRef = useRef(null);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const resultRef = useRef(null);
  const inputRef = useRef({ pointers: new Map(), mode: null, lastX: 0, lastY: 0, pinch: 0, mid: null, hover: null, rub: 0, rubTool: null });
  const timers = useRef({ hud: 0, save: 0 });
  const compareRef = useRef({ split: 0.5, side: false });

  const [screen, setScreenState] = useState("menu");
  const [overlay, setOverlayState] = useState(null); // pause | shop | settings
  const [shopTab, setShopTab] = useState("tools");
  const [, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [result, setResult] = useState(null);
  const [reaction, setReaction] = useState(null);
  const [compare, setCompareState] = useState({ split: 0.5, side: false });
  const [gallerySel, setGallerySel] = useState(null);
  const [detector, setDetector] = useState(false);
  const [settingsFrom, setSettingsFrom] = useState("menu");
  const [levelUp, setLevelUp] = useState(null);
  const save = saveRef.current;

  const bump = useCallback(() => setTick((n) => n + 1), []);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const persist = useCallback(() => {
    if (!NOSAVE) P.writeSave(storage(), saveRef.current);
  }, []);
  const persistJob = useCallback(() => {
    const s = sessionRef.current;
    const sv = saveRef.current;
    if (s && sv.active && s.phase !== "done") sv.active.snap = s.snapshot();
    persist();
  }, [persist]);
  const toast = useCallback((text, kind = "info") => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  const showLevels = useCallback((levels) => {
    if (!levels || !levels.length) return;
    const L = levels[levels.length - 1];
    const unlocks = levels.flatMap((l) => unlocksAt(l));
    setLevelUp({ level: L, unlocks });
    audio.play("levelup");
    setTimeout(() => setLevelUp(null), 4200);
  }, []);

  /* ======================================================== world setup */
  useEffect(() => {
    const host = stageRef.current;
    const canvas = document.createElement("canvas");
    canvas.className = "drw-canvas";
    host.appendChild(canvas);
    const world = createWorld(canvas, { quality: saveRef.current.settings.quality, preserve: TEST });
    worldRef.current = world;
    world.setUpgrades(saveRef.current.upgrades, saveRef.current.gallery);
    world.setMode("menu");
    const fit = () => {
      const r = host.getBoundingClientRect();
      world.setSize(Math.round(r.width), Math.round(r.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    let raf = 0;
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      step(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__drw = {
        world,
        session: () => sessionRef.current,
        save: () => saveRef.current,
        screen: () => screenRef.current,
        advance: (frames = 1, dt = 1 / 60) => {
          for (let i = 0; i < frames; i++) step(dt);
        },
        fit,
      };
    } else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
      canvas.remove();
      if (TEST) delete window.__drw;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ========================================================= frame step */
  const stepRef = useRef(null);
  function step(dt) {
    stepRef.current?.(dt);
  }
  stepRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    const s = sessionRef.current;
    const scr = screenRef.current;
    const paused = !!overlayRef.current;
    const inp = inputRef.current;
    if (s && scr === "play" && !paused) s.update(dt);
    if (s) drainEvents(s);
    if (s && scr === "play") world.showCarry(s.carry, s.model);
    world.update(dt);
    world.render();
    inp.rub = Math.max(0, inp.rub - dt * 2.5);
    audio.tick(dt, { rubbing: scr === "play" && !paused ? inp.rub : 0, rubTool: inp.rubTool, dryer: !!(s && s.holding && s.holding.tool === "dryer" && s.holding.hit), inShop: true });
    const tm = timers.current;
    tm.hud += dt;
    if (tm.hud > 0.12 && scr === "play") {
      tm.hud = 0;
      bump();
    }
    tm.save += dt;
    if (tm.save > AUTOSAVE && s && scr === "play") {
      tm.save = 0;
      persistJob();
    }
    // result reveal wipe
    const c = compareRef.current;
    if (c.anim != null) {
      c.anim = Math.min(1, c.anim + dt * 0.55);
      const e = 1 - (1 - c.anim) ** 3;
      c.split = 1 - e * 0.5;
      world.setSplit(c.split);
      if (c.anim >= 1) {
        c.anim = null;
        setCompareState({ split: c.split, side: c.side });
      }
    }
  };

  function drainEvents(s) {
    const world = worldRef.current;
    const evs = s.events.splice(0);
    for (const e of evs) {
      switch (e.type) {
        case "toast":
          toast(e.text, e.kind);
          if (e.kind === "warn") audio.play("deny");
          break;
        case "found":
          world.addPin(e.point, null, true);
          audio.play("found");
          toast(`Found: ${e.label}`, "good");
          break;
        case "nothing":
          world.addPin(e.point, null, false);
          audio.play("nothing");
          break;
        case "fx":
          world.fx(e.kind, e.point, e.normal);
          if (e.kind === "dust") audio.play("brush");
          if (e.kind === "foam" || e.kind === "dirt") audio.play("squish");
          break;
        case "rub":
          inputRef.current.rub = Math.min(0.15, inputRef.current.rub + Math.min(0.05, (e.amount || 0.01) * 0.6) + 0.01);
          inputRef.current.rubTool = e.tool;
          break;
        case "stitch":
          world.fx("stitch", e.point);
          audio.play((saveRef.current.upgrades.sewing || 0) >= 1 ? "machine" : "stitch");
          break;
        case "taskDone":
          audio.play("task");
          toast(`✓ ${e.label} — ${e.score}`, "good");
          if (world.doll) world.fx("done", new Vector3(0, world.doll.plan.height * 0.6, 0));
          persistJob();
          break;
        case "detached":
          world.detachAnim(e.obj);
          audio.play("detach");
          break;
        case "carry":
          audio.play("pick");
          world.showSockets(s.openSockets());
          break;
        case "carryCancel":
          world.hideCarry();
          world.showSockets([]);
          break;
        case "attached":
          world.hideCarry();
          world.showSockets([]);
          world.fx("done", e.point);
          audio.play("snap");
          persistJob();
          break;
        case "wrongPart":
          world.hideCarry();
          world.showSockets([]);
          world.cam.shake = 0.5;
          audio.play("wrong");
          toast(e.text, "bad");
          break;
        case "misaligned":
          audio.play("deny");
          toast("Not aligned — rotate the part until the ring turns green", "warn");
          break;
        case "snag":
          audio.play("snag");
          toast("Ouch — a snag! Brush from root to tip.", "warn");
          break;
        case "offPath":
          toast("Off the stitch line!", "warn");
          break;
        case "cured":
          audio.play("cured");
          toast("Adhesive cured — buff the crack with the cloth", "good");
          break;
        case "sfx":
          audio.play(e.name);
          break;
        case "phase":
          audio.play("phase");
          if (e.phase === "repair") {
            world.clearPins();
            if (e.missed?.length) toast(`Missed: ${e.missed.join(", ")} — added to your checklist`, "warn");
            else toast(`Perfect inspection! Score ${e.score}`, "good");
          }
          break;
        case "tool":
          world.setTool(e.id);
          break;
        default:
          break;
      }
    }
  }

  /* ============================================================== flow */
  const toMenu = useCallback(() => {
    persistJob();
    const world = worldRef.current;
    sessionRef.current = null;
    setOverlay(null);
    world?.clearCompare();
    world?.setDoll(null);
    world?.setCustomer(null);
    world?.setTool(null);
    world?.setMode("menu");
    setScreen("menu");
    audio.setMusic(true);
  }, [persistJob, setOverlay, setScreen]);

  const buildJob = useCallback((order, snap) => {
    const world = worldRef.current;
    const sv = saveRef.current;
    const model = buildDoll({ type: order.type, look: order.look, damage: order.damage, seed: P.seedOf(order) });
    const s = new RepairSession({ order, model, ctx: P.makeCtx(sv, () => {}), seed: P.seedOf(order) + 17 });
    if (snap) s.restore(snap);
    sessionRef.current = s;
    orderRef.current = order;
    world.clearCompare();
    world.setCustomer(null);
    world.setDoll(model);
    world.setMode("bench", { resetYaw: true });
    world.snapCamera();
    world.setTool(s.tool === "hand" ? null : s.tool);
    if (s.phase === "inspect") s.selectTool("magnifier");
    s.events.length = 0;
    setOverlay(null);
    setScreen("play");
    audio.setMusic(true);
  }, [setOverlay, setScreen]);

  const meetCustomer = useCallback((order) => {
    const world = worldRef.current;
    orderRef.current = order;
    setReaction(null);
    world.setDoll(null);
    world.setCustomer(order.customer);
    world.customerAnim("talk");
    world.setMode("counter");
    setScreen("customer");
    audio.play("bell");
    setTimeout(() => audio.play("voice", { child: order.customer.age === "child", senior: order.customer.age === "senior" }), 600);
  }, [setScreen]);

  const play = useCallback(() => {
    audio.unlock();
    const sv = saveRef.current;
    if (sv.active) return resumeJob();
    const b = P.orderBoard(sv);
    if (b.next) meetCustomer(b.next.order);
    else setScreen("board");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetCustomer, setScreen]);

  const resumeJob = useCallback(() => {
    const sv = saveRef.current;
    const a = sv.active;
    if (!a) return;
    const order = a.order || ORDER_BY_ID[a.orderId];
    if (!order) {
      sv.active = null;
      persist();
      return;
    }
    audio.unlock();
    buildJob(order, a.snap);
    toast("Welcome back — your job is right where you left it", "info");
  }, [buildJob, persist, toast]);

  const acceptJob = useCallback(() => {
    const sv = saveRef.current;
    const order = orderRef.current;
    const r = P.acceptOrder(sv, order);
    if (!r.ok) {
      toast(r.why, "warn");
      return;
    }
    audio.play("buy");
    toast(`Deposit received: ${money(r.deposit)}`, "good");
    buildJob(order, null);
    persistJob();
  }, [buildJob, persistJob, toast]);

  const deliver = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.phase === "repair" && !s.finishRepairs()) return;
    const res = s.submit();
    if (!res) return;
    const sv = saveRef.current;
    const order = s.order;
    const pay = P.payout(sv, order, res);
    const snap = s.snapshot();
    resultRef.current = { order, res, snap, pay };
    const world = worldRef.current;
    world.setTool(null);
    world.setCustomer(order.customer);
    world.customerAnim(pay.mood === "delighted" || pay.mood === "happy" ? "happy" : pay.mood === "okay" ? "talk" : "sad");
    world.setMode("counter");
    world.setDoll(null);
    sessionRef.current = null;
    const lines = REACT[pay.mood];
    setReaction({ text: lines[Math.floor(Math.random() * lines.length)], mood: `${pay.mood[0].toUpperCase()}${pay.mood.slice(1)} · ${res.quality}% quality`, onNext: () => finalize() });
    setScreen("customer");
    audio.play(pay.mood === "delighted" || pay.mood === "happy" ? "happy" : pay.mood === "okay" ? "okay" : "sad", { child: order.customer.age === "child" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setScreen]);

  const finalize = useCallback(() => {
    const r = resultRef.current;
    if (!r) return;
    const sv = saveRef.current;
    const done = P.completeOrder(sv, r.order, r.res, { snap: r.snap });
    persist();
    const world = worldRef.current;
    world.setCustomer(null);
    const spec = { type: r.order.type, look: r.order.look, damage: r.order.damage, seed: P.seedOf(r.order) };
    const before = buildDoll(spec);
    const after = buildDoll(spec);
    applySnapshot(after, r.snap);
    world.setCompare(before, after, { side: false });
    world.setMode("compare");
    world.snapCamera();
    compareRef.current = { split: 1, side: false, anim: 0 };
    world.setSplit(1, false);
    setCompareState({ split: 1, side: false });
    setResult({ order: r.order, result: r.res, pay: done.pay, levels: done.levels });
    setScreen("result");
    audio.play("reveal");
    setTimeout(() => {
      for (let i = 0; i < r.res.stars; i++) setTimeout(() => audio.play("star", { i }), i * 140);
      if (r.res.stars >= 4) worldRef.current?.celebrate();
    }, 900);
    showLevels(done.levels);
    resultRef.current = null;
  }, [persist, setScreen, showLevels]);

  const afterResult = useCallback(() => {
    const world = worldRef.current;
    world.clearCompare();
    world.setUpgrades(saveRef.current.upgrades, saveRef.current.gallery);
    world.setMode("menu");
    setResult(null);
    setScreen("board");
  }, [setScreen]);

  const onCompare = useCallback((patch) => {
    const c = { ...compareRef.current, ...patch, anim: null };
    compareRef.current = c;
    worldRef.current?.setSplit(c.split, c.side);
    setCompareState({ split: c.split, side: c.side });
  }, []);

  const openGallery = useCallback((id) => {
    const sv = saveRef.current;
    const g = sv.gallery.find((x) => x.id === id);
    setGallerySel(id);
    if (!g) return;
    const world = worldRef.current;
    try {
      const before = buildDoll(g.spec);
      const after = buildDoll(g.spec);
      applySnapshot(after, g.snap);
      world.setCompare(before, after, { side: compareRef.current.side });
      world.setMode("compare", { side: compareRef.current.side });
      world.snapCamera();
    } catch {
      toast("This gallery entry couldn't be rebuilt", "warn");
    }
  }, [toast]);

  const onBuy = useCallback((kind, id) => {
    const sv = saveRef.current;
    const fn = { tool: P.buyTool, supply: P.buySupply, part: P.buyPart, upgrade: P.buyUpgrade }[kind];
    const r = fn(sv, id);
    if (r.ok) {
      audio.play("buy");
      const name = kind === "tool" ? TOOLS[id].name : kind === "part" ? PARTS[id].name : kind === "upgrade" ? `${UPGRADES[id].name}: ${UPGRADES[id].tiers[sv.upgrades[id]].label}` : id;
      toast(`Bought ${name}`, "good");
      if (kind === "upgrade") {
        worldRef.current?.setUpgrades(sv.upgrades, sv.gallery);
        if (sessionRef.current) worldRef.current?.setDoll(sessionRef.current.model);
      }
      persistJob();
    } else {
      audio.play("deny");
      toast(r.why, "warn");
    }
    bump();
  }, [bump, persistJob, toast]);

  const onClaim = useCallback((id) => {
    const r = P.claimChallenge(saveRef.current, id);
    if (r.ok) {
      audio.play("buy");
      toast(`Challenge complete! +${money(r.money)} · +${r.xp} XP`, "good");
      showLevels(r.levels);
      persist();
    } else toast(r.why, "warn");
    bump();
  }, [bump, persist, showLevels, toast]);

  const applySettings = useCallback((patch) => {
    const sv = saveRef.current;
    Object.assign(sv.settings, patch);
    audio.setVolumes(sv.settings.sfx, sv.settings.music);
    if (patch.quality) worldRef.current?.setQuality(patch.quality);
    persist();
    bump();
  }, [bump, persist]);

  /* ==================================================== HUD callbacks */
  const onTool = useCallback((id) => {
    audio.unlock();
    const s = sessionRef.current;
    if (!s) return;
    if (id !== "hand" && TOOLS[id] && !saveRef.current.tools[id]) {
      setShopTab("tools");
      setOverlay("shop");
      toast(`${TOOLS[id].name} — buy it in the Shop`, "info");
      return;
    }
    if (s.selectTool(id === "hand" ? "hand" : id)) {
      audio.play("pick");
      worldRef.current.setTool(id === "hand" ? null : id);
      if (id === "paint") worldRef.current.setPaintColor(PAINT_COLORS[s.paintColor].hex);
      if (id === "pliers") {
        const t = s.tasks.find((x) => x.kind === "part" && x.stage === "broken");
        if (t) worldRef.current.lookAtPoint(s.model.sockets[t.socket].pos, 1.0, 0.15);
      }
    }
    bump();
  }, [bump, setOverlay, toast]);

  const onPhase = useCallback((what) => {
    const s = sessionRef.current;
    if (!s) return;
    if (what === "finishInspect") {
      s.finishInspection();
      worldRef.current.setTool(null);
    } else if (what === "finishRepairs") {
      if (s.finishRepairs()) {
        worldRef.current.setTool(null);
        worldRef.current.focus("full");
        toast("Repairs complete! Now style the doll for its owner.", "good");
      }
    } else if (what === "submit") deliver();
    persistJob();
    bump();
  }, [bump, deliver, persistJob, toast]);

  const onPick = useCallback((id) => {
    const s = sessionRef.current;
    if (s?.pickPart(id)) {
      const so = s.openSockets()[0];
      if (so) worldRef.current.lookAtPoint(so.pos, 1.0, so.kind === "arm" || so.kind === "leg" ? 0.15 : 0.5);
    }
    bump();
  }, [bump]);

  const onPaint = useCallback((o) => {
    const s = sessionRef.current;
    if (!s) return;
    if (o.undo) s.undoPaint();
    else if (o.done) s.finishPaint();
    else {
      s.setPaint(o);
      if (o.color != null) worldRef.current.setPaintColor(PAINT_COLORS[o.color].hex);
      audio.play("click");
    }
    bump();
  }, [bump]);

  const onLook = useCallback((key, value) => {
    const s = sessionRef.current;
    if (s?.setLook(key, value)) audio.play("click");
    bump();
  }, [bump]);

  const onCam = useCallback((c) => {
    const w = worldRef.current;
    if (!w) return;
    if (c === "rotL") w.rotate(-0.5, 0);
    else if (c === "rotR") w.rotate(0.5, 0);
    else if (c === "in") w.zoom(0.8);
    else if (c === "out") w.zoom(1.25);
    else w.focus(c);
  }, []);

  /* ============================================================= input */
  useEffect(() => {
    const el = stageRef.current;
    const inp = inputRef.current;
    const ndc = (e) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    const interactive = () => {
      const scr = screenRef.current;
      return !overlayRef.current && (scr === "play" || scr === "gallery" || scr === "result");
    };
    const sens = () => (saveRef.current.settings.sens || 1) * (saveRef.current.settings.invertX ? -1 : 1);
    const down = (e) => {
      if (!interactive()) return;
      audio.unlock();
      el.setPointerCapture?.(e.pointerId);
      inp.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const w = worldRef.current;
      const s = sessionRef.current;
      if (inp.pointers.size === 2) {
        // second finger: pinch/pan, abandon any tool stroke
        if (s && inp.mode === "tool") s.pointerUp();
        inp.mode = "pinch";
        const [a, b] = [...inp.pointers.values()];
        inp.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        inp.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return;
      }
      inp.lastX = e.clientX;
      inp.lastY = e.clientY;
      const p = ndc(e);
      const playing = screenRef.current === "play" && s;
      const toolOn = playing && (s.carry || (s.tool && s.tool !== "hand"));
      if (e.button === 2 || e.button === 1) inp.mode = toolOn && e.button === 2 && !e.shiftKey ? "rotate" : "pan";
      else if (toolOn) {
        inp.mode = "tool";
        const hit = w.pick(p.x, p.y);
        s.pointerDown(hit, w.rayRoot(p.x, p.y));
        w.updateCursor(hit, true);
      } else inp.mode = "rotate";
      e.preventDefault();
    };
    const move = (e) => {
      const w = worldRef.current;
      if (!w) return;
      const s = sessionRef.current;
      const p = ndc(e);
      if (inp.pointers.has(e.pointerId)) inp.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (inp.mode === "pinch" && inp.pointers.size >= 2) {
        const [a, b] = [...inp.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (inp.pinch > 0) w.zoom(inp.pinch / Math.max(1, d));
        inp.pinch = d;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const r = el.getBoundingClientRect();
        w.pan(-(mid.x - inp.mid.x) / r.height, (mid.y - inp.mid.y) / r.height);
        inp.mid = mid;
        return;
      }
      const dx = e.clientX - inp.lastX;
      const dy = e.clientY - inp.lastY;
      inp.lastX = e.clientX;
      inp.lastY = e.clientY;
      if (inp.mode === "rotate") w.rotate(dx * 0.011 * sens(), dy * 0.006);
      else if (inp.mode === "pan") {
        const r = el.getBoundingClientRect();
        w.pan(-dx / r.height, dy / r.height);
      }
      if (screenRef.current === "play" && s && !overlayRef.current) {
        const hit = s.carry ? null : w.pick(p.x, p.y);
        if (inp.mode === "tool" || s.carry) s.pointerMove(hit, w.rayRoot(p.x, p.y));
        w.updateCursor(hit, inp.mode === "tool");
      }
    };
    const up = (e) => {
      inp.pointers.delete(e.pointerId);
      const s = sessionRef.current;
      if (inp.mode === "tool" && s) s.pointerUp();
      if (inp.pointers.size === 0) inp.mode = null;
      else if (inp.mode === "pinch" && inp.pointers.size === 1) {
        inp.mode = null;
        const [a] = [...inp.pointers.values()];
        inp.lastX = a.x;
        inp.lastY = a.y;
      }
      worldRef.current?.updateCursor(inp.hover, false);
    };
    const leave = () => worldRef.current?.updateCursor(null, false);
    const wheel = (e) => {
      if (!interactive()) return;
      e.preventDefault();
      const s = sessionRef.current;
      if (s && s.carry) {
        s.rotateCarry(Math.sign(e.deltaY) * 5);
        return;
      }
      worldRef.current?.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    };
    const ctx = (e) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", ctx);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", ctx);
    };
  }, []);

  // keyboard (scoped to the game root having focus or the play screen)
  useEffect(() => {
    const key = (e) => {
      const scr = screenRef.current;
      if (!rootRef.current) return;
      const s = sessionRef.current;
      if (e.key === "Escape") {
        if (overlayRef.current) {
          setOverlay(null);
          e.preventDefault();
          return;
        }
        if (scr === "play" && s) {
          if (s.carry) s.cancelCarry();
          else if (s.tool && s.tool !== "hand" && s.tool !== "magnifier") {
            s.selectTool("hand");
            worldRef.current.setTool(null);
          } else setOverlay("pause");
          e.preventDefault();
          bump();
        }
        return;
      }
      if (scr !== "play" || !s || overlayRef.current) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (s.carry && (e.code === "KeyQ" || e.code === "KeyE")) {
        s.rotateCarry(e.code === "KeyQ" ? -6 : 6);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [bump, setOverlay]);

  /* ============================================ GamePlayer integration */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const sv = saveRef.current;
    const s = sessionRef.current;
    if (s && sv.active && (screenRef.current === "play")) {
      P.refund(sv, s.used);
      sv.active.snap = null;
      buildJob(s.order, null);
      persist();
      toast("Job restarted — supplies used were returned to your tray", "info");
    } else if (screenRef.current === "result" || screenRef.current === "customer") {
      toMenu();
    } else if (screenRef.current !== "menu") toMenu();
  }, [restartSignal, buildJob, persist, toMenu, toast]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => {
    audio.setVolumes(save.settings.sfx, save.settings.music);
    audio.setMusic(true);
    return () => audio.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // save on tab hide / unmount
  useEffect(() => {
    const onHide = () => persistJob();
    const vis = () => {
      if (document.visibilityState === "hidden") {
        persistJob();
        if (!TEST && screenRef.current === "play" && !overlayRef.current) setOverlay("pause");
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", vis);
      persistJob();
    };
  }, [persistJob, setOverlay]);

  // test hooks needing the flow callbacks
  useEffect(() => {
    if (!TEST || !window.__drw) return;
    Object.assign(window.__drw, {
      play,
      meet: (id) => meetCustomer(typeof id === "object" ? id : ORDER_BY_ID[id]),
      accept: acceptJob,
      deliver,
      finalize,
      afterResult,
      resume: resumeJob,
      toMenu,
      setScreen,
      setOverlay,
      openGallery,
      onTool,
      onPhase,
      onPick,
      onBuy,
      persist: persistJob,
      bump,
    });
  });

  /* ============================================================ render */
  const s = sessionRef.current;
  const order = orderRef.current;
  return (
    <div className={`drw ${screen === "play" ? "is-play" : ""}`} ref={rootRef} tabIndex={-1}>
      <div className={`drw-stage ${screen === "play" && s?.tool && s.tool !== "hand" ? "tool-on" : ""}`} ref={stageRef} />
      {screen === "menu" && <MainMenu save={save} onPlay={play} onContinue={resumeJob} onBoard={() => { audio.unlock(); setScreen("board"); }} onShop={() => { audio.unlock(); setShopTab("tools"); setScreen("shop"); }} onGallery={() => { setGallerySel(null); setScreen("gallery"); }} onHow={() => setScreen("how")} onSettings={() => { setSettingsFrom("menu"); setScreen("settings"); }} onClaim={onClaim} />}
      {screen === "board" && <OrderBoard save={save} onBack={() => setScreen("menu")} onShop={() => { setShopTab("tools"); setScreen("shop"); }} onPick={(o) => { audio.unlock(); meetCustomer(o); }} />}
      {screen === "customer" && order && <CustomerDialog order={order} onAccept={acceptJob} onDecline={() => { worldRef.current.setCustomer(null); worldRef.current.setMode("menu"); setScreen("board"); }} reaction={reaction} />}
      {screen === "shop" && <ShopScreen save={save} initialTab={shopTab} onBuy={onBuy} onBack={() => setScreen("menu")} />}
      {screen === "gallery" && <GalleryScreen save={save} sel={gallerySel} onSelect={openGallery} onBack={() => { worldRef.current.clearCompare(); worldRef.current.setMode("menu"); setScreen("menu"); }} compare={compare} onCompare={onCompare} />}
      {screen === "how" && <HowTo onBack={() => setScreen("menu")} />}
      {screen === "settings" && <SettingsPanel settings={save.settings} onChange={applySettings} onBack={() => setScreen(settingsFrom)} onReset={() => { const fresh = P.freshSave(); saveRef.current = fresh; persist(); worldRef.current.setUpgrades(fresh.upgrades, fresh.gallery); toast("Progress reset", "info"); setScreen("menu"); }} />}
      {screen === "result" && result && <ResultScreen data={result} onContinue={afterResult} compare={compare} onCompare={onCompare} />}
      {screen === "play" && s && (
        <Hud
          s={s}
          save={save}
          phase={s.phase}
          tool={s.carry ? "pliers" : s.tool}
          carry={s.carry}
          live={s.liveQuality()}
          elapsed={s.elapsed}
          onTool={onTool}
          onPhase={onPhase}
          onPause={() => setOverlay("pause")}
          onShop={(tab) => { setShopTab(tab || "supplies"); setOverlay("shop"); }}
          onPick={onPick}
          onCancelCarry={() => { s.cancelCarry(); bump(); }}
          onRotateCarry={(d) => { s.rotateCarry(d); bump(); }}
          onPaint={onPaint}
          onLook={onLook}
          onCam={onCam}
          detector={detector}
          onDetector={() => { const v = !detector; setDetector(v); worldRef.current.setReveal(v); }}
          hints={save.settings.hints}
        />
      )}
      {overlay === "pause" && <PauseOverlay onResume={() => setOverlay(null)} onSettings={() => setOverlay("settings")} onMenu={toMenu} />}
      {overlay === "settings" && <div className="drw-overlay"><SettingsPanel settings={save.settings} onChange={applySettings} onBack={() => setOverlay("pause")} onReset={() => toast("Reset is only available from the main menu", "warn")} /></div>}
      {overlay === "shop" && <div className="drw-overlay shop"><ShopScreen save={save} initialTab={shopTab} onBuy={onBuy} onBack={() => setOverlay(null)} inJob /></div>}
      {levelUp && (
        <div className="drw-levelup" role="status">
          <Icon name="sparkle" />
          <div><b>Level {levelUp.level}!</b>{levelUp.unlocks.length > 0 && <small>{levelUp.unlocks.join(" · ")}</small>}</div>
        </div>
      )}
      <div className="drw-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`drw-toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}
