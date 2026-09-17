/**
 * Element Merge — shared UI chrome icons (menu/nav/buttons). Stroke-based
 * SVGs at a 24x24 grid, matching the Game Center's own GameControls style.
 * Separate from components/icons.jsx, which draws element ARTWORK.
 */
const p = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

export function IconMenu(props) {
  return <svg {...p} {...props}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
export function IconBook(props) {
  return <svg {...p} {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" /><path d="M20 19H6.5A2.5 2.5 0 0 0 4 21.5" /></svg>;
}
export function IconChart(props) {
  return <svg {...p} {...props}><path d="M4 20V10M12 20V4M20 20v-6" /></svg>;
}
export function IconSettings(props) {
  return <svg {...p} {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.2a7.6 7.6 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.8 1.4 2 3.4 2.1-.6a7.6 7.6 0 0 0 2.6 1.5l.5 2.2h4l.5-2.2a7.6 7.6 0 0 0 2.6-1.5l2.1.6 2-3.4-1.8-1.4Z" /></svg>;
}
export function IconHint(props) {
  return <svg {...p} {...props}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1.1 1.2 1.1 2.2h5c0-1 .5-1.75 1.1-2.2A6 6 0 0 0 12 3Z" /></svg>;
}
export function IconTrophy(props) {
  return <svg {...p} {...props}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5" /><path d="M12 13v3M9 20h6M9.5 20c0-2 1-2.5 1-3.5M14.5 20c0-2-1-2.5-1-3.5" /></svg>;
}
export function IconFlag(props) {
  return <svg {...p} {...props}><path d="M5 21V4" /><path d="M5 4h13l-3 4 3 4H5" /></svg>;
}
export function IconLock(props) {
  return <svg {...p} {...props}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
export function IconCheck(props) {
  return <svg {...p} {...props}><path d="M5 13l4.5 4.5L19 7" /></svg>;
}
export function IconClose(props) {
  return <svg {...p} {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
export function IconBack(props) {
  return <svg {...p} {...props}><path d="M15 5 8 12l7 7" /></svg>;
}
export function IconPlay(props) {
  return <svg {...p} {...props}><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>;
}
