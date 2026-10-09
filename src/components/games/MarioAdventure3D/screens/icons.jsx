/** Mario Adventure 3D — small inline SVG icons (no icon font, no images). */
export function Heart({ full = true }) {
  return (
    <svg viewBox="0 0 24 22" className="ma-ico ma-heart" data-full={full ? "1" : "0"} aria-hidden="true">
      <path d="M12 21 C5 15 1 11.5 1 7 A5.5 5.5 0 0 1 12 4.2 A5.5 5.5 0 0 1 23 7 C23 11.5 19 15 12 21Z" />
      <path className="ma-heart__shine" d="M6 5.5 a2.4 2 -30 0 1 3 1.3" />
    </svg>
  );
}
export function Coin() {
  return (
    <svg viewBox="0 0 24 24" className="ma-ico ma-coin" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="9" ry="10.5" fill="#ffcc1f" stroke="#a86b00" strokeWidth="2" />
      <rect x="10" y="6.5" width="4" height="11" rx="1.6" fill="#fff0a0" stroke="#c98a00" strokeWidth="1" />
    </svg>
  );
}
export function Star({ on = true, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={`ma-ico ma-star ${className}`} data-on={on ? "1" : "0"} aria-hidden="true">
      <path d="M12 1.8l3 6.4 7 .8-5.2 4.8 1.5 6.9L12 17.2l-6.3 3.5 1.5-6.9L2 9l7-.8z" />
    </svg>
  );
}
export function Lock() {
  return (
    <svg viewBox="0 0 24 24" className="ma-ico" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
export function Pause() {
  return (
    <svg viewBox="0 0 24 24" className="ma-ico" aria-hidden="true" fill="currentColor">
      <rect x="6" y="5" width="4.2" height="14" rx="1.3" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.3" />
    </svg>
  );
}
export function PowerIcon({ type }) {
  if (type === "speed")
    return (
      <svg viewBox="0 0 24 24" className="ma-ico" aria-hidden="true">
        <path d="M13.5 2 5 13.5h5.5L9 22l9.5-12.5H13z" fill="#38b6ff" stroke="#0b5fa8" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  if (type === "jump")
    return (
      <svg viewBox="0 0 24 24" className="ma-ico" aria-hidden="true" fill="#4cd964" stroke="#0f6a22" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M12 2l6 7h-4v3h-4V9H6z" />
        <path d="M12 11l6 7h-4v4h-4v-4H6z" />
      </svg>
    );
  if (type === "star") return <Star on className="ma-star--rainbow" />;
  if (type === "magnet")
    return (
      <svg viewBox="0 0 24 24" className="ma-ico" aria-hidden="true">
        <path d="M5 3v9a7 7 0 0 0 14 0V3h-4.5v9a2.5 2.5 0 0 1-5 0V3z" fill="#e3262b" stroke="#7a0a0a" strokeWidth="1.3" />
        <rect x="5" y="3" width="4.5" height="3.6" fill="#dfe3ea" />
        <rect x="14.5" y="3" width="4.5" height="3.6" fill="#dfe3ea" />
      </svg>
    );
  return null;
}
export function Key({ children, wide = false }) {
  return <kbd className={wide ? "ma-kbd ma-kbd--wide" : "ma-kbd"}>{children}</kbd>;
}
