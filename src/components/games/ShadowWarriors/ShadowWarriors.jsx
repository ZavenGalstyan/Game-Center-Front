/**
 * Shadow Warriors: Rise of Legends — 2D silhouette martial-arts fighter.
 *
 * engine/ is the deterministic 60 Hz combat simulation (fighters, AI,
 * bosses); render/ draws it on one canvas; this component owns the single
 * rAF loop (fixed timestep accumulator), keyboard + touch input, menus, HUD
 * and the saved campaign. Lives inside the shared <GamePlayer> (registered
 * in ../registry.js), which supplies `restartSignal` and `muted`.
 *
 * HUD values are written straight to DOM refs each frame — no per-frame
 * React state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DT } from "./engine/constants.js";
import { createFight, stepFight } from "./engine/fight.js";
import { BOSSES } from "./engine/bosses.js";
import { CHAPTERS, battleById } from "./data/campaign.js";
import { abilityById, weaponById, armorById } from "./data/gear.js";
import { fightConfig, PLAYER_LOOK } from "./data/loadout.js";
import { createView, resizeView, updateCamera } from "./render/view.js";
import { createArena } from "./render/arenas.js";
import { createFx, fxEvent, stepFx, updateTrails } from "./render/fx.js";
import { drawScene, drawBackdrop } from "./render/draw.js";
import { loadSave, storeSave, freshSave, applyResult, buy, upgrade, equip, isBattleOpen, LAST_BATTLE } from "./progress.js";
import { unlockAudio, playSfx, setMusic, setMasterMute, stopAudio } from "./audio.js";
import { MainMenu, CampaignMap, PreFight, ResultScreen, Shop, Settings, Help, Ending } from "./screens.jsx";
import "./ShadowWarriors.css";

const KEYMAP = {
  KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", KeyW: "u", ArrowUp: "u", Space: "u", KeyS: "d", ArrowDown: "d",
  KeyJ: "p", KeyK: "k", KeyL: "w", ShiftLeft: "b", ShiftRight: "b", KeyU: "s", KeyI: "s",
};
const FIGHT_SCREENS = new Set(["fight", "pause", "fightSettings"]);
const ARENA_IDS = ["temple", "forest", "rooftops", "desert", "snow"];

const TIPS = {
  1: "J punch · K kick · L heavy strike · Shift block. Press J J J for a string.",
  2: "Hold Shift + S to block LOW attacks. Standing block stops highs, mids and jump attacks.",
  3: "Tap Shift right before a hit lands to PARRY and stagger your opponent.",
  4: "Double-tap A or D to dash. Forward + L is your heavy weapon attack.",
  5: "Watch the yellow stamina bar — attacks and blocking drain it. Purple fills your Shadow ability (U).",
  6: "Crouch under high attacks, then punish while they recover.",
};
const LOSS_TIPS = [
  "Block low (Shift + S) against sweeps and low weapon strikes.",
  "Don't block forever — stamina runs out and your guard breaks.",
  "Strike while the enemy recovers from a missed attack.",
  "Upgrade your weapon and armor in the Dojo — every level counts.",
  "Keep at the tip of your weapon's reach: hit them where they can't hit you.",
  "Tap block just before a hit for a parry, then punish.",
  "Use your Shadow ability when the purple meter is full.",
];

const blankKeys = () => ({ l: false, r: false, u: false, d: false, p: false, k: false, w: false, b: false, s: false });

export default function ShadowWarriors({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [save, setSave] = useState(loadSave);
  const saveRef = useRef(save);
  saveRef.current = save;
  const settings = save.settings;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // screens: menu | map | prefight | fight | pause | fightSettings | result | shop | settings | help | ending
  const [screen, setScreenState] = useState("menu");
  const screenRef = useRef(screen);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const [backTo, setBackTo] = useState("menu");
  const [chapter, setChapter] = useState(() => Math.min(4, Math.floor(Math.min(LAST_BATTLE - 1, save.cleared) / 10)));
  const [battleId, setBattleId] = useState(() => Math.min(LAST_BATTLE, save.cleared + 1));
  const battleRef = useRef(battleId);
  const [result, setResult] = useState(null);
  const [shopFlash, setShopFlash] = useState(null);
  const [touchSeen, setTouchSeen] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);

  // live game objects (mutable, never trigger renders)
  const game = useRef({ F: null, view: createView(), arena: null, fx: createFx(), menuF: null, menuArena: null, menuFx: createFx(), endT: 0, reported: false, tipT: 0 });
  const input = useRef({ keys: new Set(), touch: blankKeys(), stick: { l: false, r: false, u: false, d: false } });
  const hud = useRef({});
  const activeRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const persist = useCallback((next) => {
    storeSave(next);
    saveRef.current = next;
    setSave(next);
  }, []);

  const sfx = useCallback((name) => {
    if (mutedRef.current || !settingsRef.current.sfx) return;
    playSfx(name);
  }, []);

  const updateSettings = useCallback((patch) => {
    const s = saveRef.current;
    persist({ ...s, settings: { ...s.settings, ...patch } });
  }, [persist]);

  // ---------------------------------------------------------------- menu backdrop (sparring demo)
  const makeMenuScene = useCallback((ch) => {
    const g = game.current;
    const sv = saveRef.current;
    const cfg = {
      player: { name: "Shadow", weapon: weaponById(sv.eq.weapon), armor: armorById(sv.eq.armor), look: PLAYER_LOOK },
      enemy: { name: "Rival", weapon: weaponById(["staff", "chain", "twin", "hammer", "katana"][ch]), armor: armorById("leather"), look: battleById(ch * 10 + 10).look, hpMul: 50 },
      ai: { style: "duelist", level: 0.35, aggression: 0.45 },
      playerAI: { style: "duelist", level: 0.35, aggression: 0.45 },
      seed: 99 + ch,
      time: 9999,
      winsNeeded: 99,
    };
    cfg.player.hpMul = 50;
    g.menuF = createFight(cfg);
    g.menuArena = createArena(ARENA_IDS[ch], 1 + (ch % 2), 3 + ch);
    g.menuCh = ch;
  }, []);

  // ---------------------------------------------------------------- battle flow
  const startBattle = useCallback((id) => {
    const b = battleById(id);
    if (!b || !isBattleOpen(saveRef.current, id)) return;
    unlockAudio();
    activeRef.current = true;
    const g = game.current;
    g.F = createFight(fightConfig(saveRef.current, b));
    g.arena = createArena(CHAPTERS[b.chapter].arena, b.variant, id * 7 + 1);
    g.fx = createFx();
    g.endT = 0;
    g.reported = false;
    g.tipT = settingsRef.current.hints && TIPS[id] ? 7 : 0;
    g.acc = 0;
    updateCamera(g.view, g.F.p1, g.F.p2, 0, true);
    battleRef.current = id;
    setBattleId(id);
    setResult(null);
    input.current.keys.clear();
    Object.assign(input.current.touch, blankKeys());
    setScreen("fight");
    persist({ ...saveRef.current, last: id });
    sfx("gong");
  }, [persist, setScreen, sfx]);

  const finishBattle = useCallback(() => {
    const g = game.current;
    const F = g.F;
    if (!F || g.reported) return;
    g.reported = true;
    const won = F.winner === F.p1;
    const lostRounds = F.roundLog.filter((r) => r.winner === 1).length;
    const perfect = won && lostRounds === 0 && F.roundLog.filter((r) => r.winner === 0).every((r) => r.perfect);
    const time = F.roundLog.reduce((t, r) => t + (r.time || 0), 0);
    const id = battleRef.current;
    const out = applyResult(saveRef.current, id, { won, perfect, time });
    persist(out.save);
    const p = F.p1.stats;
    setResult({
      id,
      won,
      perfect,
      coins: out.coins,
      unlocks: out.unlocks,
      ability: out.ability,
      dmg: p.dmg,
      combo: p.maxCombo,
      parries: p.parries,
      rounds: `${F.wins[0]}–${F.wins[1]}`,
      tip: LOSS_TIPS[(id + saveRef.current.stats.losses) % LOSS_TIPS.length],
      finished: won && id === LAST_BATTLE,
    });
    setChapter(battleById(Math.min(LAST_BATTLE, won ? id + 1 : id)).chapter);
    setScreen("result");
    sfx(won ? "victory" : "defeat");
  }, [persist, setScreen, sfx]);

  const togglePause = useCallback(() => {
    const sc = screenRef.current;
    if (sc === "fight") {
      setScreen("pause");
      input.current.keys.clear();
      Object.assign(input.current.touch, blankKeys());
    } else if (sc === "pause") setScreen("fight");
  }, [setScreen]);

  const quitToMap = useCallback(() => {
    game.current.F = null;
    setScreen("map");
  }, [setScreen]);

  // GamePlayer "Restart" → restart the current battle
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (FIGHT_SCREENS.has(screenRef.current) || screenRef.current === "result") startBattle(battleRef.current);
  }, [restartSignal, startBattle]);

  // ---------------------------------------------------------------- audio state
  useEffect(() => {
    setMasterMute(muted);
  }, [muted]);
  useEffect(() => {
    const inFight = FIGHT_SCREENS.has(screen) || screen === "result";
    const b = battleById(battleId);
    const ch = inFight && b ? b.chapter : chapter;
    const boss = inFight && !!b?.boss;
    setMusic(settings.music && !muted, ch, boss);
  }, [settings.music, muted, screen, battleId, chapter]);
  useEffect(() => () => stopAudio(), []);

  // ---------------------------------------------------------------- loop
  const finishRef = useRef(finishBattle);
  finishRef.current = finishBattle;
  const touchSeenRef = useRef(touchSeen);
  touchSeenRef.current = touchSeen;
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const g = game.current;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // phones/tablets: 1.5× is visually identical for silhouettes and far cheaper to fill
      const coarse = window.matchMedia?.("(pointer: coarse)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      resizeView(g.view, r.width, r.height, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt < 0) dt = 0;
      tick(dt);
    };
    const tick = (dt) => {
      const sc = screenRef.current;
      const v = g.view;
      if (FIGHT_SCREENS.has(sc) || sc === "result") {
        const F = g.F;
        if (!F) return;
        const running = sc === "fight";
        if (running) {
          composeInput(F.p1);
          const scale = F.slowmo > 0 ? 0.35 : 1;
          g.acc = (g.acc || 0) + dt * scale;
          let n = 0;
          while (g.acc >= DT && n < 6) {
            stepFight(F);
            updateTrails(g.fx, F);
            handleEvents(F, g.fx, v);
            g.acc -= DT;
            n++;
          }
          if (n >= 6) g.acc = 0;
          if (F.phase === "over") {
            g.endT += dt;
            if (g.endT > 1.8 && !g.reported) finishRef.current();
          }
        } else if (sc === "result" && F.phase === "over") {
          // keep the victory pose breathing behind the result card
          g.acc = (g.acc || 0) + dt;
          while (g.acc >= DT) {
            stepFight(F);
            F.events.length = 0;
            g.acc -= DT;
          }
        }
        stepFx(g.fx, running ? dt : 0);
        const focus = F.phase === "ko" && F.t < 70 && F.roundWinner ? (F.roundWinner === F.p1 ? F.p2 : F.p1) : null;
        updateCamera(v, F.p1, F.p2, dt, false, focus);
        drawScene(ctx, v, F, g.arena, g.fx, settingsRef.current, running ? dt : 0);
        updateHud(F, dt);
        return;
      }
      // menus: sparring backdrop
      const ch = sc === "map" || sc === "prefight" ? chapterRef.current : g.menuCh ?? chapterRef.current;
      if (!g.menuF || (g.menuCh !== ch && (sc === "map" || sc === "prefight"))) makeMenuScene(ch);
      const F = g.menuF;
      g.macc = (g.macc || 0) + dt;
      let n = 0;
      while (g.macc >= DT && n < 4) {
        stepFight(F);
        updateTrails(g.menuFx, F);
        for (const e of F.events) fxEvent(g.menuFx, v, e, { shake: false, P: g.menuArena.P });
        F.events.length = 0;
        g.macc -= DT;
        n++;
      }
      if (n >= 4) g.macc = 0;
      // keep the demo going forever
      for (const f of F.fighters) if (f.hp < f.maxHp * 0.5) f.hp = f.maxHp;
      stepFx(g.menuFx, dt);
      updateCamera(v, F.p1, F.p2, dt);
      drawBackdrop(ctx, v, F, g.menuArena, g.menuFx, dt);
    };
    g.tick = tick;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const composeInput = (f) => {
    const k = input.current.keys;
    const t = input.current.touch;
    const st = input.current.stick;
    const inp = f.inp;
    for (const key of ["l", "r", "u", "d", "p", "k", "w", "b", "s"]) inp[key] = t[key] || !!st[key];
    for (const code of k) {
      const m = KEYMAP[code];
      if (m) inp[m] = true;
    }
    if (inp.l && inp.r) inp.l = inp.r = false;
  };

  const handleEvents = (F, fx, v) => {
    const P = game.current.arena.P;
    const shake = settingsRef.current.shake;
    for (const e of F.events) {
      fxEvent(fx, v, e, { shake, P });
      switch (e.type) {
        case "hit":
          sfx(e.sfx || "punch");
          if (e.combo >= 2) showCombo(e.by.side, e.combo);
          break;
        case "block":
          sfx("block");
          break;
        case "parry":
          sfx("parry");
          break;
        case "guardbreak":
          sfx("guardbreak");
          break;
        case "swing":
          sfx(e.sfx === "heavy" ? "swingHeavy" : "swing");
          break;
        case "jump":
        case "land":
        case "dash":
        case "thud":
        case "clash":
          sfx(e.type);
          break;
        case "special":
          sfx("special");
          break;
        case "buff":
          sfx("buff");
          break;
        case "telegraph":
          sfx("telegraph");
          if (e.who === F.p2 && F.p2.boss) announce(F.p2.set[e.move]?.name?.toUpperCase() || "", "sw-ann--warn");
          break;
        case "zone":
          if (e.kind === "geyser") sfx("geyser");
          break;
        case "phase":
          sfx("phase");
          announce(e.phase === 3 ? "FINAL PHASE" : "PHASE 2", "sw-ann--warn");
          break;
        case "tired":
          if (e.who === F.p1) {
            sfx("tired");
            flashBar("st");
          }
          break;
        case "nometer":
          if (e.who === F.p1) flashBar("meter");
          break;
        case "round":
          announce(F.p2.boss && e.round === 1 ? "BOSS FIGHT" : F.round >= 3 && F.wins[0] === F.wins[1] ? "FINAL ROUND" : `ROUND ${e.round}`, "");
          renderPips(F);
          break;
        case "fight":
          sfx("fight");
          announce("FIGHT!", "sw-ann--fight");
          break;
        case "ko":
          sfx("ko");
          announce(e.how === "draw" ? "DRAW" : e.how === "time" ? "TIME!" : e.perfect ? "PERFECT" : "K.O.", e.how === "ko" ? "sw-ann--ko" : "");
          renderPips(F);
          break;
        case "over":
          announce(e.winner === F.p1 ? "VICTORY" : "DEFEAT", e.winner === F.p1 ? "sw-ann--win" : "sw-ann--lose");
          break;
      }
    }
    F.events.length = 0;
  };

  // ---------------------------------------------------------------- HUD writes (refs only)
  const announce = (text, cls) => {
    const el = hud.current.ann;
    if (!el) return;
    el.textContent = text;
    el.className = "sw-ann";
    void el.offsetWidth;
    el.className = `sw-ann sw-ann--show ${cls}`;
  };
  const showCombo = (side, n) => {
    const el = hud.current[`combo${side}`];
    if (!el) return;
    el.textContent = `${n} HIT${n > 1 ? "S" : ""}`;
    el.classList.remove("sw-combo--show");
    void el.offsetWidth;
    el.classList.add("sw-combo--show");
  };
  const flashBar = (k) => {
    const el = hud.current[`${k}0wrap`];
    if (!el) return;
    el.classList.remove("sw-bar--flash");
    void el.offsetWidth;
    el.classList.add("sw-bar--flash");
  };
  const renderPips = (F) => {
    for (const side of [0, 1]) {
      const el = hud.current[`pips${side}`];
      if (!el) continue;
      const need = F.winsNeeded;
      if (need <= 1) {
        el.innerHTML = "";
        continue;
      }
      let h = "";
      for (let i = 0; i < need; i++) h += `<i class="${F.wins[side] > i ? "on" : ""}"></i>`;
      el.innerHTML = h;
    }
  };
  const updateHud = (F, dt) => {
    const h = hud.current;
    if (!h.hp0) return;
    for (const f of F.fighters) {
      const i = f.side;
      const hpK = Math.max(0, f.hp / f.maxHp);
      h[`hp${i}`].style.transform = `scaleX(${hpK.toFixed(4)})`;
      const tr = h[`trail${i}`];
      tr._v = tr._v == null ? hpK : tr._v > hpK ? Math.max(hpK, tr._v - dt * 0.35) : hpK;
      tr.style.transform = `scaleX(${tr._v.toFixed(4)})`;
      h[`st${i}`].style.transform = `scaleX(${Math.max(0, f.st / f.maxSt).toFixed(4)})`;
      const mk = f.meter / 100;
      h[`meter${i}`].style.transform = `scaleX(${mk.toFixed(4)})`;
      const ready = f.ability && f.meter >= f.ability.cost;
      if (h[`mwrap${i}`]._r !== ready) {
        h[`mwrap${i}`]._r = ready;
        h[`mwrap${i}`].classList.toggle("sw-meter--ready", !!ready);
      }
      const low = f.st < 20;
      if (h[`st${i}wrap`]._l !== low) {
        h[`st${i}wrap`]._l = low;
        h[`st${i}wrap`].classList.toggle("sw-bar--low", low);
      }
    }
    const tt = Math.ceil(F.timer);
    if (h._t !== tt) {
      h.timer.textContent = h._t = tt;
      h.timer.classList.toggle("sw-timer--low", tt <= 10);
    }
    if (F.p2.boss && h.phase) {
      const ph = F.p2.boss.phase;
      if (h._ph !== ph) {
        h._ph = ph;
        h.phase.textContent = `PHASE ${ph}/3`;
      }
    }
    const g = game.current;
    if (g.tipT > 0 && h.tip) {
      g.tipT -= dt;
      h.tip.classList.toggle("sw-tip--show", g.tipT > 0 && F.phase !== "over");
    }
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const down = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const sc = screenRef.current;
      // outside a fight, only react if the game was the last thing clicked — Space must still scroll the page
      if (sc !== "fight" && !activeRef.current) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (sc === "fight" || sc === "pause") {
          e.preventDefault();
          if (!e.repeat) togglePause();
        }
        return;
      }
      if (sc === "fight") {
        if (KEYMAP[e.code]) {
          e.preventDefault();
          input.current.keys.add(e.code);
          unlockAudio();
        }
        return;
      }
      if (sc === "pause" && e.code === "Enter" && !e.repeat) {
        e.preventDefault();
        togglePause();
      }
      if ((sc === "pause" || sc === "result") && (e.code === "Space" || e.code.startsWith("Arrow"))) e.preventDefault();
    };
    const up = (e) => {
      input.current.keys.delete(e.code);
      if (KEYMAP[e.code] && screenRef.current === "fight") e.preventDefault();
    };
    const pointer = (e) => {
      activeRef.current = !!wrapRef.current?.contains(e.target);
    };
    const clear = () => {
      input.current.keys.clear();
      Object.assign(input.current.touch, blankKeys());
      Object.assign(input.current.stick, { l: false, r: false, u: false, d: false });
    };
    const blur = () => {
      clear();
      if (screenRef.current === "fight") togglePause();
    };
    const vis = () => document.hidden && blur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("focusin", pointer, true);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("focusin", pointer, true);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [togglePause]);

  // ---------------------------------------------------------------- touch controls
  const touchBtn = (name) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      input.current.touch[name] = true;
      e.currentTarget.classList.add("sw-tbtn--on");
      unlockAudio();
    },
    onPointerUp: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sw-tbtn--on");
    },
    onPointerCancel: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sw-tbtn--on");
    },
    onLostPointerCapture: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sw-tbtn--on");
    },
    onContextMenu: (e) => e.preventDefault(),
  });
  const stickRef = useRef(null);
  const stickState = useRef({ id: null, cx: 0, cy: 0, r: 1 });
  const setStick = (dx, dy) => {
    const st = input.current.stick;
    const S = stickState.current;
    const nx = dx / S.r;
    const ny = dy / S.r;
    st.r = nx > 0.38;
    st.l = nx < -0.38;
    st.d = ny > 0.5;
    st.u = ny < -0.62;
    const knob = stickRef.current?.firstChild;
    if (knob) {
      const m = Math.min(1, Math.hypot(nx, ny));
      const a = Math.atan2(ny, nx);
      knob.style.transform = `translate(${(Math.cos(a) * m * S.r * 0.55).toFixed(1)}px, ${(Math.sin(a) * m * S.r * 0.55).toFixed(1)}px)`;
    }
  };
  const stickHandlers = {
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const r = el.getBoundingClientRect();
      const S = stickState.current;
      S.id = e.pointerId;
      S.cx = r.left + r.width / 2;
      S.cy = r.top + r.height / 2;
      S.r = r.width / 2;
      setStick(e.clientX - S.cx, e.clientY - S.cy);
      unlockAudio();
    },
    onPointerMove: (e) => {
      const S = stickState.current;
      if (S.id !== e.pointerId) return;
      setStick(e.clientX - S.cx, e.clientY - S.cy);
    },
    onPointerUp: (e) => {
      if (stickState.current.id !== e.pointerId) return;
      stickState.current.id = null;
      setStick(0, 0);
    },
    onPointerCancel: () => {
      stickState.current.id = null;
      setStick(0, 0);
    },
    onLostPointerCapture: () => {
      stickState.current.id = null;
      setStick(0, 0);
    },
  };
  useEffect(() => {
    const onTouch = () => setTouchSeen(true);
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);
  const showTouch = settings.touch === "on" || (settings.touch === "auto" && touchSeen);

  // ---------------------------------------------------------------- shop actions
  const shopAct = (fn, okText) => (kind, id) => {
    const r = fn(saveRef.current, kind, id);
    if (r.ok) {
      persist(r.save);
      sfx(fn === equip ? "click" : "buy");
      setShopFlash({ ok: true, text: okText(kind, id, r.save) });
    } else setShopFlash({ ok: false, text: r.why });
  };
  const itemName = (kind, id) => (kind === "weapon" ? weaponById(id).name : kind === "armor" ? armorById(id).name : abilityById(id)?.name);
  const onBuy = shopAct(buy, (k, id) => `Bought ${itemName(k, id)} — equipped.`);
  const onUpgrade = shopAct(upgrade, (k, id, s) => `${itemName(k, id)} upgraded to ${k === "ability" ? `Lv ${s.lv[k][id] + 1}` : `+${s.lv[k][id]}`}.`);
  const onEquip = shopAct(equip, (k, id) => `${itemName(k, id)} equipped.`);
  const openShop = (from) => {
    setShopFlash(null);
    setBackTo(from);
    setScreen("shop");
  };

  // DEV-only QA hook: ?swtest=1 exposes the live game.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]swtest=1/.test(window.location.search)) {
    window.__sw = {
      game: game.current,
      input: input.current,
      startBattle,
      setScreen,
      save: () => saveRef.current,
      setSave: (fn) => persist(fn(saveRef.current)),
      screen: () => screenRef.current,
      advance: (frames = 1) => {
        for (let i = 0; i < frames; i++) game.current.tick?.(DT);
      },
    };
  }

  const b = battleById(battleId);
  const F = game.current.F;
  const inFightUi = FIGHT_SCREENS.has(screen) || screen === "result";
  const boss = b?.boss ? BOSSES[b.boss] : null;

  // ---------------------------------------------------------------- render
  return (
    <div className="sw" ref={wrapRef} onContextMenu={(e) => e.preventDefault()} style={{ "--chc": CHAPTERS[(inFightUi ? b?.chapter : chapter) ?? 0].color }}>
      <canvas ref={canvasRef} className="sw-canvas" aria-label="Shadow Warriors game" />
      <div className="sw-vignette" aria-hidden="true" />

      {inFightUi && F && (
        <div className="sw-hud">
          <div className="sw-hud__top">
            {[0, 1].map((side) => {
              const f = side === 0 ? F.p1 : F.p2;
              const name = side === 0 ? "Shadow" : boss ? boss.name.split(",")[0] : b.name;
              return (
                <div key={side} className={`sw-fbar sw-fbar--${side}`}>
                  <div className="sw-fbar__name">
                    <span>{name}</span>
                    <span className="sw-pips" ref={(el) => (hud.current[`pips${side}`] = el)} />
                  </div>
                  <div className="sw-hpbar">
                    <i className="sw-hpbar__trail" ref={(el) => (hud.current[`trail${side}`] = el)} />
                    <i className="sw-hpbar__fill" ref={(el) => (hud.current[`hp${side}`] = el)} />
                  </div>
                  <div className="sw-subbars">
                    <div className="sw-stbar" ref={(el) => (hud.current[`st${side}wrap`] = el)}>
                      <i ref={(el) => (hud.current[`st${side}`] = el)} />
                    </div>
                    <div className="sw-meter" ref={(el) => (hud.current[`mwrap${side}`] = el)} title={f.ability ? `${f.ability.name} (${f.ability.cost})` : "No ability"}>
                      <i ref={(el) => (hud.current[`meter${side}`] = el)} />
                      {f.ability && <span style={side === 0 ? { left: `${f.ability.cost}%` } : { right: `${f.ability.cost}%` }} />}
                    </div>
                  </div>
                  <div className={`sw-combo sw-combo--${side}`} ref={(el) => (hud.current[`combo${side}`] = el)} />
                </div>
              );
            })}
            <div className="sw-hud__mid">
              <div className="sw-timer" ref={(el) => (hud.current.timer = el)}>{Math.ceil(F.timer)}</div>
              {boss && <div className="sw-phase" ref={(el) => (hud.current.phase = el)}>PHASE 1/3</div>}
            </div>
          </div>
          {screen === "fight" && (
            <button type="button" className="sw-icon sw-pausebtn" aria-label="Pause" onClick={togglePause}>
              <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
          )}
          <div className="sw-ann" ref={(el) => (hud.current.ann = el)} />
          {TIPS[battleId] && <div className="sw-tip" ref={(el) => (hud.current.tip = el)}>{touchSeen ? TIPS[battleId].replace(/J punch · K kick · L heavy strike · Shift block\. Press J J J/, "Punch, Kick, Weapon, Block buttons. Tap Punch three times").replace(/Shift \+ S/, "Block + stick down").replace(/Tap Shift/, "Tap Block").replace(/Double-tap A or D/, "Flick the stick twice").replace(/Forward \+ L/, "Stick forward + Weapon").replace(/\(U\)/, "(Shadow button)") : TIPS[battleId]}</div>}
        </div>
      )}

      {screen === "fight" && showTouch && (
        <div className="sw-touch">
          <div className="sw-stick" ref={stickRef} {...stickHandlers} onContextMenu={(e) => e.preventDefault()}>
            <i />
          </div>
          <div className="sw-touch__right">
            <button type="button" className="sw-tbtn sw-tbtn--s" aria-label="Shadow ability" {...touchBtn("s")}>Shadow</button>
            <button type="button" className="sw-tbtn sw-tbtn--u" aria-label="Jump" {...touchBtn("u")}>Jump</button>
            <button type="button" className="sw-tbtn sw-tbtn--b" aria-label="Block" {...touchBtn("b")}>Block</button>
            <button type="button" className="sw-tbtn sw-tbtn--w" aria-label="Weapon" {...touchBtn("w")}>Weapon</button>
            <button type="button" className="sw-tbtn sw-tbtn--k" aria-label="Kick" {...touchBtn("k")}>Kick</button>
            <button type="button" className="sw-tbtn sw-tbtn--p" aria-label="Punch" {...touchBtn("p")}>Punch</button>
          </div>
        </div>
      )}

      {screen === "menu" && (
        <MainMenu
          save={save}
          onContinue={() => {
            const id = Math.min(LAST_BATTLE, save.cleared + 1);
            setChapter(battleById(id).chapter);
            setBattleId(id);
            setScreen("prefight");
          }}
          onMap={() => setScreen("map")}
          onShop={() => openShop("menu")}
          onSettings={() => { setBackTo("menu"); setScreen("settings"); }}
          onHelp={() => { setBackTo("menu"); setScreen("help"); }}
        />
      )}
      {screen === "map" && (
        <CampaignMap
          save={save}
          chapter={chapter}
          setChapter={setChapter}
          onPick={(id) => { setBattleId(id); setScreen("prefight"); }}
          onBack={() => setScreen("menu")}
          onShop={() => openShop("map")}
        />
      )}
      {screen === "prefight" && b && (
        <PreFight save={save} battleId={battleId} onFight={() => startBattle(battleId)} onShop={() => openShop("prefight")} onBack={() => setScreen("map")} />
      )}
      {screen === "shop" && <Shop save={save} onBuy={onBuy} onUpgrade={onUpgrade} onEquip={onEquip} onBack={() => setScreen(backTo)} flash={shopFlash} />}
      {screen === "settings" && <Settings save={save} update={updateSettings} onBack={() => setScreen(backTo)} muted={muted} onReset={() => { persist({ ...freshSave(), settings: saveRef.current.settings }); setChapter(0); setBattleId(1); }} />}
      {screen === "fightSettings" && <Settings save={save} update={updateSettings} onBack={() => setScreen("pause")} muted={muted} inFight />}
      {screen === "help" && <Help onBack={() => setScreen(backTo)} />}
      {screen === "ending" && <Ending onDone={() => setScreen("map")} />}

      {screen === "pause" && (
        <div className="sw-screen sw-screen--dim">
          <div className="sw-panel sw-panel--narrow">
            <h3 className="sw-panel__title">Paused</h3>
            <p className="sw-note">Battle {battleId} · {boss ? boss.name : `${b.name}, ${b.title}`}</p>
            <button type="button" className="sw-btn sw-btn--primary" onClick={togglePause}>Resume</button>
            <button type="button" className="sw-btn" onClick={() => startBattle(battleId)}>Restart Battle</button>
            <button type="button" className="sw-btn sw-btn--ghost" onClick={() => setScreen("fightSettings")}>Settings</button>
            <button type="button" className="sw-btn sw-btn--ghost" onClick={quitToMap}>Quit to Map</button>
            <p className="sw-note sw-note--keys">J punch · K kick · L weapon · Shift block · U ability · double-tap to dash</p>
          </div>
        </div>
      )}

      {screen === "result" && result && (
        <ResultScreen
          result={result}
          onNext={() => {
            if (result.finished) setScreen("ending");
            else {
              const id = Math.min(LAST_BATTLE, result.id + 1);
              setBattleId(id);
              setChapter(battleById(id).chapter);
              setScreen("prefight");
            }
          }}
          onRetry={() => startBattle(result.id)}
          onMap={() => { game.current.F = null; setScreen(result.finished ? "ending" : "map"); }}
          onShop={() => { game.current.F = null; openShop("map"); }}
        />
      )}
    </div>
  );
}
