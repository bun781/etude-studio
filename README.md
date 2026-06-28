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

## Notes

- MusicXML import and manual measure mapping are implemented first.
- The score viewer uses a text-and-measure preview for this milestone, with a clear extension point for richer engraving later.

