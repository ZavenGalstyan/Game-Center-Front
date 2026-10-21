/**
 * Motel 6: Last Guest — procedural faces. One spec (guests.js `face()`) drives
 * both the SVG portrait (ID photo, dialogue panel, summaries) and the canvas
 * texture wrapped around the 3D guest's head, so what you see at the desk is
 * what the ID photo has to match.
 */
import { SKIN, HAIR } from "./guests.js";

const EYE = { brown: "#4a2c18", blue: "#3a6fa8", green: "#3f7a4a", gray: "#6d7a80", black: "#000", white: "#f4f4f0" };
const HEAD = { oval: [30, 38], round: [33, 35], long: [27, 41], square: [31, 37] };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/**
 * SVG markup for a portrait. variant: normal | void (black eyes, wide mouth) |
 * blank (featureless) — used for "guests changing appearance".
 */
export function portraitSVG(f, { variant = "normal", bg = "dark", id = "p" } = {}) {
  const skin = SKIN[f.skin] || SKIN[1];
  const hair = HAIR[f.hair] || HAIR.brown;
  const [rx, ry] = HEAD[f.shape] || HEAD.oval;
  const cx = 60, cy = 66;
  const top = cy - ry, chin = cy + ry;
  const p = [];
  const bgFill = bg === "id" ? `url(#${id}bg)` : bg === "none" ? "none" : `url(#${id}bg)`;
  p.push(`<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1">${bg === "id" ? '<stop offset="0" stop-color="#b9c6cf"/><stop offset="1" stop-color="#8697a3"/>' : '<stop offset="0" stop-color="#1a1416"/><stop offset="1" stop-color="#0a0809"/>'}</linearGradient>
  <radialGradient id="${id}sk" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, 0.78)}"/></radialGradient></defs>`);
  p.push(`<rect width="120" height="150" fill="${bgFill}"/>`);
  // back hair
  if (f.style === "long") p.push(`<path d="M${cx - rx - 6} ${cy - 10} Q${cx - rx - 10} ${chin + 30} ${cx - rx + 2} ${chin + 34} L${cx + rx - 2} ${chin + 34} Q${cx + rx + 10} ${chin + 30} ${cx + rx + 6} ${cy - 10} Z" fill="${hair}"/>`);
  if (f.style === "bob") p.push(`<path d="M${cx - rx - 5} ${cy - 12} Q${cx - rx - 7} ${chin - 2} ${cx - rx + 4} ${chin + 2} L${cx + rx - 4} ${chin + 2} Q${cx + rx + 7} ${chin - 2} ${cx + rx + 5} ${cy - 12} Z" fill="${hair}"/>`);
  // coat & neck
  p.push(`<path d="M8 150 Q12 ${chin + 22} 40 ${chin + 14} L80 ${chin + 14} Q108 ${chin + 22} 112 150 Z" fill="${f.coat}"/>`);
  p.push(`<path d="M48 ${chin + 15} L60 ${chin + 30} L72 ${chin + 15}" fill="none" stroke="${shade(f.coat, 0.6)}" stroke-width="3"/>`);
  p.push(`<rect x="${cx - 10}" y="${chin - 10}" width="20" height="26" fill="${shade(skin, 0.85)}"/>`);
  // head
  if (variant === "twisted") {
    // back of the head facing you; a face where the nape should be
    p.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${hair}"/>`);
    p.push(`<ellipse cx="${cx}" cy="${chin + 4}" rx="${rx * 0.55}" ry="${ry * 0.32}" fill="${shade(skin, 0.7)}"/>`);
    p.push(`<circle cx="${cx - 7}" cy="${chin + 1}" r="3" fill="#000"/><circle cx="${cx + 7}" cy="${chin + 1}" r="3" fill="#000"/><path d="M${cx - 8} ${chin + 10} Q${cx} ${chin + 6} ${cx + 8} ${chin + 10}" stroke="#000" stroke-width="2" fill="none"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">${p.join("")}</svg>`;
  }
  if (f.shape === "square") p.push(`<rect x="${cx - rx}" y="${top}" width="${rx * 2}" height="${ry * 2}" rx="${rx * 0.7}" fill="url(#${id}sk)"/>`);
  else p.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}sk)"/>`);
  // ears
  p.push(`<ellipse cx="${cx - rx + 1}" cy="${cy + 4}" rx="4" ry="7" fill="${shade(skin, 0.86)}"/><ellipse cx="${cx + rx - 1}" cy="${cy + 4}" rx="4" ry="7" fill="${shade(skin, 0.86)}"/>`);
  if (variant === "blank") {
    p.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e9e6df" opacity="0.92"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">${p.join("")}</svg>`;
  }
  const ey = cy - 2;
  const eyeCol = variant === "void" ? EYE.black : EYE[f.eyes] || EYE.brown;
  // eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 12;
    if (variant === "void") p.push(`<ellipse cx="${ex}" cy="${ey}" rx="6" ry="5" fill="#000"/>`);
    else p.push(`<ellipse cx="${ex}" cy="${ey}" rx="5.4" ry="3.4" fill="#f3efe8"/><circle cx="${ex}" cy="${ey}" r="2.6" fill="${eyeCol}"/><circle cx="${ex}" cy="${ey}" r="1.1" fill="#111"/><circle cx="${ex + 0.8}" cy="${ey - 0.9}" r="0.6" fill="#fff"/>`);
    p.push(`<path d="M${ex - 7} ${ey - 7 - (f.mouth === "frown" ? -1 : 0)} Q${ex} ${ey - 10} ${ex + 7} ${ey - 7}" stroke="${f.hair === "white" || f.hair === "gray" ? shade(hair, 0.8) : hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  }
  // nose
  p.push(`<path d="M${cx} ${ey + 2} L${cx - 3} ${ey + 13} Q${cx} ${ey + 15} ${cx + 3} ${ey + 13}" stroke="${shade(skin, 0.68)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  // mouth
  const my = ey + 22;
  if (variant === "void") p.push(`<path d="M${cx - 16} ${my - 2} Q${cx} ${my + 12} ${cx + 16} ${my - 2} Q${cx} ${my + 4} ${cx - 16} ${my - 2}" fill="#120808"/>`);
  else if (f.mouth === "smile") p.push(`<path d="M${cx - 9} ${my} Q${cx} ${my + 6} ${cx + 9} ${my}" stroke="#8a3b34" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  else if (f.mouth === "frown") p.push(`<path d="M${cx - 8} ${my + 3} Q${cx} ${my - 2} ${cx + 8} ${my + 3}" stroke="#7a3a34" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  else if (f.mouth === "thin") p.push(`<path d="M${cx - 9} ${my + 1} L${cx + 9} ${my + 1}" stroke="#6a3a34" stroke-width="1.6" stroke-linecap="round"/>`);
  else p.push(`<path d="M${cx - 8} ${my + 1} Q${cx} ${my + 3} ${cx + 8} ${my + 1}" stroke="#8a3b34" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  // age lines
  if (f.age >= 2) p.push(`<path d="M${cx - 13} ${top + 16} Q${cx} ${top + 13} ${cx + 13} ${top + 16} M${cx - 18} ${my - 6} Q${cx - 15} ${my} ${cx - 13} ${my + 4} M${cx + 18} ${my - 6} Q${cx + 15} ${my} ${cx + 13} ${my + 4}" stroke="${shade(skin, 0.7)}" stroke-width="1.1" fill="none"/>`);
  // marks
  if (f.mark === "mole") p.push(`<circle cx="${cx + 15}" cy="${my - 6}" r="1.8" fill="#3a2418"/>`);
  if (f.mark === "scar") p.push(`<path d="M${cx + 7} ${ey - 15} L${cx + 17} ${ey - 1}" stroke="#b77a6a" stroke-width="1.8"/>`);
  if (f.mark === "freckles") for (const [x, y] of [[-17, 8], [-13, 10], [-20, 11], [17, 8], [13, 10], [20, 11], [-2, 6], [3, 7]]) p.push(`<circle cx="${cx + x}" cy="${ey + y}" r="0.9" fill="${shade(skin, 0.62)}"/>`);
  // facial hair
  const beardC = hair;
  if (f.beard === "full") p.push(`<path d="M${cx - rx + 3} ${cy + 4} Q${cx - rx + 4} ${chin + 4} ${cx} ${chin + 6} Q${cx + rx - 4} ${chin + 4} ${cx + rx - 3} ${cy + 4} Q${cx + 14} ${my + 12} ${cx} ${my + 9} Q${cx - 14} ${my + 12} ${cx - rx + 3} ${cy + 4} Z" fill="${beardC}"/><path d="M${cx - 11} ${my - 3} Q${cx} ${my - 7} ${cx + 11} ${my - 3} L${cx + 9} ${my} Q${cx} ${my - 3} ${cx - 9} ${my} Z" fill="${beardC}"/>`);
  if (f.beard === "stubble") p.push(`<path d="M${cx - rx + 5} ${cy + 8} Q${cx - rx + 6} ${chin + 2} ${cx} ${chin + 3} Q${cx + rx - 6} ${chin + 2} ${cx + rx - 5} ${cy + 8}" fill="${beardC}" opacity="0.28"/>`);
  if (f.beard === "mustache") p.push(`<path d="M${cx - 12} ${my - 1} Q${cx - 6} ${my - 8} ${cx} ${my - 4} Q${cx + 6} ${my - 8} ${cx + 12} ${my - 1} Q${cx} ${my - 3} ${cx - 12} ${my - 1} Z" fill="${beardC}"/>`);
  if (f.beard === "goatee") p.push(`<path d="M${cx - 7} ${my + 5} Q${cx} ${chin + 6} ${cx + 7} ${my + 5} Q${cx} ${my + 9} ${cx - 7} ${my + 5} Z" fill="${beardC}"/><path d="M${cx - 9} ${my - 2} Q${cx} ${my - 6} ${cx + 9} ${my - 2}" stroke="${beardC}" stroke-width="2.4" fill="none"/>`);
  // hair (front)
  const cap = (h) => `<path d="M${cx - rx - 2} ${cy - 4} Q${cx - rx - 3} ${top - h} ${cx} ${top - h - 3} Q${cx + rx + 3} ${top - h} ${cx + rx + 2} ${cy - 4} Q${cx + rx - 2} ${top + 12} ${cx} ${top + 10} Q${cx - rx + 2} ${top + 12} ${cx - rx - 2} ${cy - 4} Z" fill="${hair}"/>`;
  switch (f.style) {
    case "short": p.push(cap(4)); break;
    case "long": p.push(cap(5)); break;
    case "bob": p.push(cap(5), `<path d="M${cx - rx} ${top + 8} Q${cx - 6} ${top + 22} ${cx + rx} ${top + 9} L${cx + rx} ${top + 4} L${cx - rx} ${top + 4} Z" fill="${hair}"/>`); break;
    case "bun": p.push(cap(3), `<circle cx="${cx}" cy="${top - 8}" r="11" fill="${hair}"/>`); break;
    case "curly": for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + (i / 8) * 0.9); p.push(`<circle cx="${cx + Math.cos(a) * (rx + 1)}" cy="${cy - 6 + Math.sin(a) * (ry + 1)}" r="${9 + (i % 3)}" fill="${hair}"/>`); } p.push(cap(2)); break;
    case "buzz": p.push(`<path d="M${cx - rx + 1} ${cy - 6} Q${cx - rx} ${top - 1} ${cx} ${top - 2} Q${cx + rx} ${top - 1} ${cx + rx - 1} ${cy - 6} Q${cx} ${top + 8} ${cx - rx + 1} ${cy - 6} Z" fill="${hair}" opacity="0.7"/>`); break;
    case "slick": p.push(cap(3), `<path d="M${cx - 10} ${top + 2} Q${cx + 8} ${top + 1} ${cx + rx} ${top + 12}" stroke="${shade(hair, 1.5)}" stroke-width="1.2" fill="none"/>`); break;
    case "cap": p.push(cap(2), `<path d="M${cx - rx - 3} ${top + 12} Q${cx} ${top - 14} ${cx + rx + 3} ${top + 12} Z" fill="#7a2420"/><path d="M${cx - rx - 2} ${top + 12} Q${cx} ${top + 6} ${cx + rx + 16} ${top + 14} L${cx + rx + 14} ${top + 17} Q${cx} ${top + 12} ${cx - rx - 2} ${top + 15} Z" fill="#5a1a18"/>`); break;
    case "bald": if (f.age >= 2) p.push(`<path d="M${cx - rx - 1} ${cy - 2} Q${cx - rx + 2} ${cy - 16} ${cx - rx + 8} ${cy - 18} L${cx - rx + 6} ${cy} Z M${cx + rx + 1} ${cy - 2} Q${cx + rx - 2} ${cy - 16} ${cx + rx - 8} ${cy - 18} L${cx + rx - 6} ${cy} Z" fill="${hair}"/>`); break;
    default: break;
  }
  // glasses
  if (f.glasses === "round") p.push(`<g fill="none" stroke="#1d1d1d" stroke-width="1.6"><circle cx="${cx - 12}" cy="${ey}" r="7.5"/><circle cx="${cx + 12}" cy="${ey}" r="7.5"/><path d="M${cx - 4.5} ${ey} L${cx + 4.5} ${ey}"/></g>`);
  if (f.glasses === "square") p.push(`<g fill="none" stroke="#1d1d1d" stroke-width="1.8"><rect x="${cx - 21}" y="${ey - 6}" width="16" height="11" rx="2"/><rect x="${cx + 5}" y="${ey - 6}" width="16" height="11" rx="2"/><path d="M${cx - 5} ${ey - 1} L${cx + 5} ${ey - 1}"/></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">${p.join("")}</svg>`;
}
export const portraitURL = (f, o) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSVG(f, o))}`;
