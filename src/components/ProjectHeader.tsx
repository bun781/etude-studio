import type { ProjectSummary } from "../lib/types";

type Props = {
  project: ProjectSummary | null;
  projectNameDraft: string;
  setProjectNameDraft: (value: string) => void;
  onCreateProject: () => void;
  onOpenProject: () => void;
};

export function ProjectHeader({
  project,
  projectNameDraft,
  setProjectNameDraft,
  onCreateProject,
  onOpenProject,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar__primary">
        <div className="topbar__brand">
          <img className="topbar__brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">Etude Studio</p>
            <strong>Practice ledger</strong>
          </div>
        </div>
        <div>
          <p className="eyebrow">Current piece</p>
          <h1>{project?.name ?? "No project open"}</h1>
        </div>
        <p className="muted">{project ? "Project ready to edit." : "Create or open a local project to begin."}</p>
      </div>
      <div className="topbar__actions">
        <input
          aria-label="Project name"
          className="text-input text-input--wide"
          data-tour-id="project-name"
          placeholder="New project name"
          value={projectNameDraft}
          onChange={(event) => setProjectNameDraft(event.target.value)}
        />
        <button className="primary-btn" data-tour-id="new-project" onClick={onCreateProject}>New project</button>
        <button className="secondary-btn" data-tour-id="open-selected" onClick={onOpenProject}>Open selected</button>
      </div>
    </header>
  );
}
