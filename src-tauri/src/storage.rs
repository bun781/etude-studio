use crate::models::*;
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Datelike, Duration, Local, Utc};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
  fs,
  path::{Path, PathBuf},
};
use uuid::Uuid;

pub const SCHEMA_VERSION: i64 = 3;

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
  } else if version.unwrap_or(0) < SCHEMA_VERSION {
    conn.execute("UPDATE schema_version SET version = ?1", [SCHEMA_VERSION])?;
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
      active_recording_id TEXT,
      active_practice_session_id TEXT
    )
    "#,
    [],
  )?;
  ensure_column(&conn, "projects", "active_practice_session_id", "TEXT")?;
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
      active_practice_session_id TEXT,
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
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      reference_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
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
      measure_start INTEGER,
      measure_end INTEGER,
      label TEXT,
      note_text TEXT,
      color TEXT,
      status TEXT NOT NULL DEFAULT 'Needs Work',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS practice_activity (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      measure_start INTEGER,
      measure_end INTEGER,
      reference_id TEXT,
      recording_id TEXT,
      bookmark_id TEXT,
      created_at TEXT NOT NULL
    )
    "#,
    [],
  )?;

  migrate_project_db(&conn, version)?;

  conn.execute(
    r#"INSERT OR IGNORE INTO project (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)"#,
    params![project_id, project_name, now(), now()],
  )?;
  Ok(())
}

fn migrate_project_db(conn: &Connection, version: Option<i64>) -> Result<()> {
  if version.unwrap_or(0) >= SCHEMA_VERSION {
    return Ok(());
  }

  ensure_column(conn, "project", "active_practice_session_id", "TEXT")?;
  ensure_column(conn, "recordings", "project_id", "TEXT")?;
  ensure_column(conn, "bookmarks", "measure_start", "INTEGER")?;
  ensure_column(conn, "bookmarks", "measure_end", "INTEGER")?;
  ensure_column(conn, "bookmarks", "label", "TEXT")?;
  ensure_column(conn, "bookmarks", "note_text", "TEXT")?;
  ensure_column(conn, "bookmarks", "color", "TEXT")?;
  ensure_column(conn, "bookmarks", "status", "TEXT NOT NULL DEFAULT 'Needs Work'")?;
  ensure_column(conn, "recordings", "reference_id", "TEXT")?;
  ensure_column(conn, "recordings", "notes", "TEXT")?;
  ensure_column(conn, "recordings", "created_at", "TEXT")?;

  conn.execute(
    r#"
    UPDATE bookmarks
    SET measure_start = COALESCE(measure_start, measure_number),
        measure_end = COALESCE(measure_end, measure_number),
        label = COALESCE(label, name),
        status = COALESCE(NULLIF(status, ''), 'Needs Work')
    "#,
    [],
  )?;
  let project_id: String = conn.query_row("SELECT id FROM project LIMIT 1", [], |row| row.get(0))?;
  conn.execute(
    r#"
    UPDATE recordings
    SET project_id = COALESCE(NULLIF(project_id, ''), ?1),
        created_at = COALESCE(created_at, recorded_at)
    "#,
    params![project_id],
  )?;

  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS practice_activity (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      measure_start INTEGER,
      measure_end INTEGER,
      reference_id TEXT,
      recording_id TEXT,
      bookmark_id TEXT,
      created_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute("UPDATE schema_version SET version = ?1", [SCHEMA_VERSION])?;
  Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
  if table_has_column(conn, table, column)? {
    return Ok(());
  }
  conn.execute(
    &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
    [],
  )?;
  Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
  let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
  let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
  for row in rows {
    if row? == column {
      return Ok(true);
    }
  }
  Ok(false)
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
    active_practice_session_id: None,
  })
}

pub fn list_projects(workspace_root: &Path) -> Result<Vec<ProjectSummary>> {
  let conn = open_library_conn(workspace_root)?;
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, root_path, created_at, updated_at, last_opened_at, active_reference_id, active_recording_id, active_practice_session_id
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
      active_practice_session_id: row.get(8)?,
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
    SELECT id, name, root_path, created_at, updated_at, last_opened_at, active_reference_id, active_recording_id, active_practice_session_id
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
        active_practice_session_id: row.get(8)?,
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
        active_recording_id = ?8,
        active_practice_session_id = ?9
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
      project.active_recording_id,
      project.active_practice_session_id
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
    SELECT id, name, notes, notes_updated_at, active_reference_id, active_recording_id, active_practice_session_id, created_at, updated_at
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
        row.get::<_, Option<String>>(6)?,
        row.get::<_, String>(7)?,
        row.get::<_, String>(8)?,
      ))
    },
  )?;

  let summary = ProjectSummary {
    id: project.0.clone(),
    name: project.1.clone(),
    root_path: project_root.to_string_lossy().to_string(),
    created_at: project.7.clone(),
    updated_at: project.8.clone(),
    last_opened_at: project.8.clone(),
    active_reference_id: project.4.clone(),
    active_recording_id: project.5.clone(),
    active_practice_session_id: project.6.clone(),
  };

  let score = load_score(&conn, project_root)?;
  let references = load_references(&conn)?;
  let recordings = load_recordings(&conn)?;
  let markers = load_markers(&conn)?;
  let loop_range = load_active_loop_range(&conn)?;
  let bookmarks = load_bookmarks(&conn)?;
  let practice_sessions = load_practice_sessions(&conn)?;
  let recent_activity = load_recent_activity(&conn)?;
  let stats = load_practice_stats(&conn)?;
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
    practice_sessions,
    recent_activity,
    stats,
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
    SELECT id, project_id, name, file_name, relative_path, reference_id, notes, created_at, measure_start, measure_end, recorded_at, duration_ms
    FROM recordings
    ORDER BY COALESCE(created_at, recorded_at) DESC, recorded_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(RecordingAttempt {
      id: row.get(0)?,
      project_id: row.get(1)?,
      name: row.get(2)?,
      file_name: row.get(3)?,
      relative_path: row.get(4)?,
      reference_id: row.get(5)?,
      notes: row.get(6)?,
      created_at: row.get(7)?,
      measure_start: row.get(8)?,
      measure_end: row.get(9)?,
      recorded_at: row.get(10)?,
      duration_ms: row.get(11)?,
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
    SELECT id, measure_number, measure_start, measure_end, label, note_text, color, status, created_at, updated_at
    FROM bookmarks
    ORDER BY COALESCE(measure_start, measure_number) ASC, updated_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    let measure_number: i64 = row.get(1)?;
    let measure_start = row.get::<_, Option<i64>>(2)?.unwrap_or(measure_number);
    let measure_end = row.get::<_, Option<i64>>(3)?.unwrap_or(measure_start);
    Ok(Bookmark {
      id: row.get(0)?,
      measure_start,
      measure_end,
      label: row
        .get::<_, Option<String>>(4)?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| String::from("Bookmark")),
      note_text: row.get(5)?,
      color: row.get(6)?,
      status: row
        .get::<_, Option<String>>(7)?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| String::from("Needs Work")),
      created_at: row.get(8)?,
      updated_at: row.get(9)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_practice_sessions(conn: &Connection) -> Result<Vec<PracticeSession>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, started_at, ended_at, duration_ms, created_at, updated_at
    FROM practice_sessions
    ORDER BY started_at DESC
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(PracticeSession {
      id: row.get(0)?,
      started_at: row.get(1)?,
      ended_at: row.get(2)?,
      duration_ms: row.get(3)?,
      created_at: row.get(4)?,
      updated_at: row.get(5)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_recent_activity(conn: &Connection) -> Result<Vec<PracticeActivity>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, session_id, kind, title, detail, measure_start, measure_end, reference_id, recording_id, bookmark_id, created_at
    FROM practice_activity
    ORDER BY created_at DESC
    LIMIT 24
    "#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok(PracticeActivity {
      id: row.get(0)?,
      session_id: row.get(1)?,
      kind: row.get(2)?,
      title: row.get(3)?,
      detail: row.get(4)?,
      measure_start: row.get(5)?,
      measure_end: row.get(6)?,
      reference_id: row.get(7)?,
      recording_id: row.get(8)?,
      bookmark_id: row.get(9)?,
      created_at: row.get(10)?,
    })
  })?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row?);
  }
  Ok(result)
}

fn load_practice_stats(conn: &Connection) -> Result<PracticeStats> {
  let now_local = Local::now();
  let today_start = now_local.date_naive().and_hms_opt(0, 0, 0).unwrap();
  let week_start = today_start - Duration::days(i64::from(now_local.weekday().num_days_from_monday()));
  let sessions = load_practice_sessions(conn)?;

  let mut today_ms = 0_i64;
  let mut week_ms = 0_i64;
  let mut range_counts: std::collections::HashMap<(i64, i64), i64> = std::collections::HashMap::new();

  for session in &sessions {
    let started_at = parse_datetime(&session.started_at)?;
    let ended_at = session
      .ended_at
      .as_ref()
      .and_then(|value| parse_datetime(value).ok())
      .unwrap_or_else(Utc::now);
    let duration_ms = session.duration_ms.unwrap_or_else(|| (ended_at - started_at).num_milliseconds().max(0));
    let started_local = started_at.with_timezone(&Local);
    if started_local.naive_local() >= today_start {
      today_ms += duration_ms;
    }
    if started_local.naive_local() >= week_start {
      week_ms += duration_ms;
    }
  }

  let recording_attempts: i64 = conn.query_row("SELECT COUNT(*) FROM recordings", [], |row| row.get(0))?;
  let bookmark_count: i64 = conn.query_row("SELECT COUNT(*) FROM bookmarks", [], |row| row.get(0))?;

  for bookmark in load_bookmarks(conn)? {
    *range_counts.entry((bookmark.measure_start, bookmark.measure_end)).or_insert(0) += 1;
  }

  let mut recording_stmt = conn.prepare(
    r#"
    SELECT measure_start, measure_end
    FROM recordings
    WHERE measure_start IS NOT NULL AND measure_end IS NOT NULL
    "#,
  )?;
  let recording_ranges = recording_stmt.query_map([], |row| {
    Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
  })?;
  for range in recording_ranges {
    let (measure_start, measure_end) = range?;
    *range_counts.entry((measure_start, measure_end)).or_insert(0) += 1;
  }

  let mut most_practiced_ranges: Vec<PracticeRangeStat> = range_counts
    .into_iter()
    .map(|((measure_start, measure_end), count)| PracticeRangeStat {
      measure_start,
      measure_end,
      count,
    })
    .collect();
  most_practiced_ranges.sort_by(|left, right| {
    right
      .count
      .cmp(&left.count)
      .then_with(|| left.measure_start.cmp(&right.measure_start))
  });
  most_practiced_ranges.truncate(5);

  Ok(PracticeStats {
    today_ms,
    week_ms,
    recording_attempts,
    bookmark_count,
    most_practiced_ranges,
  })
}

fn parse_datetime(value: &str) -> Result<DateTime<Utc>> {
  Ok(DateTime::parse_from_rfc3339(value)?.with_timezone(&Utc))
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
    INSERT INTO recordings (
      id, project_id, name, file_name, relative_path, reference_id, notes, created_at,
      measure_start, measure_end, recorded_at, duration_ms
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    "#,
    params![
      recording.id,
      recording.project_id,
      recording.name,
      recording.file_name,
      recording.relative_path,
      recording.reference_id,
      recording.notes,
      recording.created_at,
      recording.measure_start,
      recording.measure_end,
      recording.recorded_at,
      recording.duration_ms,
    ],
  )?;
  Ok(())
}

pub fn load_recording(conn: &Connection, recording_id: &str) -> Result<Option<RecordingAttempt>> {
  conn
    .query_row(
      r#"
      SELECT id, project_id, name, file_name, relative_path, reference_id, notes, created_at, measure_start, measure_end, recorded_at, duration_ms
      FROM recordings
      WHERE id = ?1
      "#,
      [recording_id],
      |row| {
        Ok(RecordingAttempt {
          id: row.get(0)?,
          project_id: row.get(1)?,
          name: row.get(2)?,
          file_name: row.get(3)?,
          relative_path: row.get(4)?,
          reference_id: row.get(5)?,
          notes: row.get(6)?,
          created_at: row.get(7)?,
          measure_start: row.get(8)?,
          measure_end: row.get(9)?,
          recorded_at: row.get(10)?,
          duration_ms: row.get(11)?,
        })
      },
    )
    .optional()
    .map_err(Into::into)
}

pub fn update_recording(project_root: &Path, recording: &RecordingAttempt) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    UPDATE recordings
    SET name = ?2,
        reference_id = ?3,
        notes = ?4,
        measure_start = ?5,
        measure_end = ?6
    WHERE id = ?1
    "#,
    params![
      recording.id,
      recording.name,
      recording.reference_id,
      recording.notes,
      recording.measure_start,
      recording.measure_end,
    ],
  )?;
  Ok(())
}

pub fn delete_recording(project_root: &Path, recording_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM recordings WHERE id = ?1", [recording_id])?;
  Ok(())
}

pub fn start_practice_session(project_root: &Path, project_id: &str) -> Result<PracticeSession> {
  let conn = open_project_conn(project_root)?;
  let current_active: Option<String> = conn.query_row(
    "SELECT active_practice_session_id FROM project LIMIT 1",
    [],
    |row| row.get(0),
  )?;
  if let Some(session_id) = current_active {
    let session = conn
      .query_row(
      r#"
      SELECT id, started_at, ended_at, duration_ms, created_at, updated_at
      FROM practice_sessions
      WHERE id = ?1
      "#,
      [session_id],
      |row| {
        Ok(PracticeSession {
          id: row.get(0)?,
          started_at: row.get(1)?,
          ended_at: row.get(2)?,
          duration_ms: row.get(3)?,
          created_at: row.get(4)?,
          updated_at: row.get(5)?,
        })
      },
      )
      .optional()?;
    if let Some(session) = session {
      if session.ended_at.is_none() {
        return Ok(session);
      }
    }
    conn.execute("UPDATE project SET active_practice_session_id = NULL, updated_at = ?1", [now()])?;
  }

  let timestamp = now();
  let session = PracticeSession {
    id: generate_id(),
    started_at: timestamp.clone(),
    ended_at: None,
    duration_ms: None,
    created_at: timestamp.clone(),
    updated_at: timestamp.clone(),
  };
  conn.execute(
    r#"
    INSERT INTO practice_sessions (id, project_id, started_at, ended_at, duration_ms, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    "#,
    params![
      session.id,
      project_id,
      session.started_at,
      session.ended_at,
      session.duration_ms,
      session.created_at,
      session.updated_at,
    ],
  )?;
  conn.execute(
    "UPDATE project SET active_practice_session_id = ?1, updated_at = ?2",
    params![session.id, now()],
  )?;
  let _ = log_practice_activity(
    project_root,
    project_id,
    "session_start",
    "Started practice session",
    None,
    None,
    None,
    None,
    None,
    None,
  );
  Ok(session)
}

pub fn end_practice_session(project_root: &Path, project_id: &str) -> Result<Option<PracticeSession>> {
  let conn = open_project_conn(project_root)?;
  let active_session_id: Option<String> = conn.query_row(
    "SELECT active_practice_session_id FROM project LIMIT 1",
    [],
    |row| row.get(0),
  )?;
  let Some(session_id) = active_session_id else {
    return Ok(None);
  };

  let session = conn
    .query_row(
    r#"
    SELECT id, started_at, ended_at, duration_ms, created_at, updated_at
    FROM practice_sessions
    WHERE id = ?1
    "#,
    [session_id.clone()],
    |row| {
      Ok(PracticeSession {
        id: row.get(0)?,
        started_at: row.get(1)?,
        ended_at: row.get(2)?,
        duration_ms: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        })
      },
    )
    .optional()?;
  let Some(session) = session else {
    conn.execute(
      "UPDATE project SET active_practice_session_id = NULL, updated_at = ?1",
      [now()],
    )?;
    return Ok(None);
  };
  if session.ended_at.is_some() {
    conn.execute(
      "UPDATE project SET active_practice_session_id = NULL, updated_at = ?1",
      [now()],
    )?;
    return Ok(Some(session));
  }

  let ended_at = now();
  let started_at = parse_datetime(&session.started_at)?;
  let ended_at_dt = parse_datetime(&ended_at)?;
  let duration_ms = (ended_at_dt - started_at).num_milliseconds().max(0);
  conn.execute(
    r#"
    UPDATE practice_sessions
    SET ended_at = ?2,
        duration_ms = ?3,
        updated_at = ?2
    WHERE id = ?1
    "#,
    params![session.id, ended_at, duration_ms],
  )?;
  let _ = log_practice_activity(
    project_root,
    project_id,
    "session_end",
    "Completed practice session",
    None,
    None,
    None,
    None,
    None,
    None,
  );
  conn.execute(
    "UPDATE project SET active_practice_session_id = NULL, updated_at = ?1",
    [now()],
  )?;
  Ok(Some(PracticeSession {
    ended_at: Some(ended_at),
    duration_ms: Some(duration_ms),
    ..session
  }))
}

pub fn log_practice_activity(
  project_root: &Path,
  project_id: &str,
  kind: &str,
  title: &str,
  detail: Option<&str>,
  measure_start: Option<i64>,
  measure_end: Option<i64>,
  reference_id: Option<&str>,
  recording_id: Option<&str>,
  bookmark_id: Option<&str>,
) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let session_id: Option<String> = conn
    .query_row("SELECT active_practice_session_id FROM project LIMIT 1", [], |row| row.get(0))
    .optional()?;
  conn.execute(
    r#"
    INSERT INTO practice_activity (
      id, project_id, session_id, kind, title, detail, measure_start, measure_end,
      reference_id, recording_id, bookmark_id, created_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    "#,
    params![
      generate_id(),
      project_id,
      session_id,
      kind,
      title,
      detail,
      measure_start,
      measure_end,
      reference_id,
      recording_id,
      bookmark_id,
      now(),
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
    INSERT INTO bookmarks (id, measure_number, measure_start, measure_end, label, note_text, color, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(id) DO UPDATE SET
      measure_number = excluded.measure_number,
      measure_start = excluded.measure_start,
      measure_end = excluded.measure_end,
      label = excluded.label,
      note_text = excluded.note_text,
      color = excluded.color,
      status = excluded.status,
      updated_at = excluded.updated_at
    "#,
    params![
      bookmark.id,
      bookmark.measure_start,
      bookmark.measure_start,
      bookmark.measure_end,
      bookmark.label,
      bookmark.note_text,
      bookmark.color,
      bookmark.status,
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
