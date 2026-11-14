/** Line icons for resources, card categories and controls (inline SVG, no text). */
const P = {
  hp: "M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z",
  food: "M6 8h12v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19zM6 8l1-3h10l1 3M9 12h6M9 15.5h6",
  water: "M12 3.5s6 6.6 6 10.9a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5zM9.4 14.6a2.6 2.6 0 0 0 2.6 2.6",
  power: "M13.5 2.5L5.5 13.5h6l-1 8 8-11h-6z",
  scrap: "M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9M18.5 18.5l-1.9-1.9M7.4 7.4L5.5 5.5",
  threat: "M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z",
  defense: "M12 2.8l7.5 3v5.6c0 4.6-3.2 8.1-7.5 9.8-4.3-1.7-7.5-5.2-7.5-9.8V5.8z",
  fortify: "M4 20.5V9l4 2V6.5l4 2V4l8 4v12.5zM4 20.5h16",
  resource: "M3.5 8.5L12 4l8.5 4.5v8L12 21l-8.5-4.5zM3.5 8.5L12 13l8.5-4.5M12 13v8",
  explore: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.8 8.2l-2 5.6-5.6 2 2-5.6z",
  recovery: "M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z",
  risk: "M12 3.5a7 7 0 0 0-7 7c0 2.6 1.4 4.3 3 5.3v3.7h8v-3.7c1.6-1 3-2.7 3-5.3a7 7 0 0 0-7-7zM9.3 11.3h.01M14.7 11.3h.01M10 19.5v-2M14 19.5v-2",
  pause: "M8 5v14M16 5v14",
  close: "M6 6l12 12M18 6L6 18",
  sick: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  gen: "M4 7h16v11H4zM8 7V4h8v3M8 11h3l-1.5 3H13M16 11v3",
  toxic: "M12 3.5s6 6.6 6 10.9a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5zM9 13l6 4M15 13l-6 4",
  person: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20.5c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5",
  radio: "M4 9h16v11H4zM7 9l9-5M8 13h4M8 16h4M16 14.5h.01",
  card: "M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
};

export function Icon({ name, className = "" }) {
  return (
    <svg className={`dds-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={P[name] || P.card} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
