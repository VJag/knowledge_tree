import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  validName,
  freshTree,
  freshTopic,
  parseTrees,
  workspaceJSON,
  treeDocument,
  findInTree,
  removeNodeFromTree,
  allNodes,
  walk,
  ensureTopicMeta,
  effectiveLevel,
  recordTransition,
  formatDuration,
  dwellBeforeTransition,
  transitionLabel,
  levelShortLabel,
  isMovingUp,
  isReadOnly,
  canShare,
  storageKeyForUser,
  stageSvg,
  workspaceToStorage,
  loadStoredWorkspace,
  saveStoredWorkspace,
  uid,
  LEVEL_SHORT,
} from '../js/model.js';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    assert.equal(esc('a & b <c>'), 'a &amp; b &lt;c&gt;');
  });
});

describe('validName', () => {
  it('trims and accepts 1–80 chars', () => {
    assert.equal(validName('  Hello  ', 'Topic'), 'Hello');
  });

  it('rejects empty names', () => {
    assert.throws(() => validName('   ', 'Topic'), /1–80/);
  });
});

describe('freshTree and freshTopic', () => {
  it('creates empty tree with matching root name', () => {
    const t = freshTree('Cooking');
    assert.equal(t.name, 'Cooking');
    assert.equal(t.root.name, 'Cooking');
    assert.deepEqual(t.topics, []);
  });

  it('creates topic with notes and transitions arrays', () => {
    const n = freshTopic('SQL');
    assert.equal(n.level, 0);
    assert.deepEqual(n.notes, []);
    assert.deepEqual(n.transitions, []);
  });
});

describe('parseTrees and workspaceJSON', () => {
  const sample = {
    name: 'Cooking',
    topics: [
      {
        name: 'Knife skills',
        level: 2,
        notes: [{ body: 'Watch video', at: '2026-01-01T00:00:00.000Z' }],
        transitions: [{ from: 0, to: 2, at: '2026-01-02T00:00:00.000Z', note: 'Practised' }],
      },
    ],
  };

  it('parses a single tree export', () => {
    const trees = parseTrees(JSON.stringify(sample));
    assert.equal(trees.length, 1);
    assert.equal(trees[0].topics[0].name, 'Knife skills');
    assert.equal(trees[0].topics[0].notes.length, 1);
    assert.equal(trees[0].topics[0].transitions[0].note, 'Practised');
  });

  it('migrates legacy resources into notes on import', () => {
    const json = {
      name: 'Tree',
      topics: [
        {
          name: 'Topic',
          level: 0,
          resources: [{ kind: 'link', title: 'Docs', url: 'https://example.com' }],
        },
      ],
    };
    const trees = parseTrees(JSON.stringify(json));
    assert.equal(trees[0].topics[0].notes.length, 1);
    assert.match(trees[0].topics[0].notes[0].body, /Docs/);
  });

  it('round-trips through workspaceJSON', () => {
    const trees = parseTrees(JSON.stringify(sample));
    trees[0].id = 'local-1';
    const exported = JSON.parse(workspaceJSON(trees));
    assert.equal(exported.version, 1);
    assert.equal(exported.trees[0].name, 'Cooking');
    assert.equal(exported.trees[0].topics[0].transitions[0].to, 2);
  });

  it('rejects invalid JSON', () => {
    assert.throws(() => parseTrees('{bad'), /valid JSON/);
  });

  it('rejects invalid level', () => {
    assert.throws(
      () => parseTrees(JSON.stringify({ name: 'T', topics: [{ name: 'X', level: 9 }] })),
      /level must be/
    );
  });
});

describe('tree navigation', () => {
  const tree = freshTree('Root');
  const child = freshTopic('Child');
  tree.topics.push(child);

  it('findInTree locates root and child', () => {
    assert.equal(findInTree(tree, tree.root.id).kind, 'root');
    assert.equal(findInTree(tree, child.id).node.name, 'Child');
  });

  it('allNodes counts nested topics', () => {
    assert.equal(allNodes(tree).length, 1);
  });

  it('removeNodeFromTree promotes children', () => {
    const grand = freshTopic('Grand');
    child.children.push(grand);
    const found = findInTree(tree, child.id);
    removeNodeFromTree(tree, found);
    assert.equal(tree.topics[0].name, 'Grand');
  });
});

describe('progress metadata', () => {
  it('ensureTopicMeta migrates resources to notes', () => {
    const n = {
      level: 0,
      resources: [{ kind: 'note', title: 'T', body: 'Body' }],
    };
    ensureTopicMeta(n);
    assert.equal(n.notes.length, 1);
    assert.equal(n.resources.length, 0);
  });

  it('effectiveLevel treats suggested as gap', () => {
    assert.equal(effectiveLevel({ level: 2, suggested: true }), 0);
  });

  it('recordTransition updates level and appends history', () => {
    const n = freshTopic('A');
    n.suggested = true;
    assert.equal(recordTransition(n, 2, 'Ready'), true);
    assert.equal(n.level, 2);
    assert.equal(n.suggested, false);
    assert.equal(n.transitions.length, 1);
    assert.equal(n.transitions[0].note, 'Ready');
  });

  it('recordTransition skips unchanged level', () => {
    const n = freshTopic('A');
    n.level = 1;
    assert.equal(recordTransition(n, 1, ''), false);
  });

  it('formatDuration formats days and minutes', () => {
    assert.equal(formatDuration(86400000 * 2), '2 days');
    assert.equal(formatDuration(60000 * 5), '5 minutes');
    assert.equal(formatDuration(500), 'Less than a minute');
  });

  it('dwellBeforeTransition computes delta', () => {
    const transitions = [
      { at: '2026-01-01T00:00:00.000Z' },
      { at: '2026-01-02T00:00:00.000Z' },
    ];
    assert.equal(dwellBeforeTransition(transitions, 1), 86400000);
  });

  it('transitionLabel handles suggested gap', () => {
    assert.equal(transitionLabel(null, 1), 'Gap · suggested → Theory');
  });

  it('isMovingUp detects progression', () => {
    assert.equal(isMovingUp(0, 2, false), true);
    assert.equal(isMovingUp(2, 1, false), false);
    assert.equal(isMovingUp(null, 1, true), true);
  });
});

describe('sharing helpers', () => {
  it('isReadOnly for view role', () => {
    assert.equal(isReadOnly({ cloudRole: 'view' }), true);
    assert.equal(isReadOnly({ cloudRole: 'edit' }), false);
  });

  it('canShare for owner or cloud-backed tree', () => {
    assert.equal(canShare({ cloudRole: 'owner', cloudId: 'c1' }), true);
    assert.ok(canShare({ cloudId: 'c1' }));
    assert.equal(canShare({ cloudRole: 'view', cloudId: 'c1' }), false);
    assert.equal(canShare({ cloudRole: 'edit', cloudId: 'c1' }), false);
  });
});

describe('storageKeyForUser', () => {
  it('normalizes email into storage key', () => {
    assert.equal(storageKeyForUser('  User@Example.com '), 'knowledgetree.workspace.v1:user:user@example.com');
  });

  it('requires email', () => {
    assert.throws(() => storageKeyForUser('bad'), /signed-in email/);
  });
});

describe('stageSvg', () => {
  it('uses gap icon for suggested topics', () => {
    assert.match(stageSvg(3, true), /<svg/);
  });
});

describe('treeDocument', () => {
  it('includes runtime ids for cloud sync', () => {
    const t = freshTree('Sync me');
    const doc = treeDocument(t);
    assert.equal(doc.name, 'Sync me');
    assert.ok(doc.root.id);
    assert.ok(Array.isArray(doc.topics));
  });
});

describe('walk and levelShortLabel', () => {
  it('walk visits every nested node', () => {
    const tree = freshTree('Root');
    const a = freshTopic('A');
    const b = freshTopic('B');
    a.children.push(b);
    tree.topics.push(a);
    const names = [];
    walk(tree.topics, (n) => names.push(n.name));
    assert.deepEqual(names, ['A', 'B']);
  });

  it('levelShortLabel maps stages', () => {
    assert.equal(levelShortLabel(2, false), LEVEL_SHORT[2]);
    assert.equal(levelShortLabel(1, true), 'Gap · suggested');
  });
});

describe('formatDuration edge cases', () => {
  it('returns empty for invalid input', () => {
    assert.equal(formatDuration(NaN), '');
    assert.equal(formatDuration(-1), '');
  });

  it('formats hours', () => {
    assert.equal(formatDuration(3600000 * 2), '2 hours');
  });
});

describe('dwellBeforeTransition edge cases', () => {
  it('returns null for first transition', () => {
    assert.equal(dwellBeforeTransition([{ at: '2026-01-01T00:00:00.000Z' }], 0), null);
  });
});

describe('parseTrees validation', () => {
  it('rejects missing tree name', () => {
    assert.throws(() => parseTrees(JSON.stringify({ topics: [] })), /name/);
  });

  it('rejects invalid transition level', () => {
    assert.throws(
      () =>
        parseTrees(
          JSON.stringify({
            name: 'T',
            topics: [{ name: 'X', level: 0, transitions: [{ from: 0, to: 9 }] }],
          })
        ),
      /to must be/
    );
  });

  it('parses workspace envelope', () => {
    const tree = freshTree('One');
    const payload = workspaceToStorage([tree], 0);
    const trees = parseTrees(JSON.stringify(payload));
    assert.equal(trees.length, 1);
    assert.equal(trees[0].name, 'One');
  });
});

describe('uid', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => uid()));
    assert.equal(ids.size, 20);
  });
});

describe('workspace storage', () => {
  const store = new Map();

  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
  });

  it('saveStoredWorkspace and loadStoredWorkspace round-trip', () => {
    const tree = freshTree('Saved');
    tree.cloudId = 'cloud-1';
    saveStoredWorkspace('user@example.com', [tree], 0, { zoom: 1.2 }, { sidebar: true });
    const loaded = loadStoredWorkspace('user@example.com');
    assert.equal(loaded.trees.length, 1);
    assert.equal(loaded.trees[0].name, 'Saved');
    assert.equal(loaded.trees[0].cloudId, 'cloud-1');
    assert.equal(loaded.viewState.zoom, 1.2);
    assert.equal(loaded.ui.sidebar, true);
  });

  it('returns empty workspace when nothing stored', () => {
    const loaded = loadStoredWorkspace('new@example.com');
    assert.deepEqual(loaded.trees, []);
    assert.equal(loaded.currentTreeKey, null);
  });
});
