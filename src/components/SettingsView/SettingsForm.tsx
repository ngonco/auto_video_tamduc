import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Key,
  Folder,
  FolderOpen,
  Check,
  AlertCircle,
  RefreshCw,
  Mic,
  FileEdit,
  Eye,
  Server,
} from 'lucide-react';

export const SettingsForm: React.FC = () => {
  const [sttApiKey, setSttApiKey] = useState('');
  const [subtitleApiKey, setSubtitleApiKey] = useState('');
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.vilao.ai/v1');
  const [sttModel, setSttModel] = useState('tsa/groq/whisper-large-v3');
  const [subtitleModel, setSubtitleModel] = useState('ts/gemini-3.1-flash-lite');
  const [visionModel, setVisionModel] = useState('ts/gemini-3.1-flash-lite');
  const [rootSourceDir, setRootSourceDir] = useState('');
  const [exportDir, setExportDir] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browsingDir, setBrowsingDir] = useState<'root' | 'export' | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSttApiKey(data.data.sttApiKey || '');
          setSubtitleApiKey(data.data.subtitleApiKey || '');
          setEmbeddingApiKey(data.data.embeddingApiKey || '');
          setBaseUrl(data.data.baseUrl || 'https://api.vilao.ai/v1');
          setSttModel(data.data.sttModel || 'tsa/groq/whisper-large-v3');
          setSubtitleModel(data.data.subtitleModel || 'ts/gemini-3.1-flash-lite');
          setVisionModel(data.data.visionModel || 'ts/gemini-3.1-flash-lite');
          setRootSourceDir(data.data.rootSourceDir || '');
          setExportDir(data.data.exportDir || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleBrowse = async (type: 'root' | 'export') => {
    setBrowsingDir(type);
    try {
      const currentPath = type === 'root' ? rootSourceDir : exportDir;
      const res = await fetch('/api/settings/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPath: currentPath }),
      });
      const data = await res.json();
      if (data.success && data.selectedPath) {
        if (type === 'root') {
          setRootSourceDir(data.selectedPath);
        } else {
          setExportDir(data.selectedPath);
        }
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Lỗi chọn thư mục: ' + err.message });
    } finally {
      setBrowsingDir(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToastMsg(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sttApiKey,
          subtitleApiKey,
          embeddingApiKey,
          baseUrl,
          rootSourceDir,
          exportDir,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: 'Đã lưu cấu hình hệ thống thành công!' });
      } else {
        setToastMsg({ type: 'error', text: data.error || 'Lỗi lưu cấu hình' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
        Đang tải cấu hình...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Sliders className="w-6 h-6 text-amber-400" />
        <h2 className="text-xl font-bold text-slate-100 font-montserrat">
          Cài Đặt Hệ Thống & API Gateway
        </h2>
      </div>

      {toastMsg && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs flex items-center gap-3 border ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/50 border-red-500/40 text-red-300'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 3 API Keys Vilao Gateway Box */}
        <div className="bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-300 font-montserrat flex items-center gap-2">
              <Key className="w-4 h-4" />
              Cấu Hình 3 Token API Vilao.ai (OpenAI SDK Compatible)
            </h3>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              3 Phân Hệ Độc Lập
            </span>
          </div>

          {/* 1. STT API Key */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-blue-400" />
                1. Token STT (VideoTamDuc_STT):
              </label>
              <span className="text-[10px] text-blue-400 font-mono bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                Model: {sttModel}
              </span>
            </div>
            <input
              type="password"
              placeholder="Nhập Token STT (sk-...)..."
              value={sttApiKey}
              onChange={(e) => setSttApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono transition"
            />
            <p className="text-[11px] text-slate-500">
              Nhận diện giọng nói tiếng Việt và xuất mốc thời gian từng từ (Word timestamps) cho hiệu ứng Karaoke.
            </p>
          </div>

          {/* 2. Subtitle Fix API Key */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <FileEdit className="w-3.5 h-3.5 text-emerald-400" />
                2. Token Sửa Phụ Đề (VideoTamDuc_sửa phụ đề):
              </label>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Model: {subtitleModel}
              </span>
            </div>
            <input
              type="password"
              placeholder="Nhập Token Sửa phụ đề (sk-...)..."
              value={subtitleApiKey}
              onChange={(e) => setSubtitleApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono transition"
            />
            <p className="text-[11px] text-slate-500">
              LLM chuẩn hóa chính tả Phật học (Tam Bảo, Bổn Sư, trang nghiêm...) và ngắt nhịp 3-6 từ cho video dọc 9:16.
            </p>
          </div>

          {/* 3. EMBLED / Vision API Key */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                3. Token EMBLED & Phân Tích Cảnh (VideoTamDuc_EMBLED):
              </label>
              <span className="text-[10px] text-purple-400 font-mono bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                Model: {visionModel}
              </span>
            </div>
            <input
              type="password"
              placeholder="Nhập Token EMBLED (sk-...)..."
              value={embeddingApiKey}
              onChange={(e) => setEmbeddingApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono transition"
            />
            <p className="text-[11px] text-slate-500">
              Phân tích 2 frame ảnh nhận diện 4 giai đoạn thi công bàn thờ và tạo vector nhúng (Embedding).
            </p>
          </div>

          {/* Base URL */}
          <div className="pt-1">
            <label className="text-xs text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-amber-400" />
              VILAO_BASE_URL:
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>

        {/* Directory Paths Box */}
        <div className="bg-[#151D2E] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-amber-300 font-montserrat flex items-center gap-2">
            <Folder className="w-4 h-4" />
            Đường Dẫn Thư Mục Cục Bộ Trên Máy
          </h3>

          {/* ROOT_SOURCE_DIR */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">
              ROOT_SOURCE_DIR (Thư mục chứa các folder con công trình):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ví dụ: D:/Source_Cong_Trinh"
                value={rootSourceDir}
                onChange={(e) => setRootSourceDir(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono"
              />
              <button
                type="button"
                onClick={() => handleBrowse('root')}
                disabled={browsingDir === 'root'}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 hover:text-amber-200 text-xs font-semibold rounded-xl transition flex items-center gap-2 whitespace-nowrap active:scale-95"
                title="Mở cửa sổ chọn thư mục trên máy"
              >
                {browsingDir === 'root' ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                )}
                <span>Chọn Thư Mục</span>
              </button>
            </div>
          </div>

          {/* EXPORT_DIR */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">
              EXPORT_DIR (Thư mục xuất video MP4 hoàn chỉnh):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ví dụ: D:/Video_Output"
                value={exportDir}
                onChange={(e) => setExportDir(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-xl p-3 outline-none focus:border-amber-500 font-mono"
              />
              <button
                type="button"
                onClick={() => handleBrowse('export')}
                disabled={browsingDir === 'export'}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 hover:text-amber-200 text-xs font-semibold rounded-xl transition flex items-center gap-2 whitespace-nowrap active:scale-95"
                title="Mở cửa sổ chọn thư mục trên máy"
              >
                {browsingDir === 'export' ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                )}
                <span>Chọn Thư Mục</span>
              </button>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          LƯU CẤU HÌNH HỆ THỐNG
        </button>
      </form>
    </div>
  );
};
