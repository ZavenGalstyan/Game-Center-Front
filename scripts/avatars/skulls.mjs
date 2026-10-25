import { L, R, RU, rays, stars, embers, circuit, grid, frame, mirror } from "./lib.mjs";

// A reusable skull: cranium + cheekbones + jaw, centred on (64, y0).
function skull({ fill = "url(#bone)", stroke = "#2a1d12", y0 = 0, sockets = "#0b0605" } = {}) {
  return (
    `<g transform="translate(0 ${y0})">` +
    `<path d="M36 58c0-22 12-34 28-34s28 12 28 34c0 8-2 13-6 17v9c0 4-3 6-7 6H49c-4 0-7-2-7-6v-9c-4-4-6-9-6-17Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<path d="M47 60c0-6 4-9 9-9s8 4 8 9-4 9-9 9-8-3-8-9ZM64 60c0-5 3-9 8-9s9 3 9 9-3 9-8 9-9-4-9-9Z" fill="${sockets}"/>` +
    `<path d="M64 70l-4 8h8Z" fill="${sockets}"/>` +
    `<path d="M50 84v6M57 85v6M64 85v6M71 85v6M78 84v6" stroke="${stroke}" stroke-width="1.6"/>` +
    `<path d="M48 84h32" stroke="${stroke}" stroke-width="1.4"/>` +
    `</g>`
  );
}

export default {
  "flaming-skull": () =>
    frame({
      bg: ["#ff6a14", "#5a1004", "#0d0201"],
      light: "50% 30%",
      defs:
        L("bone", 0, 0, 0, 1, [0, "#fff6e2"], [0.6, "#e2c9a2"], [1, "#9a7c56"]) +
        L("fl", 0, 1, 0, 0, [0, "#ff3a0a"], [0.45, "#ff9a1a"], [1, "#ffe76a", 0]) +
        L("fl2", 0, 1, 0, 0, [0, "#ffd23a"], [1, "#fff6c0", 0]) +
        R("eye", 0.5, 0.5, 0.5, [0, "#fff3b0"], [0.4, "#ff8a1a"], [1, "#ff3a0a", 0]),
      fx: embers(31, { color: "#ffcf5a", n: 26 }),
      body:
        `<path d="M26 74C18 50 30 34 34 18c4 10 8 14 12 12-2-12 4-22 12-28 0 12 6 16 10 16 2-8 8-12 14-14-2 10 2 16 8 18 2-6 6-8 10-10-2 14 8 22 6 38-2 14-10 26-12 30Z" fill="url(#fl)"/>` +
        `<path d="M40 70c-6-14 0-24 4-34 2 8 6 10 8 8 0-8 4-14 10-18 0 8 4 12 8 12 2-6 6-8 10-8-2 8 4 14 6 20 2 8-2 16-4 20Z" fill="url(#fl2)"/>` +
        skull({ y0: 10 }) +
        `<circle cx="55.5" cy="70" r="7" fill="url(#eye)" filter="url(#glow)"/><circle cx="72.5" cy="70" r="7" fill="url(#eye)" filter="url(#glow)"/>` +
        `<circle cx="55.5" cy="70" r="2.6" fill="#fffbe0"/><circle cx="72.5" cy="70" r="2.6" fill="#fffbe0"/>` +
        `<path d="M42 50c4-8 12-12 20-13" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M50 112c4 6 24 6 28 0" stroke="#ff9a1a" stroke-width="2" opacity=".5" fill="none"/>`,
    }),

  "grim-reaper": () =>
    frame({
      bg: ["#3f7a74", "#102624", "#020706"],
      light: "70% 22%",
      defs:
        L("rb", 0, 0, 0, 1, [0, "#2a2f38"], [1, "#050608"]) +
        L("bl", 0, 0, 1, 1, [0, "#f2f6f8"], [0.5, "#a7b2ba"], [1, "#3a434a"]) +
        R("void", 0.5, 0.45, 0.6, [0, "#000"], [1, "#11151a"]),
      fx:
        `<circle cx="96" cy="26" r="15" fill="#e8fff8" opacity=".85"/><circle cx="96" cy="26" r="22" fill="#bff" opacity=".15" filter="url(#soft)"/>` +
        `<g fill="#06100f" opacity=".9"><path d="M8 128v-24h8v-6h6v6h6v24ZM100 128v-20h6v-6h6v6h6v20Z"/><path d="M0 116c30-6 90-8 128 0v12H0Z"/></g>`,
      body:
        // scythe
        `<path d="M98 128L82 18" stroke="#3a2a1a" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M82 20C64 4 30 6 12 26c16-8 40-8 62 4l8 2Z" fill="url(#bl)"/>` +
        `<path d="M76 24C60 14 36 14 20 22" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>` +
        // robe
        `<path d="M8 128c4-30 18-44 26-50-2-30 12-50 30-50s32 20 30 50c8 6 22 20 26 50Z" fill="url(#rb)"/>` +
        `<path d="M40 128c2-18 8-30 14-36M88 128c-2-18-8-30-14-36" stroke="#3a414c" stroke-width="1.5" fill="none"/>` +
        // hood opening
        `<path d="M44 66c0-18 8-28 20-28s20 10 20 28c0 14-8 24-20 24s-20-10-20-24Z" fill="url(#void)"/>` +
        `<path d="M44 66c0-18 8-28 20-28" stroke="#4a525e" stroke-width="2" fill="none"/>` +
        `<ellipse cx="56" cy="64" rx="4" ry="2.5" fill="#ff2a2a" filter="url(#glow)"/><ellipse cx="72" cy="64" rx="4" ry="2.5" fill="#ff2a2a" filter="url(#glow)"/>` +
        `<ellipse cx="56" cy="64" rx="2.4" ry="1.4" fill="#ffd0d0"/><ellipse cx="72" cy="64" rx="2.4" ry="1.4" fill="#ffd0d0"/>` +
        // bony hand gripping scythe
        `<g fill="#d8d0c0" stroke="#6a6256" stroke-width=".8"><rect x="84" y="80" width="12" height="4" rx="2" transform="rotate(-10 90 82)"/><rect x="85" y="86" width="12" height="4" rx="2" transform="rotate(-10 91 88)"/><rect x="86" y="92" width="11" height="4" rx="2" transform="rotate(-10 91 94)"/></g>`,
    }),

  "cyber-skull": () =>
    frame({
      bg: ["#0b6a8a", "#06202e", "#01060a"],
      defs:
        L("bone", 0, 0, 0, 1, [0, "#e9f3f6"], [1, "#8fa3ab"]) +
        L("mt", 0, 0, 1, 1, [0, "#dfe8ee"], [0.4, "#6a7a86"], [1, "#1c242b"]),
      fx: circuit(7, { color: "#38e1ff", op: 0.4, n: 18 }) + grid("#38e1ff", { horizon: 100, op: 0.3 }),
      body:
        `<path d="M64 24c-16 0-28 12-28 34 0 8 2 13 6 17v9c0 4 3 6 7 6h15Z" fill="url(#bone)" stroke="#3a4a52" stroke-width="1.5"/>` +
        `<path d="M64 24c16 0 28 12 28 34 0 8-2 13-6 17v9c0 4-3 6-7 6H64Z" fill="url(#mt)" stroke="#1c242b" stroke-width="1.5"/>` +
        `<g stroke="#38e1ff" stroke-width="1.1" fill="none" opacity=".9"><path d="M66 30h10l6 8v10M66 44h8l4 4h10M70 78h12M74 72l8-6"/></g>` +
        `<g fill="#38e1ff"><circle cx="82" cy="48" r="1.5"/><circle cx="88" cy="48" r="1.5"/><circle cx="82" cy="78" r="1.5"/></g>` +
        `<path d="M47 60c0-6 4-9 9-9s8 4 8 9-4 9-9 9-8-3-8-9Z" fill="#05090c"/>` +
        `<path d="M64 52h16l2 8-2 8H64Z" fill="#0a0f12" stroke="#38e1ff" stroke-width="1"/>` +
        `<circle cx="73" cy="60" r="8" fill="#ff2040" opacity=".55" filter="url(#glow)"/><circle cx="73" cy="60" r="4.2" fill="#ff2040"/><circle cx="73" cy="60" r="1.6" fill="#ffe0e6"/>` +
        `<path d="M64 70l-4 8h8Z" fill="#05090c"/>` +
        `<path d="M50 84v6M57 85v6M64 85v6M71 85v6M78 84v6" stroke="#2a3a42" stroke-width="1.6"/><path d="M48 84h32" stroke="#2a3a42" stroke-width="1.4"/>` +
        `<path d="M64 24v66" stroke="#38e1ff" stroke-width="1.4" opacity=".8"/>` +
        `<path d="M42 48c3-9 10-15 18-17" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M40 100c8 10 40 10 48 0" stroke="#38e1ff" stroke-width="1" opacity=".5" fill="none"/>`,
    }),

  "pirate-skull": () =>
    frame({
      bg: ["#2f6f8f", "#0f2836", "#03080c"],
      light: "40% 30%",
      defs:
        L("bone", 0, 0, 0, 1, [0, "#fff8e6"], [1, "#b6a07e"]) +
        L("hat", 0, 0, 0, 1, [0, "#3a2a20"], [1, "#0e0906"]) +
        L("sb", 0, 0, 1, 0, [0, "#f2f6f8"], [1, "#8a96a0"]) +
        L("gd", 0, 0, 0, 1, [0, "#ffe7a0"], [1, "#b47d1c"]),
      fx:
        `<path d="M0 96c12-6 20 4 32-2s20-8 32-2 22 6 32 0 22-6 32 2v34H0Z" fill="#0a1f2c"/><path d="M0 104c14-5 22 3 34-2s20-6 30 0 22 5 34-1 20-4 30 2" stroke="#6ab4d8" stroke-width="1" opacity=".4" fill="none"/>` +
        `<path d="M14 20l6 4-2-6 6-2h-7l-2-6-1 6h-7Z" fill="#fff" opacity=".4"/>`,
      body:
        `<path d="M22 116L106 32M106 116L22 32" stroke="url(#sb)" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path d="M14 124l10-10M114 124l-10-10" stroke="#3a2a20" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M20 112c4 2 6 4 8 8M108 112c-4 2-6 4-8 8" stroke="url(#gd)" stroke-width="3" fill="none"/>` +
        skull({ y0: 8 }) +
        // eyepatch
        `<path d="M64 66c0-5 3-9 8-9s9 3 9 9-3 9-8 9-9-4-9-9Z" fill="#141010"/>` +
        `<path d="M38 56l52 16" stroke="#141010" stroke-width="2.2"/>` +
        `<circle cx="55.5" cy="68" r="2" fill="#ffcc44" filter="url(#glow)"/>` +
        // tricorn
        `<path d="M24 46c10-4 18-2 22 0 2-12 10-18 18-18s16 6 18 18c4-2 12-4 22 0-6 8-22 14-40 14S30 54 24 46Z" fill="url(#hat)"/>` +
        `<path d="M24 46c12 8 26 12 40 12s28-4 40-12" stroke="url(#gd)" stroke-width="2" fill="none"/>` +
        // mini skull emblem
        `<circle cx="64" cy="42" r="4.6" fill="#f2ead8"/><path d="M61.5 41.5h1.6M65 41.5h1.6" stroke="#140d08" stroke-width="1.6" stroke-linecap="round"/><path d="M58 48l12-4M58 44l12 4" stroke="#f2ead8" stroke-width="1.4"/>`,
    }),

  "horned-demon": () =>
    frame({
      bg: ["#d8240f", "#4a0402", "#0d0100"],
      light: "50% 75%",
      defs:
        L("sk", 0, 0, 0, 1, [0, "#e0402a"], [0.6, "#8a1206"], [1, "#3a0502"]) +
        L("hn", 0, 1, 0, 0, [0, "#2a1a14"], [0.6, "#6a5040"], [1, "#e8d6b8"]) +
        R("eye", 0.5, 0.5, 0.5, [0, "#fffbc0"], [0.5, "#ffd20a"], [1, "#ff7a00"]),
      fx:
        `<path d="M0 128c4-18 12-26 16-38 4 10 8 12 12 6 2 10 8 14 14 8 0 10 4 20 12 24ZM128 128c-4-18-12-26-16-38-4 10-8 12-12 6-2 10-8 14-14 8 0 10-4 20-12 24Z" fill="#ff8a1a" opacity=".55"/>` +
        embers(41, { color: "#ffb04a", n: 22 }),
      body:
        // horns
        `<path d="M44 46C30 40 18 26 18 6c8 12 18 18 30 22Z" fill="url(#hn)"/>` + mirror(`<path d="M44 46C30 40 18 26 18 6c8 12 18 18 30 22Z" fill="url(#hn)"/>`) +
        `<g stroke="#2a1a14" stroke-width="1" opacity=".6" fill="none"><path d="M24 22c4 3 8 5 12 6M28 32c4 2 7 4 11 5"/></g>` +
        `<path d="M14 128c6-20 24-30 50-30s44 10 50 30Z" fill="#2a0402"/>` +
        `<path d="M38 56c0-20 12-30 26-30s26 10 26 30c0 18-8 30-14 36-4 4-8 6-12 6s-8-2-12-6c-6-6-14-18-14-36Z" fill="url(#sk)"/>` +
        // brow ridge + eyes
        `<path d="M42 56l18 6M86 56l-18 6" stroke="#2a0402" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M46 62l13 4-10 3Z" fill="url(#eye)"/><path d="M82 62l-13 4 10 3Z" fill="url(#eye)"/>` +
        `<path d="M46 62l13 4-10 3ZM82 62l-13 4 10 3Z" fill="#ffd20a" opacity=".6" filter="url(#glow)"/>` +
        `<path d="M60 74c2 2 6 2 8 0" stroke="#2a0402" stroke-width="1.6" fill="none"/>` +
        // fanged grin
        `<path d="M48 80c6 6 26 6 32 0-2 8-8 12-16 12s-14-4-16-12Z" fill="#120100"/>` +
        `<path d="M52 82l3 6 2-5ZM76 82l-3 6-2-5ZM60 85l2 3 2-3ZM66 85l1.5 3 1.5-3Z" fill="#fff2e0"/>` +
        `<path d="M46 42c4-6 10-10 16-11" stroke="#ff9070" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>`,
    }),

  "plague-doctor": () =>
    frame({
      bg: ["#4a7a3a", "#16240f", "#040802"],
      light: "50% 50%",
      defs:
        L("hat", 0, 0, 0, 1, [0, "#2a2a2a"], [1, "#050505"]) +
        L("bk", 0, 0, 1, 1, [0, "#f0e6d0"], [0.5, "#b8a684"], [1, "#5a4a32"]) +
        L("ct", 0, 0, 0, 1, [0, "#1e1e22"], [1, "#050507"]) +
        R("gl", 0.35, 0.35, 0.7, [0, "#f0fff0"], [0.4, "#7aff8a"], [1, "#0a3a14"]),
      fx: `<g fill="#9aff6a" opacity=".14" filter="url(#soft)"><circle cx="20" cy="40" r="18"/><circle cx="110" cy="70" r="20"/><circle cx="40" cy="110" r="22"/><circle cx="96" cy="118" r="16"/></g>`,
      body:
        `<path d="M10 128c4-24 24-36 54-36s50 12 54 36Z" fill="url(#ct)"/>` +
        `<path d="M64 92v36" stroke="#2e2e34" stroke-width="2"/><g fill="#7a6a4a"><circle cx="60" cy="102" r="1.6"/><circle cx="60" cy="112" r="1.6"/><circle cx="60" cy="122" r="1.6"/></g>` +
        `<path d="M42 62c0-14 10-22 22-22s22 8 22 22v24c0 4-10 8-22 8s-22-4-22-8Z" fill="#141416"/>` +
        // beak
        `<path d="M46 64c4-6 10-8 18-8s14 2 18 8c-2 10-10 14-14 22-6 12-14 22-26 30 6-14 8-24 6-34-2-6-2-12-2-18Z" fill="url(#bk)"/>` +
        `<path d="M60 76c-4 12-10 24-18 34" stroke="#5a4a32" stroke-width="1.2" fill="none"/>` +
        `<path d="M48 70c6 2 18 2 30-2M50 80c6 1 14 1 22-2" stroke="#7a6a4a" stroke-width="1.2" fill="none" opacity=".7"/>` +
        // lenses
        `<circle cx="54" cy="62" r="8" fill="#7aff8a" opacity=".35" filter="url(#glow)"/><circle cx="74" cy="62" r="8" fill="#7aff8a" opacity=".35" filter="url(#glow)"/>` +
        `<circle cx="54" cy="62" r="6.5" fill="url(#gl)" stroke="#c9a24a" stroke-width="2"/><circle cx="74" cy="62" r="6.5" fill="url(#gl)" stroke="#c9a24a" stroke-width="2"/>` +
        `<path d="M51 59.5l2.5-1.5M71 59.5l2.5-1.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>` +
        // hat
        `<ellipse cx="64" cy="44" rx="40" ry="8" fill="url(#hat)"/>` +
        `<path d="M44 44V22c0-4 8-6 20-6s20 2 20 6v22Z" fill="url(#hat)"/>` +
        `<path d="M44 38c6 2 14 3 20 3s14-1 20-3v4c-6 2-14 3-20 3s-14-1-20-3Z" fill="#6a1a1a"/>` +
        `<path d="M48 22c4-2 10-3 16-3" stroke="#555" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    }),

  "hooded-wraith": () =>
    frame({
      bg: ["#6a8adf", "#1a2350", "#04061a"],
      light: "50% 45%",
      defs:
        L("hood", 0, 0, 0, 1, [0, "#cfe0ff", 0.95], [0.5, "#6a82c8", 0.75], [1, "#1a2350", 0]) +
        R("face", 0.5, 0.45, 0.6, [0, "#03040c"], [0.8, "#0a0f2a"], [1, "#3a4a8a"]) +
        R("eye", 0.5, 0.5, 0.5, [0, "#ffffff"], [0.4, "#7af0ff"], [1, "#0a7aa0", 0]),
      fx:
        `<g fill="#bcd2ff" opacity=".18" filter="url(#soft)"><ellipse cx="30" cy="100" rx="30" ry="10"/><ellipse cx="100" cy="110" rx="34" ry="10"/><ellipse cx="64" cy="20" rx="40" ry="8"/></g>` +
        stars(17, { n: 16, color: "#cfe0ff", maxR: 1 }),
      body:
        `<path d="M18 128c2-10 6-14 4-22-2-10 4-20 10-26-4-30 12-56 32-56s36 26 32 56c6 6 12 16 10 26-2 8 2 12 4 22l-8-6-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8Z" fill="url(#hood)"/>` +
        `<path d="M34 80c-4-28 10-48 30-48s34 20 30 48" stroke="#e6efff" stroke-width="1.4" fill="none" opacity=".55"/>` +
        `<path d="M42 70c0-18 10-30 22-30s22 12 22 30c0 14-10 26-22 26s-22-12-22-26Z" fill="url(#face)"/>` +
        `<ellipse cx="55" cy="66" rx="6" ry="4" fill="url(#eye)" filter="url(#glow)"/><ellipse cx="73" cy="66" rx="6" ry="4" fill="url(#eye)" filter="url(#glow)"/>` +
        `<ellipse cx="55" cy="66" rx="2.2" ry="1.4" fill="#fff"/><ellipse cx="73" cy="66" rx="2.2" ry="1.4" fill="#fff"/>` +
        `<path d="M56 82c4 3 12 3 16 0" stroke="#7af0ff" stroke-width="1" opacity=".5" fill="none"/>` +
        `<g stroke="#9ff6ff" stroke-width="1.2" fill="none" opacity=".5" stroke-linecap="round"><path d="M50 98c-4 8 2 12-2 20M78 98c4 8-2 12 2 20M64 100c0 8 3 12 0 18"/></g>`,
    }),

  "sugar-skull": () =>
    frame({
      bg: ["#ff9a2a", "#b0184a", "#2a0414"],
      light: "50% 40%",
      defs: L("bone", 0, 0, 0, 1, [0, "#ffffff"], [1, "#d8d2e6"]),
      fx:
        // marigold ring
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
          .map((i) => {
            const a = (i / 12) * Math.PI * 2;
            const x = (64 + Math.cos(a) * 54).toFixed(1);
            const y = (62 + Math.sin(a) * 54).toFixed(1);
            const c = i % 2 ? "#ffb21a" : "#ff6a1a";
            return `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/><circle cx="${x}" cy="${y}" r="5" fill="#ffd84a"/><circle cx="${x}" cy="${y}" r="2" fill="#c2410a"/>`;
          })
          .join(""),
      body:
        `<path d="M36 58c0-22 12-34 28-34s28 12 28 34c0 8-2 13-6 17v9c0 4-3 6-7 6H49c-4 0-7-2-7-6v-9c-4-4-6-9-6-17Z" fill="url(#bone)" stroke="#5a2a5a" stroke-width="1.5"/>` +
        // floral eye sockets
        [[55.5, 60, "#1ab8c8"], [72.5, 60, "#e8287a"]]
          .map(
            ([x, y, c]) =>
              `<g transform="translate(${x} ${y})">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<ellipse rx="3" ry="6.5" cy="-5" fill="${c}" transform="rotate(${k * 45})"/>`).join("")}<circle r="5" fill="#1a0a1a"/><circle r="1.6" cx="-1.4" cy="-1.4" fill="#fff"/></g>`,
          )
          .join("") +
        `<path d="M64 70c-3 0-4 4-4 6s2 2 4 0c2 2 4 2 4 0s-1-6-4-6Z" fill="#7a2a9a"/>` +
        // forehead flower
        `<g transform="translate(64 38)">${[0, 1, 2, 3, 4].map((k) => `<ellipse rx="2.6" ry="5" cy="-4" fill="#ffb21a" transform="rotate(${k * 72})"/>`).join("")}<circle r="2.6" fill="#e8287a"/></g>` +
        `<path d="M44 48c-2 4-2 8 0 10M84 48c2 4 2 8 0 10" stroke="#1ab8c8" stroke-width="1.6" fill="none"/>` +
        `<g fill="#e8287a"><circle cx="44" cy="74" r="2"/><circle cx="84" cy="74" r="2"/></g><g fill="#7a2a9a"><circle cx="40" cy="68" r="1.4"/><circle cx="88" cy="68" r="1.4"/></g>` +
        // stitched grin
        `<path d="M46 82c6 3 30 3 36 0" stroke="#1a0a1a" stroke-width="1.6" fill="none"/>` +
        `<path d="M50 79v7M56 80v7M62 80.5v7M68 80.5v7M74 80v7M80 79v6" stroke="#1a0a1a" stroke-width="1.2"/>`,
    }),

  necromancer: () =>
    frame({
      bg: ["#2a8a5a", "#0b2a1c", "#020805"],
      light: "30% 40%",
      defs:
        L("rb", 0, 0, 0, 1, [0, "#3a2a4a"], [1, "#0a060e"]) +
        L("tr", 0, 0, 1, 0, [0, "#c9a24a"], [1, "#6a4a12"]) +
        L("sk", 0, 0, 0, 1, [0, "#bfcab8"], [1, "#6a7a64"]) +
        RU("orb", 30, 34, 14, [0, "#f0fff4"], [0.35, "#4aff9a"], [1, "#0a6a3a", 0]),
      fx:
        `<g stroke="#4aff9a" stroke-width="1" fill="none" opacity=".35"><circle cx="64" cy="112" r="30"/><circle cx="64" cy="112" r="22"/><path d="M64 82l18 44-38-28h40l-38 28Z"/></g>` +
        embers(51, { color: "#7affb4", n: 18 }),
      body:
        // staff
        `<path d="M30 128L32 46" stroke="#3a2a1a" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M22 46c0-8 4-14 10-14s10 6 10 14" stroke="#c9a24a" stroke-width="2.4" fill="none"/>` +
        `<circle cx="30" cy="34" r="14" fill="url(#orb)"/>` +
        `<circle cx="30" cy="36" r="5" fill="#e8f0e4"/><path d="M27.6 35.4h1.4M31 35.4h1.4" stroke="#0a2a14" stroke-width="1.6" stroke-linecap="round"/>` +
        // robe
        `<path d="M14 128c4-28 20-40 28-46-2-30 6-50 22-50s28 20 26 50c8 6 24 18 28 46Z" fill="url(#rb)"/>` +
        `<path d="M44 128l20-36 20 36" fill="none" stroke="url(#tr)" stroke-width="2.4"/>` +
        `<path d="M42 82c0-26 10-40 22-40s22 14 22 40" stroke="url(#tr)" stroke-width="2.4" fill="none"/>` +
        // gaunt face
        `<path d="M48 68c0-12 7-18 16-18s16 6 16 18c0 12-6 20-16 20s-16-8-16-20Z" fill="url(#sk)"/>` +
        `<path d="M48 62c4-6 10-8 16-8s12 2 16 8l-2 2c-4-4-8-6-14-6s-10 2-14 6Z" fill="#0a060e" opacity=".9"/>` +
        `<ellipse cx="57" cy="67" rx="3.2" ry="2" fill="#4aff9a" filter="url(#glow)"/><ellipse cx="71" cy="67" rx="3.2" ry="2" fill="#4aff9a" filter="url(#glow)"/>` +
        `<ellipse cx="57" cy="67" rx="1.8" ry="1.1" fill="#eaffef"/><ellipse cx="71" cy="67" rx="1.8" ry="1.1" fill="#eaffef"/>` +
        `<path d="M52 74c2 4 4 6 4 8M76 74c-2 4-4 6-4 8M60 80h8" stroke="#4a5a44" stroke-width="1.2" fill="none"/>` +
        `<path d="M98 70c4-4 10-4 12 2" stroke="#4aff9a" stroke-width="1.4" fill="none" opacity=".7" filter="url(#glow)"/>`,
    }),

  "skeleton-king": () =>
    frame({
      bg: ["#7a3ad8", "#24104a", "#06020f"],
      light: "50% 30%",
      defs:
        L("bone", 0, 0, 0, 1, [0, "#f6f2ff"], [1, "#a69cc0"]) +
        L("gd", 0, 0, 0, 1, [0, "#fff2b0"], [0.5, "#e8b42a"], [1, "#8a5a0a"]) +
        L("cape", 0, 0, 0, 1, [0, "#b01a3a"], [1, "#3a0412"]) +
        R("eye", 0.5, 0.5, 0.5, [0, "#ffffff"], [0.4, "#6ad0ff"], [1, "#1a4aff", 0]),
      fx: rays("#e6d0ff", { op: 0.1, cy: 30, n: 14 }) + stars(61, { n: 20, color: "#f3e6ff" }),
      body:
        `<path d="M6 128c4-24 24-36 58-36s54 12 58 36Z" fill="url(#cape)"/>` +
        `<path d="M24 104c10-6 24-10 40-10s30 4 40 10l-4 8c-10-5-22-8-36-8s-26 3-36 8Z" fill="#f2eee6"/>` +
        `<g fill="#1a1020"><circle cx="34" cy="104" r="1.4"/><circle cx="46" cy="100" r="1.4"/><circle cx="58" cy="98" r="1.4"/><circle cx="70" cy="98" r="1.4"/><circle cx="82" cy="100" r="1.4"/><circle cx="94" cy="104" r="1.4"/></g>` +
        `<path d="M58 94h12l-6 12Z" fill="url(#gd)"/><circle cx="64" cy="99" r="2.4" fill="#d81a4a"/>` +
        skull({ fill: "url(#bone)", stroke: "#3a2a5a", y0: 4, sockets: "#0a0612" }) +
        `<circle cx="55.5" cy="64" r="5" fill="url(#eye)" filter="url(#glow)"/><circle cx="72.5" cy="64" r="5" fill="url(#eye)" filter="url(#glow)"/>` +
        `<circle cx="55.5" cy="64" r="1.8" fill="#fff"/><circle cx="72.5" cy="64" r="1.8" fill="#fff"/>` +
        // crown
        `<path d="M36 40l6-20 10 12 12-18 12 18 10-12 6 20Z" fill="url(#gd)" stroke="#6a4208" stroke-width="1"/>` +
        `<rect x="36" y="38" width="56" height="7" rx="2" fill="url(#gd)" stroke="#6a4208" stroke-width="1"/>` +
        `<circle cx="64" cy="30" r="3.4" fill="#d81a4a"/><circle cx="48" cy="34" r="2.2" fill="#2ac8ff"/><circle cx="80" cy="34" r="2.2" fill="#2ac8ff"/>` +
        `<g fill="#fff6c0"><circle cx="42" cy="20" r="1.6"/><circle cx="64" cy="14" r="1.8"/><circle cx="86" cy="20" r="1.6"/></g>` +
        `<g fill="#3aff9a"><circle cx="46" cy="41.5" r="1.4"/><circle cx="56" cy="41.5" r="1.4"/><circle cx="72" cy="41.5" r="1.4"/><circle cx="82" cy="41.5" r="1.4"/></g>`,
    }),
};
