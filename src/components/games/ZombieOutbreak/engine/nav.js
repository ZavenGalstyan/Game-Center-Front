/**
 * Zombie Outbreak — navigation.
 *
 * One flow field per size class, all pointing at the player: a Dijkstra
 * (Dial's bucket queue, octile costs 10/14) over the 0.5 m grid, seeded at the
 * player's cell. It is rebuilt only when the player changes cell, and at most
 * every REBUILD seconds, so twenty zombies share one search instead of
 * pathfinding per zombie per frame.
 *
 * A zombie asks for a waypoint: walk the field downhill a few metres, then
 * take the furthest point of that chain it can see in a straight line
 * (grid line of sight) — smooth corner-cutting without per-zombie A*.
 *
 * Fallback field: if the player stands somewhere a size class cannot reach
 * (a boss outside a small side room), that class's zombies use a second
 * field seeded from every open cell near the player, weighted by straight-
 * line distance — they come to the closest point they *can* stand on (the
 * doorway) instead of freezing. Built lazily, only while someone needs it.
 */
import { NAV_RADII } from "./world.js";

const INF = 0x3fffffff;
const REBUILD = 0.22;
const CHAIN = 16;
const FALLBACK_R = 24; // cells (12 m)
const NBUCKET = 512;

export function createNav(world) {
  const { cols, rows } = world;
  const n = cols * rows;
  const mk = () => ({ dist: new Int32Array(n).fill(INF), cell: -1, at: -99, valid: false });
  const fields = NAV_RADII.map(mk);
  const fallback = NAV_RADII.map(mk);
  const buckets = Array.from({ length: NBUCKET }, () => []);
  const NB = [
    [1, 0, 10],
    [-1, 0, 10],
    [0, 1, 10],
    [0, -1, 10],
    [1, 1, 14],
    [1, -1, 14],
    [-1, 1, 14],
    [-1, -1, 14],
  ];
  const target = { x: 0, z: 0, time: 0 };

  function dial(cls, dist, seeds) {
    const g = world.blocked[cls];
    dist.fill(INF);
    for (const bk of buckets) bk.length = 0;
    let pending = 0;
    let minSeed = INF;
    for (let k = 0; k < seeds.length; k += 2) {
      const i = seeds[k];
      const d = seeds[k + 1];
      if (g[i] === 1 || d >= dist[i]) continue;
      dist[i] = d;
      buckets[d % NBUCKET].push(i, d);
      pending++;
      if (d < minSeed) minSeed = d;
    }
    let cur = minSeed === INF ? 0 : minSeed;
    let guard = 0;
    while (pending > 0 && guard++ < 6e6) {
      const bk = buckets[cur % NBUCKET];
      if (bk.length === 0) {
        cur++;
        continue;
      }
      // Entries for a later lap of the ring wait their turn.
      let found = -1;
      for (let q = bk.length - 2; q >= 0; q -= 2) {
        if (bk[q + 1] === cur) {
          found = q;
          break;
        }
      }
      if (found < 0) {
        cur++;
        continue;
      }
      const i = bk[found];
      const d = bk[found + 1];
      bk[found] = bk[bk.length - 2];
      bk[found + 1] = bk[bk.length - 1];
      bk.length -= 2;
      pending--;
      if (d !== dist[i]) continue;
      const c = i % cols;
      const r = (i - c) / cols;
      for (let k = 0; k < 8; k++) {
        const nb = NB[k];
        const nc = c + nb[0];
        const nr = r + nb[1];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (g[j] === 1) continue;
        if (k >= 4 && (g[r * cols + nc] === 1 || g[nr * cols + c] === 1)) continue; // no corner cutting
        const nd = d + nb[2];
        if (nd < dist[j]) {
          dist[j] = nd;
          buckets[nd % NBUCKET].push(j, nd);
          pending++;
        }
      }
    }
  }

  const seedBuf = [];
  /**
   * Seeds every open cell within R of cell tc. With `see` set, only cells in
   * straight line of sight of (see.x, see.z) count, so a ring never leaks
   * through a wall onto its other side.
   */
  function ringSeeds(cls, tc, R, see) {
    const g = world.blocked[cls];
    seedBuf.length = 0;
    const c0 = tc % cols;
    const r0 = Math.floor(tc / cols);
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const d = Math.round(Math.hypot(dc, dr) * 10);
        if (d > R * 10) continue;
        const i = r * cols + c;
        if (g[i] === 1) continue;
        if (see && !world.gridClear(0, see.x, see.z, world.cellX(i), world.cellZ(i))) continue;
        seedBuf.push(i, d);
      }
    }
    return seedBuf;
  }

  function build(cls, tx, tz) {
    const f = fields[cls];
    const tc = world.cellOf(tx, tz);
    if (world.blocked[cls][tc] === 0) dial(cls, f.dist, [tc, 0]);
    else dial(cls, f.dist, ringSeeds(cls, tc, cls === 0 ? 4 : 8, { x: tx, z: tz })); // player hugging a wall: only cells they can see
    f.cell = tc;
    f.valid = true;
  }

  function ensureFallback(cls) {
    const f = fallback[cls];
    const tc = world.cellOf(target.x, target.z);
    if (f.valid && (f.cell === tc || target.time - f.at < REBUILD * 2)) return f;
    f.at = target.time;
    f.cell = tc;
    f.valid = true;
    dial(cls, f.dist, ringSeeds(cls, tc, FALLBACK_R, null));
    return f;
  }

  function bestNeighbor(cls, dist, i) {
    const g = world.blocked[cls];
    const c = i % cols;
    const r = (i - c) / cols;
    let best = -1;
    let bd = dist[i];
    for (let k = 0; k < 8; k++) {
      const nb = NB[k];
      const nc = c + nb[0];
      const nr = r + nb[1];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (g[j] === 1) continue;
      if (k >= 4 && (g[r * cols + nc] === 1 || g[nr * cols + c] === 1)) continue;
      if (dist[j] < bd) {
        bd = dist[j];
        best = j;
      }
    }
    return best;
  }

  /** Nearest cell around (x, z) with a finite distance in `dist` (zombie pushed into a blocked cell). */
  function standCell(dist, x, z) {
    const i = world.cellOf(x, z);
    if (dist[i] < INF) return i;
    const c0 = i % cols;
    const r0 = Math.floor(i / cols);
    let best = -1;
    let bd = INF;
    for (let rad = 1; rad <= 4 && best < 0; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const j = r * cols + c;
          if (dist[j] < bd) {
            bd = dist[j];
            best = j;
          }
        }
      }
    }
    return best;
  }

  const chain = new Int32Array(CHAIN);

  function walk(cls, dist, start, x, z, out) {
    let len = 0;
    let cur = start;
    while (len < CHAIN) {
      const nx = bestNeighbor(cls, dist, cur);
      if (nx < 0) break;
      chain[len++] = nx;
      cur = nx;
      if (dist[cur] === 0) break;
    }
    if (len === 0) {
      out.x = world.cellX(start);
      out.z = world.cellZ(start);
      return true;
    }
    for (let k = len - 1; k >= 0; k--) {
      const wx = world.cellX(chain[k]);
      const wz = world.cellZ(chain[k]);
      if (k === 0 || world.gridClear(cls, x, z, wx, wz)) {
        out.x = wx;
        out.z = wz;
        return true;
      }
    }
    return false;
  }

  return {
    fields,
    INF,
    /** Rebuild fields that are stale (player moved cell). Cheap when nothing changed. */
    update(time, tx, tz, force = false) {
      target.x = tx;
      target.z = tz;
      target.time = time;
      for (let cls = 0; cls < fields.length; cls++) {
        const f = fields[cls];
        const cell = world.cellOf(tx, tz);
        if (!force && f.valid && (cell === f.cell || time - f.at < REBUILD)) continue;
        f.at = time;
        build(cls, tx, tz);
      }
    },
    /** Path distance to the player for this class (INF when unreachable). */
    distAt(cls, x, z) {
      const i = standCell(fields[cls].dist, x, z);
      return i < 0 ? INF : fields[cls].dist[i];
    },
    /** Distance used for progress tracking: the real field if reachable, else the fallback. */
    progressAt(cls, x, z) {
      const d = this.distAt(cls, x, z);
      if (d < INF) return d;
      const f = ensureFallback(cls);
      const i = standCell(f.dist, x, z);
      return i < 0 ? INF : f.dist[i] + 100000;
    },
    /**
     * Writes a steering waypoint toward the player into `out` ({x, z}).
     * Returns false only when (x, z) is cut off even from the fallback field.
     */
    waypoint(cls, x, z, out) {
      const dist = fields[cls].dist;
      const start = standCell(dist, x, z);
      if (start >= 0) return walk(cls, dist, start, x, z, out);
      const f = ensureFallback(cls);
      const s2 = standCell(f.dist, x, z);
      if (s2 < 0) return false;
      return walk(cls, f.dist, s2, x, z, out);
    },
  };
}
