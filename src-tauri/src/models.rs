use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameProjectInput {
  pub project_id: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProjectInput {
  pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAssetInput {
  pub project_id: String,
  pub source_path: String,
  pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMarkerInput {
  pub project_id: String,
  pub marker: MarkerDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerDraft {
  pub id: Option<String>,
  pub measure_number: i64,
  pub timestamp_ms: i64,
  pub label: Option<String>,
  pub note_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLoopRangeInput {
  pub project_id: String,
  pub loop_range: LoopRangeDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRangeDraft {
  pub id: Option<String>,
  pub name: String,
  pub start_measure: i64,
  pub end_measure: i64,
  pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBookmarkInput {
  pub project_id: String,
  pub bookmark: BookmarkDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkDraft {
  pub id: Option<String>,
  pub measure_start: i64,
  pub measure_end: i64,
  pub label: String,
  pub note_text: Option<String>,
  pub color: Option<String>,
  pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndPracticeSessionInput {
  pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRecordingInput {
  pub project_id: String,
  pub file_name: String,
  pub relative_path: String,
  pub name: String,
  pub reference_id: Option<String>,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub recorded_at: String,
  pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecordingInput {
  pub project_id: String,
  pub recording_id: String,
  pub name: String,
  pub notes: Option<String>,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub reference_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateRecordingInput {
  pub project_id: String,
  pub recording_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
  pub id: String,
  pub name: String,
  pub root_path: String,
  pub created_at: String,
  pub updated_at: String,
  pub last_opened_at: String,
  pub active_reference_id: Option<String>,
  pub active_recording_id: Option<String>,
  pub active_practice_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreAsset {
  pub id: String,
  pub file_name: String,
  pub relative_path: String,
  pub format: String,
  pub imported_at: String,
  pub measure_count: i64,
  pub preview_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceAsset {
  pub id: String,
  pub name: String,
  pub file_name: String,
  pub relative_path: String,
  pub imported_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingAttempt {
  pub id: String,
  pub project_id: String,
  pub name: String,
  pub file_name: String,
  pub relative_path: String,
  pub reference_id: Option<String>,
  pub notes: Option<String>,
  pub created_at: String,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub recorded_at: String,
  pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasureMarker {
  pub id: String,
  pub measure_number: i64,
  pub timestamp_ms: i64,
  pub label: Option<String>,
  pub note_text: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRange {
  pub id: String,
  pub name: String,
  pub start_measure: i64,
  pub end_measure: i64,
  pub is_active: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
  pub id: String,
  pub measure_start: i64,
  pub measure_end: i64,
  pub label: String,
  pub note_text: Option<String>,
  pub color: Option<String>,
  pub status: String,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSession {
  pub id: String,
  pub started_at: String,
  pub ended_at: Option<String>,
  pub duration_ms: Option<i64>,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeActivity {
  pub id: String,
  pub session_id: Option<String>,
  pub kind: String,
  pub title: String,
  pub detail: Option<String>,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub reference_id: Option<String>,
  pub recording_id: Option<String>,
  pub bookmark_id: Option<String>,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeRangeStat {
  pub measure_start: i64,
  pub measure_end: i64,
  pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeStats {
  pub today_ms: i64,
  pub week_ms: i64,
  pub recording_attempts: i64,
  pub bookmark_count: i64,
  pub most_practiced_ranges: Vec<PracticeRangeStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectNote {
  pub text: String,
  pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
  pub project: ProjectSummary,
  pub score: Option<ScoreAsset>,
  pub references: Vec<ReferenceAsset>,
  pub recordings: Vec<RecordingAttempt>,
  pub markers: Vec<MeasureMarker>,
  pub loop_range: Option<LoopRange>,
  pub bookmarks: Vec<Bookmark>,
  pub practice_sessions: Vec<PracticeSession>,
  pub recent_activity: Vec<PracticeActivity>,
  pub stats: PracticeStats,
  pub note: ProjectNote,
}
