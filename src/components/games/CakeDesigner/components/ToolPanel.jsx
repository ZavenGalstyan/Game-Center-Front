/**
 * Cake Designer — the design tool panel (right on desktop, bottom on mobile).
 *
 * Category tabs + the controls for the active category. Purely presentational:
 * every change is reported through a handler prop; the editor owns cake state
 * and the undo history.
 */

import { useState } from "react";
import {
  SHAPES, FROSTINGS, DRIPS, COLORS, TOPPINGS, DECORATIONS, FINAL_TOUCHES, MESSAGES,
  COLOR_BY_ID,
} from "../data/items.js";
import { ItemTile, Carousel, ColorSwatches, Segmented } from "./bits.jsx";
import Sprite from "./CakeSprites.jsx";

const DECOR_KINDS = [
  { id: "party", label: "Party" },
  { id: "candle", label: "Candles" },
  { id: "flower", label: "Flowers" },
  { id: "wedding", label: "Wedding" },
  { id: "luxury", label: "Luxury" },
  { id: "fantasy", label: "Fantasy" },
];

function ShapeGlyph({ id }) {
  const p = {
    round: <ellipse cx="16" cy="17" rx="13" ry="9" />,
    square: <path d="M16 6 L29 17 L16 28 L3 17 Z" />,
    heart: <path d="M16 27 C -4 13 6 2 16 12 C 26 2 36 13 16 27 Z" />,
    flower: <path d="M16 4a5 5 0 0 1 5 5 5 5 0 0 1 5-2 5 5 0 0 1 0 9 5 5 0 0 1 2 6 5 5 0 0 1-9 0 5 5 0 0 1-6 2 5 5 0 0 1 0-9 5 5 0 0 1-2-6 5 5 0 0 1 9-4z" />,
    star: <path d="M16 3 L20 13 L31 13 L22 20 L25 30 L16 24 L7 30 L10 20 L1 13 L12 13 Z" />,
    hexagon: <path d="M16 4 L27 10 L27 24 L16 30 L5 24 L5 10 Z" />,
    tall: <rect x="7" y="4" width="18" height="26" rx="3" />,
  }[id] || <ellipse cx="16" cy="17" rx="13" ry="9" />;
  return <svg viewBox="0 0 32 32" width="34" height="34" className="cd-glyph">{p}</svg>;
}

function FrostingChip({ finish }) {
  const bg = {
    cream: "linear-gradient(160deg,#fffaf2,#efdcc4)",
    swirl: "repeating-conic-gradient(from 0deg,#fff,#f0e2cf 12deg,#fff 24deg)",
    whip: "radial-gradient(circle at 30% 30%,#fff,#e9ddcb)",
    matte: "linear-gradient(160deg,#f3ece0,#e0d3bf)",
    velvet: "linear-gradient(160deg,#7a2f6b,#3c1b3a)",
    marble: "linear-gradient(120deg,#fff 30%,#cdbfa8 50%,#fff 70%)",
    galaxy: "radial-gradient(circle at 35% 30%,#5646a0,#150f38)",
  }[finish] || "#fff";
  return <span className="cd-frost-chip" style={{ background: bg }} />;
}

function DripChip({ hex }) {
  return (
    <svg viewBox="0 0 32 20" width="34" height="22" className="cd-glyph">
      <rect x="2" y="2" width="28" height="7" rx="2" fill={hex || "#ddd"} />
      <path d="M4 9 q0 6 3 6 q3 0 3-6 M14 9 q0 8 3 8 q3 0 3-8 M24 9 q0 5 2 5 q2 0 2-5"
        fill={hex || "#ddd"} />
    </svg>
  );
}

export default function ToolPanel({
  cake, activeTab, unlocked, armed, numberValue, freeMessage, allowFourth,
  on,
}) {
  const [decorKind, setDecorKind] = useState("party");
  const [colorTier, setColorTier] = useState(0);
  const u = unlocked;

  if (activeTab === "shape") {
    return (
      <Grid>
        {SHAPES.map((s) => (
          <ItemTile key={s.id} label={s.name} selected={cake.shape === s.id}
            locked={!u("shape", s.id)} lockText="Locked" onClick={() => on.shape(s.id)}>
            <ShapeGlyph id={s.id} />
          </ItemTile>
        ))}
      </Grid>
    );
  }

  if (activeTab === "layers") {
    const opts = [{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }];
    if (allowFourth || cake.layers.length >= 4) opts.push({ value: 4, label: "4" });
    return (
      <div className="cd-tool-block">
        <p className="cd-tool-hint">How many tiers?</p>
        <Segmented options={opts} value={cake.layers.length} onChange={on.layers} />
        <div className="cd-tier-preview" aria-hidden="true">
          {cake.layers.map((l, i) => (
            <span key={i} className="cd-tier-bar"
              style={{ width: `${72 - i * 16}%`, background: COLOR_BY_ID[l.color]?.hex }} />
          )).reverse()}
        </div>
      </div>
    );
  }

  if (activeTab === "frosting") {
    return (
      <Grid>
        {FROSTINGS.map((f) => (
          <ItemTile key={f.id} label={f.name} selected={cake.layers[0]?.frosting === f.id}
            locked={!u("frosting", f.id)} lockText="Locked" onClick={() => on.frosting(f.id)}>
            <FrostingChip finish={f.finish} />
          </ItemTile>
        ))}
      </Grid>
    );
  }

  if (activeTab === "color") {
    const multi = cake.layers.length > 1;
    const tierIdx = Math.min(colorTier, cake.layers.length - 1);
    return (
      <div className="cd-tool-block">
        {multi && (
          <div className="cd-tier-chips">
            {cake.layers.map((l, i) => (
              <button key={i} className={`cd-tier-chip${tierIdx === i ? " is-on" : ""}`}
                onClick={() => setColorTier(i)}>
                <span style={{ background: COLOR_BY_ID[l.color]?.hex }} />
                Tier {i + 1}
              </button>
            ))}
          </div>
        )}
        <ColorSwatches
          colors={COLORS.map((c) => c.id)}
          value={cake.layers[tierIdx]?.color}
          onPick={(id) => (multi ? on.layerColor(tierIdx, id) : on.allColors(id))}
          unlocked={(id) => u("color", id)}
        />
        {multi && (
          <button className="cd-mini-btn" onClick={() => on.allColors(cake.layers[tierIdx].color)}>
            Apply to all tiers
          </button>
        )}
      </div>
    );
  }

  if (activeTab === "drip") {
    return (
      <Grid>
        {DRIPS.map((d) => (
          <ItemTile key={d.id} label={d.name} selected={cake.drip === d.id}
            locked={d.id !== "none" && !u("drip", d.id)} lockText="Locked"
            onClick={() => on.drip(d.id)}>
            {d.id === "none"
              ? <span className="cd-glyph cd-glyph--none">—</span>
              : <DripChip hex={d.hex} />}
          </ItemTile>
        ))}
      </Grid>
    );
  }

  if (activeTab === "toppings") {
    return (
      <div className="cd-tool-block">
        <p className="cd-tool-hint">
          {armed?.group === "topping" ? "Tap the cake to place — tap the tile again to stop" : "Pick one, then tap the cake (or drag it on)"}
        </p>
        <Carousel>
          {TOPPINGS.map((t) => (
            <ItemTile key={t.id} label={t.name} selected={armed?.id === t.id}
              locked={!u("topping", t.id)} lockText="Locked"
              onClick={() => on.arm({ group: "topping", id: t.id })}
              onPointerDown={(e) => on.dragStart(e, { group: "topping", id: t.id }, u("topping", t.id))}>
              <svg viewBox="-16 -16 32 32" width="34" height="34"><Sprite id={t.id} animate={false} /></svg>
            </ItemTile>
          ))}
        </Carousel>
      </div>
    );
  }

  if (activeTab === "decorations") {
    const list = DECORATIONS.filter((d) => d.kind === decorKind);
    return (
      <div className="cd-tool-block">
        <div className="cd-subtabs">
          {DECOR_KINDS.map((k) => (
            <button key={k.id} className={`cd-subtab${decorKind === k.id ? " is-on" : ""}`}
              onClick={() => setDecorKind(k.id)}>{k.label}</button>
          ))}
        </div>

        {armed?.id === "candle-number" && (
          <div className="cd-numpad">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} className={`cd-num${numberValue === n ? " is-on" : ""}`}
                onClick={() => on.number(n)}>{n}</button>
            ))}
            <span className="cd-numpad__val">Age: <b>{numberValue}</b></span>
          </div>
        )}

        <p className="cd-tool-hint">
          {armed?.group === "decoration" ? "Tap the cake to place" : "Scatter items apply instantly · others: pick then tap the cake"}
        </p>
        <Carousel>
          {list.map((d) => {
            const isScatter = d.mode === "scatter";
            const on_ = isScatter ? cake.scatter.includes(d.id) : armed?.id === d.id;
            return (
              <ItemTile key={d.id} label={d.name} selected={on_}
                locked={!u("decoration", d.id)} lockText="Locked"
                onClick={() => (isScatter ? on.scatter(d.id) : on.arm({ group: "decoration", id: d.id }))}
                onPointerDown={isScatter ? undefined : (e) => on.dragStart(e, { group: "decoration", id: d.id }, u("decoration", d.id))}>
                <DecoGlyph id={d.id} />
              </ItemTile>
            );
          })}
        </Carousel>
      </div>
    );
  }

  if (activeTab === "message") {
    return (
      <div className="cd-tool-block">
        <p className="cd-tool-hint">Add a short message plaque</p>
        <div className="cd-msg-list">
          <button className={`cd-msg${!cake.message ? " is-on" : ""}`} onClick={() => on.message(null)}>No message</button>
          {MESSAGES.map((m) => (
            <button key={m} className={`cd-msg${cake.message === m ? " is-on" : ""}`}
              onClick={() => on.message(m)}>{m}</button>
          ))}
        </div>
        {freeMessage && (
          <input className="cd-msg-input" maxLength={18} placeholder="Custom (max 18)"
            value={cake.message && !MESSAGES.includes(cake.message) ? cake.message : ""}
            onChange={(e) => on.message(e.target.value.toUpperCase())} />
        )}
      </div>
    );
  }

  if (activeTab === "final") {
    return (
      <Grid>
        {FINAL_TOUCHES.map((f) => (
          <ItemTile key={f.id} label={f.name} selected={cake.finalTouches.includes(f.id)}
            locked={!u("final", f.id)} lockText="Locked" onClick={() => on.final(f.id)}>
            <span className="cd-glyph cd-sparkle-glyph" data-ft={f.id}>✦</span>
          </ItemTile>
        ))}
      </Grid>
    );
  }

  return null;
}

function Grid({ children }) {
  return <div className="cd-tile-grid">{children}</div>;
}

function DecoGlyph({ id }) {
  const scatterPreview = {
    sprinkles: ["#e0524f", "#f7db8a", "#8fce8f", "#7fa8e6"],
    "stars-conf": ["#f7db8a", "#f7b8cf"],
    confetti: ["#e0524f", "#8fce8f", "#9d7fd1"],
    pearls: ["#f3ede2"],
    "gold-pearls": ["#e8c46b"],
    "gold-leaf": ["#e8c46b"],
    "sparkle-field": ["#fff", "#ffe9b0"],
  }[id];
  if (scatterPreview) {
    return (
      <svg viewBox="0 0 32 32" width="34" height="34" className="cd-glyph">
        {Array.from({ length: 9 }).map((_, i) => (
          <circle key={i} cx={6 + (i % 3) * 10} cy={6 + Math.floor(i / 3) * 10} r="2.4"
            fill={scatterPreview[i % scatterPreview.length]} />
        ))}
      </svg>
    );
  }
  return <svg viewBox="-16 -18 32 36" width="34" height="36"><Sprite id={id} animate={false} number={id === "candle-number" ? 5 : undefined} /></svg>;
}
