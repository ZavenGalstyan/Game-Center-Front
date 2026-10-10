/**
 * Web Hero — in-mission HUD + overlay cards.
 *
 *  Hud         health + Hero Energy (top-left), mission + objective tracker
 *              (top-right), ability cooldown row (bottom-centre), combo
 *              counter, interaction prompt, boss / protect bars, an
 *              objective direction arrow and the minimap (bottom-left)
 *  Minimap     its own canvas, redrawn at 10 Hz straight from the world
 *              (never through React state)
 *  StartGate   mission briefing (click to start — takes the pointer lock)
 *  PauseCard · Results · Failed · Toast · Banner
 */
import { useEffect, useRef } from "react";
import { ABILITIES, ABILITY_IDS, ENERGY_MAX } from "../engine/config.js";
import { waypoints } from "../engine/missions.js";

const AB_KEYS = { shot: "RMB", trap: "1", pull: "2", strike: "3", shield: "4", burst: "5" };
const AB_ICON = { shot: "✶", trap: "⌘", pull: "⇤", strike: "➹", shield: "⬡", burst: "✺" };

export function Hud({ hud, W, mission, district, onPause, hints }) {
  const hpK = Math.max(0, hud.hp / hud.maxHp);
  const enK = Math.max(0, hud.energy / ENERGY_MAX);
  return (
    <div className="wh-hud">
      <div className="wh-hud__vitals">
        <div className="wh-vital">
          <span className="wh-vital__label">HEALTH</span>
          <div className="wh-bar wh-bar--hp">
            <div className="wh-bar__fill" style={{ width: `${hpK * 100}%`, background: hpK < 0.3 ? "#ff4a3a" : undefined }} />
            <span className="wh-bar__num">{Math.ceil(hud.hp)}</span>
          </div>
        </div>
        <div className="wh-vital">
          <span className="wh-vital__label">HERO ENERGY</span>
          <div className={`wh-bar wh-bar--en${enK >= 1 ? " is-full" : ""}`}>
            <div className="wh-bar__fill" style={{ width: `${enK * 100}%` }} />
            {enK >= 1 ? <span className="wh-bar__num">R · WEB STORM</span> : null}
          </div>
        </div>
        {hud.combo > 1 ? (
          <div className="wh-combo" key={hud.combo}>
            <b>{hud.combo}</b> HIT COMBO
          </div>
        ) : null}
      </div>

      <div className="wh-hud__mission">
        <div className="wh-mission__name" style={{ color: district.colors.a }}>
          {district.name.toUpperCase()} · MISSION {mission.id}
        </div>
        <div className="wh-mission__title">{mission.name}</div>
        <div className="wh-mission__obj">
          <span className="wh-dot" />
          {hud.objective}
        </div>
        {hud.enemies > 0 ? <div className="wh-mission__sub">Enemies left: {hud.enemies}</div> : null}
        {hud.timer != null ? <div className={`wh-mission__timer${hud.timer < 10 ? " is-low" : ""}`}>⏱ {Math.max(0, hud.timer).toFixed(0)}s</div> : null}
        <div className="wh-mission__tokens" title="Hero Tokens found">
          {hud.tokens.map((g, i) => (
            <span key={i} className={`wh-token${g ? " is-got" : ""}`} />
          ))}
        </div>
      </div>

      {hud.boss ? (
        <div className="wh-boss">
          <div className="wh-boss__name">{hud.boss.name}</div>
          <div className="wh-bar wh-bar--boss">
            <div className="wh-bar__fill" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
          <div className={`wh-boss__hint${hud.boss.weak ? " is-weak" : ""}`}>{hud.boss.weak ? "⚡ WEAK POINT EXPOSED — STRIKE!" : hud.boss.hint}</div>
        </div>
      ) : null}
      {hud.protect ? (
        <div className="wh-protect">
          <span>{hud.protect.label}</span>
          <div className="wh-bar wh-bar--prot">
            <div className="wh-bar__fill" style={{ width: `${(hud.protect.hp / hud.protect.max) * 100}%` }} />
          </div>
        </div>
      ) : null}

      <div className="wh-abilities">
        {["shot", ...ABILITY_IDS].map((id) => {
          const cd = hud.cool[id] || 0;
          const max = id === "shot" ? ABILITIES.shot.cd : ABILITIES[id].cd * hud.cdMult;
          const locked = hud.locked[id];
          const k = locked ? 1 : Math.min(1, cd / max);
          return (
            <div key={id} className={`wh-ab${locked ? " is-locked" : cd > 0 ? " is-cd" : " is-ready"}`} title={`${ABILITIES[id].name}${locked ? ` — unlocks in Mission ${locked}` : ""}`}>
              <div className="wh-ab__icon">{locked ? "🔒" : AB_ICON[id]}</div>
              <div className="wh-ab__cd" style={{ height: `${k * 100}%` }} />
              <div className="wh-ab__key">{AB_KEYS[id]}</div>
              {cd > 0 && !locked ? <div className="wh-ab__num">{cd.toFixed(cd < 1 ? 1 : 0)}</div> : null}
            </div>
          );
        })}
      </div>

      {hud.prompt ? <div className="wh-prompt">{hud.prompt.startsWith("Hold E") ? <kbd>E</kbd> : null}{hud.prompt.replace(/^Hold E to /, "Hold to ")}</div> : null}
      {hud.counter ? <div className="wh-counter">COUNTER! <kbd>LMB</kbd></div> : null}

      <ObjectiveArrow W={W} />
      <Minimap W={W} accent={district.colors.a} />
      {hints ? <Hints key={hud.stepIdx} step={hud.stepType} idx={hud.stepIdx} mission={mission.id} /> : null}
      <button type="button" className="wh-hud__pause" onClick={onPause} aria-label="Pause">
        ❚❚
      </button>
      <div className="wh-crosshair" />
    </div>
  );
}

const HINTS = {
  reach: ["Hold Q in the air to swing — release Q to let go and keep your momentum", "Walk into a wall to climb · Shift + jump along a wall to wall-run"],
  defeat: ["LMB punch · F heavy · combos: LMB LMB LMB, LMB F, F F (jump) LMB", "When the ring under an enemy turns red — Ctrl to dodge, then LMB to counter"],
  rescue: ["Get next to the civilian and hold E"],
};
function Hints({ step, idx, mission }) {
  const list = HINTS[step];
  if (!list || mission > 2) return null;
  return (
    <div className="wh-hints">
      {list.map((h) => (
        <div key={h} className="wh-hint">
          {h}
        </div>
      ))}
      {idx === 0 && step === "reach" ? <div className="wh-hint wh-hint--soft">RMB web shot · 1–5 web abilities (as you unlock them) · Esc pause</div> : null}
    </div>
  );
}

/** an edge arrow pointing to the nearest waypoint, relative to the camera */
function ObjectiveArrow({ W }) {
  const ref = useRef(null);
  const txt = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const h = W.hero;
      const wps = W.state === "play" ? waypoints(W) : [];
      let best = null;
      let bd = Infinity;
      for (const p of wps) {
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (!best || bd < 6) {
        el.style.opacity = "0";
        return;
      }
      let a = Math.atan2(best.x - h.x, best.z - h.z) - (W.cam.viewYaw ?? W.cam.yaw);
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      el.style.opacity = "1";
      el.style.transform = `translate(-50%, -50%) rotate(${-a}rad) translateY(-118px)`;
      const dy = best.y - h.y;
      if (txt.current) txt.current.textContent = `${Math.round(bd)}m${dy > 4 ? " ▲" : dy < -4 ? " ▼" : ""}`;
    }, 80);
    return () => clearInterval(id);
  }, [W]);
  return (
    <div ref={ref} className="wh-arrow">
      <div className="wh-arrow__head" />
      <div ref={txt} className="wh-arrow__txt" />
    </div>
  );
}

/** top-down minimap: buildings (pre-rendered once), roads, hero, objectives, enemies */
function Minimap({ W, accent }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const size = 168;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const g = c.getContext("2d");
    const C = W.city;
    // static layer: the whole city at 1 px ≈ 1 m
    const ext = C.half + 20;
    const base = document.createElement("canvas");
    const bs = 512;
    base.width = bs;
    base.height = bs;
    const bg = base.getContext("2d");
    const k = bs / (ext * 2);
    bg.fillStyle = "#1b2130";
    bg.fillRect(0, 0, bs, bs);
    if (C.water) {
      bg.fillStyle = "#16405a";
      bg.fillRect((C.water.x0 + ext) * k, 0, bs, bs);
    }
    for (const b of C.blocks) {
      if (b.t === "S") continue;
      bg.fillStyle = b.t === "P" ? "#2c5a34" : b.t === "Q" ? "#5a5348" : "#2a3142";
      bg.fillRect((b.x0 + ext) * k, (b.z0 + ext) * k, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    }
    const sorted = [...C.buildings].sort((a, b) => a.y1 - b.y1);
    for (const b of sorted) {
      const l = Math.min(80, 30 + b.y1 * 0.45);
      bg.fillStyle = `hsl(220, 14%, ${l}%)`;
      bg.fillRect((b.x0 + ext) * k, (b.z0 + ext) * k, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    }
    let raf = 0;
    const draw = () => {
      const h = W.hero;
      const yaw = W.cam.viewYaw ?? W.cam.yaw;
      const view = 120; // metres across the map
      const s = size / view;
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      // world offset → screen with the camera's forward pointing up
      const P = (x, z) => {
        const dx = x - h.x;
        const dz = z - h.z;
        return [size / 2 + s * (-cs * dx + sn * dz), size / 2 + s * (-sn * dx - cs * dz)];
      };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      g.save();
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "#11151f";
      g.fillRect(0, 0, size, size);
      // static city layer, drawn in world units through the same mapping
      g.setTransform(dpr * -s * cs, dpr * -s * sn, dpr * s * sn, dpr * -s * cs, dpr * (size / 2 + s * (cs * h.x - sn * h.z)), dpr * (size / 2 + s * (sn * h.x + cs * h.z)));
      g.drawImage(base, -ext, -ext, ext * 2, ext * 2);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const e of W.enemies) {
        if (e.dead || e.state === "defeated") continue;
        const [x, y] = P(e.x, e.z);
        g.fillStyle = e.boss ? "#ff3a2a" : e.state === "idle" || e.state === "patrol" ? "#c26a5a" : "#ff5a4a";
        g.beginPath();
        g.arc(x, y, e.boss ? 5 : 3, 0, Math.PI * 2);
        g.fill();
      }
      for (const cv of W.civilians) {
        if (cv.state !== "cower") continue;
        const [x, y] = P(cv.x, cv.z);
        g.fillStyle = "#3dff8a";
        g.fillRect(x - 3, y - 3, 6, 6);
      }
      // objective markers (clamped to the rim)
      for (const p of W.state === "play" ? waypoints(W) : []) {
        let [x, y] = P(p.x, p.z);
        const ox = x - size / 2;
        const oy = y - size / 2;
        const d = Math.hypot(ox, oy);
        const R = size / 2 - 9;
        if (d > R) {
          x = size / 2 + (ox / d) * R;
          y = size / 2 + (oy / d) * R;
        }
        g.fillStyle = p.enemy ? "#ff7a5a" : "#ffd84a";
        g.beginPath();
        g.moveTo(x, y - 6);
        g.lineTo(x + 5, y);
        g.lineTo(x, y + 6);
        g.lineTo(x - 5, y);
        g.closePath();
        g.fill();
      }
      g.restore();
      // hero arrow
      g.save();
      g.translate(size / 2, size / 2);
      g.rotate(yaw - h.facing);
      g.fillStyle = accent;
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(6, 6);
      g.lineTo(0, 3);
      g.lineTo(-6, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      g.stroke();
      // north (−z) marker on the rim
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.font = "700 10px system-ui";
      g.textAlign = "center";
      g.fillText("N", size / 2 - sn * (size / 2 - 11), size / 2 + cs * (size / 2 - 11) + 3);
    };
    const id = setInterval(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }, 100);
    draw();
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [W, accent]);
  return <canvas ref={ref} className="wh-minimap" />;
}

export function Toasts({ toasts }) {
  return (
    <div className="wh-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`wh-toast wh-toast--${t.kind || "info"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className="wh-banner" key={banner.id}>
      <div className="wh-banner__kicker">{banner.kicker}</div>
      <div className="wh-banner__text">{banner.text}</div>
    </div>
  );
}

export function StartGate({ mission, district, onStart, touch, abilities }) {
  return (
    <div className="wh-overlay wh-overlay--gate" onClick={touch ? undefined : onStart}>
      <div className="wh-card wh-card--brief" style={{ "--da": district.colors.a }}>
        <div className="wh-card__kicker">
          {district.name.toUpperCase()} · MISSION {mission.id}
          {mission.boss ? " · BOSS" : ""}
        </div>
        <h2 className="wh-card__title">{mission.name}</h2>
        <p className="wh-card__brief">{mission.brief}</p>
        <ol className="wh-card__steps">
          {mission.steps.map((s, i) => (
            <li key={i}>{s.label}</li>
          ))}
        </ol>
        {abilities ? (
          <div className="wh-card__abil">
            {Object.entries(abilities).map(([k, on]) => (
              <span key={k} className={on ? "" : "is-off"}>
                {ABILITIES[k].name}
              </span>
            ))}
          </div>
        ) : null}
        {touch ? (
          <p className="wh-card__warn">Web Hero needs a keyboard and mouse.</p>
        ) : (
          <button type="button" className="wh-btn wh-btn--primary wh-btn--big" onClick={onStart}>
            SWING IN
          </button>
        )}
        <div className="wh-card__foot">WASD move · Mouse look · Space jump · Shift sprint · Q swing · LMB / F attack · Ctrl dodge · RMB web · E rescue</div>
      </div>
    </div>
  );
}

export function PauseCard({ onResume, onRestart, onSettings, onControls, onQuit }) {
  return (
    <div className="wh-overlay">
      <div className="wh-card wh-card--menu">
        <h2 className="wh-card__title">PAUSED</h2>
        <button type="button" className="wh-btn wh-btn--primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="wh-btn" onClick={onRestart}>
          Restart mission
        </button>
        <button type="button" className="wh-btn" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="wh-btn" onClick={onControls}>
          Controls
        </button>
        <button type="button" className="wh-btn wh-btn--ghost" onClick={onQuit}>
          Mission select
        </button>
      </div>
    </div>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Results({ res, onNext, hasNext, onReplay, onSelect, onUpgrades }) {
  return (
    <div className="wh-overlay wh-overlay--results">
      <div className="wh-card wh-card--results">
        <div className="wh-card__kicker">MISSION COMPLETE</div>
        <h2 className="wh-card__title">{res.name}</h2>
        <div className={`wh-grade wh-grade--${res.grade}`}>{res.grade}</div>
        <div className="wh-score">
          {res.score.toLocaleString()} {res.newBest ? <span className="wh-new">NEW BEST</span> : null}
        </div>
        <div className="wh-stats">
          <div>
            <span>Time</span>
            <b>
              {fmt(res.time)} <small>/ par {fmt(res.par)}</small>
            </b>
          </div>
          <div>
            <span>Criminals stopped</span>
            <b>{res.defeated}</b>
          </div>
          <div>
            <span>Civilians rescued</span>
            <b>{res.rescues}</b>
          </div>
          <div>
            <span>Best combo</span>
            <b>{res.maxCombo}</b>
          </div>
          <div>
            <span>Perfect dodges</span>
            <b>{res.perfect}</b>
          </div>
          <div>
            <span>Damage taken</span>
            <b>{res.damageTaken}</b>
          </div>
          <div>
            <span>Hero Tokens</span>
            <b className="wh-stats__tokens">
              {res.tokens.map((g, i) => (
                <span key={i} className={`wh-token${g ? " is-got" : ""}`} />
              ))}
            </b>
          </div>
          <div>
            <span>XP earned</span>
            <b className="wh-xp">+{res.xpGained}</b>
          </div>
        </div>
        {res.unlockText ? <div className="wh-unlock">🔓 {res.unlockText}</div> : null}
        <div className="wh-card__row">
          {hasNext ? (
            <button type="button" className="wh-btn wh-btn--primary" onClick={onNext}>
              Next mission ▸
            </button>
          ) : null}
          <button type="button" className="wh-btn" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="wh-btn" onClick={onUpgrades}>
            Upgrades
          </button>
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onSelect}>
            Mission select
          </button>
        </div>
      </div>
    </div>
  );
}

export function Failed({ why, onRetry, onSelect }) {
  return (
    <div className="wh-overlay wh-overlay--failed">
      <div className="wh-card wh-card--menu">
        <div className="wh-card__kicker wh-card__kicker--bad">MISSION FAILED</div>
        <h2 className="wh-card__title">{why}</h2>
        <button type="button" className="wh-btn wh-btn--primary" onClick={onRetry}>
          Retry mission
        </button>
        <button type="button" className="wh-btn wh-btn--ghost" onClick={onSelect}>
          Mission select
        </button>
      </div>
    </div>
  );
}
