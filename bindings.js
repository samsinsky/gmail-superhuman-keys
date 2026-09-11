// The shortcut table. Data only — the matching logic lives in core.js and the
// actions in content.js. Adding a shortcut means adding a row here.
//
// action names: 'account' | 'cycleTab' | 'nav' | 'key' | 'click' | 'copyLink'
// optIn: true means the binding costs a Gmail native and stays off until
// config.enabled names its id.
//
// requiresThread: true means the binding only means something inside an open
// conversation; in the list the key is handed back to Gmail. That is how Enter
// and o keep Gmail's meaning where Superhuman's would be wrong.
//
// needsTarget: true means the binding acts on a conversation. Gmail acts on
// checked conversations and ignores the mouse and the keyboard cursor, so
// content.js ticks a box first -- the hovered row, or the cursor row, whichever
// it finds -- and leaves an existing selection alone. Without this the key
// quietly does nothing, which is what makes these feel broken next to
// Superhuman.

globalThis.GSK_BINDINGS = [
  { id: 'tabNext', key: 'Tab', action: 'cycleTab', arg: 1 },
  { id: 'tabPrev', key: 'Tab', shift: true, action: 'cycleTab', arg: -1 },

  // Superhuman's folder chords that Gmail has no equivalent for. Gmail already
  // binds g+i, g+s, g+t, g+d, g+a and g+l; every leaf claimed here is one Gmail
  // leaves free, which is what lets both chord machines run at once. Check that
  // still holds before adding another.
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

  // Superhuman's filters narrow the current view; Gmail's nearest equivalent is
  // a search. All three are opt-in because Shift+U and Shift+I are Gmail's
  // mark-as-unread and mark-as-read, and taking those silently would be rude.
  // Superhuman's Shift+R (no reply) has no Gmail operator behind it and is
  // deliberately absent.
  { id: 'filterUnread', key: 'u', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Aunread' },
  { id: 'filterStarred', key: 's', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Astarred' },
  { id: 'filterImportant', key: 'i', shift: true, optIn: true, action: 'nav', arg: '#search/is%3Aimportant' },

  // Rebinds that cost nothing: h and Shift+M are unbound in Gmail, so these are
  // additive and Gmail's own b and m keep working underneath. Note that h is
  // also the leaf of the g+h chord; a chord binding only resolves under its
  // prefix, so the two never shadow each other.
  //
  // Both act on the conversation under Gmail's cursor, and Gmail has no cursor
  // until you press j/k or click -- hovering does not set one. Superhuman always
  // has a focused conversation, so these feel like they should work straight off
  // the list and do not. That is Gmail's model, not something the binding can
  // fix: auto-selecting a row would risk acting on the wrong conversation.
  { id: 'snooze', key: 'h', needsTarget: true, action: 'key', arg: { key: 'b' } },
  { id: 'mute', key: 'm', shift: true, needsTarget: true, action: 'key', arg: { key: 'm' } },

  // Superhuman's pop-out variants. Gmail already binds Shift+R and Shift+F to
  // reply and forward in a new window, matching Superhuman exactly; only these
  // two need moving, and both keys are free in Gmail.
  //
  // Gmail's d is documented as "compose in a new tab" but pops out a compose
  // window, which is what Superhuman's Shift+C does too, so the mapping is
  // right even though the Gmail docs describe it differently.
  { id: 'popReplyAll', key: 'Enter', shift: true, action: 'key', arg: { key: 'a', shift: true } },
  { id: 'popCompose', key: 'c', shift: true, action: 'key', arg: { key: 'd' } },

  // Rebinds that each take a key Gmail already uses. All opt-in; the comment on
  // each says what it costs.
  //
  // Superhuman's Enter is context-dependent: it opens from the list and replies
  // all inside a conversation. requiresThread reproduces that -- in the list the
  // key is handed back and Gmail opens the conversation as usual. Because
  // nothing is taken away, this is on by default.
  { id: 'replyAll', key: 'Enter', requiresThread: true, action: 'key', arg: { key: 'a' } },
  // A genuine toggle, not mark-unread-only: the direction is chosen from the
  // row's unread marker class. Costs Gmail's u (back to the thread list), which
  // is what backToList below gives back.
  { id: 'readToggle', key: 'u', optIn: true, needsTarget: true, action: 'readToggle' },
  // Escape is unbound in Gmail's thread list, so this costs nothing on its own.
  // It exists to replace what readToggle takes away.
  { id: 'backToList', key: 'Escape', optIn: true, action: 'key', arg: { key: 'u' } },
  // Superhuman's o expands the focused message -- and so does Gmail's own o
  // inside a conversation, acting on the message you moved to with n/p. So
  // there is deliberately no binding on o here: remapping it to ; replaced a
  // per-message expand with an expand-all, which is strictly worse than leaving
  // Gmail alone. The earlier draft did exactly that.
  //
  // Shift+O is unbound in Gmail, so this is additive. It toggles rather than
  // only expanding: Gmail gives both directions and the state is legible, so
  // expand-then-collapse on one key beats a second key that does nothing once
  // the thread is open.
  { id: 'expandAll', key: 'o', shift: true, requiresThread: true, action: 'expandToggle' },

  // Pass-through bindings: same key in, same key out. Superhuman and Gmail agree
  // on all six of these, so the key never changes -- what changes is what they
  // act on. Gmail wants a checkbox; needsTarget ticks the hovered or cursored
  // conversation first, so they act on what you are looking at the way
  // Superhuman does.
  //
  // These are the bindings that map a key to itself, which is what the
  // synthesizing guard in content.js exists for.
  { id: 'archive', key: 'e', needsTarget: true, action: 'key', arg: { key: 'e' } },
  { id: 'trash', key: '#', shift: 'any', needsTarget: true, action: 'key', arg: { key: '#', shift: true } },
  { id: 'spam', key: '!', shift: 'any', needsTarget: true, action: 'key', arg: { key: '!', shift: true } },
  { id: 'star', key: 's', needsTarget: true, action: 'key', arg: { key: 's' } },
  { id: 'label', key: 'l', needsTarget: true, action: 'key', arg: { key: 'l' } },
  { id: 'moveTo', key: 'v', needsTarget: true, action: 'key', arg: { key: 'v' } },

  // Superhuman's Mark Not Done. Gmail's archive and Superhuman's Done are the
  // same operation -- both drop the INBOX label -- so undoing it means re-adding
  // that label, which Gmail exposes only as a toolbar control. This is the one
  // binding that reads the DOM.
  //
  // Returning false when the control is absent means the keypress falls through
  // to Gmail rather than being swallowed, which is what you want in the inbox
  // where there is nothing to un-archive. Shift+E is unbound in Gmail, so
  // falling through costs nothing.
  { id: 'markNotDone', key: 'e', shift: true, needsTarget: true, action: 'click', arg: '[aria-label="Move to Inbox"]' },

  // Gmail already puts the conversation permalink in the URL, so there is
  // nothing to look up. Ctrl+/ is unbound in both Gmail and Chrome.
  { id: 'copyLink', key: '/', ctrl: true, action: 'copyLink' },
];
