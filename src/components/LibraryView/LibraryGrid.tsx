import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  Film,
  Sparkles,
  RefreshCw,
  CheckCircle,
  Clock,
  Eye,
  ArrowRight,
  Layers,
  Trash2,
  AlertCircle,
  Check,
  Plus,
} from 'lucide-react';

interface ProjectItem {
  id: string;
  folder_name: string;
  folder_path: string;
  total_videos: number;
  is_embedded: number;
  stage_summary: string | null;
  cover_thumbnail: string | null;
  last_scanned_at: string;
}

interface VideoSourceItem {
  id: string;
  file_name: string;
  file_path: string;
  duration: number;
  width: number;
  height: number;
  aspect_ratio_type: string;
  stage: string;
  aesthetic_score: number;
  scene_description: string;
  thumbnail_path: string;
}

interface LibraryGridProps {
  onSelectProjectForGeneration: (projectId: string, folderName: string) => void;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  STAGE_1_RAW_CARPENTRY: { label: 'Thi công thô', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  STAGE_2_ASSEMBLY_FINISHING: { label: 'Lắp ráp tủ', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  STAGE_3_DECOR_FLOWERS: { label: 'Cắm hoa & Tượng', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  STAGE_4_WORSHIP_ALTAR: { label: 'Lễ Phật trang nghiêm', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
};

export const LibraryGrid: React.FC<LibraryGridProps> = ({ onSelectProjectForGeneration }) => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [scanningProjectId, setScanningProjectId] = useState<string | null>(null);
  const [selectedProjectDetail, setSelectedProjectDetail] = useState<ProjectItem | null>(null);
  const [projectVideos, setProjectVideos] = useState<VideoSourceItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [previewVideoItem, setPreviewVideoItem] = useState<VideoSourceItem | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/library/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handlePickAndImport = async () => {
    try {
      setImporting(true);
      setToast(null);
      const res = await fetch('/api/library/pick-and-import', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setToast({ type: 'success', text: data.message || 'Đã nạp và phân tích AI công trình thành công!' });
        await fetchProjects();
      } else if (data.cancelled) {
        // User cancelled picker dialog
      } else {
        setToast({ type: 'error', text: data.error || 'Không thể nạp công trình' });
      }
    } catch (err: any) {
      setToast({ type: 'error', text: 'Lỗi nạp công trình: ' + err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteProject = async (projectId: string, folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc chắn muốn xóa công trình "${folderName}" khỏi thư viện?`)) return;
    try {
      const res = await fetch(`/api/library/projects/${projectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setToast({ type: 'success', text: `Đã xóa công trình "${folderName}"` });
        fetchProjects();
      }
    } catch (err: any) {
      setToast({ type: 'error', text: 'Lỗi xóa công trình: ' + err.message });
    }
  };

  const [scanProgress, setScanProgress] = useState<Record<string, { percent: number; message: string }>>({});

  const handleScanProject = async (projectId: string, folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setScanningProjectId(projectId);
      setScanProgress((prev) => ({ ...prev, [projectId]: { percent: 0, message: 'Đang bắt đầu phân tích AI...' } }));

      const res = await fetch(`/api/library/projects/${projectId}/scan`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setToast({ type: 'error', text: `Lỗi: ${data.error || 'Không thể bắt đầu phân tích'}` });
        setScanningProjectId(null);
        return;
      }

      // Bắt đầu poll tiến độ mỗi 1000ms
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/library/projects/${projectId}/scan-status`);
          const statusData = await statusRes.json();
          if (statusData.success) {
            const job = statusData.data;
            setScanProgress((prev) => ({
              ...prev,
              [projectId]: { percent: job.percent, message: job.message },
            }));

            if (job.status === 'completed') {
              clearInterval(pollInterval);
              setScanningProjectId(null);
              setToast({ type: 'success', text: `Đã hoàn tất phân tích AI cho công trình "${folderName}"!` });
              fetchProjects();
            } else if (job.status === 'error') {
              clearInterval(pollInterval);
              setScanningProjectId(null);
              setToast({ type: 'error', text: job.message || 'Lỗi khi phân tích AI' });
            }
          }
        } catch (_) {}
      }, 1000);
    } catch (err: any) {
      console.error('Error triggering scan:', err);
      setToast({ type: 'error', text: `Lỗi phân tích AI: ${err.message}` });
      setScanningProjectId(null);
    }
  };

  const [scanningAll, setScanningAll] = useState(false);
  const [scanAllProgress, setScanAllProgress] = useState<{ percent: number; message: string }>({
    percent: 0,
    message: '',
  });

  const handleScanAllProjects = async () => {
    if (projects.length === 0) {
      setToast({ type: 'error', text: 'Chưa có công trình nào trong thư viện.' });
      return;
    }

    if (
      !confirm(
        `Bạn có muốn kích hoạt Nhúng AI cho toàn bộ ${projects.length} công trình trong thư viện?\n\n(Hệ thống sẽ tự động quét, phân loại 4 giai đoạn bằng AI và lọc xoá sạch các clip rác < 2s)`
      )
    ) {
      return;
    }

    try {
      setScanningAll(true);
      setScanAllProgress({ percent: 0, message: 'Bắt đầu nhúng AI toàn bộ thư viện...' });

      const res = await fetch('/api/library/projects/scan-all', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setToast({ type: 'error', text: data.error || 'Lỗi bắt đầu nhúng AI' });
        setScanningAll(false);
        return;
      }

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/library/projects/scan-all-status');
          const statusData = await statusRes.json();
          if (statusData.success) {
            const job = statusData.data;
            setScanAllProgress({ percent: job.percent, message: job.message });

            if (job.status === 'completed') {
              clearInterval(pollInterval);
              setScanningAll(false);
              setToast({ type: 'success', text: 'Đã hoàn tất nhúng AI cho toàn bộ thư viện!' });
              fetchProjects();
            } else if (job.status === 'error') {
              clearInterval(pollInterval);
              setScanningAll(false);
              setToast({ type: 'error', text: job.message || 'Lỗi khi phân tích AI' });
            }
          }
        } catch (_) {}
      }, 1000);
    } catch (err: any) {
      setToast({ type: 'error', text: 'Lỗi nhúng AI: ' + err.message });
      setScanningAll(false);
    }
  };

  const handleViewDetails = async (project: ProjectItem) => {
    setSelectedProjectDetail(project);
    try {
      setLoadingVideos(true);
      const res = await fetch(`/api/library/projects/${project.id}/videos`);
      const data = await res.json();
      if (data.success) {
        setProjectVideos(data.data);
      }
    } catch (err) {
      console.error('Error fetching project videos:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3 font-montserrat">
            <Folder className="w-7 h-7 text-amber-400" />
            Thư Viện Source Công Trình
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Chọn thư mục công trình thực tế trên máy, tự động quét video và phân loại 4 giai đoạn bằng AI (Tự động lọc xoá clip &lt; 2s)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Nút Nhúng AI Toàn Bộ Thư Viện */}
          <button
            onClick={handleScanAllProjects}
            disabled={scanningAll || importing || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Quét, phân loại 4 giai đoạn bằng AI và dọn clip < 2s cho toàn bộ công trình"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${scanningAll ? 'animate-spin' : ''}`} />
            <span>{scanningAll ? `Đang Nhúng AI (${scanAllProgress.percent}%)...` : '⚡ Nhúng AI Toàn Bộ'}</span>
          </button>

          {/* Nút Chọn Thư Mục Công Trình Chính */}
          <button
            onClick={handlePickAndImport}
            disabled={importing || scanningAll}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 rounded-xl text-xs font-extrabold shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Mở cửa sổ chọn thư mục công trình (có danh sách thư mục đã Pin)"
          >
            {importing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <FolderOpen className="w-4 h-4 text-slate-950" />
            )}
            <span>{importing ? 'Đang Nạp & Phân Tích AI...' : 'CHỌN THƯ MỤC CÔNG TRÌNH'}</span>
          </button>

          <button
            onClick={fetchProjects}
            disabled={scanningAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Làm mới danh sách công trình"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm Mới
          </button>
        </div>
      </div>

      {/* Progress Banner Khi Nhúng AI Toàn Bộ Thư Viện */}
      {scanningAll && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-900/40 via-slate-900/60 to-indigo-900/40 border border-purple-500/40 shadow-xl shadow-purple-500/10 animate-fade-in">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
              <span className="text-sm font-bold text-slate-100">
                Đang Nhúng AI & Phân Loại 4 Giai Đoạn Toàn Bộ Thư Viện
              </span>
            </div>
            <span className="text-xs font-extrabold text-purple-400">
              {scanAllProgress.percent}%
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-purple-500 via-indigo-500 to-amber-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, scanAllProgress.percent)}%` }}
            />
          </div>

        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs flex items-center justify-between border ${
            toast.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/50 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white text-xs ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Importing Banner */}
      {importing && (
        <div className="mb-6 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-xs">Đang mở cửa sổ chọn thư mục và tự động phân tích AI...</p>
            <p className="text-[11px] text-amber-300/70 mt-0.5">
              Hệ thống đang trích frame đại diện và gọi AI phân loại 4 giai đoạn thi công cho toàn bộ video.
            </p>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-400 mb-3" />
          <p className="text-sm">Đang tải danh sách công trình...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-[#151D2E]/80 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto shadow-2xl">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
            <FolderOpen className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-100 font-montserrat">Chưa có công trình nào trong thư viện</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-md mx-auto">
            Nhấn nút bên dưới để chọn thư mục công trình bàn thờ Phật thực tế trên máy (hỗ trợ chọn trực tiếp từ các thư mục đã Pin trong Windows Explorer).
          </p>

          <div className="mt-6 flex justify-center">
            <button
              onClick={handlePickAndImport}
              disabled={importing}
              className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-xl shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
            >
              {importing ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <Plus className="w-4 h-4 text-slate-950 stroke-[3]" />
              )}
              <span>{importing ? 'Đang Xử Lý...' : 'CHỌN THƯ MỤC CÔNG TRÌNH TRÊN MÁY'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => {
            const isScanning = scanningProjectId === proj.id;
            let stageSummaryObj: Record<string, number> = {};
            try {
              if (proj.stage_summary) stageSummaryObj = JSON.parse(proj.stage_summary);
            } catch (_) {}

            return (
              <div
                key={proj.id}
                onClick={() => handleViewDetails(proj)}
                className="bg-[#151D2E]/90 border border-slate-800/80 hover:border-amber-500/40 rounded-2xl overflow-hidden shadow-xl hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  {/* Thumbnail / Header */}
                  <div className="h-44 bg-slate-900 relative overflow-hidden flex items-center justify-center border-b border-slate-800/60">
                    {proj.cover_thumbnail ? (
                      <img
                        src={`/media/thumbnails/${proj.cover_thumbnail.split(/[\\/]/).pop()}`}
                        alt={proj.folder_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-slate-500">
                        <Film className="w-12 h-12 mb-2 text-slate-600" />
                        <span className="text-xs">Chưa có thumbnail</span>
                      </div>
                    )}

                    {/* Badge Trạng thái Nhúng AI & Nút Xóa */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {proj.is_embedded === 1 ? (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 backdrop-blur-md">
                          <CheckCircle className="w-3.5 h-3.5" /> Đã Nhúng AI
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/40 backdrop-blur-md">
                          <Clock className="w-3.5 h-3.5" /> Chưa Nhúng
                        </span>
                      )}

                      <button
                        onClick={(e) => handleDeleteProject(proj.id, proj.folder_name, e)}
                        className="p-1.5 rounded-full bg-slate-900/80 text-slate-400 hover:text-red-400 hover:bg-red-950/80 border border-slate-700/60 hover:border-red-500/40 backdrop-blur-md transition"
                        title="Xóa công trình này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Badge Tổng Số Video */}
                    <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md text-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/10">
                      <Film className="w-3.5 h-3.5 text-amber-400" />
                      {proj.total_videos} Video Clips
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-5">
                    <h3 className="font-bold text-slate-100 text-base group-hover:text-amber-300 transition-colors line-clamp-1">
                      {proj.folder_name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono line-clamp-1 mt-1">
                      {proj.folder_path}
                    </p>

                    {/* Stage Distribution Pills */}
                    {Object.keys(stageSummaryObj).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {Object.entries(stageSummaryObj).map(([stg, count]) => {
                          const info = STAGE_LABELS[stg] || { label: stg, color: 'bg-slate-800 text-slate-300 border-slate-700' };
                          return (
                            <span
                              key={stg}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${info.color}`}
                            >
                              {info.label}: {count}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-5 pt-0 flex items-center gap-2">
                  {proj.is_embedded === 0 ? (
                    <button
                      onClick={(e) => handleScanProject(proj.id, proj.folder_name, e)}
                      disabled={isScanning}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition disabled:opacity-50"
                    >
                      {isScanning ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{scanProgress[proj.id]?.percent ? `${scanProgress[proj.id].percent}%` : 'Đang Phân Tích...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Nhúng AI Ngay</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProjectForGeneration(proj.id, proj.folder_name);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-xl text-xs shadow-md transition active:scale-95"
                    >
                      <Layers className="w-3.5 h-3.5 stroke-[2.5]" />
                      Dựng Video Với Source Này
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDetails(proj);
                    }}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
                    title="Xem chi tiết các clip"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Xem Chi Tiết Clips Của Công Trình */}
      {selectedProjectDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#151D2E] border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div>
                <h3 className="text-lg font-bold text-amber-300 font-montserrat">
                  Chi Tiết Công Trình: {selectedProjectDetail.folder_name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tổng cộng {projectVideos.length} clips video
                </p>
              </div>
              <button
                onClick={() => setSelectedProjectDetail(null)}
                className="text-slate-400 hover:text-white px-3 py-1 bg-slate-800 rounded-lg text-xs"
              >
                Đóng ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {loadingVideos ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-400 mx-auto mb-2" />
                  Đang nạp danh sách video...
                </div>
              ) : projectVideos.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Chưa có thông tin chi tiết clip.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectVideos.map((vid) => {
                    const stageInfo = STAGE_LABELS[vid.stage] || { label: vid.stage, color: 'bg-slate-800 text-slate-300 border-slate-700' };
                    return (
                      <div
                        key={vid.id}
                        onClick={() => setPreviewVideoItem(vid)}
                        className="bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 rounded-xl overflow-hidden text-xs cursor-pointer transition group"
                      >
                        <div className="h-32 bg-black relative overflow-hidden">
                          {vid.thumbnail_path && (
                            <img
                              src={`/media/thumbnails/${vid.thumbnail_path.split(/[\\/]/).pop()}`}
                              alt={vid.file_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span className="p-2 rounded-full bg-amber-500 text-slate-950 font-bold shadow-lg">▶</span>
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-white">
                            {vid.duration.toFixed(1)}s • {vid.aspect_ratio_type}
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-slate-200 line-clamp-1 group-hover:text-amber-300 transition">{vid.file_name}</p>
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded mt-1.5 font-medium border ${stageInfo.color}`}>
                            {stageInfo.label}
                          </span>
                          {vid.scene_description && (
                            <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 italic">
                              "{vid.scene_description}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedProjectDetail(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs hover:bg-slate-700 font-semibold"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  const p = selectedProjectDetail;
                  setSelectedProjectDetail(null);
                  onSelectProjectForGeneration(p.id, p.folder_name);
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20"
              >
                Sử Dụng Công Trình Này Để Dựng Video ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Video Clip Trực Tiếp Trong Thư Viện */}
      {previewVideoItem && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#151D2E] border border-amber-500/40 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="truncate pr-2">
                <h4 className="text-sm font-bold text-amber-300 truncate">{previewVideoItem.file_name}</h4>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {previewVideoItem.duration.toFixed(1)}s • {previewVideoItem.aspect_ratio_type}
                </p>
              </div>
              <button
                onClick={() => setPreviewVideoItem(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <div className="max-h-[60vh] aspect-[9/16] max-w-full flex items-center justify-center rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                {previewVideoItem.file_path.match(/\.(jpg|jpeg|png|webp|bmp)$/i) ? (
                  <img
                    src={`/media/stream?path=${encodeURIComponent(previewVideoItem.file_path)}`}
                    alt={previewVideoItem.file_name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <video
                    src={`/media/stream?path=${encodeURIComponent(previewVideoItem.file_path)}`}
                    controls
                    autoPlay
                    playsInline
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
              <button
                onClick={() => setPreviewVideoItem(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
