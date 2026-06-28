# Reference Practice Architecture & Technical Roadmap

## 1. Product Intent

Reference Practice is a local-first desktop application for intermediate, advanced, and professional musicians. Its job is to make measure-based practice fast and frictionless by combining:

- sheet music
- professional reference recordings
- the user's own recordings
- manual practice organization tools

The product should feel closer to focused creative software than to a beginner learning app or a DAW.

## 2. Product Boundaries

### In scope

- Local project management
- MusicXML score import and display
- Reference audio import and playback
- Manual measure alignment
- Measure-based playback and looping
- User recording capture and comparison
- Practice organization: bookmarks, notes, history, and practice sessions

### Out of scope for MVP

- Accounts and authentication
- Cloud sync
- Online collaboration
- AI tutoring or analysis
- Full DAW-style editing
- Mobile support

## 3. Core Design Principles

1. Local-first by default
2. Manual workflows must always exist
3. Measure-based practice is the primary interaction model
4. Files should remain real files on disk
5. SQLite stores metadata, not large binary media
6. Terminology should match musicians, not audio engineers
7. The app must remain usable even when automation fails

## 4. Recommended Technology Stack

### Desktop shell

- Tauri
- Rust backend for filesystem, audio, and native integration
- React frontend
- TypeScript throughout the UI layer

### Frontend

- React for UI composition
- TypeScript for type safety
- A lightweight state layer such as Zustand or a reducer-based store
- Canvas/SVG hybrid score rendering if needed

### Backend

- Tauri commands for filesystem, project management, and audio control
- Rust modules for:
  - file access
  - audio decoding and transport control
  - recording capture
  - persistence helpers
  - project import/export logic

### Storage

- SQLite for metadata
- Real files on disk for scores, references, recordings, and exports
- Optional sidecar JSON only when it simplifies interoperability or debugging

## 5. Domain Model

Use musician-facing terminology in the product and code where practical.

### Primary entities

- Project
- Score
- Reference
- Recording Attempt
- Measure Marker
- Loop Range
- Bookmark
- Practice Session
- Notes

### Conceptual relationships

- A Project contains one Score and many References, Recordings, Bookmarks, Notes, and Practice Sessions
- A Score can have multiple imported file representations, such as MusicXML now and PDF later
- References and Recording Attempts are audio assets linked to a project
- Measure Markers map score measures to playback timing within a reference or recording
- Loop Ranges define repeatable sections across measures
- Bookmarks and Notes are practice annotations attached to measures or ranges

## 6. Project File Structure

The on-disk project should mirror how creative software stores assets.

```text
Project Name/
    project.db
    project.json            # optional lightweight manifest if needed
    score/
        score.musicxml
        score.pdf            # later support
    references/
        Hilary Hahn.wav
        James Ehnes.flac
    recordings/
        2026-06-28.wav
        2026-07-01.wav
    exports/
```

### Storage rules

- `project.db` stores metadata only
- audio and score binaries remain as normal files
- file paths in the database should be relative to the project root
- imports should copy files into the project structure unless an explicit link mode is designed later

## 7. Application Architecture

### High-level layering

1. Presentation layer
   - React UI
   - score viewer
   - transport controls
   - practice panels
2. Application layer
   - use cases
   - project orchestration
   - import/export flows
   - recording workflow
3. Domain layer
   - project model
   - measure mapping
   - loop logic
   - practice session logic
4. Infrastructure layer
   - SQLite persistence
   - filesystem access
   - audio decoding/playback
   - recording capture

### Why this shape

This separation keeps the UI thin, makes local storage rules explicit, and prevents audio/playback concerns from leaking into the product model.

## 8. UI Architecture

### Main application regions

- Project sidebar
- Score view
- Reference/recording browser
- Transport controls
- Practice tools panel
- Notes/history panel

### Key interaction model

- Click a measure to jump playback
- Drag or set handles to define a loop range
- Attach a bookmark or note to a measure or passage
- Start recording from the current practice context
- Switch instantly between user recording and reference playback for comparison

### UI state categories

- global app state
- active project state
- score navigation state
- playback state
- recording state
- selected measure/range state

## 9. Audio Architecture

Audio behavior is central to the product, but it should remain simple and dependable.

### Playback requirements

- seek to measure boundaries
- loop selected ranges
- adjust speed
- preserve pitch when possible
- switch between reference and recording playback quickly

### Recording requirements

- capture user performance locally
- save each take as a file in the project
- record metadata such as timestamp, source project, and associated practice session

### Recommended audio strategy

- Keep transport control deterministic
- Separate decoding from playback control
- Treat time-mapping between score measures and audio offsets as first-class data
- Prefer reliable manual controls over brittle automation

## 10. Measure Mapping Strategy

Manual measure mapping should be the foundation of v1.

### Model

- Each measure can have one or more timing anchors in a reference file
- A measure marker maps a measure number to an audio timestamp
- A contiguous series of markers defines the playable score timeline

### Behavior

- Users can place markers manually
- The app can later add optional automatic assistance
- If automatic alignment is unavailable or incorrect, the manual markers still drive playback

### Future expansion

- automatic score following
- assisted alignment
- audio feature detection for faster mapping

## 11. Persistence Design

### SQLite tables should cover

- projects
- scores
- references
- recordings
- measure_markers
- loop_ranges
- bookmarks
- notes
- practice_sessions
- session_items or activity logs

### Rules

- store file names and relative paths, not raw binaries
- store timestamps in UTC
- store measure numbers as integers
- keep schema migrations explicit and versioned

### Suggested metadata fields

- id
- project_id
- file_name
- relative_path
- created_at
- updated_at
- duration_ms
- sample_rate
- channels
- measure_start
- measure_end
- label
- note_text

## 12. Import and Export

### Import

- Copy score and audio into the project folder
- Register imported assets in SQLite
- Validate supported formats before committing project state

### Export

- Export practice notes, session summaries, and bookmarks
- Export should not mutate the core project structure
- Keep exports separate from working assets

## 13. MVP Scope

### Must-have v1 features

- create/open project
- import MusicXML score
- display score
- import reference recordings
- manual measure markers
- click measure to play
- loop a measure range
- adjust playback speed
- preserve pitch if practical
- record user performance
- A/B compare user recording and reference

### Nice-to-have, but not required for v1

- PDF score support
- automatic alignment
- multi-reference comparison UI
- practice analytics

## 14. v2 Practice Management Roadmap

### Goals

- help musicians organize work without turning the app into a learning game

### Features

- bookmarks
- notes
- difficult passages
- practice history
- today's practice time
- teacher-assigned sections
- labels such as Starred and Needs Work

### Product behavior

- practice tools should feel lightweight and fast
- users should never have to leave the score view for basic organization

## 15. v3 Multiple References Roadmap

### Goals

- compare interpretations across professional recordings

### Features

- multiple reference recordings per project
- quick switching between interpretations
- per-reference measure markers
- optional side-by-side metadata like performer and source

### UX principle

- selecting a reference should be as fast as choosing a track in a practice queue, not as complex as editing a mix

## 16. Recommended Implementation Phases

### Phase 0: Foundation

- create project structure
- define schema
- wire basic Tauri commands
- establish file import and persistence conventions

### Phase 1: Score and Playback MVP

- MusicXML import
- score rendering
- audio import
- measure marker editing
- playback transport
- loop range playback

### Phase 2: Recording and Comparison

- user recording capture
- saved takes browser
- instant switch between reference and recording
- basic A/B comparison workflow

### Phase 3: Practice Organization

- bookmarks
- notes
- practice sessions
- history

### Phase 4: Multi-Reference Support

- multiple professional interpretations
- reference selection UX
- per-reference marker sets

### Phase 5: Automation Enhancements

- assisted alignment
- automatic score following
- other optional analysis features

## 17. Key Technical Risks

### Audio latency and synchronization

- risk: playback drift or lag makes practice unusable
- mitigation: keep transport logic deterministic and test with long sessions

### Measure mapping complexity

- risk: score-to-audio alignment becomes fragile
- mitigation: manual markers remain the source of truth

### Score rendering quality

- risk: poor rendering harms usability
- mitigation: choose a rendering strategy early and validate with real MusicXML files

### Local file integrity

- risk: users move or delete files outside the app
- mitigation: keep project copies inside the project structure and validate paths on load

### Cross-platform audio differences

- risk: behavior differs between macOS and Windows
- mitigation: abstract platform-specific audio details behind a stable domain API

## 18. Suggested Engineering Standards

- Write domain logic independent of the UI
- Keep audio and filesystem code behind explicit interfaces
- Version every schema change
- Test project load/save flows thoroughly
- Test manual marker editing before advanced automation
- Prefer small, understandable modules over large shared state containers

## 19. Definition of Done for the Architecture

This architecture is ready when we have:

- a clear project model
- a local file layout
- a persistence schema
- a modular Tauri/React boundary
- a phased delivery roadmap
- identified risks and mitigation plans

## 20. Next Engineering Step

The best next step is to turn this roadmap into:

1. a concrete folder structure for the repository
2. a SQLite schema draft
3. a Tauri command boundary list
4. a first-pass UI wireframe map

