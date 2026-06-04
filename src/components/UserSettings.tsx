import React, { useState } from 'react';
import { Settings, Shield, Mail, User as UserIcon, Calendar, Check, Save, ShieldCheck, HelpCircle, HardDrive, AlertCircle } from 'lucide-react';
import { User, UploadedFile } from '../types.js';
import { Api } from '../utils/api.js';
import { useNotification } from './NotificationCenter.js';

interface UserSettingsProps {
  user: User;
  onRefreshUser: () => Promise<void>;
  files: UploadedFile[];
}

export default function UserSettings({ user, onRefreshUser, files }: UserSettingsProps) {
  const { showSuccess, showError } = useNotification();
  const [retentionDays, setRetentionDays] = useState<number>(user.trashRetentionDays !== undefined ? user.trashRetentionDays : 30);
  const [isSaving, setIsSaving] = useState(false);

  // Statistics
  const activeFiles = files.filter(f => !f.isTrashed);
  const trashedFiles = files.filter(f => f.isTrashed);

  const activeSize = activeFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  const trashedSize = trashedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleSavePolicy = async () => {
    setIsSaving(true);
    try {
      const res = await Api.updateTrashRetentionDays(retentionDays);
      if (res.success) {
        showSuccess(`Trash retention policy updated successfully! Files will now auto-purge after ${retentionDays === 0 ? 'infinite' : retentionDays} days.`);
        await onRefreshUser();
      } else {
        showError(res.error || 'Failed to update trash policy.');
      }
    } catch (e: any) {
      showError(`Error saving settings: ${e.message || 'Server connection error.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const joinDate = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  return (
    <div className="space-y-6" id="user-settings-scaffold">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <h1 className="text-2xl font-sans font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700 animate-spin-slow" />
          <span>User Settings & Storage</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your account profiles, review cryptographic storage telemetry, and determine your Trash Retention Policy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Profile Details Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserIcon className="w-5 h-5 text-blue-500" />
              <span>Public Profile</span>
            </h2>

            {/* Avatar display */}
            <div className="flex flex-col items-center text-center space-y-2 py-2">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-2xl border-2 border-white ring-2 ring-blue-500 shadow-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-800">{user.name}</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                  <ShieldCheck className="w-3 h-3" />
                  {user.role} Account
                </span>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2 text-slate-400 font-medium">
                  <Mail className="w-4 h-4" /> Email
                </span>
                <span className="font-semibold text-slate-800 text-right truncate max-w-[160px]" title={user.email}>
                  {user.email}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2 text-slate-400 font-medium">
                  <Calendar className="w-4 h-4" /> Joined
                </span>
                <span className="font-semibold text-slate-800 text-right">{joinDate}</span>
              </div>
            </div>
          </div>

          {/* Quick Storage Meter card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <HardDrive className="w-5 h-5 text-amber-500" />
              <span>Vault Storage Size</span>
            </h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>Current Disk Utilization</span>
                  <span className="font-semibold text-slate-800">{formatBytes(activeSize + trashedSize)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                  <div 
                    className="bg-blue-600" 
                    style={{ width: `${Math.min(95, Math.max(5, (activeSize / (activeSize + trashedSize || 1)) * 100))}%` }}
                    title="Active file shares"
                  />
                  <div 
                    className="bg-red-500" 
                    style={{ width: `${Math.min(95, Math.max(0, (trashedSize / (activeSize + trashedSize || 1)) * 100))}%` }}
                    title="Trashed items (pending manual or policy auto purge)"
                  />
                </div>
              </div>

              <div className="text-[11px] grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shrink-0" />
                  <span>Active Size: <b className="text-slate-700">{formatBytes(activeSize)}</b></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shrink-0" />
                  <span>Trash Size: <b className="text-slate-700">{formatBytes(trashedSize)}</b></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Settings forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Trash Retention policy card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Trash Bin Retention Policy</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Define when files moved to your Trash folder will be permanently purged to keep your vault storage clean.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Option choices */}
              {[
                { label: 'Instant', days: 1, desc: 'Purge after 24 hrs' },
                { label: 'Short', days: 7, desc: 'Keep for 7 days' },
                { label: 'Standard', days: 30, desc: 'Keep for 30 days' },
                { label: 'Indefinite', days: 0, desc: 'Never auto-purge' },
              ].map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setRetentionDays(opt.days)}
                  className={`p-4 rounded-xl text-left border cursor-pointer transition flex flex-col justify-between h-28 ${
                    retentionDays === opt.days
                      ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="w-full flex justify-between items-start">
                    <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                    {retentionDays === opt.days && (
                      <span className="p-0.5 bg-blue-500 text-white rounded-full">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs text-slate-400 font-mono block uppercase tracking-wide">
                      {opt.days > 0 ? `${opt.days} Days` : 'Disabled'}
                    </span>
                    <span className="text-xs font-semibold text-slate-650 block">
                      {opt.desc}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Selector drop-down option fallback */}
            <div className="space-y-2 pt-2">
              <label htmlFor="custom-days-selector" className="text-sm font-semibold text-slate-700 block">
                Select Custom Retention Term Days
              </label>
              <div className="flex gap-4">
                <select
                  id="custom-days-selector"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                  className="flex-1 text-slate-800 text-sm border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition"
                >
                  <option value={1}>1 Day (Automatically clear trash bin daily)</option>
                  <option value={7}>7 Days (Clear trash automatically weekly)</option>
                  <option value={14}>14 Days (Two weeks retention window)</option>
                  <option value={30}>30 Days (Recommended standard default)</option>
                  <option value={60}>60 Days (Two months retention window)</option>
                  <option value={90}>90 Days (Quarterly trash auto purging)</option>
                  <option value={0}>0 Days (Keep forever infinitely, manual empty only)</option>
                </select>

                <button
                  onClick={handleSavePolicy}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-sm font-bold cursor-pointer transition flex items-center gap-2 shrink-0 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </div>

            {/* Explanation card help */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 text-slate-600 flex gap-3 text-xs leading-relaxed">
              <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-slate-600">
                <span className="font-bold block text-slate-700">How auto-purge works:</span>
                <p>
                  Every time you open or fetch your Cloud Vault files directory, the server automatically checks if your trash files have been in the trash for longer than your chosen retention window (e.g. 30 days). Expired items are instantly purged from the disk as well as active Cloudinary slots to free up space automatically – with zero manual upkeep required!
                </p>
              </div>
            </div>

          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-slate-800 font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span>Storage Advice & Security Logs</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cloud media databases utilize advanced encryption routines. Any trashing setting or automatic storage policy is secured on your secure account profile record. For security concerns or compliance purposes, manual activity logging details all automatic or manual purging events securely in your system audit log trails.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
