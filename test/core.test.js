const test = require('node:test');
const assert = require('node:assert');
const core = require('../core.js');

const TABS = [
  { label: 'Primary', hash: '#inbox' },
  { label: 'Social', hash: '#category/social' },
  { label: 'Promotions', hash: '#category/promotions' },
];

test('accountUrl builds an authuser URL for an address', () => {
  assert.strictEqual(
    core.accountUrl('you@example.com'),
    'https://mail.google.com/mail/?authuser=you%40example.com'
  );
});

test('accountUrl encodes addresses with + aliases', () => {
  assert.strictEqual(
    core.accountUrl('you+news@example.com'),
    'https://mail.google.com/mail/?authuser=you%2Bnews%40example.com'
  );
});

test('currentTabIndex matches the active tab from a hash', () => {
  assert.strictEqual(core.currentTabIndex('#category/social', TABS), 1);
});

test('currentTabIndex ignores a trailing thread id on the hash', () => {
  assert.strictEqual(core.currentTabIndex('#category/social/FMfcgz123', TABS), 1);
});

test('currentTabIndex is case-insensitive', () => {
  assert.strictEqual(core.currentTabIndex('#Category/Social', TABS), 1);
});

test('currentTabIndex treats an empty hash as Primary', () => {
  assert.strictEqual(core.currentTabIndex('', TABS), 0);
});

test('currentTabIndex returns -1 when the view is not a tab at all', () => {
  assert.strictEqual(core.currentTabIndex('#sent', TABS), -1);
});

test('nextTabHash advances one tab', () => {
  assert.strictEqual(core.nextTabHash('#inbox', TABS, 1), '#category/social');
});

test('nextTabHash wraps forward past the last tab', () => {
  assert.strictEqual(core.nextTabHash('#category/promotions', TABS, 1), '#inbox');
});

test('nextTabHash wraps backward past the first tab', () => {
  assert.strictEqual(core.nextTabHash('#inbox', TABS, -1), '#category/promotions');
});

test('nextTabHash from a non-tab view lands on Primary rather than jumping mid-list', () => {
  assert.strictEqual(core.nextTabHash('#sent', TABS, 1), '#inbox');
  assert.strictEqual(core.nextTabHash('#sent', TABS, -1), '#inbox');
});

test('nextTabHash returns null when there are no tabs to cycle', () => {
  assert.strictEqual(core.nextTabHash('#inbox', [], 1), null);
});

test('nextTabHash returns null for a single tab, so Tab keeps its native behaviour', () => {
  assert.strictEqual(core.nextTabHash('#inbox', [TABS[0]], 1), null);
});

// --- key guard -------------------------------------------------------------

const el = (tag, props = {}) => Object.assign({
  tagName: tag,
  isContentEditable: false,
  getAttribute: () => null,
  closest: () => null,
}, props);

test('shouldIgnore is true inside a text input', () => {
  assert.strictEqual(core.shouldIgnore(el('INPUT')), true);
});

test('shouldIgnore is true inside a textarea', () => {
  assert.strictEqual(core.shouldIgnore(el('TEXTAREA')), true);
});

test('shouldIgnore is true inside the compose body (contenteditable)', () => {
  assert.strictEqual(core.shouldIgnore(el('DIV', { isContentEditable: true })), true);
});

test('shouldIgnore is true inside a dialog, so compose windows are safe', () => {
  assert.strictEqual(
    core.shouldIgnore(el('DIV', { closest: (s) => (s.includes('dialog') ? {} : null) })),
    true
  );
});

test('shouldIgnore is true for an element explicitly marked as a textbox', () => {
  assert.strictEqual(
    core.shouldIgnore(el('DIV', { getAttribute: (a) => (a === 'role' ? 'textbox' : null) })),
    true
  );
});

test('shouldIgnore is false on the thread list', () => {
  assert.strictEqual(core.shouldIgnore(el('DIV')), false);
});

test('shouldIgnore is false for a null target', () => {
  assert.strictEqual(core.shouldIgnore(null), false);
});

// --- tab detection ---------------------------------------------------------

test('tabsFromLabels maps Gmail tab labels onto hashes, preserving order', () => {
  assert.deepStrictEqual(core.tabsFromLabels(['Primary', 'Promotions', 'Social']), [
    { label: 'Primary', hash: '#inbox' },
    { label: 'Promotions', hash: '#category/promotions' },
    { label: 'Social', hash: '#category/social' },
  ]);
});

test('tabsFromLabels drops labels it does not recognise', () => {
  assert.deepStrictEqual(core.tabsFromLabels(['Primary', 'Nonsense']), [
    { label: 'Primary', hash: '#inbox' },
  ]);
});

test('tabsFromLabels tolerates unread counts in the label text', () => {
  assert.deepStrictEqual(core.tabsFromLabels(['Primary 12 unread', 'Social, 3 new']), [
    { label: 'Primary', hash: '#inbox' },
    { label: 'Social', hash: '#category/social' },
  ]);
});

test('tabsFromLabels de-duplicates repeated labels', () => {
  assert.deepStrictEqual(core.tabsFromLabels(['Primary', 'Primary']), [
    { label: 'Primary', hash: '#inbox' },
  ]);
});

// --- resolving the active tab ---------------------------------------------
// With real tab clicks the URL may not change, so the DOM's aria-selected is
// the source of truth and the hash is only a fallback.

test('resolveIndex prefers the DOM-selected label over the hash', () => {
  assert.strictEqual(core.resolveIndex('Promotions', '#inbox', TABS), 2);
});

test('resolveIndex tolerates unread counts on the selected label', () => {
  assert.strictEqual(core.resolveIndex('Promotions, 5 new', '#inbox', TABS), 2);
});

test('resolveIndex falls back to the hash when nothing is selected', () => {
  assert.strictEqual(core.resolveIndex(null, '#category/social', TABS), 1);
});

test('resolveIndex falls back to the hash when the selected label is unknown', () => {
  assert.strictEqual(core.resolveIndex('Nonsense', '#category/social', TABS), 1);
});

test('resolveIndex returns -1 when neither source identifies a tab', () => {
  assert.strictEqual(core.resolveIndex(null, '#sent', TABS), -1);
});

test('stepIndex advances and wraps', () => {
  assert.strictEqual(core.stepIndex(0, 1, 3), 1);
  assert.strictEqual(core.stepIndex(2, 1, 3), 0);
  assert.strictEqual(core.stepIndex(0, -1, 3), 2);
});

test('stepIndex from an unknown position lands on the first tab', () => {
  assert.strictEqual(core.stepIndex(-1, 1, 3), 0);
  assert.strictEqual(core.stepIndex(-1, -1, 3), 0);
});

test('stepIndex returns -1 when there is nothing to cycle', () => {
  assert.strictEqual(core.stepIndex(0, 1, 1), -1);
  assert.strictEqual(core.stepIndex(0, 1, 0), -1);
});

test('labelWord extracts the matchable word from Gmail label text', () => {
  assert.strictEqual(core.labelWord('Promotions, 5 new'), 'promotions');
  assert.strictEqual(core.labelWord('  Primary 12 unread '), 'primary');
  assert.strictEqual(core.labelWord(null), '');
});

// --- activating a Gmail control -------------------------------------------
// Gmail's inbox tabs are Closure controls (DIV[role=tab] carrying J-KU-* state
// classes, no jsaction, no anchor). Verified in the live DOM: el.click() has no
// effect, while mousedown -> mouseup -> click switches the tab. Closure
// activates on mousedown, so the full sequence is required.

function fakeEl() {
  const fired = [];
  return { fired, dispatchEvent(e) { fired.push(e.type); return true; } };
}

test('activate fires mousedown, mouseup and click in that order', () => {
  const el = fakeEl();
  core.activate(el, (type) => ({ type }));
  assert.deepStrictEqual(el.fired, ['mousedown', 'mouseup', 'click']);
});

test('activate dispatches the event objects the factory builds', () => {
  const built = [];
  const el = { dispatchEvent: (e) => built.push(e) };
  core.activate(el, (type) => ({ type, marker: 'made-here' }));
  assert.deepStrictEqual(built.map((e) => e.marker), ['made-here', 'made-here', 'made-here']);
});

test('activate reports success', () => {
  assert.strictEqual(core.activate(fakeEl(), (type) => ({ type })), true);
});

test('activate refuses a missing element rather than throwing', () => {
  assert.strictEqual(core.activate(null, (type) => ({ type })), false);
});
