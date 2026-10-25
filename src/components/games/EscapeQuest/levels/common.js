/**
 * Escape Quest — level authoring helpers. Rooms are 1000×560 scenes; the
 * floor line is y=400 (outdoor scenes ~380-390). See engine.js for the
 * hotspot fields.
 *
 * Clue visuals understood by the clue reader:
 *   {type:"code", value:"350"}             big digits / letters
 *   {type:"seq", value:[...]}              colours, glyphs or arrows (U/D/L/R)
 *   {type:"pairs", value:[{k, t}]}         "k → t" rows (k: colour or glyph)
 *   {type:"grid", rows, cols, on:[...]}    lit cells of a grid
 *   {type:"clock", time:[h, m]}
 *   {type:"lines", value:["…"]}            poem / list
 */

/** Decor (not interactive). */
export const D = (k, x, y, w, h, p = {}, v = 0) => ({ k, x, y, w, h, p, v });

/** A pickup lying in the room. */
export const pick = (id, item, x, y, s = 44, o = {}) => ({ id, k: "item", take: item, x, y, w: s, h: s, label: o.label || null, ...o });

/** The exit door; `lock` decides what opens it. */
export const door = (o = {}) => ({ id: "door", k: "door", x: 820, y: 150, w: 125, h: 250, label: "Door", exit: true, ...o });

export const seen = (title, text, visual) => ({ title, text, visual });
