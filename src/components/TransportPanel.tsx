import { useMemo, useRef, useState } from "react";
import type { PracticeSegment, RecordingAttempt, ReferenceAsset } from "../lib/types";

type Props = {
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  currentTime: number;
  zoom: number;
  segments: PracticeSegment[];
  activeSegmentId: string | null;
  isLooping: boolean;
  activeSourceLabel: string;
  compareMode: "reference" | "recording";
  selectedReference: ReferenceAsset | null;
  selectedRecording: RecordingAttempt | null;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onZoomChange: (zoom: number) => void;
  onCompareModeChange: (mode: "reference" | "recording") => void;
  onSelectSegment: (segmentId: string) => void;
  onToggleLoop: () => void;
  onMarkSegmentStart: () => void;
  onMarkSegmentEnd: () => void;
};

export function TransportPanel({
  isPlaying,
  playbackRate,
  duration,
  currentTime,
  zoom,
  segments,
  activeSegmentId,
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
  onMarkSegmentStart,
  onMarkSegmentEnd,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);

  const safeDuration = Math.max(duration, 1);
  const positionPct = Math.min((currentTime / safeDuration) * 100, 100);
  const contentWidth = Math.max(720, Math.round(safeDuration * 140 * zoom));

  const segmentRanges = useMemo(
    () =>
      segments
        .filter((segment) => segment.referenceStartMs != null && segment.referenceEndMs != null)
        .map((segment) => ({
          segment,
          left: Math.min(((segment.referenceStartMs as number) / 1000 / safeDuration) * 100, 100),
          width: Math.max(
            0.5,
            (((segment.referenceEndMs as number) - (segment.referenceStartMs as number)) / 1000 / safeDuration) * 100,
          ),
        })),
    [segments, safeDuration],
  );

  return (
    <section className="panel panel--transport" data-tour-id="transport-panel">
      <div className="panel__header">
        <div>
          <h2>Transport</h2>
          <p className="muted">{activeSourceLabel}</p>
        </div>
        <div className="transport-meta">
          <span className="pill">{compareMode === "reference" ? "Reference" : "Recording"}</span>
          <span className="pill">{isPlaying ? "Playing" : "Paused"}</span>
        </div>
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
            onPointerDown={(event) => {
              const track = trackRef.current;
              if (!track) {
                return;
              }
              const bounds = track.getBoundingClientRect();
              const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
              onSeek(Math.max(0, Math.min(safeDuration, safeDuration * ratio)));
              setIsSeeking(true);
            }}
            onPointerUp={() => setIsSeeking(false)}
          >
            <div className="timeline__grid" aria-hidden="true">
              {Array.from({ length: Math.max(1, Math.ceil(safeDuration / 5)) }, (_, index) => {
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
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectSegment(segment.id);
                }}
              >
                <span className="timeline__segment-label">{segment.name}</span>
              </button>
            ))}

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
          <span>{isSeeking ? "Dragging" : "Click a segment or the rail to navigate"}</span>
        </div>
      </div>

      <div className="transport-row">
        <button className="primary-btn" data-tour-id="play-button" onClick={onPlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button className="secondary-btn" onClick={onStop}>
          Stop
        </button>
        <button
          className={isLooping ? "primary-btn" : "secondary-btn"}
          onClick={onToggleLoop}
          disabled={!activeSegmentId}
        >
          {isLooping ? "Looping segment" : "Loop segment"}
        </button>
        <button className="secondary-btn" onClick={onMarkSegmentStart} disabled={!activeSegmentId}>
          Mark start
        </button>
        <button className="secondary-btn" onClick={onMarkSegmentEnd} disabled={!activeSegmentId}>
          Mark end
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
            onChange={(event) => onCompareModeChange(event.target.value as "reference" | "recording")}
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

function formatTime(value: number): string {
  if (!Number.isFinite(value)) {
    return "0:00";
  }
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
