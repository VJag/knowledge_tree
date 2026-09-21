/** Help hub and article screens. */

const ICON = {
  topics:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V10M8 21h8M12 15l-4-4M12 12l4-4"/><path d="M12 10C7 10 5 7 6 3c4 0 7 2 6 7ZM12 15c5 0 8-3 7-7-4 0-7 3-7 7Z"/></svg>',
  progress:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-4 3 3 5-6"/></svg>',
  saving:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  sync:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  sharing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/></svg>',
  backup:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  samples:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  signin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};

export const HELP_TOPICS = [
  {
    id: 'topics',
    title: 'Trees & topics',
    summary: 'Maps in the sidebar, branches on the canvas, and learning levels.',
    icon: ICON.topics,
    lede: 'KnowledgeTree is a set of maps. Each map is a tree; everything you draw on the canvas is a topic.',
    sections: [
      {
        heading: 'Trees live in MY TREES',
        paragraphs: [
          'A tree is a knowledge map — for example “AI engineering” or “Databases”. Your trees appear in the left sidebar under MY TREES. Tap one to open it on the canvas.',
          'Use New topic in the sidebar (or ⋮ menu → New topic) to start a fresh map. You can keep many trees; each one is independent.',
        ],
      },
      {
        heading: 'Topics on the canvas',
        paragraphs: [
          'Everything on the canvas is a topic — the root, top-level branches, and nested branches. There is no separate “node” type; nested items are still topics.',
          'New topic in the top bar adds a topic under the map root. Select any topic to open the side panel — set your level, add notes, or expand History when you need it.',
        ],
        steps: [
          'Select the map root to rename the whole tree or add top-level topics.',
          'Select a branch topic to add nested topics beneath it.',
          'Drag topics on the canvas to rearrange them; positions save on this device.',
        ],
      },
      {
        heading: 'Learning levels',
        paragraphs: [
          'Each topic has a self-assessed level. Tap the stage icon on a topic, or use the stepper in the side panel. Every level change is recorded in your progress history (see Progress & timing).',
        ],
        bullets: [
          'Gap — you have not learnt this yet (or it is a suggested gap).',
          'Theory — you understand the idea but have not practised much.',
          'Practising — you are actively working with it.',
          'Learnt — working knowledge; you could explain or apply it.',
        ],
      },
      {
        heading: 'Suggested gaps',
        paragraphs: [
          'Sample trees include red dashed topics marked Gap · suggested. They are ideas you might add — select one, pick a level to keep it, or Delete to remove it.',
        ],
      },
      {
        heading: 'Delete',
        paragraphs: [
          'Delete in the side panel removes the selected topic. If it has nested topics, they move up to the parent instead of being lost.',
          'Select the map root and Delete to remove the entire tree from MY TREES (including from the cloud if you own it).',
        ],
      },
      {
        heading: 'Sidebar',
        paragraphs: [
          'Collapse the sidebar with the panel icon in its header. When collapsed, an icon rail stays visible; use the same icon in the top bar to expand again.',
        ],
      },
    ],
  },
  {
    id: 'progress',
    title: 'Progress & timing',
    summary: 'Notes, level history, and time in each stage.',
    icon: ICON.progress,
    lede: 'Your level on the canvas is the latest step in a timestamped history. That lets you — and people you share with — see how learning unfolded over time.',
    sections: [
      {
        heading: 'Transition log',
        paragraphs: [
          'Whenever you change a topic’s level, KnowledgeTree appends a transition: from stage, to stage, timestamp, and optional note.',
          'The canvas colour and stage icon always reflect the most recent transition.',
        ],
        bullets: [
          'A short note is optional on every move — why you moved up, down, or stayed ready to progress.',
          'Tapping the canvas stage icon cycles forward; the side-panel stepper jumps to any stage. Both use the same transition flow.',
        ],
      },
      {
        heading: 'History panel',
        paragraphs: [
          'Expand History in the side panel when you want the timeline. You will see:',
        ],
        bullets: [
          'How long you have been in your current stage.',
          'A chronological list of every level change with date and time.',
          'The note you wrote for each move.',
          'Time spent in the previous stage before each transition (dwell time).',
        ],
      },
      {
        heading: 'Notes',
        paragraphs: [
          'Expand Notes in the side panel to jot anything — links, reminders, thoughts. Just type and tap Add.',
          'When you change level, you can also leave a note on that move. It appears in History, separate from your general notes.',
        ],
      },
      {
        heading: 'Suggested gaps',
        paragraphs: [
          'Selecting any level on a suggested gap clears the suggestion and records a transition. Keeping it as Gap (level 0) just removes the suggested styling without logging a move.',
        ],
      },
      {
        heading: 'Sharing your progress',
        paragraphs: [
          'When you share a tree with View progress, invitees see your levels, notes, and history — read-only. Sync the tree to cloud first so their copy stays up to date.',
        ],
        callout:
          'Can edit sharing still exists for collaborators who should change the map structure. Levels on a shared edit tree are shared — use View progress when you want someone to observe your learning without editing.',
      },
    ],
  },
  {
    id: 'saving',
    title: 'Saving on this device',
    summary: 'Automatic local storage tied to your signed-in email.',
    icon: ICON.saving,
    lede: 'Your workspace saves in the browser first. You stay in control — nothing leaves this device unless you sync or export.',
    sections: [
      {
        heading: 'Automatic saves',
        paragraphs: [
          'Every change — new topics, renames, levels, notes, transitions, positions, zoom — saves automatically to local storage. You do not need a Save button.',
          'Data is keyed to the email you signed in with. Same browser + same account always reloads the same workspace.',
        ],
      },
      {
        heading: 'What is stored locally',
        bullets: [
          'All trees and their topics, levels, and hierarchy.',
          'Notes and progress history (transitions with timestamps).',
          'Canvas positions for each topic (if you dragged them).',
          'Zoom and scroll position per tree.',
          'Sidebar collapsed or expanded preference.',
          'Which tree was open last.',
        ],
      },
      {
        heading: 'This is not the cloud',
        paragraphs: [
          'Local storage lives only in this browser on this device. Clearing site data, using private mode without persistence, or switching browsers will not show your trees until you sync from the cloud or import a JSON backup.',
          'The note at the bottom of the sidebar reflects local save status — it does not mean your data is backed up online.',
        ],
      },
      {
        heading: 'Tips',
        callout: 'Export JSON occasionally if you rely on local-only storage and want an offline backup file.',
      },
    ],
  },
  {
    id: 'sync',
    title: 'Sync to cloud',
    summary: 'Manual backup and download — nothing uploads by itself.',
    icon: ICON.sync,
    lede: 'Sync copies trees between this device and the server when you choose to. It is optional but required before sharing.',
    sections: [
      {
        heading: 'Manual sync only',
        paragraphs: [
          'Nothing uploads automatically when you edit a tree. Tap the sync icon in the top bar when you want to back up or pull changes.',
          'A dot on the sync icon means at least one tree changed locally since the last successful sync.',
        ],
      },
      {
        heading: 'What sync does',
        steps: [
          'Uploads trees you changed on this device that the server does not have yet, or that are newer locally.',
          'Downloads trees you own in the cloud, plus trees shared with your email.',
          'Includes the full tree document — topics, levels, notes, transitions, and positions.',
          'Marks synced trees with In cloud in the top bar when viewing them.',
        ],
      },
      {
        heading: 'Conflicts',
        paragraphs: [
          'If the same tree changed here and in the cloud since the last sync, you will be asked which copy to keep. Pick the one you trust; the other version is replaced.',
        ],
      },
      {
        heading: 'When to sync',
        bullets: [
          'Before sharing a tree (sharing requires a cloud copy).',
          'When the sync icon shows a green dot — the cloud has updates you have not pulled yet.',
          'After editing on another device that synced to the cloud.',
          'When you want a server backup of local-only work.',
          'After recording progress you want a mentor or collaborator to see.',
        ],
      },
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing a tree',
    summary: 'Invite others by email to view progress or edit.',
    icon: ICON.sharing,
    lede: 'Share a cloud-backed tree with someone else. They sign in with the invited email and sync to receive it.',
    sections: [
      {
        heading: 'Before you share',
        steps: [
          'Open the tree you want to share.',
          'Tap sync and wait until the tree shows In cloud.',
          'Open ⋮ menu → Share tree.',
        ],
      },
      {
        heading: 'Invite someone',
        paragraphs: [
          'Open Share tree from the ⋮ menu. Enter an email and choose View progress or Can edit, then tap Invite.',
        ],
        bullets: [
          'View progress — read the map, levels, notes, and history. No edits.',
          'Can edit — add topics, change levels, rename, and delete (but not delete the whole map from the cloud). Levels and history live in the shared document.',
          'Inviting the same email again updates their permission.',
        ],
      },
      {
        heading: 'People with access',
        paragraphs: [
          'The share dialog lists everyone who has access, with their permission and a Remove button.',
          'Only the tree owner sees this list. Removing someone revokes access on the server; they keep any copy already synced until they delete it locally.',
        ],
      },
      {
        heading: 'Emails from KnowledgeTree',
        bullets: [
          'Invite — when you first share a tree (map name + permission).',
          'Progress update — when the owner syncs, view-progress collaborators may get one email per day asking them to Sync.',
          'Collaborator update — when someone with Can edit syncs, the owner may get one email per day.',
          'Access changed or removed — when you update permission or remove someone.',
          'If email is not configured, sharing still works — tell people to sign in and tap Sync.',
        ],
      },
      {
        heading: 'What you will see',
        bullets: [
          'Shared · can edit or Shared · view progress in the top bar when viewing a shared tree.',
          'Trees you own show In cloud after sync.',
        ],
      },
    ],
  },
  {
    id: 'backup',
    title: 'Export & import',
    summary: 'Portable JSON backups without using the cloud.',
    icon: ICON.backup,
    lede: 'Export downloads a JSON file you can store anywhere. Import adds trees from a file or paste — existing trees stay untouched.',
    sections: [
      {
        heading: 'Export JSON',
        paragraphs: [
          'Open ⋮ menu → Export JSON. Choose the current tree or all trees in your workspace.',
          'The file includes names, topic hierarchy, learning levels, suggested gaps, canvas positions, notes, and progress history (transitions with timestamps).',
        ],
        bullets: [
          'Use for offline backups on disk or cloud drives.',
          'Move data between accounts or devices without sync.',
          'Keep a snapshot before big edits.',
        ],
      },
      {
        heading: 'Import JSON',
        paragraphs: [
          'Open ⋮ menu → Import JSON (or New topic flow → From JSON). Paste JSON or choose a file up to 1 MB.',
          'Imports are added as new copies — they do not replace or merge with existing trees automatically.',
          'Older exports without notes or transitions still import; new fields simply start empty.',
        ],
      },
      {
        heading: 'Limits',
        bullets: [
          'Up to 30 trees per workspace.',
          'Up to 1,000 topics total.',
          'Up to 12 nesting levels per branch.',
          'Up to 100 notes and 200 transitions per topic.',
        ],
      },
    ],
  },
  {
    id: 'samples',
    title: 'Sample trees',
    summary: 'Starter maps you can edit freely.',
    icon: ICON.samples,
    lede: 'Samples are ready-made trees — useful for exploring the app or seeding a new area of study.',
    sections: [
      {
        heading: 'Adding a sample',
        steps: [
          'Open ⋮ menu → Sample trees (or New topic → Use a sample).',
          'Pick an example such as AI engineering or Databases.',
          'The sample is added to MY TREES as your own copy.',
        ],
      },
      {
        heading: 'What you get',
        paragraphs: [
          'Each sample includes a topic hierarchy with example learning levels and some suggested gap topics (red dashed). Change anything — rename, delete, add topics, adjust levels, and add notes as you learn.',
        ],
      },
      {
        heading: 'Cloud & sharing',
        paragraphs: [
          'Samples start local-only like any new tree. Sync when you want a cloud copy or to share your progress with someone else.',
        ],
      },
    ],
  },
  {
    id: 'signin',
    title: 'Sign in',
    summary: 'Passwordless email codes and sessions.',
    icon: ICON.signin,
    lede: 'KnowledgeTree uses your email and a one-time code — no password to remember.',
    sections: [
      {
        heading: 'How sign-in works',
        steps: [
          'Enter your email on the landing page.',
          'Check your inbox for a 6-digit code (expires in 10 minutes).',
          'Enter the code — you are signed in on this browser.',
        ],
      },
      {
        heading: 'Why sign in',
        paragraphs: [
          'Your trees are stored per email address. Signing in loads your workspace and keeps trees separate from other users on the same computer.',
        ],
      },
      {
        heading: 'Sessions',
        paragraphs: [
          'You stay signed in for a long session on this browser. Use ⋮ menu → Sign out when you are done on a shared machine.',
        ],
      },
      {
        heading: 'New here',
        callout: 'If you have no trees yet, use New topic in the sidebar or try a sample tree from the ⋮ menu.',
      },
    ],
  },
];

export function getHelpTopic(id) {
  return HELP_TOPICS.find((t) => t.id === id) || null;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSection(section) {
  let html = '<section class="help-block"><h2>' + esc(section.heading) + '</h2>';
  if (section.paragraphs) {
    section.paragraphs.forEach((p) => {
      html += '<p>' + p + '</p>';
    });
  }
  if (section.bullets) {
    html += '<ul class="help-list">';
    section.bullets.forEach((b) => {
      html += '<li>' + b + '</li>';
    });
    html += '</ul>';
  }
  if (section.steps) {
    html += '<ol class="help-steps">';
    section.steps.forEach((s) => {
      html += '<li>' + s + '</li>';
    });
    html += '</ol>';
  }
  if (section.callout) {
    html += '<div class="help-callout">' + section.callout + '</div>';
  }
  html += '</section>';
  return html;
}

export function renderHelpHub() {
  let cards = '';
  HELP_TOPICS.forEach((topic) => {
    cards +=
      '<button type="button" class="help-card" data-help-id="' +
      topic.id +
      '">' +
      '<span class="help-card-ic" aria-hidden="true">' +
      topic.icon +
      '</span>' +
      '<span class="help-card-body"><span class="help-card-title">' +
      esc(topic.title) +
      '</span><span class="help-card-summary">' +
      esc(topic.summary) +
      '</span></span>' +
      '<span class="help-card-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>' +
      '</button>';
  });
  return (
    '<header class="help-page-intro">' +
    '<h1 id="helpTitle">How KnowledgeTree works</h1>' +
    '<p class="help-lede">Pick a topic below. Each guide opens on its own screen with steps and details.</p>' +
    '</header>' +
    '<nav class="help-hub" aria-label="Help topics">' +
    cards +
    '</nav>'
  );
}

export function renderHelpArticle(id) {
  const topic = getHelpTopic(id);
  if (!topic) return renderHelpHub();
  let body = '';
  topic.sections.forEach((section) => {
    body += renderSection(section);
  });
  return (
    '<button type="button" class="help-inline-back" id="helpInlineBack">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
    'All help topics' +
    '</button>' +
    '<header class="help-article-head">' +
    '<span class="help-article-ic" aria-hidden="true">' +
    topic.icon +
    '</span>' +
    '<div><h1>' +
    esc(topic.title) +
    '</h1><p class="help-lede">' +
    topic.lede +
    '</p></div>' +
    '</header>' +
    '<div class="help-article-body">' +
    body +
    '</div>'
  );
}
