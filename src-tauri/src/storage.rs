use crate::models::*;
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
  fs,
  path::{Path, PathBuf},
};
use uuid::Uuid;

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Clone)]
pub struct AppPaths {
  pub workspace_root: PathBuf,
}

pub fn ensure_workspace(app: &tauri::AppHandle) -> Result<AppPaths> {
  let base = app
    .path_resolver()
    .app_data_dir()
    .ok_or_else(|| anyhow!("Unable to resolve app data directory"))?;
  let workspace_root = base.join("Reference Practice");
  fs::create_dir_all(workspace_root.join("projects"))?;
  init_library_db(&workspace_root)?;
  Ok(AppPaths { workspace_root })
}

pub fn library_db_path(workspace_root: &Path) -> PathBuf {
  workspace_root.join("library.db")
}

pub fn projects_root(workspace_root: &Path) -> PathBuf {
  workspace_root.join("projects")
}

pub fn project_root(workspace_root: &Path, project_id: &str, project_name: &str) -> PathBuf {
  let short_id = project_id.split('-').next_back().unwrap_or(project_id);
  let slug = slugify(project_name);
  projects_root(workspace_root).join(format!("{slug}-{short_id}"))
}

pub fn project_db_path(project_root: &Path) -> PathBuf {
  project_root.join("project.db")
}

pub fn init_library_db(workspace_root: &Path) -> Result<()> {
  let conn = Connection::open(library_db_path(workspace_root))?;
  conn.execute(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
    [],
  )?;
  let version: Option<i64> = conn
    .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
    .optional()?;
  if version.is_none() {
    conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [SCHEMA_VERSION])?;
  }
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL,
      active_reference_id TEXT,
      active_recording_id TEXT
    )
    "#,
    [],
  )?;
  Ok(())
}

pub fn open_library_conn(workspace_root: &Path) -> Result<Connection> {
  init_library_db(workspace_root)?;
  Ok(Connection::open(library_db_path(workspace_root))?)
}

pub fn init_project_db(project_root: &Path, project_id: &str, project_name: &str) -> Result<()> {
  fs::create_dir_all(project_root.join("score"))?;
  fs::create_dir_all(project_root.join("references"))?;
  fs::create_dir_all(project_root.join("recordings"))?;
  fs::create_dir_all(project_root.join("exports"))?;

  let conn = Connection::open(project_db_path(project_root))?;
  conn.execute(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
    [],
  )?;
  let version: Option<i64> = conn
    .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
    .optional()?;
  if version.is_none() {
    conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [SCHEMA_VERSION])?;
  }

  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      notes_updated_at TEXT,
      active_reference_id TEXT,
      active_recording_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      format TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      measure_count INTEGER NOT NULL DEFAULT 0
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS references_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      imported_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      measure_start INTEGER,
      measure_end INTEGER,
      recorded_at TEXT NOT NULL,
      duration_ms INTEGER
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS markers (
      id TEXT PRIMARY KEY,
      measure_number INTEGER NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      label TEXT,
      note_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS loop_ranges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_measure INTEGER NOT NULL,
      end_measure INTEGER NOT NULL,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      measure_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;

  conn.execute(
    r#"INSERT OR IGNORE INTO project (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)"#,
    params![project_id, project_name, now(), now()],
  )?;
  Ok(())
}

pub fn open_project_conn(project_root: &Path) -> Result<Connection> {
  Ok(Connection::open(project_db_path(project_root))?)
}

pub fn create_project_row(workspace_root: &Path, project_id: &str, name: &str, root_path: &Path) -> Result<ProjectSummary> {
  let conn = open_library_conn(workspace_root)?;
  let timestamp = now();
  conn.execute(
    r#"
    INSERT INTO projects (id, name, root_path, created_at, updated_at, last_opened_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    "#,
    params![
      project_id,
      name,
      root_path.to_string_lossy().to_string(),
      timestamp,
      timestamp,
      timestamp
    ],
  )?;
  Ok(ProjectSummary {
    id: project_id.to_string(),
    name: name.to_string(),
    root_path: root_path.to_string_lossy().to_string(),
    created_at: timestamp.clone(),
    updated_at: timestamp.clone(),
    last_opened_at: timestamp,
    active_reference_id: None,
    active_recording_id: None,
  })
}

pub fn list_projects(workspace_root: &Path) -> Result<Vec<ProjectSummary>> {
  let conn = open_library_conn(workspace_root)?;
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, root_path, created_at, updated_at, last_opened_at, active_reference_id, active_recording_id
    FROM projects
    ORDER BY last_opened_at DESC, updated_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(ProjectSummary {
      id: row.get(0)?,
      name: row.get(1)?,
      root_path: row.get::<_, String>(2)?,
      created_at: row.get(3)?,
      updated_at: row.get(4)?,
      last_opened_at: row.get(5)?,
      active_reference_id: row.get(6)?,
      active_recording_id: row.get(7)?,
    })
  })?;
  let mut projects = Vec::new();
  for row in rows {
    projects.push(row?);
  }
  Ok(projects)
}

pub fn load_project_summary(workspace_root: &Path, project_id: &str) -> Result<(ProjectSummary, PathBuf)> {
  let conn = open_library_conn(workspace_root)?;
  let summary = conn.query_row(
    r#"
    SELECT id, name, root_path, created_at, updated_at, last_opened_at, active_reference_id, active_recording_id
    FROM projects
    WHERE id = ?1
    "#,
    [project_id],
    |row| {
      Ok(ProjectSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get::<_, String>(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        last_opened_at: row.get(5)?,
        active_reference_id: row.get(6)?,
        active_recording_id: row.get(7)?,
      })
    },
  )?;
  let root_path = PathBuf::from(summary.root_path.clone());
  Ok((summary, root_path))
}

pub fn update_library_project(workspace_root: &Path, project: &ProjectSummary) -> Result<()> {
  let conn = open_library_conn(workspace_root)?;
  conn.execute(
    r#"
    UPDATE projects
    SET name = ?2,
        root_path = ?3,
        created_at = ?4,
        updated_at = ?5,
        last_opened_at = ?6,
        active_reference_id = ?7,
        active_recording_id = ?8
    WHERE id = ?1
    "#,
    params![
      project.id,
      project.name,
      project.root_path.to_string(),
      project.created_at,
      project.updated_at,
      project.last_opened_at,
      project.active_reference_id,
      project.active_recording_id
    ],
  )?;
  Ok(())
}

pub fn delete_library_project(workspace_root: &Path, project_id: &str) -> Result<()> {
  let conn = open_library_conn(workspace_root)?;
  conn.execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
  Ok(())
}

pub fn load_project_detail(project_root: &Path) -> Result<ProjectDetail> {
  let conn = open_project_conn(project_root)?;
  let project = conn.query_row(
    r#"
    SELECT id, name, notes, notes_updated_at, active_reference_id, active_recording_id, created_at, updated_at
    FROM project
    LIMIT 1
    "#,
    [],
    |row| {
      Ok(( 
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, Option<String>>(3)?,
        row.get::<_, Option<String>>(4)?,
        row.get::<_, Option<String>>(5)?,
        row.get::<_, String>(6)?,
        row.get::<_, String>(7)?,
      ))
    },
  )?;

  let summary = ProjectSummary {
    id: project.0.clone(),
    name: project.1.clone(),
    root_path: project_root.to_string_lossy().to_string(),
    created_at: project.6.clone(),
    updated_at: project.7.clone(),
    last_opened_at: project.7.clone(),
    active_reference_id: project.4.clone(),
    active_recording_id: project.5.clone(),
  };

  let score = load_score(&conn, project_root)?;
  let references = load_references(&conn)?;
  let recordings = load_recordings(&conn)?;
  let markers = load_markers(&conn)?;
  let loop_range = load_active_loop_range(&conn)?;
  let bookmarks = load_bookmarks(&conn)?;
  let note = ProjectNote {
    text: project.2.clone(),
    updated_at: project.3.clone(),
  };

  Ok(ProjectDetail {
    project: summary,
    score,
    references,
    recordings,
    markers,
    loop_range,
    bookmarks,
    note,
  })
}

fn load_score(conn: &Connection, project_root: &Path) -> Result<Option<ScoreAsset>> {
  let score = conn
    .query_row(
      r#"
      SELECT id, file_name, relative_path, format, imported_at, measure_count
      FROM scores
      ORDER BY imported_at DESC
      LIMIT 1
      "#,
      [],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, String>(3)?,
          row.get::<_, String>(4)?,
          row.get::<_, i64>(5)?,
        ))
      },
    )
    .optional()?;

  let Some(score) = score else {
    return Ok(None);
  };

  let path = project_root.join(&score.2);
  let preview_text = fs::read_to_string(path).unwrap_or_else(|_| String::from("Unable to read score preview."));

  Ok(Some(ScoreAsset {
    id: score.0,
    file_name: score.1,
    relative_path: score.2,
    format: score.3,
    imported_at: score.4,
    measure_count: score.5,
    preview_text,
  }))
}

fn load_references(conn: &Connection) -> Result<Vec<ReferenceAsset>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, file_name, relative_path, imported_at
    FROM references_table
    ORDER BY imported_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(ReferenceAsset {
      id: row.get(0)?,
      name: row.get(1)?,
      file_name: row.get(2)?,
      relative_path: row.get(3)?,
      imported_at: row.get(4)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_recordings(conn: &Connection) -> Result<Vec<RecordingAttempt>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, file_name, relative_path, measure_start, measure_end, recorded_at, duration_ms
    FROM recordings
    ORDER BY recorded_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(RecordingAttempt {
      id: row.get(0)?,
      name: row.get(1)?,
      file_name: row.get(2)?,
      relative_path: row.get(3)?,
      measure_start: row.get(4)?,
      measure_end: row.get(5)?,
      recorded_at: row.get(6)?,
      duration_ms: row.get(7)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_markers(conn: &Connection) -> Result<Vec<MeasureMarker>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, measure_number, timestamp_ms, label, note_text, created_at, updated_at
    FROM markers
    ORDER BY measure_number ASC, timestamp_ms ASC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(MeasureMarker {
      id: row.get(0)?,
      measure_number: row.get(1)?,
      timestamp_ms: row.get(2)?,
      label: row.get(3)?,
      note_text: row.get(4)?,
      created_at: row.get(5)?,
      updated_at: row.get(6)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_active_loop_range(conn: &Connection) -> Result<Option<LoopRange>> {
  let row = conn
    .query_row(
      r#"
      SELECT id, name, start_measure, end_measure, is_active, created_at, updated_at
      FROM loop_ranges
      WHERE is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
      "#,
      [],
      |row| {
        Ok(LoopRange {
          id: row.get(0)?,
          name: row.get(1)?,
          start_measure: row.get(2)?,
          end_measure: row.get(3)?,
          is_active: row.get::<_, i64>(4)? == 1,
          created_at: row.get(5)?,
          updated_at: row.get(6)?,
        })
      },
    )
    .optional()?;
  Ok(row)
}

fn load_bookmarks(conn: &Connection) -> Result<Vec<Bookmark>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, measure_number, created_at, updated_at
    FROM bookmarks
    ORDER BY measure_number ASC, updated_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(Bookmark {
      id: row.get(0)?,
      name: row.get(1)?,
      measure_number: row.get(2)?,
      created_at: row.get(3)?,
      updated_at: row.get(4)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

pub fn insert_score(project_root: &Path, file_name: &str, relative_path: &str, measure_count: i64) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM scores", [])?;
  conn.execute(
    r#"
    INSERT INTO scores (id, file_name, relative_path, format, imported_at, measure_count)
    VALUES (?1, ?2, ?3, 'musicxml', ?4, ?5)
    "#,
    params![Uuid::new_v4().to_string(), file_name, relative_path, now(), measure_count],
  )?;
  Ok(())
}

pub fn insert_reference(project_root: &Path, name: &str, file_name: &str, relative_path: &str) -> Result<ReferenceAsset> {
  let conn = open_project_conn(project_root)?;
  let asset = ReferenceAsset {
    id: Uuid::new_v4().to_string(),
    name: name.to_string(),
    file_name: file_name.to_string(),
    relative_path: relative_path.to_string(),
    imported_at: now(),
  };
  conn.execute(
    r#"
    INSERT INTO references_table (id, name, file_name, relative_path, imported_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    "#,
    params![asset.id, asset.name, asset.file_name, asset.relative_path, asset.imported_at],
  )?;
  Ok(asset)
}

pub fn insert_recording(project_root: &Path, recording: &RecordingAttempt) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    INSERT INTO recordings (id, name, file_name, relative_path, measure_start, measure_end, recorded_at, duration_ms)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    "#,
    params![
      recording.id,
      recording.name,
      recording.file_name,
      recording.relative_path,
      recording.measure_start,
      recording.measure_end,
      recording.recorded_at,
      recording.duration_ms,
    ],
  )?;
  Ok(())
}

pub fn upsert_marker(project_root: &Path, marker: &MeasureMarker) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    INSERT INTO markers (id, measure_number, timestamp_ms, label, note_text, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(id) DO UPDATE SET
      measure_number = excluded.measure_number,
      timestamp_ms = excluded.timestamp_ms,
      label = excluded.label,
      note_text = excluded.note_text,
      updated_at = excluded.updated_at
    "#,
    params![
      marker.id,
      marker.measure_number,
      marker.timestamp_ms,
      marker.label,
      marker.note_text,
      marker.created_at,
      marker.updated_at,
    ],
  )?;
  Ok(())
}

pub fn upsert_loop_range(project_root: &Path, loop_range: &LoopRange) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  if loop_range.is_active {
    conn.execute("UPDATE loop_ranges SET is_active = 0", [])?;
  }
  conn.execute(
    r#"
    INSERT INTO loop_ranges (id, name, start_measure, end_measure, is_active, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      start_measure = excluded.start_measure,
      end_measure = excluded.end_measure,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
    "#,
    params![
      loop_range.id,
      loop_range.name,
      loop_range.start_measure,
      loop_range.end_measure,
      if loop_range.is_active { 1 } else { 0 },
      loop_range.created_at,
      loop_range.updated_at,
    ],
  )?;
  Ok(())
}

pub fn upsert_bookmark(project_root: &Path, bookmark: &Bookmark) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    INSERT INTO bookmarks (id, name, measure_number, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      measure_number = excluded.measure_number,
      updated_at = excluded.updated_at
    "#,
    params![
      bookmark.id,
      bookmark.name,
      bookmark.measure_number,
      bookmark.created_at,
      bookmark.updated_at,
    ],
  )?;
  Ok(())
}

pub fn set_project_note(project_root: &Path, text: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let timestamp = now();
  conn.execute(
    r#"
    UPDATE project
    SET notes = ?1,
        notes_updated_at = ?2,
        updated_at = ?2
    "#,
    params![text, timestamp],
  )?;
  Ok(())
}

pub fn update_project_summary(project_root: &Path, summary: &ProjectSummary) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    UPDATE project
    SET name = ?2,
        active_reference_id = ?3,
        active_recording_id = ?4,
        updated_at = ?5
    WHERE id = ?1
    "#,
    params![
      summary.id,
      summary.name,
      summary.active_reference_id,
      summary.active_recording_id,
      summary.updated_at,
    ],
  )?;
  Ok(())
}

pub fn remove_reference(project_root: &Path, reference_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM references_table WHERE id = ?1", [reference_id])?;
  Ok(())
}

pub fn remove_marker(project_root: &Path, marker_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM markers WHERE id = ?1", [marker_id])?;
  Ok(())
}

pub fn remove_loop_range(project_root: &Path, loop_range_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM loop_ranges WHERE id = ?1", [loop_range_id])?;
  Ok(())
}

pub fn remove_bookmark(project_root: &Path, bookmark_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM bookmarks WHERE id = ?1", [bookmark_id])?;
  Ok(())
}

pub fn set_active_reference(project_root: &Path, reference_id: Option<&str>) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let current = conn
    .query_row(
      "SELECT id, name, notes, notes_updated_at, active_reference_id, active_recording_id, created_at, updated_at FROM project LIMIT 1",
      [],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, Option<String>>(3)?,
          row.get::<_, Option<String>>(4)?,
          row.get::<_, Option<String>>(5)?,
          row.get::<_, String>(6)?,
          row.get::<_, String>(7)?,
        ))
      },
    )?;
  conn.execute(
    "UPDATE project SET active_reference_id = ?1, updated_at = ?2 WHERE id = ?3",
    params![reference_id, now(), current.0],
  )?;
  Ok(())
}

pub fn set_active_recording(project_root: &Path, recording_id: Option<&str>) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let current: String = conn.query_row("SELECT id FROM project LIMIT 1", [], |row| row.get(0))?;
  conn.execute(
    "UPDATE project SET active_recording_id = ?1, updated_at = ?2 WHERE id = ?3",
    params![recording_id, now(), current],
  )?;
  Ok(())
}

pub fn rename_project_root(workspace_root: &Path, project_id: &str, old_name: &str, new_name: &str) -> Result<PathBuf> {
  let current_root = project_root(workspace_root, project_id, old_name);
  let new_root = project_root(workspace_root, project_id, new_name);
  if current_root != new_root {
    fs::rename(&current_root, &new_root).with_context(|| {
      format!(
        "Unable to rename project folder from {} to {}",
        current_root.display(),
        new_root.display()
      )
    })?;
  }
  Ok(new_root)
}

pub fn slugify(value: &str) -> String {
  let mut slug = String::new();
  let mut last_was_dash = false;
  for ch in value.chars() {
    if ch.is_ascii_alphanumeric() {
      slug.push(ch.to_ascii_lowercase());
      last_was_dash = false;
    } else if !last_was_dash {
      slug.push('-');
      last_was_dash = true;
    }
  }
  let trimmed = slug.trim_matches('-').to_string();
  if trimmed.is_empty() {
    "project".to_string()
  } else {
    trimmed
  }
}

pub fn now() -> String {
  Utc::now().to_rfc3339()
}

pub fn generate_id() -> String {
  Uuid::new_v4().to_string()
}

pub fn validate_musicxml(path: &Path) -> Result<i64> {
  let text = fs::read_to_string(path)
    .with_context(|| format!("Unable to read score file {}", path.display()))?;
  let regex = Regex::new(r#"<measure[^>]*number="(\d+)""#)?;
  let mut max_measure = 0_i64;
  for capture in regex.captures_iter(&text) {
    if let Ok(value) = capture[1].parse::<i64>() {
      max_measure = max_measure.max(value);
    }
  }
  Ok(max_measure.max(0))
}

pub fn copy_asset(source_path: &Path, destination_path: &Path) -> Result<()> {
  if let Some(parent) = destination_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::copy(source_path, destination_path).with_context(|| {
    format!(
      "Unable to copy asset from {} to {}",
      source_path.display(),
      destination_path.display()
    )
  })?;
  Ok(())
}

pub fn append_extension(name: &str, extension: &str) -> String {
  if name.ends_with(extension) {
    name.to_string()
  } else {
    format!("{name}.{extension}")
  }
}
