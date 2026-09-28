/** Boxing Club — inline stroke icons (currentColor). */
const P = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const Icon = {
  play: (p) => <svg {...P} {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></svg>,
  pause: (p) => <svg {...P} {...p}><path d="M8 5v14M16 5v14" /></svg>,
  back: (p) => <svg {...P} {...p}><path d="M15 5l-7 7 7 7" /></svg>,
  next: (p) => <svg {...P} {...p}><path d="M9 5l7 7-7 7" /></svg>,
  restart: (p) => <svg {...P} {...p}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></svg>,
  keys: (p) => <svg {...P} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>,
  glove: (p) => <svg {...P} {...p}><path d="M7 13V8a5 5 0 0 1 10 0v6a5 5 0 0 1-5 5H9a2 2 0 0 1-2-2v-1" /><path d="M7 13H5.5a1.5 1.5 0 0 0 0 3H7M8 20h8v2H8z" /></svg>,
  trophy: (p) => <svg {...P} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" /></svg>,
  user: (p) => <svg {...P} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  stats: (p) => <svg {...P} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  gear: (p) => <svg {...P} {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>,
  bag: (p) => <svg {...P} {...p}><path d="M12 2v3M8 5h8v14a4 4 0 0 1-8 0V5z" /><path d="M8 9h8M8 15h8" /></svg>,
  lock: (p) => <svg {...P} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  check: (p) => <svg {...P} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  bolt: (p) => <svg {...P} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
};
