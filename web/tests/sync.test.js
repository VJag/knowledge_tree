import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  markTreeDirty,
  treesForSync,
  dedupeWorkspaceTrees,
  mergeSyncResult,
} from '../js/sync.js';
import { freshTree } from '../js/model.js';

describe('markTreeDirty', () => {
  it('marks editable trees dirty', () => {
    const t = freshTree('A');
    markTreeDirty(t);
    assert.equal(t.syncDirty, true);
  });

  it('skips view-only trees', () => {
    const t = freshTree('A');
    t.cloudRole = 'view';
    markTreeDirty(t);
    assert.notEqual(t.syncDirty, true);
  });
});

describe('treesForSync', () => {
  it('includes dirty trees and trees without cloud id', () => {
    const dirty = freshTree('Dirty');
    dirty.syncDirty = true;
    const local = freshTree('Local');
    const synced = freshTree('Synced');
    synced.cloudId = 'cloud-1';
    synced.syncDirty = false;
    const payload = treesForSync([dirty, local, synced]);
    assert.equal(payload.length, 2);
    assert.equal(payload[0].name, 'Dirty');
    assert.equal(payload[1].document.name, 'Local');
  });
});

describe('dedupeWorkspaceTrees', () => {
  it('removes duplicate cloud ids and local copies shadowed by cloud name', () => {
    const cloud = freshTree('AI');
    cloud.cloudId = 'c1';
    const localDup = freshTree('AI');
    const other = freshTree('Other');
    const result = dedupeWorkspaceTrees([cloud, localDup, other, cloud]);
    assert.equal(result.length, 2);
    assert.equal(result.some((t) => t.cloudId === 'c1'), true);
    assert.equal(result.some((t) => t.name === 'Other'), true);
  });
});

describe('mergeSyncResult', () => {
  it('applies uploaded metadata to local trees', () => {
    const local = freshTree('Mine');
    local.id = 'local-1';
    local.syncDirty = true;
    const trees = [local];
    const result = mergeSyncResult(trees, {
      uploaded: [
        {
          localId: 'local-1',
          cloudId: 'cloud-9',
          name: 'Mine',
          version: 1,
          role: 'owner',
          document: { name: 'Mine', root: local.root, topics: [] },
        },
      ],
      remote: [],
    });
    assert.equal(local.cloudId, 'cloud-9');
    assert.equal(local.syncDirty, false);
    assert.equal(result.uploaded, 1);
  });

  it('pulls new remote trees into workspace', () => {
    const trees = [];
    mergeSyncResult(trees, {
      uploaded: [],
      remote: [
        {
          cloudId: 'remote-1',
          name: 'Shared tree',
          version: 2,
          role: 'view',
          ownerEmail: 'owner@example.com',
          document: {
            name: 'Shared tree',
            root: { id: 'r1', name: 'Shared tree' },
            topics: [],
          },
        },
      ],
    });
    assert.equal(trees.length, 1);
    assert.equal(trees[0].cloudRole, 'view');
    assert.equal(trees[0].ownerEmail, 'owner@example.com');
  });

  it('reports conflict count from server', () => {
    const local = freshTree('Mine');
    local.id = 'local-1';
    const result = mergeSyncResult([local], {
      uploaded: [],
      conflicts: [{ localId: 'local-1', cloudId: 'cloud-1', serverVersion: 2 }],
      remote: [],
    });
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.uploaded, 0);
  });

  it('applies newer remote when local is clean', () => {
    const local = freshTree('Mine');
    local.cloudId = 'cloud-1';
    local.cloudVersion = 1;
    local.syncDirty = false;
    mergeSyncResult([local], {
      uploaded: [],
      remote: [
        {
          cloudId: 'cloud-1',
          name: 'Mine',
          version: 3,
          role: 'owner',
          document: {
            name: 'Mine',
            root: local.root,
            topics: [{ id: 'remote', name: 'Remote topic', level: 0, children: [] }],
          },
        },
      ],
    });
    assert.equal(local.cloudVersion, 3);
    assert.equal(local.topics[0].name, 'Remote topic');
  });

  it('keeps dirty local tree when remote is not newer', () => {
    const local = freshTree('Mine');
    local.cloudId = 'cloud-1';
    local.cloudVersion = 3;
    local.syncDirty = true;
    local.topics = [{ id: 'local-topic', name: 'Local edit', level: 0, children: [] }];
    mergeSyncResult([local], {
      uploaded: [],
      remote: [
        {
          cloudId: 'cloud-1',
          name: 'Mine',
          version: 2,
          role: 'owner',
          document: {
            name: 'Mine',
            root: local.root,
            topics: [{ id: 'remote-topic', name: 'Remote', level: 0, children: [] }],
          },
        },
      ],
    });
    assert.equal(local.topics[0].name, 'Local edit');
  });
});
