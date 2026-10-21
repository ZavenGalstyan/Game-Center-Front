/**
 * In-game HUD (React, refreshed ~10×/s from a snapshot; the crosshair and
 * minimap are driven imperatively every frame from refs).
 */
import { useEffect, useRef } from "react";
import { RARITY_COLOR } from "../data/weapons.js";
import { DISTRICTS } from "../data/districts/index.js";

const pct = (a, b) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100)).toFixed(1)}%`;

function Bar({ cls, v, max, label, lag }) {
  return (
    <div className={`nm-bar nm-bar--${cls}`}>
      <div className="nm-bar__track">
        {lag != null && <div className="nm-bar__lag" style={{ width: pct(lag, max) }} />}
        <div className="nm-bar__fill" style={{ width: pct(v, max) }} />
      </div>
      <span className="nm-bar__label">{label}</span>
      <span className="nm-bar__num">
        {Math.ceil(v)}
        <small>/{Math.round(max)}</small>
      </span>
    </div>
  );
}

export function Hud({ hud, crossRef, hitRef, minimapRef, feed, banner, hurtDirs, talking }) {
  if (!hud) return null;
  const w = hud.weapon;
  return (
    <div className={`nm-hud${hud.aiming ? " nm-hud--aim" : ""}${talking ? " nm-hud--talk" : ""}`}>
      {/* vignette when hurt / low */}
      <div className="nm-vignette" style={{ opacity: hud.lowHp ? 0.35 + 0.25 * Math.sin(Date.now() / 200) : 0 }} />
      {hurtDirs.map((d) => (
        <div key={d.id} className="nm-hurtdir" style={{ transform: `translate(-50%, -50%) rotate(${d.rot}rad)` }} />
      ))}
      {/* crosshair */}
      <div className="nm-cross" ref={crossRef}>
        <i className="nm-cross__l" />
        <i className="nm-cross__r" />
        <i className="nm-cross__t" />
        <i className="nm-cross__b" />
        <i className="nm-cross__dot" />
      </div>
      <div className="nm-hit" ref={hitRef} />

      {/* top-left: objective */}
      <div className="nm-obj">
        {hud.mission?.title && <div className="nm-obj__title">{hud.mission.title}</div>}
        <div className="nm-obj__text">
          <span className="nm-obj__diamond">◆</span>
          {hud.objective || "Explore Neon City"}
        </div>
        {hud.mission?.timer != null && <div className={`nm-obj__timer${hud.mission.timer < 15 ? " nm-obj__timer--low" : ""}`}>⏱ {Math.ceil(hud.mission.timer)} s</div>}
        {hud.mission?.stealth && <div className="nm-obj__stealth">STEALTH — don't get spotted {hud.stealthMax > 0.05 ? <b style={{ width: pct(hud.stealthMax, 1) }} /> : null}</div>}
        {hud.mission?.progress && (
          <div className="nm-obj__prog">
            <span>{hud.mission.progress.label}</span>
            <div className="nm-bar__track">
              <div className="nm-bar__fill" style={{ width: pct(hud.mission.progress.value, 1) }} />
            </div>
            {hud.outOfRange && <em>Get back in range!</em>}
          </div>
        )}
        {hud.mission?.protect && (
          <div className="nm-obj__prog nm-obj__prog--protect">
            <span>{hud.mission.protect.name}</span>
            <div className="nm-bar__track">
              <div className="nm-bar__fill" style={{ width: pct(hud.mission.protect.value, 1) }} />
            </div>
          </div>
        )}
        {hud.mission?.cams?.some((c) => c > 0.05) && <div className="nm-obj__stealth">CAMERA LOCKING ON <b style={{ width: pct(Math.max(...hud.mission.cams), 1) }} /></div>}
      </div>

      {/* boss bar */}
      {hud.boss && (
        <div className="nm-boss">
          <div className="nm-boss__name">
            {hud.boss.name} <small>{hud.boss.title}</small>
          </div>
          <div className="nm-boss__bar">
            <div className="nm-boss__lag" style={{ width: pct(hud.boss.lag, hud.boss.max) }} />
            <div className={`nm-boss__fill${hud.boss.shield ? " nm-boss__fill--shield" : ""}`} style={{ width: pct(hud.boss.hp, hud.boss.max) }} />
            {[0.25, 0.5, 0.75].map((k) => (
              <i key={k} style={{ left: `${k * 100}%` }} />
            ))}
          </div>
          <div className="nm-boss__sub">
            PHASE {hud.boss.phase}
            {hud.boss.shield ? " — SHIELDED: destroy the drones" : hud.boss.vuln ? " — VULNERABLE!" : ""}
          </div>
        </div>
      )}

      {/* top-right: minimap */}
      <div className="nm-minimap">
        <canvas ref={minimapRef} width={220} height={220} />
        <div className="nm-minimap__name">{DISTRICTS[hud.district]?.name}</div>
      </div>

      {/* bottom-left: vitals */}
      <div className="nm-vitals">
        <div className="nm-vitals__lvl">
          <b>{hud.level}</b>
          <div>
            <div className="nm-vitals__xp">
              <div style={{ width: pct(hud.xp, hud.xpNext) }} />
            </div>
            <span>
              LVL {hud.level} {hud.sp > 0 && <em className="nm-pulse">+{hud.sp} skill pt{hud.sp > 1 ? "s" : ""} (Tab)</em>}
            </span>
          </div>
          <span className="nm-vitals__cr">¢ {hud.credits.toLocaleString()}</span>
        </div>
        <Bar cls="hp" v={hud.hp} max={hud.maxHp} lag={hud.hpLag} label="HEALTH" />
        <Bar cls="armor" v={hud.armor} max={hud.armorCap} label="ARMOR" />
        <div className="nm-vitals__row">
          <Bar cls="sta" v={hud.stamina} max={hud.maxStamina} label="STAMINA" />
          <Bar cls="energy" v={hud.energy} max={hud.maxEnergy} label="CYBER" />
        </div>
        <div className="nm-vitals__buffs">
          {hud.buffs.map((b) => (
            <span key={b.id} className="nm-buff" style={{ "--c": b.color }}>
              {b.label} <small>{Math.ceil(b.t)}s</small>
            </span>
          ))}
          {hud.crouch && <span className="nm-buff" style={{ "--c": "#a64dff" }}>{hud.inCover ? "IN COVER" : "CROUCHED"}</span>}
        </div>
      </div>

      {/* bottom-right: weapon */}
      <div className="nm-weapon">
        <div className="nm-weapon__slots">
          {hud.slots.map((s) => (
            <span key={s.slot} className={`nm-slot${s.active ? " nm-slot--on" : ""}`} style={{ "--c": RARITY_COLOR[s.rarity] }}>
              <kbd>{s.key}</kbd>
              {s.name}
            </span>
          ))}
        </div>
        {w && (
          <div className="nm-weapon__main" style={{ "--c": RARITY_COLOR[w.rarity] }}>
            <div className="nm-weapon__name">
              {w.name}
              {w.level > 0 && <small> Mk{w.level + 1}</small>}
            </div>
            {w.melee ? (
              <div className="nm-weapon__ammo">⚔</div>
            ) : (
              <div className="nm-weapon__ammo">
                <b className={w.mag === 0 ? "nm-low" : w.mag <= w.magSize * 0.25 ? "nm-warn" : ""}>{w.mag}</b>
                <span>/ {w.reserve === Infinity ? "∞" : w.reserve}</span>
              </div>
            )}
            {w.reloading != null && (
              <div className="nm-weapon__reload">
                <div style={{ width: pct(w.reloading, 1) }} />
              </div>
            )}
          </div>
        )}
        <div className="nm-weapon__extra">
          {hud.ability ? (
            <span className={`nm-ability${hud.ability.ready ? " nm-ability--ready" : ""}`} style={{ "--c": hud.ability.color, "--p": hud.ability.cdFrac }}>
              <kbd>Q</kbd> {hud.ability.name}
              {!hud.ability.ready && <small> {hud.ability.cd > 0 ? `${Math.ceil(hud.ability.cd)}s` : `${hud.ability.energy}⚡`}</small>}
            </span>
          ) : (
            <span className="nm-ability nm-ability--none">
              <kbd>Q</kbd> no cyberware
            </span>
          )}
          <span className="nm-ability">
            <kbd>H</kbd> MedKit ×{hud.medkits}
          </span>
        </div>
      </div>

      {/* interaction prompt */}
      {hud.focus && (
        <div className={`nm-prompt${hud.focus.locked ? " nm-prompt--locked" : ""}`}>
          <kbd>E</kbd>
          <span>{hud.focus.hold ? `Hold — ${hud.focus.label}` : hud.focus.label}</span>
          {hud.focus.hold && (
            <div className="nm-prompt__ring">
              <div style={{ width: pct(hud.focus.progress || 0, hud.focus.hold) }} />
            </div>
          )}
        </div>
      )}

      {/* notification feed + banner */}
      <div className="nm-feed">
        {feed.map((f) => (
          <div key={f.id} className={`nm-feed__item nm-feed__item--${f.kind}`}>
            {f.who && <b>{f.who}: </b>}
            {f.text}
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.id} className={`nm-banner nm-banner--${banner.kind}`}>
          <div className="nm-banner__title">{banner.title}</div>
          {banner.sub && <div className="nm-banner__sub">{banner.sub}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ minimap drawing */
const mapCache = new Map();
function bakeMap(G) {
  const key = G.districtId;
  if (mapCache.has(key)) return mapCache.get(key);
  const M = G.map;
  const S = 4; // px per metre
  const b = M.bounds;
  const W = Math.ceil((b.x1 - b.x0) * S);
  const H = Math.ceil((b.z1 - b.z0) * S);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const pal = G.def.palette;
  g.fillStyle = "#07070c";
  g.fillRect(0, 0, W, H);
  // walkable ground
  const N = M.nav;
  g.fillStyle = "#1a1a26";
  for (let r = 0; r < N.d; r++)
    for (let col = 0; col < N.w; col++) if (!N.blocked[r * N.w + col]) g.fillRect(((N.x0 + col) - b.x0) * S, ((N.z0 + r) - b.z0) * S, S + 0.5, S + 0.5);
  for (const bx of M.boxes) {
    if (!bx.solid || bx.y0 > 2 || bx.kind === "ceiling" || bx.kind === "canopy") continue;
    const tall = bx.y1 > 3;
    g.fillStyle = bx.kind === "building" ? "#2b2a3a" : tall ? "#34344a" : "#262636";
    g.fillRect((bx.x0 - b.x0) * S, (bx.z0 - b.z0) * S, (bx.x1 - bx.x0) * S, (bx.z1 - bx.z0) * S);
    if (bx.kind === "building") {
      g.strokeStyle = pal.neon[0] + "55";
      g.lineWidth = 1;
      g.strokeRect((bx.x0 - b.x0) * S + 0.5, (bx.z0 - b.z0) * S + 0.5, (bx.x1 - bx.x0) * S - 1, (bx.z1 - bx.z0) * S - 1);
    }
  }
  const out = { c, S, b };
  mapCache.set(key, out);
  return out;
}

export function drawMinimap(canvas, G, opts = {}) {
  if (!canvas || !G) return;
  const g = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const baked = bakeMap(G);
  const p = G.player;
  const range = opts.range || 45; // metres radius
  const k = W / (range * 2);
  g.save();
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "#05050a";
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  // rotate so the camera's forward points up
  g.rotate(Math.PI + G.camYaw);
  const sx = baked.S;
  g.drawImage(baked.c, (baked.b.x0 - p.x) * k, (baked.b.z0 - p.z) * k, baked.c.width * (k / sx), baked.c.height * (k / sx));
  const dot = (x, z, col, r = 3, shape = "dot") => {
    const dx = (x - p.x) * k;
    const dz = (z - p.z) * k;
    g.fillStyle = col;
    if (shape === "diamond") {
      g.beginPath();
      g.moveTo(dx, dz - r);
      g.lineTo(dx + r, dz);
      g.lineTo(dx, dz + r);
      g.lineTo(dx - r, dz);
      g.fill();
    } else {
      g.beginPath();
      g.arc(dx, dz, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  // NPCs / vendors
  for (const n of G.npcs) if (!n.hidden) dot(n.x, n.z, n.def?.shop ? "#ffb02e" : "#4dff9a", 3.2);
  for (const t of G.def.terminals || []) dot(t.x, t.z, "#19f0ff", 3.2, "diamond");
  for (const s of G.def.stations || []) dot(s.x, s.z, "#a64dff", 3, "diamond");
  // enemies: seen / alerted (or all within range with the Threat Scanner)
  const scan = G.D.scanner || 0;
  for (const e of G.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    const known = e.state === "combat" || e.canSee || e.boss || (scan && d < scan) || d < 9;
    if (!known) continue;
    // sight cone for patrolling enemies during stealth
    if (opts.cones && e.state !== "combat" && !e.flyer && e.def.fov < 360) {
      const dx = (e.x - p.x) * k;
      const dz = (e.z - p.z) * k;
      const fov = (e.def.fov * Math.PI) / 360;
      g.fillStyle = e.aware > 0.4 ? "rgba(255,180,40,0.25)" : "rgba(255,255,255,0.10)";
      g.beginPath();
      g.moveTo(dx, dz);
      const rr = Math.min(e.def.detect, 26) * k;
      g.arc(dx, dz, rr, Math.PI / 2 - e.yaw - fov, Math.PI / 2 - e.yaw + fov);
      g.closePath();
      g.fill();
    }
    dot(e.x, e.z, e.boss ? "#ff2bd6" : e.state === "combat" ? "#ff3b5c" : "#ff9a5c", e.boss ? 5 : 3);
  }
  // objective markers
  for (const m of G.missions.markers()) {
    if (m.kind === "area") {
      g.strokeStyle = "rgba(255,210,80,0.8)";
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc((m.x - p.x) * k, (m.z - p.z) * k, (m.r || 8) * k, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    } else if (m.kind !== "enemy") {
      const dx = (m.x - p.x) * k;
      const dz = (m.z - p.z) * k;
      const r = Math.hypot(dx, dz);
      const lim = W / 2 - 10;
      const f = r > lim ? lim / r : 1;
      dot(p.x + (m.x - p.x) * f, p.z + (m.z - p.z) * f, "#ffd23f", 5, "diamond");
    }
  }
  g.restore();
  // player arrow (always pointing up)
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-(p.yaw - G.camYaw));
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5.5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5.5, 6);
  g.closePath();
  g.fill();
  g.restore();
  // ring
  g.strokeStyle = "rgba(25,240,255,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.font = "bold 12px sans-serif";
  g.textAlign = "center";
  g.fillText("N", W / 2 - Math.sin(G.camYaw) * (W / 2 - 12), H / 2 + Math.cos(G.camYaw) * (W / 2 - 12) + 4);
}

export { bakeMap };

/** Small hook: run fn every `ms` while mounted. */
export function useInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
