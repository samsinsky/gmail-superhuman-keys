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

// --- key bindings ----------------------------------------------------------

const key = (k, mods = {}) => ({
  key: k,
  shiftKey: !!mods.shift,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
});

const BINDINGS = [
  { id: 'tabNext', key: 'Tab', action: 'cycleTab', arg: 1 },
  { id: 'tabPrev', key: 'Tab', shift: true, action: 'cycleTab', arg: -1 },
  { id: 'spam', key: '!', shift: 'any', chord: 'g', action: 'nav', arg: '#spam' },
  { id: 'filterUnread', key: 'u', shift: true, optIn: true, action: 'nav', arg: '#x' },
];

test('normalizeKey lowercases so Shift+M and m compare equal', () => {
  assert.strictEqual(core.normalizeKey('M'), 'm');
  assert.strictEqual(core.normalizeKey('Tab'), 'tab');
  assert.strictEqual(core.normalizeKey('!'), '!');
  assert.strictEqual(core.normalizeKey(null), '');
});

test('matchBinding finds a plain key', () => {
  assert.strictEqual(core.matchBinding(key('Tab'), BINDINGS).id, 'tabNext');
});

test('matchBinding distinguishes Shift+Tab from Tab', () => {
  assert.strictEqual(core.matchBinding(key('Tab', { shift: true }), BINDINGS).id, 'tabPrev');
});

test('matchBinding requires absent modifiers by default, so Ctrl+Tab is not ours', () => {
  assert.strictEqual(core.matchBinding(key('Tab', { ctrl: true }), BINDINGS), null);
});

test("matchBinding ignores shift where 'any' is declared, for shifted punctuation", () => {
  assert.strictEqual(core.matchBinding(key('!', { shift: true }), BINDINGS, 'g').id, 'spam');
  assert.strictEqual(core.matchBinding(key('!'), BINDINGS, 'g').id, 'spam');
});

test('matchBinding will not fire a chord binding without its prefix pending', () => {
  assert.strictEqual(core.matchBinding(key('!', { shift: true }), BINDINGS), null);
});

test('matchBinding will not fire a plain binding while a prefix is pending', () => {
  assert.strictEqual(core.matchBinding(key('Tab'), BINDINGS, 'g'), null);
});

test('matchBinding returns null for a key nobody claims', () => {
  assert.strictEqual(core.matchBinding(key('q'), BINDINGS), null);
});

test('activeBindings hides opt-in bindings until they are named', () => {
  const ids = core.activeBindings(BINDINGS, {}).map((b) => b.id);
  assert.ok(!ids.includes('filterUnread'));
  const on = core.activeBindings(BINDINGS, { enabled: ['filterUnread'] }).map((b) => b.id);
  assert.ok(on.includes('filterUnread'));
});

test('activeBindings drops anything explicitly disabled', () => {
  const ids = core.activeBindings(BINDINGS, { disabled: ['tabNext'] }).map((b) => b.id);
  assert.ok(!ids.includes('tabNext'));
  assert.ok(ids.includes('tabPrev'));
});

test('accountBindings generates Ctrl+1..9', () => {
  const list = core.accountBindings(3);
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map((b) => b.arg), [1, 2, 3]);
  assert.strictEqual(core.matchBinding(key('2', { ctrl: true }), list).arg, 2);
});

test('accountBindings excludes Cmd and Alt, so browser tab switching is untouched', () => {
  const list = core.accountBindings(9);
  assert.strictEqual(core.matchBinding(key('2', { ctrl: true, meta: true }), list), null);
  assert.strictEqual(core.matchBinding(key('2', { meta: true }), list), null);
});

// --- chords ----------------------------------------------------------------

const CHORDED = [
  { id: 'done', key: 'e', chord: 'g', action: 'nav', arg: '#search/in%3Aarchive' },
  { id: 'trash', key: '#', shift: 'any', chord: 'g', action: 'nav', arg: '#trash' },
  { id: 'tabNext', key: 'Tab', action: 'cycleTab', arg: 1 },
];

test('isChordPrefix recognises a key some binding uses as a prefix', () => {
  assert.strictEqual(core.isChordPrefix(key('g'), CHORDED), true);
});

test('isChordPrefix is false for a key no binding chords on', () => {
  assert.strictEqual(core.isChordPrefix(key('q'), CHORDED), false);
});

test('isChordPrefix is false under a modifier, so Ctrl+G is left alone', () => {
  assert.strictEqual(core.isChordPrefix(key('g', { ctrl: true }), CHORDED), false);
  assert.strictEqual(core.isChordPrefix(key('g', { meta: true }), CHORDED), false);
});

test('a chord leaf resolves only under its prefix', () => {
  assert.strictEqual(core.matchBinding(key('e'), CHORDED, 'g').id, 'done');
  assert.strictEqual(core.matchBinding(key('e'), CHORDED, null), null);
});

test('a shifted-punctuation leaf resolves under its prefix', () => {
  assert.strictEqual(core.matchBinding(key('#', { shift: true }), CHORDED, 'g').id, 'trash');
});

test('an unclaimed second key resolves to nothing, so g+i still reaches Gmail', () => {
  assert.strictEqual(core.matchBinding(key('i'), CHORDED, 'g'), null);
});

// --- modifier keys and the chord state machine ------------------------------
// Typing ! is two keydowns: Shift, then '!'. A modifier keydown must not count
// as "a second key we do not claim", or every chord ending in shifted
// punctuation dies before its leaf arrives. This escaped review once because
// the state machine lived in content.js, untested; it lives in core.js now.

test('isModifierKey is true for the modifiers that arrive as their own keydown', () => {
  assert.strictEqual(core.isModifierKey(key('Shift', { shift: true })), true);
  assert.strictEqual(core.isModifierKey(key('Control', { ctrl: true })), true);
  assert.strictEqual(core.isModifierKey(key('Alt', { alt: true })), true);
  assert.strictEqual(core.isModifierKey(key('Meta', { meta: true })), true);
});

test('isModifierKey is false for ordinary keys', () => {
  assert.strictEqual(core.isModifierKey(key('g')), false);
  assert.strictEqual(core.isModifierKey(key('!', { shift: true })), false);
  assert.strictEqual(core.isModifierKey(key('Tab')), false);
});

test('resolveKey arms a chord on the prefix without running anything', () => {
  const r = core.resolveKey(key('g'), CHORDED, null);
  assert.strictEqual(r.binding, null);
  assert.strictEqual(r.pending, 'g');
});

test('resolveKey runs a chord leaf and disarms', () => {
  const r = core.resolveKey(key('e'), CHORDED, 'g');
  assert.strictEqual(r.binding.id, 'done');
  assert.strictEqual(r.pending, null);
});

test('a Shift keydown holds the chord open, so g then ! still reaches spam', () => {
  const held = core.resolveKey(key('Shift', { shift: true }), CHORDED, 'g');
  assert.strictEqual(held.binding, null);
  assert.strictEqual(held.pending, 'g', 'Shift must not disarm the chord');

  const leaf = core.resolveKey(key('#', { shift: true }), CHORDED, held.pending);
  assert.strictEqual(leaf.binding.id, 'trash');
});

test('a modifier keydown outside a chord leaves the machine alone', () => {
  const r = core.resolveKey(key('Shift', { shift: true }), CHORDED, null);
  assert.strictEqual(r.binding, null);
  assert.strictEqual(r.pending, null);
});

test('an unclaimed second key disarms and runs nothing, so Gmail gets g+i', () => {
  const r = core.resolveKey(key('i'), CHORDED, 'g');
  assert.strictEqual(r.binding, null);
  assert.strictEqual(r.pending, null);
});

test('resolveKey runs a plain binding when no chord is pending', () => {
  const r = core.resolveKey(key('Tab'), CHORDED, null);
  assert.strictEqual(r.binding.id, 'tabNext');
  assert.strictEqual(r.pending, null);
});

test('a plain binding does not fire while a chord is pending', () => {
  const r = core.resolveKey(key('Tab'), CHORDED, 'g');
  assert.strictEqual(r.binding, null);
  assert.strictEqual(r.pending, null);
});

// --- synthesizing a shifted keystroke --------------------------------------
// A real keyboard reports Shift+A as key 'A', not 'a' with shiftKey set. Gmail
// reads e.key, so synthesizing lowercase under shift produced a keystroke it
// ignored -- which is why Shift+Enter (pop out reply-all, firing Shift+a) did
// nothing while the unshifted rebinds worked.

test('synthKey uppercases a letter when shift is set, as a keyboard would', () => {
  assert.strictEqual(core.synthKey({ key: 'a', shift: true }), 'A');
  assert.strictEqual(core.synthKey({ key: 'i', shift: true }), 'I');
});

test('synthKey leaves an unshifted letter alone', () => {
  assert.strictEqual(core.synthKey({ key: 'b' }), 'b');
  assert.strictEqual(core.synthKey({ key: 'm', shift: false }), 'm');
});

test('synthKey leaves named keys alone even under shift', () => {
  assert.strictEqual(core.synthKey({ key: 'Enter', shift: true }), 'Enter');
  assert.strictEqual(core.synthKey({ key: 'Escape', shift: true }), 'Escape');
});

test('synthKey leaves punctuation alone, since the character already encodes shift', () => {
  assert.strictEqual(core.synthKey({ key: ';', shift: true }), ';');
  assert.strictEqual(core.synthKey({ key: '!', shift: true }), '!');
});

// --- read/unread toggle ----------------------------------------------------
// Superhuman's u toggles; Gmail splits it across Shift+i (mark read) and
// Shift+u (mark unread), so the direction depends on the row's current state.
// Gmail marks unread rows tr.zA.zE and read rows tr.zA.yO -- measured against
// the live thread list, where the two partition every row.

test('readToggleSpec marks an unread conversation read', () => {
  assert.deepStrictEqual(core.readToggleSpec(true), { key: 'i', shift: true });
});

test('readToggleSpec marks a read conversation unread', () => {
  assert.deepStrictEqual(core.readToggleSpec(false), { key: 'u', shift: true });
});

test('readToggleSpec round-trips through synthKey as a shifted letter', () => {
  assert.strictEqual(core.synthKey(core.readToggleSpec(true)), 'I');
  assert.strictEqual(core.synthKey(core.readToggleSpec(false)), 'U');
});

test('isUnreadRow reads Gmail unread marker class', () => {
  const row = (cls) => ({ classList: { contains: (c) => cls.includes(c) } });
  assert.strictEqual(core.isUnreadRow(row(['zA', 'zE'])), true);
  assert.strictEqual(core.isUnreadRow(row(['zA', 'yO'])), false);
  assert.strictEqual(core.isUnreadRow(null), false);
});
