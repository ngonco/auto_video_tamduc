import React, { useState, useEffect } from 'react';
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
  ArrowDownToLine
} from 'lucide-react';
import { SubtitleLine } from '../../remotion/types.js';

interface ProjectItem {
  id: string;
  folder_name: string;
  total_videos: number;
  is_embedded: number;
}

interface SavedVoiceItem {
  id: string;
  file_name: string;
  file_path: string;
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

  // Active Voice state
  const [voiceName, setVoiceName] = useState<string>('');
  const [voicePath, setVoicePath] = useState<string>('');
  const [voiceDuration, setVoiceDuration] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

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

  // 2. Upload file voice từ trình duyệt
  const handleVoiceSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

    const voiceUrl = `/media/stream?path=${encodeURIComponent(saved.file_path)}`;
    onStorylineGenerated({
      ...saved.timeline_project,
      voicePath: saved.file_path,
      voiceUrl,
      duration: saved.duration,
      subtitles: saved.timeline_project.subtitles || saved.subtitles || [],
    });
  };

  // 5. Xóa Voice khỏi Lịch sử
  const handleDeleteSavedVoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/generator/voices/${id}`, { method: 'DELETE' });
      fetchSavedVoices();
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

          {/* 2 Nút Chọn Voice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Nút 1: Mở File Explorer trực tiếp trên máy */}
            <button
              onClick={handlePickVoiceFromFileSystem}
              disabled={uploading || processingSTT}
              className="p-5 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:from-amber-500/30 border-2 border-dashed border-amber-500/50 hover:border-amber-400 rounded-xl text-left transition flex items-center gap-4 group disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-100 group-hover:text-amber-300 transition">
                  📁 Chọn File Voice Trên Máy
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mở hộp thoại Windows để chọn nhanh từ thư mục audio
                </p>
              </div>
            </button>

            {/* Nút 2: Tải lên qua kéo thả */}
            <div className="relative border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-5 text-left transition bg-slate-900/40 group flex items-center gap-4 cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                onChange={handleVoiceSelected}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center flex-shrink-0 group-hover:text-slate-200 transition">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200 group-hover:text-slate-100 transition">
                  ☁️ Tải Lên Từ Trình Duyệt
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Kéo thả file âm thanh .mp3, .wav, .m4a vào đây
                </p>
              </div>
            </div>
          </div>

          {/* LỊCH SỬ VOICE ĐÃ NẠP (GHI NHỚ) */}
          {savedVoices.length > 0 && (
            <div className="mb-4 pt-3 border-t border-slate-800">
              <p className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-400" />
                Danh Sách Voice Đã Nạp Gần Đây (Bấm để dùng ngay):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {savedVoices.map((v) => {
                  const isCurrent = voicePath === v.file_path;
                  const hasProject = Boolean(v.timeline_project && v.timeline_project.clips && v.timeline_project.clips.length > 0);
                  const clipCount = hasProject ? v.timeline_project.clips.length : 0;

                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelectSavedVoice(v)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between gap-2 ${
                        isCurrent
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-md shadow-amber-500/10'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 truncate">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isCurrent ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                          }`}>
                            <Music className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <p className="font-bold truncate text-[11px] text-slate-100">{v.file_name}</p>
                            <p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-amber-400/90">{v.duration.toFixed(1)}s</span>
                              <span>•</span>
                              <span>{v.subtitles?.length || 0} dòng sub</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isCurrent && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                          <button
                            onClick={(e) => handleDeleteSavedVoice(v.id, e)}
                            className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                            title="Xóa voice này khỏi lịch sử"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Footer thẻ: Badge dự án & Nút Mở Lại Dự Án */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 mt-1">
                        {hasProject ? (
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-bold">
                              <Film className="w-2.5 h-2.5 text-emerald-400" />
                              <span>{clipCount} clips</span>
                            </span>

                            <button
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
    </div>
  );
};
