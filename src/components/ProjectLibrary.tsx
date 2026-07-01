import type { ProjectSummary } from "../lib/types";

type Props = {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  projectNameDraft: string;
  setProjectNameDraft: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
};

export function ProjectLibrary({
  projects,
  selectedProjectId,
  projectNameDraft,
  setProjectNameDraft,
  onSelectProject,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
}: Props) {
  const featuredProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  return (
    <section className="panel project-library" data-tour-id="project-library">
      <div className="panel__header">
        <div>
          <h2>Project Library</h2>
          <p className="muted">{projects.length} local project{projects.length === 1 ? "" : "s"}</p>
        </div>
        <div className="project-library__create">
          <input
            aria-label="Project name"
            className="text-input"
            data-tour-id="project-name"
            placeholder="New project name"
            value={projectNameDraft}
            onChange={(event) => setProjectNameDraft(event.target.value)}
          />
          <button className="secondary-btn" data-tour-id="new-project" onClick={onCreateProject}>
            New project
          </button>
        </div>
      </div>
      {featuredProject ? (
        <>
          <div className="project-library__hero">
            <div className="project-library__hero-copy">
              <p className="eyebrow">Open a piece</p>
              <h3>{featuredProject.name}</h3>
              <p className="muted">
                {selectedProjectId === featuredProject.id ? "Currently selected" : "First piece in your library"}
                {" · "}
                Updated {formatProjectDate(featuredProject.updatedAt)}
              </p>
            </div>
            <div className="project-library__hero-actions">
              <button className="primary-btn project-library__open-btn" onClick={() => onOpenProject(featuredProject.id)}>
                Open piece
              </button>
              <button className="secondary-btn" onClick={() => onSelectProject(featuredProject.id)}>
                Keep selected
              </button>
              <button className="danger-btn" onClick={() => onDeleteProject(featuredProject.id)}>
                Delete project
              </button>
            </div>
          </div>
          <div className="project-grid">
            {projects.map((project) => {
              const isActive = project.id === selectedProjectId;

              return (
                <article key={project.id} className={isActive ? "project-card project-card--active" : "project-card"}>
                  <button className="project-card__surface" onClick={() => onSelectProject(project.id)}>
                    <div className="project-card__header">
                      <span className="project-card__status">{isActive ? "Selected" : "Ready to open"}</span>
                      <span className="pill">Updated {formatProjectDate(project.updatedAt)}</span>
                    </div>
                    <h3>{project.name}</h3>
                  </button>
                  <div className="project-card__actions">
                    <button className="secondary-btn" onClick={() => onSelectProject(project.id)}>
                      {isActive ? "Selected" : "Select"}
                    </button>
                    <button className="primary-btn" onClick={() => onOpenProject(project.id)}>
                      Open piece
                    </button>
                    <button className="danger-btn" onClick={() => onDeleteProject(project.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-state">No projects yet. Create one to get started.</div>
      )}
    </section>
  );
}

function formatProjectDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
