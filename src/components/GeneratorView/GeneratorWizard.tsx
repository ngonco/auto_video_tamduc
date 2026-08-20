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
  Shuffle
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
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [editingSubText, setEditingSubText] = useState<string>('');

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

  // Xử lý chỉnh sửa nhanh 1 dòng phụ đề
  const handleStartEditSub = (idx: number, currentText: string) => {
    setEditingSubIdx(idx);
    setEditingSubText(currentText);
  };

  const handleSaveEditSub = (idx: number) => {
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
    }
    setEditingSubIdx(null);
    setEditingSubText('');
  };

  const handleCancelEditSub = () => {
    setEditingSubIdx(null);
    setEditingSubText('');
  };

  // 4. Chọn Voice từ Lịch sử Đã Nạp
  const handleSelectSavedVoice = (saved: SavedVoiceItem) => {
    setVoiceName(saved.file_name);
    setVoicePath(saved.file_path);
    setVoiceDuration(saved.duration);
    setFullTranscript(saved.stt_text || '');
    setSubtitles(saved.subtitles || []);
    setErrorMsg('');
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

        onStorylineGenerated({
          projectId: sourceMode === 'single' ? selectedProjectId : 'ALL_PROJECTS',
          projectName: projName,
          voicePath,
          voiceUrl,
          duration: voiceDuration,
          subtitles,
          clips: data.data.clips,
          availableSources: data.data.availableSources || [],
          outro: data.data.outro || null,
        });
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {savedVoices.map((v) => {
                  const isCurrent = voicePath === v.file_path;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelectSavedVoice(v)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                        isCurrent
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-md shadow-amber-500/10'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isCurrent ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Music className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="font-bold truncate text-[11px]">{v.file_name}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-amber-400/90">{v.duration.toFixed(1)}s</span>
                            <span>•</span>
                            <span>{v.subtitles?.length || 0} dòng</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                        {isCurrent && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                        <button
                          onClick={(e) => handleDeleteSavedVoice(v.id, e)}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                          title="Xóa voice này khỏi lịch sử"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Phụ Đề Đã Chuẩn Hóa ({subtitles.length} dòng • {voiceDuration.toFixed(1)}s):
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                    AI Spell-Checked
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => processVoiceFile(voicePath, voiceName, true)}
                    disabled={processingSTT}
                    className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition disabled:opacity-50"
                    title="Chạy lại Gemini 3.1 Flash Lite để sửa chính tả ngữ cảnh"
                  >
                    <Wand2 className={`w-3 h-3 ${processingSTT ? 'animate-spin' : ''}`} />
                    {processingSTT ? 'Đang sửa AI...' : 'Chạy Lại Sửa AI'}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">Word Timestamps Ready</span>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                {subtitles.map((sub, i) => {
                  const isEditing = editingSubIdx === i;
                  return (
                    <div
                      key={i}
                      className={`p-1.5 rounded-lg transition ${
                        isEditing
                          ? 'bg-amber-500/10 border border-amber-500/40'
                          : 'hover:bg-slate-800/60 flex items-center justify-between gap-2'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-slate-500 font-mono text-[10px] w-14 flex-shrink-0">
                            {sub.start.toFixed(1)}s:
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
                            className="flex-1 bg-slate-950 border border-amber-500/50 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
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
                          <div className="flex gap-2 text-[11px] text-slate-300 flex-1 min-w-0">
                            <span className="text-slate-500 font-mono w-14 flex-shrink-0">
                              {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s:
                            </span>
                            <span className="font-medium text-slate-200 truncate">{sub.text}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleStartEditSub(i, sub.text)}
                            className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 text-slate-400 hover:text-amber-300 rounded transition flex-shrink-0"
                            title="Nhấp để sửa nhanh dòng này"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
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
