/**
 * Rooftop Dash — reusable level-design phrases built on the kit. Each one
 * records correct bot nodes for both validation routes ('safe' / 'stars').
 */

/**
 * A star on top of a rooftop box beside the lane (the "risky" detour):
 * line up behind it, hop on (or grab its edge), collect, step back off.
 */
export function boxStar(c, u, v, type = "acBig", tag = "risky") {
  const H = { acBig: 1.5, ac: 1.1, crates: 1.0, door: 2.7 }[type] ?? 1.2;
  c.prop(type, u, v);
  c.star(u, v, H + 1.0, tag);
  c.tag("stars")
    .go(u - 3.6, v * 0.6)
    .go(u - 2.6, v, { slow: 0.75 })
    .go(u - 1.5, v, { act: "jump" })
    .go(u, v, { land: true })
    .go(u + 2.2, v * 0.3, { pass: true })
    .tag(null);
}

/**
 * Finale: the safe route hops sideways onto a small roof and back; the
 * advanced shortcut goes straight there — by wall run ('wall') or by a
 * sprint-jump + air dash ('dash'). The shortcut carries a star.
 */
export function shortcutFinish(c, o = {}) {
  const kind = o.kind || "wall";
  const side = o.side || "left";
  const s = side === "left" ? 1 : -1;
  const r = c.cur;
  const baseV = r.v;
  const finishLen = o.finishLen ?? 14;
  if (kind === "wall") {
    c.wallrun({ side, from: -1, to: 10.2, off: 1.5, h: o.h ?? 5, look: o.look || "billboard" });
    c.starAhead(5.4, s * 1.05, 1.7, "shortcut");
    c.tag("stars").go(r.len - 3.4, s * 0.3, { sprint: true }).go(r.len - 0.45, s * 0.4, { act: "wallrun", side, sprint: true }).tag(null);
  } else {
    c.starAhead(4, 0, 1.5, "shortcut");
    c.tag("stars").go(r.len - 3.4, 0, { sprint: true }).go(r.len - 0.45, 0, { act: "dashJump", sprint: true, dashAt: 0.22 }).tag(null);
  }
  c.tag("safe");
  c.roof({ gap: 2.4, len: kind === "wall" ? 4.2 : 3.8, w: 5, v: baseV - s * 3.6, style: o.midStyle || "low", takeoffV: -s * 2.8, dy: o.midDy || 0 });
  c.tag(null);
  // dash shortcut flies straight at the landing point, so keep it on the centre line
  c.roof({ gap: 2.2, len: finishLen, w: o.finishW ?? 12, v: baseV, style: o.finishStyle || "tower", takeoffV: s * 1.4, landV: kind === "wall" ? -s * 3 : 0, edgeTag: "safe" });
  for (const p of o.props || []) c.prop(...p);
  c.finish(o.finishAt ?? 7.5);
}
