/**
 * Supermarket Rush — a customer's quick question ("Where can I find this?").
 * Answered with the 1/2/3 keys (works even though the pointer stays
 * locked) — see engine/input.js's onChoice hook.
 */
export default function HelpPromptPanel({ prompt }) {
  return (
    <div className="sr-help">
      <div className="sr-help__card">
        <p>{prompt.question}</p>
        <ol>
          {prompt.options.map((opt, i) => (
            <li key={opt + i}>
              <span className="sr-help__key">{i + 1}</span> {opt}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
