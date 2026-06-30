import { useEffect, useState } from "react";
import type { Bookmark, ScoreAsset } from "../lib/types";

type Props = {
  score: ScoreAsset | null;
  bookmarks: Bookmark[];
  currentMeasure: number;
  totalMeasures: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onMeasureClick: (measureNumber: number) => void;
};

export function ScorePanel({
  score,
  bookmarks,
  currentMeasure,
  totalMeasures,
  zoom,
  onZoomChange,
  onMeasureClick,
}: Props) {
  const safeMeasureCount = Math.max(totalMeasures, 1);
  const pageSize = Math.max(8, Math.round(16 * zoom));
  const totalPages = Math.max(1, Math.ceil(safeMeasureCount / pageSize));
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(Math.min(totalPages - 1, Math.max(0, Math.floor((currentMeasure - 1) / pageSize))));
  }, [currentMeasure, pageSize, totalPages]);

  const startMeasure = pageIndex * pageSize + 1;
  const endMeasure = Math.min(safeMeasureCount, startMeasure + pageSize - 1);
  const measures = Array.from({ length: endMeasure - startMeasure + 1 }, (_, index) => startMeasure + index);

  return (
    <section className="panel panel--score">
      <div className="panel__header">
        <div>
          <h2>Score</h2>
          <p className="muted">
            {score ? `${score.fileName} · ${score.measureCount} measures` : "Import a MusicXML score to begin."}
          </p>
        </div>
        <div className="score-toolbar">
          <label className="field-inline field-inline--compact">
            Zoom
            <input
              className="text-input text-input--narrow"
              type="range"
              min={0.75}
              max={1.75}
              step={0.05}
              value={zoom}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
          </label>
          <div className="page-nav">
            <button className="secondary-btn" onClick={() => setPageIndex((value) => Math.max(0, value - 1))} disabled={pageIndex === 0}>
              Prev
            </button>
            <span className="muted">
              Measures {startMeasure}-{endMeasure} of {safeMeasureCount}
            </span>
            <button
              className="secondary-btn"
              onClick={() => setPageIndex((value) => Math.min(totalPages - 1, value + 1))}
              disabled={pageIndex >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <div className="score-preview">
        <div className="score-preview__sheet">
          <div className="score-preview__meta">
            <span className="pill">Measure-based navigation</span>
            <span className="pill">{score ? score.format.toUpperCase() : "No score"}</span>
            <span className="pill">{bookmarkCountLabel(bookmarks)}</span>
          </div>
          <pre className="score-preview__text">{score?.previewText ?? "No score loaded yet."}</pre>
        </div>
        <aside className="score-preview__measures">
          <div className="panel__subheader">
            <h3>Measures</h3>
            <p className="muted">Click any measure to jump there.</p>
          </div>
          <div className="measure-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(48 * zoom)}px, 1fr))` }}>
            {measures.map((measureNumber) => {
              const bookmark = findBookmarkForMeasure(bookmarks, measureNumber);
              return (
                <button
                  key={measureNumber}
                  className={measureChipClass(measureNumber === currentMeasure, bookmark?.status)}
                  onClick={() => onMeasureClick(measureNumber)}
                  aria-current={measureNumber === currentMeasure ? "true" : undefined}
                  title={
                    bookmark
                      ? `${bookmark.label} · M${bookmark.measureStart}-M${bookmark.measureEnd} · ${bookmark.status}`
                      : `Jump to measure ${measureNumber}`
                  }
                >
                  {measureNumber}
                  {bookmark ? <span className={`measure-chip__flag measure-chip__flag--${normalizeStatus(bookmark.status)}`} /> : null}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

function findBookmarkForMeasure(bookmarks: Bookmark[], measureNumber: number): Bookmark | null {
  const matches = bookmarks.filter(
    (bookmark) => measureNumber >= bookmark.measureStart && measureNumber <= bookmark.measureEnd,
  );
  if (matches.length === 0) {
    return null;
  }
  return [...matches].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

function measureChipClass(isCurrent: boolean, status?: string): string {
  const base = isCurrent ? "measure-chip measure-chip--active" : "measure-chip";
  if (!status) {
    return base;
  }
  return `${base} measure-chip--${normalizeStatus(status)}`;
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

function bookmarkCountLabel(bookmarks: Bookmark[]): string {
  const count = bookmarks.length;
  return `${count} bookmark${count === 1 ? "" : "s"}`;
}
