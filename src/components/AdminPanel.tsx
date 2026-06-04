import { useState, useEffect } from 'react';
import { 
  Users, HardDrive, File, Database, Cloud, Shield, 
  Trash2, Search, ArrowUpCircle, ArrowDownCircle, RefreshCw, 
  CheckCircle2, AlertCircle, X 
} from 'lucide-react';
import { User } from '../types.js';
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

export default function AdminPanel({ currentUser }: AdminPanelProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);

  // Load Admin Data (Users + System Telemetry Overview Metrics)
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
        // Refresh metrics too
        const statsRes = await Api.getStats();
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
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

  // Bytes Formatter
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Search filter
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="admin-panel-container" className="space-y-6">
      {/* Header operations */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 id="admin-title" className="text-2xl font-sans font-semibold tracking-tight text-slate-900">
            Secure Admin Console
          </h1>
          <p className="text-sm text-slate-500 font-sans">
            Manage user authorization profiles, check system telemetry drives, and audit stored content.
          </p>
        </div>
        <div>
          <button
            onClick={loadAdminTelemetry}
            className="flex items-center gap-2 px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer text-sm font-semibold rounded-lg shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync System Metrics</span>
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
        <div id="stats-dashboard" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Users */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Users</p>
              <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{stats.totalUsers}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Physical user profiles registered</p>
            </div>
          </div>

          {/* Card 2: Files */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <File className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Storage Files</p>
              <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{stats.totalFiles}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Active uploaded database files</p>
            </div>
          </div>

          {/* Card 3: Storage size */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3 bg-fuchsia-50 text-fuchsia-600 rounded-lg">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Disk Storage Allocated</p>
              <h3 className="text-2xl font-bold font-sans text-slate-900 mt-1">{formatBytes(stats.totalStorageBytes)}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Cumulative secure vault sizes</p>
            </div>
          </div>
        </div>
      )}

      {/* Database client index and filter lists */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header container controller */}
        <div className="p-5 border-b border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60">
          <h2 className="text-base font-semibold text-slate-800">
            Registered Account Directory
          </h2>

          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, or profile ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-slate-800 text-sm pl-9 pr-4 py-2 border border-slate-350 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400"
            />
          </div>
        </div>

        {/* User directory table view */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-medium">Scanning network database profiles...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-700">No matching user profiles</h4>
              <p className="text-xs text-slate-400 mt-1">We couldn't find matches inside active index buffers.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="border-b border-slate-150 text-[11px] font-bold text-slate-500 uppercase bg-slate-50 select-none">
                  <th className="px-5 py-3.5">User Details</th>
                  <th className="px-5 py-3.5">User ID</th>
                  <th className="px-5 py-3.5">Registered On</th>
                  <th className="px-5 py-3.5">System Role</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-sm">
                {filteredUsers.map((user) => {
                  const isCurrentUser = user.id === currentUser.id;
                  const isConfirmingDelete = deleteConfirmUserId === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition">
                      {/* Name card details description */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center uppercase">
                            {user.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="foreground font-semibold text-slate-800">
                              {user.name} {isCurrentUser && <span className="text-xs text-blue-600 font-medium font-sans border border-blue-200 bg-blue-50/80 px-1 py-0.2 rounded ml-1 select-none">You</span>}
                            </p>
                            <p className="text-xs text-slate-400">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Profile ID */}
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        {user.id}
                      </td>

                      {/* Created At */}
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>

                      {/* System Role Badge */}
                      <td className="px-5 py-4 text-xs">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-bold uppercase text-[9px] tracking-wide border ${
                          user.role === 'admin' 
                            ? 'bg-red-50 text-red-600 border-red-200' 
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          <Shield className="w-3 h-3" />
                          <span>{user.role}</span>
                        </span>
                      </td>

                      {/* Command switches actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {/* Enable user elevate/demote toggle */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => handleToggleRole(user)}
                              className="p-1.5 hover:bg-slate-100 border border-slate-200 bg-white text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer transition flex items-center gap-1 font-semibold"
                              title={user.role === 'admin' ? "Demote user permissions" : "Elevate user permissions to Admin"}
                            >
                              {user.role === 'admin' ? (
                                <>
                                  <ArrowDownCircle className="w-4 h-4 text-amber-500" />
                                  <span>Demote</span>
                                </>
                              ) : (
                                <>
                                  <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
                                  <span>Elevate</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Delete account actions */}
                          {!isCurrentUser && (
                            <>
                              {isConfirmingDelete ? (
                                <div className="inline-flex items-center gap-1 bg-red-50 p-1 border border-red-200 rounded-lg">
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.name)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer transition"
                                  >
                                    Purge
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
                                  title="Expunge user from database"
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
    </div>
  );
}
