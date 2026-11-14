/**
 * Deck of Shadows: Monster Hunt — a turn-based horror card RPG with a 3D
 * battle stage. 20 battles across 8 locations, 9 monsters (4 bosses with
 * phases), a 20-card pool, talents, card upgrades and a mid-battle save.
 *
 * engine/   framework-free rules (combat, cards, enemies, battles, progress)
 * render/   plain Three.js stage (world, environments, monsters, wolf, fx, card art)
 * ui/       React HUD and screens; audio.js is synthesised Web Audio.
 *
 * Rendered inside the shared <GamePlayer> (registered in ../registry.js):
 * `restartSignal` restarts the current battle, `muted` silences audio,
 * fullscreen belongs to GamePlayer (the canvas follows the stage size).
 *
 * DEV hooks: `?dostest=1` (+`&nosave=1`) exposes window.__dos — see tools/harness.mjs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DeckOfShadows.css";
import { createBattle, playCard, endTurn, intentInfo, canPlay, starsFor } from "./engine/combat.js";
import { BATTLE_BY_ID, BATTLES } from "./engine/battles.js";
import { ENEMIES } from "./engine/enemies.js";
import { CARDS, CARD_IDS, cardStats } from "./engine/cards.js";
import { loadProgress, saveProgress, freshProgress, profileOf, applyVictory, takeReward, buyTalent, upgradeCard, removeCard, buyCard, SAVE_KEY } from "./engine/progress.js";
import { audio } from "./audio.js";
import { BattleHud } from "./ui/Battle.jsx";
import { Loading, MainMenu, CampaignMap, Briefing, Reward, Defeat, Ending, Sanctum, Settings, Help, Pause, Tutorial, TUTORIAL_STEPS } from "./ui/Screens.jsx";
import { createWorld } from "./render/world.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("dostest");
const NOSAVE = TEST && PARAMS.has("nosave");
const mem = new Map();
const memStore = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const store = () => {
  if (NOSAVE) return memStore;
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

const ART_KEYS = [...new Set([...CARD_IDS, "dread"].map((id) => CARDS[id].art))];
const sleepRaw = (ms) => new Promise((r) => setTimeout(r, ms));

export default function DeckOfShadows({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("boot");
  const screenRef = useRef("boot");
  const [sub, setSubState] = useState(null);
  const subRef = useRef(null);
  const [loading, setLoading] = useState({ p: 0, text: null });
  const [briefId, setBriefId] = useState(1);
  const [S, setSState] = useState(null);
  const SRef = useRef(null);
  const [view, setView] = useState(null);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const [banner, setBanner] = useState(null);
  const [report, setReport] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [flying, setFlying] = useState(() => new Set());
  const [, setArtVersion] = useState(0);
  const [tut, setTut] = useState(null);
  const [webglError, setWebglError] = useState(false);
  const [qualityNow, setQualityNow] = useState(null);
  const [intro, setIntro] = useState(null);
  const token = useRef(0);
  const refs = { intent: useRef(null), numbers: useRef(null), player: useRef(null), hand: useRef(null), end: useRef(null), energy: useRef(null) };
  const settings = progress.settings;
  const artRef = useRef(null);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setSub = useCallback((s) => {
    subRef.current = s;
    setSubState(s);
  }, []);
  const setBusy = useCallback((b) => {
    busyRef.current = b;
    setBusyState(b);
  }, []);
  const setS = useCallback((s) => {
    SRef.current = s;
    setSState(s);
  }, []);
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressState(p);
    saveProgress(p, store());
  }, []);
  const setSetting = useCallback(
    (k, v) => {
      const p = progressRef.current;
      setProgress({ ...p, settings: { ...p.settings, [k]: v } });
    },
    [setProgress],
  );
  const speed = () => (TEST && window.__dosSpeed) || (progressRef.current.settings.fast ? 0.6 : 1);
  const sleep = (ms) => sleepRaw(ms * speed());

  /* ------------------------------------------------------------ world */
  useEffect(() => {
    const el = stageRef.current;
    let world;
    try {
      world = createWorldSafe(el, progressRef.current.settings, (q) => {
        setQualityNow(q);
        showBanner("Graphics lowered to keep the game smooth", "info", null, 2600);
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
    window.addEventListener("resize", fit);
    let alive = true;
    world
      .load("graveyard", "skeleton", { menu: true, onProgress: (p) => alive && setLoading({ p, text: null }) })
      .then((ok) => {
        if (!alive || !ok) return;
        if (screenRef.current === "boot") setScreen("menu");
        // card illustrations in the background
        import("./render/cardArt.js").then(({ generateCardArt, cardArtUrl }) => {
          artRef.current = cardArtUrl;
          let n = 0;
          generateCardArt(ART_KEYS, () => {
            n++;
            if (alive && (n % 4 === 0 || n === ART_KEYS.length)) setArtVersion((v) => v + 1);
          }).then(() => alive && setArtVersion((v) => v + 1));
        });
      })
      .catch((err) => {
        if (!alive) return;
        if (import.meta.env.DEV) {
          console.error("[DeckOfShadows] menu load failed", err);
          window.__dosErr = String(err?.stack || err);
        }
        setWebglError(true);
      });
    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener("resize", fit);
      token.current++;
      world.dispose();
      worldRef.current = null;
      audio.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => audio.setMusic(settings.music), [settings.music]);
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
    setQualityNow(worldRef.current?.quality() || null);
  }, [settings.quality]);
  useEffect(() => worldRef.current?.setShake(settings.shake), [settings.shake]);
  useEffect(() => worldRef.current?.setBrightness(settings.brightness), [settings.brightness]);
  useEffect(() => () => audio.dispose(), []);

  // intent marker follows the monster's head
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = refs.intent.current;
      const w = worldRef.current;
      if (!el || !w || screenRef.current !== "battle") return;
      const a = w.anchor("head");
      if (!a) return;
      // keep the marker clear of the nameplate
      const plate = rootRef.current?.querySelector(".dos-plate");
      const host = rootRef.current?.getBoundingClientRect();
      let x = a.x;
      let y = a.y;
      if (plate && host) {
        const pb = plate.getBoundingClientRect().bottom - host.top;
        const h = el.offsetHeight || 60;
        if (y < pb + h + 6) {
          // tall monster: the head sits right under the nameplate. Pushing the
          // marker down would cover the face, so park it beside the head.
          const headY = w.anchor("headCenter")?.y ?? a.y;
          x = a.x + (el.offsetWidth || 60) / 2 + host.height * 0.075;
          y = Math.max(pb + h + 6, headY + h * 0.5);
        }
      }
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const art = useCallback((k) => (artRef.current ? artRef.current(k) : null), []);

  /* ------------------------------------------------------------ banners + numbers */
  const bannerId = useRef(0);
  const bannerTimer = useRef(null);
  const showBanner = useCallback((text, kind = "", sub2 = null, ms = 1600) => {
    clearTimeout(bannerTimer.current);
    setBanner({ id: ++bannerId.current, text, kind, sub: sub2 });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const number = useCallback((text, kind, at) => {
    const host = refs.numbers.current;
    if (!host || !at) return;
    const d = document.createElement("div");
    d.className = `dos-num ${kind}`;
    d.textContent = text;
    d.style.left = `${at.x + (Math.random() - 0.5) * 50}px`;
    d.style.top = `${at.y + (Math.random() - 0.5) * 30}px`;
    host.appendChild(d);
    setTimeout(() => d.remove(), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const enemyAt = () => worldRef.current?.anchor("chest");
  const playerAt = () => {
    const r = refs.player.current?.getBoundingClientRect();
    const host = rootRef.current?.getBoundingClientRect();
    if (!r || !host) return null;
    return { x: r.left - host.left + r.width * 0.55, y: r.top - host.top };
  };
  const hurtFlash = useCallback((kind = "") => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove("hurt", "hurt-claw");
    void el.offsetWidth;
    el.classList.add("hurt");
    if (kind) el.classList.add("hurt-claw");
  }, []);

  /* ------------------------------------------------------------ battle flow */
  const saveCurrent = useCallback(
    (St) => {
      const p = progressRef.current;
      if (St && St.phase === "player") setProgress({ ...p, current: { battleId: St.battleId, S: St } });
    },
    [setProgress],
  );

  const startBattle = useCallback(
    async (id, resume = null) => {
      const w = worldRef.current;
      if (!w) return;
      const my = ++token.current;
      const B = BATTLE_BY_ID[id];
      const E = ENEMIES[B.enemy];
      audio.unlock();
      setSub(null);
      setReport(null);
      setBanner(null);
      setTut(null);
      setIntro(null);
      setLoading({ p: 0, text: `${B.title}` });
      setScreen("loading");
      w.setDesat(0);
      audio.stopAmbience();
      const ok = await w.load(B.env, E.model, { onProgress: (p) => token.current === my && setLoading({ p, text: `${B.title}` }) }).catch((err) => {
        if (import.meta.env.DEV) {
          console.error("[DeckOfShadows] battle load failed", err);
          window.__dosErr = String(err?.stack || err);
        }
        return false;
      });
      if (token.current !== my) return;
      if (!ok) {
        setWebglError(true);
        return;
      }
      const St = resume || createBattle(id, profileOf(progressRef.current), (Math.random() * 2 ** 31) | 0).S;
      setS(St);
      setView(snapOf(St));
      setFlying(new Set());
      setScreen("battle");
      audio.startAmbience(B.env, { boss: !!E.boss });
      audio.startBreathing(E.model);
      saveCurrent(St);
      if (E.boss && !resume) {
        setBusy(true);
        setIntro({ name: E.name, title: B.title });
        audio.bossIntro(E.model);
        await w.bossIntro();
        if (token.current !== my) return;
        setIntro(null);
        setBusy(false);
      } else {
        showBanner(B.title, "title", `${E.name} · ${resume ? "Battle resumed" : `Battle ${id}`}`, 2000);
      }
      if (id === 1 && !progressRef.current.tutorialDone && !resume) setTut(0);
    },
    [saveCurrent, setBusy, setS, setScreen, setSub, showBanner],
  );

  /** Replay events one by one with effects, sounds and numbers. */
  const replay = useCallback(
    async (ev, my, ctx = {}) => {
      const w = worldRef.current;
      const key = SRef.current?.E.key;
      const model = key ? ENEMIES[key].model : "skeleton";
      let castDone = !ctx.card;
      for (let i = 0; i < ev.length; i++) {
        if (token.current !== my) return false;
        const e = ev[i];
        switch (e.t) {
          case "play": {
            audio.cardPlay();
            const fx = e.fx;
            const attack = e.kind === "attack";
            if (attack) {
              audio.whoosh();
              await w?.cast(fx, 0);
              castDone = true;
            } else if (e.kind !== "curse") {
              const self = { barrier: "barrier", heal: "heal", bone: "bone", rage: "rage", pact: "pact", eclipse: "eclipse", hex: "hex" }[fx];
              if (self) w?.selfFx(self);
              if (fx === "hex") audio.hex();
              await sleep(260);
            } else await sleep(150);
            break;
          }
          case "hit": {
            setView(e.snap);
            if (e.who === "E") {
              const fx = ctx.card?.fx || "shadow";
              if (e.kind === "bleed") {
                number(`${e.loss}`, "bleed", enemyAt());
                w?.monster()?.hit(0.4, 1);
                audio.hit("blood", 0.5);
                await sleep(380);
              } else if (e.kind === "thorns") {
                number(`${e.loss}`, "thorn", enemyAt());
                w?.monster()?.hit(0.5, 1);
                await sleep(200);
              } else {
                if (ctx.card && e.i > 0) await w?.cast(fx, e.i);
                if (!castDone) {
                  await w?.cast(fx, 0);
                  castDone = true;
                }
                w?.impact(fx, e.dmg, { blocked: e.blocked, execute: e.kind === "execute" });
                audio.hit(fx, e.dmg / 10);
                if (e.loss > 0 || e.blocked === 0) number(`${e.loss}`, e.kind === "execute" ? "crit" : "dmg", enemyAt());
                if (e.blocked > 0) number(`${e.blocked}`, "blocked", enemyAt());
                if (e.loss > 0 && Math.random() < 0.6) audio.voice(model, "hurt");
                await sleep(e.n > 1 ? 260 : 420);
              }
            } else {
              // the hunter is hurt
              if (e.kind === "bleed") number(`${e.loss}`, "bleed", playerAt());
              else if (e.kind === "pact" || e.kind === "thorns") number(`${e.loss}`, "self", playerAt());
              else {
                if (e.loss > 0) number(`${e.loss}`, "hurt", playerAt());
                if (e.blocked > 0) {
                  number(`${e.blocked}`, "blocked", playerAt());
                  audio.block();
                }
                if (e.loss > 0) {
                  hurtFlash(ctx.moveFx === "claw" || ctx.moveFx === "slash" || ctx.moveFx === "scythe" ? "claw" : "");
                  audio.playerHurt(e.loss);
                  w?.playerHurt(e.loss);
                }
                if (e.i > 0) {
                  w?.enemyFx(ctx.moveFx, ctx.move);
                  audio.hit(ctx.moveFx, 0.8);
                }
              }
              await sleep(e.n > 1 ? 300 : 260);
            }
            break;
          }
          case "block":
            setView(e.snap);
            if (e.who === "P") {
              audio.shield();
              number(`+${e.n}`, "blockgain", playerAt());
            } else {
              audio.block();
              number(`+${e.n}`, "blockgain", enemyAt());
              if (!ctx.move) w?.enemyFx("shield");
            }
            await sleep(200);
            break;
          case "heal":
            setView(e.snap);
            if (e.who === "P") {
              audio.heal();
              if (ctx.card?.fx !== "heal") w?.selfFx("heal");
              number(`+${e.n}`, "heal", playerAt());
            } else {
              number(`+${e.n}`, "heal", enemyAt());
              audio.heal();
            }
            await sleep(260);
            break;
          case "status":
            setView(e.snap);
            if (e.who === "E" && ["weak", "vuln"].includes(e.key) && ctx.card) {
              if (ctx.card.fx !== "hex") w?.selfFx("hex");
              audio.hex();
            }
            if (e.who === "E" && e.key === "str") audio.buff();
            if (e.who === "P" && e.key === "str") audio.buff();
            if (e.who === "P" && e.key === "thorns" && ctx.card?.fx !== "bone") w?.selfFx("bone");
            await sleep(140);
            break;
          case "cleanse":
            setView(e.snap);
            break;
          case "energy":
            setView(e.snap);
            refs.energy.current?.classList.remove("flash");
            void refs.energy.current?.offsetWidth;
            refs.energy.current?.classList.add("flash");
            await sleep(120);
            break;
          case "draw":
            setView(e.snap);
            audio.cardDraw();
            break;
          case "shuffle":
            audio.cardDraw();
            break;
          case "dread":
            showBanner(`${e.n} Dread added to your discard pile`, "warn", null, 1500);
            audio.hex();
            await sleep(400);
            break;
          case "stage": {
            setView(e.snap);
            showBanner(e.text, "boss", null, 2600);
            audio.phase(model);
            await w?.stageShot(e.stage);
            break;
          }
          case "intent":
            break;
          case "move": {
            const m = { anim: e.anim, fx: e.fx, id: e.id };
            ctx.move = m;
            ctx.moveFx = e.fx;
            showBanner(e.name, "enemy", SRef.current?.E.name, 1500);
            audio.voice(model, ["roar", "howl"].includes(e.anim) ? "roar" : "attack");
            if (["knight", "lord"].includes(model)) audio.armor();
            const act = w?.enemyAct(m) || { impact: Promise.resolve(), done: Promise.resolve() };
            ctx.moveDone = act.done;
            await Promise.race([act.impact, sleepRaw(3500)]);
            if (["guardian", "demon"].includes(model) || ["heavy", "heavy2", "pounce"].includes(e.anim)) audio.footstep(1.3);
            audio.hit(e.fx, 1);
            break;
          }
          case "enemyDone":
            if (ctx.moveDone) await Promise.race([ctx.moveDone, sleepRaw(2500)]);
            ctx.move = null;
            ctx.moveDone = null;
            await sleep(150);
            break;
          case "enemyTurn":
            await sleep(250);
            break;
          case "endTurn":
            setView(e.snap);
            break;
          case "turn":
            setView(e.snap);
            if (e.turn > 1) {
              showBanner(`Turn ${e.turn}`, "turn", null, 900);
              audio.turn();
            }
            break;
          case "won":
            setView(e.snap);
            audio.voice(model, "roar");
            await w?.monsterDie();
            return "won";
          case "lost":
            setView(e.snap);
            return "lost";
          default:
        }
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hurtFlash, number, showBanner],
  );

  const finish = useCallback(
    async (result, St) => {
      const w = worldRef.current;
      audio.stopBreathing();
      if (result === "won") {
        audio.victory();
        const stars = starsFor(St);
        const { p, report: rep } = applyVictory(progressRef.current, St.battleId, stars);
        setProgress(p);
        if (rep.levelsGained.length) setTimeout(() => audio.levelUp(), 900);
        setReport(rep);
        await sleep(600);
        setScreen("reward");
      } else {
        audio.defeat();
        w?.setDesat(0.85);
        setProgress({ ...progressRef.current, current: null });
        await sleep(900);
        setScreen("defeat");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setProgress, setScreen],
  );

  const onPlay = useCallback(
    async (u, el) => {
      const St = SRef.current;
      if (!St || busyRef.current || subRef.current || tut != null) return;
      audio.unlock();
      const why = canPlay(St, u);
      if (why) {
        if (why === "energy") {
          audio.denied();
          showBanner("Not enough Energy", "warn", null, 1000);
          refs.energy.current?.classList.remove("shake");
          void refs.energy.current?.offsetWidth;
          refs.energy.current?.classList.add("shake");
        }
        return;
      }
      const my = token.current;
      const h = St.hand.find((x) => x.u === u);
      const card = cardStats(h.r);
      const { S: S2, ev } = playCard(St, u);
      setBusy(true);
      setHovered(null);
      // fly the card toward the monster
      const slot = el?.closest?.(".dos-slot");
      if (slot) {
        const host = rootRef.current.getBoundingClientRect();
        const r = slot.getBoundingClientRect();
        const tx = host.left + host.width / 2 - (r.left + r.width / 2);
        const ty = host.top + host.height * 0.42 - (r.top + r.height / 2);
        slot.style.setProperty("--tx", `${tx}px`);
        slot.style.setProperty("--ty", `${ty}px`);
      }
      setFlying((f) => new Set(f).add(u));
      await sleep(card.kind === "attack" ? 160 : 260);
      const res = await replay(ev, my, { card });
      if (token.current !== my) return;
      setFlying((f) => {
        const n = new Set(f);
        n.delete(u);
        return n;
      });
      setS(S2);
      setView(snapOf(S2));
      if (res === "won" || res === "lost") {
        setBusy(false);
        await finish(res, S2);
        return;
      }
      saveCurrent(S2);
      setBusy(false);
    },
    [finish, replay, saveCurrent, setBusy, setS, showBanner, tut],
  );

  const onEnd = useCallback(async () => {
    const St = SRef.current;
    if (!St || busyRef.current || St.phase !== "player" || subRef.current || tut != null) return;
    audio.unlock();
    const my = token.current;
    const { S: S2, ev } = endTurn(St);
    setBusy(true);
    setHovered(null);
    // hand sinks while the monster acts
    setS({ ...St, hand: [], discard: [...St.discard, ...St.hand], phase: "enemy" });
    const res = await replay(ev, my, {});
    if (token.current !== my) return;
    setS(S2);
    setView(snapOf(S2));
    if (res === "won" || res === "lost") {
      setBusy(false);
      await finish(res, S2);
      return;
    }
    saveCurrent(S2);
    setBusy(false);
  }, [finish, replay, saveCurrent, setBusy, setS, tut]);

  const leaveBattle = useCallback(
    (to = "map") => {
      token.current++;
      setBusy(false);
      setSub(null);
      setTut(null);
      setIntro(null);
      audio.stopAmbience();
      worldRef.current?.setDesat(0);
      setScreen(to);
    },
    [setBusy, setScreen, setSub],
  );

  /* ------------------------------------------------------------ keyboard */
  useEffect(() => {
    const kd = (e) => {
      if (screenRef.current !== "battle") return;
      if (e.code === "Escape") {
        e.preventDefault();
        setSub(subRef.current === "pause" ? null : subRef.current ? "pause" : "pause");
        return;
      }
      if (subRef.current || busyRef.current) return;
      const St = SRef.current;
      if (!St) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        const h = St.hand[+m[1] - 1];
        if (h) {
          e.preventDefault();
          const el = rootRef.current?.querySelector(`.dos-slot[data-u="${h.u}"] .dos-card`);
          onPlay(h.u, el);
        }
      } else if (e.code === "KeyE") {
        e.preventDefault();
        onEnd();
      }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [onEnd, onPlay, setSub]);

  /* ------------------------------------------------------------ GamePlayer restart */
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    const St = SRef.current;
    if (St && (screenRef.current === "battle" || screenRef.current === "defeat")) startBattle(St.battleId);
  }, [restartSignal, startBattle]);

  /* ------------------------------------------------------------ sanctum actions */
  const sanctum = useCallback(
    (kind, arg) => {
      const p = progressRef.current;
      const q = kind === "talent" ? buyTalent(p, arg) : kind === "upgrade" ? upgradeCard(p, arg) : kind === "remove" ? removeCard(p, arg) : kind === "buy" ? buyCard(p, arg) : p;
      if (q !== p) {
        audio.click();
        setProgress(q);
      } else audio.denied();
    },
    [setProgress],
  );

  /* ------------------------------------------------------------ dev hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dos = {
      state: () => SRef.current,
      view: () => view,
      screen: () => screenRef.current,
      sub: () => subRef.current,
      busy: () => busyRef.current,
      progress: () => progressRef.current,
      setProgress: (fn) => setProgress(typeof fn === "function" ? fn(progressRef.current) : fn),
      world: () => worldRef.current,
      start: (id, resume) => startBattle(id, resume),
      play: (i) => {
        const h = SRef.current?.hand[i];
        if (!h) return false;
        onPlay(h.u, rootRef.current?.querySelector(`.dos-slot[data-u="${h.u}"] .dos-card`));
        return true;
      },
      playU: (u) => onPlay(u, null),
      end: () => onEnd(),
      setScreen: (s) => setScreen(s),
      setSub: (s) => setSub(s),
      tut: () => tut,
      skipTut: () => setTut(null),
      report: () => report,
      art: (k) => art(k),
    };
    return () => {
      delete window.__dos;
    };
  });

  /* ------------------------------------------------------------ render */
  const p = progress;
  const inBattle = screen === "battle" && S && view;
  const intentNow = S && S.phase === "player" ? intentInfo(S) : null;
  const openBrief = (id) => {
    audio.unlock();
    audio.click();
    setBriefId(id);
    setScreen("brief");
  };
  return (
    <div
      ref={rootRef}
      className={`dos ${inBattle ? "in-battle" : ""} ${intro ? "intro-on" : ""} ${screen}`}
      onPointerDown={() => audio.unlock()}
      onContextMenu={(e) => e.preventDefault()}
      onAnimationEnd={(e) => {
        if (e.animationName === "dos-hurt") rootRef.current?.classList.remove("hurt", "hurt-claw");
      }}
    >
      <div ref={stageRef} className="dos-stage" />
      <div className="dos-grade" aria-hidden="true" />
      <div className="dos-hurtfx" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      {webglError && (
        <div className="dos-screen dos-dim">
          <div className="dos-panel narrow center">
            <h2>3D isn't available</h2>
            <p className="dos-lore">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {!webglError && (screen === "boot" || screen === "loading") && <Loading p={loading.p} text={screen === "loading" ? loading.text : null} />}

      {screen === "menu" && (
        <MainMenu
          progress={p}
          onContinue={() => p.current && startBattle(p.current.battleId, p.current.S)}
          onCampaign={() => {
            audio.unlock();
            audio.click();
            setScreen("map");
          }}
          onSanctum={() => setScreen("sanctum")}
          onSettings={() => setSub("settings")}
          onHelp={() => setSub("help")}
        />
      )}
      {screen === "map" && <CampaignMap progress={p} onPick={openBrief} onBack={() => setScreen("menu")} onSanctum={() => setScreen("sanctum")} />}
      {screen === "brief" && <Briefing id={briefId} progress={p} art={art} onFight={() => startBattle(briefId)} onBack={() => setScreen("map")} />}
      {screen === "sanctum" && <Sanctum progress={p} art={art} onChange={sanctum} onBack={() => setScreen(SRef.current && p.current ? "menu" : "map")} />}

      {inBattle && (
        <BattleHud
          S={S}
          view={view}
          intent={intentNow}
          busy={busy}
          art={art}
          hovered={hovered}
          setHovered={setHovered}
          flying={flying}
          onPlay={onPlay}
          onEnd={onEnd}
          onPause={() => setSub("pause")}
          banner={banner}
          intentRef={refs.intent}
          numbersRef={refs.numbers}
          playerRef={refs.player}
          handRef={refs.hand}
          endRef={refs.end}
          energyRef={refs.energy}
          tutorial={tut}
        />
      )}
      {!inBattle && banner && screen !== "loading" && (
        <div key={banner.id} className={`dos-banner float ${banner.kind || ""}`}>
          <span>{banner.text}</span>
        </div>
      )}
      {intro && (
        <div className="dos-intro">
          <span className="k">{intro.title}</span>
          <span className="n">{intro.name}</span>
        </div>
      )}
      {inBattle && tut != null && (
        <Tutorial
          step={tut}
          onNext={() => {
            if (tut + 1 >= TUTORIAL_STEPS) {
              setTut(null);
              setProgress({ ...progressRef.current, tutorialDone: true });
            } else setTut(tut + 1);
          }}
          onSkip={() => {
            setTut(null);
            setProgress({ ...progressRef.current, tutorialDone: true });
          }}
        />
      )}

      {screen === "reward" && report && (
        <Reward
          report={report}
          progress={p}
          art={art}
          onPick={(id) => setProgress(takeReward(progressRef.current, id))}
          onContinue={() => {
            audio.stopAmbience();
            if (report.final) setScreen("ending");
            else {
              setBriefId(Math.min(BATTLES.length, report.battleId + 1));
              setScreen("map");
            }
          }}
        />
      )}
      {screen === "defeat" && S && <Defeat battleId={S.battleId} onRetry={() => startBattle(S.battleId)} onMap={() => leaveBattle("map")} onSanctum={() => leaveBattle("sanctum")} />}
      {screen === "ending" && <Ending progress={p} onMenu={() => setScreen("menu")} />}

      {sub === "pause" && inBattle && (
        <Pause
          battleId={S.battleId}
          onResume={() => setSub(null)}
          onRestart={() => startBattle(S.battleId)}
          onSettings={() => setSub("settings")}
          onHelp={() => setSub("help")}
          onQuit={() => leaveBattle("map")}
        />
      )}
      {sub === "settings" && (
        <Settings
          settings={settings}
          quality={qualityNow}
          set={setSetting}
          onReset={() => {
            try {
              store()?.removeItem(SAVE_KEY);
            } catch {
              /* ignore */
            }
            setProgress({ ...freshProgress(), settings: progressRef.current.settings });
          }}
          onBack={() => setSub(screenRef.current === "battle" ? "pause" : null)}
        />
      )}
      {sub === "help" && <Help onBack={() => setSub(screenRef.current === "battle" ? "pause" : null)} />}
    </div>
  );
}

function snapOf(S) {
  return {
    php: S.P.hp,
    pmax: S.P.maxHp,
    pblock: S.P.block,
    pst: { ...S.P.st },
    energy: S.P.energy,
    ehp: S.E.hp,
    emax: S.E.maxHp,
    eblock: S.E.block,
    est: { ...S.E.st },
  };
}

function createWorldSafe(el, settings, onQuality) {
  return createWorld(el, { quality: settings.quality, shake: settings.shake, brightness: settings.brightness, onQuality, manual: false, preserve: TEST });
}
