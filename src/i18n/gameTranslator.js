/**
 * Runtime translation layer for the games.
 *
 * The 120+ games were written English-only and render text in three ways:
 * React/DOM (menus, HUDs, dialogs), SVG <text>, and Canvas 2D `fillText`
 * (canvas HUDs, and Three.js labels baked into canvas textures). Rather than
 * threading `t()` through ~750k lines of game code, each game gets a catalog
 * of its own source strings (generated from the code, see tools/i18n) and this
 * module swaps text at the presentation boundary:
 *
 *   - a MutationObserver on the game's root translates text nodes and the
 *     user-visible attributes (title, placeholder, aria-label, alt) as React or
 *     the game writes them, remembering the English original so switching back
 *     to English restores it in place;
 *   - CanvasRenderingContext2D.fillText / strokeText / measureText translate
 *     their string argument while a Russian catalog is active (measureText
 *     too, so a game's centring/wrapping maths measures the text it draws).
 *
 * Catalogs are per game and lazy (one small JSON chunk per game, loaded only
 * when that game opens in Russian). Matching order: exact string → the same
 * string with numbers lifted out ("Score: 42" → "Score: {0}") → template
 * patterns with arbitrary slots ("{0} wins"), whose slot values are themselves
 * translated ("White" → "Белые") → for text the game composes at runtime, the
 * separate pieces ("Level 10 (locked)", "a1, white rook"), then the longest
 * known phrases inside what is left.
 *
 * Text baked into a texture is only drawn once, so it cannot follow a language
 * switch: games that bake text are listed in BAKED_TEXT_GAMES and restart on a
 * switch (see GameRenderer).
 */

import { setActiveGameTranslator } from "./activeGameText.js";

const catalogLoaders = import.meta.glob(["./games/*.json", "!./games/_common.json"]);
const loadCommonCatalog = () => import("./games/_common.json");

const LETTER = /[A-Za-z]/;
const NUM = /\d+(?:\.\d+)?/g;
const MAX_CACHE = 4000;
// Runtime-composed text is split on these, keeping the separators.
const SEGMENTS = /(\s+[·•|—–/-]\s+|,\s+|:\s+|\s*[()[\]]\s*|\s+(?:vs\.?|VS)\s+)/;
const MAX_PHRASE_WORDS = 6;
// Word-by-word swapping is for labels. In a sentence it would leave a mix of
// languages, so sentences only ever change as a whole.
const MAX_LABEL_WORDS = 6;
// Short function words mean nothing on their own ("of" in "7 of Hearts").
const MIN_LONE_WORD = 4;
// A translation may run this much wider than the English it replaces before
// canvas text is condensed to fit the space the game laid out for it.
const MAX_WIDTH_GROWTH = 1.03;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fill(template, values) {
  return template.replace(/\{(\d+)\}/g, (m, i) => (values[i] !== undefined ? values[i] : m));
}

/**
 * Build a translate(str) function from a raw catalog { e: {...}, p: {...} },
 * layered over the shared `common` catalog (the game's own entries win).
 */
export function createTranslator(catalog, common = {}) {
  const exact = new Map([...Object.entries(common.e || {}), ...Object.entries(catalog.e || {})]);
  // Games often keep UI words as lowercase keys and capitalise them in CSS
  // ("medium", "Medium" → "MEDIUM"): match those case-insensitively too.
  const upper = new Map();
  const lower = new Map();
  for (const [en, ru] of exact) {
    const U = en.toUpperCase();
    if (U !== en && !exact.has(U)) upper.set(U, ru.toUpperCase());
    const L = en.toLowerCase();
    if (L !== en && !exact.has(L) && !lower.has(L)) lower.set(L, ru.toLowerCase());
  }
  const patterns = new Map([...Object.entries(common.p || {}), ...Object.entries(catalog.p || {})]);
  // Upper-cased templates, for games that shout their HUD ("LEVEL 3 OF 10").
  for (const [en, ru] of [...patterns]) {
    const U = en.toUpperCase();
    if (U !== en && !patterns.has(U)) patterns.set(U, ru.toUpperCase());
  }
  // Most specific (most literal text) first.
  const regexes = [...patterns.entries()]
    .map(([en, ru]) => {
      const literal = en.replace(/\{\d+\}/g, "");
      if ((literal.match(/[A-Za-z]/g) || []).length < 3) return null;
      // Two slots with nothing between them would cut words at arbitrary letters.
      if (en.includes("}{")) return null;
      const order = [];
      const src = en
        .split(/(\{\d+\})/)
        .map((part) => {
          const m = /^\{(\d+)\}$/.exec(part);
          if (m) {
            order.push(Number(m[1]));
            return "(.+?)";
          }
          return escapeRe(part);
        })
        .join("");
      return { re: new RegExp(`^${src}$`), ru, order, weight: literal.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);

  const cache = new Map();

  function lookupPhrase(core) {
    let hit = exact.get(core);
    if (hit !== undefined) return hit;
    hit = upper.get(core);
    if (hit !== undefined) return hit;
    return lower.get(core);
  }

  /** Swap the longest known phrases inside text no whole-string rule matched. */
  function translatePhrases(core) {
    const words = core.split(" ");
    if (words.length > MAX_LABEL_WORDS) return undefined;
    const out = [];
    let changed = false;
    for (let i = 0; i < words.length; ) {
      let taken = 0;
      for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1 && !taken; n--) {
        const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(words.slice(i, i + n).join(" "));
        if (!LETTER.test(m[2]) || (n === 1 && m[2].length < MIN_LONE_WORD && m[2] === m[2].toLowerCase())) continue;
        const hit = lookupPhrase(m[2]);
        if (hit === undefined) continue;
        out.push(m[1] + hit + m[3]);
        taken = n;
        changed = true;
      }
      if (!taken) out.push(words[i]);
      i += taken || 1;
    }
    return changed ? out.join(" ") : undefined;
  }

  function translateComposed(core) {
    const parts = core.split(SEGMENTS);
    let changed = false;
    const out = parts.map((part, i) => {
      if (i % 2 || !LETTER.test(part)) return part;
      const [, lead, text] = /^([^\p{L}\p{N}]*)(.*)$/su.exec(part);
      const hit = parts.length > 1 ? lookupCore(text, 2) : undefined;
      const res = hit ?? translatePhrases(text);
      if (res === undefined) return part;
      changed = true;
      return lead + res;
    });
    return changed ? out.join("") : undefined;
  }

  function lookupCore(core, depth) {
    let hit = lookupPhrase(core);
    if (hit !== undefined) return hit;

    const nums = [];
    const norm = core.replace(NUM, (n) => `{${nums.push(n) - 1}}`);
    if (nums.length) {
      hit = patterns.get(norm);
      if (hit !== undefined) return fill(hit, nums);
      hit = exact.get(norm);
      if (hit !== undefined) return fill(hit, nums);
    }

    if (depth > 1 || core.length > 400) return undefined;
    for (const { re, ru, order } of regexes) {
      const m = re.exec(core);
      if (!m) continue;
      const values = [];
      order.forEach((slot, gi) => {
        const raw = m[gi + 1];
        const inner = LETTER.test(raw) ? lookupCore(raw.trim(), depth + 1) ?? translateComposed(raw.trim()) : undefined;
        values[slot] = inner !== undefined ? raw.replace(raw.trim(), inner) : raw;
      });
      const filled = fill(ru, values);
      // Adjacent slots ("Level {0} {1}{2}") can split a word between them.
      return LETTER.test(filled) ? translatePhrases(filled) ?? filled : filled;
    }
    return depth === 0 ? translateComposed(core) : undefined;
  }

  return function translateGameText(str) {
    if (typeof str !== "string" || !LETTER.test(str)) return str;
    const cached = cache.get(str);
    if (cached !== undefined) return cached;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    const core = m[2].replace(/\s+/g, " ");
    const hit = lookupCore(core, 0);
    const out = hit === undefined ? str : m[1] + hit + m[3];
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(str, out);
    return out;
  };
}

/* ------------------------------------------------------------------ */
/* Catalog loading (Suspense-friendly)                                */
/* ------------------------------------------------------------------ */

const catalogCache = new Map(); // id -> { status, value, promise }

export function hasGameCatalog(id) {
  return Boolean(id && catalogLoaders[`./games/${id}.json`]);
}

/**
 * Starts (once) loading game `id`'s catalog and returns its cache entry:
 * { status: "pending", promise } while the chunk loads, then
 * { status: "ready", value: translator | null }. Returns null when the game
 * has no catalog. The caller decides whether to suspend on the promise.
 */
export function peekGameTranslator(id) {
  if (!hasGameCatalog(id)) return null;
  let entry = catalogCache.get(id);
  if (!entry) {
    entry = { status: "pending" };
    entry.promise = Promise.all([catalogLoaders[`./games/${id}.json`](), loadCommonCatalog()])
      .then(([mod, common]) => {
        entry.status = "ready";
        entry.value = createTranslator(mod.default || mod, common.default || common);
      })
      .catch((err) => {
        console.warn(`[i18n] could not load catalog for ${id}`, err);
        entry.status = "ready";
        entry.value = null;
      });
    catalogCache.set(id, entry);
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Canvas text                                                        */
/* ------------------------------------------------------------------ */

let activeCanvasTranslator = null;
let canvasPatched = false;

const fitWidths = new Map(); // font|en|ru -> widest the translation may be drawn

/** The English string's width (plus slack) when its translation runs wider. */
function fitWidth(ctx, measure, en, ru) {
  const key = `${ctx.font}|${en}|${ru}`;
  let w = fitWidths.get(key);
  if (w === undefined) {
    const room = measure.call(ctx, en).width * MAX_WIDTH_GROWTH;
    w = measure.call(ctx, ru).width > room ? room : 0;
    if (fitWidths.size >= MAX_CACHE) fitWidths.clear();
    fitWidths.set(key, w);
  }
  return w;
}

function patchCanvas() {
  if (canvasPatched || typeof window === "undefined") return;
  canvasPatched = true;
  const protos = [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]
    .filter(Boolean)
    .map((C) => C.prototype);
  for (const proto of protos) {
    const measure = proto.measureText;
    proto.measureText = function patchedMeasure(text) {
      const tr = activeCanvasTranslator;
      return measure.call(this, tr && typeof text === "string" ? tr(text) : text);
    };
    for (const name of ["fillText", "strokeText"]) {
      const original = proto[name];
      if (typeof original !== "function") continue;
      proto[name] = function patchedText(text, x, y, maxWidth) {
        const tr = activeCanvasTranslator;
        const out = tr && typeof text === "string" ? tr(text) : text;
        // Signs and labels were laid out around the English text.
        const fit = out !== text && maxWidth === undefined ? fitWidth(this, measure, text, out) : 0;
        if (fit) return original.call(this, out, x, y, fit);
        return maxWidth === undefined ? original.call(this, out, x, y) : original.call(this, out, x, y, maxWidth);
      };
    }
  }
}

/** Route canvas text through `translator` (or stop doing so with null). */
export function setCanvasTranslator(translator) {
  if (translator) patchCanvas();
  activeCanvasTranslator = translator || null;
  setActiveGameTranslator(translator);
}

/* ------------------------------------------------------------------ */
/* DOM text                                                           */
/* ------------------------------------------------------------------ */

const ATTRS = ["title", "placeholder", "aria-label", "alt", "aria-description"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE"]);

function isSkipped(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName)) return true;
    if (n.isContentEditable) return true;
    if (n.hasAttribute("data-no-i18n") || n.getAttribute("translate") === "no") return true;
  }
  return false;
}

/**
 * Keep everything under `root` translated with `translator` until the
 * returned `detach()` runs; detach restores the English originals.
 */
export function attachDomTranslator(root, translator) {
  const texts = new WeakMap(); // Text -> { o: original, t: translated }
  const attrs = new WeakMap(); // Element -> Map(attr -> { o, t })
  const touched = new Set(); // WeakRefs of touched nodes, for restore
  const remember = (node) => touched.add(new WeakRef(node));

  function doText(node) {
    const v = node.nodeValue;
    const rec = texts.get(node);
    if (rec && v === rec.t) return; // our own write
    if (!v || !LETTER.test(v) || isSkipped(node.parentElement)) return;
    const tr = translator(v);
    if (tr !== v) {
      if (!rec) remember(node);
      texts.set(node, { o: v, t: tr });
      node.nodeValue = tr;
    } else if (rec) {
      texts.delete(node);
    }
  }

  function doAttr(el, name) {
    const v = el.getAttribute(name);
    let map = attrs.get(el);
    const rec = map?.get(name);
    if (rec && v === rec.t) return;
    if (!v || !LETTER.test(v)) return;
    const tr = translator(v);
    if (tr === v) return;
    if (!map) {
      map = new Map();
      attrs.set(el, map);
      remember(el);
    }
    map.set(name, { o: v, t: tr });
    el.setAttribute(name, tr);
  }

  function doElement(el) {
    if (isSkipped(el)) return;
    for (const a of ATTRS) if (el.hasAttribute(a)) doAttr(el, a);
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.hasAttribute("value")) {
      doAttr(el, "value");
    }
  }

  function walk(node) {
    if (node.nodeType === 3) return doText(node);
    if (node.nodeType !== 1) return;
    doElement(node);
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === 3) doText(n);
      else doElement(n);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes") {
        const el = r.target;
        if (r.attributeName === "value" && !(el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type))) continue;
        if (!isSkipped(el)) doAttr(el, r.attributeName);
      } else r.addedNodes.forEach(walk);
    }
  });

  walk(root);
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS, "value"],
  });

  return function detach() {
    observer.disconnect();
    for (const ref of touched) {
      const node = ref.deref();
      if (!node) continue;
      if (node.nodeType === 3) {
        const rec = texts.get(node);
        if (rec && node.nodeValue === rec.t) node.nodeValue = rec.o;
      } else {
        attrs.get(node)?.forEach((rec, name) => {
          if (node.getAttribute(name) === rec.t) node.setAttribute(name, rec.o);
        });
      }
    }
    touched.clear();
  };
}
