/* Wikipedia (MediaWiki Action API) client: article rendering, search, page info,
 * and the raw link queries the live Six Degrees engine is built on. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const API = 'https://en.wikipedia.org/w/api.php';
  const HEADERS = { 'Api-User-Agent': 'WikiSpeedruns/1.0 (https://wiki-speedruns.web.app)' };

  const W = (WS.wiki = { requests: 0 });

  /** GET the Action API with retry on 429/5xx. Always formatversion=2 and anonymous CORS. */
  W.api = async (params, { signal, retries = 4 } = {}) => {
    const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
    const url = `${API}?${qs}`;
    for (let attempt = 0; ; attempt++) {
      W.requests++;
      let res;
      try {
        res = await fetch(url, { headers: HEADERS, signal });
      } catch (e) {
        if (e.name === 'AbortError' || attempt >= retries) throw e;
        await U.sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) throw new Error(`Wikipedia is busy (HTTP ${res.status}). Try again in a moment.`);
        const ra = Number(res.headers.get('retry-after'));
        await U.sleep(ra ? ra * 1000 : 800 * 2 ** attempt);
        continue;
      }
      const data = await res.json();
      if (data.error) {
        if (data.error.code === 'maxlag' && attempt < retries) {
          await U.sleep(1000 * 2 ** attempt);
          continue;
        }
        const err = new Error(data.error.info || data.error.code);
        err.code = data.error.code;
        throw err;
      }
      return data;
    }
  };

  /** Follows `continue` blocks, calling onPage(data) for each response. Stops after maxRequests. */
  W.apiAll = async (params, onPage, { signal, maxRequests = 50 } = {}) => {
    let cont = {};
    let n = 0;
    for (;;) {
      const data = await W.api({ ...params, ...cont }, { signal });
      n++;
      onPage(data);
      if (!data.continue) return { complete: true, requests: n };
      if (n >= maxRequests) return { complete: false, requests: n };
      cont = data.continue;
    }
  };

  // ---------- Article rendering ----------

  const articleCache = new Map();

  /** Rendered article HTML + canonical title (redirects followed). */
  W.article = async (title, { signal } = {}) => {
    const key = U.normTitle(title);
    if (articleCache.has(key)) return articleCache.get(key);
    const data = await W.api(
      {
        action: 'parse',
        page: key,
        redirects: '1',
        prop: 'text|displaytitle',
        disableeditsection: '1',
        disablelimitreport: '1',
      },
      { signal }
    );
    const p = data.parse;
    const result = {
      title: p.title,
      displayTitle: p.displaytitle || p.title,
      pageid: p.pageid,
      html: p.text,
      redirectedFrom: p.redirects && p.redirects.length ? p.redirects[0].from : null,
    };
    articleCache.set(key, result);
    articleCache.set(result.title, result);
    if (articleCache.size > 80) articleCache.delete(articleCache.keys().next().value);
    return result;
  };

  // ---------- Page info (description, thumbnail, extract) ----------

  const infoCache = new Map();

  /** Map<inputTitle, {title, description, extract, thumb, missing}> for up to any number of titles. */
  W.pageInfo = async (titles, { signal, extract = false, thumbSize = 160 } = {}) => {
    const out = new Map();
    const need = [];
    for (const t of titles) {
      const k = U.normTitle(t);
      const c = infoCache.get(k + (extract ? '|x' : ''));
      if (c) out.set(t, c);
      else need.push(t);
    }
    // TextExtracts only allows 20 intro extracts per request.
    const batch = extract ? 20 : 50;
    for (let i = 0; i < need.length; i += batch) {
      const chunk = need.slice(i, i + batch);
      const params = {
        titles: chunk.map(U.normTitle).join('|'),
        redirects: '1',
        prop: 'pageimages|description' + (extract ? '|extracts' : ''),
        piprop: 'thumbnail',
        pithumbsize: String(thumbSize),
        pilimit: String(batch),
      };
      if (extract) Object.assign(params, { exintro: '1', explaintext: '1', exsentences: '2', exlimit: String(batch) });
      const data = await W.api(params, { signal });
      const q = data.query || {};
      const alias = new Map();
      for (const n of q.normalized || []) alias.set(n.from, n.to);
      for (const r of q.redirects || []) alias.set(r.from, r.to);
      const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
      for (const t of chunk) {
        let k = U.normTitle(t);
        for (let hops = 0; alias.has(k) && hops < 3; hops++) k = alias.get(k);
        const p = byTitle.get(k);
        const info = p && !p.missing && !p.invalid
          ? { title: p.title, description: p.description || '', extract: p.extract || '', thumb: p.thumbnail ? p.thumbnail.source : null, missing: false }
          : { title: k, description: '', extract: '', thumb: null, missing: true };
        infoCache.set(U.normTitle(t) + (extract ? '|x' : ''), info);
        out.set(t, info);
      }
    }
    return out;
  };

  W.info = async (title, opts) => (await W.pageInfo([title], opts)).get(title);

  // ---------- Search / random ----------

  /** Prefix search with thumbnails, for autocomplete. */
  W.search = async (q, { signal, limit = 8 } = {}) => {
    q = q.trim();
    if (!q) return [];
    const data = await W.api(
      {
        generator: 'prefixsearch',
        gpssearch: q,
        gpslimit: String(limit),
        gpsnamespace: '0',
        redirects: '1',
        prop: 'pageimages|description',
        piprop: 'thumbnail',
        pithumbsize: '80',
        pilimit: String(limit),
      },
      { signal }
    );
    const pages = (data.query && data.query.pages) || [];
    const seen = new Set();
    return pages
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .filter((p) => !seen.has(p.title) && seen.add(p.title))
      .map((p) => ({ title: p.title, description: p.description || '', thumb: p.thumbnail ? p.thumbnail.source : null }));
  };

  /** A "decent" random article: sample a few and keep the longest (skips stubs). */
  W.randomArticle = async ({ signal, exclude = [] } = {}) => {
    const data = await W.api({ generator: 'random', grnnamespace: '0', grnlimit: '12', prop: 'info' }, { signal });
    const pages = ((data.query && data.query.pages) || [])
      .filter((p) => !exclude.includes(p.title) && !/^List of|disambiguation/i.test(p.title))
      .sort((a, b) => (b.length || 0) - (a.length || 0));
    return pages[0] ? pages[0].title : null;
  };

  /** Canonical titles for inputs (follows redirects). Map<input, title|null>. */
  W.resolve = async (titles, { signal } = {}) => {
    const info = await W.pageInfo(titles, { signal });
    const out = new Map();
    for (const t of titles) {
      const i = info.get(t);
      out.set(t, i && !i.missing ? i.title : null);
    }
    return out;
  };

  // ---------- Raw link graph queries (live Six Degrees engine) ----------

  /** Outgoing article links from one page, redirects resolved, red links dropped. */
  W.outgoingLinks = async (title, { signal, maxRequests = 6 } = {}) => {
    const links = new Set();
    const res = await W.apiAll(
      { generator: 'links', titles: title, gplnamespace: '0', gpllimit: 'max', redirects: '1' },
      (data) => {
        for (const p of (data.query && data.query.pages) || []) {
          if (!p.missing && !p.invalid && p.ns === 0) links.add(p.title);
        }
      },
      { signal, maxRequests }
    );
    return { links: [...links], complete: res.complete, requests: res.requests };
  };

  /** Incoming links for up to 50 pages at once. Redirects pointing at a page are followed one level. */
  W.incomingLinks = async (titles, { signal, maxRequests = 10 } = {}) => {
    const map = new Map(titles.map((t) => [t, new Set()]));
    const redirects = new Map(); // redirect title -> target title
    let complete = true;
    let requests = 0;
    const collect = (data, attributeTo) => {
      for (const p of (data.query && data.query.pages) || []) {
        const target = attributeTo ? attributeTo.get(p.title) : p.title;
        const set = map.get(target);
        if (!set) continue;
        for (const l of p.linkshere || []) {
          if (l.redirect && !attributeTo) redirects.set(l.title, target);
          else if (!l.redirect) set.add(l.title);
        }
      }
    };
    const params = { prop: 'linkshere', lhnamespace: '0', lhlimit: 'max', lhprop: 'title|redirect' };
    const r1 = await W.apiAll({ ...params, titles: titles.join('|') }, (d) => collect(d), { signal, maxRequests });
    requests += r1.requests;
    complete = complete && r1.complete;
    const rTitles = [...redirects.keys()];
    for (let i = 0; i < rTitles.length && requests < maxRequests * 2; i += 50) {
      const chunk = rTitles.slice(i, i + 50);
      const r2 = await W.apiAll({ ...params, titles: chunk.join('|') }, (d) => collect(d, redirects), {
        signal,
        maxRequests: Math.max(1, maxRequests - r1.requests),
      });
      requests += r2.requests;
      complete = complete && r2.complete;
    }
    const out = new Map();
    for (const [k, v] of map) out.set(k, [...v]);
    return { links: out, complete, requests };
  };

  /** Which of `from` link directly to any of `to`? Map<from, to[]>. Uses the pltitles filter, 50×50 per request. */
  W.linksBetween = async (from, to, { signal, concurrency = 4 } = {}) => {
    const out = new Map();
    const jobs = [];
    for (let i = 0; i < from.length; i += 50) {
      for (let j = 0; j < to.length; j += 50) jobs.push([from.slice(i, i + 50), to.slice(j, j + 50)]);
    }
    let requests = 0;
    await U.pool(
      jobs,
      concurrency,
      async ([f, t]) => {
        const r = await W.apiAll(
          { prop: 'links', titles: f.join('|'), pltitles: t.join('|'), pllimit: 'max', plnamespace: '0' },
          (data) => {
            for (const p of (data.query && data.query.pages) || []) {
              for (const l of p.links || []) {
                if (!out.has(p.title)) out.set(p.title, []);
                out.get(p.title).push(l.title);
              }
            }
          },
          { signal, maxRequests: 10 }
        );
        requests += r.requests;
      },
      { signal }
    );
    return { links: out, requests };
  };

  // ---------- Link classification for in-game navigation ----------

  const NON_ARTICLE_NS = new Set(
    'Media Special Talk User User talk Wikipedia Wikipedia talk WP Project File File talk Image MediaWiki MediaWiki talk Template Template talk Help Help talk Category Category talk Portal Portal talk Draft Draft talk TimedText TimedText talk Module Module talk Book Education Program Gadget Gadget definition Topic Wikt Wiktionary Commons Meta S Q V N B Species Mw Foundation Wmf Wikisource Wikiquote Wikivoyage Wikibooks Wikinews Wikiversity Wikidata D'.split(
      ' '
    ).map((s) => s.toLowerCase())
  );
  // Two-word namespaces the split above chopped up.
  ['user talk', 'wikipedia talk', 'file talk', 'mediawiki talk', 'template talk', 'help talk', 'category talk', 'portal talk', 'draft talk', 'timedtext talk', 'module talk', 'gadget definition', 'education program'].forEach((n) => NON_ARTICLE_NS.add(n));

  /** For an <a href>, return the target article title if it's a playable link, else null. */
  W.linkTarget = (href) => {
    if (!href) return null;
    let path = href;
    if (/^https?:\/\/en\.wikipedia\.org\/wiki\//i.test(path)) path = path.replace(/^https?:\/\/en\.wikipedia\.org/i, '');
    const m = /^(?:\.\/|\/wiki\/)([^?#]+)(#.*)?$/.exec(path);
    if (!m) return null;
    let title;
    try {
      title = decodeURIComponent(m[1]).replace(/_/g, ' ');
    } catch (e) {
      return null;
    }
    const colon = title.indexOf(':');
    if (colon > 0 && NON_ARTICLE_NS.has(title.slice(0, colon).trim().toLowerCase())) return null;
    return { title: U.normTitle(title), fragment: m[2] ? m[2].slice(1) : null };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WS;
})(typeof window !== 'undefined' ? window : globalThis);
