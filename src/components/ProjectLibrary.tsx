import type { ProjectSummary } from "../lib/types";

type Props = {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
};

export function ProjectLibrary({ projects, selectedProjectId, onSelectProject, onOpenProject }: Props) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Project Library</h2>
        <p className="muted">{projects.length} local project{projects.length === 1 ? "" : "s"}</p>
      </div>
      <div className="stack">
        {projects.map((project) => (
          <div
            key={project.id}
            className={project.id === selectedProjectId ? "list-card list-card--active" : "list-card"}
          >
            <button className="list-card__title" onClick={() => onSelectProject(project.id)}>
              {project.name}
            </button>
            <p className="muted">{project.rootPath}</p>
            <div className="transport-row">
              <button className="secondary-btn" onClick={() => onOpenProject(project.id)}>
                Open
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 ? <div className="empty-state">No projects yet. Create one to get started.</div> : null}
      </div>
    </section>
  );
}

