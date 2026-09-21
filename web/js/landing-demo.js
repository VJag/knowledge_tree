/** Read-only sample tree for the landing page preview. */

import { parseTrees, SAMPLE_DATA, esc, stageSvg } from './model.js';

function levelClass(n) {
  return 'lvl-' + (n.suggested ? 0 : n.level);
}

function levelLabel(n) {
  return n.suggested ? 'Gap' : ['Gap', 'Theory', 'Practice', 'Learnt'][n.level] || '';
}

export function renderLandingDemo(rootEl) {
  if (!rootEl) return;
  const trees = parseTrees(JSON.stringify(SAMPLE_DATA[1]));
  const t = trees[0];
  const depths = {};
  const spans = {};
  const positions = {};

  function measure(n, d, parent) {
    depths[n.id] = d;
    const kids = n === t.root ? t.topics : n.children || [];
    spans[n.id] = Math.max(
      96,
      kids.reduce((sum, c) => sum + measure(c, d + 1, n), 0) + Math.max(0, kids.length - 1) * 20
    );
    return spans[n.id];
  }

  measure(t.root, 0, null);
  const contentH = Math.max(320, spans[t.root.id] + 80);
  const contentW = 300 + Math.max(...Object.values(depths)) * 200;

  function place(n, top) {
    const kids = n === t.root ? t.topics : n.children || [];
    const d = depths[n.id];
    const x = 40 + d * 200;
    const y = top + spans[n.id] / 2;
    positions[n.id] = { x, y, w: n === t.root ? 180 : 160 };
    const kidsHeight = kids.reduce((sum, c) => sum + spans[c.id], 0) + Math.max(0, kids.length - 1) * 20;
    let start = top + (spans[n.id] - kidsHeight) / 2;
    kids.forEach((c) => {
      place(c, start);
      start += spans[c.id] + 20;
    });
  }

  place(t.root, 40);

  const scale = Math.min(1, 520 / contentW, 420 / contentH);
  rootEl.innerHTML =
    '<div class="landing-demo-canvas" style="width:' +
    Math.ceil(contentW * scale) +
    'px;height:' +
    Math.ceil(contentH * scale) +
    'px"><div class="landing-demo-inner" style="width:' +
    contentW +
    'px;height:' +
    contentH +
    'px;transform:scale(' +
    scale +
    ')"><svg class="edges" width="' +
    contentW +
    '" height="' +
    contentH +
    '"></svg><div class="landing-demo-nodes"></div></div></div>';

  const svg = rootEl.querySelector('.edges');
  const layer = rootEl.querySelector('.landing-demo-nodes');

  function walk(nodes, fn, parent) {
    (nodes || []).forEach((n) => {
      fn(n, parent);
      walk(n.children, fn, n);
    });
  }

  walk(t.topics, (n, p) => {
    const a = positions[(p || t.root).id];
    const b = positions[n.id];
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const x = a.x + a.w;
    const mid = (x + b.x) / 2;
    path.setAttribute(
      'd',
      'M ' + x + ' ' + a.y + ' C ' + mid + ' ' + a.y + ', ' + mid + ' ' + b.y + ', ' + b.x + ' ' + b.y
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', n.suggested ? 'var(--gap)' : 'var(--edge)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    if (n.suggested) path.setAttribute('stroke-dasharray', '5 5');
    svg.append(path);
  });

  function addNode(n, isRoot) {
    const p = positions[n.id];
    const el = document.createElement('div');
    el.className = 'node ' + (isRoot ? 'root' : levelClass(n));
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.innerHTML = isRoot
      ? '<div class="n-eyebrow">KNOWLEDGE TREE</div><div class="n-name">' + esc(n.name) + '</div>'
      : '<div class="n-top">' +
        stageSvg(n.level, n.suggested) +
        '</div><div class="n-name">' +
        esc(n.name) +
        '</div><span class="n-status">' +
        esc(levelLabel(n)) +
        '</span>';
    layer.append(el);
  }

  addNode(t.root, true);
  walk(t.topics, (n) => addNode(n, false));
}
