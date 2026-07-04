# Release Readiness

Reference Practice is a local-first Tauri desktop app. It is designed to run on other machines by storing app data in Tauri's per-platform application data directory and by copying user-imported assets into app-managed project folders.

## Portability Checklist

- Project library data lives under the Tauri app data directory, not a development-machine path.
- Each project has a project root with `project.db`, `score/`, `references/`, `recordings/`, and `exports/`.
- Imported scores and reference recordings are copied into the project folder.
- User recordings are saved inside the active project's `recordings/` folder.
- Database paths for project assets are relative to the project root.
- Project packs (`.etpack`) export/import the project folder so projects can move between machines.

## Installer Release Flow

Use the `Release installers` GitHub Actions workflow to build platform-native installers from a tag.

1. Create and push a release tag, for example `v0.1.0`.
2. Create a GitHub Release for that tag.
3. Run the workflow with the same tag.
4. Confirm these release assets exist:
   - `reference-practice-windows.exe`
   - `reference-practice-mac.dmg`

The website download buttons point to the latest GitHub Release with those stable filenames.

## Platform Notes

- Windows builds are produced on `windows-latest` and use the Tauri NSIS installer.
- macOS builds are produced on `macos-latest` and use the Tauri DMG bundle.
- Windows may require WebView2 on first launch if it is not already installed.
- If macOS builds are unsigned or unnotarized, users may need to approve the app in System Settings > Privacy & Security on first launch.

## Smoke Test Before Announcing a Release

Run this once on a second Mac and once on a Windows machine:

1. Install the downloaded app.
2. Create a project.
3. Import a PDF score.
4. Import a reference recording.
5. Create and select a practice segment.
6. Play, seek, loop, and change playback speed.
7. Record a take and switch playback to the recording.
8. Quit and reopen the app.
9. Confirm the project, score, reference, segment, and recording still load.
