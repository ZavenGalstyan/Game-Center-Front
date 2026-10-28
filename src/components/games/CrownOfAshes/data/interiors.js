/**
 * Interiors are authored as ASCII grids (one char = CELL metres) and placed
 * at their INTERIORS origin far east of the heightfield.
 *
 *   #  wall          .  floor        S  arrival point     X  exit (back outside)
 *   u  undead        H  Hollow Warden (crypt boss)        A  Heartstone altar
 *   B  brazier (puzzle)  G  seal gate (opens when all braziers burn)
 *   c  chest         p  pillar        T  ladder up to the Ashfall trapdoor
 */
export const ICELL = 3;
export const IHEIGHT = 6.5;

export const INTERIOR_MAPS = {
  crypt: [
    "##########################",
    "#######..............#####",
    "#######.p....A.....p.#####",
    "#######......H.......#####",
    "#######.p..........p.#####",
    "#######..............#####",
    "############GGG###########",
    "######.......u......######",
    "#c....B......p.....B..u.c#",
    "######..............######",
    "######.p.....B.....p.#####",
    "######......u........#####",
    "###########...############",
    "###########...############",
    "#c..u.........#####...c###",
    "####.#####....######.#####",
    "####.#####....######.#####",
    "####...u......u.......####",
    "##########....############",
    "##########.S..############",
    "##########.X..############",
    "##########################",
  ],
  tunnel: [
    "##################",
    "##T.....##########",
    "##.##...u#########",
    "##.###.....#######",
    "##.#####....######",
    "##...u###..c######",
    "####....#..#######",
    "#######..u.#######",
    "#######......#####",
    "#########.##..####",
    "#########.##u.####",
    "#########......###",
    "############.S.###",
    "############.X.###",
    "##################",
  ],
};

/** Cell → world position (centre) for an interior. */
export function cellWorld(I, col, row) {
  return { x: I.x + col * ICELL, z: I.z + row * ICELL };
}
/** All cells of a given char. */
export function cellsOf(map, ch) {
  const out = [];
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === ch) out.push([c, r]);
  });
  return out;
}
