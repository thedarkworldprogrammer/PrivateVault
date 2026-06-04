import { useState, useEffect } from 'react';
import { RefreshCw, Lock } from 'lucide-react';
import { User, UploadedFile, AuthResponse } from './types.js';
import { Api } from './utils/api.js';
import Sidebar from './components/Sidebar.js';
import Dashboard from './components/Dashboard.js';
import AdminPanel from './components/AdminPanel.js';
import AuthLayout from './components/AuthLayout.js';
import DeveloperConsole from './components/DeveloperConsole.js';
import PublicShare from './components/PublicShare.js';
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

  if (isShareRoute) {
    return <PublicShare shareId={shareId} />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [currentTab, setTab] = useState<'files' | 'trash' | 'developer' | 'admin' | 'settings'>('files');
  
  // App Loading Indicators
  const [isInitializing, setIsInitializing] = useState(true);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [telemetryStats, setTelemetryStats] = useState<{ isUsingMongo: boolean; isUsingCloudinary: boolean } | undefined>(undefined);

  // Authenticate Current Client Handshake on Mount
  const initializeAuth = async () => {
    setIsInitializing(true);
    try {
      const res = await Api.getCurrentUser();
      if (res.success && res.data) {
        setUser(res.data.user);
        // Load user vault list as soon as verified
        loadUserVault();
        // Load stats telemetry representing backend setup
        loadTelemetryInfo(res.data.user);
      } else {
        // Clear token since expired/invalid context
        localStorage.removeItem('privatevault_token');
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsInitializing(false);
    }
  };

  const loadTelemetryInfo = async (activeUser: User) => {
    if (activeUser.role === 'admin') {
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
      const res = await Api.getFiles();
      if (res.success && res.data) {
        setFiles(res.data);
      }
    } catch (e) {
      console.warn('Failed to synchronize local directory structure:', e);
    } finally {
      setIsFilesLoading(false);
    }
  };

  const handleRefreshUser = async () => {
    try {
      const res = await Api.getCurrentUser();
      if (res.success && res.data) {
        setUser(res.data.user);
      }
    } catch (e) {
      console.error('Failed to refresh user profile:', e);
    }
  };

  useEffect(() => {
    initializeAuth();
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
  const handleUploadFile = async (rawFile: File, folderId?: string | null): Promise<boolean> => {
    try {
      const res = await Api.uploadFile(rawFile, folderId);
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans">
      {/* Dark Navy brand Sidebar (Left) */}
      <Sidebar
        user={user}
        currentTab={currentTab}
        setTab={setTab}
        onLogout={handleSignOut}
        stats={telemetryStats}
        files={files}
      />

      {/* Main Content Viewer (Right) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 select-none">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Pages</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold uppercase tracking-wider text-xs">
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold shadow-sm uppercase">
                {user.name.slice(0, 2)}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          {currentTab === 'files' ? (
            <Dashboard
              files={files}
              onUploadFile={handleUploadFile}
              onDeleteFile={handleDeleteFile}
              onDeleteMultipleFiles={handleDeleteMultipleFiles}
              onRenameFile={handleRenameFile}
              onAnalyzeFile={handleAnalyzeFile}
              isLoading={isFilesLoading}
              onRefreshFiles={loadUserVault}
            />
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
