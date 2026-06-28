import type { ScoreAsset } from "../lib/types";

type Props = {
  score: ScoreAsset | null;
  currentMeasure: number;
  totalMeasures: number;
  onMeasureClick: (measureNumber: number) => void;
};

export function ScorePanel({ score, currentMeasure, totalMeasures, onMeasureClick }: Props) {
  const measures = Array.from({ length: Math.max(totalMeasures, 1) }, (_, index) => index + 1);

  return (
    <section className="panel panel--score">
      <div className="panel__header">
        <h2>Score</h2>
        <p className="muted">
          {score ? `${score.fileName} · ${score.measureCount} measures` : "Import a MusicXML score to begin."}
        </p>
      </div>
      <div className="score-preview">
        <div className="score-preview__sheet">
          <div className="score-preview__meta">
            <span className="pill">Measure-based navigation</span>
            <span className="pill">{score ? score.format.toUpperCase() : "No score"}</span>
          </div>
          <pre className="score-preview__text">{score?.previewText ?? "No score loaded yet."}</pre>
        </div>
        <aside className="score-preview__measures">
          <div className="panel__subheader">
            <h3>Measures</h3>
            <p className="muted">Click any measure to jump there.</p>
          </div>
          <div className="measure-grid">
            {measures.map((measureNumber) => (
              <button
                key={measureNumber}
                className={measureNumber === currentMeasure ? "measure-chip measure-chip--active" : "measure-chip"}
                onClick={() => onMeasureClick(measureNumber)}
              >
                {measureNumber}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

