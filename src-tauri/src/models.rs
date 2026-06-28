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
  pub name: String,
  pub measure_number: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRecordingInput {
  pub project_id: String,
  pub file_name: String,
  pub relative_path: String,
  pub name: String,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub recorded_at: String,
  pub duration_ms: Option<i64>,
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
  pub name: String,
  pub file_name: String,
  pub relative_path: String,
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
  pub name: String,
  pub measure_number: i64,
  pub created_at: String,
  pub updated_at: String,
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
  pub note: ProjectNote,
}
