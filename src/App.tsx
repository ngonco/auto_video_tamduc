import React, { useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { LibraryGrid } from './components/LibraryView/LibraryGrid.js';
import { GeneratorWizard } from './components/GeneratorView/GeneratorWizard.js';
import { TimelineEditor } from './components/EditorView/TimelineEditor.js';
import { SettingsForm } from './components/SettingsView/SettingsForm.js';
import { SubtitleLine, TimelineClipItem, SourceClipRecord } from './remotion/types.js';

interface ActiveTimelineState {
  projectId: string;
  projectName: string;
  voicePath: string;
  voiceUrl: string;
  duration: number;
  subtitles: SubtitleLine[];
  clips: TimelineClipItem[];
  availableSources?: SourceClipRecord[];
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'library' | 'generator' | 'editor' | 'settings'>('library');
  const [preselectedProjectId, setPreselectedProjectId] = useState<string>('');

  // Timeline state hiện tại
  const [timelineData, setTimelineData] = useState<ActiveTimelineState | null>(null);

  // Chọn project từ Library để chuyển sang Generator
  const handleSelectProjectForGeneration = (projectId: string, folderName: string) => {
    setPreselectedProjectId(projectId);
    setActiveTab('generator');
  };

  // Nhận kết quả từ Wizard Generator -> mở ngay Editor
  const handleStorylineGenerated = (data: ActiveTimelineState) => {
    setTimelineData(data);
    setActiveTab('editor');
  };

  const handleUpdateClips = (newClips: TimelineClipItem[]) => {
    if (timelineData) {
      setTimelineData({ ...timelineData, clips: newClips });
    }
  };

  const handleUpdateSubtitles = (newSubtitles: SubtitleLine[]) => {
    if (timelineData) {
      setTimelineData({ ...timelineData, subtitles: newSubtitles });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-vietnam">
      {/* Thanh Điều Hướng Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasActiveTimeline={!!timelineData}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'library' && (
          <LibraryGrid onSelectProjectForGeneration={handleSelectProjectForGeneration} />
        )}

        {activeTab === 'generator' && (
          <GeneratorWizard
            initialProjectId={preselectedProjectId}
            onStorylineGenerated={handleStorylineGenerated}
          />
        )}

        {activeTab === 'editor' && (
          timelineData ? (
            <TimelineEditor
              timelineData={timelineData}
              onUpdateClips={handleUpdateClips}
              onUpdateSubtitles={handleUpdateSubtitles}
            />
          ) : (
            <div className="p-16 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                🎬
              </div>
              <h3 className="text-lg font-bold text-slate-200">Chưa có kịch bản video nào</h3>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                Hãy chuyển sang tab "Tạo Video Nhanh" để nạp Voice và chọn thư mục công trình tạo timeline tự động.
              </p>
              <button
                onClick={() => setActiveTab('generator')}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg"
              >
                Bắt Đầu Tạo Video Ngay ➔
              </button>
            </div>
          )
        )}

        {activeTab === 'settings' && <SettingsForm />}
      </main>
    </div>
  );
};
