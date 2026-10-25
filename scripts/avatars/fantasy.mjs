import { L, R, RU, rays, stars, embers, rain, codeRain, frame, mirror } from "./lib.mjs";

export default {
  /* ------------------------------ Animals & Fantasy ----------------------------- */

  "fire-dragon": () =>
    frame({
      bg: ["#c2300a", "#3a0802", "#0a0100"],
      light: "35% 55%",
      defs:
        L("sc", 0, 0, 1, 1, [0, "#e83a1a"], [0.5, "#8a0e06"], [1, "#2a0302"]) +
        L("bl", 0, 0, 0, 1, [0, "#ffb05a"], [1, "#c25a1a"]) +
        L("hn", 1, 0, 0, 1, [0, "#3a2a20"], [1, "#f2e2c4"]) +
        L("fr", 1, 0, 0, 0, [0, "#fff6b0"], [0.3, "#ffb21a"], [0.7, "#ff4a0a"], [1, "#ff2a0a", 0]),
      fx: embers(131, { color: "#ffc04a", n: 24 }),
      body:
        // fire breath
        `<path d="M30 66C20 54 8 50-4 52c6 4 8 8 6 10-6-2-10 0-12 4 10 0 14 4 12 8-4 0-8 4-8 8 10-4 18-4 24-2 8-4 10-10 12-14Z" fill="url(#fr)"/>` +
        `<path d="M30 66c-8-4-18-6-26-2 8 2 10 6 8 8 6 0 10 2 12 6 4-4 6-8 6-12Z" fill="#fff6b0" opacity=".85"/>` +
        // neck
        `<path d="M86 74c10 20 14 36 12 54h30V66c-8-10-22-12-30-8Z" fill="url(#sc)"/>` +
        `<g stroke="#ff7a3a" stroke-width="1.2" fill="none" opacity=".5"><path d="M96 84c6-2 12-2 18 0M98 96c6-2 12-2 18 0M100 108c6-2 12-2 18 0M100 120c6-2 12-2 18 0"/></g>` +
        `<path d="M88 76c6 16 10 32 8 52" stroke="url(#bl)" stroke-width="6" fill="none"/>` +
        // horns
        `<path d="M92 38c10-12 20-20 32-24-6 8-12 18-22 30Z" fill="url(#hn)"/>` +
        `<path d="M100 48c10-6 18-8 26-6-6 4-12 8-22 14Z" fill="url(#hn)"/>` +
        // spikes along head
        `<path d="M70 36l2-10 6 8 4-12 6 10 4-8 2 12Z" fill="#5a0a04"/>` +
        // upper head
        `<path d="M96 34c-12-4-30 0-44 10l-26 8c-6 2-6 8 0 10h22l14 4c12 4 28 6 38 14l8-16c2-14-2-24-12-30Z" fill="url(#sc)"/>` +
        `<path d="M54 46c12-6 26-8 38-6" stroke="#ff8a5a" stroke-width="1.6" fill="none" opacity=".6"/>` +
        // jaw
        `<path d="M48 70l-18 6c-4 2-2 8 4 8l26-2c16 2 32 8 40 10V80c-10-6-28-10-52-10Z" fill="url(#sc)"/>` +
        `<path d="M48 70l-18 6 0 0c10 0 20-1 30-2 12 0 26 2 40 6-10-6-28-10-52-10Z" fill="url(#bl)" opacity=".5"/>` +
        // mouth
        `<path d="M26 62h22l14 4 10 4H48l-18 6c-4-4-6-10-4-14Z" fill="#2a0200"/>` +
        `<path d="M30 62l2 4 2-4M38 62l2 5 2-5M46 62l1.5 4 1.5-4M34 75l2-4 2 4M42 73l2-4 2 4" fill="#fff6e0"/>` +
        `<circle cx="28" cy="55" r="1.6" fill="#1a0200"/>` +
        // eye
        `<path d="M74 46c4-4 10-4 14 0-4 4-10 4-14 0Z" fill="#ffe04a"/><path d="M74 46c4-4 10-4 14 0-4 4-10 4-14 0Z" fill="#ffd21a" opacity=".6" filter="url(#glow)"/>` +
        `<path d="M81 43v6" stroke="#1a0200" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M70 42l20-2" stroke="#2a0302" stroke-width="2.4" stroke-linecap="round"/>`,
    }),

  "alpha-wolf": () =>
    frame({
      bg: ["#4a6aa8", "#121e3a", "#02050c"],
      light: "50% 30%",
      defs:
        L("fur", 0, 0, 0, 1, [0, "#8a9aae"], [0.6, "#4a566a"], [1, "#1a2230"]) +
        L("mz", 0, 0, 0, 1, [0, "#e6ecf2"], [1, "#9aa6b4"]) +
        R("moon", 0.4, 0.4, 0.6, [0, "#ffffff"], [1, "#cfdcf0"]),
      fx:
        `<circle cx="64" cy="44" r="38" fill="url(#moon)" opacity=".92"/>` +
        `<g fill="#b4c4dc" opacity=".55"><circle cx="50" cy="34" r="5"/><circle cx="78" cy="52" r="3.5"/><circle cx="70" cy="24" r="2.5"/></g>` +
        stars(141, { n: 16, color: "#e6eeff", maxR: 1 }) +
        `<path d="M0 110l12-16 10 8 12-20 12 18 10-6 10 14h24l10-14 10 6 12-18 12 20 10-8v34H0Z" fill="#050a14"/>`,
      body:
        `<path d="M30 30l16 18c6-4 12-6 18-6s12 2 18 6l16-18v30c6 10 2 22-6 28l-14 16c-8 8-20 8-28 0L36 88c-8-6-12-18-6-28Z" fill="url(#fur)"/>` +
        `<path d="M34 38l10 12-8 4ZM94 38l-10 12 8 4Z" fill="#c8a0a8" opacity=".6"/>` +
        // cheek tufts
        `<path d="M30 64l-8 10 10-2-6 10 10-4M98 64l8 10-10-2 6 10-10-4" fill="#6a788c"/>` +
        `<path d="M58 46l6 18 6-18" fill="#2a3242"/>` +
        // muzzle
        `<path d="M50 74c4-8 24-8 28 0l-2 18c-4 8-20 8-24 0Z" fill="url(#mz)"/>` +
        `<path d="M58 86c2-3 10-3 12 0-1 4-11 4-12 0Z" fill="#0a0e14"/><path d="M60 85l3-1" stroke="#fff" stroke-width="1" stroke-linecap="round"/>` +
        `<path d="M64 89v4M58 96c3 2 9 2 12 0" stroke="#2a3242" stroke-width="1.4" fill="none"/>` +
        // eyes
        `<path d="M44 64l14 2c-2 4-8 6-12 2Z" fill="#ffd21a"/><path d="M84 64l-14 2c2 4 8 6 12 2Z" fill="#ffd21a"/>` +
        `<path d="M44 64l14 2c-2 4-8 6-12 2ZM84 64l-14 2c2 4 8 6 12 2Z" fill="#ffd21a" opacity=".5" filter="url(#glow)"/>` +
        `<circle cx="52" cy="66.6" r="1.6" fill="#0a0e14"/><circle cx="76" cy="66.6" r="1.6" fill="#0a0e14"/>` +
        `<path d="M42 60l16 4M86 60l-16 4" stroke="#1a2230" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M40 42c6 2 10 6 12 10M88 42c-6 2-10 6-12 10" stroke="#c8d4e2" stroke-width="1.2" fill="none" opacity=".6"/>`,
    }),

  "rising-phoenix": () => {
    const wing =
      `<path d="M58 66C44 58 26 42 10 18c2 10 2 16 0 20 6 0 10 4 10 8-6 0-10 4-10 8 8-2 12 0 14 4-6 2-8 6-8 10 8-4 14-4 18 0-4 2-6 6-6 10 8-4 16-4 22 0Z" fill="url(#wg)"/>` +
      `<path d="M56 64C44 54 30 40 18 24" stroke="#fff6c0" stroke-width="1.6" fill="none" opacity=".7"/>` +
      `<path d="M54 68C44 62 34 54 26 46" stroke="#fff6c0" stroke-width="1" fill="none" opacity=".5"/>`;
    return frame({
      bg: ["#ff5a1a", "#6a0a2a", "#12010a"],
      light: "50% 55%",
      defs:
        L("wg", 0, 0, 1, 1, [0, "#fff36a"], [0.35, "#ffb21a"], [0.7, "#ff4a0a"], [1, "#b0102a"]) +
        L("bd", 0, 0, 0, 1, [0, "#fff6b0"], [0.5, "#ff9a1a"], [1, "#c2200a"]) +
        L("tl", 0, 0, 0, 1, [0, "#ff7a1a"], [1, "#ff2a3a", 0]),
      fx: rays("#ffd27a", { op: 0.12, cy: 60, n: 16 }) + embers(151, { color: "#ffe07a", n: 26 }),
      body:
        `<circle cx="64" cy="62" r="26" fill="#ffb21a" opacity=".5" filter="url(#soft)"/>` +
        wing + mirror(wing) +
        // tail flames
        `<path d="M56 84c-10 14-14 28-10 44 2-10 6-16 10-18-2 8 0 14 4 18 0-8 2-14 4-16 2 4 4 10 4 16 4-4 6-10 4-18 4 2 8 8 10 18 4-16 0-30-10-44Z" fill="url(#tl)"/>` +
        // body
        `<path d="M54 54c0-10 4-18 10-18s10 8 10 18c0 14-4 30-10 34-6-4-10-20-10-34Z" fill="url(#bd)"/>` +
        // head
        `<path d="M58 34c0-6 3-10 6-10s6 4 6 10c0 4-3 6-6 6s-6-2-6-6Z" fill="url(#bd)"/>` +
        `<path d="M64 26l-2 8h4Z" fill="#fff"/>` +
        `<path d="M64 36l-3 6 3-1 3 1Z" fill="#ffe04a" stroke="#a0300a" stroke-width=".6"/>` +
        `<path d="M58 30c1-1 3-1 4 0M66 30c1-1 3-1 4 0" stroke="#3a0208" stroke-width="1.4" stroke-linecap="round"/>` +
        // crest
        `<path d="M64 24c-2-8 0-14 4-18-1 6 0 10 2 12 0-4 2-6 4-8 0 6-2 10-6 14Z" fill="#ffe04a"/>` +
        `<path d="M64 24c-4-6-8-8-12-8 4 2 6 6 6 8Z" fill="#ffb21a"/>`,
    });
  },

  "savage-tiger": () =>
    frame({
      bg: ["#4ab03a", "#123a12", "#020a02"],
      light: "50% 40%",
      defs:
        L("fur", 0, 0, 0, 1, [0, "#ffb24a"], [0.6, "#ff7a0a"], [1, "#a03a02"]) +
        L("wh", 0, 0, 0, 1, [0, "#ffffff"], [1, "#e6dccc"]) +
        R("ey", 0.4, 0.4, 0.6, [0, "#f6ffb0"], [0.6, "#a8d81a"], [1, "#3a5a02"]),
      fx:
        `<g fill="#0a2a0a" opacity=".85"><path d="M0 0c10 20 6 40 18 60L0 80ZM128 0c-10 20-6 40-18 60l18 20Z"/><path d="M0 90c14-6 20 4 30 14L0 128ZM128 90c-14-6-20 4-30 14l30 24Z"/></g>` +
        `<g fill="#2a6a1a" opacity=".6"><ellipse cx="10" cy="40" rx="12" ry="4" transform="rotate(-40 10 40)"/><ellipse cx="118" cy="40" rx="12" ry="4" transform="rotate(40 118 40)"/></g>`,
      body:
        // ears
        `<circle cx="34" cy="34" r="12" fill="url(#fur)"/><circle cx="94" cy="34" r="12" fill="url(#fur)"/>` +
        `<circle cx="34" cy="35" r="7" fill="#1a0a02"/><circle cx="94" cy="35" r="7" fill="#1a0a02"/><circle cx="34" cy="36" r="4" fill="#f6e6d6"/><circle cx="94" cy="36" r="4" fill="#f6e6d6"/>` +
        // head
        `<path d="M22 62c0-24 18-36 42-36s42 12 42 36c0 10-4 18-10 24l-6 12c-8 10-16 14-26 14s-18-4-26-14l-6-12c-6-6-10-14-10-24Z" fill="url(#fur)"/>` +
        // cheeks / muzzle
        `<path d="M22 70c6 10 16 18 30 18l12-6 12 6c14 0 24-8 30-18-2 14-10 26-22 34-6 6-14 8-20 8s-14-2-20-8c-12-8-20-20-22-34Z" fill="url(#wh)"/>` +
        `<path d="M48 44c4-4 10-6 16-6s12 2 16 6c-6 2-10 6-16 6s-10-4-16-6Z" fill="url(#wh)" opacity=".5"/>` +
        // stripes
        `<g fill="#1a0a02"><path d="M56 30l8 12 8-12-8 4Z"/><path d="M50 38l6 8-10-2ZM78 38l-6 8 10-2Z"/>` +
        `<path d="M24 54l14 4-14 2ZM104 54l-14 4 14 2Z"/><path d="M24 66l12 2-10 4ZM104 66l-12 2 10 4Z"/><path d="M30 44l10 8-12-2ZM98 44l-10 8 12-2Z"/></g>` +
        // eyes
        `<path d="M42 60c4-4 12-4 14 2-4 4-10 4-14-2ZM86 60c-4-4-12-4-14 2 4 4 10 4 14-2Z" fill="url(#ey)"/>` +
        `<path d="M49 58v8M79 58v8" stroke="#0a0a02" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M40 58l16 2M88 58l-16 2" stroke="#1a0a02" stroke-width="2" stroke-linecap="round"/>` +
        // nose + snarl
        `<path d="M56 72c2-4 14-4 16 0l-8 8Z" fill="#c25a6a"/><path d="M64 80v6" stroke="#3a1a0a" stroke-width="1.6"/>` +
        `<path d="M48 88c6 4 10 4 16 0 6 4 10 4 16 0-2 10-8 16-16 16s-14-6-16-16Z" fill="#3a0a0a"/>` +
        `<path d="M52 89l2 7 3-6ZM76 89l-2 7-3-6Z" fill="#fff"/>` +
        `<g fill="#3a1a0a"><circle cx="50" cy="80" r="1"/><circle cx="46" cy="83" r="1"/><circle cx="78" cy="80" r="1"/><circle cx="82" cy="83" r="1"/></g>` +
        `<path d="M44 80l-16-2M44 84l-14 4M84 80l16-2M84 84l14 4" stroke="#fff" stroke-width=".8" opacity=".8"/>`,
    }),

  "deep-kraken": () => {
    const tentacle = (d, w) =>
      `<path d="${d}" stroke="url(#tn)" stroke-width="${w}" fill="none" stroke-linecap="round"/>` +
      `<path d="${d}" stroke="#f2a6c8" stroke-width="${w * 0.28}" fill="none" stroke-linecap="round" stroke-dasharray="1.2 3.4" opacity=".9"/>`;
    return frame({
      bg: ["#0a6a8a", "#04203a", "#01060e"],
      light: "50% 10%",
      defs:
        L("mn", 0, 0, 0, 1, [0, "#c23a8a"], [0.6, "#6a0a4a"], [1, "#2a0220"]) +
        L("tn", 0, 0, 1, 1, [0, "#a01a6a"], [1, "#3a0428"]) +
        R("ey", 0.5, 0.5, 0.5, [0, "#fff6a0"], [0.6, "#ffb21a"], [1, "#a0400a"]),
      fx:
        `<path d="M30 0l-10 128M64 0v128M98 0l14 128" stroke="#7af0ff" stroke-width="10" opacity=".05"/>` +
        `<g fill="none" stroke="#9af0ff" opacity=".5">${[[18, 30, 3], [24, 18, 2], [108, 40, 2.6], [100, 26, 1.6], [30, 92, 2], [112, 86, 2.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>` +
        `<path d="M44 14l6-4 6 4-2 2h-8Z" fill="#020a14" opacity=".9"/><path d="M50 10V4" stroke="#020a14" stroke-width="1"/>`,
      body:
        tentacle("M30 128C28 100 6 92 10 70c3-14 18-12 16-2", 9) +
        tentacle("M98 128c2-28 24-36 20-58-3-14-18-12-16-2", 9) +
        tentacle("M46 128c0-20-14-26-14-42", 7) +
        tentacle("M82 128c0-20 14-26 14-42", 7) +
        // mantle
        `<path d="M34 86c-4-34 10-62 30-62s34 28 30 62c-8 8-20 12-30 12s-22-4-30-12Z" fill="url(#mn)"/>` +
        `<path d="M44 40c6-10 14-14 22-14" stroke="#ff9ad0" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>` +
        `<g fill="#ff9ad0" opacity=".35"><circle cx="50" cy="56" r="2"/><circle cx="76" cy="48" r="2.6"/><circle cx="80" cy="64" r="1.6"/><circle cx="46" cy="72" r="1.6"/></g>` +
        // eye
        `<ellipse cx="64" cy="74" rx="14" ry="10" fill="#1a0212"/>` +
        `<ellipse cx="64" cy="74" rx="12" ry="8.5" fill="url(#ey)"/>` +
        `<ellipse cx="64" cy="74" rx="14" ry="10" fill="#ffb21a" opacity=".35" filter="url(#glow)"/>` +
        `<path d="M58 74h12" stroke="#1a0202" stroke-width="3.4" stroke-linecap="round"/>` +
        `<circle cx="59" cy="70" r="1.8" fill="#fff"/>` +
        `<path d="M48 66c6-4 26-4 32 0" stroke="#2a0220" stroke-width="2" fill="none"/>`,
    });
  },

  /* ------------------------------- Anime & Mystery ------------------------------ */

  "masked-hacker": () =>
    frame({
      bg: ["#0a5a2a", "#03200f", "#010804"],
      light: "50% 80%",
      defs:
        L("hd", 0, 0, 0, 1, [0, "#2a3034"], [1, "#07090a"]) +
        L("mk", 0, 0, 0, 1, [0, "#1a1e22"], [1, "#050607"]) +
        L("lp", 0, 0, 0, 1, [0, "#d6ffe6"], [1, "#3aff8a"]) +
        RU("lit", 64, 120, 50, [0, "#3aff8a", 0.55], [1, "#3aff8a", 0]),
      fx: codeRain(161, { color: "#3dff8c", op: 0.4, cols: 10 }),
      body:
        `<path d="M8 128c4-30 18-44 26-50-4-32 10-56 30-56s34 24 30 56c8 6 22 20 26 50Z" fill="url(#hd)"/>` +
        `<path d="M44 128c0-20 8-32 20-36 12 4 20 16 20 36" fill="#0d1012"/>` +
        `<path d="M54 98v14M74 98v14" stroke="#c8d0d4" stroke-width="1.4" stroke-linecap="round"/><circle cx="54" cy="113" r="1.6" fill="#c8d0d4"/><circle cx="74" cy="113" r="1.6" fill="#c8d0d4"/>` +
        `<path d="M40 70c0-20 10-32 24-32s24 12 24 32c0 16-10 24-24 24s-24-8-24-24Z" fill="#030405"/>` +
        // mask
        `<path d="M44 64c0-14 8-22 20-22s20 8 20 22c0 14-8 24-20 24s-20-10-20-24Z" fill="url(#mk)" stroke="#2a3a32" stroke-width="1"/>` +
        `<g fill="#3aff8a"><rect x="50" y="60" width="9" height="4"/><rect x="69" y="60" width="9" height="4"/>` +
        `<rect x="52" y="74" width="3" height="3"/><rect x="55" y="77" width="3" height="3"/><rect x="58" y="78" width="12" height="3"/><rect x="70" y="77" width="3" height="3"/><rect x="73" y="74" width="3" height="3"/></g>` +
        `<g fill="#3aff8a" opacity=".55" filter="url(#glow)"><rect x="50" y="60" width="9" height="4"/><rect x="69" y="60" width="9" height="4"/><rect x="56" y="77" width="16" height="3"/></g>` +
        `<path d="M44 68h6M78 56h8M42 74h4" stroke="#ff2a8a" stroke-width="1.6" opacity=".8"/>` +
        `<path d="M48 50c4-4 10-6 16-6" stroke="#5a6a62" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        // laptop + light
        `<ellipse cx="64" cy="118" rx="50" ry="20" fill="url(#lit)"/>` +
        `<path d="M34 110h60l6 18H28Z" fill="#14181a"/><path d="M38 112h52l3 8H35Z" fill="url(#lp)" opacity=".9"/>` +
        `<path d="M40 114h20M40 117h30" stroke="#04200e" stroke-width="1"/>`,
    }),

  "kitsune-mask": () =>
    frame({
      bg: ["#ff6a3a", "#6a0a1a", "#14020a"],
      light: "50% 45%",
      defs:
        L("mk", 0, 0, 0, 1, [0, "#ffffff"], [0.7, "#f2ece6"], [1, "#c8bcb0"]) +
        L("rd", 0, 0, 0, 1, [0, "#ff3a2a"], [1, "#b0100a"]) +
        L("gd", 0, 0, 0, 1, [0, "#ffe7a0"], [1, "#c28a1a"]) +
        R("ln", 0.5, 0.4, 0.6, [0, "#fff0b0"], [0.5, "#ff6a1a"], [1, "#a01a0a"]),
      fx:
        [[16, 24], [112, 20], [10, 78], [118, 82]]
          .map(
            ([x, y]) =>
              `<path d="M${x} ${y - 14}v4" stroke="#1a0a0a"/><ellipse cx="${x}" cy="${y}" rx="8" ry="10" fill="url(#ln)"/><ellipse cx="${x}" cy="${y}" rx="12" ry="14" fill="#ff8a2a" opacity=".3" filter="url(#soft)"/>` +
              `<path d="M${x - 8} ${y - 3}h16M${x - 8} ${y + 3}h16" stroke="#a01a0a" stroke-width=".8" opacity=".7"/><rect x="${x - 3}" y="${y + 9}" width="6" height="3" fill="#1a0a0a"/>`,
          )
          .join("") +
        `<path d="M0 40c40 10 88 10 128 0" stroke="#1a0a0a" stroke-width=".8" fill="none" opacity=".6"/>`,
      body:
        // ears
        `<path d="M34 54L28 14l26 22ZM94 54l6-40-26 22Z" fill="url(#mk)"/>` +
        `<path d="M34 46l-3-24 16 14ZM94 46l3-24-16 14Z" fill="url(#rd)"/>` +
        // face
        `<path d="M28 56c0-16 16-24 36-24s36 8 36 24c0 12-8 20-16 28l-14 20c-2 3-4 4-6 4s-4-1-6-4L44 84c-8-8-16-16-16-28Z" fill="url(#mk)" stroke="#a89a8c" stroke-width="1"/>` +
        // markings
        `<path d="M46 40c4 4 6 8 6 12M82 40c-4 4-6 8-6 12" stroke="url(#rd)" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<path d="M64 36v10" stroke="url(#rd)" stroke-width="3.4" stroke-linecap="round"/><circle cx="64" cy="50" r="2.2" fill="url(#rd)"/>` +
        `<path d="M32 64c6 0 10 4 12 8M96 64c-6 0-10 4-12 8" stroke="url(#rd)" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
        // eye holes
        `<path d="M42 60c6-6 14-4 18 2-6 4-12 4-18-2ZM86 60c-6-6-14-4-18 2 6 4 12 4 18-2Z" fill="#14020a"/>` +
        `<path d="M40 56c6-4 14-4 20 2M88 56c-6-4-14-4-20 2" stroke="url(#rd)" stroke-width="1.6" fill="none"/>` +
        `<circle cx="52" cy="61" r="1.2" fill="#ffb21a"/><circle cx="76" cy="61" r="1.2" fill="#ffb21a"/>` +
        // nose + mouth
        `<path d="M60 94c2-2 6-2 8 0l-4 4Z" fill="#14020a"/>` +
        `<path d="M54 86c4 4 6 4 10 0 4 4 6 4 10 0" stroke="url(#rd)" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
        // cord + tassels
        `<path d="M28 58c-8 4-12 14-12 24M100 58c8 4 12 14 12 24" stroke="url(#gd)" stroke-width="2" fill="none"/>` +
        `<path d="M14 82h4l2 14h-8ZM110 82h4l2 14h-8Z" fill="url(#rd)"/><circle cx="16" cy="82" r="2.4" fill="url(#gd)"/><circle cx="112" cy="82" r="2.4" fill="url(#gd)"/>` +
        `<path d="M44 40c4-4 10-6 16-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    }),

  "neon-runner": () =>
    frame({
      bg: ["#ff2ad8", "#2a0a5a", "#05020f"],
      light: "75% 30%",
      defs:
        L("hr", 0, 0, 1, 1, [0, "#ffffff"], [0.5, "#bfe6ff"], [1, "#6a7ad8"]) +
        L("sk", 0, 0, 0, 1, [0, "#ffe2cc"], [1, "#e6a888"]) +
        L("jk", 0, 0, 1, 0, [0, "#1a1a2a"], [1, "#0a0a14"]) +
        L("gg", 0, 0, 1, 0, [0, "#2af0ff"], [1, "#ff2ad8"]) +
        R("iris", 0.5, 0.35, 0.7, [0, "#c8ffff"], [0.5, "#1ac8ff"], [1, "#0a2a8a"]),
      fx:
        `<g opacity=".8"><rect x="4" y="20" width="16" height="70" fill="#14062a"/><rect x="104" y="10" width="20" height="80" fill="#14062a"/><rect x="88" y="40" width="12" height="50" fill="#1a0a3a"/></g>` +
        `<g fill="#2af0ff" opacity=".8"><rect x="8" y="28" width="8" height="2"/><rect x="108" y="20" width="12" height="2"/><rect x="108" y="30" width="8" height="2"/></g>` +
        `<g fill="#ff2ad8" opacity=".8"><rect x="8" y="40" width="6" height="2"/><rect x="90" y="48" width="8" height="2"/><rect x="110" y="44" width="10" height="2"/></g>` +
        rain(171, { n: 26, color: "#ff9af0", op: 0.3 }),
      body:
        `<path d="M14 128c4-20 20-30 50-30s46 10 50 30Z" fill="url(#jk)"/>` +
        `<path d="M36 128l6-30 22 12 22-12 6 30" fill="none" stroke="#2af0ff" stroke-width="2"/>` +
        `<path d="M40 100c8-6 16-8 24-8s16 2 24 8l-6 10-18-8-18 8Z" fill="#ff2ad8"/>` +
        `<path d="M56 84h16v14l-8 4-8-4Z" fill="#e6a888"/>` +
        // face
        `<path d="M42 58c0-16 10-24 22-24s22 8 22 24c0 14-6 22-12 28l-10 6-10-6c-6-6-12-14-12-28Z" fill="url(#sk)"/>` +
        // big anime eyes
        `<path d="M46 64c2-6 12-6 14 0v4c-2 4-12 4-14 0Z" fill="#fff"/><path d="M68 64c2-6 12-6 14 0v4c-2 4-12 4-14 0Z" fill="#fff"/>` +
        `<ellipse cx="54" cy="66" rx="4.4" ry="5" fill="url(#iris)"/><ellipse cx="74" cy="66" rx="4.4" ry="5" fill="url(#iris)"/>` +
        `<circle cx="54" cy="66.6" r="2" fill="#0a0a2a"/><circle cx="74" cy="66.6" r="2" fill="#0a0a2a"/>` +
        `<circle cx="52.6" cy="64" r="1.4" fill="#fff"/><circle cx="72.6" cy="64" r="1.4" fill="#fff"/>` +
        `<path d="M45 62c4-4 12-4 16 0M67 62c4-4 12-4 16 0" stroke="#1a1a2a" stroke-width="2" fill="none" stroke-linecap="round"/>` +
        `<path d="M62 74l2 4h-3" stroke="#c88a6a" stroke-width="1" fill="none"/>` +
        `<path d="M59 82q5 2 10 0" stroke="#a04a4a" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        `<path d="M48 76l4-1M76 75l4 1" stroke="#ff8aa8" stroke-width="1.6" opacity=".7" stroke-linecap="round"/>` +
        // spiky hair
        `<path d="M38 64c-6-14-4-30 6-40-2 6-2 10 0 12 2-10 10-18 20-20-2 4-2 8 0 10 4-8 12-12 22-12-4 4-6 8-6 12 6-4 12-4 18-2-6 2-8 6-8 10 4 0 8 2 10 6-6 0-8 2-8 6 2 6 2 12 0 18-2-8-6-14-12-16-2 4-6 6-10 6 0-4-2-6-4-8-4 4-10 6-16 6 2-4 2-6 0-8-4 4-8 10-12 20Z" fill="url(#hr)"/>` +
        `<path d="M50 30c6-6 14-8 22-8" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8"/>` +
        // goggles on forehead
        `<path d="M40 46c8-6 40-6 48 0l-2 6c-8-4-36-4-44 0Z" fill="#1a1a2a"/>` +
        `<rect x="46" y="42" width="14" height="7" rx="3.5" fill="url(#gg)"/><rect x="68" y="42" width="14" height="7" rx="3.5" fill="url(#gg)"/>` +
        `<rect x="46" y="42" width="36" height="7" rx="3.5" fill="#2af0ff" opacity=".3" filter="url(#glow)"/>`,
    }),

  "masked-phantom": () =>
    frame({
      bg: ["#8a1a4a", "#2a0618", "#080105"],
      light: "50% 20%",
      defs:
        L("mk", 0, 0, 1, 1, [0, "#ffffff"], [0.6, "#ece6f0"], [1, "#a69ab4"]) +
        L("gd", 0, 0, 1, 1, [0, "#fff2b0"], [0.5, "#e2a82a"], [1, "#7a4a0a"]) +
        L("cl", 0, 0, 0, 1, [0, "#1a1020"], [1, "#050208"]) +
        L("cu", 0, 0, 1, 0, [0, "#5a0a2a"], [0.5, "#b01a4a"], [1, "#5a0a2a"]) +
        L("spot", 0, 0, 0, 1, [0, "#fff6e0", 0.35], [1, "#fff6e0", 0]),
      fx:
        `<g>${[0, 1, 2, 3].map((i) => `<path d="M${i * 10 - 4} 0h12c-2 40 2 90-4 128H${i * 10 - 4}Z" fill="url(#cu)" opacity=".8"/>`).join("")}${[0, 1, 2, 3].map((i) => `<path d="M${132 - i * 10} 0h-12c2 40-2 90 4 128h8Z" fill="url(#cu)" opacity=".8"/>`).join("")}</g>` +
        `<path d="M44 0h40l28 128H16Z" fill="url(#spot)"/>`,
      body:
        `<path d="M10 128c2-28 18-44 28-50-4-30 8-54 26-54s30 24 26 54c10 6 26 22 28 50Z" fill="url(#cl)"/>` +
        `<path d="M38 78c-4-30 8-54 26-54s30 24 26 54" stroke="#3a2040" stroke-width="2" fill="none"/>` +
        `<path d="M54 98l10 30 10-30" fill="none" stroke="#a01a4a" stroke-width="2"/>` +
        // mask
        `<path d="M42 58c0-16 10-26 22-26s22 10 22 26c0 16-8 30-22 34-14-4-22-18-22-34Z" fill="url(#mk)"/>` +
        `<path d="M46 50c4-10 10-14 18-14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>` +
        // filigree
        `<g stroke="url(#gd)" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M64 38c-4 4-4 8 0 10 4-2 4-6 0-10Z"/><path d="M48 54c-2-4 0-8 4-8M80 54c2-4 0-8-4-8"/><path d="M74 70c6 0 10 4 8 8"/></g>` +
        // eyes
        `<path d="M48 60c4-5 10-5 13 0-3 4-9 4-13 0Z" fill="#0a0206"/>` +
        `<path d="M67 60c4-5 10-5 13 0-3 4-9 4-13 0Z" fill="#0a0206"/>` +
        `<circle cx="74" cy="60" r="1.8" fill="#ff3a7a" filter="url(#glow)"/><circle cx="74" cy="60" r="1" fill="#ffd0e0"/>` +
        `<path d="M46 56c4-3 10-3 15 1M67 57c5-4 11-4 15-1" stroke="url(#gd)" stroke-width="1.2" fill="none"/>` +
        // tear
        `<path d="M54 66c0 2-2 4-2 6a2 2 0 0 0 4 0c0-2-2-4-2-6Z" fill="#3a6aff"/>` +
        `<path d="M58 82q6 3 12 0" stroke="#7a6a8a" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        `<path d="M64 74v4" stroke="#b4aac0" stroke-width="1.2"/>` +
        // rose
        `<path d="M88 112l10-14" stroke="#2a5a1a" stroke-width="2"/><path d="M92 106c-4-2-6 0-6 2 4 1 6 0 6-2Z" fill="#3a8a2a"/>` +
        `<circle cx="100" cy="96" r="6" fill="#c2102a"/><path d="M97 95c2-2 5-2 6 1-2 2-4 2-6-1Z" fill="#7a0414"/><path d="M96 98c2 2 6 2 8-1" stroke="#ff5a6a" stroke-width=".8" fill="none"/>`,
    }),

  "noir-detective": () =>
    frame({
      bg: ["#b8a07a", "#3a3024", "#0a0806"],
      light: "70% 25%",
      defs:
        L("ht", 0, 0, 0, 1, [0, "#4a4038"], [1, "#14100c"]) +
        L("ct", 0, 0, 1, 1, [0, "#8a7a5a"], [1, "#2a2418"]) +
        L("sk", 0, 0, 1, 0, [0, "#4a3426"], [1, "#c8a07a"]) +
        L("bl", 0, 0, 0, 1, [0, "#fff2d0", 0.35], [1, "#fff2d0", 0]),
      fx:
        `<g transform="rotate(-18 64 64)" opacity=".7">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="-20" y="${i * 18 - 6}" width="170" height="8" fill="#0a0806" opacity=".55"/>`).join("")}</g>` +
        `<path d="M86 0h12l30 50v20Z" fill="url(#bl)"/>` +
        rain(181, { n: 34, color: "#e6dcc8", op: 0.35, slant: -3 }),
      body:
        `<path d="M8 128c4-26 20-38 34-42l22 14 22-14c14 4 30 16 34 42Z" fill="url(#ct)"/>` +
        // turned-up collar
        `<path d="M42 86l-8-20 18 16 12 18ZM86 86l8-20-18 16-12 18Z" fill="#6a5a40"/>` +
        `<path d="M42 86l-8-20 18 16M86 86l8-20-18 16" stroke="#2a2418" stroke-width="1" fill="none"/>` +
        `<path d="M56 96l8 32 8-32-8 4Z" fill="#a01a1a"/><path d="M58 94h12l-6 6Z" fill="#7a1010"/>` +
        `<path d="M50 104l-2 24M78 104l2 24" stroke="#2a2418" stroke-width="1.2"/>` +
        // face, half lit
        `<path d="M46 62c0-12 8-20 18-20s18 8 18 20c0 14-8 24-18 24s-18-10-18-24Z" fill="url(#sk)"/>` +
        `<path d="M46 60h36v10H46Z" fill="#0a0806" opacity=".65"/>` +
        `<path d="M52 64h8M68 64h8" stroke="#fff6d8" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>` +
        `<circle cx="72" cy="64" r="1.4" fill="#fff"/>` +
        `<path d="M66 72l2 4h-3M58 80h10" stroke="#3a2418" stroke-width="1.2" fill="none"/>` +
        `<path d="M48 74c2 6 6 10 10 12" stroke="#2a1a10" stroke-width="2" fill="none" opacity=".6"/>` +
        // fedora
        `<path d="M14 56c8-6 26-8 50-8s42 2 50 8c-6 4-28 6-50 6s-44-2-50-6Z" fill="url(#ht)"/>` +
        `<path d="M38 52c0-16 6-28 26-28s26 12 26 28c-8 2-18 2-26 2s-18 0-26-2Z" fill="url(#ht)"/>` +
        `<path d="M54 26c4 4 6 8 10 8s6-4 10-8" stroke="#0a0806" stroke-width="2" fill="none"/>` +
        `<path d="M38 46c8 2 18 3 26 3s18-1 26-3v6c-8 2-18 2-26 2s-18 0-26-2Z" fill="#0a0806"/>` +
        `<path d="M78 30c4 4 8 10 10 16" stroke="#8a7a6a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>`,
    }),
};
