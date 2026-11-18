# Changelog

## 2.16.3 "Steadfast" - 2026-11-18

### Deploy
- Switching to Team, Settings, Logs, API, Commands or Servers no longer closes the Deploy terminal, so a running deploy is no longer cancelled.
- A small Deploying pill appears in the corner while a background job or a terminal command is running, and takes you back to Deploy when clicked.


## 2.16.2 "Midnight" - 2026-11-16

### Themes
- New Midnight theme: deep navy with a soft violet accent and solid, readable panels.
- Glassy and Ember are removed. If you had one selected, the app falls back to Default.


### AI chat
- The Ask for a command box no longer shows a stray blue line across the input when it is focused.


## 2.16.1 "Glimmer" - 2026-11-16

### Cursor
- The terminal and editor cursor is a slim 2px bar with a soft glow in your theme's accent colour that fades in and out.
- The terminal cursor turns into a hollow outline when the terminal is not focused.

### Deploy
- Compose projects are full-width rows with the name, path, service count, service buttons, refresh and delete lined up.
- The Deploy sidebar lists projects instead of pills, gives each section an icon and shows a clear empty state with a Create starter shortcuts button.
- Ask for a command keeps its title on one line. The Groq key and model sit behind a small settings button once a key is saved, and example prompts are a list.

### AI chat
- Groq failures now say why: rejected key, blocked request, rate limit or no connection. Quotes and spaces around a pasted key are removed.
- If a model has been retired, the next model is tried. Longer answers no longer come back empty on reasoning models.

## 2.16.0 "Clearview" - 2026-11-16

### Updates
- The update panel shows what it is doing right now (contacting GitHub, downloading with MB done, installing), the time left, the download speed and the total time.
- Step icons for fetch, apply and reopen with a progress line between them, a pulsing ruler and a count-up percent.

### Settings
- New Settings header with the version, an icon on the Check for updates button and underline tabs.
- Optional module boxes line up in the same grid. The two Deploy boxes were pushed to the right.

### Themes
- New themes that are easier to read: Slate, Graphite, Ember and Paper, all with solid panels and strong text contrast.
- Removed Tokyo Night, Dracula, Nord, Gruvbox, Rosé Pine, Catppuccin, One Dark, Solarized, High Contrast and Monokai. Anyone using one of them is switched to Default.

## 2.15.1 "Caret" - 2026-11-16

### Improved
- Terminal and editor cursors get a soft accent glow. Terminal cursor is a blinking bar (hollow when unfocused) instead of a solid block. Editor cursor blinks clearly.

## 2.15.0 "Keyring" - 2026-11-16

### Added
- Six new themes: Catppuccin, One Dark, Solarized Dark, Solarized Light, High Contrast, Monokai.
- "Check for updates" button in Settings.
- Optional key passphrase for servers that sign in with an SSH key, so encrypted OpenSSH keys work. Saved in the OS keychain and expires after 30 days; re-enter it in the server's edit form.

### Fixed
- "Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given".
