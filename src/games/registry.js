// Frontend-owned game registry.
//
// The backend stores game *metadata* only (name, description, type). The actual
// playable game is owned by the frontend. This map wires a backend game `id`
// (the Mongo ObjectId from GET /api/games) to something the client can render.
//
// Entry shapes:
//   { kind: "component", load: () => import("./Foo/Foo.jsx") }  // in-app React game
//   { kind: "iframe", src: "/games/foo/index.html" }            // bundled HTML build
//
// Keep the key = game.id (stable; names can be edited by the admin).
//
// Example (leave commented until a real game ships):
//   "665f2a1b9d1e4a0012a3b4d9": {
//     kind: "component",
//     load: () => import("./LightPuzzle/LightPuzzle.jsx"),
//   },

export const GAME_REGISTRY = {};

export function resolveGame(gameId) {
  return GAME_REGISTRY[gameId] ?? null;
}
