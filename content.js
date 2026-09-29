// Wiring: read Gmail's DOM, listen for keys, drive Gmail's own tab bar. All the
// decisions live in core.js, which is unit-tested; this file stays dumb.

(() => {
  const core = globalThis.GSK_CORE;
  const config = globalThis.GSK_CONFIG || {};
  const log = (...args) => { if (config.debug) console.log('[gsk]', ...args); };

  // Gmail's inbox tabs render as role="tab". Read them live, keeping the
  // element alongside the label so we can click the real thing rather than
  // route to a URL.
  function liveTabs() {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[role="tab"]')) {
      const word = core.labelWord(el.getAttribute('aria-label') || el.textContent);
      const hash = core.CATEGORY_HASHES[word];
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      out.push({ label: word[0].toUpperCase() + word.slice(1), hash, el });
    }
    return out;
  }

  function selectedLabel() {
    const el = document.querySelector('[role="tab"][aria-selected="true"]');
    return el ? (el.getAttribute('aria-label') || el.textContent) : null;
  }

  // Detection needs the tab bar rendered, which it is not while reading a
  // thread or viewing Sent. Cache the last good read so cycling still works
  // from those views, falling back to hash navigation there.
  let cached = [];
  function tabs() {
    const live = liveTabs();
    if (live.length) {
      // An explicit config list narrows the cycle to a subset, in its order.
      if (Array.isArray(config.tabs)) {
        const want = config.tabs.map(core.labelWord);
        const picked = want
          .map((w) => live.find((t) => core.labelWord(t.label) === w))
          .filter(Boolean);
        if (picked.length) { cached = picked; return picked; }
      }
      cached = live;
      log('tabs:', live.map((t) => t.label).join(' > '));
    }
    return cached;
  }

  function switchAccount(n) {
    const email = (config.accounts || [])[n - 1];
    if (!email) return false;
    log('account ->', email);
    window.location.assign(core.accountUrl(email));
    return true;
  }

  function cycleTab(direction) {
    const list = tabs();
    const index = core.resolveIndex(selectedLabel(), window.location.hash, list);
    const next = core.stepIndex(index, direction, list.length);
    if (next === -1) return false;

    const target = list[next];
    // Prefer Gmail's own tab: it switches in place, keeps the view mounted and
    // does not re-run a query. Only fall back to routing when the tab bar is
    // not on screen (reading a thread, viewing a label) and there is nothing
    // to click.
    const el = target.el && target.el.isConnected
      ? target.el
      : liveTabs().find((t) => t.hash === target.hash)?.el;

    if (el) {
      log('activate ->', target.label);
      core.activate(el, (type) => new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window, button: 0,
      }));
    } else {
      log('route ->', target.hash, '(tab bar not present)');
      window.location.hash = target.hash;
    }
    return true;
  }

  // Gmail's own actions -- keyboard and toolbar alike -- act on checked
  // conversations and ignore both the mouse and the keyboard cursor. Superhuman
  // acts on whatever is focused, so to get that feel we tick a box first. The
  // mouse position is tracked here because Gmail does not expose it: with no
  // keyboard cursor, the hovered row is what a Superhuman user means by "this
  // conversation".
  let hoveredRow = null;
  document.addEventListener('mouseover', (e) => {
    const row = e.target && e.target.closest && e.target.closest('tr.zA');
    if (row) hoveredRow = row;
  }, true);

  // Checked rows carry x7 and the cursor row carries btb -- measured against the
  // live list, where the rows expose no aria-selected at all.
  function ensureTarget() {
    const target = core.pickTarget({
      checked: document.querySelector('tr.zA.x7'),
      hovered: hoveredRow && hoveredRow.isConnected ? hoveredRow : null,
      // Only the list on screen: Gmail keeps the lists of views you have left
      // in the DOM, and now that the cursor outranks the mouse a stale one
      // would steal the action.
      cursor: [...document.querySelectorAll('tr.zA.btb')].find(onScreen) || null,
    });
    if (!target.row) { log('no conversation to act on'); return false; }
    if (!target.needsCheck) return true;

    return tickRow(target.row);
  }

  // Tick a row's checkbox. Gmail's checkbox toggles, so callers check x7 first
  // when they mean "make sure it is ticked".
  function tickRow(row) {
    const box = row.querySelector('[role="checkbox"]');
    if (!box) { log('row has no checkbox'); return false; }
    log('selecting', (row.querySelector('.bog') || {}).textContent);
    core.activate(box, (type) => new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0,
    }));
    return true;
  }

  // Gmail keeps the lists of views you have left in the DOM, hidden, so every
  // list query has to be narrowed to what is on screen. offsetParent survives a
  // backgrounded tab, where widths all read zero.
  const onScreen = (el) => !!el && el.offsetParent !== null;

  // Anything that could be a control. Gmail labels some of these with a role
  // and leaves others as bare spans -- the Unsubscribe in a thread carries
  // role=link, the one on a list row carries nothing at all -- so the net is
  // cast wide and the label narrows it.
  const CONTROL_SELECTOR = '[role="link"], [role="button"], a, button, span';

  const controlsIn = (el) => [...el.querySelectorAll(CONTROL_SELECTOR)];

  // The element's own words, not its descendants'. Every ancestor of a control
  // contains the control's text, so textContent matches a whole message header
  // as readily as the link inside it.
  const ownText = (el) => [...el.childNodes]
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent)
    .join('');

  function activateControl(el, label) {
    if (!el) { log('no control saying', label); return false; }
    log('activate control ->', label);
    return core.activate(el, (type) => new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0,
    }));
  }

  // Fire one of Gmail's own shortcuts. Gmail reads e.key and does not check
  // isTrusted, so a plain KeyboardEvent at document.body is enough -- measured
  // 2026-09-09 for both a plain letter and shifted punctuation, with and
  // without keyCode pinned. diag/inspect-keys.js is the script that established
  // it; rerun that if the rebinds ever stop working.
  // Is a conversation open, as opposed to the thread list? Measured against live
  // Gmail: the message container .adn is present with a conversation open and
  // absent in the list, while tr.zA rows persist in both -- so row presence
  // cannot be used for this.
  //
  // This is what lets Enter and o keep Gmail's meaning in the list (open the
  // conversation) while taking Superhuman's meaning inside one (reply all,
  // expand). Superhuman's own Enter is context-dependent in exactly this way.
  function threadOpen() {
    return !!document.querySelector('.adn');
  }

  // True while we are dispatching a keystroke of our own. dispatchEvent is
  // synchronous, so our listener re-enters during sendKey and would match the
  // very key it just fired. That is harmless while every binding maps one key to
  // a different one, but the pass-through bindings map a key to itself: without
  // this guard, e would tick a row, fire e, match again, and loop until the tab
  // died.
  let synthesizing = false;

  function sendKey(spec) {
    if (!spec || !spec.key) return false;
    const key = core.synthKey(spec);
    log('sendKey ->', (spec.shift ? 'Shift+' : '') + key);
    synthesizing = true;
    try {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        document.body.dispatchEvent(new KeyboardEvent(type, {
          key,
          bubbles: true,
          cancelable: true,
          shiftKey: !!spec.shift,
        }));
      }
    } finally {
      synthesizing = false;
    }
    return true;
  }

  // Activate one of Gmail's own toolbar controls. Reuses core.activate, which
  // fires mousedown -> mouseup -> click: Gmail's controls are Closure and
  // activate on mousedown, so a bare el.click() can dispatch into nothing. The
  // Move to Inbox control carries no jsaction, same as the inbox tabs did.
  //
  // Presence is the whole guard, and it is a sound one: measured against live
  // Gmail, Move to Inbox is absent from the DOM entirely in the inbox view even
  // with a conversation selected, and present in the archive view. Deliberately
  // no visibility check -- every toolbar button measures zero width in a
  // backgrounded tab, so that would fail for reasons unrelated to whether the
  // control applies.
  function clickControl(selector) {
    if (!selector) return false;
    const el = document.querySelector(selector);
    if (!el) { log('control not present:', selector); return false; }
    log('activate control ->', selector);
    return core.activate(el, (type) => new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0,
    }));
  }

  // Actions a binding can name. content.js owns these because every one of them
  // touches the page; core.js only decides which binding a keypress matched.
  const ACTIONS = {
    account: (arg) => switchAccount(arg),
    cycleTab: (arg) => cycleTab(arg),
    nav: (arg) => {
      if (!arg) return false;
      log('nav ->', arg);
      window.location.hash = arg;
      return true;
    },
    // The clipboard write is async but the binding is claimed synchronously:
    // returning true here means "this keystroke was ours", not "the clipboard
    // is written". The write needs the document focused and can be refused.
    key: (arg) => sendKey(arg),
    // Expand everything, or collapse it if nothing is left to expand. Gmail
    // marks a collapsed message with .kv or .kQ, and folds the middle of a long
    // thread into a .adx stack; measured against live threads, all three are
    // absent once a conversation is fully expanded.
    expandToggle: () => {
      const visible = (sel) => [...document.querySelectorAll(sel)]
        .some((el) => el.offsetParent !== null);
      const hasCollapsed = visible('.kv') || visible('.kQ') || visible('.adx');
      return sendKey(core.expandToggleSpec(hasCollapsed));
    },
    click: (arg) => clickControl(arg),
    // Unsubscribe, from an open conversation or straight from the list. Gmail
    // offers it in both places and names it the same way in both, so the label
    // is what this looks for rather than a class: Gmail's class names differ
    // between accounts and move with every rollout, and the first version of
    // this keyed on one (span.Ca) and found nothing. English-only, as the whole
    // extension is.
    //
    // Whichever it clicks, Gmail's own confirmation still stands in the way, so
    // the keypress alone unsubscribes from nothing.
    unsubscribe: (arg) => {
      const label = (arg && arg.text) || 'Unsubscribe';

      if (threadOpen()) {
        // The last message that offers it: a thread repeats the control once
        // per expanded message, and the newest is the one you mean.
        const hit = [...document.querySelectorAll('.adn')]
          .filter(onScreen)
          .flatMap(controlsIn)
          .filter((el) => onScreen(el) && core.saysExactly(ownText(el), label))
          .pop();
        return activateControl(hit, label);
      }

      // The focused row first, and the hovered one only when Gmail has no
      // cursor at all -- the same order pickTarget uses for every other list
      // binding.
      const row = [...document.querySelectorAll('tr.zA')].filter(onScreen).find((r) => r.classList.contains('btb'))
        || (onScreen(hoveredRow) ? hoveredRow : null);
      if (!row) { log('no conversation to unsubscribe from'); return false; }

      // In the list the control is painted only while the row is hovered, so
      // it is in the DOM but measures as off screen -- onScreen would reject
      // the very control we are after. Being inside the row we picked is the
      // guard here instead. The mouseover is what makes Gmail paint it, in case
      // the row was reached by keyboard.
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      const hit = controlsIn(row).find((el) => core.saysExactly(ownText(el), label));
      return activateControl(hit, label);
    },
    // Select all, or select none when everything is already selected. The
    // select-all checkbox is the one role=checkbox outside the rows.
    selectToggle: () => {
      const box = [...document.querySelectorAll('[role="checkbox"]')]
        .find((el) => onScreen(el) && !el.closest('tr.zA'));
      const specs = core.selectAllSpecs(box && box.getAttribute('aria-checked'));
      return specs.every(sendKey);
    },
    // Select or deselect the row the cursor is on, then move on, so holding
    // Shift and walking the arrows picks rows up on the way out and puts them
    // back on the way home. Gmail's checkbox is itself a toggle, so one click
    // covers both directions and nothing here needs to know which it did.
    //
    // No anchor, no remembered range: three earlier versions kept one and each
    // broke differently once a plain move, a re-render or a hand-ticked box got
    // between two presses. The row under the cursor is a fact on the page, and
    // reading it fresh every press is what makes this hold up.
    extendSelection: (dir) => {
      const rows = [...document.querySelectorAll('tr.zA')].filter(onScreen);
      if (!rows.length) { log('no list to extend in'); return false; }

      const cursorRow = rows.find((row) => row.classList.contains('btb'));
      const hovered = onScreen(hoveredRow) ? hoveredRow : null;
      const at = core.rowToToggle(rows.length, rows.indexOf(cursorRow || hovered), dir);
      if (!tickRow(rows[at])) return false;

      // Ticking a box moves Gmail's cursor onto that row, so this is the step
      // from the row just taken to the next one. Nothing depends on the key
      // landing: the selection is already made, and Gmail acts on ticked boxes
      // rather than on the cursor.
      sendKey({ key: dir > 0 ? 'j' : 'k' });
      return true;
    },
    // Superhuman's u toggles read state, so which Gmail shortcut to fire
    // depends on where the conversation currently is. Gmail acts on checked
    // conversations when there are any, otherwise on the row under the cursor,
    // so read the state from whichever it will act on. With a conversation
    // open there is no row at all, and it has necessarily been read, so
    // mark-unread is the only direction that makes sense.
    readToggle: () => {
      // A checked row carries x7 and the cursor row carries btb. Measured
      // against the live list: checking a conversation adds x7, and the rows
      // expose no aria-selected at all.
      const checked = document.querySelector('tr.zA.x7');
      const row = checked || document.querySelector('tr.zA.btb');
      if (!row) return sendKey(core.readToggleSpec(false));
      return sendKey(core.readToggleSpec(core.isUnreadRow(row)));
    },
    copyLink: () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url)
        .then(() => log('copied', url))
        .catch((err) => log('clipboard refused:', err && err.message));
      return true;
    },
  };

  // Ctrl+1..9 is generated from however many accounts are configured, so an
  // unconfigured slot never claims a keypress it cannot act on.
  const bindings = core.activeBindings(
    [
      ...core.accountBindings((config.accounts || []).length),
      ...(globalThis.GSK_BINDINGS || []),
    ],
    config
  );

  function run(binding) {
    const action = ACTIONS[binding.action];
    if (!action) { log('no action for', binding.id); return false; }
    // Bindings that act on a conversation need one checked first, or Gmail
    // quietly does nothing. Refusing here hands the key back rather than
    // firing a bulk action at whatever Gmail felt like.
    // Bindings that only mean something inside an open conversation hand the
    // key back in the list, where Gmail's own meaning is the one we want.
    if (binding.requiresThread && !threadOpen()) { log('no conversation open'); return false; }
    if (binding.requiresList && threadOpen()) { log('conversation open'); return false; }
    if (binding.needsTarget && !ensureTarget()) return false;
    return action(binding.arg) === true;
  }

  // How long a `g` stays armed. Long enough to be typed deliberately, short
  // enough that a stray g does not swallow the next keystroke.
  const CHORD_TIMEOUT_MS = 1500;

  let pending = null;
  let pendingTimer = null;

  // Whether a prefix is armed is core.resolveKey's decision; this only holds it
  // and expires it.
  function setPending(next) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    pending = next;
    if (next) pendingTimer = setTimeout(() => { pending = null; pendingTimer = null; }, CHORD_TIMEOUT_MS);
  }

  // Capture phase: Gmail binds its own handlers on the document, so we have to
  // see the event first to claim it.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (synthesizing) return;
    if (core.shouldIgnore(e.target)) return;

    const { binding, pending: next } = core.resolveKey(e, bindings, pending);
    if (next !== pending) setPending(next);

    if (!binding) return;

    // Only swallow the keypress if the action actually did something. A binding
    // that declines (no account in that slot, one tab to cycle, a control that
    // is not on screen) hands the key back to Gmail rather than eating it.
    if (run(binding)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Warm the cache once the tab bar has rendered.
  const warm = () => { if (!cached.length) tabs(); };
  warm();
  window.addEventListener('hashchange', warm);
  setTimeout(warm, 2000);

  log('ready,', bindings.length, 'bindings,', (config.accounts || []).length, 'accounts');
})();
