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
  importedAt: string;
  segments: PracticeSegment[];
};

export type PracticeSegmentCoordinate = {
  x: number;
  y: number;
};

export type PracticeSegment = {
  id: string;
  scoreId: string;
  name: string;
  position: number;
  startPage: number;
  endPage: number;
  startCoordinate: PracticeSegmentCoordinate | null;
  endCoordinate: PracticeSegmentCoordinate | null;
  measureStart: number | null;
  measureEnd: number | null;
  referenceId: string | null;
  referenceStartMs: number | null;
  referenceEndMs: number | null;
  status: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  segmentId: string | null;
  notes: string | null;
  createdAt: string;
  recordedAt: string;
  durationMs: number | null;
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
  segmentId: string | null;
  referenceId: string | null;
  recordingId: string | null;
  createdAt: string;
};

export type PracticeSegmentStat = {
  segmentId: string;
  segmentName: string;
  count: number;
};

export type PracticeStats = {
  todayMs: number;
  weekMs: number;
  recordingAttempts: number;
  segmentCount: number;
  mostPracticedSegments: PracticeSegmentStat[];
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

export type SavePracticeSegmentInput = {
  projectId: string;
  segment: {
    id?: string | null;
    name: string;
    startPage: number;
    endPage: number;
    startX?: number | null;
    startY?: number | null;
    endX?: number | null;
    endY?: number | null;
    measureStart?: number | null;
    measureEnd?: number | null;
    referenceId?: string | null;
    referenceStartMs?: number | null;
    referenceEndMs?: number | null;
    status?: string | null;
    notes?: string | null;
  };
};

export type ReorderPracticeSegmentsInput = {
  projectId: string;
  segmentIds: string[];
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
  segmentId: string | null;
  recordedAt: string;
  durationMs: number | null;
};

export type UpdateRecordingInput = {
  projectId: string;
  recordingId: string;
  name: string;
  notes?: string | null;
  segmentId?: string | null;
  referenceId?: string | null;
};

export type DuplicateRecordingInput = {
  projectId: string;
  recordingId: string;
};
