import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PdfPageCanvas, PdfPageGrid, usePdfDocument, type NormalizedPoint } from "./PdfPageViewer";
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
  const [draftName, setDraftName] = useState("");
  const [editingBoundarySegmentId, setEditingBoundarySegmentId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setDraftStart(null);
    setDraftEnd(null);
    setEditingBoundarySegmentId(null);
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
      return;
    }
    setDraftEnd({ page, point });
    if (!editingBoundarySegmentId) {
      setDraftName(`Segment ${segments.length + 1}`);
    }
  }

  function cancelDraft() {
    setDraftStart(null);
    setDraftEnd(null);
    setDraftName("");
    setEditingBoundarySegmentId(null);
  }

  function startEditingBoundary(segment: PracticeSegment) {
    setEditingBoundarySegmentId(segment.id);
    setDraftStart(null);
    setDraftEnd(null);
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
    if (editingBoundarySegmentId) {
      onUpdateSegment(editingBoundarySegmentId, { startPage, endPage, startCoordinate, endCoordinate });
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

  const instruction = editingBoundarySegmentId
    ? !draftStart
      ? `Click where "${draftName}" should now start.`
      : !draftEnd
        ? `Click again to mark where "${draftName}" should now end.`
        : null
    : !draftStart
      ? "Click on the score to start marking a Practice Segment."
      : !draftEnd
        ? "Click again to mark where this segment ends."
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
            <PdfPageCanvas doc={doc} pageNumber={page} scale={zoom} editable onMark={handleMark}>
              {draftStart && draftStart.page === page ? (
                <span
                  className="segment-pin segment-pin--draft"
                  style={{ left: `${draftStart.point.x * 100}%`, top: `${draftStart.point.y * 100}%` }}
                />
              ) : null}
              {draftEnd && draftEnd.page === page ? (
                <span
                  className="segment-pin segment-pin--draft"
                  style={{ left: `${draftEnd.point.x * 100}%`, top: `${draftEnd.point.y * 100}%` }}
                />
              ) : null}
              {segmentsOnPage.flatMap((segment) => {
                const isActive = segment.id === selectedSegmentId;
                const marks: JSX.Element[] = [];
                if (segment.startPage === page && segment.startCoordinate) {
                  marks.push(
                    <SegmentSplitMark
                      key={`${segment.id}-start`}
                      segment={segment}
                      number={segmentNumbers.get(segment.id) ?? 0}
                      point={segment.startCoordinate}
                      label={`${segment.name} · start`}
                      isActive={isActive}
                      onSelect={() => onSelectSegment(segment.id)}
                    />,
                  );
                }
                if (segment.endPage === page && segment.endCoordinate) {
                  marks.push(
                    <SegmentSplitMark
                      key={`${segment.id}-end`}
                      segment={segment}
                      number={segmentNumbers.get(segment.id) ?? 0}
                      point={segment.endCoordinate}
                      label={`${segment.name} · end`}
                      isActive={isActive}
                      onSelect={() => onSelectSegment(segment.id)}
                    />,
                  );
                }
                return marks;
              })}
            </PdfPageCanvas>
          )}
          {segments.length === 0 && pdfSrc ? (
            <div className="setup-empty-banner">Click on the score to create your first Practice Segment.</div>
          ) : null}
        </div>

        {draftStart && draftEnd ? (
          <div className="segment-draft-form">
            {editingBoundarySegmentId ? (
              <p className="muted">Redefining boundaries for "{draftName}".</p>
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
                {editingBoundarySegmentId ? "Save boundaries" : "Create segment"}
              </button>
              <button className="secondary-btn" onClick={cancelDraft}>
                Cancel
              </button>
            </div>
          </div>
        ) : editingBoundarySegmentId ? (
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
            <h2>Practice Segments</h2>
            <p className="muted">{segments.length}</p>
          </div>
          <div className="stack">
            {segments.length === 0 ? (
              <p className="muted">No segments yet. Click on the score to create one.</p>
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
                  onEditBoundary={() => startEditingBoundary(segment)}
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

function SegmentSplitMark({
  segment,
  number,
  point,
  label,
  isActive,
  onSelect,
}: {
  segment: PracticeSegment;
  number: number;
  point: NormalizedPoint;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className={isActive ? "segment-split-bar segment-split-bar--active" : "segment-split-bar"}
        style={{ top: `${point.y * 100}%` }}
        title={segment.name}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <span className="segment-split-bar__badge">{number}</span>
      </button>
      <span className="segment-split-label" style={{ top: `${point.y * 100}%` }}>
        {label}
      </span>
      <button
        type="button"
        className={isActive ? "segment-pin segment-pin--active" : "segment-pin"}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        title={segment.name}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      />
    </>
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
  onEditBoundary,
}: {
  segment: PracticeSegment;
  number: number;
  references: ReferenceAsset[];
  isActive: boolean;
  onSelect: () => void;
  onPatch: (patch: SegmentPatch) => void;
  onDelete: () => void;
  onEditBoundary: () => void;
}) {
  const [name, setName] = useState(segment.name);
  const [notes, setNotes] = useState(segment.notes ?? "");
  const [startSeconds, setStartSeconds] = useState(msToSeconds(segment.referenceStartMs));
  const [endSeconds, setEndSeconds] = useState(msToSeconds(segment.referenceEndMs));

  useEffect(() => {
    setName(segment.name);
    setNotes(segment.notes ?? "");
    setStartSeconds(msToSeconds(segment.referenceStartMs));
    setEndSeconds(msToSeconds(segment.referenceEndMs));
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
      <div className="bookmark-form__row" onClick={(event) => event.stopPropagation()}>
        <label>
          Start (s)
          <input
            className="text-input"
            type="number"
            min={0}
            value={startSeconds}
            onChange={(event) => setStartSeconds(event.target.value)}
            onBlur={() => onPatch({ referenceStartMs: secondsToMs(startSeconds) })}
          />
        </label>
        <label>
          End (s)
          <input
            className="text-input"
            type="number"
            min={0}
            value={endSeconds}
            onChange={(event) => setEndSeconds(event.target.value)}
            onBlur={() => onPatch({ referenceEndMs: secondsToMs(endSeconds) })}
          />
        </label>
      </div>
      <textarea
        className="notes notes--compact"
        value={notes}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => onPatch({ notes: notes.trim() || null })}
        placeholder="Practice notes for this segment."
      />
      <div className="bookmark-actions" onClick={(event) => event.stopPropagation()}>
        <button className="secondary-btn" onClick={onEditBoundary}>
          Redefine boundaries
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

function msToSeconds(value: number | null): string {
  return value == null ? "" : String(Math.round(value / 1000));
}

function secondsToMs(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : null;
}
