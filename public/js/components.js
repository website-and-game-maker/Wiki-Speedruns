/* Reusable UI bits: page cards, autocomplete, path rows, the distance chart, confetti. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const esc = U.esc;
  const C = (WS.ui = {});

  const thumbStyle = (url) => (url ? `style="background-image:url('${esc(url)}')"` : '');
  const initial = (t) => esc((t || '?').trim()[0] || '?');

  C.thumb = (info, cls = 'thumb') =>
    `<div class="${cls}" ${thumbStyle(info && info.thumb)}>${info && info.thumb ? '' : initial(info && info.title)}</div>`;

  /** Card for an article. info: {title, description, thumb, extract}. */
  C.pageCard = (info, { label = '', target = false, big = false, link = false } = {}) => {
    const tag = link ? 'a' : 'div';
    const href = link ? ` href="${esc(U.wikiUrl(info.title))}" target="_blank" rel="noopener"` : '';
    return `<${tag} class="page-card ${target ? 'target' : ''} ${big ? 'big' : ''}"${href}>
      ${C.thumb(info)}
      <div class="meta">
        ${label ? `<div class="label">${esc(label)}</div>` : ''}
        <div class="title">${esc(info.title)}</div>
        ${info.description ? `<div class="desc">${esc(info.description)}</div>` : ''}
      </div></${tag}>`;
  };

  C.pageCardSkeleton = (label, target) => `<div class="page-card ${target ? 'target' : ''}">
      <div class="thumb skeleton"></div><div class="meta" style="flex:1">
      <div class="label">${esc(label)}</div><div class="skeleton" style="height:18px;width:70%;margin:4px 0"></div>
      <div class="skeleton" style="height:12px;width:90%"></div></div></div>`;

  C.pathNode = (n, { visited = false, endpoint = false } = {}) =>
    `<a class="path-node ${visited ? 'visited' : ''} ${endpoint ? 'endpoint' : ''}" href="${esc(U.wikiUrl(n.title))}" target="_blank" rel="noopener" title="${esc(n.description || n.title)}">
      ${C.thumb(n)}<span class="t">${esc(n.title)}</span></a>`;

  C.pathRow = (path, i, mine = new Set()) =>
    `<div class="path-row"><span class="n">${i + 1}.</span>${path
      .map((n, j) => C.pathNode(n, { visited: j > 0 && j < path.length - 1 && mine.has(n.title), endpoint: j === 0 || j === path.length - 1 }))
      .join('<span class="path-arrow">→</span>')}</div>`;

  C.avatar = (name, photo) =>
    photo
      ? `<span class="avatar" style="background-image:url('${esc(photo)}')"></span>`
      : `<span class="avatar">${initial(name)}</span>`;

  /** Article-title autocomplete on an <input>. onPick(title) fires on selection. */
  C.autocomplete = (input, { onPick, onEnter } = {}) => {
    const wrap = input.closest('.ac');
    const list = document.createElement('div');
    list.className = 'ac-list hidden';
    wrap.appendChild(list);
    let items = [];
    let active = -1;
    let ctrl;
    const close = () => {
      list.classList.add('hidden');
      active = -1;
    };
    const draw = () => {
      if (!items.length) return close();
      list.innerHTML = items
        .map((it, i) => `<div class="ac-item ${i === active ? 'on' : ''}" data-i="${i}">${C.thumb(it)}<div><div class="t">${esc(it.title)}</div><div class="d">${esc(it.description)}</div></div></div>`)
        .join('');
      list.classList.remove('hidden');
    };
    const pick = (it) => {
      input.value = it.title;
      close();
      onPick && onPick(it.title, it);
    };
    const search = U.debounce(async () => {
      ctrl && ctrl.abort();
      ctrl = new AbortController();
      const q = input.value;
      if (!q.trim()) return close();
      try {
        items = await WS.wiki.search(q, { signal: ctrl.signal });
        active = -1;
        if (document.activeElement === input) draw();
      } catch (e) { /* aborted or offline */ }
    }, 180);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.addEventListener('input', search);
    input.addEventListener('keydown', (e) => {
      const open = !list.classList.contains('hidden');
      if (e.key === 'ArrowDown' && open) {
        active = Math.min(items.length - 1, active + 1);
        draw();
        e.preventDefault();
      } else if (e.key === 'ArrowUp' && open) {
        active = Math.max(0, active - 1);
        draw();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (open && active >= 0) {
          pick(items[active]);
          e.preventDefault();
        } else {
          close();
          onEnter && onEnter();
        }
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    list.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.ac-item');
      if (el) {
        e.preventDefault();
        pick(items[+el.dataset.i]);
      }
    });
  };

  /**
   * Step chart: distance-to-target after each click, against the ideal straight line.
   * dists: array (null = unknown) aligned with the path.
   */
  C.distanceChart = (dists, labels) => {
    const known = dists.filter((d) => d != null);
    if (known.length < 2) return '';
    const n = dists.length;
    const maxD = Math.max(...known, 1);
    const W = 520, H = 190, padL = 30, padR = 12, padT = 14, padB = 26;
    const x = (i) => padL + (n === 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
    const y = (d) => padT + ((maxD - d) * (H - padT - padB)) / maxD;
    let grid = '';
    for (let d = 0; d <= maxD; d++) {
      grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(d)}" y2="${y(d)}" stroke="var(--border)" stroke-dasharray="${d ? '3 4' : ''}"/>`;
      grid += `<text x="${padL - 8}" y="${y(d) + 4}" text-anchor="end" font-size="13" fill="var(--muted)" font-family="var(--mono)">${d}</text>`;
    }
    const d0 = dists[0];
    const ideal = d0 != null ? `<line x1="${x(0)}" y1="${y(d0)}" x2="${x(Math.min(d0, n - 1))}" y2="${y(0)}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 5" opacity=".7"/>` : '';
    let line = '';
    let dots = '';
    let prev = null;
    dists.forEach((d, i) => {
      if (d == null) return;
      if (prev) line += `<line x1="${x(prev.i)}" y1="${y(prev.d)}" x2="${x(i)}" y2="${y(d)}" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/>`;
      const cls = i === 0 ? 'var(--muted)' : d === 0 ? 'var(--hot)' : prev && d < prev.d ? 'var(--good)' : prev && d > prev.d ? 'var(--bad)' : 'var(--warn)';
      dots += `<circle cx="${x(i)}" cy="${y(d)}" r="7" fill="${cls}" stroke="var(--surface)" stroke-width="2"><title>${esc(labels[i])}: ${d} away</title></circle>`;
      prev = { i, d };
    });
    const xl = dists.map((_, i) => (n <= 16 || i % Math.ceil(n / 16) === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="13" fill="var(--muted)" font-family="var(--mono)">${i}</text>` : '')).join('');
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distance to target after each click">${grid}${ideal}${line}${dots}${xl}</svg>
      <div class="legend" style="justify-content:center;margin-top:6px">
        <span><i style="background:var(--accent)"></i>Ideal pace</span><span><i style="background:var(--good)"></i>Closer</span>
        <span><i style="background:var(--warn)"></i>Same</span><span><i style="background:var(--bad)"></i>Further</span></div></div>`;
  };

  C.confetti = () => {
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#3a63f0', '#ff6a1a', '#16955a', '#f0b429', '#d23f3f', '#8f5cf7'];
    const ps = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 4,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    const frame = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of ps) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (t - t0 < 3200) requestAnimationFrame(frame);
      else cv.remove();
    };
    requestAnimationFrame(frame);
  };
})(window);
