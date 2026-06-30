import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { open as openPath } from "@tauri-apps/api/shell";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { dirname, join } from "@tauri-apps/api/path";
import type {
  DuplicateRecordingInput,
  EndPracticeSessionInput,
  CreateProjectInput,
  DeleteProjectInput,
  ImportAssetInput,
  PracticeActivity,
  PracticeSession,
  PracticeStats,
  ProjectDetail,
  ProjectSummary,
  RenameProjectInput,
  ReorderPracticeSegmentsInput,
  SavePracticeSegmentInput,
  SaveRecordingInput,
  UpdateRecordingInput,
} from "./types";

export async function listProjects(): Promise<ProjectSummary[]> {
  return invoke("list_projects");
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  return invoke("create_project", { input });
}

export async function renameProject(input: RenameProjectInput): Promise<ProjectSummary> {
  return invoke("rename_project", { input });
}

export async function deleteProject(input: DeleteProjectInput): Promise<void> {
  return invoke("delete_project", { input });
}

export async function loadProject(projectId: string): Promise<ProjectDetail> {
  return invoke("load_project", { projectId });
}

export async function importScore(input: ImportAssetInput): Promise<ProjectDetail> {
  return invoke("import_score", { input });
}

export async function importReference(input: ImportAssetInput): Promise<ProjectDetail> {
  return invoke("import_reference", { input });
}

export async function setActiveReference(projectId: string, referenceId: string | null): Promise<ProjectDetail> {
  return invoke("set_active_reference", { projectId, referenceId });
}

export async function deleteReference(projectId: string, referenceId: string): Promise<ProjectDetail> {
  return invoke("delete_reference", { projectId, referenceId });
}

export async function savePracticeSegment(input: SavePracticeSegmentInput): Promise<ProjectDetail> {
  return invoke("save_practice_segment", { input });
}

export async function deletePracticeSegment(projectId: string, segmentId: string): Promise<ProjectDetail> {
  return invoke("delete_practice_segment", { projectId, segmentId });
}

export async function reorderPracticeSegments(input: ReorderPracticeSegmentsInput): Promise<ProjectDetail> {
  return invoke("reorder_practice_segments", { input });
}

export async function saveProjectNote(projectId: string, text: string): Promise<ProjectDetail> {
  return invoke("save_project_note", { projectId, text });
}

export async function registerRecording(input: SaveRecordingInput): Promise<ProjectDetail> {
  return invoke("register_recording", { input });
}

export async function setActiveRecording(projectId: string, recordingId: string | null): Promise<ProjectDetail> {
  return invoke("set_active_recording", { projectId, recordingId });
}

export async function updateRecording(input: UpdateRecordingInput): Promise<ProjectDetail> {
  return invoke("update_recording", { input });
}

export async function deleteRecording(projectId: string, recordingId: string): Promise<ProjectDetail> {
  return invoke("delete_recording", { projectId, recordingId });
}

export async function duplicateRecording(input: DuplicateRecordingInput): Promise<ProjectDetail> {
  return invoke("duplicate_recording", { input });
}

export async function endPracticeSession(input: EndPracticeSessionInput): Promise<ProjectDetail> {
  return invoke("end_practice_session", { input });
}

export async function openScoreFile(): Promise<string | null> {
  return open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  }) as Promise<string | null>;
}

export async function openAudioFile(): Promise<string | null> {
  return open({
    multiple: false,
    filters: [
      { name: "Audio", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "webm"] },
      { name: "All Files", extensions: ["*"] },
    ],
  }) as Promise<string | null>;
}

export async function openFolder(): Promise<string | null> {
  return open({ directory: true, multiple: false }) as Promise<string | null>;
}

export async function openPathInFinder(path: string): Promise<void> {
  await openPath(path);
}

export async function joinPath(...segments: string[]): Promise<string> {
  return join(...segments);
}

export async function dirnamePath(path: string): Promise<string> {
  return dirname(path);
}

export function toFileSrc(path: string): string {
  return convertFileSrc(path);
}

export function currentIsoTimestamp(): string {
  return new Date().toISOString();
}

export async function saveBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
  const { writeBinaryFile } = await import("@tauri-apps/api/fs");
  await writeBinaryFile(path, new Uint8Array(data));
}

export type {
  PracticeActivity,
  PracticeSession,
  PracticeStats,
  ProjectDetail,
  ProjectSummary,
};
