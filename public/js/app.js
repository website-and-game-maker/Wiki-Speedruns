/* App shell: hash router, top nav, account button, theme, service worker. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const esc = U.esc;

  const ROUTES = {
    '': { view: 'home', nav: 'home', title: 'WikiSpeedruns' },
    play: { view: 'play', nav: 'play', title: 'Play' },
    run: { view: 'run', nav: 'history', title: 'Results' },
    'six-degrees': { view: 'sixDegrees', nav: 'six', title: 'Six Degrees of Wikipedia' },
    history: { view: 'history', nav: 'history', title: 'Your runs' },
    leaderboard: { view: 'leaderboard', nav: 'lb', title: 'Leaderboard' },
    account: { view: 'account', nav: 'me', title: 'Account' },
    about: { view: 'about', nav: 'about', title: 'About' },
  };

  const app = (WS.app = { guard: null });
  let cleanups = [];
  let token = 0;
  let lastHash = location.hash;

  const parse = () => {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const params = {};
    new URLSearchParams(qs || '').forEach((v, k) => (params[k] = v));
    return { path: path.replace(/\/$/, ''), params };
  };
  const build = (route, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    const s = qs.toString();
    return `#/${route}${s ? '?' + s : ''}`;
  };

  app.go = (route, params) => {
    const h = build(route, params);
    if (h === location.hash) render();
    else location.hash = h;
  };
  app.replaceRoute = (route, params) => {
    history.replaceState(null, '', build(route, params));
    lastHash = location.hash;
    render();
  };
  /** Register teardown for the current view (timers, listeners, in-flight requests). */
  app.addCleanup = (fn) => cleanups.push(fn);

  async function render() {
    const my = ++token;
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    const { path, params } = parse();
    const route = ROUTES[path] || ROUTES[''];
    document.title = route.title === 'WikiSpeedruns' ? 'WikiSpeedruns — race through Wikipedia' : `${route.title} · WikiSpeedruns`;
    U.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
    document.body.classList.remove('in-game');
    const el = document.getElementById('view');
    el.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      const cleanup = await WS.views[route.view](el, params);
      if (typeof cleanup === 'function') {
        if (my === token) cleanups.push(cleanup);
        else cleanup();
      }
    } catch (e) {
      console.error(e);
      if (my === token) el.innerHTML = `<div class="empty"><div class="e">💥</div>Something broke: ${esc(e.message)}<br><br><a class="btn" href="#/">Home</a></div>`;
    }
  }

  window.addEventListener('hashchange', () => {
    if (app.guard && !app.guard()) {
      history.replaceState(null, '', lastHash);
      return;
    }
    lastHash = location.hash;
    render();
  });

  // ---------- Theme ----------
  app.applyTheme = () => {
    const t = WS.store.settings().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#171a21' : '#ffffff');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = dark ? '☀️' : '🌙';
  };

  // ---------- Account button ----------
  function drawAccount() {
    const btn = document.getElementById('acct-btn');
    if (!btn) return;
    const u = WS.fb.user;
    if (!WS.fb.enabled) {
      btn.className = 'acct-btn signed-out';
      btn.innerHTML = 'Sign in';
    } else if (!u) {
      btn.className = 'acct-btn signed-out';
      btn.innerHTML = 'Sign in';
    } else {
      const p = WS.fb.profile || {};
      btn.className = 'acct-btn';
      btn.innerHTML = `${WS.ui.avatar(p.displayName, p.photoURL)}<span class="hide-sm" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.displayName || 'Me')}</span>`;
    }
  }

  function boot() {
    app.applyTheme();
    if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', app.applyTheme);
    document.getElementById('theme-btn').onclick = () => {
      const dark = document.getElementById('theme-btn').textContent === '☀️';
      WS.store.setSetting('theme', dark ? 'light' : 'dark');
      app.applyTheme();
    };
    const acct = document.getElementById('acct-btn');
    acct.onclick = async () => {
      const ok = await WS.fb.ready;
      if (ok && !WS.fb.user) WS.ui.signInModal();
      else app.go('account');
    };
    drawAccount();
    WS.fb.onChange(drawAccount);
    WS.fb.ready.then(drawAccount);
    lastHash = location.hash;
    render();

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
