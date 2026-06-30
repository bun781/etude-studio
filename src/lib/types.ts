export type ProjectSummary = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  activeReferenceId: string | null;
  activeRecordingId: string | null;
  activePracticeSessionId: string | null;
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
  projectId: string;
  name: string;
  fileName: string;
  relativePath: string;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
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
  measureStart: number;
  measureEnd: number;
  label: string;
  noteText: string | null;
  color: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PracticeSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PracticeActivity = {
  id: string;
  sessionId: string | null;
  kind: string;
  title: string;
  detail: string | null;
  measureStart: number | null;
  measureEnd: number | null;
  referenceId: string | null;
  recordingId: string | null;
  bookmarkId: string | null;
  createdAt: string;
};

export type PracticeRangeStat = {
  measureStart: number;
  measureEnd: number;
  count: number;
};

export type PracticeStats = {
  todayMs: number;
  weekMs: number;
  recordingAttempts: number;
  bookmarkCount: number;
  mostPracticedRanges: PracticeRangeStat[];
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
  practiceSessions: PracticeSession[];
  recentActivity: PracticeActivity[];
  stats: PracticeStats;
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
    measureStart: number;
    measureEnd: number;
    label: string;
    noteText?: string | null;
    color?: string | null;
    status: string;
  };
};

export type EndPracticeSessionInput = {
  projectId: string;
};

export type SaveRecordingInput = {
  projectId: string;
  fileName: string;
  relativePath: string;
  name: string;
  referenceId?: string | null;
  measureStart: number | null;
  measureEnd: number | null;
  recordedAt: string;
  durationMs: number | null;
};

export type UpdateRecordingInput = {
  projectId: string;
  recordingId: string;
  name: string;
  notes?: string | null;
  measureStart?: number | null;
  measureEnd?: number | null;
  referenceId?: string | null;
};

export type DuplicateRecordingInput = {
  projectId: string;
  recordingId: string;
};
