/* The game: pre-game lobby, the run itself, and the post-run comparison with Six Degrees. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const C = WS.ui;
  const esc = U.esc;
  const V = (WS.views = WS.views || {});

  // ======================================================================
  // Lobby: #/play?mode=daily|random|custom&start=..&target=..&date=..
  // ======================================================================

  V.play = async (el, params) => {
    const mode = params.mode || (params.start ? 'custom' : 'random');
    const date = params.date || U.todayKey();
    let start = params.start;
    let target = params.target;

    if (mode === 'daily') [start, target] = WS.articles.dailyPair(date);
    if (!start || !target) {
      [start, target] = WS.articles.pickPair();
      WS.app.replaceRoute('play', { mode, start, target });
      return;
    }

    const settings = WS.store.settings();
    const isDaily = mode === 'daily';
    const title = isDaily ? `Daily Challenge #${U.dailyNumber(date)}` : mode === 'random' ? 'Random Challenge' : 'Custom Challenge';
    el.innerHTML = `
      <div class="card" style="max-width:860px;margin:0 auto">
        <div class="row" style="margin-bottom:6px">
          <span class="pill ${isDaily ? 'pill-hot' : 'pill-accent'}">${isDaily ? '📅' : mode === 'random' ? '🎲' : '🎯'} ${esc(title)}</span>
          <span id="rank-pill"></span>
          <span class="spacer"></span>
          <span id="par-pill"></span>
        </div>
        <h1 class="serif" style="margin:8px 0 14px;font-size:clamp(1.5rem,4vw,2.1rem)">Get from <span id="h-start">${esc(start)}</span> to <span id="h-target" style="color:var(--hot)">${esc(target)}</span></h1>
        <div class="daily" id="cards">${C.pageCardSkeleton('Start')}<div class="arrow">→</div>${C.pageCardSkeleton('Target', true)}</div>
        <p id="target-extract" class="muted small" style="margin:0 0 18px"></p>
        <div class="row">
          <button class="btn btn-hot btn-lg" id="go" disabled>▶ Start run</button>
          ${mode === 'random' ? '<button class="btn" id="reroll">🎲 New pair</button>' : ''}
          ${mode !== 'daily' ? '<button class="btn" id="swap">⇄ Swap</button>' : ''}
          <button class="btn btn-ghost" id="share">🔗 Challenge a friend</button>
        </div>
        <p class="muted tiny" style="margin:16px 0 0">Rules: only click links inside the article. ${settings.allowBack ? '<b>Back</b> is on — it costs a click and takes this run out of ranked contention.' : 'No takebacks — once you click, that\'s it.'} ${settings.allowFind ? 'Searching (Ctrl+F) is on — it also takes this run out of ranked contention.' : 'No searching — Ctrl+F is blocked.'} The timer pauses while pages load, so slow internet doesn't hurt you. <a href="#/account">Change in Settings</a></p>
      </div>`;

    const $ = (s) => U.$(s, el);
    const ctrl = new AbortController();

    // Ranked?
    let ranked = false;
    if (isDaily) {
      const local = WS.store.dailyAttempt(date);
      ranked = date === U.todayKey() && !local;
      const setPill = () =>
        ($('#rank-pill').innerHTML = ranked
          ? `<span class="pill pill-good">🏆 Ranked — first attempt counts</span>`
          : `<span class="pill">Practice (unranked)</span>`);
      setPill();
      WS.fb.ready.then(async (ok) => {
        if (!ok || !WS.fb.user || !ranked) return;
        const entry = await WS.fb.myDailyEntry(date).catch(() => null);
        if (entry) {
          ranked = false;
          setPill();
        }
      });
    }

    // Resolve + describe both pages.
    let info;
    try {
      info = await WS.wiki.pageInfo([start, target], { extract: true, thumbSize: 240, signal: ctrl.signal });
    } catch (e) {
      $('#cards').innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="e">📡</div>Couldn't reach Wikipedia: ${esc(e.message)}<br><br><button class="btn" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    const si = info.get(start);
    const ti = info.get(target);
    if (si.missing || ti.missing) {
      $('#cards').innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="e">🤷</div>“${esc(si.missing ? start : target)}” isn't a Wikipedia article.<br><br><a class="btn" href="#/">Back home</a></div>`;
      return;
    }
    start = si.title;
    target = ti.title;
    $('#h-start').textContent = start;
    $('#h-target').textContent = target;
    $('#cards').innerHTML = `${C.pageCard(si, { label: 'Start', big: true })}<div class="arrow">→</div>${C.pageCard(ti, { label: 'Target', big: true, target: true })}`;
    $('#target-extract').innerHTML = ti.extract ? `<b>About the target:</b> ${esc(ti.extract)}` : '';
    if (start === target) {
      $('#target-extract').innerHTML = '<b>Start and target are the same article.</b> Pick another pair.';
      return;
    }
    const go = $('#go');
    go.disabled = false;
    go.focus();

    // Par (optimal clicks) in the background; shown only if the setting is on.
    const parPromise = WS.sdow.distance(start, target, { signal: ctrl.signal }).catch(() => null);
    if (WS.store.settings().showPar) {
      parPromise.then((d) => d && d.degrees != null && ($('#par-pill').innerHTML = `<span class="pill pill-warn" title="Shortest possible path, from Six Degrees of Wikipedia">⛳ Par ${d.degrees}</span>`));
    }

    go.onclick = () => {
      if (isDaily && ranked) WS.store.setDailyAttempt(date, { id: 'pending', finished: false });
      startRun(el, { mode, date: isDaily ? date : null, ranked, start, target, targetInfo: ti, startInfo: si });
    };
    const reroll = $('#reroll');
    if (reroll) reroll.onclick = () => WS.app.go('play', { mode: 'random', ...pairObj(WS.articles.pickPair()) });
    const swap = $('#swap');
    if (swap) swap.onclick = () => WS.app.go('play', { mode, start: target, target: start });
    $('#share').onclick = () => shareChallenge(start, target, isDaily ? date : null);

    return () => ctrl.abort();
  };

  const pairObj = ([start, target]) => ({ start, target });

  function challengeUrl(start, target) {
    const base = /^https?:/.test(location.protocol) ? location.origin + location.pathname : 'https://wiki-speedruns.web.app/';
    return `${base}#/play?mode=custom&start=${encodeURIComponent(start)}&target=${encodeURIComponent(target)}`;
  }

  async function shareChallenge(start, target, date, extra = '') {
    const url = date ? `https://wiki-speedruns.web.app/#/play?mode=daily` : challengeUrl(start, target);
    const text = `Can you get from ${start} to ${target} on Wikipedia?${extra}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'WikiSpeedruns challenge', text, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    if (await U.copy(`${text}\n${url}`)) U.toast('Challenge link copied!', 'good');
  }

  // ======================================================================
  // The run
  // ======================================================================

  function startRun(el, cfg) {
    const s = {
      ...cfg,
      id: U.id(),
      path: [{ title: cfg.start }],
      stack: [cfg.start],
      clicks: 0,
      backs: 0,
      hints: 0,
      finds: 0,
      activeMs: 0,
      segStart: null,
      loading: false,
      done: false,
      navToken: 0,
    };
    const hideRefs = WS.store.settings().hideRefs;
    const allowBack = WS.store.settings().allowBack;
    const allowFind = WS.store.settings().allowFind;

    document.body.classList.add('in-game');
    WS.app.guard = () => s.done || confirm('Leave this run? It will not be saved.');
    el.innerHTML = `
      <div class="hud">
        <div class="hud-main">
          <button class="icon-btn" id="quit" title="Give up">✕</button>
          <button class="hud-target" id="peek" title="About the target">
            ${C.thumb(cfg.targetInfo)}
            <div><div class="lbl">Target</div><div class="t">${esc(cfg.target)}</div></div>
          </button>
          <div class="hud-stat"><div class="v" id="clicks">0</div><div class="k">Clicks</div></div>
          <div class="hud-stat"><div class="v" id="timer">0:00.0</div><div class="k">Time</div></div>
          ${allowBack ? '<button class="btn btn-sm" id="back" title="Go back (costs a click) — Alt+←" disabled>←<span class="hide-sm"> Back</span></button>' : ''}
          ${cfg.ranked ? '' : '<button class="btn btn-sm" id="hint" title="Ask Six Degrees for a hint">💡<span class="hide-sm"> Hint</span></button>'}
        </div>
        <div class="hud-crumbs" id="crumbs"></div>
        <div class="loadbar" id="loadbar"></div>
      </div>
      <div class="article-wrap">
        <h1 class="article-title" id="a-title"></h1>
        <div class="redirect-note" id="a-redirect"></div>
        <div class="wiki ${hideRefs ? 'ws-no-refs' : ''}" id="article"></div>
      </div>`;
    const $ = (sel) => U.$(sel, el);
    const article = $('#article');

    // ---- timer: runs only while an article is on screen ----
    const now = () => performance.now();
    const elapsed = () => s.activeMs + (s.segStart != null ? now() - s.segStart : 0);
    const pause = () => {
      if (s.segStart != null) s.activeMs += now() - s.segStart;
      s.segStart = null;
    };
    const resume = () => {
      if (s.segStart == null && !s.done) s.segStart = now();
    };
    const tick = setInterval(() => ($('#timer').textContent = U.fmtTime(elapsed())), 100);
    const backBtn = allowBack ? $('#back') : null;

    const drawCrumbs = () => {
      $('#clicks').textContent = s.clicks;
      if (backBtn) backBtn.disabled = s.stack.length < 2 || s.done;
      const items = s.path.map((p, i) => `<span class="crumb ${i === s.path.length - 1 ? 'cur' : ''} ${p.back ? 'back' : ''}">${p.back ? '↩ ' : ''}${esc(p.title)}</span>`);
      $('#crumbs').innerHTML = items.join('<span class="crumb-sep">›</span>');
      const c = $('#crumbs');
      c.scrollLeft = c.scrollWidth;
    };

    // ---- article loading ----
    const loadbar = $('#loadbar');
    async function show(title, { fragment, onLoaded } = {}) {
      const token = ++s.navToken;
      s.loading = true;
      pause();
      loadbar.className = 'loadbar';
      void loadbar.offsetWidth;
      loadbar.className = 'loadbar on';
      let a;
      try {
        a = await WS.wiki.article(title);
      } catch (e) {
        if (token === s.navToken) {
          s.loading = false;
          loadbar.className = 'loadbar';
          resume();
          U.toast(e.code === 'missingtitle' ? `“${title}” doesn't exist.` : `Couldn't load “${title}”: ${e.message}`, 'bad');
        }
        return null;
      }
      if (token !== s.navToken || s.done) return null;
      onLoaded && onLoaded(a);
      $('#a-title').innerHTML = a.displayTitle;
      $('#a-redirect').textContent = a.redirectedFrom ? `(Redirected from ${a.redirectedFrom})` : '';
      article.replaceChildren(renderArticle(a.html));
      loadbar.className = 'loadbar done';
      s.loading = false;
      if (fragment) {
        const target = document.getElementById(fragment.replace(/ /g, '_'));
        if (target) target.scrollIntoView();
        else window.scrollTo(0, 0);
      } else window.scrollTo(0, 0);
      drawCrumbs();
      if (U.normTitle(a.title) === U.normTitle(s.target)) finish(true);
      else resume();
      return a;
    }

    async function follow(title, fragment) {
      if (s.loading || s.done) return;
      const shown = await show(title, {
        fragment,
        // Count the click only once the page actually loads (a failed load is free).
        onLoaded: (a) => {
          s.clicks++;
          s.path.push({ title: a.title });
          s.stack.push(a.title);
        },
      });
      return shown;
    }

    async function back() {
      if (!allowBack || s.loading || s.done || s.stack.length < 2) return;
      const prev = s.stack[s.stack.length - 2];
      await show(prev, {
        onLoaded: (a) => {
          s.stack.pop();
          s.clicks++;
          s.backs++;
          s.path.push({ title: a.title, back: true });
        },
      });
    }

    // ---- link handling ----
    const activate = (a) => {
      if (a.classList.contains('ws-anchor')) {
        const id = decodeURIComponent((a.getAttribute('data-anchor') || '').replace(/^#/, ''));
        const t = id && document.getElementById(id);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (a.classList.contains('ws-link')) follow(a.dataset.title, a.dataset.frag || null);
    };
    article.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      activate(a);
    });
    article.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const a = e.target.closest && e.target.closest('a.ws-link, a.ws-anchor');
        if (a) activate(a);
      }
    });
    const onKey = (e) => {
      if (e.target.matches && e.target.matches('input, textarea')) return;
      if (allowBack && ((e.altKey && e.key === 'ArrowLeft') || (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey))) {
        e.preventDefault();
        back();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        if (!allowFind) {
          e.preventDefault();
          U.toast('Searching is off — turn it on in Settings if you want it.');
        } else {
          s.finds++;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const onUnload = (e) => {
      if (!s.done) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);

    if (backBtn) backBtn.onclick = back;
    $('#peek').onclick = () => {
      const t = cfg.targetInfo;
      U.modal(`<div class="label pill pill-hot">🎯 Target</div>
        <h2 style="margin-top:10px">${esc(t.title)}</h2>
        ${t.thumb ? `<img src="${esc(t.thumb)}" alt="" style="float:right;max-width:120px;border-radius:10px;margin:0 0 8px 12px">` : ''}
        <p class="muted">${esc(t.description)}</p><p>${esc(t.extract)}</p>
        <div style="clear:both"></div>
        <p class="muted small">You're at <b>${esc(s.stack[s.stack.length - 1])}</b> after ${U.plural(s.clicks, 'click')}.</p>`);
    };
    $('#quit').onclick = () => {
      if (s.done) return;
      const m = U.modal(`<h2>Give up?</h2><p class="muted">Your run ends here. You'll still see the shortest paths and how close you got.</p>
        <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-x>Keep going</button><button class="btn btn-hot" data-quit>Give up</button></div>`);
      m.el.querySelector('[data-x]').onclick = m.close;
      m.el.querySelector('[data-quit]').onclick = () => {
        m.close();
        finish(false);
      };
    };
    const hintBtn = $('#hint');
    if (hintBtn) hintBtn.onclick = () => hint();

    async function hint() {
      const cur = s.stack[s.stack.length - 1];
      const box = document.createElement('div');
      box.className = 'hint-box';
      box.innerHTML = '<span class="spinner"></span> Asking Six Degrees of Wikipedia…';
      el.appendChild(box);
      const closeBox = () => box.remove();
      try {
        const d = await WS.sdow.distance(cur, s.target);
        if (s.done) return closeBox();
        s.hints++;
        if (d.degrees == null) {
          box.innerHTML = `No path from <b>${esc(cur)}</b> to the target in the Six Degrees database. Go back!`;
        } else {
          const links = U.$$('a.ws-link', article).filter((a) => d.next.includes(a.dataset.title));
          links.forEach((a) => a.classList.add('ws-hint'));
          const names = [...new Set(links.map((a) => a.dataset.title))];
          box.innerHTML = `You're <b>${U.plural(d.degrees, 'click')}</b> away.<br>${
            names.length
              ? `Best link${names.length > 1 ? 's' : ''} here: ${names.slice(0, 3).map((n) => `<b>${esc(n)}</b>`).join(', ')}
                 <div class="row" style="margin-top:8px"><button class="btn btn-sm btn-primary" data-show>Show me</button><button class="btn btn-sm" data-x>Close</button></div>`
              : 'The best next links aren’t visible on this version of the page. <button class="btn btn-sm" data-x>Close</button>'
          }`;
          const show = box.querySelector('[data-show]');
          if (show) show.onclick = () => links[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const x = box.querySelector('[data-x]');
        if (x) x.onclick = closeBox;
        setTimeout(closeBox, 15000);
      } catch (e) {
        box.textContent = 'Hint unavailable: ' + e.message;
        setTimeout(closeBox, 4000);
      }
    }

    async function finish(won) {
      if (s.done) return;
      pause();
      s.done = true;
      clearInterval(tick);
      $('#timer').textContent = U.fmtTime(s.activeMs);
      drawCrumbs();
      const run = {
        v: 1,
        id: s.id,
        mode: s.mode,
        date: s.date,
        ranked: !!s.ranked && s.hints === 0 && s.backs === 0 && s.finds === 0,
        start: s.start,
        target: s.target,
        path: s.path,
        clicks: s.clicks,
        backs: s.backs,
        hints: s.hints,
        finds: s.finds,
        timeMs: Math.round(s.activeMs),
        finished: won,
        optimal: null,
        createdAt: Date.now(),
      };
      if (run.date && s.ranked) WS.store.setDailyAttempt(run.date, run);
      await WS.store.saveRun(run);
      if (run.date && run.ranked) {
        // Optimal distance goes on the leaderboard entry if we already know it.
        const d = await Promise.race([WS.sdow.distance(run.start, run.target).catch(() => null), U.sleep(2500)]);
        if (d && d.degrees != null) run.optimal = d.degrees;
        WS.fb.submitDaily(run.date, run).then((r) => {
          if (r === 'ok') U.toast('Submitted to the daily leaderboard!', 'good');
          else if (r === 'exists') U.toast('Already on today’s leaderboard — this one is practice.');
        });
      }
      if (won) C.confetti();
      WS.app.go('run', { id: run.id, fresh: '1' });
    }

    history.pushState({ wsRunTrap: s.id }, '', location.href);
    const onPopState = () => {
      if (!s.done) history.pushState({ wsRunTrap: s.id }, '', location.href);
    };
    window.addEventListener('popstate', onPopState);

    drawCrumbs();
    show(cfg.start);

    WS.app.addCleanup(() => {
      clearInterval(tick);
      WS.app.guard = null;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('popstate', onPopState);
      document.body.classList.remove('in-game');
      s.navToken++;
    });
  }

  /** Turn parser HTML into a safe, playable DOM fragment. */
  function renderArticle(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, link, meta, iframe, object, embed, form, input, button, noscript, .mw-editsection, .navbar, #coordinates').forEach((n) => n.remove());
    for (const n of doc.body.querySelectorAll('*')) {
      for (const attr of [...n.attributes]) {
        if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) n.removeAttribute(attr.name);
      }
    }
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src && src.startsWith('//')) img.setAttribute('src', 'https:' + src);
      const srcset = img.getAttribute('srcset');
      if (srcset) img.setAttribute('srcset', srcset.replace(/(^|,\s*)\/\//g, '$1https://'));
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    }
    for (const a of doc.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      a.removeAttribute('href');
      a.removeAttribute('target');
      if (href && href.startsWith('#')) {
        a.className = 'ws-anchor';
        a.setAttribute('data-anchor', href);
        a.setAttribute('tabindex', '0');
        continue;
      }
      const t = a.classList.contains('new') || a.classList.contains('extiw') || a.classList.contains('external') ? null : WS.wiki.linkTarget(href);
      if (t) {
        a.classList.add('ws-link');
        a.dataset.title = t.title;
        if (t.fragment) a.dataset.frag = t.fragment;
        a.setAttribute('role', 'link');
        a.setAttribute('tabindex', '0');
      } else {
        a.classList.add('ws-dead');
      }
    }
    const frag = document.createDocumentFragment();
    frag.append(...doc.body.childNodes);
    return frag;
  }
  WS.game = { renderArticle };

  // ======================================================================
  // Results: #/run?id=..  — your path vs Six Degrees of Wikipedia
  // ======================================================================

  V.run = async (el, params) => {
    let run = WS.store.getRun(params.id);
    if (!run) {
      el.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
      await WS.fb.ready;
      const all = await WS.store.allRuns();
      run = all.find((r) => r.id === params.id);
    }
    if (!run) {
      el.innerHTML = `<div class="empty"><div class="e">🔍</div>Run not found.<br><br><a class="btn" href="#/history">Your runs</a></div>`;
      return;
    }
    const ctrl = new AbortController();
    const fresh = params.fresh === '1';
    const won = run.finished;
    const titleLine = won
      ? ['🏁', 'You made it!']
      : ['🏳️', 'Run abandoned'];
    const modeLabel = run.date ? `Daily #${U.dailyNumber(run.date)}` : run.mode === 'random' ? 'Random' : 'Custom';

    el.innerHTML = `
      <div class="win-banner">
        <div class="big">${titleLine[0]}</div>
        <h1>${titleLine[1]}</h1>
        <div class="muted">${esc(run.start)} → ${esc(run.target)} · ${esc(modeLabel)}${run.ranked ? ' · <span class="pill pill-good">Ranked</span>' : ''}${run.hints ? ` · <span class="pill pill-warn">💡 ${U.plural(run.hints, 'hint')}</span>` : ''}${run.backs ? ` · <span class="pill pill-warn">↩ ${U.plural(run.backs, 'back')}</span>` : ''}${run.finds ? ` · <span class="pill pill-warn">🔍 ${U.plural(run.finds, 'search', 'searches')}</span>` : ''}</div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="row" style="justify-content:center;margin-bottom:22px">
        <button class="btn btn-hot" id="again">↻ Play again</button>
        <a class="btn" href="#/play?mode=random">🎲 New random</a>
        ${run.date ? `<a class="btn" href="#/leaderboard?date=${run.date}">🏆 Leaderboard</a>` : ''}
        <button class="btn" id="share">📤 Share result</button>
      </div>
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <h2>Your route</h2>
          <div class="legend" style="margin-bottom:12px"><span>Number = clicks left to the target (per Six Degrees)</span></div>
          <ol class="route" id="route"></ol>
        </div>
        <div class="grid">
          <div class="card"><h2>Distance to target</h2><div id="chart"><div class="skeleton" style="height:180px"></div></div></div>
          <div class="card" id="verdict-card"><h2>Verdict</h2><div id="verdict" class="muted"><span class="spinner"></span> Comparing with Six Degrees of Wikipedia…</div></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Six Degrees of Wikipedia: the shortest paths</h2><span class="spacer"></span><span id="sd-meta" class="muted small"></span></div>
        <div id="sd"><div class="progress"><div></div></div></div>
      </div>`;
    const $ = (s) => U.$(s, el);

    const drawStats = () => {
      const eff = run.optimal && won ? Math.min(100, Math.round((run.optimal / run.clicks) * 100)) : null;
      $('#stats').innerHTML = `
        <div class="stat hot"><div class="k">Time</div><div class="v">${U.fmtTime(run.timeMs)}</div></div>
        <div class="stat"><div class="k">Clicks</div><div class="v">${run.clicks}</div>${run.backs ? `<div class="sub">${U.plural(run.backs, 'back')}</div>` : ''}</div>
        <div class="stat"><div class="k">Optimal</div><div class="v">${run.optimal ?? '<span class="spinner"></span>'}</div><div class="sub">clicks</div></div>
        <div class="stat ${eff === 100 ? 'good' : ''}"><div class="k">Efficiency</div><div class="v">${eff != null ? eff + '%' : '–'}</div>${eff === 100 ? '<div class="sub">⭐ Perfect route</div>' : ''}</div>`;
    };
    drawStats();

    $('#again').onclick = () => WS.app.go('play', { mode: run.date ? 'daily' : 'custom', date: run.date || undefined, start: run.date ? undefined : run.start, target: run.date ? undefined : run.target });

    // ---- Route timeline with distances ----
    const steps = run.path;
    const dists = steps.map(() => undefined);
    const nexts = steps.map(() => null);
    const drawRoute = () => {
      $('#route').innerHTML = steps
        .map((p, i) => {
          const d = dists[i];
          const prev = i > 0 ? dists[i - 1] : undefined;
          const isEnd = i === steps.length - 1 && won;
          let cls = '';
          if (isEnd) cls = 'done';
          else if (i > 0 && d != null && prev != null) cls = d < prev ? 'closer' : d > prev ? 'further' : 'same';
          const dot = isEnd ? '🏁' : d === undefined ? '<span class="spinner" style="width:14px;height:14px"></span>' : d === null ? '?' : d;
          let note = '';
          if (i < steps.length - 1 && nexts[i] && nexts[i].length && d) {
            const took = steps[i + 1].title;
            const good = nexts[i].includes(took) && !steps[i + 1].back;
            note = good
              ? `<div class="step-note">✓ Optimal click</div>`
              : `<div class="step-note">Best from here: ${nexts[i].slice(0, 3).map((t) => `<b>${esc(t)}</b>`).join(', ')}${nexts[i].length > 3 ? ` +${nexts[i].length - 3} more` : ''}</div>`;
          }
          return `<li><div class="dot ${cls}">${dot}</div><div class="step-title"><a href="${esc(U.wikiUrl(p.title))}" target="_blank" rel="noopener">${esc(p.title)}</a>${p.back ? '<span class="back-tag">BACK</span>' : ''}${i === 0 ? '<span class="back-tag">START</span>' : ''}</div>${note}</li>`;
        })
        .join('');
    };
    drawRoute();

    const drawChart = () => {
      if (dists.some((d) => d === undefined)) return;
      const html = C.distanceChart(dists.map((d, i) => (i === steps.length - 1 && won ? 0 : d)), steps.map((p) => p.title));
      $('#chart').innerHTML = html || '<p class="muted">Not enough data from Six Degrees to chart this run.</p>';
    };

    const uniq = [...new Set(steps.map((p) => p.title))];
    const byTitle = new Map();
    U.pool(
      uniq,
      3,
      async (t) => {
        let r = null;
        try {
          r = await WS.sdow.distance(t, run.target, { signal: ctrl.signal });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
        }
        byTitle.set(t, r);
        steps.forEach((p, i) => {
          if (p.title === t) {
            dists[i] = r ? r.degrees : null;
            nexts[i] = r ? r.next : null;
          }
        });
        if (!ctrl.signal.aborted) drawRoute();
      },
      { signal: ctrl.signal }
    )
      .then(() => {
        drawChart();
        drawVerdict();
      })
      .catch(() => {});

    // ---- Shortest paths from Six Degrees ----
    let sd = null;
    const mine = new Set(steps.map((p) => p.title));
    const mineEdges = new Set();
    for (let i = 1; i < steps.length; i++) mineEdges.add(steps[i - 1].title + '\u0001' + steps[i].title);

    WS.sdow
      .find(run.start, run.target, { engine: 'auto', signal: ctrl.signal })
      .then(async (r) => {
        sd = r;
        if (r.degrees != null && run.optimal !== r.degrees) {
          run.optimal = r.degrees;
          WS.store.updateRun(run.id, { optimal: r.degrees });
        }
        drawStats();
        drawShortest();
        drawVerdict();
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        $('#sd').innerHTML = `<p class="muted">Couldn't get shortest paths: ${esc(e.message)}</p>`;
        $('#verdict').textContent = 'Six Degrees comparison unavailable right now.';
        $('#stats .stat:nth-child(3) .v').textContent = '–';
      });

    function drawShortest() {
      if (!sd) return;
      if (!sd.paths.length) {
        $('#sd').innerHTML = `<p class="muted">Six Degrees found no path from ${esc(run.start)} to ${esc(run.target)} in its snapshot.</p>`;
        return;
      }
      const shown = sd.paths.slice(0, 40);
      $('#sd-meta').innerHTML = `${U.plural(sd.totalPaths, 'path')} · ${U.plural(sd.degrees, 'degree')} · ${sd.engine === 'sdow' ? 'Six Degrees database' : 'live Wikipedia search'}`;
      $('#sd').innerHTML = `
        <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--hot)"></i>Start / target</span><span><i style="background:var(--good)"></i>Pages you visited</span><span>Tap a node to trace its paths · double-click to open</span></div>
        <div class="graph-wrap" id="graph" style="max-height:520px"></div>
        ${shown.length < sd.totalPaths ? `<p class="muted tiny">Graph shows ${shown.length} of ${sd.totalPaths} paths.</p>` : ''}
        <h3 style="margin:18px 0 10px;font-size:1rem">Paths</h3>
        <div class="paths-list" id="plist"></div>
        ${sd.paths.length > 6 ? `<button class="btn btn-sm" id="more" style="margin-top:10px">Show all ${sd.paths.length}</button>` : ''}
        <div style="margin-top:14px"><a class="btn btn-sm" href="#/six-degrees?from=${encodeURIComponent(run.start)}&to=${encodeURIComponent(run.target)}">Open in Six Degrees explorer →</a></div>`;
      WS.graph.render($('#graph'), shown, { mine, mineEdges });
      const list = (n) => ($('#plist').innerHTML = sd.paths.slice(0, n).map((p, i) => C.pathRow(p, i, mine)).join(''));
      list(6);
      const more = $('#more');
      if (more) more.onclick = () => (list(sd.paths.length), more.remove());
    }

    function drawVerdict() {
      if (!sd || dists.some((d) => d === undefined)) return;
      const opt = sd.degrees;
      const v = $('#verdict');
      v.classList.remove('muted');
      if (opt == null) {
        v.innerHTML = 'Six Degrees has no route for this pair — impressive if you found one!';
        return;
      }
      let html = '';
      if (won) {
        const extra = run.clicks - opt;
        if (extra < 0) html += `<p>🤯 <b>You beat Six Degrees of Wikipedia</b> by ${U.plural(-extra, 'click')}! (Its database is a snapshot, so you used links added since.)</p>`;
        else if (extra === 0) html += `<p>⭐ <b>Perfect!</b> You found a shortest possible path — ${U.plural(opt, 'click')}.</p>`;
        else html += `<p>You took <b>${U.plural(extra, 'extra click')}</b> over the optimal ${opt}.</p>`;
      } else {
        const last = dists[dists.length - 1];
        html += `<p>You stopped <b>${last != null ? U.plural(last, 'click') : 'an unknown distance'}</b> from ${esc(run.target)}. The shortest route was ${U.plural(opt, 'click')}.</p>`;
      }
      // First wrong turn.
      let wrong = -1;
      for (let i = 0; i < steps.length - 1; i++) {
        if (dists[i] != null && dists[i + 1] != null && (dists[i + 1] >= dists[i] || steps[i + 1].back)) {
          wrong = i;
          break;
        }
      }
      if (wrong >= 0 && nexts[wrong] && nexts[wrong].length) {
        const left = Math.max(0, dists[wrong] - 1);
        html += `<p class="small">Your first wrong turn was on <b>${esc(steps[wrong].title)}</b> → ${esc(steps[wrong + 1].title)}. ${
          left === 0
            ? `<b>${esc(nexts[wrong][0])}</b> was right there — one click would have won it.`
            : `<b>${esc(nexts[wrong][0])}</b> would have left you ${U.plural(left, 'click')} from the finish.`
        }</p>`;
      } else if (won && run.clicks > opt) {
        html += '<p class="small">Every click moved you closer — the extra length came from the start.</p>';
      }
      const closer = steps.slice(1).filter((p, i) => dists[i] != null && dists[i + 1] != null && dists[i + 1] < dists[i]).length;
      html += `<p class="small muted">${closer} of ${run.clicks} clicks moved you closer.</p>`;
      if (run.date && run.ranked && won) html += `<p class="small" id="rank-line"><span class="spinner"></span></p>`;
      v.innerHTML = html;
      if (run.date && run.ranked && won) rankLine();
    }

    async function rankLine() {
      const line = $('#rank-line');
      const ok = await WS.fb.ready;
      if (!ok) return line && line.remove();
      if (!WS.fb.user) {
        line.innerHTML = `<a href="#/account">Sign in</a> to put runs like this on the daily leaderboard.`;
        return;
      }
      try {
        await U.sleep(800); // give the submission a moment to land
        const board = await WS.fb.leaderboard(run.date, 'time', 500);
        const i = board.findIndex((e) => e.uid === WS.fb.user.uid);
        line.innerHTML = i >= 0 ? `🏆 You're <b>#${i + 1}</b> of ${board.length} on today's leaderboard.` : 'Leaderboard updating…';
      } catch (e) {
        line.remove();
      }
    }

    $('#share').onclick = async () => {
      const squares = steps
        .slice(1)
        .map((p, i) => {
          if (p.back) return '⬅️';
          if (i === steps.length - 2 && won) return '🏁';
          const a = dists[i], b = dists[i + 1];
          if (a == null || b == null) return '⬜';
          return b < a ? '🟩' : b > a ? '🟥' : '🟨';
        })
        .join('');
      const head = run.date ? `WikiSpeedruns Daily #${U.dailyNumber(run.date)}` : 'WikiSpeedruns';
      const text = `${head}\n${run.start} → ${run.target}\n${won ? `⏱ ${U.fmtTime(run.timeMs)} · 🖱 ${run.clicks} clicks${run.optimal ? ` (par ${run.optimal})` : ''}` : `🏳️ gave up after ${run.clicks} clicks`}\n${squares}`;
      const url = run.date ? 'https://wiki-speedruns.web.app/#/play?mode=daily' : challengeUrl(run.start, run.target);
      const m = U.modal(`<h2>Share your run</h2><div class="share-box">${esc(text)}\n${esc(url)}</div>
        <div class="row" style="margin-top:14px;justify-content:flex-end">${navigator.share ? '<button class="btn" data-native>Share…</button>' : ''}<button class="btn btn-primary" data-copy>Copy</button></div>`);
      m.el.querySelector('[data-copy]').onclick = async () => (await U.copy(`${text}\n${url}`)) && U.toast('Copied!', 'good');
      const nat = m.el.querySelector('[data-native]');
      if (nat) nat.onclick = () => navigator.share({ text, url }).catch(() => {});
    };

    if (fresh) history.replaceState(null, '', `#/run?id=${encodeURIComponent(run.id)}`);
    return () => ctrl.abort();
  };
})(window);
