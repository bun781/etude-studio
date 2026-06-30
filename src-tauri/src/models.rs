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
pub struct PracticeSegmentDraft {
  pub id: Option<String>,
  pub name: String,
  pub start_page: i64,
  pub end_page: i64,
  pub start_x: Option<f64>,
  pub start_y: Option<f64>,
  pub end_x: Option<f64>,
  pub end_y: Option<f64>,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub reference_id: Option<String>,
  pub reference_start_ms: Option<i64>,
  pub reference_end_ms: Option<i64>,
  pub status: Option<String>,
  pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePracticeSegmentInput {
  pub project_id: String,
  pub segment: PracticeSegmentDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPracticeSegmentsInput {
  pub project_id: String,
  pub segment_ids: Vec<String>,
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
  pub segment_id: Option<String>,
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
  pub segment_id: Option<String>,
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
  pub imported_at: String,
  pub segments: Vec<PracticeSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSegment {
  pub id: String,
  pub score_id: String,
  pub name: String,
  pub position: i64,
  pub start_page: i64,
  pub end_page: i64,
  pub start_x: Option<f64>,
  pub start_y: Option<f64>,
  pub end_x: Option<f64>,
  pub end_y: Option<f64>,
  pub measure_start: Option<i64>,
  pub measure_end: Option<i64>,
  pub reference_id: Option<String>,
  pub reference_start_ms: Option<i64>,
  pub reference_end_ms: Option<i64>,
  pub status: Option<String>,
  pub notes: Option<String>,
  pub created_at: String,
  pub updated_at: String,
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
  pub segment_id: Option<String>,
  pub notes: Option<String>,
  pub created_at: String,
  pub recorded_at: String,
  pub duration_ms: Option<i64>,
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
  pub segment_id: Option<String>,
  pub reference_id: Option<String>,
  pub recording_id: Option<String>,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSegmentStat {
  pub segment_id: String,
  pub segment_name: String,
  pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeStats {
  pub today_ms: i64,
  pub week_ms: i64,
  pub recording_attempts: i64,
  pub segment_count: i64,
  pub most_practiced_segments: Vec<PracticeSegmentStat>,
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
  pub practice_sessions: Vec<PracticeSession>,
  pub recent_activity: Vec<PracticeActivity>,
  pub stats: PracticeStats,
  pub note: ProjectNote,
}
