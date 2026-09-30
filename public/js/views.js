/* Home, Six Degrees explorer, history, leaderboard, account/settings, about. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const C = WS.ui;
  const esc = U.esc;
  const V = (WS.views = WS.views || {});

  // ======================================================================
  // Home
  // ======================================================================
  V.home = async (el) => {
    const today = U.todayKey();
    const [ds, dt] = WS.articles.dailyPair(today);
    const attempt = WS.store.dailyAttempt(today);
    const streak = WS.store.streak();
    const recent = WS.store.localRuns().slice(0, 4);

    el.innerHTML = `
      <section class="hero">
        <h1>Race through Wikipedia.</h1>
        <p>Get from one article to another using only the links inside them — as fast as you can.<span class="hero-more"> Then see how your route stacks up against every shortest path, courtesy of <b>Six Degrees of Wikipedia</b>.</span></p>
        <div class="row"><span class="pill pill-hot">📅 Daily Challenge #${U.dailyNumber(today)}</span>${streak ? `<span class="pill pill-warn">🔥 ${streak}-day streak</span>` : ''}<span class="pill" id="players"></span></div>
        <div class="daily" id="daily-cards">${C.pageCardSkeleton('Start')}<div class="arrow">→</div>${C.pageCardSkeleton('Target', true)}</div>
        <div class="row" id="daily-actions">
          ${
            attempt && attempt.runId && attempt.runId !== 'pending'
              ? `<span class="pill ${attempt.finished ? 'pill-good' : ''}">${attempt.finished ? `✅ Done in ${U.fmtTime(attempt.timeMs)} · ${U.plural(attempt.clicks, 'click')}` : '🏳️ Attempted'}</span>
                 <a class="btn" href="#/run?id=${encodeURIComponent(attempt.runId)}">Your result</a>
                 <a class="btn" href="#/leaderboard">🏆 Leaderboard</a>
                 <a class="btn btn-ghost" href="#/play?mode=daily">Practice again</a>`
              : `<a class="btn btn-hot btn-lg" href="#/play?mode=daily">▶ Play today's challenge</a><a class="btn btn-ghost" href="#/leaderboard">🏆 Leaderboard</a>`
          }
        </div>
      </section>

      <h2 class="section-title more">More ways to play</h2>
      <div class="grid grid-3">
        <div class="card mode-card"><div class="emoji">🎲</div><h3>Random</h3><p>Two well-known articles from different corners of Wikipedia.</p><a class="btn btn-primary" href="#/play?mode=random">Play random</a></div>
        <div class="card mode-card"><div class="emoji">🌀</div><h3>Chaos mode</h3><p>Truly random articles. Obscure villages, forgotten footballers, 18th-century ships. Good luck.</p><button class="btn" id="chaos">Roll the dice</button></div>
        <div class="card mode-card"><div class="emoji">🔭</div><h3>Six Degrees explorer</h3><p>Find every shortest path between any two articles and see them as a graph.</p><a class="btn" href="#/six-degrees">Open explorer</a></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>🎯 Custom challenge</h2>
        <div class="sd-form">
          <div><label class="field">Start</label><div class="ac"><input class="input" id="c-start" placeholder="e.g. Pizza"></div></div>
          <button class="icon-btn swap" id="c-swap" title="Swap">⇄</button>
          <div><label class="field">Target</label><div class="ac"><input class="input" id="c-target" placeholder="e.g. Albert Einstein"></div></div>
          <button class="btn btn-primary" id="c-go">Play</button>
        </div>
      </div>

      ${
        recent.length
          ? `<div class="row" style="margin:28px 0 10px"><h2 class="section-title" style="margin:0">Recent runs</h2><span class="spacer"></span><a href="#/history" class="small">All runs →</a></div>
             <div class="grid grid-2">${recent.map(runItem).join('')}</div>`
          : ''
      }`;

    const $ = (s) => U.$(s, el);
    WS.wiki.pageInfo([ds, dt]).then((info) => {
      const cards = $('#daily-cards');
      if (cards) cards.innerHTML = `${C.pageCard(info.get(ds), { label: 'Start' })}<div class="arrow">→</div>${C.pageCard(info.get(dt), { label: 'Target', target: true })}`;
    }).catch(() => {
      const cards = $('#daily-cards');
      if (cards) cards.innerHTML = `${C.pageCard({ title: ds }, { label: 'Start' })}<div class="arrow">→</div>${C.pageCard({ title: dt }, { label: 'Target', target: true })}`;
    });
    WS.fb.ready.then(async (ok) => {
      if (!ok) return;
      const n = await WS.fb.dailyCount(today);
      const p = $('#players');
      if (p && n != null) p.textContent = `👥 ${U.plural(n, 'player')} today`;
      else if (p) p.remove();
    });
    if (!WS.fb.enabled) $('#players').remove();

    $('#chaos').onclick = async (e) => {
      e.target.disabled = true;
      e.target.innerHTML = '<span class="spinner"></span>';
      try {
        const a = await WS.wiki.randomArticle();
        const b = await WS.wiki.randomArticle({ exclude: [a] });
        WS.app.go('play', { mode: 'custom', start: a, target: b });
      } catch (err) {
        U.toast(err.message, 'bad');
        e.target.disabled = false;
        e.target.textContent = 'Roll the dice';
      }
    };
    const cs = $('#c-start'), ct = $('#c-target');
    const go = () => {
      if (!cs.value.trim() || !ct.value.trim()) return U.toast('Pick both articles first.');
      WS.app.go('play', { mode: 'custom', start: cs.value.trim(), target: ct.value.trim() });
    };
    C.autocomplete(cs, { onPick: () => ct.focus(), onEnter: () => ct.focus() });
    C.autocomplete(ct, { onEnter: go });
    $('#c-swap').onclick = () => ([cs.value, ct.value] = [ct.value, cs.value]);
    $('#c-go').onclick = go;
  };

  function runItem(r) {
    const eff = r.optimal && r.finished ? (r.clicks <= r.optimal ? '<span class="pill pill-good">⭐ Perfect</span>' : `<span class="pill">par ${r.optimal}</span>`) : '';
    return `<a class="run-item" href="#/run?id=${encodeURIComponent(r.id)}">
      <div style="font-size:1.5rem">${r.finished ? (r.date ? '📅' : '🏁') : '🏳️'}</div>
      <div style="flex:1">
        <div class="route-t">${esc(r.start)} → ${esc(r.target)}</div>
        <div class="muted small">${r.finished ? `${U.fmtTime(r.timeMs)} · ${U.plural(r.clicks, 'click')}` : `Gave up after ${U.plural(r.clicks, 'click')}`} · ${U.relTime(r.createdAt)}</div>
      </div>${eff}</a>`;
  }

  // ======================================================================
  // Six Degrees explorer: #/six-degrees?from=..&to=..&engine=auto|sdow|live
  // ======================================================================
  V.sixDegrees = async (el, params) => {
    const engine = params.engine || 'auto';
    el.innerHTML = `
      <div style="margin-bottom:16px">
        <h1 class="serif" style="margin:0 0 4px;font-size:clamp(1.7rem,4vw,2.4rem)">Six Degrees of Wikipedia</h1>
        <p class="muted" style="margin:0">Find the shortest paths between any two articles. Built on <a href="https://github.com/jwngr/sdow" target="_blank" rel="noopener">jwngr/sdow</a>'s bi-directional breadth-first search.</p>
      </div>
      <div class="card">
        <div class="sd-form">
          <div><label class="field">From</label><div class="ac"><input class="input" id="from" placeholder="Start article" value="${esc(params.from || '')}"></div></div>
          <button class="icon-btn swap" id="swap" title="Swap">⇄</button>
          <div><label class="field">To</label><div class="ac"><input class="input" id="to" placeholder="Target article" value="${esc(params.to || '')}"></div></div>
          <button class="btn btn-primary" id="go">Find paths</button>
        </div>
        <div class="row" style="margin-top:14px">
          <span class="small muted">Engine</span>
          <div class="seg" id="engine">
            <button data-e="auto" title="Six Degrees database, falls back to live search">Auto</button>
            <button data-e="sdow" title="Six Degrees of Wikipedia API (full link-graph snapshot)">Database</button>
            <button data-e="live" title="Runs the search in your browser against live Wikipedia">Live</button>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" id="surprise">🎲 Surprise me</button>
        </div>
      </div>
      <div id="out" style="margin-top:16px"></div>`;
    const $ = (s) => U.$(s, el);
    const from = $('#from'), to = $('#to'), out = $('#out');
    let eng = engine;
    const drawEngine = () => U.$$('#engine button', el).forEach((b) => b.classList.toggle('on', b.dataset.e === eng));
    drawEngine();
    U.$$('#engine button', el).forEach((b) => (b.onclick = () => ((eng = b.dataset.e), drawEngine())));

    const submit = () => {
      const f = from.value.trim(), t = to.value.trim();
      if (!f || !t) return U.toast('Enter two articles.');
      WS.app.go('six-degrees', { from: f, to: t, engine: eng === 'auto' ? undefined : eng });
    };
    C.autocomplete(from, { onPick: () => to.focus(), onEnter: () => to.focus() });
    C.autocomplete(to, { onEnter: submit });
    $('#go').onclick = submit;
    $('#swap').onclick = () => ([from.value, to.value] = [to.value, from.value]);
    $('#surprise').onclick = () => {
      const [a, b] = WS.articles.pickPair();
      WS.app.go('six-degrees', { from: a, to: b, engine: eng === 'auto' ? undefined : eng });
    };

    if (!params.from || !params.to) {
      out.innerHTML = `<div class="card prose">
        <h2 style="margin-top:0">How it works</h2>
        <p>Wikipedia is a giant directed graph: articles are nodes, links are edges. To find the shortest route, the search grows two frontiers at once — forward from the start (pages it links to) and backward from the target (pages that link to it) — always expanding whichever side is cheaper. The moment the frontiers touch, every page where they meet gives a shortest path.</p>
        <p><b>Database</b> asks the Six Degrees of Wikipedia server, which runs this search over a full snapshot of the ~6 million article link graph in milliseconds. <b>Live</b> runs the same algorithm right here in your browser against the live Wikipedia API — slower, but it knows about articles and links added since the snapshot.</p>
      </div>`;
      return;
    }

    const ctrl = new AbortController();
    const t0 = performance.now();
    out.innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><span class="spinner"></span><b id="status">Searching…</b><span class="spacer"></span><button class="btn btn-sm" id="cancel">Cancel</button></div><div class="progress"><div></div></div><p class="muted small" id="detail" style="margin:10px 0 0"></p></div>`;
    U.$('#cancel', out).onclick = () => ctrl.abort();
    const status = U.$('#status', out), detail = U.$('#detail', out);
    const onProgress = (p) => {
      if (p.fallback) {
        status.textContent = 'Not in the Six Degrees database — searching live Wikipedia…';
        detail.textContent = p.reason;
        return;
      }
      status.textContent = `Searching live Wikipedia · depth ${p.depth} · ${p.direction}`;
      detail.textContent = `${p.explored.toLocaleString()} pages expanded · ${(p.requests || 0).toLocaleString()} API requests · frontier ${p.frontier.toLocaleString()} pages · ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    };

    let r;
    try {
      r = await WS.sdow.find(params.from, params.to, { engine, signal: ctrl.signal, onProgress });
    } catch (e) {
      if (e.name === 'AbortError') {
        out.innerHTML = `<div class="card muted">Search cancelled.</div>`;
        return;
      }
      out.innerHTML = `<div class="card"><b>Search failed.</b> <span class="muted">${esc(e.message)}</span>
        ${engine !== 'live' ? `<div style="margin-top:12px"><a class="btn btn-sm" href="#/six-degrees?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}&engine=live">Try the live engine</a></div>` : ''}</div>`;
      return;
    }
    from.value = r.source;
    to.value = r.target;
    const secs = (r.ms / 1000).toFixed(r.ms < 1000 ? 2 : 1);
    const engineLabel = r.engine === 'sdow' ? 'Six Degrees database' : `live Wikipedia (${(r.requests || 0).toLocaleString()} requests)`;
    if (!r.paths.length) {
      out.innerHTML = `<div class="card"><p class="sd-headline">${r.gaveUp ? 'Gave up' : 'No path'} from <b>${esc(r.source)}</b> to <b>${esc(r.target)}</b>.</p>
        <p class="muted small">${r.gaveUp ? 'The live search hit its request budget before the frontiers met. The database engine can search much deeper.' : 'Some pages simply cannot reach others — e.g. pages with no outgoing links.'} · ${engineLabel} · ${secs}s</p></div>`;
      return;
    }
    const mkPaths = (n) => r.paths.slice(0, n).map((p, i) => C.pathRow(p, i)).join('');
    out.innerHTML = `
      <div class="card">
        <p class="sd-headline">Found <b>${U.plural(r.totalPaths, 'path')}</b> with <b>${U.plural(r.degrees, 'degree')}</b> of separation from <b>${esc(r.source)}</b> to <b>${esc(r.target)}</b>.</p>
        <p class="muted small" style="margin:6px 0 14px">${engineLabel} · ${secs}s${r.approximate ? ' · <span class="pill pill-warn" title="Some very large link lists were truncated">approximate</span>' : ''}${r.fallbackReason ? ` · fell back to live search` : ''}</p>
        <div class="row" style="margin-bottom:14px">
          <a class="btn btn-hot" href="#/play?mode=custom&start=${encodeURIComponent(r.source)}&target=${encodeURIComponent(r.target)}">▶ Race this pair</a>
          <a class="btn" href="#/six-degrees?from=${encodeURIComponent(r.target)}&to=${encodeURIComponent(r.source)}${engine !== 'auto' ? '&engine=' + engine : ''}">⇄ Reverse</a>
          ${r.engine === 'sdow' ? `<a class="btn btn-ghost" href="#/six-degrees?from=${encodeURIComponent(r.source)}&to=${encodeURIComponent(r.target)}&engine=live">Re-run live</a>` : ''}
        </div>
        <div class="graph-wrap" id="graph" style="max-height:560px"></div>
        ${r.paths.length > 40 ? `<p class="muted tiny">Graph shows 40 of ${r.paths.length} paths.</p>` : ''}
      </div>
      <div class="card" style="margin-top:16px"><h2>Paths</h2><div class="paths-list" id="plist">${mkPaths(20)}</div>
      ${r.paths.length > 20 ? `<button class="btn btn-sm" id="more" style="margin-top:10px">Show all ${r.paths.length}</button>` : ''}</div>`;
    WS.graph.render(U.$('#graph', out), r.paths.slice(0, 40));
    const more = U.$('#more', out);
    if (more) more.onclick = () => ((U.$('#plist', out).innerHTML = mkPaths(r.paths.length)), more.remove());
    return () => ctrl.abort();
  };

  // ======================================================================
  // History
  // ======================================================================
  V.history = async (el, params) => {
    const filter = params.filter || 'all';
    el.innerHTML = `<h1 class="serif" style="margin:0 0 14px">Your runs</h1><div id="h"><div class="empty"><span class="spinner"></span></div></div>`;
    await WS.fb.ready;
    const runs = await WS.store.allRuns();
    const st = WS.store.stats(runs);
    const shown = runs.filter((r) => (filter === 'daily' ? r.date : filter === 'finished' ? r.finished : true));
    U.$('#h', el).innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Played</div><div class="v">${st.played}</div></div>
        <div class="stat"><div class="k">Finished</div><div class="v">${st.finished}</div></div>
        <div class="stat hot"><div class="k">Best time</div><div class="v">${U.fmtTime(st.bestTime)}</div></div>
        <div class="stat"><div class="k">Avg clicks</div><div class="v">${st.avgClicks != null ? st.avgClicks.toFixed(1) : '–'}</div></div>
        <div class="stat good"><div class="k">Perfect runs</div><div class="v">${st.perfect}</div></div>
        <div class="stat"><div class="k">Efficiency</div><div class="v">${st.efficiency != null ? Math.round(st.efficiency * 100) + '%' : '–'}</div></div>
      </div>
      <div class="row" style="margin-bottom:12px">
        <div class="seg">${['all', 'daily', 'finished'].map((f) => `<button class="${f === filter ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
        <span class="spacer"></span>
        <span class="muted small">${WS.fb.user ? '☁️ Synced to your account' : '💾 Saved on this device — <a href="#/account">sign in</a> to sync'}</span>
      </div>
      ${shown.length ? `<div class="grid grid-2">${shown.map(runItem).join('')}</div>` : `<div class="empty"><div class="e">🏃</div>No runs yet.<br><br><a class="btn btn-hot" href="#/play?mode=daily">Play the daily challenge</a></div>`}`;
    U.$$('.seg button', el).forEach((b) => (b.onclick = () => WS.app.go('history', { filter: b.dataset.f === 'all' ? undefined : b.dataset.f })));
  };

  // ======================================================================
  // Leaderboard: #/leaderboard?date=YYYY-MM-DD&by=time|clicks
  // ======================================================================
  V.leaderboard = async (el, params) => {
    const today = U.todayKey();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : today;
    const by = params.by === 'clicks' ? 'clicks' : 'time';
    const [s, t] = WS.articles.dailyPair(date);
    const shift = (n) => {
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return U.todayKey(d);
    };
    const prev = shift(-1), next = shift(1);
    el.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <a class="icon-btn" href="#/leaderboard?date=${prev}${by === 'clicks' ? '&by=clicks' : ''}" title="Previous day">◀</a>
        <div><h1 class="serif" style="margin:0;font-size:1.7rem">Daily #${U.dailyNumber(date)} leaderboard</h1>
          <div class="muted small">${new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
        ${next <= today ? `<a class="icon-btn" href="#/leaderboard?date=${next}${by === 'clicks' ? '&by=clicks' : ''}" title="Next day">▶</a>` : ''}
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="row"><b class="serif" style="font-size:1.15rem">${esc(s)} → ${esc(t)}</b><span class="spacer"></span>
          <a class="btn btn-sm ${date === today ? 'btn-hot' : ''}" href="#/play?mode=daily&date=${date}">${date === today ? '▶ Play' : 'Practice'}</a>
          <a class="btn btn-sm" href="#/six-degrees?from=${encodeURIComponent(s)}&to=${encodeURIComponent(t)}">🔭 Shortest paths</a></div>
      </div>
      <div class="row" style="margin-bottom:12px"><div class="seg">
        <button class="${by === 'time' ? 'on' : ''}" data-by="time">⏱ Fastest</button>
        <button class="${by === 'clicks' ? 'on' : ''}" data-by="clicks">🖱 Fewest clicks</button></div></div>
      <div class="card" id="lb" style="padding:8px 12px"><div class="empty"><span class="spinner"></span></div></div>`;
    U.$$('[data-by]', el).forEach((b) => (b.onclick = () => WS.app.go('leaderboard', { date, by: b.dataset.by === 'time' ? undefined : 'clicks' })));
    const lb = U.$('#lb', el);
    const ok = await WS.fb.ready;
    if (!ok) {
      lb.innerHTML = `<div class="empty"><div class="e">🔌</div>Leaderboards need the online version.<br><span class="small">Play at <a href="https://wiki-speedruns.web.app">wiki-speedruns.web.app</a>.</span></div>`;
      return;
    }
    let rows;
    try {
      rows = await WS.fb.leaderboard(date, by, 100);
    } catch (e) {
      lb.innerHTML = `<div class="empty">Couldn't load the leaderboard: ${esc(e.message)}</div>`;
      return;
    }
    if (!rows.length) {
      lb.innerHTML = `<div class="empty"><div class="e">🏁</div>No finishers yet. Be the first!</div>`;
      return;
    }
    const me = WS.fb.user && WS.fb.user.uid;
    const medal = (i) => ['🥇', '🥈', '🥉'][i] || i + 1;
    lb.innerHTML = `<table class="table"><thead><tr><th>#</th><th>Player</th><th class="num">Time</th><th class="num">Clicks</th></tr></thead><tbody>
      ${rows
        .map(
          (r, i) => `<tr class="${r.uid === me ? 'me' : ''}" title="${esc((r.path || []).join(' → '))}">
            <td class="rank">${medal(i)}</td>
            <td><div class="row" style="gap:8px;flex-wrap:nowrap">${C.avatar(r.displayName, r.photoURL)}<span>${esc(r.displayName)}</span>${r.optimal && r.clicks <= r.optimal ? '<span title="Shortest possible path">⭐</span>' : ''}</div></td>
            <td class="num">${U.fmtTime(r.timeMs)}</td><td class="num">${r.clicks}</td></tr>`
        )
        .join('')}</tbody></table>
      ${me ? '' : `<p class="muted small center"><a href="#/account">Sign in</a> to get on the board.</p>`}`;
  };

  // ======================================================================
  // Account + settings
  // ======================================================================
  V.account = async (el) => {
    el.innerHTML = `<div style="max-width:560px;margin:0 auto"><h1 class="serif" style="margin:0 0 14px">Account</h1><div id="acct"><div class="empty"><span class="spinner"></span></div></div>
      <div class="card" style="margin-top:16px" id="settings"></div></div>`;
    drawSettings(U.$('#settings', el));
    const box = U.$('#acct', el);
    const ok = await WS.fb.ready;
    if (!ok) {
      box.innerHTML = `<div class="card"><h2>Login unavailable</h2><p class="muted">This copy of WikiSpeedruns isn't connected to Firebase${location.protocol === 'file:' ? ' (you opened it as a local file)' : ''}. Your runs are still saved on this device.</p><p class="small">For accounts, leaderboards and sync, play at <a href="https://wiki-speedruns.web.app">wiki-speedruns.web.app</a>.</p></div>`;
      return;
    }
    const draw = () => {
      const u = WS.fb.user;
      if (!u) return drawSignIn(box);
      const p = WS.fb.profile || {};
      box.innerHTML = `<div class="card">
        <div class="row"><span class="avatar" style="width:56px;height:56px;font-size:1.4rem;${p.photoURL ? `background-image:url('${esc(p.photoURL)}')` : ''}">${p.photoURL ? '' : esc((p.displayName || '?')[0])}</span>
          <div><div class="serif" style="font-size:1.3rem;font-weight:700">${esc(p.displayName || '')}</div>
          <div class="muted small">${u.isAnonymous ? 'Guest account — only on this device until you upgrade' : esc(u.email || '')}</div></div></div>
        <div style="margin-top:16px"><label class="field">Leaderboard name</label>
          <div class="row" style="flex-wrap:nowrap"><input class="input" id="name" maxlength="32" value="${esc(p.displayName || '')}"><button class="btn" id="save-name">Save</button></div></div>
        ${u.isAnonymous ? `<div class="card" style="margin-top:16px;background:var(--accent-soft);border-color:transparent;box-shadow:none"><b>Keep your runs forever</b><p class="small muted" style="margin:4px 0 10px">Upgrade your guest account — your history and leaderboard entries come with you.</p><button class="btn btn-primary" id="upgrade">${googleIcon} Continue with Google</button></div>` : ''}
        <div class="row" style="margin-top:16px"><a class="btn" href="#/history">Your runs</a><span class="spacer"></span><button class="btn btn-ghost" id="out">Sign out</button></div></div>`;
      U.$('#save-name', box).onclick = async () => {
        try {
          await WS.fb.setDisplayName(U.$('#name', box).value);
          U.toast('Name saved', 'good');
        } catch (e) {
          U.toast(e.message, 'bad');
        }
      };
      U.$('#out', box).onclick = () => WS.fb.signOut();
      const up = U.$('#upgrade', box);
      if (up) up.onclick = () => WS.fb.signInGoogle().catch((e) => U.toast(e.message, 'bad'));
    };
    draw();
    const off = WS.fb.onChange(draw);
    return off;
  };

  const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;

  function drawSignIn(box, { inModal = false } = {}) {
    box.innerHTML = `<div class="${inModal ? '' : 'card'}">
      <h2>Sign in</h2>
      <p class="muted small" style="margin-top:0">Get on the daily leaderboard and sync your runs across devices.</p>
      <button class="btn btn-block" id="g">${googleIcon} Continue with Google</button>
      <div class="divider">or with email</div>
      <form id="ef">
        <input class="input" type="email" id="em" placeholder="Email" autocomplete="email" required style="margin-bottom:8px">
        <input class="input" type="password" id="pw" placeholder="Password (6+ characters)" autocomplete="current-password" required minlength="6" style="margin-bottom:10px">
        <div class="row"><button class="btn btn-primary" type="submit" id="signin">Sign in</button><button class="btn" type="button" id="signup">Create account</button><span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" id="forgot">Forgot?</button></div>
      </form>
      <div class="divider">or</div>
      <button class="btn btn-block btn-ghost" id="guest">👤 Play as guest</button>
      <p class="muted tiny" style="margin-bottom:0">Guests get a leaderboard name and can upgrade to a full account later.</p></div>`;
    const $ = (s) => U.$(s, box);
    const busy = async (btn, fn) => {
      const html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await fn();
        return true;
      } catch (e) {
        U.toast(e.message, 'bad', 5000);
        return false;
      } finally {
        btn.disabled = false;
        btn.innerHTML = html;
      }
    };
    const done = () => box.dispatchEvent(new CustomEvent('signedin', { bubbles: true }));
    $('#g').onclick = async () => (await busy($('#g'), WS.fb.signInGoogle)) && done();
    $('#guest').onclick = async () => (await busy($('#guest'), WS.fb.signInGuest)) && done();
    $('#ef').onsubmit = async (e) => {
      e.preventDefault();
      (await busy($('#signin'), () => WS.fb.signInEmail($('#em').value, $('#pw').value, false))) && done();
    };
    $('#signup').onclick = async () => {
      if (!$('#ef').reportValidity()) return;
      (await busy($('#signup'), () => WS.fb.signInEmail($('#em').value, $('#pw').value, true))) && done();
    };
    $('#forgot').onclick = async () => {
      const em = $('#em').value.trim();
      if (!em) return U.toast('Enter your email first.');
      (await busy($('#forgot'), () => WS.fb.resetPassword(em))) && U.toast('Password reset email sent.', 'good');
    };
  }
  WS.ui.signInModal = () => {
    const m = U.modal('<div id="si"></div>');
    const box = U.$('#si', m.el);
    drawSignIn(box, { inModal: true });
    box.addEventListener('signedin', () => {
      m.close();
      U.toast('Signed in!', 'good');
    });
  };

  const TOGGLES = [
    ['showPar', 'Show par before starting', 'The optimal number of clicks, from Six Degrees'],
    ['hideRefs', 'Hide citation numbers', 'Cleaner articles, fewer misclicks'],
    ['allowBack', 'Allow the Back button during runs', 'Off = classic no-takebacks rules. Never available on ranked daily runs.'],
    ['allowFind', 'Allow searching articles (Ctrl+F / Cmd+F)', 'Off = no searching for the target (blocked where the browser allows it). Never available on ranked daily runs.'],
  ];

  function drawSettings(box) {
    const s = WS.store.settings();
    box.innerHTML = `<h2>Settings</h2>
      <div class="row" style="justify-content:space-between;margin-bottom:12px"><span>Theme</span>
        <div class="seg">${['auto', 'light', 'dark'].map((t) => `<button data-theme="${t}" class="${s.theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
      ${TOGGLES.map(([key, label, help]) => `<label class="row setting"><span>${label}<br><span class="muted tiny">${help}</span></span><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`).join('')}`;
    U.$$('[data-theme]', box).forEach((b) => (b.onclick = () => {
      WS.store.setSetting('theme', b.dataset.theme);
      WS.app.applyTheme();
      drawSettings(box);
    }));
    U.$$('[data-setting]', box).forEach((i) => (i.onchange = (e) => WS.store.setSetting(i.dataset.setting, e.target.checked)));
  }

  // ======================================================================
  // About
  // ======================================================================
  V.about = async (el) => {
    const isFile = location.protocol === 'file:';
    el.innerHTML = `<div class="prose">
      <h1 class="serif">About WikiSpeedruns</h1>
      <h2>How to play</h2>
      <ol>
        <li>You get a <b>start</b> article and a <b>target</b> article.</li>
        <li>Click links inside the article to move between pages. No search bar, no URL hacking.</li>
        <li>Reach the target in as little time — and as few clicks — as you can.</li>
        <li>By default it's <b>no takebacks and no searching</b> — the classic rule. Once you click a link, that's your route, and Ctrl+F / Cmd+F is blocked (best effort: browser menus can't be blocked). The timer pauses while pages load.</li>
        <li>You can turn on the <b>Back</b> button and/or <b>searching</b> for yourself in <a href="#/account">Settings</a>. They're never available on ranked daily runs, and if you use them elsewhere it's clearly flagged on your results page.</li>
      </ol>
      <p>The <b>Daily Challenge</b> is the same pair for everyone and resets at 00:00 UTC. Your first attempt counts for the leaderboard; after that it's practice. Hints, Back and searching are all unavailable on ranked runs.</p>
      <p>Shortcuts (when Back is enabled in Settings): <kbd>Alt</kbd>+<kbd>←</kbd> or <kbd>Backspace</kbd> to go back.</p>

      <h2>Six Degrees of Wikipedia inside</h2>
      <p>After every run, WikiSpeedruns compares your route with <b>every shortest path</b> between the two articles, using <a href="https://github.com/jwngr/sdow" target="_blank" rel="noopener">Six Degrees of Wikipedia</a> by Jacob Wenger (MIT license). For each page you visited it asks how many clicks you still were from the target, so you can see exactly where you gained or lost ground — and what the best link was.</p>
      <p>The <a href="#/six-degrees">explorer</a> can use the Six Degrees database, or run a port of its bi-directional breadth-first search right in your browser against live Wikipedia.</p>

      <h2>Install it</h2>
      <ul>
        <li><b>Phone:</b> open <a href="https://wiki-speedruns.web.app">wiki-speedruns.web.app</a>, then <i>Share → Add to Home Screen</i> (iOS) or <i>⋮ → Install app</i> (Android). It runs full-screen like a native app.</li>
        <li><b>Desktop:</b> click the install icon in Chrome/Edge's address bar.</li>
        <li><b>Single HTML file:</b> ${isFile ? 'you are using it right now!' : '<a href="WikiSpeedruns.html" download>download WikiSpeedruns.html</a> and open it in any browser — no server needed. (Accounts and leaderboards need the online version.)'}</li>
      </ul>
      <h2>Credits</h2>
      <p>Article content from <a href="https://en.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a>, available under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Shortest paths from <a href="https://www.sixdegreesofwikipedia.com" target="_blank" rel="noopener">Six Degrees of Wikipedia</a>. Inspired by <a href="https://wikispeedruns.com" target="_blank" rel="noopener">wikispeedruns.com</a>. Not affiliated with the Wikimedia Foundation.</p>
    </div>`;
  };
})(window);
