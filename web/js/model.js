/** Tree data model, validation, import/export, and sample content. */

export const TREE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V10M8 21h8M12 15l-4-4M12 12l4-4"/><path d="M12 10C7 10 5 7 6 3c4 0 7 2 6 7ZM12 15c5 0 8-3 7-7-4 0-7 3-7 7Z"/></svg>';

export const LEAF_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18C1 10 7 4 20 3c1 12-5 18-13 15M4 21 16 8M9 15v-4M12 12h4"/></svg>';

const STAGE_ICONS = {
  0: '<ellipse cx="12" cy="15" rx="3" ry="4"/><path d="M7 19h10"/>',
  1: '<path d="M12 19V13"/><path d="M12 13c0-3-2.4-4.2-5.2-3.8.2 3 2.3 4.4 5.2 3.8Z"/><path d="M7 19h10"/>',
  2: '<path d="M12 19V10.5"/><path d="M12 13c0-3-2.4-4.2-5.2-3.8.2 3 2.3 4.4 5.2 3.8Z"/><path d="M12 10.5c0-3 2.4-4.2 5.2-3.8-.2 3-2.3 4.4-5.2 3.8Z"/><path d="M7 19h10"/>',
  3: '<path d="M12 19V12"/><circle cx="8.6" cy="9" r="3.3" fill="currentColor" stroke="none"/><circle cx="15.4" cy="9" r="3.1" fill="currentColor" stroke="none"/><circle cx="12" cy="6.2" r="3.5" fill="currentColor" stroke="none"/><circle cx="9.6" cy="7.6" r="2" fill="currentColor" stroke="none" opacity=".55"/><circle cx="14.6" cy="7.3" r="1.9" fill="currentColor" stroke="none" opacity=".55"/><path d="M7 19h10"/>',
};

export function stageSvg(lvl, suggested) {
  const key = suggested ? 0 : lvl;
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    STAGE_ICONS[key] +
    '</svg>'
  );
}

export const LEVELS = [
  'Not learnt · gap',
  'I understand the theory',
  'I have practised it',
  'Learnt · working knowledge',
];

export const LEVEL_SHORT = ['Gap', 'Theory', 'Practising', 'Learnt'];

function resourceToNoteBody(r) {
  if (!r || typeof r !== 'object') return '';
  if (r.kind === 'link') return [r.title, r.url].filter(Boolean).join('\n');
  if (r.body) return r.title && r.title !== r.body ? r.title + '\n' + r.body : r.body;
  return r.title || '';
}

export function ensureTopicMeta(n) {
  if (!Array.isArray(n.notes)) n.notes = [];
  if (!Array.isArray(n.transitions)) n.transitions = [];
  if (Array.isArray(n.resources) && n.resources.length) {
    n.resources.forEach((r) => {
      const body = resourceToNoteBody(r).trim();
      if (body) {
        n.notes.push({
          id: uid(),
          body,
          at: r.createdAt || new Date().toISOString(),
        });
      }
    });
    n.resources = [];
  } else if (!Array.isArray(n.resources)) {
    n.resources = [];
  }
}

export function effectiveLevel(n) {
  return n.suggested ? 0 : n.level;
}

export function levelShortLabel(level, suggested) {
  if (suggested) return 'Gap · suggested';
  if (level === null || level === undefined) return 'Gap';
  return LEVEL_SHORT[level] || LEVELS[level] || 'Gap';
}

export function transitionLabel(from, to) {
  const fromText = from === null ? 'Gap · suggested' : LEVEL_SHORT[from];
  const toText = LEVEL_SHORT[to];
  return fromText + ' → ' + toText;
}

export function isMovingUp(fromLevel, toLevel, fromSuggested) {
  if (fromSuggested) return toLevel > 0;
  if (fromLevel === null) return toLevel > 0;
  return toLevel > fromLevel;
}

/** Append a transition and update level. Returns false if level unchanged. */
export function recordTransition(n, toLevel, note) {
  ensureTopicMeta(n);
  const from = n.suggested ? null : n.level;
  if (!n.suggested && from === toLevel) return false;
  const entry = {
    id: uid(),
    from,
    to: toLevel,
    at: new Date().toISOString(),
  };
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (trimmed) entry.note = trimmed;
  n.transitions.push(entry);
  n.level = toLevel;
  n.suggested = false;
  return true;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return days + (days === 1 ? ' day' : ' days');
  if (hours > 0) return hours + (hours === 1 ? ' hour' : ' hours');
  if (minutes > 0) return minutes + (minutes === 1 ? ' minute' : ' minutes');
  return 'Less than a minute';
}

export function dwellBeforeTransition(transitions, index) {
  if (!Array.isArray(transitions) || index <= 0) return null;
  const prev = transitions[index - 1];
  const curr = transitions[index];
  if (!prev?.at || !curr?.at) return null;
  return new Date(curr.at).getTime() - new Date(prev.at).getTime();
}

export function timeInCurrentLevel(n) {
  ensureTopicMeta(n);
  if (!n.transitions.length) return null;
  const last = n.transitions[n.transitions.length - 1];
  if (!last?.at) return null;
  return Date.now() - new Date(last.at).getTime();
}

function parseResource(raw, path) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(path + ' must be a resource object.');
  }
  const kind = raw.kind;
  if (kind !== 'link' && kind !== 'note') {
    throw new Error(path + ': kind must be "link" or "note".');
  }
  const title = validName(raw.title, path + '.title');
  const item = { id: uid(), kind, title, createdAt: raw.createdAt || new Date().toISOString() };
  if (kind === 'link') {
    if (typeof raw.url !== 'string' || !raw.url.trim()) {
      throw new Error(path + ': link resources need a url.');
    }
    item.url = raw.url.trim();
  } else {
    if (typeof raw.body !== 'string' || !raw.body.trim()) {
      throw new Error(path + ': note resources need body text.');
    }
    item.body = raw.body.trim();
  }
  return item;
}

function parseTopicNote(raw, path) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(path + ' must be a note object.');
  }
  if (typeof raw.body !== 'string' || !raw.body.trim()) {
    throw new Error(path + ' needs note body text.');
  }
  return {
    id: uid(),
    body: raw.body.trim(),
    at: raw.at || new Date().toISOString(),
  };
}

function parseTransition(raw, path) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(path + ' must be a transition object.');
  }
  const from = raw.from === null || raw.from === undefined ? null : raw.from;
  if (from !== null && (!Number.isInteger(from) || from < 0 || from > 3)) {
    throw new Error(path + ': from must be null or 0–3.');
  }
  const to = raw.to;
  if (!Number.isInteger(to) || to < 0 || to > 3) {
    throw new Error(path + ': to must be 0, 1, 2, or 3.');
  }
  const entry = { id: uid(), from, to, at: raw.at || new Date().toISOString() };
  if (raw.note !== undefined) {
    if (typeof raw.note !== 'string') throw new Error(path + ': note must be text.');
    const note = raw.note.trim();
    if (note) entry.note = note;
  }
  return entry;
}

function parseMetaArray(raw, path, parser, max) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(path + ' must be an array.');
  if (raw.length > max) throw new Error(path + ' has too many entries (max ' + max + ').');
  return raw.map((item, i) => parser(item, path + '[' + i + ']'));
}

export function freshTopic(name, level = 0) {
  return { id: uid(), name, level, children: [], notes: [], transitions: [] };
}

export const STORAGE_KEY_PREFIX = 'knowledgetree.workspace.v1:user:';
export const LEGACY_STORAGE_KEY = 'mycel.workspace.v1';
export const LEGACY_GLOBAL_KEY = 'knowledgetree.workspace.v1';

export function storageKeyForUser(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('A signed-in email is required to save trees.');
  }
  return STORAGE_KEY_PREFIX + normalized;
}

export function uid() {
  return (
    'n-' +
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
  );
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function walk(nodes, fn, parent, depth) {
  (nodes || []).forEach((n) => {
    fn(n, parent, depth || 1);
    walk(n.children, fn, n, (depth || 1) + 1);
  });
}

export function allNodes(t) {
  const a = [];
  walk(t.topics, (n) => a.push(n));
  return a;
}

export function findInTree(t, id) {
  if (t.root.id === id) return { node: t.root, kind: 'root', depth: 0 };
  let found = null;
  walk(t.topics, (n, p, d) => {
    if (n.id === id) found = { node: n, parent: p, kind: p ? 'sub' : 'topic', depth: d };
  });
  return found;
}

/** Remove a topic/subtopic. Middle nodes promote their children to the parent. */
export function removeNodeFromTree(t, found) {
  if (!found || found.kind === 'root') {
    throw new Error('Cannot delete the tree root.');
  }
  const { node, parent } = found;
  const list = parent ? parent.children : t.topics;
  const idx = list.indexOf(node);
  if (idx === -1) throw new Error('Topic not found.');
  const promoted = Array.isArray(node.children) ? node.children : [];
  list.splice(idx, 1, ...promoted);
}

export function validName(value, path) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new Error(path + ' needs a name of 1–80 characters.');
  }
  return value.trim();
}

export function parseTrees(text) {
  if (new TextEncoder().encode(text).length > 1048576) {
    throw new Error('Choose a JSON file smaller than 1 MB.');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This is not valid JSON. Check quotes, commas, and brackets.');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Use a tree object or a workspace containing trees.');
  }
  if (value.version !== undefined && value.version !== 1) {
    throw new Error('Unsupported version. This app supports JSON version 1.');
  }
  const list = Array.isArray(value) ? value : value.trees !== undefined ? value.trees : [value];
  if (!Array.isArray(list) || !list.length || list.length > 30) {
    throw new Error('Include between 1 and 30 trees.');
  }
  let total = 0;
  function node(raw, path, depth) {
    if (depth > 12) throw new Error('Trees can have up to 12 topic levels.');
    if (++total > 1000) throw new Error('Import at most 1,000 topics at once.');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(path + ' must be a topic object.');
    }
    const name = validName(raw.name, path);
    const level = raw.level === undefined ? 0 : raw.level;
    if (!Number.isInteger(level) || level < 0 || level > 3) {
      throw new Error(path + ': level must be 0, 1, 2, or 3.');
    }
    if (raw.suggested !== undefined && typeof raw.suggested !== 'boolean') {
      throw new Error(path + ': suggested must be true or false.');
    }
    if (raw.suggested && level !== 0) {
      throw new Error(path + ': a suggested topic must have level 0.');
    }
    const kids = raw.children === undefined ? [] : raw.children;
    if (!Array.isArray(kids)) throw new Error(path + ': children must be an array.');
    const notes = parseMetaArray(raw.notes, path + '.notes', parseTopicNote, 100);
    parseMetaArray(raw.resources, path + '.resources', parseResource, 50).forEach((r) => {
      const body = resourceToNoteBody(r).trim();
      if (body) notes.push({ id: uid(), body, at: r.createdAt || new Date().toISOString() });
    });
    const n = {
      id: uid(),
      name,
      level,
      suggested: !!raw.suggested,
      children: kids.map((c, i) => node(c, path + '.children[' + i + ']', depth + 1)),
      notes,
      transitions: parseMetaArray(raw.transitions, path + '.transitions', parseTransition, 200),
    };
    if (raw.pos !== undefined) {
      if (
        !raw.pos ||
        !Number.isFinite(raw.pos.x) ||
        !Number.isFinite(raw.pos.y) ||
        raw.pos.x < 0 ||
        raw.pos.y < 0 ||
        raw.pos.x > 20000 ||
        raw.pos.y > 20000
      ) {
        throw new Error(path + ': node positions must be numbers from 0 to 20,000.');
      }
      n.pos = { x: raw.pos.x, y: raw.pos.y };
    }
    return n;
  }
  return list.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Each tree must be an object.');
    }
    const name = validName(raw.name, 'Tree ' + (index + 1));
    const topics = raw.topics === undefined ? raw.children || [] : raw.topics;
    if (!Array.isArray(topics)) throw new Error(name + ': topics must be an array.');
    return {
      id: uid(),
      name,
      root: { id: uid(), name },
      sample: raw.sample === true,
      topics: topics.map((n, i) => node(n, name + '.topics[' + i + ']', 1)),
    };
  });
}

function portableNote(note) {
  return { body: note.body, at: note.at };
}

function portableTransition(tr) {
  const o = { from: tr.from === undefined ? null : tr.from, to: tr.to, at: tr.at };
  if (tr.note) o.note = tr.note;
  return o;
}

function portableTree(t) {
  function pack(n) {
    ensureTopicMeta(n);
    const o = { name: n.name, level: n.level };
    if (n.suggested) o.suggested = true;
    if (n.notes.length) o.notes = n.notes.map(portableNote);
    if (n.transitions.length) o.transitions = n.transitions.map(portableTransition);
    if (n.children && n.children.length) o.children = n.children.map(pack);
    if (n.pos) o.pos = { x: n.pos.x, y: n.pos.y };
    return o;
  }
  return { name: t.name, sample: !!t.sample, topics: t.topics.map(pack) };
}

export function workspaceJSON(list) {
  return JSON.stringify({ version: 1, trees: list.map(portableTree) }, null, 2);
}

export function treeDocument(t) {
  return {
    name: t.name,
    sample: !!t.sample,
    root: t.root,
    topics: t.topics,
  };
}

export function isReadOnly(t) {
  return t.cloudRole === 'view';
}

export function canShare(t) {
  return t.cloudRole === 'owner' || (!t.cloudRole && t.cloudId);
}

function treeToStorage(t) {
  return {
    id: t.id,
    name: t.name,
    root: t.root,
    topics: t.topics,
    sample: !!t.sample,
    cloudId: t.cloudId || null,
    cloudVersion: t.cloudVersion ?? null,
    cloudRole: t.cloudRole || null,
    ownerEmail: t.ownerEmail || null,
    syncDirty: !!t.syncDirty,
  };
}

export function workspaceToStorage(list, activeIndex, viewState = {}, ui = {}) {
  const payload = { version: 1, activeIndex, trees: list.map(treeToStorage), view: viewState };
  if (ui && typeof ui === 'object' && Object.keys(ui).length) payload.ui = ui;
  return payload;
}

function hydrateTree(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid tree in workspace.');
  validName(raw.name, 'Tree');
  return {
    id: raw.id || uid(),
    name: raw.name,
    root: raw.root || { id: uid(), name: raw.name },
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    sample: raw.sample === true,
    cloudId: raw.cloudId || null,
    cloudVersion: raw.cloudVersion ?? null,
    cloudRole: raw.cloudRole || null,
    ownerEmail: raw.ownerEmail || null,
    syncDirty: !!raw.syncDirty,
  };
}

export function freshTree(name) {
  name = validName(name, 'Tree');
  return { id: uid(), name, root: { id: uid(), name }, topics: [] };
}

export const SAMPLE_DATA = [
  {
    name: 'Databases',
    sample: true,
    description: 'SQL, indexes, transactions, and scale.',
    topics: [
      {
        name: 'Relational databases',
        level: 2,
        children: [
          { name: 'SQL queries', level: 3 },
          {
            name: 'Indexes',
            level: 1,
            children: [
              { name: 'B-tree indexes', level: 1 },
              { name: 'Query plans', level: 0, suggested: true },
            ],
          },
          { name: 'Transactions & ACID', level: 1 },
        ],
      },
      {
        name: 'Distributed data',
        level: 1,
        children: [
          { name: 'Replication', level: 1 },
          { name: 'Sharding', level: 0 },
          { name: 'Consistency models', level: 0, suggested: true },
        ],
      },
    ],
  },
  {
    name: 'AI engineering',
    sample: true,
    description: 'RAG, embeddings, prompts, and evaluation.',
    topics: [
      {
        name: 'RAG',
        level: 1,
        children: [
          { name: 'Embeddings', level: 2 },
          { name: 'Chunking', level: 3 },
          { name: 'Retrieval evaluation', level: 0, suggested: true },
        ],
      },
      {
        name: 'Prompt engineering',
        level: 3,
        children: [
          { name: 'Few-shot prompting', level: 1 },
          { name: 'Loop engineering', level: 0, suggested: true },
        ],
      },
    ],
  },
  {
    name: 'DevOps',
    sample: true,
    description: 'Delivery, containers, and observability.',
    topics: [
      {
        name: 'Delivery',
        level: 2,
        children: [
          { name: 'CI/CD pipelines', level: 2 },
          { name: 'Infrastructure as code', level: 1 },
        ],
      },
      {
        name: 'Containers',
        level: 1,
        children: [
          { name: 'Docker', level: 3 },
          { name: 'Kubernetes', level: 1 },
        ],
      },
      {
        name: 'Observability',
        level: 0,
        children: [
          { name: 'Metrics & alerts', level: 1 },
          { name: 'Distributed tracing', level: 0, suggested: true },
        ],
      },
    ],
  },
  {
    name: 'Gardening',
    sample: true,
    description: 'A nontechnical example: grow a garden.',
    topics: [
      {
        name: 'Plant foundations',
        level: 1,
        children: [
          { name: 'Soil & compost', level: 2 },
          { name: 'Light & watering', level: 3 },
        ],
      },
      {
        name: 'Growing food',
        level: 0,
        children: [
          { name: 'Starting seeds', level: 1 },
          { name: 'Seasonal planting', level: 0 },
          { name: 'Pest management', level: 0, suggested: true },
        ],
      },
    ],
  },
];

export const JSON_EXAMPLE = JSON.stringify(
  {
    name: 'Learning to cook',
    topics: [
      {
        name: 'Kitchen basics',
        level: 1,
        children: [
          { name: 'Knife skills', level: 2 },
          { name: 'Food safety', level: 0, suggested: true },
        ],
      },
      { name: 'Baking', level: 0, children: [{ name: 'Bread', level: 0 }] },
    ],
  },
  null,
  2
);

function readWorkspaceKey(key) {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  const saved = JSON.parse(stored);
  let trees;
  if (Array.isArray(saved.trees) && saved.trees.length && saved.trees[0]?.id) {
    trees = saved.trees.map(hydrateTree);
  } else if (Array.isArray(saved.trees) && !saved.trees.length) {
    trees = [];
  } else {
    trees = parseTrees(JSON.stringify(saved));
  }
  const activeIndex =
    trees.length === 0
      ? -1
      : Math.min(Math.max(Number(saved.activeIndex) || 0, 0), trees.length - 1);
  const viewState =
    saved.view && typeof saved.view === 'object' && !Array.isArray(saved.view) ? saved.view : {};
  const ui = saved.ui && typeof saved.ui === 'object' && !Array.isArray(saved.ui) ? saved.ui : {};
  return {
    trees,
    currentTreeKey: activeIndex >= 0 ? trees[activeIndex].id : null,
    viewState,
    ui,
  };
}

export function loadStoredWorkspace(email) {
  const userKey = storageKeyForUser(email);
  try {
    const workspace = readWorkspaceKey(userKey);
    if (workspace) return workspace;
  } catch {
    /* fall through to one-time legacy migration */
  }

  for (const legacyKey of [LEGACY_GLOBAL_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const workspace = readWorkspaceKey(legacyKey);
      if (!workspace) continue;
      const idx = workspace.currentTreeKey
        ? workspace.trees.findIndex((t) => t.id === workspace.currentTreeKey)
        : -1;
      localStorage.setItem(
        userKey,
        JSON.stringify(workspaceToStorage(workspace.trees, idx, workspace.viewState || {}))
      );
      localStorage.removeItem(legacyKey);
      return workspace;
    } catch {
      /* try next legacy key */
    }
  }
  return { trees: [], currentTreeKey: null, viewState: {}, ui: {} };
}

export function saveStoredWorkspace(email, list, activeIndex, viewState = {}, ui = {}) {
  localStorage.setItem(
    storageKeyForUser(email),
    JSON.stringify(workspaceToStorage(list, activeIndex, viewState, ui))
  );
}
