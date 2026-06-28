import type { RecordingAttempt, ReferenceAsset } from "../lib/types";

type Props = {
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  currentTime: number;
  activeSourceLabel: string;
  compareMode: "reference" | "recording";
  selectedReference: ReferenceAsset | null;
  selectedRecording: RecordingAttempt | null;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onCompareModeChange: (mode: "reference" | "recording") => void;
};

export function TransportPanel({
  isPlaying,
  playbackRate,
  duration,
  currentTime,
  activeSourceLabel,
  compareMode,
  selectedReference,
  selectedRecording,
  onPlayPause,
  onStop,
  onSeek,
  onSpeedChange,
  onCompareModeChange,
}: Props) {
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <section className="panel panel--transport">
      <div className="panel__header">
        <h2>Transport</h2>
        <p className="muted">{activeSourceLabel}</p>
      </div>
      <div className="timeline">
        <div
          className="timeline__track"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const progressRatio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
            onSeek(Math.max(0, Math.min(duration, duration * progressRatio)));
          }}
        >
          <div className="timeline__progress" style={{ width: `${progress}%` }} />
          <button className="timeline__scrubber" style={{ left: `${progress}%` }} aria-label="Timeline scrubber" />
        </div>
        <div className="timeline__labels">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
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
