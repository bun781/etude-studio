import { useEffect, useRef, useState } from "react";
import { ProjectHeader } from "./components/ProjectHeader";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { ScorePanel } from "./components/ScorePanel";
import { Sidebar } from "./components/Sidebar";
import { TransportPanel } from "./components/TransportPanel";
import {
  createProject,
  currentIsoTimestamp,
  deleteBookmark,
  deleteMarker,
  deleteProject,
  deleteReference,
  importReference,
  importScore,
  joinPath,
  loadProject,
  listProjects,
  openAudioFile,
  openScoreFile,
  registerRecording,
  renameProject,
  saveBookmark,
  saveBinaryFile,
  saveLoopRange,
  saveMarker,
  saveProjectNote,
  setActiveRecording,
  setActiveReference,
  toFileSrc,
} from "./lib/api";
import { deriveLoopTimes, estimateCurrentMeasure, estimateMeasureTimestamp } from "./lib/measure";
import type {
  Bookmark,
  LoopRange,
  MeasureMarker,
  ProjectDetail,
  ProjectSummary,
  RecordingAttempt,
  ReferenceAsset,
} from "./lib/types";

type CompareMode = "reference" | "recording";

const DEFAULT_MARKER_DRAFT = {
  measureNumber: 1,
  timestampMs: 0,
  label: "",
  noteText: "",
};

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [noteText, setNoteText] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentMeasure, setCurrentMeasure] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("reference");
  const [isRecording, setIsRecording] = useState(false);
  const [markerDraft, setMarkerDraft] = useState(DEFAULT_MARKER_DRAFT);
  const [loopDraft, setLoopDraft] = useState({ startMeasure: 1, endMeasure: 4 });
  const [statusMessage, setStatusMessage] = useState("Ready.");

  useEffect(() => {
    void refreshProjects();
  }, []);

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
  }, [project, currentMeasure, currentTime]);

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

  async function refreshProjects(selectedId?: string | null) {
    const items = await listProjects();
    setProjects(items);
    if (selectedId) {
      setSelectedProjectId(selectedId);
    } else if (items.length > 0) {
      setSelectedProjectId(items[0].id);
    } else {
      setSelectedProjectId(null);
    }
  }

  async function openProjectById(projectId: string) {
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

  async function handleAddBookmark() {
    if (!project) {
      return;
    }
    const detail = await saveBookmark({
      projectId: project.project.id,
      bookmark: {
        name: `Bookmark ${project.bookmarks.length + 1}`,
        measureNumber: currentMeasure,
      },
    });
    setProject(detail);
    setStatusMessage("Bookmark saved.");
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
    if (!project) {
      return;
    }
    const detail = await saveProjectNote(project.project.id, text);
    setProject(detail);
  }

  async function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      setStatusMessage("Import a reference or recording before playback.");
      return;
    }
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
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
                currentMeasure={currentMeasure}
                totalMeasures={project.score?.measureCount ?? Math.max(currentMeasure, 1)}
                onMeasureClick={(measureNumber) => {
                  void handleMeasureClick(measureNumber);
                }}
              />

              <TransportPanel
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                duration={duration}
                currentTime={currentTime}
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
                onCompareModeChange={setCompareMode}
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
          recordings={project?.recordings ?? []}
          note={{ text: noteText, updatedAt: project?.note.updatedAt ?? null }}
          selectedRecordingId={project?.project.activeRecordingId ?? null}
          onSelectReference={(referenceId) => {
            void handleSelectReference(referenceId);
          }}
          onDeleteReference={(referenceId) => {
            void handleDeleteReference(referenceId);
          }}
          onSelectRecording={(recordingId) => {
            void handleSelectRecording(recordingId);
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
          onAddBookmarkAtCurrent={() => {
            void handleAddBookmark();
          }}
          currentMeasure={currentMeasure}
          loopDraft={loopDraft}
          setLoopDraft={setLoopDraft}
          markerDraft={markerDraft}
          setMarkerDraft={setMarkerDraft}
        />
      </div>

      <audio ref={audioRef} hidden />
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

export default App;
