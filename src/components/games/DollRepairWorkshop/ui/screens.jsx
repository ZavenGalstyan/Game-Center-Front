/**
 * Doll Repair Workshop — menu-type screens: main menu, order board,
 * customer at the counter, workshop shop, gallery, how-to, settings, pause
 * and the order result with its before/after comparison controls.
 */
import { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, DollBadge } from "./icons.jsx";
import { DOLL_TYPES, DAMAGE, HAIR_COLORS, FABRIC_COLORS, HAIR_STYLES, OUTFITS, ACCESSORIES, SHOES } from "../data/dolls.js";
import { TOOLS, TOOL_ORDER, SUPPLIES, SUPPLY_ORDER, PARTS, UPGRADES, UPGRADE_ORDER, MAX_LEVEL, xpToNext, LEVEL_TITLES } from "../data/items.js";
import { orderBoard, toolsNeeded, nextUpgrade, tier, qty, capOf, CHALLENGES, ensureChallenges, DEPOSIT } from "../engine/progress.js";

export const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const reqText = (r) => {
  if (r.key === "keep") return "Keep her original look";
  if (r.key === "wash") return "Wash the hair";
  if (r.key === "shine") return "Polish to a high shine";
  if (r.key === "buttonMatch") return "Matching buttons";
  if (r.key === "shoeMatch") return "A matching pair of shoes";
  if (r.key === "button") return `${cap(r.value)} buttons`;
  if (r.key === "eyeColor") return `${cap(r.value)} eyes`;
  if (r.key === "hairColor") return `${HAIR_COLORS[r.value]?.name || r.value} hair`;
  if (r.key === "hairStyle") return `${HAIR_STYLES[r.value]?.name || r.value} hairstyle`;
  if (r.key === "outfit") return `A ${OUTFITS[r.value]?.name || r.value}`;
  if (r.key === "dressColor") return `${FABRIC_COLORS[r.value]?.name || r.value} dress`;
  if (r.key === "shoeColor") return `${cap(r.value)} shoes`;
  if (r.key === "shoes") return SHOES[r.value]?.name || r.value;
  if (r.key === "accent") return `${FABRIC_COLORS[r.value]?.name || r.value} ribbon`;
  if (["hat", "ribbon", "extra"].includes(r.key)) return `A ${ACCESSORIES[r.value]?.name || r.value}`;
  return r.key;
};
export const requestText = reqText;
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const stars = (n, max = 5) => (
  <span className="drw-stars" aria-label={`${n} of ${max} stars`}>
    {Array.from({ length: max }, (_, i) => <Icon key={i} name="star" className={i < n ? "on" : ""} />)}
  </span>
);
export const Stars = ({ n }) => stars(n);
const difficulty = (o) => Math.min(5, Math.ceil(o.damage.length / 2));
const damageSummary = (o) => [...new Set(o.damage.map((d) => DAMAGE[d.kind]?.label || d.kind))].join(" · ");

export function TopStats({ save, compact = false }) {
  const need = xpToNext(save.level);
  return (
    <div className={`drw-stats ${compact ? "compact" : ""}`}>
      <div className="drw-chip money"><Icon name="coin" />{money(save.money)}</div>
      <div className="drw-chip level" title={`${save.xp} / ${need === Infinity ? "max" : need} XP`}>
        <span className="lv">Lv {save.level}</span>
        <span className="xpbar"><i style={{ width: `${save.level >= MAX_LEVEL ? 100 : Math.min(100, (save.xp / need) * 100)}%` }} /></span>
        {!compact && <span className="ttl">{LEVEL_TITLES[save.level]}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- menu */
export function MainMenu({ save, onPlay, onContinue, onBoard, onShop, onGallery, onHow, onSettings, onClaim }) {
  const ch = ensureChallenges(save);
  const done = Object.keys(save.completed).length;
  const active = save.active;
  return (
    <div className="drw-screen drw-menu">
      <div className="drw-menu-card">
        <div className="drw-logo">
          <span className="drw-logo-mark"><Icon name="sparkle" /></span>
          <h1>Doll Repair Workshop</h1>
          <p className="tag">REPAIR • RESTORE • CREATE</p>
        </div>
        <TopStats save={save} />
        <nav className="drw-menu-buttons">
          <button className="drw-btn primary big" onClick={onPlay}><Icon name="play" />{active ? "Resume Job" : save.started ? "Play" : "Start Your Workshop"}</button>
          <button className="drw-btn" onClick={onContinue} disabled={!active}><Icon name="clock" />Continue{active ? "" : " (no active job)"}</button>
          <button className="drw-btn" onClick={onBoard}><Icon name="list" />Customer Orders <em>{done}/30</em></button>
          <button className="drw-btn" onClick={onShop}><Icon name="shop" />Workshop</button>
          <button className="drw-btn" onClick={onGallery}><Icon name="gallery" />Doll Gallery <em>{save.gallery.length}</em></button>
          <div className="drw-menu-row">
            <button className="drw-btn" onClick={onHow}><Icon name="help" />How to Play</button>
            <button className="drw-btn" onClick={onSettings}><Icon name="gear" />Settings</button>
          </div>
        </nav>
      </div>
      <aside className="drw-challenges">
        <h3><Icon name="trophy" /> Daily challenges</h3>
        <ul>
          {ch.list.map((c) => {
            const C = CHALLENGES[c.id];
            const pct = Math.min(100, (c.progress / C.target) * 100);
            const ready = c.progress >= C.target && !c.claimed;
            return (
              <li key={c.id} className={c.claimed ? "claimed" : ready ? "ready" : ""}>
                <div className="lbl">{C.label}</div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="meta">
                  <span>{Math.floor(c.progress)}/{C.target}</span>
                  <span>{money(C.money)} · {C.xp} XP</span>
                </div>
                {ready && <button className="drw-btn tiny primary" onClick={() => onClaim(c.id)}>Claim</button>}
                {c.claimed && <span className="claimed-tag"><Icon name="check" /> Claimed</span>}
              </li>
            );
          })}
        </ul>
        <p className="note">New challenges every day.</p>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- board */
export function OrderBoard({ save, onPick, onBack, onShop }) {
  const board = useMemo(() => orderBoard(save), [save, save.level, save.walkSeed, Object.keys(save.completed).length]);
  const [sel, setSel] = useState(() => board.next?.order.id ?? board.story[0].order.id);
  const all = [...board.story.map((s) => ({ ...s, key: s.order.id })), ...board.walk.map((w) => ({ order: w, done: false, locked: false, stars: 0, key: w.id }))];
  const cur = all.find((x) => x.key === sel) || all[0];
  const o = cur.order;
  const missing = toolsNeeded(o).filter((t) => !save.tools[t]);
  const T = DOLL_TYPES[o.type];
  return (
    <div className="drw-screen drw-board">
      <header className="drw-head">
        <button className="drw-btn ghost" onClick={onBack}><Icon name="close" />Back</button>
        <h2><Icon name="list" /> Customer Orders</h2>
        <TopStats save={save} compact />
      </header>
      <div className="drw-board-body">
        <div className="drw-order-list" role="listbox" aria-label="Orders">
          <div className="sect">Story orders</div>
          {board.story.map((s) => (
            <button key={s.order.id} role="option" aria-selected={sel === s.order.id} className={`drw-order ${sel === s.order.id ? "sel" : ""} ${s.locked ? "locked" : ""} ${s.done ? "done" : ""}`} onClick={() => setSel(s.order.id)}>
              <span className="num">{s.order.id}</span>
              <span className="ttl">{s.order.title}<small>{DOLL_TYPES[s.order.type].short} · {s.locked ? `Level ${s.order.level}` : money(s.order.budget)}</small></span>
              {s.done ? stars(s.stars) : s.locked ? <Icon name="lock" /> : board.next?.order.id === s.order.id ? <span className="new">NEXT</span> : null}
            </button>
          ))}
          <div className="sect">Special walk-in jobs</div>
          {board.walk.map((w) => (
            <button key={w.id} role="option" aria-selected={sel === w.id} className={`drw-order walk ${sel === w.id ? "sel" : ""}`} onClick={() => setSel(w.id)}>
              <span className="num"><Icon name="sparkle" /></span>
              <span className="ttl">{w.title}<small>{w.customer.name} · {money(w.budget)}</small></span>
            </button>
          ))}
        </div>
        <div className="drw-order-detail">
          <div className="who">
            <Avatar c={o.customer} size={72} />
            <div>
              <h3>{o.title}</h3>
              <p className="cust">{o.customer.name}{o.customer.mood === "picky" ? " · Picky customer" : o.customer.mood === "busy" ? " · In a hurry" : ""}</p>
              <div className="diff">Difficulty {stars(difficulty(o))}</div>
            </div>
          </div>
          <blockquote>“{o.story}”</blockquote>
          <div className="grid2">
            <div className="kv"><span>Doll</span><b><DollBadge type={o.type} size={26} /> {T.name}</b></div>
            <div className="kv"><span>Budget</span><b>{money(o.budget)} <small>({money(o.budget * DEPOSIT)} deposit)</small></b></div>
            <div className="kv"><span>Time bonus</span><b>under {Math.floor(o.time / 60)}:{String(o.time % 60).padStart(2, "0")}</b></div>
            <div className="kv"><span>XP</span><b>up to {o.xp}</b></div>
          </div>
          <div className="kv wide"><span>Reported problems</span><b>{damageSummary(o)}</b></div>
          {o.requests.length > 0 && <div className="kv wide"><span>Requests</span><b>{o.requests.map(reqText).join(" · ")}</b></div>}
          {missing.length > 0 && (
            <div className="drw-warn">
              <Icon name="lock" /> You'll need: {missing.map((t) => `${TOOLS[t].name} (${money(TOOLS[t].price)}${save.level < TOOLS[t].level ? `, Lv ${TOOLS[t].level}` : ""})`).join(", ")}
              <button className="drw-btn tiny" onClick={onShop}>Open Shop</button>
            </div>
          )}
          <div className="actions">
            <button className="drw-btn primary big" disabled={cur.locked || !!save.active} onClick={() => onPick(o)}>
              {cur.locked ? `Unlocks at level ${o.level}` : save.active ? "Finish your current job first" : cur.done ? "Take the job again" : "Meet the customer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- customer */
export function CustomerDialog({ order, phase, onAccept, onDecline, reaction }) {
  const [shown, setShown] = useState(0);
  const text = reaction ? reaction.text : order.story;
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(id), n) : n + 2)), 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div className="drw-screen drw-customer">
      <div className="drw-speech">
        <div className="who">
          <Avatar c={order.customer} size={58} />
          <div>
            <b>{order.customer.name}</b>
            <small>{reaction ? reaction.mood : DOLL_TYPES[order.type].name}</small>
          </div>
        </div>
        <p className="line">{text.slice(0, shown)}<span className="caret" /></p>
        {!reaction && (
          <>
            {order.requests.length > 0 && <p className="reqs"><Icon name="heart" /> {order.requests.map(reqText).join(" · ")}</p>}
            <div className="actions">
              <button className="drw-btn ghost" onClick={onDecline}>Not now</button>
              <button className="drw-btn primary" onClick={onAccept} disabled={phase === "busy"}><Icon name="check" />Accept job · {money(order.budget * DEPOSIT)} deposit</button>
            </div>
          </>
        )}
        {reaction && <div className="actions"><button className="drw-btn primary" onClick={reaction.onNext}>See results</button></div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- shop */
export function ShopScreen({ save, onBuy, onBack, initialTab = "tools", inJob = false }) {
  const [tab, setTab] = useState(initialTab);
  const [partFilter, setPartFilter] = useState("all");
  const tabs = [["tools", "Tools"], ["supplies", "Supplies"], ["parts", "Parts"], ["upgrades", "Workshop"]];
  const capN = capOf(save);
  return (
    <div className={`drw-screen drw-shop ${inJob ? "in-job" : ""}`}>
      <header className="drw-head">
        <button className="drw-btn ghost" onClick={onBack}><Icon name="close" />{inJob ? "Back to the bench" : "Back"}</button>
        <h2><Icon name="shop" /> Workshop Shop</h2>
        <TopStats save={save} compact />
      </header>
      <div className="drw-tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        <span className="cap">Storage: {capN} per item</span>
      </div>
      <div className="drw-shop-grid">
        {tab === "tools" && TOOL_ORDER.map((id) => {
          const t = TOOLS[id];
          const owned = !!save.tools[id];
          const locked = save.level < t.level;
          return (
            <div key={id} className={`drw-item ${owned ? "owned" : ""} ${locked ? "locked" : ""}`}>
              <div className="ic"><Icon name={t.icon} /></div>
              <div className="info"><b>{t.name}</b><small>{t.desc}</small>{t.uses && <small className="uses">Uses: {SUPPLIES[t.uses].name} ({qty(save, t.uses)} left)</small>}</div>
              {owned ? <span className="tag ok"><Icon name="check" />Owned</span> : <button className="drw-btn tiny primary" disabled={locked || save.money < t.price} onClick={() => onBuy("tool", id)}>{locked ? `Lv ${t.level}` : money(t.price)}</button>}
            </div>
          );
        })}
        {tab === "supplies" && SUPPLY_ORDER.map((id) => {
          const s = SUPPLIES[id];
          const full = qty(save, id) >= capN * (id === "solution" ? 5 : 1);
          return (
            <div key={id} className="drw-item">
              <div className="ic"><Icon name="box" /></div>
              <div className="info"><b>{s.name}</b><small>{s.desc}</small><small className="uses">In stock: <b>{qty(save, id)}</b> · pack of {s.pack}</small></div>
              <button className="drw-btn tiny primary" disabled={full || save.money < s.price} onClick={() => onBuy("supply", id)}>{full ? "Full" : money(s.price)}</button>
            </div>
          );
        })}
        {tab === "parts" && (
          <>
            <div className="drw-filter">
              {["all", "arm", "leg", "eye", "button", "shoe", "acc"].map((f) => <button key={f} className={partFilter === f ? "on" : ""} onClick={() => setPartFilter(f)}>{f === "acc" ? "accessories" : f === "all" ? "all" : `${f}s`}</button>)}
            </div>
            {Object.entries(PARTS).filter(([, p]) => partFilter === "all" || p.kind === partFilter).map(([id, p]) => {
              const full = qty(save, id) >= capN;
              return (
                <div key={id} className="drw-item small">
                  <div className="ic">{p.kind === "arm" || p.kind === "leg" ? <DollBadge type={p.doll} size={30} /> : <Icon name={p.kind === "eye" ? "eye" : p.kind === "button" ? "coin" : p.kind === "shoe" ? "box" : "sparkle"} />}</div>
                  <div className="info"><b>{p.name}</b><small>{p.doll ? `Fits ${DOLL_TYPES[p.doll].short} dolls` : p.kind === "eye" ? (p.eyes === "button" ? "Teddy & cloth dolls" : "Glass-eyed dolls") : p.kind === "acc" ? "Accessory" : "Universal"} · stock {qty(save, id)}</small></div>
                  <button className="drw-btn tiny primary" disabled={full || save.money < p.price} onClick={() => onBuy("part", id)}>{full ? "Full" : money(p.price)}</button>
                </div>
              );
            })}
          </>
        )}
        {tab === "upgrades" && UPGRADE_ORDER.map((k) => {
          const U = UPGRADES[k];
          const cur = tier(save, k);
          const n = nextUpgrade(save, k);
          const blocked = k === "stage" && n && n.tier === 2 && cur < 1;
          return (
            <div key={k} className="drw-item up">
              <div className="ic"><Icon name={k === "stage" ? "shop" : k === "lighting" ? "bulb" : k === "hair" ? "comb" : k === "sewing" ? "needle" : k === "painting" ? "paint" : k === "shelves" ? "gallery" : k === "storage" ? "box" : k === "bench" ? "pliers" : k === "waiting" ? "heart" : k === "decor" ? "sparkle" : "gear"} /></div>
              <div className="info">
                <b>{U.name}: {U.tiers[cur].label}</b>
                <div className="pips">{U.tiers.map((_, i) => <i key={i} className={i <= cur ? "on" : ""} />)}</div>
                {n ? <small>Next: <b>{n.label}</b> — {n.desc}</small> : <small>Fully upgraded</small>}
              </div>
              {n ? <button className="drw-btn tiny primary" disabled={blocked || save.level < n.level || save.money < n.price} onClick={() => onBuy("upgrade", k)}>{save.level < n.level ? `Lv ${n.level}` : money(n.price)}</button> : <span className="tag ok"><Icon name="check" />Max</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- gallery */
export function GalleryScreen({ save, sel, onSelect, onBack, compare, onCompare }) {
  const list = [...save.gallery].reverse();
  return (
    <div className="drw-screen drw-gallery">
      <header className="drw-head">
        <button className="drw-btn ghost" onClick={onBack}><Icon name="close" />Back</button>
        <h2><Icon name="gallery" /> Doll Gallery</h2>
        <span className="drw-chip">{save.gallery.length} restored</span>
      </header>
      {list.length === 0 ? (
        <div className="drw-empty"><Icon name="gallery" size={42} /><p>Restored dolls will appear here — with before &amp; after comparisons you can rotate.</p></div>
      ) : (
        <div className="drw-gallery-body">
          <div className="drw-gallery-list">
            {list.map((g) => (
              <button key={g.id} className={`drw-gcard ${sel === g.id ? "sel" : ""}`} onClick={() => onSelect(g.id)}>
                <DollBadge type={g.type} color={FABRIC_COLORS[g.snap?.look?.dressColor]?.hex} hair={HAIR_COLORS[g.snap?.look?.hairColor]?.hex} size={42} />
                <span className="t"><b>{g.title}</b><small>{DOLL_TYPES[g.type]?.short} · {new Date(g.date).toLocaleDateString()}</small></span>
                <span className="q">{stars(g.stars)}<small>{g.quality}%</small></span>
              </button>
            ))}
          </div>
          {sel && <CompareBar compare={compare} onChange={onCompare} hint="Drag the doll to rotate · wheel to zoom" />}
        </div>
      )}
    </div>
  );
}

export function CompareBar({ compare, onChange, hint }) {
  return (
    <div className="drw-comparebar">
      <span className="lbl b">BEFORE</span>
      {!compare.side ? (
        <input type="range" min="0" max="100" value={Math.round(compare.split * 100)} onChange={(e) => onChange({ split: Number(e.target.value) / 100 })} aria-label="Before/after split" />
      ) : <span className="sidegap" />}
      <span className="lbl a">AFTER</span>
      <button className="drw-btn tiny" onClick={() => onChange({ side: !compare.side })} title={compare.side ? "Split view" : "Side by side"}><Icon name={compare.side ? "split" : "side"} />{compare.side ? "Split" : "Side by side"}</button>
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}

/* ------------------------------------------------------------- result */
export function ResultScreen({ data, onContinue, compare, onCompare }) {
  const { order, result, pay, levels } = data;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ids = [setTimeout(() => setStep(1), 900), setTimeout(() => setStep(2), 1800), setTimeout(() => setStep(3), 2600)];
    return () => ids.forEach(clearTimeout);
  }, []);
  return (
    <div className="drw-screen drw-result">
      <div className="drw-result-card">
        <h2>{order.title}</h2>
        <p className="cust">for {order.customer.name} — <b className={`mood ${pay.mood}`}>{pay.mood}</b></p>
        <div className={`big-stars ${step >= 1 ? "in" : ""}`}>{stars(result.stars)}</div>
        <div className="quality"><span>Restoration quality</span><b>{result.quality}<small>/100</small></b></div>
        {step >= 2 && (
          <div className="breakdown">
            <div className="row"><span>Inspection</span><b>{result.inspection}%</b></div>
            {result.tasks.map((t) => <div key={t.id} className="row"><span>{t.label}</span><b className={t.score < 60 ? "bad" : t.score >= 90 ? "good" : ""}>{t.score}</b></div>)}
            {result.prefs.map((p, i) => <div key={i} className="row"><span>{p.label}{p.note ? <small> ({p.note})</small> : null}</span><b className={p.ok ? "good" : "bad"}>{p.ok ? "✓" : "✗"}</b></div>)}
          </div>
        )}
        {step >= 3 && (
          <div className="pay">
            <div className="row"><span>Repair fee</span><b>{money(pay.base)}</b></div>
            {pay.timeBonus > 0 && <div className="row"><span>On-time bonus</span><b>+{money(pay.timeBonus)}</b></div>}
            {pay.tip > 0 && <div className="row"><span>Tip</span><b>+{money(pay.tip)}</b></div>}
            <div className="row muted"><span>Deposit already paid</span><b>−{money(pay.deposit)}</b></div>
            <div className="row total"><span>Paid now</span><b>{money(pay.balance)}</b></div>
            <div className="row xp"><span>XP earned</span><b>+{pay.xp}</b></div>
            {levels.length > 0 && <div className="levelup"><Icon name="sparkle" /> Level up! You reached level {levels[levels.length - 1]}</div>}
          </div>
        )}
        <button className="drw-btn primary big" onClick={onContinue}>Continue</button>
      </div>
      <CompareBar compare={compare} onChange={onCompare} hint="Drag to rotate" />
    </div>
  );
}

/* ---------------------------------------------------------- how / settings */
export function HowTo({ onBack }) {
  return (
    <div className="drw-screen drw-how">
      <header className="drw-head">
        <button className="drw-btn ghost" onClick={onBack}><Icon name="close" />Back</button>
        <h2><Icon name="help" /> How to Play</h2>
        <span />
      </header>
      <div className="drw-how-grid">
        <section><h4><Icon name="list" /> Take an order</h4><p>Pick a customer on the Order Board, listen to their story and accept the job. They pay a 25% deposit up front and the rest on delivery.</p></section>
        <section><h4><Icon name="magnifier" /> Inspect</h4><p>Rotate and zoom the doll, then click every damaged spot with the magnifier — dust, cracks, broken parts, tangles, tears, faded paint. Each find goes on the checklist; wrong clicks and missed damage lower your score.</p></section>
        <section><h4><Icon name="brush" /> Clean</h4><p>Rub the brush over dust, the sponge over dirt. Stains only lift when wet — spray first, then scrub. Keep going until it's spotless for top marks.</p></section>
        <section><h4><Icon name="glue" /> Cracks</h4><p>Trace the crack with the adhesive. Stay on the line and don't flood it. Wait for it to cure, then buff it with the cloth.</p></section>
        <section><h4><Icon name="pliers" /> Parts</h4><p>Pull the broken part off with the pliers, choose a replacement from the Parts tray, carry it to the glowing socket and rotate it (wheel / Q / E) until the ring turns green. Wrong parts won't fit.</p></section>
        <section><h4><Icon name="needle" /> Sewing</h4><p>Follow the dotted stitch path with the needle, point by point. Straying from the line costs precision.</p></section>
        <section><h4><Icon name="paint" /> Painting</h4><p>Paint inside the dashed guides using the original colours. Choose brush size, use undo or the eraser, then press Done.</p></section>
        <section><h4><Icon name="comb" /> Hair</h4><p>Brush from the roots to the tips — against the grain snags. Wash with shampoo for faster detangling, then dry. Reroot bald patches by holding the tool on them.</p></section>
        <section><h4><Icon name="wardrobe" /> Customize &amp; deliver</h4><p>After repairs, restyle the doll — customers love it when you follow their requests (and hate it when you change an heirloom).</p></section>
        <section><h4><Icon name="shop" /> Grow</h4><p>Earn money and XP, buy tools and supplies, and upgrade your workshop from a beginner's table to a luxury boutique.</p></section>
        <section className="ctrl"><h4><Icon name="hand" /> Controls</h4><p><b>Drag</b> rotate the doll (no tool) · <b>Left mouse</b> use tool · <b>Right drag</b> rotate (with a tool) or pan · <b>Wheel</b> zoom · <b>Esc</b> drop tool / pause · <b>Touch</b>: one finger tool/rotate, two fingers pinch &amp; pan.</p></section>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onBack, onReset }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="drw-screen drw-settings">
      <div className="drw-panel">
        <h2><Icon name="gear" /> Settings</h2>
        <label className="drw-range">Music <input type="range" min="0" max="100" value={Math.round(settings.music * 100)} onChange={(e) => onChange({ music: Number(e.target.value) / 100 })} /><span>{Math.round(settings.music * 100)}%</span></label>
        <label className="drw-range">Sound effects <input type="range" min="0" max="100" value={Math.round(settings.sfx * 100)} onChange={(e) => onChange({ sfx: Number(e.target.value) / 100 })} /><span>{Math.round(settings.sfx * 100)}%</span></label>
        <label className="drw-range">Rotate speed <input type="range" min="40" max="200" value={Math.round(settings.sens * 100)} onChange={(e) => onChange({ sens: Number(e.target.value) / 100 })} /><span>{settings.sens.toFixed(1)}×</span></label>
        <div className="drw-seg"><span>Graphics</span>{["high", "low"].map((qq) => <button key={qq} className={settings.quality === qq ? "on" : ""} onClick={() => onChange({ quality: qq })}>{qq === "high" ? "High" : "Fast"}</button>)}</div>
        <label className="drw-check"><input type="checkbox" checked={settings.hints} onChange={(e) => onChange({ hints: e.target.checked })} /> Show hints</label>
        <label className="drw-check"><input type="checkbox" checked={settings.invertX} onChange={(e) => onChange({ invertX: e.target.checked })} /> Invert rotation</label>
        <div className="actions">
          {!confirm ? <button className="drw-btn danger" onClick={() => setConfirm(true)}>Reset all progress…</button> : (
            <span className="confirm">Erase the whole workshop? <button className="drw-btn danger tiny" onClick={() => { setConfirm(false); onReset(); }}>Yes, erase</button><button className="drw-btn tiny" onClick={() => setConfirm(false)}>Cancel</button></span>
          )}
          <button className="drw-btn primary" onClick={onBack}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function PauseOverlay({ onResume, onSettings, onMenu }) {
  return (
    <div className="drw-overlay">
      <div className="drw-panel small">
        <h2><Icon name="pause" /> Paused</h2>
        <button className="drw-btn primary big" onClick={onResume}><Icon name="play" />Resume</button>
        <button className="drw-btn" onClick={onSettings}><Icon name="gear" />Settings</button>
        <button className="drw-btn" onClick={onMenu}><Icon name="list" />Main Menu <small>(job is saved)</small></button>
      </div>
    </div>
  );
}
