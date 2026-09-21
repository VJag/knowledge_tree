import { api } from './api.js';
import { treeDocument, uid, validName } from './model.js';

export function markTreeDirty(t) {
  if (t.cloudRole !== 'view') t.syncDirty = true;
}

export function treesForSync(trees) {
  return trees
    .filter((t) => t.syncDirty || !t.cloudId)
    .map((t) => ({
      localId: t.id,
      cloudId: t.cloudId || null,
      name: t.name,
      document: treeDocument(t),
      version: t.cloudVersion ?? null,
    }));
}

export async function syncToCloud(trees, { force = false } = {}) {
  const payload = treesForSync(trees);
  return api('/api/trees/sync', {
    method: 'POST',
    body: JSON.stringify({ trees: payload, force }),
  });
}

function applyRemoteMeta(local, remote) {
  local.cloudId = remote.cloudId;
  local.cloudVersion = remote.version;
  local.cloudRole = remote.role;
  local.ownerEmail = remote.ownerEmail || local.ownerEmail || null;
  local.name = remote.name;
  local.syncDirty = false;
  if (remote.document) {
    local.root = remote.document.root;
    local.topics = remote.document.topics;
    if (remote.document.sample !== undefined) local.sample = remote.document.sample;
  }
}

function treeFromRemote(remote) {
  const name = validName(remote.name, 'Tree');
  return {
    id: uid(),
    name,
    root: remote.document.root,
    topics: remote.document.topics,
    sample: !!remote.document.sample,
    cloudId: remote.cloudId,
    cloudVersion: remote.version,
    cloudRole: remote.role,
    ownerEmail: remote.ownerEmail || null,
    syncDirty: false,
  };
}

function trackCloudTree(byCloud, tree) {
  if (tree.cloudId) byCloud.set(tree.cloudId, tree);
}

/** Drop duplicate cloud copies and local-only copies already synced under the same name. */
export function dedupeWorkspaceTrees(trees) {
  const cloudByName = new Map();
  for (const t of trees) {
    if (t.cloudId) cloudByName.set(t.name.toLowerCase(), t);
  }
  const seenCloud = new Set();
  return trees.filter((t) => {
    if (t.cloudId) {
      if (seenCloud.has(t.cloudId)) return false;
      seenCloud.add(t.cloudId);
      return true;
    }
    return !cloudByName.has(t.name.toLowerCase());
  });
}

export function mergeSyncResult(trees, result) {
  const byCloud = new Map(trees.filter((t) => t.cloudId).map((t) => [t.cloudId, t]));
  const byLocal = new Map(trees.map((t) => [t.id, t]));

  for (const item of result.uploaded || []) {
    const local = byLocal.get(item.localId) || byCloud.get(item.cloudId);
    if (local) {
      applyRemoteMeta(local, item);
      trackCloudTree(byCloud, local);
    }
  }

  for (const remote of result.remote || []) {
    const local = byCloud.get(remote.cloudId);
    if (local) {
      if (!local.syncDirty || remote.version > (local.cloudVersion || 0)) {
        applyRemoteMeta(local, remote);
      }
      continue;
    }
    const created = treeFromRemote(remote);
    trees.push(created);
    trackCloudTree(byCloud, created);
  }

  const deduped = dedupeWorkspaceTrees(trees);
  trees.splice(0, trees.length, ...deduped);

  return {
    conflicts: result.conflicts || [],
    uploaded: (result.uploaded || []).length,
  };
}

export async function listShares(cloudId) {
  return api(`/api/trees/${cloudId}/shares`);
}

export async function addShare(cloudId, email, permission) {
  return api(`/api/trees/${cloudId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ email, permission }),
  });
}

export async function removeShare(cloudId, email) {
  const q = encodeURIComponent(email);
  return api(`/api/trees/${cloudId}/shares?email=${q}`, { method: 'DELETE' });
}

export async function deleteTreeFromCloud(cloudId) {
  return api(`/api/trees/${cloudId}`, { method: 'DELETE' });
}
