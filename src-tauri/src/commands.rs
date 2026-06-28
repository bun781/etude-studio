use crate::{
  models::*,
  storage::{
    append_extension, copy_asset, create_project_row, delete_library_project, generate_id, init_project_db,
    insert_recording, insert_reference, insert_score, list_projects as list_projects_impl, load_project_detail,
    load_project_summary, now, project_root, remove_bookmark, remove_loop_range, remove_marker, remove_reference,
    rename_project_root, set_active_reference as set_active_reference_impl, set_active_recording as set_active_recording_impl,
    set_project_note, update_library_project, update_project_summary, upsert_bookmark, upsert_loop_range,
    upsert_marker, validate_musicxml, AppPaths,
  },
};
use anyhow::Result;
use std::{fs, path::PathBuf};
use tauri::State;

pub type CommandResult<T> = Result<T, String>;

fn map_err<T>(result: Result<T>) -> CommandResult<T> {
  result.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_projects(paths: State<AppPaths>) -> CommandResult<Vec<ProjectSummary>> {
  map_err(list_projects_impl(&paths.workspace_root))
}

#[tauri::command]
pub fn create_project(paths: State<AppPaths>, input: CreateProjectInput) -> CommandResult<ProjectSummary> {
  map_err((|| -> Result<ProjectSummary> {
    let CreateProjectInput { name } = input;
    let project_id = generate_id();
    let timestamp = now();
    let root = project_root(&paths.workspace_root, &project_id, &name);
    fs::create_dir_all(&root)?;
    init_project_db(&root, &project_id, &name)?;
    let summary = create_project_row(&paths.workspace_root, &project_id, &name, &root)?;
    Ok(ProjectSummary {
      created_at: timestamp.clone(),
      updated_at: timestamp.clone(),
      last_opened_at: timestamp,
      ..summary
    })
  })())
}

#[tauri::command]
pub fn rename_project(paths: State<AppPaths>, input: RenameProjectInput) -> CommandResult<ProjectSummary> {
  map_err((|| -> Result<ProjectSummary> {
    let RenameProjectInput { project_id, name } = input;
    let (mut current, old_root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let new_root = rename_project_root(&paths.workspace_root, &current.id, &current.name, &name)?;
    current.name = name;
    current.root_path = new_root.to_string_lossy().to_string();
    current.updated_at = now();
    update_project_summary(&new_root, &current)?;
    update_library_project(&paths.workspace_root, &current)?;
    if old_root != new_root {
      let old_db = old_root.join("project.db");
      let new_db = new_root.join("project.db");
      if old_db.exists() && !new_db.exists() {
        fs::rename(old_db, new_db)?;
      }
    }
    Ok(current)
  })())
}

#[tauri::command]
pub fn delete_project(paths: State<AppPaths>, input: DeleteProjectInput) -> CommandResult<()> {
  map_err((|| -> Result<()> {
    let DeleteProjectInput { project_id } = input;
    let (project, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    if root.exists() {
      fs::remove_dir_all(&root)?;
    }
    delete_library_project(&paths.workspace_root, &project.id)?;
    Ok(())
  })())
}

#[tauri::command]
pub fn load_project(paths: State<AppPaths>, projectId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    let mut detail = load_project_detail(&root)?;
    let mut updated = summary.clone();
    updated.last_opened_at = now();
    update_library_project(&paths.workspace_root, &updated)?;
    detail.project = updated;
    Ok(detail)
  })())
}

#[tauri::command]
pub fn import_score(paths: State<AppPaths>, input: ImportAssetInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let ImportAssetInput {
      project_id,
      source_path,
      name,
    } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let source = PathBuf::from(&source_path);
    let extension = source
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("musicxml");
    let file_name = append_extension(
      name.unwrap_or_else(|| source.file_stem().and_then(|v| v.to_str()).unwrap_or("score").to_string()),
      extension,
    );
    let destination = root.join("score").join(&file_name);
    copy_asset(&source, &destination)?;
    let measure_count = validate_musicxml(&destination)?;
    let relative = destination
      .strip_prefix(&root)?
      .to_string_lossy()
      .to_string();
    insert_score(&root, &file_name, &relative, measure_count)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn import_reference(paths: State<AppPaths>, input: ImportAssetInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let ImportAssetInput {
      project_id,
      source_path,
      name,
    } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let source = PathBuf::from(&source_path);
    let file_name = source
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("reference.bin")
      .to_string();
    let destination = root.join("references").join(&file_name);
    copy_asset(&source, &destination)?;
    let name = name.unwrap_or_else(|| {
      source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Reference")
        .to_string()
    });
    let relative = destination.strip_prefix(&root)?.to_string_lossy().to_string();
    insert_reference(&root, &name, &file_name, &relative)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_reference(paths: State<AppPaths>, projectId: String, referenceId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    if summary.active_reference_id.as_deref() == Some(referenceId.as_str()) {
      set_active_reference_impl(&root, None)?;
    }
    remove_reference(&root, &referenceId)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn set_active_reference(paths: State<AppPaths>, projectId: String, referenceId: Option<String>) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    set_active_reference_impl(&root, referenceId.as_deref())?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn save_marker(paths: State<AppPaths>, input: SaveMarkerInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let SaveMarkerInput { project_id, marker } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let now_text = now();
    let MarkerDraft {
      id,
      measure_number,
      timestamp_ms,
      label,
      note_text,
    } = marker;
    let marker = MeasureMarker {
      id: id.unwrap_or_else(generate_id),
      measure_number,
      timestamp_ms,
      label,
      note_text,
      created_at: now_text.clone(),
      updated_at: now_text,
    };
    upsert_marker(&root, &marker)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_marker(paths: State<AppPaths>, projectId: String, markerId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    remove_marker(&root, &markerId)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn save_loop_range(paths: State<AppPaths>, input: SaveLoopRangeInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let SaveLoopRangeInput { project_id, loop_range } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let timestamp = now();
    let LoopRangeDraft {
      id,
      name,
      start_measure,
      end_measure,
      is_active,
    } = loop_range;
    let loop_range = LoopRange {
      id: id.unwrap_or_else(generate_id),
      name,
      start_measure,
      end_measure,
      is_active,
      created_at: timestamp.clone(),
      updated_at: timestamp,
    };
    upsert_loop_range(&root, &loop_range)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_loop_range(paths: State<AppPaths>, projectId: String, loopRangeId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    remove_loop_range(&root, &loopRangeId)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn save_bookmark(paths: State<AppPaths>, input: SaveBookmarkInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let SaveBookmarkInput { project_id, bookmark } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let timestamp = now();
    let BookmarkDraft {
      id,
      name,
      measure_number,
    } = bookmark;
    let bookmark = Bookmark {
      id: id.unwrap_or_else(generate_id),
      name,
      measure_number,
      created_at: timestamp.clone(),
      updated_at: timestamp,
    };
    upsert_bookmark(&root, &bookmark)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_bookmark(paths: State<AppPaths>, projectId: String, bookmarkId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    remove_bookmark(&root, &bookmarkId)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn save_project_note(paths: State<AppPaths>, projectId: String, text: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    set_project_note(&root, &text)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn register_recording(paths: State<AppPaths>, input: SaveRecordingInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let SaveRecordingInput {
      project_id,
      file_name,
      relative_path,
      name,
      measure_start,
      measure_end,
      recorded_at,
      duration_ms,
    } = input;
    let (_, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let recording = RecordingAttempt {
      id: generate_id(),
      name,
      file_name,
      relative_path,
      measure_start,
      measure_end,
      recorded_at,
      duration_ms,
    };
    insert_recording(&root, &recording)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn set_active_recording(paths: State<AppPaths>, projectId: String, recordingId: Option<String>) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (_, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    set_active_recording_impl(&root, recordingId.as_deref())?;
    load_project_detail(&root)
  })())
}
