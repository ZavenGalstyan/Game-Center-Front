/**
 * Quest journal + district map.
 */
import { useEffect, useRef, useState } from "react";
import { DISTRICTS, DISTRICT_ORDER } from "../data/districts/index.js";
import { STACKS } from "../data/items.js";
import { bakeMap } from "./Hud.jsx";

export function Journal({ G, onTrack }) {
  const list = G.missions.journal();
  const cur = list.find((c) => c.status === "active") || list.find((c) => c.status === "available") || list[list.length - 1];
  const [sel, setSel] = useState(cur?.id);
  const c = list.find((x) => x.id === sel) || cur;
  const done = list.filter((x) => x.status === "done").length;
  const acts = [
    ["Act I — Neon Market", 1, 7],
    ["Act II — Industrial Sector", 8, 14],
    ["Act III — Corporate District", 15, 20],
  ];
  return (
    <div className="nm-journal">
      <div className="nm-journal__list">
        <div className="nm-journal__progress">
          <span>Story progress</span>
          <div className="nm-bar__track">
            <div className="nm-bar__fill" style={{ width: `${(done / 20) * 100}%` }} />
          </div>
          <b>{done}/20</b>
        </div>
        {acts.map(([name, a, b]) => (
          <div key={name}>
            <h4>{name}</h4>
            {list
              .filter((x) => x.id >= a && x.id <= b)
              .map((x) => (
                <button key={x.id} className={`nm-jitem nm-jitem--${x.status}${x.id === c?.id ? " nm-jitem--sel" : ""}`} onClick={() => setSel(x.id)} disabled={x.status === "locked"}>
                  <span className="nm-jitem__n">{String(x.id).padStart(2, "0")}</span>
                  <span>{x.status === "locked" ? "??????" : x.title}</span>
                  <em>{x.status === "done" ? "✓" : x.status === "active" ? "◆" : x.status === "available" ? "NEW" : ""}</em>
                </button>
              ))}
          </div>
        ))}
      </div>
      {c && c.status !== "locked" && (
        <div className="nm-journal__detail">
          <div className="nm-kicker">
            Contract {c.id} · {DISTRICTS[c.district].name}
          </div>
          <h2 className="nm-h2">{c.title}</h2>
          <div className="nm-dim">
            Client: {c.giver} · Location: {c.location}
          </div>
          <p>{c.brief}</p>
          <h4>Objectives</h4>
          <ul className="nm-objlist">
            {c.steps.map((s, i) => (
              <li key={i} className={s.done ? "done" : c.status === "active" && !s.done && (i === 0 || c.steps[i - 1].done) ? "now" : ""}>
                {s.text}
              </li>
            ))}
          </ul>
          <h4>Rewards</h4>
          <div className="nm-rewards">
            <span>+{c.rewards.xp} XP</span>
            <span>+{c.rewards.credits} ¢</span>
            {Object.entries(c.rewards.stacks || {}).map(([k, n]) => (
              <span key={k}>
                {n}× {STACKS[k].name}
              </span>
            ))}
          </div>
          {c.status === "available" && (
            <p className="nm-dim nm-small">
              {G.districtId === c.district ? "Accept it at a Contract Terminal in this district." : `Travel to the ${DISTRICTS[c.district].name} by Maglev to accept it.`}
            </p>
          )}
          {c.status === "active" && (
            <button className="nm-btn nm-btn--sm" onClick={onTrack}>
              Show on map
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DistrictMap({ G }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const g = cv.getContext("2d");
      const baked = bakeMap(G);
      const M = G.map;
      // show the city rect + any interior area the player or objective is in
      const city = { x0: M.origin[0] - 4, z0: M.origin[1] - 4, x1: M.origin[0] + M.cityW + 4, z1: M.origin[1] + M.cityD + 4 };
      let view = city;
      const reg = G.missions.regionOf(G.player.x, G.player.z);
      if (reg !== "city") {
        const a = G.def.areas[+reg.slice(1)];
        view = { x0: a.x0 - 4, z0: a.z0 - 4, x1: a.x1 + 4, z1: a.z1 + 4 };
      }
      const W = cv.width;
      const H = cv.height;
      const k = Math.min(W / (view.x1 - view.x0), H / (view.z1 - view.z0));
      const ox = (W - (view.x1 - view.x0) * k) / 2;
      const oz = (H - (view.z1 - view.z0) * k) / 2;
      // north (−Z) up; facing north in the 3D view, +X is to the right
      const X = (x) => ox + (x - view.x0) * k;
      const Z = (z) => oz + (z - view.z0) * k;
      g.fillStyle = "#05050a";
      g.fillRect(0, 0, W, H);
      g.drawImage(baked.c, ox + (baked.b.x0 - view.x0) * k, oz + (baked.b.z0 - view.z0) * k, baked.c.width * (k / baked.S), baked.c.height * (k / baked.S));
      const label = (x, z, text, col, icon = "●") => {
        g.fillStyle = col;
        g.font = "bold 13px sans-serif";
        g.textAlign = "center";
        g.fillText(icon, X(x), Z(z) + 5);
        if (text) {
          g.font = "11px sans-serif";
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.fillText(text, X(x), Z(z) + 19);
        }
      };
      for (const n of G.npcs) if (!n.hidden) label(n.x, n.z, n.def?.name?.split(" ")[0], n.def?.shop ? "#ffb02e" : "#4dff9a");
      for (const t of G.def.terminals || []) label(t.x, t.z, "Contracts", "#19f0ff", "◆");
      for (const s of G.def.stations || []) label(s.x, s.z, s.label, "#a64dff", "◆");
      for (const d of G.def.doors || []) if (G.missions.doorOpen(d)) label(d.at[0], d.at[1], "", "#a64dff", "▣");
      for (const m of G.missions.markers()) {
        if (m.kind === "enemy") label(m.x, m.z, "", "#ff3b5c", "✕");
        else if (m.kind === "area") {
          g.strokeStyle = "#ffd23f";
          g.setLineDash([5, 4]);
          g.beginPath();
          g.arc(X(m.x), Z(m.z), (m.r || 8) * k, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          label(m.x, m.z, m.label, "#ffd23f", "?");
        } else label(m.x, m.z, m.label, "#ffd23f", "◆");
      }
      // player
      const p = G.player;
      g.save();
      g.translate(X(p.x), Z(p.z));
      g.rotate(Math.PI - G.camYaw);
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(6, 7);
      g.lineTo(0, 3);
      g.lineTo(-6, 7);
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.font = "bold 12px sans-serif";
      g.textAlign = "left";
      g.fillText("N ↑", 10, 18);
    };
    draw();
    const id = setInterval(draw, 250);
    return () => clearInterval(id);
  }, [G]);
  return (
    <div className="nm-map">
      <div className="nm-map__tabs">
        {DISTRICT_ORDER.map((id) => (
          <span key={id} className={`nm-map__tab${id === G.districtId ? " on" : ""}${G.P.unlocked[id] ? "" : " locked"}`}>
            {DISTRICTS[id].name}
            {!G.P.unlocked[id] && " 🔒"}
          </span>
        ))}
      </div>
      <canvas ref={ref} width={760} height={560} className="nm-map__canvas" />
      <div className="nm-map__legend">
        <span style={{ color: "#ffd23f" }}>◆ Objective</span>
        <span style={{ color: "#19f0ff" }}>◆ Contract terminal</span>
        <span style={{ color: "#a64dff" }}>◆ Transit / doors</span>
        <span style={{ color: "#ffb02e" }}>● Vendor</span>
        <span style={{ color: "#4dff9a" }}>● Contact</span>
        <span style={{ color: "#ff3b5c" }}>✕ Target</span>
      </div>
    </div>
  );
}
