/**
 * Catan board generation core — pure logic, no DOM.
 *
 * Replaces the old "shuffle until lucky" strategy (which fell back to a
 * COMPLETELY UNCONSTRAINED board after 250k failed shuffles) with
 * most-constrained-first backtracking in two phases:
 *
 *   A) resources  — "same resources cannot touch"
 *   B) numbers    — 6/8 pairs, 2/12 pairs, same-number adjacency, and the
 *                   global "same resource cannot repeat a number" rule
 *
 * Every returned board satisfies every enabled rule BY CONSTRUCTION —
 * there is no rule-free fallback anymore. Deterministic per seed.
 * Loadable both in the browser (window.CatanGen) and in Node (tests).
 */
(function (root) {
  'use strict';

  // --- Seeded RNG (identical to the old app.js implementation) ---
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededRng(seedStr) { return mulberry32(xmur3(String(seedStr))()); }
  function shuffle(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // --- Board definition (base game) ---
  function tileBag() {
    return [].concat(
      Array(4).fill('wood'), Array(3).fill('brick'), Array(4).fill('sheep'),
      Array(4).fill('wheat'), Array(3).fill('ore'), ['desert'],
    );
  }
  function numberBag() { return [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]; }

  function coordsList() {
    const rows = [
      { r: -2, qStart: 0, len: 3 },
      { r: -1, qStart: -1, len: 4 },
      { r: 0, qStart: -2, len: 5 },
      { r: 1, qStart: -2, len: 4 },
      { r: 2, qStart: -2, len: 3 },
    ];
    const out = [];
    for (const row of rows) for (let i = 0; i < row.len; i++) out.push({ q: row.qStart + i, r: row.r });
    return out;
  }

  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  function adjacencyList(coords) {
    const key = (q, r) => q + ',' + r;
    const index = new Map(coords.map((c, i) => [key(c.q, c.r), i]));
    return coords.map((c) => {
      const ns = [];
      for (const [dq, dr] of DIRS) {
        const j = index.get(key(c.q + dq, c.r + dr));
        if (j !== undefined) ns.push(j);
      }
      return ns;
    });
  }

  // --- Harbors ---
  // Edge k spans hex corners k and k+1 under the pointy-top corner
  // convention corner(k) = angle 60k-90 (k=0 = top vertex). This EDGE_DIRS
  // list is the axial offset of the neighbor across edge k — i.e. edge k
  // is coastal iff cell + EDGE_DIRS[k] is not part of the board.
  const EDGE_DIRS = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
  function hexCornerUnit(k) {
    const a = (Math.PI / 180) * (60 * k - 90);
    return { x: Math.cos(a), y: Math.sin(a) };
  }
  function axialToPixelUnit(q, r) {
    return { x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r };
  }

  /** Base-game harbor pool: 4 generic (3:1) + one 2:1 per resource. */
  function harborPool() {
    return ['generic', 'generic', 'generic', 'generic', 'wood', 'sheep', 'wheat', 'brick', 'ore'];
  }

  /** Coastal {cell, edge} slots, ordered clockwise from the top by angle. */
  function coastalEdges(coords) {
    const key = (q, r) => q + ',' + r;
    const inSet = new Set(coords.map((c) => key(c.q, c.r)));
    const centers = coords.map((c) => axialToPixelUnit(c.q, c.r));
    const cx = centers.reduce((s, p) => s + p.x, 0) / centers.length;
    const cy = centers.reduce((s, p) => s + p.y, 0) / centers.length;

    const edges = [];
    coords.forEach((cell, i) => {
      EDGE_DIRS.forEach((d, edge) => {
        if (inSet.has(key(cell.q + d[0], cell.r + d[1]))) return;
        const c = centers[i];
        const a = hexCornerUnit(edge);
        const b = hexCornerUnit(edge + 1);
        const mx = c.x + (a.x + b.x) / 2;
        const my = c.y + (a.y + b.y) / 2;
        const angle = (Math.atan2(mx - cx, -(my - cy)) + 2 * Math.PI) % (2 * Math.PI);
        edges.push({ cell: i, edge, angle });
      });
    });
    edges.sort((p, q2) => p.angle - q2.angle);
    return edges.map((e) => ({ cell: e.cell, edge: e.edge }));
  }

  /** Evenly spaced anchors along the coast, like the physical frame. */
  function pickHarborSlots(coastal, count) {
    return Array.from({ length: count }, (_, i) => coastal[Math.floor((i * coastal.length) / count)]);
  }

  const isRed = (n) => n === 6 || n === 8;
  const isLow = (n) => n === 2 || n === 12;

  // --- Generic most-constrained-first backtracking over a multiset pool ---
  function backtrack(order, poolItems, rng, legal, budget) {
    const counts = new Map();
    for (const it of poolItems) counts.set(it, (counts.get(it) || 0) + 1);
    const assigned = new Map();
    let nodes = 0;

    function solve(depth) {
      if (depth === order.length) return true;
      const slot = order[depth];
      const candidates = shuffle([...counts.keys()].filter((v) => counts.get(v) > 0), rng);
      for (const value of candidates) {
        if (++nodes > budget) return 'budget';
        if (!legal(slot, value, assigned)) continue;
        assigned.set(slot, value);
        counts.set(value, counts.get(value) - 1);
        const res = solve(depth + 1);
        if (res === true) return true;
        assigned.delete(slot);
        counts.set(value, counts.get(value) + 1);
        if (res === 'budget') return 'budget';
      }
      return false;
    }
    return solve(0) === true ? assigned : null;
  }

  function byDegreeDesc(slots, adj, relevant) {
    const deg = (i) => adj[i].filter((j) => relevant.has(j)).length;
    return slots.slice().sort((a, b) => deg(b) - deg(a));
  }

  /**
   * options: { redCanTouch, twoTwelveCanTouch, sameNumbersCanTouch,
   *            sameResourceCanTouch, sameResourceSameNumber }
   * (true = allowed; matches the existing readOptions() semantics —
   *  sameResourceSameNumber true = same resource MAY repeat a number)
   */
  function generate(seedStr, options) {
    const rng = seededRng(seedStr);
    const coords = coordsList();
    const adj = adjacencyList(coords);
    const all = coords.map((_, i) => i);

    for (let attempt = 0; attempt < 300; attempt++) {
      // Phase A — resources.
      const resOrder = byDegreeDesc(all, adj, new Set(all));
      const resources = backtrack(resOrder, tileBag(), rng, (slot, value, cur) => {
        if (options.sameResourceCanTouch) return true;
        return adj[slot].every((j) => cur.get(j) !== value);
      }, 20000);
      if (!resources) continue;

      // Phase B — numbers on non-desert tiles.
      const numSlots = all.filter((i) => resources.get(i) !== 'desert');
      const numOrder = byDegreeDesc(numSlots, adj, new Set(numSlots));
      const numbers = backtrack(numOrder, numberBag(), rng, (slot, n, cur) => {
        for (const j of adj[slot]) {
          const m = cur.get(j);
          if (m === undefined) continue;
          if (!options.sameNumbersCanTouch && n === m) return false;
          if (!options.redCanTouch && isRed(n) && isRed(m)) return false;
          if (!options.twoTwelveCanTouch && isLow(n) && isLow(m)) return false;
        }
        if (!options.sameResourceSameNumber) {
          const res = resources.get(slot);
          for (const [k, m] of cur) {
            if (m === n && resources.get(k) === res) return false;
          }
        }
        return true;
      }, 20000);
      if (!numbers) continue;

      const tiles = coords.map((c, i) => ({
        q: c.q, r: c.r,
        key: resources.get(i),
        number: resources.get(i) === 'desert' ? null : numbers.get(i),
      }));
      // Harbor types are shuffled with the SAME rng continuing from the
      // tile/number placement, so a seed reproduces harbors too.
      const slots = pickHarborSlots(coastalEdges(coords), harborPool().length);
      const types = shuffle(harborPool(), rng);
      const harbors = slots.map((slot, i) => ({ cell: slot.cell, edge: slot.edge, type: types[i] }));

      return { tiles, harbors };
    }
    // Provably unreachable in practice (see tests); still: never return a
    // rule-breaking board.
    throw new Error('CatanGen: could not satisfy the selected rules');
  }

  /** Independent re-check used by tests: returns a list of violations. */
  function validate(board, options) {
    const state = board.tiles;
    const coords = coordsList();
    const adj = adjacencyList(coords);
    const bad = [];
    state.forEach((t, i) => {
      for (const j of adj[i]) {
        if (j <= i) continue;
        const o = state[j];
        if (!options.sameResourceCanTouch && t.key === o.key) bad.push('res ' + i + '-' + j);
        if (t.number == null || o.number == null) continue;
        if (!options.sameNumbersCanTouch && t.number === o.number) bad.push('num ' + i + '-' + j);
        if (!options.redCanTouch && isRed(t.number) && isRed(o.number)) bad.push('red ' + i + '-' + j);
        if (!options.twoTwelveCanTouch && isLow(t.number) && isLow(o.number)) bad.push('low ' + i + '-' + j);
      }
    });
    if (!options.sameResourceSameNumber) {
      const seen = new Set();
      for (const t of state) {
        if (t.number == null) continue;
        const k = t.key + ':' + t.number;
        if (seen.has(k)) bad.push('dup ' + k);
        seen.add(k);
      }
    }

    const expectedSlots = pickHarborSlots(coastalEdges(coords), harborPool().length);
    const norm = (arr) => arr.map((s) => s.cell + ':' + s.edge).sort().join(',');
    if (norm(board.harbors) !== norm(expectedSlots)) bad.push('harbor slots mismatch');
    const pool = (arr) => arr.map((h) => h.type).sort().join(',');
    if (pool(board.harbors) !== harborPool().slice().sort().join(',')) bad.push('harbor pool mismatch');

    return bad;
  }

  const api = {
    generate, validate, coordsList, tileBag, numberBag, seededRng,
    harborPool, coastalEdges, pickHarborSlots, hexCornerUnit, EDGE_DIRS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CatanGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
