// Bundled by renderTest.mjs: server-renders every room, view and opened state.
import { renderToString } from "react-dom/server";
import { LEVELS } from "../levels/index.js";
import { Room, SceneDefs } from "../rooms.jsx";
import { Prop, PROP_KINDS } from "../props.jsx";
import { ItemIcon } from "../icons.jsx";
import { ITEMS } from "../items.js";
import { ClueVisual } from "../Puzzles.jsx";

export function run() {
  const errs = [];
  const tryRender = (what, el) => {
    try {
      renderToString(el);
    } catch (e) {
      errs.push(`${what}: ${e.message}`);
    }
  };
  for (const k of PROP_KINDS) for (const open of [false, true]) tryRender(`prop ${k} open=${open}`, <svg><Prop kind={k} w={120} h={100} open={open} p={{}} /></svg>);
  for (const [id, it] of Object.entries(ITEMS)) tryRender(`item ${id}`, <svg><ItemIcon icon={it.icon} c={it.c} /></svg>);
  for (const L of LEVELS) {
    for (let v = 0; v < L.views; v++) tryRender(`L${L.id} room v${v}`, <svg><SceneDefs /><Room theme={L.theme} view={v} /></svg>);
    for (const d of L.decor) tryRender(`L${L.id} decor ${d.k}`, <svg><Prop kind={d.k} w={d.w} h={d.h} p={d.p || {}} /></svg>);
    for (const h of L.hotspots) {
      if (h.k === "item" || h.k === "none") continue;
      for (const open of [false, true]) tryRender(`L${L.id} hotspot ${h.id} open=${open}`, <svg><Prop kind={h.k} w={h.w} h={h.h} open={open} p={h.p || {}} /></svg>);
      if (h.clue) tryRender(`L${L.id} clue ${h.id}`, <ClueVisual visual={h.clue.visual} />);
    }
    for (const it of Object.values(L.items)) if (it.clue) tryRender(`L${L.id} item clue`, <ClueVisual visual={it.clue.visual} />);
  }
  return errs;
}
