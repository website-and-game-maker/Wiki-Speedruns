// Checks the bi-directional BFS (port of SDOW's algorithm) against a brute-force BFS on random graphs.
const test = require('node:test');
const assert = require('node:assert');
require('../public/js/util.js');
const WS = require('../public/js/sdow.js');

function randomGraph(n, avgDeg, seed) {
  const rnd = WS.util.rng(seed);
  const out = new Map();
  for (let i = 0; i < n; i++) out.set('n' + i, new Set());
  for (let i = 0; i < n; i++) {
    const deg = Math.floor(rnd() * avgDeg * 2);
    for (let k = 0; k < deg; k++) {
      const j = Math.floor(rnd() * n);
      if (j !== i) out.get('n' + i).add('n' + j);
    }
  }
  const inc = new Map([...out.keys()].map((k) => [k, new Set()]));
  for (const [a, bs] of out) for (const b of bs) inc.get(b).add(a);
  return { out, inc };
}

// Number of shortest paths and distance from s to every node (plain BFS + path counting).
function bruteForce(g, s, t) {
  const dist = new Map([[s, 0]]);
  const count = new Map([[s, 1]]);
  let frontier = [s];
  while (frontier.length) {
    const next = [];
    for (const u of frontier) {
      for (const v of g.out.get(u)) {
        if (!dist.has(v)) {
          dist.set(v, dist.get(u) + 1);
          count.set(v, 0);
          next.push(v);
        }
        if (dist.get(v) === dist.get(u) + 1) count.set(v, count.get(v) + count.get(u));
      }
    }
    frontier = next;
  }
  return { degrees: dist.has(t) ? dist.get(t) : null, count: count.get(t) || 0 };
}

function io(g) {
  return {
    outgoing: async (n) => ({ links: [...g.out.get(n)], complete: true }),
    incoming: async (ns) => ({ links: new Map(ns.map((n) => [n, [...g.inc.get(n)]])), complete: true }),
  };
}

test('finds all shortest paths on random graphs', async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = randomGraph(120, 2 + (seed % 4), seed);
    const s = 'n' + (seed % 120);
    const t = 'n' + ((seed * 37 + 11) % 120);
    const expected = bruteForce(g, s, t);
    const r = await WS.sdow.bidirectionalSearch(s, t, io(g), { maxPaths: 100000, concurrency: 3, maxDepth: 50 });
    assert.strictEqual(r.degrees, s === t ? 0 : expected.degrees, `seed ${seed} degrees`);
    if (s === t || expected.degrees === null) continue;
    assert.strictEqual(r.paths.length, expected.count, `seed ${seed} path count`);
    for (const p of r.paths) {
      assert.strictEqual(p[0], s);
      assert.strictEqual(p[p.length - 1], t);
      assert.strictEqual(p.length - 1, expected.degrees);
      for (let i = 0; i + 1 < p.length; i++) assert.ok(g.out.get(p[i]).has(p[i + 1]), `edge ${p[i]}->${p[i + 1]}`);
    }
  }
});

test('early stop still returns shortest paths', async () => {
  const g = randomGraph(300, 4, 1);
  const expected = bruteForce(g, 'n1', 'n205');
  assert.ok(expected.count > 2, 'fixture should have several shortest paths');
  const r = await WS.sdow.bidirectionalSearch('n1', 'n205', io(g), { maxPaths: 2 });
  assert.strictEqual(r.degrees, expected.degrees);
  assert.ok(r.paths.length >= 1 && r.paths.length <= 2);
});

test('trivial and unreachable cases', async () => {
  const g = { out: new Map([['a', new Set(['b'])], ['b', new Set()], ['c', new Set()]]), inc: new Map([['a', new Set()], ['b', new Set(['a'])], ['c', new Set()]]) };
  assert.deepStrictEqual((await WS.sdow.bidirectionalSearch('a', 'a', io(g))).paths, [['a']]);
  assert.deepStrictEqual((await WS.sdow.bidirectionalSearch('a', 'b', io(g))).paths, [['a', 'b']]);
  const r = await WS.sdow.bidirectionalSearch('a', 'c', io(g));
  assert.strictEqual(r.degrees, null);
  assert.ok(r.noPath);
});

test('budget stops the search', async () => {
  const g = randomGraph(2000, 3, 5);
  let calls = 0;
  const base = io(g);
  const counted = { outgoing: (n) => (calls++, base.outgoing(n)), incoming: (ns) => (calls++, base.incoming(ns)) };
  const r = await WS.sdow.bidirectionalSearch('n0', 'n1999', counted, { overBudget: () => calls >= 3 });
  assert.ok(calls < 20);
  assert.ok(r.gaveUp || r.degrees !== null);
});

test('probe shortcut gives the same degrees', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = randomGraph(150, 3, seed);
    const s = 'n' + (seed % 150);
    const t = 'n' + ((seed * 53 + 7) % 150);
    const expected = bruteForce(g, s, t);
    const withProbe = {
      ...io(g),
      probe: async (from, to) => {
        const set = new Set(to);
        const m = new Map();
        for (const f of from) {
          const hits = [...g.out.get(f)].filter((x) => set.has(x));
          if (hits.length) m.set(f, hits);
        }
        return m;
      },
    };
    const r = await WS.sdow.bidirectionalSearch(s, t, withProbe, { maxPaths: 100000, maxDepth: 50, probeLimit: 1e9 });
    assert.strictEqual(r.degrees, s === t ? 0 : expected.degrees, `seed ${seed}`);
    if (s === t || expected.degrees === null) continue;
    assert.strictEqual(r.paths.length, expected.count, `seed ${seed} count`);
    for (const p of r.paths) for (let i = 0; i + 1 < p.length; i++) assert.ok(g.out.get(p[i]).has(p[i + 1]));
  }
});
