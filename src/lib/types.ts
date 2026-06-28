export type ProjectSummary = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  activeReferenceId: string | null;
  activeRecordingId: string | null;
};

export type ScoreAsset = {
  id: string;
  fileName: string;
  relativePath: string;
  format: "musicxml";
  importedAt: string;
  measureCount: number;
  previewText: string;
};

export type ReferenceAsset = {
  id: string;
  name: string;
  fileName: string;
  relativePath: string;
  importedAt: string;
};

export type RecordingAttempt = {
  id: string;
  name: string;
  fileName: string;
  relativePath: string;
  measureStart: number | null;
  measureEnd: number | null;
  recordedAt: string;
  durationMs: number | null;
};

export type MeasureMarker = {
  id: string;
  measureNumber: number;
  timestampMs: number;
  label: string | null;
  noteText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoopRange = {
  id: string;
  name: string;
  startMeasure: number;
  endMeasure: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Bookmark = {
  id: string;
  name: string;
  measureNumber: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectNote = {
  text: string;
  updatedAt: string | null;
};

export type ProjectDetail = {
  project: ProjectSummary;
  score: ScoreAsset | null;
  references: ReferenceAsset[];
  recordings: RecordingAttempt[];
  markers: MeasureMarker[];
  loopRange: LoopRange | null;
  bookmarks: Bookmark[];
  note: ProjectNote;
};

export type CreateProjectInput = {
  name: string;
};

export type RenameProjectInput = {
  projectId: string;
  name: string;
};

export type DeleteProjectInput = {
  projectId: string;
};

export type ImportAssetInput = {
  projectId: string;
  sourcePath: string;
  name?: string;
};

export type SaveMarkerInput = {
  projectId: string;
  marker: {
    id?: string | null;
    measureNumber: number;
    timestampMs: number;
    label?: string | null;
    noteText?: string | null;
  };
};

export type SaveLoopRangeInput = {
  projectId: string;
  loopRange: {
    id?: string | null;
    name: string;
    startMeasure: number;
    endMeasure: number;
    isActive: boolean;
  };
};

export type SaveBookmarkInput = {
  projectId: string;
  bookmark: {
    id?: string | null;
    name: string;
    measureNumber: number;
  };
};

export type SaveRecordingInput = {
  projectId: string;
  fileName: string;
  relativePath: string;
  name: string;
  measureStart: number | null;
  measureEnd: number | null;
  recordedAt: string;
  durationMs: number | null;
};

