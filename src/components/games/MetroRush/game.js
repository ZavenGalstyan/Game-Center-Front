/**
 * Metro Rush — run controller. Owns the live run and its little state
 * machine, turns sim events into sound + world effects, tracks missions and
 * the tutorial, and publishes a HUD snapshot (~12 Hz + on every state
 * change) for React. Nothing here re-renders per frame.
 *
 *   countdown → play ⇄ paused
 *                 ↓ crash
 *               dead (revive offer) → countdown (revived) | results
 */
import { createRun, reviveRun, stepRun, THEME_LEG, activateBoard } from "./engine/run.js";
import { commitRun, liveDaily, liveMissions, powerTimes, reviveCost } from "./progress.js";
import { THEMES, themeIndex } from "./data/themes.js";
import { sound } from "./audio.js";

const COUNT_T = 2.4;
const REVIVE_T = 6;
const MAX_REVIVES = 2;

export function createGame({ world, input, getSave, setSave, onHud }) {
  const G = {
    state: "idle",
    run: null,
    countdown: 0,
    deadT: 0,
    reviveT: 0,
    spent: 0,
    committed: false,
    report: null,
    toasts: [],
    banner: null,
    hint: null,
    hintsSeen: new Set(),
    tutorial: false,
    doneMissions: new Set(),
    doneDaily: new Set(),
    hudT: 0,
    missionT: 0,
    nextToastId: 1,
    pauseReason: null,
  };
  let lastPower = {};

  const emit = () => onHud(snapshot());
  function snapshot() {
    const r = G.run;
    if (!r) return { state: G.state };
    const save = getSave();
    const powers = [];
    for (const k of ["boost", "shield", "board", "magnet", "mult"]) {
      if (r.power[k] > 0) powers.push({ kind: k, left: r.power[k], frac: r.power[k] / r.powerT[k] });
    }
    const coinsAvail = save.coins + r.stats.coins - G.spent;
    const cost = reviveCost(r.stats.revives);
    return {
      state: G.state,
      score: r.stats.score,
      coins: r.stats.coins,
      dist: Math.floor(r.dist),
      mult: r.mult || r.baseMult,
      powers,
      boards: r.boardsLeft,
      boardActive: r.power.board > 0,
      countdown: G.countdown,
      revive: { cost, can: coinsAvail >= cost && r.stats.revives < MAX_REVIVES, left: G.reviveT, max: REVIVE_T, avail: coinsAvail },
      toasts: G.toasts.slice(),
      banner: G.banner,
      hint: G.hint,
      report: G.report,
      missions: liveMissions(save, r.stats),
      daily: liveDaily(save, r.stats),
      best: save.best,
      speed: r.speed,
      theme: r.themeIndex,
      crash: r.crash,
      pauseReason: G.pauseReason,
    };
  }
  const toast = (kind, text, sub) => {
    G.toasts.push({ id: G.nextToastId++, kind, text, sub, t: 2.8 });
    if (G.toasts.length > 3) G.toasts.shift();
  };

  function start() {
    const save = getSave();
    const ti = themeIndex(save.settings.theme);
    const run = createRun({
      themeIndex: ti,
      tour: save.settings.tour,
      boards: save.charges,
      baseMult: save.mult,
      powerT: powerTimes(save),
    });
    G.run = run;
    G.spent = 0;
    G.committed = false;
    G.report = null;
    G.toasts = [];
    G.banner = { text: THEMES[ti].name, t: 3 };
    G.hint = null;
    G.hintsSeen = new Set();
    G.tutorial = !save.tutorialDone;
    G.doneMissions = new Set(liveMissions(save, run.stats).filter((m) => m.done).map((m) => m.id));
    G.doneDaily = new Set(liveDaily(save, run.stats).filter((m) => m.done).map((m) => m.id));
    lastPower = {};
    input.clear();
    world.setRun(run);
    world.setMode("game");
    sound.setKey(THEMES[ti].music);
    sound.music("game");
    G.state = "countdown";
    G.countdown = COUNT_T;
    G.pauseReason = null;
    emit();
  }

  /** fold the run into the save exactly once */
  function commit() {
    if (!G.run || G.committed) return G.report;
    G.committed = true;
    const save = getSave();
    // charges used this run
    const used = Math.max(0, save.charges - G.run.boardsLeft);
    const base = { ...save, charges: Math.max(0, save.charges - used) };
    if (G.tutorial && G.run.dist > 250) base.tutorialDone = true;
    const { save: next, report } = commitRun(base, G.run.stats, { spentRevives: G.spent });
    setSave(next);
    G.report = { ...report, stats: { ...G.run.stats }, spent: G.spent, boardsUsed: used };
    return G.report;
  }

  function finish() {
    if (G.state === "results") return;
    commit();
    G.state = "results";
    sound.music("menu");
    if (G.report?.newBest) setTimeout(() => sound.record(), 350);
    emit();
  }

  function pause(reason = "user") {
    if (G.state !== "play" && G.state !== "countdown") return;
    G.state = "paused";
    G.pauseReason = reason;
    input.clear();
    sound.stopMusic();
    emit();
  }
  function resume() {
    if (G.state !== "paused") return;
    G.state = "countdown";
    G.countdown = COUNT_T;
    G.pauseReason = null;
    sound.music("game");
    emit();
  }
  function revive() {
    const r = G.run;
    if (G.state !== "dead" || !r) return false;
    const s = snapshot();
    if (!s.revive.can) return false;
    G.spent += s.revive.cost;
    reviveRun(r);
    world.onEvent({ type: "revive" });
    sound.power("shield");
    G.state = "countdown";
    G.countdown = COUNT_T;
    sound.music("game");
    emit();
    return true;
  }
  function useBoard() {
    if (G.state !== "play" || !G.run) return;
    if (activateBoard(G.run)) handle(G.run.events);
    else if (G.run.boardsLeft <= 0 && G.run.power.board <= 0) {
      sound.deny();
      toast("info", "No hoverboards left", "Buy more in the Shop");
    }
  }

  function handle(events) {
    const r = G.run;
    for (const e of events) {
      world.onEvent(e);
      switch (e.type) {
        case "coin":
          sound.coin();
          break;
        case "jump":
          sound.jump();
          G.hintsSeen.add("jump");
          break;
        case "slide":
          sound.slide();
          G.hintsSeen.add("slide");
          break;
        case "lane":
          sound.lane();
          G.hintsSeen.add("lane");
          break;
        case "land":
          sound.land(e.hard);
          break;
        case "bump":
          sound.bump();
          break;
        case "smash":
          sound.smash();
          break;
        case "horn":
          sound.horn();
          break;
        case "whoosh":
          sound.whoosh();
          break;
        case "boardBreak":
          sound.boardBreak();
          toast("warn", "Hoverboard broke!", "It saved you from a crash");
          break;
        case "power": {
          sound.power(e.kind);
          if (e.kind === "boost") sound.boost();
          const label = { magnet: "Coin Magnet", mult: "Score ×2", shield: "Bubble Shield", board: "Hoverboard", boost: "Rocket Dash" }[e.kind];
          toast("power", label, e.fromInventory ? `${r.boardsLeft} left` : null);
          break;
        }
        case "boostEnd":
          sound.powerEnd();
          break;
        case "theme":
          world.setTheme(e.index);
          sound.setKey(THEMES[e.index].music);
          G.banner = { text: `Now entering ${THEMES[e.index].name}`, t: 3.2 };
          break;
        case "crash":
          sound.crash();
          G.state = "dead";
          G.deadT = 0;
          G.reviveT = REVIVE_T;
          sound.stopMusic();
          break;
        default:
      }
    }
    events.length = 0;
  }

  function tutorialHint() {
    const r = G.run;
    if (!G.tutorial || !r) return null;
    const p = r.p;
    let best = null;
    for (const o of r.obs) {
      if (o.hit || o.passed) continue;
      const dz = o.z0 - r.dist;
      if (dz < 0 || dz > r.speed * 1.7) continue;
      if (Math.abs(o.x - p.x) > 1.2) continue;
      if (!best || dz < best.dz) best = { o, dz };
    }
    if (!best) return null;
    const k = best.o.kind;
    const want = k === "barrier" ? "jump" : k === "overhead" ? "slide" : best.o.ramp ? null : "lane";
    if (!want) return null;
    return want;
  }

  function tick(dt) {
    const r = G.run;
    if (!r) return;
    const acts = input.take();
    for (const a of acts) {
      if (a === "pause") {
        if (G.state === "play" || G.state === "countdown") pause("user");
        else if (G.state === "paused") resume();
      }
    }
    // toasts / banner timers run in every state
    let dirty = false;
    for (const t of G.toasts) t.t -= dt;
    if (G.toasts.length && G.toasts[0].t <= 0) {
      G.toasts = G.toasts.filter((t) => t.t > 0);
      dirty = true;
    }
    if (G.banner && (G.banner.t -= dt) <= 0) {
      G.banner = null;
      dirty = true;
    }

    if (G.state === "countdown") {
      const before = Math.ceil(G.countdown / 0.8);
      G.countdown -= dt;
      const after = Math.ceil(G.countdown / 0.8);
      if (after !== before && after > 0) sound.countdown(false);
      if (G.countdown <= 0) {
        G.state = "play";
        sound.countdown(true);
        input.clear();
        dirty = true;
      }
      if (before !== after) dirty = true;
    } else if (G.state === "play") {
      const game = acts.filter((a) => a !== "pause" && a !== "board");
      if (acts.includes("board")) useBoard();
      stepRun(r, dt, game);
      handle(r.events);
      // power-ups ending
      for (const k of ["magnet", "mult", "shield", "board"]) {
        if (lastPower[k] > 0 && r.power[k] <= 0) sound.powerEnd();
        lastPower[k] = r.power[k];
      }
      // tour: build the next city before we get there
      if (r.tour && r.dist % THEME_LEG > THEME_LEG - 450) world.prepareTheme((r.themeIndex + 1) % 5);
      // missions + daily, live
      G.missionT -= dt;
      if (G.missionT <= 0) {
        G.missionT = 0.25;
        const save = getSave();
        for (const m of liveMissions(save, r.stats)) {
          if (m.done && !G.doneMissions.has(m.id)) {
            G.doneMissions.add(m.id);
            toast("mission", "Mission complete!", `${m.text} · +${m.reward}`);
            sound.mission();
          }
        }
        for (const m of liveDaily(save, r.stats)) {
          if (m.done && !G.doneDaily.has(m.id)) {
            G.doneDaily.add(m.id);
            toast("mission", "Daily challenge done!", `+${m.reward} coins`);
            sound.mission();
          }
        }
        const h = tutorialHint();
        if (h !== G.hint) {
          G.hint = h;
          dirty = true;
        }
      }
    } else if (G.state === "dead") {
      G.deadT += dt;
      if (G.deadT > 1.0) {
        const s = snapshot();
        if (!s.revive.can) finish();
        else {
          const before = Math.ceil(G.reviveT);
          G.reviveT -= dt;
          if (Math.ceil(G.reviveT) !== before) dirty = true;
          if (G.reviveT <= 0) finish();
        }
      }
    }
    G.hudT -= dt;
    if (G.hudT <= 0 || dirty) {
      G.hudT = 1 / 12;
      emit();
    }
  }

  return {
    G,
    start,
    tick,
    pause,
    resume,
    revive,
    finish,
    commit,
    useBoard,
    snapshot,
    get state() {
      return G.state;
    },
    get run() {
      return G.run;
    },
    skipRevive() {
      if (G.state === "dead") finish();
    },
    /** leave mid-run: keep what was earned */
    quit() {
      if (G.run && !G.committed) commit();
      G.state = "idle";
      G.run = null;
      sound.music("menu");
    },
  };
}
