// Edit this file and reload the extension (chrome://extensions -> reload) to
// change the bindings. Nothing else needs touching.

globalThis.GSK_CONFIG = {
  // Ctrl+1 is the first entry, Ctrl+2 the second, and so on up to Ctrl+9.
  // These must be the exact addresses you are signed into in this browser
  // profile; Gmail resolves them via ?authuser=.
  accounts: [
    'you@example.com',
    'you@work.example.com',
    'you@gmail.com',
  ],

  // Which inbox tabs Tab / Shift+Tab cycles through.
  //
  // Left as null, the extension reads the tabs off Gmail's own tab bar, so it
  // matches whatever you have enabled in Settings -> Inbox -> Categories and
  // follows along if you change them. Set an explicit list to override, e.g.
  //   tabs: ['Primary', 'Promotions']
  // to cycle only those two. Valid names: Primary, Social, Promotions,
  // Updates, Forums.
  tabs: null,

  // Shortcuts that would cost you a Gmail native are off until you name them
  // here, so an update never silently takes a Gmail shortcut away. Full list of
  // ids in README.md.
  //
  //   enabled: ['filterUnread', 'filterStarred', 'filterImportant'],
  //
  // Note that filterUnread and filterImportant take over Shift+U and Shift+I,
  // which are Gmail's mark-as-unread and mark-as-read.
  enabled: [],

  // Turn off anything shipped on by default, by id.
  disabled: [],

  // Set true to log detection and navigation decisions to the console.
  debug: false,
};
