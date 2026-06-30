import { useEffect, useRef, useState } from "react";
import { ProjectHeader } from "./components/ProjectHeader";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { ScorePanel } from "./components/ScorePanel";
import { RecordingBrowser } from "./components/RecordingBrowser";
import { Sidebar } from "./components/Sidebar";
import { TransportPanel } from "./components/TransportPanel";
import {
  createProject,
  currentIsoTimestamp,
  deleteBookmark,
  deleteMarker,
  deleteProject,
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
  saveBookmark,
  saveBinaryFile,
  saveLoopRange,
  saveMarker,
  saveProjectNote,
  setActiveRecording,
  setActiveReference,
  updateRecording,
  toFileSrc,
} from "./lib/api";
import { deriveLoopTimes, estimateCurrentMeasure, estimateMeasureTimestamp } from "./lib/measure";
import type {
  Bookmark,
  LoopRange,
  MeasureMarker,
  PracticeActivity,
  PracticeSession,
  PracticeStats,
  ProjectDetail,
  ProjectSummary,
  RecordingAttempt,
  ReferenceAsset,
} from "./lib/types";

type CompareMode = "reference" | "recording";
type BookmarkStatus = string;

type StoredPreferences = {
  compareMode: CompareMode;
  playbackRate: number;
  selectedProjectId: string | null;
  scoreZoom: number;
  timelineZoom: number;
};

type BookmarkDraft = {
  measureStart: number;
  measureEnd: number;
  label: string;
  noteText: string;
  color: string;
  status: BookmarkStatus;
  activateLoop: boolean;
};

const BOOKMARK_STATUS_ORDER: BookmarkStatus[] = [
  "Needs Work",
  "Teacher Assigned",
  "In Progress",
  "Not Started",
  "Completed",
  "Favorite",
];

const BOOKMARK_LABEL_SUGGESTIONS = [
  "Difficult",
  "Intonation",
  "Rhythm",
  "Fingering",
  "Bowing",
  "Phrasing",
  "Dynamics",
  "Teacher",
  "Performance",
];

const DEFAULT_MARKER_DRAFT = {
  measureNumber: 1,
  timestampMs: 0,
  label: "",
  noteText: "",
};

const DEFAULT_PREFERENCES: StoredPreferences = {
  compareMode: "reference",
  playbackRate: 1,
  selectedProjectId: null,
  scoreZoom: 1,
  timelineZoom: 1,
};

const DEFAULT_BOOKMARK_DRAFT: BookmarkDraft = {
  measureStart: 1,
  measureEnd: 1,
  label: "Needs Work",
  noteText: "",
  color: "#7ec8ff",
  status: "Needs Work",
  activateLoop: false,
};

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const noteSaveTimerRef = useRef<number | null>(null);
  const lastSavedNoteRef = useRef<{ projectId: string | null; text: string }>({
    projectId: null,
    text: "",
  });
  const noteHydratingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const [preferences, setPreferences] = useState<StoredPreferences>(() => readStoredPreferences());

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(preferences.selectedProjectId);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [noteText, setNoteText] = useState("");
  const [bookmarkDraft, setBookmarkDraft] = useState<BookmarkDraft>(DEFAULT_BOOKMARK_DRAFT);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentMeasure, setCurrentMeasure] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(preferences.playbackRate);
  const [isPlaying, setIsPlaying] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>(preferences.compareMode);
  const [isRecording, setIsRecording] = useState(false);
  const [markerDraft, setMarkerDraft] = useState(DEFAULT_MARKER_DRAFT);
  const [loopDraft, setLoopDraft] = useState({ startMeasure: 1, endMeasure: 4 });
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [scoreZoom, setScoreZoom] = useState(preferences.scoreZoom);
  const [timelineZoom, setTimelineZoom] = useState(preferences.timelineZoom);

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    setPreferences((current) => ({
      ...current,
      compareMode,
      playbackRate,
      selectedProjectId,
      scoreZoom,
      timelineZoom,
    }));
  }, [compareMode, playbackRate, scoreZoom, selectedProjectId, timelineZoom]);

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
    setNoteText(project.note.text);
    setMarkerDraft((current) => ({
      ...current,
      measureNumber: currentMeasure,
      timestampMs: Math.round(currentTime * 1000),
    }));
    if (project.loopRange) {
      setLoopDraft({
        startMeasure: project.loopRange.startMeasure,
        endMeasure: project.loopRange.endMeasure,
      });
    } else {
      setLoopDraft({
        startMeasure: currentMeasure,
        endMeasure: Math.max(currentMeasure, currentMeasure + 3),
      });
    }
    setBookmarkDraft((current) => ({
      ...current,
      measureStart: currentMeasure,
      measureEnd: Math.max(currentMeasure, currentMeasure + 3),
    }));
  }, [project, currentMeasure, currentTime]);

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
  }, [project]);

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
      if (pendingSeekRef.current != null) {
        const nextTime = Math.max(0, Math.min(audio.duration || pendingSeekRef.current, pendingSeekRef.current));
        pendingSeekRef.current = null;
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
        setCurrentMeasure(estimateCurrentMeasure(nextTime * 1000, project?.markers ?? []));
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      const measure = estimateCurrentMeasure(time * 1000, project?.markers ?? []);
      setCurrentMeasure(measure);

      if (!project?.loopRange) {
        return;
      }

      const { startTime, endTime } = deriveLoopTimes(
        project.markers,
        project.loopRange.startMeasure,
        project.loopRange.endMeasure,
      );

      if (startTime == null || endTime == null) {
        return;
      }

      if (audio.currentTime >= endTime / 1000 - 0.03) {
        audio.currentTime = startTime / 1000;
        void audio.play();
      }
    };

    const handleEnded = () => {
      if (!project?.loopRange) {
        setIsPlaying(false);
        return;
      }
      const { startTime } = deriveLoopTimes(
        project.markers,
        project.loopRange.startMeasure,
        project.loopRange.endMeasure,
      );
      if (startTime != null) {
        audio.currentTime = startTime / 1000;
        void audio.play();
      }
    };

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
  }, [project]);

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
      pendingSeekRef.current = audio.currentTime;
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
    await refreshProjects();
    setStatusMessage("Project deleted.");
  }

  async function handleImportScore() {
    if (!project) {
      return;
    }
    const sourcePath = await importMusicXmlPath();
    if (!sourcePath) {
      return;
    }
    const detail = await importScore({ projectId: project.project.id, sourcePath });
    setProject(detail);
    await refreshProjects(project.project.id);
    setStatusMessage("Score imported.");
  }

  async function handleImportReference() {
    if (!project) {
      return;
    }
    const sourcePath = await importAudioPath();
    if (!sourcePath) {
      return;
    }
    const detail = await importReference({
      projectId: project.project.id,
      sourcePath,
    });
    setProject(detail);
    await refreshProjects(project.project.id);
    setStatusMessage("Reference imported.");
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
    draft: { name: string; notes: string; measureStart: string; measureEnd: string; referenceId: string },
  ) {
    if (!project) {
      return;
    }
    const detail = await updateRecording({
      projectId: project.project.id,
      recordingId,
      name: draft.name.trim() || "Untitled Take",
      notes: draft.notes.trim() || null,
      measureStart: draft.measureStart ? Number(draft.measureStart) || null : null,
      measureEnd: draft.measureEnd ? Number(draft.measureEnd) || null : null,
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
    const confirmDelete = window.confirm(
      `Delete metadata for ${recording?.name ?? "this recording"}? The audio file will stay on disk unless you remove it manually.`,
    );
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
    setStatusMessage("Recording metadata deleted.");
  }

  async function handleDuplicateRecording(recordingId: string) {
    if (!project) {
      return;
    }
    const detail = await duplicateRecording({
      projectId: project.project.id,
      recordingId,
    });
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

  async function handleAddMarker() {
    if (!project) {
      return;
    }
    const detail = await saveMarker({
      projectId: project.project.id,
      marker: {
        measureNumber: markerDraft.measureNumber,
        timestampMs: markerDraft.timestampMs,
        label: markerDraft.label || null,
        noteText: markerDraft.noteText || null,
      },
    });
    setProject(detail);
    setStatusMessage("Marker saved.");
  }

  async function handleDeleteMarker(markerId: string) {
    if (!project) {
      return;
    }
    const detail = await deleteMarker(project.project.id, markerId);
    setProject(detail);
    setStatusMessage("Marker deleted.");
  }

  async function handleSaveLoop(startMeasure: number, endMeasure: number) {
    if (!project) {
      return;
    }
    const detail = await saveLoopRange({
      projectId: project.project.id,
      loopRange: {
        name: "Practice loop",
        startMeasure: Math.min(startMeasure, endMeasure),
        endMeasure: Math.max(startMeasure, endMeasure),
        isActive: true,
      },
    });
    setProject(detail);
    setStatusMessage("Loop saved.");
  }

  async function handleClearLoop() {
    if (!project?.loopRange) {
      return;
    }
    const detail = await saveLoopRange({
      projectId: project.project.id,
      loopRange: {
        id: project.loopRange.id,
        name: project.loopRange.name,
        startMeasure: project.loopRange.startMeasure,
        endMeasure: project.loopRange.endMeasure,
        isActive: false,
      },
    });
    setProject(detail);
    setStatusMessage("Loop cleared.");
  }

  async function handleSaveBookmark() {
    if (!project) {
      return;
    }
    const detail = await saveBookmark({
      projectId: project.project.id,
      bookmark: {
        measureStart: Math.min(bookmarkDraft.measureStart, bookmarkDraft.measureEnd),
        measureEnd: Math.max(bookmarkDraft.measureStart, bookmarkDraft.measureEnd),
        label: bookmarkDraft.label.trim() || `Bookmark ${project.bookmarks.length + 1}`,
        noteText: bookmarkDraft.noteText.trim() || null,
        color: bookmarkDraft.color || null,
        status: bookmarkDraft.status,
      },
    });
    setProject(detail);
    if (bookmarkDraft.activateLoop) {
      const loopDetail = await saveLoopRange({
        projectId: project.project.id,
        loopRange: {
          name: bookmarkDraft.label.trim() || "Bookmark loop",
          startMeasure: Math.min(bookmarkDraft.measureStart, bookmarkDraft.measureEnd),
          endMeasure: Math.max(bookmarkDraft.measureStart, bookmarkDraft.measureEnd),
          isActive: true,
        },
      });
      setProject(loopDetail);
    }
    setStatusMessage("Bookmark saved.");
  }

  function handleUseCurrentMeasureForBookmark() {
    setBookmarkDraft((current) => ({
      ...current,
      measureStart: currentMeasure,
      measureEnd: Math.max(currentMeasure, currentMeasure + 3),
    }));
  }

  async function handleDeleteBookmark(bookmarkId: string) {
    if (!project) {
      return;
    }
    const detail = await deleteBookmark(project.project.id, bookmarkId);
    setProject(detail);
    setStatusMessage("Bookmark deleted.");
  }

  async function handleSaveNote(text: string) {
    setNoteText(text);
  }

  async function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      setStatusMessage("Import a reference or recording before playback.");
      return;
    }
    try {
      if (audio.paused) {
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
    setCurrentMeasure(1);
    setIsPlaying(false);
  }

  function handleSeek(time: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
    setCurrentMeasure(estimateCurrentMeasure(audio.currentTime * 1000, project?.markers ?? []));
  }

  async function handleMeasureClick(measureNumber: number) {
    setCurrentMeasure(measureNumber);
    const seekTime = estimateMeasureTimestamp(measureNumber, project?.markers ?? []);
    if (seekTime != null) {
      handleSeek(seekTime / 1000);
      if (audioRef.current?.paused === false) {
        await audioRef.current.play();
      }
    }
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
      const measureStart = project.loopRange?.startMeasure ?? currentMeasure;
      const measureEnd = project.loopRange?.endMeasure ?? currentMeasure + 4;
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
          measureStart,
          measureEnd,
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

  return (
    <div className="app-shell">
      <ProjectHeader
        project={project?.project ?? null}
        projectNameDraft={projectNameDraft}
        setProjectNameDraft={setProjectNameDraft}
        onCreateProject={createNewProject}
        onOpenProject={openSelectedProject}
        onRenameProject={renameCurrentProject}
        onDeleteProject={deleteCurrentProject}
        onImportScore={handleImportScore}
        onImportReference={handleImportReference}
        onToggleRecording={handleToggleRecording}
        isRecording={isRecording}
      />

      <div className="workspace">
        <main className="main-column">
          <ProjectLibrary
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onOpenProject={openProjectById}
          />

          {project ? (
            <>
              <ScorePanel
                score={project.score}
                bookmarks={project.bookmarks}
                currentMeasure={currentMeasure}
                totalMeasures={project.score?.measureCount ?? Math.max(currentMeasure, 1)}
                zoom={scoreZoom}
                onZoomChange={setScoreZoom}
                onMeasureClick={(measureNumber) => {
                  void handleMeasureClick(measureNumber);
                }}
              />

              <TransportPanel
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                duration={duration}
                currentTime={currentTime}
                zoom={timelineZoom}
                markers={project.markers}
                loopRange={project.loopRange}
                activeSourceLabel={resolveSourceLabel(project, compareMode)}
                compareMode={compareMode}
                selectedReference={resolveReference(project)}
                selectedRecording={resolveRecording(project)}
                onPlayPause={() => {
                  void handlePlayPause();
                }}
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
                onSetLoop={(startMeasure, endMeasure) => {
                  void handleSaveLoop(startMeasure, endMeasure);
                }}
              />

              <RecordingBrowser
                projectName={project.project.name}
                recordings={project.recordings}
                references={project.references}
                selectedRecordingId={project.project.activeRecordingId ?? null}
                onSelectRecording={(recordingId) => {
                  void handleSelectRecording(recordingId);
                }}
                onSaveRecording={(recordingId, draft) => {
                  void handleSaveRecording(recordingId, draft);
                }}
                onDeleteRecording={(recordingId) => {
                  void handleDeleteRecording(recordingId);
                }}
                onDuplicateRecording={(recordingId) => {
                  void handleDuplicateRecording(recordingId);
                }}
                onOpenRecordingFolder={(recordingId) => {
                  void handleOpenRecordingFolder(recordingId);
                }}
              />

              <div className="panel">
                <div className="panel__header">
                  <h2>Status</h2>
                </div>
                <p className="muted">{statusMessage}</p>
              </div>
            </>
          ) : (
            <section className="panel">
              <div className="empty-state">
                Create a project, then import a MusicXML score and reference audio to start practicing.
              </div>
            </section>
          )}
        </main>

        <Sidebar
          references={project?.references ?? []}
          selectedReferenceId={project?.project.activeReferenceId ?? null}
          markers={project?.markers ?? []}
          loopRange={project?.loopRange ?? null}
          bookmarks={project?.bookmarks ?? []}
          practiceSessions={project?.practiceSessions ?? []}
          recentActivity={project?.recentActivity ?? []}
          stats={project?.stats ?? {
            todayMs: 0,
            weekMs: 0,
            recordingAttempts: 0,
            bookmarkCount: 0,
            mostPracticedRanges: [],
          }}
          note={{ text: noteText, updatedAt: project?.note.updatedAt ?? null }}
          bookmarkDraft={bookmarkDraft}
          setBookmarkDraft={setBookmarkDraft}
          onSelectReference={(referenceId) => {
            void handleSelectReference(referenceId);
          }}
          onDeleteReference={(referenceId) => {
            void handleDeleteReference(referenceId);
          }}
          onDeleteMarker={(markerId) => {
            void handleDeleteMarker(markerId);
          }}
          onDeleteBookmark={(bookmarkId) => {
            void handleDeleteBookmark(bookmarkId);
          }}
          onSetLoop={(startMeasure, endMeasure) => {
            void handleSaveLoop(startMeasure, endMeasure);
          }}
          onClearLoop={() => {
            void handleClearLoop();
          }}
          onSaveNote={(text) => {
            void handleSaveNote(text);
          }}
          onJumpToBookmark={(measureNumber) => {
            void handleMeasureClick(measureNumber);
          }}
          onAddMarkerAtCurrent={() => {
            void handleAddMarker();
          }}
          onUseCurrentMeasureForBookmark={() => {
            void handleUseCurrentMeasureForBookmark();
          }}
          onSaveBookmark={() => {
            void handleSaveBookmark();
          }}
          loopDraft={loopDraft}
          setLoopDraft={setLoopDraft}
          markerDraft={markerDraft}
          setMarkerDraft={setMarkerDraft}
        />
      </div>

      <audio ref={audioRef} hidden preload="auto" />
    </div>
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

async function importMusicXmlPath(): Promise<string | null> {
  return openScoreFile();
}

async function importAudioPath(): Promise<string | null> {
  return openAudioFile();
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
      scoreZoom: typeof parsed.scoreZoom === "number" && Number.isFinite(parsed.scoreZoom) ? parsed.scoreZoom : 1,
      timelineZoom:
        typeof parsed.timelineZoom === "number" && Number.isFinite(parsed.timelineZoom) ? parsed.timelineZoom : 1,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export default App;
