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
  Save,
  Cloud,
  Sliders,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  Plus,
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
import { MainVideoProps, SubtitleLine, TimelineClipItem, SourceClipRecord, SubtitleFontWeight } from '../../remotion/types.js';

export const SUBTITLE_FONTS = [
  { id: 'Lexend', name: 'Lexend', desc: 'Mềm mại, tối ưu đọc phụ đề' },
  { id: 'Be Vietnam Pro', name: 'Be Vietnam Pro', desc: 'Chuẩn tiếng Việt, trang nghiêm' },
  { id: 'Nunito', name: 'Nunito', desc: 'Bo tròn ấm áp, trung tính' },
  { id: 'Montserrat', name: 'Montserrat', desc: 'Hiện đại, đầm chắc, rõ nét' },
  { id: 'Inter', name: 'Inter', desc: 'Chuẩn quốc tế, trung tính tối đa' },
  { id: 'Quicksand', name: 'Quicksand', desc: 'Mềm mại thanh thoát, thư thái' },
];

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
    bgm?: {
      selectedBgm: string;
      bgmVolume: number;
      voiceVolume: number;
    };
    subtitleStyles?: {
      fontSize: number;
      bottomPercent: number;
      fontFamily?: string;
      fontWeight?: SubtitleFontWeight;
      allCaps?: boolean;
    };
  };
  onUpdateClips: (clips: TimelineClipItem[]) => void;
  onUpdateSubtitles: (subtitles: SubtitleLine[]) => void;
  onUpdateVoice?: (voiceInfo: { voicePath: string; voiceUrl: string; duration: number }) => void;
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
// Sortable Clip Item (Pro NLE Style - Tinh Gọn & Trực Quan)
// ───────────────────────────────────────────────────────
interface SortableClipProps {
  clip: TimelineClipItem;
  index: number;
  totalClips: number;
  widthPx: number;
  isSelected?: boolean;
  isResizingThis?: boolean;
  resizingDuration?: number;
  onSelectClip: (id: string) => void;
  onStartResize?: (e: React.PointerEvent, clip: TimelineClipItem, handle: 'left' | 'right') => void;
}

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  totalClips,
  widthPx,
  isSelected,
  isResizingThis,
  resizingDuration,
  onSelectClip,
  onStartResize,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
  });

  const stageColor = STAGE_COLORS[clip.stage] || '#64748b';
  const stageLabel = STAGE_LABELS[clip.stage] || 'N/A';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    width: Math.max(6, widthPx),
    flexShrink: 0,
    opacity: isDragging ? 0.35 : 1,
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
      title={`#${index + 1}: ${clip.fileName} (${clip.sourceDuration.toFixed(1)}s) - ${stageLabel} (Click để chọn & mở Inspector, Kéo 2 cạnh để chỉnh thời lượng)`}
      className={`relative bg-slate-900/95 border rounded-xl flex flex-col overflow-visible group cursor-pointer select-none transition-all ${
        isDragging
          ? 'border-amber-400 ring-2 ring-amber-400/70 shadow-2xl shadow-amber-500/50 scale-[1.02]'
          : isSelected
          ? 'border-amber-400 ring-2 ring-amber-400/90 shadow-xl shadow-amber-500/30 bg-slate-850 scale-[1.01]'
          : 'border-slate-700/80 hover:border-slate-400 hover:shadow-md'
      }`}
    >
      {/* Floating Tooltip khi đang kéo resize */}
      {isResizingThis && resizingDuration !== undefined && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold shadow-xl border border-white/40 whitespace-nowrap pointer-events-none animate-pulse">
          ⏱️ {resizingDuration.toFixed(1)}s
        </div>
      )}

      {/* Stage top accent line */}
      <div className="h-[3px] w-full flex-shrink-0 rounded-t-xl" style={{ backgroundColor: stageColor }} />

      {/* Header index & stage badge (khi chiều rộng >= 30px) */}
      {widthPx >= 30 && (
        <div className="absolute top-1 left-1 z-10 pointer-events-none bg-black/80 backdrop-blur-xs rounded px-1 py-0.5 flex items-center gap-0.5 border border-white/10 shadow-xs">
          {widthPx >= 55 && <GripVertical className="w-2.5 h-2.5 text-amber-400" />}
          <span className={`text-[8px] font-mono font-extrabold ${isSelected ? 'text-yellow-300' : 'text-amber-300'}`}>
            #{index + 1}
          </span>
          {widthPx >= 65 && (
            <span className="text-[7px] text-slate-300 font-sans font-medium truncate max-w-[50px]">
              • {stageLabel}
            </span>
          )}
          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />}
        </div>
      )}

      {/* Thumbnail chính chiếm trọn diện tích */}
      <div className="flex-1 bg-black overflow-hidden relative pointer-events-none rounded-b-xl flex items-center justify-center min-h-[60px]">
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

        {/* Time badge ở góc dưới phải (hiển thị khi chiều rộng >= 38px) */}
        {widthPx >= 38 && (
          <span className="absolute bottom-1 right-1 bg-black/85 backdrop-blur-xs font-mono text-[8.5px] px-1.5 py-[1px] rounded text-amber-300 border border-amber-500/40 font-bold shadow-xs">
            {clip.sourceDuration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Left Resize Handle (Start / Duration) */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartResize?.(e, clip, 'left');
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-0 bottom-0 left-0 w-3.5 hover:w-4 bg-emerald-500/0 hover:bg-emerald-500/30 active:bg-emerald-500/60 z-30 transition-all flex items-center justify-center cursor-ew-resize group/lhandle"
        title="Kéo cạnh trái: Tinh chỉnh điểm bắt đầu (Start)"
      >
        <div className="w-[3.5px] h-7 rounded-full bg-emerald-400 opacity-0 group-hover/lhandle:opacity-100 shadow-lg shadow-emerald-500/60 transition-opacity pointer-events-none" />
      </div>

      {/* Right Resize Handle (Duration / End) */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartResize?.(e, clip, 'right');
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-0 bottom-0 right-0 w-3.5 hover:w-4 bg-amber-500/0 hover:bg-amber-500/30 active:bg-amber-500/60 z-30 transition-all flex items-center justify-center cursor-ew-resize group/rhandle"
        title="Kéo cạnh phải: Kéo dài / Thu ngắn thời lượng clip"
      >
        <div className="w-[3.5px] h-7 rounded-full bg-amber-400 opacity-0 group-hover/rhandle:opacity-100 shadow-lg shadow-amber-500/60 transition-opacity pointer-events-none" />
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
  onUpdateVoice,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const fileInputVoiceRef = useRef<HTMLInputElement | null>(null);

  // Player playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Audio settings (khôi phục từ timelineData nếu có)
  const [voiceVolume, setVoiceVolume] = useState<number>(timelineData.bgm?.voiceVolume ?? 1.0);
  const [bgmVolume, setBgmVolume] = useState<number>(timelineData.bgm?.bgmVolume ?? 0.15);
  const [selectedBgm, setSelectedBgm] = useState<string>(timelineData.bgm?.selectedBgm ?? '');
  const [bgmList, setBgmList] = useState<{ name: string; fileName: string; filePath: string }[]>([]);

  // Subtitle editing & interactive resize/move state
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [subDragState, setSubDragState] = useState<{
    subId: string;
    handle: 'left' | 'right' | 'move';
    startX: number;
    origStart: number;
    origEnd: number;
    currentStart: number;
    currentEnd: number;
  } | null>(null);

  // Subtitle custom size, position & font styles state (khôi phục từ timelineData nếu có, hoặc localStorage, hoặc mặc định)
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(() => {
    if (timelineData.subtitleStyles?.fontSize) return timelineData.subtitleStyles.fontSize;
    const saved = localStorage.getItem('auto_video_subtitle_fontsize');
    return saved ? Number(saved) : 65;
  });
  const [subtitleBottomPercent, setSubtitleBottomPercent] = useState<number>(() => {
    if (timelineData.subtitleStyles?.bottomPercent) return timelineData.subtitleStyles.bottomPercent;
    const saved = localStorage.getItem('auto_video_subtitle_bottom_percent');
    return saved ? Number(saved) : 22;
  });
  const [subtitleFontFamily, setSubtitleFontFamily] = useState<string>(() => {
    if (timelineData.subtitleStyles?.fontFamily) return timelineData.subtitleStyles.fontFamily;
    const saved = localStorage.getItem('auto_video_subtitle_font_family');
    return saved || 'Lexend';
  });
  const [subtitleFontWeight, setSubtitleFontWeight] = useState<SubtitleFontWeight>(() => {
    if (timelineData.subtitleStyles?.fontWeight) return timelineData.subtitleStyles.fontWeight;
    const saved = localStorage.getItem('auto_video_subtitle_font_weight');
    return (saved as SubtitleFontWeight) || 'bold';
  });
  const [subtitleAllCaps, setSubtitleAllCaps] = useState<boolean>(() => {
    if (timelineData.subtitleStyles?.allCaps !== undefined) return timelineData.subtitleStyles.allCaps;
    const saved = localStorage.getItem('auto_video_subtitle_all_caps');
    return saved !== null ? saved === 'true' : true;
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

  const handleFontFamilyChange = (font: string) => {
    setSubtitleFontFamily(font);
    localStorage.setItem('auto_video_subtitle_font_family', font);
  };

  const handleFontWeightChange = (weight: SubtitleFontWeight) => {
    setSubtitleFontWeight(weight);
    localStorage.setItem('auto_video_subtitle_font_weight', weight);
  };

  const handleAllCapsChange = (allCaps: boolean) => {
    setSubtitleAllCaps(allCaps);
    localStorage.setItem('auto_video_subtitle_all_caps', String(allCaps));
  };

  const handleResetSubtitleStyles = () => {
    setSubtitleFontSize(65);
    setSubtitleBottomPercent(22);
    setSubtitleFontFamily('Lexend');
    setSubtitleFontWeight('bold');
    setSubtitleAllCaps(true);
    localStorage.setItem('auto_video_subtitle_fontsize', '65');
    localStorage.setItem('auto_video_subtitle_bottom_percent', '22');
    localStorage.setItem('auto_video_subtitle_font_family', 'Lexend');
    localStorage.setItem('auto_video_subtitle_font_weight', 'bold');
    localStorage.setItem('auto_video_subtitle_all_caps', 'true');
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

  // Local available sources state (đồng bộ với availableSources từ timelineData)
  const [localAvailableSources, setLocalAvailableSources] = useState<SourceClipRecord[]>(
    timelineData.availableSources || []
  );

  useEffect(() => {
    if (timelineData.availableSources) {
      setLocalAvailableSources(timelineData.availableSources);
    }
  }, [timelineData.availableSources]);

  // Delete Source Confirmation Modal state
  const [deleteSourceModal, setDeleteSourceModal] = useState<{
    isOpen: boolean;
    filePath: string;
    fileName: string;
    thumbnailPath?: string;
    stage?: string;
    sourceId?: string;
    clipId?: string;
    isDeleting: boolean;
  }>({
    isOpen: false,
    filePath: '',
    fileName: '',
    isDeleting: false,
  });

  // Trim Source Video Modal state
  const [trimModal, setTrimModal] = useState<{
    isOpen: boolean;
    clipId?: string;
    sourceId?: string;
    filePath: string;
    fileName: string;
    totalDuration: number;
    startTime: number;
    endTime: number;
    currentTime: number;
    isPlaying: boolean;
    isTrimming: boolean;
  }>({
    isOpen: false,
    filePath: '',
    fileName: '',
    totalDuration: 5.0,
    startTime: 0,
    endTime: 5.0,
    currentTime: 0,
    isPlaying: false,
    isTrimming: false,
  });

  const trimmerVideoRef = useRef<HTMLVideoElement>(null);


  // Notification Toast state
  const [notificationToast, setNotificationToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ show: false, message: '', type: 'info' });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotificationToast({ show: true, message, type });
    setTimeout(() => {
      setNotificationToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  }, []);

  // ── Auto-save Project state & logic ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstMountRef = useRef(true);

  // Tự động tính toán voiceUrl chuẩn xác
  const resolvedVoiceUrl = useMemo(() => {
    if (timelineData.voiceUrl && timelineData.voiceUrl.trim()) return timelineData.voiceUrl;
    if (timelineData.voicePath && timelineData.voicePath.trim()) {
      return `/media/stream?path=${encodeURIComponent(timelineData.voicePath)}`;
    }
    return undefined;
  }, [timelineData.voiceUrl, timelineData.voicePath]);

  // ── Tính năng nghe thử âm thanh Voice trực tiếp (Mở khóa âm thanh trình duyệt) ──
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [voiceFileMissing, setVoiceFileMissing] = useState(false);
  const audioTestRef = useRef<HTMLAudioElement | null>(null);

  const handleTestAudioSnippet = useCallback(() => {
    if (!resolvedVoiceUrl || !timelineData.voicePath) {
      setVoiceFileMissing(true);
      showToast('Không tìm thấy đường dẫn file voice!', 'error');
      return;
    }
    try {
      if (audioTestRef.current) {
        audioTestRef.current.pause();
        audioTestRef.current = null;
      }
      const a = new Audio(resolvedVoiceUrl);
      a.volume = voiceVolume;
      audioTestRef.current = a;
      setIsTestingAudio(true);
      a.play().then(() => {
        setVoiceFileMissing(false);
        setTimeout(() => {
          if (audioTestRef.current) {
            audioTestRef.current.pause();
            audioTestRef.current = null;
          }
          setIsTestingAudio(false);
        }, 3000);
      }).catch((err) => {
        console.warn('[TestAudio] Play error:', err);
        setIsTestingAudio(false);
        setVoiceFileMissing(true);
        showToast('⚠️ Không tìm thấy file âm thanh Voice trên máy! Vui lòng bấm [Đổi Voice] để chọn lại file trên máy.', 'error');
      });
    } catch (e: any) {
      setIsTestingAudio(false);
      setVoiceFileMissing(true);
      showToast('Lỗi: ' + e.message, 'error');
    }
  }, [resolvedVoiceUrl, timelineData.voicePath, voiceVolume, showToast]);

  // ── Đổi / Nạp lại file Voice trên máy ──
  const applyNewVoiceFile = useCallback(async (newFilePath: string) => {
    try {
      showToast('Đang liên kết lại file Voice...', 'info');
      const res = await fetch('/api/generator/relink-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: timelineData.projectId,
          voicePath: timelineData.voicePath,
          newFilePath,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setVoiceFileMissing(false);
        onUpdateVoice?.({
          voicePath: data.data.filePath,
          voiceUrl: data.data.voiceUrl,
          duration: data.data.duration || timelineData.duration,
        });
        showToast('✅ Đã cập nhật file Voice thành công! Âm thanh đã sẵn sàng.', 'success');
      } else {
        showToast(data.error || 'Lỗi liên kết file voice', 'error');
      }
    } catch (err: any) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }, [timelineData.projectId, timelineData.voicePath, timelineData.duration, onUpdateVoice, showToast]);

  const handleChangeVoiceFile = useCallback(async () => {
    try {
      const res = await fetch('/api/generator/pick-voice', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.file?.filePath) {
        await applyNewVoiceFile(data.file.filePath);
        return;
      }
      if (data.cancelled) return;
    } catch (_) {}
    fileInputVoiceRef.current?.click();
  }, [applyNewVoiceFile]);

  const handleUploadVoiceFileFallback = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('voice', file);
    try {
      showToast('Đang nạp file voice từ trình duyệt...', 'info');
      const res = await fetch('/api/generator/upload-voice', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.file?.filePath) {
        await applyNewVoiceFile(data.file.filePath);
      } else {
        showToast(data.error || 'Lỗi tải file', 'error');
      }
    } catch (err: any) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }, [applyNewVoiceFile, showToast]);

  // Hàm thực thi lưu toàn bộ dự án vào CSDL SQLite
  const executeSaveProject = useCallback(async (isManual = false) => {
    if (!timelineData.voicePath) return;
    setSaveStatus('saving');
    try {
      const fullProjectPayload = {
        projectId: timelineData.projectId,
        projectName: timelineData.projectName,
        voicePath: timelineData.voicePath,
        voiceUrl: resolvedVoiceUrl,
        duration: voiceDuration,
        subtitles: timelineData.subtitles,
        clips: timelineData.clips,
        availableSources: localAvailableSources,
        outro: {
          filePath: outroPath,
          fileName: outroFileName,
          duration: outroDuration,
          enabled: outroEnabled,
        },
        bgm: {
          selectedBgm,
          bgmVolume,
          voiceVolume,
        },
        subtitleStyles: {
          fontSize: subtitleFontSize,
          bottomPercent: subtitleBottomPercent,
          fontFamily: subtitleFontFamily,
          fontWeight: subtitleFontWeight,
          allCaps: subtitleAllCaps,
        },
      };

      const res = await fetch('/api/generator/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePath: timelineData.voicePath,
          timelineData: fullProjectPayload,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveStatus('saved');
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
        if (isManual) {
          showToast(`Đã lưu toàn bộ dự án thành công lúc ${timeStr}`, 'success');
        }
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('[AutoSave] Error:', err);
      setSaveStatus('error');
    }
  }, [
    timelineData.projectId,
    timelineData.projectName,
    timelineData.voicePath,
    timelineData.voiceUrl,
    timelineData.duration,
    timelineData.subtitles,
    timelineData.clips,
    localAvailableSources,
    outroPath,
    outroFileName,
    outroDuration,
    outroEnabled,
    selectedBgm,
    bgmVolume,
    voiceVolume,
    subtitleFontSize,
    subtitleBottomPercent,
    subtitleFontFamily,
    subtitleFontWeight,
    subtitleAllCaps,
    showToast,
  ]);

  // Hook tự động lưu ngầm Debounce 800ms khi có bất kỳ thay đổi nào
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      executeSaveProject(false);
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    timelineData.clips,
    timelineData.subtitles,
    localAvailableSources,
    selectedBgm,
    bgmVolume,
    voiceVolume,
    subtitleFontSize,
    subtitleBottomPercent,
    outroEnabled,
    outroPath,
    outroDuration,
    executeSaveProject,
  ]);



  // Render job states
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderPercent, setRenderPercent] = useState<number>(0);
  const [renderMessage, setRenderMessage] = useState<string>('');
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState<boolean>(false);

  // Active Tab trên Sidebar bên phải ('clip' | 'subtitle' | 'project')
  const [activeRightTab, setActiveRightTab] = useState<'clip' | 'subtitle' | 'project'>('project');

  // Khi chọn clip -> Tự động chuyển tab sang 'clip' (Clip Inspector)
  useEffect(() => {
    if (selectedClipId) {
      setActiveRightTab('clip');
      setSelectedSubId(null);
    }
  }, [selectedClipId]);

  // Khi chọn phụ đề -> Tự động chuyển tab sang 'subtitle' (Subtitle Inspector)
  useEffect(() => {
    if (selectedSubId) {
      setActiveRightTab('subtitle');
      setSelectedClipId(null);
    }
  }, [selectedSubId]);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Active clip dragging state for DragOverlay
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // Playhead state
  const [currentFrame, setCurrentFrame] = useState<number>(0);

  // Drag pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, scrollLeft: 0 });

  // Clip Resizing State (Kéo Cạnh Trái / Phải)
  const [resizingState, setResizingState] = useState<{
    clipId: string;
    handle: 'left' | 'right';
    startX: number;
    initialDuration: number;
    initialSourceStart: number;
    maxDuration: number;
    rawFileDuration: number;
    currentDuration: number;
    currentSourceStart: number;
  } | null>(null);

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
  // Tính toán voiceDuration an toàn tuyệt đối: timelineData.duration -> clip max end -> 30s
  const voiceDuration = useMemo(() => {
    if (timelineData.duration && !isNaN(Number(timelineData.duration)) && Number(timelineData.duration) > 0) {
      return Number(timelineData.duration);
    }
    if (timelineData.clips && timelineData.clips.length > 0) {
      const maxEnd = Math.max(...timelineData.clips.map((c) => c.timelineEnd || 0));
      if (maxEnd > 0) return Number(maxEnd.toFixed(2));
    }
    return 30.0;
  }, [timelineData.duration, timelineData.clips]);

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
      try {
        if (playerRef.current.isMuted()) {
          playerRef.current.unmute();
        }
        playerRef.current.setVolume(1.0);
      } catch (_) {}
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

  // ── Helper: Cân bằng & Tự bù clip giữ chuẩn 4.0s - 5.5s (No-Freeze Frame) trong phạm vi Voice ──
  const rebalanceClips = useCallback(
    (clips: TimelineClipItem[]): TimelineClipItem[] => {
      const total = voiceDuration;
      if (total <= 0) return clips;

      const idealClipDur = 5.0;
      const pool = (localAvailableSources && localAvailableSources.length > 0)
        ? localAvailableSources
        : (timelineData.availableSources && timelineData.availableSources.length > 0)
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

      let workingClips = [...clips];
      if (workingClips.length === 0 && pool.length > 0) {
        workingClips = pool.slice(0, 1).map((src) => ({
          id: `clip_${Date.now()}`,
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
        }));
      }

      const resultClips: TimelineClipItem[] = [];
      let curTime = 0;
      let poolIdx = 0;
      const videoUsageCount: Record<string, number> = {};
      let maxIter = 200;

      while (curTime < total - 0.05 && maxIter-- > 0) {
        const remaining = Number((total - curTime).toFixed(2));
        if (remaining <= 0.05) break;

        // Ưu tiên lấy clip từ workingClips nếu có, nếu hết thì lấy từ pool
        let baseClip: TimelineClipItem;
        if (resultClips.length < workingClips.length) {
          baseClip = workingClips[resultClips.length];
        } else {
          const src = pool[poolIdx % pool.length];
          poolIdx++;
          baseClip = {
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
          };
        }

        const isImg = baseClip.mediaType === 'image' || isImageFile(baseClip.filePath);
        const srcMatch = pool.find((p) => p.id === baseClip.sourceId || p.filePath === baseClip.filePath);
        const rawVideoDur = srcMatch?.duration || baseClip.sourceDuration || 5.0;

        let clipDur = idealClipDur;
        let srcStart = 0;

        if (isImg) {
          clipDur = Math.min(remaining, idealClipDur);
          srcStart = 0;
        } else {
          if (rawVideoDur <= 4.0) {
            // [NO-FREEZE]: Video ngắn dùng đúng thời lượng thật
            clipDur = Math.min(remaining, rawVideoDur);
            srcStart = 0;
          } else {
            let targetSlice = idealClipDur;
            if (remaining <= 5.5) {
              targetSlice = remaining;
            } else if (remaining < idealClipDur + 4.0) {
              targetSlice = remaining / 2;
            }

            const maxStart = Math.max(0, rawVideoDur - targetSlice);
            if (maxStart > 0) {
              const usageIndex = videoUsageCount[baseClip.filePath] || 0;
              videoUsageCount[baseClip.filePath] = usageIndex + 1;
              srcStart = (usageIndex * targetSlice) % (maxStart + 0.1);
              if (srcStart > maxStart) srcStart = maxStart;
            } else {
              srcStart = 0;
            }

            const maxAvailable = rawVideoDur - srcStart;
            clipDur = Math.min(remaining, targetSlice, maxAvailable);
          }
        }

        clipDur = Math.max(0.5, Number(clipDur.toFixed(2)));

        resultClips.push({
          ...baseClip,
          timelineStart: Number(curTime.toFixed(2)),
          timelineEnd: Number((curTime + clipDur).toFixed(2)),
          sourceStart: Number(srcStart.toFixed(2)),
          sourceDuration: Number(clipDur.toFixed(2)),
        });

        curTime += clipDur;
      }

      // Khớp chính xác 100% total
      if (resultClips.length > 0) {
        const last = resultClips[resultClips.length - 1];
        last.timelineEnd = Number(total.toFixed(2));
        last.sourceDuration = Number((last.timelineEnd - last.timelineStart).toFixed(2));
      }

      return resultClips;
    },
    [voiceDuration, localAvailableSources, timelineData.availableSources]
  );

  // ── Helper: recalculate sequential timeline positions after simple drag/move ──
  const recalcTimelinePositions = useCallback(
    (clips: TimelineClipItem[]): TimelineClipItem[] => {
      const total = voiceDuration;
      if (total <= 0 || clips.length === 0) return clips;

      const totalCurrentDuration = clips.reduce((sum, c) => sum + (c.sourceDuration || 5.0), 0);
      const ratio = totalCurrentDuration > 0 ? total / totalCurrentDuration : 1.0;

      let curTime = 0;
      return clips.map((c, i) => {
        const isLast = i === clips.length - 1;
        const rawDur = (c.sourceDuration || 5.0) * ratio;
        const thisDur = isLast ? Math.max(0.1, total - curTime) : rawDur;

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

  // ── Resize / Kéo Dài / Thu Ngắn Clip (Ripple Push Engine) ──
  const handleResizeClip = useCallback(
    (clipId: string, newDuration: number, newSourceStart?: number) => {
      const clips = [...timelineData.clips];
      const targetIdx = clips.findIndex((c) => c.id === clipId);
      if (targetIdx === -1) return;

      const targetClip = clips[targetIdx];
      const srcMatch = localAvailableSources.find((p) => p.id === targetClip.sourceId || p.filePath === targetClip.filePath);
      const isImg = targetClip.mediaType === 'image' || isImageFile(targetClip.filePath);
      const rawFileDur = isImg ? voiceDuration : (srcMatch?.duration || targetClip.sourceDuration || 5.0);

      const maxDur = isImg ? voiceDuration : Math.max(0.5, rawFileDur - (newSourceStart ?? targetClip.sourceStart ?? 0));
      const clampedDur = Math.max(0.5, Math.min(maxDur, Number(newDuration.toFixed(2))));
      const clampedSourceStart =
        newSourceStart !== undefined
          ? Math.max(0, Math.min(rawFileDur - 0.5, Number(newSourceStart.toFixed(2))))
          : targetClip.sourceStart;

      // Cập nhật target clip
      clips[targetIdx] = {
        ...targetClip,
        sourceDuration: clampedDur,
        sourceStart: clampedSourceStart,
      };

      // Ripple push: Tính toán lại timelineStart & timelineEnd tuần tự
      let curTime = 0;
      for (let i = 0; i < targetIdx; i++) {
        clips[i] = {
          ...clips[i],
          timelineStart: Number(curTime.toFixed(2)),
          timelineEnd: Number((curTime + clips[i].sourceDuration).toFixed(2)),
        };
        curTime += clips[i].sourceDuration;
      }

      clips[targetIdx] = {
        ...clips[targetIdx],
        timelineStart: Number(curTime.toFixed(2)),
        timelineEnd: Number((curTime + clampedDur).toFixed(2)),
      };
      curTime += clampedDur;

      // Dời các clip phía sau
      const laterClips: TimelineClipItem[] = [];
      for (let i = targetIdx + 1; i < clips.length; i++) {
        if (curTime < voiceDuration - 0.05) {
          const remaining = Number((voiceDuration - curTime).toFixed(2));
          const cDur = Math.min(clips[i].sourceDuration, remaining);
          if (cDur >= 0.3) {
            laterClips.push({
              ...clips[i],
              timelineStart: Number(curTime.toFixed(2)),
              timelineEnd: Number((curTime + cDur).toFixed(2)),
              sourceDuration: Number(cDur.toFixed(2)),
            });
            curTime += cDur;
          }
        }
      }

      let resultClips = [...clips.slice(0, targetIdx + 1), ...laterClips];

      // Nếu thiếu thời gian so với Voice (khi thu ngắn clip)
      if (curTime < voiceDuration - 0.05) {
        const diff = Number((voiceDuration - curTime).toFixed(2));
        if (resultClips.length > 0) {
          const lastClip = resultClips[resultClips.length - 1];
          const lastSrc = localAvailableSources.find((p) => p.id === lastClip.sourceId || p.filePath === lastClip.filePath);
          const lastIsImg = lastClip.mediaType === 'image' || isImageFile(lastClip.filePath);
          const lastMax = lastIsImg ? voiceDuration : (lastSrc?.duration || lastClip.sourceDuration || 5.0) - (lastClip.sourceStart || 0);

          if (lastClip.sourceDuration + diff <= lastMax + 0.1) {
            resultClips[resultClips.length - 1] = {
              ...lastClip,
              timelineEnd: Number(voiceDuration.toFixed(2)),
              sourceDuration: Number((voiceDuration - lastClip.timelineStart).toFixed(2)),
            };
          } else {
            const availableExtra = Math.max(0, lastMax - lastClip.sourceDuration);
            if (availableExtra > 0.3) {
              resultClips[resultClips.length - 1] = {
                ...lastClip,
                sourceDuration: Number((lastClip.sourceDuration + availableExtra).toFixed(2)),
                timelineEnd: Number((lastClip.timelineStart + lastClip.sourceDuration + availableExtra).toFixed(2)),
              };
              curTime += availableExtra;
            }
            if (curTime < voiceDuration - 0.05 && localAvailableSources.length > 0) {
              const fillSrc = localAvailableSources[(targetIdx + 1) % localAvailableSources.length];
              const fillIsImg = fillSrc.mediaType === 'image' || isImageFile(fillSrc.filePath);
              const fillDur = Number((voiceDuration - curTime).toFixed(2));
              resultClips.push({
                id: `clip_fill_${Date.now()}`,
                sourceId: fillSrc.id,
                fileName: fillSrc.fileName,
                filePath: fillSrc.filePath,
                thumbnailPath: fillSrc.thumbnailPath,
                stage: fillSrc.stage,
                timelineStart: Number(curTime.toFixed(2)),
                timelineEnd: Number(voiceDuration.toFixed(2)),
                sourceStart: 0,
                sourceDuration: fillDur,
                aspectRatioType: fillSrc.aspectRatioType,
                mediaType: fillSrc.mediaType || (fillIsImg ? 'image' : 'video'),
              });
            } else if (resultClips.length > 0) {
              resultClips[resultClips.length - 1].timelineEnd = Number(voiceDuration.toFixed(2));
              resultClips[resultClips.length - 1].sourceDuration = Number((voiceDuration - resultClips[resultClips.length - 1].timelineStart).toFixed(2));
            }
          }
        }
      } else if (resultClips.length > 0) {
        resultClips[resultClips.length - 1].timelineEnd = Number(voiceDuration.toFixed(2));
        resultClips[resultClips.length - 1].sourceDuration = Number((voiceDuration - resultClips[resultClips.length - 1].timelineStart).toFixed(2));
      }

      onUpdateClips(resultClips);
    },
    [timelineData.clips, localAvailableSources, voiceDuration, onUpdateClips]
  );

  // ── Clip Resizing Interaction Handlers ──
  const handleStartResize = useCallback(
    (e: React.PointerEvent, clip: TimelineClipItem, handle: 'left' | 'right') => {
      const srcMatch = localAvailableSources.find((p) => p.id === clip.sourceId || p.filePath === clip.filePath);
      const isImg = clip.mediaType === 'image' || isImageFile(clip.filePath);
      const rawFileDuration = isImg ? voiceDuration : (srcMatch?.duration || clip.sourceDuration || 5.0);
      const maxDuration = isImg ? voiceDuration : Math.max(0.5, rawFileDuration - (clip.sourceStart || 0));

      setResizingState({
        clipId: clip.id,
        handle,
        startX: e.clientX,
        initialDuration: clip.sourceDuration,
        initialSourceStart: clip.sourceStart || 0,
        maxDuration,
        rawFileDuration,
        currentDuration: clip.sourceDuration,
        currentSourceStart: clip.sourceStart || 0,
      });
    },
    [localAvailableSources, voiceDuration]
  );

  useEffect(() => {
    if (!resizingState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - resizingState.startX;
      const deltaSec = deltaX / pxPerSec;

      if (resizingState.handle === 'right') {
        const newDur = Math.max(0.5, Math.min(resizingState.maxDuration, resizingState.initialDuration + deltaSec));
        setResizingState((prev) => (prev ? { ...prev, currentDuration: Number(newDur.toFixed(2)) } : null));
      } else {
        const newStart = Math.max(0, Math.min(resizingState.rawFileDuration - 0.5, resizingState.initialSourceStart + deltaSec));
        const diff = resizingState.initialSourceStart - newStart;
        const newDur = Math.max(0.5, Math.min(resizingState.rawFileDuration - newStart, resizingState.initialDuration + diff));
        setResizingState((prev) =>
          prev
            ? {
                ...prev,
                currentSourceStart: Number(newStart.toFixed(2)),
                currentDuration: Number(newDur.toFixed(2)),
              }
            : null
        );
      }
    };

    const handlePointerUp = () => {
      if (resizingState) {
        handleResizeClip(resizingState.clipId, resizingState.currentDuration, resizingState.currentSourceStart);
        setResizingState(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizingState, pxPerSec, handleResizeClip]);

  // ── Tự động chuẩn hóa lại clips & chữa lành thời lượng vượt quá file thực tế (No-Freeze) ──
  useEffect(() => {
    if (!timelineData.clips || timelineData.clips.length === 0 || voiceDuration <= 0) return;
    const pool = (localAvailableSources && localAvailableSources.length > 0)
      ? localAvailableSources
      : (timelineData.availableSources && timelineData.availableSources.length > 0)
      ? timelineData.availableSources
      : [];

    let hasInvalidClips = false;
    const sanitizedClips = timelineData.clips.map((c) => {
      const isImg = c.mediaType === 'image' || isImageFile(c.filePath);
      const srcMatch = pool.find((p) => p.id === c.sourceId || p.filePath === c.filePath);
      let thumb = c.thumbnailPath;
      if (!thumb && srcMatch?.thumbnailPath) {
        thumb = srcMatch.thumbnailPath;
        hasInvalidClips = true;
      }

      if (!isImg && srcMatch && srcMatch.duration > 0) {
        const maxAvail = Math.max(0.5, srcMatch.duration - (c.sourceStart || 0));
        if (c.sourceDuration > maxAvail + 0.1) {
          hasInvalidClips = true;
        }
      }
      return {
        ...c,
        thumbnailPath: thumb || c.thumbnailPath,
      };
    });

    const currentSum = sanitizedClips.reduce((acc, c) => acc + (c.sourceDuration || 0), 0);
    if (hasInvalidClips || Math.abs(currentSum - voiceDuration) > 0.15) {
      onUpdateClips(rebalanceClips(sanitizedClips));
    }
  }, [voiceDuration, localAvailableSources, timelineData.availableSources, rebalanceClips, onUpdateClips]);

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

    // 1. Tự động chuyển đúng tab Giai đoạn của clip đang chọn
    const targetClip = timelineData.clips.find((c) => c.id === clipId);
    if (targetClip && targetClip.stage) {
      setProjectSourceStageFilter(targetClip.stage);
    }

    // 2. Mở modal chọn source
    setShowSourceModal(true);

    // 3. Tải và đồng bộ danh sách footage mới nhất kèm usage_count từ database
    const projId = timelineData.projectId || '';
    fetch(`/api/library/sources?projectId=${encodeURIComponent(projId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setLocalAvailableSources(data.data);
        }
      })
      .catch((err) => {
        console.warn('[TimelineEditor] Could not refresh project sources:', err);
      });
  }, [timelineData.clips, timelineData.projectId]);

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

      // Cập nhật tăng usageCount tức thì trong bộ nhớ localAvailableSources
      setLocalAvailableSources((prev) =>
        prev.map((s) => (s.id === source.id || s.filePath === source.filePath ? { ...s, usageCount: (s.usageCount || 0) + 1 } : s))
      );

      // Gửi request cập nhật vĩnh viễn trong CSDL SQLite
      fetch('/api/library/increment-source-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          filePath: source.filePath,
        }),
      }).catch((err) => console.warn('[TimelineEditor] Failed to increment source usage:', err));

      setShowSourceModal(false);
      setReplacingClipId(null);
    },
    [replacingClipId, timelineData.clips, onUpdateClips]
  );

  // ── Mở modal xác nhận xóa source gốc từ Clip đang chọn trên Timeline ──
  const handleRequestDeleteSelectedClipSource = useCallback(() => {
    if (!selectedClipId) return;
    const clip = timelineData.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    setDeleteSourceModal({
      isOpen: true,
      filePath: clip.filePath,
      fileName: clip.fileName,
      thumbnailPath: clip.thumbnailPath,
      stage: clip.stage,
      sourceId: clip.sourceId,
      clipId: clip.id,
      isDeleting: false,
    });
  }, [selectedClipId, timelineData.clips]);

  // ── Mở modal xác nhận xóa source gốc từ Modal chọn Source công trình ──
  const handleRequestDeleteSourceFromModal = useCallback((source: SourceClipRecord) => {
    setDeleteSourceModal({
      isOpen: true,
      filePath: source.filePath,
      fileName: source.fileName,
      thumbnailPath: source.thumbnailPath,
      stage: source.stage,
      sourceId: source.id,
      isDeleting: false,
    });
  }, []);

  // ── Thực thi xóa vĩnh viễn trên backend & Tự động thay thế footage trên Timeline ──
  const handleExecuteDeleteSource = useCallback(async () => {
    const { filePath, sourceId } = deleteSourceModal;
    if (!filePath && !sourceId) return;

    setDeleteSourceModal((prev) => ({ ...prev, isDeleting: true }));

    try {
      const res = await fetch('/api/library/delete-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath,
          sourceId,
          projectId: timelineData.projectId,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Lỗi khi xóa file');
      }

      // 1. Cập nhật danh sách localAvailableSources loại bỏ file bị xóa
      const updatedPool = localAvailableSources.filter(
        (s) => s.filePath !== filePath && s.id !== sourceId
      );
      setLocalAvailableSources(updatedPool);

      // 2. Thay thế toàn bộ các clip trên timeline đang dùng file bị xóa
      const fallbackPool =
        updatedPool.length > 0
          ? updatedPool
          : timelineData.clips.filter((c) => c.filePath !== filePath && c.sourceId !== sourceId);

      let replacedCount = 0;
      const newClips = timelineData.clips.map((c, idx) => {
        if (c.filePath === filePath || (sourceId && c.sourceId === sourceId)) {
          replacedCount++;
          // Tìm clip cùng stage trong pool nếu có, nếu không lấy clip bất kỳ khác
          const sameStage = fallbackPool.filter((s) => (s.stage || '') === (c.stage || ''));
          const candidateList = sameStage.length > 0 ? sameStage : fallbackPool;
          const substitute = candidateList.length > 0 ? candidateList[idx % candidateList.length] : null;

          if (substitute) {
            return {
              ...c,
              sourceId: substitute.id,
              fileName: substitute.fileName,
              filePath: substitute.filePath,
              thumbnailPath: substitute.thumbnailPath || c.thumbnailPath,
              mediaType: substitute.mediaType || (isImageFile(substitute.filePath) ? 'image' : 'video'),
              aspectRatioType: substitute.aspectRatioType || '9:16',
              stage: substitute.stage || c.stage,
              // Giữ nguyên timelineStart, timelineEnd, sourceDuration!
            };
          }
        }
        return c;
      });

      onUpdateClips(newClips);
      setDeleteSourceModal({ isOpen: false, filePath: '', fileName: '', isDeleting: false });
      showToast(
        `Đã xóa vĩnh viễn "${deleteSourceModal.fileName}" và tự động thay thế footage trên Timeline!`,
        'success'
      );
    } catch (err: any) {
      console.error('[DeleteSource] Error deleting source:', err);
      showToast(`Lỗi xóa file: ${err.message}`, 'error');
      setDeleteSourceModal((prev) => ({ ...prev, isDeleting: false }));
    }
  }, [
    deleteSourceModal,
    timelineData.projectId,
    timelineData.clips,
    localAvailableSources,
    onUpdateClips,
    showToast,
  ]);

  // ── Mở modal cắt video nguồn gốc 2 đầu từ Clip đang chọn trên Timeline ──
  const handleOpenTrimSourceModal = useCallback(() => {
    if (!selectedClipId) return;
    const clip = timelineData.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    if (clip.mediaType === 'image' || isImageFile(clip.filePath)) {
      showToast('File ảnh tĩnh không thể cắt theo thời gian.', 'info');
      return;
    }

    // Lấy full duration từ pool hoặc clip
    const srcInPool = localAvailableSources.find(
      (s) => s.id === clip.sourceId || s.filePath === clip.filePath
    );
    const fullDuration = srcInPool?.duration || clip.sourceDuration || 10.0;
    const initStart = Math.min(clip.sourceStart || 0, Math.max(0, fullDuration - 1.0));
    const initEnd = Math.min(fullDuration, initStart + (clip.sourceDuration || 5.0));

    setTrimModal({
      isOpen: true,
      clipId: clip.id,
      sourceId: clip.sourceId,
      filePath: clip.filePath,
      fileName: clip.fileName,
      totalDuration: fullDuration,
      startTime: Number(initStart.toFixed(1)),
      endTime: Number(initEnd.toFixed(1)),
      currentTime: Number(initStart.toFixed(1)),
      isPlaying: false,
      isTrimming: false,
    });
  }, [selectedClipId, timelineData.clips, localAvailableSources, showToast]);

  // ── Xem thử / Dừng đoạn cắt video ──
  const handleToggleTrimPreview = useCallback(() => {
    if (!trimmerVideoRef.current) return;
    if (trimModal.isPlaying) {
      trimmerVideoRef.current.pause();
      setTrimModal((prev) => ({ ...prev, isPlaying: false }));
    } else {
      if (
        trimmerVideoRef.current.currentTime < trimModal.startTime ||
        trimmerVideoRef.current.currentTime >= trimModal.endTime - 0.1
      ) {
        trimmerVideoRef.current.currentTime = trimModal.startTime;
      }
      trimmerVideoRef.current.play();
      setTrimModal((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [trimModal.isPlaying, trimModal.startTime, trimModal.endTime]);

  // ── Đồng bộ thời gian khi video xem thử đang phát ──
  const handleTrimTimeUpdate = useCallback(() => {
    if (!trimmerVideoRef.current) return;
    const curr = trimmerVideoRef.current.currentTime;
    setTrimModal((prev) => ({ ...prev, currentTime: curr }));
    if (curr >= trimModal.endTime) {
      trimmerVideoRef.current.pause();
      trimmerVideoRef.current.currentTime = trimModal.startTime;
      setTrimModal((prev) => ({ ...prev, isPlaying: false, currentTime: prev.startTime }));
    }
  }, [trimModal.endTime, trimModal.startTime]);

  // ── Điều chỉnh mốc bắt đầu (In Point) ──
  const handleStartTimeChange = useCallback((val: number) => {
    const newStart = Math.max(0, Math.min(val, trimModal.endTime - 0.5));
    setTrimModal((prev) => ({
      ...prev,
      startTime: Number(newStart.toFixed(1)),
      currentTime: Number(newStart.toFixed(1)),
    }));
    if (trimmerVideoRef.current) {
      trimmerVideoRef.current.currentTime = newStart;
    }
  }, [trimModal.endTime]);

  // ── Điều chỉnh mốc kết thúc (Out Point) ──
  const handleEndTimeChange = useCallback((val: number) => {
    const newEnd = Math.min(trimModal.totalDuration, Math.max(val, trimModal.startTime + 0.5));
    setTrimModal((prev) => ({
      ...prev,
      endTime: Number(newEnd.toFixed(1)),
    }));
  }, [trimModal.totalDuration, trimModal.startTime]);

  // ── Thực thi cắt video vĩnh viễn trên backend ──
  const handleExecuteTrimSource = useCallback(async () => {
    const { filePath, sourceId, startTime, endTime } = trimModal;
    if (!filePath) return;

    setTrimModal((prev) => ({ ...prev, isTrimming: true }));

    try {
      const res = await fetch('/api/library/trim-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath,
          sourceId,
          startTime,
          endTime,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Lỗi khi cắt video');
      }

      const newDur = data.newDuration;
      const newThumb = data.newThumbnailPath;

      // 1. Cập nhật localAvailableSources
      setLocalAvailableSources((prev) =>
        prev.map((s) => {
          if (s.filePath === filePath || (sourceId && s.id === sourceId)) {
            return {
              ...s,
              duration: newDur,
              thumbnailPath: newThumb || s.thumbnailPath,
            };
          }
          return s;
        })
      );

      // 2. Cập nhật các clip trên timeline có dùng file này
      const newClips = timelineData.clips.map((c) => {
        if (c.filePath === filePath || (sourceId && c.sourceId === sourceId)) {
          return {
            ...c,
            sourceStart: 0,
            thumbnailPath: newThumb || c.thumbnailPath,
            // Giữ nguyên vị trí và độ dài slot trên timeline
          };
        }
        return c;
      });

      onUpdateClips(newClips);
      setTrimModal((prev) => ({ ...prev, isOpen: false, isTrimming: false }));
      showToast(
        `Đã cắt vĩnh viễn video "${trimModal.fileName}" (${startTime.toFixed(1)}s ➔ ${endTime.toFixed(1)}s, độ dài mới: ${newDur.toFixed(1)}s)!`,
        'success'
      );
    } catch (err: any) {
      console.error('[TrimSource] Error:', err);
      showToast(`Lỗi cắt video: ${err.message}`, 'error');
      setTrimModal((prev) => ({ ...prev, isTrimming: false }));
    }
  }, [
    trimModal,
    timelineData.clips,
    onUpdateClips,
    showToast,
  ]);



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

  // ── Thêm phụ đề mới tại vị trí vạch Playhead ──
  const handleAddSubtitleAtPlayhead = useCallback(() => {
    const playheadSec = currentFrame / fps;
    const newStart = Number(playheadSec.toFixed(2));
    const newEnd = Number(Math.min(totalDuration, newStart + 3.5).toFixed(2));
    const newId = `sub_${Date.now()}`;
    const defaultText = 'NHẬP PHỤ ĐỀ...';
    const tokens = defaultText.split(/\s+/).filter(Boolean);
    const dur = Math.max(0.2, newEnd - newStart);
    const wordDur = dur / Math.max(1, tokens.length);

    const newSub: SubtitleLine = {
      id: newId,
      start: newStart,
      end: newEnd,
      text: defaultText,
      words: tokens.map((w, i) => ({
        word: w,
        start: Number((newStart + i * wordDur).toFixed(2)),
        end: Number((newStart + (i + 1) * wordDur).toFixed(2)),
      })),
    };

    const newSubs = [...timelineData.subtitles, newSub].sort((a, b) => a.start - b.start);
    onUpdateSubtitles(newSubs);
    setSelectedSubId(newId);
    setSelectedClipId(null);
    setActiveRightTab('subtitle');
    setEditingSubId(newId);
    setEditingSubText(defaultText);
  }, [currentFrame, fps, totalDuration, timelineData.subtitles, onUpdateSubtitles]);

  // ── Cập nhật phụ đề (thời gian hoặc text) ──
  const handleUpdateSubtitle = useCallback(
    (id: string, updates: Partial<SubtitleLine>) => {
      const newSubs = timelineData.subtitles
        .map((sub) => {
          if (sub.id === id) {
            const updated = { ...sub, ...updates };
            const cleanText = (updated.text || '').trim();
            const tokens = cleanText.split(/\s+/).filter(Boolean);
            const dur = Math.max(0.2, updated.end - updated.start);
            const wordDur = dur / Math.max(1, tokens.length);
            return {
              ...updated,
              text: updated.text,
              words: tokens.map((w, i) => ({
                word: w,
                start: Number((updated.start + i * wordDur).toFixed(2)),
                end: Number((updated.start + (i + 1) * wordDur).toFixed(2)),
              })),
            };
          }
          return sub;
        })
        .sort((a, b) => a.start - b.start);

      onUpdateSubtitles(newSubs);
    },
    [timelineData.subtitles, onUpdateSubtitles]
  );

  // ── Xóa câu phụ đề ──
  const handleDeleteSubtitle = useCallback(
    (id: string) => {
      const newSubs = timelineData.subtitles.filter((s) => s.id !== id);
      onUpdateSubtitles(newSubs);
      if (selectedSubId === id) {
        setSelectedSubId(null);
        setActiveRightTab('project');
      }
    },
    [timelineData.subtitles, selectedSubId, onUpdateSubtitles]
  );

  // ── Phát thử câu phụ đề trên Remotion Player ──
  const handlePlaySubtitlePreview = useCallback(
    (start: number) => {
      if (!playerRef.current) return;
      const startFrame = Math.round(start * fps);
      playerRef.current.seekTo(startFrame);
      if (playerRef.current.isMuted()) {
        playerRef.current.unmute();
      }
      playerRef.current.setVolume(1.0);
      playerRef.current.play();
    },
    [fps]
  );

  // ── Xử lý Kéo Thả Trực Quan Co Giãn & Di Chuyển Khối Phụ Đề Trên Track ──
  useEffect(() => {
    if (!subDragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - subDragState.startX;
      const deltaSec = deltaX / pxPerSec;

      if (subDragState.handle === 'left') {
        const newStart = Math.max(
          0,
          Math.min(subDragState.origEnd - 0.3, Number((subDragState.origStart + deltaSec).toFixed(2)))
        );
        setSubDragState((prev) => (prev ? { ...prev, currentStart: newStart } : null));
      } else if (subDragState.handle === 'right') {
        const newEnd = Math.max(
          subDragState.origStart + 0.3,
          Math.min(totalDuration, Number((subDragState.origEnd + deltaSec).toFixed(2)))
        );
        setSubDragState((prev) => (prev ? { ...prev, currentEnd: newEnd } : null));
      } else if (subDragState.handle === 'move') {
        const dur = subDragState.origEnd - subDragState.origStart;
        const rawStart = subDragState.origStart + deltaSec;
        const newStart = Math.max(0, Math.min(totalDuration - dur, Number(rawStart.toFixed(2))));
        const newEnd = Number((newStart + dur).toFixed(2));
        setSubDragState((prev) => (prev ? { ...prev, currentStart: newStart, currentEnd: newEnd } : null));
      }
    };

    const handlePointerUp = () => {
      if (subDragState) {
        const { subId, currentStart, currentEnd } = subDragState;
        const newSubs = timelineData.subtitles
          .map((sub) => {
            if (sub.id === subId) {
              const tokens = sub.text.trim().split(/\s+/).filter(Boolean);
              const dur = Math.max(0.2, currentEnd - currentStart);
              const wordDur = dur / Math.max(1, tokens.length);
              return {
                ...sub,
                start: currentStart,
                end: currentEnd,
                words: tokens.map((w, i) => ({
                  word: w,
                  start: Number((currentStart + i * wordDur).toFixed(2)),
                  end: Number((currentStart + (i + 1) * wordDur).toFixed(2)),
                })),
              };
            }
            return sub;
          })
          .sort((a, b) => a.start - b.start);

        onUpdateSubtitles(newSubs);
      }
      setSubDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [subDragState, pxPerSec, totalDuration, timelineData.subtitles, onUpdateSubtitles]);

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
          fontFamily: subtitleFontFamily,
          fontWeight: subtitleFontWeight,
          allCaps: subtitleAllCaps,
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
      voiceUrl: resolvedVoiceUrl,
      bgmUrl: selectedBgm ? `/media/bgm/${selectedBgm.split(/[\\/]/).pop()}` : undefined,
      voiceVolume,
      bgmVolume,
      fontFamily: subtitleFontFamily,
      fontWeight: subtitleFontWeight,
      allCaps: subtitleAllCaps,
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
      resolvedVoiceUrl,
      selectedBgm,
      voiceVolume,
      bgmVolume,
      subtitleFontFamily,
      subtitleFontWeight,
      subtitleAllCaps,
      subtitleFontSize,
      subtitleBottomPercent,
      voiceDuration,
      isOutroActive,
      outroPath,
      outroDuration,
    ]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0B0F19] text-slate-100 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CỘT TRÁI (flex-1): TẦNG TRÊN (LƯỚI 3 CỘT) + TẦNG DƯỚI (TIMELINE)   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col h-full min-w-0 border-r border-slate-800/90 overflow-hidden">
        {/* Thanh Header Tác Vụ Cột Trái: Chuyển Tab + Xuất Video */}
        <div className="h-12 px-4 bg-[#151D2E] border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveRightTab('clip');
                setSelectedSubId(null);
                if (!selectedClipId && timelineData.clips.length > 0) {
                  const curTimeSec = currentFrame / fps;
                  const curClip = timelineData.clips.find(
                    (c) => curTimeSec >= c.timelineStart && curTimeSec <= c.timelineEnd
                  ) || timelineData.clips[0];
                  setSelectedClipId(curClip.id);
                }
              }}
              disabled={timelineData.clips.length === 0}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeRightTab === 'clip'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Chỉnh Clip</span>
              {selectedClipId && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono font-extrabold">
                  #{timelineData.clips.findIndex((c) => c.id === selectedClipId) + 1}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveRightTab('subtitle');
                setSelectedClipId(null);
                if (!selectedSubId && timelineData.subtitles.length > 0) {
                  const curTimeSec = currentFrame / fps;
                  const curSub = timelineData.subtitles.find(
                    (s) => curTimeSec >= s.start && curTimeSec <= s.end
                  ) || timelineData.subtitles[0];
                  setSelectedSubId(curSub.id);
                }
              }}
              disabled={timelineData.subtitles.length === 0}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeRightTab === 'subtitle'
                  ? 'bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20'
                  : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Chỉnh Phụ Đề</span>
              {selectedSubId && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono font-extrabold">
                  #{timelineData.subtitles.findIndex((s) => s.id === selectedSubId) + 1}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveRightTab('project');
                setSelectedClipId(null);
                setSelectedSubId(null);
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeRightTab === 'project'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                  : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Cài Đặt Dự Án</span>
            </button>
          </div>

          {/* Cụm Xuất Video & Trạng Thái Render */}
          <div className="flex items-center gap-2">
            {renderOutputPath && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVideoModal(true)}
                  className="py-1.5 px-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                  title="Xem video vừa xuất trực tiếp"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Xem Video MP4</span>
                </button>
                <button
                  onClick={handleOpenExportFolder}
                  className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                  title="Mở thư mục chứa video trên máy tính"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Thư Mục</span>
                </button>
              </div>
            )}

            <button
              onClick={handleStartRender}
              disabled={rendering}
              className="py-2 px-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>{rendering ? 'ĐANG RENDER...' : 'XUẤT VIDEO (MP4 1080x1920)'}</span>
            </button>
          </div>
        </div>

        {/* ─── TẦNG TRÊN BÊN TRÁI: LƯỚI 3 CỘT THÔNG MINH ─── */}
        <div className="flex-1 p-3 overflow-y-auto custom-scrollbar min-h-0 bg-[#0E1524]">
          {/* TAB 1: CLIP INSPECTOR (LƯỚI 3 CỘT) */}
          {activeRightTab === 'clip' && (() => {
            if (timelineData.clips.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800">
                  <Sliders className="w-8 h-8 text-slate-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">Chưa có clip nào trong timeline</p>
                </div>
              );
            }
            let selIdx = timelineData.clips.findIndex((c) => c.id === selectedClipId);
            if (selIdx === -1) selIdx = 0;
            const selClip = timelineData.clips[selIdx];
            const srcMatch = localAvailableSources.find((p) => p.id === selClip.sourceId || p.filePath === selClip.filePath);
            const isImg = selClip.mediaType === 'image' || isImageFile(selClip.filePath);
            const rawFileDur = isImg ? voiceDuration : (srcMatch?.duration || selClip.sourceDuration || 5.0);
            const maxAvail = isImg ? voiceDuration : Math.max(0.5, rawFileDur - (selClip.sourceStart || 0));
            const stageColor = STAGE_COLORS[selClip.stage] || '#64748b';
            const stageLabel = STAGE_LABELS[selClip.stage] || 'N/A';

            return (
              <div className="grid grid-cols-3 gap-3 h-full min-h-[185px]">
                {/* CỘT 1: THÔNG TIN CLIP & PREVIEW THUMBNAIL */}
                <div className="p-3 bg-slate-900/90 border border-amber-500/30 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-mono font-extrabold text-xs">
                          Clip #{selIdx + 1}
                        </span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-md font-bold text-white truncate"
                          style={{ backgroundColor: stageColor }}
                        >
                          {stageLabel}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-slate-200 truncate font-mono" title={selClip.fileName}>
                      📁 {selClip.fileName}
                    </p>
                  </div>

                  {/* Thumbnail */}
                  <div className="h-24 bg-black rounded-lg overflow-hidden relative border border-slate-800 flex items-center justify-center mt-2">
                    {selClip.thumbnailPath ? (
                      <img
                        src={`/media/thumbnails/${selClip.thumbnailPath.split(/[\\/]/).pop()}`}
                        alt={selClip.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        No Thumbnail
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/85 backdrop-blur-xs px-1.5 py-0.2 rounded text-[8.5px] font-mono text-slate-300 border border-white/10">
                      {selClip.aspectRatioType || '9:16'} • {isImg ? 'Ảnh tĩnh' : 'Video'}
                    </div>
                  </div>
                </div>

                {/* CỘT 2: ĐIỀU CHỈNH THỜI LƯỢNG (INPUT, STEPPERS, SLIDER, MAX) */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-amber-400" />
                        Thời Lượng Clip
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Max: <strong className="text-amber-400">{maxAvail.toFixed(1)}s</strong>
                      </span>
                    </div>

                    {/* Steppers & Input */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleResizeClip(selClip.id, selClip.sourceDuration - 1.0)}
                        disabled={selClip.sourceDuration <= 1.1}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold rounded cursor-pointer font-mono"
                        title="Giảm 1.0s"
                      >
                        -1s
                      </button>
                      <button
                        onClick={() => handleResizeClip(selClip.id, selClip.sourceDuration - 0.5)}
                        disabled={selClip.sourceDuration <= 0.6}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold rounded cursor-pointer font-mono"
                        title="Giảm 0.5s"
                      >
                        -0.5s
                      </button>

                      <div className="flex-1 flex items-center justify-center gap-1 bg-slate-950 border border-amber-500/40 rounded px-1.5 py-1">
                        <input
                          type="number"
                          min="0.5"
                          max={Number(maxAvail.toFixed(1))}
                          step="0.1"
                          value={selClip.sourceDuration}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) handleResizeClip(selClip.id, val);
                          }}
                          className="w-12 bg-transparent text-center font-mono text-sm text-amber-300 font-extrabold outline-none"
                        />
                        <span className="text-xs font-mono text-amber-400 font-bold">s</span>
                      </div>

                      <button
                        onClick={() => handleResizeClip(selClip.id, selClip.sourceDuration + 0.5)}
                        disabled={selClip.sourceDuration >= maxAvail - 0.05}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold rounded cursor-pointer font-mono"
                        title="Tăng 0.5s"
                      >
                        +0.5s
                      </button>
                      <button
                        onClick={() => handleResizeClip(selClip.id, selClip.sourceDuration + 1.0)}
                        disabled={selClip.sourceDuration >= maxAvail - 0.05}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold rounded cursor-pointer font-mono"
                        title="Tăng 1.0s"
                      >
                        +1s
                      </button>
                    </div>

                    <input
                      type="range"
                      min="0.5"
                      max={Math.max(1.0, maxAvail)}
                      step="0.1"
                      value={selClip.sourceDuration}
                      onChange={(e) => handleResizeClip(selClip.id, parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Max duration button */}
                  <div className="pt-1.5">
                    {!isImg ? (
                      <button
                        onClick={() => handleResizeClip(selClip.id, maxAvail)}
                        disabled={selClip.sourceDuration >= maxAvail - 0.05}
                        className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 disabled:opacity-30 border border-amber-500/40 text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition"
                      >
                        ⚡ Lấy Tối Đa ({maxAvail.toFixed(1)}s)
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono block text-center">
                        🖼️ Ảnh tĩnh: Tự do kéo dài & Ken Burns
                      </span>
                    )}
                  </div>
                </div>

                {/* CỘT 3: TÁC VỤ SOURCE & DUYỆT CLIP LIỀN KỀ */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-300 block">Tác Vụ Source</span>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => handleReplaceClipFromExplorer(selClip.id)}
                        className="py-1.5 px-2 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 font-bold text-xs rounded-lg border border-amber-500/40 flex items-center justify-center gap-1 transition cursor-pointer"
                        title="Mở Windows Explorer chọn video/ảnh mới từ máy tính"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>Đổi Máy Tính</span>
                      </button>

                      <button
                        onClick={() => handleOpenProjectSourceModal(selClip.id)}
                        className="py-1.5 px-2 bg-blue-500/20 hover:bg-blue-500/35 text-blue-300 font-bold text-xs rounded-lg border border-blue-500/40 flex items-center justify-center gap-1 transition cursor-pointer"
                        title="Chọn clip khác có sẵn trong thư mục công trình"
                      >
                        <Film className="w-3.5 h-3.5 text-blue-400" />
                        <span>Đổi Công Trình</span>
                      </button>

                      <button
                        onClick={handleOpenTrimSourceModal}
                        className="py-1.5 px-2 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 font-bold text-xs rounded-lg border border-emerald-500/40 flex items-center justify-center gap-1 transition cursor-pointer"
                        title="Cắt ngắn video nguồn gốc bằng cách điều chỉnh 2 đầu (Start/End)"
                      >
                        <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cắt Source</span>
                      </button>

                      <button
                        onClick={() => handleDeleteClip(selIdx)}
                        disabled={timelineData.clips.length <= 1}
                        className="py-1.5 px-2 bg-red-500/20 hover:bg-red-500/35 text-red-300 disabled:opacity-40 font-bold text-xs rounded-lg border border-red-500/40 flex items-center justify-center gap-1 transition cursor-pointer"
                        title="Xóa clip này khỏi timeline (tự động bù clip giữ chuẩn thời lượng)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Xóa Clip</span>
                      </button>
                    </div>
                  </div>

                  {/* Adjacent Clip Navigator */}
                  <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (selIdx > 0) {
                          setSelectedClipId(timelineData.clips[selIdx - 1].id);
                        }
                      }}
                      disabled={selIdx === 0}
                      className="py-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Clip #{selIdx}</span>
                    </button>

                    <span className="text-[10px] text-slate-500 font-mono">
                      {selIdx + 1} / {timelineData.clips.length}
                    </span>

                    <button
                      onClick={() => {
                        if (selIdx < timelineData.clips.length - 1) {
                          setSelectedClipId(timelineData.clips[selIdx + 1].id);
                        }
                      }}
                      disabled={selIdx >= timelineData.clips.length - 1}
                      className="py-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                    >
                      <span>Clip #{selIdx + 2}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 2: SUBTITLE INSPECTOR (LƯỚI 3 CỘT) */}
          {activeRightTab === 'subtitle' && (() => {
            if (timelineData.subtitles.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800">
                  <Type className="w-8 h-8 text-slate-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">Chưa có dòng phụ đề nào</p>
                  <p className="text-xs text-slate-500 mt-1">Dự án chưa có phụ đề.</p>
                </div>
              );
            }
            let selSubIdx = timelineData.subtitles.findIndex((s) => s.id === selectedSubId);
            if (selSubIdx === -1) selSubIdx = 0;
            const selSub = timelineData.subtitles[selSubIdx];
            const dur = Math.max(0, selSub.end - selSub.start);

            return (
              <div className="grid grid-cols-3 gap-3 h-full min-h-[185px]">
                {/* CỘT 1: THÔNG TIN CÂU & PREVIEW PHÁT & CHỌN FONT */}
                <div className="p-3 bg-slate-900/90 border border-yellow-500/30 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-yellow-400 text-slate-950 font-mono font-extrabold text-xs">
                          Câu #{selSubIdx + 1}
                        </span>
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (selSubIdx > 0) {
                                setSelectedSubId(timelineData.subtitles[selSubIdx - 1].id);
                              }
                            }}
                            disabled={selSubIdx <= 0}
                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-[10px] font-bold rounded cursor-pointer"
                            title="Câu trước"
                          >
                            ◀
                          </button>
                          <span className="text-[10px] font-mono text-slate-400">
                            {selSubIdx + 1}/{timelineData.subtitles.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (selSubIdx < timelineData.subtitles.length - 1) {
                                setSelectedSubId(timelineData.subtitles[selSubIdx + 1].id);
                              }
                            }}
                            disabled={selSubIdx >= timelineData.subtitles.length - 1}
                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-[10px] font-bold rounded cursor-pointer"
                            title="Câu tiếp theo"
                          >
                            ▶
                          </button>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-yellow-300 bg-yellow-950/60 px-2 py-0.5 rounded border border-yellow-500/30">
                        ⏱️ {dur.toFixed(1)}s • {selSub.words?.length || 0} từ
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 italic truncate font-sans">
                      "{selSub.text || 'Chưa nhập lời...'}"
                    </p>
                  </div>

                  {/* Nút phát thử câu trên Player & Tùy biến Font trực tiếp */}
                  <div className="space-y-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => handlePlaySubtitlePreview(selSub.start)}
                      className="w-full py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer active:scale-98"
                    >
                      <Play className="w-3.5 h-3.5 fill-slate-950" />
                      <span>Phát Thử Câu Này Trên Player</span>
                    </button>

                    {/* Font & Kiểu Dáng chữ phụ đề */}
                    <div className="p-1.5 bg-slate-950/80 border border-slate-800 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold text-amber-400 flex items-center gap-1">
                          <Type className="w-3 h-3" />
                          Font Chữ & Kiểu Dáng
                        </span>
                        <button
                          type="button"
                          onClick={handleResetSubtitleStyles}
                          className="text-[8.5px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          Mặc định
                        </button>
                      </div>

                      <select
                        value={subtitleFontFamily}
                        onChange={(e) => handleFontFamilyChange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-0.5 outline-none focus:border-amber-500 font-sans"
                      >
                        {SUBTITLE_FONTS.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.name} — {font.desc}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1 text-[9px]">
                        <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                          <button
                            type="button"
                            onClick={() => handleFontWeightChange('normal')}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              subtitleFontWeight === 'normal'
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Vừa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFontWeightChange('bold')}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              subtitleFontWeight === 'bold'
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Đậm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFontWeightChange('extraBold')}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              subtitleFontWeight === 'extraBold'
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Rất đậm
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAllCapsChange(!subtitleAllCaps)}
                          className={`flex-1 py-0.5 px-1 rounded font-bold border cursor-pointer text-center truncate ${
                            subtitleAllCaps
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          {subtitleAllCaps ? '🔠 IN HOA' : '🔡 Tự nhiên'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CỘT 2: ĐIỀU CHỈNH THỜI GIAN START & END */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-2">
                    {/* Bắt đầu */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 flex items-center justify-between mb-1">
                        <span>⏱️ Bắt Đầu (giây):</span>
                        <span className="font-mono text-emerald-400">{selSub.start.toFixed(2)}s</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateSubtitle(selSub.id, { start: Math.max(0, Number((selSub.start - 0.5).toFixed(2))) })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono cursor-pointer"
                        >
                          -0.5s
                        </button>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={selSub.end - 0.2}
                          value={selSub.start}
                          onChange={(e) => handleUpdateSubtitle(selSub.id, { start: Math.max(0, Number(e.target.value)) })}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center font-mono text-slate-100 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateSubtitle(selSub.id, { start: Math.min(selSub.end - 0.2, Number((selSub.start + 0.5).toFixed(2))) })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono cursor-pointer"
                        >
                          +0.5s
                        </button>
                      </div>
                    </div>

                    {/* Kết thúc */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 flex items-center justify-between mb-1">
                        <span>⏱️ Kết Thúc (giây):</span>
                        <span className="font-mono text-amber-400">{selSub.end.toFixed(2)}s</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateSubtitle(selSub.id, { end: Math.max(selSub.start + 0.2, Number((selSub.end - 0.5).toFixed(2))) })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono cursor-pointer"
                        >
                          -0.5s
                        </button>
                        <input
                          type="number"
                          step={0.1}
                          min={selSub.start + 0.2}
                          max={totalDuration}
                          value={selSub.end}
                          onChange={(e) => handleUpdateSubtitle(selSub.id, { end: Math.max(selSub.start + 0.2, Number(e.target.value)) })}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center font-mono text-slate-100 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateSubtitle(selSub.id, { end: Math.min(totalDuration, Number((selSub.end + 0.5).toFixed(2))) })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono cursor-pointer"
                        >
                          +0.5s
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 font-mono text-center">
                    💡 Kéo tay kéo 2 đầu trên timeline để co giãn nhanh
                  </div>
                </div>

                {/* CỘT 3: SỬA VĂN BẢN & THAO TÁC */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-300 block">
                      Nội Dung Lời Câu Hát:
                    </label>
                    <textarea
                      rows={2}
                      value={selSub.text}
                      onChange={(e) => handleUpdateSubtitle(selSub.id, { text: e.target.value })}
                      placeholder="Nhập nội dung phụ đề..."
                      className="w-full bg-slate-950 border border-slate-700 focus:border-yellow-400 rounded-lg p-2 text-xs text-slate-100 outline-none resize-none font-sans"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtitle(selSub.id)}
                      className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Xóa câu phụ đề này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa Câu</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = selSub.end;
                          const nextEnd = Math.min(totalDuration, Number((nextStart + 3.5).toFixed(2)));
                          const newId = `sub_${Date.now()}`;
                          const newSub: SubtitleLine = {
                            id: newId,
                            start: nextStart,
                            end: nextEnd,
                            text: 'CÂU TIẾP THEO...',
                            words: [],
                          };
                          const newSubs = [...timelineData.subtitles, newSub].sort((a, b) => a.start - b.start);
                          onUpdateSubtitles(newSubs);
                          setSelectedSubId(newId);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-yellow-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Thêm câu mới ngay sau câu này"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nối Câu</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubId(null);
                          setActiveRightTab('project');
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
                      >
                        ✕ Đóng
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 3: PROJECT SETTINGS (LƯỚI 3 CỘT) */}
          {(activeRightTab === 'project' || (!selectedClipId && !selectedSubId && activeRightTab !== 'subtitle' && activeRightTab !== 'clip')) && (
            <div className="grid grid-cols-3 gap-3 h-full min-h-[185px]">
              {/* CỘT 1: THÔNG TIN CÔNG TRÌNH & VOICE AUDIO */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    Công Trình Đang Dựng
                  </span>
                  <h3 className="text-sm font-bold text-slate-100 truncate mt-0.5" title={timelineData.projectName}>
                    {timelineData.projectName}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Thời lượng: <strong className="font-mono text-amber-300">{totalDuration.toFixed(1)}s</strong> • {timelineData.clips.length} clips
                  </p>
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="truncate text-[10px] font-mono text-slate-400" title={timelineData.voicePath}>
                      🎙️ {timelineData.voicePath ? (timelineData.voicePath.split('\\').pop()?.split('/').pop() || 'Voice Audio') : 'Chưa có file'}
                    </div>
                    <button
                      onClick={handleChangeVoiceFile}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold transition cursor-pointer shrink-0 ml-2"
                      title="Chọn lại file Voice từ máy tính nếu file bị đổi vị trí hoặc thiếu"
                    >
                      📁 Đổi Voice
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Âm lượng Giọng Voice:</span>
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
              </div>

              {/* CỘT 2: NHẠC THIỀN BGM & ÂM LƯỢNG */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                    Nhạc Thiền BGM
                  </span>
                  <select
                    value={selectedBgm}
                    onChange={(e) => setSelectedBgm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 outline-none focus:border-amber-500"
                  >
                    <option value="">-- Không dùng nhạc nền --</option>
                    {bgmList.map((bgm, idx) => (
                      <option key={idx} value={bgm.filePath}>
                        {bgm.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Âm lượng BGM (Fade-out Outro):</span>
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

              {/* CỘT 3: PHỤ ĐỀ KARAOKE & OUTRO CUỐI VIDEO */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm space-y-2">
                {/* Phụ đề */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-amber-400" />
                      Phụ Đề ({subtitleFontSize}px • Đáy {subtitleBottomPercent}%)
                    </span>
                    <button
                      onClick={handleResetSubtitleStyles}
                      className="text-[9px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                      title="Khôi phục font và kiểu dáng phụ đề về mặc định (Lexend, Đậm, In hoa)"
                    >
                      Mặc định
                    </button>
                  </div>

                  {/* Chọn Font chữ */}
                  <div>
                    <select
                      value={subtitleFontFamily}
                      onChange={(e) => handleFontFamilyChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-[11px] rounded-lg px-2 py-1 outline-none focus:border-amber-500 font-sans"
                    >
                      {SUBTITLE_FONTS.map((font) => (
                        <option key={font.id} value={font.id}>
                          {font.name} — {font.desc}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Độ đậm chữ & Chế độ In hoa */}
                  <div className="flex items-center justify-between gap-1.5">
                    {/* 3 Nấc Độ đậm */}
                    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleFontWeightChange('normal')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${
                          subtitleFontWeight === 'normal'
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Độ đậm: Vừa (Medium ~500)"
                      >
                        Vừa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFontWeightChange('bold')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${
                          subtitleFontWeight === 'bold'
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Độ đậm: Đậm (Bold ~700) - Mặc định"
                      >
                        Đậm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFontWeightChange('extraBold')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${
                          subtitleFontWeight === 'extraBold'
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Độ đậm: Rất đậm (ExtraBold ~800)"
                      >
                        Rất đậm
                      </button>
                    </div>

                    {/* Toggle In Hoa Toàn Bộ */}
                    <button
                      type="button"
                      onClick={() => handleAllCapsChange(!subtitleAllCaps)}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                        subtitleAllCaps
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                      title={subtitleAllCaps ? 'Đang BẬT IN HOA TOÀN BỘ' : 'Đang TẮT (Giữ nguyên viết hoa/thường tự nhiên)'}
                    >
                      <span className="font-mono">{subtitleAllCaps ? 'AA' : 'Aa'}</span>
                      <span>{subtitleAllCaps ? 'IN HOA' : 'Tự nhiên'}</span>
                    </button>
                  </div>

                  {/* Thanh trượt Cỡ chữ & Lề đáy */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div>
                      <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                        <span>Cỡ chữ:</span>
                        <span className="font-mono text-amber-300">{subtitleFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max="90"
                        step="1"
                        value={subtitleFontSize}
                        onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500 h-1 bg-slate-800 rounded cursor-pointer"
                        title="Cỡ chữ phụ đề (40px - 90px)"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                        <span>Lề đáy:</span>
                        <span className="font-mono text-amber-300">{subtitleBottomPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="35"
                        step="1"
                        value={subtitleBottomPercent}
                        onChange={(e) => handleBottomPercentChange(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500 h-1 bg-slate-800 rounded cursor-pointer"
                        title="Vị trí từ lề đáy lên (12% - 35%)"
                      />
                    </div>
                  </div>
                </div>

                {/* Outro */}
                <div className="p-2 bg-purple-950/40 border border-purple-500/30 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                      <Film className="w-3 h-3 text-purple-400" />
                      Outro Cuối Video
                    </span>
                    <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-slate-300">
                      <span>{isOutroActive ? 'BẬT' : 'TẮT'}</span>
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
                        className="w-3 h-3 accent-purple-500 rounded cursor-pointer"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-300 truncate max-w-[140px]" title={outroPath}>
                      📁 {outroFileName || 'Chưa chọn'}
                    </span>
                    <button
                      onClick={handleChangeOutroFile}
                      disabled={browsingOutro}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded border border-slate-700 cursor-pointer"
                    >
                      Đổi
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── TẦNG DƯỚI BÊN TRÁI: TIMELINE TRACKS AREA (h-[340px]) ─── */}
        <div
          ref={timelineAreaRef}
          className="h-[340px] bg-[#111827] border-t border-slate-800 flex flex-col overflow-hidden select-none flex-shrink-0"
        >
          {/* Timeline Toolbar (3 Khối Cân Đối) */}
          <div className="h-10 px-4 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
            {/* Khối Trái: Play/Pause & Timecode & Test Audio */}
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <button
                onClick={togglePlayPause}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold shadow transition cursor-pointer ${
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

              <button
                onClick={handleTestAudioSnippet}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                  isTestingAudio
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Bấm để nghe thử 3 giây giọng Voice và mở khóa âm thanh trình duyệt"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{isTestingAudio ? '🔊 Đang phát...' : '🎧 Test Voice'}</span>
              </button>

              <button
                onClick={handleChangeVoiceFile}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition cursor-pointer"
                title="Chọn lại file Voice trên máy tính"
              >
                <FolderOpen className="w-3 h-3 text-amber-400" />
                <span>Đổi Voice</span>
              </button>

              {/* Hidden file input fallback */}
              <input
                type="file"
                ref={fileInputVoiceRef}
                onChange={handleUploadVoiceFileFallback}
                accept="audio/*"
                className="hidden"
              />

              <span className="text-amber-400 font-bold ml-1">TIMELINE 9:16</span>
              <span className="text-slate-200 font-bold">
                {formatTime(playheadTimeSec)} / {formatTime(totalDuration)}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500">
                Frame {currentFrame} / {durationInFrames}
              </span>
            </div>

            {/* Khối Giữa: Outro Badge & Status */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!outroPath) {
                    handleChangeOutroFile();
                  } else {
                    setOutroEnabled((prev) => !prev);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
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

              <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px] font-mono font-semibold">
                🎞️ {timelineData.clips.length} Clips
              </span>

              {/* Trạng thái Tự Động Lưu */}
              {saveStatus === 'saving' ? (
                <span className="text-amber-300 flex items-center gap-1 font-medium text-[10px] bg-slate-850 px-2 py-0.5 rounded-lg border border-slate-800">
                  <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                  <span>Đang lưu...</span>
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="text-emerald-400 flex items-center gap-1 font-medium text-[10px] bg-slate-850 px-2 py-0.5 rounded-lg border border-slate-800" title={`Đã tự động lưu vào CSDL SQLite lúc ${lastSavedTime}`}>
                  <Cloud className="w-3 h-3 text-emerald-400" />
                  <span>Đã lưu {lastSavedTime && <span className="font-mono text-emerald-300/90 text-[9px]">({lastSavedTime})</span>}</span>
                </span>
              ) : null}
            </div>

            {/* Khối Phải: Cắt chuẩn 4-6s, Fit, Zoom, Nút Lưu */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdateClips(rebalanceClips(timelineData.clips))}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 border border-slate-700 text-[11px] font-semibold transition cursor-pointer"
                title="Tự động phân bổ lại toàn bộ clip để mỗi đoạn đạt chuẩn 4.0s - 5.5s"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>Cắt Chuẩn 4-6s</span>
              </button>

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

              <button
                onClick={() => executeSaveProject(true)}
                disabled={saveStatus === 'saving'}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 hover:text-white rounded-lg text-[11px] font-bold border border-amber-500/40 flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                title="Lưu ngay lập tức toàn bộ kịch bản và cài đặt vào CSDL SQLite"
              >
                <Save className="w-3 h-3 text-amber-400" />
                <span>Lưu Ngay</span>
              </button>
            </div>
          </div>

          {/* Scrollable Tracks Area */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Track Labels (fixed left column) */}
            <div className="flex flex-col flex-shrink-0" style={{ width: LABEL_WIDTH }}>
              <div className="h-6 flex items-center px-3 border-b border-slate-800 bg-slate-900/50">
                <span className="text-[9px] font-mono text-slate-500">⏱ TIME</span>
              </div>
              <div className="h-[105px] flex items-center px-3 border-b border-slate-800/50">
                <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  <span>Video ({timelineData.clips.length}{isOutroActive ? ' + Outro' : ''})</span>
                </div>
              </div>
              <div className="flex-1 flex items-center px-3 justify-between">
                <div className="text-[11px] font-bold text-yellow-300 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>Sub ({timelineData.subtitles.length})</span>
                </div>
                <button
                  onClick={handleAddSubtitleAtPlayhead}
                  className="px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded border border-amber-500/40 text-[9px] font-bold flex items-center gap-0.5 cursor-pointer shadow-sm transition"
                  title="Thêm câu phụ đề mới tại vị trí vạch Playhead hiện tại"
                >
                  <Plus className="w-3 h-3" />
                  <span>Thêm</span>
                </button>
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
                          const isResizing = resizingState?.clipId === clip.id;
                          const durationToUse = isResizing && resizingState ? resizingState.currentDuration : clip.sourceDuration;
                          const widthPx = durationToUse * pxPerSec;
                          return (
                            <SortableClip
                              key={clip.id}
                              clip={clip}
                              index={idx}
                              totalClips={timelineData.clips.length}
                              widthPx={widthPx}
                              isSelected={selectedClipId === clip.id}
                              isResizingThis={isResizing}
                              resizingDuration={durationToUse}
                              onSelectClip={setSelectedClipId}
                              onStartResize={handleStartResize}
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
                    const isDragging = subDragState?.subId === sub.id;
                    const displayStart = isDragging ? subDragState!.currentStart : sub.start;
                    const displayEnd = isDragging ? subDragState!.currentEnd : sub.end;
                    const subDuration = Math.max(0.1, displayEnd - displayStart);
                    const widthPx = Math.max(16, subDuration * pxPerSec);
                    const leftPx = displayStart * pxPerSec;
                    const isSelected = selectedSubId === sub.id;

                    return (
                      <div
                        key={sub.id}
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') return;
                          setSubDragState({
                            subId: sub.id,
                            handle: 'move',
                            startX: e.clientX,
                            origStart: sub.start,
                            origEnd: sub.end,
                            currentStart: sub.start,
                            currentEnd: sub.end,
                          });
                          setSelectedSubId(sub.id);
                          setSelectedClipId(null);
                          setActiveRightTab('subtitle');
                        }}
                        className={`absolute top-1 bottom-1 rounded-lg flex flex-col justify-center px-1.5 py-0.5 text-[9px] select-none transition-shadow ${
                          isSelected
                            ? 'border-2 border-yellow-400 bg-yellow-400/20 shadow-lg shadow-yellow-500/30 z-30'
                            : 'border border-yellow-500/30 bg-slate-900/90 hover:border-yellow-400/60 hover:bg-slate-850 z-10'
                        } ${isDragging ? 'opacity-90 ring-2 ring-yellow-400 z-40' : ''}`}
                        style={{ left: leftPx, width: widthPx, cursor: 'grab' }}
                      >
                        {/* Floating Tooltip khi đang kéo */}
                        {isDragging && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/90 text-yellow-300 font-mono text-[9px] px-2 py-0.5 rounded shadow-xl border border-yellow-500/50 pointer-events-none z-50 whitespace-nowrap">
                            ⏱️ {displayStart.toFixed(1)}s ➔ {displayEnd.toFixed(1)}s ({subDuration.toFixed(1)}s)
                          </div>
                        )}

                        {/* Left Resize Handle */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSubDragState({
                              subId: sub.id,
                              handle: 'left',
                              startX: e.clientX,
                              origStart: sub.start,
                              origEnd: sub.end,
                              currentStart: sub.start,
                              currentEnd: sub.end,
                            });
                            setSelectedSubId(sub.id);
                            setSelectedClipId(null);
                            setActiveRightTab('subtitle');
                          }}
                          className="absolute top-0 bottom-0 left-0 w-2.5 hover:w-3.5 bg-emerald-500/20 hover:bg-emerald-500/60 cursor-ew-resize z-20 flex items-center justify-center group/lsub rounded-l"
                          title="Kéo co giãn mốc Bắt Đầu câu"
                        >
                          <div className="w-[2px] h-3 bg-emerald-400 rounded-full group-hover/lsub:h-4 transition-all" />
                        </div>

                        {/* Content */}
                        <div className="px-2 flex items-center justify-between overflow-hidden">
                          <p
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubId(sub.id);
                              setSelectedClipId(null);
                              setActiveRightTab('subtitle');
                            }}
                            className="text-[10px] text-slate-100 font-medium truncate leading-tight flex-1"
                            title={`${sub.start.toFixed(1)}s - ${sub.end.toFixed(1)}s: "${sub.text}" (Click để chọn)`}
                          >
                            {widthPx >= 30 ? sub.text : '•••'}
                          </p>
                        </div>

                        {/* Right Resize Handle */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSubDragState({
                              subId: sub.id,
                              handle: 'right',
                              startX: e.clientX,
                              origStart: sub.start,
                              origEnd: sub.end,
                              currentStart: sub.start,
                              currentEnd: sub.end,
                            });
                            setSelectedSubId(sub.id);
                            setSelectedClipId(null);
                            setActiveRightTab('subtitle');
                          }}
                          className="absolute top-0 bottom-0 right-0 w-2.5 hover:w-3.5 bg-amber-500/20 hover:bg-amber-500/60 cursor-ew-resize z-20 flex items-center justify-center group/rsub rounded-r"
                          title="Kéo co giãn mốc Kết Thúc câu"
                        >
                          <div className="w-[2px] h-3 bg-amber-400 rounded-full group-hover/rsub:h-4 transition-all" />
                        </div>
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
    </div>

    {/* ═══════════════════════════════════════════════════════════════════ */}
    {/* CỘT PHẢI: VIDEO PREVIEW 9:16 TRÀN VIỀN TỐI GIẢN (BORDERLESS CANVAS) */}
    {/* ═══════════════════════════════════════════════════════════════════ */}
    <div className="h-full aspect-[9/16] flex-shrink-0 bg-black relative flex items-center justify-center overflow-hidden select-none shadow-2xl">
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
        showVolumeControls
        initiallyMuted={false}
        initialVolume={1.0}
        clickToPlay
        spaceKeyToPlayOrPause={false}
        autoPlay={false}
        loop
      />
      {/* Subtle top indicator */}
      <div className="absolute top-2 right-2 pointer-events-none bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded text-[9px] font-mono text-amber-400 font-bold border border-white/10 z-10">
        9:16 • 1080x1920
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
                const pool = (localAvailableSources && localAvailableSources.length > 0)
                  ? localAvailableSources
                  : (timelineData.availableSources && timelineData.availableSources.length > 0)
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
                      usageCount: 0,
                    }));

                const filtered = pool.filter((src) => {
                  const matchStage = projectSourceStageFilter === 'ALL' || src.stage === projectSourceStageFilter;
                  const matchText = !projectSourceSearch || src.fileName.toLowerCase().includes(projectSourceSearch.toLowerCase());
                  return matchStage && matchText;
                });

                // Sắp xếp: Video trước Ảnh -> Số lần dùng ít nhất lên đầu (ASC) -> Điểm thẩm mỹ cao hơn xếp trước (DESC)
                const sorted = [...filtered].sort((a, b) => {
                  const aIsImg = a.mediaType === 'image' || isImageFile(a.filePath);
                  const bIsImg = b.mediaType === 'image' || isImageFile(b.filePath);
                  if (aIsImg !== bIsImg) return aIsImg ? 1 : -1;
                  const aUsage = a.usageCount || 0;
                  const bUsage = b.usageCount || 0;
                  if (aUsage !== bUsage) return aUsage - bUsage;
                  return (b.aestheticScore || 0) - (a.aestheticScore || 0);
                });

                if (sorted.length === 0) {
                  return (
                    <div className="py-16 text-center text-slate-500 text-xs">
                      Không tìm thấy video hoặc ảnh nào phù hợp bộ lọc.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {sorted.map((src, idx) => {
                      const stColor = STAGE_COLORS[src.stage] || '#64748b';
                      const stLabel = STAGE_LABELS[src.stage] || 'N/A';
                      const isImg = src.mediaType === 'image' || isImageFile(src.filePath);

                      return (
                        <div
                          key={idx}
                          onClick={() => handleSelectProjectSource(src)}
                          className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-400 rounded-xl overflow-hidden cursor-pointer group transition shadow-md hover:shadow-amber-500/20 flex flex-col relative"
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

                            {/* Nút Xóa File Gốc trên Card */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestDeleteSourceFromModal(src);
                              }}
                              className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/80 hover:bg-red-600 text-slate-300 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow border border-white/10 z-10 cursor-pointer"
                              title="Xóa vĩnh viễn file nguồn gốc này khỏi ổ cứng"
                            >
                              <Trash2 className="w-3 h-3 text-red-400 hover:text-white" />
                            </button>

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
                  crossOrigin="anonymous"
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

      {/* ════════ TRIM SOURCE VIDEO MODAL (2 ĐẦU) ════════ */}
      {trimModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
          <div className="bg-[#111827] border-2 border-emerald-500/60 rounded-3xl p-5 md:p-6 max-w-2xl w-full flex flex-col shadow-2xl relative max-h-[92vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/40">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100 font-montserrat">
                    Cắt Video Nguồn Gốc (2 Đầu)
                  </h3>
                  <p className="text-xs text-slate-400 truncate max-w-sm">
                    {trimModal.fileName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTrimModal((prev) => ({ ...prev, isOpen: false, isPlaying: false }))}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Video Preview Player */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center mb-4 flex-shrink-0">
              <video
                ref={trimmerVideoRef}
                src={`/media/stream?path=${encodeURIComponent(trimModal.filePath)}`}
                onTimeUpdate={handleTrimTimeUpdate}
                playsInline
                crossOrigin="anonymous"
                className="w-full h-full object-contain"
                onClick={handleToggleTrimPreview}
              />
              
              {/* Play Overlay Button */}
              <button
                onClick={handleToggleTrimPreview}
                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 hover:bg-emerald-600/90 text-white flex items-center justify-center backdrop-blur-xs transition shadow-lg cursor-pointer border border-white/20"
                style={{ opacity: trimModal.isPlaying ? 0 : 0.9 }}
              >
                {trimModal.isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Time overlay badge */}
              <div className="absolute bottom-2 left-2 bg-black/80 font-mono text-[10px] text-slate-300 px-2 py-0.5 rounded-lg border border-slate-700 flex items-center gap-1.5 pointer-events-none">
                <span className="text-emerald-400 font-bold">{trimModal.currentTime.toFixed(1)}s</span>
                <span className="text-slate-500">/</span>
                <span>{trimModal.totalDuration.toFixed(1)}s</span>
              </div>
            </div>

            {/* Dual Range Timeline Track & Handles */}
            <div className="space-y-3 px-1 flex-shrink-0">
              {/* Visual Selection Bar */}
              <div className="relative h-7 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center select-none">
                {/* Active trimmed region */}
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/30 border-x-2 border-emerald-400 shadow-sm"
                  style={{
                    left: `${(trimModal.startTime / Math.max(0.1, trimModal.totalDuration)) * 100}%`,
                    width: `${((trimModal.endTime - trimModal.startTime) / Math.max(0.1, trimModal.totalDuration)) * 100}%`,
                  }}
                />

                {/* Playhead indicator */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 shadow-sm z-10 pointer-events-none"
                  style={{
                    left: `${(trimModal.currentTime / Math.max(0.1, trimModal.totalDuration)) * 100}%`,
                  }}
                />

                <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-mono text-slate-500 pointer-events-none">
                  <span>0.0s</span>
                  <span className="text-emerald-300 font-bold">
                    Đoạn cắt: {(trimModal.endTime - trimModal.startTime).toFixed(1)}s
                  </span>
                  <span>{trimModal.totalDuration.toFixed(1)}s</span>
                </div>
              </div>

              {/* Controls: Range Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Start Time Slider & Input */}
                <div className="p-2.5 bg-slate-900/90 border border-emerald-500/30 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                      ◀ Điểm Bắt Đầu (In Point)
                    </span>
                    <span className="font-mono text-emerald-400 font-bold text-xs bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      {trimModal.startTime.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, trimModal.endTime - 0.5)}
                    step="0.1"
                    value={trimModal.startTime}
                    onChange={(e) => handleStartTimeChange(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      onClick={() => handleStartTimeChange(Math.max(0, trimModal.startTime - 0.5))}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                    >
                      -0.5s
                    </button>
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, trimModal.endTime - 0.5)}
                      step="0.1"
                      value={trimModal.startTime}
                      onChange={(e) => handleStartTimeChange(Number(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-700 text-emerald-300 font-mono text-center text-xs py-0.5 rounded outline-none"
                    />
                    <button
                      onClick={() => handleStartTimeChange(Math.min(trimModal.endTime - 0.5, trimModal.startTime + 0.5))}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                    >
                      +0.5s
                    </button>
                  </div>
                </div>

                {/* End Time Slider & Input */}
                <div className="p-2.5 bg-slate-900/90 border border-amber-500/30 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      Điểm Kết Thúc (Out Point) ▶
                    </span>
                    <span className="font-mono text-amber-400 font-bold text-xs bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {trimModal.endTime.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={trimModal.startTime + 0.5}
                    max={trimModal.totalDuration}
                    step="0.1"
                    value={trimModal.endTime}
                    onChange={(e) => handleEndTimeChange(Number(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      onClick={() => handleEndTimeChange(Math.max(trimModal.startTime + 0.5, trimModal.endTime - 0.5))}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                    >
                      -0.5s
                    </button>
                    <input
                      type="number"
                      min={trimModal.startTime + 0.5}
                      max={trimModal.totalDuration}
                      step="0.1"
                      value={trimModal.endTime}
                      onChange={(e) => handleEndTimeChange(Number(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-700 text-amber-300 font-mono text-center text-xs py-0.5 rounded outline-none"
                    />
                    <button
                      onClick={() => handleEndTimeChange(Math.min(trimModal.totalDuration, trimModal.endTime + 0.5))}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                    >
                      +0.5s
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning & Info Note */}
            <div className="my-3 p-2.5 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
              <span className="flex items-center gap-1.5">
                💡 Độ dài sau cắt: <strong className="text-emerald-300 font-mono">{(trimModal.endTime - trimModal.startTime).toFixed(1)}s</strong> (Gốc: {trimModal.totalDuration.toFixed(1)}s)
              </span>
              <span className="text-[10px] text-amber-400 font-medium hidden sm:inline">
                ⚠️ File gốc sẽ được cắt vĩnh viễn và đồng bộ lại thư viện
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 flex-shrink-0">
              <button
                onClick={handleToggleTrimPreview}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                {trimModal.isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{trimModal.isPlaying ? 'Dừng Xem Thử' : 'Xem Thử Đoạn Cắt'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  disabled={trimModal.isTrimming}
                  onClick={() => setTrimModal((prev) => ({ ...prev, isOpen: false, isPlaying: false }))}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  disabled={trimModal.isTrimming}
                  onClick={handleExecuteTrimSource}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {trimModal.isTrimming ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang Cắt Video...</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Xác Nhận Cắt Vĩnh Viễn</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ CONFIRM DELETE SOURCE MODAL ════════ */}
      {deleteSourceModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border-2 border-red-500/60 rounded-3xl p-6 max-w-lg w-full flex flex-col shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-slate-800">
              <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 border border-red-500/40">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-red-200 font-montserrat">
                  Xác Nhận Xóa File Nguồn Gốc
                </h3>
                <p className="text-xs text-slate-400">
                  Hành động xóa vĩnh viễn dữ liệu trên ổ cứng máy tính
                </p>
              </div>
            </div>

            {/* Preview Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 mb-4 flex items-center gap-3">
              <div className="w-20 h-20 bg-black rounded-xl overflow-hidden flex-shrink-0 border border-slate-800 relative flex items-center justify-center">
                {deleteSourceModal.thumbnailPath ? (
                  <img
                    src={`/media/thumbnails/${deleteSourceModal.thumbnailPath.split(/[\\/]/).pop()}`}
                    alt={deleteSourceModal.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="w-8 h-8 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-100 truncate" title={deleteSourceModal.fileName}>
                  {deleteSourceModal.fileName}
                </p>
                <p className="text-[10px] text-slate-500 font-mono truncate mt-1" title={deleteSourceModal.filePath}>
                  📁 {deleteSourceModal.filePath}
                </p>
                {deleteSourceModal.stage && (
                  <span
                    className="inline-block text-[8px] font-bold px-2 py-0.5 rounded-full mt-2 text-white"
                    style={{
                      backgroundColor: (STAGE_COLORS[deleteSourceModal.stage] || '#64748b') + '50',
                      border: `1px solid ${STAGE_COLORS[deleteSourceModal.stage] || '#64748b'}80`,
                    }}
                  >
                    {STAGE_LABELS[deleteSourceModal.stage] || deleteSourceModal.stage}
                  </span>
                )}
              </div>
            </div>

            {/* Warning Box */}
            <div className="bg-red-950/40 border border-red-500/40 rounded-2xl p-3.5 mb-5">
              <p className="text-xs text-red-200 leading-relaxed font-medium">
                ⚠️ <strong className="text-red-400">CẢNH BÁO NGUY HIỂM:</strong> File video/ảnh gốc này sẽ bị <strong>xóa vĩnh viễn khỏi ổ cứng máy tính</strong> và gỡ bỏ khỏi Thư viện.
              </p>
              <p className="text-[11px] text-red-300/80 mt-1.5 leading-relaxed">
                Timeline sẽ tự động tìm kiếm một footage khác phù hợp trong kho nguồn để thay thế vào vị trí này, giữ nguyên 100% thời lượng slot và nhịp điệu video.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={deleteSourceModal.isDeleting}
                onClick={() => setDeleteSourceModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={deleteSourceModal.isDeleting}
                onClick={handleExecuteDeleteSource}
                className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-red-900/40 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {deleteSourceModal.isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang Xóa File...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác Nhận Xóa Vĩnh Viễn</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ TOAST NOTIFICATION ════════ */}
      {notificationToast.show && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-2.5 text-xs font-bold backdrop-blur-md ${
              notificationToast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50 shadow-emerald-950/50'
                : notificationToast.type === 'error'
                ? 'bg-red-950/90 text-red-200 border-red-500/50 shadow-red-950/50'
                : 'bg-slate-900/90 text-slate-200 border-slate-700 shadow-slate-950/50'
            }`}
          >
            {notificationToast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : notificationToast.type === 'error' ? (
              <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
            ) : null}
            <span>{notificationToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

