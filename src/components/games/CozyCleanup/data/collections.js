/**
 * Cozy Cleanup — collection metadata for Room Select. Collection 1 (Cozy
 * Home) ships fully playable. Collections 2-5 are outlined per the design
 * brief but not yet authored with real rooms — see the final report; they
 * show as "Coming soon" in Room Select rather than pretending to be
 * playable content.
 */
export const COLLECTIONS = [
  { id: 1, name: "Cozy Home", tagline: "Everyday rooms, everyday mess.", accent: "#c99a6c", available: true },
  { id: 2, name: "Dream Apartment", tagline: "Stylish spaces, a little more polish.", accent: "#7a9cc9", available: false },
  { id: 3, name: "Sweet Café", tagline: "Tables, counters and a coffee station.", accent: "#c9825a", available: false },
  { id: 4, name: "Boutique Hotel", tagline: "Suites, lobbies and a spa room.", accent: "#8fae86", available: false },
  { id: 5, name: "Luxury House", tagline: "The biggest, most detailed rooms yet.", accent: "#c98fae", available: false },
];

export function getCollection(id) {
  return COLLECTIONS.find((c) => c.id === id) || null;
}
