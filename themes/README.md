# Custom themes

Put theme `.json` files in this folder and the installer ships them with the app.
Themes appear in Settings, in the Theme row, with a small "installer" label.

Other places the app looks for theme files:

- `$SEROP_THEMES_DIR` (a folder path set as an environment variable, for company-wide setups)
- the `themes` folder inside the app's data folder (Settings has an "Open themes folder" button)

If two files use the same theme id, the user folder wins over `$SEROP_THEMES_DIR`, which wins over the installer folder.

Only `.json` files directly in these folders are loaded (not subfolders), up to 20 files per folder, 20 KB each.
See `examples/ocean.json` for the format. Copy it up one level to use it.
