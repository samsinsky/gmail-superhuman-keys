// Paste into the Gmail console, from the inbox. Answers one question: does
// Gmail act on a keydown we dispatch ourselves? The whole rebind bucket rests
// on the answer.
//
// MEASURED 2026-09-09 (Chrome, mail.google.com): yes. Gmail acts on synthetic
// keydown dispatched at document.body. isTrusted is false and Gmail does not
// check it. keyCode/which do NOT need pinning -- Gmail reads e.key. This was
// confirmed twice over: a plain letter chord (g t -> #sent) and a shifted
// punctuation key (? -> the shortcuts overlay) both fired with nothing set but
// key and shiftKey. So content.js can build a plain KeyboardEvent; the
// defineProperty dance older write-ups call for is not needed here.
//
// Two pieces of experimental hygiene worth keeping if you edit this. Every
// trial starts from a known position, so a trial cannot report "no effect"
// merely because it was already at the destination -- an earlier version of
// this script probed `g t` from wherever it happened to be and reported a false
// negative when run from Sent. And each trial restores position by assigning
// location.hash directly, never by sending keys, so the restore never depends
// on the mechanism under test.
//
// The overlay probe deliberately does not look for [role="dialog"]: Gmail's
// shortcuts overlay is not one, and matching on that reported a false negative.
// It matches the visible "Keyboard shortcuts" heading instead.
(() => {
  const send = (key, keyCode, opts = {}) => {
    const target = opts.target || document.body;
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const e = new KeyboardEvent(type, {
        key,
        bubbles: true,
        cancelable: true,
        shiftKey: !!opts.shift,
      });
      if (opts.pinKeyCode) {
        Object.defineProperty(e, 'keyCode', { get: () => keyCode });
        Object.defineProperty(e, 'which', { get: () => keyCode });
      }
      target.dispatchEvent(e);
    }
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];

  const helpOpen = () => [...document.querySelectorAll('*')].some((el) =>
    el.children.length === 0 &&
    el.textContent.trim() === 'Keyboard shortcuts' &&
    el.getBoundingClientRect().width > 0);

  const toInbox = async () => {
    if (location.hash !== '#inbox') { location.hash = '#inbox'; await wait(1500); }
  };

  // Plain letters, observed through the hash.
  const hashTrial = async (name, fn) => {
    await toInbox();
    const before = location.hash;
    fn();
    await wait(1800);
    const after = location.hash;
    const moved = before !== after;
    console.log(`=== ${name}: ${before} -> ${after} ${moved ? 'WORKED' : 'no effect'}`);
    results.push({ trial: name, before, after, moved });
    await toInbox();
    return moved;
  };

  // Shifted punctuation, observed through the shortcuts overlay. Opens and
  // closes a read-only overlay; touches no mail.
  const overlayTrial = async (name, opts) => {
    if (helpOpen()) { send('Escape', 27); await wait(800); }
    const before = helpOpen();
    send('?', 191, { shift: true, ...opts });
    await wait(1500);
    const after = helpOpen();
    const moved = !before && after;
    console.log(`=== ${name}: overlay ${before} -> ${after} ${moved ? 'WORKED' : 'no effect'}`);
    results.push({ trial: name, before, after, moved });
    if (helpOpen()) { send('Escape', 27); await wait(600); }
    return moved;
  };

  return (async () => {
    console.log('=== isTrusted on a synthetic event:',
      new KeyboardEvent('keydown', { key: 'g' }).isTrusted);

    await hashTrial('plain letters (g t), key only',
      () => { send('g', 71); send('t', 84); });
    await hashTrial('plain letters (g t), keyCode pinned',
      () => { send('g', 71, { pinKeyCode: true }); send('t', 84, { pinKeyCode: true }); });
    await overlayTrial('shifted punctuation (?), key only', {});
    await overlayTrial('shifted punctuation (?), keyCode pinned', { pinKeyCode: true });

    const worked = results.filter((r) => r.moved).map((r) => r.trial);
    console.log(worked.length
      ? `=== VERDICT: Gmail acts on synthetic keystrokes. Worked: ${worked.join('; ')}`
      : '=== VERDICT: Gmail ignores synthetic keystrokes. Tasks 6-8 need ' +
        'redesigning around toolbar controls (see diag/inspect-toolbar.js).');
    return { results, worked };
  })();
})();
