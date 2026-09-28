/**
 * Street Basketball — Player (appearance + light skill progression) and
 * Collection (outfits, basketballs, dunk styles, accessories). Both show the
 * real 3D character in a turntable preview.
 */
import { useMemo, useState } from "react";
import Preview from "../three/Preview.jsx";
import { LOOK, OUTFITS, BALLS, DUNKS, HEADBANDS, WRISTBANDS, byId } from "../data/cosmetics.js";
import { SKILLS, SKILL_MAX, upgradeCost, playerLook } from "../utils/progress.js";

const SKILL_INFO = {
  shooting: "Shot accuracy and a slightly wider perfect window.",
  finishing: "Layups, dunk range, ball handling.",
  speed: "Top speed, first step, crossover burst.",
  defense: "Contests, steals, blocks, rebounds.",
  stamina: "Sprint longer, recover faster, steadier late shots.",
};

export function PlayerScreen({ progress, onChange, onUpgrade, onBack }) {
  const look = useMemo(() => playerLook(progress), [progress]);
  const ball = byId(BALLS, progress.selectedBall);
  const p = progress.player;
  const set = (patch) => onChange({ ...p, ...patch });
  return (
    <div className="sb-screen sb-player">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>PLAYER</h1>
        <span className="sb-head__meta">{progress.skillPoints} SKILL POINT{progress.skillPoints === 1 ? "" : "S"}</span>
      </header>
      <div className="sb-player__body">
        <Preview look={look} ballSkin={ball} className="sb-player__preview" />
        <div className="sb-player__cols">
          <section className="sb-panel">
            <h3>LOOK</h3>
            <label className="sb-field sb-field--row">
              <span>NAME</span>
              <input value={p.name} maxLength={12} onChange={(e) => set({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, "") || "YOU" })} />
            </label>
            <label className="sb-field sb-field--row">
              <span>NUMBER</span>
              <input value={p.number} maxLength={2} inputMode="numeric" onChange={(e) => set({ number: e.target.value.replace(/\D/g, "").slice(0, 2) || "0" })} />
            </label>
            <div className="sb-field">
              <span>SKIN</span>
              <div className="sb-swatches">
                {LOOK.skin.map((c) => <button type="button" key={c} style={{ background: c }} className={c === p.skin ? "is-on" : ""} onClick={() => set({ skin: c })} aria-label="skin tone" />)}
              </div>
            </div>
            <div className="sb-field">
              <span>HAIR</span>
              <div className="sb-seg sb-seg--wrap">
                {LOOK.hair.map((h) => <button type="button" key={h} className={h === p.hair ? "is-on" : ""} onClick={() => set({ hair: h })}>{h.toUpperCase()}</button>)}
              </div>
            </div>
            <div className="sb-field">
              <span>HAIR COLOR</span>
              <div className="sb-swatches">
                {LOOK.hairColor.map((c) => <button type="button" key={c} style={{ background: c }} className={c === p.hairColor ? "is-on" : ""} onClick={() => set({ hairColor: c })} aria-label="hair color" />)}
              </div>
            </div>
          </section>
          <section className="sb-panel">
            <h3>SKILLS <small>1–10 · your timing matters more</small></h3>
            {SKILLS.map((k) => {
              const lvl = progress.upgrades[k];
              const cost = upgradeCost(lvl);
              const can = lvl < SKILL_MAX && progress.skillPoints >= cost;
              return (
                <div className="sb-skill" key={k}>
                  <div className="sb-skill__top">
                    <b>{k.toUpperCase()}</b>
                    <span className="sb-skill__pips">{Array.from({ length: SKILL_MAX }, (_, i) => <i key={i} className={i < lvl ? "is-on" : ""} />)}</span>
                    <button type="button" className="sb-chip" disabled={!can} onClick={() => onUpgrade(k)}>{lvl >= SKILL_MAX ? "MAX" : `+1 · ${cost}pt`}</button>
                  </div>
                  <small>{SKILL_INFO[k]}</small>
                </div>
              );
            })}
            <p className="sb-note">Earn points by beating new rivals (bosses give extra) and setting first training records.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  ["outfit", "OUTFITS", OUTFITS, "unlockedOutfits", "selectedOutfit"],
  ["ball", "BALLS", BALLS, "unlockedBalls", "selectedBall"],
  ["dunk", "DUNKS", DUNKS, "unlockedDunks", null],
  ["headband", "HEADBANDS", HEADBANDS, "unlockedHeadbands", "headband"],
  ["wristband", "WRISTBANDS", WRISTBANDS, "unlockedWristbands", "wristband"],
];

export function Collection({ progress, onSelect, onBack }) {
  const [tab, setTab] = useState("outfit");
  const [, label, list, unlockedField, selField] = TABS.find((t) => t[0] === tab);
  const look = useMemo(() => playerLook(progress), [progress]);
  const ball = byId(BALLS, progress.selectedBall);
  const total = TABS.reduce((n, t) => n + t[2].length, 0);
  const owned = TABS.reduce((n, t) => n + progress[t[3]].length, 0);
  return (
    <div className="sb-screen sb-collection">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>COLLECTION</h1>
        <span className="sb-head__meta">{owned}/{total} UNLOCKED</span>
      </header>
      <div className="sb-collection__body">
        <Preview look={look} ballSkin={ball} className="sb-collection__preview" />
        <div className="sb-collection__main">
          <div className="sb-seg sb-tabs">
            {TABS.map(([id, l]) => <button type="button" key={id} className={id === tab ? "is-on" : ""} onClick={() => setTab(id)}>{l}</button>)}
          </div>
          <div className="sb-items" aria-label={label}>
            {list.map((it) => {
              const has = progress[unlockedField].includes(it.id);
              const on = selField ? progress[selField] === it.id : has;
              return (
                <button
                  type="button"
                  key={it.id}
                  className={`sb-item${has ? "" : " is-locked"}${on && selField ? " is-on" : ""}`}
                  disabled={!has || !selField}
                  onClick={() => onSelect(tab, it.id)}
                >
                  <Swatch tab={tab} it={it} />
                  <b>{it.name}</b>
                  <small>{has ? (selField ? (on ? "EQUIPPED" : "EQUIP") : "IN YOUR BAG") : it.blurb || "Locked"}</small>
                </button>
              );
            })}
          </div>
          {tab === "dunk" && <p className="sb-note">Unlocked dunks are picked by context when you throw one down — style only, same timing and success for all.</p>}
          {tab === "ball" && <p className="sb-note">Every ball bounces exactly the same — skins are cosmetic.</p>}
        </div>
      </div>
    </div>
  );
}

function Swatch({ tab, it }) {
  if (tab === "outfit") {
    return (
      <span className="sb-sw sb-sw--outfit">
        <i style={{ background: it.jersey, borderColor: it.jerseyTrim }} />
        <i style={{ background: it.shorts, borderColor: it.shortsTrim }} />
        <i style={{ background: it.shoes, borderColor: it.shoeAccent }} />
      </span>
    );
  }
  if (tab === "ball") {
    return <span className="sb-sw sb-sw--ball" style={{ background: `radial-gradient(circle at 35% 30%, ${it.base2}, ${it.base})`, "--seam": it.seam }} />;
  }
  if (tab === "dunk") return <span className="sb-sw sb-sw--dunk">{({ one: "①", two: "②", power: "⚡", reverse: "↺", windmill: "✺" })[it.id]}</span>;
  return <span className="sb-sw sb-sw--band" style={{ background: it.color || "transparent" }} />;
}
