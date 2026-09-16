export default function InteractPrompt({ text }) {
  if (!text) return null;
  return (
    <div className="fl-interact-prompt">
      <span className="fl-interact-prompt__key">F</span>
      <span>{text}</span>
    </div>
  );
}
