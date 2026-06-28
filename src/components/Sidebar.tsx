import type {
  Bookmark,
  LoopRange,
  MeasureMarker,
  ProjectNote,
  RecordingAttempt,
  ReferenceAsset,
} from "../lib/types";

type Props = {
  references: ReferenceAsset[];
  selectedReferenceId: string | null;
  markers: MeasureMarker[];
  loopRange: LoopRange | null;
  bookmarks: Bookmark[];
  recordings: RecordingAttempt[];
  note: ProjectNote;
  selectedRecordingId: string | null;
  onSelectReference: (referenceId: string) => void;
  onDeleteReference: (referenceId: string) => void;
  onSelectRecording: (recordingId: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onSetLoop: (startMeasure: number, endMeasure: number) => void;
  onClearLoop: () => void;
  onSaveNote: (text: string) => void;
  onJumpToBookmark: (measureNumber: number) => void;
  onAddMarkerAtCurrent: () => void;
  onAddBookmarkAtCurrent: () => void;
  currentMeasure: number;
  loopDraft: { startMeasure: number; endMeasure: number };
  setLoopDraft: (draft: { startMeasure: number; endMeasure: number }) => void;
  markerDraft: { measureNumber: number; timestampMs: number; label: string; noteText: string };
  setMarkerDraft: (draft: { measureNumber: number; timestampMs: number; label: string; noteText: string }) => void;
};

export function Sidebar({
  references,
  selectedReferenceId,
  markers,
  loopRange,
  bookmarks,
  recordings,
  note,
  selectedRecordingId,
  onSelectReference,
  onDeleteReference,
  onSelectRecording,
  onDeleteMarker,
  onDeleteBookmark,
  onSetLoop,
  onClearLoop,
  onSaveNote,
  onJumpToBookmark,
  onAddMarkerAtCurrent,
  onAddBookmarkAtCurrent,
  currentMeasure,
  loopDraft,
  setLoopDraft,
  markerDraft,
  setMarkerDraft,
}: Props) {
  return (
    <aside className="sidebar">
      <section className="panel">
        <div className="panel__header">
          <h2>References</h2>
        </div>
        <div className="stack">
          {references.map((reference) => (
            <div key={reference.id} className={reference.id === selectedReferenceId ? "list-card list-card--active" : "list-card"}>
              <button className="list-card__title" onClick={() => onSelectReference(reference.id)}>
                {reference.name}
              </button>
              <p className="muted">{reference.fileName}</p>
              <button className="link-btn" onClick={() => onDeleteReference(reference.id)}>
                Delete
              </button>
            </div>
          ))}
          {references.length === 0 ? <p className="muted">No references imported yet.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Markers</h2>
        </div>
        <div className="stack">
          <div className="marker-form">
            <label>
              Measure
              <input
                className="text-input"
                type="number"
                value={markerDraft.measureNumber}
                onChange={(event) =>
                  setMarkerDraft({ ...markerDraft, measureNumber: Number(event.target.value) || 1 })
                }
              />
            </label>
            <label>
              Timestamp ms
              <input
                className="text-input"
                type="number"
                value={markerDraft.timestampMs}
                onChange={(event) =>
                  setMarkerDraft({ ...markerDraft, timestampMs: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              Label
              <input
                className="text-input"
                value={markerDraft.label}
                onChange={(event) => setMarkerDraft({ ...markerDraft, label: event.target.value })}
              />
            </label>
            <label>
              Note
              <input
                className="text-input"
                value={markerDraft.noteText}
                onChange={(event) => setMarkerDraft({ ...markerDraft, noteText: event.target.value })}
              />
            </label>
            <button className="primary-btn" onClick={onAddMarkerAtCurrent}>
              Save Marker
            </button>
          </div>
          {markers.map((marker) => (
            <div key={marker.id} className="list-card">
              <div className="list-card__row">
                <strong>M{marker.measureNumber}</strong>
                <span>{Math.round(marker.timestampMs)} ms</span>
              </div>
              <p className="muted">{marker.label ?? "Unlabeled"}</p>
              <button className="link-btn" onClick={() => onDeleteMarker(marker.id)}>
                Delete
              </button>
            </div>
          ))}
          {markers.length === 0 ? <p className="muted">Place markers manually to anchor measure-based navigation.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Loop</h2>
        </div>
        <div className="marker-form">
          <label>
            Start
            <input
              className="text-input"
              type="number"
              value={loopDraft.startMeasure}
              onChange={(event) => setLoopDraft({ ...loopDraft, startMeasure: Number(event.target.value) || 1 })}
            />
          </label>
          <label>
            End
            <input
              className="text-input"
              type="number"
              value={loopDraft.endMeasure}
              onChange={(event) => setLoopDraft({ ...loopDraft, endMeasure: Number(event.target.value) || 1 })}
            />
          </label>
          <button className="primary-btn" onClick={() => onSetLoop(loopDraft.startMeasure, loopDraft.endMeasure)}>
            Save Loop
          </button>
          <button className="secondary-btn" onClick={onClearLoop} disabled={!loopRange}>
            Clear Loop
          </button>
        </div>
        {loopRange ? (
          <p className="muted">
            Active loop: measures {loopRange.startMeasure} to {loopRange.endMeasure}
          </p>
        ) : (
          <p className="muted">No loop is active.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Bookmarks</h2>
        </div>
        <button className="primary-btn" onClick={onAddBookmarkAtCurrent}>
          Bookmark current measure
        </button>
        <div className="stack">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="list-card">
              <button className="list-card__title" onClick={() => onJumpToBookmark(bookmark.measureNumber)}>
                {bookmark.name}
              </button>
              <p className="muted">Measure {bookmark.measureNumber}</p>
              <button className="link-btn" onClick={() => onDeleteBookmark(bookmark.id)}>
                Delete
              </button>
            </div>
          ))}
          {bookmarks.length === 0 ? <p className="muted">No bookmarks saved yet.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Recordings</h2>
        </div>
        <div className="stack">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className={recording.id === selectedRecordingId ? "list-card list-card--active" : "list-card"}
            >
              <button className="list-card__title" onClick={() => onSelectRecording(recording.id)}>
                {recording.name}
              </button>
              <p className="muted">
                M{recording.measureStart ?? currentMeasure} - M{recording.measureEnd ?? currentMeasure}
              </p>
            </div>
          ))}
          {recordings.length === 0 ? <p className="muted">No takes recorded yet.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Notes</h2>
        </div>
        <textarea
          className="notes"
          value={note.text}
          onChange={(event) => onSaveNote(event.target.value)}
          placeholder="Keep practice notes here."
        />
      </section>
    </aside>
  );
}

