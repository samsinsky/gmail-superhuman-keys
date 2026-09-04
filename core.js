// Pure logic for Gmail Superhuman Keys.
//
// Everything here is a plain function over strings and arrays: no DOM writes,
// no globals, no navigation. That keeps the interesting decisions (which tab is
// active, where Tab should take you, whether a keypress is ours to handle)
// testable under node, leaving content.js as thin wiring.

const CATEGORY_HASHES = {
  primary: '#inbox',
  social: '#category/social',
  promotions: '#category/promotions',
  updates: '#category/updates',
  forums: '#category/forums',
};

// Gmail addresses an account by email via ?authuser=, which resolves against
// the signed-in sessions. Deliberately not /u/<n>/ — those indices are assigned
// in sign-in order and renumber if you sign out, which would silently send
// Ctrl+2 to the wrong mailbox.
function accountUrl(email) {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`;
}

// Gmail appends a thread id when you open a message (#category/social/FMfcgz…),
// so compare on the leading view segments only.
function normalizeHash(hash) {
  const bare = String(hash || '').replace(/^#/, '').toLowerCase();
  if (!bare) return '#inbox';
  const parts = bare.split('/');
  const head = parts[0] === 'category' ? parts.slice(0, 2) : parts.slice(0, 1);
  return `#${head.join('/')}`;
}

function currentTabIndex(hash, tabs) {
  const view = normalizeHash(hash);
  return tabs.findIndex((tab) => normalizeHash(tab.hash) === view);
}

// Returns the hash to navigate to, or null when cycling makes no sense and the
// keypress should be handed back to the browser.
function nextTabHash(hash, tabs, direction) {
  if (!Array.isArray(tabs) || tabs.length < 2) return null;
  const index = currentTabIndex(hash, tabs);
  // Not on a tab at all (Sent, a label, a search). Cycling from "nowhere" would
  // land somewhere arbitrary, so go to the first tab in either direction.
  if (index === -1) return tabs[0].hash;
  const next = (index + direction + tabs.length) % tabs.length;
  return tabs[next].hash;
}

// True when the keypress belongs to whatever the user is typing in. This is what
// keeps Tab working normally in compose, where Gmail uses it to move between
// To/Subject/body and, with the setting on, Tab+Enter to send.
function shouldIgnore(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute && target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;
  // Compose and Gmail's settings both render as dialogs; leave their internal
  // focus order alone.
  if (target.closest && target.closest('[role="dialog"]')) return true;
  return false;
}

// Gmail's tab labels carry unread counts ("Primary 12 unread", "Social, 3 new"),
// so identify a tab by its leading word.
function labelWord(text) {
  return String(text || '').trim().split(/[\s,]+/)[0].toLowerCase();
}

// Maps the visible text of Gmail's inbox tabs onto category hashes.
function tabsFromLabels(labels) {
  const seen = new Set();
  const tabs = [];
  for (const raw of labels || []) {
    const word = labelWord(raw);
    const hash = CATEGORY_HASHES[word];
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    tabs.push({ label: word[0].toUpperCase() + word.slice(1), hash });
  }
  return tabs;
}

// Gmail's inbox tabs are Closure controls: DIV[role=tab] carrying J-KU-* state
// classes, with no jsaction attribute and no anchor inside. Closure activates
// on mousedown, so a bare el.click() dispatches an event nothing listens for.
// Confirmed against the live DOM: el.click() had no effect; mousedown ->
// mouseup -> click switched the tab.
const ACTIVATION_EVENTS = ['mousedown', 'mouseup', 'click'];

function activate(el, makeEvent) {
  if (!el) return false;
  for (const type of ACTIVATION_EVENTS) el.dispatchEvent(makeEvent(type));
  return true;
}

// Which tab are we on? Clicking a real tab does not necessarily update the URL,
// so Gmail's own aria-selected is authoritative and the hash is the fallback
// for views where the tab bar is not rendered at all.
function resolveIndex(selectedLabel, hash, tabs) {
  const word = labelWord(selectedLabel);
  if (word) {
    const byLabel = tabs.findIndex((tab) => labelWord(tab.label) === word);
    if (byLabel !== -1) return byLabel;
  }
  return currentTabIndex(hash, tabs);
}

// Step from an index, wrapping. -1 in means "we are not on a tab", which lands
// on the first rather than somewhere arbitrary. -1 out means "do not cycle".
function stepIndex(index, direction, length) {
  if (!length || length < 2) return -1;
  if (index === -1) return 0;
  return (index + direction + length) % length;
}

const core = {
  CATEGORY_HASHES,
  ACTIVATION_EVENTS,
  activate,
  labelWord,
  resolveIndex,
  stepIndex,
  accountUrl,
  normalizeHash,
  currentTabIndex,
  nextTabHash,
  shouldIgnore,
  tabsFromLabels,
};

// Content scripts share one isolated world, so hang the API off a namespace
// rather than relying on cross-file top-level scope.
if (typeof globalThis !== 'undefined') globalThis.GSK_CORE = core;
if (typeof module !== 'undefined' && module.exports) module.exports = core;
