/**
 * Last Hope — gameplay HUD (React; fed a 10 Hz snapshot, the minimap and
 * vignettes read the live sim through refs).
 */
import { memo, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ITEMS, itemName } from "../data/items.js";
import { LOCATIONS } from "../data/locations/index.js";
import { MISSION_BY_ID } from "../data/missions.js";
import { CAM_YAW } from "../render/world.js";

const pct = (v, m = 100) => `${Math.max(0, Math.min(100, (v / m) * 100)).toFixed(1)}%`;
const clockText = (h) => {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const WEATHER = { clear: "Clear", cloudy: "Overcast", rain: "Rain", fog: "Fog" };

function Bar({ icon, value, max = 100, cls, label, warn, extra }) {
  return (
    <div className={`lh-stat lh-stat--${cls}${warn ? " is-warn" : ""}`} title={label}>
      <Icon id={icon} size={22} />
      <div className="lh-stat__bar">
        <i style={{ width: pct(value, max) }} />
        <span>{Math.ceil(value)}</span>
      </div>
      {extra}
    </div>
  );
}

/** Where the first tracked objective points, in this location (or null). */
export function objectiveTarget(G) {
  const id = G && hudFirst(G);
  const m = id && MISSION_BY_ID[id];
  if (!m) return null;
  const map = G.R.map;
  const c = m.cond;
  if (c.k === "boss" && c.id === "warden" && G.loc !== "bunker") return exitTarget(G, "bunker");
  const unique = { survivor_map: ["suburb", "ranger_desk"], bunker_card: ["industrial", "security_safe"], security_card: ["bunker", "officer_locker"] };
  if (c.k === "have" && unique[c.item]) {
    const [loc, cid] = unique[c.item];
    if (G.loc !== loc) return exitTarget(G);
    const ct = map.containers.find((q) => q.id === cid);
    return ct ? { x: ct.x, z: ct.z } : null;
  }
  if (c.k === "visit" && G.loc !== c.loc) return exitTarget(G, c.loc);
  if (c.k === "boss" || (c.k === "have" && c.item === "bunker_card")) {
    const b = G.R.zombies.find((z) => z.boss && z.state !== "dead");
    return b ? { x: b.x, z: b.z } : null;
  }
  if (c.k === "flag" && c.name === "power") return map.switches?.[0] || null;
  if (c.k === "flag" && c.name === "door_armory_door") return map.doors.find((d) => d.id === "armory_door") || null;
  if ((c.k === "build" || c.k === "upgrade" || c.k === "flag") && G.loc !== "camp") return exitTarget(G, "camp");
  return null;
}
function hudFirst(G) {
  for (const id of Object.keys(MISSION_BY_ID)) if (!G.done.includes(id)) return id;
  return null;
}
function exitTarget(G, to) {
  const map = G.R.map;
  const ex = (to === "bunker" && map.exits.find((e) => e.to === "bunker")) || map.exits.find((e) => !e.to) || map.exits[0];
  return ex ? { x: ex.x, z: ex.z, exit: true } : null;
}

/* ---------------------------------------------------------------- minimap */
const Minimap = memo(function Minimap({ gameRef, worldRef }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 120) return;
      last = now;
      const c = ref.current;
      const G = gameRef.current;
      const mm = worldRef.current?.minimap;
      if (!c || !G || !G.R) return;
      const ctx = c.getContext("2d");
      const S = c.width;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#1a1f1c";
      ctx.fillRect(0, 0, S, S);
      const P = G.P;
      const map = G.R.map;
      const range = 34; // metres from centre to edge
      const k = S / 2 / range;
      ctx.translate(S / 2, S / 2);
      ctx.rotate(CAM_YAW);
      if (mm) {
        const s = mm.scale;
        ctx.drawImage(mm.canvas, (-(P.x + map.w / 2) * s * k) / s, (-(P.z + map.d / 2) * s * k) / s, (mm.canvas.width * k) / s, (mm.canvas.height * k) / s);
      }
      const dot = (x, z, r, col, ring) => {
        const px = (x - P.x) * k;
        const pz = (z - P.z) * k;
        if (px * px + pz * pz > (S / 2) ** 2) return;
        ctx.beginPath();
        ctx.arc(px, pz, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (ring) {
          ctx.strokeStyle = ring;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };
      // structures at camp
      if (G.loc === "camp") {
        ctx.fillStyle = "#c8a060";
        for (const s of G.structures) ctx.fillRect((s.x - P.x) * k - 2.5, (s.z - P.z) * k - 2.5, 5, 5);
      }
      for (const ex of map.exits) dot(ex.x, ex.z, 5, "#5ad87a", "#0a2a12");
      const ls = G.locs[G.loc];
      for (const ct of map.containers) if (ls.cont[ct.id] == null) dot(ct.x, ct.z, 1.8, ct.contents ? "#ffb84a" : "#e8d8a0");
      if (ls.bag) dot(ls.bag.x, ls.bag.z, 4.5, "#6ab8ff", "#0a1a2a");
      for (const a of G.R.animals) if (!a.dead) dot(a.x, a.z, 2.2, "#c8b890");
      for (const z of G.R.zombies) if (z.state !== "dead") dot(z.x, z.z, z.boss ? 5 : 2.8, z.state === "chase" || z.state === "windup" ? "#ff3a2a" : "#b84a3a", z.boss ? "#2a0a0a" : null);
      const tgt = objectiveTarget(G);
      if (tgt) {
        let px = (tgt.x - P.x) * k;
        let pz = (tgt.z - P.z) * k;
        const l = Math.hypot(px, pz);
        const lim = S / 2 - 10;
        if (l > lim) {
          px = (px / l) * lim;
          pz = (pz / l) * lim;
        }
        ctx.save();
        ctx.translate(px, pz);
        ctx.rotate(-CAM_YAW);
        ctx.fillStyle = "#ffd24a";
        ctx.strokeStyle = "#3a2a00";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 3 : 7;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // player arrow
      ctx.save();
      ctx.rotate(-P.yaw + Math.PI);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameRef, worldRef]);
  return <canvas ref={ref} className="lh-minimap__c" width={180} height={180} />;
});

/* ---------------------------------------------------------------- touch controls */
function TouchControls({ input, hud, onInventory, onBuild, onMap }) {
  const S = input.S;
  const [sprint, setSprint] = useState(false);
  const [joy, setJoy] = useState(null);
  useEffect(() => {
    let raf = 0;
    const tickJ = () => {
      raf = requestAnimationFrame(tickJ);
      const j = S.joy;
      setJoy((p) => (j.active ? { ox: j.ox, oy: j.oy, x: j.x, y: j.y } : p ? null : p));
    };
    raf = requestAnimationFrame(tickJ);
    return () => cancelAnimationFrame(raf);
  }, [S]);
  const hold = (k) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      S[k] = true;
    },
    onPointerUp: () => (S[k] = false),
    onPointerCancel: () => (S[k] = false),
  });
  return (
    <div className="lh-touch">
      {joy && (
        <div className="lh-joy" style={{ left: joy.ox, top: joy.oy }}>
          <i style={{ transform: `translate(${joy.x * 46}px, ${joy.y * 46}px)` }} />
        </div>
      )}
      <div className="lh-touch__hint">Drag anywhere on the left to move</div>
      <div className="lh-touch__right" data-ui>
        <button className="lh-tbtn lh-tbtn--attack" {...hold("attackHeld")} aria-label="Attack">
          <Icon id={hud?.hand?.id || "fist"} size={44} />
        </button>
        <button
          className={`lh-tbtn lh-tbtn--use${hud?.interact ? " is-on" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            S.interactQ = true;
          }}
          aria-label="Interact"
        >
          <span>E</span>
        </button>
        <button
          className={`lh-tbtn lh-tbtn--sprint${sprint ? " is-on" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            S.sprintToggle = !S.sprintToggle;
            setSprint(S.sprintToggle);
          }}
          aria-label="Sprint"
        >
          <Icon id="stamina" size={26} />
        </button>
      </div>
      <div className="lh-touch__top" data-ui>
        <button className="lh-tbtn lh-tbtn--sm" onClick={onInventory} aria-label="Inventory">
          <Icon id="bag" size={26} />
        </button>
        <button className="lh-tbtn lh-tbtn--sm" onClick={onBuild} aria-label="Build">
          <Icon id="hammer" size={26} />
        </button>
        <button className="lh-tbtn lh-tbtn--sm" onClick={onMap} aria-label="Map">
          <Icon id="map" size={26} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- HUD */
export default function HUD({ hud, gameRef, worldRef, input, touch, banner, toasts, saveState, fps, onQuick, onInventory, onBuild, onMap, onPause, building, flashMission }) {
  const vigRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const tickV = () => {
      raf = requestAnimationFrame(tickV);
      const el = vigRef.current;
      const w = worldRef.current;
      const G = gameRef.current;
      if (!el || !w || !G) return;
      const h = w.hurt();
      const low = G.P.hp / G.P.maxHp < 0.3 && !G.P.dead ? 0.35 + Math.sin(performance.now() / 260) * 0.15 : 0;
      el.style.opacity = String(Math.min(1, h * 0.8 + low));
      el.classList.toggle("is-poison", G.P.poison > 0);
    };
    raf = requestAnimationFrame(tickV);
    return () => cancelAnimationFrame(raf);
  }, [gameRef, worldRef]);
  if (!hud) return null;
  const loc = LOCATIONS[hud.loc];
  const it = hud.interact;
  return (
    <div className={`lh-hud${touch ? " lh-hud--touch" : ""}`}>
      <div ref={vigRef} className="lh-vig" />
      {/* ---------------- top-left: survivor */}
      <div className="lh-tl" data-ui>
        <div className="lh-lvl" title={`Level ${hud.level} — ${hud.xp} / ${hud.xpNext} XP`}>
          <svg viewBox="0 0 40 40" className="lh-lvl__ring">
            <circle cx="20" cy="20" r="17" className="bg" />
            <circle cx="20" cy="20" r="17" className="fg" style={{ strokeDasharray: `${(hud.xp / hud.xpNext) * 106.8} 106.8` }} />
          </svg>
          <b>{hud.level}</b>
        </div>
        <div className="lh-stats">
          <Bar icon={hud.poison ? "poison" : "heart"} value={hud.hp} max={hud.maxHp} cls={hud.poison ? "poison" : "hp"} label="Health" warn={hud.hp < hud.maxHp * 0.3} />
          <Bar icon="food" value={hud.food} cls="food" label="Hunger" warn={hud.food < 20} />
          <Bar icon="water" value={hud.water} cls="water" label="Thirst" warn={hud.water < 20} />
          <Bar icon="stamina" value={hud.stam} cls={hud.exhausted ? "tired" : "stam"} label="Stamina" warn={hud.exhausted} />
        </div>
        {hud.warm && <div className="lh-chip lh-chip--warm">Warm · healing faster</div>}
      </div>

      {/* ---------------- top-right: minimap + clock */}
      <div className="lh-tr" data-ui>
        <div className="lh-minimap">
          <Minimap gameRef={gameRef} worldRef={worldRef} />
          <div className="lh-minimap__n">N</div>
        </div>
        <div className="lh-clock">
          <b>{clockText(hud.clock)}</b>
          <span>
            Day {hud.day} · {hud.night ? "Night" : WEATHER[hud.weather] || "Clear"}
          </span>
          <em>{loc?.name}</em>
        </div>
        <div className="lh-tr__btns">
          <button className="lh-ibtn" onClick={onMap} title="World map (M)">
            <Icon id="map" size={24} />
          </button>
          <button className="lh-ibtn" onClick={onPause} title="Pause (Esc)">
            <Icon id="pause" size={22} />
          </button>
        </div>
        {saveState && <div className={`lh-save lh-save--${saveState}`}>{saveState === "error" ? "Save failed" : saveState === "saving" ? "Saving…" : "Saved"}</div>}
        {fps > 0 && <div className="lh-fps">{fps} fps</div>}
      </div>

      {/* ---------------- objectives */}
      <div className="lh-obj" data-ui>
        <div className="lh-obj__h">
          Objectives <span>{hud.doneCount} / 41</span>
        </div>
        {hud.missions.map((m, i) => (
          <div key={m.id} className={`lh-obj__m${i === 0 ? " is-main" : ""}${flashMission === m.id ? " is-flash" : ""}`}>
            <b>{m.title}</b>
            <p>{m.desc}</p>
            {m.need > 1 && (
              <div className="lh-obj__p">
                <i style={{ width: pct(m.cur, m.need) }} />
                <span>
                  {m.cur} / {m.need}
                </span>
              </div>
            )}
          </div>
        ))}
        {!hud.missions.length && <div className="lh-obj__m is-main"><b>Last Hope</b><p>The Warden is dead. Keep surviving — the world is yours to rebuild.</p></div>}
      </div>

      {/* ---------------- boss / raid */}
      {hud.boss && (
        <div className="lh-boss">
          <b>{hud.boss.name}</b>
          <div className="lh-boss__bar">
            <i style={{ width: pct(hud.boss.hp, hud.boss.max) }} />
          </div>
        </div>
      )}
      {hud.raid && (
        <div className="lh-raid">
          <Icon id="skull" size={22} /> Night raid — {hud.raid.left} of {hud.raid.total} remaining
        </div>
      )}

      {/* ---------------- interaction prompt */}
      {it && !building && (
        <div className={`lh-prompt${it.ok ? "" : " is-no"}`}>
          {!touch && <kbd>E</kbd>}
          <div>
            <b>{it.verb}</b>
            <span>{it.label}</span>
            {it.hint && <em>{it.hint}</em>}
          </div>
        </div>
      )}

      {/* ---------------- bottom: weapon + quick slots */}
      {!building && (
        <div className="lh-bottom" data-ui>
          <div className="lh-weapon" title={hud.hand ? itemName(hud.hand.id) : "Bare hands"}>
            <Icon id={hud.hand?.id || "fist"} size={44} />
            <div>
              <b>{hud.hand ? itemName(hud.hand.id) : "Fists"}</b>
              {hud.hand?.max > 0 && (
                <div className="lh-dur">
                  <i style={{ width: pct(hud.hand.d, hud.hand.max), background: hud.hand.d / hud.hand.max < 0.25 ? "#e8484a" : undefined }} />
                </div>
              )}
              {hud.ammo && (
                <span className={`lh-ammo${hud.ammo.n ? "" : " is-out"}`}>
                  {hud.ammo.n} × {ITEMS[hud.ammo.id].name}
                </span>
              )}
            </div>
          </div>
          <div className="lh-quick">
            {hud.quick.map((q, i) => (
              <button key={i} className={`lh-qs${q?.on ? " is-on" : ""}${q && !q.n ? " is-empty" : ""}`} onClick={() => onQuick(i)} title={q ? itemName(q.id) : "Empty quick slot — assign from the inventory"}>
                {!touch && <kbd>{i + 1}</kbd>}
                {q ? <Icon id={q.id} size={34} /> : null}
                {q && ITEMS[q.id].stack > 1 && <span>{q.n}</span>}
              </button>
            ))}
          </div>
          {!touch && (
            <div className="lh-keys">
              <span>
                <kbd>I</kbd> Inventory
              </span>
              <span>
                <kbd>B</kbd> Build
              </span>
              <span>
                <kbd>M</kbd> Map
              </span>
              <span>
                <kbd>⇧</kbd> Sprint
              </span>
            </div>
          )}
        </div>
      )}

      {/* ---------------- banners + toasts */}
      {banner && (
        <div key={banner.k} className={`lh-banner lh-banner--${banner.kind}`}>
          <span>{banner.sub}</span>
          <b>{banner.title}</b>
          {banner.extra && <em>{banner.extra}</em>}
        </div>
      )}
      <div className="lh-toasts">
        {toasts.map((t) => (
          <div key={t.k} className={`lh-toast lh-toast--${t.kind}`}>
            {t.icon && <Icon id={t.icon} size={22} />}
            {t.text}
          </div>
        ))}
      </div>
      {touch && <TouchControls input={input} hud={hud} onInventory={onInventory} onBuild={onBuild} onMap={onMap} />}
    </div>
  );
}
