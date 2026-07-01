import { useState } from "react";
import { RecordingBrowser } from "./RecordingBrowser";
import type { PracticeSegment, PracticeSession, PracticeStats, ReferenceAsset, RecordingAttempt } from "../lib/types";

type RecordingDraft = {
  name: string;
  notes: string;
  segmentId: string;
  referenceId: string;
};

type Props = {
  recordings: RecordingAttempt[];
  references: ReferenceAsset[];
  segments: PracticeSegment[];
  selectedRecordingId: string | null;
  onSelectRecording: (recordingId: string) => void;
  onListenRecording: (recordingId: string) => void;
  onSaveRecording: (recordingId: string, draft: RecordingDraft) => void;
  onDeleteRecording: (recordingId: string) => void;
  onDuplicateRecording: (recordingId: string) => void;
  onOpenRecordingFolder: (recordingId: string) => void;
  stats: PracticeStats;
  sessions: PracticeSession[];
};

type ReviewTab = "recordings" | "analytics" | "calendar";

export function ReviewScreen({
  recordings,
  references,
  segments,
  selectedRecordingId,
  onSelectRecording,
  onListenRecording,
  onSaveRecording,
  onDeleteRecording,
  onDuplicateRecording,
  onOpenRecordingFolder,
  stats,
  sessions,
}: Props) {
  const [tab, setTab] = useState<ReviewTab>("recordings");

  return (
    <div className="review-screen" data-tour-id="review-screen">
      <div className="review-screen__tabs">
        <button className={tab === "recordings" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setTab("recordings")}>
          Recordings
        </button>
        <button className={tab === "analytics" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setTab("analytics")}>
          Analytics
        </button>
        <button className={tab === "calendar" ? "nav-item nav-item--active" : "nav-item"} onClick={() => setTab("calendar")}>
          Calendar
        </button>
      </div>

      {tab === "recordings" ? (
        <RecordingBrowser
          recordings={recordings}
          references={references}
          segments={segments}
          selectedRecordingId={selectedRecordingId}
          onSelectRecording={onSelectRecording}
          onListenRecording={onListenRecording}
          onSaveRecording={onSaveRecording}
          onDeleteRecording={onDeleteRecording}
          onDuplicateRecording={onDuplicateRecording}
          onOpenRecordingFolder={onOpenRecordingFolder}
        />
      ) : null}

      {tab === "analytics" ? <AnalyticsTab stats={stats} sessions={sessions} /> : null}

      {tab === "calendar" ? <CalendarTab sessions={sessions} /> : null}
    </div>
  );
}

function AnalyticsTab({ stats, sessions }: { stats: PracticeStats; sessions: PracticeSession[] }) {
  return (
    <div className="stats-layout" data-tour-id="stats-screen">
      <div className="metric-strip">
        <Metric label="Today" value={formatDuration(stats.todayMs)} />
        <Metric label="This week" value={formatDuration(stats.weekMs)} />
        <Metric label="Recordings" value={String(stats.recordingAttempts)} />
        <Metric label="Segments" value={String(stats.segmentCount)} />
      </div>
      <section className="journal-panel">
        <div className="section-heading">
          <h2>Segments receiving attention</h2>
          <span className="muted">{stats.mostPracticedSegments.length}</span>
        </div>
        <div className="quiet-list">
          {stats.mostPracticedSegments.map((segment) => (
            <article key={segment.segmentId} className="quiet-row">
              <strong>{segment.segmentName}</strong>
              <span>{segment.count} recording{segment.count === 1 ? "" : "s"}</span>
            </article>
          ))}
          {stats.mostPracticedSegments.length === 0 ? (
            <p className="muted">Segment statistics will appear after you record a few takes.</p>
          ) : null}
        </div>
      </section>
      <section className="journal-panel">
        <div className="section-heading">
          <h2>Sessions</h2>
          <span className="muted">{sessions.length}</span>
        </div>
        <SessionList sessions={sessions} />
      </section>
    </div>
  );
}

function CalendarTab({ sessions }: { sessions: PracticeSession[] }) {
  const days = buildCalendarDays(sessions);
  return (
    <div className="calendar-layout" data-tour-id="calendar-screen">
      <section className="journal-panel">
        <div className="calendar-grid" aria-label="Recent practice calendar">
          {days.map((day) => (
            <div key={day.key} className={day.hasSession ? "calendar-day calendar-day--active" : "calendar-day"}>
              <span>{day.label}</span>
              <strong>{day.count || ""}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="journal-panel">
        <div className="section-heading">
          <h2>Session journal</h2>
          <span className="muted">{sessions.length}</span>
        </div>
        <SessionList sessions={sessions} />
      </section>
    </div>
  );
}

function SessionList({ sessions }: { sessions: PracticeSession[] }) {
  if (sessions.length === 0) {
    return <p className="muted">Session history will appear here as you practice.</p>;
  }
  return (
    <div className="quiet-list">
      {sessions.slice(0, 12).map((session) => (
        <article key={session.id} className="quiet-row">
          <div>
            <strong>{new Date(session.startedAt).toLocaleDateString()}</strong>
            <p className="muted">{session.endedAt ? `Ended ${new Date(session.endedAt).toLocaleTimeString()}` : "Session still open"}</p>
          </div>
          <span>{formatDuration(session.durationMs ?? 0)}</span>
        </article>
      ))}
    </div>
  );
}

function buildCalendarDays(sessions: PracticeSession[]) {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = new Date(session.startedAt).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (34 - index));
    const key = date.toISOString().slice(0, 10);
    const count = counts.get(key) ?? 0;
    return {
      key,
      count,
      hasSession: count > 0,
      label: date.toLocaleDateString(undefined, { day: "numeric" }),
    };
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDuration(value: number): string {
  const totalMinutes = Math.floor(Math.max(0, value) / 60000);
  const seconds = Math.floor((Math.max(0, value) % 60000) / 1000);
  if (totalMinutes <= 0) {
    return `${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
