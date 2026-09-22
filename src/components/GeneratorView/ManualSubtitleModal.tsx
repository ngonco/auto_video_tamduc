import React, { useState, useEffect, useRef } from 'react';
import {
  Music,
  FileText,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Volume2,
  AlertCircle,
  ArrowRight,
  List,
  FileEdit,
} from 'lucide-react';
import { SubtitleLine } from '../../remotion/types.js';

interface ManualSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  voicePath: string;
  voiceDuration: number;
  initialSubtitles?: SubtitleLine[];
  initialTranscript?: string;
  onApplySubtitles: (subtitles: SubtitleLine[], fullTranscript: string) => Promise<void> | void;
}

export const ManualSubtitleModal: React.FC<ManualSubtitleModalProps> = ({
  isOpen,
  onClose,
  voicePath,
  voiceDuration,
  initialSubtitles = [],
  initialTranscript = '',
  onApplySubtitles,
}) => {
  const [activeTab, setActiveTab] = useState<'bulk' | 'lines'>(
    initialSubtitles.length > 0 ? 'lines' : 'bulk'
  );

  // State cho Tab 1: Dán nhanh văn bản
  const [bulkText, setBulkText] = useState<string>(initialTranscript);
  const [startOffset, setStartOffset] = useState<number>(0.0);
  const [endOffset, setEndOffset] = useState<number>(voiceDuration > 0 ? Number(voiceDuration.toFixed(1)) : 60.0);
  const [isResegmenting, setIsResegmenting] = useState<boolean>(false);
  const [bulkError, setBulkError] = useState<string>('');

  // State cho Tab 2: Bảng từng câu
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [applying, setApplying] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeLineTimeoutRef = useRef<any>(null);

  // Cập nhật state khi modal mở
  useEffect(() => {
    if (isOpen) {
      if (initialSubtitles && initialSubtitles.length > 0) {
        setLines(JSON.parse(JSON.stringify(initialSubtitles)));
        setActiveTab('lines');
      } else {
        setLines([]);
        setActiveTab('bulk');
      }
      setBulkText(initialTranscript || (initialSubtitles || []).map((s) => s.text).join('\n'));
      setStartOffset(0.0);
      setEndOffset(voiceDuration > 0 ? Number(voiceDuration.toFixed(1)) : 60.0);
      setBulkError('');
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingAudio(false);
    }
  }, [isOpen, initialSubtitles, initialTranscript, voiceDuration]);

  // Điều khiển Audio preview
  const handleTogglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlayingAudio(true);
    }
  };

  const handlePlayLinePreview = (start: number, end: number) => {
    if (!audioRef.current) return;
    if (activeLineTimeoutRef.current) {
      clearTimeout(activeLineTimeoutRef.current);
    }
    audioRef.current.currentTime = Math.max(0, start);
    audioRef.current.play().catch(() => {});
    setIsPlayingAudio(true);

    const playDuration = Math.max(0.5, end - start);
    activeLineTimeoutRef.current = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      }
    }, playDuration * 1000);
  };

  // 1. Phân dòng từ Bulk text
  const handleResegmentBulk = async () => {
    if (!bulkText.trim()) {
      setBulkError('Vui lòng nhập hoặc dán lời bài hát.');
      return;
    }
    try {
      setIsResegmenting(true);
      setBulkError('');
      const res = await fetch('/api/generator/resegment-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePath,
          customText: bulkText.trim(),
          duration: voiceDuration,
          startOffset: Math.max(0, Number(startOffset) || 0),
          endOffset: Math.max(Number(startOffset) + 0.5, Number(endOffset) || voiceDuration),
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.data.subtitles)) {
        setLines(data.data.subtitles);
        setActiveTab('lines');
      } else {
        setBulkError(data.error || 'Không thể phân bổ phụ đề. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setBulkError(err.message || 'Lỗi mạng khi phân dòng phụ đề.');
    } finally {
      setIsResegmenting(false);
    }
  };

  // 2. Thao tác trên Bảng từng dòng
  const handleUpdateLine = (index: number, updates: Partial<SubtitleLine>) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleAdjustTime = (index: number, field: 'start' | 'end', delta: number) => {
    setLines((prev) => {
      const next = [...prev];
      const target = next[index];
      const newVal = Math.max(0, Number((target[field] + delta).toFixed(2)));
      if (field === 'start') {
        const validStart = Math.min(newVal, Math.max(0, target.end - 0.2));
        next[index] = { ...target, start: validStart };
      } else {
        const validEnd = Math.max(newVal, target.start + 0.2);
        next[index] = { ...target, end: validEnd };
      }
      return next;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => {
      const lastLine = prev[prev.length - 1];
      const nextStart = lastLine ? lastLine.end : 0.0;
      const nextEnd = Math.min(voiceDuration > 0 ? voiceDuration : 999, Number((nextStart + 3.5).toFixed(2)));
      const newLine: SubtitleLine = {
        id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        start: nextStart,
        end: nextEnd,
        text: '',
        words: [],
      };
      return [...prev, newLine];
    });
  };

  const handleDeleteLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAllLines = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách phụ đề này?')) {
      setLines([]);
    }
  };

  // 3. Áp dụng toàn bộ phụ đề vào dự án
  const handleApply = async () => {
    if (lines.length === 0) {
      if (!window.confirm('Danh sách phụ đề đang để trống. Bạn có muốn lưu video không có phụ đề?')) {
        return;
      }
    }

    try {
      setApplying(true);
      // Sắp xếp theo start time và tính toán words Karaoke cho từng câu
      const sortedLines = [...lines].sort((a, b) => a.start - b.start);
      const finalSubs: SubtitleLine[] = sortedLines.map((line, idx) => {
        const cleanText = line.text.trim();
        const tokens = cleanText.split(/\s+/).filter(Boolean);
        const dur = Math.max(0.2, line.end - line.start);
        const wordDur = dur / Math.max(1, tokens.length);

        const words = tokens.map((w, wIdx) => ({
          word: w,
          start: Number((line.start + wIdx * wordDur).toFixed(2)),
          end: Number((line.start + (wIdx + 1) * wordDur).toFixed(2)),
        }));

        return {
          id: line.id || `line_${idx + 1}`,
          start: Number(line.start.toFixed(2)),
          end: Number(line.end.toFixed(2)),
          text: cleanText,
          words,
        };
      });

      const fullTranscript = finalSubs.map((s) => s.text).join(' ');
      await onApplySubtitles(finalSubs, fullTranscript);
      onClose();
    } catch (err: any) {
      alert('Lỗi áp dụng phụ đề: ' + err.message);
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  const audioStreamUrl = voicePath ? `/media/stream?path=${encodeURIComponent(voicePath)}` : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-fadeIn">
      {/* Audio element ẩn phục vụ nghe thử */}
      {audioStreamUrl && (
        <audio
          ref={audioRef}
          src={audioStreamUrl}
          onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlayingAudio(false)}
        />
      )}

      <div className="bg-[#111827] border border-amber-500/40 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base font-montserrat flex items-center gap-2">
                Soạn Thảo Phụ Đề Thủ Công
                <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  ⏱️ {voiceDuration.toFixed(1)}s
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Thêm lời bài hát hoặc chỉnh sửa câu phụ đề Karaoke theo từng mốc thời gian
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('bulk')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'bulk'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5" />
              1. Dán Nhanh Lời Bài Hát
            </button>
            <button
              onClick={() => setActiveTab('lines')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'lines'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              2. Bảng Từng Dòng ({lines.length} câu)
            </button>
          </div>

          {/* Audio Mini Controls */}
          {audioStreamUrl && (
            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={handleTogglePlayAudio}
                className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 flex items-center justify-center transition"
                title={isPlayingAudio ? 'Tạm dừng nghe thử' : 'Phát nghe thử'}
              >
                {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-slate-950" /> : <Play className="w-3.5 h-3.5 fill-slate-950 ml-0.5" />}
              </button>
              <span className="text-[11px] font-mono text-amber-300 min-w-[70px]">
                {audioCurrentTime.toFixed(1)}s / {voiceDuration.toFixed(1)}s
              </span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: DÁN NHANH VĂN BẢN */}
          {activeTab === 'bulk' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                <h4 className="text-xs font-bold text-amber-300 mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Hướng dẫn phân bổ phụ đề thông minh
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Dán toàn bộ lời bài hát vào khung bên dưới (mỗi câu hát xuống 1 dòng). Hệ thống sẽ tự động phân tách câu chuẩn 9:16 và chia đều thời gian trong dải <strong>[Bắt đầu hát ➔ Kết thúc hát]</strong> bạn đã chọn, giữ trọn đoạn nhạc dạo đầu (intro) và đoạn kết (outro).
                </p>
              </div>

              {/* Range settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block flex items-center justify-between">
                    <span>⏱️ Bắt đầu hát từ giây thứ:</span>
                    <span className="font-mono text-amber-400">{startOffset.toFixed(1)}s</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, voiceDuration - 1)}
                      step={0.5}
                      value={startOffset}
                      onChange={(e) => setStartOffset(Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <input
                      type="number"
                      min={0}
                      max={voiceDuration}
                      step={0.1}
                      value={startOffset}
                      onChange={(e) => setStartOffset(Math.max(0, Number(e.target.value)))}
                      className="w-18 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center font-mono text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 block flex items-center justify-between">
                    <span>⏱️ Kết thúc hát ở giây thứ:</span>
                    <span className="font-mono text-amber-400">{endOffset.toFixed(1)}s</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={startOffset + 0.5}
                      max={voiceDuration > 0 ? voiceDuration : 180}
                      step={0.5}
                      value={endOffset}
                      onChange={(e) => setEndOffset(Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <input
                      type="number"
                      min={startOffset + 0.5}
                      max={voiceDuration > 0 ? voiceDuration : 999}
                      step={0.1}
                      value={endOffset}
                      onChange={(e) => setEndOffset(Math.max(startOffset + 0.5, Number(e.target.value)))}
                      className="w-18 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center font-mono text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Nội dung lời bài hát / thơ Phật giáo:
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {bulkText.trim().split(/\s+/).filter(Boolean).length} từ • {bulkText.split(/\r?\n/).filter(Boolean).length} dòng
                  </span>
                </div>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={`Ví dụ:\nNam mô A Di Đà Phật\nNguyện đem công đức này\nHướng về khắp tất cả\nĐệ tử và chúng sanh\nĐều trọn thành Phật đạo`}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-2xl p-4 text-xs text-slate-100 focus:outline-none leading-relaxed font-sans"
                />
              </div>

              {bulkError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleResegmentBulk}
                  disabled={isResegmenting || !bulkText.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isResegmenting ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      Đang Phân Dòng...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                      Phân Dòng & Chuyển Sang Bảng Chỉnh Sửa
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: BẢNG TỪNG DÒNG CHI TIẾT */}
          {activeTab === 'lines' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">
                    Danh Sách Câu Phụ Đề ({lines.length} câu)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    • Nhấn nút ▶ trên từng dòng để nghe thử đoạn nhạc tương ứng
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm Câu Mới
                  </button>
                  {lines.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllLines}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl text-xs transition"
                      title="Xóa toàn bộ các dòng"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                  <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-medium">Chưa có câu phụ đề nào</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Bấm "Thêm Câu Mới" hoặc quay lại Tab 1 để dán nhanh lời bài hát
                  </p>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="mt-4 px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition"
                  >
                    ➕ Thêm Câu Đầu Tiên
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {lines.map((line, idx) => {
                    const dur = Math.max(0, line.end - line.start);
                    return (
                      <div
                        key={line.id || idx}
                        className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 transition"
                      >
                        {/* Index & Play Preview */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="w-6 text-[10px] font-mono text-slate-500 text-center">
                            #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePlayLinePreview(line.start, line.end)}
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 flex items-center justify-center transition"
                            title="Nghe thử đoạn nhạc này"
                          >
                            <Play className="w-3 h-3 ml-0.5" />
                          </button>
                        </div>

                        {/* Timing Controls */}
                        <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 flex-shrink-0">
                          {/* Start */}
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step={0.1}
                              min={0}
                              value={line.start}
                              onChange={(e) =>
                                handleUpdateLine(idx, { start: Math.max(0, Number(e.target.value)) })
                              }
                              className="w-13 bg-transparent text-[11px] font-mono text-amber-300 text-center outline-none"
                              title="Thời gian bắt đầu (giây)"
                            />
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleAdjustTime(idx, 'start', 0.5)}
                                className="text-[8px] text-slate-400 hover:text-white px-0.5"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustTime(idx, 'start', -0.5)}
                                className="text-[8px] text-slate-400 hover:text-white px-0.5"
                              >
                                ▼
                              </button>
                            </div>
                          </div>

                          <span className="text-slate-600 text-xs px-0.5">➔</span>

                          {/* End */}
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step={0.1}
                              min={line.start + 0.1}
                              value={line.end}
                              onChange={(e) =>
                                handleUpdateLine(idx, { end: Math.max(line.start + 0.1, Number(e.target.value)) })
                              }
                              className="w-13 bg-transparent text-[11px] font-mono text-yellow-300 text-center outline-none"
                              title="Thời gian kết thúc (giây)"
                            />
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleAdjustTime(idx, 'end', 0.5)}
                                className="text-[8px] text-slate-400 hover:text-white px-0.5"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustTime(idx, 'end', -0.5)}
                                className="text-[8px] text-slate-400 hover:text-white px-0.5"
                              >
                                ▼
                              </button>
                            </div>
                          </div>

                          <span className="text-[9px] font-mono text-slate-400 ml-1">
                            ({dur.toFixed(1)}s)
                          </span>
                        </div>

                        {/* Text Input */}
                        <div className="flex-1 min-w-[180px]">
                          <input
                            type="text"
                            value={line.text}
                            onChange={(e) => handleUpdateLine(idx, { text: e.target.value })}
                            placeholder="Nhập nội dung câu hát..."
                            className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none"
                          />
                        </div>

                        {/* Delete line button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(idx)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition flex-shrink-0"
                          title="Xóa câu này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Đã tạo {lines.length} câu</span>
            {lines.length > 0 && (
              <span className="font-mono text-amber-400">
                ({lines[0].start.toFixed(1)}s ➔ {lines[lines.length - 1].end.toFixed(1)}s)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
            >
              Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {applying ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  Đang Lưu...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  Áp Dụng Phụ Đề Vào Video
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
