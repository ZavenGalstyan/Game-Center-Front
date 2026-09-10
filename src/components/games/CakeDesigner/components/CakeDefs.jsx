/**
 * Cake Designer — the shared <defs> for every cake.
 *
 * Rendered exactly once per <CakePreview>. Gradients & filters here are what
 * give the cake its soft, lit-from-front look; the sprite library and the
 * tier renderer only reference these ids, never redefine them.
 */

export default function CakeDefs({ id = "cd" }) {
  return (
    <defs>
      {/* soft contact / drop shadow */}
      <filter id="cd-soft" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
        <feOffset in="b" dy="3" result="o" />
        <feComponentTransfer in="o" result="s">
          <feFuncA type="linear" slope="0.35" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="s" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="cd-blur-sm"><feGaussianBlur stdDeviation="1.4" /></filter>
      <filter id="cd-blur"><feGaussianBlur stdDeviation="3.2" /></filter>

      {/* frosting / cream */}
      <linearGradient id="cd-cream" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fffaf2" />
        <stop offset="1" stopColor="#efe0cb" />
      </linearGradient>

      {/* berries & fruit */}
      <radialGradient id="cd-berry" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#ff7a92" />
        <stop offset="0.6" stopColor="#e5384f" />
        <stop offset="1" stopColor="#b31e37" />
      </radialGradient>
      <radialGradient id="cd-rasp" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#ff8fb0" />
        <stop offset="1" stopColor="#d43e79" />
      </radialGradient>
      <radialGradient id="cd-blue" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#8fb6e8" />
        <stop offset="1" stopColor="#3a5ba8" />
      </radialGradient>
      <radialGradient id="cd-black" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#6b5573" />
        <stop offset="1" stopColor="#241426" />
      </radialGradient>
      <radialGradient id="cd-cherry" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#ff5d6b" />
        <stop offset="1" stopColor="#a11322" />
      </radialGradient>
      <radialGradient id="cd-lemon" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0" stopColor="#fff7cf" />
        <stop offset="1" stopColor="#f2d34e" />
      </radialGradient>
      <radialGradient id="cd-orange" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0" stopColor="#ffd9a8" />
        <stop offset="1" stopColor="#f2953a" />
      </radialGradient>
      <radialGradient id="cd-kiwi" cx="0.5" cy="0.5" r="0.7">
        <stop offset="0" stopColor="#dbe98a" />
        <stop offset="0.7" stopColor="#8bbf4c" />
        <stop offset="1" stopColor="#5c8a33" />
      </radialGradient>
      <linearGradient id="cd-fig" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8e5aa0" />
        <stop offset="1" stopColor="#5b2a63" />
      </linearGradient>

      {/* chocolate */}
      <linearGradient id="cd-choc" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a06a44" />
        <stop offset="0.5" stopColor="#7b4a2d" />
        <stop offset="1" stopColor="#4f2e1a" />
      </linearGradient>
      <radialGradient id="cd-cookie" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stopColor="#d8a866" />
        <stop offset="1" stopColor="#a9743c" />
      </radialGradient>

      {/* metals */}
      <linearGradient id="cd-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff0c0" />
        <stop offset="0.45" stopColor="#e8c46b" />
        <stop offset="1" stopColor="#b98f2e" />
      </linearGradient>

      {/* flowers */}
      <radialGradient id="cd-rose" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#ffd0e0" />
        <stop offset="1" stopColor="#e07fa0" />
      </radialGradient>
      <linearGradient id="cd-leaf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9ed36a" />
        <stop offset="1" stopColor="#5b9438" />
      </linearGradient>

      {/* flame */}
      <radialGradient id="cd-flame" cx="0.5" cy="0.7" r="0.7">
        <stop offset="0" stopColor="#fff6c8" />
        <stop offset="0.5" stopColor="#ffcf5c" />
        <stop offset="1" stopColor="#ff8a3c" />
      </radialGradient>

      {/* galaxy frosting */}
      <radialGradient id="cd-galaxy" cx="0.4" cy="0.35" r="0.9">
        <stop offset="0" stopColor="#4a3a86" />
        <stop offset="0.6" stopColor="#2a2258" />
        <stop offset="1" stopColor="#140f33" />
      </radialGradient>

      {/* plate / stand */}
      <linearGradient id="cd-plate" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d7d2cc" />
      </linearGradient>
      <linearGradient id="cd-plate-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#efe9e2" />
        <stop offset="1" stopColor="#b9b1a8" />
      </linearGradient>
    </defs>
  );
}
