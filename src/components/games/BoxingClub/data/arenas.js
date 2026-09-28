/**
 * Boxing Club — the five venues. Purely visual + ambience; combat is
 * identical everywhere.
 */
export const ARENAS = [
  {
    id: "gym", tier: 1, name: "Local Gym", blurb: "Ironworks Boxing Club — warm lights, old ring, a few regulars.",
    style: "gym", seed: 11,
    bg: ["#2b1a14", "#3a241a", "#120b08"], haze: 0.45,
    crowdRows: 1, emptySeats: 0.55, lamp: "#ffd9a0",
    canvas: "#d9cdb5", apron: "#6b2a22", apronText: "IRONWORKS BOXING", floorText: "IB", logo: "#9b3a2c",
    rope: "#c0392b", cornerRed: "#c0392b", cornerBlue: "#2d64b0", cornerNeutral: "#e9e4d8",
    spot: 0.22, ambience: "gym", crowdLevel: 0.25,
  },
  {
    id: "hall", tier: 2, name: "City Hall", blurb: "Friday fight night at the city sports hall.",
    style: "hall", seed: 23, tiers: 3, seatTint: "52,58,80",
    bg: ["#161c2c", "#232b40", "#0b0e16"], haze: 0.35,
    crowdRows: 3, emptySeats: 0.3, lamp: "#fff4d8",
    canvas: "#e4e2da", apron: "#1f3f78", apronText: "CITY CIRCUIT", floorText: "CC", logo: "#2f5fa8",
    rope: "#ecf0f1", cornerRed: "#c0392b", cornerBlue: "#2d64b0", cornerNeutral: "#e9e4d8",
    spot: 0.26, ambience: "hall", crowdLevel: 0.45,
  },
  {
    id: "regional", tier: 3, name: "Regional Arena", blurb: "LED boards, a packed floor and a real spotlight.",
    style: "arena", seed: 37, tiers: 4, seatTint: "40,30,55",
    bg: ["#0f0c1c", "#1d1633", "#07060d"], haze: 0.4,
    crowdRows: 4, emptySeats: 0.15, led: "#ffb13b", ledText: "REGIONAL LEAGUE  •  LIVE",
    canvas: "#ececf2", apron: "#3a1f5c", apronText: "REGIONAL LEAGUE", floorText: "RL", logo: "#6b3fa0",
    rope: "#f1c40f", cornerRed: "#c0392b", cornerBlue: "#2d64b0", cornerNeutral: "#f0f0f0",
    spot: 0.32, ambience: "arena", crowdLevel: 0.6,
  },
  {
    id: "national", tier: 4, name: "National Stadium", blurb: "A dark stadium, a blazing ring, flashbulbs everywhere.",
    style: "stadium", seed: 53, tiers: 5, seatTint: "25,28,38",
    bg: ["#05070d", "#0d1220", "#020305"], haze: 0.55,
    crowdRows: 4, emptySeats: 0.06, led: "#3fd0ff", ledText: "NATIONAL ARENA  •  TITLE ELIMINATOR", flashes: true,
    canvas: "#f4f4f6", apron: "#0d2440", apronText: "NATIONAL ARENA", floorText: "NA", logo: "#1c4f8a",
    rope: "#e8e8e8", cornerRed: "#c0392b", cornerBlue: "#2d64b0", cornerNeutral: "#f0f0f0",
    spot: 0.4, ambience: "stadium", crowdLevel: 0.75,
  },
  {
    id: "championship", tier: 5, name: "Championship Night", blurb: "The biggest night in boxing. Beams, gold, and a roaring crowd.",
    style: "championship", seed: 71, tiers: 5, seatTint: "30,24,18",
    bg: ["#08050a", "#150c14", "#030204"], haze: 0.5,
    crowdRows: 4, emptySeats: 0.02, led: "#ffd55a", ledText: "WORLD CHAMPIONSHIP  •  THE CROWN", flashes: true, beams: true,
    canvas: "#f6f1e4", apron: "#3a2a0c", apronText: "CHAMPIONSHIP NIGHT", floorText: "★", logo: "#b8902a",
    rope: "#d4af37", cornerRed: "#c0392b", cornerBlue: "#2d64b0", cornerNeutral: "#f5e6b8",
    spot: 0.45, ambience: "championship", crowdLevel: 0.9,
  },
];

export const arenaById = (id) => ARENAS.find((a) => a.id === id) || ARENAS[0];
