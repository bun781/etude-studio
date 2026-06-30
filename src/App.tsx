import { useEffect, useRef, useState } from "react";
import { ProjectHeader } from "./components/ProjectHeader";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { SetupScreen, type SegmentCreateDraft, type SegmentPatch } from "./components/SetupScreen";
import { PracticeScreen } from "./components/PracticeScreen";
import { ReviewScreen } from "./components/ReviewScreen";
import { TransportPanel } from "./components/TransportPanel";
import { TutorialTour, type TutorialStep } from "./components/TutorialTour";
import {
  createProject,
  currentIsoTimestamp,
  deleteProject,
  deletePracticeSegment,
  deleteRecording,
  deleteReference,
  dirnamePath,
  duplicateRecording,
  endPracticeSession,
  importReference,
  importScore,
  joinPath,
  loadProject,
  listProjects,
  openAudioFile,
  openScoreFile,
  openPathInFinder,
  registerRecording,
  renameProject,
  savePracticeSegment,
  saveBinaryFile,
  saveProjectNote,
  setActiveRecording,
  setActiveReference,
  updateRecording,
  toFileSrc,
} from "./lib/api";
import type {
  PracticeSegment,
  PracticeSession,
  PracticeStats,
  ProjectDetail,
  ProjectSummary,
  RecordingAttempt,
  ReferenceAsset,
} from "./lib/types";

type CompareMode = "reference" | "recording";
type AppView = "library" | "setup" | "practice" | "review";

type StoredPreferences = {
  compareMode: CompareMode;
  playbackRate: number;
  selectedProjectId: string | null;
  timelineZoom: number;
};

const DEFAULT_PREFERENCES: StoredPreferences = {
  compareMode: "reference",
  playbackRate: 1,
  selectedProjectId: null,
  timelineZoom: 1,
};

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const activeSegmentIdRef = useRef<string | null>(null);
  const noteSaveTimerRef = useRef<number | null>(null);
  const lastSavedNoteRef = useRef<{ projectId: string | null; text: string }>({
    projectId: null,
    text: "",
  });
  const noteHydratingRef = useRef(false);
  const [preferences, setPreferences] = useState<StoredPreferences>(() => readStoredPreferences());

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(preferences.selectedProjectId);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [noteText, setNoteText] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(preferences.playbackRate);
  const [isPlaying, setIsPlaying] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>(preferences.compareMode);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [timelineZoom, setTimelineZoom] = useState(preferences.timelineZoom);
  const [activeView, setActiveView] = useState<AppView>("library");
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  useEffect(() => {
    activeSegmentIdRef.current = activeSegmentId;
  }, [activeSegmentId]);

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    setPreferences((current) => ({
      ...current,
      compareMode,
      playbackRate,
      selectedProjectId,
      timelineZoom,
    }));
  }, [compareMode, playbackRate, selectedProjectId, timelineZoom]);

  useEffect(() => {
    try {
      window.localStorage.setItem("reference-practice.preferences", JSON.stringify(preferences));
    } catch {
      // Ignore storage failures in constrained environments.
    }
  }, [preferences]);

  useEffect(() => {
    if (!project) {
      return;
    }
    setProjectNameDraft(project.project.name);
  }, [project?.project.id]);

  useEffect(() => {
    if (noteSaveTimerRef.current != null) {
      window.clearTimeout(noteSaveTimerRef.current);
    }
    if (!project) {
      return;
    }
    noteHydratingRef.current = true;
    lastSavedNoteRef.current = {
      projectId: project.project.id,
      text: project.note.text,
    };
    setNoteText(project.note.text);
  }, [project?.project.id]);

  useEffect(() => {
    const currentProjectId = project?.project.id;
    if (!currentProjectId) {
      return;
    }
    const projectId = currentProjectId;

    function handleBeforeUnload() {
      void endPracticeSession({ projectId });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [project?.project.id]);

  useEffect(() => {
    if (!project) {
      return;
    }
    if (noteHydratingRef.current) {
      if (noteText === project.note.text) {
        noteHydratingRef.current = false;
      }
      return;
    }
    if (
      lastSavedNoteRef.current.projectId === project.project.id &&
      lastSavedNoteRef.current.text === noteText
    ) {
      return;
    }
    if (noteSaveTimerRef.current != null) {
      window.clearTimeout(noteSaveTimerRef.current);
    }
    noteSaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const detail = await saveProjectNote(project.project.id, noteText);
        if (detail.project.id === project.project.id) {
          setProject(detail);
          lastSavedNoteRef.current = {
            projectId: detail.project.id,
            text: detail.note.text,
          };
        }
      })();
    }, 350);

    return () => {
      if (noteSaveTimerRef.current != null) {
        window.clearTimeout(noteSaveTimerRef.current);
      }
    };
  }, [noteText, project]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);

      const segments = sortSegments(project?.score?.segments ?? []);
      if (compareMode === "reference" && segments.length > 0) {
        const matched = findSegmentForTimeMs(segments, time * 1000);
        if (matched && matched.id !== activeSegmentIdRef.current) {
          setActiveSegmentId(matched.id);
        }
      }

      const active = segments.find((segment) => segment.id === activeSegmentIdRef.current);
      if (isLooping && active?.referenceStartMs != null && active.referenceEndMs != null) {
        if (audio.currentTime * 1000 >= active.referenceEndMs - 30) {
          audio.currentTime = active.referenceStartMs / 1000;
          void audio.play();
        }
      }
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [project, compareMode, isLooping]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !project) {
      return;
    }

    const source = resolveSource(project, compareMode);
    if (!source) {
      audio.removeAttribute("src");
      audio.load();
      setDuration(0);
      setCurrentTime(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      const absolutePath = await joinPath(project.project.rootPath, source.relativePath);
      if (cancelled) {
        return;
      }
      audio.src = toFileSrc(absolutePath);
      audio.playbackRate = playbackRate;
      if ("preservesPitch" in audio) {
        audio.preservesPitch = true;
      }
      audio.load();
    })();

    return () => {
      cancelled = true;
    };
  }, [project, compareMode, playbackRate]);

  useEffect(() => {
    if (!project) {
      return;
    }
    const source = resolveSource(project, compareMode);
    if (source) {
      return;
    }
    if (compareMode === "recording" && resolveReference(project)) {
      setCompareMode("reference");
      return;
    }
    if (compareMode === "reference" && resolveRecording(project)) {
      setCompareMode("recording");
    }
  }, [project, compareMode]);

  useEffect(() => {
    if (!isTutorialOpen) {
      return;
    }
    const nextView = TUTORIAL_STEPS[tutorialStepIndex]?.view;
    if (nextView) {
      setActiveView(nextView as AppView);
    }
  }, [isTutorialOpen, tutorialStepIndex]);

  async function refreshProjects(selectedId?: string | null) {
    const items = await listProjects();
    setProjects(items);
    if (selectedId) {
      setSelectedProjectId(selectedId);
      return;
    }
    setSelectedProjectId((current) => {
      if (current && items.some((projectItem) => projectItem.id === current)) {
        return current;
      }
      return items[0]?.id ?? null;
    });
  }

  async function openProjectById(projectId: string) {
    if (project && project.project.id !== projectId) {
      await endPracticeSession({ projectId: project.project.id });
    }
    const detail = await loadProject(projectId);
    setProject(detail);
    setSelectedProjectId(projectId);
    const segments = sortSegments(detail.score?.segments ?? []);
    setActiveSegmentId(segments[0]?.id ?? null);
    setIsLooping(false);
    setActiveView(segments.length === 0 ? "setup" : "practice");
    setStatusMessage(`Opened ${detail.project.name}`);
    await refreshProjects(projectId);
  }

  async function createNewProject() {
    const name = projectNameDraft.trim() || "Reference Practice Project";
    const created = await createProject({ name });
    await refreshProjects(created.id);
    await openProjectById(created.id);
  }

  async function openSelectedProject() {
    if (!selectedProjectId) {
      setStatusMessage("Choose a project from the library first.");
      return;
    }
    await openProjectById(selectedProjectId);
  }

  async function renameCurrentProject() {
    if (!project) {
      return;
    }
    const nextName = projectNameDraft.trim();
    if (!nextName) {
      return;
    }
    const renamed = await renameProject({
      projectId: project.project.id,
      name: nextName,
    });
    await openProjectById(renamed.id);
  }

  async function deleteCurrentProject() {
    if (!project) {
      return;
    }
    const confirmDelete = window.confirm(`Delete ${project.project.name}? This removes the local project folder.`);
    if (!confirmDelete) {
      return;
    }
    await endPracticeSession({ projectId: project.project.id });
    await deleteProject({ projectId: project.project.id });
    setProject(null);
    setSelectedProjectId(null);
    setProjectNameDraft("");
    setActiveView("library");
    await refreshProjects();
    setStatusMessage("Project deleted.");
  }

  async function handleImportScore() {
    if (!project) {
      return;
    }
    try {
      const sourcePath = firstSelectedPath(await openScoreFile());
      if (!sourcePath) {
        return;
      }
      const detail = await importScore({ projectId: project.project.id, sourcePath });
      setProject(detail);
      setActiveSegmentId(null);
      await refreshProjects(project.project.id);
      setStatusMessage("Score imported.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Score import could not finish.");
    }
  }

  async function handleImportReference() {
    if (!project) {
      return;
    }
    try {
      const sourcePath = firstSelectedPath(await openAudioFile());
      if (!sourcePath) {
        return;
      }
      const detail = await importReference({ projectId: project.project.id, sourcePath });
      setProject(detail);
      await refreshProjects(project.project.id);
      setStatusMessage("Reference imported.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Reference import could not finish.");
    }
  }

  async function handleSelectReference(referenceId: string) {
    if (!project) {
      return;
    }
    const detail = await setActiveReference(project.project.id, referenceId);
    setProject(detail);
    setStatusMessage("Active reference updated.");
  }

  async function handleDeleteReference(referenceId: string) {
    if (!project) {
      return;
    }
    const detail = await deleteReference(project.project.id, referenceId);
    setProject(detail);
    setStatusMessage("Reference deleted.");
  }

  async function handleSelectRecording(recordingId: string) {
    if (!project) {
      return;
    }
    const detail = await setActiveRecording(project.project.id, recordingId);
    setProject(detail);
    setCompareMode("recording");
    setStatusMessage("Active recording updated.");
  }

  async function handleSaveRecording(
    recordingId: string,
    draft: { name: string; notes: string; segmentId: string; referenceId: string },
  ) {
    if (!project) {
      return;
    }
    const detail = await updateRecording({
      projectId: project.project.id,
      recordingId,
      name: draft.name.trim() || "Untitled Take",
      notes: draft.notes.trim() || null,
      segmentId: draft.segmentId || null,
      referenceId: draft.referenceId || null,
    });
    setProject(detail);
    await refreshProjects(detail.project.id);
    setStatusMessage("Recording updated.");
  }

  async function handleDeleteRecording(recordingId: string) {
    if (!project) {
      return;
    }
    const recording = project.recordings.find((item) => item.id === recordingId);
    const confirmDelete = window.confirm(`Delete ${recording?.name ?? "this recording"}? This removes the audio file too.`);
    if (!confirmDelete) {
      return;
    }
    const detail = await deleteRecording(project.project.id, recordingId);
    setProject(detail);
    if (project.project.activeRecordingId === recordingId && detail.recordings.length > 0) {
      const activeDetail = await setActiveRecording(detail.project.id, detail.recordings[0].id);
      setProject(activeDetail);
    }
    await refreshProjects(project.project.id);
    setStatusMessage("Recording deleted.");
  }

  async function handleDuplicateRecording(recordingId: string) {
    if (!project) {
      return;
    }
    const detail = await duplicateRecording({ projectId: project.project.id, recordingId });
    setProject(detail);
    await refreshProjects(detail.project.id);
    setStatusMessage("Recording duplicated.");
  }

  async function handleOpenRecordingFolder(recordingId: string) {
    if (!project) {
      return;
    }
    const recording = project.recordings.find((item) => item.id === recordingId);
    if (!recording) {
      return;
    }
    const absolutePath = await joinPath(project.project.rootPath, recording.relativePath);
    const folderPath = await dirnamePath(absolutePath);
    await openPathInFinder(folderPath);
    setStatusMessage("Opened recording folder.");
  }

  async function handleCreateSegment(draft: SegmentCreateDraft) {
    if (!project) {
      return;
    }
    const detail = await savePracticeSegment({
      projectId: project.project.id,
      segment: {
        name: draft.name,
        startPage: draft.startPage,
        endPage: draft.endPage,
        startX: draft.startCoordinate.x,
        startY: draft.startCoordinate.y,
        endX: draft.endCoordinate.x,
        endY: draft.endCoordinate.y,
      },
    });
    setProject(detail);
    const newest = [...(detail.score?.segments ?? [])].sort((left, right) => right.position - left.position)[0];
    if (newest) {
      setActiveSegmentId(newest.id);
    }
    setStatusMessage("Practice segment created.");
  }

  async function handleUpdateSegment(segmentId: string, patch: SegmentPatch) {
    if (!project?.score) {
      return;
    }
    const existing = project.score.segments.find((segment) => segment.id === segmentId);
    if (!existing) {
      return;
    }
    const detail = await savePracticeSegment({
      projectId: project.project.id,
      segment: {
        id: existing.id,
        name: patch.name ?? existing.name,
        startPage: patch.startPage ?? existing.startPage,
        endPage: patch.endPage ?? existing.endPage,
        startX: patch.startCoordinate ? patch.startCoordinate.x : existing.startCoordinate?.x ?? null,
        startY: patch.startCoordinate ? patch.startCoordinate.y : existing.startCoordinate?.y ?? null,
        endX: patch.endCoordinate ? patch.endCoordinate.x : existing.endCoordinate?.x ?? null,
        endY: patch.endCoordinate ? patch.endCoordinate.y : existing.endCoordinate?.y ?? null,
        measureStart: patch.measureStart !== undefined ? patch.measureStart : existing.measureStart,
        measureEnd: patch.measureEnd !== undefined ? patch.measureEnd : existing.measureEnd,
        referenceId: patch.referenceId !== undefined ? patch.referenceId : existing.referenceId,
        referenceStartMs: patch.referenceStartMs !== undefined ? patch.referenceStartMs : existing.referenceStartMs,
        referenceEndMs: patch.referenceEndMs !== undefined ? patch.referenceEndMs : existing.referenceEndMs,
        status: patch.status !== undefined ? patch.status : existing.status,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
      },
    });
    setProject(detail);
  }

  async function handleDeleteSegment(segmentId: string) {
    if (!project) {
      return;
    }
    const detail = await deletePracticeSegment(project.project.id, segmentId);
    setProject(detail);
    if (activeSegmentId === segmentId) {
      const segments = sortSegments(detail.score?.segments ?? []);
      setActiveSegmentId(segments[0]?.id ?? null);
    }
    setStatusMessage("Practice segment deleted.");
  }

  function handleSelectSegment(segmentId: string) {
    setActiveSegmentId(segmentId);
    setIsLooping(false);
    const segments = sortSegments(project?.score?.segments ?? []);
    const segment = segments.find((item) => item.id === segmentId);
    const audio = audioRef.current;
    if (segment?.referenceStartMs != null && audio && compareMode === "reference") {
      audio.currentTime = segment.referenceStartMs / 1000;
      setCurrentTime(audio.currentTime);
      void audio.play();
    }
  }

  function handlePrevSegment() {
    const segments = sortSegments(project?.score?.segments ?? []);
    const index = segments.findIndex((segment) => segment.id === activeSegmentId);
    if (index > 0) {
      handleSelectSegment(segments[index - 1].id);
    }
  }

  function handleNextSegment() {
    const segments = sortSegments(project?.score?.segments ?? []);
    const index = segments.findIndex((segment) => segment.id === activeSegmentId);
    if (index >= 0 && index < segments.length - 1) {
      handleSelectSegment(segments[index + 1].id);
    }
  }

  function handleMarkSegmentBoundary(edge: "start" | "end") {
    const audio = audioRef.current;
    if (!audio || !activeSegmentId) {
      return;
    }
    const timestampMs = Math.round(audio.currentTime * 1000);
    void handleUpdateSegment(
      activeSegmentId,
      edge === "start" ? { referenceStartMs: timestampMs } : { referenceEndMs: timestampMs },
    );
    setStatusMessage(edge === "start" ? "Segment start marked." : "Segment end marked.");
  }

  async function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      setStatusMessage("Import a reference or recording before playback.");
      return;
    }
    try {
      if (audio.paused) {
        if (activeView === "practice" && activeSegment?.referenceStartMs != null && activeSegment.referenceEndMs != null) {
          setIsLooping(true);
          const startSeconds = activeSegment.referenceStartMs / 1000;
          const endSeconds = activeSegment.referenceEndMs / 1000;
          if (audio.currentTime < startSeconds || audio.currentTime >= endSeconds) {
            audio.currentTime = startSeconds;
            setCurrentTime(startSeconds);
          }
        }
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Playback could not start.");
    }
  }

  function handleStop() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }

  function handleSeek(time: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
  }

  async function handleToggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (!project) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMessage("This environment does not support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      const segmentId = activeSegmentIdRef.current;
      const startedAt = currentIsoTimestamp();
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current.slice();
        const mimeType = recorder.mimeType || "audio/webm";
        const fileName = `take-${startedAt.replace(/[:.]/g, "-")}.webm`;
        const relativePath = await joinPath("recordings", fileName);
        const absolutePath = await joinPath(project.project.rootPath, relativePath);
        const blob = new Blob(chunks, { type: mimeType });
        await saveBinaryFile(absolutePath, await blob.arrayBuffer());
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        const detail = await registerRecording({
          projectId: project.project.id,
          fileName,
          relativePath,
          name: `Take ${project.recordings.length + 1}`,
          referenceId: project.project.activeReferenceId,
          segmentId,
          recordedAt: startedAt,
          durationMs: null,
        });
        setProject(detail);
        if (detail.recordings.length > 0) {
          const activeDetail = await setActiveRecording(detail.project.id, detail.recordings[0].id);
          setProject(activeDetail);
        }
        setStatusMessage("Recording saved.");
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage("Recording in progress.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Recording could not start.");
    }
  }

  const stats = project?.stats ?? {
    todayMs: 0,
    weekMs: 0,
    recordingAttempts: 0,
    segmentCount: 0,
    mostPracticedSegments: [],
  };

  const segments = sortSegments(project?.score?.segments ?? []);
  const activeSegment = segments.find((segment) => segment.id === activeSegmentId) ?? null;
  const pdfSrc =
    project?.score != null ? toFileSrc(`${project.project.rootPath}/${project.score.relativePath}`) : null;

  const transport = project ? (
    <TransportPanel
      isPlaying={isPlaying}
      playbackRate={playbackRate}
      duration={duration}
      currentTime={currentTime}
      zoom={timelineZoom}
      segments={segments}
      activeSegmentId={activeSegmentId}
      isLooping={isLooping}
      activeSourceLabel={resolveSourceLabel(project, compareMode)}
      compareMode={compareMode}
      selectedReference={resolveReference(project)}
      selectedRecording={resolveRecording(project)}
      onPlayPause={() => void handlePlayPause()}
      onStop={handleStop}
      onSeek={handleSeek}
      onSpeedChange={(value) => {
        setPlaybackRate(value);
        if (audioRef.current) {
          audioRef.current.playbackRate = value;
          if ("preservesPitch" in audioRef.current) {
            audioRef.current.preservesPitch = true;
          }
        }
      }}
      onZoomChange={setTimelineZoom}
      onCompareModeChange={setCompareMode}
      onSelectSegment={handleSelectSegment}
      onToggleLoop={() => setIsLooping((value) => !value)}
      onMarkSegmentStart={() => handleMarkSegmentBoundary("start")}
      onMarkSegmentEnd={() => handleMarkSegmentBoundary("end")}
    />
  ) : null;

  return (
    <div className="app-shell">
      <aside className="app-nav" aria-label="Primary navigation">
        <div className="brand-lockup" data-tour-id="brand">
          <span className="brand-mark">ES</span>
          <div>
            <p className="eyebrow">Etude Studio</p>
            <strong>Practice ledger</strong>
          </div>
        </div>
        <nav className="nav-list">
          {APP_VIEWS.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "nav-item nav-item--active" : "nav-item"}
              data-tour-id={`nav-${item.id}`}
              onClick={() => setActiveView(item.id)}
              disabled={item.id !== "library" && !project}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="nav-footer">
          <span className="muted">{statusMessage}</span>
          <button
            className="tour-start-btn"
            data-tour-id="tutorial-start"
            onClick={() => {
              setTutorialStepIndex(0);
              setIsTutorialOpen(true);
            }}
          >
            Start tutorial
          </button>
        </div>
      </aside>

      <main className="app-main">
        {activeView === "library" ? (
          <>
            <ProjectHeader
              project={project?.project ?? null}
              projectNameDraft={projectNameDraft}
              setProjectNameDraft={setProjectNameDraft}
              onCreateProject={() => void createNewProject()}
              onOpenProject={() => void openSelectedProject()}
            />
            <section className="screen">
              <div className="page-intro">
                <p className="eyebrow">Library</p>
                <h1>The music shelf</h1>
                <p className="lede">Pieces, etudes, and local folders arranged for deliberate work.</p>
              </div>
              <div className="metric-strip" data-tour-id="home-metrics">
                <Metric label="Today" value={formatDuration(stats.todayMs)} />
                <Metric label="This week" value={formatDuration(stats.weekMs)} />
                <Metric label="Recordings" value={String(stats.recordingAttempts)} />
                <Metric label="Segments" value={String(stats.segmentCount)} />
              </div>
              <ProjectLibrary
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onOpenProject={(projectId) => void openProjectById(projectId)}
              />
            </section>
          </>
        ) : null}

        {activeView === "setup" ? (
          <section className="screen screen--setup">
            {project ? (
              <SetupScreen
                project={project.project}
                projectNameDraft={projectNameDraft}
                setProjectNameDraft={setProjectNameDraft}
                onRenameProject={() => void renameCurrentProject()}
                onDeleteProject={() => void deleteCurrentProject()}
                pdfSrc={pdfSrc}
                segments={segments}
                selectedSegmentId={activeSegmentId}
                onSelectSegment={handleSelectSegment}
                onCreateSegment={(draft) => void handleCreateSegment(draft)}
                onUpdateSegment={(segmentId, patch) => void handleUpdateSegment(segmentId, patch)}
                onDeleteSegment={(segmentId) => void handleDeleteSegment(segmentId)}
                references={project.references}
                onImportScore={() => void handleImportScore()}
                onImportReference={() => void handleImportReference()}
                noteText={noteText}
                onNoteChange={setNoteText}
                transport={transport}
              />
            ) : (
              <EmptyProject />
            )}
          </section>
        ) : null}

        {activeView === "practice" ? (
          <section className="screen screen--practice">
            {project ? (
              <PracticeScreen
                pdfSrc={pdfSrc}
                segments={segments}
                activeSegment={activeSegment}
                segmentRecordings={
                  activeSegment
                    ? project.recordings.filter((recording) => recording.segmentId === activeSegment.id)
                    : []
                }
                onPrev={handlePrevSegment}
                onNext={handleNextSegment}
                onOpenSetup={() => setActiveView("setup")}
                isRecording={isRecording}
                onToggleRecording={() => void handleToggleRecording()}
                onDeleteRecording={(recordingId) => void handleDeleteRecording(recordingId)}
                transport={transport}
              />
            ) : (
              <EmptyProject />
            )}
          </section>
        ) : null}

        {activeView === "review" ? (
          <section className="screen">
            {project ? (
              <ReviewScreen
                recordings={project.recordings}
                references={project.references}
                segments={segments}
                selectedRecordingId={project.project.activeRecordingId ?? null}
                onSelectRecording={(recordingId) => void handleSelectRecording(recordingId)}
                onSaveRecording={(recordingId, draft) => void handleSaveRecording(recordingId, draft)}
                onDeleteRecording={(recordingId) => void handleDeleteRecording(recordingId)}
                onDuplicateRecording={(recordingId) => void handleDuplicateRecording(recordingId)}
                onOpenRecordingFolder={(recordingId) => void handleOpenRecordingFolder(recordingId)}
                stats={stats}
                sessions={project.practiceSessions}
              />
            ) : (
              <EmptyProject />
            )}
          </section>
        ) : null}
      </main>

      <audio ref={audioRef} hidden preload="auto" />
      {isTutorialOpen ? (
        <TutorialTour
          steps={TUTORIAL_STEPS}
          currentIndex={tutorialStepIndex}
          onStepChange={setTutorialStepIndex}
          onClose={() => setIsTutorialOpen(false)}
        />
      ) : null}
    </div>
  );
}

const APP_VIEWS: { id: AppView; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "setup", label: "Setup" },
  { id: "practice", label: "Practice" },
  { id: "review", label: "Review" },
];

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Start with the app map",
    body: "This sidebar switches between Library, Setup, Practice, and Review. The tour walks through each in order.",
    targetId: "brand",
    view: "library",
  },
  {
    id: "new-project",
    title: "Create a piece",
    body: "Type a piece name, then use New project to create the local folder that stores the score, references, recordings, and practice history.",
    targetId: "new-project",
    view: "library",
  },
  {
    id: "open-project",
    title: "Open an existing piece",
    body: "Select a project from the library, then open it here.",
    targetId: "open-selected",
    view: "library",
  },
  {
    id: "library",
    title: "The library keeps every piece available",
    body: "Pick any project here to make it the active piece.",
    targetId: "project-library",
    view: "library",
  },
  {
    id: "setup-nav",
    title: "Setup is where a piece is prepared",
    body: "Import the score and reference recording, then mark Practice Segments directly on the score.",
    targetId: "nav-setup",
    view: "setup",
  },
  {
    id: "setup-screen",
    title: "Click the score to create a segment",
    body: "Click once to mark where a passage starts, click again to mark where it ends, then name it. No percentages, no dividers.",
    targetId: "setup-screen",
    view: "setup",
  },
  {
    id: "segments-panel",
    title: "Segments are the one object that matters",
    body: "Each Practice Segment tracks its score range, an optional reference clip, status, and notes.",
    targetId: "segments-panel",
    view: "setup",
  },
  {
    id: "practice-nav",
    title: "Practice is the playing desk",
    body: "Practice shows only the current segment, the score, and playback. Nothing to configure here.",
    targetId: "nav-practice",
    view: "practice",
  },
  {
    id: "practice-screen",
    title: "Work one segment at a time",
    body: "Use Prev and Next to move between segments. The score and reference audio jump together automatically.",
    targetId: "practice-screen",
    view: "practice",
  },
  {
    id: "transport",
    title: "Transport drives playback",
    body: "Play, loop the active segment, change speed, and switch between the reference and your own recording.",
    targetId: "transport-panel",
    view: "practice",
  },
  {
    id: "record",
    title: "Record a take",
    body: "Recordings are automatically tagged with whichever segment is active.",
    targetId: "record-button",
    view: "practice",
  },
  {
    id: "review-nav",
    title: "Review is for listening back",
    body: "Recordings, analytics, and the practice calendar all live in Review.",
    targetId: "nav-review",
    view: "review",
  },
  {
    id: "recordings",
    title: "Browse takes by segment",
    body: "Recordings group by the segment they belong to, making it easy to compare attempts at the same passage.",
    targetId: "recording-browser",
    view: "review",
  },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyProject() {
  return (
    <section className="journal-panel">
      <div className="empty-state">Create or open a project from the Library to begin.</div>
    </section>
  );
}

function sortSegments(segments: PracticeSegment[]): PracticeSegment[] {
  return [...segments].sort((left, right) => {
    if (left.startPage !== right.startPage) {
      return left.startPage - right.startPage;
    }
    const leftY = left.startCoordinate?.y ?? 0;
    const rightY = right.startCoordinate?.y ?? 0;
    if (leftY !== rightY) {
      return leftY - rightY;
    }
    return left.position - right.position;
  });
}

function findSegmentForTimeMs(segments: PracticeSegment[], timeMs: number): PracticeSegment | null {
  return (
    segments.find(
      (segment) =>
        segment.referenceStartMs != null &&
        segment.referenceEndMs != null &&
        timeMs >= segment.referenceStartMs &&
        timeMs <= segment.referenceEndMs,
    ) ?? null
  );
}

function resolveReference(project: ProjectDetail): ReferenceAsset | null {
  return project.references.find((reference) => reference.id === project.project.activeReferenceId) ?? project.references[0] ?? null;
}

function resolveRecording(project: ProjectDetail): RecordingAttempt | null {
  return project.recordings.find((recording) => recording.id === project.project.activeRecordingId) ?? project.recordings[0] ?? null;
}

function resolveSource(project: ProjectDetail, compareMode: CompareMode): ReferenceAsset | RecordingAttempt | null {
  return compareMode === "reference" ? resolveReference(project) : resolveRecording(project);
}

function resolveSourceLabel(project: ProjectDetail, compareMode: CompareMode): string {
  const source = resolveSource(project, compareMode);
  if (!source) {
    return "No playback source selected.";
  }
  return compareMode === "reference" ? `Reference: ${source.name}` : `Recording: ${source.name}`;
}

function formatDuration(value: number): string {
  const totalMinutes = Math.floor(Math.max(0, value) / 60000);
  const seconds = Math.floor((Math.max(0, value) % 60000) / 1000);
  if (totalMinutes <= 0) {
    return `${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function firstSelectedPath(selection: string | string[] | null): string | null {
  if (Array.isArray(selection)) {
    return selection[0] ?? null;
  }
  return selection;
}

function readStoredPreferences(): StoredPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem("reference-practice.preferences");
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      compareMode: parsed.compareMode === "recording" ? "recording" : "reference",
      playbackRate:
        typeof parsed.playbackRate === "number" && Number.isFinite(parsed.playbackRate) ? parsed.playbackRate : 1,
      selectedProjectId: typeof parsed.selectedProjectId === "string" ? parsed.selectedProjectId : null,
      timelineZoom:
        typeof parsed.timelineZoom === "number" && Number.isFinite(parsed.timelineZoom) ? parsed.timelineZoom : 1,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export default App;
