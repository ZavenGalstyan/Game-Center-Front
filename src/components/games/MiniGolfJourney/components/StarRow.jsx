/**
 * Mini Golf Journey — a row of up to three stars.
 */
import { IconStar } from "./Icons.jsx";

export default function StarRow({ value = 0, size = "md", animate = false }) {
  return (
    <span className={`mgj-stars mgj-stars--${size}`} aria-label={`${value} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`mgj-star ${i < value ? "is-on" : ""} ${animate && i < value ? "is-pop" : ""}`}
          style={animate ? { animationDelay: `${i * 140}ms` } : undefined}
        >
          <IconStar filled={i < value} />
        </span>
      ))}
    </span>
  );
}
