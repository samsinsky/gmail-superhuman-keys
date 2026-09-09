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
