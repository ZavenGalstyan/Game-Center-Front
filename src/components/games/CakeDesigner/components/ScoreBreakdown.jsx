/**
 * Cake Designer — the per-category score breakdown on the result screen.
 */

const GRADE_TONE = {
  PERFECT: "#3fb27a",
  GREAT: "#6cc06b",
  OKAY: "#e8b64a",
  CLOSE: "#e08a4a",
  MISSED: "#d8564f",
};

export default function ScoreBreakdown({ categories }) {
  return (
    <ul className="cd-breakdown">
      {categories.map((c) => (
        <li key={c.key}>
          <span className="cd-breakdown__label">{c.label}</span>
          <span className="cd-breakdown__bar">
            <span className="cd-breakdown__fill" style={{ width: `${Math.round(c.ratio * 100)}%`, background: GRADE_TONE[c.grade] }} />
          </span>
          <span className="cd-breakdown__grade" style={{ color: GRADE_TONE[c.grade] }}>{c.grade}</span>
        </li>
      ))}
    </ul>
  );
}
