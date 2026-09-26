/**
 * Supermarket Rush — the product catalogue.
 *
 * One entry per SKU. Nothing else in the game hard-codes "milk" or "cereal"
 * logic — shelves, boxes, guidance and the customer AI all key off this data,
 * so adding a new product only ever means adding one entry here plus (if it's
 * a genuinely new shape) one visual recipe in `engine/productVisuals.js`.
 *
 * `boxCapacity` is how many units one warehouse box holds — it's also the
 * default shelf capacity for that product's dedicated shelf, since each
 * shelf in this game is a single-product unit (see data/tiers.js).
 */

export const CATEGORIES = ["Breakfast", "Drinks", "Dairy", "Snacks", "Household"];

export const PRODUCTS = {
  cereal: { id: "cereal", name: "Cereal", category: "Breakfast", boxCapacity: 8, price: 4.5 },
  bread: { id: "bread", name: "Bread", category: "Breakfast", boxCapacity: 6, price: 2.2 },
  coffee: { id: "coffee", name: "Coffee", category: "Breakfast", boxCapacity: 6, price: 6.0 },

  water: { id: "water", name: "Water", category: "Drinks", boxCapacity: 10, price: 1.2 },
  juice: { id: "juice", name: "Juice", category: "Drinks", boxCapacity: 8, price: 4.1 },
  soda: { id: "soda", name: "Soda", category: "Drinks", boxCapacity: 10, price: 1.8 },

  milk: { id: "milk", name: "Milk", category: "Dairy", boxCapacity: 6, price: 3.5 },
  yogurt: { id: "yogurt", name: "Yogurt", category: "Dairy", boxCapacity: 8, price: 2.4 },
  cheese: { id: "cheese", name: "Cheese", category: "Dairy", boxCapacity: 6, price: 5.2 },

  chips: { id: "chips", name: "Chips", category: "Snacks", boxCapacity: 8, price: 3.0 },
  cookies: { id: "cookies", name: "Cookies", category: "Snacks", boxCapacity: 8, price: 3.4 },
  chocolate: { id: "chocolate", name: "Chocolate", category: "Snacks", boxCapacity: 10, price: 2.6 },

  paperTowels: { id: "paperTowels", name: "Paper Towels", category: "Household", boxCapacity: 6, price: 4.8 },
  soap: { id: "soap", name: "Soap", category: "Household", boxCapacity: 8, price: 3.2 },
  cleaner: { id: "cleaner", name: "Cleaner", category: "Household", boxCapacity: 6, price: 3.9 },
};

export function getProduct(id) {
  return PRODUCTS[id] || null;
}

export function productsByCategory(category) {
  return Object.values(PRODUCTS).filter((p) => p.category === category);
}

export const ALL_PRODUCT_IDS = Object.keys(PRODUCTS);
