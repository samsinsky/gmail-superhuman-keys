// The shortcut table. Data only — the matching logic lives in core.js and the
// actions in content.js. Adding a shortcut means adding a row here.
//
// action names: 'account' | 'cycleTab' | 'nav' | 'key' | 'click' | 'copyLink'
// optIn: true means the binding costs a Gmail native and stays off until
// config.enabled names its id.

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
];
