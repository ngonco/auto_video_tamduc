import React from 'react';
import { Film, Sparkles, FolderKanban, Sliders, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  activeTab: 'library' | 'generator' | 'editor' | 'settings';
  setActiveTab: (tab: 'library' | 'generator' | 'editor' | 'settings') => void;
  hasActiveTimeline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  hasActiveTimeline,
}) => {
  return (
    <header className="h-16 bg-[#111827]/90 backdrop-blur-md border-b border-amber-500/20 px-6 flex items-center justify-between sticky top-0 z-50">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Film className="w-5 h-5 text-slate-950 stroke-[2.5]" />
        </div>
        <div>
          <h1 className="font-montserrat font-bold text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500">
            AUTO VIDEO TÂM ĐỨC
          </h1>
          <p className="text-[11px] text-slate-400 font-medium -mt-0.5">
            Dựng Video 9:16 Không Gian Thờ Phật Tự Động
          </p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-[#1F2937]/60 p-1 rounded-xl border border-slate-700/50">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'library'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <FolderKanban className="w-4 h-4 text-amber-400" />
          Thư Viện Source
        </button>

        <button
          onClick={() => setActiveTab('generator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'generator'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-4 h-4 text-yellow-400" />
          Tạo Video Nhanh
        </button>

        <button
          onClick={() => setActiveTab('editor')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all relative ${
            activeTab === 'editor'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Film className="w-4 h-4 text-amber-400" />
          Trình Dựng Timeline
          {hasActiveTimeline && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse absolute -top-0.5 -right-0.5" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'settings'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Sliders className="w-4 h-4 text-slate-400" />
          Cài Đặt
        </button>
      </nav>

      {/* System Status Indicator */}
      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-full font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Hệ thống sẵn sàng</span>
      </div>
    </header>
  );
};
