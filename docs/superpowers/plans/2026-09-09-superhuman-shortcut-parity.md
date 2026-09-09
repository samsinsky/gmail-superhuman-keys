# Superhuman Shortcut Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between Gmail's native shortcuts and Superhuman's, for every binding that needs no UI of our own.

**Architecture:** Replace the two hand-written `if` branches in `content.js` with a declarative binding table in `core.js`. A binding is data — the keypress, an optional chord prefix, and an action name. `core.js` decides *which* binding a keypress matches (pure, unit-tested); `content.js` owns a small dispatch table that carries each action out (hash navigation, synthesized Gmail keystroke, or activating a Gmail control). Everything new is a row in the table.

**Tech Stack:** Vanilla JS, Chrome Manifest V3 content script, `node:test` for the pure logic. No dependencies, no build step, no OAuth, no network calls.

**Spec:** No separate spec document. The requirements are the gap analysis in the conversation of 2026-09-06/09, reproduced in "Shortcut Inventory" below so this plan is self-contained.

## Global Constraints

- **No visual elements.** No command palette, no overlays, no injected DOM. Every binding either navigates, synthesizes a keystroke Gmail already binds, or activates a control Gmail already renders. (Sam, 2026-09-09.)
- **No OAuth, no Gmail API, no network calls.** Stated in `README.md` and load-bearing for the project's "nothing touches your mail" claim.
- **Gmail's native shortcuts must keep working** unless a binding is explicitly opted into. Anything that costs a Gmail native ships `optIn: true` and is off until named in `config.enabled`.
- **`core.js` stays pure.** No DOM reads, no writes, no globals, no navigation. That is what keeps it testable under node.
- **Tests run with** `node --test test/core.test.js`. No test runner is installed and none should be added.
- **Match the existing comment style:** explain *why* a decision was made, especially where Gmail's behaviour forced it. See the `ACTIVATION_EVENTS` comment in `core.js` for the register.

---

## Shortcut Inventory

What this plan adds, and what it deliberately leaves out.

**In scope — navigation (no Gmail conflict, all five chord leaves are unbound in Gmail):**

| Superhuman | Action | Implementation |
|---|---|---|
| `g` `e` | Go to Done | `#search/in%3Aarchive` |
| `g` `m` | Go to Muted | `#search/is%3Amuted` |
| `g` `h` | Go to Reminders | `#snoozed` |
| `g` `!` | Go to Spam | `#spam` |
| `g` `#` | Go to Trash | `#trash` |

**In scope — filter views (opt-in; each costs a Gmail native):**

| Superhuman | Action | Costs |
|---|---|---|
| `Shift+U` | Filter unread | Gmail's mark-as-unread |
| `Shift+S` | Filter starred | Nothing (unbound in Gmail) |
| `Shift+I` | Filter important | Gmail's mark-as-read |

**In scope — additive rebinds (Superhuman's key is unbound in Gmail, so nothing is lost):**

| Superhuman | Gmail key it fires |
|---|---|
| `h` Snooze | `b` |
| `Shift+M` Mute | `m` |

**In scope — conflicting rebinds (opt-in; each costs a Gmail native):**

| Superhuman | Gmail key it fires | Costs |
|---|---|---|
| `Enter` Reply all | `a` | Enter-to-open (Gmail's `o` still opens) |
| `u` Toggle read/unread | `Shift+i` when unread, `Shift+u` when read | Gmail's back-to-list on `u` |
| `Escape` Back to list | `u` | Nothing (Escape is unbound in the thread list) |
| `o` Expand message | `;` | Gmail's `o` = open conversation |
| `Shift+O` Expand all | `;` | Nothing |
| `Shift+Enter` Pop-out reply-all | `Shift+a` | Nothing |
| `Shift+C` Pop-out compose | `d` | Nothing |

**In scope — other:**

| Superhuman | Action | Implementation |
|---|---|---|
| `Ctrl+/` | Copy conversation link | `navigator.clipboard.writeText(location.href)` |
| `Shift+E` | Mark not done | Activate Gmail's "Move to Inbox" control |

**Explicitly out of scope:**

- `Cmd+K` command palette — needs UI. Ruled out by Sam, 2026-09-09.
- `0` / `-` / `=` calendar, `Cmd+;` snippets — need UI.
- `Shift+R` no-reply filter — Superhuman computes it server-side; no Gmail operator exists.
- `g` `o` Other, `g` `;` Snippets — no Gmail concept behind them.
- **All compose-context bindings** (`Cmd+Shift+O/S/M/A/,/I/H/L`, `Cmd+U` unsubscribe, `Cmd+Shift+Enter` send & done). These require inverting `shouldIgnore`, which today exempts compose entirely and is the guard keeping Tab-to-send working. That is a different subsystem with its own risk profile and deserves its own plan once this one lands.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `core.js` | Pure logic: key normalisation, binding match, chord resolution, config filtering. Existing tab/account logic unchanged. | Modify — add a `~90` line "key bindings" section |
| `bindings.js` | The binding table as data. One row per shortcut, no logic. | **Create** |
| `content.js` | Wiring: the action dispatch table, keystroke synthesis, control activation, chord timeout. | Modify — replace the keydown handler |
| `config.example.js` / `config.js` | Adds `enabled` and `disabled` binding-id lists. | Modify |
| `manifest.json` | Loads `bindings.js` between `core.js` and `content.js`. | Modify |
| `test/core.test.js` | Unit tests. Existing tests unchanged. | Modify — append |
| `diag/inspect-keys.js` | One-off probe: does Gmail act on synthetic keydown? | **Create** |
| `diag/inspect-toolbar.js` | One-off probe: how does "Move to Inbox" activate? | **Create** |
| `README.md` | Shortcut table, config docs. | Modify |

`bindings.js` is split out from `core.js` deliberately: `core.js` is the algorithm and stays stable, while `bindings.js` is a list that grows every time a shortcut is added. Keeping them apart means adding a shortcut touches data, not logic.

---

## Task 0: Diagnostic — does Gmail act on synthetic keystrokes? — ✅ DONE 2026-09-09

**This was a gate, not a feature.** Tasks 6, 7 and 8 (ten of the shortcuts) all rest on Gmail's keydown handlers accepting events we dispatch. Had Gmail checked `event.isTrusted`, that entire approach would have died and those tasks would need redesigning around toolbar clicks.

**Files:**
- Create: `diag/inspect-keys.js` ✅

- [x] **Step 1: Write the probe**

Written to `diag/inspect-keys.js`. Not reproduced here — the file is authoritative and carries the measured result in its header comment.

- [x] **Step 2: Run it against live Gmail and record the result**

Run against `sam@sinsky.net` in Chrome on 2026-09-09.

**Verdict: Gmail acts on synthetic keystrokes.** Four measurements:

| Trial | Result |
|---|---|
| Trusted `g` `t` (control, real keypress) | `#inbox` → `#sent` — confirms shortcuts are enabled |
| Plain letters `g` `t`, `key` only, at `document.body` | `#inbox` → `#sent` **WORKED** |
| Plain letters `g` `t`, `keyCode`/`which` pinned | `#inbox` → `#sent` **WORKED** |
| Shifted punctuation `?`, `key` + `shiftKey` only | overlay closed → open **WORKED** |

`isTrusted` is `false` on every synthetic event and Gmail does not check it.

**The finding that changed the plan:** `keyCode`/`which` do **not** need pinning. Gmail reads `e.key`. Task 6's `sendKey` was simplified accordingly — it now builds a plain `KeyboardEvent` with no `defineProperty` calls. The original plan asserted the pinning was required; that was wrong, and the probe's pinned-vs-bare pairs are what caught it.

**Two measurement bugs worth remembering**, both of which produced false negatives before being fixed:

1. The first probe fired `g` `t` from wherever the page happened to be. Run from Sent, the hash never changes and a working mechanism reports "no effect". Every trial now normalises to `#inbox` first, and restores position by assigning `location.hash` directly rather than by sending the keys under test.
2. The shifted-key probe looked for `[role="dialog"]`. Gmail's shortcuts overlay is not one, so a successful keypress reported as "no effect" — the overlay was open on screen while the detector said nothing had happened. It now matches the visible "Keyboard shortcuts" heading. Screenshotting the page is what exposed this; the DOM predicate alone was confidently wrong.

- [x] **Step 3: Write the finding into the script's header comment**

Done — see the `MEASURED 2026-09-09` block at the top of `diag/inspect-keys.js`.

- [x] **Step 4: Commit**

```bash
git add diag/inspect-keys.js
git commit -m "Add diagnostic for synthetic keystroke handling in Gmail"
```

---
## Task 1: Binding table and matcher

Introduces the abstraction and moves the two *existing, known-working* shortcuts onto it. No behaviour change — that is the point. If Tab or Ctrl+1 breaks here, the matcher is wrong, and that is far easier to see now than after ten more bindings are riding on it.

**Files:**
- Modify: `core.js` (append a "key bindings" section before the `core` export object)
- Create: `bindings.js`
- Modify: `content.js:98-121` (the keydown listener)
- Modify: `manifest.json:9`
- Modify: `test/core.test.js` (append)

**Interfaces:**
- Produces: `core.normalizeKey(key) -> string`, `core.bindingMatches(binding, event) -> boolean`, `core.matchBinding(event, bindings, pending) -> binding|null`, `core.activeBindings(bindings, config) -> binding[]`, and `globalThis.GSK_BINDINGS -> binding[]`.
- A binding is `{ id, key, shift?, ctrl?, meta?, alt?, chord?, optIn?, action, arg? }`. Modifiers default to `false`, meaning "must be absent"; `'any'` means "don't care". `action` is a key into `content.js`'s dispatch table.

- [ ] **Step 1: Write the failing tests**

Append to `test/core.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/core.test.js`
Expected: FAIL — `TypeError: core.normalizeKey is not a function`

- [ ] **Step 3: Implement the matcher in `core.js`**

Insert before the `const core = { ... }` export object:

```javascript
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
  for (const binding of bindings) {
    if ((binding.chord || null) !== (pending || null)) continue;
    if (bindingMatches(binding, e)) return binding;
  }
  return null;
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
```

Add to the `core` export object: `normalizeKey`, `modMatches`, `bindingMatches`, `matchBinding`, `activeBindings`, `accountBindings`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core.test.js`
Expected: PASS, all existing tests still green.

- [ ] **Step 5: Create `bindings.js` with the two existing shortcuts**

```javascript
// The shortcut table. Data only — the matching logic lives in core.js and the
// actions in content.js. Adding a shortcut means adding a row here.
//
// action names: 'account' | 'cycleTab' | 'nav' | 'key' | 'click' | 'copyLink'
// optIn: true means the binding costs a Gmail native and stays off until
// config.enabled names its id.

globalThis.GSK_BINDINGS = [
  { id: 'tabNext', key: 'Tab', action: 'cycleTab', arg: 1 },
  { id: 'tabPrev', key: 'Tab', shift: true, action: 'cycleTab', arg: -1 },
];
```

- [ ] **Step 6: Load `bindings.js` in `manifest.json`**

Change the `js` array to:

```json
"js": ["config.js", "core.js", "bindings.js", "content.js"],
```

- [ ] **Step 7: Replace the keydown handler in `content.js`**

Replace the whole `window.addEventListener('keydown', ...)` block with:

```javascript
  const ACTIONS = {
    account: (arg) => switchAccount(arg),
    cycleTab: (arg) => cycleTab(arg),
  };

  const bindings = core.activeBindings(
    [...core.accountBindings((config.accounts || []).length), ...(globalThis.GSK_BINDINGS || [])],
    config
  );

  function run(binding) {
    const action = ACTIONS[binding.action];
    if (!action) { log('no action for', binding.id); return false; }
    return action(binding.arg) === true;
  }

  // Capture phase: Gmail binds its own handlers on the document, so we have to
  // see the event first to claim it.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (core.shouldIgnore(e.target)) return;

    const binding = core.matchBinding(e, bindings);
    if (!binding) return;
    if (run(binding)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
```

- [ ] **Step 8: Verify by hand in Gmail**

Reload the extension at `chrome://extensions`, reload Gmail. Confirm `Tab` / `Shift+Tab` still cycle inbox tabs and `Ctrl+1` / `Ctrl+2` still switch accounts. Confirm Tab still moves focus normally inside compose.

- [ ] **Step 9: Commit**

```bash
git add core.js bindings.js content.js manifest.json test/core.test.js
git commit -m "Move shortcuts onto a declarative binding table"
```

---

## Task 2: Chord prefix support

Superhuman's folder shortcuts are `g` followed by a second key. Gmail has its own `g` chords, and both state machines have to coexist: we never `preventDefault` the `g` itself, so Gmail keeps its prefix too. That works only because every leaf we claim (`e`, `m`, `h`, `!`, `#`) is unbound in Gmail's `g` menu — a constraint that must hold for any future addition.

**Files:**
- Modify: `core.js` (add `isChordPrefix` to the key-bindings section)
- Modify: `content.js` (chord state in the keydown handler)
- Modify: `test/core.test.js` (append)

**Interfaces:**
- Consumes: `core.matchBinding`, `core.normalizeKey` from Task 1.
- Produces: `core.isChordPrefix(event, bindings) -> boolean`, and `CHORD_TIMEOUT_MS` in `content.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/core.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/core.test.js`
Expected: FAIL — `TypeError: core.isChordPrefix is not a function`

- [ ] **Step 3: Implement `isChordPrefix` in `core.js`**

Add to the key-bindings section:

```javascript
// True when this keypress opens a chord some binding is waiting under. A
// modifier rules it out: Ctrl+G belongs to whatever else has claimed it.
function isChordPrefix(e, bindings) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const pressed = normalizeKey(e.key);
  return (bindings || []).some((b) => b.chord && normalizeKey(b.chord) === pressed);
}
```

Add `isChordPrefix` to the `core` export object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 5: Add chord state to the `content.js` handler**

Replace the keydown listener written in Task 1 with:

```javascript
  // How long a `g` stays armed. Gmail's own chord window is comparable; long
  // enough to be typed deliberately, short enough that a stray g does not
  // swallow the next keystroke.
  const CHORD_TIMEOUT_MS = 1500;

  let pending = null;
  let pendingTimer = null;

  function clearPending() {
    pending = null;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  }

  function armPending(prefix) {
    clearPending();
    pending = prefix;
    pendingTimer = setTimeout(clearPending, CHORD_TIMEOUT_MS);
  }

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (core.shouldIgnore(e.target)) return;

    const binding = core.matchBinding(e, bindings, pending);
    if (binding) {
      clearPending();
      if (run(binding)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // A second key we do not claim ends our chord and falls through, so Gmail's
    // own g+i, g+s and friends still land.
    if (pending) { clearPending(); return; }

    // Never preventDefault the prefix itself: Gmail is arming its own chord on
    // the same keypress, and we only claim leaves Gmail leaves free.
    if (core.isChordPrefix(e, bindings)) armPending(core.normalizeKey(e.key));
  }, true);
```

- [ ] **Step 6: Verify by hand in Gmail**

Reload the extension and Gmail. With no chord bindings registered yet, confirm Gmail's own `g` `i` and `g` `s` still work, and that `Tab` and `Ctrl+1` are unaffected.

- [ ] **Step 7: Commit**

```bash
git add core.js content.js test/core.test.js
git commit -m "Add chord prefix support alongside Gmail's own g-chords"
```

---

## Task 3: Missing folder navigations

The first real shortcuts. All five are hash navigations, the lowest-risk mechanism in the plan — no DOM, no synthesis, nothing that can mutate mail. `in:archive` and `is:muted` are documented Gmail search operators; `#spam`, `#trash` and `#snoozed` are real Gmail routes.

**Files:**
- Modify: `bindings.js`
- Modify: `content.js` (add the `nav` action)

**Interfaces:**
- Consumes: the binding table and chord machinery from Tasks 1-2.
- Produces: the `nav` action, which assigns `window.location.hash` and returns `true`.

- [ ] **Step 1: Add the `nav` action to `content.js`**

Extend the `ACTIONS` table:

```javascript
  const ACTIONS = {
    account: (arg) => switchAccount(arg),
    cycleTab: (arg) => cycleTab(arg),
    nav: (arg) => {
      if (!arg) return false;
      log('nav ->', arg);
      window.location.hash = arg;
      return true;
    },
  };
```

- [ ] **Step 2: Add the five bindings to `bindings.js`**

Append to the `GSK_BINDINGS` array:

```javascript
  // Superhuman's folder chords that Gmail has no equivalent for. Gmail already
  // binds g+i, g+s, g+t, g+d, g+a and g+l; every leaf claimed here is one Gmail
  // leaves free, which is what lets both chord machines run at once.
  //
  // Done is Gmail's archive: same operation, both just drop the INBOX label.
  // Gmail has no Done folder, but in:archive is a documented search operator.
  { id: 'goDone', key: 'e', chord: 'g', action: 'nav', arg: '#search/in%3Aarchive' },
  { id: 'goMuted', key: 'm', chord: 'g', action: 'nav', arg: '#search/is%3Amuted' },
  // Superhuman's Reminders are Gmail's Snoozed. Gmail binds this on g+b.
  { id: 'goReminders', key: 'h', chord: 'g', action: 'nav', arg: '#snoozed' },
  // Shifted punctuation: e.key is already '!' or '#', so shift is 'any' rather
  // than being asserted twice.
  { id: 'goSpam', key: '!', shift: 'any', chord: 'g', action: 'nav', arg: '#spam' },
  { id: 'goTrash', key: '#', shift: 'any', chord: 'g', action: 'nav', arg: '#trash' },
```

- [ ] **Step 3: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS — no logic changed, this confirms nothing regressed.

- [ ] **Step 4: Verify each binding by hand in Gmail**

Reload the extension and Gmail. From the thread list press, in turn: `g` `e` (archived mail), `g` `m` (muted), `g` `h` (snoozed), `g` `!` (spam), `g` `#` (trash). Then confirm Gmail's own `g` `i`, `g` `s`, `g` `t`, `g` `d`, `g` `a` still work. Finally press `g`, wait three seconds, then press `e` — it should *not* navigate, confirming the chord times out.

- [ ] **Step 5: Commit**

```bash
git add bindings.js content.js
git commit -m "Add g-chords for Done, Muted, Reminders, Spam and Trash"
```

---

## Task 4: Filter views

Same mechanism as Task 3, but a separate gate: two of these three cost a Gmail native (`Shift+U` is mark-as-unread, `Shift+I` is mark-as-read), so they ship `optIn`. A reviewer could reasonably take Task 3 and refuse this one.

**Files:**
- Modify: `bindings.js`
- Modify: `config.example.js`, `config.js`

**Interfaces:**
- Consumes: `nav` from Task 3, `activeBindings` from Task 1.

- [ ] **Step 1: Add the three bindings to `bindings.js`**

```javascript
  // Superhuman's filters narrow the current view; Gmail's nearest equivalent is
  // a search. All three are opt-in because Shift+U and Shift+I are Gmail's
  // mark-as-unread and mark-as-read, and losing those silently would be rude.
  // Superhuman's Shift+R (no reply) has no Gmail operator behind it and is
  // deliberately absent.
  { id: 'filterUnread', key: 'u', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Aunread' },
  { id: 'filterStarred', key: 's', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Astarred' },
  { id: 'filterImportant', key: 'i', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Aimportant' },
```

- [ ] **Step 2: Document the config surface in `config.example.js`**

Append inside the `GSK_CONFIG` object, before `debug`:

```javascript
  // Shortcuts that would cost you a Gmail native are off until you name them
  // here. Full list of ids in README.md.
  //
  //   enabled: ['filterUnread', 'filterStarred', 'filterImportant'],
  //
  // Note that filterUnread and filterImportant take over Shift+U and Shift+I,
  // which are Gmail's mark-as-unread and mark-as-read.
  enabled: [],

  // Turn off anything shipped on by default, by id.
  disabled: [],
```

- [ ] **Step 3: Mirror the same two keys into `config.js`**

`config.js` is gitignored and holds the real addresses, so it has to be edited separately or the extension will run with `enabled` undefined. `activeBindings` already tolerates that, but keeping the two files in step avoids confusion later. Add `enabled: []` and `disabled: []` to `config.js` as well.

- [ ] **Step 4: Verify by hand in Gmail**

Reload with `enabled: []` and confirm `Shift+U` still marks unread — the binding is inert. Then set `enabled: ['filterUnread', 'filterStarred', 'filterImportant']`, reload the extension and Gmail, and confirm all three now navigate to the filtered search instead.

- [ ] **Step 5: Commit**

```bash
git add bindings.js config.example.js
git commit -m "Add opt-in filter views for unread, starred and important"
```

---

## Task 5: Copy conversation link

Standalone and cheap. `Ctrl+/` is unbound in both Gmail and Chrome, and the conversation permalink is already in `location.href` when a thread is open — no DOM, no synthesis.

**Files:**
- Modify: `bindings.js`
- Modify: `content.js` (add the `copyLink` action)

**Interfaces:**
- Produces: the `copyLink` action.

- [ ] **Step 1: Add the action to `content.js`**

Extend `ACTIONS`:

```javascript
    // Gmail already puts the conversation permalink in the URL, so there is
    // nothing to look up. The clipboard write is async but the binding is
    // claimed synchronously: reporting success here means "this keystroke was
    // ours", not "the clipboard is written".
    copyLink: () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url)
        .then(() => log('copied', url))
        .catch((err) => log('clipboard refused:', err && err.message));
      return true;
    },
```

- [ ] **Step 2: Add the binding to `bindings.js`**

```javascript
  { id: 'copyLink', key: '/', ctrl: true, action: 'copyLink' },
```

- [ ] **Step 3: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 4: Verify by hand in Gmail**

Reload. Open a conversation, press `Ctrl+/`, and paste into the address bar — it should be the thread's URL. With `debug: true` in config, confirm the console logs `copied`. Note that the Clipboard API needs the document focused; if it logs `clipboard refused`, click the page first and retry.

- [ ] **Step 5: Commit**

```bash
git add bindings.js content.js
git commit -m "Add Ctrl+/ to copy the conversation link"
```

---

## Task 6: Keystroke synthesis and additive rebinds

**Task 0 cleared this.** Gmail acts on synthetic keydown at `document.body`, reading `e.key`, with no `isTrusted` check and no need to pin `keyCode`.

`h` and `Shift+M` are the two rebinds that cost nothing — both keys are unbound in Gmail — so they ship enabled and prove the mechanism before the contentious ones ride on it.

**Files:**
- Modify: `content.js` (add `sendKey` and the `key` action)
- Modify: `bindings.js`

**Interfaces:**
- Consumes: the `document.body` target measured in Task 0.
- Produces: the `key` action, whose `arg` is `{ key, shift? }`.

- [ ] **Step 1: Add keystroke synthesis to `content.js`**

Insert above the `ACTIONS` table:

```javascript
  // Fire one of Gmail's own shortcuts. Gmail reads e.key and does not check
  // isTrusted, so a plain KeyboardEvent at document.body is enough -- measured
  // 2026-09-09 for both a plain letter chord and shifted punctuation. Rerun
  // diag/inspect-keys.js if the rebinds ever stop working; if Gmail has gone
  // back to reading keyCode, that script's pinned trials will say so.
  function sendKey(spec) {
    if (!spec || !spec.key) return false;
    log('sendKey ->', spec.key);
    for (const type of ['keydown', 'keypress', 'keyup']) {
      document.body.dispatchEvent(new KeyboardEvent(type, {
        key: spec.key,
        bubbles: true,
        cancelable: true,
        shiftKey: !!spec.shift,
      }));
    }
    return true;
  }
```

Extend `ACTIONS` with `key: (arg) => sendKey(arg),`.

- [ ] **Step 2: Add the two bindings to `bindings.js`**

```javascript
  // Rebinds that cost nothing: h and Shift+M are unbound in Gmail, so these are
  // additive and Gmail's own b and m keep working underneath.
  { id: 'snooze', key: 'h', action: 'key', arg: { key: 'b' } },
  { id: 'mute', key: 'm', shift: true, action: 'key', arg: { key: 'm' } },
```

- [ ] **Step 3: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 4: Verify by hand in Gmail**

Reload. In the thread list, select a conversation and press `h` — Gmail's snooze menu should open. Press Escape, then press `Shift+M` — the conversation should be muted. Confirm Gmail's own `b` and `m` still work. Undo both with `z`.

- [ ] **Step 5: Commit**

```bash
git add bindings.js content.js
git commit -m "Add keystroke synthesis with h to snooze and Shift+M to mute"
```

---

## Task 7: Conflicting rebinds

Every binding here takes a key Gmail already uses, so all five are `optIn`. `readToggle` needs to know whether the focused conversation is currently read, and it can: measured 2026-09-09, Gmail marks unread rows `tr.zA.zE` and read rows `tr.zA.yO`, and the two partition the thread list exactly. It therefore fires `Shift+i` on an unread row and `Shift+u` on a read one, which is a real toggle rather than the mark-unread-only simplification an earlier draft settled for.

This binding is what makes Task 4's filters safe to enable: `filterImportant` takes Gmail's `Shift+I` (mark as read), and without a working toggle there would be no way to mark a conversation read at all. If Task 4 ships enabled before this lands, that gap is live in between.

**Files:**
- Modify: `bindings.js`
- Modify: `README.md` (binding id list — completed in Task 10)

**Interfaces:**
- Consumes: `sendKey` and the `key` action from Task 6.

- [ ] **Step 1: Add the bindings to `bindings.js`**

```javascript
  // Rebinds that each take a key Gmail already uses. All opt-in; the comment on
  // each says what it costs.
  //
  // Enter opens a conversation in Gmail. Gmail's o still opens, so the loss is
  // survivable, but it is a real one.
  { id: 'replyAll', key: 'Enter', optIn: true, action: 'key', arg: { key: 'a' } },
  // Costs Gmail's u (back to the thread list) -- pair this with backToList
  // below, which is what Superhuman puts on Escape.
  //
  // Superhuman's u toggles, and it genuinely toggles here. MEASURED
  // 2026-09-09: Gmail marks unread rows tr.zA.zE and read rows tr.zA.yO, and
  // the two classes partition the thread list exactly (33 + 17 = 50 rows), so
  // read state IS legible from the DOM -- an earlier draft of this plan
  // asserted it was not and settled for mark-unread only. document.activeElement
  // is the focused row itself, so its class is the state to read.
  //
  // This is what frees Shift+U and Shift+I for the Task 4 filters: without a
  // working toggle, enabling filterImportant would leave no way to mark read
  // at all.
  { id: 'readToggle', key: 'u', optIn: true, action: 'readToggle' },
  // Escape is unbound in Gmail's thread list, so this costs nothing on its own
  // -- it exists to give back what markUnread takes away.
  { id: 'backToList', key: 'Escape', optIn: true, action: 'key', arg: { key: 'u' } },
  // Costs Gmail's o (open conversation). Enter still opens unless replyAll is
  // also enabled, so think before turning both on.
  { id: 'expandMessage', key: 'o', optIn: true, action: 'key', arg: { key: ';' } },
  { id: 'expandAll', key: 'o', shift: true, optIn: true, action: 'key', arg: { key: ';' } },
```

- [ ] **Step 2: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 3: Verify by hand in Gmail**

Reload with these ids absent from `enabled` and confirm Gmail's `Enter`, `u` and `o` behave normally. Then add all five to `enabled`, reload the extension and Gmail, and check each: `Enter` on a selected conversation opens a reply-all draft; `u` marks it unread; `Escape` returns to the thread list from an open conversation; `o` expands the message. Turn off any that do not earn their cost.

- [ ] **Step 4: Commit**

```bash
git add bindings.js
git commit -m "Add opt-in rebinds for reply-all, unread, back, and expand"
```

---

## Task 8: Pop-out rebinds

Both keys are free in Gmail — `Shift+Enter` and `Shift+C` are unbound — so these are additive and ship enabled.

**Files:**
- Modify: `bindings.js`

**Interfaces:**
- Consumes: the `key` action from Task 6.

- [ ] **Step 1: Add the bindings to `bindings.js`**

```javascript
  // Superhuman's pop-out variants. Gmail already binds Shift+R and Shift+F to
  // reply and forward in a new window, which match Superhuman exactly; only
  // these two need moving, and both keys are free in Gmail.
  { id: 'popReplyAll', key: 'Enter', shift: true, action: 'key', arg: { key: 'a', shift: true } },
  { id: 'popCompose', key: 'c', shift: true, action: 'key', arg: { key: 'd' } },
```

- [ ] **Step 2: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 3: Verify by hand in Gmail**

Reload. On an open conversation press `Shift+Enter` — a reply-all should open in a new window. From the thread list press `Shift+C` — compose should open in a new tab. Confirm Gmail's `Shift+R` and `Shift+F` are untouched. Discard both drafts.

- [ ] **Step 4: Commit**

```bash
git add bindings.js
git commit -m "Add Shift+Enter and Shift+C pop-out shortcuts"
```

---

## Task 9: Mark not done

The only mutation in this plan that has no Gmail keystroke behind it. Marking not done re-adds the `INBOX` label, and Gmail exposes that only as a toolbar control, so this is the one binding that reads the DOM. It goes last because it is the most brittle.

Two approaches were considered. Driving Gmail's move-to menu (`v`, type "Inbox", Enter) needs no selectors but depends on menu ordering and breaks under a non-English UI — and its failure mode is filing mail under the wrong label. Activating the toolbar button needs a selector but fails loudly by doing nothing. Take the button: a mutation that silently mislabels is worse than one that no-ops.

**Files:**
- Create: `diag/inspect-toolbar.js`
- Modify: `content.js` (add `clickControl` and the `click` action)
- Modify: `bindings.js`

**Interfaces:**
- Produces: the `click` action, whose `arg` is a CSS selector, reusing `core.activate` from the existing tab code.

- [ ] **Step 1: Write the diagnostic**

```javascript
// Paste into the Gmail console while viewing archived mail (g+e, or the
// in:archive search) with one conversation selected. Reports how Gmail's
// "Move to Inbox" control is built and whether it responds to a plain click or
// needs the mousedown sequence the inbox tabs did. Observes only -- it clicks
// nothing.
(() => {
  const candidates = [...document.querySelectorAll(
    '[aria-label], [data-tooltip], [role="button"]'
  )].filter((el) => {
    const text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''}`;
    return /move to inbox/i.test(text);
  });

  console.log('=== matches:', candidates.length);
  candidates.forEach((el, i) => {
    const { width, height } = el.getBoundingClientRect();
    console.log(`[${i}]`, {
      tag: el.tagName,
      ariaLabel: el.getAttribute('aria-label'),
      tooltip: el.getAttribute('data-tooltip'),
      role: el.getAttribute('role'),
      jsaction: el.getAttribute('jsaction'),
      cls: (el.className || '').toString().slice(0, 60),
      visible: width > 0 && height > 0,
    });
  });

  if (!candidates.length) {
    console.log('=== nothing matched. Is a conversation selected, in a view ' +
      'where Move to Inbox applies (archived mail, not the inbox)?');
  }
})();
```

- [ ] **Step 2: Run it in Gmail and record the finding**

Navigate to archived mail, select a conversation, paste the script. Expected: one visible match, reporting whether it carries a `jsaction` (which would mean a plain `click()` suffices) or is a bare Closure control (which would need the `mousedown` sequence). Write the result into the script's header comment, as Task 0 did.

- [ ] **Step 3: Add `clickControl` to `content.js`**

Insert above the `ACTIONS` table:

```javascript
  // Activate one of Gmail's own toolbar controls. Reuses core.activate, which
  // fires mousedown -> mouseup -> click: Gmail's controls are Closure and
  // activate on mousedown, so a bare el.click() can dispatch into nothing.
  // Returns false when the control is absent, which is the honest answer --
  // "Move to Inbox" does not exist while you are looking at the inbox.
  function clickControl(selector) {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!el || !el.getBoundingClientRect().width) {
      log('control not present:', selector);
      return false;
    }
    log('activate control ->', selector);
    return core.activate(el, (type) => new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0,
    }));
  }
```

Extend `ACTIONS` with `click: (arg) => clickControl(arg),`.

- [ ] **Step 4: Add the binding to `bindings.js`**

Use whichever selector Step 2 measured; the `aria-label` form below is the expected shape.

```javascript
  // Superhuman's Mark Not Done. Gmail's archive and Superhuman's Done are the
  // same operation -- both drop the INBOX label -- so undoing it means re-adding
  // that label, which Gmail exposes only as a toolbar control. Selector
  // established by diag/inspect-toolbar.js.
  //
  // Returning false when the control is absent means the keypress falls through
  // to Gmail rather than being swallowed, which is what you want in the inbox
  // where there is nothing to un-archive.
  { id: 'markNotDone', key: 'e', shift: true, action: 'click', arg: '[aria-label="Move to Inbox"]' },
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/core.test.js`
Expected: PASS

- [ ] **Step 6: Verify by hand in Gmail**

Reload. Archive a test conversation with `e`, go to archived mail with `g` `e`, select it, and press `Shift+E` — it should return to the inbox. Then, from the inbox, press `Shift+E` and confirm nothing happens and no error appears in the console.

- [ ] **Step 7: Commit**

```bash
git add diag/inspect-toolbar.js bindings.js content.js
git commit -m "Add Shift+E to mark a conversation not done"
```

---

## Task 10: Documentation

**Files:**
- Modify: `README.md`
- Modify: `config.example.js`

- [ ] **Step 1: Replace the shortcut table in `README.md`**

Replace the two-row table under the title with a table covering every binding, grouped as: on by default, and opt-in. Include the binding `id` for each row — the ids are the config surface, and they are currently undiscoverable without reading `bindings.js`.

- [ ] **Step 2: Add a "Configure" subsection for `enabled` / `disabled`**

Explain that opt-in bindings cost a Gmail native, that each is listed with what it costs, and that `disabled` turns off anything shipped on by default. Keep the existing `accounts`, `tabs` and `debug` entries.

- [ ] **Step 3: Extend "Worth knowing"**

Add three notes, in the register of the existing ones:

- Done is Gmail's archive. Both drop the `INBOX` label; there is no separate Done state, and `g` `e` is a saved search rather than a folder.
- The chord bindings never `preventDefault` the `g`, so Gmail's own `g` chords keep working. This holds only because every leaf claimed is one Gmail leaves free — check that before adding another.
- Rebinds work by dispatching Gmail's own keystroke as a plain `KeyboardEvent` at `document.body`. Gmail reads `e.key` and does not check `isTrusted`, so nothing beyond `key` and `shiftKey` needs setting — measured 2026-09-09 for both a plain letter and shifted punctuation. `diag/inspect-keys.js` is the script that established this; rerun it if the rebinds ever stop working.

- [ ] **Step 4: Note the compose gap**

Add a short paragraph recording that Superhuman's compose-window shortcuts are deliberately absent, because `shouldIgnore` exempts compose entirely and inverting that guard is its own piece of work.

- [ ] **Step 5: Commit**

```bash
git add README.md config.example.js
git commit -m "Document the full shortcut set and the enabled/disabled config"
```

---

## Follow-on: compose-context bindings

Not in this plan. Superhuman's `Cmd+Shift+O/S/M/A/,/I/H/L`, `Cmd+U` unsubscribe and `Cmd+Shift+Enter` send-and-done all fire inside a compose window, where `shouldIgnore` currently returns `true` for everything — the guard that keeps Tab moving between To/Subject/Body and Tab+Enter sending. Adding them means replacing a blanket exemption with a per-binding one, which changes the risk profile of every existing shortcut. That earns its own plan, written once this one has landed and the binding table has proven itself.

---

## Self-Review

**Spec coverage.** Every in-scope row of the Shortcut Inventory maps to a task: folder navs → Task 3; filters → Task 4; additive rebinds → Task 6; conflicting rebinds → Task 7; pop-outs → Task 8; copy link → Task 5; mark not done → Task 9. Out-of-scope items are listed with reasons, and the compose set is carried into a named follow-on rather than dropped.

**Placeholders.** No TBDs. The one value that cannot be written in advance is the `markNotDone` selector in Task 9, which is why Task 9's first two steps are the diagnostic that measures it, with the expected shape given.

**Type consistency.** The binding shape `{ id, key, shift?, ctrl?, meta?, alt?, chord?, optIn?, action, arg? }` is used identically in Tasks 1-9. `ACTIONS` keys (`account`, `cycleTab`, `nav`, `key`, `click`, `copyLink`) match the `action` values in `bindings.js` throughout. `core.activate`, `core.shouldIgnore` and `core.normalizeKey` keep their existing signatures.

**Ordering risk.** Task 0 gates Tasks 6-8. Task 1 is a no-behaviour-change refactor over known-working shortcuts, so a broken matcher surfaces before anything depends on it. Tasks 3-5 need no synthesis and would still ship if Task 0 came back negative.
