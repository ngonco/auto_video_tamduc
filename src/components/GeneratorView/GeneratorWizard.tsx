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
  Volume2
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
  }) => void;
}

export const GeneratorWizard: React.FC<GeneratorWizardProps> = ({
  initialProjectId,
  onStorylineGenerated,
}) => {
  // Projects
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');

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

  // Storyline assembly
  const [assembling, setAssembling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Load projects & saved voices
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
    fetchSavedVoices();
  }, []);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
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
  const processVoiceFile = async (filePathToProcess: string, fileName?: string) => {
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
    if (!selectedProjectId) {
      setErrorMsg('Vui lòng chọn 1 Folder công trình');
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
          projectId: selectedProjectId,
          targetDuration: voiceDuration,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const projName = projects.find((p) => p.id === selectedProjectId)?.folder_name || 'CongTrinh_TamDuc';
        const voiceUrl = `/media/stream?path=${encodeURIComponent(voicePath)}`;

        onStorylineGenerated({
          projectId: selectedProjectId,
          projectName: projName,
          voicePath,
          voiceUrl,
          duration: voiceDuration,
          subtitles,
          clips: data.data.clips,
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
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Phụ Đề Đã Chuẩn Hóa ({subtitles.length} dòng • {voiceDuration.toFixed(1)}s):
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Word Timestamps Ready</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-2">
                {subtitles.map((sub, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-slate-300">
                    <span className="text-slate-500 font-mono w-16 flex-shrink-0">
                      {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s:
                    </span>
                    <span className="font-medium text-slate-200">{sub.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BƯỚC 2: CHỌN FOLDER CÔNG TRÌNH */}
        <div className="bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h3 className="font-bold text-slate-100 text-sm font-montserrat">
              Chọn Thư Mục Source Công Trình Làm Bàn Thờ Phật
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </div>

        {/* BƯỚC 3: NÚT LẮP RÁP TIMELINE */}
        <div className="pt-2">
          <button
            onClick={handleAssembleStoryline}
            disabled={assembling || subtitles.length === 0 || !selectedProjectId}
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
