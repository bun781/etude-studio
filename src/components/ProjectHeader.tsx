import type { ProjectSummary } from "../lib/types";

type Props = {
  project: ProjectSummary | null;
  projectNameDraft: string;
  setProjectNameDraft: (value: string) => void;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
  onImportScore: () => void;
  onImportReference: () => void;
  onToggleRecording: () => void;
  isRecording: boolean;
};

export function ProjectHeader({
  project,
  projectNameDraft,
  setProjectNameDraft,
  onCreateProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onImportScore,
  onImportReference,
  onToggleRecording,
  isRecording,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar__primary">
        <div>
          <p className="eyebrow">Reference Practice</p>
          <h1>{project?.name ?? "No project open"}</h1>
        </div>
        {project ? (
          <p className="muted">Stored at {project.rootPath}</p>
        ) : (
          <p className="muted">Create or open a local project to begin.</p>
        )}
      </div>
      <div className="topbar__actions">
        <input
          aria-label="Project name"
          className="text-input text-input--wide"
          placeholder="Project name"
          value={projectNameDraft}
          onChange={(event) => setProjectNameDraft(event.target.value)}
        />
        <button className="primary-btn" onClick={onCreateProject}>New</button>
        <button className="secondary-btn" onClick={onOpenProject}>Open</button>
        <button className="secondary-btn" onClick={onRenameProject} disabled={!project}>
          Rename
        </button>
        <button className="danger-btn" onClick={onDeleteProject} disabled={!project}>
          Delete
        </button>
        <button className="secondary-btn" onClick={onImportScore} disabled={!project}>
          Import Score
        </button>
        <button className="secondary-btn" onClick={onImportReference} disabled={!project}>
          Import Reference
        </button>
        <button className="secondary-btn" onClick={onToggleRecording} disabled={!project}>
          {isRecording ? "Stop Recording" : "Record"}
        </button>
      </div>
    </header>
  );
}
