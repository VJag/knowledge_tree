import {
  TREE_ICON,
  LEAF_ICON,
  stageSvg,
  LEVELS,
  LEVEL_SHORT,
  uid,
  esc,
  walk,
  allNodes,
  findInTree,
  validName,
  parseTrees,
  workspaceJSON,
  freshTree,
  freshTopic,
  SAMPLE_DATA,
  JSON_EXAMPLE,
  loadStoredWorkspace,
  saveStoredWorkspace,
  removeNodeFromTree,
  isReadOnly,
  ensureTopicMeta,
  effectiveLevel,
  recordTransition,
  formatDuration,
  dwellBeforeTransition,
  timeInCurrentLevel,
  transitionLabel,
  levelShortLabel,
} from './model.js';
import { renderLandingDemo } from './landing-demo.js';
import { getHelpTopic, renderHelpHub, renderHelpArticle } from './help.js';
import {
  refreshSession,
  getSessionUser,
  requestOtp,
  verifyOtp,
  logout,
} from './auth.js';
import {
  markTreeDirty,
  syncToCloud,
  mergeSyncResult,
  dedupeWorkspaceTrees,
  refreshCloudVersions,
  treeHasCloudUpdate,
  anyCloudUpdates,
  listShares,
  addShare,
  removeShare,
  deleteTreeFromCloud,
} from './sync.js';

const $ = (id) => document.getElementById(id);

let trees = [];
let currentTreeKey;
let selectedNodeId = null;
let zoom = 1;
let viewState = {};
let pendingScroll = null;
let scrollPersistTimer;
let confirmResolver = null;
let topicWorkspaceResolver = null;
let topicWorkspaceContext = null;
const inspectorFoldState = {};
let positions = {};
let contentW = 0;
let contentH = 0;
let toastTimer;
let createMode = 'blank';
let sidebarCollapsed = false;
let appView = 'workspace';
let helpScreenId = null;
let sampleIndex = 0;
let nameAction = null;
let fileReadToken = 0;
let homeAuthStep = 'email';
let homeAuthEmail = '';

function tree() {
  return trees.find((t) => t.id === currentTreeKey);
}

function canEdit() {
  const t = tree();
  return t && !isReadOnly(t);
}

function roleLabel(t) {
  if (!t.cloudRole) return '';
  if (t.cloudRole === 'owner') return 'In cloud';
  if (t.cloudRole === 'edit') return 'Shared · can edit';
  return 'Shared · view progress';
}

function findNode(id) {
  const t = tree();
  if (!t) return null;
  return findInTree(t, id);
}

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 4500);
}

function activeTreeIndex() {
  if (!currentTreeKey) return -1;
  return trees.findIndex((t) => t.id === currentTreeKey);
}

function clampZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.2, Math.min(1.6, n));
}

function saveCurrentView() {
  const t = tree();
  const scroll = $('canvasScroll');
  if (!t || !scroll) return;
  viewState[t.id] = {
    zoom,
    scrollLeft: scroll.scrollLeft,
    scrollTop: scroll.scrollTop,
  };
}

function restoreViewForTree(treeId, { reset = false } = {}) {
  if (reset || !treeId) {
    zoom = 1;
    pendingScroll = { left: 0, top: 0 };
    return;
  }
  const saved = viewState[treeId];
  if (!saved) {
    zoom = 1;
    pendingScroll = { left: 0, top: 0 };
    return;
  }
  zoom = clampZoom(saved.zoom);
  pendingScroll = {
    left: Math.max(0, Number(saved.scrollLeft) || 0),
    top: Math.max(0, Number(saved.scrollTop) || 0),
  };
}

function toggleSidebarCollapse() {
  sidebarCollapsed = !sidebarCollapsed;
  applySidebarCollapse();
  persist();
}

function applySidebarCollapse() {
  $('appShell').classList.toggle('sidebar-collapsed', sidebarCollapsed);
  const closeBtn = $('sidebarCollapseBtn');
  const openBtn = $('sidebarOpenBtn');
  if (closeBtn) closeBtn.hidden = sidebarCollapsed;
  if (openBtn) openBtn.hidden = !sidebarCollapsed;
}

function persist() {
  const user = getSessionUser();
  if (!user) return;
  saveCurrentView();
  try {
    saveStoredWorkspace(user.email, trees, activeTreeIndex(), viewState, { sidebarCollapsed });
    const dirty = trees.some((t) => t.syncDirty);
    const inCloud = trees.some((t) => t.cloudId);
    if (dirty) {
      $('saveNote').textContent = 'Saved on this device · not in cloud yet (tap Sync when ready)';
    } else if (inCloud) {
      $('saveNote').textContent = 'Saved on this device · matches cloud';
    } else {
      $('saveNote').textContent = 'Saved on this device only · cloud is optional';
    }
  } catch {
    $('saveNote').textContent = 'Browser saving unavailable. Export JSON to keep your changes.';
  }
}

function commit() {
  if (canEdit()) markTreeDirty(tree());
  render();
  persist();
}

function uniqueName(name, except) {
  const base = name;
  let i = 2;
  while (trees.some((t) => t.id !== except && t.name.toLowerCase() === name.toLowerCase())) {
    const suffix = ' (' + i++ + ')';
    name = base.slice(0, 80 - suffix.length) + suffix;
  }
  return name;
}

function topicTotal() {
  return trees.reduce((sum, t) => sum + allNodes(t).length, 0);
}

function insertTrees(list) {
  if (trees.length + list.length > 30) {
    throw new Error('This workspace supports 30 trees. Import fewer trees.');
  }
  if (topicTotal() + list.reduce((sum, t) => sum + allNodes(t).length, 0) > 1000) {
    throw new Error('This workspace supports 1,000 topics. Import fewer.');
  }
  list.forEach((t) => {
    t.name = uniqueName(t.name);
    t.root.name = t.name;
    t.syncDirty = true;
    trees.push(t);
  });
  currentTreeKey = list[0].id;
  selectedNodeId = null;
  restoreViewForTree(currentTreeKey, { reset: true });
  showWorkspace();
  commit();
  $('sidebar').classList.remove('open');
}

function levelClass(n) {
  return 'lvl-' + (n.suggested ? 0 : n.level);
}

function levelLabel(n) {
  return n.suggested ? 'Gap · suggested' : LEVELS[n.level];
}

function formatShortDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function levelMoveLabel(fromLevel, fromSuggested) {
  if (fromSuggested) return 'Gap · suggested';
  if (fromLevel === null) return 'Gap';
  return LEVEL_SHORT[fromLevel];
}

function appendTopicNote(n, body) {
  ensureTopicMeta(n);
  if (n.notes.length >= 100) {
    notify('At most 100 notes per topic.');
    return false;
  }
  const trimmed = (body || '').trim();
  if (!trimmed) return false;
  n.notes.push({ id: uid(), body: trimmed, at: new Date().toISOString() });
  return true;
}

function renderTopicWorkspaceNotes(n, editable) {
  ensureTopicMeta(n);
  if (!n.notes.length) {
    return '<p class="tw-empty">No learning material yet. Add links, summaries, or reminders below.</p>';
  }
  let html = '';
  [...n.notes].reverse().forEach((note) => {
    html += '<article class="tw-note-card">';
    if (editable) {
      html +=
        '<button type="button" class="note-remove" data-note-id="' +
        esc(note.id) +
        '" aria-label="Remove note">×</button>';
    }
    html +=
      '<p class="tw-note-date">' +
      esc(formatShortDate(note.at)) +
      '</p><p class="note-body">' +
      esc(note.body) +
      '</p></article>';
  });
  return html;
}

function renderTopicWorkspaceHistory(n) {
  ensureTopicMeta(n);
  let html = '';
  const currentDwell = timeInCurrentLevel(n);
  if (currentDwell !== null) {
    html +=
      '<p class="tw-history-meta">Currently ' +
      esc(levelShortLabel(n.level, n.suggested)) +
      ' · ' +
      esc(formatDuration(currentDwell)) +
      '</p>';
  }
  if (!n.transitions.length) {
    html += '<p class="tw-empty">No level moves recorded yet.</p>';
    return html;
  }
  [...n.transitions].reverse().forEach((tr) => {
    const idx = n.transitions.indexOf(tr);
    const dwell = dwellBeforeTransition(n.transitions, idx);
    html += '<article class="tw-history-card">';
    html +=
      '<span class="history-levels">' +
      esc(transitionLabel(tr.from, tr.to)) +
      '</span><span class="history-when">' +
      esc(formatShortDate(tr.at)) +
      '</span>';
    if (tr.note) html += '<p class="history-note">' + esc(tr.note) + '</p>';
    if (dwell !== null) html += '<p class="history-dwell">' + esc(formatDuration(dwell)) + ' in previous stage</p>';
    html += '</article>';
  });
  return html;
}

function refreshTopicWorkspacePanels(n, editable) {
  $('twNotesList').innerHTML = renderTopicWorkspaceNotes(n, editable);
  $('twHistoryList').innerHTML = renderTopicWorkspaceHistory(n);
  $('twNotesCount').textContent = n.notes.length ? String(n.notes.length) : '0';
  $('twNotesList').querySelectorAll('.note-remove').forEach((btn) => {
    btn.onclick = () => {
      ensureTopicMeta(n);
      n.notes = n.notes.filter((note) => note.id !== btn.dataset.noteId);
      commit();
      refreshTopicWorkspacePanels(n, editable);
      render();
    };
  });
}

function closeTopicWorkspace(result) {
  $('topicWorkspaceDialog').close();
  if (topicWorkspaceResolver) {
    topicWorkspaceResolver(result);
    topicWorkspaceResolver = null;
  }
  topicWorkspaceContext = null;
}

function showTopicWorkspace(n, options = {}) {
  const mode = options.mode || 'notes';
  const editable = options.editable !== false && canEdit();
  return new Promise((resolve) => {
    if (topicWorkspaceResolver) topicWorkspaceResolver(null);
    topicWorkspaceResolver = resolve;
    topicWorkspaceContext = { n, mode, editable, ...options };

    const fromText = levelMoveLabel(options.fromLevel, options.fromSuggested);
    const toText = LEVEL_SHORT[options.toLevel];

    if (mode === 'transition') {
      $('twEyebrow').textContent = 'Level change';
      $('twTitle').textContent = n.name;
      $('twHint').textContent = 'Review your learning material, then confirm the move.';
      $('twMovePill').hidden = false;
      $('twMoveFrom').textContent = fromText;
      $('twMoveTo').textContent = toText;
      $('twTransitionBlock').hidden = false;
      $('twMoveNote').value = '';
      $('twSubmit').textContent = 'Confirm move to ' + toText;
      $('twCancel').textContent = 'Cancel';
    } else if (mode === 'welcome') {
      $('twEyebrow').textContent = 'New topic';
      $('twTitle').textContent = n.name;
      $('twHint').textContent = 'Add links or notes for what you want to learn here.';
      $('twMovePill').hidden = true;
      $('twTransitionBlock').hidden = true;
      $('twSubmit').textContent = 'Done';
      $('twCancel').textContent = 'Skip for now';
    } else {
      $('twEyebrow').textContent = 'Topic';
      $('twTitle').textContent = n.name;
      $('twHint').textContent = editable
        ? 'Learning material and level history for this topic.'
        : 'Read-only view of learning material and history.';
      $('twMovePill').hidden = true;
      $('twTransitionBlock').hidden = true;
      $('twSubmit').textContent = 'Done';
      $('twCancel').textContent = 'Close';
    }

    $('twLearningNote').value = '';
    $('twAddNoteSection').hidden = !editable;
    const showCompose = editable || mode === 'transition';
    $('twComposeSection').hidden = !showCompose;
    $('twComposeSection').classList.toggle('tw-compose-single', !(editable && mode === 'transition'));
    message('twMessage', '');
    refreshTopicWorkspacePanels(n, editable);
    showDialog('topicWorkspaceDialog');
    (mode === 'transition' ? $('twMoveNote') : $('twLearningNote')).focus();
  });
}

async function requestLevelChange(n, toLevel) {
  if (!canEdit() || !n) return;
  const fromSuggested = !!n.suggested;
  const fromLevel = fromSuggested ? null : n.level;
  if (!fromSuggested && fromLevel === toLevel) return;
  if (fromSuggested && toLevel === 0) {
    n.suggested = false;
    commit();
    notify('Kept as gap.');
    return;
  }
  const result = await showTopicWorkspace(n, {
    mode: 'transition',
    fromLevel,
    toLevel,
    fromSuggested,
  });
  if (result === null) return;
  recordTransition(n, toLevel, result.moveNote || '');
  if (result.learningNote) appendTopicNote(n, result.learningNote);
  inspectorFoldState[n.id + ':notes'] = true;
  commit();
  notify('Moved to ' + LEVEL_SHORT[toLevel] + '.');
}

async function openTopicNotesModal(n) {
  if (!n) return;
  await showTopicWorkspace(n, { mode: 'notes', editable: canEdit() });
}

function renderInspectorFold(nodeId, foldId, title, badge, bodyHtml) {
  const key = nodeId + ':' + foldId;
  const open = inspectorFoldState[key] === true;
  return (
    '<details class="insp-fold"' +
    (open ? ' open' : '') +
    ' data-fold-key="' +
    esc(key) +
    '"><summary class="insp-fold-summary"><span>' +
    esc(title) +
    '</span><span class="insp-fold-right">' +
    (badge ? '<span class="insp-fold-badge">' + esc(badge) + '</span>' : '') +
    '<span class="insp-fold-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></span></summary><div class="insp-fold-body">' +
    bodyHtml +
    '</div></details>'
  );
}

function renderNotesBody(n, editable) {
  ensureTopicMeta(n);
  let html = '';
  if (n.notes.length) {
    html += '<ul class="note-list">';
    [...n.notes].reverse().forEach((note) => {
      html += '<li class="note-item">';
      if (editable) {
        html +=
          '<button type="button" class="note-remove" data-note-id="' +
          esc(note.id) +
          '" aria-label="Remove note">×</button>';
      }
      html += '<p class="note-body">' + esc(note.body) + '</p></li>';
    });
    html += '</ul>';
  }
  if (editable) {
    html +=
      '<form id="topicNoteForm" class="note-add"><textarea id="topicNoteBody" maxlength="2000" rows="2" placeholder="Anything — links, reminders, thoughts…"></textarea><button type="submit" class="btn note-add-btn">Add</button></form>';
  } else if (!n.notes.length) {
    html += '<p class="insp-empty">No notes yet.</p>';
  }
  html +=
    '<button type="button" class="btn ghost insp-open-notes" id="openNotesModal">Open full view</button>';
  return html;
}

function renderHistoryBody(n) {
  ensureTopicMeta(n);
  let html = '';
  const currentDwell = timeInCurrentLevel(n);
  if (currentDwell !== null) {
    html +=
      '<p class="insp-meta">' +
      esc(levelShortLabel(n.level, n.suggested)) +
      ' · ' +
      esc(formatDuration(currentDwell)) +
      '</p>';
  }
  if (!n.transitions.length) {
    html += '<p class="insp-empty">No moves yet.</p>';
  } else {
    html += '<ol class="history-list">';
    [...n.transitions].reverse().forEach((tr) => {
      const idx = n.transitions.indexOf(tr);
      const dwell = dwellBeforeTransition(n.transitions, idx);
      html +=
        '<li class="history-item"><span class="history-levels">' +
        esc(transitionLabel(tr.from, tr.to)) +
        '</span><span class="history-when">' +
        esc(formatShortDate(tr.at)) +
        '</span>';
      if (tr.note) html += '<p class="history-note">' + esc(tr.note) + '</p>';
      if (dwell !== null) html += '<p class="history-dwell">' + esc(formatDuration(dwell)) + ' before</p>';
      html += '</li>';
    });
    html += '</ol>';
  }
  return html;
}

function wireInspectorSections(n) {
  document.querySelectorAll('.insp-fold').forEach((el) => {
    el.ontoggle = () => {
      inspectorFoldState[el.dataset.foldKey] = el.open;
    };
  });
  document.querySelectorAll('.note-remove').forEach((btn) => {
    btn.onclick = () => {
      ensureTopicMeta(n);
      n.notes = n.notes.filter((note) => note.id !== btn.dataset.noteId);
      commit();
    };
  });
  if ($('topicNoteForm')) {
    $('topicNoteForm').onsubmit = (ev) => {
      ev.preventDefault();
      if (!appendTopicNote(n, $('topicNoteBody').value)) return;
      inspectorFoldState[n.id + ':notes'] = true;
      $('topicNoteBody').value = '';
      commit();
    };
  }
  if ($('openNotesModal')) {
    $('openNotesModal').onclick = () => openTopicNotesModal(n);
  }
}

function canDeleteWorkspaceTree(t) {
  return t && canEdit() && (!t.cloudRole || t.cloudRole === 'owner');
}

function renderTreeList() {
  $('treeList').replaceChildren();
  trees.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tree-item';
    b.setAttribute('aria-pressed', String(t.id === currentTreeKey));
    b.title = t.name + ' · ' + allNodes(t).length + ' topics';
    b.innerHTML =
      '<span class="avatar">' +
      TREE_ICON +
      '</span><span class="meta"><span class="name">' +
      esc(t.name) +
      (treeHasCloudUpdate(t) ? '<span class="tree-item-update">Update</span>' : '') +
      '</span><span class="count">' +
      allNodes(t).length +
      ' topics' +
      (t.sample ? ' · sample' : '') +
      (treeHasCloudUpdate(t) ? ' · cloud update' : '') +
      '</span></span>';
    b.onclick = () => {
      saveCurrentView();
      currentTreeKey = t.id;
      selectedNodeId = null;
      restoreViewForTree(t.id);
      showWorkspace();
      render();
      persist();
      $('sidebar').classList.remove('open');
    };
    $('treeList').append(b);
  });
}

function closeTopMenu() {
  $('topMenu').hidden = true;
  $('topMenuBtn').setAttribute('aria-expanded', 'false');
}

function toggleTopMenu() {
  const open = $('topMenu').hidden;
  $('topMenu').hidden = !open;
  $('topMenuBtn').setAttribute('aria-expanded', String(!open));
}

function bindHelpScreen() {
  $('helpRoot').querySelectorAll('[data-help-id]').forEach((btn) => {
    btn.onclick = () => showHelpArticle(btn.dataset.helpId);
  });
  const back = $('helpInlineBack');
  if (back) back.onclick = showHelpHub;
}

function renderHelpScreen() {
  $('helpRoot').innerHTML = helpScreenId ? renderHelpArticle(helpScreenId) : renderHelpHub();
  bindHelpScreen();
}

function showHelpHub() {
  helpScreenId = null;
  if (appView !== 'help') setAppView('help');
  else {
    renderHelpScreen();
    renderTopbar();
    $('helpView').scrollTop = 0;
  }
}

function showHelpArticle(id) {
  if (!getHelpTopic(id)) return showHelpHub();
  helpScreenId = id;
  renderHelpScreen();
  renderTopbar();
  $('helpView').scrollTop = 0;
}

function setAppView(view) {
  appView = view === 'help' ? 'help' : 'workspace';
  $('workspaceView').hidden = appView !== 'workspace';
  $('helpView').hidden = appView !== 'help';
  $('appShell').classList.toggle('help-open', appView === 'help');
  if (appView === 'help') {
    selectedNodeId = null;
    closeTopMenu();
    $('sidebar').classList.remove('open');
    renderHelpScreen();
    $('helpView').scrollTop = 0;
  } else {
    helpScreenId = null;
  }
  renderTopbar();
  if (appView === 'workspace') render();
}

function showWorkspace() {
  if (appView !== 'workspace') setAppView('workspace');
}

function leaveHelp() {
  showWorkspace();
}

function renderTopbar() {
  const dirty = trees.some((item) => item.syncDirty);
  const cloudUpdates = anyCloudUpdates(trees);
  $('syncUploadDot').hidden = !dirty;
  $('syncCloudDot').hidden = !cloudUpdates;
  let syncTitle = 'Sync to cloud';
  if (dirty && cloudUpdates) syncTitle = 'Upload your changes and pull cloud updates';
  else if (dirty) syncTitle = 'Upload your changes to the cloud';
  else if (cloudUpdates) syncTitle = 'Cloud has updates — tap to sync';
  $('syncBtn').title = syncTitle;
  $('syncBtn').setAttribute('aria-label', syncTitle);
  if (appView === 'help') {
    const topic = helpScreenId ? getHelpTopic(helpScreenId) : null;
    $('crumbTitle').textContent = topic ? topic.title : 'Help';
    $('crumbStats').textContent = topic ? 'Help' : 'How KnowledgeTree works';
    $('tbTreeIcon').innerHTML = TREE_ICON;
    $('roleChip').hidden = true;
    $('addTopicBtn').hidden = true;
    $('helpBackBtn').hidden = false;
    $('shareMenuItem').hidden = true;
    $('renameMenuItem').hidden = true;
    $('deleteTreeMenuItem').hidden = true;
    return;
  }
  $('helpBackBtn').hidden = true;
  const t = tree();
  if (!t) {
    $('crumbTitle').textContent = 'Your workspace';
    $('tbTreeIcon').innerHTML = TREE_ICON;
    $('crumbStats').textContent = trees.length ? 'Select a tree' : 'Create your first tree';
    $('roleChip').hidden = true;
    $('shareMenuItem').hidden = true;
    $('addTopicBtn').hidden = true;
    $('renameMenuItem').hidden = true;
    $('deleteTreeMenuItem').hidden = true;
    document.querySelector('.app').classList.remove('read-only');
    return;
  }
  const counts = [0, 0, 0, 0];
  allNodes(t).forEach((n) => counts[n.level]++);
  $('crumbTitle').textContent = t.name;
  $('tbTreeIcon').innerHTML = TREE_ICON;
  $('crumbStats').textContent =
    counts[3] +
    ' learnt · ' +
    counts[2] +
    ' practising · ' +
    counts[1] +
    ' theory · ' +
    counts[0] +
    ' gaps' +
    (t.sample ? ' · sample' : '');
  const chip = $('roleChip');
  const label = roleLabel(t);
  chip.hidden = !label;
  chip.textContent = label;
  chip.title =
    label === 'In cloud'
      ? 'This tree is in the cloud. Nothing syncs unless you tap the sync button.'
      : '';
  $('shareMenuItem').hidden = !(getSessionUser() && t.cloudId && t.cloudRole === 'owner');
  $('addTopicBtn').hidden = !canEdit();
  $('renameMenuItem').hidden = !canEdit();
  $('deleteTreeMenuItem').hidden = !canDeleteWorkspaceTree(t);
  document.querySelector('.app').classList.toggle('read-only', isReadOnly(t));
}

function drawEdge(a, b, suggested) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const x = a.x + a.w;
  const mid = (x + b.x) / 2;
  path.setAttribute('d', 'M ' + x + ' ' + a.y + ' C ' + mid + ' ' + a.y + ', ' + mid + ' ' + b.y + ', ' + b.x + ' ' + b.y);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', suggested ? 'var(--gap)' : 'var(--edge)');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  if (suggested) path.setAttribute('stroke-dasharray', '5 5');
  $('edges').append(path);
}

function redrawEdges() {
  const t = tree();
  $('edges').replaceChildren();
  walk(t.topics, (n, p) => {
    drawEdge(positions[(p || t.root).id], positions[n.id], n.suggested);
  });
}

function makeDraggable(el, node) {
  el.addEventListener('pointerdown', (ev) => {
    if (!canEdit()) return;
    if (ev.button !== 0 || ev.target.closest('button')) return;
    const p = positions[node.id];
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = p.x;
    const oy = p.y;
    let moved = false;
    el.setPointerCapture(ev.pointerId);
    el.classList.add('dragging');
    function move(e) {
      const dx = (e.clientX - sx) / zoom;
      const dy = (e.clientY - sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) < 5 && !moved) return;
      moved = true;
      const x = Math.max(16, Math.min(20000, ox + dx));
      const y = Math.max(100, Math.min(20000, oy + dy));
      node.pos = { x, y };
      positions[node.id] = { x, y, w: 200 };
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      contentW = Math.max(contentW, x + 280);
      contentH = Math.max(contentH, y + 130);
      $('canvas').style.width = contentW + 'px';
      $('canvas').style.height = contentH + 'px';
      $('edges').setAttribute('width', contentW);
      $('edges').setAttribute('height', contentH);
      applyZoom();
      redrawEdges();
    }
    function finish(e) {
      el.classList.remove('dragging');
      if (moved) {
        el.dataset.dragged = '1';
        persist();
      }
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', finish);
      el.removeEventListener('pointercancel', finish);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  });
}

function renderCanvas() {
  const t = tree();
  const scroll = $('canvasScroll');
  const existingEmpty = scroll.querySelector('.workspace-empty');
  if (existingEmpty) existingEmpty.remove();
  if (!t) {
    $('nodesLayer').replaceChildren();
    $('edges').replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'workspace-empty';
    empty.innerHTML =
      '<h2>Plant your first map</h2><p>Map what you know, track gaps, and grow.</p><button type="button" class="btn primary" id="emptyNewTree">New topic</button>';
    scroll.append(empty);
    empty.querySelector('#emptyNewTree').onclick = () => openCreate('blank');
    return;
  }
  const layer = $('nodesLayer');
  const edges = $('edges');
  const depths = {};
  const spans = {};
  const records = [];
  layer.replaceChildren();
  edges.replaceChildren();
  positions = {};

  function measure(n, d) {
    depths[n.id] = d;
    const kids = n === t.root ? t.topics : n.children || [];
    spans[n.id] = Math.max(
      126,
      kids.reduce((sum, c) => sum + measure(c, d + 1), 0) + Math.max(0, kids.length - 1) * 26
    );
    return spans[n.id];
  }

  measure(t.root, 0);
  contentH = Math.max(500, spans[t.root.id] + 100);
  contentW = 380 + Math.max.apply(null, Object.values(depths)) * 280;

  function place(n, top) {
    const kids = n === t.root ? t.topics : n.children || [];
    const d = depths[n.id];
    const x = n.pos ? n.pos.x : 60 + d * 280;
    const y = n.pos ? n.pos.y : top + spans[n.id] / 2;
    positions[n.id] = { x, y, w: n === t.root ? 216 : 200 };
    records.push(n);
    contentW = Math.max(contentW, x + 300);
    contentH = Math.max(contentH, y + 140);
    const kidsHeight = kids.reduce((sum, c) => sum + spans[c.id], 0) + Math.max(0, kids.length - 1) * 26;
    let start = top + (spans[n.id] - kidsHeight) / 2;
    kids.forEach((c) => {
      place(c, start);
      start += spans[c.id] + 26;
    });
  }

  place(t.root, 50);
  $('canvas').style.width = contentW + 'px';
  $('canvas').style.height = contentH + 'px';
  edges.setAttribute('width', contentW);
  edges.setAttribute('height', contentH);

  records.forEach((n) => {
    const root = n === t.root;
    const p = positions[n.id];
    const el = document.createElement('div');
    el.className = 'node ' + (root ? 'root' : levelClass(n));
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', n.name + (root ? ', root node' : ', ' + levelLabel(n)));
    const selected = n.id === selectedNodeId;
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-pressed', String(selected));
    el.dataset.nodeId = n.id;
    el.innerHTML = root
      ? '<div class="n-eyebrow">KNOWLEDGE TREE</div><div class="n-name">' +
        esc(n.name) +
        '</div><div class="n-count" style="margin-top:10px">Select to rename or grow</div>'
      : '<div class="n-top"><button type="button" class="n-stage" aria-label="' +
        esc('Advance learning stage for ' + n.name) +
        '">' +
        stageSvg(n.level, n.suggested) +
        '</button></div><div class="n-name">' +
        esc(n.name) +
        '</div><span class="n-status">' +
        esc(levelLabel(n)) +
        '</span>';
    el.onclick = () => {
      if (el.dataset.dragged === '1') {
        el.dataset.dragged = '0';
        return;
      }
      selectedNodeId = n.id;
      render();
    };
    el.onkeydown = (ev) => {
      if (ev.target !== el) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectedNodeId = n.id;
        render();
      }
    };
    const stage = el.querySelector('.n-stage');
    if (stage && canEdit()) {
      stage.onpointerdown = (ev) => ev.stopPropagation();
      stage.onclick = (ev) => {
        ev.stopPropagation();
        requestLevelChange(n, (effectiveLevel(n) + 1) % 4);
      };
    }
    if (!root) makeDraggable(el, n);
    layer.append(el);
  });

  if (!t.topics.length) {
    const add = document.createElement('button');
    add.className = 'node ghost-add';
    add.style.left = '340px';
    add.style.top = positions[t.root.id].y + 'px';
    add.innerHTML = LEAF_ICON + '<span>New topic</span>';
    add.querySelector('svg').style.width = '20px';
    add.onclick = () => openName('add', t.root.id);
    layer.append(add);
    contentW = 620;
    $('canvas').style.width = contentW + 'px';
  }
  redrawEdges();
}

async function deleteTopic(found) {
  const t = tree();
  if (!t || !found || found.kind === 'root' || !canEdit()) return;
  const n = found.node;
  const childCount = (n.children || []).length;
  const parentName = found.parent ? found.parent.name : t.name;
  const ok = await showConfirm({
    title: 'Delete “' + n.name + '”?',
    message:
      childCount === 0
        ? 'This topic will be removed.'
        : childCount +
          ' nested topic' +
          (childCount === 1 ? '' : 's') +
          ' will move up to “' +
          parentName +
          '”.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!ok) return;
  removeNodeFromTree(t, found);
  selectedNodeId = null;
  commit();
  notify(childCount ? n.name + ' removed' : n.name + ' removed.');
}

async function deleteWorkspaceTree() {
  const t = tree();
  if (!canDeleteWorkspaceTree(t)) return;
  const topicCount = allNodes(t).length;
  const ok = await showConfirm({
    title: 'Delete “' + t.name + '”?',
    message:
      topicCount === 0
        ? 'This removes the whole map from your workspace.'
        : 'This removes the map and all ' + topicCount + ' topic' + (topicCount === 1 ? '' : 's') + ' inside it.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!ok) return;
  try {
    if (t.cloudId && t.cloudRole === 'owner') await deleteTreeFromCloud(t.cloudId);
  } catch (e) {
    notify(e.message || 'Could not delete from cloud.');
    return;
  }
  const idx = trees.findIndex((item) => item.id === t.id);
  if (idx !== -1) trees.splice(idx, 1);
  delete viewState[t.id];
  currentTreeKey = trees.length ? trees[Math.min(idx, trees.length - 1)].id : null;
  selectedNodeId = null;
  restoreViewForTree(currentTreeKey);
  commit();
  notify(t.name + ' deleted.');
}

async function deleteSelection(found) {
  if (!found) return;
  if (found.kind === 'root') return deleteWorkspaceTree();
  return deleteTopic(found);
}

function renderInspector() {
  const panel = $('inspector');
  const found = selectedNodeId ? findNode(selectedNodeId) : null;
  panel.classList.toggle('open', !!found);
  if (!found) {
    panel.replaceChildren();
    return;
  }
  const t = tree();
  const n = found.node;
  const isRoot = found.kind === 'root';
  let html =
    '<div class="insp-head"><div><h2>' +
    esc(n.name) +
    '</h2><div class="insp-tag">Topic' +
    (n.suggested ? ' · suggested gap' : '') +
    '</div></div><button class="insp-close" id="inspClose" aria-label="Close details">×</button></div>';
  if (canEdit()) {
    html +=
      '<button class="btn icon-edit" id="inspRename" aria-label="Rename topic" title="Rename topic">' +
      $('renameTreeBtn').innerHTML +
      '</button>';
  }
  if (!isRoot && canEdit()) {
    html += '<div class="field"><label>My level · self-assessed</label><div class="stage-stepper">';
    [0, 1, 2, 3].forEach((i) => {
      if (i) html += '<span class="stage-line"></span>';
      const stageLevel = n.suggested ? 0 : n.level;
      const active = stageLevel === i;
      html +=
        '<button type="button" class="stage-dot" data-lvl="' +
        i +
        '" data-active="' +
        active +
        '" aria-label="' +
        LEVELS[i] +
        '" title="' +
        LEVELS[i] +
        '" aria-pressed="' +
        active +
        '">' +
        stageSvg(i, n.suggested && i === 0) +
        '</button>';
    });
    html +=
      '</div><div class="stage-caption">' +
      (n.suggested ? 'Gap · suggested' : LEVELS[n.level]) +
      '</div><div class="stage-hint">Tap a stage or the canvas icon to move.</div></div>';
  }
  if (!isRoot) {
    ensureTopicMeta(n);
    const noteBadge = n.notes.length ? String(n.notes.length) : '';
    const historyBadge = n.transitions.length ? String(n.transitions.length) : '';
    html += renderInspectorFold(n.id, 'notes', 'Notes', noteBadge, renderNotesBody(n, canEdit()));
    html += renderInspectorFold(n.id, 'history', 'History', historyBadge, renderHistoryBody(n));
  }
  if (canEdit()) {
    html +=
      '<form id="branchForm"><div class="field"><label for="inspBranch">New topic</label><input id="inspBranch" maxlength="80" placeholder="Topic name" required autocomplete="off"></div><button class="btn primary" style="width:100%;justify-content:center;margin-top:10px" type="submit">New topic</button><div class="form-message" id="branchMessage" role="status"></div></form>';
  } else {
    html +=
      '<p class="suggest-note">View-only — you can read notes and history. Ask the owner for edit access to change the map.</p>';
  }
  if ((isRoot && canDeleteWorkspaceTree(t)) || (!isRoot && canEdit())) {
    html += '<button type="button" class="insp-delete" id="inspDelete">Delete</button>';
  }
  panel.innerHTML = html;
  $('inspClose').onclick = () => {
    selectedNodeId = null;
    render();
  };
  if ($('inspRename')) $('inspRename').onclick = () => openName('rename', n.id);
  if ($('inspDelete')) {
    $('inspDelete').onclick = () => deleteSelection(found);
  }
  panel.querySelectorAll('.stage-dot').forEach((b) => {
    b.onclick = () => requestLevelChange(n, Number(b.dataset.lvl));
  });
  if (!isRoot) wireInspectorSections(n);
  if ($('branchForm')) {
    $('branchForm').onsubmit = (ev) => {
      ev.preventDefault();
      const name = $('inspBranch').value.trim();
      if (!name) return;
      const kids = isRoot ? tree().topics : n.children;
      if (found.depth >= 12) {
        $('branchMessage').textContent = 'This tree has reached 12 levels. Add a sibling branch instead.';
        return;
      }
      if (topicTotal() >= 1000) {
        $('branchMessage').textContent = 'This workspace has reached 1,000 topics.';
        return;
      }
      if (kids.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        $('branchMessage').textContent = 'That name already exists here.';
        return;
      }
      const created = freshTopic(name);
      kids.push(created);
      if (!isRoot) n.suggested = false;
      selectedNodeId = created.id;
      commit();
      notify(name + ' added.');
      showTopicWorkspace(created, { mode: 'welcome' });
    };
  }
}

function applyZoom() {
  $('canvas').style.transform = 'scale(' + zoom + ')';
  $('canvasExtent').style.width = Math.ceil(contentW * zoom) + 'px';
  $('canvasExtent').style.height = Math.ceil(contentH * zoom) + 'px';
  $('zoomPct').textContent = Math.round(zoom * 100) + '%';
}

function fitToScreen() {
  const area = $('canvasScroll');
  zoom = Math.max(0.2, Math.min((area.clientWidth - 35) / contentW, (area.clientHeight - 35) / contentH, 1));
  applyZoom();
  area.scrollLeft = 0;
  area.scrollTop = 0;
  saveCurrentView();
  persist();
}

function render() {
  renderTreeList();
  if (appView === 'help') {
    renderTopbar();
    return;
  }
  renderTopbar();
  renderCanvas();
  renderInspector();
  document.querySelector('.zoom-controls').style.right =
    $('inspector').classList.contains('open') && window.innerWidth > 860 ? '320px' : '20px';
  applyZoom();
  if (pendingScroll) {
    const area = $('canvasScroll');
    area.scrollLeft = pendingScroll.left;
    area.scrollTop = pendingScroll.top;
    pendingScroll = null;
  }
}

function message(id, text, error) {
  $(id).textContent = text;
  $(id).classList.toggle('error', !!error);
}

function showDialog(id) {
  $(id).showModal();
}

function closeConfirm(result) {
  $('confirmDialog').close();
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

function showConfirm({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (confirmResolver) confirmResolver(false);
    confirmResolver = resolve;
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmOk').textContent = confirmLabel;
    $('confirmCancel').textContent = cancelLabel;
    $('confirmOk').classList.toggle('confirm-danger', danger);
    showDialog('confirmDialog');
  });
}

function chooseMode(mode) {
  createMode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  });
  $('samplePanel').hidden = mode !== 'sample';
  $('jsonPanel').hidden = mode !== 'json';
  $('namedPanel').hidden = mode === 'json';
  $('createSubmit').textContent = mode === 'json' ? 'Import trees' : 'Create tree';
  $('treeName').required = mode !== 'json';
  message('createMessage', '');
  if (mode === 'sample') chooseSample(sampleIndex);
  else if (mode === 'json') previewImport();
  else updateRootPreview();
}

function updateRootPreview() {
  $('rootPreviewName').textContent = $('treeName').value.trim() || 'Your tree';
}

function chooseSample(i) {
  sampleIndex = i;
  $('treeName').value = SAMPLE_DATA[i].name;
  document.querySelectorAll('[data-sample]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.sample) === i));
  });
  updateRootPreview();
}

function openCreate(mode) {
  fileReadToken++;
  $('treeName').value = '';
  $('jsonText').value = '';
  $('jsonFile').value = '';
  chooseMode(mode || 'blank');
  showDialog('createDialog');
  if (mode !== 'json') $('treeName').focus();
}

function previewImport() {
  const text = $('jsonText').value;
  if (!text.trim()) {
    message('createMessage', 'Import adds new copies without replacing your existing trees.');
    return;
  }
  try {
    const list = parseTrees(text);
    message(
      'createMessage',
      'Ready: ' +
        list.length +
        ' tree' +
        (list.length === 1 ? '' : 's') +
        ' · ' +
        list.reduce((sum, t) => sum + allNodes(t).length, 0) +
        ' topics\n' +
        list.map((t) => t.name).join(', ')
    );
  } catch (e) {
    message('createMessage', e.message, true);
  }
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderAccountUI() {
  const user = getSessionUser();
  $('accountEmail').textContent = user ? user.email : '';
}

function setHomeAuthMessage(text, error) {
  $('homeAuthMessage').textContent = text || '';
  $('homeAuthMessage').classList.toggle('error', !!error);
}

function resetHomeAuthForm() {
  homeAuthStep = 'email';
  homeAuthEmail = '';
  $('homeEmail').value = '';
  $('homeCode').value = '';
  $('homeEmailStep').hidden = false;
  $('homeCodeStep').hidden = true;
  $('homeAuthSubmit').textContent = 'Send code';
  setHomeAuthMessage('');
}

function showLanding() {
  $('landing').hidden = false;
  $('appShell').hidden = true;
  document.body.classList.remove('in-app');
  renderLandingDemo($('landingPreview'));
}

function showAppShell() {
  $('landing').hidden = true;
  $('appShell').hidden = false;
  document.body.classList.add('in-app');
}

async function enterApp() {
  const user = getSessionUser();
  if (!user) {
    showLanding();
    return;
  }
  showAppShell();
  const stored = loadStoredWorkspace(user.email);
  trees = dedupeWorkspaceTrees(stored.trees);
  currentTreeKey = stored.currentTreeKey;
  if (currentTreeKey && !trees.some((t) => t.id === currentTreeKey)) {
    currentTreeKey = trees.length ? trees[0].id : null;
  }
  viewState = stored.viewState || {};
  sidebarCollapsed = stored.ui?.sidebarCollapsed === true;
  selectedNodeId = null;
  applySidebarCollapse();
  restoreViewForTree(currentTreeKey);
  renderAccountUI();
  render();
  persist();
  try {
    await refreshCloudVersions();
    renderTopbar();
    renderTreeList();
  } catch {
    /* offline or not signed in to cloud yet */
  }
}

async function exitApp() {
  persist();
  await logout();
  trees = [];
  currentTreeKey = null;
  viewState = {};
  sidebarCollapsed = false;
  appView = 'workspace';
  helpScreenId = null;
  applySidebarCollapse();
  $('workspaceView').hidden = false;
  $('helpView').hidden = true;
  $('appShell').classList.remove('help-open');
  pendingScroll = null;
  selectedNodeId = null;
  resetHomeAuthForm();
  showLanding();
}

async function handleSync(force = false) {
  try {
    const result = await syncToCloud(trees, { force });
    const summary = mergeSyncResult(trees, result);
    if (summary.conflicts.length && !force) {
      const keepDevice = await showConfirm({
        title: 'Cloud conflict',
        message:
          'Some trees changed in the cloud while you were editing.\n\nKeep your device copy and overwrite the cloud?',
        confirmLabel: 'Keep device copy',
        cancelLabel: 'Keep cloud copy',
      });
      if (keepDevice) return handleSync(true);
      for (const conflict of summary.conflicts) {
        const local = trees.find((t) => t.cloudId === conflict.cloudId);
        if (local) {
          local.root = conflict.serverDocument.root;
          local.topics = conflict.serverDocument.topics;
          local.cloudVersion = conflict.serverVersion;
          local.syncDirty = false;
        }
      }
    }
    try {
      await refreshCloudVersions();
    } catch {
      /* keep merge result versions */
    }
    render();
    persist();
    let message = summary.uploaded
      ? 'Synced ' + summary.uploaded + ' tree(s) to the cloud.'
      : 'Cloud trees are up to date.';
    const emails = summary.emailsSent;
    if (emails && (emails.progress > 0 || emails.collaborator > 0)) {
      const parts = [];
      if (emails.progress > 0) {
        parts.push(
          emails.progress === 1
            ? '1 view-progress collaborator emailed'
            : emails.progress + ' view-progress collaborators emailed'
        );
      }
      if (emails.collaborator > 0) parts.push('owner emailed about your edit');
      message += ' ' + parts.join('; ') + '.';
    }
    notify(message);
  } catch (e) {
    notify(e.message || 'Sync failed.');
  }
}

async function refreshShareList() {
  const t = tree();
  if (!t.cloudId) return;
  const data = await listShares(t.cloudId);
  const shares = data.shares || [];
  $('shareList').replaceChildren();
  $('shareEmpty').hidden = shares.length > 0;
  for (const share of shares) {
    const canEdit = share.permission === 'edit';
    const row = document.createElement('div');
    row.className = 'share-row';
    row.innerHTML =
      '<span class="share-person">' +
      '<span class="share-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>' +
      '<span><strong>' +
      esc(share.email) +
      '</strong><span class="share-perm-chip' +
      (canEdit ? ' edit' : '') +
      '">' +
      (canEdit ? 'Can edit' : 'View progress') +
      '</span></span></span>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost';
    btn.textContent = 'Remove';
    btn.onclick = async () => {
      try {
        await removeShare(t.cloudId, share.email);
        await refreshShareList();
        $('shareMessage').textContent = share.email + ' removed.';
        $('shareMessage').classList.remove('error');
      } catch (e) {
        $('shareMessage').textContent = e.message;
        $('shareMessage').classList.add('error');
      }
    };
    row.append(btn);
    $('shareList').append(row);
  }
}

function getSharePermission() {
  return document.querySelector('input[name="sharePermission"]:checked')?.value || 'view';
}

function setSharePermission(value) {
  const input = document.querySelector('input[name="sharePermission"][value="' + value + '"]');
  if (input) input.checked = true;
}

async function openShareDialog() {
  const t = tree();
  if (!t.cloudId || t.cloudRole !== 'owner') {
    notify('Sync this tree first, then you can share it.');
    return;
  }
  $('shareEmail').value = '';
  setSharePermission('view');
  $('shareMessage').textContent = '';
  $('shareMessage').classList.remove('error');
  try {
    await refreshShareList();
  } catch (e) {
    $('shareMessage').textContent = e.message;
    $('shareMessage').classList.add('error');
  }
  $('shareDialog').showModal();
}

function openName(mode, id) {
  if (!canEdit()) return;
  nameAction = { mode, id };
  const found = findNode(id);
  const isRoot = found.kind === 'root';
  $('nameTitle').textContent = mode === 'add' ? 'New topic' : isRoot ? 'Rename map' : 'Rename topic';
  $('nameHint').textContent =
    mode === 'add'
      ? 'Your new topic starts as a knowledge gap.'
      : isRoot
        ? 'The map and its root share the same name.'
        : 'Rename this topic without changing its branches.';
  $('nodeName').value = mode === 'add' ? '' : found.node.name;
  $('nameSubmit').textContent = mode === 'add' ? 'New topic' : 'Save name';
  message('nameMessage', '');
  showDialog('nameDialog');
  $('nodeName').focus();
  $('nodeName').select();
}

async function boot() {
  document.querySelector('.landing-brand .mark').innerHTML = LEAF_ICON;
  document.querySelector('.app .brand .mark').innerHTML = LEAF_ICON;

  await refreshSession();
  if (getSessionUser()) await enterApp();
  else showLanding();

  document.querySelector('.build-body').append(document.querySelector('.zoom-controls'));
  $('rootPreviewIcon').innerHTML = TREE_ICON;

  SAMPLE_DATA.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sample-choice';
    b.dataset.sample = i;
    b.innerHTML =
      TREE_ICON +
      '<span><strong>' +
      esc(s.name) +
      '</strong><small>' +
      esc(s.description) +
      '</small></span>';
    b.onclick = () => chooseSample(i);
    $('sampleChoices').append(b);
  });

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = () => $(b.dataset.close).close();
  });
  $('confirmOk').onclick = () => closeConfirm(true);
  $('confirmCancel').onclick = () => closeConfirm(false);
  $('confirmClose').onclick = () => closeConfirm(false);
  $('confirmDialog').addEventListener('cancel', () => closeConfirm(false));
  $('twCancel').onclick = () => closeTopicWorkspace(null);
  $('twClose').onclick = () => closeTopicWorkspace(null);
  $('topicWorkspaceDialog').addEventListener('cancel', () => closeTopicWorkspace(null));
  $('topicWorkspaceForm').onsubmit = (ev) => {
    ev.preventDefault();
    const ctx = topicWorkspaceContext;
    if (!ctx) return closeTopicWorkspace(null);
    const learningNote = $('twLearningNote').value.trim();
    if (ctx.mode === 'transition') {
      closeTopicWorkspace({
        moveNote: $('twMoveNote').value.trim(),
        learningNote,
      });
      return;
    }
    if (learningNote) {
      appendTopicNote(ctx.n, learningNote);
      inspectorFoldState[ctx.n.id + ':notes'] = true;
      commit();
      render();
    }
    closeTopicWorkspace(true);
  };
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => chooseMode(b.dataset.mode);
  });

  $('zoomIn').onclick = () => {
    zoom = Math.min(1.6, zoom + 0.1);
    applyZoom();
    saveCurrentView();
    persist();
  };
  $('zoomOut').onclick = () => {
    zoom = Math.max(0.2, zoom - 0.1);
    applyZoom();
    saveCurrentView();
    persist();
  };
  $('zoomFit').onclick = fitToScreen;
  $('canvasScroll').addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollPersistTimer);
      scrollPersistTimer = setTimeout(() => {
        saveCurrentView();
        persist();
      }, 300);
    },
    { passive: true }
  );
  window.addEventListener('resize', () => {
    document.querySelector('.zoom-controls').style.right =
      $('inspector').classList.contains('open') && window.innerWidth > 860 ? '320px' : '20px';
    applyZoom();
  });
  $('menuToggle').onclick = () => $('sidebar').classList.toggle('open');
  $('sidebarCollapseBtn').onclick = toggleSidebarCollapse;
  $('sidebarOpenBtn').onclick = toggleSidebarCollapse;
  $('newTreeBtn').onclick = () => {
    openCreate('blank');
    $('sidebar').classList.remove('open');
  };

  $('topMenuBtn').onclick = (ev) => {
    ev.stopPropagation();
    toggleTopMenu();
  };
  document.addEventListener('click', (ev) => {
    if (!$('topMenu').hidden && !ev.target.closest('.menu-wrap')) closeTopMenu();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('topMenu').hidden) closeTopMenu();
  });

  const withMenuClose = (fn) => () => {
    closeTopMenu();
    fn();
  };

  $('samplesMenuItem').onclick = withMenuClose(() => openCreate('sample'));
  $('newTreeMenuItem').onclick = withMenuClose(() => openCreate('blank'));
  $('deleteTreeMenuItem').onclick = withMenuClose(() => {
    const t = tree();
    if (!t) return notify('Select a map to delete.');
    deleteWorkspaceTree();
  });
  $('importMenuItem').onclick = withMenuClose(() => openCreate('json'));
  $('helpMenuItem').onclick = withMenuClose(() => {
    helpScreenId = null;
    setAppView('help');
  });
  $('helpBackBtn').onclick = leaveHelp;
  $('treeName').oninput = updateRootPreview;
  $('jsonText').oninput = previewImport;
  $('chooseJSON').onclick = () => $('jsonFile').click();
  $('jsonFile').onchange = async function () {
    const file = this.files[0];
    const token = ++fileReadToken;
    if (!file) return;
    if (file.size > 1048576) {
      message('createMessage', 'Choose a JSON file smaller than 1 MB.', true);
      return;
    }
    try {
      const text = await file.text();
      if (token !== fileReadToken) return;
      $('jsonText').value = text;
      previewImport();
    } catch {
      message('createMessage', 'Could not read that file. Try pasting its JSON.', true);
    }
  };
  $('loadExample').onclick = () => {
    fileReadToken++;
    $('jsonText').value = JSON_EXAMPLE;
    previewImport();
  };
  $('downloadExample').onclick = () => download('knowledgetree-example.json', JSON_EXAMPLE);

  $('createForm').onsubmit = (ev) => {
    ev.preventDefault();
    try {
      let list;
      if (createMode === 'json') {
        list = parseTrees($('jsonText').value);
      } else {
        const name = validName($('treeName').value, 'Tree');
        list =
          createMode === 'sample'
            ? parseTrees(JSON.stringify(SAMPLE_DATA[sampleIndex]))
            : [freshTree(name)];
        list[0].name = name;
        list[0].root.name = name;
      }
      insertTrees(list);
      $('createDialog').close();
      if (createMode === 'blank') {
        selectedNodeId = list[0].root.id;
        render();
      }
      notify(list.length === 1 ? list[0].name + ' created.' : list.length + ' trees imported.');
    } catch (e) {
      message('createMessage', e.message, true);
    }
  };

  const openExportDialog = () => {
    const t = tree();
    if (!t) return notify('Create a tree before exporting.');
    $('exportCurrentName').textContent = t.name;
    $('exportAllCount').textContent = trees.length + ' trees in one portable workspace.';
    showDialog('exportDialog');
  };
  $('exportMenuItem').onclick = withMenuClose(openExportDialog);
  $('exportForm').onsubmit = (ev) => {
    ev.preventDefault();
    const all = ev.target.elements.exportScope.value === 'all';
    const list = all ? trees : [tree()];
    const base = all
      ? 'knowledgetree-workspace'
      : tree()
          .name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'knowledgetree-tree';
    download(base + '.json', workspaceJSON(list));
    $('exportDialog').close();
    notify('JSON export downloaded.');
  };

  const openRenameTree = () => {
    const t = tree();
    if (t) openName('rename', t.root.id);
  };
  $('renameMenuItem').onclick = withMenuClose(openRenameTree);
  $('addTopicBtn').onclick = () => {
    showWorkspace();
    const t = tree();
    if (t) openName('add', t.root.id);
  };
  $('nameForm').onsubmit = (ev) => {
    ev.preventDefault();
    try {
      const name = validName($('nodeName').value, 'Name');
      const found = findNode(nameAction.id);
      if (!found) throw new Error('This item is no longer available.');
      if (nameAction.mode === 'add') {
        if (topicTotal() >= 1000) throw new Error('This workspace has reached 1,000 topics.');
        if (tree().topics.some((n) => n.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('This tree already has a topic with that name.');
        }
        const n = freshTopic(name);
        tree().topics.push(n);
        selectedNodeId = n.id;
        $('nameDialog').close();
        commit();
        notify('Topic added.');
        showTopicWorkspace(n, { mode: 'welcome' });
        return;
      } else if (found.kind === 'root') {
        if (trees.some((t) => t !== tree() && t.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('Another tree already uses that name.');
        }
        tree().name = name;
        tree().root.name = name;
      } else {
        found.node.name = name;
      }
      commit();
      $('nameDialog').close();
      notify(nameAction.mode === 'add' ? 'Topic added.' : 'Name updated.');
    } catch (e) {
      message('nameMessage', e.message, true);
    }
  };

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) {
      selectedNodeId = null;
      $('sidebar').classList.remove('open');
      render();
    }
  });

  $('signOutMenuItem').onclick = withMenuClose(async () => {
    await exitApp();
    notify('Signed out.');
  });
  $('syncBtn').onclick = () => handleSync(false);
  $('shareMenuItem').onclick = withMenuClose(() => openShareDialog());

  $('homeAuthForm').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (homeAuthStep === 'email') {
        homeAuthEmail = $('homeEmail').value.trim();
        const data = await requestOtp(homeAuthEmail);
        homeAuthStep = 'code';
        $('homeEmailStep').hidden = true;
        $('homeCodeStep').hidden = false;
        $('homeAuthSubmit').textContent = 'Verify code';
        setHomeAuthMessage(data.message || 'Check your email for a code.');
        $('homeCode').focus();
        return;
      }
      await verifyOtp(homeAuthEmail, $('homeCode').value.trim());
      resetHomeAuthForm();
      await enterApp();
      notify('Signed in.');
    } catch (e) {
      setHomeAuthMessage(e.message, true);
    }
  };

  $('shareForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const t = tree();
    const invited = $('shareEmail').value.trim();
    try {
      const result = await addShare(t.cloudId, invited, getSharePermission());
      $('shareEmail').value = '';
      if (result.emailSent) {
        $('shareMessage').textContent = 'Invite sent — we emailed ' + invited + '.';
      } else if (result.emailWarning) {
        $('shareMessage').textContent =
          'Access granted for ' +
          invited +
          '. Email could not be sent (' +
          result.emailWarning +
          '). Ask them to sign in with that address and tap Sync.';
      } else {
        $('shareMessage').textContent = 'Access granted for ' + invited + '.';
      }
      $('shareMessage').classList.remove('error');
      await refreshShareList();
    } catch (e) {
      $('shareMessage').textContent = e.message;
      $('shareMessage').classList.add('error');
    }
  };

  if (getSessionUser()) render();
}

boot();
