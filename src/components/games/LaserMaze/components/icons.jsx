/** Laser Maze — small inline stroke icons (currentColor). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  undo: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  reset: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  hint: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></svg>,
  pause: () => <svg viewBox="0 0 24 24" {...P}><path d="M8 5v14M16 5v14" /></svg>,
  back: () => <svg viewBox="0 0 24 24" {...P}><path d="M15 18 9 12l6-6" /></svg>,
  next: () => <svg viewBox="0 0 24 24" {...P}><path d="m9 18 6-6-6-6" /></svg>,
  play: () => <svg viewBox="0 0 24 24" {...P}><path d="M7 4v16l13-8Z" fill="currentColor" /></svg>,
  grid: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  globe: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  stats: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>,
  lock: () => <svg viewBox="0 0 24 24" {...P}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></svg>,
  close: () => <svg viewBox="0 0 24 24" {...P}><path d="M18 6 6 18M6 6l12 12" /></svg>,
};

export function Star({ on, size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={on ? "lm-star is-on" : "lm-star"} aria-hidden="true">
      <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z"
        fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Stars({ n, size }) {
  return (
    <span className="lm-stars" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => <Star key={i} on={i <= n} size={size} />)}
    </span>
  );
}
