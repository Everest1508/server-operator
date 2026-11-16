# Changelog

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
