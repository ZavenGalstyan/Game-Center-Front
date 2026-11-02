/**
 * Karate Legends: Ultimate Dojo — single-player 2D karate fighter on one
 * HTML5 canvas (engine.js = fixed-step simulation + AI, render.js = drawing)
 * inside the shared <GamePlayer> (registered by name in ../registry.js);
 * Restart / Mute / Fullscreen / Like stay there.
 *
 * Input: keys are tracked by `e.code` in a held-set (move/block) and attack
 * presses are latched into the engine with press(), so a tap shorter than a
 * frame still counts and key-repeat never spams attacks. Touch buttons feed
 * the same paths. Progress + upgrades persist via progress.js.
 */
import { useEffect, useRef, useState } from "react";
import { W, H, create, step, press, togglePause, restart, clearInput } from "./engine.js";
import { draw, drawPreview, drawPortrait } from "./render.js";
import { BATTLES, TOURNAMENTS, OPPONENTS, STYLES, PLAYER_LOOK, UPGRADES, UPGRADE_MAX, playerStats } from "./data.js";
import { loadProgress, saveProgress, freshProgress, applyResult, buyUpgrade, upgradeCost, isUnlocked, isCleared, unlockedUpTo } from "./progress.js";
import "./KarateLegends.css";

const HOLD = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyL: "block",
};
const TAP = {
  KeyW: "jump",
  ArrowUp: "jump",
  KeyJ: "punch",
  KeyK: "kick",
  Space: "special",
};
// also swallowed while fighting so the page never scrolls
const SWALLOW = new Set(["ArrowDown", "KeyS"]);

let audio = null;
function tone(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}
const SOUNDS = {
  punchSwing: () => tone(700, 0.05, 0.02, 0.5, "sawtooth"),
  kickSwing: () => tone(420, 0.08, 0.025, 0.4, "sawtooth"),
  hit: () => tone(180, 0.1, 0.08, 0.5, "square"),
  heavyHit: () => {
    tone(120, 0.18, 0.1, 0.4, "square");
    tone(70, 0.22, 0.08, 0.6, "sine");
  },
  block: () => tone(900, 0.06, 0.04, 0.8, "triangle"),
  special: () => tone(300, 0.35, 0.05, 3, "sawtooth"),
  specialHit: () => {
    tone(90, 0.4, 0.12, 0.3, "square");
    tone(1400, 0.25, 0.04, 0.5, "sine", 0.03);
  },
  jump: () => tone(260, 0.12, 0.03, 2, "sine"),
  thud: () => tone(80, 0.25, 0.1, 0.5, "sine"),
  tick: () => tone(660, 0.08, 0.04, 1, "sine"),
  round: () => tone(523, 0.18, 0.05, 1, "square"),
  fight: () => {
    tone(523, 0.1, 0.05, 1, "square");
    tone(784, 0.25, 0.05, 1, "square", 0.1);
  },
  ko: () => tone(400, 0.7, 0.08, 0.25, "sawtooth"),
  time: () => tone(880, 0.4, 0.05, 0.5, "triangle"),
  victory: () => [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.22, 0.05, 1, "triangle", k * 0.12)),
  defeat: () => [392, 330, 262].forEach((f, k) => tone(f, 0.3, 0.05, 1, "triangle", k * 0.18)),
};

const battleById = (id) => BATTLES.find((b) => b.id === id);
const tournamentOpen = (p, t) => isUnlocked(p, t * 10 + 1);

function Portrait({ look, size = 72 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPortrait(ctx, look, size);
  }, [look, size]);
  return <canvas ref={ref} className="kld-portrait" style={{ width: size, height: size }} aria-hidden="true" />;
}

const Coins = ({ n }) => (
  <span className="kld-coins">
    <i aria-hidden="true" />
    {n}
  </span>
);

export default function KarateLegends({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sRef = useRef(null); // live battle, null outside a fight
  const held = useRef(new Set());
  const touch = useRef({ left: false, right: false, block: false });
  const [progress, setProgress] = useState(loadProgress);
  const progRef = useRef(progress);
  progRef.current = progress;
  const [screen, setScreen] = useState("menu"); // menu | tournaments | battles | upgrades | game | champion
  const [tour, setTour] = useState(0);
  const [battleId, setBattleId] = useState(1);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null); // { won, coins, firstClear, champion }
  const [showResult, setShowResult] = useState(false);
  const [touchUi, setTouchUi] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const [confirmReset, setConfirmReset] = useState(false);
  const ui = useRef({ screen });
  ui.current = { screen };
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const debugBoxes = useRef(import.meta.env.DEV && typeof window !== "undefined" && /[?&]boxes=1/.test(window.location.search));

  const commit = (p) => {
    progRef.current = p;
    setProgress(p);
    saveProgress(p);
  };

  const releaseAll = () => {
    held.current.clear();
    touch.current = { left: false, right: false, block: false };
    const s = sRef.current;
    if (s) clearInput(s.fighters[0]);
  };

  const startBattle = (id) => {
    const p = progRef.current;
    if (!isUnlocked(p, id)) return;
    releaseAll();
    document.activeElement?.blur?.();
    sRef.current = create({ battleId: id, upgrades: p.upgrades, seed: (Date.now() & 0xffff) + id, playerLook: PLAYER_LOOK });
    setBattleId(id);
    setTour(battleById(id).tournament);
    setResult(null);
    setShowResult(false);
    setPaused(false);
    setScreen("game");
  };
  const retry = () => startBattle(battleId);
  const pause = () => {
    const s = sRef.current;
    if (!s || s.phase === "matchOver") return;
    togglePause(s);
    releaseAll();
    setPaused(s.paused);
  };
  const leave = (to) => {
    releaseAll();
    sRef.current = null;
    setPaused(false);
    setResult(null);
    setShowResult(false);
    setScreen(to);
  };
  const act = useRef(null);
  act.current = { pause };

  // Called once per finished battle (the engine emits victory/defeat once).
  const finish = (won) => {
    const r = applyResult(progRef.current, battleId, won);
    commit(r.progress);
    setResult({ won, coins: r.coins, firstClear: r.firstClear, champion: r.champion });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // The single game loop + resize handling; created once, torn down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let menuT = 0;
    let reported = null; // the battle object whose result was already handled
    let revealed = null;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = sRef.current;
      if (s) {
        const k = held.current;
        const t = touch.current;
        const inp = s.fighters[0].input;
        inp.left = k.has("KeyA") || k.has("ArrowLeft") || t.left;
        inp.right = k.has("KeyD") || k.has("ArrowRight") || t.right;
        inp.block = k.has("KeyL") || t.block;
        const events = step(s, dt);
        if (!mutedRef.current) for (const e of new Set(events)) SOUNDS[e]?.();
        if (s.phase === "matchOver" && reported !== s) {
          reported = s;
          finishRef.current(s.matchWinner === 0);
        }
        if (s.phase === "matchOver" && s.phaseT > 1.1 && revealed !== s) {
          revealed = s;
          setShowResult(true);
        }
      } else menuT += dt;

      // letterbox the 960x540 world into whatever the stage is
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.min(cw / W, ch / H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#120c20";
      ctx.fillRect(0, 0, cw, ch);
      ctx.setTransform(scale, 0, 0, scale, (cw - W * scale) / 2, (ch - H * scale) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      if (s) {
        const opp = OPPONENTS[s.battle.opponent];
        draw(ctx, s, [PLAYER_LOOK.name, opp.name], s.paused ? 0 : dt, { boxes: debugBoxes.current });
      } else drawPreview(ctx, ui.current.screen === "champion" ? 3 : 0, menuT);
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Keyboard: held-set by physical key, latched presses for attacks/jump.
  useEffect(() => {
    const onDown = (e) => {
      if (ui.current.screen !== "game" || !sRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const s = sRef.current;
      if (e.code === "KeyP" || e.code === "Escape") {
        if (!e.repeat && s.phase !== "matchOver") act.current.pause();
        e.preventDefault();
        return;
      }
      const hold = HOLD[e.code];
      const tap = TAP[e.code];
      if (!hold && !tap && !SWALLOW.has(e.code)) return;
      e.preventDefault();
      if (s.paused) return;
      if (hold) held.current.add(e.code);
      if (tap && !e.repeat) press(s, 0, tap);
    };
    const onUp = (e) => {
      held.current.delete(e.code);
      if (ui.current.screen === "game" && (HOLD[e.code] || TAP[e.code] || SWALLOW.has(e.code))) e.preventDefault();
    };
    // a key released while the window is unfocused never fires keyup
    const onBlur = () => {
      releaseAll();
      const s = sRef.current;
      if (s && !s.paused && (s.phase === "fight" || s.phase === "intro")) act.current.pause();
    };
    const onVis = () => document.hidden && onBlur();
    const onTouch = () => setTouchUi(true);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("touchstart", onTouch);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GamePlayer Restart: restart the current battle from round 1.
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (sRef.current) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  // DEV-only test hook: open a dev page with ?kldtest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]kldtest=1/.test(window.location.search)) {
    window.__kld = { get s() { return sRef.current; }, get progress() { return progRef.current; }, commit, startBattle, leave, setScreen, restartSame: () => sRef.current && restart(sRef.current) };
  }

  // touch buttons: hold-type set flags, tap-type latch a press
  const touchBtn = (what, label, cls) => {
    const isHold = what === "left" || what === "right" || what === "block";
    const down = (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const s = sRef.current;
      if (!s || s.paused) return;
      if (isHold) touch.current[what] = true;
      else press(s, 0, what);
    };
    const up = (e) => {
      e.preventDefault();
      if (isHold) touch.current[what] = false;
    };
    return (
      <button type="button" className={`kld-tbtn ${cls}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()} aria-label={what}>
        {label}
      </button>
    );
  };

  const battle = battleById(battleId);
  const opp = battle && OPPONENTS[battle.opponent];
  const next = battleById(battleId + 1);
  const stats = playerStats(progress.upgrades);
  const cleared = progress.cleared.length;

  return (
    <div className="kld" ref={wrapRef} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="kld-canvas" aria-label="Karate Legends game" />

      {screen === "game" && !paused && !showResult && (
        <button type="button" className="kld-pause" aria-label="Pause" onClick={pause}>
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
      )}

      {screen === "game" && touchUi && !paused && !showResult && (
        <div className="kld-touch">
          <div className="kld-touch-pad">
            {touchBtn("left", "◀", "kld-tbtn--move")}
            {touchBtn("jump", "▲", "kld-tbtn--move")}
            {touchBtn("right", "▶", "kld-tbtn--move")}
          </div>
          <div className="kld-touch-act">
            {touchBtn("punch", "PUNCH", "kld-tbtn--punch")}
            {touchBtn("kick", "KICK", "kld-tbtn--kick")}
            {touchBtn("block", "BLOCK", "kld-tbtn--block")}
            {touchBtn("special", "SPECIAL", "kld-tbtn--special")}
          </div>
        </div>
      )}

      {screen === "menu" && (
        <div className="kld-overlay">
          <div className="kld-card kld-card--menu">
            <h2 className="kld-title">Karate Legends</h2>
            <p className="kld-sub">Ultimate Dojo</p>
            <p className="kld-tag">Train Hard. Fight Smart. Become a Champion.</p>
            <div className="kld-row">
              <button type="button" className="kld-btn" onClick={() => startBattle(unlockedUpTo(progress))}>
                {cleared ? `Continue · Battle ${unlockedUpTo(progress)}` : "Start Training"}
              </button>
            </div>
            <div className="kld-row">
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("tournaments")}>Tournaments</button>
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("upgrades")}>Upgrades</button>
            </div>
            <p className="kld-meta">
              {cleared}/40 battles won · <Coins n={progress.coins} />
              {progress.champion && <b className="kld-crown"> · Champion</b>}
            </p>
            <div className="kld-controls">
              <span><kbd>A</kbd><kbd>D</kbd> move</span>
              <span><kbd>W</kbd> jump</span>
              <span><kbd>J</kbd> punch ×3 combo</span>
              <span><kbd>K</kbd> kick</span>
              <span><kbd>L</kbd> block</span>
              <span><kbd>Space</kbd> special</span>
              <span><kbd>P</kbd> pause</span>
            </div>
          </div>
        </div>
      )}

      {screen === "tournaments" && (
        <div className="kld-overlay">
          <div className="kld-card kld-card--wide">
            <h3 className="kld-head">Tournaments</h3>
            <div className="kld-tours">
              {TOURNAMENTS.map((t) => {
                const open = tournamentOpen(progress, t.id);
                const won = progress.cleared.filter((id) => id > t.id * 10 && id <= t.id * 10 + 10).length;
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`kld-tour kld-tour--${t.id}${open ? "" : " is-locked"}`}
                    style={{ "--tc": t.color }}
                    disabled={!open}
                    onClick={() => { setTour(t.id); setScreen("battles"); }}
                  >
                    <strong>{t.name}</strong>
                    <span>{open ? t.blurb : `Defeat ${OPPONENTS[BATTLES[t.id * 10 - 1].opponent].name} to unlock`}</span>
                    <em>{open ? `${won}/10 won` : "Locked"}{won === 10 ? " ★" : ""}</em>
                  </button>
                );
              })}
            </div>
            <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("menu")}>Back</button>
          </div>
        </div>
      )}

      {screen === "battles" && (
        <div className="kld-overlay">
          <div className="kld-card kld-card--wide">
            <h3 className="kld-head" style={{ color: TOURNAMENTS[tour].color }}>{TOURNAMENTS[tour].name}</h3>
            <div className="kld-battles">
              {BATTLES.filter((b) => b.tournament === tour).map((b) => {
                const o = OPPONENTS[b.opponent];
                const open = isUnlocked(progress, b.id);
                const done = isCleared(progress, b.id);
                return (
                  <button type="button" key={b.id} className={`kld-battle${b.boss ? " is-boss" : ""}${open ? "" : " is-locked"}${done ? " is-done" : ""}`} disabled={!open} onClick={() => startBattle(b.id)}>
                    <span className="kld-battle-no">{b.boss ? "BOSS" : `#${b.id}`}</span>
                    {open ? <Portrait look={o} size={56} /> : <span className="kld-lock" aria-hidden="true">🔒</span>}
                    <strong>{open ? o.name : "???"}</strong>
                    <small>{open ? STYLES[o.style].label : "Locked"}</small>
                    <span className="kld-battle-reward">{done ? "✓ Won" : <Coins n={b.reward} />}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("tournaments")}>Back</button>
          </div>
        </div>
      )}

      {screen === "upgrades" && (
        <div className="kld-overlay">
          <div className="kld-card kld-card--wide">
            <h3 className="kld-head">Upgrades</h3>
            <p className="kld-meta"><Coins n={progress.coins} /></p>
            <div className="kld-ups">
              {UPGRADES.map((u) => {
                const lv = progress.upgrades[u.id];
                const cost = upgradeCost(progress, u.id);
                const val = u.id === "hp" ? `${stats.maxHp} HP` : u.id === "atk" ? `${Math.round(stats.dmgMul * 100)}% dmg` : `${Math.round(stats.energyMul * 100)}% gain`;
                return (
                  <div key={u.id} className="kld-up">
                    <strong>{u.name}</strong>
                    <small>{u.desc}</small>
                    <div className="kld-pips">
                      {Array.from({ length: UPGRADE_MAX }, (_, k) => <i key={k} className={k < lv ? "is-on" : ""} />)}
                    </div>
                    <span className="kld-up-val">{val}</span>
                    <button type="button" className="kld-btn kld-btn--small" disabled={cost == null || progress.coins < cost} onClick={() => commit(buyUpgrade(progRef.current, u.id))}>
                      {cost == null ? "MAX" : <>Buy · <Coins n={cost} /></>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="kld-row">
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("menu")}>Back</button>
              {confirmReset ? (
                <button type="button" className="kld-btn kld-btn--ghost kld-btn--danger" onClick={() => { commit(freshProgress()); setConfirmReset(false); }} onBlur={() => setConfirmReset(false)}>
                  Really reset everything?
                </button>
              ) : (
                <button type="button" className="kld-btn kld-btn--ghost kld-btn--tiny" onClick={() => setConfirmReset(true)}>Reset progress</button>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === "game" && paused && (
        <div className="kld-overlay kld-overlay--dim">
          <div className="kld-card">
            <h3 className="kld-head">Paused</h3>
            <p className="kld-meta">Battle {battleId} · vs {opp?.name}</p>
            <button type="button" className="kld-btn" onClick={pause}>Resume</button>
            <button type="button" className="kld-btn kld-btn--ghost" onClick={retry}>Restart Battle</button>
            <button type="button" className="kld-btn kld-btn--ghost" onClick={() => leave("battles")}>Quit to Battles</button>
            <button type="button" className="kld-btn kld-btn--ghost" onClick={() => leave("menu")}>Main Menu</button>
          </div>
        </div>
      )}

      {screen === "game" && showResult && result && (
        <div className="kld-overlay kld-overlay--dim">
          <div className={`kld-card ${result.won ? "kld-card--win" : "kld-card--lose"}`}>
            <h3 className="kld-head kld-head--big">{result.won ? "Victory!" : "Defeat"}</h3>
            <p className="kld-meta">
              {result.won ? `You defeated ${opp?.name}` : `${opp?.name} wins this time`} · Battle {battleId}
            </p>
            <p className="kld-reward">+<Coins n={result.coins} />{result.won && !result.firstClear ? " (replay)" : ""}</p>
            {result.won && battle.boss && result.firstClear && battleId < 40 && <p className="kld-tag">{TOURNAMENTS[battle.tournament + 1].name} unlocked!</p>}
            {result.champion ? (
              <button type="button" className="kld-btn" onClick={() => leave("champion")}>Claim the Title</button>
            ) : result.won && next ? (
              <button type="button" className="kld-btn" onClick={() => startBattle(next.id)}>Next Battle</button>
            ) : (
              <button type="button" className="kld-btn" onClick={retry}>{result.won ? "Fight Again" : "Try Again"}</button>
            )}
            {!result.won && <p className="kld-hint">Tip: block (L) then punish — upgrades help too.</p>}
            <div className="kld-row">
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => leave("upgrades")}>Upgrades</button>
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => leave("battles")}>Battles</button>
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => leave("menu")}>Menu</button>
            </div>
          </div>
        </div>
      )}

      {screen === "champion" && (
        <div className="kld-overlay">
          <div className="kld-card kld-card--champ">
            <p className="kld-tag">All 40 battles won</p>
            <h2 className="kld-title">Grand Champion</h2>
            <p className="kld-sub">{PLAYER_LOOK.name} is a Karate Legend</p>
            <div className="kld-trophy" aria-hidden="true">🏆</div>
            <p className="kld-meta">You can replay any battle for coins and finish your upgrades.</p>
            <div className="kld-row">
              <button type="button" className="kld-btn" onClick={() => setScreen("tournaments")}>Tournaments</button>
              <button type="button" className="kld-btn kld-btn--ghost" onClick={() => setScreen("menu")}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
