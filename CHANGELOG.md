# Changelog

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
