import React, { useState, useRef } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Play, Pause, Download, Volume2, Film, Type, Music, Trash2, ArrowLeftRight, CheckCircle, RefreshCw, FolderOpen, Sliders } from 'lucide-react';
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

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  STAGE_1_RAW_CARPENTRY: { label: 'Thô', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  STAGE_2_ASSEMBLY_FINISHING: { label: 'Lắp ráp', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  STAGE_3_DECOR_FLOWERS: { label: 'Cắm hoa', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  STAGE_4_WORSHIP_ALTAR: { label: 'Lễ Phật', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
};

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  timelineData,
  onUpdateClips,
  onUpdateSubtitles,
}) => {
  const playerRef = useRef<PlayerRef>(null);

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

  const durationInFrames = Math.max(30, Math.ceil(timelineData.duration * 30));

  // Fetch BGM list
  React.useEffect(() => {
    fetch('/api/generator/bgm-list')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setBgmList(data.data);
          setSelectedBgm(data.data[0].filePath);
        }
      });
  }, []);

  // Clip manipulation
  const handleMoveClip = (index: number, direction: 'left' | 'right') => {
    const newClips = [...timelineData.clips];
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newClips.length) return;

    const temp = newClips[index];
    newClips[index] = newClips[targetIdx];
    newClips[targetIdx] = temp;

    // Recalculate timeline starts/ends
    let curTime = 0;
    newClips.forEach((c) => {
      c.timelineStart = Number(curTime.toFixed(2));
      c.timelineEnd = Number((curTime + c.sourceDuration).toFixed(2));
      curTime += c.sourceDuration;
    });

    onUpdateClips(newClips);
  };

  const handleDeleteClip = (index: number) => {
    if (timelineData.clips.length <= 1) return;
    const newClips = timelineData.clips.filter((_, i) => i !== index);

    let curTime = 0;
    newClips.forEach((c) => {
      c.timelineStart = Number(curTime.toFixed(2));
      c.timelineEnd = Number((curTime + c.sourceDuration).toFixed(2));
      curTime += c.sourceDuration;
    });

    onUpdateClips(newClips);
  };

  // Subtitle Edit Save
  const handleSaveSubtitle = (id: string) => {
    const newSubs = timelineData.subtitles.map((sub) => {
      if (sub.id === id) {
        // Tái tạo mảng words từ text mới
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
  };

  // Handle Render Start
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

  const compositionProps: MainVideoProps = {
    durationInFrames,
    fps: 30,
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
      {/* Top Workspace Area: Player 9:16 + Control Panel */}
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

      {/* Bottom Timeline Tracks Area */}
      <div className="h-64 bg-[#111827] border-t border-slate-800 flex flex-col overflow-hidden">
        {/* Timeline Header Bar */}
        <div className="h-8 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-amber-400 font-bold">TIMELINE MULTI-TRACK 9:16</span>
            <span>Tổng thời gian: {timelineData.duration.toFixed(1)}s</span>
          </div>
          <span className="text-[11px] text-slate-500">
            💡 Có thể đổi thứ tự clip hoặc bấm vào phụ đề bên dưới để chỉnh sửa chữ
          </span>
        </div>

        {/* Multi-Track Scroll Area */}
        <div className="flex-1 p-4 overflow-x-auto overflow-y-auto space-y-3">
          {/* TRACK 1: VIDEO CLIPS */}
          <div className="flex items-center gap-2 min-w-max">
            <div className="w-24 text-[11px] font-bold text-amber-400 flex items-center gap-1.5 flex-shrink-0">
              <Film className="w-3.5 h-3.5" /> Video ({timelineData.clips.length})
            </div>
            <div className="flex gap-2">
              {timelineData.clips.map((clip, idx) => {
                const stageInfo = STAGE_LABELS[clip.stage] || { label: 'Lắp ráp', color: 'bg-slate-800 text-slate-300 border-slate-700' };
                return (
                  <div
                    key={clip.id}
                    className="w-36 bg-slate-900 border border-slate-700/80 rounded-xl p-2 flex flex-col justify-between text-xs group relative shadow-md"
                  >
                    <div>
                      <div className="h-16 bg-black rounded-lg overflow-hidden relative mb-1.5">
                        {clip.thumbnailPath ? (
                          <img
                            src={`/media/thumbnails/${clip.thumbnailPath.split(/[\\/]/).pop()}`}
                            alt={clip.fileName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                            No Thumb
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] px-1 rounded text-white">
                          {clip.sourceDuration.toFixed(1)}s
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-200 truncate">{clip.fileName}</p>
                      <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-medium border ${stageInfo.color} mt-1`}>
                        {stageInfo.label}
                      </span>
                    </div>

                    {/* Clip Controls (Move Left/Right, Delete) */}
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/80">
                      <button
                        onClick={() => handleMoveClip(idx, 'left')}
                        disabled={idx === 0}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30"
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => handleDeleteClip(idx)}
                        className="text-slate-500 hover:text-red-400 p-0.5"
                        title="Xóa clip này"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleMoveClip(idx, 'right')}
                        disabled={idx === timelineData.clips.length - 1}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 2: SUBTITLE LINES */}
          <div className="flex items-center gap-2 min-w-max">
            <div className="w-24 text-[11px] font-bold text-yellow-300 flex items-center gap-1.5 flex-shrink-0">
              <Type className="w-3.5 h-3.5" /> Subtitle ({timelineData.subtitles.length})
            </div>
            <div className="flex gap-2">
              {timelineData.subtitles.map((sub) => {
                const isEditing = editingSubId === sub.id;
                return (
                  <div
                    key={sub.id}
                    className="w-44 bg-slate-900/90 border border-yellow-500/20 rounded-xl p-2 text-xs flex flex-col justify-between"
                  >
                    <div className="text-[10px] font-mono text-slate-400 mb-1">
                      {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s
                    </div>

                    {isEditing ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editingSubText}
                          onChange={(e) => setEditingSubText(e.target.value)}
                          className="w-full bg-black border border-amber-500 text-white text-[11px] p-1 rounded outline-none"
                          rows={2}
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditingSubId(null)}
                            className="px-2 py-0.5 bg-slate-800 text-[10px] rounded text-slate-300"
                          >
                            Hủy
                          </button>
                          <button
                            onClick={() => handleSaveSubtitle(sub.id)}
                            className="px-2 py-0.5 bg-amber-500 text-[10px] rounded text-black font-bold"
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
                        className="text-[11px] text-slate-200 font-medium line-clamp-2 cursor-pointer hover:text-amber-300"
                        title="Bấm để sửa câu này"
                      >
                        {sub.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RENDER PROGRESS MODAL */}
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
