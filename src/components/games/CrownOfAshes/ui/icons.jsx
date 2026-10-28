/**
 * Original line-art icons (inline SVG, 24×24 viewBox, currentColor).
 */
const P = {
  sword: "M14.5 3h6v6L10 19.5l-1.5-1.5L19 7.5V5h-2.5L6 15.5 4.5 14 14.5 3zM5 16l3 3-2 2-1.5-1.5L3 21l-1-1 1.5-1.5L2 17l2-2z",
  greatsword: "M15 2h7v7L11 20l-3-3L19 6V5h-1L7 16l-3-3L15 2zM4 17l3 3-2 2-3-3 2-2z",
  dagger: "M17 3l4 4-9 9-2-2 7-7-1-1-7 7-2-2 9-9zM6 16l2 2-3 3-2-2 3-3z",
  axe: "M13 2c5 1 8 4 9 9l-5 1-5-5 1-5zM11 8l3 3-9 9-3-3 9-9z",
  mace: "M15 3l2 2 2-2 2 2-2 2 2 2-2 2-2-2-2 2-2-2 2-2-2-2 2-2zM12 10l2 2-9 9-2-2 9-9z",
  bow: "M5 3c9 0 16 7 16 16h-2c0-8-6-14-14-14V3zM5 5l14 14M3 21l3-1-2-2-1 3z",
  staff: "M18 2l4 4-3 1-2 2-1-1 1-2-1-1-2 1-1-1 2-2 1-1zM15 8l1 1-12 12-1-1 12-12z",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zm0 2.2L6 6.4V11c0 3.9 2.6 7.1 6 8.8 3.4-1.7 6-4.9 6-8.8V6.4l-6-2.2z",
  helm: "M12 3c4.4 0 8 3.6 8 8v7h-5v-4h-1v6h-4v-6H9v4H4v-7c0-4.4 3.6-8 8-8zm-1 5v4h2V8h-2z",
  chest: "M7 3l5 2 5-2 4 3-2 5h-2v10H7V11H5L3 6l4-3zm3 6v2h4V9h-4z",
  gloves: "M8 3h2v7h1V2h2v8h1V3h2v8h1V6h2v9c0 4-3 7-7 7s-6-2-7-5l-2-5 2-1 2 3V3z",
  boots: "M7 2h6v11l6 3c1.5.7 2 2 2 3v2H3v-4l4-2V2zm2 2v9h2V4H9z",
  amulet: "M6 2h2c0 3 1.8 5 4 5s4-2 4-5h2c0 3.6-2 6.4-5 7v1.2a4 4 0 11-2 0V9C8 8.4 6 5.6 6 2zm6 11a2 2 0 100 4 2 2 0 000-4z",
  potion: "M9 2h6v2h-1v4l4 5c2 3 0 9-6 9s-8-6-6-9l4-5V4H9V2zm-1.7 13c-.8 1.8.4 5 4.7 5s5.5-3.2 4.7-5H7.3z",
  tonic: "M10 2h4v3l3 3v12a2 2 0 01-2 2H9a2 2 0 01-2-2V8l3-3V2zm-1 9v9h6v-9H9z",
  coin: "M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm-1 2h2v1.1c1.6.3 2.7 1.3 2.7 2.4h-2c0-.4-.6-.8-1.7-.8s-1.6.4-1.6.8 .6.7 1.9 1c2.2.5 3.5 1.3 3.5 2.9 0 1.2-1.1 2.2-2.8 2.5V18h-2v-1.1c-1.7-.3-2.9-1.3-2.9-2.6h2c0 .5.7.9 1.8.9s1.8-.4 1.8-.9-.6-.7-2.1-1.1c-2-.5-3.3-1.2-3.3-2.8 0-1.1 1-2 2.7-2.3V7z",
  scroll: "M6 3h12a3 3 0 013 3v1h-3v11a3 3 0 01-3 3H5a3 3 0 01-3-3v-1h3V6a3 3 0 011-3zm2 4v2h7V7H8zm0 4v2h7v-2H8zm0 4v2h5v-2H8z",
  gem: "M7 3h10l5 6-10 12L2 9l5-6zm1 2L5 9h4l2-4H8zm5 0l2 4h4l-3-4h-3zm-2 0L9 9h6l-2-4h-2zM5.6 11l5.4 6.5L9.2 11H5.6zm5.6 0l1 5 1-5h-2zm3.6 0l-1.8 6.5 5.4-6.5h-3.6z",
  ore: "M8 3l6 2 6 6-2 8-8 3-7-5 1-8 4-6zm2 4l-3 4 3 5 4-2 1-5-5-2z",
  hide: "M4 5c3 1 5 0 8-2 3 2 5 3 8 2-1 4 0 6 2 9-3 1-4 3-4 6-2-1-4-1-6 0-2-1-4-1-6 0 0-3-1-5-4-6 2-3 3-5 2-9z",
  key: "M7 3a5 5 0 014.9 6H22v4h-2v3h-3v-3h-2v3h-3v-3h-.1A5 5 0 117 3zm0 3a2 2 0 100 4 2 2 0 000-4z",
  heart: "M12 21l-1.4-1.3C5.4 15.1 2 12 2 8.2 2 5.1 4.4 3 7.3 3c1.7 0 3.4.8 4.7 2.1C13.3 3.8 15 3 16.7 3 19.6 3 22 5.1 22 8.2c0 3.8-3.4 6.9-8.6 11.5L12 21z",
  flame: "M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z",
  bash: "M4 4h7l9 8-9 8H4l3-8-3-8zm4 3l1.5 5L8 17h2.5l5.5-5-5.5-5H8z",
  cry: "M3 9h4l6-5v16l-6-5H3V9zm13 0a4 4 0 010 6l-1.4-1.4a2 2 0 000-3.2L16 9zm2.5-2.5a7.5 7.5 0 010 11l-1.4-1.4a5.5 5.5 0 000-8.2l1.4-1.4z",
  whirl: "M12 3a9 9 0 019 9h-2a7 7 0 00-7-7V3zm0 18a9 9 0 01-9-9h2a7 7 0 007 7v2zm0-14a5 5 0 015 5h-2a3 3 0 00-3-3V7zm0 10a5 5 0 01-5-5h2a3 3 0 003 3v2z",
  trap: "M4 14l3-8 2 5 3-7 3 7 2-5 3 8H4zm-1 2h18v3H3v-3z",
  volley: "M4 2l2 6-2 1-2-6 2-1zm8 0l1 6-2 1-1-6 2-1zm8 0v6l-2 1V3l2-1zM6 10l2 2-5 9-2-1 5-10zm6 1l2 1-3 10-2-1 3-10zm7 0l2 1-2 10-2-1 2-10z",
  pierce: "M2 11h14l-3-3 2-2 6 6-6 6-2-2 3-3H2v-2zm3-4l2 1-2 8-2-1 2-8z",
  nova: "M12 2l2 6 6-3-3 6 6 1-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-1-3-6 6 3 2-6z",
  meteor: "M14 2l2 6 6-1-4 5 2 6-7-3a5 5 0 11-6 6l6-6-3-7 4-6zM7 15a3 3 0 100 6 3 3 0 000-6z",
  blink: "M4 12l4-4v3h4V8l4 4-4 4v-3H8v3l-4-4zm14-6h2v12h-2V6z",
  step: "M12 2c2 0 3 1.5 3 3s-1 3-3 3-3-1.5-3-3 1-3 3-3zM8 9h6l3 5-2 1-2-3-1 3 3 4v4h-2v-3l-3-3-1 3-4 3-1-2 3-2 1-5-2 1-2 3-2-1 3-5z",
  vanish: "M12 2a6 6 0 016 6c0 2-1 3.5-2 4.5V20l-2-1-2 2-2-2-2 1v-7.5C7 11.5 6 10 6 8a6 6 0 016-6zm-2 5a1.2 1.2 0 100 2.4A1.2 1.2 0 0010 7zm4 0a1.2 1.2 0 100 2.4A1.2 1.2 0 0014 7z",
  fan: "M12 21L4 7l3-1 5 9 5-9 3 1-8 14zm-1-17h2v9h-2V4zM6 3l2-1 3 6-2 1-3-6zm12 0l-6 6 2 1 3-6-1-1z",
  lock: "M7 10V7a5 5 0 0110 0v3h2v11H5V10h2zm2 0h6V7a3 3 0 00-6 0v3z",
  map: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6 0v12l6 2V7L9 5z",
  journal: "M5 2h13a2 2 0 012 2v16a2 2 0 01-2 2H5V2zm3 3v2h8V5H8zm0 4v2h8V9H8zm0 4v2h5v-2H8z",
  bag: "M9 4a3 3 0 016 0h4l1 17H4L5 4h4zm2 0h2a1 1 0 00-2 0zm-3 4a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z",
  skill: "M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z",
  gear: "M12 8a4 4 0 110 8 4 4 0 010-8zm-1-6h2l.6 3 2.2.9 2.6-1.7 1.4 1.4-1.7 2.6.9 2.2 3 .6v2l-3 .6-.9 2.2 1.7 2.6-1.4 1.4-2.6-1.7-2.2.9-.6 3h-2l-.6-3-2.2-.9-2.6 1.7-1.4-1.4 1.7-2.6-.9-2.2-3-.6v-2l3-.6.9-2.2-1.7-2.6 1.4-1.4 2.6 1.7 2.2-.9L11 2z",
  crown: "M3 18l-1-11 6 4 4-7 4 7 6-4-1 11H3zm0 2h18v2H3v-2z",
  tower: "M5 3h3v2h2V3h4v2h2V3h3v6l-2 2v10H7V11L5 9V3zm6 10v8h2v-8h-2z",
  camp: "M12 3l10 18H2L12 3zm0 6l-4 10h8l-4-10z",
  dragon: "M3 13c2-1 4-1 5 0 1-3 4-5 7-5 2-3 5-4 7-4-1 2-2 3-4 4l2 2-3 1c0 4-3 7-8 7H5l2-3c-2 0-3-1-4-2zm13-4a1 1 0 100 2 1 1 0 000-2z",
  skull: "M12 2a8 8 0 018 8c0 3-1.5 5-3 6v3h-3v-2h-1v2h-2v-2h-1v2H7v-3c-1.5-1-3-3-3-6a8 8 0 018-8zM8.5 9a2 2 0 100 4 2 2 0 000-4zm7 0a2 2 0 100 4 2 2 0 000-4z",
  compassN: "M12 2l4 10-4-2-4 2 4-10z",
  pause: "M6 4h4v16H6V4zm8 0h4v16h-4V4z",
  close: "M6 5l6 6 6-6 1 1-6 6 6 6-1 1-6-6-6 6-1-1 6-6-6-6 1-1z",
  check: "M9 16l-4-4-1.5 1.5L9 19 21 7l-1.5-1.5L9 16z",
  star: "M12 2l3 7h7l-5.6 4.4L18.6 21 12 16.6 5.4 21l2.2-7.6L2 9h7l3-7z",
  fist: "M7 4h9a3 3 0 013 3v6c0 4-3 8-7 8s-7-3-7-7V9a2 2 0 012-2V4z",
  ring: "M12 6a7 7 0 110 14 7 7 0 010-14zm0 2a5 5 0 100 10 5 5 0 000-10zM9 2h6l-1 3h-4L9 2z",
};

export function Icon({ name, size = 20, className = "", title }) {
  const d = P[name] || P.star;
  return (
    <svg className={`coa-ico ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Pick an icon for an item definition. */
export function itemIcon(d) {
  if (!d) return "star";
  if (d.type === "weapon") return { sword: "sword", runeblade: "sword", greatsword: "greatsword", flamesword: "greatsword", bow: "bow", staff: "staff", dagger: "dagger" }[d.kind] || "sword";
  if (d.type === "offhand") return d.kind === "shield" ? "shield" : d.kind === "quiver" ? "bow" : d.kind === "tome" ? "journal" : "bag";
  if (d.slot === "head") return "helm";
  if (d.slot === "chest") return "chest";
  if (d.slot === "hands") return "gloves";
  if (d.slot === "legs") return "boots";
  if (d.slot === "trinket") return d.id === "t_coin" ? "coin" : "amulet";
  if (d.type === "potion") return d.id === "p_tonic" ? "tonic" : "potion";
  if (d.id === "m_iron" || d.id === "q_ore") return "ore";
  if (d.id === "m_ember" || d.id === "q_heartstone") return "gem";
  if (d.id === "m_hide" || d.id === "q_pelt") return "hide";
  if (d.id === "q_key") return "key";
  if (d.id === "q_locket") return "amulet";
  if (d.type === "quest") return "scroll";
  return "star";
}
