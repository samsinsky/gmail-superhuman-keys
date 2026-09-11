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

// --- key bindings ----------------------------------------------------------
// A binding is data: the keypress that triggers it, the chord prefix it lives
// under (if any), and the name of an action content.js knows how to run.
// Adding a shortcut should mean adding a row to bindings.js, not editing logic.

function normalizeKey(key) {
  return String(key || '').toLowerCase();
}

// Modifiers default to "must be absent" so a binding never fires under a
// combination it did not ask for. 'any' opts out, which is what shifted
// punctuation needs: e.key is already '!' and demanding shift as well would be
// describing the same fact twice.
function modMatches(want, has) {
  if (want === 'any') return true;
  return Boolean(want) === Boolean(has);
}

function bindingMatches(binding, e) {
  if (normalizeKey(binding.key) !== normalizeKey(e.key)) return false;
  return modMatches(binding.shift, e.shiftKey)
    && modMatches(binding.ctrl, e.ctrlKey)
    && modMatches(binding.meta, e.metaKey)
    && modMatches(binding.alt, e.altKey);
}

// `pending` is the chord prefix currently held ('g'), or null. A chord binding
// fires only under its prefix, and a plain binding only without one, so the two
// sets never shadow each other.
function matchBinding(e, bindings, pending = null) {
  for (const binding of bindings || []) {
    if ((binding.chord || null) !== (pending || null)) continue;
    if (bindingMatches(binding, e)) return binding;
  }
  return null;
}

// True when this keypress opens a chord some binding is waiting under. A
// modifier rules it out: Ctrl+G belongs to whatever else has claimed it.
function isChordPrefix(e, bindings) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const pressed = normalizeKey(e.key);
  return (bindings || []).some((b) => b.chord && normalizeKey(b.chord) === pressed);
}

// Modifiers arrive as their own keydown before the character they modify:
// typing ! is a Shift keydown, then a '!' keydown. The chord machine has to sit
// still for them, or every chord ending in shifted punctuation is disarmed
// before its leaf arrives.
const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'altgraph', 'capslock']);

function isModifierKey(e) {
  return MODIFIER_KEYS.has(normalizeKey(e.key));
}

// The key string to dispatch for a synthesized keystroke. A real keyboard
// reports Shift+A as key 'A', and Gmail reads e.key, so sending 'a' with
// shiftKey set is a keystroke Gmail ignores. Only single letters are cased:
// named keys (Enter, Escape) keep their spelling, and punctuation already
// encodes the shift in the character itself.
function synthKey(spec) {
  const key = String((spec && spec.key) || '');
  if (spec && spec.shift && /^[a-z]$/.test(key)) return key.toUpperCase();
  return key;
}

// Gmail marks an unread row tr.zA.zE and a read one tr.zA.yO. Measured against
// the live thread list: the two classes partition every row, so the marker is
// a reliable read of the current state rather than a guess.
const UNREAD_ROW_CLASS = 'zE';

function isUnreadRow(row) {
  return !!(row && row.classList && row.classList.contains(UNREAD_ROW_CLASS));
}

// Superhuman's u toggles read state. Gmail splits that across Shift+i (mark
// read) and Shift+u (mark unread), so which one to fire depends on where the
// conversation currently is.
function readToggleSpec(isUnread) {
  return isUnread ? { key: 'i', shift: true } : { key: 'u', shift: true };
}

// Superhuman's Shift+O expands all. Gmail offers both directions -- ; expands
// the conversation, : collapses it -- and the current state is legible, so this
// toggles instead, which is the more useful key.
//
// ':' is Shift+; on a real keyboard, so the character carries the shift and
// synthKey leaves it alone.
function expandToggleSpec(hasCollapsed) {
  return hasCollapsed ? { key: ';' } : { key: ':', shift: true };
}

// Which conversation an action should act on, and whether we have to tick its
// box to make Gmail agree.
//
// Gmail acts on checked conversations and ignores both the mouse and the
// keyboard cursor -- confirmed by hand for e, b, m and the Move to Inbox
// control. Superhuman instead acts on whatever is focused, which is why these
// shortcuts feel broken in Gmail until you remember the checkbox.
//
// An existing selection always wins, so a deliberate multi-select is never
// silently redirected at whatever the mouse happens to be over. Failing that we
// take the hovered row, then the cursor row, and otherwise refuse: acting on an
// arbitrary conversation is worse than doing nothing.
function pickTarget(sources) {
  const { checked, hovered, cursor } = sources || {};
  if (checked) return { row: checked, needsCheck: false };
  if (hovered) return { row: hovered, needsCheck: true };
  if (cursor) return { row: cursor, needsCheck: true };
  return { row: null, needsCheck: false };
}

// One keypress against the table, given the prefix currently armed. Returns the
// binding to run (or null) and the prefix to hold next.
//
// This is pure so the chord state machine can be tested. It lived in content.js
// once, where a modifier keydown disarmed the chord and g+! quietly reached
// Gmail as "report spam" instead -- the kind of bug that only shows up on a
// real keyboard, which is exactly why it belongs here.
function resolveKey(e, bindings, pending = null) {
  if (isModifierKey(e)) return { binding: null, pending };

  const binding = matchBinding(e, bindings, pending);
  if (binding) return { binding, pending: null };

  // A second key we do not claim ends our chord and falls through, so Gmail's
  // own g+i, g+s and friends still land.
  if (pending) return { binding: null, pending: null };

  if (isChordPrefix(e, bindings)) return { binding: null, pending: normalizeKey(e.key) };
  return { binding: null, pending: null };
}

// Bindings that cost a Gmail native ship optIn and stay off until config names
// them, so installing an update never silently takes a shortcut away.
function activeBindings(bindings, config = {}) {
  const off = new Set(config.disabled || []);
  const on = new Set(config.enabled || []);
  return (bindings || []).filter(
    (b) => !off.has(b.id) && (!b.optIn || on.has(b.id))
  );
}

// Ctrl+1..9 is nine bindings sharing one action. Generated rather than typed
// out, and deliberately not Cmd: that is browser tab switching on mac.
function accountBindings(count) {
  const out = [];
  for (let n = 1; n <= Math.min(count || 0, 9); n += 1) {
    out.push({ id: `account${n}`, key: String(n), ctrl: true, action: 'account', arg: n });
  }
  return out;
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
  normalizeKey,
  modMatches,
  bindingMatches,
  matchBinding,
  isChordPrefix,
  MODIFIER_KEYS,
  isModifierKey,
  resolveKey,
  synthKey,
  UNREAD_ROW_CLASS,
  isUnreadRow,
  readToggleSpec,
  pickTarget,
  expandToggleSpec,
  activeBindings,
  accountBindings,
};

// Content scripts share one isolated world, so hang the API off a namespace
// rather than relying on cross-file top-level scope.
if (typeof globalThis !== 'undefined') globalThis.GSK_CORE = core;
if (typeof module !== 'undefined' && module.exports) module.exports = core;
