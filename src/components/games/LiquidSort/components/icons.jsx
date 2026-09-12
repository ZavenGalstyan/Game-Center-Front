/**
 * Liquid Sort — one shared, consistent SVG icon set. No emoji anywhere.
 * Every icon is stroke-based (currentColor) at a 24x24 grid, matching the
 * Game Center's own GameControls icon style.
 */
const p = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

export function IconPlay(props) {
  return <svg {...p} {...props}><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>;
}
export function IconGrid(props) {
  return <svg {...p} {...props}><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></svg>;
}
export function IconChart(props) {
  return <svg {...p} {...props}><path d="M4 20V10M12 20V4M20 20v-6" /></svg>;
}
export function IconSettings(props) {
  return <svg {...p} {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.2a7.6 7.6 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.8 1.4 2 3.4 2.1-.6a7.6 7.6 0 0 0 2.6 1.5l.5 2.2h4l.5-2.2a7.6 7.6 0 0 0 2.6-1.5l2.1.6 2-3.4-1.8-1.4Z" /></svg>;
}
export function IconUndo(props) {
  return <svg {...p} {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
}
export function IconHint(props) {
  return <svg {...p} {...props}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1.1 1.2 1.1 2.2h5c0-1 .5-1.75 1.1-2.2A6 6 0 0 0 12 3Z" /></svg>;
}
export function IconLock(props) {
  return <svg {...p} {...props}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
export function IconCheck(props) {
  return <svg {...p} {...props}><path d="M5 13l4.5 4.5L19 7" /></svg>;
}
export function IconStar({ filled, ...rest }) {
  return (
    <svg {...p} fill={filled ? "currentColor" : "none"} {...rest}>
      <path d="M12 3.3l2.6 5.4 5.9.7-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.7Z" />
    </svg>
  );
}
