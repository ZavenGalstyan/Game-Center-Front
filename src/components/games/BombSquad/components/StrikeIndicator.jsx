/** Device strike bar — ● per allowed strike, lit red as they're used. */
export default function StrikeIndicator({ strikes, maxStrikes }) {
  return (
    <div className="bs-strikes" role="group" aria-label={`Strikes: ${strikes} of ${maxStrikes}`}>
      {Array.from({ length: maxStrikes }, (_, i) => (
        <span key={i} className={`bs-strikes__dot${i < strikes ? " is-hit" : ""}`} />
      ))}
    </div>
  );
}
