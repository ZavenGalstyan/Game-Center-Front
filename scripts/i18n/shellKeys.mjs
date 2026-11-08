/**
 * Lists the site-shell strings (everything outside src/components/games) and
 * reports which are missing from src/i18n/locales/ru.json.
 *
 *   node scripts/i18n/shellKeys.mjs           print missing keys
 *   node scripts/i18n/shellKeys.mjs --json    print missing keys as a JSON array
 *
 * Collected: the first argument of t()/tn()/tr()/translate() calls, plus prose
 * string literals (labels, validation and error messages, taglines, avatar
 * names...) that reach the screen through the translating UI primitives
 * (<Alert>, <FormField>, toasts, <Select> options...).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
const SKIP = new Set(["games", "i18n", "images", "assets"]);
// Backend game-type names: the sidebar, cards and tags translate them for display.
const CATEGORY_NAMES = ["Action", "Adventure", "Arcade", "Card", "Casual", "Escape Room", "Fighting", "Horror", "Logic", "Platformer", "Puzzle", "Racing", "RPG", "Shooter", "Simulation", "Sports", "Strategy", "Survival", "Player", "Moderator", "Admin"];

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(p);
    } else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);

const isProse = (v) =>
  /[A-Za-z]{2}/.test(v) &&
  !/^(linear|radial)-gradient|^rgba|^#|^https?:|^\.|^\//.test(v.trim()) &&
  !/[{}<>;]|=>/.test(v.replace(/\{\w+\}/g, "")) &&
  (/\s/.test(v.trim()) ? !/^[a-z0-9_-]+(\s[a-z0-9_-]+)*$/.test(v.trim()) || /\s[a-z]+\s/.test(v) : /^[A-Z][a-z]+[.!?…]?$/.test(v));

const keys = new Set(CATEGORY_NAMES);
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    CallExpression(p) {
      const name = p.node.callee.name;
      const a = p.node.arguments[0];
      if (/^(t|tn|tr|translate)$/.test(name || "") && a?.type === "StringLiteral") keys.add(a.value);
    },
    StringLiteral(p) {
      const v = p.node.value;
      const par = p.parentPath;
      if (par.isImportDeclaration() || par.isExportNamedDeclaration() || par.isExportAllDeclaration()) return;
      if (par.isObjectProperty() && par.node.key === p.node) return;
      if (par.isJSXAttribute() && /^(className|href|to|d|type|id|autoComplete|role|fill|stroke|viewBox|transform|points)$/.test(par.node.name.name)) return;
      if (par.isBinaryExpression() && /[=!]==?/.test(par.node.operator)) return;
      if (par.isMemberExpression()) return;
      if (par.isCallExpression() && par.node.callee.property && /^(warn|error|log|querySelector|querySelectorAll|matchMedia|test|getItem|setItem|removeItem|addEventListener|removeEventListener)$/.test(par.node.callee.property.name)) return;
      if (par.isCallExpression() && /^(matchMedia)$/.test(par.node.callee.name || "")) return;
      if (isProse(v)) keys.add(v);
    },
  });
}

const ru = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales/ru.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales/en.json"), "utf8"));
const missing = [...keys].filter((k) => !(k in ru)).sort();
if (process.argv.includes("--json")) console.log(JSON.stringify(missing, null, 1));
else {
  for (const k of missing) console.log(k);
  console.error(`${keys.size} shell keys, ${missing.length} missing in ru.json, ${Object.keys(en).length} English plural entries`);
}
