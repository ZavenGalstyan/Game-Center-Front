import { L, frame } from "./lib.mjs";

// Neutral silhouette for unknown ids and failed loads (not part of the catalog).
export default {
  _fallback: () =>
    frame({
      bg: ["#3a4a48", "#162220", "#060b0b"],
      defs: L("sil", 0, 0, 0, 1, [0, "#8a9c98"], [1, "#3a4846"]),
      body:
        `<circle cx="64" cy="52" r="20" fill="url(#sil)"/>` +
        `<path d="M22 128c4-26 20-40 42-40s38 14 42 40Z" fill="url(#sil)"/>`,
    }),
};
