import React, { useState, useEffect } from 'react';
import { Download, Lock, ShieldAlert, FileText, Calendar, Eye, DownloadCloud, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { UploadedFile, SharedLink } from '../types.js';
import { Api } from '../utils/api.js';

interface PublicShareProps {
  shareId: string;
}

export default function PublicShare({ shareId }: PublicShareProps) {
  const [loading, setLoading] = useState(true);
  const [errorInput, setErrorInput] = useState('');
  const [errorServer, setErrorServer] = useState('');
  const [password, setPassword] = useState('');
  const [shareData, setShareData] = useState<(SharedLink & { requiresVerification: boolean; files: UploadedFile[] }) | null>(null);

  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchShareDetails = async (pass?: string) => {
    setLoading(true);
    setErrorServer('');
    try {
      const res = await Api.getPublicShareDetails(shareId, pass);
      if (res.success && res.data) {
        setShareData(res.data);
        if (res.data.requiresVerification && pass) {
          setErrorInput('Invalid passcode. Access denied.');
        } else {
          setErrorInput('');
        }
      } else {
        setErrorServer(res.error || 'Failed to sync with secure private vault link.');
      }
    } catch (e: any) {
      setErrorServer('Could not establish connection to the PrivateVault cluster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareDetails();
  }, [shareId]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    fetchShareDetails(password);
  };

  const handleDownloadFile = async (file: UploadedFile) => {
    setDownloadingFileId(file.id);
    setSuccessMessage('');
    try {
      // Direct request to secure proxy endpoint
      const queryPassword = password ? `?password=${encodeURIComponent(password)}` : '';
      const response = await fetch(`/api/public/shares/${shareId}/download/${file.id}${queryPassword}`);
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download file.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      // Increment view offset on page locally
      if (shareData) {
        setShareData({
          ...shareData,
          viewsCount: shareData.viewsCount + 1
        });
      }
      setSuccessMessage(`Successfully fetched "${file.name}"`);
    } catch (err: any) {
      alert(err.message || 'Error occurred while securing file download.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    setSuccessMessage('');
    try {
      const queryPassword = password ? `?password=${encodeURIComponent(password)}` : '';
      const response = await fetch(`/api/public/shares/${shareId}/download-zip${queryPassword}`);
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to package files to ZIP.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `privatevault_shared_${shareId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      if (shareData) {
        setShareData({
          ...shareData,
          viewsCount: shareData.viewsCount + 1
        });
      }
      setSuccessMessage('Successfully bundled and downloaded secure archives ZIP.');
    } catch (err: any) {
      alert(err.message || 'Error compiling zip package download.');
    } finally {
      setDownloadingZip(false);
    }
  };

  // Human-readable size converter
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !shareData) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-6 font-sans">
        <div className="space-y-4 text-center">
          <div className="bg-slate-800 text-blue-500 p-4 rounded-full border border-slate-700 shadow-md inline-block">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <h2 className="text-lg font-bold">Securing link payload...</h2>
          <p className="text-xs font-mono text-slate-400">Verifying secure time bounds, views, and cryptographic integrity parameters</p>
        </div>
      </div>
    );
  }

  if (errorServer) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800/60 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="bg-red-500/10 text-red-500 p-4 rounded-full border border-red-500/20 shadow-sm inline-block mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Vault Access Declined</h2>
          <p className="text-sm text-slate-400 mt-2">{errorServer}</p>
          <div className="mt-6 pt-6 border-t border-slate-700">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline cursor-pointer"
            >
              Return to Safe Vault Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Password Verification view
  if (shareData?.requiresVerification) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-750 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
          <div className="text-center space-y-4 mb-6">
            <div className="bg-blue-500/10 text-blue-500 p-4 rounded-full border border-blue-500/20 inline-block">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Protected Share</h2>
              <p className="text-xs text-slate-400 mt-1">This private archive has been locked by the owner. Please specify the secret passcode to access.</p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Passcode Credentials</label>
              <input
                type="password"
                required
                autoFocus
                placeholder="Enter secret share passcode"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-slate-850 border border-slate-700 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 transition-colors"
                id="share-passcode-field"
              />
            </div>

            {errorInput && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                <span>{errorInput}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition cursor-pointer select-none flex items-center justify-center gap-2 disabled:bg-blue-400"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Decrypt & Authenticate'}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-750 text-center">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="text-xs text-slate-400 hover:text-slate-300 font-medium hover:underline cursor-pointer"
            >
              Cancel Access
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filesCount = shareData?.files?.length || 0;
  const isExpiredSoon = () => {
    if (!shareData) return false;
    const diff = new Date(shareData.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 60 * 60 * 1000; // less than 1 hour left
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl w-full mx-auto space-y-8">
        
        {/* Top vault logo indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className="p-2 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-500">
            <Lock className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm tracking-wide text-slate-100 uppercase">PrivateVault Secure share</span>
        </div>

        {/* Central Display Card */}
        <div className="bg-slate-850 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
          
          {/* Header Banner info */}
          <div className="px-6 py-6 sm:px-8 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/10">
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Secure Shared Archive</span>
                {shareData?.isPasswordProtected && (
                  <span className="px-2 py-0.5 text-[9px] bg-amber-500/10 text-amber-500 font-mono font-bold uppercase rounded-md border border-amber-500/20">
                    Encrypted
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                This link was generated to permit secure download without profile registration access.
              </p>
            </div>

            {filesCount > 1 && (
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip || downloadingFileId !== null}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition select-none flex items-center gap-2 disabled:bg-blue-400 shadow-md"
              >
                {downloadingZip ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                <span>Bundle All ({filesCount} files)</span>
              </button>
            )}
          </div>

          {/* Secure Parameters Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 py-4 sm:px-8 border-b border-slate-800/60 bg-slate-800/5 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Expires: <strong className={`text-slate-200 ${isExpiredSoon() ? 'text-rose-400 animate-pulse font-bold' : ''}`}>
                  {shareData ? new Date(shareData.expiresAt).toLocaleString() : ''}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Views Offset Limit:{' '}
                <strong className="text-slate-200">
                  {shareData?.viewsCount} / {shareData?.viewsLimit === null ? '∞' : shareData?.viewsLimit}
                </strong>
              </span>
            </div>
          </div>

          {/* Feedback messaging */}
          {successMessage && (
            <div className="m-6 mx-8 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-4 py-3 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-4 h-4" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* List of files */}
          <div className="p-6 sm:p-8 space-y-4">
            <h2 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
              Shared Secure Resources ({filesCount})
            </h2>

            <div className="space-y-2.5">
              {shareData?.files?.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 rounded-2xl transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 bg-slate-800 border border-slate-700 text-blue-400 rounded-lg">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {formatBytes(file.size)} &bull; {file.mimeType}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadFile(file)}
                    disabled={downloadingFileId !== null || downloadingZip}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded-lg border border-slate-700/80 hover:border-slate-600 transition cursor-pointer shrink-0"
                    title="Download item"
                  >
                    {downloadingFileId === file.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}

              {filesCount === 0 && (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-800 rounded-2xl font-mono">
                  No resources were packaged in this shared bundle.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-6 select-none font-mono">
          PrivateVault Protected Protocol &bull; secure link sharing
        </div>
      </div>
    </div>
  );
}
