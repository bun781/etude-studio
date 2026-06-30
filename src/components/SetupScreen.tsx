import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PdfPageCanvas, PdfPageGrid, usePdfDocument, type NormalizedPoint } from "./PdfPageViewer";
import { ScoreAnnotation, getDraftAnnotationRect, getSegmentAnnotationRect } from "./ScoreAnnotation";
import type { PracticeSegment, ProjectSummary, ReferenceAsset } from "../lib/types";

export type SegmentCreateDraft = {
  name: string;
  startPage: number;
  endPage: number;
  startCoordinate: NormalizedPoint;
  endCoordinate: NormalizedPoint;
};

export type SegmentPatch = {
  name?: string;
  status?: string | null;
  notes?: string | null;
  referenceId?: string | null;
  referenceStartMs?: number | null;
  referenceEndMs?: number | null;
  measureStart?: number | null;
  measureEnd?: number | null;
  startPage?: number;
  endPage?: number;
  startCoordinate?: NormalizedPoint;
  endCoordinate?: NormalizedPoint;
};

type Props = {
  project: ProjectSummary;
  projectNameDraft: string;
  setProjectNameDraft: (value: string) => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
  pdfSrc: string | null;
  segments: PracticeSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  onCreateSegment: (draft: SegmentCreateDraft) => void;
  onUpdateSegment: (segmentId: string, patch: SegmentPatch) => void;
  onDeleteSegment: (segmentId: string) => void;
  references: ReferenceAsset[];
  onImportScore: () => void;
  onImportReference: () => void;
  onOpenPractice: () => void;
  noteText: string;
  onNoteChange: (text: string) => void;
  transport: ReactNode;
};

const STATUS_OPTIONS = ["Needs Work", "In Progress", "Polished"];

export function SetupScreen({
  project,
  projectNameDraft,
  setProjectNameDraft,
  onRenameProject,
  onDeleteProject,
  pdfSrc,
  segments,
  selectedSegmentId,
  onSelectSegment,
  onCreateSegment,
  onUpdateSegment,
  onDeleteSegment,
  references,
  onImportScore,
  onImportReference,
  onOpenPractice,
  noteText,
  onNoteChange,
  transport,
}: Props) {
  const { doc, numPages, error } = usePdfDocument(pdfSrc);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.1);
  const [showGrid, setShowGrid] = useState(false);
  const [draftStart, setDraftStart] = useState<{ page: number; point: NormalizedPoint } | null>(null);
  const [draftEnd, setDraftEnd] = useState<{ page: number; point: NormalizedPoint } | null>(null);
  const [draftPreview, setDraftPreview] = useState<{ page: number; point: NormalizedPoint } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingAnnotationSegmentId, setEditingAnnotationSegmentId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setDraftStart(null);
    setDraftEnd(null);
    setDraftPreview(null);
    setEditingAnnotationSegmentId(null);
  }, [pdfSrc]);

  const segmentsOnPage = useMemo(
    () => segments.filter((segment) => segment.startPage <= page && segment.endPage >= page),
    [segments, page],
  );

  const segmentNumbers = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((segment, index) => map.set(segment.id, index + 1));
    return map;
  }, [segments]);

  function handleMark(point: NormalizedPoint) {
    if (!draftStart) {
      setDraftStart({ page, point });
      setDraftPreview({ page, point });
      return;
    }
    setDraftEnd({ page, point });
    setDraftPreview(null);
    if (!editingAnnotationSegmentId) {
      setDraftName(`Segment ${segments.length + 1}`);
    }
  }

  function cancelDraft() {
    setDraftStart(null);
    setDraftEnd(null);
    setDraftPreview(null);
    setDraftName("");
    setEditingAnnotationSegmentId(null);
  }

  function startEditingAnnotation(segment: PracticeSegment) {
    setEditingAnnotationSegmentId(segment.id);
    setDraftStart(null);
    setDraftEnd(null);
    setDraftPreview(null);
    setDraftName(segment.name);
    setPage(segment.startPage);
    setShowGrid(false);
  }

  function confirmDraft() {
    if (!draftStart || !draftEnd) {
      return;
    }
    const swap = draftEnd.page < draftStart.page;
    const startPage = swap ? draftEnd.page : draftStart.page;
    const endPage = swap ? draftStart.page : draftEnd.page;
    const startCoordinate = swap ? draftEnd.point : draftStart.point;
    const endCoordinate = swap ? draftStart.point : draftEnd.point;
    if (editingAnnotationSegmentId) {
      onUpdateSegment(editingAnnotationSegmentId, { startPage, endPage, startCoordinate, endCoordinate });
    } else {
      onCreateSegment({
        name: draftName.trim() || `Segment ${segments.length + 1}`,
        startPage,
        endPage,
        startCoordinate,
        endCoordinate,
      });
    }
    cancelDraft();
  }

  const instruction = editingAnnotationSegmentId
    ? !draftStart
      ? `Click one corner of the new highlight for "${draftName}".`
      : !draftEnd
        ? `Click the opposite corner to redraw "${draftName}".`
        : null
    : !draftStart
      ? "Click one corner of the passage you want to practice."
      : !draftEnd
        ? "Click the opposite corner to create a highlighted passage."
        : null;

  return (
    <div className="setup-screen" data-tour-id="setup-screen">
      <div className="setup-screen__main">
        <div className="setup-toolbar">
          <div>
            <h2>Piece Setup</h2>
            <p className="muted">{instruction ?? "Name and save the segment below."}</p>
          </div>
          <div className="setup-toolbar__controls">
            <label className="field-inline field-inline--compact">
              Zoom
              <input
                className="text-input text-input--narrow"
                type="range"
                min={0.6}
                max={2}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <button className="secondary-btn" onClick={() => setShowGrid((value) => !value)} disabled={!doc}>
              {showGrid ? "Single page" : "Page overview"}
            </button>
            {!showGrid ? (
              <div className="page-nav">
                <button className="secondary-btn" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                  Prev
                </button>
                <span className="muted">
                  Page {page} of {numPages || 1}
                </span>
                <button
                  className="secondary-btn"
                  onClick={() => setPage((value) => Math.min(numPages || 1, value + 1))}
                  disabled={page >= numPages}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="setup-score">
          {!pdfSrc ? (
            <div className="empty-state">Import a PDF score to begin.</div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : showGrid ? (
            <PdfPageGrid
              doc={doc}
              numPages={numPages}
              activePage={page}
              onSelectPage={(nextPage) => {
                setPage(nextPage);
                setShowGrid(false);
              }}
            />
          ) : (
            <PdfPageCanvas
              doc={doc}
              pageNumber={page}
              scale={zoom}
              editable
              onMark={handleMark}
              onPointPreview={(point) => {
                if (!draftStart || draftEnd) {
                  return;
                }
                setDraftPreview(point ? { page, point } : null);
              }}
            >
              {(() => {
                const draftRect = getDraftAnnotationRect(page, draftStart, draftEnd ?? draftPreview);
                return draftRect ? (
                  <ScoreAnnotation rect={draftRect} label={editingAnnotationSegmentId ? "Redrawn highlight" : "New passage"} isDraft />
                ) : null;
              })()}
              {segmentsOnPage.map((segment) => {
                const isActive = segment.id === selectedSegmentId;
                const rect = getSegmentAnnotationRect(segment, page);
                return rect ? (
                  <ScoreAnnotation
                    key={segment.id}
                    rect={rect}
                    number={segmentNumbers.get(segment.id) ?? 0}
                    label={segment.name}
                    isActive={isActive}
                    onSelect={() => onSelectSegment(segment.id)}
                  />
                ) : null;
              })}
            </PdfPageCanvas>
          )}
          {segments.length === 0 && pdfSrc ? (
            <div className="setup-empty-banner">Click two corners on the score to highlight your first passage.</div>
          ) : null}
        </div>

        {draftStart && draftEnd ? (
          <div className="segment-draft-form">
            {editingAnnotationSegmentId ? (
              <p className="muted">Redrawing the score highlight for "{draftName}".</p>
            ) : (
              <input
                className="text-input"
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Name this segment"
              />
            )}
            <div className="bookmark-actions">
              <button className="primary-btn" onClick={confirmDraft}>
                {editingAnnotationSegmentId ? "Save highlight" : "Create segment"}
              </button>
              <button className="secondary-btn" onClick={cancelDraft}>
                Cancel
              </button>
            </div>
          </div>
        ) : editingAnnotationSegmentId ? (
          <div className="segment-draft-form">
            <p className="muted">{instruction}</p>
            <div className="bookmark-actions">
              <button className="secondary-btn" onClick={cancelDraft}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="setup-sidebar">
        <section className="panel" data-tour-id="project-meta-panel">
          <div className="panel__header">
            <h2>Piece</h2>
          </div>
          <div className="stack">
            <input
              className="text-input"
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
            />
            <p className="muted">{project.rootPath}</p>
            <div className="bookmark-actions">
              <button className="secondary-btn" onClick={onRenameProject}>
                Rename
              </button>
              <button className="danger-btn" onClick={onDeleteProject}>
                Delete project
              </button>
            </div>
            <div className="bookmark-actions">
              <button className="secondary-btn" onClick={onImportScore}>
                Import score
              </button>
              <button className="secondary-btn" onClick={onImportReference}>
                Import reference
              </button>
            </div>
            <textarea
              className="notes notes--compact"
              value={noteText}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Teacher feedback or general practice notes for this piece."
            />
          </div>
        </section>

        <section className="panel" data-tour-id="segments-panel">
          <div className="panel__header">
            <div>
              <h2>Practice Segments</h2>
              <p className="muted">{segments.length} passage{segments.length === 1 ? "" : "s"}</p>
            </div>
            <button className="secondary-btn" onClick={onOpenPractice} disabled={segments.length === 0}>
              Practice selected
            </button>
          </div>
          <div className="stack">
            {segments.length === 0 ? (
              <p className="muted">No segments yet. Click two corners on the score to highlight one.</p>
            ) : (
              segments.map((segment) => (
                <SegmentEditorCard
                  key={segment.id}
                  segment={segment}
                  number={segmentNumbers.get(segment.id) ?? 0}
                  references={references}
                  isActive={segment.id === selectedSegmentId}
                  onSelect={() => onSelectSegment(segment.id)}
                  onPatch={(patch) => onUpdateSegment(segment.id, patch)}
                  onDelete={() => onDeleteSegment(segment.id)}
                  onEditAnnotation={() => startEditingAnnotation(segment)}
                />
              ))
            )}
          </div>
        </section>

        {transport}
      </aside>
    </div>
  );
}

function SegmentEditorCard({
  segment,
  number,
  references,
  isActive,
  onSelect,
  onPatch,
  onDelete,
  onEditAnnotation,
}: {
  segment: PracticeSegment;
  number: number;
  references: ReferenceAsset[];
  isActive: boolean;
  onSelect: () => void;
  onPatch: (patch: SegmentPatch) => void;
  onDelete: () => void;
  onEditAnnotation: () => void;
}) {
  const [name, setName] = useState(segment.name);
  const [notes, setNotes] = useState(segment.notes ?? "");
  const [measureStart, setMeasureStart] = useState(numberToInput(segment.measureStart));
  const [measureEnd, setMeasureEnd] = useState(numberToInput(segment.measureEnd));

  useEffect(() => {
    setName(segment.name);
    setNotes(segment.notes ?? "");
    setMeasureStart(numberToInput(segment.measureStart));
    setMeasureEnd(numberToInput(segment.measureEnd));
  }, [segment]);

  return (
    <div className={isActive ? "list-card list-card--active" : "list-card"} onClick={onSelect}>
      <div className="list-card__title-row">
        <span className="segment-number-badge">{number}</span>
        <input
          className="text-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name.trim() && name !== segment.name && onPatch({ name: name.trim() })}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
      <p className="muted">
        Page {segment.startPage === segment.endPage ? segment.startPage : `${segment.startPage}-${segment.endPage}`}
      </p>
      <div className="bookmark-form__row" onClick={(event) => event.stopPropagation()}>
        <label>
          First measure
          <input
            className="text-input"
            type="number"
            min={1}
            value={measureStart}
            onChange={(event) => setMeasureStart(event.target.value)}
            onBlur={() => onPatch({ measureStart: inputToNumber(measureStart) })}
          />
        </label>
        <label>
          Last measure
          <input
            className="text-input"
            type="number"
            min={1}
            value={measureEnd}
            onChange={(event) => setMeasureEnd(event.target.value)}
            onBlur={() => onPatch({ measureEnd: inputToNumber(measureEnd) })}
          />
        </label>
      </div>
      <label className="field-inline field-inline--compact" onClick={(event) => event.stopPropagation()}>
        Status
        <select
          className="text-input"
          value={segment.status ?? "Needs Work"}
          onChange={(event) => onPatch({ status: event.target.value })}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="field-inline field-inline--compact" onClick={(event) => event.stopPropagation()}>
        Reference
        <select
          className="text-input"
          value={segment.referenceId ?? ""}
          onChange={(event) => onPatch({ referenceId: event.target.value || null })}
        >
          <option value="">None</option>
          {references.map((reference) => (
            <option key={reference.id} value={reference.id}>
              {reference.name}
            </option>
          ))}
        </select>
      </label>
      <p className="segment-audio-summary">{formatTimingRange(segment)}</p>
      <textarea
        className="notes notes--compact"
        value={notes}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => onPatch({ notes: notes.trim() || null })}
        placeholder="Practice notes for this segment."
      />
      <div className="bookmark-actions" onClick={(event) => event.stopPropagation()}>
        <button className="secondary-btn" onClick={onEditAnnotation}>
          Redraw highlight
        </button>
        <button
          className="link-btn"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete segment
        </button>
      </div>
    </div>
  );
}

function numberToInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function inputToNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null;
}

function formatTimingRange(segment: PracticeSegment): string {
  if (segment.referenceStartMs == null || segment.referenceEndMs == null) {
    return "Reference timing: not mapped yet";
  }
  const start = Math.min(segment.referenceStartMs, segment.referenceEndMs) / 1000;
  const end = Math.max(segment.referenceStartMs, segment.referenceEndMs) / 1000;
  return `Reference timing: ${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
