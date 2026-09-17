/**
 * Number Fusion — shared UI chrome icons. Stroke-based SVGs at a 24x24
 * grid, matching the Game Center's own GameControls icon style.
 */
const p = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

export function IconPlay(props) {
  return <svg {...p} {...props}><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>;
}
export function IconSettings(props) {
  return <svg {...p} {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.2a7.6 7.6 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.8 1.4 2 3.4 2.1-.6a7.6 7.6 0 0 0 2.6 1.5l.5 2.2h4l.5-2.2a7.6 7.6 0 0 0 2.6-1.5l2.1.6 2-3.4-1.8-1.4Z" /></svg>;
}
export function IconBack(props) {
  return <svg {...p} {...props}><path d="M15 5 8 12l7 7" /></svg>;
}
export function IconUndo(props) {
  return <svg {...p} {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
}
export function IconRefresh(props) {
  return <svg {...p} {...props}><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5" /></svg>;
}
