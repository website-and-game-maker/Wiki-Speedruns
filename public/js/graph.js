/* Layered SVG graph of shortest paths. Every node on a shortest path has one fixed distance
 * from the start, so the paths form a DAG we can draw in neat columns (one per degree). */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const NS = 'http://www.w3.org/2000/svg';

  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  /**
   * paths: [[{title}, ...], ...] all the same length.
   * opts.mine: Set of titles the player visited; opts.mineEdges: Set of "a\u0001b" they clicked.
   */
  function render(container, paths, opts = {}) {
    container.innerHTML = '';
    if (!paths.length) return;
    const mine = opts.mine || new Set();
    const mineEdges = opts.mineEdges || new Set();
    const L = paths[0].length;
    const vertical = opts.vertical ?? container.clientWidth < 700;

    // Build layers.
    const nodes = new Map();
    const layers = Array.from({ length: L }, () => []);
    const edges = new Map();
    for (const p of paths) {
      p.forEach((n, i) => {
        if (!nodes.has(n.title)) {
          const node = { title: n.title, info: n, layer: i, parents: new Set(), children: new Set(), pos: 0 };
          nodes.set(n.title, node);
          layers[i].push(node);
        }
        if (i > 0) {
          const a = nodes.get(p[i - 1].title);
          const b = nodes.get(n.title);
          a.children.add(b);
          b.parents.add(a);
          edges.set(a.title + '\u0001' + b.title, [a, b]);
        }
      });
    }

    // Barycenter ordering, a few down/up sweeps to reduce crossings.
    layers.forEach((layer) => layer.forEach((n, i) => (n.pos = i)));
    const sweep = (li, key) => {
      const layer = layers[li];
      for (const n of layer) {
        const nb = [...n[key]];
        n.bary = nb.length ? nb.reduce((s, x) => s + x.pos, 0) / nb.length : n.pos;
      }
      layer.sort((a, b) => a.bary - b.bary || a.title.localeCompare(b.title));
      layer.forEach((n, i) => (n.pos = i));
    };
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < L; i++) sweep(i, 'parents');
      for (let i = L - 2; i >= 0; i--) sweep(i, 'children');
    }

    // Geometry.
    const nodeW = vertical ? 132 : 164;
    const nodeH = 30;
    const along = vertical ? 78 : 210; // distance between layers
    const across = vertical ? nodeW + 12 : nodeH + 14; // distance between siblings
    const maxN = Math.max(...layers.map((l) => l.length));
    const pad = 24;
    const spanAcross = maxN * across;
    const W = vertical ? spanAcross + pad * 2 : (L - 1) * along + nodeW + pad * 2;
    const H = vertical ? (L - 1) * along + nodeH + pad * 2 + 16 : spanAcross + pad * 2 + 16;
    const place = (n) => {
      const layerLen = layers[n.layer].length;
      const offset = (spanAcross - layerLen * across) / 2 + n.pos * across + across / 2;
      if (vertical) return { x: pad + offset, y: pad + 16 + n.layer * along + nodeH / 2 };
      return { x: pad + nodeW / 2 + n.layer * along, y: pad + 16 + offset };
    };
    nodes.forEach((n) => Object.assign(n, place(n)));

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Graph of ${paths.length} shortest paths`);

    // Degree labels.
    if (!vertical) {
      for (let i = 0; i < L; i++) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('class', 'g-layer-label');
        t.setAttribute('x', pad + nodeW / 2 + i * along);
        t.setAttribute('y', pad);
        t.setAttribute('text-anchor', 'middle');
        t.textContent = i === 0 ? 'START' : i === L - 1 ? 'TARGET' : `DEGREE ${i}`;
        svg.appendChild(t);
      }
    }

    const edgeEls = [];
    const gEdges = document.createElementNS(NS, 'g');
    for (const [key, [a, b]] of edges) {
      const path = document.createElementNS(NS, 'path');
      let d;
      if (vertical) {
        const y1 = a.y + nodeH / 2, y2 = b.y - nodeH / 2, my = (y1 + y2) / 2;
        d = `M${a.x},${y1} C${a.x},${my} ${b.x},${my} ${b.x},${y2}`;
      } else {
        const x1 = a.x + nodeW / 2, x2 = b.x - nodeW / 2, mx = (x1 + x2) / 2;
        d = `M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`;
      }
      path.setAttribute('d', d);
      path.setAttribute('class', 'g-edge' + (mineEdges.has(key) ? ' mine' : ''));
      path._a = a;
      path._b = b;
      gEdges.appendChild(path);
      edgeEls.push(path);
    }
    svg.appendChild(gEdges);

    const nodeEls = [];
    for (const n of nodes.values()) {
      const g = document.createElementNS(NS, 'g');
      const cls = ['g-node'];
      if (n.layer === 0 || n.layer === L - 1) cls.push('endpoint');
      else if (mine.has(n.title)) cls.push('mine');
      g.setAttribute('class', cls.join(' '));
      g.setAttribute('transform', `translate(${n.x - nodeW / 2},${n.y - nodeH / 2})`);
      g.setAttribute('tabindex', '0');
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('width', nodeW);
      rect.setAttribute('height', nodeH);
      rect.setAttribute('rx', 15);
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', nodeW / 2);
      text.setAttribute('y', nodeH / 2 + 4);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = trunc(n.title, vertical ? 18 : 23);
      const title = document.createElementNS(NS, 'title');
      title.textContent = n.title + (n.info.description ? ' — ' + n.info.description : '');
      g.append(rect, text, title);
      g._node = n;
      svg.appendChild(g);
      nodeEls.push(g);
    }

    // Highlight every path through a node (tap on mobile, hover on desktop).
    let pinned = null;
    const highlight = (n) => {
      if (!n) {
        svg.classList.remove('g-dim');
        nodeEls.forEach((g) => g.classList.remove('hl'));
        edgeEls.forEach((e) => e.classList.remove('hl'));
        return;
      }
      const on = new Set([n]);
      const up = (x) => x.parents.forEach((p) => { if (!on.has(p)) { on.add(p); up(p); } });
      const down = (x) => x.children.forEach((c) => { if (!on.has(c)) { on.add(c); down(c); } });
      up(n);
      down(n);
      svg.classList.add('g-dim');
      nodeEls.forEach((g) => g.classList.toggle('hl', on.has(g._node)));
      edgeEls.forEach((e) => e.classList.toggle('hl', on.has(e._a) && on.has(e._b)));
    };
    nodeEls.forEach((g) => {
      g.addEventListener('mouseenter', () => !pinned && highlight(g._node));
      g.addEventListener('mouseleave', () => !pinned && highlight(null));
      g.addEventListener('click', () => {
        pinned = pinned === g._node ? null : g._node;
        highlight(pinned);
        opts.onNode && opts.onNode(g._node.info, !!pinned);
      });
      g.addEventListener('dblclick', () => window.open(U.wikiUrl(g._node.title), '_blank', 'noopener'));
    });

    container.appendChild(svg);
  }

  WS.graph = { render };
})(window);
