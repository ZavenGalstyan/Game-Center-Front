/**
 * Car Wash Studio — tools: your detailing kit. Tools unlock with progression
 * (never bought), the kit level gives a small, fair speed/radius boost earned
 * with stars, and tool colors are purely cosmetic.
 */
import { Icon, ToolIcon } from "../components/icons.jsx";
import { TOOLS, TOOL_ORDER } from "../engine/tools.js";
import { TOOL_UNLOCKS, TOOL_COLORS, KIT_LEVELS } from "../data/jobs.js";
import { highestCompleted, completedCount, totalStars, kitLevel } from "../utils/progress.js";
import { audio } from "../audio/audio.js";

const DESC = {
  hose: "Pre-rinse: wets the body and knocks off loose dust and mud.",
  foam: "Blankets panels in thick foam that softens stuck grime.",
  sponge: "Scrubs through the foam and lifts stuck dirt into the suds.",
  pressure: "A focused jet that blasts away foam and loosened dirt.",
  wheelCleaner: "Bleeding wheel cleaner that dissolves brake dust.",
  wheelBrush: "Stiff brush for rims, spokes and tire walls.",
  tireShine: "Dresses clean tires with a rich satin finish.",
  spray: "Glass and interior cleaner mist.",
  cloth: "Microfiber for glass, dash and trim — lint-free wipes.",
  towel: "Plush drying towel for streak-free paint.",
  polisher: "Dual-action polisher for deep, glossy paint.",
  hand: "Pick up and bag interior trash.",
  vacuum: "Detailing nozzle for carpets, seats and crumbs.",
  detailBrush: "Soft brush for vents, grilles and tight trim.",
};

export default function ToolsScreen({ progress, onColor, onBack }) {
  const hc = highestCompleted(progress);
  const done = completedCount(progress);
  const stars = totalStars(progress);
  const lvl = kitLevel(progress);
  const nextKit = KIT_LEVELS.find((k) => k.level === lvl + 1);
  const tint = (TOOL_COLORS.find((c) => c.id === progress.toolColor) || TOOL_COLORS[0]).hex;
  return (
    <div className="cws-screen cws-list">
      <header className="cws-head">
        <button type="button" className="cws-back" onClick={onBack}><Icon.back /> Back</button>
        <h2>Tools</h2>
        <span className="cws-head__meta"><Icon.wrench /> {KIT_LEVELS[lvl].name}</span>
      </header>
      <section className="cws-kit">
        <div>
          <b>{KIT_LEVELS[lvl].name}</b>
          <span>{lvl === 0 ? "Standard reach and speed." : `+${lvl * 8}% cleaning speed · +${lvl * 6}% reach`}</span>
        </div>
        {nextKit ? (
          <div className="cws-kit__next">
            <span>{nextKit.name} at {nextKit.stars} <Icon.star on /></span>
            <i><em style={{ width: `${Math.min(100, (stars / nextKit.stars) * 100)}%` }} /></i>
          </div>
        ) : <div className="cws-kit__next"><span>Top kit reached</span></div>}
      </section>
      <section className="cws-colors" aria-label="Tool color">
        <b>Tool color</b>
        <div>
          {TOOL_COLORS.map((c) => {
            const open = done >= c.unlock;
            return (
              <button key={c.id} type="button" className={`cws-swatch${progress.toolColor === c.id ? " is-on" : ""}`} disabled={!open}
                style={{ "--sw": c.hex }} onClick={() => { audio.select(); onColor(c.id); }} title={open ? c.name : `Complete ${c.unlock} jobs`}>
                <i />{open ? c.name : <><Icon.lock /> {c.unlock}</>}
              </button>
            );
          })}
        </div>
      </section>
      <div className="cws-toolgrid">
        {TOOL_ORDER.map((t) => {
          const need = TOOL_UNLOCKS[t] ?? 0;
          const open = hc >= need;
          return (
            <div key={t} className={`cws-toolcard${open ? "" : " is-locked"}`}>
              <span className="cws-toolcard__icon"><ToolIcon tool={t} tint={tint} size={44} /></span>
              <b>{TOOLS[t].name}</b>
              <span>{open ? DESC[t] : `Unlocks after job ${need}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
