import { L, R, RU, rays, stars, embers, grid, speed, rng, frame, mirror } from "./lib.mjs";

/** Wheel: tyre + rim + spokes. */
function wheel(cx, cy, r, { rim = "#c9d2da", tyre = "#0d0f12", spokes = 5, hub = "#2a2f36" } = {}) {
  let s = "";
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    s += `M${cx} ${cy}L${(cx + Math.cos(a) * r * 0.58).toFixed(1)} ${(cy + Math.sin(a) * r * 0.58).toFixed(1)}`;
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${tyre}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.64).toFixed(1)}" fill="${rim}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(1)}" fill="${hub}"/>` +
    `<path d="${s}" stroke="${rim}" stroke-width="${(r * 0.16).toFixed(1)}" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.14).toFixed(1)}" fill="${rim}"/>`
  );
}

function smoke(seed, { n = 10, x0 = 0, x1 = 50, y0 = 70, y1 = 100, color = "#e8e4f0", op = 0.75, rMin = 6, rMax = 14 } = {}) {
  const rand = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${(x0 + rand() * (x1 - x0)).toFixed(1)}" cy="${(y0 + rand() * (y1 - y0)).toFixed(1)}" r="${(rMin + rand() * (rMax - rMin)).toFixed(1)}"/>`;
  }
  return `<g fill="${color}" opacity="${op}">${out}</g>`;
}

export default {
  "neon-supercar": () =>
    frame({
      bg: ["#7a1ac8", "#22083e", "#05010c"],
      light: "50% 55%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#2fe6ff"], [0.45, "#0a5a8a"], [1, "#04162a"]) +
        L("ws", 0, 0, 0, 1, [0, "#ff7ae0"], [1, "#2a0a4a"]) +
        RU("ug", 64, 100, 54, [0, "#ff2ad8", 0.85], [1, "#ff2ad8", 0]),
      fx:
        `<path d="M0 86V60h8v-8h8v34h6V48h10v38h6V56h8v30h44V52h10v34h6V44h10v42h6V62h12v24Z" fill="#14062a"/>` +
        `<g fill="#ff5ae8" opacity=".6"><rect x="24" y="54" width="2" height="2"/><rect x="28" y="62" width="2" height="2"/><rect x="104" y="52" width="2" height="2"/><rect x="108" y="64" width="2" height="2"/><rect x="88" y="60" width="2" height="2"/></g>` +
        `<path d="M0 86h128" stroke="#ff2ad8" stroke-width="1.4"/>` +
        grid("#ff2ad8", { horizon: 86, op: 0.5 }),
      body:
        `<ellipse cx="64" cy="102" rx="56" ry="10" fill="url(#ug)"/>` +
        `<rect x="14" y="84" width="16" height="18" rx="4" fill="#06080c"/><rect x="98" y="84" width="16" height="18" rx="4" fill="#06080c"/>` +
        `<path d="M10 92l8-16c6-10 18-18 46-18s40 8 46 18l8 16-4 8H14Z" fill="url(#bd)"/>` +
        `<path d="M36 64c6-6 14-8 28-8s22 2 28 8l-6 10H42Z" fill="url(#ws)"/>` +
        `<path d="M44 62c6-3 12-4 20-4" stroke="#fff" stroke-width="1.4" fill="none" opacity=".6" stroke-linecap="round"/>` +
        // headlight strips
        `<path d="M16 82l18 4 10-2M112 82l-18 4-10-2" stroke="#9ffcff" stroke-width="5" stroke-linecap="round" fill="none" filter="url(#glow)"/>` +
        `<path d="M16 82l18 4 10-2M112 82l-18 4-10-2" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>` +
        // intakes
        `<path d="M40 92h48l-4 6H44Z" fill="#05080e"/><path d="M18 92h14l2 6H22ZM110 92H96l-2 6h12Z" fill="#05080e"/>` +
        `<path d="M44 94h40" stroke="#ff2ad8" stroke-width="1" opacity=".8"/>` +
        `<path d="M58 76l6-4 6 4-6 4Z" fill="#9ffcff" opacity=".9"/>` +
        `<path d="M22 76c12-6 26-8 42-8s30 2 42 8" stroke="#7af6ff" stroke-width="1" fill="none" opacity=".7"/>`,
    }),

  "drift-king": () =>
    frame({
      bg: ["#ff8a3a", "#a0124a", "#1a0210"],
      light: "70% 40%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#f2f4f6"], [0.5, "#b8c0c8"], [1, "#4a525a"]) +
        L("gl", 0, 0, 1, 1, [0, "#5a7a9a"], [1, "#0a121a"]),
      fx:
        `<circle cx="90" cy="44" r="22" fill="#ffd26a" opacity=".85"/>` +
        `<path d="M0 96h128v32H0Z" fill="#1a0614"/><path d="M0 96h128" stroke="#ff9a5a" stroke-width="1" opacity=".6"/>` +
        `<path d="M10 112c30-4 60-4 108 2" stroke="#3a1a2a" stroke-width="3" fill="none"/>` +
        smoke(5, { n: 14, x0: -6, x1: 46, y0: 66, y1: 104, rMin: 7, rMax: 16, op: 0.55 }),
      body:
        `<g transform="translate(64 84) scale(1.18) rotate(-6) translate(-64 -84)">` +
        `<ellipse cx="66" cy="96" rx="48" ry="5" fill="#000" opacity=".5"/>` +
        `<path d="M14 88l2-10 18-6 14-12c4-3 8-4 14-4h18c6 0 10 2 14 6l10 10 12 2c4 1 6 4 6 8v6H14Z" fill="url(#bd)"/>` +
        `<path d="M50 62l-10 10h24V60H58c-3 0-6 1-8 2ZM68 60v12h24l-8-8c-2-2-5-4-8-4Z" fill="url(#gl)"/>` +
        `<path d="M16 82h96" stroke="#d81a3a" stroke-width="3"/>` +
        `<path d="M40 76h70" stroke="#2a3038" stroke-width="1"/>` +
        // wing
        `<path d="M10 64h20v3H10Z" fill="#1a1d22"/><path d="M16 67l2 8M26 67l-1 8" stroke="#1a1d22" stroke-width="2"/>` +
        `<path d="M110 82h6v4h-6Z" fill="#ffe8a0"/><path d="M14 80h4v4h-4Z" fill="#ff2a2a"/>` +
        wheel(36, 90, 10, { rim: "#ffd24a" }) + wheel(96, 90, 10, { rim: "#ffd24a" }) +
        `</g>` +
        smoke(13, { n: 8, x0: 12, x1: 40, y0: 82, y1: 102, rMin: 5, rMax: 9, op: 0.6, color: "#f6eef8" }),
    }),

  "american-muscle": () =>
    frame({
      bg: ["#ffc46a", "#c2501a", "#2a0a02"],
      light: "30% 35%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#ff4a3a"], [0.55, "#b0120a"], [1, "#3a0402"]) +
        L("cr", 0, 0, 0, 1, [0, "#ffffff"], [0.5, "#a8b0b8"], [1, "#4a525a"]) +
        L("gl", 0, 0, 1, 1, [0, "#3a2a2a"], [1, "#0a0606"]),
      fx:
        `<path d="M0 78l16-10 12 6 18-14 16 10 20-16 18 14 14-8 14 10v10H0Z" fill="#8a2a12" opacity=".7"/>` +
        `<path d="M0 90h128v38H0Z" fill="#2a1208"/><path d="M0 108h20M34 108h20M68 108h20M102 108h20" stroke="#ffd24a" stroke-width="2" opacity=".7"/>` +
        speed(8, { color: "#ffe0b0", op: 0.3, yMin: 58, yMax: 84 }),
      body:
        `<g transform="translate(64 80) scale(1.12) translate(-64 -80)">` +
        `<ellipse cx="64" cy="96" rx="56" ry="4" fill="#000" opacity=".5"/>` +
        `<path d="M8 90v-10c0-4 2-6 6-6l24-2 14-12c2-2 6-2 8-2h20c4 0 6 1 8 3l10 11 18 2c4 0 6 2 6 6v10Z" fill="url(#bd)"/>` +
        `<path d="M54 62l-10 10h20V60h-6c-2 0-3 1-4 2ZM68 60v12h20l-8-9c-1-2-3-3-5-3Z" fill="url(#gl)"/>` +
        // stripes
        `<path d="M84 72l32 2M84 76l32 2" stroke="#fff" stroke-width="2"/>` +
        `<path d="M98 66h12l2 7H98Z" fill="#1a0806"/><path d="M100 68h8" stroke="#c9d2da" stroke-width="1"/>` +
        `<path d="M10 84h108" stroke="#ff7a6a" stroke-width="1" opacity=".6"/>` +
        `<rect x="114" y="80" width="6" height="8" rx="1" fill="url(#cr)"/><rect x="6" y="80" width="6" height="8" rx="1" fill="url(#cr)"/>` +
        `<rect x="114" y="76" width="4" height="3" fill="#fff6c0"/>` +
        wheel(30, 90, 11, { rim: "url(#cr)", spokes: 6 }) + wheel(98, 90, 11, { rim: "url(#cr)", spokes: 6 }) +
        `<path d="M30 64c10-4 26-6 40-4" stroke="#fff" stroke-width="1.2" fill="none" opacity=".4"/></g>`,
    }),

  "formula-racer": () =>
    frame({
      bg: ["#3a3a46", "#14141a", "#040406"],
      light: "50% 30%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#ff3a2a"], [1, "#7a0a04"]) +
        L("hm", 0, 0, 0, 1, [0, "#fff36a"], [1, "#d89a0a"]) +
        L("wg", 0, 0, 0, 1, [0, "#2a2d34"], [1, "#0a0b0e"]),
      fx:
        `<path d="M0 100l128 0v28H0Z" fill="#18181e"/>` +
        `<path d="M0 100h128" stroke="#fff" stroke-width="1" opacity=".3"/>` +
        `<g>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${i * 16} 120h16l-4 8H${i * 16 - 4}Z" fill="${i % 2 ? "#fff" : "#e8141a"}"/>`).join("")}</g>` +
        `<g fill="#ffe07a" opacity=".9">${[14, 30, 46, 82, 98, 114].map((x) => `<circle cx="${x}" cy="18" r="3"/>`).join("")}</g>` +
        `<g fill="#ffe07a" opacity=".25" filter="url(#soft)">${[14, 46, 98].map((x) => `<circle cx="${x}" cy="18" r="8"/>`).join("")}</g>`,
      body:
        `<ellipse cx="64" cy="104" rx="54" ry="4" fill="#000" opacity=".6"/>` +
        // tyres
        `<rect x="6" y="66" width="22" height="38" rx="6" fill="#0b0c0f"/><rect x="100" y="66" width="22" height="38" rx="6" fill="#0b0c0f"/>` +
        `<path d="M8 72h18M8 98h18M102 72h18M102 98h18" stroke="#ff3a2a" stroke-width="2"/>` +
        // sidepods & body
        `<path d="M30 86c0-10 8-16 18-18l4-14h24l4 14c10 2 18 8 18 18v6H30Z" fill="url(#bd)"/>` +
        `<path d="M36 84h14l2 6H36ZM92 84H78l-2 6h16Z" fill="#100" opacity=".8"/>` +
        // airbox + rear wing
        `<path d="M54 54c0-14 4-20 10-20s10 6 10 20Z" fill="url(#bd)"/>` +
        `<path d="M60 42h8v6h-8Z" fill="#0a0b0e"/>` +
        `<path d="M34 26h60v6H34Z" fill="url(#wg)"/><path d="M34 26v12M94 26v12" stroke="#0a0b0e" stroke-width="3"/>` +
        // halo + helmet
        `<circle cx="64" cy="62" r="7" fill="url(#hm)"/><path d="M58 62h12v4H58Z" fill="#0a1a3a"/>` +
        `<path d="M50 70c0-10 6-14 14-14s14 4 14 14" stroke="#1a1c22" stroke-width="3.4" fill="none"/><path d="M64 56v14" stroke="#1a1c22" stroke-width="3"/>` +
        // nose + front wing
        `<path d="M56 86h16l-2 16h-12Z" fill="url(#bd)"/>` +
        `<path d="M14 104h100l4 6H10Z" fill="url(#wg)"/><path d="M14 104h100" stroke="#ff3a2a" stroke-width="1.6"/>` +
        `<path d="M10 104v8M118 104v8" stroke="#ff3a2a" stroke-width="3"/>` +
        `<path d="M40 72c6-3 10-4 14-4" stroke="#fff" stroke-width="1.4" opacity=".55" fill="none"/>`,
    }),

  "rally-legend": () =>
    frame({
      bg: ["#9ac25a", "#2a4a1a", "#060c03"],
      light: "60% 30%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#2a7aff"], [0.55, "#0a3aa0"], [1, "#04102a"]) +
        L("gl", 0, 0, 1, 1, [0, "#6a8aa8"], [1, "#0a121a"]),
      fx:
        `<g fill="#0e2210">${[6, 22, 40, 92, 108, 122].map((x, i) => `<path d="M${x} ${78 - (i % 2) * 8}l-10 22h20Z"/><path d="M${x} ${66 - (i % 2) * 8}l-8 18h16Z"/>`).join("")}</g>` +
        `<path d="M0 104c30-8 70-10 128-2v26H0Z" fill="#6a4a22"/>` +
        smoke(23, { n: 12, x0: 0, x1: 50, y0: 88, y1: 116, color: "#b08a5a", op: 0.7, rMin: 4, rMax: 10 }) +
        embers(27, { color: "#5a3a18", n: 22, yMin: 80, yMax: 120 }),
      body:
        `<g transform="translate(64 78) scale(1.15) rotate(-10) translate(-64 -78)">` +
        `<path d="M22 84l2-12 14-4 10-12c2-2 5-3 8-3h22c4 0 7 2 9 4l10 11 12 2c3 1 5 3 5 6v8Z" fill="url(#bd)"/>` +
        `<path d="M50 58l-8 10h22V56h-10c-1 0-3 1-4 2ZM68 56v12h22l-8-9c-1-2-3-3-5-3Z" fill="url(#gl)"/>` +
        `<path d="M24 80h90" stroke="#fff" stroke-width="2.6"/><path d="M24 76h90" stroke="#ffd21a" stroke-width="1.6"/>` +
        `<circle cx="66" cy="78" r="5.5" fill="#fff"/><path d="M64 75h4l-3 6" stroke="#0a3aa0" stroke-width="1.6" fill="none"/>` +
        `<rect x="58" y="52" width="16" height="4" rx="1" fill="#1a1d22"/><circle cx="62" cy="54" r="1.4" fill="#fff6c0"/><circle cx="70" cy="54" r="1.4" fill="#fff6c0"/>` +
        `<path d="M20 68h10v3H20Z" fill="#1a1d22"/>` +
        `<path d="M112 76h4v4h-4Z" fill="#fff6c0"/>` +
        wheel(40, 86, 10, { rim: "#e8ecf0", spokes: 6 }) + wheel(98, 86, 10, { rim: "#e8ecf0", spokes: 6 }) +
        `</g>`,
    }),

  "monster-truck": () =>
    frame({
      bg: ["#6a8aa0", "#1a2632", "#04070a"],
      light: "50% 20%",
      defs:
        L("bd", 0, 0, 0, 1, [0, "#b4ff3a"], [0.55, "#4a9a0a"], [1, "#163a02"]) +
        L("gl", 0, 0, 1, 1, [0, "#4a6a7a"], [1, "#0a141a"]),
      fx:
        `<g fill="#fff" opacity=".9"><circle cx="16" cy="14" r="3"/><circle cx="26" cy="14" r="3"/><circle cx="102" cy="14" r="3"/><circle cx="112" cy="14" r="3"/></g>` +
        `<path d="M21 14L0 60h50ZM107 14l-29 46h50Z" fill="#fff" opacity=".06"/>` +
        `<path d="M0 108h128v20H0Z" fill="#3a2614"/>` +
        embers(37, { color: "#5a3a1a", n: 24, yMin: 70, yMax: 112, op: 1 }),
      body:
        // suspension
        `<path d="M34 84l10-18M94 84l-10-18" stroke="#c9d2da" stroke-width="3"/>` +
        `<path d="M40 84l6-14M88 84l-6-14" stroke="#ff7a1a" stroke-width="4"/>` +
        // tyres w/ tread
        [34, 94]
          .map(
            (x) =>
              `<circle cx="${x}" cy="94" r="22" fill="#0b0c0e"/>` +
              `<g stroke="#2a2d32" stroke-width="3">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => { const a = (k / 12) * Math.PI * 2; return `<path d="M${(x + Math.cos(a) * 17).toFixed(1)} ${(94 + Math.sin(a) * 17).toFixed(1)}L${(x + Math.cos(a) * 22).toFixed(1)} ${(94 + Math.sin(a) * 22).toFixed(1)}"/>`; }).join("")}</g>` +
              `<circle cx="${x}" cy="94" r="11" fill="#c9d2da"/><circle cx="${x}" cy="94" r="7" fill="#3a3f46"/><circle cx="${x}" cy="94" r="2.4" fill="#c9d2da"/>`,
          )
          .join("") +
        // body
        `<path d="M14 66v-8c0-3 2-5 5-5h22l10-12c2-2 4-3 7-3h18c3 0 5 2 6 4l6 11h20c3 0 6 3 6 6v7Z" fill="url(#bd)"/>` +
        `<path d="M54 44l-8 10h16V42h-4c-2 0-3 1-4 2ZM66 42v12h16l-5-9c-1-2-2-3-4-3Z" fill="url(#gl)"/>` +
        `<path d="M14 60h100" stroke="#0a1a02" stroke-width="1.4"/>` +
        `<path d="M20 58c8-2 14 4 22 0s12-6 20 0" stroke="#163a02" stroke-width="2.4" fill="none"/>` +
        `<rect x="56" y="36" width="16" height="4" rx="1" fill="#1a1d22"/><g fill="#fff6c0"><circle cx="60" cy="38" r="1.3"/><circle cx="64" cy="38" r="1.3"/><circle cx="68" cy="38" r="1.3"/></g>` +
        `<rect x="110" y="56" width="6" height="4" fill="#fff6c0"/>` +
        `<path d="M24 50c10-2 20-2 26-2" stroke="#e6ffb0" stroke-width="1.2" opacity=".6"/>`,
    }),

  "retrowave-coupe": () =>
    frame({
      bg: ["#ff4ab0", "#4a0a6a", "#0a0216"],
      light: "50% 45%",
      defs:
        L("sun", 0, 0, 0, 1, [0, "#ffe94a"], [0.5, "#ff7a3a"], [1, "#ff2a8a"]) +
        L("bd", 0, 0, 0, 1, [0, "#2a1a4a"], [1, "#07040e"]) +
        L("tl", 0, 0, 1, 0, [0, "#ff2a4a"], [0.5, "#ff9aa8"], [1, "#ff2a4a"]),
      fx:
        `<circle cx="64" cy="58" r="34" fill="url(#sun)"/>` +
        `<g fill="#4a0a6a">${[62, 70, 77, 83, 88].map((y, i) => `<rect x="20" y="${y}" width="88" height="${1.6 + i * 0.8}"/>`).join("")}</g>` +
        `<path d="M0 86l20-14 14 8 20-16 18 14 22-18 16 12 18-8v22Z" fill="#1a0430"/>` +
        `<path d="M0 86h128v42H0Z" fill="#0d0220"/>` +
        grid("#ff4ad8", { horizon: 86, op: 0.6 }),
      body:
        `<ellipse cx="64" cy="114" rx="48" ry="5" fill="#ff2ad8" opacity=".35" filter="url(#glow)"/>` +
        `<rect x="22" y="98" width="14" height="16" rx="3" fill="#050208"/><rect x="92" y="98" width="14" height="16" rx="3" fill="#050208"/>` +
        `<path d="M18 108V94c0-4 2-6 6-8l8-14c2-4 6-6 10-6h44c4 0 8 2 10 6l8 14c4 2 6 4 6 8v14Z" fill="url(#bd)"/>` +
        `<path d="M38 82l6-10c1-2 3-3 5-3h30c2 0 4 1 5 3l6 10Z" fill="#3a1a6a"/>` +
        `<path d="M44 74h40" stroke="#ff8ad8" stroke-width="1" opacity=".6"/>` +
        `<rect x="20" y="88" width="88" height="6" rx="2" fill="url(#tl)"/>` +
        `<rect x="20" y="88" width="88" height="6" rx="2" fill="#ff2a4a" opacity=".6" filter="url(#glow)"/>` +
        `<rect x="54" y="98" width="20" height="5" rx="1" fill="#e8e4f0"/>` +
        `<path d="M24 82c12-2 26-2 40-2s28 0 40 2" stroke="#ff6ae0" stroke-width="1" fill="none" opacity=".8"/>` +
        `<path d="M22 104h84" stroke="#ff4ad8" stroke-width="1" opacity=".5"/>`,
    }),

  "superbike-rider": () =>
    frame({
      bg: ["#1ac8a0", "#063a32", "#010a08"],
      light: "60% 40%",
      defs:
        L("fr", 0, 0, 1, 1, [0, "#ffffff"], [0.4, "#18e0a8"], [1, "#04503a"]) +
        L("rd", 0, 0, 0, 1, [0, "#2a2d34"], [1, "#0a0b0e"]) +
        L("hm", 0, 0, 1, 1, [0, "#ffffff"], [1, "#9aa6b0"]) +
        L("vs", 0, 0, 1, 0, [0, "#ff7a1a"], [1, "#a01a4a"]),
      fx: speed(19, { color: "#b8fff0", op: 0.45, n: 18 }) + `<path d="M0 108c40-8 80-10 128-6v26H0Z" fill="#04140f"/>`,
      body:
        `<g transform="translate(64 92) scale(1.05) rotate(-12) translate(-64 -86)">` +
        wheel(30, 94, 14, { rim: "#3a3f46", tyre: "#050607", hub: "#101215", spokes: 3 }) +
        wheel(98, 94, 14, { rim: "#3a3f46", tyre: "#050607", hub: "#101215", spokes: 3 }) +
        `<path d="M30 94l20-24M98 94l-8-30" stroke="#8a929a" stroke-width="3"/>` +
        // fairing
        `<path d="M40 82l8-16 22-6 20 2 14 6-6 12-16 6H50Z" fill="url(#fr)"/>` +
        `<path d="M90 62l14 6-4 4-14-4Z" fill="#1a3a5a" opacity=".8"/>` +
        `<path d="M54 80l30-4" stroke="#04503a" stroke-width="2"/><path d="M58 74h14" stroke="#fff" stroke-width="1.4" opacity=".8"/>` +
        // rider tucked
        `<path d="M44 66c4-10 14-14 26-14l12 2-4 8-20 2-6 10Z" fill="url(#rd)"/>` +
        `<path d="M60 66l-8 18h6l8-14Z" fill="url(#rd)"/>` +
        `<path d="M76 54l14 6" stroke="#2a2d34" stroke-width="5" stroke-linecap="round"/>` +
        `<circle cx="84" cy="48" r="9" fill="url(#hm)"/>` +
        `<path d="M84 44h8c1 2 1 5 0 7h-6Z" fill="url(#vs)"/>` +
        `<path d="M76 46c2-4 6-6 10-6" stroke="#18e0a8" stroke-width="2" fill="none"/>` +
        `</g>` +
        `<path d="M6 122l20-6" stroke="#ff7a1a" stroke-width="2" opacity=".6"/>`,
    }),

  "dune-buggy": () =>
    frame({
      bg: ["#ffd38a", "#d0782a", "#3a1404"],
      light: "70% 25%",
      defs:
        L("sd", 0, 0, 0, 1, [0, "#f0b46a"], [1, "#9a5a1a"]) +
        L("tb", 0, 0, 0, 1, [0, "#ff5a2a"], [1, "#a01a04"]),
      fx:
        `<circle cx="98" cy="28" r="14" fill="#fff4d0" opacity=".9"/>` +
        `<path d="M0 82c24-12 50-14 70-6s40 6 58-4v56H0Z" fill="#c07a34"/>` +
        `<path d="M0 100c30-10 70-8 128 0v28H0Z" fill="url(#sd)"/>` +
        smoke(29, { n: 12, x0: -4, x1: 40, y0: 76, y1: 106, color: "#f6c88a", op: 0.65, rMin: 5, rMax: 12 }),
      body:
        `<ellipse cx="66" cy="104" rx="44" ry="4" fill="#5a2a08" opacity=".5"/>` +
        // chassis + cage
        `<path d="M26 88h70l12-10H86L74 60H50L40 78H24Z" fill="none" stroke="url(#tb)" stroke-width="3.2" stroke-linejoin="round"/>` +
        `<path d="M50 60l-4 18M74 60l4 18M40 78h46M60 60v18" stroke="url(#tb)" stroke-width="2.4"/>` +
        `<path d="M62 64c0-4 2-6 6-6s6 2 6 6v6H62Z" fill="#2a2d34"/><circle cx="68" cy="60" r="5" fill="#ffffff"/><path d="M66 58h6v3h-6Z" fill="#1a3a5a"/>` +
        `<rect x="22" y="72" width="10" height="10" rx="2" fill="#3a3f46"/><path d="M24 76h6" stroke="#8a929a"/>` +
        `<path d="M96 82l14-2" stroke="#3a3f46" stroke-width="3"/>` +
        `<rect x="102" y="74" width="8" height="5" rx="1" fill="#fff6c0"/>` +
        wheel(34, 92, 15, { rim: "#e8ecf0", spokes: 5 }) + wheel(98, 96, 11, { rim: "#e8ecf0", spokes: 5 }),
    }),

  "racing-helmet": () =>
    frame({
      bg: ["#5a5a66", "#1c1c24", "#050508"],
      defs:
        L("hm", 0, 0, 1, 1, [0, "#ffffff"], [0.5, "#dfe4ea"], [1, "#7a828a"]) +
        L("vs", 0, 0, 1, 1, [0, "#4af0ff"], [0.4, "#3a4aff"], [0.75, "#a01ad8"], [1, "#1a0a3a"]) +
        L("st", 0, 0, 1, 0, [0, "#ff2a3a"], [1, "#ff8a1a"]),
      fx:
        `<g opacity=".16" transform="rotate(-12 64 64)">${Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ((r + c) % 2 ? `<rect x="${c * 18 - 8}" y="${r * 18 - 8}" width="18" height="18" fill="#fff"/>` : "")).join("")).join("")}</g>`,
      body:
        `<path d="M18 92c0-38 22-62 52-62 24 0 40 18 40 44 0 14-4 26-10 34H34c-10 0-16-6-16-16Z" fill="url(#hm)"/>` +
        // livery stripes
        `<path d="M40 38c14-8 34-10 52-2l-2 8c-16-6-34-6-48 2Z" fill="url(#st)"/>` +
        `<path d="M22 84c20-4 48-4 82 0l-2 8c-32-4-58-4-80 0Z" fill="url(#st)"/>` +
        // visor
        `<path d="M26 70c0-12 10-20 24-20h44c6 0 10 4 10 10v8c0 6-4 10-10 10H34c-4 0-8-4-8-8Z" fill="#0a0a12"/>` +
        `<path d="M30 70c0-10 8-16 20-16h42c5 0 8 3 8 8v4c0 5-3 8-8 8H36c-3 0-6-2-6-4Z" fill="url(#vs)"/>` +
        `<path d="M38 58c10-2 30-2 50-1" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/>` +
        `<path d="M46 66l14-6M54 70l22-10" stroke="#fff" stroke-width="1" opacity=".35"/>` +
        `<circle cx="28" cy="70" r="3" fill="#c9d2da" stroke="#5a626a"/>` +
        `<path d="M34 104h60c-2 6-6 10-12 10H44c-6 0-10-4-10-10Z" fill="#1a1d22"/>` +
        `<path d="M44 108h40" stroke="#ff2a3a" stroke-width="1.4"/>` +
        `<path d="M50 36c8-3 16-4 24-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>`,
    }),
};
