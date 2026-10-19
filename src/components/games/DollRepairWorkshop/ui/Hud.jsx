/**
 * The repair HUD: order bar (customer, timer, money, level, satisfaction),
 * the checklist, the tool belt, camera controls and the contextual panel
 * for the active tool (parts tray, paint palette, customization…).
 * It re-renders on a throttled HUD tick; the 3D loop never waits on React.
 */
import { useState } from "react";
import { Icon, Avatar, DollBadge } from "./icons.jsx";
import { money, TopStats, requestText } from "./screens.jsx";
import { TOOLS, SUPPLIES, PARTS } from "../data/items.js";
import { DOLL_TYPES, HAIR_COLORS, HAIR_STYLES, FABRIC_COLORS, OUTFITS, SHOES, SHOE_COLORS, SHOE_HEX, ACCESSORIES, PAINT_TARGETS, PAINT_COLORS } from "../data/dolls.js";
import { qty } from "../engine/progress.js";

const SHORT = { hand: "Rotate", magnifier: "Inspect", brush: "Brush", cloth: "Cloth", sponge: "Sponge", spray: "Spray", polish: "Polish", glue: "Glue", pliers: "Pliers", comb: "Comb", shampoo: "Shampoo", dryer: "Dryer", reroot: "Reroot", paint: "Paint", needle: "Needle" };
const TIPS = {
  magnifier: "Click damaged spots on the doll. Rotate (drag) and zoom (wheel) to check every side.",
  hand: "Drag to turn the doll · wheel to zoom · right-drag to pan.",
  brush: "Rub over dusty areas — several passes lift the dust.",
  cloth: "Wipes dust and light dirt. Buff cured cracks until they shine.",
  sponge: "Scrub dirt. On a wet surface the sponge is twice as strong — and only wet stains lift.",
  spray: "Hold to mist the surface. Then scrub with the sponge while it's wet.",
  polish: "Rub along scratches to buff them out — or over glazed skin to bring back the shine.",
  glue: "Trace the crack line carefully. Stay on it, don't flood it — then wait for it to cure.",
  pliers: "Click a broken part to remove it, then pick a replacement from the tray.",
  comb: "Brush from the roots down to the tips. Going against the grain snags!",
  shampoo: "Lather the hair — wet hair detangles twice as fast. Dry it afterwards.",
  dryer: "Hold over wet hair until it's dry.",
  reroot: "Hold the tool on a bald patch to plant new hair.",
  paint: "Paint inside the dashed outlines with the original colours.",
  needle: "Follow the stitch points along the tear, one after another.",
};

export default function Hud({ s, save, phase, tool, carry, live, elapsed, onTool, onPhase, onPause, onShop, onPick, onCancelCarry, onRotateCarry, onPaint, onLook, onCam, detector, onDetector, hints }) {
  const order = s.order;
  const T = DOLL_TYPES[s.type];
  const hasHair = !!s.model.hair;
  const deadline = order.time * (1 + [0, 0.15, 0.3][save.upgrades.waiting || 0]);
  const left = Math.max(0, deadline - elapsed);
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const found = s.damages.filter((d) => d.found).length;
  const pending = phase === "repair" ? s.pendingTasks() : [];
  const tools = ["hand", "magnifier", "brush", "cloth", "sponge", "spray", "polish", "glue", "pliers", ...(hasHair ? ["comb", "shampoo", "dryer", "reroot"] : []), ...(T.paint.length ? ["paint"] : []), "needle"];
  const usable = (id) => (phase === "inspect" ? id === "hand" || id === "magnifier" : phase === "repair" ? id !== "magnifier" : id === "hand");
  return (
    <div className="drw-hud">
      {/* -------- top bar */}
      <div className="drw-top">
        <div className="drw-orderchip">
          <Avatar c={order.customer} size={36} />
          <div><b>{order.title}</b><small>{order.customer.name} · {T.short}</small></div>
        </div>
        <div className={`drw-timer ${left <= 0 ? "late" : left < 30 ? "warn" : ""}`} title="Finish inside the time window for a bonus">
          <Icon name="clock" />{left > 0 ? fmt(left) : "bonus missed"}
        </div>
        <div className="drw-sat" title="Estimated customer satisfaction">
          <Icon name="heart" /><span className="bar"><i style={{ width: `${live}%`, background: live >= 80 ? "var(--mint)" : live >= 55 ? "var(--butter)" : "var(--rose)" }} /></span><b>{live}%</b>
        </div>
        <TopStats save={save} compact />
        <button className="drw-iconbtn" onClick={onPause} aria-label="Pause"><Icon name="pause" /></button>
      </div>

      {/* -------- checklist */}
      <div className="drw-check">
        <h4>{phase === "inspect" ? "Inspection" : phase === "repair" ? "Repair checklist" : "Customize & deliver"}</h4>
        {phase === "inspect" && (
          <>
            <p className="sub">Found <b>{found}</b> of {s.damages.length} problems</p>
            <ul>
              {s.damages.filter((d) => d.found).map((d) => <li key={d.id} className="done"><Icon name="check" />{d.label}</li>)}
              {Array.from({ length: s.damages.length - found }, (_, i) => <li key={`q${i}`} className="unknown">? still hidden</li>)}
            </ul>
            <button className="drw-btn primary" onClick={() => onPhase("finishInspect")}><Icon name="check" />Finish inspection</button>
          </>
        )}
        {phase === "repair" && (
          <>
            <ul>
              {s.tasks.map((t) => {
                const d = s.damages.find((x) => x.id === t.dmg);
                return (
                  <li key={t.id} className={`${t.done ? "done" : ""} ${d?.missed ? "missed" : ""}`}>
                    {t.done ? <Icon name="check" /> : <span className="dot" />}
                    <span className="lbl">{t.label}{d?.missed && <em> missed in inspection</em>}{t.kind === "crack" && !t.done && <em> {t.stage === "curing" ? "· curing…" : t.stage === "cured" ? "· buff with cloth" : ""}</em>}{t.kind === "part" && !t.done && t.stage === "broken" && <em> · remove first</em>}{t.kind === "button" && t.stage === "sew" && <em> · sew it on</em>}</span>
                    <span className="pbar"><i style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} /></span>
                    {t.done && <b className="sc">{t.score}</b>}
                  </li>
                );
              })}
              {pending.some((t) => t.kind === "dry") && <li className="extra"><span className="dot" /><span className="lbl">Dry the wet hair</span></li>}
            </ul>
            <button className="drw-btn primary" disabled={pending.length > 0} onClick={() => onPhase("finishRepairs")}><Icon name="wardrobe" />{pending.length ? `${pending.length} repair${pending.length > 1 ? "s" : ""} left` : "Repairs done → Customize"}</button>
          </>
        )}
        {phase === "customize" && (
          <>
            {order.requests.length ? (
              <ul>{order.requests.map((r, i) => <li key={i} className={reqMet(s, r) ? "done" : ""}>{reqMet(s, r) ? <Icon name="check" /> : <span className="dot" />}<span className="lbl">{requestText(r)}</span></li>)}</ul>
            ) : <p className="sub">No special requests — style freely or deliver as is.</p>}
            <button className="drw-btn primary" onClick={() => onPhase("submit")}><Icon name="heart" />Deliver to {order.customer.name.split(" ")[0]}</button>
          </>
        )}
      </div>

      {/* -------- contextual panel */}
      <div className="drw-side">
        {phase === "customize" ? <Customize s={s} save={save} onLook={onLook} /> :
          carry ? <CarryPanel carry={carry} onRotate={onRotateCarry} onCancel={onCancelCarry} /> :
            tool === "pliers" ? <PartsTray s={s} save={save} onPick={onPick} onShop={onShop} /> :
              tool === "paint" ? <PaintPanel s={s} onPaint={onPaint} /> :
                tool && tool !== "hand" ? <ToolCard id={tool} save={save} s={s} /> : null}
      </div>

      {/* -------- camera controls */}
      <div className="drw-camctl">
        <button onClick={() => onCam("rotL")} aria-label="Rotate left"><Icon name="rotL" /></button>
        <button onClick={() => onCam("rotR")} aria-label="Rotate right"><Icon name="rotR" /></button>
        <button onClick={() => onCam("in")} aria-label="Zoom in"><Icon name="plus" /></button>
        <button onClick={() => onCam("out")} aria-label="Zoom out"><Icon name="minus" /></button>
        <span className="sep" />
        {["head", "body", "legs", "full"].map((f) => <button key={f} className="txt" onClick={() => onCam(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        {(save.upgrades.lighting || 0) >= 1 && <button className={`txt ${detector ? "on" : ""}`} onClick={onDetector} title="UV dirt detector"><Icon name="bulb" />UV</button>}
      </div>

      {/* -------- tool belt */}
      <div className="drw-belt" role="toolbar" aria-label="Tools">
        {tools.map((id) => {
          const t = TOOLS[id];
          const owned = id === "hand" || !!save.tools[id];
          const use = t?.uses;
          const n = use ? qty(save, use) : null;
          const ok = usable(id);
          return (
            <button key={id} className={`drw-tool ${tool === id ? "on" : ""} ${owned ? "" : "locked"} ${ok ? "" : "dim"}`} onClick={() => onTool(id)} title={id === "hand" ? "Rotate (no tool)" : `${t.name}${owned ? "" : ` — ${money(t.price)} in the Shop`}`}>
              <Icon name={id === "hand" ? "hand" : t.icon} />
              <span className="nm">{SHORT[id]}</span>
              {!owned && <span className="lock"><Icon name="lock" /></span>}
              {owned && n != null && <span className={`qty ${n === 0 ? "zero" : ""}`}>{n}</span>}
            </button>
          );
        })}
        <button className="drw-tool shopbtn" onClick={() => onShop("supplies")} title="Buy supplies"><Icon name="shop" /><span className="nm">Shop</span></button>
      </div>
      {hints && <div className="drw-tip">{phase === "customize" ? "Use the panel on the right to restyle the doll — changes appear instantly." : TIPS[tool] || TIPS.hand}</div>}
    </div>
  );
}

function reqMet(s, r) {
  const look = s.model.look;
  if (r.key === "keep") return s.lookChanges.size === 0;
  if (r.key === "wash") return !!s.task("wash")?.done;
  if (r.key === "shine") return !!s.task("shine")?.done;
  if (r.key === "eyeColor") return s.model.eyeColor.L === r.value && s.model.eyeColor.R === r.value;
  if (r.key === "buttonMatch") return s.tasksOf("button").every((t) => t.partId === `button:${s.model.buttonStyle}`);
  if (r.key === "button") return s.tasksOf("button").every((t) => t.partId === `button:${r.value}`);
  if (r.key === "shoeMatch") return s.tasks.filter((t) => t.socket?.startsWith("shoe")).every((t) => t.partId === `shoe:${look.shoes}`);
  return look[r.key] === r.value;
}

function ToolCard({ id, save, s }) {
  const t = TOOLS[id];
  if (!t) return null;
  const owned = !!save.tools[id];
  const relevant = s.tasks.filter((x) => !x.done && x.tools?.includes(id));
  return (
    <div className="drw-card">
      <h4><Icon name={t.icon} /> {t.name}</h4>
      {!owned && <p className="warn"><Icon name="lock" /> Not owned — {money(t.price)} in the Shop</p>}
      <p>{TIPS[id]}</p>
      {t.uses && <p className="sup"><Icon name="box" /> {SUPPLIES[t.uses].name}: <b>{qty(save, t.uses)}</b></p>}
      {relevant.length > 0 && <ul className="rel">{relevant.map((x) => <li key={x.id}>{x.label}<span className="pbar"><i style={{ width: `${Math.round((x.progress || 0) * 100)}%` }} /></span></li>)}</ul>}
    </div>
  );
}

function PartsTray({ s, save, onPick, onShop }) {
  const open = s.openSockets();
  const broken = s.tasks.filter((t) => (t.kind === "part") && t.stage === "broken");
  const stock = Object.keys(PARTS).filter((id) => qty(save, id) > 0);
  const groups = ["arm", "leg", "eye", "button", "shoe", "acc"];
  return (
    <div className="drw-card parts">
      <h4><Icon name="box" /> Parts tray</h4>
      {broken.length > 0 && <p className="hint">Remove first: {broken.map((t) => t.label.replace("Replace the ", "")).join(", ")} — click it with the pliers.</p>}
      {open.length > 0 ? <p className="hint ok">Open socket{open.length > 1 ? "s" : ""}: {open.map((o) => o.id.replace(/([LR])$/, " ($1)").replace("acc:", "")).join(", ")}</p> : broken.length === 0 && <p className="hint">No open sockets.</p>}
      {stock.length === 0 && <p className="hint warn">Your tray is empty.</p>}
      <div className="drw-parts">
        {groups.map((g) => {
          const items = stock.filter((id) => PARTS[id].kind === g);
          if (!items.length) return null;
          return (
            <div key={g} className="grp">
              <span className="gl">{g === "acc" ? "Accessories" : `${g[0].toUpperCase()}${g.slice(1)}s`}</span>
              {items.map((id) => (
                <button key={id} className="drw-part" disabled={!open.length} onClick={() => onPick(id)}>
                  {PARTS[id].doll ? <DollBadge type={PARTS[id].doll} size={22} /> : <Icon name={g === "eye" ? "eye" : g === "button" ? "coin" : "sparkle"} />}
                  <span>{PARTS[id].name}</span><b>×{qty(save, id)}</b>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <button className="drw-btn tiny" onClick={() => onShop("parts")}><Icon name="shop" />Buy parts</button>
    </div>
  );
}

function CarryPanel({ carry, onRotate, onCancel }) {
  const status = !carry.snapped ? "Bring it to the glowing socket" : !carry.fits ? carry.why || "It doesn't fit here" : Math.abs(carry.angle) > 14 ? "Rotate to line it up" : "Aligned — click to attach!";
  const col = !carry.snapped ? "" : !carry.fits ? "bad" : Math.abs(carry.angle) > 14 ? "warn" : "good";
  return (
    <div className="drw-card carry">
      <h4><Icon name="pliers" /> Fitting: {PARTS[carry.partId]?.name}</h4>
      <p className={`status ${col}`}>{status}</p>
      {PARTS[carry.partId]?.kind !== "button" && (
        <>
          <div className="dial"><i style={{ transform: `rotate(${carry.angle}deg)` }} /><span>{Math.round(carry.angle)}°</span></div>
          <div className="row">
            <button className="drw-btn tiny" onMouseDown={() => onRotate(-6)} onClick={() => {}}><Icon name="rotL" />Q</button>
            <button className="drw-btn tiny" onMouseDown={() => onRotate(6)}><Icon name="rotR" />E</button>
          </div>
          <p className="hint">Mouse wheel / Q / E rotates the part.</p>
        </>
      )}
      <button className="drw-btn tiny ghost" onClick={onCancel}><Icon name="close" />Put it back</button>
    </div>
  );
}

function PaintPanel({ s, onPaint }) {
  const t = s.tasksOf("paint").find((x) => !x.done);
  const colors = s.paintColors();
  if (!t) return <div className="drw-card"><h4><Icon name="paint" /> Paint</h4><p>No painting needed{s.tasksOf("paint").length ? " — the face is done!" : " on this doll."}</p></div>;
  return (
    <div className="drw-card paint">
      <h4><Icon name="paint" /> Face painting</h4>
      <p className="hint">Restore: {t.features.map((f) => PAINT_TARGETS[f].name).join(", ")}</p>
      <div className="swatches">
        {colors.map((c) => {
          const i = PAINT_COLORS.indexOf(c);
          return <button key={c.id} className={`sw ${s.paintColor === i && !s.eraser ? "on" : ""}`} style={{ background: c.hex }} onClick={() => onPaint({ color: i, eraser: false })} aria-label={c.id} />;
        })}
      </div>
      <div className="row">
        {["S", "M", "L"].map((l, i) => <button key={l} className={`drw-btn tiny ${s.paintSize === i ? "on" : ""}`} onClick={() => onPaint({ size: i })}>{l}</button>)}
        <button className={`drw-btn tiny ${s.eraser ? "on" : ""}`} onClick={() => onPaint({ eraser: !s.eraser })}><Icon name="eraser" />Eraser</button>
        <button className="drw-btn tiny" onClick={() => onPaint({ undo: true })} disabled={!s.undoStack.length}><Icon name="undo" />Undo</button>
      </div>
      <ul className="cov">
        {t.features.map((f) => <li key={f}><span>{PAINT_TARGETS[f].name}</span><span className="pbar"><i style={{ width: `${Math.round((t.cov[f] || 0) * 100)}%`, background: (t.cov[f] || 0) >= 0.6 ? "var(--mint)" : "var(--butter)" }} /></span><b>{Math.round((t.cov[f] || 0) * 100)}%</b></li>)}
        <li><span>Neatness</span><span className="pbar"><i style={{ width: `${Math.round((1 - (t.spill || 0)) * 100)}%` }} /></span><b>{Math.round((1 - (t.spill || 0)) * 100)}%</b></li>
        <li><span>Colour match</span><span className="pbar"><i style={{ width: `${Math.round((t.color || 0) * 100)}%` }} /></span><b>{Math.round((t.color || 0) * 100)}%</b></li>
      </ul>
      <button className="drw-btn primary" disabled={!t.ready} onClick={() => onPaint({ done: true })}><Icon name="check" />Done painting</button>
    </div>
  );
}

function Customize({ s, save, onLook }) {
  const [tab, setTab] = useState(s.model.hair ? "hair" : "outfit");
  const T = DOLL_TYPES[s.type];
  const look = s.model.look;
  const lvl = save.level;
  const opt = (key, value, label, locked, swatch) => (
    <button key={value} className={`drw-opt ${look[key] === value ? "on" : ""} ${locked ? "locked" : ""}`} disabled={locked} onClick={() => onLook(key, value)} title={locked ? "Unlocks at a higher level" : label}>
      {swatch && <i className="sw" style={{ background: swatch }} />}
      <span>{label}</span>
      {locked && <Icon name="lock" />}
    </button>
  );
  const tabs = [...(s.model.hair ? [["hair", "Hair"]] : []), ["outfit", "Outfit"], ...(T.shoes.length > 1 ? [["shoes", "Shoes"]] : []), ["acc", "Accessories"]];
  return (
    <div className="drw-card custom">
      <h4><Icon name="wardrobe" /> Customize</h4>
      <div className="drw-tabs small">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "hair" && (
        <>
          <span className="gl">Style</span>
          <div className="opts">{T.styles.map((st) => opt("hairStyle", st, HAIR_STYLES[st].name, HAIR_STYLES[st].level > lvl))}</div>
          <span className="gl">Colour</span>
          <div className="opts">{Object.entries(HAIR_COLORS).map(([k, c]) => opt("hairColor", k, c.name, c.level > lvl, c.hex))}</div>
        </>
      )}
      {tab === "outfit" && (
        <>
          <span className="gl">Outfit</span>
          <div className="opts">{T.outfits.map((o) => opt("outfit", o, OUTFITS[o].name, OUTFITS[o].level > lvl))}</div>
          <span className="gl">Colour</span>
          <div className="opts swatches">{Object.entries(FABRIC_COLORS).map(([k, c]) => opt("dressColor", k, c.name, false, c.hex))}</div>
          <span className="gl">Ribbons &amp; trim</span>
          <div className="opts swatches">{Object.entries(FABRIC_COLORS).map(([k, c]) => opt("accent", k, c.name, false, c.hex))}</div>
        </>
      )}
      {tab === "shoes" && (
        <>
          <span className="gl">Style</span>
          <div className="opts">{T.shoes.map((st) => opt("shoes", st, SHOES[st].name, SHOES[st].level > lvl))}</div>
          <span className="gl">Colour</span>
          <div className="opts swatches">{SHOE_COLORS.map((c) => opt("shoeColor", c, c, false, SHOE_HEX[c]))}</div>
        </>
      )}
      {tab === "acc" && (
        <>
          <span className="gl">Hat / headpiece</span>
          <div className="opts">{T.hats.map((a) => opt("hat", a, ACCESSORIES[a].name, ACCESSORIES[a].level > lvl))}</div>
          <span className="gl">Ribbon</span>
          <div className="opts">{T.ribbons.map((a) => opt("ribbon", a, ACCESSORIES[a].name, ACCESSORIES[a].level > lvl))}</div>
          <span className="gl">Extra</span>
          <div className="opts">{T.extras.map((a) => opt("extra", a, ACCESSORIES[a].name, ACCESSORIES[a].level > lvl))}</div>
        </>
      )}
    </div>
  );
}
