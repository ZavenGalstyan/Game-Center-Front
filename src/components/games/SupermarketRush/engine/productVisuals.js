/**
 * Supermarket Rush — visual "recipe" for each product: one or two simple
 * primitive parts (a box or a cylinder body, sometimes a smaller cap/label
 * part in a contrasting color) so the 15 SKUs read as genuinely different
 * objects on a shelf rather than 15 identically-colored cubes. Sizes are in
 * meters. Kept as plain data so three/ProductInstances.jsx can build one
 * shared geometry + one InstancedMesh per (product, part) — see its header.
 */
export const PRODUCT_VISUALS = {
  cereal: { body: { type: "box", size: [0.13, 0.22, 0.07], color: "#e2b23c" }, cap: { type: "box", size: [0.13, 0.035, 0.072], color: "#c0392b", offsetY: 0.125 } },
  bread: { body: { type: "box", size: [0.17, 0.1, 0.095], color: "#d9a05b" }, cap: null },
  coffee: { body: { type: "cylinder", size: [0.045, 0.045, 0.14], color: "#3d2618" }, cap: { type: "cylinder", size: [0.046, 0.046, 0.022], color: "#c0392b", offsetY: 0.081 } },

  water: { body: { type: "cylinder", size: [0.035, 0.045, 0.18], color: "#bfe3ee" }, cap: { type: "cylinder", size: [0.013, 0.013, 0.02], color: "#2f8fc4", offsetY: 0.1 } },
  juice: { body: { type: "cylinder", size: [0.04, 0.05, 0.15], color: "#e08b1e" }, cap: { type: "cylinder", size: [0.02, 0.02, 0.03], color: "#f5f5f0", offsetY: 0.09 } },
  soda: { body: { type: "cylinder", size: [0.033, 0.033, 0.12], color: "#c0392b" }, cap: { type: "cylinder", size: [0.033, 0.033, 0.012], color: "#dedede", offsetY: 0.066 } },

  milk: { body: { type: "box", size: [0.09, 0.16, 0.09], color: "#f7f7f2" }, cap: { type: "box", size: [0.062, 0.05, 0.092], color: "#3b82c4", offsetY: 0.105 } },
  yogurt: { body: { type: "cylinder", size: [0.035, 0.03, 0.07], color: "#f3e6d8" }, cap: { type: "cylinder", size: [0.036, 0.036, 0.012], color: "#c4527a", offsetY: 0.041 } },
  cheese: { body: { type: "box", size: [0.1, 0.06, 0.08], color: "#f0c94d" }, cap: null },

  chips: { body: { type: "box", size: [0.1, 0.2, 0.05], color: "#e8c33e" }, cap: null },
  cookies: { body: { type: "box", size: [0.12, 0.15, 0.06], color: "#2f5fa8" }, cap: null },
  chocolate: { body: { type: "box", size: [0.11, 0.05, 0.07], color: "#5a3320" }, cap: { type: "box", size: [0.11, 0.012, 0.072], color: "#8a5a3c", offsetY: 0.031 } },

  paperTowels: { body: { type: "cylinder", size: [0.07, 0.07, 0.22], color: "#f4f1ea" }, cap: null },
  soap: { body: { type: "box", size: [0.07, 0.15, 0.05], color: "#4f9d5b" }, cap: { type: "box", size: [0.045, 0.03, 0.052], color: "#2f5fa8", offsetY: 0.09 } },
  cleaner: { body: { type: "cylinder", size: [0.045, 0.045, 0.16], color: "#2f8fc4" }, cap: { type: "box", size: [0.03, 0.03, 0.03], color: "#dedede", offsetY: 0.095 } },
};

export function productVisual(productId) {
  return PRODUCT_VISUALS[productId] || { body: { type: "box", size: [0.1, 0.1, 0.1], color: "#999" }, cap: null };
}
