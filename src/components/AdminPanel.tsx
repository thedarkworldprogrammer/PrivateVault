import { useState, useEffect } from 'react';
import { 
  Users, HardDrive, File, Database, Cloud, Shield, 
  Trash2, Search, ArrowUpCircle, ArrowDownCircle, RefreshCw, 
  CheckCircle2, AlertCircle, X, ArrowLeft, FolderOpen, 
  ExternalLink, Calendar, Eye, Download, FileText, 
  Image as ImageIcon, Video, Music, Activity, Link as LinkIcon
} from 'lucide-react';
import { User, UploadedFile, Folder, ActivityLog } from '../types.js';
import { Api } from '../utils/api.js';

interface AdminPanelProps {
  currentUser: User;
}

interface PerformanceStats {
  totalUsers: number;
  totalFiles: number;
  totalStorageBytes: number;
  isUsingMongo: boolean;
  isUsingCloudinary: boolean;
}

interface EnrichedUser extends User {
  fileCount?: number;
  totalSize?: number;
  activityCount?: number;
  lastActivity?: string | null;
}

export default function AdminPanel({ currentUser }: AdminPanelProps) {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);

  // Drill-down vault viewing states
  const [selectedUser, setSelectedUser] = useState<EnrichedUser | null>(null);
  const [userFiles, setUserFiles] = useState<UploadedFile[]>([]);
  const [userFolders, setUserFolders] = useState<Folder[]>([]);
  const [userLogs, setUserLogs] = useState<ActivityLog[]>([]);
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [selectedFileMeta, setSelectedFileMeta] = useState<UploadedFile | null>(null);

  // Load Admin Data (Users + System Telementry)
  const loadAdminTelemetry = async () => {
    setIsLoading(true);
    setAlertInfo(null);
    try {
      const usersRes = await Api.getAdminUsers();
      const statsRes = await Api.getStats();

      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data);
      } else {
        setAlertInfo({ type: 'error', message: usersRes.error || 'Failed to fetch user accounts directory.' });
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch {
      setAlertInfo({ type: 'error', message: 'An unexpected connection error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminTelemetry();
  }, []);

  // Update User role (Promote / Demote)
  const handleToggleRole = async (targetUser: User) => {
    const nextRole = targetUser.role === 'admin' ? 'user' : 'admin';
    try {
      const res = await Api.updateUserRole(targetUser.id, nextRole);
      if (res.success) {
        setAlertInfo({ 
          type: 'success', 
          message: `Successfully modified ${targetUser.name}'s authorization role to ${nextRole}.` 
        });
        // Update local list
        setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: nextRole } : u));
        
        // If changing current user's role on themselves (though restricted generally, update states just in case)
        if (targetUser.id === currentUser.id) {
          window.location.reload();
        }
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Failed to change user authorization parameters.' });
      }
    } catch {
      setAlertInfo({ type: 'error', message: 'Failed to access structural backend roles API.' });
    }
  };

  // Delete User account
  const handleDeleteUser = async (userId: string, userName: string) => {
    setDeleteConfirmUserId(null);
    try {
      const res = await Api.deleteUser(userId);
      if (res.success) {
        setAlertInfo({ 
          type: 'success', 
          message: `User account "${userName}" and all associated file vaults have been completely purged.` 
        });
        setUsers(prev => prev.filter(u => u.id !== userId));
        
        // If drill-down user is deleted, clear state
        if (selectedUser?.id === userId) {
          setSelectedUser(null);
        }

        // Refresh telemetry
        const statsRes = await Api.getStats();
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Failed to delete selected user.' });
      }
    } catch {
      setAlertInfo({ type: 'error', message: 'Failed to request account deletion from API.' });
    }
  };

  // Click a user row to explore their personal files vault & activity log
  const handleExploreUser = async (user: EnrichedUser) => {
    setSelectedUser(user);
    setIsVaultLoading(true);
    setSelectedFileMeta(null);
    try {
      const res = await Api.getAdminUserFiles(user.id);
      if (res.success && res.data) {
        setUserFiles(res.data.files || []);
        setUserFolders(res.data.folders || []);
        setUserLogs(res.data.activityLogs || []);
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Failed to fetch personal vaults.' });
      }
    } catch {
      setAlertInfo({ type: 'error', message: 'An unexpected connection error occurred retrieving user files.' });
    } finally {
      setIsVaultLoading(false);
    }
  };

  // Delete user's individual file directly from Admin Panel
  const handlePurgeUserFile = async (fileId: string, fileName: string) => {
    if (!selectedUser) return;
    try {
      const res = await Api.purgeFile(fileId);
      if (res.success) {
        setUserFiles(prev => prev.filter(f => f.id !== fileId));
        if (selectedFileMeta?.id === fileId) {
          setSelectedFileMeta(null);
        }
        setAlertInfo({ type: 'success', message: `Successfully purged "${fileName}" from ${selectedUser.name}'s vault.` });
        
        // Decrement counters in root list
        setUsers(prev => prev.map(u => {
          if (u.id === selectedUser.id) {
            return {
              ...u,
              fileCount: Math.max(0, (u.fileCount || 1) - 1),
            };
          }
          return u;
        }));
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Failed to purge the file.' });
      }
    } catch {
      setAlertInfo({ type: 'error', message: 'Error calling purge API.' });
    }
  };

  // Bytes Formatter
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Byt', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Choose file matching icon
  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return <FileText className="w-5 h-5 text-slate-400" />;
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    if (mimeType.startsWith('video/')) return <Video className="w-5 h-5 text-indigo-500" />;
    if (mimeType.startsWith('audio/')) return <Music className="w-5 h-5 text-rose-500" />;
    return <FileText className="w-5 h-5 text-blue-500" />;
  };

  // Search filter
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="admin-panel-container" className="space-y-6 max-w-full">
      {/* Admin Mode Badge Indicators (Top Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-red-50/60 border border-red-100 shadow-xs animate-pulse-subtle">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
          </span>
          <div>
            <span className="text-xs font-bold text-red-700 uppercase tracking-wider font-mono">
              Admin Mode Panel Active
            </span>
            <p className="text-xs text-red-600 mt-0.5">
              Logged in: <strong className="font-mono">{currentUser.email}</strong> with absolute master auditor access.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats?.isUsingMongo ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase py-0.5 px-2 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md">
              <Database className="w-3 h-3" /> MongoDB Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase py-0.5 px-2 bg-amber-100 text-amber-800 border border-amber-250 rounded-md">
              <File className="w-3 h-3" /> Fallback JSON DB
            </span>
          )}

          {stats?.isUsingCloudinary ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase py-0.5 px-2 bg-purple-100 text-purple-800 border border-purple-200 rounded-md">
              <Cloud className="w-3 h-3" /> Cloudinary Media Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase py-0.5 px-2 bg-slate-100 text-slate-800 border border-slate-200 rounded-md">
              <HardDrive className="w-3 h-3" /> Disk Storage
            </span>
          )}
        </div>
      </div>

      {!selectedUser ? (
        <>
          {/* Main Users Directory Listing view */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 id="admin-title" className="text-2xl font-sans font-semibold tracking-tight text-slate-900">
                Secure Vault Master Console
              </h1>
              <p className="text-sm text-slate-500 font-sans">
                Audit registered users accounts, monitor file storage allocations, change authorizations, and inspect metadata.
              </p>
            </div>
            <div>
              <button
                onClick={loadAdminTelemetry}
                className="flex items-center gap-2 px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer text-sm font-semibold rounded-lg shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Re-sync Directory</span>
              </button>
            </div>
          </div>

          {/* Admin Alerts display notification */}
          {alertInfo && (
            <div 
              id="admin-alert" 
              className={`p-4 rounded-lg flex items-start gap-3 border transition-all duration-300 ${
                alertInfo.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {alertInfo.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm font-medium">
                {alertInfo.message}
              </div>
              <button 
                onClick={() => setAlertInfo(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* System Stats bento dashboard */}
          {stats && (
            <div id="stats-dashboard" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card 1: Users */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Registers</p>
                  <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{stats.totalUsers}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Physical user profiles</p>
                </div>
              </div>

              {/* Card 2: Files */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                  <File className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Vault Files</p>
                  <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{stats.totalFiles}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Cumulative uploaded vault files</p>
                </div>
              </div>

              {/* Card 3: Storage size */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 sm:col-span-2 lg:col-span-1">
                <div className="p-3 bg-fuchsia-50 text-fuchsia-600 rounded-lg">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cumulative Files Weight</p>
                  <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{formatBytes(stats.totalStorageBytes)}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Cloud Storage payload weight</p>
                </div>
              </div>
            </div>
          )}

          {/* Database directory list */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header with Search */}
            <div className="p-5 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  Registered Account Administration
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click on any user row or "View Vault & Stats" to inspect files, links and full audit trail histories.
                </p>
              </div>

              <div className="relative w-full sm:max-w-xs md:max-w-sm">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, email, or id..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-slate-800 text-sm pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400"
                />
              </div>
            </div>

            {/* User directories responsive list/table */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-450" />
                  <p className="text-sm font-medium">Scanning network database profiles...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-slate-700">No matching user profiles</h4>
                  <p className="text-xs text-slate-400 mt-1">We couldn't find matches inside active indexes.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse table-auto min-w-[800px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase bg-slate-50/80 tracking-wider">
                      <th className="px-5 py-4">User Details</th>
                      <th className="px-5 py-4">Storage Metrics</th>
                      <th className="px-5 py-4">Activity Statistics</th>
                      <th className="px-5 py-4">Created On</th>
                      <th className="px-5 py-4">System Role</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 text-sm">
                    {filteredUsers.map((user) => {
                      const isCurrentUser = user.id === currentUser.id;
                      const isConfirmingDelete = deleteConfirmUserId === user.id;

                      return (
                        <tr 
                          key={user.id} 
                          className="hover:bg-blue-50/20 active:bg-blue-50/40 transition cursor-pointer"
                          onClick={() => handleExploreUser(user)}
                        >
                          {/* NameCard */}
                          <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-650 font-bold text-sm flex items-center justify-center uppercase">
                                {user.name.slice(0, 2)}
                              </div>
                              <div>
                                <p className="foreground font-semibold text-slate-800">
                                  {user.name} {isCurrentUser && <span className="text-[10px] text-blue-600 font-bold border border-blue-200 bg-blue-50 px-1 py-0.2 rounded ml-1 select-none uppercase">You</span>}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Storage Stats */}
                          <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-medium text-slate-700">
                              <span className="font-semibold text-slate-950 font-mono">
                                {user.fileCount ?? 0}
                              </span> files
                            </div>
                            <div className="text-[10px] text-slate-450 mt-0.5 font-mono">
                              {formatBytes(user.totalSize ?? 0)} consumed
                            </div>
                          </td>

                          {/* Activity Stats */}
                          <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-blue-500" />
                              <span>{user.activityCount ?? 0} Actions</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {user.lastActivity ? (
                                <>Last action: {new Date(user.lastActivity).toLocaleDateString()}</>
                              ) : (
                                <>No activity recorded</>
                              )}
                            </div>
                          </td>

                          {/* Registered At */}
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>

                          {/* Role Badge */}
                          <td className="px-5 py-4 text-xs" onClick={(e) => e.stopPropagation()}>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wide border ${
                              user.role === 'admin' 
                                ? 'bg-red-50 text-red-650 border-red-200' 
                                : 'bg-slate-50 text-slate-650 border-slate-200'
                            }`}>
                              <Shield className="w-3 h-3" />
                              <span>{user.role}</span>
                            </span>
                          </td>

                          {/* Action button groupings */}
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2 text-xs">
                              {/* Open detail view triggers directly */}
                              <button
                                onClick={() => handleExploreUser(user)}
                                className="px-2.5 py-1.5 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg cursor-pointer transition font-semibold text-xs inline-flex items-center gap-1 bg-white"
                                title="Inspect this profile's secure drive"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Explore Vault</span>
                              </button>

                              {/* Toggle authorization role */}
                              {!isCurrentUser && (
                                <button
                                  onClick={() => handleToggleRole(user)}
                                  className="p-1.5 hover:bg-slate-100 border border-slate-200 bg-white text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer transition"
                                  title={user.role === 'admin' ? "Demote privileges" : "Elevate to Admin"}
                                >
                                  {user.role === 'admin' ? (
                                    <ArrowDownCircle className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
                                  )}
                                </button>
                              )}

                              {/* Expunge user account */}
                              {!isCurrentUser && (
                                <>
                                  {isConfirmingDelete ? (
                                    <div className="inline-flex items-center gap-1 bg-red-50 p-1 border border-red-200 rounded-lg">
                                      <button
                                        onClick={() => handleDeleteUser(user.id, user.name)}
                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer transition"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmUserId(null)}
                                        className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmUserId(user.id)}
                                      className="p-1.5 hover:bg-red-50 text-slate-450 hover:text-red-600 rounded-lg border border-transparent cursor-pointer transition"
                                      title="Delete user from system completely"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Detailed Drill-Down explorer panel view */
        <div className="space-y-6">
          {/* Drill-down Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2.5 hover:bg-slate-100 border border-slate-200 bg-white text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer transition shadow-xs"
                title="Return to account registry list"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-850 tracking-tight font-sans">
                    {selectedUser.name}'s Vault Workspace
                  </h1>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wide border ${
                    selectedUser.role === 'admin' 
                      ? 'bg-red-50 text-red-650 border-red-200' 
                      : 'bg-slate-50 text-slate-650 border-slate-200'
                  }`}>
                    {selectedUser.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>Email: <strong className="font-mono text-slate-800">{selectedUser.email}</strong></span>
                  <span>•</span>
                  <span>Created: <strong className="text-slate-800">{new Date(selectedUser.createdAt).toLocaleDateString()}</strong></span>
                  <span>•</span>
                  <span>Account ID: <strong className="font-mono text-slate-600">{selectedUser.id}</strong></span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExploreUser(selectedUser)}
                className="flex items-center gap-2 px-3.5 py-1.5 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition cursor-pointer text-xs font-semibold rounded-lg shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Vault Data</span>
              </button>
            </div>
          </div>

          {/* Drill-down admin alerts */}
          {alertInfo && (
            <div className="p-4 bg-slate-50 border border-slate-200 text-slate-705 rounded-xl text-sm font-medium flex items-center justify-between">
              <span>{alertInfo.message}</span>
              <button onClick={() => setAlertInfo(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1">Dismiss</button>
            </div>
          )}

          {isVaultLoading ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3 text-slate-400" />
              <p className="text-base font-semibold text-slate-700">Decryption buffer fetching secure vaults...</p>
              <p className="text-xs text-slate-400 mt-1">Retrieving media, directories, and activity audit metadata logs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Vault File List Table Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Directories and files Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800">
                      <FolderOpen className="w-5 h-5 text-blue-500" />
                      <h3 className="font-semibold text-sm">Stored Documents & Media Directories ({userFiles.length} items)</h3>
                    </div>
                  </div>

                  {userFiles.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <FolderOpen className="w-12 h-12 text-slate-250 mx-auto mb-2" />
                      <p className="font-semibold text-slate-650 text-sm">This vault is currently empty</p>
                      <p className="text-xs text-slate-400 mt-1">The user hasn't uploaded any documents or folders yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse table-auto text-sm">
                        <thead>
                          <tr className="bg-slate-50/40 text-[10px] font-bold text-slate-450 uppercase tracking-wider border-b border-slate-150 select-none">
                            <th className="px-4 py-3">File Asset Name</th>
                            <th className="px-4 py-3">Capacity Size</th>
                            <th className="px-4 py-3">Upload Stamp</th>
                            <th className="px-4 py-3 text-right">Vault Management</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {userFiles.map((file) => (
                            <tr 
                              key={file.id} 
                              className={`hover:bg-blue-50/20 transition cursor-pointer ${selectedFileMeta?.id === file.id ? 'bg-blue-50/10' : ''}`}
                              onClick={() => setSelectedFileMeta(file)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex-shrink-0">
                                    {getFileIcon(file.mimeType)}
                                  </div>
                                  <div className="max-w-xs sm:max-w-md truncate">
                                    <p className="font-medium text-slate-800 text-xs sm:text-sm truncate" title={file.name}>
                                      {file.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate tracking-tight uppercase">
                                      {file.mimeType || 'application/octet-stream'}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                                {formatBytes(file.size || 0)}
                              </td>

                              <td className="px-4 py-3 text-xs text-slate-400">
                                {new Date(file.createdAt).toLocaleDateString()}
                              </td>

                              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Cloudinary public metadata view link */}
                                  <button
                                    onClick={() => setSelectedFileMeta(file)}
                                    className="p-1 px-2.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 cursor-pointer transition select-none uppercase tracking-tight"
                                  >
                                    View Metadata
                                  </button>

                                  {/* Direct preview in new tab */}
                                  {file.url && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 text-slate-450 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                      title="Open original CDN payload link"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  )}

                                  {/* Extreme force purge from system */}
                                  <button
                                    onClick={() => handlePurgeUserFile(file.id, file.name)}
                                    className="p-1.5 text-slate-450 hover:text-red-650 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                    title="Purge asset permanently"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Selected File Cloudinary System Metadata Auditor View */}
                {selectedFileMeta && (
                  <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-lg overflow-hidden animate-slide-up">
                    <div className="p-4 bg-slate-950 border-b border-slate-850 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-4.5 h-4.5 text-purple-400 animate-pulse" />
                        <h4 className="font-bold text-xs uppercase tracking-wider font-mono text-purple-300">
                          Cloudinary CDN Secure Asset Descriptor Block
                        </h4>
                      </div>
                      <button 
                        onClick={() => setSelectedFileMeta(null)} 
                        className="p-1 text-slate-400 hover:text-slate-200 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Database Record ID:</span>
                          <span className="text-slate-300 font-semibold break-all select-all">{selectedFileMeta.id}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Cloud Storage Filename:</span>
                          <span className="text-slate-300 font-semibold break-all select-all">{selectedFileMeta.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Mime Categorization:</span>
                          <span className="text-slate-305 font-semibold text-blue-300">{selectedFileMeta.mimeType || 'Unknown/OctetStream'}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Created Datetime:</span>
                          <span className="text-slate-300">{new Date(selectedFileMeta.createdAt).toString()}</span>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Secure Asset Storage URL:</span>
                          <a 
                            href={selectedFileMeta.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-cyan-400 hover:underline inline-flex items-center gap-1 break-all select-all max-w-full"
                          >
                            <span>{selectedFileMeta.url}</span>
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight">Public Cloud Delivery:</span>
                          <span className="text-slate-300 font-semibold break-all">
                            {selectedFileMeta.url ? selectedFileMeta.url.replace('https://', '').split('/')[0] : 'None'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-450 block uppercase text-[10px] tracking-tight font-sans text-red-400 font-semibold">Security Action Options:</span>
                          <div className="mt-2 flex gap-2">
                            <a
                              href={selectedFileMeta.url}
                              download={selectedFileMeta.name}
                              className="px-3 py-1 bg-slate-800 text-slate-205 hover:bg-slate-700 hover:text-white rounded text-xs leading-5 inline-flex items-center gap-1 cursor-pointer font-sans font-semibold border border-slate-700 transition"
                            >
                              <Download className="w-3.5 h-3.5" /> Download Target
                            </a>
                            <button
                              onClick={() => handlePurgeUserFile(selectedFileMeta.id, selectedFileMeta.name)}
                              className="px-3 py-1 bg-red-950/60 text-red-400 hover:bg-red-900 rounded text-xs leading-5 inline-flex items-center gap-1 cursor-pointer font-sans font-semibold border border-red-900 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Purge payload
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right User Activity Audit Trail Column */}
              <div className="space-y-6">
                {/* Profile Audit logs */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center gap-2 text-slate-800">
                    <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
                    <h3 className="font-semibold text-sm">Security Audit Logs ({userLogs.length} events)</h3>
                  </div>

                  <div className="p-4 bg-slate-950 text-slate-300 font-mono text-[11px] max-h-[450px] overflow-y-auto space-y-3.5 select-all">
                    {userLogs.length === 0 ? (
                      <div className="p-12 text-center text-slate-500 font-mono">
                        <p>[No system events logged]</p>
                      </div>
                    ) : (
                      userLogs.map((log) => {
                        return (
                          <div key={log.id} className="border-b border-slate-900 pb-3 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-500">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded-full font-bold uppercase text-[8px] tracking-wide ${
                                log.action.includes('error') || log.action.includes('failed')
                                  ? 'bg-red-950 text-red-400'
                                  : 'bg-indigo-950 text-indigo-450'
                              }`}>
                                {log.action.split(' ')[0]}
                              </span>
                            </div>
                            <div className="text-slate-200 font-bold mt-1 text-xs break-all">
                              {log.action}
                            </div>
                            <p className="text-slate-450 text-[10px] mt-0.5 max-w-full overflow-hidden truncate font-sans">
                              IP: {log.ipAddress || '127.0.0.1'} • UA: {log.userAgent ? log.userAgent.split(' ')[0] : 'ClientAgent'}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 border-t border-slate-150 text-center">
                    <span className="text-[10px] text-slate-400 font-semibold font-mono uppercase tracking-tight">
                      Durable System Cryptographic logs
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
