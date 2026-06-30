import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { PracticeSegment, RecordingAttempt, ReferenceAsset } from "../lib/types";

type BoundaryEdge = "start" | "end";
type CompareMode = "reference" | "recording";

type Props = {
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  currentTime: number;
  zoom: number;
  segments: PracticeSegment[];
  activeSegment: PracticeSegment | null;
  activeSegmentId: string | null;
  activeSegmentRecordingCount: number;
  isLooping: boolean;
  activeSourceLabel: string;
  compareMode: CompareMode;
  selectedReference: ReferenceAsset | null;
  selectedRecording: RecordingAttempt | null;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onZoomChange: (zoom: number) => void;
  onCompareModeChange: (mode: CompareMode) => void;
  onSelectSegment: (segmentId: string) => void;
  onToggleLoop: () => void;
  onSetSegmentBoundary: (edge: BoundaryEdge, time: number) => void;
};

type TimelineInteraction =
  | { kind: "seek"; pointerId: number }
  | { kind: "boundary"; pointerId: number; edge: BoundaryEdge };

export function TransportPanel({
  isPlaying,
  playbackRate,
  duration,
  currentTime,
  zoom,
  segments,
  activeSegment,
  activeSegmentId,
  activeSegmentRecordingCount,
  isLooping,
  activeSourceLabel,
  compareMode,
  selectedReference,
  selectedRecording,
  onPlayPause,
  onStop,
  onSeek,
  onSpeedChange,
  onZoomChange,
  onCompareModeChange,
  onSelectSegment,
  onToggleLoop,
  onSetSegmentBoundary,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<TimelineInteraction | null>(null);
  const [draftBoundary, setDraftBoundary] = useState<{ edge: BoundaryEdge; time: number } | null>(null);

  const safeDuration = Math.max(duration, 1);
  const hasAudio = duration > 0;
  const positionPct = secondsToPct(currentTime, safeDuration);
  const contentWidth = Math.max(760, Math.round(safeDuration * 132 * zoom));
  const canEditTiming = Boolean(activeSegment && selectedReference && compareMode === "reference" && hasAudio);
  const activeTiming = getDisplayTiming(activeSegment, draftBoundary);
  const canLoop = Boolean(compareMode === "reference" && activeTiming.startMs != null && activeTiming.endMs != null);
  const segmentRanges = useMemo(
    () =>
      segments
        .map((segment) => {
          const range = normalizeMsRange(segment.referenceStartMs, segment.referenceEndMs);
          if (!range) {
            return null;
          }
          return {
            segment,
            startSeconds: range.startMs / 1000,
            endSeconds: range.endMs / 1000,
            left: secondsToPct(range.startMs / 1000, safeDuration),
            width: Math.max(0.4, secondsToPct((range.endMs - range.startMs) / 1000, safeDuration)),
          };
        })
        .filter((range): range is NonNullable<typeof range> => range != null),
    [segments, safeDuration],
  );

  const readiness = getReadiness(activeSegment, selectedReference, activeSegmentRecordingCount);
  const timelineHint = getTimelineHint({
    activeSegment,
    canEditTiming,
    compareMode,
    hasAudio,
    isDragging: interaction?.kind === "boundary",
    selectedReference,
  });

  function timeFromPointer(event: PointerEvent<HTMLElement>): number {
    const track = trackRef.current;
    if (!track) {
      return currentTime;
    }
    const bounds = track.getBoundingClientRect();
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
    return clamp(ratio * safeDuration, 0, safeDuration);
  }

  function beginSeek(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !hasAudio) {
      return;
    }
    const time = timeFromPointer(event);
    onSeek(time);
    setInteraction({ kind: "seek", pointerId: event.pointerId });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginBoundaryDrag(edge: BoundaryEdge, event: PointerEvent<HTMLButtonElement>) {
    if (!canEditTiming) {
      return;
    }
    event.stopPropagation();
    const startingTime = boundarySeconds(activeTiming, edge) ?? currentTime;
    setDraftBoundary({ edge, time: startingTime });
    setInteraction({ kind: "boundary", edge, pointerId: event.pointerId });
    trackRef.current?.setPointerCapture(event.pointerId);
  }

  function continueInteraction(event: PointerEvent<HTMLDivElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    const time = timeFromPointer(event);
    if (interaction.kind === "seek") {
      onSeek(time);
      return;
    }
    setDraftBoundary({ edge: interaction.edge, time });
  }

  function endInteraction(event: PointerEvent<HTMLDivElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    if (interaction.kind === "boundary" && draftBoundary) {
      onSetSegmentBoundary(interaction.edge, draftBoundary.time);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteraction(null);
    setDraftBoundary(null);
  }

  return (
    <section className="panel panel--transport" data-tour-id="transport-panel">
      <div className="panel__header transport-panel__header">
        <div>
          <h2>Passage Timeline</h2>
          <p className="muted">{activeSourceLabel}</p>
        </div>
        <div className="transport-meta">
          <span className="pill">{compareMode === "reference" ? "Reference" : "Recording"}</span>
          <span className="pill">{isPlaying ? "Playing" : "Paused"}</span>
        </div>
      </div>

      <div className="transport-segment">
        <div className="transport-segment__identity">
          <p className="eyebrow">Active passage</p>
          <strong>{activeSegment?.name ?? "No passage selected"}</strong>
          <span className="muted">{activeSegment ? formatSegmentLocation(activeSegment) : "Create or select a passage first."}</span>
        </div>
        <div className="transport-segment__range">
          <span>{formatTimingRange(activeSegment)}</span>
          <span className="muted">{activeSegmentRecordingCount} take{activeSegmentRecordingCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="segment-readiness" aria-label="Passage readiness">
        {readiness.map((item) => (
          <span key={item.label} className={item.ready ? "readiness-chip readiness-chip--ready" : "readiness-chip"}>
            {item.label}
          </span>
        ))}
      </div>

      <div className="timeline">
        <div className="timeline__controls">
          <label className="field-inline field-inline--compact">
            Zoom
            <input
              className="text-input text-input--narrow"
              type="range"
              min={0.8}
              max={2.2}
              step={0.05}
              value={zoom}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
          </label>
          <div className="timeline__readout">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="timeline__viewport">
          <div
            ref={trackRef}
            className="timeline__rail"
            style={{ width: `${contentWidth}px` }}
            onPointerDown={beginSeek}
            onPointerMove={continueInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          >
            <div className="timeline__grid" aria-hidden="true">
              {Array.from({ length: Math.max(1, Math.ceil(safeDuration / 5) + 1) }, (_, index) => {
                const second = index * 5;
                const left = Math.min((second / safeDuration) * 100, 100);
                return (
                  <span key={second} className="timeline__grid-line" style={{ left: `${left}%` }}>
                    <span className="timeline__grid-label">{formatTime(second)}</span>
                  </span>
                );
              })}
            </div>

            {segmentRanges.map(({ segment, left, width }) => (
              <button
                key={segment.id}
                type="button"
                className={
                  segment.id === activeSegmentId ? "timeline__segment timeline__segment--active" : "timeline__segment"
                }
                style={{ left: `${left}%`, width: `${width}%` }}
                title={segment.name}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectSegment(segment.id);
                }}
              >
                <span className="timeline__segment-label">{segment.name}</span>
              </button>
            ))}

            {activeTiming.startMs != null && activeTiming.endMs != null ? (
              <div
                className="timeline__active-range"
                style={rangeStyle(activeTiming.startMs / 1000, activeTiming.endMs / 1000, safeDuration)}
                aria-hidden="true"
              />
            ) : null}

            {activeTiming.startMs != null ? (
              <BoundaryHandle
                edge="start"
                timeSeconds={activeTiming.startMs / 1000}
                safeDuration={safeDuration}
                disabled={!canEditTiming}
                onPointerDown={beginBoundaryDrag}
              />
            ) : null}
            {activeTiming.endMs != null ? (
              <BoundaryHandle
                edge="end"
                timeSeconds={activeTiming.endMs / 1000}
                safeDuration={safeDuration}
                disabled={!canEditTiming}
                onPointerDown={beginBoundaryDrag}
              />
            ) : null}

            <button
              type="button"
              className="timeline__playhead"
              style={{ left: `${positionPct}%` }}
              aria-label="Playback position"
            />
          </div>
        </div>

        <div className="timeline__labels">
          <span>Current {formatTime(currentTime)}</span>
          <span>{timelineHint}</span>
        </div>
      </div>

      <div className="transport-row">
        <button className="primary-btn" data-tour-id="play-button" onClick={onPlayPause} disabled={!hasAudio}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button className="secondary-btn" onClick={onStop} disabled={!hasAudio}>
          Stop
        </button>
        <button className={isLooping ? "primary-btn" : "secondary-btn"} onClick={onToggleLoop} disabled={!canLoop}>
          {isLooping ? "Loop on" : "Loop passage"}
        </button>
        <button className="secondary-btn" onClick={() => onSetSegmentBoundary("start", currentTime)} disabled={!canEditTiming}>
          Start here
        </button>
        <button className="secondary-btn" onClick={() => onSetSegmentBoundary("end", currentTime)} disabled={!canEditTiming}>
          End here
        </button>
        <label className="field-inline" data-tour-id="compare-select">
          Speed
          <input
            className="text-input text-input--narrow"
            type="number"
            min={0.5}
            max={2}
            step={0.05}
            value={playbackRate}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          />
        </label>
        <label className="field-inline">
          Compare
          <select
            className="text-input text-input--narrow"
            value={compareMode}
            onChange={(event) => onCompareModeChange(event.target.value as CompareMode)}
          >
            <option value="reference">Reference</option>
            <option value="recording">Recording</option>
          </select>
        </label>
      </div>

      <div className="compare-summary">
        <div>
          <p className="eyebrow">Reference</p>
          <p>{selectedReference?.name ?? "None selected"}</p>
        </div>
        <div>
          <p className="eyebrow">Recording</p>
          <p>{selectedRecording?.name ?? "None selected"}</p>
        </div>
      </div>
    </section>
  );
}

function BoundaryHandle({
  edge,
  timeSeconds,
  safeDuration,
  disabled,
  onPointerDown,
}: {
  edge: BoundaryEdge;
  timeSeconds: number;
  safeDuration: number;
  disabled: boolean;
  onPointerDown: (edge: BoundaryEdge, event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={`timeline__boundary timeline__boundary--${edge}`}
      style={{ left: `${secondsToPct(timeSeconds, safeDuration)}%` }}
      disabled={disabled}
      aria-label={`${edge} of active passage`}
      onPointerDown={(event) => onPointerDown(edge, event)}
    >
      <span>{edge === "start" ? "In" : "Out"}</span>
    </button>
  );
}

function getDisplayTiming(
  segment: PracticeSegment | null,
  draftBoundary: { edge: BoundaryEdge; time: number } | null,
): { startMs: number | null; endMs: number | null } {
  if (!segment) {
    return { startMs: null, endMs: null };
  }
  return {
    startMs: draftBoundary?.edge === "start" ? Math.round(draftBoundary.time * 1000) : segment.referenceStartMs,
    endMs: draftBoundary?.edge === "end" ? Math.round(draftBoundary.time * 1000) : segment.referenceEndMs,
  };
}

function getReadiness(
  segment: PracticeSegment | null,
  selectedReference: ReferenceAsset | null,
  recordingCount: number,
): { label: string; ready: boolean }[] {
  return [
    { label: "Score", ready: Boolean(segment?.startCoordinate && segment?.endCoordinate) },
    { label: "Measures", ready: Boolean(segment?.measureStart != null || segment?.measureEnd != null) },
    { label: "Reference", ready: Boolean(selectedReference && segment?.referenceStartMs != null && segment?.referenceEndMs != null) },
    { label: "Takes", ready: recordingCount > 0 },
  ];
}

function getTimelineHint({
  activeSegment,
  canEditTiming,
  compareMode,
  hasAudio,
  isDragging,
  selectedReference,
}: {
  activeSegment: PracticeSegment | null;
  canEditTiming: boolean;
  compareMode: CompareMode;
  hasAudio: boolean;
  isDragging: boolean;
  selectedReference: ReferenceAsset | null;
}) {
  if (isDragging) {
    return "Release to save this passage boundary";
  }
  if (!activeSegment) {
    return "Select a passage to align audio";
  }
  if (!selectedReference) {
    return "Import a reference recording to align this passage";
  }
  if (!hasAudio) {
    return "Reference audio is loading";
  }
  if (compareMode !== "reference") {
    return "Switch to Reference to align passage boundaries";
  }
  if (!canEditTiming) {
    return "Reference timing is unavailable";
  }
  if (activeSegment.referenceStartMs == null || activeSegment.referenceEndMs == null) {
    return "Use Start here and End here to map this passage";
  }
  return "Drag In or Out to refine the loop";
}

function normalizeMsRange(startMs: number | null, endMs: number | null): { startMs: number; endMs: number } | null {
  if (startMs == null || endMs == null) {
    return null;
  }
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
  };
}

function rangeStyle(startSeconds: number, endSeconds: number, safeDuration: number) {
  const start = Math.min(startSeconds, endSeconds);
  const end = Math.max(startSeconds, endSeconds);
  return {
    left: `${secondsToPct(start, safeDuration)}%`,
    width: `${Math.max(0.4, secondsToPct(end - start, safeDuration))}%`,
  };
}

function boundarySeconds(timing: { startMs: number | null; endMs: number | null }, edge: BoundaryEdge): number | null {
  const value = edge === "start" ? timing.startMs : timing.endMs;
  return value == null ? null : value / 1000;
}

function secondsToPct(value: number, safeDuration: number): number {
  return Math.min((Math.max(value, 0) / safeDuration) * 100, 100);
}

function formatSegmentLocation(segment: PracticeSegment): string {
  const page =
    segment.startPage === segment.endPage ? `Page ${segment.startPage}` : `Pages ${segment.startPage}-${segment.endPage}`;
  const measures =
    segment.measureStart != null || segment.measureEnd != null
      ? `Measures ${segment.measureStart ?? "?"}-${segment.measureEnd ?? "?"}`
      : "Measures not set";
  return `${page} · ${measures}`;
}

function formatTimingRange(segment: PracticeSegment | null): string {
  if (!segment || segment.referenceStartMs == null || segment.referenceEndMs == null) {
    return "Reference not mapped";
  }
  const range = normalizeMsRange(segment.referenceStartMs, segment.referenceEndMs);
  if (!range) {
    return "Reference not mapped";
  }
  return `${formatTime(range.startMs / 1000)} - ${formatTime(range.endMs / 1000)}`;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value)) {
    return "0:00";
  }
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
