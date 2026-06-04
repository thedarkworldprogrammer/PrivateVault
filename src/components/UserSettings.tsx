import React, { useState } from 'react';
import { 
  Settings, Shield, Mail, User as UserIcon, Calendar, Check, Save, ShieldCheck, 
  HelpCircle, HardDrive, AlertCircle, Lock, Eye, EyeOff, Sliders, Sparkles, Bell 
} from 'lucide-react';
import { User, UploadedFile } from '../types.js';
import { Api } from '../utils/api.js';
import { useNotification } from './NotificationCenter.js';

interface UserSettingsProps {
  user: User;
  onRefreshUser: () => Promise<void>;
  files: UploadedFile[];
}

export default function UserSettings({ user, onRefreshUser, files }: UserSettingsProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences' | 'storage'>('profile');

  // Trash retention values
  const [retentionDays, setRetentionDays] = useState<number>(user.trashRetentionDays !== undefined ? user.trashRetentionDays : 30);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  // Profile fields
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Application preferences state
  const [prefs, setPrefs] = useState({
    autoScan: user.preferences?.autoScan ?? true,
    compactLayout: user.preferences?.compactLayout ?? false,
    notificationsEnabled: user.preferences?.notificationsEnabled ?? true,
  });

  // Calculate stats
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

  const joinDate = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  // Action: Save Profile & Preferences
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      showError('Profile name cannot be left empty.');
      return;
    }
    if (!profileEmail.trim()) {
      showError('Email address cannot be left empty.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await Api.updateUserProfile(profileName.trim(), profileEmail.trim(), prefs);
      if (res.success) {
        showSuccess('Profile updated successfully!');
        await onRefreshUser();
      } else {
        showError(res.error || 'Failed to update profile.');
      }
    } catch (err: any) {
      showError(err.message || 'Server connection error.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Action: Change password security option
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showError('Please specify your current valid password.');
      return;
    }
    if (!newPassword) {
      showError('Please enter your desired new password.');
      return;
    }
    if (newPassword.length < 6) {
      showError('Your new password must contain at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New passwords match confirmation failed.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await Api.changePassword(currentPassword, newPassword);
      if (res.success) {
        showSuccess('Your password has been changed and secured!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showError(res.error || 'Password update requested failed.');
      }
    } catch (err: any) {
      showError(err.message || 'Server connection error.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Action: Toggle preference values and automatically save
  const handleTogglePref = async (key: keyof typeof prefs) => {
    const updatedPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(updatedPrefs);

    try {
      const res = await Api.updateUserProfile(profileName.trim(), profileEmail.trim(), updatedPrefs);
      if (res.success) {
        showSuccess('Preference modified and saved.');
        await onRefreshUser();
      } else {
        showError(res.error || 'Failed to sync preference with server.');
      }
    } catch (err) {
      // Ignore background save errors
    }
  };

  // Save auto purge trash configuration
  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      const res = await Api.updateTrashRetentionDays(retentionDays);
      if (res.success) {
        showSuccess(`Trash retention days updated to ${retentionDays === 0 ? 'indefinite' : retentionDays}!`);
        await onRefreshUser();
      } else {
        showError(res.error || 'Failed to update trash policy.');
      }
    } catch (e: any) {
      showError(`Error updating retention policy: ${e.message}`);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6" id="user-settings-scaffold">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <h1 className="text-2xl font-sans font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700 font-bold" />
          <span>User Settings Control Panel</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure profile details, secure account credentials, toggle user interface preferences, and view disk telemetry.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Summary Info (Sticky stats & details) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Public Profile card summary */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserIcon className="w-4 h-4 text-slate-450" />
              <span>Identity Profile</span>
            </h2>

            {/* Avatar details */}
            <div className="flex flex-col items-center text-center space-y-3 py-1">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-extrabold text-2xl shadow-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-lg">{user.name}</h3>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-50 text-blue-750 px-2.5 py-0.5 rounded-full capitalize">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {user.role} Member
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2 text-slate-400 font-medium">
                  <Mail className="w-4 h-4" /> Email
                </span>
                <span className="font-semibold text-slate-800 truncate max-w-[160px]" title={user.email}>
                  {user.email}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2 text-slate-400 font-medium">
                  <Calendar className="w-4 h-4" /> Joined
                </span>
                <span className="font-semibold text-slate-800">{joinDate}</span>
              </div>
            </div>
          </div>

          {/* Disk storage layout utilization */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <HardDrive className="w-4 h-4 text-slate-450" />
              <span>Vault Allocation</span>
            </h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>Usage Utilization</span>
                  <span className="font-semibold text-slate-800">{formatBytes(activeSize + trashedSize)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                  <div 
                    className="bg-blue-600" 
                    style={{ width: `${Math.min(95, Math.max(5, (activeSize / (activeSize + trashedSize || 1)) * 100))}%` }}
                    title="Active secure vault files"
                  />
                  <div 
                    className="bg-red-500" 
                    style={{ width: `${Math.min(95, Math.max(0, (trashedSize / (activeSize + trashedSize || 1)) * 100))}%` }}
                    title="Trash items pending cleanup"
                  />
                </div>
              </div>

              <div className="text-[11px] grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2 rounded-full h-2 bg-blue-500 inline-block" />
                  <span>Files: <b>{formatBytes(activeSize)}</b></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2 rounded-full h-2 bg-red-500 inline-block" />
                  <span>Trash: <b>{formatBytes(trashedSize)}</b></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Action-oriented Forms in customized Sub-tabs panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub-tab navigation bar */}
          <div className="flex border-b border-slate-200 overflow-x-auto bg-slate-100/50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('profile')}
              id="subtab-profile"
              className={`flex-1 hover:text-slate-800 px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:bg-white/40'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              id="subtab-security"
              className={`flex-1 hover:text-slate-800 px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:bg-white/40'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Security</span>
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              id="subtab-preferences"
              className={`flex-1 hover:text-slate-800 px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:bg-white/40'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden sm:inline">Preferences</span>
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              id="subtab-storage"
              className={`flex-1 hover:text-slate-800 px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'storage'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:bg-white/40'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">Auto-Purge</span>
            </button>
          </div>

          {/* Form Views based on sub-tab */}
          
          {/* TAB 1: Profile updates */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Profile Information</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configure your primary display name and email address.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="input-profile-name" className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      id="input-profile-name"
                      type="text"
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                      placeholder="Jane Doe"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="input-profile-email" className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      id="input-profile-email"
                      type="email"
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                      placeholder="jane.doe@example.com"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  id="btn-save-profile"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingProfile ? 'Saving...' : 'Update Profile'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Password secure changes */}
          {activeTab === 'security' && (
            <form onSubmit={handleUpdatePassword} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Password & Credentials</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Refresh and secure your vault encryption login credentials.
                </p>
              </div>

              <div className="space-y-4">
                {/* Current password */}
                <div className="space-y-1.5">
                  <label htmlFor="input-current-password" className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      id="input-current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* New password */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-new-password" className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="input-new-password"
                        type={showNewPassword ? "text" : "password"}
                        className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                        placeholder="Min 6 chars"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-confirm-password" className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="input-confirm-password"
                        type="password"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                        placeholder="Re-type password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  id="btn-save-password"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSavingPassword ? 'Updating...' : 'Change Password'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: UI Layout Application preferences */}
          {activeTab === 'preferences' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Application Preferences</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust custom layout behaviors and background auto-scanning loops.
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {/* Preference 1: AutoScan */}
                <div className="flex items-center justify-between py-4 select-none">
                  <div className="space-y-0.5 max-w-md">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      <span className="font-bold text-sm text-slate-700">Auto Scan Media with AI</span>
                    </div>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Instantly use Gemini models to summarize and auto-tag file metadata immediately upon a new upload.
                    </span>
                  </div>
                  <button
                    type="button"
                    id="pref-toggle-autoscan"
                    onClick={() => handleTogglePref('autoScan')}
                    className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${prefs.autoScan ? 'bg-blue-600' : 'bg-slate-350 bg-slate-300'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.autoScan ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Preference 2: CompactLayout */}
                <div className="flex items-center justify-between py-4 select-none">
                  <div className="space-y-0.5 max-w-md">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-emerald-500" />
                      <span className="font-bold text-sm text-slate-700">Compact List Layout</span>
                    </div>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Lessen the cell spacing of files and folder grids to fit more elements on desktop monitors.
                    </span>
                  </div>
                  <button
                    type="button"
                    id="pref-toggle-compact"
                    onClick={() => handleTogglePref('compactLayout')}
                    className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${prefs.compactLayout ? 'bg-blue-600' : 'bg-slate-350 bg-slate-300'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.compactLayout ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Preference 3: Notifications */}
                <div className="flex items-center justify-between py-4 select-none">
                  <div className="space-y-0.5 max-w-md">
                    <div className="flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-amber-500" />
                      <span className="font-bold text-sm text-slate-700">Enable Push Notifications</span>
                    </div>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Receive immediate visual system alerts as well as action alerts inside our Notification Center.
                    </span>
                  </div>
                  <button
                    type="button"
                    id="pref-toggle-notifications"
                    onClick={() => handleTogglePref('notificationsEnabled')}
                    className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${prefs.notificationsEnabled ? 'bg-blue-600' : 'bg-slate-350 bg-slate-300'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.notificationsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Trash purge policy configuration */}
          {activeTab === 'storage' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Trash Bin Retention Policy</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Define when files moved to your Trash folder will be automatically auto-purged from the disk safely.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

              <div className="space-y-2 pt-2">
                <label htmlFor="custom-days-selector" className="text-sm font-semibold text-slate-700 block">
                  Select Custom Retention Window Days
                </label>
                <div className="flex gap-4">
                  <select
                    id="custom-days-selector"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                    className="flex-1 text-slate-800 text-sm border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
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
                    disabled={isSavingPolicy}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer transition flex items-center gap-2 shrink-0 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingPolicy ? 'Saving...' : 'Save Term'}</span>
                  </button>
                </div>
              </div>

              {/* Assistance advice help */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 text-slate-650 flex gap-3 text-xs leading-relaxed">
                <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-slate-600">
                  <span className="font-bold block text-slate-700 text-xs">How auto-purge works:</span>
                  <p>
                    Every time you open or fetch your Cloud Vault files directory, the server automatically checks if your trash files have been in the trash for longer than your chosen retention window (e.g. 30 days). Expired items are instantly purged from the disk safely.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Secure metadata audit trail */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-slate-800 text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span>Vault Security Notice</span>
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cloud media databases utilize advanced encryption routines. Any privacy preference modification or trashing autodeletion term is securely synced across all servers instantly.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
