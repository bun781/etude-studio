use crate::models::*;
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Datelike, Duration, Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
  fs,
  path::{Path, PathBuf},
};
use uuid::Uuid;

pub const SCHEMA_VERSION: i64 = 5;

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
    CREATE TABLE IF NOT EXISTS practice_segments (
      id TEXT PRIMARY KEY,
      score_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      start_page INTEGER NOT NULL,
      end_page INTEGER NOT NULL,
      start_x REAL,
      start_y REAL,
      end_x REAL,
      end_y REAL,
      measure_start INTEGER,
      measure_end INTEGER,
      reference_id TEXT,
      reference_start_ms INTEGER,
      reference_end_ms INTEGER,
      status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      segment_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      duration_ms INTEGER
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
      segment_id TEXT,
      reference_id TEXT,
      recording_id TEXT,
      created_at TEXT NOT NULL
    )
    "#,
    [],
  )?;

  if version.is_some() {
    migrate_project_db(&conn, version)?;
  }

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
  ensure_column(conn, "recordings", "reference_id", "TEXT")?;
  ensure_column(conn, "recordings", "segment_id", "TEXT")?;
  ensure_column(conn, "recordings", "notes", "TEXT")?;
  ensure_column(conn, "recordings", "created_at", "TEXT")?;

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
      segment_id TEXT,
      reference_id TEXT,
      recording_id TEXT,
      created_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  ensure_column(conn, "practice_activity", "segment_id", "TEXT")?;
  conn.execute(
    r#"
    CREATE TABLE IF NOT EXISTS practice_segments (
      id TEXT PRIMARY KEY,
      score_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      start_page INTEGER NOT NULL,
      end_page INTEGER NOT NULL,
      start_x REAL,
      start_y REAL,
      end_x REAL,
      end_y REAL,
      measure_start INTEGER,
      measure_end INTEGER,
      reference_id TEXT,
      reference_start_ms INTEGER,
      reference_end_ms INTEGER,
      status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    "#,
    [],
  )?;
  conn.execute("DELETE FROM schema_version", [])?;
  conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [SCHEMA_VERSION])?;
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
  let conn = Connection::open(project_db_path(project_root))?;
  conn.execute(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
    [],
  )?;
  let version: Option<i64> = conn
    .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0))
    .optional()?;
  migrate_project_db(&conn, version)?;
  Ok(conn)
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
    practice_sessions,
    recent_activity,
    stats,
    note,
  })
}

fn load_score(conn: &Connection, _project_root: &Path) -> Result<Option<ScoreAsset>> {
  let score = conn
    .query_row(
      r#"
      SELECT id, file_name, relative_path, imported_at
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
        ))
      },
    )
    .optional()?;

  let Some(score) = score else {
    return Ok(None);
  };

  let segments = load_practice_segments(conn, &score.0)?;

  Ok(Some(ScoreAsset {
    id: score.0,
    file_name: score.1,
    relative_path: score.2,
    imported_at: score.3,
    segments,
  }))
}

fn load_practice_segments(conn: &Connection, score_id: &str) -> Result<Vec<PracticeSegment>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, score_id, name, position, start_page, end_page, start_x, start_y, end_x, end_y,
           measure_start, measure_end, reference_id, reference_start_ms, reference_end_ms,
           status, notes, created_at, updated_at
    FROM practice_segments
    WHERE score_id = ?1
    ORDER BY position ASC
    "#,
  )?;
  let rows = stmt.query_map([score_id], |row| {
    Ok(PracticeSegment {
      id: row.get(0)?,
      score_id: row.get(1)?,
      name: row.get(2)?,
      position: row.get(3)?,
      start_page: row.get(4)?,
      end_page: row.get(5)?,
      start_x: row.get(6)?,
      start_y: row.get(7)?,
      end_x: row.get(8)?,
      end_y: row.get(9)?,
      measure_start: row.get(10)?,
      measure_end: row.get(11)?,
      reference_id: row.get(12)?,
      reference_start_ms: row.get(13)?,
      reference_end_ms: row.get(14)?,
      status: row.get(15)?,
      notes: row.get(16)?,
      created_at: row.get(17)?,
      updated_at: row.get(18)?,
    })
  })?;
  rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
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
    SELECT id, project_id, name, file_name, relative_path, reference_id, segment_id, notes, created_at, recorded_at, duration_ms
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
      segment_id: row.get(6)?,
      notes: row.get(7)?,
      created_at: row.get(8)?,
      recorded_at: row.get(9)?,
      duration_ms: row.get(10)?,
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
    SELECT id, session_id, kind, title, detail, segment_id, reference_id, recording_id, created_at
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
      segment_id: row.get(5)?,
      reference_id: row.get(6)?,
      recording_id: row.get(7)?,
      created_at: row.get(8)?,
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
  let segment_count: i64 = conn.query_row("SELECT COUNT(*) FROM practice_segments", [], |row| row.get(0))?;

  let mut segment_stmt = conn.prepare(
    r#"
    SELECT s.id, s.name, COUNT(r.id) AS recording_count
    FROM practice_segments s
    LEFT JOIN recordings r ON r.segment_id = s.id
    GROUP BY s.id
    HAVING recording_count > 0
    ORDER BY recording_count DESC, s.position ASC
    LIMIT 5
    "#,
  )?;
  let rows = segment_stmt.query_map([], |row| {
    Ok(PracticeSegmentStat {
      segment_id: row.get(0)?,
      segment_name: row.get(1)?,
      count: row.get(2)?,
    })
  })?;
  let mut most_practiced_segments = Vec::new();
  for row in rows {
    most_practiced_segments.push(row?);
  }

  Ok(PracticeStats {
    today_ms,
    week_ms,
    recording_attempts,
    segment_count,
    most_practiced_segments,
  })
}

fn parse_datetime(value: &str) -> Result<DateTime<Utc>> {
  Ok(DateTime::parse_from_rfc3339(value)?.with_timezone(&Utc))
}

pub fn insert_score(project_root: &Path, file_name: &str, relative_path: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let score_id = Uuid::new_v4().to_string();
  conn.execute("DELETE FROM scores", [])?;
  conn.execute("DELETE FROM practice_segments", [])?;
  conn.execute(
    r#"
    INSERT INTO scores (id, file_name, relative_path, format, imported_at, measure_count)
    VALUES (?1, ?2, ?3, 'pdf', ?4, 0)
    "#,
    params![score_id, file_name, relative_path, now()],
  )?;
  Ok(())
}

pub fn upsert_practice_segment(project_root: &Path, segment: &PracticeSegment) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute(
    r#"
    INSERT INTO practice_segments (
      id, score_id, name, position, start_page, end_page, start_x, start_y, end_x, end_y,
      measure_start, measure_end, reference_id, reference_start_ms, reference_end_ms,
      status, notes, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      position = excluded.position,
      start_page = excluded.start_page,
      end_page = excluded.end_page,
      start_x = excluded.start_x,
      start_y = excluded.start_y,
      end_x = excluded.end_x,
      end_y = excluded.end_y,
      measure_start = excluded.measure_start,
      measure_end = excluded.measure_end,
      reference_id = excluded.reference_id,
      reference_start_ms = excluded.reference_start_ms,
      reference_end_ms = excluded.reference_end_ms,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
    "#,
    params![
      segment.id,
      segment.score_id,
      segment.name,
      segment.position,
      segment.start_page,
      segment.end_page,
      segment.start_x,
      segment.start_y,
      segment.end_x,
      segment.end_y,
      segment.measure_start,
      segment.measure_end,
      segment.reference_id,
      segment.reference_start_ms,
      segment.reference_end_ms,
      segment.status,
      segment.notes,
      segment.created_at,
      segment.updated_at,
    ],
  )?;
  Ok(())
}

pub fn remove_practice_segment(project_root: &Path, segment_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  conn.execute("DELETE FROM practice_segments WHERE id = ?1", [segment_id])?;
  conn.execute("UPDATE recordings SET segment_id = NULL WHERE segment_id = ?1", [segment_id])?;
  Ok(())
}

pub fn reorder_practice_segments(project_root: &Path, segment_ids: &[String]) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  for (index, segment_id) in segment_ids.iter().enumerate() {
    conn.execute(
      "UPDATE practice_segments SET position = ?1, updated_at = ?2 WHERE id = ?3",
      params![index as i64, now(), segment_id],
    )?;
  }
  Ok(())
}

pub fn load_practice_segment(project_root: &Path, segment_id: &str) -> Result<Option<PracticeSegment>> {
  let conn = open_project_conn(project_root)?;
  conn
    .query_row(
      r#"
      SELECT id, score_id, name, position, start_page, end_page, start_x, start_y, end_x, end_y,
             measure_start, measure_end, reference_id, reference_start_ms, reference_end_ms,
             status, notes, created_at, updated_at
      FROM practice_segments
      WHERE id = ?1
      "#,
      [segment_id],
      |row| {
        Ok(PracticeSegment {
          id: row.get(0)?,
          score_id: row.get(1)?,
          name: row.get(2)?,
          position: row.get(3)?,
          start_page: row.get(4)?,
          end_page: row.get(5)?,
          start_x: row.get(6)?,
          start_y: row.get(7)?,
          end_x: row.get(8)?,
          end_y: row.get(9)?,
          measure_start: row.get(10)?,
          measure_end: row.get(11)?,
          reference_id: row.get(12)?,
          reference_start_ms: row.get(13)?,
          reference_end_ms: row.get(14)?,
          status: row.get(15)?,
          notes: row.get(16)?,
          created_at: row.get(17)?,
          updated_at: row.get(18)?,
        })
      },
    )
    .optional()
    .map_err(Into::into)
}

pub fn next_segment_position(project_root: &Path, score_id: &str) -> Result<i64> {
  let conn = open_project_conn(project_root)?;
  let max_position: Option<i64> = conn.query_row(
    "SELECT MAX(position) FROM practice_segments WHERE score_id = ?1",
    [score_id],
    |row| row.get(0),
  )?;
  Ok(max_position.map(|value| value + 1).unwrap_or(0))
}

pub fn current_score_id(project_root: &Path) -> Result<Option<String>> {
  let conn = open_project_conn(project_root)?;
  conn
    .query_row("SELECT id FROM scores ORDER BY imported_at DESC LIMIT 1", [], |row| row.get(0))
    .optional()
    .map_err(Into::into)
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
      id, project_id, name, file_name, relative_path, reference_id, segment_id, notes, created_at,
      recorded_at, duration_ms
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    "#,
    params![
      recording.id,
      recording.project_id,
      recording.name,
      recording.file_name,
      recording.relative_path,
      recording.reference_id,
      recording.segment_id,
      recording.notes,
      recording.created_at,
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
      SELECT id, project_id, name, file_name, relative_path, reference_id, segment_id, notes, created_at, recorded_at, duration_ms
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
          segment_id: row.get(6)?,
          notes: row.get(7)?,
          created_at: row.get(8)?,
          recorded_at: row.get(9)?,
          duration_ms: row.get(10)?,
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
        segment_id = ?5
    WHERE id = ?1
    "#,
    params![
      recording.id,
      recording.name,
      recording.reference_id,
      recording.notes,
      recording.segment_id,
    ],
  )?;
  Ok(())
}

pub fn delete_recording(project_root: &Path, recording_id: &str) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let relative_path: Option<String> = conn
    .query_row(
      "SELECT relative_path FROM recordings WHERE id = ?1",
      [recording_id],
      |row| row.get(0),
    )
    .optional()?;
  conn.execute("DELETE FROM recordings WHERE id = ?1", [recording_id])?;
  if let Some(relative_path) = relative_path {
    let absolute_path = project_root.join(relative_path);
    if absolute_path.exists() {
      fs::remove_file(&absolute_path).ok();
    }
  }
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
  segment_id: Option<&str>,
  reference_id: Option<&str>,
  recording_id: Option<&str>,
) -> Result<()> {
  let conn = open_project_conn(project_root)?;
  let session_id: Option<String> = conn
    .query_row("SELECT active_practice_session_id FROM project LIMIT 1", [], |row| row.get(0))
    .optional()?;
  conn.execute(
    r#"
    INSERT INTO practice_activity (
      id, project_id, session_id, kind, title, detail, segment_id, reference_id, recording_id, created_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    "#,
    params![
      generate_id(),
      project_id,
      session_id,
      kind,
      title,
      detail,
      segment_id,
      reference_id,
      recording_id,
      now(),
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

pub fn reference_exists(project_root: &Path, reference_id: &str) -> Result<bool> {
  let conn = open_project_conn(project_root)?;
  let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM references_table WHERE id = ?1",
    [reference_id],
    |row| row.get(0),
  )?;
  Ok(count > 0)
}

pub fn set_active_reference(project_root: &Path, reference_id: Option<&str>) -> Result<()> {
  if let Some(reference_id) = reference_id {
    if !reference_exists(project_root, reference_id)? {
      return Err(anyhow!("Reference not found"));
    }
  }
  let conn = open_project_conn(project_root)?;
  let current: String = conn.query_row("SELECT id FROM project LIMIT 1", [], |row| row.get(0))?;
  conn.execute(
    "UPDATE project SET active_reference_id = ?1, updated_at = ?2 WHERE id = ?3",
    params![reference_id, now(), current],
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

pub fn validate_pdf(path: &Path) -> Result<()> {
  let bytes = fs::read(path)
    .with_context(|| format!("Unable to read PDF score file {}", path.display()))?;
  if bytes.starts_with(b"%PDF-") {
    Ok(())
  } else {
    Err(anyhow!("The selected score is not a valid PDF file."))
  }
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
  let file_name = Path::new(name)
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or("asset")
    .trim();
  let file_name = if file_name.is_empty() { "asset" } else { file_name };
  let extension = extension.trim().trim_start_matches('.');
  if extension.is_empty() || file_name_has_extension(file_name, extension) {
    file_name.to_string()
  } else {
    format!("{file_name}.{extension}")
  }
}

pub fn unique_destination_path(directory: &Path, file_name: &str) -> PathBuf {
  let file_name = Path::new(file_name)
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or("asset")
    .trim();
  let file_name = if file_name.is_empty() { "asset" } else { file_name };
  let requested = Path::new(file_name);
  let stem = requested
    .file_stem()
    .and_then(|value| value.to_str())
    .filter(|value| !value.is_empty())
    .unwrap_or("asset");
  let extension = requested.extension().and_then(|value| value.to_str());

  let first = directory.join(file_name);
  if !first.exists() {
    return first;
  }

  for index in 1.. {
    let candidate_name = match extension {
      Some(extension) if !extension.is_empty() => format!("{stem}-{index}.{extension}"),
      _ => format!("{stem}-{index}"),
    };
    let candidate = directory.join(candidate_name);
    if !candidate.exists() {
      return candidate;
    }
  }
  unreachable!("unbounded search always returns a destination path")
}

fn file_name_has_extension(file_name: &str, extension: &str) -> bool {
  Path::new(file_name)
    .extension()
    .and_then(|value| value.to_str())
    .is_some_and(|value| value.eq_ignore_ascii_case(extension))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn append_extension_strips_path_components_and_matches_case_insensitively() {
    assert_eq!(append_extension("../Etude.MUSICXML", "musicxml"), "Etude.MUSICXML");
    assert_eq!(append_extension("folder/score", ".pdf"), "score.pdf");
  }

  #[test]
  fn unique_destination_path_does_not_overwrite_existing_files() {
    let directory = std::env::temp_dir()
      .join(format!("reference-practice-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("reference.mp3"), b"first").unwrap();
    fs::write(directory.join("reference-1.mp3"), b"second").unwrap();

    let destination = unique_destination_path(&directory, "reference.mp3");
    assert_eq!(
      destination.file_name().and_then(|value| value.to_str()),
      Some("reference-2.mp3")
    );

    fs::remove_dir_all(directory).unwrap();
  }
}
