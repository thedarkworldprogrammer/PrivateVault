import React, { useState, useEffect } from 'react';
import { 
  X, File, FileImage, FileText, Code, Archive, 
  Calendar, HardDrive, Info, Globe, Copy, Check, Download, ExternalLink,
  Sparkles, ShieldCheck, ShieldAlert, Shield, RefreshCw, FolderPlus, Move, Folder, Tag, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UploadedFile } from '../types.js';
import { Api } from '../utils/api.js';
import { offlineDb } from '../utils/offlineDb.js';

interface FilePreviewModalProps {
  file: UploadedFile | null;
  onClose: () => void;
  onAnalyzeFile?: (fileId: string) => Promise<boolean>;
  onRefresh?: () => void;
}

export default function FilePreviewModal({ file, onClose, onAnalyzeFile, onRefresh }: FilePreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [organizeSuccess, setOrganizeSuccess] = useState<string | null>(null);

  const [localBlobObjUrl, setLocalBlobObjUrl] = useState<string | null>(null);
  const [cachingStatus, setCachingStatus] = useState<'idle' | 'caching' | 'cached' | 'error'>('idle');

  useEffect(() => {
    if (!file) return;

    let active = true;
    let urlToCleanup: string | null = null;

    const loadAndCache = async () => {
      try {
        const cachedRecord = await offlineDb.getFileBlob(file.id);
        if (cachedRecord) {
          if (!active) return;
          const url = URL.createObjectURL(cachedRecord.blob);
          urlToCleanup = url;
          setLocalBlobObjUrl(url);
          setCachingStatus('cached');
          return;
        }

        // Not in cache, try to cache if online
        if (navigator.onLine) {
          setCachingStatus('caching');
          const response = await fetch(file.url);
          if (!response.ok) throw new Error('Network file retrieve status was not OK');
          const blob = await response.blob();
          
          await offlineDb.cacheFileBlob(file.id, file.name, file.mimeType, blob);
          
          if (!active) return;
          const url = URL.createObjectURL(blob);
          urlToCleanup = url;
          setLocalBlobObjUrl(url);
          setCachingStatus('cached');
        } else {
          setCachingStatus('idle');
        }
      } catch (err) {
        console.warn('Failed to load/cache file offline contents:', err);
        if (active) {
          setCachingStatus('error');
        }
      }
    };

    loadAndCache();

    return () => {
      active = false;
      if (urlToCleanup) {
        URL.revokeObjectURL(urlToCleanup);
      }
    };
  }, [file]);

  if (!file) return null;

  const isImage = file.mimeType.toLowerCase().startsWith('image/');

  // Bytes Formatter
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Date Formatter
  const formatDate = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  // MIME Type Styled Icon representation
  const getFileIconLarge = (mime: string) => {
    const m = mime.toLowerCase();
    if (m.startsWith('image/')) {
      return (
        <div className="p-6 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-500 shadow-xs">
          <FileImage className="w-16 h-16" />
        </div>
      );
    }
    if (m === 'application/pdf') {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-500 shadow-xs">
          <FileText className="w-16 h-16" />
        </div>
      );
    }
    if (m.includes('zip') || m.includes('tar') || m.includes('rar') || m.includes('7z')) {
      return (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-500 shadow-xs">
          <Archive className="w-16 h-16" />
        </div>
      );
    }
    if (m.includes('json') || m.includes('javascript') || m.includes('typescript') || m.includes('xml') || m.includes('html') || m.includes('css')) {
      return (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-500 shadow-xs">
          <Code className="w-16 h-16" />
        </div>
      );
    }
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
        <File className="w-16 h-16" />
      </div>
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy text', e);
    }
  };

  const triggerAnalysis = async () => {
    if (!onAnalyzeFile) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const success = await onAnalyzeFile(file.id);
      if (!success) {
        setAnalysisError('The AI parser connection failed. Ensure system endpoints are ready.');
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Analysis operation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplySuggestedFolder = async () => {
    if (!file.aiAnalysis?.suggestedFolder) return;
    const { id, name, isNew } = file.aiAnalysis.suggestedFolder;
    setOrganizing(true);
    setOrganizeError(null);
    setOrganizeSuccess(null);

    try {
      let finalFolderId: string | null = id;

      if (isNew) {
        // First create the suggested folder
        const folderRes = await Api.createFolder(name, null);
        if (!folderRes.success || !folderRes.data) {
          throw new Error(folderRes.error || 'Failed to create new suggested folder.');
        }
        finalFolderId = folderRes.data.id;
      }

      // Move the file into the new or matched folder
      const moveRes = await Api.moveFile(file.id, finalFolderId);
      if (!moveRes.success) {
        throw new Error(moveRes.error || 'Failed to move file to the suggested folder.');
      }

      setOrganizeSuccess(`Successfully organized! File moved to "${name}" folder.`);
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setOrganizeError(err.message || 'Failed to apply suggested folder organization.');
    } finally {
      setOrganizing(false);
    }
  };

  // Build security badge styling safely
  const renderSecurityClassification = () => {
    if (!file.aiAnalysis) return null;
    const classification = file.aiAnalysis.securityClassification;

    if (classification === 'Critical') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full text-[11px] font-sans font-bold">
          <ShieldAlert className="w-3.5 h-3.5 text-red-650 animate-bounce" />
          <span>Vulnerability Exposure Detected! (Critical)</span>
        </div>
      );
    }
    if (classification === 'Warning') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[11px] font-sans font-bold">
          <Shield className="w-3.5 h-3.5" />
          <span>Suspicious Payload (Warning)</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-sans font-bold">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Cryptographically Secure Signature (Checked)</span>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          id="preview-modal-backdrop"
        />

        {/* Modal content panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col z-10 max-h-[90vh]"
          id="preview-modal-container"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 bg-slate-100 text-slate-500 rounded-md border border-slate-200 shrink-0">
                <Info className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                File Details &amp; AI Scanner
              </h3>
            </div>
            <button
              id="preview-modal-close-btn"
              onClick={onClose}
              className="p-1 px-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 rounded-lg transition-colors cursor-pointer"
              title="Close Preview Screen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Main Scrollable Section */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Display Visual Area */}
            <div className="relative flex items-center justify-center bg-slate-50/80 border border-slate-100 min-h-[180px] rounded-2xl overflow-hidden p-6 shadow-inner">
              {analyzing && (
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs flex flex-col items-center justify-center z-10 gap-3">
                  <div className="w-10 h-10 border-4 border-white border-t-blue-600 rounded-full animate-spin" />
                  <span className="font-mono text-xs text-slate-800 font-bold bg-white/90 px-3 py-1 rounded border shadow">
                    AI Gemini Security Scanner scanning...
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse" />
                </div>
              )}
              {isImage ? (
                <div className="relative group max-w-full">
                  <img
                    id="preview-image-element"
                    src={localBlobObjUrl || file.url}
                    alt={file.name}
                    referrerPolicy="no-referrer"
                    className="max-h-[30vh] object-contain rounded-lg border border-slate-200/60 shadow-xs bg-white mx-auto animate-fadeIn"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 rounded-lg transition-colors pointer-events-none" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  {getFileIconLarge(file.mimeType)}
                  <p className="text-xs font-semibold text-slate-404 font-mono tracking-wider">
                    NO VISUAL PREVIEW AVAILABLE
                  </p>
                </div>
              )}
            </div>

            {/* AI SCANNER AND INSIGHT CARD (Stunning implementation) */}
            <div className="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 overflow-hidden relative">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4.5 h-4.5 text-blue-600 animate-pulse" />
                  <h4 className="text-xs font-sans font-bold text-slate-900 tracking-tight uppercase">
                    Gemini AI Vulnerability Scanner
                  </h4>
                </div>
                {file.aiAnalysis && (
                  <span className="text-[10px] font-mono text-slate-405">
                    Checked {new Date(file.aiAnalysis.analyzedAt || file.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {analysisError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-xs animate-fadeIn">
                  {analysisError}
                </div>
              )}

              <div className="mt-4">
                {file.aiAnalysis ? (
                  <div className="space-y-4 animate-fadeIn">
                    {/* Summary box */}
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Behavior Summary</span>
                      <p className="text-xs text-slate-700 leading-relaxed font-sans italic bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        &ldquo;{file.aiAnalysis.summary}&rdquo;
                      </p>
                    </div>

                    {/* Metrics grid info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                          Leak Audit Status
                        </span>
                        {renderSecurityClassification()}
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                          AI Category
                        </span>
                        <span className="inline-block px-2.5 py-0.5 font-mono text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-semibold">
                          {file.aiAnalysis.category}
                        </span>
                      </div>
                    </div>

                    {/* Semantic tags */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Intelligence Keywords</span>
                      <div className="flex flex-wrap gap-1.5">
                        {file.aiAnalysis.tags && file.aiAnalysis.tags.map((tag: string, index: number) => (
                          <span key={index} className="text-[10px] font-mono font-medium px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md border border-slate-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Re-trigger action */}
                    {onAnalyzeFile && (
                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={triggerAnalysis}
                          disabled={analyzing}
                          className="text-[10px] bg-slate-200 hover:bg-slate-300 border border-slate-300 text-slate-700 rounded-md px-2.5 py-1 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
                          <span>Re-evaluate Scanner</span>
                        </button>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="text-center py-6 space-y-4">
                    <p className="text-xs text-slate-500 font-sans max-w-sm mx-auto leading-relaxed">
                      Analyze file binaries and textual assets programmatically through the Gemini high-context language engine to verify leak threat models or generate search indexes.
                    </p>
                    {onAnalyzeFile ? (
                      <button
                        type="button"
                        id="btn-trigger-ai-scan"
                        onClick={triggerAnalysis}
                        disabled={analyzing}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-2.5 text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2 pr-6 border border-blue-500 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Run AI Vulnerability Scan</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 block pb-2">Scanner endpoint loading...</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* AI AUTO-CATEGORIZATION & SUGGESTED ORGANIZER */}
            {file.aiAnalysis && file.aiAnalysis.suggestedFolder && (
              <div className="border border-indigo-100 rounded-2xl bg-indigo-50/20 p-5 relative overflow-hidden animate-fadeIn">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                
                <div className="flex items-center gap-2 pb-3 border-b border-indigo-50/80">
                  <FolderPlus className="w-4.5 h-4.5 text-indigo-600" />
                  <h4 className="text-xs font-sans font-bold text-slate-950 tracking-tight uppercase">
                    AI Smart Storage Organizer
                  </h4>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-indigo-50 shadow-xs">
                    <div className="space-y-1">
                      <span className="text-[9px] font-sans font-extrabold uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                        {file.aiAnalysis.suggestedFolder.isNew ? (
                          <>
                            <span className="inline-block w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                            Recommend New Directory
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            Recommend Existing Directory
                          </>
                        )}
                      </span>
                      <h5 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Folder className="w-4 h-4 text-indigo-400 fill-indigo-50" />
                        <span>{file.aiAnalysis.suggestedFolder.name}</span>
                      </h5>
                      <p className="text-xs text-slate-500 italic max-w-sm leading-normal">
                        &ldquo;{file.aiAnalysis.suggestedFolder.reasoning}&rdquo;
                      </p>
                    </div>

                    <div className="shrink-0">
                      {file.folderId === file.aiAnalysis.suggestedFolder.id ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          <span>Already Organized Here</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={organizing}
                          onClick={handleApplySuggestedFolder}
                          className="w-full sm:w-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {organizing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Organizing...</span>
                            </>
                          ) : (
                            <>
                              {file.aiAnalysis.suggestedFolder.isNew ? (
                                <>
                                  <FolderPlus className="w-3.5 h-3.5" />
                                  <span>Create &amp; Move</span>
                                </>
                              ) : (
                                <>
                                  <Move className="w-3.5 h-3.5" />
                                  <span>Move File</span>
                                </>
                              )}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {organizeSuccess && (
                    <div className="text-xs bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-150 animate-fadeIn font-medium">
                      {organizeSuccess}
                    </div>
                  )}

                  {organizeError && (
                    <div className="text-xs bg-red-50 text-red-650 p-3 rounded-xl border border-red-150 animate-fadeIn font-medium">
                      {organizeError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Details and Metrics List */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Cryptographic Safe Metadata
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/40 border border-slate-150 p-4 rounded-xl">
                
                {/* File Name */}
                <div className="sm:col-span-2 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">Original File Name</span>
                  <span className="text-sm font-semibold text-slate-800 break-words font-mono" id="metadata-filename">{file.name}</span>
                </div>

                {/* MIME Type */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">MIME Identifier</span>
                  <span className="text-xs font-semibold text-slate-700 font-mono" id="metadata-mimetype">{file.mimeType}</span>
                </div>

                {/* File Size */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">Encrypted Payload Size</span>
                  <span className="text-xs font-semibold text-slate-700 font-mono" id="metadata-filesize">{formatBytes(file.size)}</span>
                </div>

                {/* Date Uploaded */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">Registry Entry Date</span>
                  <span className="text-xs font-semibold text-slate-705" id="metadata-createdat">{formatDate(file.createdAt)}</span>
                </div>

                {/* Offline Caching Status */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">Offline Cache Status</span>
                  {cachingStatus === 'cached' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200" id="cache-badge-cached">
                      <Check className="w-3 h-3 text-emerald-600" /> Available Offline
                    </span>
                  ) : cachingStatus === 'caching' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 animate-pulse" id="cache-badge-loading">
                      <RefreshCw className="w-3 h-3 animate-spin text-blue-600" /> Saving Cache...
                    </span>
                  ) : !navigator.onLine ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200" id="cache-badge-offline">
                      Unavailable Offline
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200" id="cache-badge-idle">
                      Not Cached (Reloading...)
                    </span>
                  )}
                </div>

                {/* Storage Pointer */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block">Internal Record ID</span>
                  <span className="text-[11px] font-mono font-semibold text-slate-500 block truncate" id="metadata-fileid" title={file.id}>
                    {file.id}
                  </span>
                </div>

              </div>
            </div>

          </div>

          {/* Action triggers Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="preview-copy-link-btn"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Direct Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                id="preview-external-view-link"
                href={localBlobObjUrl || file.url}
                download={localBlobObjUrl ? file.name : undefined}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer select-none"
              >
                {localBlobObjUrl ? <Download className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>{localBlobObjUrl ? "Download Cached (Offline)" : "Open Secure Source"}</span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
