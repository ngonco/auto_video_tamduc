import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  Music,
  Sparkles,
  Folder,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Clock,
  History,
  Trash2,
  FolderOpen,
  Play,
  Volume2,
  Edit2,
  Check,
  X,
  Wand2,
  Globe,
  Layers,
  Database,
  Film,
  Shuffle,
  FileEdit,
  List,
  Plus,
  ShieldCheck,
  ArrowDownToLine,
  Loader2,
  CheckSquare,
  Square,
  ExternalLink,
  PlayCircle,
  StopCircle,
  Calendar,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { SubtitleLine } from '../../remotion/types.js';

interface ProjectItem {
  id: string;
  folder_name: string;
  total_videos: number;
  is_embedded: number;
}

export interface BatchQueueItem {
  voiceId: string;
  voiceName: string;
  voicePath: string;
  projectName: string;
  duration: number;
  status: 'waiting' | 'rendering' | 'completed' | 'error';
  percent: number;
  message?: string;
  outputPath?: string;
  error?: string;
}

interface SavedVoiceItem {
  id: string;
  file_name: string;
  file_path: string;
  file_exists?: boolean;
  is_exported?: boolean;
  export_info?: {
    id: string;
    output_path: string;
    created_at: string;
  };
  duration: number;
  stt_text: string;
  raw_words: any[];
  subtitles: SubtitleLine[];
  timeline_project?: any;
  created_at: string;
}

interface GeneratorWizardProps {
  initialProjectId?: string;
  onStorylineGenerated: (data: {
    projectId: string;
    projectName: string;
    voicePath: string;
    voiceUrl: string;
    duration: number;
    subtitles: SubtitleLine[];
    clips: any[];
    availableSources?: any[];
    outro?: {
      filePath: string;
      fileName: string;
      duration: number;
      enabled: boolean;
    } | null;
  }) => void;
}

export const GeneratorWizard: React.FC<GeneratorWizardProps> = ({
  initialProjectId,
  onStorylineGenerated,
}) => {
  // Projects & Source Mode
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [sourceMode, setSourceMode] = useState<'all' | 'single'>('all');
  const [librarySummary, setLibrarySummary] = useState<{
    totalProjects: number;
    totalSources: number;
    totalDuration: number;
    stageStats?: any[];
  } | null>(null);

  // Saved voices history
  const [savedVoices, setSavedVoices] = useState<SavedVoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Batch export state
  const [selectedVoiceIds, setSelectedVoiceIds] = useState<string[]>([]);
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const cancelBatchRef = useRef(false);

  // In-app Video Preview Modal state
  const [previewVideo, setPreviewVideo] = useState<{
    filePath: string;
    title: string;
    duration?: number;
  } | null>(null);

  // Active Voice state
  const [voiceName, setVoiceName] = useState<string>('');
  const [voicePath, setVoicePath] = useState<string>('');
  const [voiceDuration, setVoiceDuration] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [isDraggingVoice, setIsDraggingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // STT & Subtitle states
  const [processingSTT, setProcessingSTT] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [fullTranscript, setFullTranscript] = useState<string>('');
  const [bulkTranscript, setBulkTranscript] = useState<string>('');
  const [subViewMode, setSubViewMode] = useState<'lines' | 'bulk'>('lines');
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [editingSubText, setEditingSubText] = useState<string>('');
  const [savingSubs, setSavingSubs] = useState(false);
  const [resegmenting, setResegmenting] = useState(false);

  // Storyline assembly
  const [assembling, setAssembling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Load projects & library summary & saved voices
  const fetchProjects = () => {
    fetch('/api/library/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
          if (!selectedProjectId && data.data.length > 0) {
            setSelectedProjectId(data.data[0].id);
          }
        }
      });
  };

  const fetchLibrarySummary = () => {
    fetch('/api/generator/library-summary')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLibrarySummary(data.data);
        }
      })
      .catch(() => {});
  };

  const fetchSavedVoices = () => {
    setLoadingVoices(true);
    fetch('/api/generator/voices')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSavedVoices(data.data);
        }
      })
      .finally(() => setLoadingVoices(false));
  };

  useEffect(() => {
    fetchProjects();
    fetchLibrarySummary();
    fetchSavedVoices();
  }, []);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
      setSourceMode('single');
    }
  }, [initialProjectId]);

  // 1. Mở File Explorer để chọn file Voice trực tiếp trên máy tính
  const handlePickVoiceFromFileSystem = async () => {
    try {
      setUploading(true);
      setErrorMsg('');
      const res = await fetch('/api/generator/pick-voice', { method: 'POST' });
      const data = await res.json();

      if (data.success && data.file) {
        setVoiceName(data.file.originalName);
        setVoicePath(data.file.filePath);
        setSubtitles([]);
        setFullTranscript('');
        // Tự động kích hoạt nhận diện & sửa phụ đề
        processVoiceFile(data.file.filePath, data.file.originalName);
      } else if (!data.cancelled) {
        setErrorMsg(data.error || 'Không thể chọn file voice');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setUploading(false);
    }
  };

  // 2. Upload file voice từ kéo thả hoặc input
  const uploadVoiceFile = async (file: File) => {
    if (!file) return;

    setErrorMsg('');
    setVoiceName(file.name);
    setSubtitles([]);
    setFullTranscript('');

    const formData = new FormData();
    formData.append('voice', file);

    try {
      setUploading(true);
      const res = await fetch('/api/generator/upload-voice', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setVoicePath(data.file.filePath);
        setVoiceName(data.file.originalName);
        // Tự động nhận diện & sửa phụ đề
        processVoiceFile(data.file.filePath, data.file.originalName);
      } else {
        setErrorMsg(data.error || 'Lỗi tải file voice');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleVoiceSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadVoiceFile(file);
    }
  };

  // 3. Xử lý STT & Subtitle
  const processVoiceFile = async (filePathToProcess: string, fileName?: string, forceRefresh = false) => {
    if (!filePathToProcess) return;

    try {
      setProcessingSTT(true);
      setErrorMsg('');
      const res = await fetch('/api/generator/process-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: filePathToProcess,
          originalName: fileName || voiceName,
          forceRefresh,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFullTranscript(data.data.rawText);
        setBulkTranscript(data.data.rawText);
        setVoiceDuration(data.data.duration);
        setSubtitles(data.data.subtitles);
        fetchSavedVoices(); // Cập nhật lại lịch sử voice
      } else {
        setErrorMsg(data.error || 'Lỗi xử lý nhận diện giọng nói');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setProcessingSTT(false);
    }
  };

  // Tự động lưu tức thì phụ đề vào SQLite Database
  const autoSaveSubtitles = async (newSubs: SubtitleLine[], newTranscript?: string) => {
    if (!voicePath) return;
    try {
      setSavingSubs(true);
      const textToSave = newTranscript !== undefined ? newTranscript : newSubs.map((s) => s.text).join(' ');
      await fetch('/api/generator/update-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePath,
          subtitles: newSubs,
          fullTranscript: textToSave,
        }),
      });
      fetchSavedVoices();
    } catch (err) {
      console.warn('[GeneratorWizard] Error auto-saving subtitles:', err);
    } finally {
      setSavingSubs(false);
    }
  };

  // Xử lý chỉnh sửa nhanh 1 dòng phụ đề
  const handleStartEditSub = (idx: number, currentText: string) => {
    setEditingSubIdx(idx);
    setEditingSubText(currentText);
  };

  const handleSaveEditSub = async (idx: number) => {
    if (editingSubIdx === null) return;
    const trimmed = editingSubText.trim();
    if (!trimmed) return;

    const newSubs = [...subtitles];
    const targetSub = newSubs[idx];
    if (targetSub) {
      const words = trimmed.split(/\s+/).filter(Boolean);
      const wordDur = Math.max(0.05, targetSub.end - targetSub.start) / words.length;
      newSubs[idx] = {
        ...targetSub,
        text: trimmed,
        words: words.map((w, wIdx) => ({
          word: w,
          start: Number((targetSub.start + wIdx * wordDur).toFixed(2)),
          end: Number((targetSub.start + (wIdx + 1) * wordDur).toFixed(2)),
        })),
      };
      setSubtitles(newSubs);
      await autoSaveSubtitles(newSubs);
    }
    setEditingSubIdx(null);
    setEditingSubText('');
  };

  const handleCancelEditSub = () => {
    setEditingSubIdx(null);
    setEditingSubText('');
  };

  // Xóa 1 dòng phụ đề thừa / ảo giác
  const handleDeleteSubLine = async (idx: number) => {
    const newSubs = subtitles.filter((_, i) => i !== idx);
    setSubtitles(newSubs);
    await autoSaveSubtitles(newSubs);
  };

  // Gộp dòng hiện tại với dòng kế tiếp
  const handleMergeSubWithNext = async (idx: number) => {
    if (idx >= subtitles.length - 1) return;
    const current = subtitles[idx];
    const next = subtitles[idx + 1];
    const merged: SubtitleLine = {
      id: current.id,
      start: current.start,
      end: next.end,
      text: `${current.text} ${next.text}`,
      words: [...current.words, ...next.words],
    };
    const newSubs = [...subtitles.slice(0, idx), merged, ...subtitles.slice(idx + 2)];
    setSubtitles(newSubs);
    await autoSaveSubtitles(newSubs);
  };

  // Áp dụng văn bản tùy chỉnh toàn bài (Bulk Transcript Editor)
  const handleApplyBulkTranscript = async () => {
    if (!bulkTranscript.trim() || !voicePath) return;
    try {
      setResegmenting(true);
      setErrorMsg('');
      const res = await fetch('/api/generator/resegment-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePath,
          customText: bulkTranscript,
          duration: voiceDuration,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubtitles(data.data.subtitles);
        setFullTranscript(data.data.fullTranscript);
        setSubViewMode('lines');
        fetchSavedVoices();
      } else {
        setErrorMsg(data.error || 'Lỗi phân bổ lại phụ đề');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setResegmenting(false);
    }
  };

  // 4. Chọn Voice từ Lịch sử Đã Nạp
  const handleSelectSavedVoice = (saved: SavedVoiceItem) => {
    setVoiceName(saved.file_name);
    setVoicePath(saved.file_path);
    setVoiceDuration(saved.duration);
    setFullTranscript(saved.stt_text || '');
    setBulkTranscript(saved.stt_text || (saved.subtitles || []).map((s) => s.text).join(' '));
    setSubtitles(saved.subtitles || []);
    setErrorMsg('');
  };

  // 4b. Mở lại Dự Án Timeline đã lưu ứng với Voice (1-Click vào thẳng Editor)
  const handleOpenSavedProject = (saved: SavedVoiceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!saved.timeline_project || !saved.timeline_project.clips || saved.timeline_project.clips.length === 0) {
      handleSelectSavedVoice(saved);
      return;
    }

    const voicePath = saved.file_path || saved.timeline_project.voicePath;
    const voiceUrl = `/media/stream?path=${encodeURIComponent(voicePath)}`;
    const duration = Number(saved.timeline_project.duration) || Number(saved.duration) || 0;

    onStorylineGenerated({
      ...saved.timeline_project,
      voicePath,
      voiceUrl,
      duration,
      subtitles: saved.timeline_project.subtitles || saved.subtitles || [],
    });
  };

  // 5. Xóa Voice khỏi Lịch sử
  const handleDeleteSavedVoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/generator/voices/${id}`, { method: 'DELETE' });
      fetchSavedVoices();
      setSelectedVoiceIds((prev) => prev.filter((vId) => vId !== id));
      if (voicePath && savedVoices.find((v) => v.id === id)?.file_path === voicePath) {
        setVoicePath('');
        setVoiceName('');
        setSubtitles([]);
        setFullTranscript('');
        setBulkTranscript('');
        setVoiceDuration(0);
      }
    } catch (_) {}
  };

  // ── XỬ LÝ GOM NHÓM THEO NGÀY (DD/MM/YYYY) & CHỌN HÀNG LOẠT ──
  // Helper format ngày DD/MM/YYYY chuẩn xác
  const formatDateKey = (createdAt?: string): { dateKey: string; sortValue: number } => {
    if (!createdAt) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      return { dateKey: `${day}/${month}/${year}`, sortValue: today.getTime() };
    }

    try {
      const parsed = new Date(createdAt.replace(' ', 'T'));
      if (isNaN(parsed.getTime())) {
        const parts = createdAt.split(/[- : T]/);
        if (parts.length >= 3) {
          const y = parts[0];
          const m = parts[1].padStart(2, '0');
          const d = parts[2].padStart(2, '0');
          return { dateKey: `${d}/${m}/${y}`, sortValue: new Date(Number(y), Number(m) - 1, Number(d)).getTime() };
        }
        return { dateKey: 'Khác', sortValue: 0 };
      }
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = parsed.getFullYear();
      return {
        dateKey: `${day}/${month}/${year}`,
        sortValue: new Date(year, parsed.getMonth(), parsed.getDate()).getTime(),
      };
    } catch (_) {
      return { dateKey: 'Khác', sortValue: 0 };
    }
  };

  interface DateGroup {
    dateKey: string;
    sortValue: number;
    voices: SavedVoiceItem[];
    readyCount: number;
    exportedCount: number;
  }

  // Gom nhóm danh sách voice theo ngày DD/MM/YYYY
  const groupedVoices = useMemo<DateGroup[]>(() => {
    const groupsMap = new Map<string, { sortValue: number; voices: SavedVoiceItem[] }>();

    savedVoices.forEach((v) => {
      const { dateKey, sortValue } = formatDateKey(v.created_at);
      if (!groupsMap.has(dateKey)) {
        groupsMap.set(dateKey, { sortValue, voices: [] });
      }
      groupsMap.get(dateKey)!.voices.push(v);
    });

    const list: DateGroup[] = [];
    groupsMap.forEach((val, dateKey) => {
      const readyCount = val.voices.filter(
        (v) => v.file_exists !== false && v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0
      ).length;
      const exportedCount = val.voices.filter((v) => v.is_exported).length;

      list.push({
        dateKey,
        sortValue: val.sortValue,
        voices: val.voices,
        readyCount,
        exportedCount,
      });
    });

    // Sắp xếp ngày mới nhất lên đầu
    list.sort((a, b) => b.sortValue - a.sortValue);
    return list;
  }, [savedVoices]);

  // Quản lý trạng thái mở/đóng từng ngày (Mặc định chỉ mở ngày mới nhất)
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (groupedVoices.length > 0) {
      setExpandedDates((prev) => {
        const newestKey = groupedVoices[0].dateKey;
        if (Object.keys(prev).length === 0) {
          const initial: Record<string, boolean> = {};
          groupedVoices.forEach((g, idx) => {
            initial[g.dateKey] = idx === 0; // Mặc định chỉ mở ngày mới nhất
          });
          return initial;
        }
        if (prev[newestKey] === undefined) {
          return { ...prev, [newestKey]: true };
        }
        return prev;
      });
    }
  }, [groupedVoices]);

  const toggleDateGroup = (dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const handleExpandAllDates = () => {
    const next: Record<string, boolean> = {};
    groupedVoices.forEach((g) => {
      next[g.dateKey] = true;
    });
    setExpandedDates(next);
  };

  const handleCollapseAllDates = () => {
    const next: Record<string, boolean> = {};
    groupedVoices.forEach((g) => {
      next[g.dateKey] = false;
    });
    setExpandedDates(next);
  };

  const handleSelectAllInDateGroup = (group: DateGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const readyInGroup = group.voices.filter(
      (v) => v.file_exists !== false && v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0
    );
    const readyIds = readyInGroup.map((v) => v.id);
    const allSelected = readyIds.length > 0 && readyIds.every((id) => selectedVoiceIds.includes(id));

    if (allSelected) {
      setSelectedVoiceIds((prev) => prev.filter((id) => !readyIds.includes(id)));
    } else {
      setSelectedVoiceIds((prev) => [...new Set([...prev, ...readyIds])]);
    }
  };

  // Danh sách các voice đã dựng timeline sẵn sàng xuất
  const readyVoices = savedVoices.filter(
    (v) => v.file_exists !== false && v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0
  );

  const handleToggleSelectVoice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVoiceIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleSelectAllReady = () => {
    setSelectedVoiceIds(readyVoices.map((v) => v.id));
  };

  const handleSelectUnexportedOnly = () => {
    const unexported = readyVoices.filter((v) => !v.is_exported);
    setSelectedVoiceIds(unexported.map((v) => v.id));
  };

  const handleDeselectAll = () => {
    setSelectedVoiceIds([]);
  };

  const handleOpenExportedFolder = async (filePath?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch('/api/render/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
    } catch (_) {}
  };

  const handlePlayExportedVideo = async (filePath?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch('/api/render/open-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
    } catch (_) {}
  };

  const handleOpenVideoPreview = (filePath?: string, title?: string, duration?: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!filePath) return;
    setPreviewVideo({
      filePath,
      title: title || filePath.split(/[/\\]/).pop() || 'Video Xuất Bản',
      duration,
    });
  };

  const handleDownloadVideo = (filePath?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!filePath) return;
    const downloadUrl = `/api/render/download?path=${encodeURIComponent(filePath)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filePath.split(/[/\\]/).pop() || 'Video_TamDuc.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCancelBatchRender = () => {
    cancelBatchRef.current = true;
    setIsBatchRendering(false);
  };

  const handleStartBatchRender = async () => {
    const toRender = savedVoices.filter(
      (v) => selectedVoiceIds.includes(v.id) && v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0
    );

    if (toRender.length === 0) return;

    const initialQueue: BatchQueueItem[] = toRender.map((v) => ({
      voiceId: v.id,
      voiceName: v.file_name,
      voicePath: v.file_path,
      projectName: v.timeline_project.projectName || v.file_name.replace(/\.[^/.]+$/, ''),
      duration: Number(v.timeline_project.duration) || Number(v.duration) || 0,
      status: 'waiting',
      percent: 0,
      message: 'Đang chờ tới lượt...',
    }));

    setBatchQueue(initialQueue);
    setShowBatchModal(true);
    setIsBatchRendering(true);
    setCurrentBatchIndex(0);
    cancelBatchRef.current = false;

    for (let i = 0; i < toRender.length; i++) {
      if (cancelBatchRef.current) break;

      setCurrentBatchIndex(i);
      const item = toRender[i];
      const tp = item.timeline_project;

      setBatchQueue((prev) =>
        prev.map((q, idx) =>
          idx === i ? { ...q, status: 'rendering', message: 'Đang khởi động render video...' } : q
        )
      );

      try {
        const res = await fetch('/api/render/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: tp.projectName || item.file_name.replace(/\.[^/.]+$/, ''),
            voicePath: item.file_path,
            bgmPath: tp.bgmPath,
            bgmVolume: tp.bgmVolume,
            voiceVolume: tp.voiceVolume,
            duckingVolume: tp.duckingVolume,
            clips: tp.clips,
            subtitles: tp.subtitles || item.subtitles || [],
            subtitleFontSize: tp.subtitleStyles?.fontSize || 65,
            subtitleBottomPercent: tp.subtitleStyles?.bottomPercent || 22,
            outroPath: tp.outro?.enabled ? tp.outro?.filePath : undefined,
            outroEnabled: Boolean(tp.outro?.enabled),
            outroDuration: tp.outro?.enabled ? tp.outro?.duration : 0,
          }),
        });

        const startData = await res.json();
        if (!startData.success || !startData.jobId) {
          throw new Error(startData.error || 'Không thể khởi động render');
        }

        const jobId = startData.jobId;
        await new Promise<void>((resolve) => {
          const interval = setInterval(async () => {
            if (cancelBatchRef.current) {
              clearInterval(interval);
              resolve();
              return;
            }

            try {
              const statusRes = await fetch(`/api/render/status/${jobId}`);
              const statusData = await statusRes.json();

              if (statusData.success && statusData.data) {
                const { status, percent, message, outputPath, error } = statusData.data;

                setBatchQueue((prev) =>
                  prev.map((q, idx) =>
                    idx === i
                      ? {
                          ...q,
                          percent: percent || 0,
                          message: message || q.message,
                        }
                      : q
                  )
                );

                if (status === 'completed') {
                  clearInterval(interval);
                  setBatchQueue((prev) =>
                    prev.map((q, idx) =>
                      idx === i
                        ? {
                            ...q,
                            status: 'completed',
                            percent: 100,
                            message: 'Xuất video thành công!',
                            outputPath,
                          }
                        : q
                    )
                  );
                  resolve();
                } else if (status === 'error') {
                  clearInterval(interval);
                  setBatchQueue((prev) =>
                    prev.map((q, idx) =>
                      idx === i
                        ? {
                            ...q,
                            status: 'error',
                            message: error || 'Lỗi render video',
                            error: error || 'Lỗi render',
                          }
                        : q
                    )
                  );
                  resolve();
                }
              }
            } catch (pollErr: any) {
              console.warn('[BatchRender] Poll error:', pollErr);
            }
          }, 1200);
        });
      } catch (err: any) {
        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? {
                  ...q,
                  status: 'error',
                  message: err.message || 'Lỗi xử lý',
                  error: err.message,
                }
              : q
          )
        );
      }
    }

    setIsBatchRendering(false);
    fetchSavedVoices();
  };

  // 6. Lắp ráp Storyline & Mở Timeline Editor
  const handleAssembleStoryline = async () => {
    if (sourceMode === 'single' && !selectedProjectId) {
      setErrorMsg('Vui lòng chọn 1 Folder công trình hoặc chuyển sang chế độ Tự Động Tổng Hợp');
      return;
    }
    if (subtitles.length === 0 || voiceDuration === 0 || !voicePath) {
      setErrorMsg('Vui lòng nạp Voice và hoàn tất nhận diện phụ đề trước khi lắp ráp');
      return;
    }

    try {
      setAssembling(true);
      setErrorMsg('');

      const res = await fetch('/api/generator/assemble-storyline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: sourceMode,
          projectId: sourceMode === 'single' ? selectedProjectId : undefined,
          targetDuration: voiceDuration,
        }),
      });

      const data = await res.json();
      if (data.success) {
        let projName = 'ToanBoThuVien_TamDuc';
        if (sourceMode === 'single') {
          projName = projects.find((p) => p.id === selectedProjectId)?.folder_name || 'CongTrinh_TamDuc';
        } else {
          projName = 'TongHop_ToanBoThuVien';
        }
        const voiceUrl = `/media/stream?path=${encodeURIComponent(voicePath)}`;

        const newProjectData = {
          projectId: sourceMode === 'single' ? selectedProjectId : 'ALL_PROJECTS',
          projectName: projName,
          voicePath,
          voiceUrl,
          duration: voiceDuration,
          subtitles,
          clips: data.data.clips,
          availableSources: data.data.availableSources || [],
          outro: data.data.outro || null,
        };

        // Tự động lưu dự án ban đầu vào CSDL SQLite
        try {
          fetch('/api/generator/save-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              voicePath,
              timelineData: newProjectData,
            }),
          });
        } catch (_) {}

        onStorylineGenerated(newProjectData);
      } else {
        setErrorMsg(data.error || 'Lỗi lắp ráp kịch bản video');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAssembling(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-extrabold text-slate-100 font-montserrat flex items-center justify-center gap-3">
          <Sparkles className="w-6 h-6 text-yellow-400" />
          Quy Trình Tạo Video Tự Động 1-Click
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Bóc tách giọng nói, ghi nhớ voice, chuẩn hóa phụ đề và tự động phân bổ 4 giai đoạn video 9:16
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* BƯỚC 1: TẢI HOẶC CHỌN FILE VOICE */}
        <div className="bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="font-bold text-slate-100 text-sm font-montserrat">
                Nạp File Âm Thanh Voice Tiếng Việt (.mp3, .wav, .m4a)
              </h3>
            </div>
            {savedVoices.length > 0 && (
              <span className="text-xs text-amber-400/80 flex items-center gap-1 font-semibold">
                <History className="w-3.5 h-3.5" />
                {savedVoices.length} Voice Đã Ghi Nhớ
              </span>
            )}
          </div>

          {/* KHUNG NẠP VOICE DUY NHẤT (UNIFIED DRAG & DROP + EXPLORER BROWSE ZONE) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingVoice(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingVoice(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingVoice(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                uploadVoiceFile(file);
              }
            }}
            className={`relative mb-4 p-6 rounded-2xl border-2 border-dashed transition-all duration-200 text-center flex flex-col items-center justify-center gap-3 select-none ${
              isDraggingVoice
                ? 'border-amber-400 bg-amber-500/15 shadow-xl shadow-amber-500/20 scale-[1.01]'
                : 'border-amber-500/40 hover:border-amber-400 bg-gradient-to-b from-amber-500/10 via-slate-900/60 to-slate-900/80 hover:bg-amber-500/15'
            }`}
          >
            {/* Hidden native input for browser fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleVoiceSelected}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
              {uploading || processingSTT ? (
                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
              ) : isDraggingVoice ? (
                <Upload className="w-7 h-7 animate-bounce text-amber-300" />
              ) : (
                <Music className="w-7 h-7 text-amber-400" />
              )}
            </div>

            <div className="max-w-md">
              <p className="text-sm font-bold text-slate-100 mb-1">
                {isDraggingVoice ? (
                  <span className="text-amber-300 font-extrabold">Thả file âm thanh vào đây để nạp ngay!</span>
                ) : (
                  <span>Chọn hoặc Kéo Thả File Voice Tiếng Việt (.mp3, .wav, .m4a)</span>
                )}
              </p>
              <p className="text-xs text-slate-400">
                Kéo thả file âm thanh trực tiếp vào khung này hoặc bấm nút bên dưới để mở thư mục
              </p>
            </div>

            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={handlePickVoiceFromFileSystem}
                disabled={uploading || processingSTT}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                title="Mở hộp thoại Windows để chọn nhanh file voice từ ổ cứng"
              >
                <FolderOpen className="w-4 h-4 fill-current text-slate-950" />
                <span>📁 Chọn File Trên Máy</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || processingSTT}
                className="px-3 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Chọn file qua trình duyệt web"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                <span>Tải Từ Trình Duyệt</span>
              </button>
            </div>
          </div>

          {/* LỊCH SỬ VOICE ĐÃ NẠP & XUẤT HÀNG LOẠT (GOM THEO NGÀY DD/MM/YYYY) */}
          {savedVoices.length > 0 && (
            <div className="mb-4 pt-4 border-t border-slate-800">
              {/* Toolbar: Tiêu đề + Các nút chọn nhanh + Nút Xuất Hàng Loạt */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 bg-slate-900/70 p-3 rounded-2xl border border-slate-800 shadow-md">
                <div className="flex items-center gap-2 flex-wrap">
                  <History className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-extrabold text-slate-200">
                    Danh Sách Voice ({savedVoices.length})
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold">
                    {groupedVoices.length} ngày
                  </span>
                  {selectedVoiceIds.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                      Đã chọn {selectedVoiceIds.length} video
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      ({readyVoices.length} video sẵn sàng)
                    </span>
                  )}
                </div>

                {/* Batch selection buttons & action */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExpandAllDates}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-[10px] transition cursor-pointer border border-slate-700/60"
                    title="Mở rộng tất cả các nhóm ngày"
                  >
                    Mở Hết
                  </button>

                  <button
                    type="button"
                    onClick={handleCollapseAllDates}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-[10px] transition cursor-pointer border border-slate-700/60"
                    title="Thu gọn tất cả các nhóm ngày"
                  >
                    Thu Hết
                  </button>

                  <div className="h-4 w-px bg-slate-800 mx-0.5" />

                  <button
                    type="button"
                    onClick={handleSelectAllReady}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-semibold border border-slate-700 transition cursor-pointer"
                    title="Chọn toàn bộ các Voice đã có kịch bản timeline"
                  >
                    Chọn Tất Cả ({readyVoices.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectUnexportedOnly}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 rounded-lg text-[10px] font-semibold border border-amber-500/30 transition cursor-pointer"
                    title="Chỉ chọn các Voice đã có timeline nhưng chưa xuất video"
                  >
                    Chỉ Chưa Xuất ({readyVoices.filter((v) => !v.is_exported).length})
                  </button>

                  {selectedVoiceIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-[10px] transition cursor-pointer"
                    >
                      Bỏ Chọn
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStartBatchRender}
                    disabled={selectedVoiceIds.length === 0 || isBatchRendering}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition cursor-pointer ${
                      selectedVoiceIds.length > 0
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/25 active:scale-95'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Xuất Hàng Loạt {selectedVoiceIds.length > 0 ? `(${selectedVoiceIds.length})` : ''}</span>
                  </button>
                </div>
              </div>

              {/* Danh Sách Gom Nhóm Theo Ngày (Accordion Groups) */}
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {groupedVoices.map((group, groupIdx) => {
                  const isExpanded = expandedDates[group.dateKey] ?? (groupIdx === 0);
                  const readyInGroup = group.voices.filter(
                    (v) => v.file_exists !== false && v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0
                  );
                  const allSelectedInGroup = readyInGroup.length > 0 && readyInGroup.every((v) => selectedVoiceIds.includes(v.id));
                  const someSelectedInGroup = readyInGroup.some((v) => selectedVoiceIds.includes(v.id));

                  return (
                    <div
                      key={group.dateKey}
                      className="rounded-2xl border border-slate-800/90 bg-slate-900/40 overflow-hidden shadow-sm transition"
                    >
                      {/* Date Header / Toggle Button */}
                      <div
                        onClick={() => toggleDateGroup(group.dateKey)}
                        className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                          isExpanded
                            ? 'bg-slate-800/80 border-b border-slate-800 text-slate-200'
                            : 'hover:bg-slate-800/50 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <button
                            type="button"
                            className="p-0.5 text-slate-400 hover:text-white transition"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-amber-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-extrabold text-xs text-slate-100 font-mono">
                              Ngày {group.dateKey}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                              {group.voices.length} voice
                            </span>
                            {group.exportedCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                {group.exportedCount} đã xuất
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Nút tác vụ nhanh: Chọn tất cả trong ngày */}
                        <div className="flex items-center gap-2">
                          {readyInGroup.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleSelectAllInDateGroup(group, e)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                                allSelectedInGroup
                                  ? 'bg-amber-500 text-slate-950 border-amber-500 font-extrabold'
                                  : someSelectedInGroup
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border-slate-700'
                              }`}
                              title="Tick chọn toàn bộ các video đã dựng timeline trong ngày này"
                            >
                              <Check className="w-3 h-3" />
                              <span>{allSelectedInGroup ? 'Bỏ chọn ngày' : `Chọn ngày (${readyInGroup.length})`}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Group Content (Cards Grid) */}
                      {isExpanded && (
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40">
                          {group.voices.map((v) => {
                            const isCurrent = voicePath === v.file_path;
                            const hasProject = Boolean(v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0);
                            const clipCount = hasProject ? v.timeline_project.clips.length : 0;
                            const isSelected = selectedVoiceIds.includes(v.id);
                            const isSelectable = hasProject && v.file_exists !== false;

                            return (
                              <div
                                key={v.id}
                                onClick={() => handleSelectSavedVoice(v)}
                                className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between gap-2.5 relative ${
                                  isSelected
                                    ? 'bg-amber-950/30 border-amber-500/80 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/40'
                                    : isCurrent
                                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                                }`}
                              >
                                {/* Top row: Checkbox + Trạng thái Xuất Video + Nút xóa */}
                                <div className="flex items-center justify-between gap-2">
                                  {/* Checkbox */}
                                  <div
                                    onClick={(e) => {
                                      if (isSelectable) {
                                        handleToggleSelectVoice(v.id, e);
                                      } else {
                                        e.stopPropagation();
                                      }
                                    }}
                                    className={`flex items-center gap-1.5 select-none ${
                                      isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                                    }`}
                                    title={
                                      !hasProject
                                        ? 'Cần tạo timeline trước khi chọn xuất video'
                                        : v.file_exists === false
                                        ? 'File âm thanh bị thiếu trên máy'
                                        : 'Chọn để xuất video hàng loạt'
                                    }
                                  >
                                    <div
                                      className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                        isSelected
                                          ? 'bg-amber-500 border-amber-500 text-slate-950'
                                          : isSelectable
                                          ? 'border-slate-600 bg-slate-800 hover:border-amber-400'
                                          : 'border-slate-700 bg-slate-900'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </div>

                                  {/* Status Badge */}
                                  <div className="flex items-center gap-1 flex-1 justify-end truncate">
                                    {v.is_exported ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                          <span>Đã Xuất</span>
                                        </span>
                                        {v.export_info?.output_path && (
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={(e) => handleOpenVideoPreview(v.export_info?.output_path, v.file_name, v.duration, e)}
                                              className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 transition cursor-pointer flex items-center gap-1 shadow-sm"
                                              title="Xem trực tiếp video vừa xuất ngay trên trình duyệt"
                                            >
                                              <Play className="w-2.5 h-2.5 fill-current" />
                                              <span>Xem</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => handleDownloadVideo(v.export_info?.output_path, e)}
                                              className="p-1 rounded bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition cursor-pointer border border-slate-700/60"
                                              title="Lưu / Tải file MP4 về máy"
                                            >
                                              <ArrowDownToLine className="w-3 h-3 text-amber-400" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => handleOpenExportedFolder(v.export_info?.output_path, e)}
                                              className="p-1 rounded bg-slate-800 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 transition cursor-pointer border border-slate-700/60"
                                              title="Mở thư mục chứa file video trên Windows Explorer"
                                            >
                                              <FolderOpen className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    ) : hasProject ? (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Chưa Xuất</span>
                                      </span>
                                    ) : (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50 font-normal">
                                        Chưa có timeline
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteSavedVoice(v.id, e)}
                                      className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer ml-1"
                                      title="Xóa voice này khỏi lịch sử"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Main info row */}
                                <div className="flex items-start gap-2.5">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    isCurrent ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    <Music className="w-4 h-4" />
                                  </div>
                                  <div className="truncate flex-1">
                                    <p className="font-bold truncate text-[11px] text-slate-100">{v.file_name}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                                      <span className="font-mono text-amber-400/90">{v.duration.toFixed(1)}s</span>
                                      <span>•</span>
                                      <span>{v.subtitles?.length || 0} dòng sub</span>
                                      {v.file_exists === false && (
                                        <span className="text-[9px] text-red-400 bg-red-500/15 px-1.5 py-0.2 rounded border border-red-500/30 font-semibold">
                                          ⚠️ File bị thiếu
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {/* Footer thẻ: Badge dự án & Nút Mở Lại Dự Án */}
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 mt-0.5">
                                  {hasProject ? (
                                    <div className="flex items-center justify-between w-full gap-2">
                                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-bold">
                                        <Film className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>{clipCount} clips</span>
                                      </span>

                                      <button
                                        type="button"
                                        onClick={(e) => handleOpenSavedProject(v, e)}
                                        className="px-2.5 py-1 bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-300 hover:text-emerald-100 rounded-lg text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1 transition shadow-sm cursor-pointer"
                                        title="Mở thẳng kịch bản Timeline đã lưu trước đó"
                                      >
                                        <span>🎬 Mở Lại Dự Án</span>
                                        <ArrowRight className="w-3 h-3 text-emerald-400" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-500 italic">
                                      Chưa tạo kịch bản timeline
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Voice Đang Chọn */}
          {voicePath && (
            <div className="mt-3 flex items-center justify-between bg-slate-900 p-3.5 rounded-xl border border-amber-500/30">
              <div className="flex items-center gap-3 truncate">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100 truncate">{voiceName}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                    {voicePath} {voiceDuration > 0 && `• ${voiceDuration.toFixed(1)}s`}
                  </p>
                </div>
              </div>

              {(!subtitles.length || subtitles.length === 0) && (
                <button
                  onClick={() => processVoiceFile(voicePath, voiceName)}
                  disabled={processingSTT}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold transition disabled:opacity-50 flex-shrink-0"
                >
                  {processingSTT ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang Nhận Diện & Sửa Phụ Đề...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Nhận Diện Phụ Đề Ngay
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Hiển Thị Subtitle Đã Xử Lý */}
          {subtitles.length > 0 && (
            <div className="mt-4 p-4 bg-slate-900/90 rounded-xl border border-amber-500/20 text-xs">
              {/* Header thanh công cụ Subtitles */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5 font-montserrat">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Phụ Đề ({subtitles.length} dòng • {voiceDuration.toFixed(1)}s):
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    AI Cleaned & Spell-Checked
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {savingSubs ? '💾 Đang lưu...' : '✓ Đã lưu Database'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Chuyển chế độ xem */}
                  <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSubViewMode('lines')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition ${
                        subViewMode === 'lines'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <List className="w-3 h-3" />
                      Từng Dòng
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkTranscript(fullTranscript || subtitles.map((s) => s.text).join(' '));
                        setSubViewMode('bulk');
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition ${
                        subViewMode === 'bulk'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileEdit className="w-3 h-3" />
                      Sửa Toàn Bộ
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => processVoiceFile(voicePath, voiceName, true)}
                    disabled={processingSTT}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition disabled:opacity-50"
                    title="Chạy lại Gemini 3.1 Flash Lite để sửa chính tả ngữ cảnh & lọc ảo giác"
                  >
                    <Wand2 className={`w-3 h-3 ${processingSTT ? 'animate-spin' : ''}`} />
                    {processingSTT ? 'Đang sửa AI...' : 'Chạy Lại Sửa AI'}
                  </button>
                </div>
              </div>

              {/* CHẾ ĐỘ 1: XEM & SỬA TỪNG DÒNG (Line-by-line Editor) */}
              {subViewMode === 'lines' && (
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-2">
                  {subtitles.map((sub, i) => {
                    const isEditing = editingSubIdx === i;
                    const isLast = i === subtitles.length - 1;
                    return (
                      <div
                        key={sub.id || i}
                        className={`group p-2 rounded-lg transition ${
                          isEditing
                            ? 'bg-amber-500/10 border border-amber-500/40'
                            : 'hover:bg-slate-800/60 bg-slate-950/40 border border-slate-800/50 flex items-center justify-between gap-2'
                        }`}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <span className="text-slate-500 font-mono text-[10px] w-14 flex-shrink-0">
                              {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s:
                            </span>
                            <input
                              type="text"
                              value={editingSubText}
                              onChange={(e) => setEditingSubText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditSub(i);
                                if (e.key === 'Escape') handleCancelEditSub();
                              }}
                              autoFocus
                              className="flex-1 bg-slate-950 border border-amber-500/50 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditSub(i)}
                              className="p-1 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded"
                              title="Lưu (Enter)"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditSub}
                              className="p-1 bg-slate-800 text-slate-400 hover:bg-slate-700 rounded"
                              title="Hủy (Esc)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-1 min-w-0">
                              <span className="text-slate-500 font-mono text-[10px] w-20 flex-shrink-0 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-center">
                                {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s
                              </span>
                              <span className="font-medium text-slate-200 truncate">{sub.text}</span>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEditSub(i, sub.text)}
                                className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition"
                                title="Sửa nhanh dòng này"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {!isLast && (
                                <button
                                  type="button"
                                  onClick={() => handleMergeSubWithNext(i)}
                                  className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition"
                                  title="Gộp với dòng kế tiếp"
                                >
                                  <ArrowDownToLine className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteSubLine(i)}
                                className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
                                title="Xóa dòng này (nếu câu thừa/ảo giác)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CHẾ ĐỘ 2: SỬA TOÀN BỘ VĂN BẢN (Bulk Transcript Editor) */}
              {subViewMode === 'bulk' && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-slate-400">
                    Chỉnh sửa hoặc xóa các đoạn văn bản thừa trực tiếp dưới đây. Khi nhấn "Áp Dụng", hệ thống sẽ tự động phân bổ lại mốc thời gian và chia dòng 9:16 tối ưu:
                  </p>
                  <textarea
                    value={bulkTranscript}
                    onChange={(e) => setBulkTranscript(e.target.value)}
                    rows={5}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-amber-400 leading-relaxed font-sans"
                    placeholder="Nhập hoặc chỉnh sửa toàn bộ văn bản của giọng đọc..."
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {bulkTranscript.trim().split(/\s+/).filter(Boolean).length} từ • {voiceDuration.toFixed(1)}s
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSubViewMode('lines')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyBulkTranscript}
                        disabled={resegmenting || !bulkTranscript.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 rounded-lg text-xs font-bold transition shadow-md shadow-amber-500/20 disabled:opacity-50"
                      >
                        {resegmenting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Đang Phân Dòng...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                            Áp Dụng & Tự Động Phân Dòng 9:16
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* BƯỚC 2: CHỌN NGUỒN FOOTAGE CÔNG TRÌNH */}
        <div className="bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">
                2
              </span>
              <div>
                <h3 className="font-bold text-slate-100 text-sm font-montserrat">
                  Chọn Nguồn Footage Cho Video
                </h3>
                <p className="text-[11px] text-slate-400">
                  Lựa chọn 1 công trình riêng biệt hoặc để AI tự động chọn lọc từ toàn bộ thư viện
                </p>
              </div>
            </div>

            {/* TAB CHỌN CHẾ ĐỘ */}
            <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSourceMode('all')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  sourceMode === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Toàn Bộ Thư Viện (Trộn AI)
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('single')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  sourceMode === 'single'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                1 Công Trình Cụ Thể
              </button>
            </div>
          </div>

          {/* CHẾ ĐỘ 1: TOÀN BỘ THƯ VIỆN (SMART MIX) */}
          {sourceMode === 'all' && (
            <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-amber-950/20 border border-amber-500/30 rounded-2xl p-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-300 font-montserrat flex items-center gap-2">
                      Tự Động Lọc & Trộn Thông Minh Đa Chiều
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                        Anti-Repetition Active
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Thuật toán phân bổ tự động theo 4 giai đoạn tiến trình không gian thờ và chống trùng lặp góc máy.
                    </p>
                  </div>
                </div>

                {librarySummary && (
                  <div className="flex items-center gap-3 text-xs bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
                    <div className="text-center px-2">
                      <p className="text-[10px] text-slate-500 font-mono">Công trình</p>
                      <p className="font-bold text-amber-300">{librarySummary.totalProjects}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-2">
                      <p className="text-[10px] text-slate-500 font-mono">Tổng Clip/Ảnh</p>
                      <p className="font-bold text-emerald-400">{librarySummary.totalSources}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-2">
                      <p className="text-[10px] text-slate-500 font-mono">Thời lượng</p>
                      <p className="font-bold text-cyan-300">{librarySummary.totalDuration}s</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Các ưu điểm của chế độ All */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                <div className="flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-200 block font-semibold">Ưu tiên Video trước:</strong>
                    Tự động chọn video sắc nét 9:16, chỉ bù ảnh tĩnh Ken Burns khi thiếu video.
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-emerald-200 block font-semibold">Chống trùng lặp vừa phải:</strong>
                    Luân phiên các công trình, cấm 2 clip liên tiếp cùng 1 file, tịnh tiến góc quay video dài.
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-cyan-200 block font-semibold">Ghi nhớ lịch sử sử dụng:</strong>
                    Ưu tiên các góc quay mới lạ chưa từng xuất hiện trong các video đã tạo trước đó.
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-yellow-200 block font-semibold">Chuẩn 4 Giai Đoạn:</strong>
                    Thô (0-20%) ➔ Lắp ráp (20-50%) ➔ Trang trí (50-75%) ➔ Đèn hào quang & Lễ Phật (75-100%).
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CHẾ ĐỘ 2: CHỌN 1 CÔNG TRÌNH CỤ THỂ */}
          {sourceMode === 'single' && (
            <div>
              {projects.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs bg-slate-900/50 rounded-xl border border-slate-800">
                  Chưa có công trình nào trong thư viện. Vui lòng thêm công trình tại tab "Thư Viện Source".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {projects.map((proj) => {
                    const isSelected = selectedProjectId === proj.id;
                    return (
                      <div
                        key={proj.id}
                        onClick={() => setSelectedProjectId(proj.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/60 shadow-md shadow-amber-500/10'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Folder className={`w-5 h-5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                          <div>
                            <p className={`text-xs font-bold line-clamp-1 ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                              {proj.folder_name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {proj.total_videos} videos {proj.is_embedded ? '• Đã Nhúng AI' : ''}
                            </p>
                          </div>
                        </div>

                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BƯỚC 3: NÚT LẮP RÁP TIMELINE */}
        <div className="pt-2">
          <button
            onClick={handleAssembleStoryline}
            disabled={assembling || subtitles.length === 0 || (sourceMode === 'single' && !selectedProjectId)}
            className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-40"
          >
            {assembling ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Đang Phân Bổ 4 Giai Đoạn & Tạo Timeline...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 fill-slate-950" />
                ⚡ TỰ ĐỘNG LẮP RÁP VIDEO 9:16 & MỞ TRÌNH DỰNG TIMELINE
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ════════ BATCH RENDER MODAL ════════ */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151D2E] border border-amber-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-100 font-montserrat flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  Tiến Trình Xuất Video Hàng Loạt (Batch Export)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isBatchRendering
                    ? `Đang xử lý tuần tự Video ${currentBatchIndex + 1} / ${batchQueue.length}`
                    : 'Đã hoàn tất tiến trình xuất hàng loạt!'}
                </p>
              </div>
              {!isBatchRendering && (
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-1.5 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Tổng Tiến Độ Hàng Đợi</span>
                <span className="text-amber-400 font-mono">
                  {batchQueue.filter((q) => q.status === 'completed').length} / {batchQueue.length} Hoàn Tất
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300"
                  style={{
                    width: `${
                      batchQueue.length > 0
                        ? ((batchQueue.filter((q) => q.status === 'completed').length +
                            (batchQueue[currentBatchIndex]?.status === 'rendering'
                              ? (batchQueue[currentBatchIndex]?.percent || 0) / 100
                              : 0)) /
                            batchQueue.length) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Active Render Item Details */}
            {isBatchRendering && batchQueue[currentBatchIndex] && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-200 truncate flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    Đang xuất: {batchQueue[currentBatchIndex].projectName}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {batchQueue[currentBatchIndex].percent}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-200"
                    style={{ width: `${batchQueue[currentBatchIndex].percent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  {batchQueue[currentBatchIndex].message || 'Đang xử lý...'}
                </p>
              </div>
            )}

            {/* Queue List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {batchQueue.map((item, idx) => {
                return (
                  <div
                    key={item.voiceId}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                      item.status === 'rendering'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                        : item.status === 'completed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : item.status === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate flex-1">
                      <div className="flex-shrink-0">
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : item.status === 'rendering' ? (
                          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                        ) : item.status === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                      <div className="truncate flex-1">
                        <p className="font-bold truncate text-[11px] text-slate-200">{item.projectName}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {item.duration.toFixed(1)}s • {item.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.status === 'completed' && item.outputPath && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenVideoPreview(item.outputPath, item.projectName, item.duration)}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 transition cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Xem video ngay trên trình duyệt"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Xem</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadVideo(item.outputPath)}
                            className="p-1 rounded bg-slate-800 hover:bg-amber-500/30 text-amber-400 transition cursor-pointer border border-slate-700"
                            title="Lưu / Tải video về máy (.mp4)"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenExportedFolder(item.outputPath)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-slate-700"
                            title="Mở thư mục"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <span className="text-[10px] font-mono font-bold">
                        {item.status === 'completed'
                          ? '100%'
                          : item.status === 'rendering'
                          ? `${item.percent}%`
                          : item.status === 'error'
                          ? 'Lỗi'
                          : 'Chờ'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleOpenExportedFolder()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Mở Thư Mục Exports</span>
              </button>

              {isBatchRendering ? (
                <button
                  type="button"
                  onClick={handleCancelBatchRender}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <StopCircle className="w-4 h-4 text-red-400" />
                  <span>Dừng Hàng Đợi</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  Hoàn Tất & Đóng
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ TRÌNH XEM VIDEO TRỰC TIẾP TRÊN TRÌNH DUYỆT (PREVIEW & DOWNLOAD MODAL) ════════ */}
      {previewVideo && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-amber-500/40 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="truncate pr-3">
                <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-2 truncate">
                  <PlayCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="truncate">{previewVideo.title}</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  {previewVideo.filePath}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Đóng trình xem video"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player 9:16 Aspect ratio container */}
            <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center max-h-[60vh] border border-slate-800 shadow-inner">
              <video
                key={previewVideo.filePath}
                src={`/media/stream?path=${encodeURIComponent(previewVideo.filePath)}`}
                controls
                autoPlay
                playsInline
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleDownloadVideo(previewVideo.filePath, e)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/25 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>⬇️ Lưu / Tải Video Về Máy (.MP4)</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleOpenExportedFolder(previewVideo.filePath, e)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Mở thư mục chứa file video trên Windows Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mở Thư Mục</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handlePlayExportedVideo(previewVideo.filePath, e)}
                  className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-xl border border-slate-700/60 transition flex items-center gap-1.5 cursor-pointer"
                  title="Phát bằng trình xem video mặc định của Windows"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở Windows Player</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewVideo(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition cursor-pointer"
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
