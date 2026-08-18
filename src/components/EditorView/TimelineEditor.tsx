import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  Maximize2,
  GripVertical,
  Scissors,
  ArrowLeftRight,
  Play,
  Pause,
  ExternalLink,
  Eye,
  Search,
  Check,
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
import { MainVideoProps, SubtitleLine, TimelineClipItem, SourceClipRecord } from '../../remotion/types.js';

interface TimelineEditorProps {
  timelineData: {
    projectId: string;
    projectName: string;
    voicePath: string;
    voiceUrl: string;
    duration: number;
    subtitles: SubtitleLine[];
    clips: TimelineClipItem[];
    availableSources?: SourceClipRecord[];
    outro?: {
      filePath: string;
      fileName: string;
      duration: number;
      enabled: boolean;
    } | null;
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

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
function isImageFile(filePath: string): boolean {
  const ext = (filePath || '').toLowerCase().split('?')[0].split('.').pop();
  return ext ? IMAGE_EXTS.some((e) => e.endsWith(ext)) : false;
}

const MIN_ZOOM = 0.05;
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
  isSelected?: boolean;
  onSelectClip: (id: string) => void;
  onMoveClip: (index: number, direction: 'left' | 'right') => void;
  onDeleteClip: (index: number) => void;
  onReplaceFromExplorer: (clipId: string) => void;
  onOpenProjectSourcesModal: (clipId: string) => void;
}

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  totalClips,
  widthPx,
  isSelected,
  onSelectClip,
  onMoveClip,
  onDeleteClip,
  onReplaceFromExplorer,
  onOpenProjectSourcesModal,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
  });

  const stageColor = STAGE_COLORS[clip.stage] || '#64748b';
  const stageLabel = STAGE_LABELS[clip.stage] || 'N/A';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    width: Math.max(4, widthPx),
    flexShrink: 0,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : isSelected ? 30 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelectClip(clip.id);
      }}
      title={`#${index + 1}: ${clip.fileName} (${clip.sourceDuration.toFixed(1)}s) - ${stageLabel} (Click để chọn)`}
      className={`relative bg-slate-900/90 border rounded-lg flex flex-col overflow-hidden group cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? 'border-amber-400 ring-2 ring-amber-400/50 shadow-2xl shadow-amber-500/40'
          : isSelected
          ? 'border-amber-400 ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/25 bg-slate-850'
          : 'border-slate-700/80 hover:border-slate-500'
      }`}
    >
      {/* Stage top border accent */}
      <div className="h-[3px] w-full flex-shrink-0" style={{ backgroundColor: stageColor }} />

      {/* Grip header icon (hiển thị khi chiều rộng >= 30px) */}
      {widthPx >= 30 && (
        <div className="absolute top-1 left-1 z-10 pointer-events-none bg-black/70 backdrop-blur-xs rounded px-1 py-0.5 flex items-center gap-0.5 border border-white/10">
          {widthPx >= 50 && <GripVertical className="w-3 h-3 text-amber-400" />}
          <span className={`text-[8px] font-mono font-bold ${isSelected ? 'text-yellow-300' : 'text-amber-300'}`}>
            #{index + 1}
          </span>
          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />}
        </div>
      )}

      {/* Thumbnail */}
      <div className="h-16 bg-black overflow-hidden relative pointer-events-none flex-shrink-0">
        {clip.thumbnailPath ? (
          <img
            src={`/media/thumbnails/${clip.thumbnailPath.split(/[\\/]/).pop()}`}
            alt={clip.fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-[8px]">
            {widthPx >= 40 ? 'No Thumb' : ''}
          </div>
        )}
        {/* Time badge (hiển thị khi chiều rộng >= 45px) */}
        {widthPx >= 45 && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/80 font-mono text-[8px] px-1 py-[1px] rounded text-amber-300 border border-amber-500/30 font-bold">
            {clip.sourceDuration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Info (hiển thị linh hoạt theo chiều rộng) */}
      <div className="px-1 py-0.5 flex-1 min-h-0 pointer-events-none overflow-hidden">
        {widthPx >= 65 && (
          <p className="text-[9px] font-semibold text-slate-300 truncate leading-tight">
            {clip.fileName}
          </p>
        )}
        {widthPx >= 40 && (
          <span
            className="inline-block text-[7px] px-1 py-[0.5px] rounded font-medium mt-0.5 text-white/90 truncate"
            style={{ backgroundColor: stageColor + '40', border: `1px solid ${stageColor}60` }}
          >
            {stageLabel}
          </span>
        )}
      </div>

      {/* Controls (hiển thị khi hover hoặc khi đang chọn, chiều rộng >= 40px) */}
      {widthPx >= 40 && (
        <div
          className={`flex items-center justify-between px-1 py-0.5 border-t border-slate-800/80 bg-slate-950/95 transition-opacity z-20 gap-0.5 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveClip(index, 'left');
            }}
            disabled={index === 0}
            className="text-[8px] px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer"
            title="Di chuyển sang trái"
          >
            ◀
          </button>

          {/* Nút Đổi Source từ Explorer */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReplaceFromExplorer(clip.id);
            }}
            className="text-[8px] px-1 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded border border-amber-500/30 cursor-pointer flex items-center gap-0.5"
            title="Đổi video/ảnh từ máy tính (mở Windows Explorer)"
          >
            <FolderOpen className="w-2.5 h-2.5 text-amber-400" />
          </button>

          {/* Nút Đổi Source từ Công Trình */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenProjectSourcesModal(clip.id);
            }}
            className="text-[8px] px-1 py-0.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded border border-blue-500/30 cursor-pointer flex items-center gap-0.5"
            title="Chọn clip khác từ thư mục công trình"
          >
            <Film className="w-2.5 h-2.5 text-blue-400" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClip(index);
            }}
            className="text-slate-500 hover:text-red-400 p-0.5 cursor-pointer"
            title="Xóa clip này (tự bù clip giữ chuẩn 4-6s)"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveClip(index, 'right');
            }}
            disabled={index === totalClips - 1}
            className="text-[8px] px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer"
            title="Di chuyển sang phải"
          >
            ▶
          </button>
        </div>
      )}
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

  // Player playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Audio settings
  const [voiceVolume, setVoiceVolume] = useState<number>(1.0);
  const [bgmVolume, setBgmVolume] = useState<number>(0.15);
  const [selectedBgm, setSelectedBgm] = useState<string>('');
  const [bgmList, setBgmList] = useState<{ name: string; fileName: string; filePath: string }[]>([]);

  // Subtitle editing state
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState<string>('');

  // Subtitle custom size & position state (with persistence)
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('auto_video_subtitle_fontsize');
    return saved ? Number(saved) : 65;
  });
  const [subtitleBottomPercent, setSubtitleBottomPercent] = useState<number>(() => {
    const saved = localStorage.getItem('auto_video_subtitle_bottom_percent');
    return saved ? Number(saved) : 22;
  });

  const handleFontSizeChange = (size: number) => {
    const clamped = Math.max(40, Math.min(90, isNaN(size) ? 65 : size));
    setSubtitleFontSize(clamped);
    localStorage.setItem('auto_video_subtitle_fontsize', String(clamped));
  };

  const handleBottomPercentChange = (percent: number) => {
    const clamped = Math.max(12, Math.min(35, isNaN(percent) ? 22 : percent));
    setSubtitleBottomPercent(clamped);
    localStorage.setItem('auto_video_subtitle_bottom_percent', String(clamped));
  };

  const handleResetSubtitleStyles = () => {
    setSubtitleFontSize(65);
    setSubtitleBottomPercent(22);
    localStorage.setItem('auto_video_subtitle_fontsize', '65');
    localStorage.setItem('auto_video_subtitle_bottom_percent', '22');
  };

  // Selected clip state
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Outro State
  const [outroEnabled, setOutroEnabled] = useState<boolean>(timelineData.outro?.enabled ?? true);
  const [outroPath, setOutroPath] = useState<string>(timelineData.outro?.filePath ?? '');
  const [outroFileName, setOutroFileName] = useState<string>(timelineData.outro?.fileName ?? '');
  const [outroDuration, setOutroDuration] = useState<number>(timelineData.outro?.duration ?? 0);
  const [browsingOutro, setBrowsingOutro] = useState<boolean>(false);

  // Project source selector modal state
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null);
  const [projectSourceSearch, setProjectSourceSearch] = useState<string>('');
  const [projectSourceStageFilter, setProjectSourceStageFilter] = useState<string>('ALL');

  // Render job states
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderPercent, setRenderPercent] = useState<number>(0);
  const [renderMessage, setRenderMessage] = useState<string>('');
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState<boolean>(false);

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

  // ── Fetch default Outro if not provided ──
  useEffect(() => {
    if (!timelineData.outro && !outroPath) {
      fetch('/api/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data.defaultOutroPath) {
            setOutroPath(data.data.defaultOutroPath);
            setOutroFileName(data.data.defaultOutroPath.split(/[\\/]/).pop() || 'Outro_TamDuc.mp4');
            setOutroDuration(data.data.outroDuration || 5.0);
            setOutroEnabled(data.data.outroEnabled ?? true);
          }
        })
        .catch(() => {});
    }
  }, [timelineData.outro, outroPath]);

  const handleChangeOutroFile = async () => {
    setBrowsingOutro(true);
    try {
      const res = await fetch('/api/settings/browse-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPath: outroPath }),
      });
      const data = await res.json();
      if (data.success && data.selectedPath) {
        setOutroPath(data.selectedPath);
        setOutroFileName(data.fileName || data.selectedPath.split(/[\\/]/).pop() || 'Outro_TamDuc.mp4');
        setOutroDuration(data.duration || 5.0);
        setOutroEnabled(true);
      }
    } catch (err) {
      console.error('[TimelineEditor] Error browsing outro video:', err);
    } finally {
      setBrowsingOutro(false);
    }
  };

  const fps = 30;
  const voiceDuration = timelineData.duration;
  const isOutroActive = outroEnabled && Boolean(outroPath) && outroDuration > 0;
  const totalDuration = voiceDuration + (isOutroActive ? outroDuration : 0);
  const durationInFrames = Math.max(30, Math.ceil(totalDuration * fps));
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
        if (data.success && Array.isArray(data.data)) {
          setBgmList(data.data);
        }
      })
      .catch((err) => console.error('Failed to load BGM list:', err));
  }, []);

  // ── Playhead sync & isPlaying status: poll Remotion Player ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) {
        const frame = playerRef.current.getCurrentFrame();
        setCurrentFrame(frame);
        setIsPlaying(playerRef.current.isPlaying());
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // ── Spacebar toggle Play / Pause ──
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    if (playerRef.current.isPlaying()) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input') ||
          target.closest('textarea'))
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  // ── Native wheel listener with { passive: false } to intercept Ctrl+Scroll ──
  useEffect(() => {
    const el = timelineAreaRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((prev + delta).toFixed(3)))));
      }
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Helper: Cân bằng & Tự bù clip giữ chuẩn 4.0s - 5.5s (Tối đa 6.0s) trong phạm vi Voice ──
  const rebalanceClips = useCallback(
    (clips: TimelineClipItem[]): TimelineClipItem[] => {
      const total = voiceDuration;
      if (total <= 0) return clips;
      const idealClipDur = 5.0;
      let neededCount = Math.max(1, Math.ceil(total / 5.5));
      if (total / neededCount < 4.0 && neededCount > 1) {
        neededCount = Math.max(1, Math.round(total / idealClipDur));
      }

      let workingClips = [...clips];
      const pool = (timelineData.availableSources && timelineData.availableSources.length > 0)
        ? timelineData.availableSources
        : clips.map((c) => ({
            id: c.sourceId || c.id,
            projectId: '',
            fileName: c.fileName,
            filePath: c.filePath,
            duration: c.sourceDuration || 5.0,
            width: 1080,
            height: 1920,
            aspectRatioType: c.aspectRatioType,
            stage: c.stage,
            aestheticScore: 7.5,
            sceneDescription: '',
            thumbnailPath: c.thumbnailPath,
            mediaType: c.mediaType,
          }));

      let fillIdx = 0;
      while (workingClips.length < neededCount) {
        const src = pool[fillIdx % pool.length];
        fillIdx++;
        workingClips.push({
          id: `clip_fill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sourceId: src.id,
          fileName: src.fileName,
          filePath: src.filePath,
          thumbnailPath: src.thumbnailPath,
          stage: src.stage,
          timelineStart: 0,
          timelineEnd: 0,
          sourceStart: 0,
          sourceDuration: idealClipDur,
          aspectRatioType: src.aspectRatioType,
          mediaType: src.mediaType || (isImageFile(src.filePath) ? 'image' : 'video'),
        });
      }

      const eachDur = total / workingClips.length;
      let curTime = 0;
      const videoUsageCount: Record<string, number> = {};

      return workingClips.map((c, i) => {
        const isLast = i === workingClips.length - 1;
        const thisDur = isLast ? Math.max(0.1, total - curTime) : eachDur;
        const isImg = c.mediaType === 'image' || isImageFile(c.filePath);

        let srcStart = c.sourceStart || 0;
        if (!isImg) {
          const srcMatch = pool.find((p) => p.id === c.sourceId || p.filePath === c.filePath);
          const srcTotalDur = srcMatch?.duration || 10;
          if (srcTotalDur > thisDur) {
            const usageIndex = videoUsageCount[c.filePath] || 0;
            videoUsageCount[c.filePath] = usageIndex + 1;
            const maxStart = Math.max(0, srcTotalDur - thisDur);
            srcStart = (usageIndex * thisDur) % (maxStart + 0.1);
            if (srcStart > maxStart) srcStart = maxStart;
          }
        }

        const newClip: TimelineClipItem = {
          ...c,
          timelineStart: Number(curTime.toFixed(2)),
          timelineEnd: Number((curTime + thisDur).toFixed(2)),
          sourceStart: Number(srcStart.toFixed(2)),
          sourceDuration: Number(thisDur.toFixed(2)),
        };
        curTime += thisDur;
        return newClip;
      });
    },
    [voiceDuration, timelineData.availableSources]
  );

  // ── Helper: recalculate sequential timeline positions after simple drag/move ──
  const recalcTimelinePositions = useCallback(
    (clips: TimelineClipItem[]): TimelineClipItem[] => {
      const total = voiceDuration;
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
    [voiceDuration]
  );

  // ── Tự động chuẩn hóa lại clips khớp chính xác 100% voiceDuration nếu session trước bị kéo lệch ──
  useEffect(() => {
    if (!timelineData.clips || timelineData.clips.length === 0 || voiceDuration <= 0) return;
    const currentSum = timelineData.clips.reduce((acc, c) => acc + (c.sourceDuration || 0), 0);
    if (Math.abs(currentSum - voiceDuration) > 0.15) {
      onUpdateClips(recalcTimelinePositions(timelineData.clips));
    }
  }, [voiceDuration, recalcTimelinePositions, onUpdateClips]);

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
      const remaining = timelineData.clips.filter((_, i) => i !== index);
      // Tự động bù clip để bảo đảm thời lượng 4.0s - 5.5s
      onUpdateClips(rebalanceClips(remaining));
    },
    [timelineData.clips, onUpdateClips, rebalanceClips]
  );

  // ── Replace Clip from Windows Explorer ──
  const handleReplaceClipFromExplorer = useCallback(
    async (clipId: string) => {
      try {
        const res = await fetch('/api/generator/pick-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.success && data.file) {
          const newClips = timelineData.clips.map((c) => {
            if (c.id === clipId) {
              return {
                ...c,
                sourceId: data.file.id,
                fileName: data.file.fileName,
                filePath: data.file.filePath,
                thumbnailPath: data.file.thumbnailPath || c.thumbnailPath,
                mediaType: data.file.mediaType || (isImageFile(data.file.filePath) ? 'image' : 'video'),
                aspectRatioType: data.file.aspectRatioType || '9:16',
                // Keep timelineStart, timelineEnd, sourceDuration preserved!
              };
            }
            return c;
          });
          onUpdateClips(newClips);
        }
      } catch (err) {
        console.error('[TimelineEditor] Replace clip from explorer error:', err);
      }
    },
    [timelineData.clips, onUpdateClips]
  );

  // ── Open Project Sources Selector Modal ──
  const handleOpenProjectSourceModal = useCallback((clipId: string) => {
    setReplacingClipId(clipId);
    setShowSourceModal(true);
  }, []);

  // ── Replace Clip from Project Sources ──
  const handleSelectProjectSource = useCallback(
    (source: SourceClipRecord) => {
      if (!replacingClipId) return;
      const newClips = timelineData.clips.map((c) => {
        if (c.id === replacingClipId) {
          return {
            ...c,
            sourceId: source.id,
            fileName: source.fileName,
            filePath: source.filePath,
            thumbnailPath: source.thumbnailPath,
            mediaType: source.mediaType || (isImageFile(source.filePath) ? 'image' : 'video'),
            aspectRatioType: source.aspectRatioType,
            stage: source.stage || c.stage,
            // Keep timelineStart, timelineEnd, sourceDuration preserved!
          };
        }
        return c;
      });
      onUpdateClips(newClips);
      setShowSourceModal(false);
      setReplacingClipId(null);
    },
    [replacingClipId, timelineData.clips, onUpdateClips]
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

  // ── Zoom Controls ──
  const handleZoom = useCallback(
    (delta: number) => {
      setZoomLevel((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((prev + delta).toFixed(3)))));
    },
    []
  );

  // ── Fit Timeline 100% to view without scroll ──
  const handleFitTimeline = useCallback(() => {
    const el = timelineScrollRef.current;
    if (!el || totalDuration <= 0) return;
    const availableWidth = Math.max(100, el.clientWidth - 20);
    const calculatedFit = availableWidth / (totalDuration * BASE_PX_PER_SEC);
    const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(calculatedFit.toFixed(3))));
    setZoomLevel(targetZoom);
    el.scrollLeft = 0;
  }, [totalDuration]);

  // Auto-fit timeline on first load
  useEffect(() => {
    // Small delay to allow DOM to measure clientWidth
    const timer = setTimeout(() => {
      handleFitTimeline();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

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
          subtitleFontSize,
          subtitleBottomPercent,
          outroPath: isOutroActive ? outroPath : undefined,
          outroEnabled: isOutroActive,
          outroDuration: isOutroActive ? outroDuration : 0,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRenderJobId(data.jobId);
        pollRenderStatus(data.jobId);
      } else {
        setRenderMessage(`Lỗi khởi động render: ${data.error || 'Không xác định'}`);
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
        if (data.success && data.data) {
          setRenderPercent(data.data.percent || 0);
          setRenderMessage(data.data.message || '');
          if (data.data.status === 'completed') {
            clearInterval(interval);
            setRenderPercent(100);
            setRenderMessage(data.data.message || 'Xuất video thành công!');
            if (data.data.outputPath) {
              setRenderOutputPath(data.data.outputPath);
            }
          } else if (data.data.status === 'error') {
            clearInterval(interval);
            setRenderMessage(`Render thất bại: ${data.data.error || data.data.message}`);
          }
        }
      } catch (err) {
        console.error('[TimelineEditor] Poll status error:', err);
      }
    }, 1000);
  };

  const handleOpenExportFolder = async () => {
    try {
      await fetch('/api/render/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: renderOutputPath }),
      });
    } catch (err) {
      console.error('[TimelineEditor] Open folder error:', err);
    }
  };

  const handlePlayExternal = async () => {
    try {
      await fetch('/api/render/open-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: renderOutputPath }),
      });
    } catch (err) {
      console.error('[TimelineEditor] Play external error:', err);
    }
  };

  // ── Ruler tick marks (Thích ứng linh hoạt theo mọi mức Zoom) ──
  const generateRulerTicks = () => {
    const ticks: { time: number; major: boolean }[] = [];
    let interval = 1;
    if (zoomLevel < 0.12) interval = 30;
    else if (zoomLevel < 0.25) interval = 15;
    else if (zoomLevel < 0.5) interval = 10;
    else if (zoomLevel < 0.8) interval = 5;
    else if (zoomLevel < 1.5) interval = 2;
    else if (zoomLevel < 3) interval = 1;
    else interval = 0.5;

    for (let t = 0; t <= totalDuration; t += interval) {
      const isMajor = interval >= 1 ? t % (interval * 2) === 0 : t % 1 === 0;
      ticks.push({ time: Number(t.toFixed(1)), major: isMajor });
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

  // ── All clips including Outro if enabled ──
  const allClipsWithOutro: TimelineClipItem[] = useMemo(() => {
    if (!isOutroActive) return timelineData.clips;
    const outroClip: TimelineClipItem = {
      id: '__outro_fixed__',
      sourceId: '__outro_source__',
      fileName: outroFileName || 'Outro_TamDuc.mp4',
      filePath: outroPath,
      thumbnailPath: '',
      stage: 'OUTRO_STAGE',
      timelineStart: Number(voiceDuration.toFixed(2)),
      timelineEnd: Number(totalDuration.toFixed(2)),
      sourceStart: 0,
      sourceDuration: Number(outroDuration.toFixed(2)),
      aspectRatioType: '9:16',
      mediaType: 'video',
      isOutro: true,
    };
    return [...timelineData.clips, outroClip];
  }, [timelineData.clips, isOutroActive, outroFileName, outroPath, voiceDuration, totalDuration, outroDuration]);

  // ── Composition props (Memoized để bảo toàn luồng âm thanh Audio/Video không bị khởi tạo lại liên tục) ──
  const compositionProps: MainVideoProps = useMemo(
    () => ({
      durationInFrames,
      fps,
      width: 1080,
      height: 1920,
      clips: allClipsWithOutro,
      subtitles: timelineData.subtitles,
      voiceUrl: timelineData.voiceUrl,
      bgmUrl: selectedBgm ? `/media/bgm/${selectedBgm.split(/[\\/]/).pop()}` : undefined,
      voiceVolume,
      bgmVolume,
      fontFamily: 'Be Vietnam Pro',
      activeWordColor: '#FFD700',
      inactiveWordColor: '#FFFFFF',
      fontSize: subtitleFontSize,
      positionBottomPercent: subtitleBottomPercent,
      voiceDuration,
      outroPath: isOutroActive ? outroPath : undefined,
      outroDuration: isOutroActive ? outroDuration : 0,
      outroEnabled: isOutroActive,
    }),
    [
      durationInFrames,
      fps,
      allClipsWithOutro,
      timelineData.subtitles,
      timelineData.voiceUrl,
      selectedBgm,
      voiceVolume,
      bgmVolume,
      subtitleFontSize,
      subtitleBottomPercent,
      voiceDuration,
      isOutroActive,
      outroPath,
      outroDuration,
    ]
  );

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

        {/* Bảng Điều Khiển & Cài Đặt Âm Thanh / Phụ Đề / Render */}
        <div className="w-96 flex flex-col justify-between bg-[#151D2E] border border-slate-800 rounded-2xl p-5 shadow-xl min-h-0">
          <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar min-h-0 flex-1">
            {/* Info Box */}
            <div>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                Công Trình Đang Dựng
              </span>
              <h3 className="text-base font-bold text-slate-100 truncate mt-0.5">
                {timelineData.projectName}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Thời lượng: <span className="font-mono text-amber-300 font-bold">{totalDuration.toFixed(1)}s</span> {isOutroActive && `(Voice ${voiceDuration.toFixed(1)}s + Outro ${outroDuration.toFixed(1)}s)`} • {timelineData.clips.length} clips
              </p>
            </div>

            <hr className="border-slate-800" />

            {/* Subtitle Customization Card */}
            <div className="p-3.5 bg-slate-900/90 border border-amber-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  Cài Đặt Phụ Đề Karaoke
                </span>
                <button
                  onClick={handleResetSubtitleStyles}
                  className="text-[10px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                  title="Khôi phục cỡ chữ 65px & vị trí 22%"
                >
                  Mặc định
                </button>
              </div>

              {/* Font Size Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Cỡ chữ phụ đề:</span>
                  <span className="font-mono text-amber-400 font-bold">{subtitleFontSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="40"
                    max="90"
                    step="1"
                    value={subtitleFontSize}
                    onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                    className="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min="40"
                    max="90"
                    value={subtitleFontSize}
                    onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                    className="w-12 bg-slate-950 border border-slate-700 text-amber-400 font-mono text-xs text-center rounded px-1 py-0.5 outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Bottom Position Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Vị trí lề đáy (Safe Zone):</span>
                  <span className="font-mono text-amber-400 font-bold">{subtitleBottomPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="12"
                    max="35"
                    step="1"
                    value={subtitleBottomPercent}
                    onChange={(e) => handleBottomPercentChange(parseInt(e.target.value, 10))}
                    className="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min="12"
                    max="35"
                    value={subtitleBottomPercent}
                    onChange={(e) => handleBottomPercentChange(parseInt(e.target.value, 10))}
                    className="w-12 bg-slate-950 border border-slate-700 text-amber-400 font-mono text-xs text-center rounded px-1 py-0.5 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

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
                    <span>Âm lượng Nhạc nền (Fade-out khi vào Outro):</span>
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

            {/* Outro Settings Card in Sidebar */}
            <div className="p-3.5 bg-slate-900/90 border border-purple-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-purple-400" />
                  Outro Cuối Video (Âm thanh gốc)
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[10px] text-slate-400 font-medium">{isOutroActive ? 'BẬT' : 'TẮT'}</span>
                  <input
                    type="checkbox"
                    checked={outroEnabled}
                    onChange={(e) => {
                      if (!outroPath && e.target.checked) {
                        handleChangeOutroFile();
                      } else {
                        setOutroEnabled(e.target.checked);
                      }
                    }}
                    className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
                  />
                </label>
              </div>

              {outroPath ? (
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-300 truncate max-w-[170px]" title={outroPath}>
                    📁 {outroFileName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-purple-300 font-bold bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/30">
                      {outroDuration.toFixed(1)}s
                    </span>
                    <button
                      onClick={handleChangeOutroFile}
                      disabled={browsingOutro}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded border border-slate-700 cursor-pointer"
                      title="Đổi file video Outro khác"
                    >
                      Đổi
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleChangeOutroFile}
                  disabled={browsingOutro}
                  className="w-full py-1.5 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 text-[11px] rounded-lg border border-purple-500/30 flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3 text-purple-400" />
                  <span>Chọn Video Outro</span>
                </button>
              )}
            </div>
          </div>

          {/* Render Export & Exported Video Card */}
          <div className="pt-5 border-t border-slate-800 space-y-3">
            {renderOutputPath && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="text-[11px] font-bold text-emerald-300 truncate">
                      Video Vừa Xuất Hoàn Tất
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    1080x1920
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 font-mono truncate mb-2.5">
                  {renderOutputPath.split(/[\\/]/).pop()}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowVideoModal(true)}
                    className="py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-extrabold text-[11px] rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                    title="Xem video trực tiếp trên trình duyệt"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Xem Video
                  </button>
                  <button
                    onClick={handleOpenExportFolder}
                    className="py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-[11px] rounded-lg shadow flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                    title="Mở thư mục chứa video trong Windows Explorer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    Mở Thư Mục
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleStartRender}
              disabled={rendering}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
          <div className="flex items-center gap-3 font-mono text-[11px]">
            {/* Nút Play / Pause phím tắt Space */}
            <button
              onClick={togglePlayPause}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow transition cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
              }`}
              title="Phát / Dừng video (Phím tắt: Space)"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isPlaying ? 'Dừng' : 'Phát'}</span>
              <span className="text-[9px] font-mono opacity-80">(Space)</span>
            </button>

            <span className="text-amber-400 font-bold">TIMELINE 9:16</span>
            <span>
              {formatTime(playheadTimeSec)} / {formatTime(totalDuration)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">
              Frame {currentFrame} / {durationInFrames}
            </span>

            {/* Nút Bật/Tắt Outro trên Toolbar */}
            <button
              onClick={() => {
                if (!outroPath) {
                  handleChangeOutroFile();
                } else {
                  setOutroEnabled((prev) => !prev);
                }
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
                isOutroActive
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/40 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title={isOutroActive ? 'Đang bật Outro cuối video (Bấm để tắt)' : 'Đang tắt Outro (Bấm để bật)'}
            >
              <Film className="w-3 h-3 text-purple-400" />
              <span>Outro: {isOutroActive ? 'BẬT' : 'TẮT'}</span>
              {isOutroActive && (
                <span className="text-[9px] font-mono text-purple-300 opacity-90">({outroDuration.toFixed(1)}s)</span>
              )}
            </button>

            {/* Quick Actions cho Clip đang chọn */}
            {selectedClipId && (() => {
              const selIdx = timelineData.clips.findIndex((c) => c.id === selectedClipId);
              if (selIdx === -1) return null;
              return (
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/40 rounded-lg px-2 py-0.5">
                  <span className="text-[10px] text-amber-300 font-bold font-sans">
                    Clip #{selIdx + 1}:
                  </span>
                  <button
                    onClick={() => handleReplaceClipFromExplorer(selectedClipId)}
                    className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 text-[10px] font-bold rounded border border-amber-500/40 transition cursor-pointer font-sans"
                    title="Mở Windows Explorer chọn video/ảnh mới từ máy tính"
                  >
                    <FolderOpen className="w-3 h-3 text-amber-400" />
                    <span>Đổi từ Máy Tính</span>
                  </button>
                  <button
                    onClick={() => handleOpenProjectSourceModal(selectedClipId)}
                    className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/25 hover:bg-blue-500/40 text-blue-300 text-[10px] font-bold rounded border border-blue-500/40 transition cursor-pointer font-sans"
                    title="Chọn clip khác có sẵn trong thư mục công trình"
                  >
                    <Film className="w-3 h-3 text-blue-400" />
                    <span>Đổi từ Công Trình</span>
                  </button>
                  <button
                    onClick={() => setSelectedClipId(null)}
                    className="text-slate-400 hover:text-white text-[10px] px-1 font-sans cursor-pointer"
                    title="Bỏ chọn"
                  >
                    ✕
                  </button>
                </div>
              );
            })()}

            {renderOutputPath && (
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-emerald-400 font-sans font-semibold ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Đã xuất video MP4
              </span>
            )}
          </div>

          {/* Zoom & Action Controls */}
          <div className="flex items-center gap-2">
            {renderOutputPath && (
              <>
                <button
                  onClick={() => setShowVideoModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition text-[11px] font-bold border border-emerald-500/40 cursor-pointer"
                  title="Xem video vừa xuất"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Xem Video</span>
                </button>
                <button
                  onClick={handleOpenExportFolder}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition text-[11px] font-medium border border-slate-700 cursor-pointer"
                  title="Mở thư mục video trên Windows Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Thư Mục</span>
                </button>
              </>
            )}

            {/* Nút Xem Toàn Bộ Fit 100% */}
            <button
              onClick={handleFitTimeline}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 transition text-[11px] font-bold border border-amber-500/30 shadow-xs cursor-pointer"
              title="Tự động thu phóng vừa khít 100% màn hình để thấy hết toàn bộ timeline"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Fit Toàn Bộ</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
              <button
                onClick={() => handleZoom(-0.25)}
                className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                title="Thu nhỏ (Zoom Out)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[10px] text-amber-400 font-bold w-11 text-center select-none">
                {zoomLevel.toFixed(2)}x
              </span>
              <button
                onClick={() => handleZoom(0.25)}
                className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                title="Phóng to (Zoom In)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Nút Cân Bằng Chuẩn 4-6s */}
            <button
              onClick={() => onUpdateClips(rebalanceClips(timelineData.clips))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 border border-slate-700 text-[11px] font-semibold transition cursor-pointer"
              title="Tự động phân bổ lại toàn bộ clip để mỗi đoạn đạt chuẩn 4.0s - 5.5s"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Cắt Chuẩn 4-6s</span>
            </button>

            <span className="text-slate-700 mx-1">|</span>
            <span className="text-[10px] text-slate-500 italic hidden lg:inline">
              Phím Space: Phát/Dừng • Ctrl+Scroll zoom • Kéo thả đổi vị trí
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
                <span>Video ({timelineData.clips.length}{isOutroActive ? ' + Outro' : ''})</span>
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
            <div className="relative" style={{ width: Math.max(100, trackWidth), minHeight: '100%' }}>
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
                      {(tick.major || zoomLevel >= 1.5) && (
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
                            isSelected={selectedClipId === clip.id}
                            onSelectClip={setSelectedClipId}
                            onMoveClip={handleMoveClip}
                            onDeleteClip={handleDeleteClip}
                            onReplaceFromExplorer={handleReplaceClipFromExplorer}
                            onOpenProjectSourcesModal={handleOpenProjectSourceModal}
                          />
                        );
                      })}

                      {/* ── Khối OUTRO Cố Định Cuối Video ── */}
                      {isOutroActive && (
                        <div
                          style={{
                            width: Math.max(70, outroDuration * pxPerSec),
                            flexShrink: 0,
                          }}
                          className="relative bg-gradient-to-br from-purple-950/90 via-slate-900 to-indigo-950/90 border-2 border-purple-500/80 rounded-lg flex flex-col overflow-hidden shadow-lg shadow-purple-900/30 group select-none ml-[2px]"
                          title={`Outro Tâm Đức: ${outroFileName} (${outroDuration.toFixed(1)}s) - Giữ nguyên 100% âm thanh gốc`}
                        >
                          {/* Top accent */}
                          <div className="h-[3px] w-full bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400" />

                          {/* Content */}
                          <div className="p-1.5 flex-1 flex flex-col justify-between overflow-hidden">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-extrabold text-purple-300 flex items-center gap-1">
                                <Film className="w-2.5 h-2.5 text-purple-400" />
                                OUTRO
                              </span>
                              <span className="text-[8px] font-mono text-emerald-300 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/30 font-bold">
                                🔊 Gốc
                              </span>
                            </div>

                            <p className="text-[9px] font-semibold text-slate-200 truncate mt-0.5" title={outroFileName}>
                              {outroFileName}
                            </p>

                            <div className="flex items-center justify-between mt-0.5 text-[8px] text-purple-300 font-mono">
                              <span className="font-bold">{outroDuration.toFixed(1)}s</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleChangeOutroFile();
                                }}
                                className="px-1 py-0.2 bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 rounded border border-purple-500/40 text-[7.5px] font-bold cursor-pointer"
                                title="Đổi file Outro từ máy tính"
                              >
                                Đổi
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
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
                            width: Math.max(20, activeClip.sourceDuration * pxPerSec),
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
                  const widthPx = Math.max(4, subDuration * pxPerSec);
                  const leftPx = sub.start * pxPerSec;
                  const isEditing = editingSubId === sub.id;

                  return (
                    <div
                      key={sub.id}
                      className={`absolute top-1 bottom-1 bg-slate-900/80 border rounded-md flex flex-col justify-center px-1 py-0.5 text-[9px] overflow-hidden ${
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
                              className="px-1.5 py-[1px] bg-slate-800 text-[8px] rounded text-slate-300 cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={() => handleSaveSubtitle(sub.id)}
                              className="px-1.5 py-[1px] bg-amber-500 text-[8px] rounded text-black font-bold cursor-pointer"
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
                          title={`${sub.start.toFixed(1)}s - ${sub.end.toFixed(1)}s: "${sub.text}" (Click để sửa)`}
                        >
                          {widthPx >= 25 ? sub.text : '•••'}
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
          <div className="bg-[#151D2E] border border-amber-500/40 rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl relative">
            {/* Close Button top right */}
            {renderPercent >= 100 && (
              <button
                onClick={() => setRendering(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
                title="Đóng cửa sổ"
              >
                ✕
              </button>
            )}

            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
              {renderPercent >= 100 ? (
                <CheckCircle className="w-9 h-9 text-emerald-400" />
              ) : (
                <RefreshCw className="w-8 h-8 animate-spin" />
              )}
            </div>

            <h3 className="text-xl font-extrabold text-slate-100 font-montserrat">
              {renderPercent >= 100 ? 'XUẤT VIDEO THÀNH CÔNG! 🎉' : 'Đang Render Video 9:16'}
            </h3>
            <p className="text-xs text-slate-400 mt-2 mb-5">{renderMessage}</p>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-3.5 mb-2.5 overflow-hidden border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  renderPercent >= 100
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                }`}
                style={{ width: `${renderPercent}%` }}
              />
            </div>
            <span className="font-mono text-sm text-amber-400 font-bold">{renderPercent}%</span>

            {/* Completion Actions */}
            {renderPercent >= 100 && (
              <div className="mt-6 space-y-3.5 pt-4 border-t border-slate-800/80">
                {renderOutputPath && (
                  <p className="text-[11px] text-amber-300/90 font-mono bg-slate-900/90 py-1.5 px-3 rounded-lg border border-amber-500/20 truncate">
                    📁 {renderOutputPath.split(/[\\/]/).pop()}
                  </p>
                )}

                {/* 2 Nút Chính To & Nổi Bật */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowVideoModal(true)}
                    className="py-3.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-600 hover:to-yellow-500 text-slate-950 rounded-xl text-xs font-extrabold shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current text-slate-950" />
                    XEM VIDEO NGAY
                  </button>

                  <button
                    onClick={handleOpenExportFolder}
                    className="py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                    title="Mở thư mục chứa file trong Windows Explorer"
                  >
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                    Mở Thư Mục Video
                  </button>
                </div>

                {/* Các Nút Phụ */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={handlePlayExternal}
                    className="flex-1 min-w-[130px] py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-[11px] font-medium border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition"
                    title="Mở phát bằng ứng dụng video mặc định của Windows"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    Windows Player
                  </button>

                  {renderOutputPath && (
                    <a
                      href={`/media/stream?path=${encodeURIComponent(renderOutputPath)}`}
                      download={renderOutputPath.split(/[\\/]/).pop()}
                      className="flex-1 min-w-[120px] py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-[11px] font-medium border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition text-center"
                      title="Tải video MP4 trực tiếp về máy qua trình duyệt"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      Tải File MP4
                    </a>
                  )}

                  <button
                    onClick={() => setRendering(false)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-[11px] font-medium border border-slate-800 cursor-pointer transition"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}

            {/* Error Actions */}
            {renderMessage.startsWith('Render thất bại') && (
              <div className="mt-6 pt-3">
                <button
                  onClick={() => setRendering(false)}
                  className="px-6 py-2.5 bg-red-900/60 hover:bg-red-800 text-red-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Đóng Thông Báo Lỗi
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ PROJECT SOURCE FOOTAGE SELECTOR MODAL ════════ */}
      {showSourceModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
          <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-6 max-w-4xl w-full flex flex-col shadow-2xl relative max-h-[88vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-100 font-montserrat">
                    Chọn Footage Thay Thế Từ Công Trình: {timelineData.projectName}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Bảo toàn 100% thời lượng slot và vị trí trên timeline
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSourceModal(false);
                  setReplacingClipId(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0">
              {/* Stage Filter Buttons */}
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                {['ALL', 'STAGE_1_RAW_CARPENTRY', 'STAGE_2_ASSEMBLY_FINISHING', 'STAGE_3_DECOR_FLOWERS', 'STAGE_4_WORSHIP_ALTAR'].map((st) => {
                  const label = st === 'ALL' ? 'Tất cả' : STAGE_LABELS[st] || st;
                  const isCur = projectSourceStageFilter === st;
                  return (
                    <button
                      key={st}
                      onClick={() => setProjectSourceStageFilter(st)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                        isCur
                          ? 'bg-amber-500 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={projectSourceSearch}
                  onChange={(e) => setProjectSourceSearch(e.target.value)}
                  placeholder="Tìm theo tên file..."
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Source Footage Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              {(() => {
                const pool = (timelineData.availableSources && timelineData.availableSources.length > 0)
                  ? timelineData.availableSources
                  : timelineData.clips.map((c) => ({
                      id: c.sourceId || c.id,
                      projectId: '',
                      fileName: c.fileName,
                      filePath: c.filePath,
                      duration: c.sourceDuration || 5.0,
                      width: 1080,
                      height: 1920,
                      aspectRatioType: c.aspectRatioType,
                      stage: c.stage,
                      aestheticScore: 7.5,
                      sceneDescription: '',
                      thumbnailPath: c.thumbnailPath,
                      mediaType: c.mediaType,
                    }));

                const filtered = pool.filter((src) => {
                  const matchStage = projectSourceStageFilter === 'ALL' || src.stage === projectSourceStageFilter;
                  const matchText = !projectSourceSearch || src.fileName.toLowerCase().includes(projectSourceSearch.toLowerCase());
                  return matchStage && matchText;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-16 text-center text-slate-500 text-xs">
                      Không tìm thấy video hoặc ảnh nào phù hợp bộ lọc.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filtered.map((src, idx) => {
                      const stColor = STAGE_COLORS[src.stage] || '#64748b';
                      const stLabel = STAGE_LABELS[src.stage] || 'N/A';
                      const isImg = src.mediaType === 'image' || isImageFile(src.filePath);

                      return (
                        <div
                          key={idx}
                          onClick={() => handleSelectProjectSource(src)}
                          className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-400 rounded-xl overflow-hidden cursor-pointer group transition shadow-md hover:shadow-amber-500/20 flex flex-col"
                        >
                          {/* Stage bar */}
                          <div className="h-1 w-full" style={{ backgroundColor: stColor }} />

                          {/* Thumbnail */}
                          <div className="h-28 bg-black relative overflow-hidden flex items-center justify-center">
                            {src.thumbnailPath ? (
                              <img
                                src={`/media/thumbnails/${src.thumbnailPath.split(/[\\/]/).pop()}`}
                                alt={src.fileName}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                            ) : (
                              <div className="text-slate-600 text-xs">No Thumb</div>
                            )}

                            {/* Badge type & duration */}
                            <span className="absolute bottom-1 right-1 bg-black/80 font-mono text-[9px] px-1.5 py-0.5 rounded text-amber-300 border border-amber-500/30 font-bold">
                              {isImg ? 'ẢNH' : `${src.duration.toFixed(1)}s`}
                            </span>

                            <span
                              className="absolute top-1 left-1 text-[8px] px-1.5 py-0.5 rounded font-bold text-white shadow"
                              style={{ backgroundColor: stColor }}
                            >
                              {stLabel}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="p-2 flex-1 flex flex-col justify-between">
                            <p className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-amber-300 transition">
                              {src.fileName}
                            </p>
                            <p className="text-[9px] text-slate-500 mt-1 flex items-center justify-between">
                              <span>{src.aspectRatioType || '9:16'}</span>
                              <span className="text-amber-400/80 font-medium group-hover:underline">Chọn clip này ➔</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between text-xs flex-shrink-0">
              <span className="text-slate-500 text-[11px]">
                💡 Tip: Bạn cũng có thể bấm "Đổi từ máy tính" để chọn file bất kỳ ngoài công trình.
              </span>
              <button
                onClick={() => {
                  setShowSourceModal(false);
                  setReplacingClipId(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-bold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ FULL VIDEO PREVIEW MODAL ════════ */}
      {showVideoModal && renderOutputPath && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
          <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-5 max-w-2xl w-full flex flex-col items-center shadow-2xl relative max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <h4 className="text-sm font-bold text-slate-100 font-montserrat truncate max-w-md">
                  Xem Video Hoàn Chỉnh: {renderOutputPath.split(/[\\/]/).pop()}
                </h4>
              </div>
              <button
                onClick={() => setShowVideoModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer flex-shrink-0"
                title="Đóng xem video"
              >
                ✕
              </button>
            </div>

            {/* Video Player 9:16 */}
            <div className="relative flex-1 min-h-0 w-full flex items-center justify-center py-1">
              <div className="h-full max-h-[66vh] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-amber-500/30 bg-black flex items-center justify-center">
                <video
                  src={`/media/stream?path=${encodeURIComponent(renderOutputPath)}`}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-800 text-xs flex-shrink-0">
              <div className="text-slate-400 text-[11px] truncate max-w-xs font-mono">
                {renderOutputPath}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenExportFolder}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl font-bold flex items-center gap-1.5 border border-amber-500/30 transition cursor-pointer"
                  title="Mở thư mục chứa file trong Windows Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  Mở Thư Mục
                </button>
                <button
                  onClick={handlePlayExternal}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Mở phát bằng ứng dụng video mặc định của Windows"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Windows Player
                </button>
                <a
                  href={`/media/stream?path=${encodeURIComponent(renderOutputPath)}`}
                  download={renderOutputPath.split(/[\\/]/).pop()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Tải video MP4 về máy"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải Về
                </a>
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
