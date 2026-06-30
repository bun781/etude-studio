import { useEffect, useState, type ReactNode } from "react";
import { PdfPageCanvas, usePdfDocument } from "./PdfPageViewer";
import { ScoreAnnotation, getRectInPageWindow, getSegmentAnnotationRect, getSegmentPageWindows } from "./ScoreAnnotation";
import type { PracticeSegment, RecordingAttempt } from "../lib/types";

type SegmentPracticePatch = {
  status?: string | null;
  notes?: string | null;
};

type Props = {
  pdfSrc: string | null;
  segments: PracticeSegment[];
  activeSegment: PracticeSegment | null;
  activeSegmentIndex: number;
  segmentRecordings: RecordingAttempt[];
  activeRecordingId: string | null;
  onPrev: () => void;
  onNext: () => void;
  onOpenSetup: () => void;
  onUpdateSegment: (segmentId: string, patch: SegmentPracticePatch) => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  onPlayRecording: (recordingId: string) => void;
  onDeleteRecording: (recordingId: string) => void;
  transport: ReactNode;
};

const STATUS_OPTIONS = ["Needs Work", "In Progress", "Polished"];
type PracticeSubtab = "passage" | "takes" | "notes";

export function PracticeScreen({
  pdfSrc,
  segments,
  activeSegment,
  activeSegmentIndex,
  segmentRecordings,
  activeRecordingId,
  onPrev,
  onNext,
  onOpenSetup,
  onUpdateSegment,
  isRecording,
  onToggleRecording,
  onPlayRecording,
  onDeleteRecording,
  transport,
}: Props) {
  const { doc } = usePdfDocument(pdfSrc);
  const [noteDraft, setNoteDraft] = useState(activeSegment?.notes ?? "");
  const [activeSubtab, setActiveSubtab] = useState<PracticeSubtab>("passage");
  const pageWindows = activeSegment ? getSegmentPageWindows(activeSegment) : [];
  const canGoPrev = activeSegmentIndex > 0;
  const canGoNext = activeSegmentIndex >= 0 && activeSegmentIndex < segments.length - 1;

  useEffect(() => {
    setNoteDraft(activeSegment?.notes ?? "");
  }, [activeSegment?.id, activeSegment?.notes]);

  if (segments.length === 0) {
    return (
      <section className="journal-panel">
        <div className="empty-state">
          <p>Create a passage on the score before practicing.</p>
          <button className="primary-btn" onClick={onOpenSetup}>
            Open Piece Setup
          </button>
        </div>
      </section>
    );
  }

  function saveNotes() {
    if (!activeSegment) {
      return;
    }
    onUpdateSegment(activeSegment.id, { notes: noteDraft.trim() || null });
  }

  return (
    <div className="practice-screen" data-tour-id="practice-screen">
      <aside className="practice-control-drawer" aria-label="Practice controls">
        <span className="practice-control-drawer__handle">Controls</span>
        <div className="practice-control-drawer__panel">
          <div>
            <p className="eyebrow">
              Passage {activeSegment ? activeSegmentIndex + 1 : "-"} of {segments.length}
            </p>
            <h1>{activeSegment?.name ?? "Select a passage"}</h1>
            <div className="practice-control-drawer__meta">
              <span className="pill">{activeSegment ? formatSegmentLocation(activeSegment) : "No score range"}</span>
              <span className="pill">{formatTimingRange(activeSegment)}</span>
              <span className="pill">
                {segmentRecordings.length} take{segmentRecordings.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="practice-control-drawer__actions">
            <button className="secondary-btn" onClick={onPrev} disabled={!canGoPrev}>
              Prev
            </button>
            <button className="secondary-btn" onClick={onNext} disabled={!canGoNext}>
              Next
            </button>
            <button className="secondary-btn" onClick={onOpenSetup}>
              Setup
            </button>
            <button
              className={isRecording ? "danger-btn" : "primary-btn"}
              data-tour-id="record-button"
              onClick={onToggleRecording}
              disabled={!activeSegment}
            >
              {isRecording ? "Stop Recording" : "Record"}
            </button>
          </div>

          {activeSegment ? (
            <>
              <div className="segment-readiness segment-readiness--stacked" aria-label="Passage state">
                {getReadiness(activeSegment, segmentRecordings.length).map((item) => (
                  <span key={item.label} className={item.ready ? "readiness-chip readiness-chip--ready" : "readiness-chip"}>
                    {item.label}
                  </span>
                ))}
              </div>
              <label className="field-inline">
                Status
                <select
                  className="text-input"
                  value={activeSegment.status ?? "Needs Work"}
                  onChange={(event) => onUpdateSegment(activeSegment.id, { status: event.target.value })}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>
      </aside>

      <div className="practice-subtabs" role="tablist" aria-label="Practice sections">
        <button
          className={activeSubtab === "passage" ? "practice-subtab practice-subtab--active" : "practice-subtab"}
          type="button"
          role="tab"
          aria-selected={activeSubtab === "passage"}
          onClick={() => setActiveSubtab("passage")}
        >
          Passage
        </button>
        <button
          className={activeSubtab === "takes" ? "practice-subtab practice-subtab--active" : "practice-subtab"}
          type="button"
          role="tab"
          aria-selected={activeSubtab === "takes"}
          onClick={() => setActiveSubtab("takes")}
        >
          Takes
        </button>
        <button
          className={activeSubtab === "notes" ? "practice-subtab practice-subtab--active" : "practice-subtab"}
          type="button"
          role="tab"
          aria-selected={activeSubtab === "notes"}
          onClick={() => setActiveSubtab("notes")}
        >
          Notes
        </button>
      </div>

      <div className="practice-stage">
        {activeSubtab === "passage" ? (
          <div className="practice-screen__score">
            {pdfSrc && activeSegment ? (
              <div className="practice-screen__score-pages">
                {pageWindows.map((pageWindow) => {
                  const pageRect = getSegmentAnnotationRect(activeSegment, pageWindow.pageNumber);
                  const visibleRect = pageRect ? getRectInPageWindow(pageRect, pageWindow) : null;
                  return (
                    <PdfPageCanvas
                      key={pageWindow.pageNumber}
                      className="practice-score-page"
                      doc={doc}
                      pageNumber={pageWindow.pageNumber}
                      scale={2.1}
                      fitToContainer
                      cropLeft={pageWindow.left}
                      cropRight={pageWindow.right}
                      cropTop={pageWindow.top}
                      cropBottom={pageWindow.bottom}
                    >
                      {visibleRect ? <ScoreAnnotation rect={visibleRect} label={activeSegment.name} isActive /> : null}
                    </PdfPageCanvas>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No score available.</div>
            )}
          </div>
        ) : null}

        {activeSubtab === "takes" ? (
          <section className="practice-tab-panel">
            <div className="section-heading">
              <div>
                <h2>Takes</h2>
                <p className="muted">{activeSegment?.name ?? "No passage selected"}</p>
              </div>
            </div>
            {!activeSegment ? (
              <div className="empty-state">Select a passage to review takes.</div>
            ) : segmentRecordings.length === 0 ? (
              <div className="empty-state">No takes for this passage yet.</div>
            ) : (
              <ul className="segment-recording-list">
                {segmentRecordings.map((recording) => (
                  <li key={recording.id} className="segment-recording-list__item">
                    <span>
                      {recording.name}
                      {recording.id === activeRecordingId ? <span className="pill">Active</span> : null}
                    </span>
                    <div className="segment-recording-list__actions">
                      <button className="secondary-btn" onClick={() => onPlayRecording(recording.id)}>
                        Listen
                      </button>
                      <button className="link-btn" onClick={() => onDeleteRecording(recording.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {activeSubtab === "notes" ? (
          <section className="practice-tab-panel">
            <div className="section-heading">
              <div>
                <h2>Notes</h2>
                <p className="muted">{activeSegment?.name ?? "No passage selected"}</p>
              </div>
            </div>
            {activeSegment ? (
              <textarea
                className="notes practice-notes"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={saveNotes}
                placeholder="What changed, what still needs attention, or what to try next."
              />
            ) : (
              <div className="empty-state">Select a passage to write notes.</div>
            )}
          </section>
        ) : null}
      </div>

      {transport ? <div className="practice-transport-dock">{transport}</div> : null}
    </div>
  );
}

function getReadiness(segment: PracticeSegment, recordingCount: number): { label: string; ready: boolean }[] {
  return [
    { label: "Score range", ready: Boolean(segment.startCoordinate && segment.endCoordinate) },
    { label: "Measures", ready: Boolean(segment.measureStart != null || segment.measureEnd != null) },
    { label: "Reference loop", ready: Boolean(segment.referenceStartMs != null && segment.referenceEndMs != null) },
    { label: "Recorded take", ready: recordingCount > 0 },
  ];
}

function formatSegmentLocation(segment: PracticeSegment): string {
  const page =
    segment.startPage === segment.endPage ? `Page ${segment.startPage}` : `Pages ${segment.startPage}-${segment.endPage}`;
  if (segment.measureStart == null && segment.measureEnd == null) {
    return page;
  }
  return `${page}, measures ${segment.measureStart ?? "?"}-${segment.measureEnd ?? "?"}`;
}

function formatTimingRange(segment: PracticeSegment | null): string {
  if (!segment || segment.referenceStartMs == null || segment.referenceEndMs == null) {
    return "Reference not mapped";
  }
  const start = Math.min(segment.referenceStartMs, segment.referenceEndMs) / 1000;
  const end = Math.max(segment.referenceStartMs, segment.referenceEndMs) / 1000;
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
