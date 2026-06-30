import { useEffect, useMemo, useRef, useState } from "react";
import type { LoopRange, MeasureMarker, RecordingAttempt, ReferenceAsset } from "../lib/types";
import { deriveLoopTimes, estimateCurrentMeasure } from "../lib/measure";

type Props = {
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  currentTime: number;
  zoom: number;
  markers: MeasureMarker[];
  loopRange: LoopRange | null;
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
  onSetLoop: (startMeasure: number, endMeasure: number) => void;
};

type LoopHandle = "start" | "end";

export function TransportPanel({
  isPlaying,
  playbackRate,
  duration,
  currentTime,
  zoom,
  markers,
  loopRange,
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
  onSetLoop,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draftLoopRef = useRef<{ startMeasure: number; endMeasure: number } | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [draggingLoopHandle, setDraggingLoopHandle] = useState<LoopHandle | null>(null);
  const [draftLoop, setDraftLoop] = useState<{ startMeasure: number; endMeasure: number } | null>(null);

  const safeDuration = Math.max(duration, 1);
  const positionPct = Math.min((currentTime / safeDuration) * 100, 100);
  const contentWidth = Math.max(720, Math.round(safeDuration * 140 * zoom));
  const loopTimes = useMemo(() => {
    if (!loopRange) {
      return { startTime: null, endTime: null };
    }
    return deriveLoopTimes(markers, loopRange.startMeasure, loopRange.endMeasure);
  }, [loopRange, markers]);

  useEffect(() => {
    if (!loopRange) {
      setDraftLoop(null);
      return;
    }
    setDraftLoop({
      startMeasure: loopRange.startMeasure,
      endMeasure: loopRange.endMeasure,
    });
  }, [loopRange]);

  useEffect(() => {
    draftLoopRef.current = draftLoop;
  }, [draftLoop]);

  useEffect(() => {
    if (!isSeeking && !draggingLoopHandle) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const bounds = track.getBoundingClientRect();
      const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const nextTime = safeDuration * clampedRatio;

      if (draggingLoopHandle && loopRange) {
        const nextMeasure = Math.max(1, estimateCurrentMeasure(nextTime * 1000, markers));
        setDraftLoop((current) => {
          const currentStart = current?.startMeasure ?? loopRange.startMeasure;
          const currentEnd = current?.endMeasure ?? loopRange.endMeasure;
          if (draggingLoopHandle === "start") {
            return {
              startMeasure: Math.min(nextMeasure, currentEnd),
              endMeasure: Math.max(nextMeasure, currentEnd),
            };
          }
          return {
            startMeasure: Math.min(currentStart, nextMeasure),
            endMeasure: Math.max(currentStart, nextMeasure),
          };
        });
        return;
      }

      onSeek(nextTime);
    }

    function handlePointerUp() {
      setIsSeeking(false);
      if (draggingLoopHandle) {
        const nextLoop = draftLoopRef.current ?? loopRange;
        if (nextLoop) {
          onSetLoop(nextLoop.startMeasure, nextLoop.endMeasure);
        }
      }
      setDraggingLoopHandle(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingLoopHandle, loopRange, markers, onSeek, onSetLoop, safeDuration, isSeeking]);

  const markerTicks = useMemo(() => {
    return [...markers]
      .filter((marker) => marker.timestampMs >= 0)
      .map((marker) => ({
        ...marker,
        left: Math.min((marker.timestampMs / safeDuration) * 100, 100),
      }));
  }, [markers, safeDuration]);

  const activeLoop =
    draftLoop ?? loopRange ?? null;
  const activeLoopTimes =
    activeLoop == null ? { startTime: null, endTime: null } : deriveLoopTimes(markers, activeLoop.startMeasure, activeLoop.endMeasure);
  const loopStartPct =
    activeLoopTimes.startTime == null ? 0 : Math.max(0, Math.min((activeLoopTimes.startTime / safeDuration) * 100, 100));
  const loopEndPct =
    activeLoopTimes.endTime == null ? 0 : Math.max(0, Math.min((activeLoopTimes.endTime / safeDuration) * 100, 100));
  const activeMeasure = estimateCurrentMeasure(currentTime * 1000, markers);

  return (
    <section className="panel panel--transport">
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
          >
            <div className="timeline__grid" aria-hidden="true">
              {Array.from({ length: Math.max(1, Math.ceil(safeDuration / 5)) }, (_, index) => {
                const second = index * 5;
                const left = Math.min((second / safeDuration) * 100, 100);
                return (
                  <span
                    key={second}
                    className="timeline__grid-line"
                    style={{ left: `${left}%` }}
                  >
                    <span className="timeline__grid-label">{formatTime(second)}</span>
                  </span>
                );
              })}
            </div>

            {activeLoopTimes.startTime != null && activeLoopTimes.endTime != null ? (
              <div
                className="timeline__loop"
                style={{
                  left: `${loopStartPct}%`,
                  width: `${Math.max(loopEndPct - loopStartPct, 0.5)}%`,
                }}
              >
                <button
                  type="button"
                  className="timeline__handle timeline__handle--start"
                  aria-label="Adjust loop start"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDraggingLoopHandle("start");
                    setDraftLoop(
                      loopRange
                        ? {
                            startMeasure: loopRange.startMeasure,
                            endMeasure: loopRange.endMeasure,
                          }
                        : null,
                    );
                  }}
                />
                <button
                  type="button"
                  className="timeline__handle timeline__handle--end"
                  aria-label="Adjust loop end"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDraggingLoopHandle("end");
                    setDraftLoop(
                      loopRange
                        ? {
                            startMeasure: loopRange.startMeasure,
                            endMeasure: loopRange.endMeasure,
                          }
                        : null,
                    );
                  }}
                />
              </div>
            ) : null}

            <button
              type="button"
              className="timeline__playhead"
              style={{ left: `${positionPct}%` }}
              aria-label="Playback position"
            />

            {markerTicks.map((marker) => (
              <button
                key={marker.id}
                type="button"
                className="timeline__marker"
                style={{ left: `${marker.left}%` }}
                title={
                  marker.label
                    ? `Measure ${marker.measureNumber}: ${marker.label}`
                    : `Measure ${marker.measureNumber}`
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(marker.timestampMs / 1000);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className="timeline__marker-label">M{marker.measureNumber}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="timeline__labels">
          <span>
            Current {formatTime(currentTime)} · Measure {activeMeasure}
          </span>
          <span>{isSeeking || draggingLoopHandle ? "Dragging" : "Click or drag to seek"}</span>
        </div>
      </div>

      <div className="transport-row">
        <button className="primary-btn" onClick={onPlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button className="secondary-btn" onClick={onStop}>
          Stop
        </button>
        <label className="field-inline">
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
