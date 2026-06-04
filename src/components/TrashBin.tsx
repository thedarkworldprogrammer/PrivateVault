import React, { useState } from 'react';
import { Trash2, RotateCcw, File, AlertTriangle, Clock, HardDrive, Filter, ArrowUpDown } from 'lucide-react';
import { UploadedFile, User } from '../types.js';
import { Api } from '../utils/api.js';
import { useNotification } from './NotificationCenter.js';

interface TrashBinProps {
  files: UploadedFile[];
  user: User;
  onRefreshFiles: () => Promise<void>;
}

export default function TrashBin({ files, user, onRefreshFiles }: TrashBinProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [isProcessing, setIsProcessing] = useState<string | null>(null); // tracks active file ID processing
  const [isCleaningAll, setIsCleaningAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Get trashed files
  const trashedFiles = files.filter(f => f.isTrashed);
  const filteredTrashed = trashedFiles.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats calculation
  const totalTrashedSize = trashedFiles.reduce((acc, file) => acc + (file.size || 0), 0);

  // Bytes Formatter
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleRestore = async (fileId: string, fileName: string) => {
    setIsProcessing(fileId);
    try {
      const res = await Api.restoreFile(fileId);
      if (res.success) {
        showSuccess(`Successfully restored "${fileName}" to its original directory.`);
        await onRefreshFiles();
      } else {
        showError(res.error || `Failed to restore file "${fileName}".`);
      }
    } catch (e: any) {
      showError(`Restore failed: ${e.message || 'Server connection error.'}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handlePurge = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you absolutely sure you want to permanently purge "${fileName}"? This action CANNOT be undone and will free up storage immediately.`)) {
      return;
    }
    
    setIsProcessing(fileId);
    try {
      const res = await Api.purgeFile(fileId);
      if (res.success) {
        showSuccess(`"${fileName}" has been permanently deleted from storage.`);
        await onRefreshFiles();
      } else {
        showError(res.error || `Failed to purge file "${fileName}".`);
      }
    } catch (e: any) {
      showError(`Purge failed: ${e.message || 'Server connection error.'}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleClearAll = async () => {
    if (trashedFiles.length === 0) return;
    
    if (!window.confirm(`CRITICAL WARNING: You are about to permanently purge ALL ${trashedFiles.length} files in the Trash Bin. \n\nThis will permanently delete these files from active disk/cloud storage, free up storage, and is completely irreversible. \n\nDo you wish to proceed?`)) {
      return;
    }

    setIsCleaningAll(true);
    try {
      const res = await Api.clearTrash();
      if (res.success) {
        showSuccess(`Successfully emptied Trash Bin! Permanently purged all trashed files.`);
        await onRefreshFiles();
      } else {
        showError(res.error || 'Failed to empty Trash Bin.');
      }
    } catch (e: any) {
      showError(`Failed to empty trash: ${e.message || 'Server connection error.'}`);
    } finally {
      setIsCleaningAll(false);
    }
  };

  // Human readable retention message
  const retentionDays = user.trashRetentionDays !== undefined ? user.trashRetentionDays : 30;
  const retentionPolicyText = retentionDays > 0 
    ? `configured to automatically purge files older than ${retentionDays} days.` 
    : 'disabled (files in trash will be kept indefinitely until manually purged).';

  return (
    <div className="space-y-6" id="trash-bin-scaffold">
      {/* Title Header area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-2xl font-sans font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-500" />
            <span>Trash Bin Vault</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Safely stage, restore, or permanently purge deleted items. Your trash policy is currently <span className="font-semibold text-slate-800">{retentionPolicyText}</span>
          </p>
        </div>

        {trashedFiles.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={isCleaningAll}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 rounded-lg text-sm font-semibold cursor-pointer transition flex items-center gap-2 self-start sm:self-center shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isCleaningAll ? 'Emptying...' : 'Empty Trash Bin'}</span>
          </button>
        )}
      </div>

      {/* Info Stats Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-lg text-red-600 shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Trashed Status</p>
            <p className="text-xl font-bold text-slate-800">{trashedFiles.length} file(s)</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600 shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Storage Occupied</p>
            <p className="text-xl font-bold text-slate-800">{formatBytes(totalTrashedSize)}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Retention Setting</p>
            <p className="text-xl font-bold text-slate-800">{retentionDays > 0 ? `${retentionDays} Days` : 'Infinite'}</p>
          </div>
        </div>
      </div>

      {/* Main Files Table or Empty Container */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Search tool block */}
        {trashedFiles.length > 0 && (
          <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between gap-4">
            <div className="relative max-w-sm w-full">
              <input
                type="text"
                placeholder="Search trashed files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-slate-800 text-sm pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition"
              />
              <span className="absolute left-3 top-2.5 text-slate-400">
                <File className="w-4 h-4" />
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Showing {filteredTrashed.length} of {trashedFiles.length} item(s)
            </div>
          </div>
        )}

        {/* Content Render */}
        {trashedFiles.length === 0 ? (
          <div className="p-16 text-center select-none flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
              <Trash2 className="w-12 h-12" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800">Your Trash Bin is clean</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Any files you delete from your vault will stage temporarily here. Based on your retention policy settings, expired trash items are purged automatically.
              </p>
            </div>
          </div>
        ) : filteredTrashed.length === 0 ? (
          <div className="p-16 text-center select-none flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
              <Filter className="w-12 h-12" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800">No matching search query found</h3>
              <p className="text-sm text-slate-500">
                Adjust your file spelling or clear your search term.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-mono tracking-wider border-b border-slate-200 select-none">
                  <th className="px-6 py-3.5 font-semibold">File Details</th>
                  <th className="px-6 py-3.5 font-semibold">Size</th>
                  <th className="px-6 py-3.5 font-semibold">Trashed Date</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {filteredTrashed.map((file) => {
                  const displayDate = file.trashedAt 
                    ? new Date(file.trashedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'N/A';

                  return (
                    <tr key={file.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded text-slate-600">
                            <File className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800 break-all block max-w-md" title={file.name}>
                              {file.name}
                            </span>
                            <span className="text-[10px] text-slate-450 font-mono">{file.mimeType}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{displayDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestore(file.id, file.name)}
                            disabled={isProcessing !== null}
                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded cursor-pointer transition"
                            title="Restore to original folder"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePurge(file.id, file.name)}
                            disabled={isProcessing !== null}
                            className="p-1.5 bg-red-50 text-red-650 hover:bg-red-100 border border-red-200 hover:border-red-300 rounded cursor-pointer transition"
                            title="Purge permanently"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Alert Warning */}
      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex gap-3 text-sm">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold block">Important Cryptographic Disposal Notice</span>
          <p className="text-xs text-amber-700">
            For advanced privacy compliance, files stored on local disks as well as Cloudinary will be deleted completely and securely when purged from the trash. Purging can take up to 2 seconds due to remote media server indexing callbacks, and cannot be salvaged or recovered.
          </p>
        </div>
      </div>
    </div>
  );
}
