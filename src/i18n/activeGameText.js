/**
 * The running game's translator, for the few places a game cuts a string up
 * before showing it (typewriter reveals, word wrapping, speech), where the
 * pieces could no longer be matched at the presentation boundary.
 *
 * Kept apart from gameTranslator.js so game modules can import it under the
 * plain Node test suites, which have no Vite `import.meta.glob`.
 */
let active = null;

export function setActiveGameTranslator(translator) {
  active = translator || null;
}

export function translateGameText(text) {
  return active ? active(text) : text;
}
