# Gmail Superhuman Keys

Two Superhuman shortcuts, added to Gmail:

| Key | Does |
|---|---|
| `Ctrl+1` … `Ctrl+9` | Switch Google account |
| `Tab` / `Shift+Tab` | Next / previous inbox tab (Primary, Social, Promotions, …) |

Requires Gmail's inbox type to be **Default** (the one with tabs). No OAuth, no
Gmail API, no network calls — it reads the tab bar and changes the URL. Nothing
touches your mail.

## Install

1. `cp config.example.js config.js` and put your own email addresses in it.
   This step is required — `config.js` is gitignored, and the extension will
   not load without it.
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. **Load unpacked** → select this folder

After editing `config.js`, hit reload on the extension card, then reload Gmail.

## Configure

Everything lives in `config.js`:

- **`accounts`** — your addresses in the order you want them on `Ctrl+1..9`.
  These are resolved with Gmail's `?authuser=` parameter rather than the
  `/u/0/`, `/u/1/` indices, because those indices are assigned in sign-in order
  and renumber if you sign out — which would quietly point `Ctrl+2` at the
  wrong mailbox.
- **`tabs`** — leave `null` to read Gmail's own tab bar, so enabling or
  disabling a category in Gmail settings just works. Set a list like
  `['Primary', 'Promotions']` to cycle a subset.
- **`debug`** — `true` logs every detection and navigation to the console.

## Worth knowing

- **Gmail already has this for tabs.** `` ` `` and `~` cycle inbox tabs natively
  (Settings → General → Keyboard shortcuts on). This extension exists to put the
  action on `Tab`, matching Superhuman's muscle memory.
- **Tab switching activates Gmail's real tab**, rather than routing to a
  `#category/...` URL. The tabs are Closure controls (`DIV[role=tab]` with
  `J-KU-*` state classes, no `jsaction`, no anchor), and Closure activates on
  mousedown — a bare `el.click()` does nothing at all. `core.activate` therefore
  dispatches `mousedown` -> `mouseup` -> `click`. `diag/inspect-tabs.js` is the
  script that established this and is worth re-running if Gmail ever changes. Gmail switches in place, so the view stays mounted and
  the query is not re-run. Whether the URL changes is then Gmail's own
  behaviour, not something the extension imposes. Routing is kept only as a
  fallback for views where the tab bar is not on screen (reading a thread, or
  in Sent), since there is nothing to click there.
- **Account switching is a full page load**, so expect a beat while Gmail
  reloads. Superhuman's native app keeps accounts warm in memory; a Gmail
  extension structurally cannot.
- **`Tab` no longer moves focus** in the main Gmail view. It still does inside
  compose, search, dialogs, and any text field — that is what `shouldIgnore`
  in `core.js` protects. If you rely on Tab for focus traversal in the thread
  list, this is the trade.

## Tests

```sh
node --test test/core.test.js
```

`core.js` holds the pure logic (URL building, which tab is active, where to
cycle to, whether a keypress is ours) and is fully covered. `content.js` is
thin wiring over it and is verified by hand in Gmail.
