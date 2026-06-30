import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import type {
  Bookmark,
  LoopRange,
  MeasureMarker,
  PracticeActivity,
  PracticeSession,
  PracticeStats,
  ProjectNote,
  ReferenceAsset,
} from "../lib/types";

type BookmarkDraftState = {
  measureStart: number;
  measureEnd: number;
  label: string;
  noteText: string;
  color: string;
  status: string;
  activateLoop: boolean;
};

type Props = {
  references: ReferenceAsset[];
  selectedReferenceId: string | null;
  markers: MeasureMarker[];
  loopRange: LoopRange | null;
  bookmarks: Bookmark[];
  practiceSessions: PracticeSession[];
  recentActivity: PracticeActivity[];
  stats: PracticeStats;
  note: ProjectNote;
  bookmarkDraft: BookmarkDraftState;
  setBookmarkDraft: Dispatch<SetStateAction<BookmarkDraftState>>;
  onSelectReference: (referenceId: string) => void;
  onDeleteReference: (referenceId: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onSetLoop: (startMeasure: number, endMeasure: number) => void;
  onClearLoop: () => void;
  onSaveNote: (text: string) => void;
  onJumpToBookmark: (measureNumber: number) => void;
  onAddMarkerAtCurrent: () => void;
  onUseCurrentMeasureForBookmark: () => void;
  onSaveBookmark: () => void;
  loopDraft: { startMeasure: number; endMeasure: number };
  setLoopDraft: (draft: { startMeasure: number; endMeasure: number }) => void;
  markerDraft: { measureNumber: number; timestampMs: number; label: string; noteText: string };
  setMarkerDraft: (draft: { measureNumber: number; timestampMs: number; label: string; noteText: string }) => void;
};

const BOOKMARK_STATUS_ORDER = ["Needs Work", "Teacher Assigned", "In Progress", "Not Started", "Completed", "Favorite"];

const BOOKMARK_LABEL_SUGGESTIONS = [
  "Difficult",
  "Intonation",
  "Rhythm",
  "Fingering",
  "Bowing",
  "Phrasing",
  "Dynamics",
  "Teacher",
  "Performance",
];

const STATUS_FILTERS = ["All", ...BOOKMARK_STATUS_ORDER];
const SORT_OPTIONS = [
  { value: "recent", label: "Recent" },
  { value: "measure", label: "Measure" },
  { value: "label", label: "Label" },
  { value: "status", label: "Status" },
];

type SortMode = "recent" | "measure" | "label" | "status";

export function Sidebar({
  references,
  selectedReferenceId,
  markers,
  loopRange,
  bookmarks,
  practiceSessions,
  recentActivity,
  stats,
  note,
  bookmarkDraft,
  setBookmarkDraft,
  onSelectReference,
  onDeleteReference,
  onDeleteMarker,
  onDeleteBookmark,
  onSetLoop,
  onClearLoop,
  onSaveNote,
  onJumpToBookmark,
  onAddMarkerAtCurrent,
  onUseCurrentMeasureForBookmark,
  onSaveBookmark,
  loopDraft,
  setLoopDraft,
  markerDraft,
  setMarkerDraft,
}: Props) {
  const [bookmarkSearch, setBookmarkSearch] = useState("");
  const [bookmarkStatusFilter, setBookmarkStatusFilter] = useState("All");
  const [bookmarkSort, setBookmarkSort] = useState<SortMode>("recent");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activityBySessionId = useMemo(() => {
    const grouped = new Map<string, PracticeActivity[]>();
    for (const activity of recentActivity) {
      if (!activity.sessionId) {
        continue;
      }
      const items = grouped.get(activity.sessionId) ?? [];
      items.push(activity);
      grouped.set(activity.sessionId, items);
    }
    return grouped;
  }, [recentActivity]);

  const filteredBookmarks = useMemo(() => {
    const normalizedSearch = bookmarkSearch.trim().toLowerCase();
    return [...bookmarks]
      .filter((bookmark) => {
        if (bookmarkStatusFilter !== "All" && bookmark.status !== bookmarkStatusFilter) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }
        return [
          bookmark.label,
          bookmark.noteText ?? "",
          bookmark.status,
          `${bookmark.measureStart}`,
          `${bookmark.measureEnd}`,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (bookmarkSort === "measure") {
          return left.measureStart - right.measureStart || left.measureEnd - right.measureEnd;
        }
        if (bookmarkSort === "label") {
          return left.label.localeCompare(right.label);
        }
        if (bookmarkSort === "status") {
          return left.status.localeCompare(right.status) || left.measureStart - right.measureStart;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [bookmarks, bookmarkSearch, bookmarkSort, bookmarkStatusFilter]);

  const recentlyPracticedBookmarks = useMemo(() => {
    const practiceBookmarkIds = new Set(
      recentActivity
        .filter((activity) => activity.bookmarkId)
        .map((activity) => activity.bookmarkId as string),
    );
    return bookmarks.filter((bookmark) => practiceBookmarkIds.has(bookmark.id));
  }, [bookmarks, recentActivity]);

  const bookmarksByStatus = useMemo(() => {
    const grouped = new Map<string, Bookmark[]>();
    for (const bookmark of filteredBookmarks) {
      const items = grouped.get(bookmark.status) ?? [];
      items.push(bookmark);
      grouped.set(bookmark.status, items);
    }
    return grouped;
  }, [filteredBookmarks]);

  const sessionSummaries = useMemo(() => {
    return practiceSessions.map((session) => {
      const activities = activityBySessionId.get(session.id) ?? [];
      const referenceIds = new Set(activities.map((activity) => activity.referenceId).filter(Boolean) as string[]);
      const recordingIds = new Set(activities.map((activity) => activity.recordingId).filter(Boolean) as string[]);
      return {
        session,
        activities,
        referenceCount: referenceIds.size,
        recordingCount: recordingIds.size,
      };
    });
  }, [activityBySessionId, practiceSessions]);

  return (
    <aside className="sidebar">
      <section className="panel">
        <div className="panel__header">
          <h2>Practice Overview</h2>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="eyebrow">Today</span>
            <strong>{formatDuration(stats.todayMs)}</strong>
          </div>
          <div className="stat-card">
            <span className="eyebrow">This Week</span>
            <strong>{formatDuration(stats.weekMs)}</strong>
          </div>
          <div className="stat-card">
            <span className="eyebrow">Recordings</span>
            <strong>{stats.recordingAttempts}</strong>
          </div>
          <div className="stat-card">
            <span className="eyebrow">Bookmarks</span>
            <strong>{stats.bookmarkCount}</strong>
          </div>
        </div>
        <div className="stack">
          {stats.mostPracticedRanges.length > 0 ? (
            stats.mostPracticedRanges.map((range) => (
              <div key={`${range.measureStart}-${range.measureEnd}`} className="list-card">
                <div className="list-card__row">
                  <strong>
                    M{range.measureStart} - M{range.measureEnd}
                  </strong>
                  <span>{range.count}x</span>
                </div>
                <p className="muted">Most practiced ranges</p>
              </div>
            ))
          ) : (
            <p className="muted">Practice statistics will appear after you start working on passages.</p>
          )}
        </div>
      </section>

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
          <div>
            <h2>Bookmarks</h2>
            <p className="muted">Search, filter, and group practice passages.</p>
          </div>
        </div>

        <div className="bookmark-toolbar">
          <input
            className="text-input"
            value={bookmarkSearch}
            onChange={(event) => setBookmarkSearch(event.target.value)}
            placeholder="Search bookmarks"
          />
          <select
            className="text-input"
            value={bookmarkStatusFilter}
            onChange={(event) => setBookmarkStatusFilter(event.target.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="text-input"
            value={bookmarkSort}
            onChange={(event) => setBookmarkSort(event.target.value as SortMode)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="bookmark-form">
          <div className="bookmark-form__row">
            <label>
              Start
              <input
                className="text-input"
                type="number"
                value={bookmarkDraft.measureStart}
                onChange={(event) =>
                  setBookmarkDraft({
                    ...bookmarkDraft,
                    measureStart: Number(event.target.value) || 1,
                  })
                }
              />
            </label>
            <label>
              End
              <input
                className="text-input"
                type="number"
                value={bookmarkDraft.measureEnd}
                onChange={(event) =>
                  setBookmarkDraft({
                    ...bookmarkDraft,
                    measureEnd: Number(event.target.value) || 1,
                  })
                }
              />
            </label>
          </div>
          <label>
            Label
            <input
              className="text-input"
              list="bookmark-label-suggestions"
              value={bookmarkDraft.label}
              onChange={(event) => setBookmarkDraft({ ...bookmarkDraft, label: event.target.value })}
              placeholder="Difficult, Teacher, Custom..."
            />
          </label>
          <datalist id="bookmark-label-suggestions">
            {BOOKMARK_LABEL_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <div className="bookmark-form__row">
            <label>
              Status
              <select
                className="text-input"
                value={bookmarkDraft.status}
                onChange={(event) => setBookmarkDraft({ ...bookmarkDraft, status: event.target.value })}
              >
                {BOOKMARK_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input
                className="text-input"
                type="text"
                value={bookmarkDraft.color}
                onChange={(event) => setBookmarkDraft({ ...bookmarkDraft, color: event.target.value })}
                placeholder="#7ec8ff"
              />
            </label>
          </div>
          <label>
            Note
            <textarea
              className="notes notes--compact"
              value={bookmarkDraft.noteText}
              onChange={(event) => setBookmarkDraft({ ...bookmarkDraft, noteText: event.target.value })}
              placeholder="Add a short practice note."
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={bookmarkDraft.activateLoop}
              onChange={(event) => setBookmarkDraft({ ...bookmarkDraft, activateLoop: event.target.checked })}
            />
            Activate loop after save
          </label>
          <div className="bookmark-actions">
            <button className="secondary-btn" onClick={onUseCurrentMeasureForBookmark}>
              Use current measure
            </button>
            <button className="primary-btn" onClick={onSaveBookmark}>
              Save bookmark
            </button>
          </div>
        </div>

        {recentlyPracticedBookmarks.length > 0 ? (
          <div className="bookmark-group">
            <div className="bookmark-group__header">
              <button
                className="bookmark-group__toggle"
                onClick={() =>
                  setCollapsedGroups((current) => ({
                    ...current,
                    recent: !current.recent,
                  }))
                }
              >
                Recently Practiced
              </button>
              <span className="muted">{recentlyPracticedBookmarks.length}</span>
            </div>
            {!collapsedGroups.recent ? (
              <div className="stack">
                {recentlyPracticedBookmarks.map((bookmark) => renderBookmarkCard(bookmark))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="stack">
          {BOOKMARK_STATUS_ORDER.map((status) => {
            const items = bookmarksByStatus.get(status) ?? [];
            if (items.length === 0) {
              return null;
            }
            const groupKey = `status:${status}`;
            return (
              <div key={status} className="bookmark-group">
                <div className="bookmark-group__header">
                  <button
                    className="bookmark-group__toggle"
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [groupKey]: !current[groupKey],
                      }))
                    }
                  >
                    {status}
                  </button>
                  <span className="muted">{items.length}</span>
                </div>
                {!collapsedGroups[groupKey] ? <div className="stack">{items.map((bookmark) => renderBookmarkCard(bookmark))}</div> : null}
              </div>
            );
          })}
          {filteredBookmarks.length === 0 ? <p className="muted">No bookmarks match your filters yet.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Practice Sessions</h2>
        </div>
        <div className="stack">
          {sessionSummaries.map(({ session, activities, referenceCount, recordingCount }) => (
            <div key={session.id} className="list-card">
              <div className="list-card__row">
                <strong>{formatSessionTime(session.startedAt)}</strong>
                <span>{formatDuration(session.durationMs ?? 0)}</span>
              </div>
              <p className="muted">
                {session.endedAt ? `Ended ${formatSessionTime(session.endedAt)}` : "Session still open"}
              </p>
              <p className="muted">
                {referenceCount} reference{referenceCount === 1 ? "" : "s"} used, {recordingCount} recording
                {recordingCount === 1 ? "" : "s"} created
              </p>
              {activities.length > 0 ? (
                <p className="muted">{activities.length} related activity item{activities.length === 1 ? "" : "s"}</p>
              ) : null}
            </div>
          ))}
          {practiceSessions.length === 0 ? <p className="muted">Session history will appear here as you practice.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Recent Activity</h2>
        </div>
        <div className="stack">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="list-card">
              <div className="list-card__row">
                <strong>{activity.title}</strong>
                <span>{formatRelativeTime(activity.createdAt)}</span>
              </div>
              <p className="muted">{activity.detail ?? activity.kind.replace(/_/g, " ")}</p>
              {activity.measureStart != null ? (
                <p className="muted">
                  M{activity.measureStart}
                  {activity.measureEnd != null && activity.measureEnd !== activity.measureStart
                    ? `-M${activity.measureEnd}`
                    : ""}
                </p>
              ) : null}
            </div>
          ))}
          {recentActivity.length === 0 ? <p className="muted">Recent practice activity will show up here.</p> : null}
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

  function renderBookmarkCard(bookmark: Bookmark) {
    return (
      <div key={bookmark.id} className="list-card" style={{ borderColor: bookmark.color ?? undefined }}>
        <div className="bookmark-card__header">
          <button className="list-card__title" onClick={() => onJumpToBookmark(bookmark.measureStart)}>
            {bookmark.label}
          </button>
          <span className={`bookmark-badge bookmark-badge--${normalizeStatus(bookmark.status)}`}>{bookmark.status}</span>
        </div>
        <p className="muted">
          M{bookmark.measureStart} - M{bookmark.measureEnd}
        </p>
        {bookmark.noteText ? <p className="bookmark-note">{bookmark.noteText}</p> : null}
        <div className="bookmark-actions">
          <button
            className="secondary-btn"
            onClick={() => {
              onJumpToBookmark(bookmark.measureStart);
              if (bookmark.measureEnd >= bookmark.measureStart) {
                onSetLoop(bookmark.measureStart, bookmark.measureEnd);
              }
            }}
          >
            Jump + Loop
          </button>
          <button className="link-btn" onClick={() => onDeleteBookmark(bookmark.id)}>
            Delete
          </button>
        </div>
      </div>
    );
  }
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

function formatDuration(value: number): string {
  const totalMinutes = Math.floor(Math.max(0, value) / 60000);
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.floor((Math.max(0, value) % 60000) / 1000);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatSessionTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) {
    return "just now";
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
