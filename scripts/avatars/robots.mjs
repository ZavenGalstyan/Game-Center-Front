import { L, R, RU, rays, stars, embers, hexes, circuit, grid, speed, frame, mirror } from "./lib.mjs";

export default {
  "battle-mech": () =>
    frame({
      bg: ["#ff8a2a", "#5a2208", "#0f0502"],
      light: "50% 70%",
      defs:
        L("ar", 0, 0, 0, 1, [0, "#9aa4ae"], [0.5, "#4a525c"], [1, "#1a1e24"]) +
        L("ar2", 0, 0, 1, 0, [0, "#3a4048"], [0.5, "#8a949e"], [1, "#2a3038"]) +
        L("vs", 0, 0, 1, 0, [0, "#ff5a0a"], [0.5, "#ffd24a"], [1, "#ff5a0a"]),
      fx: embers(71, { color: "#ffb04a", n: 20 }) + `<path d="M0 110l18-8 16 6 22-10 20 8 22-10 30 10v22H0Z" fill="#1a0802"/>`,
      body:
        // shoulder missile pods
        `<rect x="4" y="34" width="32" height="30" rx="3" fill="url(#ar)" stroke="#11151a" stroke-width="1.5"/>` +
        `<rect x="92" y="34" width="32" height="30" rx="3" fill="url(#ar)" stroke="#11151a" stroke-width="1.5"/>` +
        [8, 96]
          .map((x) =>
            [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${x + 5 + c * 9}" cy="${40 + r * 9}" r="3" fill="#0a0c10"/><circle cx="${x + 5 + c * 9}" cy="${40 + r * 9}" r="1.3" fill="#ff5a2a"/>`).join("")).join(""),
          )
          .join("") +
        `<path d="M4 64h32l-4 6H8ZM92 64h32l-4 6H96Z" fill="#f2c200"/><path d="M10 64l-3 6M18 64l-3 6M26 64l-3 6M34 64l-3 6M98 64l-3 6M106 64l-3 6M114 64l-3 6M122 64l-3 6" stroke="#1a1a10" stroke-width="2"/>` +
        // torso
        `<path d="M24 128l6-44c2-8 8-12 16-12h36c8 0 14 4 16 12l6 44Z" fill="url(#ar2)"/>` +
        `<path d="M46 84h36l-4 22H50Z" fill="#20262c" stroke="#5a646e"/>` +
        `<circle cx="64" cy="95" r="6" fill="#ff7a1a" filter="url(#glow)"/><circle cx="64" cy="95" r="3.4" fill="#ffe6a0"/>` +
        `<path d="M30 92h12M86 92h12M32 104h10M86 104h10" stroke="#1a1e24" stroke-width="2"/>` +
        // head
        `<path d="M46 50l4-16h28l4 16v14c0 4-4 8-8 8H54c-4 0-8-4-8-8Z" fill="url(#ar)" stroke="#11151a" stroke-width="1.5"/>` +
        `<path d="M48 50h32l-2 8H50Z" fill="#0a0c10"/>` +
        `<path d="M50 53.5h28" stroke="url(#vs)" stroke-width="3" stroke-linecap="round"/><path d="M50 53.5h28" stroke="#ff7a1a" stroke-width="5" opacity=".5" filter="url(#glow)"/>` +
        `<path d="M54 64h20M56 68h16" stroke="#1a1e24" stroke-width="1.6"/>` +
        `<path d="M78 34l8-10" stroke="#5a646e" stroke-width="2"/><circle cx="86" cy="24" r="2" fill="#ff3a2a"/>` +
        `<path d="M52 38h14" stroke="#c9d2da" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    }),

  "chrome-cyborg": () =>
    frame({
      bg: ["#5a6a8a", "#1a2032", "#04060c"],
      light: "65% 35%",
      defs:
        L("sk", 0, 0, 1, 1, [0, "#e6b896"], [1, "#8a5a40"]) +
        L("cr", 0, 0, 1, 1, [0, "#ffffff"], [0.3, "#b8c4d0"], [0.6, "#4a5866"], [1, "#d8e2ec"]) +
        L("hr", 0, 0, 0, 1, [0, "#2a2a32"], [1, "#0a0a0e"]),
      fx: hexes("#a8c0ff", { op: 0.08, size: 15 }) + speed(41, { color: "#c8d6ff", op: 0.14 }),
      body:
        `<path d="M14 128c4-22 22-32 50-32s46 10 50 32Z" fill="#1a1e26"/>` +
        `<path d="M64 96c26 0 46 10 50 32H64Z" fill="url(#cr)" opacity=".85"/>` +
        `<path d="M54 84h20v14H54Z" fill="#7a8a9a"/>` +
        `<g stroke="#2a3038" stroke-width="2.4" fill="none"><path d="M66 88c4 6 10 8 16 10M70 86c4 8 12 12 20 14"/></g>` +
        `<g stroke="#ff2a4a" stroke-width="1" fill="none" opacity=".8"><path d="M66 88c4 6 10 8 16 10"/></g>` +
        // face: left skin
        `<path d="M64 28c-14 0-24 10-24 30 0 18 10 32 24 32Z" fill="url(#sk)"/>` +
        // right chrome
        `<path d="M64 28c14 0 24 10 24 30 0 18-10 32-24 32Z" fill="url(#cr)"/>` +
        `<path d="M64 28v62" stroke="#2a3038" stroke-width="1.6"/>` +
        `<g stroke="#5a6876" stroke-width="1" fill="none"><path d="M64 44h14l6 6M64 72h10l6-4M70 82l6-6"/></g>` +
        `<g fill="#3a4450"><circle cx="78" cy="44" r="1.2"/><circle cx="84" cy="50" r="1.2"/><circle cx="80" cy="68" r="1.2"/></g>` +
        // eyes
        `<path d="M48 58c2-3 8-3 10 0-2 2-8 2-10 0Z" fill="#fff"/><circle cx="53" cy="58" r="2" fill="#3a2a1a"/>` +
        `<path d="M46 53l12 1" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="75" cy="58" r="7" fill="#1a1e24" stroke="#8a96a2" stroke-width="1.5"/>` +
        `<circle cx="75" cy="58" r="6" fill="#ff1a3a" opacity=".6" filter="url(#glow)"/><circle cx="75" cy="58" r="3.4" fill="#ff1a3a"/><circle cx="74" cy="57" r="1.2" fill="#fff"/>` +
        `<path d="M58 78q6 2 12 0" stroke="#4a2a1a" stroke-width="1.6" fill="none"/>` +
        // hair
        `<path d="M40 52c-2-18 8-28 24-28v10c-8 0-16 2-20 8-2 4-3 8-4 10Z" fill="url(#hr)"/>` +
        `<path d="M64 24c12 0 22 6 24 18-6-6-14-8-24-8Z" fill="#c9d4de"/>` +
        `<path d="M70 36c6 0 12 2 16 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>`,
    }),

  "android-sentinel": () =>
    frame({
      bg: ["#cfe6ff", "#3a6aa8", "#06122a"],
      light: "50% 40%",
      defs:
        L("sh", 0, 0, 1, 1, [0, "#ffffff"], [0.6, "#d6dee8"], [1, "#8a98a8"]) +
        L("vs", 0, 0, 1, 0, [0, "#0a6aff"], [0.5, "#6af0ff"], [1, "#0a6aff"]) +
        L("nk", 0, 0, 0, 1, [0, "#3a4656"], [1, "#11161e"]),
      fx:
        `<circle cx="64" cy="58" r="44" fill="none" stroke="#e6f4ff" stroke-width="2" opacity=".55"/>` +
        `<circle cx="64" cy="58" r="50" fill="none" stroke="#6af0ff" stroke-width="1" opacity=".5" stroke-dasharray="3 5"/>` +
        rays("#ffffff", { op: 0.1, cy: 58, n: 18 }),
      body:
        `<path d="M14 128c4-22 22-30 50-30s46 8 50 30Z" fill="url(#sh)"/>` +
        `<path d="M40 112c8-6 16-8 24-8s16 2 24 8" stroke="#6af0ff" stroke-width="1.6" fill="none"/>` +
        `<path d="M64 104v24" stroke="#8a98a8" stroke-width="1.4"/>` +
        `<path d="M52 82h24l2 18H50Z" fill="url(#nk)"/><path d="M52 88h24M52 94h24" stroke="#5a6676" stroke-width="1"/>` +
        `<path d="M40 56c0-20 10-30 24-30s24 10 24 30c0 18-8 32-24 32S40 74 40 56Z" fill="url(#sh)"/>` +
        `<path d="M46 40c4-6 10-9 18-9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
        `<path d="M42 54c8-4 36-4 44 0v8c-8 4-36 4-44 0Z" fill="#0a1426"/>` +
        `<path d="M46 58c8-2 28-2 36 0" stroke="url(#vs)" stroke-width="3.4" stroke-linecap="round"/>` +
        `<path d="M46 58c8-2 28-2 36 0" stroke="#6af0ff" stroke-width="6" opacity=".45" filter="url(#glow)"/>` +
        `<circle cx="70" cy="57.4" r="2.2" fill="#fff"/>` +
        `<path d="M64 26v14M48 70l6 6M80 70l-6 6" stroke="#a8b6c6" stroke-width="1.2"/>` +
        `<path d="M58 78h12" stroke="#6af0ff" stroke-width="1.4" opacity=".8"/>` +
        `<rect x="36" y="52" width="4" height="12" rx="2" fill="#a8b6c6"/><rect x="88" y="52" width="4" height="12" rx="2" fill="#a8b6c6"/>`,
    }),

  "space-marine": () =>
    frame({
      bg: ["#4a6a3a", "#162212", "#040703"],
      light: "50% 30%",
      defs:
        L("ar", 0, 0, 1, 1, [0, "#9ab07a"], [0.5, "#4a5e34"], [1, "#1a2410"]) +
        L("vs", 0, 0, 1, 1, [0, "#fff2a0"], [0.35, "#ffb21a"], [0.75, "#a0520a"], [1, "#3a1a02"]) +
        RU("pl", 74, 56, 9, [0, "#9ad8ff"], [1, "#1a4a8a"]),
      fx: stars(81, { n: 30, color: "#e6ffe0" }) + `<circle cx="104" cy="22" r="10" fill="#c46a3a" opacity=".7"/><path d="M92 24c8-3 18-3 24 0" stroke="#ffd0a0" opacity=".5" fill="none"/>`,
      body:
        // pauldrons
        `<path d="M4 98c0-16 10-26 26-26 10 0 16 6 18 14l-4 42H4Z" fill="url(#ar)" stroke="#11180a" stroke-width="1.5"/>` +
        `<path d="M124 98c0-16-10-26-26-26-10 0-16 6-18 14l4 42h40Z" fill="url(#ar)" stroke="#11180a" stroke-width="1.5"/>` +
        `<path d="M8 90c4-8 12-12 20-12M120 90c-4-8-12-12-20-12" stroke="#c8daa8" stroke-width="2" fill="none" opacity=".6"/>` +
        `<path d="M14 100h22M92 100h22" stroke="#f2c200" stroke-width="3"/>` +
        `<path d="M40 128l4-34h40l4 34Z" fill="#2a3618"/><path d="M52 100h24v16H52Z" fill="#1a2410" stroke="#6a8248"/>` +
        // helmet
        `<path d="M36 62c0-22 12-36 28-36s28 14 28 36c0 14-6 26-14 30H50c-8-4-14-16-14-30Z" fill="url(#ar)" stroke="#11180a" stroke-width="1.5"/>` +
        `<path d="M42 56c0-12 10-20 22-20s22 8 22 20c0 8-4 14-10 16H52c-6-2-10-8-10-16Z" fill="url(#vs)"/>` +
        `<circle cx="74" cy="56" r="9" fill="url(#pl)" opacity=".7"/>` +
        `<path d="M48 48c4-6 10-8 16-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M50 80h28l-2 8H52Z" fill="#1a2410"/><path d="M54 84h20" stroke="#6a8248" stroke-width="1.4"/>` +
        `<rect x="30" y="54" width="6" height="16" rx="2" fill="#2a3618"/><rect x="92" y="54" width="6" height="16" rx="2" fill="#2a3618"/>` +
        `<circle cx="95" cy="58" r="1.4" fill="#ff3a2a"/>`,
    }),

  "alien-invader": () =>
    frame({
      bg: ["#2aff8a", "#0a5a3a", "#01100a"],
      light: "50% 20%",
      defs:
        L("sk", 0, 0, 0, 1, [0, "#b8ff7a"], [0.6, "#4ab03a"], [1, "#1a4a14"]) +
        R("ey", 0.35, 0.3, 0.8, [0, "#4a5a7a"], [0.3, "#0a0e1a"], [1, "#000"]) +
        L("ufo", 0, 0, 0, 1, [0, "#e6ecf2"], [1, "#5a6a7a"]) +
        L("bm", 0, 0, 0, 1, [0, "#d6ffb0", 0.6], [1, "#d6ffb0", 0]),
      fx:
        stars(91, { n: 26, color: "#eaffef" }) +
        `<path d="M92 26l-14 40h44l-14-40Z" fill="url(#bm)"/>` +
        `<ellipse cx="100" cy="24" rx="18" ry="5" fill="url(#ufo)"/><ellipse cx="100" cy="20" rx="8" ry="5" fill="#9affd8" opacity=".85"/>` +
        `<g fill="#ffe04a"><circle cx="88" cy="25" r="1.2"/><circle cx="96" cy="26.5" r="1.2"/><circle cx="104" cy="26.5" r="1.2"/><circle cx="112" cy="25" r="1.2"/></g>`,
      body:
        `<path d="M22 128c4-18 20-28 42-28s38 10 42 28Z" fill="#1a2a3a"/>` +
        `<path d="M40 112l24 16 24-16" stroke="#9affd8" stroke-width="2" fill="none" opacity=".7"/>` +
        `<path d="M58 88h12l2 14H56Z" fill="#3a8a2a"/>` +
        `<path d="M24 58c0-24 18-36 40-36s40 12 40 36c0 18-22 40-40 40S24 76 24 58Z" fill="url(#sk)"/>` +
        `<path d="M34 42c6-8 16-12 26-13" stroke="#e6ffc0" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".75"/>` +
        `<path d="M32 60c2-10 12-12 24-6 2 8-2 16-10 16s-14-4-14-10ZM96 60c-2-10-12-12-24-6-2 8 2 16 10 16s14-4 14-10Z" fill="url(#ey)"/>` +
        `<ellipse cx="42" cy="58" rx="4" ry="2.4" fill="#fff" opacity=".85" transform="rotate(20 42 58)"/><ellipse cx="80" cy="58" rx="4" ry="2.4" fill="#fff" opacity=".85" transform="rotate(-20 80 58)"/>` +
        `<path d="M60 76h2M66 76h2" stroke="#1a4a14" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M58 84q6 2 12 0" stroke="#1a4a14" stroke-width="1.4" fill="none"/>` +
        `<path d="M40 38c-4-6-4-12 0-16M88 38c4-6 4-12 0-16" stroke="#4ab03a" stroke-width="2" fill="none"/>` +
        `<circle cx="40" cy="22" r="3" fill="#d6ff6a"/><circle cx="88" cy="22" r="3" fill="#d6ff6a"/>`,
    }),

  "combat-drone": () =>
    frame({
      bg: ["#3a4a5a", "#121a22", "#030507"],
      light: "50% 50%",
      defs:
        L("bd", 0, 0, 1, 1, [0, "#e6ebf0"], [0.5, "#6a7682"], [1, "#1a2028"]) +
        RU("rt", 0, 0, 16, [0, "#cfe6ff", 0.15], [0.85, "#cfe6ff", 0.32], [1, "#cfe6ff", 0]) +
        R("cam", 0.4, 0.35, 0.7, [0, "#ffe0e0"], [0.35, "#ff1a2a"], [1, "#3a0206"]),
      fx:
        `<g stroke="#ff3a3a" fill="none" opacity=".25"><circle cx="64" cy="64" r="56" stroke-dasharray="2 6"/><path d="M64 0v14M64 114v14M0 64h14M114 64h14"/></g>` +
        `<path d="M0 100l30-6 20 10 30-8 48 10v22H0Z" fill="#0a1016" opacity=".7"/>`,
      body:
        // arms
        `<path d="M30 30l68 68M98 30L30 98" stroke="url(#bd)" stroke-width="8" stroke-linecap="round"/>` +
        `<path d="M30 30l68 68M98 30L30 98" stroke="#11161c" stroke-width="2" stroke-linecap="round" opacity=".6"/>` +
        // rotors
        [[28, 28], [100, 28], [28, 100], [100, 100]]
          .map(
            ([x, y]) =>
              `<g transform="translate(${x} ${y})"><circle r="16" fill="url(#rt)"/><circle r="16" fill="none" stroke="#9ad8ff" stroke-width=".8" opacity=".5"/>` +
              `<path d="M-14-2h28v4h-28Z" fill="#1a2028" opacity=".55" transform="rotate(25)"/><circle r="4" fill="url(#bd)"/><circle r="1.6" fill="#11161c"/></g>`,
          )
          .join("") +
        `<circle cx="28" cy="28" r="1.6" fill="#3aff6a"/><circle cx="100" cy="28" r="1.6" fill="#3aff6a"/><circle cx="28" cy="100" r="1.6" fill="#ff3a2a"/><circle cx="100" cy="100" r="1.6" fill="#ff3a2a"/>` +
        // body
        `<path d="M48 52l16-10 16 10v24l-16 10-16-10Z" fill="url(#bd)" stroke="#11161c" stroke-width="1.5"/>` +
        `<path d="M50 54l14-8 14 8" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7"/>` +
        `<rect x="38" y="74" width="10" height="5" rx="1" fill="#2a3038"/><rect x="80" y="74" width="10" height="5" rx="1" fill="#2a3038"/>` +
        `<circle cx="64" cy="64" r="10" fill="#0a0e12" stroke="#4a5662" stroke-width="2"/>` +
        `<circle cx="64" cy="64" r="8" fill="#ff1a2a" opacity=".55" filter="url(#glow)"/>` +
        `<circle cx="64" cy="64" r="6" fill="url(#cam)"/><circle cx="62" cy="62" r="1.6" fill="#fff"/>`,
    }),

  "retro-robot": () =>
    frame({
      bg: ["#7af0d8", "#1a8a8a", "#042222"],
      light: "50% 40%",
      defs:
        L("tn", 0, 0, 1, 1, [0, "#f2f6f8"], [0.5, "#a8b6be"], [1, "#4a5a62"]) +
        L("rd", 0, 0, 0, 1, [0, "#ff6a4a"], [1, "#a01a0a"]) +
        R("dial", 0.4, 0.35, 0.7, [0, "#fff8c0"], [0.5, "#ffd21a"], [1, "#b07a00"]),
      fx: `<g fill="#e6fff8" opacity=".18">${Array.from({ length: 64 }, (_, i) => `<circle cx="${(i % 8) * 17 + 4}" cy="${Math.floor(i / 8) * 17 + 4}" r="1.6"/>`).join("")}</g>`,
      body:
        `<path d="M24 128v-18c0-6 4-10 10-10h60c6 0 10 4 10 10v18Z" fill="url(#rd)"/>` +
        `<rect x="44" y="108" width="40" height="14" rx="2" fill="#1a2a30"/>` +
        `<g fill="#3aff8a"><circle cx="50" cy="115" r="2"/></g><g fill="#ffd21a"><circle cx="58" cy="115" r="2"/></g><g fill="#ff3a2a"><circle cx="66" cy="115" r="2"/></g><path d="M72 112v6M76 112v6M80 112v6" stroke="#8ad8ff" stroke-width="1.4"/>` +
        `<rect x="56" y="88" width="16" height="12" fill="#5a6a72"/><path d="M56 92h16M56 96h16" stroke="#2a3a42" stroke-width="1.2"/>` +
        // head
        `<rect x="30" y="38" width="68" height="52" rx="8" fill="url(#tn)" stroke="#2a3a42" stroke-width="2"/>` +
        `<path d="M36 44h56" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>` +
        `<g fill="#5a6a72"><circle cx="35" cy="43" r="1.6"/><circle cx="93" cy="43" r="1.6"/><circle cx="35" cy="85" r="1.6"/><circle cx="93" cy="85" r="1.6"/></g>` +
        // ears
        `<rect x="22" y="52" width="8" height="22" rx="3" fill="url(#rd)"/><rect x="98" y="52" width="8" height="22" rx="3" fill="url(#rd)"/>` +
        // antenna
        `<path d="M64 38V22" stroke="#4a5a62" stroke-width="3"/><circle cx="64" cy="18" r="5" fill="url(#rd)"/><circle cx="64" cy="18" r="8" fill="#ff6a4a" opacity=".35" filter="url(#glow)"/><circle cx="62.4" cy="16.4" r="1.6" fill="#fff"/>` +
        // eyes
        `<circle cx="50" cy="60" r="10" fill="#1a2a30"/><circle cx="78" cy="60" r="10" fill="#1a2a30"/>` +
        `<circle cx="50" cy="60" r="7" fill="url(#dial)"/><circle cx="78" cy="60" r="7" fill="url(#dial)"/>` +
        `<circle cx="51" cy="61" r="2.6" fill="#1a1a10"/><circle cx="77" cy="61" r="2.6" fill="#1a1a10"/>` +
        // grille mouth
        `<rect x="44" y="74" width="40" height="10" rx="3" fill="#1a2a30"/>` +
        `<path d="M50 74v10M56 74v10M62 74v10M68 74v10M74 74v10M80 74v10" stroke="#a8b6be" stroke-width="1.4"/>`,
    }),

  "starship-pilot": () =>
    frame({
      bg: ["#2a4aaa", "#0a1440", "#02040e"],
      light: "50% 45%",
      defs:
        L("hm", 0, 0, 1, 1, [0, "#ffffff"], [0.55, "#c8d0da"], [1, "#5a6672"]) +
        L("or", 0, 0, 1, 0, [0, "#ff7a1a"], [1, "#ffb21a"]) +
        L("vs", 0, 0, 0, 1, [0, "#3a2a6a", 0.9], [1, "#0a0a2a", 0.6]) +
        L("sk", 0, 0, 1, 1, [0, "#d8a882"], [1, "#8a5a3a"]),
      fx:
        `<g stroke="#cfe0ff" stroke-linecap="round" opacity=".7">${[[10, 20, -14, -6], [118, 30, 16, -8], [20, 100, -14, 6], [110, 104, 14, 6], [30, 10, -6, -8], [100, 8, 8, -8], [6, 60, -8, 0], [122, 70, 8, 0]].map(([x, y, dx, dy]) => `<path d="M${x} ${y}l${dx} ${dy}"/>`).join("")}</g>` +
        stars(101, { n: 18, color: "#e6eeff" }),
      body:
        `<path d="M14 128c4-22 22-32 50-32s46 10 50 32Z" fill="#2a3442"/>` +
        `<path d="M14 128c4-22 22-32 50-32" stroke="url(#or)" stroke-width="4" fill="none"/>` +
        `<rect x="20" y="108" width="18" height="10" rx="2" fill="#1a222e"/><path d="M23 111h12M23 115h8" stroke="#6af0ff" stroke-width="1.2"/>` +
        // helmet
        `<path d="M30 66c0-26 14-42 34-42s34 16 34 42c0 16-6 28-14 32H44c-8-4-14-16-14-32Z" fill="url(#hm)"/>` +
        `<path d="M40 38c6-8 14-11 24-11" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
        `<path d="M30 54h68" stroke="url(#or)" stroke-width="5"/>` +
        // face opening with goggles
        `<path d="M42 60c0-6 10-10 22-10s22 4 22 10v16c0 8-10 14-22 14s-22-6-22-14Z" fill="url(#sk)"/>` +
        `<path d="M42 62h44v8c-4 3-8 3-12 2-4 0-6-2-10-2s-6 2-10 2c-4 1-8 1-12-2Z" fill="#11161e"/>` +
        `<path d="M45 64h16v4H45ZM67 64h16v4H67Z" fill="#6af0ff" opacity=".9"/><path d="M45 64h16v4H45ZM67 64h16v4H67Z" fill="#6af0ff" opacity=".5" filter="url(#glow)"/>` +
        // oxygen mask
        `<path d="M50 76c0-2 6-4 14-4s14 2 14 4v6c0 6-6 10-14 10s-14-4-14-10Z" fill="#3a4452" stroke="#6a7686"/>` +
        `<circle cx="64" cy="82" r="3.4" fill="#1a222e"/><path d="M76 84c8 4 12 10 12 20" stroke="#5a6672" stroke-width="3.4" fill="none" stroke-linecap="round"/>` +
        // raised visor tint
        `<path d="M36 46c4-10 14-16 28-16s24 6 28 16c-8-2-18-4-28-4s-20 2-28 4Z" fill="url(#vs)"/>` +
        `<rect x="92" y="58" width="8" height="14" rx="2" fill="#5a6672"/><circle cx="96" cy="62" r="1.4" fill="#3aff6a"/>`,
    }),

  "ai-core": () =>
    frame({
      bg: ["#ff2a5a", "#3a0618", "#0a0105"],
      light: "50% 50%",
      defs:
        RU("core", 64, 64, 20, [0, "#ffffff"], [0.25, "#ffe0ea"], [0.5, "#ff2a5a"], [1, "#5a0014"]) +
        RU("halo", 64, 64, 46, [0, "#ff2a5a", 0.7], [1, "#ff2a5a", 0]) +
        L("rg", 0, 0, 1, 1, [0, "#e6ebf0"], [0.5, "#5a646e"], [1, "#1a1e24"]),
      fx: circuit(111, { color: "#ff5a8a", op: 0.45, n: 20 }) + rays("#ff7aa0", { op: 0.08, cy: 64, n: 24, w: 3 }),
      body:
        `<circle cx="64" cy="64" r="46" fill="url(#halo)"/>` +
        // outer segmented ring
        `<circle cx="64" cy="64" r="40" fill="none" stroke="url(#rg)" stroke-width="7" stroke-dasharray="18 4"/>` +
        `<circle cx="64" cy="64" r="34" fill="#0a0408" stroke="#3a3f46" stroke-width="2"/>` +
        `<circle cx="64" cy="64" r="30" fill="none" stroke="#ff2a5a" stroke-width="1.4" stroke-dasharray="2 3" opacity=".9"/>` +
        // iris blades
        `<g fill="#1a0a12" stroke="#ff5a8a" stroke-width=".8">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<path d="M64 38l8 14-8 4-8-4Z" transform="rotate(${k * 45} 64 64)"/>`).join("")}</g>` +
        `<circle cx="64" cy="64" r="16" fill="url(#core)"/>` +
        `<circle cx="64" cy="64" r="18" fill="#ff2a5a" opacity=".5" filter="url(#soft)"/>` +
        `<circle cx="64" cy="64" r="5" fill="#fff"/>` +
        `<circle cx="58" cy="58" r="3" fill="#fff" opacity=".8"/>` +
        `<g fill="#ffd0dc">${[0, 1, 2, 3].map((k) => `<rect x="62" y="16" width="4" height="7" rx="1" transform="rotate(${k * 90 + 45} 64 64)"/>`).join("")}</g>`,
    }),

  "void-astronaut": () =>
    frame({
      bg: ["#6a2aaa", "#160a3a", "#02010a"],
      light: "35% 35%",
      defs:
        L("sut", 0, 0, 1, 1, [0, "#ffffff"], [0.6, "#c8ccd8"], [1, "#5a5e72"]) +
        RU("vis", 60, 58, 30, [0, "#ff7ad8"], [0.35, "#6a2ad8"], [0.7, "#1a0a4a"], [1, "#03020a"]) +
        L("gd", 0, 0, 1, 1, [0, "#ffe7a0"], [1, "#b47d1c"]),
      fx:
        `<g fill="#ff7ad8" opacity=".18" filter="url(#soft)"><ellipse cx="24" cy="30" rx="30" ry="14" transform="rotate(-20 24 30)"/><ellipse cx="104" cy="100" rx="30" ry="12" transform="rotate(-20 104 100)"/></g>` +
        stars(121, { n: 40, color: "#f0e6ff", maxR: 1.3 }),
      body:
        `<path d="M14 128c2-20 18-30 50-30s48 10 50 30Z" fill="url(#sut)"/>` +
        `<rect x="48" y="106" width="32" height="16" rx="3" fill="#3a3e52"/><g fill="#ff3a6a"><circle cx="54" cy="114" r="2"/></g><g fill="#3aff9a"><circle cx="62" cy="114" r="2"/></g><path d="M68 111h8M68 117h8" stroke="#9ad8ff" stroke-width="1.4"/>` +
        `<path d="M30 100c10-8 20-10 34-10s24 2 34 10" stroke="#8a8ea2" stroke-width="5" fill="none"/>` +
        // helmet
        `<circle cx="64" cy="58" r="38" fill="url(#sut)"/>` +
        `<path d="M34 38c6-12 18-18 30-18" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<ellipse cx="64" cy="60" rx="29" ry="26" fill="url(#gd)"/>` +
        `<ellipse cx="64" cy="60" rx="27" ry="24" fill="url(#vis)"/>` +
        // galaxy reflection
        `<g transform="translate(66 62) rotate(-25)" fill="none" stroke-linecap="round"><path d="M-14 0c0-8 10-12 18-8s6 14-2 14-10-6-6-8" stroke="#ffd0f4" stroke-width="2" opacity=".8"/><path d="M-20 2c2-14 22-18 30-6" stroke="#ff9ae8" stroke-width="1.2" opacity=".6"/></g>` +
        `<circle cx="66" cy="62" r="3" fill="#fff"/>` +
        `${[[48, 50], [78, 48], [56, 74], [82, 70], [44, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#fff"/>`).join("")}` +
        `<path d="M44 44c6-6 14-8 22-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>` +
        `<rect x="22" y="50" width="6" height="16" rx="2" fill="#8a8ea2"/><rect x="100" y="50" width="6" height="16" rx="2" fill="#8a8ea2"/>`,
    }),
};
