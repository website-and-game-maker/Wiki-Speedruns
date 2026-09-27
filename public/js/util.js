/* Shared helpers. Everything hangs off the global `WS` namespace so the app
 * runs from plain <script> tags — no build step, works from file:// too. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = (WS.util = {});

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  U.$ = (sel, el = document) => el.querySelector(sel);
  U.$$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** "Albert_einstein" -> "Albert einstein" -> "Albert einstein" (first letter upper, like MediaWiki). */
  U.normTitle = (t) => {
    t = String(t ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t[0].toUpperCase() + t.slice(1) : t;
  };
  U.wikiUrl = (title) => 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(title).replace(/ /g, '_'));

  /** 83456 -> "1:23.4" ; 3723456 -> "1:02:03" */
  U.fmtTime = (ms, tenths = true) => {
    if (ms == null || !isFinite(ms)) return '–';
    const total = Math.max(0, ms) / 1000;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const t = Math.floor((total * 10) % 10);
    const ss = String(s).padStart(2, '0');
    if (h) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    return tenths ? `${m}:${ss}.${t}` : `${m}:${ss}`;
  };

  U.plural = (n, word, pl) => `${n} ${n === 1 ? word : pl || word + 's'}`;

  U.relTime = (ts) => {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  /** Deterministic 32-bit string hash (cyrb53, truncated) and PRNG, for the daily challenge. */
  U.hash = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0) ^ (h1 >>> 0);
  };
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Daily challenges roll over at 00:00 UTC so everyone worldwide plays the same pair. */
  U.todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  U.DAILY_EPOCH = '2026-09-27';
  U.dailyNumber = (key) => Math.round((Date.parse(key) - Date.parse(U.DAILY_EPOCH)) / 86400000) + 1;

  U.id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Run `fn` over `items` with at most `limit` in flight. `shouldStop()` halts scheduling early. */
  U.pool = async (items, limit, fn, { signal, shouldStop } = {}) => {
    let i = 0;
    const worker = async () => {
      while (i < items.length) {
        if (signal && signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        if (shouldStop && shouldStop()) return;
        const idx = i++;
        await fn(items[idx], idx);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  };

  U.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  /** localStorage that never throws (private mode, blocked storage, file://). */
  U.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('ws.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('ws.' + key, JSON.stringify(value));
      } catch (e) { /* ignore */ }
    },
  };

  U.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove();
      return ok;
    }
  };

  U.toast = (msg, kind = 'info', ms = 3200) => {
    const rootEl = document.getElementById('toast-root');
    if (!rootEl) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    rootEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms);
  };

  /** Minimal modal. Returns {el, close}. `onClose` fires once. */
  U.modal = (html, { onClose, wide } = {}) => {
    const rootEl = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <button class="modal-x icon-btn" aria-label="Close">✕</button>${html}</div>`;
    rootEl.appendChild(wrap);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 200);
      onClose && onClose();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
    wrap.querySelector('.modal-x').addEventListener('click', close);
    requestAnimationFrame(() => wrap.classList.add('show'));
    return { el: wrap.querySelector('.modal'), close };
  };

  U.isStandalone = () =>
    (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || root.navigator?.standalone === true;

  if (typeof module !== 'undefined' && module.exports) module.exports = WS;
})(typeof window !== 'undefined' ? window : globalThis);
