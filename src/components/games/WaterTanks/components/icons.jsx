/** Water Tanks — small inline stroke icons (currentColor), no emoji. */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const Icon = {
  undo: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  hint: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></svg>,
  back: () => <svg viewBox="0 0 24 24" {...P}><path d="M15 18 9 12l6-6" /></svg>,
  next: () => <svg viewBox="0 0 24 24" {...P}><path d="m9 18 6-6-6-6" /></svg>,
  play: () => <svg viewBox="0 0 24 24" {...P}><path d="M7 4v16l13-8Z" fill="currentColor" /></svg>,
  retry: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  levels: () => <svg viewBox="0 0 24 24" {...P}><circle cx="5" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h3a2 2 0 0 1 2 2v2M14 12h3a2 2 0 0 1 2 2v2" /></svg>,
  tank: () => <svg viewBox="0 0 24 24" {...P}><path d="M6 3h12M7 3v15a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V3" /><path d="M7 12c2 1 3-1 5 0s3 1 5 0" /></svg>,
  stats: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>,
  lock: () => <svg viewBox="0 0 24 24" {...P}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  unlock: () => <svg viewBox="0 0 24 24" {...P}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>,
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></svg>,
  drop: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /></svg>,
  tap: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 8h9a4 4 0 0 1 4 4v1" /><path d="M8 4h4M10 4v4" /><path d="M17 17v.01M17 20.5v.01" /></svg>,
  drain: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8" /><path d="M8 10h8M7.5 13h9M9 16h6" /></svg>,
  target: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...P}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  arrow: () => <svg viewBox="0 0 24 24" {...P}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  valve: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="7" /><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="2" /></svg>,
};

export function Star({ on, size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={on ? "wt-star is-on" : "wt-star"} aria-hidden="true">
      <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Stars({ n, size }) {
  return (
    <span className="wt-stars" role="img" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => <Star key={i} on={i <= n} size={size} />)}
    </span>
  );
}
