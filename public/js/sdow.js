/* Built-in Six Degrees of Wikipedia.
 *
 * Two engines, same result shape:
 *   - "sdow": the Six Degrees of Wikipedia API (github.com/jwngr/sdow), which runs a
 *     bi-directional BFS over a full snapshot of the Wikipedia link graph. Fast, exhaustive.
 *   - "live": a port of SDOW's breadth_first_search.py that runs in your browser against the
 *     live Wikipedia API. Slower, but works for brand-new articles and when the API is down.
 *
 * Result: { engine, source, target, degrees, paths: [[{title, description, thumb}]],
 *           totalPaths, approximate, ms }
 */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const SDOW_API = 'https://api.sixdegreesofwikipedia.com/paths';

  const S = (WS.sdow = {});

  // ---------------------------------------------------------------------------
  // Core algorithm (pure; unit-tested in tests/bfs.test.js)
  // ---------------------------------------------------------------------------

  /** Walks parent pointers back to the root (whose parent list is [null]). Port of SDOW get_paths. */
  function getPaths(parents, visited, limit) {
    const out = [];
    for (const id of parents) {
      if (id === null) return [[]];
      for (const p of getPaths(visited.get(id), visited, limit)) {
        out.push(p.concat([id]));
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /**
   * Bi-directional BFS, faithful to SDOW's algorithm: expand whichever side is cheaper, stop at
   * the first depth where the frontiers meet, return every shortest path found at that depth.
   *
   * io.outgoing(node)        -> Promise<{links: node[], complete}>   (one node)
   * io.incoming(nodes[])     -> Promise<{links: Map<node, node[]>, complete}> (a batch)
   *
   * Differences from SDOW (because live Wikipedia has no precomputed link counts):
   *   - cost of a side is estimated as frontierSize × running average degree;
   *   - a level can stop early once `maxPaths` shortest paths are found (they're all still shortest);
   *   - `budget()` lets the caller abort when too many requests have been spent.
   */
  S.bidirectionalSearch = async (source, target, io, opts = {}) => {
    const {
      maxPaths = 200,
      concurrency = 4,
      incomingBatch = 50,
      signal,
      onProgress = () => {},
      overBudget = () => false,
      maxDepth = 8,
      probeLimit = 40,
    } = opts;

    if (source === target) return { paths: [[source]], degrees: 0, approximate: false, explored: 0 };

    let fwd = new Map([[source, [null]]]);
    let bwd = new Map([[target, [null]]]);
    const fwdVisited = new Map();
    const bwdVisited = new Map();
    let fDepth = 0;
    let bDepth = 0;
    let avgOut = 300;
    let avgIn = 900;
    let approximate = false;
    let explored = 0;
    const meet = new Set();

    const aborted = () => signal && signal.aborted;

    while (!meet.size && fwd.size && bwd.size) {
      if (aborted()) throw signal.reason || new DOMException('Aborted', 'AbortError');
      if (fDepth + bDepth >= maxDepth || overBudget()) return { paths: [], degrees: null, approximate: true, explored, gaveUp: true };

      // Probe (live engine only): if the frontiers are small, ask directly which forward pages link
      // into the backward frontier. Any hit is an edge between the frontiers, so it completes a
      // shortest path of length fDepth + bDepth + 1 — far cheaper than a full expansion.
      if (io.probe && Math.ceil(fwd.size / 50) * Math.ceil(bwd.size / 50) <= probeLimit) {
        onProgress({ direction: 'probe', depth: fDepth + bDepth + 1, frontier: fwd.size, explored });
        const hits = await io.probe([...fwd.keys()], [...bwd.keys()]);
        if (hits.size) {
          fDepth++;
          for (const [k, v] of fwd) fwdVisited.set(k, v);
          const next = new Map();
          for (const [f, bs] of hits) {
            for (const b of bs) {
              if (!bwd.has(b) || fwdVisited.has(b)) continue;
              if (!next.has(b)) next.set(b, []);
              next.get(b).push(f);
              meet.add(b);
            }
          }
          fwd = next;
          if (meet.size) break;
        }
      }

      const fCost = fwd.size * avgOut;
      const bCost = bwd.size * avgIn;
      const forward = fCost <= bCost;
      const next = new Map();
      let degreeSum = 0;
      let degreeN = 0;

      // Enough meeting nodes to build maxPaths paths? (each meet node gives >= 1 path)
      const enough = () => meet.size >= maxPaths || overBudget();

      if (forward) {
        fDepth++;
        for (const [k, v] of fwd) fwdVisited.set(k, v);
        const nodes = [...fwd.keys()];
        onProgress({ direction: 'forward', depth: fDepth + bDepth, frontier: nodes.length, explored });
        await U.pool(
          nodes,
          concurrency,
          async (node) => {
            const r = await io.outgoing(node);
            explored++;
            if (!r.complete) approximate = true;
            degreeSum += r.links.length;
            degreeN++;
            for (const child of r.links) {
              if (fwdVisited.has(child)) continue;
              const parents = next.get(child);
              if (parents) parents.push(node);
              else next.set(child, [node]);
              if (bwd.has(child)) meet.add(child);
            }
            if (explored % 10 === 0) onProgress({ direction: 'forward', depth: fDepth + bDepth, frontier: nodes.length, explored });
          },
          { signal, shouldStop: enough }
        );
        if (degreeN) avgOut = Math.max(1, degreeSum / degreeN);
        fwd = next;
      } else {
        bDepth++;
        for (const [k, v] of bwd) bwdVisited.set(k, v);
        const nodes = [...bwd.keys()];
        const batches = [];
        for (let i = 0; i < nodes.length; i += incomingBatch) batches.push(nodes.slice(i, i + incomingBatch));
        onProgress({ direction: 'backward', depth: fDepth + bDepth, frontier: nodes.length, explored });
        await U.pool(
          batches,
          concurrency,
          async (batch) => {
            const r = await io.incoming(batch);
            explored += batch.length;
            if (!r.complete) approximate = true;
            for (const node of batch) {
              const parentsOf = r.links.get(node) || [];
              degreeSum += parentsOf.length;
              degreeN++;
              for (const child of parentsOf) {
                if (bwdVisited.has(child)) continue;
                const parents = next.get(child);
                if (parents) parents.push(node);
                else next.set(child, [node]);
                if (fwd.has(child)) meet.add(child);
              }
            }
            onProgress({ direction: 'backward', depth: fDepth + bDepth, frontier: nodes.length, explored });
          },
          { signal, shouldStop: enough }
        );
        if (degreeN) avgIn = Math.max(1, degreeSum / degreeN);
        bwd = next;
      }
    }

    const paths = [];
    const seen = new Set();
    for (const m of meet) {
      const fromSource = getPaths(fwd.get(m), fwdVisited, maxPaths);
      const fromTarget = getPaths(bwd.get(m), bwdVisited, maxPaths);
      for (const a of fromSource) {
        for (const b of fromTarget) {
          const p = a.concat([m], b.slice().reverse());
          const key = p.join('\u0001');
          if (!seen.has(key)) {
            seen.add(key);
            paths.push(p);
          }
          if (paths.length >= maxPaths) break;
        }
        if (paths.length >= maxPaths) break;
      }
      if (paths.length >= maxPaths) break;
    }
    paths.sort((a, b) => a.join('|').localeCompare(b.join('|')));
    return {
      paths,
      degrees: paths.length ? paths[0].length - 1 : null,
      approximate,
      explored,
      noPath: !paths.length,
    };
  };

  // ---------------------------------------------------------------------------
  // Engine 1: Six Degrees of Wikipedia API
  // ---------------------------------------------------------------------------

  const cache = new Map();
  const cacheKey = (a, b) => U.normTitle(a) + '→' + U.normTitle(b);

  S.viaApi = async (source, target, { signal } = {}) => {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(SDOW_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: U.normTitle(source), target: U.normTitle(target) }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      const err = new Error('Could not reach the Six Degrees of Wikipedia API.');
      err.network = true;
      throw err;
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) { /* non-JSON error page */ }
    if (!res.ok || !data) {
      const err = new Error((data && data.error) || `Six Degrees API error (HTTP ${res.status}).`);
      err.status = res.status;
      err.network = res.status >= 500 || res.status === 429;
      throw err;
    }
    const pages = data.pages || {};
    const paths = (data.paths || []).map((p) =>
      p.map((id) => {
        const pg = pages[id] || {};
        return { title: pg.title || String(id), description: pg.description || '', thumb: pg.thumbnailUrl || null };
      })
    );
    return {
      engine: 'sdow',
      source: data.sourcePageTitle || U.normTitle(source),
      target: data.targetPageTitle || U.normTitle(target),
      degrees: paths.length ? paths[0].length - 1 : null,
      paths,
      totalPaths: paths.length,
      approximate: false,
      ms: performance.now() - t0,
    };
  };

  // ---------------------------------------------------------------------------
  // Engine 2: live, in-browser BFS against the Wikipedia API
  // ---------------------------------------------------------------------------

  S.viaLive = async (source, target, { signal, onProgress = () => {}, maxRequests = 1500, maxPaths = 60 } = {}) => {
    const t0 = performance.now();
    const W = WS.wiki;
    const resolved = await W.resolve([source, target], { signal });
    const s = resolved.get(source);
    const t = resolved.get(target);
    if (!s) throw Object.assign(new Error(`Start page "${source}" does not exist on Wikipedia.`), { status: 400 });
    if (!t) throw Object.assign(new Error(`End page "${target}" does not exist on Wikipedia.`), { status: 400 });

    let requests = 0;
    const io = {
      outgoing: async (node) => {
        const r = await W.outgoingLinks(node, { signal, maxRequests: 6 });
        requests += r.requests;
        return r;
      },
      incoming: async (nodes) => {
        // The very first backward step (just the target) is allowed to dig deeper.
        const r = await W.incomingLinks(nodes, { signal, maxRequests: nodes.length === 1 ? 16 : 8 });
        requests += r.requests;
        return r;
      },
      probe: async (from, to) => {
        const r = await W.linksBetween(from, to, { signal, concurrency: 4 });
        requests += r.requests;
        return r.links;
      },
    };
    const r = await S.bidirectionalSearch(s, t, io, {
      signal,
      maxPaths,
      overBudget: () => requests >= maxRequests,
      onProgress: (p) => onProgress({ ...p, requests }),
    });

    // Decorate path nodes with descriptions + thumbnails.
    const titles = [...new Set(r.paths.flat())];
    const info = titles.length ? await W.pageInfo(titles, { signal }) : new Map();
    const paths = r.paths.map((p) =>
      p.map((title) => {
        const i = info.get(title) || {};
        return { title, description: i.description || '', thumb: i.thumb || null };
      })
    );
    return {
      engine: 'live',
      source: s,
      target: t,
      degrees: r.degrees,
      paths,
      totalPaths: paths.length,
      approximate: r.approximate || !!r.gaveUp,
      gaveUp: !!r.gaveUp,
      requests,
      ms: performance.now() - t0,
    };
  };

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  /** engine: 'auto' (API, falling back to live), 'sdow', or 'live'. */
  S.find = async (source, target, { engine = 'auto', signal, onProgress, maxRequests } = {}) => {
    const key = cacheKey(source, target) + '|' + engine;
    if (cache.has(key)) return cache.get(key);
    let result;
    if (engine === 'live') {
      result = await S.viaLive(source, target, { signal, onProgress, maxRequests });
    } else {
      try {
        result = await S.viaApi(source, target, { signal });
      } catch (e) {
        // 400 = a page SDOW's snapshot doesn't know (e.g. brand new article); network = API down.
        if (engine === 'auto' && (e.status === 400 || e.network)) {
          onProgress && onProgress({ fallback: true, reason: e.message });
          result = await S.viaLive(source, target, { signal, onProgress, maxRequests });
          result.fallbackReason = e.message;
        } else throw e;
      }
    }
    cache.set(key, result);
    return result;
  };

  /** Degrees of separation from `from` to `target` (null if unknown / unreachable). API only; cached. */
  const distCache = new Map();
  S.distance = async (from, target, { signal } = {}) => {
    const key = cacheKey(from, target);
    if (U.normTitle(from) === U.normTitle(target)) return { degrees: 0, next: [] };
    if (!distCache.has(key)) {
      distCache.set(
        key,
        S.viaApi(from, target, { signal })
          .then((r) => ({
            degrees: r.degrees,
            // First hop of every shortest path — used for hints.
            next: [...new Set(r.paths.map((p) => p[1] && p[1].title).filter(Boolean))],
            result: r,
          }))
          .catch((e) => {
            distCache.delete(key);
            throw e;
          })
      );
    }
    return distCache.get(key);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WS;
})(typeof window !== 'undefined' ? window : globalThis);
