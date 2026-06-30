import { useEffect, useMemo, useState } from "react";
import type { RecordingAttempt, ReferenceAsset } from "../lib/types";

type RecordingDraft = {
  name: string;
  notes: string;
  measureStart: string;
  measureEnd: string;
  referenceId: string;
};

type Props = {
  projectName: string;
  recordings: RecordingAttempt[];
  references: ReferenceAsset[];
  selectedRecordingId: string | null;
  onSelectRecording: (recordingId: string) => void;
  onSaveRecording: (recordingId: string, draft: RecordingDraft) => void;
  onDeleteRecording: (recordingId: string) => void;
  onDuplicateRecording: (recordingId: string) => void;
  onOpenRecordingFolder: (recordingId: string) => void;
};

type GroupBy = "project" | "date" | "measure" | "reference";
type SortBy = "newest" | "oldest" | "title" | "duration";

type GroupedRecordings = {
  key: string;
  label: string;
  items: RecordingAttempt[];
};

export function RecordingBrowser({
  projectName,
  recordings,
  references,
  selectedRecordingId,
  onSelectRecording,
  onSaveRecording,
  onDeleteRecording,
  onDuplicateRecording,
  onOpenRecordingFolder,
}: Props) {
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [draft, setDraft] = useState<RecordingDraft>({
    name: "",
    notes: "",
    measureStart: "",
    measureEnd: "",
    referenceId: "",
  });

  const selectedRecording = useMemo(
    () => recordings.find((recording) => recording.id === selectedRecordingId) ?? recordings[0] ?? null,
    [recordings, selectedRecordingId],
  );

  useEffect(() => {
    if (!selectedRecording) {
      setDraft({
        name: "",
        notes: "",
        measureStart: "",
        measureEnd: "",
        referenceId: "",
      });
      return;
    }
    setDraft({
      name: selectedRecording.name,
      notes: selectedRecording.notes ?? "",
      measureStart: selectedRecording.measureStart?.toString() ?? "",
      measureEnd: selectedRecording.measureEnd?.toString() ?? "",
      referenceId: selectedRecording.referenceId ?? "",
    });
  }, [selectedRecording]);

  const referenceLookup = useMemo(() => {
    return new Map(references.map((reference) => [reference.id, reference.name]));
  }, [references]);

  const filteredRecordings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...recordings].sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareDate(left.createdAt, right.createdAt);
        case "title":
          return left.name.localeCompare(right.name);
        case "duration":
          return (right.durationMs ?? 0) - (left.durationMs ?? 0);
        case "newest":
        default:
          return compareDate(right.createdAt, left.createdAt);
      }
    });

    return sorted.filter((recording) => {
      if (!query) {
        return true;
      }
      const referenceName = recording.referenceId ? referenceLookup.get(recording.referenceId) ?? "" : "";
      const haystack = [
        recording.name,
        recording.notes ?? "",
        recording.fileName,
        recording.createdAt,
        recording.recordedAt,
        formatMeasureRange(recording.measureStart, recording.measureEnd),
        referenceName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [recordings, referenceLookup, search, sortBy]);

  const groupedRecordings = useMemo<GroupedRecordings[]>(() => {
    const groups = new Map<string, RecordingAttempt[]>();
    for (const recording of filteredRecordings) {
      const key = getGroupKey(recording, groupBy, projectName, referenceLookup);
      const items = groups.get(key) ?? [];
      items.push(recording);
      groups.set(key, items);
    }

    const order = [...groups.entries()].map(([key, items]) => ({
      key,
      label: getGroupLabel(items[0] ?? null, groupBy, projectName, referenceLookup),
      items,
    }));

    return order;
  }, [filteredRecordings, groupBy, projectName, referenceLookup]);

  const quickCompareOptions = useMemo(() => {
    return [
      { label: "Today", recording: selectByDate(recordings, 0) },
      { label: "Yesterday", recording: selectByDate(recordings, 1) },
      { label: "Last Week", recording: selectByDate(recordings, 7) },
      { label: "First Attempt", recording: recordings[recordings.length - 1] ?? null },
    ];
  }, [recordings]);

  return (
    <section className="panel recording-browser">
      <div className="panel__header">
        <div>
          <h2>Recording Browser</h2>
          <p className="muted">{recordings.length} recording{recordings.length === 1 ? "" : "s"} in this project</p>
        </div>
        <div className="recording-browser__quick-actions">
          {quickCompareOptions.map((option) => (
            <button
              key={option.label}
              className="secondary-btn"
              disabled={!option.recording}
              onClick={() => option.recording && onSelectRecording(option.recording.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="recording-browser__toolbar">
        <input
          className="text-input text-input--wide"
          placeholder="Search titles, notes, measure ranges, or references"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="field-inline field-inline--compact">
          Group
          <select className="text-input" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
            <option value="date">Date</option>
            <option value="measure">Measure Range</option>
            <option value="reference">Reference</option>
            <option value="project">Project</option>
          </select>
        </label>
        <label className="field-inline field-inline--compact">
          Sort
          <select className="text-input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="duration">Duration</option>
          </select>
        </label>
      </div>

      <div className="recording-browser__body">
        <div className="recording-browser__list">
          {groupedRecordings.length === 0 ? (
            <div className="empty-state">No recordings match the current filter.</div>
          ) : (
            groupedRecordings.map((group) => (
              <section key={group.key} className="recording-group">
                <div className="recording-group__header">
                  <h3>{group.label}</h3>
                  <span className="muted">{group.items.length}</span>
                </div>
                <div className="stack">
                  {group.items.map((recording) => (
                    <article
                      key={recording.id}
                      className={
                        recording.id === selectedRecording?.id
                          ? "list-card list-card--active recording-card"
                          : "list-card recording-card"
                      }
                    >
                      <div className="recording-card__header">
                        <button className="list-card__title" onClick={() => onSelectRecording(recording.id)}>
                          {recording.name}
                        </button>
                        {recording.id === selectedRecording?.id ? <span className="pill">Selected</span> : null}
                      </div>
                      <p className="muted">
                        {formatDateTime(recording.createdAt)} · {formatMeasureRange(recording.measureStart, recording.measureEnd)}
                      </p>
                      <p className="muted">
                        {formatDuration(recording.durationMs)} · {referenceLookup.get(recording.referenceId ?? "") ?? "No reference"}
                      </p>
                      {recording.notes ? <p>{recording.notes}</p> : <p className="muted">No notes yet.</p>}
                      <div className="transport-row recording-card__actions">
                        <button className="secondary-btn" onClick={() => onSelectRecording(recording.id)}>
                          Listen
                        </button>
                        <button className="secondary-btn" onClick={() => onDuplicateRecording(recording.id)}>
                          Duplicate
                        </button>
                        <button className="secondary-btn" onClick={() => onOpenRecordingFolder(recording.id)}>
                          Open Folder
                        </button>
                        <button className="danger-btn" onClick={() => onDeleteRecording(recording.id)}>
                          Delete Metadata
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="recording-browser__details">
          {selectedRecording ? (
            <div className="panel panel--nested">
              <div className="panel__header">
                <div>
                  <h3>Recording Details</h3>
                  <p className="muted">Metadata edits stay local to this project.</p>
                </div>
              </div>
              <div className="stack">
                <label>
                  Title
                  <input
                    className="text-input"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    className="notes"
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Add listening notes or take notes here."
                  />
                </label>
                <div className="two-up">
                  <label>
                    Measure start
                    <input
                      className="text-input"
                      type="number"
                      value={draft.measureStart}
                      onChange={(event) => setDraft({ ...draft, measureStart: event.target.value })}
                    />
                  </label>
                  <label>
                    Measure end
                    <input
                      className="text-input"
                      type="number"
                      value={draft.measureEnd}
                      onChange={(event) => setDraft({ ...draft, measureEnd: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Active reference
                  <select
                    className="text-input"
                    value={draft.referenceId}
                    onChange={(event) => setDraft({ ...draft, referenceId: event.target.value })}
                  >
                    <option value="">None</option>
                    {references.map((reference) => (
                      <option key={reference.id} value={reference.id}>
                        {reference.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="transport-row">
                  <button
                    className="primary-btn"
                    onClick={() => onSaveRecording(selectedRecording.id, draft)}
                  >
                    Save Changes
                  </button>
                  <button className="secondary-btn" onClick={() => onSelectRecording(selectedRecording.id)}>
                    Listen
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a recording to edit its metadata.</div>
          )}
        </aside>
      </div>
    </section>
  );
}

function getGroupKey(
  recording: RecordingAttempt,
  groupBy: GroupBy,
  projectName: string,
  referenceLookup: Map<string, string>,
): string {
  switch (groupBy) {
    case "measure":
      return formatMeasureRange(recording.measureStart, recording.measureEnd);
    case "reference":
      return recording.referenceId ? referenceLookup.get(recording.referenceId) ?? "Unknown reference" : "No reference";
    case "project":
      return projectName;
    case "date":
    default:
      return formatDay(recording.createdAt);
  }
}

function getGroupLabel(
  recording: RecordingAttempt | null,
  groupBy: GroupBy,
  projectName: string,
  referenceLookup: Map<string, string>,
): string {
  if (!recording) {
    return "Recordings";
  }
  switch (groupBy) {
    case "measure":
      return formatMeasureRange(recording.measureStart, recording.measureEnd);
    case "reference":
      return recording.referenceId ? referenceLookup.get(recording.referenceId) ?? "Unknown reference" : "No reference";
    case "project":
      return projectName;
    case "date":
    default:
      return formatDay(recording.createdAt);
  }
}

function compareDate(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function selectByDate(recordings: RecordingAttempt[], offsetDays: number): RecordingAttempt | null {
  const today = startOfDay(new Date());
  const target = new Date(today);
  target.setDate(target.getDate() - offsetDays);
  const targetKey = formatDay(target.toISOString());
  return [...recordings]
    .sort((left, right) => compareDate(right.createdAt, left.createdAt))
    .find((recording) => formatDay(recording.createdAt) === targetKey) ?? null;
}

function formatDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(value: number | null): string {
  if (value == null) {
    return "Duration unavailable";
  }
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMeasureRange(start: number | null, end: number | null): string {
  if (start == null && end == null) {
    return "Unmapped";
  }
  if (start == null) {
    return `Up to M${end}`;
  }
  if (end == null) {
    return `From M${start}`;
  }
  if (start === end) {
    return `M${start}`;
  }
  return `M${start} - M${end}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
