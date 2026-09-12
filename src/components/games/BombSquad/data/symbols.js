/**
 * Bomb Squad — the shared set of 8 original fictional symbols used by the
 * Symbol Match and Sequence Lock modules. Each carries a fixed `value`
 * (rendered as small tick dots on the glyph) so Sequence Lock's
 * ascending-value rule is entirely self-contained — no outside knowledge
 * needed, the dots are right there on the button.
 */
export const SYMBOLS = [
  { id: "triDot", value: 1 },
  { id: "bars", value: 2 },
  { id: "moon", value: 3 },
  { id: "diamond", value: 4 },
  { id: "hexMark", value: 5 },
  { id: "arcSplit", value: 6 },
  { id: "crossRing", value: 7 },
  { id: "spiral", value: 8 },
];

export function symbolValue(id) {
  return SYMBOLS.find((s) => s.id === id)?.value ?? 0;
}
