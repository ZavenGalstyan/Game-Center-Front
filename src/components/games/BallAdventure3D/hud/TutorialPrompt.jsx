/** Small contextual prompt (Level 1 only) — never a blocking modal. */
export default function TutorialPrompt({ text }) {
  if (!text) return null;
  return (
    <div className="ba3d-tutorial">
      <span>{text}</span>
    </div>
  );
}
