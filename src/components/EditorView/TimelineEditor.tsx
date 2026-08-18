import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  Download,
  Film,
  Type,
  Music,
  Trash2,
  CheckCircle,
  RefreshCw,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  GripVertical,
  ArrowLeftRight,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MainVideo } from '../../remotion/MainVideo.js';
import { MainVideoProps, SubtitleLine, TimelineClipItem } from '../../remotion/types.js';

interface TimelineEditorProps {
  timelineData: {
    projectId: string;
    projectName: string;
    voicePath: string;
    voiceUrl: string;
    duration: number;
    subtitles: SubtitleLine[];
    clips: TimelineClipItem[];
  };
  onUpdateClips: (clips: TimelineClipItem[]) => void;
  onUpdateSubtitles: (subtitles: SubtitleLine[]) => void;
}

const STAGE_COLORS: Record<string, string> = {
  STAGE_1_RAW_CARPENTRY: '#f97316',
  STAGE_2_ASSEMBLY_FINISHING: '#3b82f6',
  STAGE_3_DECOR_FLOWERS: '#10b981',
  STAGE_4_WORSHIP_ALTAR: '#f59e0b',
};

const STAGE_LABELS: Record<string, string> = {
  STAGE_1_RAW_CARPENTRY: 'Thô',
  STAGE_2_ASSEMBLY_FINISHING: 'Lắp ráp',
  STAGE_3_DECOR_FLOWERS: 'Cắm hoa',
  STAGE_4_WORSHIP_ALTAR: 'Lễ Phật',
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6.0;
const LABEL_WIDTH = 100; // pixels for track label column
const BASE_PX_PER_SEC = 120; // base pixels per second at zoom 1.0

// ───────────────────────────────────────────────────────
// Sortable Clip Item
// ───────────────────────────────────────────────────────
interface SortableClipProps {
  clip: TimelineClipItem;
  index: number;
  totalClips: number;
  widthPx: number;
  onMoveClip: (index: number, direction: 'left' | 'right') => void;
  onDeleteClip: (index: number) => void;
}

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  totalClips,
  widthPx,
  onMoveClip,
  onDeleteClip,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
  });

  const stageColor = STAGE_COLORS[clip.stage] || '#64748b';
  const stageLabel = STAGE_LABELS[clip.stage] || 'N/A';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    width: Math.max(48, widthPx),
    flexShrink: 0,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative bg-slate-900/90 border rounded-lg flex flex-col overflow-hidden group cursor-grab active:cursor-grabbing select-none ${
        isDragging
          ? 'border-amber-400 ring-2 ring-amber-400/50 shadow-2xl shadow-amber-500/40'
          : 'border-slate-700/80 hover:border-slate-500'
      }`}
    >
      {/* Stage top border accent */}
      <div className="h-[3px] w-full" style={{ backgroundColor: stageColor }} />

      {/* Grip header icon */}
      <div className="absolute top-1 left-1.5 z-10 pointer-events-none bg-black/60 backdrop-blur-xs rounded px-1 py-0.5 flex items-center gap-1 border border-white/10">
        <GripVertical className="w-3 h-3 text-amber-400" />
        <span className="text-[8px] font-mono text-amber-300 font-bold">#{index + 1}</span>
      </div>

      {/* Thumbnail */}
      <div className="h-16 bg-black overflow-hidden relative pointer-events-none">
        {clip.thumbnailPath ? (
          <img
            src={`/media/thumbnails/${clip.thumbnailPath.split(/[\\/]/).pop()}`}
            alt={clip.fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-[9px]">
            No Thumb
          </div>
        )}
        {/* Time badge */}
        <span className="absolute bottom-0.5 right-0.5 bg-black/80 font-mono text-[8px] px-1 py-[1px] rounded text-amber-300 border border-amber-500/30 font-bold">
          {clip.sourceDuration.toFixed(1)}s
        </span>
      </div>

      {/* Info */}
      <div className="px-1.5 py-1 flex-1 min-h-0 pointer-events-none">
        {widthPx > 60 && (
          <p className="text-[9px] font-semibold text-slate-300 truncate leading-tight">
            {clip.fileName}
          </p>
        )}
        <span
          className="inline-block text-[8px] px-1 py-[0.5px] rounded font-medium mt-0.5 text-white/90"
          style={{ backgroundColor: stageColor + '40', border: `1px solid ${stageColor}60` }}
        >
          {stageLabel}
        </span>
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-between px-1 py-0.5 border-t border-slate-800/80 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveClip(index, 'left');
          }}
          disabled={index === 0}
          className="text-[9px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer"
          title="Di chuyển sang trái"
        >
          ◀
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClip(index);
          }}
          className="text-slate-500 hover:text-red-400 p-0.5 cursor-pointer"
          title="Xóa clip này"
        >
          <Trash2 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveClip(index, 'right');
          }}
          disabled={index === totalClips - 1}
          className="text-[9px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer"
          title="Di chuyển sang phải"
        >
          ▶
        </button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────
// Main TimelineEditor
// ───────────────────────────────────────────────────────
export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  timelineData,
  onUpdateClips,
  onUpdateSubtitles,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Audio settings
  const [voiceVolume, setVoiceVolume] = useState<number>(1.0);
  const [bgmVolume, setBgmVolume] = useState<number>(0.15);
  const [selectedBgm, setSelectedBgm] = useState<string>('');
  const [bgmList, setBgmList] = useState<{ name: string; fileName: string; filePath: string }[]>([]);

  // Subtitle editing state
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState<string>('');

  // Render job states
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderPercent, setRenderPercent] = useState<number>(0);
  const [renderMessage, setRenderMessage] = useState<string>('');
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Active clip dragging state for DragOverlay
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // Playhead state
  const [currentFrame, setCurrentFrame] = useState<number>(0);

  // Drag pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, scrollLeft: 0 });

  // Ref for the timeline bottom area (for native wheel listener)
  const timelineAreaRef = useRef<HTMLDivElement>(null);

  const fps = 30;
  const durationInFrames = Math.max(30, Math.ceil(timelineData.duration * fps));
  const totalDuration = timelineData.duration;
  const pxPerSec = BASE_PX_PER_SEC * zoomLevel;
  const trackWidth = totalDuration * pxPerSec;

  // DnD sensors - MouseSensor & TouchSensor for high reliability
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  // ── Fetch BGM list ──
  useEffect(() => {
    fetch('/api/generator/bgm-list')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setBgmList(data.data);
          setSelectedBgm(data.data[0].filePath);
        }
      });
  }, []);

  // ── Playhead sync: poll Remotion Player frame ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) {
        const frame = playerRef.current.getCurrentFrame();
        setCurrentFrame(frame);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // ── Native wheel listener with { passive: false } to intercept Ctrl+Scroll ──
  useEffect(() => {
    const el = timelineAreaRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoomLevel((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
      }
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Helper: recalculate timeline positions after reorder ──
  const recalcTimelinePositions = useCallback(
    (clips: TimelineClipItem[]): TimelineClipItem[] => {
      const total = totalDuration;
      const eachDur = total / clips.length;
      let curTime = 0;
      return clips.map((c, i) => {
        const isLast = i === clips.length - 1;
        const thisDur = isLast ? Math.max(0.1, total - curTime) : eachDur;
        const newClip = {
          ...c,
          timelineStart: Number(curTime.toFixed(2)),
          timelineEnd: Number((curTime + thisDur).toFixed(2)),
          sourceDuration: Number(thisDur.toFixed(2)),
        };
        curTime += thisDur;
        return newClip;
      });
    },
    [totalDuration]
  );

  // ── Clip manipulation ──
  const handleMoveClip = useCallback(
    (index: number, direction: 'left' | 'right') => {
      const newClips = [...timelineData.clips];
      const targetIdx = direction === 'left' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= newClips.length) return;

      const temp = newClips[index];
      newClips[index] = newClips[targetIdx];
      newClips[targetIdx] = temp;

      onUpdateClips(recalcTimelinePositions(newClips));
    },
    [timelineData.clips, onUpdateClips, recalcTimelinePositions]
  );

  const handleDeleteClip = useCallback(
    (index: number) => {
      if (timelineData.clips.length <= 1) return;
      const newClips = timelineData.clips.filter((_, i) => i !== index);
      onUpdateClips(recalcTimelinePositions(newClips));
    },
    [timelineData.clips, onUpdateClips, recalcTimelinePositions]
  );

  // ── DnD reorder ──
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveClipId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveClipId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = timelineData.clips.findIndex((c) => c.id === active.id);
      const newIndex = timelineData.clips.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove([...timelineData.clips], oldIndex, newIndex);
      onUpdateClips(recalcTimelinePositions(reordered));
    },
    [timelineData.clips, onUpdateClips, recalcTimelinePositions]
  );

  // ── Subtitle Edit Save ──
  const handleSaveSubtitle = useCallback(
    (id: string) => {
      const newSubs = timelineData.subtitles.map((sub) => {
        if (sub.id === id) {
          const words = editingSubText.split(/\s+/).filter(Boolean);
          const wordDur = (sub.end - sub.start) / words.length;
          return {
            ...sub,
            text: editingSubText,
            words: words.map((w, i) => ({
              word: w,
              start: Number((sub.start + i * wordDur).toFixed(2)),
              end: Number((sub.start + (i + 1) * wordDur).toFixed(2)),
            })),
          };
        }
        return sub;
      });

      onUpdateSubtitles(newSubs);
      setEditingSubId(null);
    },
    [timelineData.subtitles, editingSubText, onUpdateSubtitles]
  );

  // ── Zoom ──
  const handleZoom = useCallback(
    (delta: number) => {
      setZoomLevel((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
    },
    []
  );

  // ── Ctrl+Scroll to zoom ──
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        handleZoom(delta);
      }
    },
    [handleZoom]
  );

  // ── Drag Pan ──
  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle click OR Shift+Left click
      if (e.button === 1 || (e.shiftKey && e.button === 0)) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({
          x: e.clientX,
          scrollLeft: timelineScrollRef.current?.scrollLeft || 0,
        });
      }
    },
    []
  );

  const handlePanMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !timelineScrollRef.current) return;
      const dx = e.clientX - panStart.x;
      timelineScrollRef.current.scrollLeft = panStart.scrollLeft - dx;
    },
    [isPanning, panStart]
  );

  const handlePanMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // ── Click ruler to seek ──
  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timeSec = x / pxPerSec;
      const frame = Math.round(Math.max(0, Math.min(timeSec, totalDuration)) * fps);
      playerRef.current?.seekTo(frame);
      setCurrentFrame(frame);
    },
    [pxPerSec, totalDuration, fps]
  );

  // ── Render ──
  const handleStartRender = async () => {
    try {
      setRendering(true);
      setRenderPercent(0);
      setRenderMessage('Đang khởi tạo tiến trình render MP4...');
      setRenderOutputPath(null);

      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: timelineData.projectName,
          voicePath: timelineData.voicePath,
          bgmPath: selectedBgm,
          bgmVolume,
          voiceVolume,
          clips: timelineData.clips,
          subtitles: timelineData.subtitles,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRenderJobId(data.jobId);
        pollRenderStatus(data.jobId);
      }
    } catch (err: any) {
      setRenderMessage(`Lỗi: ${err.message}`);
    }
  };

  const pollRenderStatus = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/render/status/${jobId}`);
        const data = await res.json();
        if (data.success) {
          setRenderPercent(data.data.percent);
          setRenderMessage(data.data.message);
          if (data.data.status === 'completed') {
            clearInterval(interval);
            setRenderOutputPath(data.data.outputPath);
          } else if (data.data.status === 'error') {
            clearInterval(interval);
          }
        }
      } catch (_) {}
    }, 1000);
  };

  const handleOpenExportFolder = () => {
    fetch('/api/render/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: renderOutputPath }),
    });
  };

  // ── Ruler tick marks ──
  const generateRulerTicks = () => {
    const ticks: { time: number; major: boolean }[] = [];
    // Determine tick interval based on zoom
    let interval = 1;
    if (zoomLevel < 0.8) interval = 5;
    else if (zoomLevel < 1.5) interval = 2;
    else if (zoomLevel < 3) interval = 1;
    else interval = 0.5;

    for (let t = 0; t <= totalDuration; t += interval) {
      const isMajor = interval >= 1 ? t % (interval * 2 === 0 ? 2 : Math.max(2, interval)) === 0 : t % 1 === 0;
      ticks.push({ time: Number(t.toFixed(1)), major: t % Math.max(1, interval * 2) === 0 });
    }
    return ticks;
  };

  // ── Format time ──
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  };

  // ── Playhead position ──
  const playheadTimeSec = currentFrame / fps;
  const playheadPx = playheadTimeSec * pxPerSec;

  // ── Composition props ──
  const compositionProps: MainVideoProps = {
    durationInFrames,
    fps,
    width: 1080,
    height: 1920,
    clips: timelineData.clips,
    subtitles: timelineData.subtitles,
    voiceUrl: timelineData.voiceUrl,
    bgmUrl: selectedBgm ? `/media/bgm/${selectedBgm.split(/[\\/]/).pop()}` : undefined,
    voiceVolume,
    bgmVolume,
    fontFamily: 'Be Vietnam Pro',
    activeWordColor: '#FFD700',
    inactiveWordColor: '#FFFFFF',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#0B0F19] text-slate-100 overflow-hidden">
      {/* ════════ Top Workspace Area: Player 9:16 + Control Panel ════════ */}
      <div className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0">
        {/* Khung Xem Trước Remotion 9:16 */}
        <div className="flex-1 flex items-center justify-center bg-black/60 rounded-2xl border border-slate-800 p-4 relative shadow-2xl overflow-hidden">
          <div className="h-full aspect-[9/16] rounded-xl overflow-hidden shadow-2xl border border-amber-500/30 bg-slate-950 flex items-center justify-center">
            <Player
              ref={playerRef}
              component={MainVideo}
              inputProps={compositionProps}
              durationInFrames={durationInFrames}
              fps={30}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{
                width: '100%',
                height: '100%',
              }}
              controls
              autoPlay={false}
              loop
            />
          </div>
        </div>

        {/* Bảng Điều Khiển & Cài Đặt Âm Thanh / Render */}
        <div className="w-96 flex flex-col justify-between bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="space-y-5">
            {/* Info Box */}
            <div>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                Công Trình Đang Dựng
              </span>
              <h3 className="text-base font-bold text-slate-100 truncate mt-0.5">
                {timelineData.projectName}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Thời lượng: <span className="font-mono text-amber-300 font-bold">{timelineData.duration.toFixed(1)}s</span> • {timelineData.clips.length} clips • {timelineData.subtitles.length} dòng phụ đề
              </p>
            </div>

            <hr className="border-slate-800" />

            {/* Audio Settings */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-400" />
                Hòa Âm Voice & Nhạc Thiền BGM
              </h4>

              {/* BGM Dropdown */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1.5">Chọn Nhạc Thiền BGM:</label>
                <select
                  value={selectedBgm}
                  onChange={(e) => setSelectedBgm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 outline-none focus:border-amber-500"
                >
                  <option value="">-- Không dùng nhạc nền --</option>
                  {bgmList.map((bgm, idx) => (
                    <option key={idx} value={bgm.filePath}>
                      {bgm.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Volume Sliders */}
              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Âm lượng Giọng đọc Voice:</span>
                    <span className="font-mono text-amber-400 font-bold">{Math.round(voiceVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={voiceVolume}
                    onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Âm lượng Nhạc nền (Audio Ducking):</span>
                    <span className="font-mono text-amber-400 font-bold">{Math.round(bgmVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Render Export Button */}
          <div className="pt-6 border-t border-slate-800">
            <button
              onClick={handleStartRender}
              disabled={rendering}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              XUẤT VIDEO (RENDER MP4 1080x1920)
            </button>
          </div>
        </div>
      </div>

      {/* ════════ Bottom Timeline Tracks Area ════════ */}
      <div
        ref={timelineAreaRef}
        className="h-72 bg-[#111827] border-t border-slate-800 flex flex-col overflow-hidden select-none"
      >
        {/* Timeline Toolbar */}
        <div className="h-9 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-amber-400 font-bold">TIMELINE 9:16</span>
            <span>
              {formatTime(playheadTimeSec)} / {formatTime(totalDuration)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">
              Frame {currentFrame} / {durationInFrames}
            </span>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 mr-1">Zoom:</span>
            <button
              onClick={() => handleZoom(-0.25)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] text-amber-400 font-bold w-10 text-center">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={() => handleZoom(0.25)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <span className="text-slate-700 mx-1">|</span>
            <span className="text-[10px] text-slate-600 italic">
              Ctrl+Scroll zoom • Shift+Drag pan • Kéo clip đổi vị trí
            </span>
          </div>
        </div>

        {/* Scrollable Timeline Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Track Labels (fixed left column) */}
          <div className="flex flex-col flex-shrink-0" style={{ width: LABEL_WIDTH }}>
            {/* Ruler label */}
            <div className="h-6 flex items-center px-3 border-b border-slate-800 bg-slate-900/50">
              <span className="text-[9px] font-mono text-slate-500">⏱ TIME</span>
            </div>
            {/* Video label */}
            <div className="h-[105px] flex items-center px-3 border-b border-slate-800/50">
              <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" />
                <span>Video ({timelineData.clips.length})</span>
              </div>
            </div>
            {/* Subtitle label */}
            <div className="flex-1 flex items-center px-3">
              <div className="text-[11px] font-bold text-yellow-300 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                <span>Sub ({timelineData.subtitles.length})</span>
              </div>
            </div>
          </div>

          {/* Scrollable tracks content */}
          <div
            ref={timelineScrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
            onMouseDown={handlePanMouseDown}
            onMouseMove={handlePanMouseMove}
            onMouseUp={handlePanMouseUp}
            onMouseLeave={handlePanMouseUp}
          >
            <div className="relative" style={{ width: trackWidth, minHeight: '100%' }}>
              {/* ── Ruler ── */}
              <div
                className="h-6 border-b border-slate-700/60 relative cursor-pointer bg-slate-900/30"
                onClick={handleRulerClick}
                title="Click để seek tới mốc thời gian"
              >
                {generateRulerTicks().map((tick, i) => {
                  const x = tick.time * pxPerSec;
                  return (
                    <div key={i} className="absolute top-0" style={{ left: x }}>
                      <div
                        className={`${tick.major ? 'h-6 border-slate-600' : 'h-3 border-slate-800'}`}
                        style={{ borderLeft: '1px solid' }}
                      />
                      {(tick.major || zoomLevel >= 2) && (
                        <span
                          className="absolute text-[8px] font-mono text-slate-500 select-none"
                          style={{ top: tick.major ? 1 : 0, left: 3, whiteSpace: 'nowrap' }}
                        >
                          {formatTime(tick.time)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── TRACK 1: VIDEO CLIPS (proportional width) ── */}
              <div className="h-[105px] border-b border-slate-800/50 relative">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={timelineData.clips.map((c) => c.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex h-full items-stretch py-1 gap-[1px]">
                      {timelineData.clips.map((clip, idx) => {
                        const widthPx = clip.sourceDuration * pxPerSec;
                        return (
                          <SortableClip
                            key={clip.id}
                            clip={clip}
                            index={idx}
                            totalClips={timelineData.clips.length}
                            widthPx={widthPx}
                            onMoveClip={handleMoveClip}
                            onDeleteClip={handleDeleteClip}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>

                  {/* Drag overlay for smooth visual feedback */}
                  <DragOverlay>
                    {activeClipId ? (() => {
                      const activeClip = timelineData.clips.find((c) => c.id === activeClipId);
                      if (!activeClip) return null;
                      const activeStageColor = STAGE_COLORS[activeClip.stage] || '#64748b';
                      return (
                        <div
                          className="bg-slate-900 border-2 border-amber-400 rounded-lg flex flex-col overflow-hidden shadow-2xl shadow-amber-500/50 opacity-95 pointer-events-none"
                          style={{
                            width: Math.max(48, activeClip.sourceDuration * pxPerSec),
                            height: 98,
                          }}
                        >
                          <div className="h-[3px] w-full" style={{ backgroundColor: activeStageColor }} />
                          <div className="h-16 bg-black overflow-hidden relative">
                            {activeClip.thumbnailPath ? (
                              <img
                                src={`/media/thumbnails/${activeClip.thumbnailPath.split(/[\\/]/).pop()}`}
                                alt={activeClip.fileName}
                                className="w-full h-full object-cover"
                              />
                            ) : null}
                            <span className="absolute bottom-0.5 right-0.5 bg-black/80 font-mono text-[8px] px-1 py-[1px] rounded text-amber-300 border border-amber-500/30 font-bold">
                              {activeClip.sourceDuration.toFixed(1)}s
                            </span>
                          </div>
                          <div className="px-1.5 py-1">
                            <p className="text-[9px] font-semibold text-amber-300 truncate leading-tight">
                              {activeClip.fileName}
                            </p>
                          </div>
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
              </div>

              {/* ── TRACK 2: SUBTITLE LINES (absolute position per voice timing) ── */}
              <div className="relative min-h-[48px] h-[48px]">
                {timelineData.subtitles.map((sub) => {
                  const subDuration = sub.end - sub.start;
                  const widthPx = Math.max(20, subDuration * pxPerSec);
                  const leftPx = sub.start * pxPerSec;
                  const isEditing = editingSubId === sub.id;

                  return (
                    <div
                      key={sub.id}
                      className={`absolute top-1 bottom-1 bg-slate-900/80 border rounded-md flex flex-col justify-center px-1.5 py-0.5 text-[9px] overflow-hidden ${
                        isEditing
                          ? 'border-amber-500 bg-amber-500/10 z-20'
                          : 'border-yellow-500/20 hover:border-yellow-500/40 z-10'
                      }`}
                      style={{ left: leftPx, width: widthPx }}
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-0.5">
                          <input
                            value={editingSubText}
                            onChange={(e) => setEditingSubText(e.target.value)}
                            className="w-full bg-black/50 border border-amber-500/50 text-white text-[10px] px-1 py-0.5 rounded outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSubtitle(sub.id);
                              if (e.key === 'Escape') setEditingSubId(null);
                            }}
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setEditingSubId(null)}
                              className="px-1.5 py-[1px] bg-slate-800 text-[8px] rounded text-slate-300"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={() => handleSaveSubtitle(sub.id)}
                              className="px-1.5 py-[1px] bg-amber-500 text-[8px] rounded text-black font-bold"
                            >
                              Lưu
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p
                          onClick={() => {
                            setEditingSubId(sub.id);
                            setEditingSubText(sub.text);
                          }}
                          className="text-[10px] text-slate-200 font-medium truncate cursor-pointer hover:text-amber-300 leading-tight"
                          title={`${sub.start.toFixed(1)}s - ${sub.end.toFixed(1)}s | Click để sửa`}
                        >
                          {sub.text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Playhead (red vertical line) ── */}
              {playheadTimeSec >= 0 && playheadTimeSec <= totalDuration && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-30"
                  style={{ left: playheadPx }}
                >
                  {/* Playhead triangle marker */}
                  <div
                    className="absolute -top-0 -translate-x-1/2"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '7px solid #ef4444',
                    }}
                  />
                  {/* Playhead vertical line */}
                  <div className="w-[2px] h-full bg-red-500 -translate-x-[1px] shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════════ RENDER PROGRESS MODAL ════════ */}
      {rendering && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#151D2E] border border-amber-500/40 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
              {renderPercent >= 100 ? (
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              ) : (
                <RefreshCw className="w-8 h-8 animate-spin" />
              )}
            </div>

            <h3 className="text-lg font-bold text-slate-100 font-montserrat">
              {renderPercent >= 100 ? 'XUẤT VIDEO THÀNH CÔNG!' : 'Đang Render Video 9:16'}
            </h3>
            <p className="text-xs text-slate-400 mt-2 mb-6">{renderMessage}</p>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${renderPercent}%` }}
              />
            </div>
            <span className="font-mono text-sm text-amber-400 font-bold">{renderPercent}%</span>

            {/* Completion Actions */}
            {renderPercent >= 100 && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setRendering(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
                >
                  Đóng
                </button>
                <button
                  onClick={handleOpenExportFolder}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-1.5"
                >
                  <FolderOpen className="w-4 h-4" />
                  Mở Thư Mục Video
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
