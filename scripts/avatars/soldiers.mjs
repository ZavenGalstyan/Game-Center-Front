import { L, R, RU, rays, stars, embers, hexes, rain, speed, frame, mirror } from "./lib.mjs";

export default {
  "shadow-soldier": () =>
    frame({
      bg: ["#3d5a2a", "#16230f", "#050904"],
      defs:
        L("hm", 0, 0, 0, 1, [0, "#56654a"], [1, "#171d13"]) +
        L("vs", 0, 0, 0, 1, [0, "#2f3a27"], [1, "#0b0e09"]) +
        L("bl", 0, 0, 0, 1, [0, "#24272b"], [1, "#0b0c0e"]) +
        R("ln", 0.4, 0.35, 0.6, [0, "#efffd6"], [0.35, "#7dff4f"], [1, "#0f4a06"]),
      fx: rays("#9dff6a", { op: 0.06 }) + embers(11, { color: "#a8ff7a", n: 14, op: 0.5 }),
      body:
        `<path d="M8 128C12 103 34 93 64 93s52 10 56 35Z" fill="url(#vs)"/>` +
        `<path d="M24 128c2-12 8-20 16-24l4 24Z" fill="#222b1c"/>` + mirror(`<path d="M24 128c2-12 8-20 16-24l4 24Z" fill="#222b1c"/>`) +
        `<rect x="48" y="102" width="32" height="26" rx="3" fill="#1d2418" stroke="#3b4730"/>` +
        `<rect x="30" y="108" width="13" height="15" rx="2" fill="#262f1f" stroke="#435137"/>` +
        `<rect x="85" y="108" width="13" height="15" rx="2" fill="#262f1f" stroke="#435137"/>` +
        `<rect x="55" y="107" width="18" height="7" rx="1" fill="#3e4b30"/><path d="M57 110.5h14" stroke="#7f9a5c" stroke-width="1"/>` +
        `<path d="M49 82h30l3 14H46Z" fill="#0e1012"/>` +
        `<ellipse cx="64" cy="67" rx="21.5" ry="25" fill="url(#bl)"/>` +
        `<path d="M50 80q14 6 28 0" stroke="#2b2f34" stroke-width="1.4" fill="none"/>` +
        `<path d="M44 64c0-10 40-10 40 0v6c0 3-3 5-6 5H50c-3 0-6-2-6-5Z" fill="#1a1e16" stroke="#56684a" stroke-width="1.2"/>` +
        `<circle cx="54" cy="66" r="9" fill="#6dff4a" opacity=".35" filter="url(#glow)"/><circle cx="74" cy="66" r="9" fill="#6dff4a" opacity=".35" filter="url(#glow)"/>` +
        `<circle cx="54" cy="66" r="7" fill="#0a0d08" stroke="#6b7d55" stroke-width="1.6"/><circle cx="74" cy="66" r="7" fill="#0a0d08" stroke="#6b7d55" stroke-width="1.6"/>` +
        `<circle cx="54" cy="66" r="4.6" fill="url(#ln)"/><circle cx="74" cy="66" r="4.6" fill="url(#ln)"/>` +
        `<circle cx="52.5" cy="64.5" r="1.2" fill="#fff"/><circle cx="72.5" cy="64.5" r="1.2" fill="#fff"/>` +
        `<rect x="61" y="45" width="6" height="15" rx="1" fill="#2c3526" stroke="#4d5c3e"/>` +
        `<path d="M37 60C37 28 91 28 91 60l4 2c0 4-3 5-6 3H39c-3 2-6 1-6-3Z" fill="url(#hm)"/>` +
        `<path d="M45 41c8-8 26-9 37-2" stroke="#8a9c74" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>` +
        `<rect x="57" y="38" width="14" height="7" rx="2" fill="#20271a" stroke="#4d5c3e"/>` +
        `<path d="M41 64l5 20M87 64l-5 20" stroke="#232b1c" stroke-width="3" stroke-linecap="round"/>`,
    }),

  "tactical-sniper": () =>
    frame({
      bg: ["#5a4a2a", "#241c0e", "#080603"],
      light: "60% 35%",
      defs:
        L("hd", 0, 0, 0, 1, [0, "#5d5a3a"], [1, "#1e1d12"]) +
        L("sk", 0, 0, 1, 1, [0, "#c99a74"], [1, "#7a5338"]) +
        L("sc", 0, 0, 0, 1, [0, "#3a3f44"], [0.5, "#15181b"], [1, "#2a2e33"]) +
        R("lens", 0.35, 0.35, 0.7, [0, "#ffd0c8"], [0.3, "#ff3b2f"], [1, "#3a0703"]),
      fx:
        `<g stroke="#ff4433" fill="none" opacity=".28"><circle cx="64" cy="64" r="50"/><circle cx="64" cy="64" r="34"/><path d="M64 4v40M64 84v40M4 64h40M84 64h40" stroke-width="1.2"/></g>` +
        `<g stroke="#ff4433" opacity=".3"><path d="M60 24h8M58 34h12M60 94h8M58 104h12"/></g>`,
      body:
        // ghillie hood strands
        `<path d="M14 128c0-20 10-38 18-48-6-26 10-50 32-50s38 24 32 50c8 10 18 28 18 48Z" fill="url(#hd)"/>` +
        `<g stroke="#7a7448" stroke-width="2" stroke-linecap="round" opacity=".8"><path d="M30 60l-6-8M28 76l-9-4M34 44l-4-10M46 32l-2-10M62 28v-9M80 32l3-10M94 44l5-9M100 60l7-6M100 78l9-3M22 96l-8 2M106 96l8 2"/></g>` +
        `<g stroke="#3e3c24" stroke-width="2" stroke-linecap="round"><path d="M36 52l-5-5M40 40l-3-6M88 40l3-6M93 52l5-5M24 88l-6-2M104 88l6-2"/></g>` +
        `<ellipse cx="64" cy="70" rx="19" ry="22" fill="url(#sk)"/>` +
        `<path d="M45 64c6-3 12-3 18 0M46 74l36-6M48 82l32-5" stroke="#2d3a1e" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M58 84q6 3 12 0" stroke="#4a2c1d" stroke-width="1.6" fill="none"/>` +
        `<ellipse cx="55" cy="66" rx="3" ry="2" fill="#1a120c"/>` +
        // scope over right eye
        `<rect x="66" y="58" width="44" height="15" rx="4" fill="url(#sc)" transform="rotate(-8 66 66)"/>` +
        `<rect x="90" y="54" width="7" height="22" rx="2" fill="#2a2e33" transform="rotate(-8 93 65)"/>` +
        `<circle cx="72" cy="66" r="11" fill="#101215" stroke="#4b5158" stroke-width="2"/>` +
        `<circle cx="72" cy="66" r="12" fill="#ff3b2f" opacity=".35" filter="url(#glow)"/>` +
        `<circle cx="72" cy="66" r="7.5" fill="url(#lens)"/>` +
        `<path d="M68 62.5a5 5 0 0 1 5-2" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        // rifle stock at bottom
        `<path d="M20 116l64-16 6 6-60 22H20Z" fill="#3b3524"/><path d="M28 120l52-14" stroke="#5c5338" stroke-width="1.5"/>`,
    }),

  "spec-ops-operator": () =>
    frame({
      bg: ["#3b5a78", "#152536", "#04080d"],
      defs:
        L("hm", 0, 0, 0, 1, [0, "#4a5560"], [1, "#1a1f24"]) +
        L("sk", 0, 0, 1, 1, [0, "#d9a882"], [1, "#8d5d3e"]) +
        L("gl", 0, 0, 1, 0, [0, "#ff9a2e"], [0.5, "#ffd46b"], [1, "#ff5c1a"]) +
        L("pc", 0, 0, 0, 1, [0, "#3a4550"], [1, "#11161b"]),
      fx: hexes("#7fb6ff", { op: 0.1, size: 13 }) + speed(3, { op: 0.12, color: "#9cc7ff" }),
      body:
        `<path d="M6 128c4-24 28-36 58-36s54 12 58 36Z" fill="url(#pc)"/>` +
        `<rect x="40" y="100" width="48" height="28" rx="4" fill="#232b33" stroke="#4b5866"/>` +
        `<rect x="45" y="106" width="10" height="13" rx="1.5" fill="#2e3842"/><rect x="59" y="106" width="10" height="13" rx="1.5" fill="#2e3842"/><rect x="73" y="106" width="10" height="13" rx="1.5" fill="#2e3842"/>` +
        `<rect x="20" y="106" width="14" height="10" rx="2" fill="#3c4a2e"/><path d="M22 111h10" stroke="#a3c46e" stroke-width="1.2"/>` +
        `<path d="M50 84h28l2 12H48Z" fill="#7a5038"/>` +
        `<path d="M43 64c0 18 9 28 21 28s21-10 21-28-9-22-21-22-21 4-21 22Z" fill="url(#sk)"/>` +
        // beard
        `<path d="M44 72c2 14 10 22 20 22s18-8 20-22c-4 6-8 6-12 5-3 3-13 3-16 0-4 1-8 1-12-5Z" fill="#3a2618"/>` +
        `<path d="M57 79q7 3 14 0" stroke="#1d120b" stroke-width="2" fill="none" stroke-linecap="round"/>` +
        // glasses
        `<path d="M42 60h44v4c0 6-4 9-9 9h-6c-3 0-5-3-7-5-2 2-4 5-7 5h-6c-5 0-9-3-9-9Z" fill="url(#gl)"/>` +
        `<path d="M42 60h44" stroke="#1b1b1b" stroke-width="2.4"/>` +
        `<path d="M47 63l8 0M73 63l8 0" stroke="#fff6d8" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>` +
        // helmet
        `<path d="M38 58c0-24 12-34 26-34s26 10 26 34Z" fill="url(#hm)"/>` +
        `<path d="M38 58h52" stroke="#0f1215" stroke-width="2"/>` +
        `<rect x="56" y="30" width="16" height="8" rx="2" fill="#22282e" stroke="#56626e"/>` +
        `<path d="M44 40c6-8 22-11 34-4" stroke="#7d8b99" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>` +
        // headset cups + mic
        `<rect x="32" y="52" width="10" height="20" rx="5" fill="#1d2329" stroke="#56626e"/>` +
        `<rect x="86" y="52" width="10" height="20" rx="5" fill="#1d2329" stroke="#56626e"/>` +
        `<path d="M37 70c0 10 6 14 14 14" stroke="#1d2329" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="52" cy="84" r="2.6" fill="#1d2329"/>` +
        `<circle cx="91" cy="56" r="1.3" fill="#4dff6a"/>`,
    }),

  "gas-mask-trooper": () =>
    frame({
      bg: ["#6f7a1a", "#252c08", "#070902"],
      defs:
        L("hood", 0, 0, 0, 1, [0, "#3d4030"], [1, "#121309"]) +
        L("mask", 0, 0, 0, 1, [0, "#4a4f46"], [1, "#1b1e19"]) +
        L("can", 0, 0, 1, 0, [0, "#2a2d27"], [0.5, "#6d7266"], [1, "#22251f"]) +
        R("lens", 0.4, 0.35, 0.65, [0, "#fffbd0"], [0.4, "#ffd11f"], [1, "#6b4300"]),
      fx:
        `<g fill="#c8ff3a" opacity=".16" filter="url(#soft)"><circle cx="20" cy="100" r="22"/><circle cx="108" cy="96" r="24"/><circle cx="64" cy="122" r="26"/><circle cx="30" cy="30" r="14"/></g>` +
        `<path d="M64 14l7 12H57Z" fill="none" stroke="#e6ff4a" stroke-width="1.4" opacity=".3"/>`,
      body:
        `<path d="M6 128c2-30 20-44 30-50-4-32 10-56 28-56s32 24 28 56c10 6 28 20 30 50Z" fill="url(#hood)"/>` +
        `<path d="M30 128c2-14 10-22 20-26M98 128c-2-14-10-22-20-26" stroke="#4f533d" stroke-width="1.5" fill="none"/>` +
        `<rect x="18" y="110" width="20" height="9" rx="2" fill="#f2c200"/><path d="M20 112l4 5M26 112l4 5M32 112l4 5" stroke="#1a1a10" stroke-width="2"/>` +
        `<path d="M40 60c0-18 10-26 24-26s24 8 24 26c0 18-6 32-24 36-18-4-24-18-24-36Z" fill="url(#mask)"/>` +
        `<path d="M42 54c4-10 12-14 22-14s18 4 22 14" stroke="#6b7262" stroke-width="1.4" fill="none" opacity=".7"/>` +
        `<ellipse cx="53" cy="60" rx="10" ry="9" fill="#ffd11f" opacity=".4" filter="url(#glow)"/><ellipse cx="75" cy="60" rx="10" ry="9" fill="#ffd11f" opacity=".4" filter="url(#glow)"/>` +
        `<ellipse cx="53" cy="60" rx="9" ry="8" fill="#141612" stroke="#8a907f" stroke-width="2"/><ellipse cx="75" cy="60" rx="9" ry="8" fill="#141612" stroke="#8a907f" stroke-width="2"/>` +
        `<ellipse cx="53" cy="60" rx="6.5" ry="5.6" fill="url(#lens)"/><ellipse cx="75" cy="60" rx="6.5" ry="5.6" fill="url(#lens)"/>` +
        `<path d="M49 57.5l3-2M71 57.5l3-2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>` +
        `<path d="M58 70h12l3 9H55Z" fill="#2a2d27" stroke="#6d7266"/>` +
        `<rect x="54" y="78" width="20" height="18" rx="4" fill="url(#can)"/>` +
        `<path d="M54 83h20M54 88h20M54 93h20" stroke="#1a1c17" stroke-width="1.2"/>` +
        `<circle cx="42" cy="76" r="5" fill="url(#can)"/><circle cx="86" cy="76" r="5" fill="url(#can)"/>` +
        `<path d="M40 60c-3 0-6 3-6 7M88 60c3 0 6 3 6 7" stroke="#232619" stroke-width="3" fill="none"/>`,
    }),

  "spartan-hoplite": () =>
    frame({
      bg: ["#ffb23d", "#a1300f", "#2a0502"],
      light: "50% 55%",
      defs:
        L("br", 0, 0, 1, 1, [0, "#ffe09a"], [0.35, "#d69a3c"], [0.7, "#8a5418"], [1, "#4a2a08"]) +
        L("cr", 0, 0, 0, 1, [0, "#ff3b2a"], [1, "#7a0b05"]) +
        L("sh", 0, 0, 1, 1, [0, "#b5772a"], [1, "#4a2a08"]),
      fx: rays("#ffe2a0", { op: 0.12, cy: 70, n: 16 }) + embers(5, { color: "#ffdd88", n: 16 }),
      body:
        // shield rim behind
        `<circle cx="64" cy="112" r="52" fill="url(#sh)" stroke="#e6b25a" stroke-width="3"/>` +
        `<path d="M44 120l20-34 20 34Z" fill="none" stroke="#3a1d06" stroke-width="3" opacity=".6"/>` +
        // crest
        `<path d="M26 54C24 14 104 14 102 54l-12-2C88 30 40 30 38 52Z" fill="url(#cr)"/>` +
        `<g stroke="#ff8a6e" stroke-width="1.2" opacity=".55" fill="none"><path d="M32 44C34 22 94 22 96 44"/><path d="M30 36C38 18 90 18 98 36"/><path d="M36 30C46 20 82 20 92 30"/></g>` +
        `<g stroke="#5a0703" stroke-width="1" opacity=".6"><path d="M40 24l-3 8M52 19l-2 9M64 18v9M76 19l2 9M88 24l3 8"/></g>` +
        `<rect x="40" y="38" width="48" height="5" rx="2" fill="#3a1d06"/>` +
        // helmet
        `<path d="M38 56c0-16 12-18 26-18s26 2 26 18v24c0 10-4 18-12 22l-4-26h-20l-4 26c-8-4-12-12-12-22Z" fill="url(#br)"/>` +
        // T opening
        `<path d="M44 58h40c0 4-6 8-14 8v26h-12V66c-8 0-14-4-14-8Z" fill="#120502"/>` +
        `<path d="M48 61h12M68 61h12" stroke="#ff6a2a" stroke-width="2.2" stroke-linecap="round" filter="url(#glow)"/>` +
        `<path d="M48 61h12M68 61h12" stroke="#ffd0a0" stroke-width="1" stroke-linecap="round"/>` +
        `<path d="M42 50c6-6 16-8 22-8" stroke="#fff1c4" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M40 72c2 8 4 14 8 18M88 72c-2 8-4 14-8 18" stroke="#ffe09a" stroke-width="1.2" fill="none" opacity=".5"/>`,
    }),

  "viking-berserker": () =>
    frame({
      bg: ["#7ab8d9", "#20435a", "#050c12"],
      defs:
        L("hm", 0, 0, 0, 1, [0, "#c9ced3"], [0.5, "#717980"], [1, "#2c3136"]) +
        L("sk", 0, 0, 1, 1, [0, "#e8b896"], [1, "#9a6446"]) +
        L("bd", 0, 0, 0, 1, [0, "#ff8a2a"], [1, "#9a3d0a"]) +
        L("fur", 0, 0, 0, 1, [0, "#6a5240"], [1, "#2a1d12"]) +
        L("ax", 0, 0, 1, 0, [0, "#cfd6dc"], [1, "#6f7880"]),
      fx: stars(9, { n: 22, color: "#e6f6ff", maxR: 1.4 }) + `<path d="M0 100l20-14 18 10 26-22 24 18 18-12 22 16v34H0Z" fill="#0f2230" opacity=".7"/>`,
      body:
        // crossed axes
        `<g><path d="M18 30l78 84" stroke="#5a3b22" stroke-width="4" stroke-linecap="round"/><path d="M110 30l-78 84" stroke="#5a3b22" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M12 22c6 2 14 10 16 18l-8 6c-4-6-8-14-8-24Z" fill="url(#ax)"/><path d="M116 22c-6 2-14 10-16 18l8 6c4-6 8-14 8-24Z" fill="url(#ax)"/></g>` +
        `<path d="M10 128c4-22 24-34 54-34s50 12 54 34Z" fill="url(#fur)"/>` +
        `<g stroke="#8a6c52" stroke-width="1.6" stroke-linecap="round" opacity=".7"><path d="M20 110l4-8M30 104l3-8M98 104l-3-8M108 110l-4-8M40 100l2-7M88 100l-2-7"/></g>` +
        `<ellipse cx="64" cy="66" rx="20" ry="22" fill="url(#sk)"/>` +
        // war paint
        `<path d="M46 60h36v7H46Z" fill="#1c3f6e" opacity=".85"/>` +
        `<path d="M52 63.5l6-1M70 62.5l6 1" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M50 58l9 2M78 58l-9 2" stroke="#4a2410" stroke-width="2.6" stroke-linecap="round"/>` +
        // beard
        `<path d="M42 70c0 22 10 38 22 46 12-8 22-24 22-46-6 6-14 8-22 8s-16-2-22-8Z" fill="url(#bd)"/>` +
        `<path d="M56 96l2 14M64 96v20M72 96l-2 14" stroke="#ffc07a" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>` +
        `<circle cx="58" cy="106" r="2.4" fill="#cfd6dc"/><circle cx="70" cy="106" r="2.4" fill="#cfd6dc"/>` +
        `<path d="M54 76c4 3 16 3 20 0" stroke="#7a2d06" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<path d="M58 80q6 3 12 0" stroke="#3a1505" stroke-width="2" fill="none"/>` +
        // helmet with nose guard
        `<path d="M42 58c0-22 10-32 22-32s22 10 22 32Z" fill="url(#hm)"/>` +
        `<path d="M42 58h44" stroke="#3b2a1a" stroke-width="4"/>` +
        `<path d="M64 26v32" stroke="#a9b0b7" stroke-width="3"/>` +
        `<path d="M61 56h6l-1 16h-4Z" fill="url(#hm)"/>` +
        `<g fill="#c9a55a"><circle cx="48" cy="58" r="1.4"/><circle cx="56" cy="58" r="1.4"/><circle cx="72" cy="58" r="1.4"/><circle cx="80" cy="58" r="1.4"/></g>` +
        `<path d="M48 38c4-6 10-9 15-10" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`,
    }),

  "samurai-ronin": () =>
    frame({
      bg: ["#f2e4c4", "#c9a77a", "#3a2412"],
      light: "50% 30%",
      defs:
        L("hat", 0, 0, 0, 1, [0, "#e3c27c"], [1, "#7a5a26"]) +
        L("rb", 0, 0, 0, 1, [0, "#2b2b3a"], [1, "#0d0d14"]) +
        R("sun", 0.5, 0.5, 0.5, [0, "#ff5a3a"], [1, "#c2160b"]),
      fx:
        `<circle cx="64" cy="44" r="36" fill="url(#sun)"/>` +
        `<g fill="#ff9fb8" opacity=".9"><ellipse cx="18" cy="30" rx="3" ry="1.6" transform="rotate(30 18 30)"/><ellipse cx="108" cy="22" rx="3" ry="1.6" transform="rotate(-20 108 22)"/><ellipse cx="112" cy="70" rx="2.6" ry="1.4" transform="rotate(50 112 70)"/><ellipse cx="14" cy="80" rx="2.6" ry="1.4" transform="rotate(-40 14 80)"/><ellipse cx="96" cy="44" rx="2" ry="1.1"/></g>` +
        `<path d="M0 96c20-6 30-14 44-10s24 10 40 6 30-8 44-4v40H0Z" fill="#5a3a20" opacity=".6"/>`,
      body:
        // katana over shoulder
        `<path d="M92 128L118 18" stroke="#dfe6ec" stroke-width="3" stroke-linecap="round"/><path d="M92 128l4-18" stroke="#1a1a24" stroke-width="5" stroke-linecap="round"/>` +
        `<rect x="92" y="104" width="12" height="4" rx="1" fill="#c9a24a" transform="rotate(-77 98 106)"/>` +
        `<path d="M10 128c4-24 26-36 54-36s50 12 54 36Z" fill="url(#rb)"/>` +
        `<path d="M50 94l14 22 14-22" fill="none" stroke="#e8e0cc" stroke-width="3"/>` +
        `<path d="M44 96l20 32 20-32" fill="none" stroke="#7a1d1d" stroke-width="2.4"/>` +
        `<path d="M50 72c0 12 6 20 14 20s14-8 14-20Z" fill="#2a1b12"/>` +
        `<path d="M50 72c2 8 6 14 14 14s12-6 14-14" fill="#c48f68"/>` +
        `<path d="M58 82q6 2 12 0" stroke="#4a2a18" stroke-width="1.4" fill="none"/>` +
        // hat (kasa)
        `<path d="M8 74L64 30l56 44c-12 6-34 8-56 8S20 80 8 74Z" fill="url(#hat)"/>` +
        `<g stroke="#8a6630" stroke-width="1" opacity=".7" fill="none"><path d="M64 30L28 79M64 30L46 81M64 30v52M64 30l18 51M64 30l36 49"/><path d="M22 64c12 4 28 6 42 6s30-2 42-6M36 52c10 3 18 4 28 4s18-1 28-4"/></g>` +
        `<path d="M8 74c12 6 34 8 56 8s44-2 56-8" stroke="#5a3d16" stroke-width="2" fill="none"/>` +
        `<path d="M50 72c4 1 10 1 14 1s10 0 14-1" stroke="#000" stroke-width="5" opacity=".5"/>` +
        `<path d="M57 76h5M66 76h5" stroke="#ffe6c6" stroke-width="1.8" stroke-linecap="round"/>`,
    }),

  "shadow-ninja": () =>
    frame({
      bg: ["#5b3a9a", "#1c1236", "#05030c"],
      light: "70% 25%",
      defs:
        L("cl", 0, 0, 0, 1, [0, "#2c2a3c"], [1, "#0a0910"]) +
        L("bd", 0, 0, 1, 0, [0, "#e0283a"], [1, "#8a0c18"]) +
        L("sk", 0, 0, 0, 1, [0, "#d9a985"], [1, "#9a6a4a"]) +
        L("st", 0, 0, 1, 1, [0, "#e6ecf2"], [1, "#6b7480"]),
      fx:
        `<circle cx="94" cy="30" r="17" fill="#f3ecff" opacity=".9"/><circle cx="99" cy="26" r="15" fill="#3a2a66" opacity=".35"/>` +
        stars(21, { n: 24, color: "#d8ccff", yMax: 70 }) +
        `<path d="M0 104h20v-12h10v-8h12v20h10V90h8v14h68v24H0Z" fill="#0b0716" opacity=".85"/>`,
      body:
        `<path d="M10 128c4-26 26-38 54-38s50 12 54 38Z" fill="url(#cl)"/>` +
        `<path d="M40 100c8 8 40 8 48 0" stroke="#3a3850" stroke-width="2" fill="none"/>` +
        `<path d="M40 64c0-22 10-34 24-34s24 12 24 34-10 32-24 32-24-10-24-32Z" fill="url(#cl)"/>` +
        // eye slit
        `<path d="M43 58c8-3 34-3 42 0v10c-8 3-34 3-42 0Z" fill="url(#sk)"/>` +
        `<path d="M48 63c3-3 7-3 10 0-3 2-7 2-10 0ZM70 63c3-3 7-3 10 0-3 2-7 2-10 0Z" fill="#120d1c"/>` +
        `<circle cx="53" cy="62.6" r="1" fill="#fff"/><circle cx="75" cy="62.6" r="1" fill="#fff"/>` +
        `<path d="M47 58.5l12 2M81 58.5l-12 2" stroke="#2b1d14" stroke-width="2" stroke-linecap="round"/>` +
        // headband + tails
        `<path d="M40 52c8-4 40-4 48 0v5c-8-3-40-3-48 0Z" fill="url(#bd)"/>` +
        `<path d="M86 54c10 0 20 6 28 2-6 6-16 6-24 2 6 6 14 10 22 10-10 2-20-2-26-10Z" fill="url(#bd)"/>` +
        `<path d="M44 74c6 4 34 4 40 0" stroke="#3a3850" stroke-width="1.4" fill="none"/>` +
        // shuriken
        `<g transform="translate(26 30) rotate(15)"><path d="M0-12l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="url(#st)"/><circle r="2.2" fill="#1c1236"/></g>`,
    }),

  "masked-gladiator": () =>
    frame({
      bg: ["#e6b26a", "#8a4f1e", "#1f0d04"],
      light: "50% 65%",
      defs:
        L("hm", 0, 0, 1, 1, [0, "#f0f0ea"], [0.4, "#a9a59a"], [1, "#3e3b35"]) +
        L("gd", 0, 0, 1, 1, [0, "#ffe9a0"], [0.5, "#c9922e"], [1, "#6a420a"]) +
        L("fin", 0, 0, 0, 1, [0, "#d9b64a"], [1, "#7a5214"]) +
        L("ch", 0, 0, 0, 1, [0, "#8a5a36"], [1, "#3a2010"]),
      fx:
        `<path d="M0 46h128v4H0ZM0 30h128v2H0Z" fill="#fff0d0" opacity=".12"/>` +
        `<g fill="#5a2f10" opacity=".55"><path d="M0 52h12v40H0ZM20 52h12v40H20ZM40 52h12v40H40ZM76 52h12v40H76ZM96 52h12v40H96ZM116 52h12v40h-12Z"/></g>` +
        embers(14, { color: "#ffd9a0", n: 20, yMin: 70 }),
      body:
        `<path d="M10 128c4-22 26-32 54-32s50 10 54 32Z" fill="url(#ch)"/>` +
        `<path d="M14 118c10-14 24-20 34-22l-4 32H16Z" fill="url(#gd)"/>` +
        `<g fill="#6a420a"><circle cx="26" cy="112" r="1.6"/><circle cx="34" cy="106" r="1.6"/><circle cx="40" cy="116" r="1.6"/></g>` +
        `<path d="M48 90h32l-4 10H52Z" fill="#3a2010"/>` +
        // crest fin
        `<path d="M64 10c-14 4-22 16-22 30h44c0-14-8-26-22-30Z" fill="url(#fin)"/>` +
        `<path d="M64 12v28" stroke="#ffe9a0" stroke-width="1.5" opacity=".6"/>` +
        `<g stroke="#7a5214" stroke-width="1" opacity=".7"><path d="M52 20l4 20M76 20l-4 20M46 30l4 10M82 30l-4 10"/></g>` +
        // helmet with wide brim
        `<path d="M24 66c0-6 6-8 12-8 0-14 12-22 28-22s28 8 28 22c6 0 12 2 12 8s-6 6-12 6v16c0 6-12 10-28 10S36 94 36 88V72c-6 0-12 0-12-6Z" fill="url(#hm)"/>` +
        `<path d="M24 66c10 3 22 4 40 4s30-1 40-4" stroke="#3e3b35" stroke-width="1.6" fill="none"/>` +
        // grille visor
        `<path d="M42 58c0-6 10-10 22-10s22 4 22 10v26c-6 4-14 6-22 6s-16-2-22-6Z" fill="#100c08"/>` +
        `<g fill="url(#gd)"><circle cx="49" cy="58" r="2.6"/><circle cx="57" cy="56" r="2.6"/><circle cx="64" cy="56" r="2.6"/><circle cx="71" cy="56" r="2.6"/><circle cx="79" cy="58" r="2.6"/>` +
        `<circle cx="49" cy="67" r="2.6"/><circle cx="57" cy="65" r="2.6"/><circle cx="71" cy="65" r="2.6"/><circle cx="79" cy="67" r="2.6"/>` +
        `<circle cx="49" cy="76" r="2.6"/><circle cx="57" cy="76" r="2.6"/><circle cx="64" cy="76" r="2.6"/><circle cx="71" cy="76" r="2.6"/><circle cx="79" cy="76" r="2.6"/></g>` +
        `<circle cx="64" cy="65" r="2.6" fill="#ff7a2a" filter="url(#glow)"/>` +
        `<path d="M64 48v42" stroke="url(#gd)" stroke-width="2.2"/>` +
        `<path d="M42 44c6-6 14-8 22-8" stroke="#fff" stroke-width="2" fill="none" opacity=".75" stroke-linecap="round"/>`,
    }),

  "crusader-knight": () =>
    frame({
      bg: ["#3a6fd8", "#13265a", "#03070f"],
      light: "50% 35%",
      defs:
        L("hm", 0, 0, 1, 0, [0, "#4a525c"], [0.3, "#e6ebf0"], [0.55, "#9aa3ad"], [1, "#2c323a"]) +
        L("tb", 0, 0, 0, 1, [0, "#f2efe6"], [1, "#a39e90"]) +
        L("gd", 0, 0, 0, 1, [0, "#ffe7a0"], [1, "#b47d1c"]),
      fx:
        // stained glass window
        `<path d="M34 128V44c0-20 13-32 30-32s30 12 30 32v84Z" fill="#0e1d44" opacity=".8"/>` +
        `<g opacity=".55"><path d="M40 60V46c0-14 10-26 24-26v40Z" fill="#c4245a"/><path d="M88 60V46c0-14-10-26-24-26v40Z" fill="#2aa3d8"/><path d="M40 60h24v30H40Z" fill="#e6b52e"/><path d="M64 60h24v30H64Z" fill="#3ec46a"/></g>` +
        `<path d="M64 20v108M40 60h48M40 90h48" stroke="#030712" stroke-width="2.5" opacity=".7"/>` +
        rays("#cfe0ff", { op: 0.07, cy: 30 }),
      body:
        `<path d="M10 128c4-22 26-32 54-32s50 10 54 32Z" fill="url(#tb)"/>` +
        `<path d="M58 98h12v30H58Z" fill="url(#gd)"/><path d="M46 108h36v8H46Z" fill="url(#gd)"/>` +
        `<path d="M10 128c2-12 8-20 16-24 4 8 4 16 2 24ZM118 128c-2-12-8-20-16-24-4 8-4 16-2 24Z" fill="#7d8792"/>` +
        // great helm
        `<path d="M40 40c0-10 10-16 24-16s24 6 24 16v46c0 6-10 10-24 10s-24-4-24-10Z" fill="url(#hm)"/>` +
        `<path d="M40 40c4-4 14-7 24-7s20 3 24 7" stroke="#2c323a" stroke-width="1.5" fill="none"/>` +
        // cross visor
        `<path d="M44 56h40v6H67v24h-6V62H44Z" fill="#05070b"/>` +
        `<path d="M46 58.5h14M68 58.5h14" stroke="#7ab8ff" stroke-width="1.6" stroke-linecap="round" opacity=".9" filter="url(#glow)"/>` +
        `<g fill="#05070b"><circle cx="50" cy="74" r="1.2"/><circle cx="54" cy="78" r="1.2"/><circle cx="50" cy="82" r="1.2"/><circle cx="78" cy="74" r="1.2"/><circle cx="74" cy="78" r="1.2"/><circle cx="78" cy="82" r="1.2"/></g>` +
        `<path d="M40 48h48" stroke="url(#gd)" stroke-width="3"/><path d="M64 24v24" stroke="url(#gd)" stroke-width="3"/>` +
        `<path d="M48 30c4-2 8-3 12-3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
    }),
};
