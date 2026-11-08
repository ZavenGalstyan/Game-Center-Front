/**
 * Extracts the user-facing English strings from a game's source tree:
 * JSX text, prose-looking string literals, and template literals / "+"
 * concatenations as "{0}"-slotted patterns ("Score: {0}"). Heuristic by
 * design — over-including only costs a translation entry, since catalogs are
 * applied at display time and never change program logic.
 *
 *   import { extractStrings } from "./extract.mjs";
 *   extractStrings("src/components/games/FlappyWings") // { exact, templates }
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;


const SKIP_DIRS = new Set(["tools", "node_modules", "__tests__", "test", "tests"]);
function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(d, e.name), acc); }
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !/simTest|soak|validate/i.test(e.name)) acc.push(path.join(d, e.name));
  }
  return acc;
}

const NON_TEXT_ATTRS = new Set(["className", "class", "style", "key", "id", "type", "src", "href", "d", "fill", "stroke", "viewBox", "xmlns", "points", "transform", "role", "name", "htmlFor", "ref", "method", "target", "rel", "autoComplete", "inputMode", "pattern", "accept", "lang", "dir", "fontFamily", "fontWeight", "textAnchor", "dominantBaseline", "strokeLinecap", "strokeLinejoin", "gradientUnits", "preserveAspectRatio", "clipPath", "mask", "filter", "markerEnd", "fillRule", "clipRule", "cursor", "draggable", "tabIndex", "position", "args", "attach", "color", "data-testid"]);

// Text with a named placeholder the game fills in itself: "Jump {n} times today".
const NAMED_SLOT = /\{[A-Za-z_]\w*\}/g;

// Is this a piece of prose a player would read?
function isProse(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^(https?:|\/|\.\/|\.\.\/|data:|#|rgba?\(|hsla?\(|url\()/.test(t)) return false;
  if (/\.(png|jpe?g|svg|gif|webp|mp3|ogg|wav|glb|gltf|json|jsx?|css|hdr|fbx|woff2?)(\?|$)/i.test(t)) return false;
  if (/\b\d+(\.\d+)?(px|em|rem|vh|vw|ms|deg)\b/.test(t)) return false; // css / font strings
  if (/[{}<]|=>|\(\)|\$\{|\bvar\(|!important/.test(t.replace(NAMED_SLOT, ""))) return false;
  if (/>/.test(t.replace(/^>\s/, ""))) return false;
  if (/;/.test(t) && (!/\s/.test(t) || /[\w-]+:\s*[^;\s]+;/.test(t))) return false; // css, not a sentence
  if (/^(bold|italic|normal|monospace|sans-serif|serif)\b/i.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;           // camelCase identifier / lowercase key
  if (/^[a-z0-9]+([_\-.:][a-z0-9]+)+$/i.test(t)) return false; // snake/kebab/dotted keys
  if (/^[A-Z0-9_]+$/.test(t) && t.includes("_")) return false; // CONST_KEYS
  if (/^(translate|scale|rotate|matrix|linear-gradient|radial-gradient|cubic-bezier|inset|solid|dashed|none|auto|inherit|center|flex|grid|absolute|relative|block|inline|hidden|visible|pointer|transparent)\b/.test(t)) return false;
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s,.\-MmLlHhVvCcSsQqTtAaZz]+$/.test(t)) return false; // svg path
  if (/^Key[A-Z]$|^Digit\d$|^Arrow(Up|Down|Left|Right)$|^(Shift|Control|Alt|Meta)(Left|Right)$|^(Space|Enter|Escape|Tab|Backspace)$/.test(t) && false) return false;
  if (isClassList(t)) return false;
  if (!/\s/.test(t) && (t.match(/[.#=|~^*]/g) || []).length >= 3) return false; // ascii level maps
  if (/^[XYZ]{3}$/.test(t)) return false; // euler orders
  if (/^(Key[A-Z]|Digit\d|Numpad\w*|(Shift|Control|Alt|Meta)(Left|Right))$/.test(t)) return false;
  if (/^[A-Za-z]+\d+[A-Za-z\d]*$/.test(t) && !/^(Level|Stage|Round|Wave|World|Chapter|Act|Room|Floor)\d/i.test(t)) return false; // ids like ab12
  if (/^[\w.-]+@[\w.-]+$/.test(t)) return false;
  // single lowercase word with no space: probably a key ("idle", "menu")
  if (!/\s/.test(t) && /^[a-z]/.test(t)) return false;
  return true;
}

let exact = new Map(); // text -> count
let templates = new Map(); // pattern -> count

function add(map, k) { map.set(k, (map.get(k) || 0) + 1); }

function inNonTextContext(p) {
  const parent = p.parent;
  if (!parent) return false;
  const t = parent.type;
  if (t === "ImportDeclaration" || t === "ExportNamedDeclaration" || t === "ExportAllDeclaration" || t === "ImportExpression") return true;
  if (t === "CallExpression" && parent.callee && (parent.callee.name === "require" || parent.callee.type === "Import")) return true;
  if ((t === "ObjectProperty" || t === "ObjectMethod" || t === "ClassProperty") && parent.key === p.node && !parent.computed) return true;
  if (t === "MemberExpression" && parent.property === p.node) return true;
  if (t === "BinaryExpression" && /^(===|!==|==|!=|in|instanceof)$/.test(parent.operator)) return true;
  if (t === "SwitchCase" && parent.test === p.node) return true;
  if (t === "JSXAttribute") {
    const n = parent.name && (parent.name.name || (parent.name.namespace && parent.name.name.name));
    if (typeof n === "string" && NON_TEXT_ATTRS.has(n)) return true;
  }
  if (t === "CallExpression" && parent.callee && parent.callee.property && /^(querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|getItem|setItem|removeItem|getContext|createElement|setAttribute|getAttribute|startsWith|endsWith|includes|indexOf|split|join|replace|replaceAll|match|test|getObjectByName|warn|error|log|debug|info|has|get|set|delete|add|setProperty|play|load|createShader|toFixed|padStart|padEnd|localeCompare)$/.test(parent.callee.property.name)) return true;
  if (t === "CallExpression" && parent.callee && /^(console|Symbol|RegExp|require|fetch|URL)$/.test(parent.callee.name || "")) return true;
  if (t === "NewExpression" && parent.callee && /^(Error|RegExp|URL|Worker|Audio|TypeError|RangeError)$/.test(parent.callee.name || "")) return true;
  if (t === "ThrowStatement") return true;
  if (t === "TaggedTemplateExpression") return true;
  if (t === "AssignmentExpression" && parent.left && parent.left.type === "MemberExpression" && parent.left.property && /^(font|fillStyle|strokeStyle|textAlign|textBaseline|globalCompositeOperation|lineCap|lineJoin|cursor|className|id|src|href|type|crossOrigin|filter|shadowColor|direction|fontKerning)$/.test(parent.left.property.name)) return true;
  return false;
}

// Flatten a '+' chain into parts: string | null (dynamic)
function flattenConcat(node, parts) {
  if (node.type === "BinaryExpression" && node.operator === "+") { flattenConcat(node.left, parts); flattenConcat(node.right, parts); }
  else if (node.type === "StringLiteral") parts.push(node.value);
  else if (node.type === "TemplateLiteral") tplParts(node, parts);
  else parts.push(null);
  return parts;
}
function tplParts(node, parts) {
  node.quasis.forEach((q, i) => {
    parts.push(q.value.cooked ?? q.value.raw);
    if (i < node.expressions.length) {
      const e = node.expressions[i];
      if (e.type === "StringLiteral") parts.push(e.value);
      else parts.push(null);
    }
  });
  return parts;
}
function partsToPattern(parts) {
  let s = "", n = 0, staticText = "";
  for (const p of parts) {
    if (p === null) { s += `{${n++}}`; }
    else { s += p; staticText += p; }
  }
  // collapse adjacent placeholders
  s = s.replace(/\}\{(\d+)\}/g, "}{$1}");
  return { s, n, staticText };
}
function handleParts(parts) {
  const { s, n, staticText } = partsToPattern(parts);
  if (n === 0) { if (isProse(s)) add(exact, s.trim() === s ? s : s); return; }
  const probe = staticText.replace(/\s+/g, " ").trim();
  if (!isProseTpl(s, probe)) return;
  add(templates, s);
}
function isClassList(t){const toks=t.replace(/\{\d+\}/g,"x").trim().split(/\s+/);return toks.every(k=>/^[a-z0-9]+([-_]+[a-z0-9]*)*$/.test(k))&&toks.some(k=>/[-_]/.test(k));}
function isProseTpl(s, probe) {
  if (isClassList(s)) return false;
  if (!/s/.test(probe.trim()) && !/[A-Z]/.test(probe)) return false;
  if (!/[A-Za-z]{2}/.test(probe)) return false;
  if (/[{};<>]|=>/.test(probe)) return false;
  if (/\b\d+(\.\d+)?(px|em|rem|vh|vw|ms|deg|%)\b|\bpx\b|\bdeg\b/.test(s.replace(/\{\d+\}/g, "0"))) return false;
  if (/^(https?:|\/|\.\/|#|rgba?\(|hsla?\(|url\(|translate|scale|rotate|matrix|linear-gradient|radial-gradient|M\s?\{)/.test(s.trim())) return false;
  if (/^(bold|italic|normal|\{\d+\}\s*(px|bold))/.test(s.trim())) return false;
  if (/(px|px \w+|em)\s/.test(s)) return false;
  if (/[a-z0-9]_[a-z0-9]|^[\w-]+:\{|^\{\d+\}[-_:.][\w{}-]*$|^[\w-]*[-_:.]\{\d+\}/.test(s.trim()) && !/\s/.test(s.trim())) return false;
  if (!/\s/.test(probe) && /^[a-z]/.test(probe)) return false;
  if (/\.(png|jpe?g|svg|mp3|ogg|wav|glb|json)/.test(s)) return false;
  return true;
}

export function extractStrings(dir) {
  exact = new Map();
  templates = new Map();

for (const f of walk(dir)) {
  const code = fs.readFileSync(f, "utf8");
  if (code.length > 3_000_000) continue;
  let ast;
  try { ast = parse(code, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "topLevelAwait"], errorRecovery: true }); }
  catch { continue; }
  traverse(ast, {
    JSXText(p) {
      const t = p.node.value.replace(/\s+/g, " ").trim();
      if (t && /[A-Za-z]{2}/.test(t)) add(exact, t);
    },
    StringLiteral(p) {
      if (p.parent.type === "BinaryExpression" && p.parent.operator === "+") return;
      if (p.parent.type === "TemplateLiteral") return;
      if (inNonTextContext(p)) return;
      if (isProse(p.node.value)) add(exact, p.node.value);
    },
    BinaryExpression(p) {
      if (p.node.operator !== "+") return;
      if (p.parent.type === "BinaryExpression" && p.parent.operator === "+") return;
      const parts = flattenConcat(p.node, []);
      if (!parts.some((x) => typeof x === "string")) return;
      if (inNonTextContext(p)) return;
      handleParts(parts);
    },
    TemplateLiteral(p) {
      if (p.parent.type === "BinaryExpression" && p.parent.operator === "+") return;
      if (inNonTextContext(p)) return;
      handleParts(tplParts(p.node, []));
    },
  });
}

// normalize whitespace forms: keep exact strings as written but also trimmed duplicates collapse
const ex = [...exact.keys()].map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
for (const s of ex.filter((x) => x.search(NAMED_SLOT) >= 0)) {
  let n = 0;
  add(templates, s.replace(NAMED_SLOT, () => `{${n++}}`));
}
const tp = [...templates.keys()].map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => /[A-Za-z]{2}/.test(s.replace(/\{\d+\}/g, "")));
const uniq = (a) => [...new Set(a)].sort();
const res = { exact: uniq(ex.filter((s) => !s.match(NAMED_SLOT))), templates: uniq(tp) };
  return res;
}
