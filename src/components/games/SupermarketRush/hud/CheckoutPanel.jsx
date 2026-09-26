/**
 * Supermarket Rush — the checkout scan list: items, running total, and
 * which one scans next on the player's next E press (see StoreScene's
 * checkout handling).
 */
import { getProduct } from "../data/products.js";

export default function CheckoutPanel({ checkout }) {
  const total = checkout.items.reduce((sum, it) => sum + (it.scanned ? it.price : 0), 0);
  return (
    <div className="sr-checkout">
      <div className="sr-checkout__card">
        <h4>Checkout</h4>
        <ul>
          {checkout.items.map((it, i) => (
            <li key={i} className={it.scanned ? "sr-checkout__scanned" : i === checkout.scannedIndex ? "sr-checkout__next" : ""}>
              <span>{getProduct(it.productId).name}</span>
              <span>${it.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="sr-checkout__total">TOTAL: ${total.toFixed(2)}</div>
      </div>
    </div>
  );
}
