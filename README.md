# Reference Practice

Local-first desktop workspace for measure-based musical practice.

## Stack

- Tauri
- Rust
- React
- TypeScript
- SQLite

## Workspace Layout

- `library.db` tracks the local project index.
- Each project has its own `project.db`.
- Imported score, reference, and recording files are copied into the project folder.

## Development

```bash
npm install
npm run dev
```

## Cross-Platform

- The app stores data in Tauri's per-platform app data directory, so it can run on other Macs and on Windows without hard-coded local paths.
- Audio recordings are saved using a browser-supported format (`.m4a`, `.webm`, or `.ogg`) instead of assuming a single macOS-friendly codec.
- On Windows, Tauri uses WebView2. If it is not already present on the machine, Windows may prompt to install it the first time the app is launched.

## Notes

- MusicXML import and manual measure mapping are implemented first.
- The score viewer uses a text-and-measure preview for this milestone, with a clear extension point for richer engraving later.
