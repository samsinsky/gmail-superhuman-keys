// Paste into the Gmail console. Observes only, then runs ONE experiment on a
// non-active tab. Reports whether each event type moves aria-selected.
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  console.log('=== structure ===', tabs.length, 'tabs');
  tabs.forEach((el, i) => {
    const chain = [];
    for (let n = el; n && chain.length < 5; n = n.parentElement) {
      chain.push(`${n.tagName}.${(n.className || '').toString().slice(0, 30)}` +
        (n.getAttribute('jsaction') ? ` jsaction=${n.getAttribute('jsaction').slice(0, 60)}` : ''));
    }
    console.log(`[${i}]`, {
      label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20),
      selected: el.getAttribute('aria-selected'),
      tag: el.tagName,
      cls: (el.className || '').toString(),
      jsaction: el.getAttribute('jsaction'),
      hasAnchor: !!el.querySelector('a[href]'),
      anchorHref: el.querySelector('a[href]')?.getAttribute('href'),
      rect: (({ width, height }) => ({ width, height }))(el.getBoundingClientRect()),
      chain,
    });
  });

  const active = () => document.querySelector('[role="tab"][aria-selected="true"]');
  const activeLabel = () => (active()?.getAttribute('aria-label') || active()?.textContent || '?').trim().slice(0, 20);
  const target = tabs.find((t) => t.getAttribute('aria-selected') !== 'true');
  if (!target) return console.log('no non-active tab to test against');

  const fire = (el, type) => el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window, button: 0,
  }));

  const trial = async (name, fn) => {
    const before = activeLabel();
    fn();
    await new Promise((r) => setTimeout(r, 600));
    const after = activeLabel();
    console.log(`=== ${name}: ${before} -> ${after} ${before !== after ? 'WORKED' : 'no effect'}`);
    return before !== after;
  };

  (async () => {
    console.log('=== experiment: target =', (target.getAttribute('aria-label') || target.textContent).trim().slice(0, 20));
    if (await trial('el.click()', () => target.click())) return;
    if (await trial('mousedown+mouseup+click', () => {
      fire(target, 'mousedown'); fire(target, 'mouseup'); fire(target, 'click');
    })) return;
    if (await trial('full pointer+mouse sequence', () => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      fire(target, 'mousedown');
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      fire(target, 'mouseup');
      fire(target, 'click');
    })) return;
    const inner = target.querySelector('a[href], [jsaction]') || target.firstElementChild;
    if (inner && await trial(`inner ${inner.tagName} click`, () => {
      fire(inner, 'mousedown'); fire(inner, 'mouseup'); fire(inner, 'click');
    })) return;
    console.log('=== nothing moved the tab');
  })();
})();
