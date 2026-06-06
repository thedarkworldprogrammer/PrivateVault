import { useState, useEffect } from 'react';
import { RefreshCw, Lock, Wifi, WifiOff, Menu, Sun, Moon, ChevronRight, Folder } from 'lucide-react';
import { User, UploadedFile, AuthResponse } from './types.js';
import { Api } from './utils/api.js';
import { offlineDb } from './utils/offlineDb.js';
import Sidebar from './components/Sidebar.js';
import Dashboard from './components/Dashboard.js';
import AdminPanel from './components/AdminPanel.js';
import AuthLayout from './components/AuthLayout.js';
import DeveloperConsole from './components/DeveloperConsole.js';
import PublicShare from './components/PublicShare.js';
import ResetPassword from './components/ResetPassword.js';
import TrashBin from './components/TrashBin.js';
import UserSettings from './components/UserSettings.js';
import { NotificationProvider, useNotification } from './components/NotificationCenter.js';

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

function AppContent() {
  const { showSuccess, showError, showInfo } = useNotification();
  const isShareRoute = window.location.pathname.startsWith('/share/');
  const shareId = isShareRoute ? window.location.pathname.split('/').pop() || '' : '';

  const isResetRoute = window.location.pathname === '/reset-password';
  const resetToken = new URLSearchParams(window.location.search).get('token') || '';

  if (isShareRoute) {
    return <PublicShare shareId={shareId} />;
  }

  if (isResetRoute) {
    return <ResetPassword token={resetToken} />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [currentTab, setTab] = useState<'files' | 'trash' | 'developer' | 'admin' | 'settings'>('files');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [dashboardBreadcrumbs, setDashboardBreadcrumbs] = useState<{ id: string | null; name: string }[]>([]);
  
  // App Loading Indicators
  const [isInitializing, setIsInitializing] = useState(true);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [telemetryStats, setTelemetryStats] = useState<{ isUsingMongo: boolean; isUsingCloudinary: boolean } | undefined>(undefined);

  // Authenticate Current Client Handshake on Mount
  const initializeAuth = async () => {
    setIsInitializing(true);
    try {
      if (navigator.onLine) {
        const res = await Api.getCurrentUser();
        if (res.success && res.data) {
          setUser(res.data.user);
          localStorage.setItem('cached_offline_user', JSON.stringify(res.data.user));
          // Load user vault list as soon as verified
          loadUserVault();
          // Load stats telemetry representing backend setup
          loadTelemetryInfo(res.data.user);
        } else {
          const cachedUserStr = localStorage.getItem('cached_offline_user');
          if (cachedUserStr) {
            setUser(JSON.parse(cachedUserStr));
            loadUserVault();
          } else {
            // Clear token since expired/invalid context
            localStorage.removeItem('privatevault_token');
            setUser(null);
          }
        }
      } else {
        const cachedUserStr = localStorage.getItem('cached_offline_user');
        if (cachedUserStr) {
          setUser(JSON.parse(cachedUserStr));
          loadUserVault();
          showInfo(`Running Offline: Restored session for ${JSON.parse(cachedUserStr).name || 'User'}`);
        } else {
          setUser(null);
        }
      }
    } catch {
      const cachedUserStr = localStorage.getItem('cached_offline_user');
      if (cachedUserStr) {
        setUser(JSON.parse(cachedUserStr));
        loadUserVault();
      } else {
        setUser(null);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const loadTelemetryInfo = async (activeUser: User) => {
    if (activeUser.role === 'admin' && navigator.onLine) {
      try {
        const statsRes = await Api.getStats();
        if (statsRes.success && statsRes.data) {
          setTelemetryStats({
            isUsingMongo: statsRes.data.isUsingMongo,
            isUsingCloudinary: statsRes.data.isUsingCloudinary
          });
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  const loadUserVault = async () => {
    setIsFilesLoading(true);
    try {
      if (navigator.onLine) {
        const res = await Api.getFiles();
        if (res.success && res.data) {
          setFiles(res.data);
          // Local cache save async
          offlineDb.saveFiles(res.data);
        } else {
          const cached = await offlineDb.getFiles();
          if (cached && cached.length > 0) {
            setFiles(cached);
          }
        }
      } else {
        const cached = await offlineDb.getFiles();
        if (cached && cached.length > 0) {
          setFiles(cached);
        }
      }
    } catch (e) {
      console.warn('Failed to synchronize local directory structure:', e);
      const cached = await offlineDb.getFiles();
      if (cached && cached.length > 0) {
        setFiles(cached);
      }
    } finally {
      setIsFilesLoading(false);
    }
  };

  const handleRefreshUser = async () => {
    try {
      if (navigator.onLine) {
        const res = await Api.getCurrentUser();
        if (res.success && res.data) {
          setUser(res.data.user);
          localStorage.setItem('cached_offline_user', JSON.stringify(res.data.user));
        }
      }
    } catch (e) {
      console.error('Failed to refresh user profile:', e);
    }
  };

  useEffect(() => {
    initializeAuth();

    const handleOnline = () => {
      setIsOffline(false);
      showSuccess("Internet connection restored. Synchronizing secure files vault.");
      loadUserVault();
    };
    
    const handleOffline = () => {
      setIsOffline(true);
      showInfo("Offline Mode: Interacting with local cached vault metadata.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle Authentication success callbacks
  const handleAuthSuccess = (authData: AuthResponse) => {
    setUser(authData.user);
    loadUserVault();
    loadTelemetryInfo(authData.user);
  };

  // Sign out handle callback action
  const handleSignOut = () => {
    localStorage.removeItem('privatevault_token');
    setUser(null);
    setFiles([]);
    setTab('files');
    setTelemetryStats(undefined);
  };

  // Process File Upload via API
  const handleUploadFile = async (rawFile: File, folderId?: string | null, onProgress?: (percent: number) => void): Promise<boolean> => {
    try {
      const res = await Api.uploadFile(rawFile, folderId, onProgress);
      if (res.success && res.data) {
        // Append newly created file entry to files list reactively
        setFiles(prev => [res.data!, ...prev]);
        showSuccess(`Upload complete! Successfully staged "${rawFile.name}" inside secure vault.`);
        return true;
      } else {
        showError(`Staging failed: ${res.error || `Could not write/upload "${rawFile.name}".`}`);
      }
    } catch (e) {
      console.error('File upload stream crashed.', e);
      showError(`Staging crashed: Encountered error while uploading "${rawFile.name}".`);
    }
    return false;
  };

  // Process File deletion requested by components
  const handleDeleteFile = async (fileId: string): Promise<boolean> => {
    try {
      const res = await Api.deleteFile(fileId);
      if (res.success) {
        // Filter out deleted items from local view state
        setFiles(prev => prev.filter(f => f.id !== fileId));
        showSuccess('Selected file successfully deleted and purged from vault.');
        return true;
      } else {
        showError(`Purge failed: ${res.error || 'Unable to remove file from vault directory.'}`);
      }
    } catch (e) {
      console.error('File delete execution failed.', e);
      showError('Purge failed: Command execution encountered an error.');
    }
    return false;
  };

  const handleDeleteMultipleFiles = async (fileIds: string[]): Promise<boolean> => {
    try {
      const res = await Api.deleteFilesBulk(fileIds);
      if (res.success) {
        // Filter out deleted items from local view state
        setFiles(prev => prev.filter(f => !fileIds.includes(f.id)));
        showSuccess(`Bulk action completed: Successfully purged ${fileIds.length} files from vault.`);
        return true;
      } else {
        showError(`Bulk action failed: ${res.error || 'Unable to execute multi-file deletion.'}`);
      }
    } catch (e) {
      console.error('Bulk delete execution failed.', e);
      showError('Bulk action failed: Command execution encountered an error.');
    }
    return false;
  };

  const handleRenameFile = async (fileId: string, newName: string): Promise<boolean> => {
    try {
      const res = await Api.renameFile(fileId, newName);
      if (res.success && res.data) {
        setFiles(prev => prev.map(f => f.id === fileId ? res.data! : f));
        showSuccess(`Directory metadata updated: Renamed file to "${newName}".`);
        return true;
      } else {
        showError(`Rename failed: ${res.error || 'Could not update filename.'}`);
      }
    } catch (e) {
      console.error('File rename failed.', e);
      showError(`Rename failed: Encountered error while renaming to "${newName}".`);
    }
    return false;
  };

  const handleAnalyzeFile = async (fileId: string): Promise<boolean> => {
    try {
      const res = await Api.analyzeFile(fileId);
      if (res.success && res.data) {
        setFiles(prev => prev.map(f => f.id === fileId ? res.data! : f));
        showSuccess('AI analysis complete. Security classification and suggested folders loaded.');
        return true;
      } else {
        showError(`AI scanning failed: ${res.error || "Unable to parse file details."}`);
      }
    } catch (e) {
      console.error('AI scanning failed:', e);
      showError('AI scanning crashed: Could not analyze the selected file.');
    }
    return false;
  };

  // Splash layout loader
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 select-none">
        <div className="space-y-6 text-center">
          <div className="inline-block bg-slate-800 text-white p-4 rounded-2xl border border-slate-700 shadow-md">
            <Lock className="w-8 h-8 text-blue-500 animate-[pulse_2s_infinite]" />
          </div>
          <div>
            <h1 className="text-2xl font-sans font-bold tracking-tight">PrivateVault</h1>
            <p className="text-xs text-slate-450 mt-1.5 font-mono">Syncing Secure Cryptographic Handshake...</p>
          </div>
          <div>
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-500" />
          </div>
        </div>
      </div>
    );
  }

  // Not logged-in flow
  if (!user) {
    return (
      <AuthLayout
        onAuthSuccess={handleAuthSuccess}
        onLoginApi={Api.login}
        onRegisterApi={Api.register}
        onResetPasswordApi={Api.resetPassword}
      />
    );
  }

  // Logged-in full layout flow
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      {/* Dark Navy brand Sidebar (Left) */}
      <Sidebar
        user={user}
        currentTab={currentTab}
        setTab={setTab}
        onLogout={handleSignOut}
        stats={telemetryStats}
        files={files}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Viewer (Right) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-8 shrink-0 select-none transition-colors duration-200">
          <div className="flex items-center gap-3 sm:gap-4 text-sm text-slate-500 dark:text-slate-400 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-905 transition cursor-pointer"
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline">Pages</span>
            <span className="hidden sm:inline">/</span>
            <span className="text-slate-900 dark:text-slate-100 font-semibold uppercase tracking-wider text-xs truncate">
              {currentTab === 'files' 
                ? 'Dashboard' 
                : currentTab === 'trash' 
                ? 'Trash Bin' 
                : currentTab === 'settings' 
                ? 'User Settings' 
                : currentTab === 'developer' 
                ? 'Dev Platform' 
                : 'Admin Console'}
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            {/* Offline Status Badge */}
            {isOffline ? (
              <div id="network-offline-badge" className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-full text-xs font-bold shadow-2xs animate-pulse select-none">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block animate-ping" />
                <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Offline Mode (Cached Viewer)</span>
                <span className="inline sm:hidden">Offline</span>
              </div>
            ) : (
              <div id="network-online-badge" className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-150 dark:border-emerald-900/40 rounded-full text-xs font-bold select-none">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Secure Vault Online</span>
                <span className="inline sm:hidden">Online</span>
              </div>
            )}

            {/* Theme Toggle in Header Navbar */}
            <div id="header-theme-toggle-container" className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700 select-none">
              <button
                id="header-theme-btn-light"
                onClick={() => setTheme('light')}
                className={`p-1 rounded-md text-xs font-bold leading-none flex items-center justify-center transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white text-amber-500 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
                title="Switch to light theme"
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                id="header-theme-btn-dark"
                onClick={() => setTheme('dark')}
                className={`p-1 rounded-md text-xs font-bold leading-none flex items-center justify-center transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-700 text-amber-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
                title="Switch to dark theme"
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block font-sans">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-none mb-0.5">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{user.email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold shadow-sm uppercase">
                {user.name.slice(0, 2)}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Folders Breadcrumbs Trail below header */}
        {currentTab === 'files' && user?.role !== 'admin' && dashboardBreadcrumbs.length > 0 && (
          <div id="dashboard-header-breadcrumbs" className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/85 px-4 sm:px-8 py-2.5 flex items-center justify-between gap-4 text-xs font-sans transition-colors duration-200 shrink-0">
            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
              <span className="text-slate-450 dark:text-slate-500 font-mono uppercase tracking-wider text-[10px] select-none mr-1">Path:</span>
              {dashboardBreadcrumbs.map((crumb, idx) => (
                <div key={crumb.id || 'root-crumb-sub'} className="flex items-center gap-1.5 min-w-0">
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-350 dark:text-slate-600 shrink-0" />}
                  <button
                    onClick={() => {
                      setCurrentFolderId(crumb.id);
                    }}
                    className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 select-none text-xs truncate ${
                      crumb.id === currentFolderId
                        ? 'bg-blue-50 dark:bg-blue-950/45 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-900/30'
                        : 'text-slate-605 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                    title={`Navigate to ${crumb.name}`}
                  >
                    {crumb.id === null && (
                      <Folder className="w-3.5 h-3.5 text-slate-455 dark:text-slate-500 fill-slate-300/20 shrink-0" />
                    )}
                    <span>{crumb.name}</span>
                  </button>
                </div>
              ))}
            </div>
            
            {/* Folder helper stats info */}
            {currentFolderId && (
              <span className="hidden md:inline text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider select-none">
                Viewing subfolder vault
              </span>
            )}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/50 dark:bg-slate-900/40 transition-colors duration-200">
          {currentTab === 'files' ? (
            user.role === 'admin' ? (
              <AdminPanel currentUser={user} />
            ) : (
              <Dashboard
                files={files}
                onUploadFile={handleUploadFile}
                onDeleteFile={handleDeleteFile}
                onDeleteMultipleFiles={handleDeleteMultipleFiles}
                onRenameFile={handleRenameFile}
                onAnalyzeFile={handleAnalyzeFile}
                isLoading={isFilesLoading}
                onRefreshFiles={loadUserVault}
                user={user}
                currentFolderId={currentFolderId}
                onFolderChange={setCurrentFolderId}
                onBreadcrumbsChange={setDashboardBreadcrumbs}
              />
            )
          ) : currentTab === 'trash' ? (
            <TrashBin
              files={files}
              user={user}
              onRefreshFiles={loadUserVault}
            />
          ) : currentTab === 'settings' ? (
            <UserSettings
              user={user}
              onRefreshUser={handleRefreshUser}
              files={files}
            />
          ) : currentTab === 'developer' ? (
            <DeveloperConsole />
          ) : (
            user.role === 'admin' && <AdminPanel currentUser={user} />
          )}
        </main>
      </div>
    </div>
  );
}
