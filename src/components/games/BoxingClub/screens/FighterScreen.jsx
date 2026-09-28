/**
 * Boxing Club — your fighter: a live preview, a few appearance options and
 * four attributes (1–10) bought with Training Points. Deliberately small:
 * upgrades help, skill still decides fights.
 */
import FighterCanvas from "../components/FighterCanvas.jsx";
import GymBackdrop from "../components/GymBackdrop.jsx";
import { Icon } from "../components/icons.jsx";
import { LOOK_OPTIONS, HAIR_LABEL } from "../data/gloves.js";
import { STAT_KEYS, STAT_MAX, statCost } from "../utils/progress.js";

const STAT_INFO = {
  power: "Punch damage (+2.5% per level)",
  speed: "Punch & footwork speed (~1% per level)",
  stamina: "Bigger stamina tank (+4 per level)",
  recovery: "Stamina recovery & getting up",
};

function Swatches({ label, values, value, onPick, round }) {
  return (
    <div className="bc-opt">
      <span className="bc-opt__label">{label}</span>
      <div className="bc-opt__row">
        {values.map((v) => (
          <button key={v} type="button" className={`bc-swatch${round ? " is-round" : ""}${v === value ? " is-on" : ""}`} style={{ background: v }} onClick={() => onPick(v)} aria-label={`${label} ${v}`} aria-pressed={v === value} />
        ))}
      </div>
    </div>
  );
}

export default function FighterScreen({ progress, playerLook, settings, onChange, onUpgrade, onBack }) {
  const f = progress.fighter;
  const look = f.look;
  const set = (patch) => onChange({ ...f, look: { ...look, ...patch } });
  return (
    <div className="bc-fighterscreen">
      <GymBackdrop ring={false} />
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Fighter</h2>
        <span className="bc-head__meta"><Icon.bolt /> {f.tp} Training Points</span>
      </header>
      <div className="bc-fighterscreen__body">
        <div className="bc-fighterscreen__preview">
          <FighterCanvas look={playerLook} animate={!settings.reducedMotion} punches />
          <input
            className="bc-namefield"
            value={f.name}
            maxLength={16}
            onChange={(e) => onChange({ ...f, name: e.target.value.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 16) || "" })}
            onBlur={(e) => { if (!e.target.value.trim()) onChange({ ...f, name: "Challenger" }); }}
            aria-label="Fighter name"
          />
        </div>
        <div className="bc-fighterscreen__panel">
          <Swatches label="SKIN" values={LOOK_OPTIONS.skin} value={look.skin} onPick={(v) => set({ skin: v })} round />
          <div className="bc-opt">
            <span className="bc-opt__label">HAIR</span>
            <div className="bc-opt__row">
              {LOOK_OPTIONS.hair.map((h) => (
                <button key={h} type="button" className={`bc-chip${h === look.hair ? " is-on" : ""}`} onClick={() => set({ hair: h })}>{HAIR_LABEL[h]}</button>
              ))}
            </div>
          </div>
          <Swatches label="HAIR COLOUR" values={LOOK_OPTIONS.hairColor} value={look.hairColor} onPick={(v) => set({ hairColor: v })} round />
          <Swatches label="SHORTS" values={LOOK_OPTIONS.shorts} value={look.shorts} onPick={(v) => set({ shorts: v })} />
          <Swatches label="SHOES" values={LOOK_OPTIONS.shoes} value={look.shoes} onPick={(v) => set({ shoes: v })} />
          <div className="bc-attrs">
            {STAT_KEYS.map((k) => {
              const lv = f.stats[k];
              const cost = statCost(lv);
              const can = lv < STAT_MAX && f.tp >= cost;
              return (
                <div key={k} className="bc-attr">
                  <div className="bc-attr__head"><b>{k.toUpperCase()}</b><span>{STAT_INFO[k]}</span></div>
                  <div className="bc-attr__pips">{Array.from({ length: STAT_MAX }, (_, i) => <i key={i} className={i < lv ? "is-on" : ""} />)}</div>
                  <button type="button" className="bc-btn bc-btn--small" disabled={!can} onClick={() => onUpgrade(k)}>
                    {lv >= STAT_MAX ? "MAX" : <>+1 · {cost} TP</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
