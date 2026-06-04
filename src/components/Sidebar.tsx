import { Folder, Users, LogOut, Database, Cloud, Lock, BarChart3, AlertCircle, HardDrive, Terminal, Trash2, Settings, X } from 'lucide-react';
import { User, UploadedFile } from '../types.js';

interface SidebarProps {
  user: User;
  currentTab: 'files' | 'trash' | 'developer' | 'admin' | 'settings';
  setTab: (tab: 'files' | 'trash' | 'developer' | 'admin' | 'settings') => void;
  onLogout: () => void;
  stats?: {
    isUsingMongo: boolean;
    isUsingCloudinary: boolean;
  };
  files: UploadedFile[];
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ user, currentTab, setTab, onLogout, stats, files, isOpen, onClose }: SidebarProps) {
  const isUsingMongo = stats?.isUsingMongo ?? false;
  const isUsingCloudinary = stats?.isUsingCloudinary ?? false;

  const handleTabClick = (tab: 'files' | 'trash' | 'developer' | 'admin' | 'settings') => {
    setTab(tab);
    if (onClose) onClose();
  };

  // Storage metric logic inputs
  const totalSizeBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
  const STORAGE_LIMIT = user.role === 'admin' ? 5 * 1024 * 1024 * 1024 : 500 * 1024 * 1024; // 5GB limit for admins, 500MB limit for standard users
  const usagePercentage = Math.min((totalSizeBytes / STORAGE_LIMIT) * 100, 100);

  // Bytes Formatter
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <>
      {/* Mobile background backdrop overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden cursor-pointer animate-fade-in"
          id="sidebar-backdrop"
        />
      )}

      <aside 
        id="app-sidebar" 
        className={`w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between text-slate-100 flex-shrink-0 h-screen select-none transition-transform duration-300 ease-in-out fixed inset-y-0 left-0 md:static md:translate-x-0 z-45 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Upper sidebar brand and navigation */}
        <div>
          {/* Brand logo header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Lock className="w-6 h-6" />
              </div>
              <span className="font-sans font-bold text-lg tracking-tight text-white">
                PrivateVault
              </span>
            </div>
            {/* Mobile close button */}
            <button 
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Selection Navigation */}
          <nav className="p-4 space-y-1">
            <button
              id="nav-tab-files"
              onClick={() => handleTabClick('files')}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 gap-3 ${
                currentTab === 'files'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {user.role === 'admin' ? (
                <>
                  <BarChart3 className="w-5 h-5 flex-shrink-0" />
                  <span>Admin Dashboard</span>
                </>
              ) : (
                <>
                  <Folder className="w-5 h-5 flex-shrink-0" />
                  <span>My Files</span>
                </>
              )}
            </button>

            <button
              id="nav-tab-trash"
              onClick={() => handleTabClick('trash')}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 gap-3 ${
                currentTab === 'trash'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Trash2 className="w-5 h-5 flex-shrink-0" />
              <span>Trash Bin</span>
            </button>

            <button
              id="nav-tab-settings"
              onClick={() => handleTabClick('settings')}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 gap-3 ${
                currentTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span>User Settings</span>
            </button>

            <button
              id="nav-tab-developer"
              onClick={() => handleTabClick('developer')}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 gap-3 ${
                currentTab === 'developer'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Terminal className="w-5 h-5 flex-shrink-0" />
              <span>Dev Platform</span>
            </button>


          </nav>
        </div>

      {/* Footer system details and logged-in user profile */}
      <div className="p-4 border-t border-slate-800 space-y-4">
        {/* Storage Usage Indicator */}
        <div id="sidebar-storage-indicator" className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-slate-500 uppercase">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-450" />
              <span>Storage Used</span>
            </div>
            <span id="storage-percentage-label" className={`font-bold ${usagePercentage > 90 ? 'text-red-400' : usagePercentage > 75 ? 'text-amber-400' : 'text-blue-400'}`}>
              {usagePercentage.toFixed(1)}%
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden" id="storage-progress-track">
            <div 
              id="storage-progress-bar"
              className={`h-full transition-all duration-300 rounded-full ${
                usagePercentage > 90 
                  ? 'bg-red-500' 
                  : usagePercentage > 75 
                    ? 'bg-amber-500' 
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              }`}
              style={{ width: `${Math.max(usagePercentage, 2)}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span id="storage-used-formatted">{formatBytes(totalSizeBytes)}</span>
            <span id="storage-total-formatted">of {formatBytes(STORAGE_LIMIT)}</span>
          </div>
        </div>

        {/* Connection Telemetry Indicators (Clean, true and elegant indicators) */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-slate-500" />
            <span>Telemetry Drivers</span>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Database className="w-3 h-3" /> Database
            </span>
            {isUsingMongo ? (
              <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50 font-bold">
                MongoDB
              </span>
            ) : (
              <span className="text-amber-400 text-[10px] bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50" title="Running in self-sustained developer JSON mode">
                Local DB
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Cloud className="w-3 h-3" /> Storage
            </span>
            {isUsingCloudinary ? (
              <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50 font-bold">
                Cloudinary
              </span>
            ) : (
              <span className="text-amber-400 text-[10px] bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50" title="Saving uploads locally to mock storage safely">
                Local Disk
              </span>
            )}
          </div>
        </div>

        {/* User Identity Details & Logout */}
        <div className="flex flex-col gap-2">
          <div className="bg-slate-800/50 p-3 rounded-lg flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
              {user.name.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate text-white" title={user.name}>
                {user.name}
              </div>
              <div className="text-xs truncate text-slate-400" title={user.email}>
                {user.email}
              </div>
              <div className="mt-1">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                  user.role === 'admin' ? 'bg-red-950/80 text-red-300 border border-red-900/40' : 'bg-slate-900 text-slate-400 border border-slate-700/60'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>

          <button
            id="btn-sidebar-logout"
            onClick={onLogout}
            className="w-full flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-red-900/25 hover:text-red-400 text-slate-300 hover:border-red-900/30 border border-transparent rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
