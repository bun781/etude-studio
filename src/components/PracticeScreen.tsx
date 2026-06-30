import type { ReactNode } from "react";
import { PdfPageCanvas, usePdfDocument } from "./PdfPageViewer";
import type { PracticeSegment, RecordingAttempt } from "../lib/types";

type Props = {
  pdfSrc: string | null;
  segments: PracticeSegment[];
  activeSegment: PracticeSegment | null;
  segmentRecordings: RecordingAttempt[];
  onPrev: () => void;
  onNext: () => void;
  onOpenSetup: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  onDeleteRecording: (recordingId: string) => void;
  transport: ReactNode;
};

export function PracticeScreen({
  pdfSrc,
  segments,
  activeSegment,
  segmentRecordings,
  onPrev,
  onNext,
  onOpenSetup,
  isRecording,
  onToggleRecording,
  onDeleteRecording,
  transport,
}: Props) {
  const { doc } = usePdfDocument(pdfSrc);
  const pageCrops = getSegmentPageCrops(activeSegment);

  if (segments.length === 0) {
    return (
      <section className="journal-panel">
        <div className="empty-state">
          <p>Click on the score to create your first Practice Segment.</p>
          <button className="primary-btn" onClick={onOpenSetup}>
            Open Piece Setup
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="practice-screen" data-tour-id="practice-screen">
      <div className="practice-screen__switcher">
        <button className="secondary-btn" onClick={onPrev}>
          Prev
        </button>
        <div className="practice-screen__current">
          <strong>{activeSegment?.name ?? "Select a segment"}</strong>
          {activeSegment?.status ? <span className="pill">{activeSegment.status}</span> : null}
        </div>
        <button className="secondary-btn" onClick={onNext}>
          Next
        </button>
        <button
          className={isRecording ? "danger-btn" : "primary-btn"}
          data-tour-id="record-button"
          onClick={onToggleRecording}
        >
          {isRecording ? "Stop Recording" : "Record"}
        </button>
      </div>

      <div className="practice-screen__score">
        {pdfSrc && activeSegment ? (
          <div className="practice-screen__score-pages">
            {pageCrops.map((pageCrop) => (
              <PdfPageCanvas
                key={pageCrop.pageNumber}
                doc={doc}
                pageNumber={pageCrop.pageNumber}
                scale={1.4}
                cropTop={pageCrop.top}
                cropBottom={pageCrop.bottom}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">No score available.</div>
        )}
      </div>

      {transport}

      {activeSegment ? (
        <section className="journal-panel">
          <h3>Recordings for this segment</h3>
          {segmentRecordings.length === 0 ? (
            <p className="muted">No takes recorded for this segment yet.</p>
          ) : (
            <ul className="segment-recording-list">
              {segmentRecordings.map((recording) => (
                <li key={recording.id} className="segment-recording-list__item">
                  <span>{recording.name}</span>
                  <button className="link-btn" onClick={() => onDeleteRecording(recording.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeSegment?.notes ? (
        <section className="journal-panel">
          <h3>Notes</h3>
          <p>{activeSegment.notes}</p>
        </section>
      ) : null}
    </div>
  );
}

type PageCrop = { pageNumber: number; top: number; bottom: number };

const CROP_PADDING = 0.04;

function getSegmentPageCrops(segment: PracticeSegment | null): PageCrop[] {
  if (!segment) {
    return [];
  }
  const { startCoordinate, endCoordinate } = segment;

  if (segment.startPage === segment.endPage) {
    if (!startCoordinate || !endCoordinate) {
      return [{ pageNumber: segment.startPage, top: 0, bottom: 1 }];
    }
    const top = Math.max(0, Math.min(startCoordinate.y, endCoordinate.y) - CROP_PADDING);
    const bottom = Math.min(1, Math.max(startCoordinate.y, endCoordinate.y) + CROP_PADDING);
    if (bottom - top < 0.05) {
      return [{ pageNumber: segment.startPage, top: 0, bottom: 1 }];
    }
    return [{ pageNumber: segment.startPage, top, bottom }];
  }

  const crops: PageCrop[] = [];
  for (let pageNumber = segment.startPage; pageNumber <= segment.endPage; pageNumber += 1) {
    if (pageNumber === segment.startPage) {
      const top = startCoordinate ? Math.max(0, startCoordinate.y - CROP_PADDING) : 0;
      crops.push({ pageNumber, top, bottom: 1 });
    } else if (pageNumber === segment.endPage) {
      const bottom = endCoordinate ? Math.min(1, endCoordinate.y + CROP_PADDING) : 1;
      crops.push({ pageNumber, top: 0, bottom });
    } else {
      crops.push({ pageNumber, top: 0, bottom: 1 });
    }
  }
  return crops;
}
