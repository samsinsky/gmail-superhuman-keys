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

  // Actions a binding can name. content.js owns these because every one of them
  // touches the page; core.js only decides which binding a keypress matched.
  const ACTIONS = {
    account: (arg) => switchAccount(arg),
    cycleTab: (arg) => cycleTab(arg),
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
    return action(binding.arg) === true;
  }

  // Capture phase: Gmail binds its own handlers on the document, so we have to
  // see the event first to claim it.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (core.shouldIgnore(e.target)) return;

    const binding = core.matchBinding(e, bindings);
    if (!binding) return;

    // Only swallow the keypress if the action actually did something. A binding
    // that declines (no account in that slot, one tab to cycle) hands the key
    // back to Gmail rather than eating it.
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
