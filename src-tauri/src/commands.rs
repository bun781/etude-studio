use crate::{
  models::*,
  storage::{
    append_extension, copy_asset, create_project_row, delete_library_project, generate_id, init_project_db,
    copy_asset as copy_asset_impl, end_practice_session as end_practice_session_impl, insert_recording,
    insert_reference, insert_score, list_projects as list_projects_impl, load_project_detail, load_project_summary,
    load_recording, log_practice_activity, now, open_project_conn, project_root, remove_bookmark, remove_loop_range,
    remove_marker, delete_recording as remove_recording_impl, remove_reference, rename_project_root,
    set_active_reference as set_active_reference_impl,
    set_active_recording as set_active_recording_impl, set_project_note, start_practice_session as start_practice_session_impl,
    update_library_project, update_project_summary, update_recording as update_recording_impl, upsert_bookmark, upsert_loop_range,
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
    let _ = start_practice_session_impl(&root, &summary.id)?;
    let mut detail = load_project_detail(&root)?;
    let mut updated = summary.clone();
    updated.last_opened_at = now();
    updated.active_practice_session_id = detail.project.active_practice_session_id.clone();
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
      &name.unwrap_or_else(|| source.file_stem().and_then(|v| v.to_str()).unwrap_or("score").to_string()),
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
    let _ = log_practice_activity(
      &root,
      &project_id,
      "import_score",
      "Imported score",
      Some(&file_name),
      None,
      None,
      None,
      None,
      None,
    );
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
    let _ = log_practice_activity(
      &root,
      &project_id,
      "import_reference",
      "Imported reference",
      Some(&name),
      None,
      None,
      None,
      None,
      None,
    );
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_reference(paths: State<AppPaths>, projectId: String, referenceId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    if summary.active_reference_id.as_deref() == Some(referenceId.as_str()) {
      set_active_reference_impl(&root, None)?;
      summary.active_reference_id = None;
      summary.updated_at = now();
      update_library_project(&paths.workspace_root, &summary)?;
    }
    remove_reference(&root, &referenceId)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn set_active_reference(paths: State<AppPaths>, projectId: String, referenceId: Option<String>) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    set_active_reference_impl(&root, referenceId.as_deref())?;
    summary.active_reference_id = referenceId;
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
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
      measure_start,
      measure_end,
      label,
      note_text,
      color,
      status,
    } = bookmark;
    let bookmark = Bookmark {
      id: id.unwrap_or_else(generate_id),
      measure_start: measure_start.min(measure_end),
      measure_end: measure_start.max(measure_end),
      label,
      note_text,
      color,
      status,
      created_at: timestamp.clone(),
      updated_at: timestamp,
    };
    upsert_bookmark(&root, &bookmark)?;
    let _ = log_practice_activity(
      &root,
      &project_id,
      "bookmark",
      "Saved bookmark",
      Some(&bookmark.label),
      Some(bookmark.measure_start),
      Some(bookmark.measure_end),
      None,
      None,
      Some(&bookmark.id),
    );
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
      reference_id,
      measure_start,
      measure_end,
      recorded_at,
      duration_ms,
    } = input;
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let recording = RecordingAttempt {
      id: generate_id(),
      project_id: project_id.clone(),
      name,
      file_name,
      relative_path,
      reference_id: reference_id.or(summary.active_reference_id.clone()),
      notes: None,
      created_at: now(),
      measure_start,
      measure_end,
      recorded_at,
      duration_ms,
    };
    insert_recording(&root, &recording)?;
    let _ = log_practice_activity(
      &root,
      &project_id,
      "recording",
      "Created recording",
      Some(&recording.name),
      recording.measure_start,
      recording.measure_end,
      None,
      Some(&recording.id),
      None,
    );
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn end_practice_session(paths: State<AppPaths>, input: EndPracticeSessionInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let EndPracticeSessionInput { project_id } = input;
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let _ = end_practice_session_impl(&root, &project_id)?;
    summary.active_practice_session_id = None;
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn set_active_recording(paths: State<AppPaths>, projectId: String, recordingId: Option<String>) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    set_active_recording_impl(&root, recordingId.as_deref())?;
    summary.active_recording_id = recordingId;
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn update_recording(paths: State<AppPaths>, input: UpdateRecordingInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let UpdateRecordingInput {
      project_id,
      recording_id,
      name,
      notes,
      measure_start,
      measure_end,
      reference_id,
    } = input;
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let conn = open_project_conn(&root)?;
    let recording = load_recording(&conn, &recording_id)?;
    let mut recording = recording.ok_or_else(|| anyhow::anyhow!("Recording not found"))?;
    recording.name = name;
    recording.notes = notes;
    recording.measure_start = measure_start;
    recording.measure_end = measure_end;
    recording.reference_id = reference_id;
    update_recording_impl(&root, &recording)?;
    let _ = log_practice_activity(
      &root,
      &project_id,
      "recording_update",
      "Updated recording",
      Some(&recording.name),
      recording.measure_start,
      recording.measure_end,
      recording.reference_id.as_deref(),
      Some(&recording.id),
      None,
    );
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn delete_recording(paths: State<AppPaths>, projectId: String, recordingId: String) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &projectId)?;
    if summary.active_recording_id.as_deref() == Some(recordingId.as_str()) {
      set_active_recording_impl(&root, None)?;
      summary.active_recording_id = None;
    }
    remove_recording_impl(&root, &recordingId)?;
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}

#[tauri::command]
pub fn duplicate_recording(paths: State<AppPaths>, input: DuplicateRecordingInput) -> CommandResult<ProjectDetail> {
  map_err((|| -> Result<ProjectDetail> {
    let DuplicateRecordingInput {
      project_id,
      recording_id,
    } = input;
    let (mut summary, root) = load_project_summary(&paths.workspace_root, &project_id)?;
    let conn = open_project_conn(&root)?;
    let original = load_recording(&conn, &recording_id)?
      .ok_or_else(|| anyhow::anyhow!("Recording not found"))?;
    let source_path = root.join(&original.relative_path);
    let source_extension = source_path
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("webm");
    let duplicate_id = generate_id();
    let duplicate_name = format!("{} copy", original.name);
    let duplicate_file_name = append_extension(
      format!("take-{}", &duplicate_id[..8.min(duplicate_id.len())]).as_str(),
      source_extension,
    );
    let duplicate_relative = PathBuf::from("recordings").join(&duplicate_file_name);
    let destination = root.join(&duplicate_relative);
    copy_asset_impl(&source_path, &destination)?;
    let duplicate = RecordingAttempt {
      id: duplicate_id,
      project_id: project_id.clone(),
      name: duplicate_name,
      file_name: duplicate_file_name,
      relative_path: duplicate_relative.to_string_lossy().to_string(),
      reference_id: original.reference_id.clone(),
      notes: original.notes.clone(),
      created_at: now(),
      measure_start: original.measure_start,
      measure_end: original.measure_end,
      recorded_at: original.recorded_at.clone(),
      duration_ms: original.duration_ms,
    };
    insert_recording(&root, &duplicate)?;
    summary.updated_at = now();
    update_library_project(&paths.workspace_root, &summary)?;
    load_project_detail(&root)
  })())
}
