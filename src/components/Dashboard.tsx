import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, File, FileImage, FileText, Code, Archive,
  Trash2, Search, ExternalLink, RefreshCw, X, AlertCircle, CheckCircle2, Download, Pencil,
  Activity, Clock, Folder, FolderPlus, ChevronRight, ChevronLeft, Move, CornerDownRight,
  Share2, Copy, Check, Calendar, Lock, ArrowUp, ArrowDown, ArrowUpDown, Columns
} from 'lucide-react';
import { UploadedFile, ActivityLog, Folder as FolderType, SharedLink, User } from '../types.js';
import { Api } from '../utils/api.js';
import { offlineDb } from '../utils/offlineDb.js';
import FilePreviewModal from './FilePreviewModal.js';
import { useNotification } from './NotificationCenter.js';

interface DashboardProps {
  files: UploadedFile[];
  onUploadFile: (file: File, folderId?: string | null, onProgress?: (percent: number) => void) => Promise<boolean>;
  onDeleteFile: (fileId: string) => Promise<boolean>;
  onDeleteMultipleFiles: (fileIds: string[]) => Promise<boolean>;
  onRenameFile: (fileId: string, newName: string) => Promise<boolean>;
  onAnalyzeFile?: (fileId: string) => Promise<boolean>;
  isLoading: boolean;
  onRefreshFiles?: () => void;
  user?: User;
  currentFolderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  onBreadcrumbsChange?: (crumbs: { id: string | null; name: string }[]) => void;
}

export default function Dashboard({ 
  files, 
  onUploadFile, 
  onDeleteFile, 
  onDeleteMultipleFiles, 
  onRenameFile, 
  onAnalyzeFile, 
  isLoading, 
  onRefreshFiles, 
  user,
  currentFolderId: propFolderId,
  onFolderChange,
  onBreadcrumbsChange
}: DashboardProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const compactMode = user?.preferences?.compactLayout ?? false;
  const paddingClass = compactMode ? 'px-4 py-1.5' : 'px-5 py-4';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [fileFilter, setFileFilter] = useState<'all' | 'image' | 'pdf' | 'archive' | 'document'>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadingName, setUploadingName] = useState<string>('');
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Multiple selection and bulk action states
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  
  // Preview modal file state
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);

  // File Renaming state
  const [renamingFile, setRenamingFile] = useState<UploadedFile | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Folder System State and Operations ---
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [localFolderId, setLocalFolderId] = useState<string | null>(null);
  
  const currentFolderId = propFolderId !== undefined ? propFolderId : localFolderId;
  const setCurrentFolderId = (id: string | null) => {
    if (onFolderChange) {
      onFolderChange(id);
    } else {
      setLocalFolderId(id);
    }
  };
  const [isFoldersLoading, setIsFoldersLoading] = useState(false);

  // --- Optional Two-Pane States ---
  const [isTwoPane, setIsTwoPane] = useState(false);
  const [pane1FolderId, setPane1FolderId] = useState<string | null>(null);
  const [pane2FolderId, setPane2FolderId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ id: string; type: 'file' | 'folder'; sourcePaneId?: 'pane1' | 'pane2' } | null>(null);
  const [pane1AddingFolder, setPane1AddingFolder] = useState(false);
  const [pane2AddingFolder, setPane2AddingFolder] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState('');
  
  // Folder Creation Mode
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Folder Renaming Mode
  const [renamingFolder, setRenamingFolder] = useState<FolderType | null>(null);
  const [newFolderInputName, setNewFolderInputName] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  // Moving files/folders state
  const [movingItem, setMovingItem] = useState<{ id: string; type: 'file' | 'folder' } | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // --- Secure Public Share Link System State and Operations ---
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingFileIds, setSharingFileIds] = useState<string[]>([]);
  const [shareExpiresUnit, setShareExpiresUnit] = useState<'15m' | '1h' | '24h' | '7d' | '30d'>('24h');
  const [shareViewsLimit, setShareViewsLimit] = useState<string>('');
  const [sharePassword, setSharePassword] = useState<string>('');
  const [generatedShare, setGeneratedShare] = useState<SharedLink | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  // Manage existing shares modal state
  const [showManageShares, setShowManageShares] = useState(false);
  const [isRevokingShareId, setIsRevokingShareId] = useState<string | null>(null);

  // Sorting State for Vault Files
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'size' | 'mimeType'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Recent Files Interactions State
  const [recentFileIds, setRecentFileIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recent_files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const trackFileInteraction = (fileId: string) => {
    if (!fileId) return;
    setRecentFileIds(prev => {
      const updated = [fileId, ...prev.filter(id => id !== fileId)].slice(0, 5);
      localStorage.setItem('recent_files', JSON.stringify(updated));
      return updated;
    });
  };

  const handlePreviewFile = (file: UploadedFile) => {
    setPreviewFile(file);
    trackFileInteraction(file.id);
  };

  const handleSort = (field: 'name' | 'createdAt' | 'size' | 'mimeType') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      if (field === 'createdAt' || field === 'size') {
        setSortOrder('desc');
      } else {
        setSortOrder('asc');
      }
    }
  };

  const renderSortIndicator = (field: 'name' | 'createdAt' | 'size' | 'mimeType') => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-350 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold shrink-0" />
    );
  };

  const getCleanMimeLabel = (mime: string) => {
    if (!mime) return 'Unknown';
    const low = mime.toLowerCase();
    if (low.startsWith('image/')) return 'Graphics Image';
    if (low === 'application/pdf') return 'PDF Document';
    if (low.includes('zip') || low.includes('tar') || low.includes('rar') || low.includes('7z') || low.includes('gzip')) return 'Encrypted Archive';
    if (low.includes('word') || low === 'application/msword') return 'Word Document';
    if (low.includes('excel') || low.includes('sheet') || low.includes('csv')) return 'Spreadsheet';
    if (low.includes('presentation') || low.includes('powerpoint')) return 'Presentation';
    if (low.startsWith('text/')) return 'Plain Text';
    if (low.startsWith('audio/')) return 'Audio Recording';
    if (low.startsWith('video/')) return 'Video Media';
    if (low.includes('json') || low.includes('javascript') || low.includes('typescript') || low.includes('html') || low.includes('css')) return 'Source Code';
    return mime.split('/')[1]?.toUpperCase() || mime;
  };

  const fetchSharedLinks = async () => {
    try {
      const res = await Api.getSharedLinks();
      if (res.success && res.data) {
        setSharedLinks(res.data);
      }
    } catch (e) {
      console.warn('Failed to retrieve shared links:', e);
    }
  };

  const handleOpenShareModal = (fileIds: string[]) => {
    setSharingFileIds(fileIds);
    setShareExpiresUnit('24h');
    setShareViewsLimit('');
    setSharePassword('');
    setGeneratedShare(null);
    setShowShareModal(true);
    fileIds.forEach(id => trackFileInteraction(id));
  };

  const handleGenerateShareLink = async () => {
    setIsGeneratingShare(true);
    setAlertInfo(null);
    try {
      // Calculate expiration timestamp
      let msOffset = 24 * 60 * 60 * 1000; // default 24h
      if (shareExpiresUnit === '15m') msOffset = 15 * 60 * 1000;
      else if (shareExpiresUnit === '1h') msOffset = 60 * 60 * 1000;
      else if (shareExpiresUnit === '24h') msOffset = 24 * 60 * 60 * 1000;
      else if (shareExpiresUnit === '7d') msOffset = 7 * 24 * 60 * 60 * 1000;
      else if (shareExpiresUnit === '30d') msOffset = 30 * 24 * 60 * 60 * 1000;

      const expiresAt = new Date(Date.now() + msOffset).toISOString();
      const viewsLimitNum = shareViewsLimit.trim() ? parseInt(shareViewsLimit, 10) : null;
      const passcode = sharePassword.trim() || null;

      const res = await Api.createSharedLink(sharingFileIds, expiresAt, viewsLimitNum, passcode);
      if (res.success && res.data) {
        setGeneratedShare(res.data);
        setSharedLinks(prev => [res.data!, ...prev]);
        setAlertInfo({ type: 'success', message: 'Successfully generated secure public share link!' });
        fetchLogs();
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Failed to create share link.' });
      }
    } catch (err) {
      setAlertInfo({ type: 'error', message: 'Network connection error.' });
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleRevokeShare = async (id: string) => {
    if (!confirm('Are you absolutely sure you want to revoke this share link? This is irreversible and visitors will instantly lose access.')) return;
    setIsRevokingShareId(id);
    try {
      const res = await Api.deleteSharedLink(id);
      if (res.success) {
        setSharedLinks(prev => prev.filter(sl => sl.id !== id));
        setAlertInfo({ type: 'success', message: 'Success: Shared link has been revoked & destroyed.' });
        fetchLogs();
      } else {
        setAlertInfo({ type: 'error', message: res.error || 'Could not revoke shared link.' });
      }
    } catch (err) {
      setAlertInfo({ type: 'error', message: 'Could not contact server.' });
    } finally {
      setIsRevokingShareId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedShareId(id);
    setTimeout(() => setCopiedShareId(null), 2000);
  };

  const fetchFolders = async () => {
    setIsFoldersLoading(true);
    try {
      if (navigator.onLine) {
        const res = await Api.getFolders();
        if (res.success && res.data) {
          setFolders(res.data);
          offlineDb.saveFolders(res.data);
        } else {
          const cached = await offlineDb.getFolders();
          if (cached && cached.length > 0) {
            setFolders(cached);
          }
        }
      } else {
        const cached = await offlineDb.getFolders();
        if (cached && cached.length > 0) {
          setFolders(cached);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch folder list, fallback to cache:', e);
      const cached = await offlineDb.getFolders();
      if (cached && cached.length > 0) {
        setFolders(cached);
      }
    } finally {
      setIsFoldersLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
    fetchSharedLinks();
  }, []);

  const handleCreateFolderDirect = async (folderName: string, parentFolderId: string | null) => {
    if (!folderName.trim()) return false;
    setIsCreatingFolder(true);
    setAlertInfo(null);
    try {
      const res = await Api.createFolder(folderName.trim(), parentFolderId);
      if (res.success && res.data) {
        setFolders(prev => [res.data!, ...prev]);
        const successMsg = `Created folder "${res.data.name}" successfully.`;
        setAlertInfo({ type: 'success', message: successMsg });
        showSuccess(successMsg);
        fetchLogs();
        return true;
      } else {
        const errorMsg = res.error || 'Failed to create folder.';
        setAlertInfo({ type: 'error', message: errorMsg });
        showError(errorMsg);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Error occurred during folder creation.';
      setAlertInfo({ type: 'error', message: errorMsg });
      showError(errorMsg);
    } finally {
      setIsCreatingFolder(false);
    }
    return false;
  };

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) return;
    const ok = await handleCreateFolderDirect(newFolderName, currentFolderId);
    if (ok) {
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  const handleCreateInlineFolder = async (e: React.FormEvent, paneId: 'pane1' | 'pane2', parentFolderId: string | null) => {
    e.preventDefault();
    if (!inlineFolderName.trim()) return;
    const ok = await handleCreateFolderDirect(inlineFolderName, parentFolderId);
    if (ok) {
      setInlineFolderName('');
      if (paneId === 'pane1') setPane1AddingFolder(false);
      else setPane2AddingFolder(false);
    }
  };

  const handlePaneFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetFolderId: string | null) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    
    setIsUploading(true);
    setUploadPercent(0);
    setUploadingName(rawFile.name);
    try {
      const success = await onUploadFile(rawFile, targetFolderId, (percent) => {
        setUploadPercent(percent);
      });
      if (success) {
        showSuccess(`Uploaded and encrypted "${rawFile.name}" successfully!`);
        onRefreshFiles?.();
      } else {
        showError('Upload failed.');
      }
    } catch (err: any) {
      showError(err.message || 'Error occurred during secure upload.');
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleRenameFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renamingFolder || !newFolderInputName.trim()) return;
    setIsRenamingFolder(true);
    setAlertInfo(null);
    try {
      const res = await Api.renameFolder(renamingFolder.id, newFolderInputName.trim());
      if (res.success && res.data) {
        setFolders(prev => prev.map(f => f.id === renamingFolder.id ? res.data! : f));
        setRenamingFolder(null);
        setNewFolderInputName('');
        const successMsg = `Renamed folder successfully to "${res.data.name}".`;
        setAlertInfo({ type: 'success', message: successMsg });
        showSuccess(successMsg);
        fetchLogs();
      } else {
        const errorMsg = res.error || 'Failed to rename folder.';
        setAlertInfo({ type: 'error', message: errorMsg });
        showError(errorMsg);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Error renaming folder.';
      setAlertInfo({ type: 'error', message: errorMsg });
      showError(errorMsg);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const parentFolder = folders.find(f => f.id === folderId);
    const parentName = parentFolder ? parentFolder.name : 'this directory';
    if (!window.confirm(`Are you sure you want to delete "${parentName}"? Any folders or files stored inside will be relocated one level up.`)) {
      return;
    }
    setAlertInfo(null);
    try {
      const res = await Api.deleteFolder(folderId);
      if (res.success) {
        setFolders(prev => prev.filter(f => f.id !== folderId));
        const successMsg = `Directory "${parentName}" removed safely. Internal contents moved to parent level.`;
        setAlertInfo({ type: 'success', message: successMsg });
        showSuccess(successMsg);
        // Clean force refynchronization for reactive consistency
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        const errorMsg = res.error || 'Failed to delete directory.';
        setAlertInfo({ type: 'error', message: errorMsg });
        showError(errorMsg);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Error deleting folder.';
      setAlertInfo({ type: 'error', message: errorMsg });
      showError(errorMsg);
    }
  };

  const handleMoveItem = async (destinationFolderId: string | null) => {
    if (!movingItem) return;
    setIsMoving(true);
    setAlertInfo(null);
    try {
      let success = false;
      let errMsg = '';
      if (movingItem.type === 'file') {
        const res = await Api.moveFile(movingItem.id, destinationFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move file.';
      } else {
        if (movingItem.id === destinationFolderId) {
          const warnMsg = 'Cannot move folder inside itself.';
          setAlertInfo({ type: 'error', message: warnMsg });
          showError(warnMsg);
          setMovingItem(null);
          setIsMoving(false);
          return;
        }
        const res = await Api.moveFolder(movingItem.id, destinationFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move folder.';
      }

      if (success) {
        const successMsg = `Successfully organized! "${movingItem.name}" moved to its new location.`;
        setAlertInfo({ type: 'success', message: successMsg });
        showSuccess(successMsg);
        setMovingItem(null);
        setTimeout(() => {
          window.location.reload();
        }, 850);
      } else {
        setAlertInfo({ type: 'error', message: errMsg });
        showError(errMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Error executing move operation.';
      setAlertInfo({ type: 'error', message: errorMsg });
      showError(errorMsg);
    } finally {
      setIsMoving(false);
    }
  };

  const getRecentFilesList = () => {
    // Filter active (non-trashed) files
    const activeFiles = files.filter(f => !f.isTrashed);

    // Map stored interaction ids to actual active files
    const interacted = recentFileIds
      .map(id => activeFiles.find(f => f.id === id))
      .filter(Boolean) as UploadedFile[];

    // Backfill with the latest active files sorted by createdAt descending
    const backfill = [...activeFiles]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const result: UploadedFile[] = [...interacted];
    for (const file of backfill) {
      if (result.length >= 5) break;
      if (!result.some(r => r.id === file.id)) {
        result.push(file);
      }
    }

    return result.slice(0, 5);
  };

  const getBreadcrumbsForId = (folderId: string | null) => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Vault Root' }];
    if (!folderId) return crumbs;
    
    const pathList: { id: string; name: string }[] = [];
    let curr = folders.find(f => f.id === folderId);
    while (curr) {
      pathList.unshift({ id: curr.id, name: curr.name });
      curr = curr.parentId ? folders.find(f => f.id === curr!.parentId) : undefined;
    }
    return [...crumbs, ...pathList];
  };

  const getBreadcrumbs = () => {
    return getBreadcrumbsForId(currentFolderId);
  };

  useEffect(() => {
    if (onBreadcrumbsChange) {
      onBreadcrumbsChange(getBreadcrumbsForId(currentFolderId));
    }
  }, [currentFolderId, folders, onBreadcrumbsChange]);

  const getFilesForPane = (paneFolderId: string | null) => {
    return files.filter(f => {
      // Hide trashed files from standard view and folder routes
      if (f.isTrashed) return false;

      const matchesFolder = searchTerm ? true : (f.folderId || null) === paneFolderId;
      if (!matchesFolder) return false;

      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      const mime = f.mimeType.toLowerCase();
      if (fileFilter === 'image') return mime.startsWith('image/');
      if (fileFilter === 'pdf') return mime === 'application/pdf';
      if (fileFilter === 'archive') return mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z');
      if (fileFilter === 'document') return mime.includes('word') || mime.includes('excel') || mime.includes('powerpoint') || mime.includes('text') || mime === 'application/msword';
      
      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      } else if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      } else if (sortBy === 'mimeType') {
        comparison = a.mimeType.localeCompare(b.mimeType, undefined, { sensitivity: 'base' });
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const getFoldersForPane = (paneFolderId: string | null) => {
    return folders.filter(f => {
      const matchesFolder = searchTerm ? true : (f.parentId || null) === paneFolderId;
      if (!matchesFolder) return false;

      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  };

  // --- HTML5 Drag and Drop event handlers ---
  const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder', sourcePaneId?: 'pane1' | 'pane2') => {
    setDraggingItem({ id, type, sourcePaneId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ id, type, sourcePaneId }));
  };

  const handleDragOverItem = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnFolderCard = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    let dragData = draggingItem;
    if (!dragData) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) dragData = JSON.parse(raw);
      } catch (err) {}
    }
    if (!dragData) return;

    const { id: draggedId, type: draggedType } = dragData;
    if (draggedType === 'folder' && draggedId === targetFolderId) {
      showError("Cannot move a folder into itself.");
      return;
    }

    try {
      let success = false;
      let errMsg = '';
      if (draggedType === 'file') {
        const res = await Api.moveFile(draggedId, targetFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move file.';
      } else {
        const res = await Api.moveFolder(draggedId, targetFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move folder.';
      }

      if (success) {
        showSuccess("Successfully moved item!");
        onRefreshFiles?.();
        fetchFolders();
      } else {
        showError(errMsg);
      }
    } catch (err: any) {
      showError(err.message || "Failed to move item.");
    } finally {
      setDraggingItem(null);
    }
  };

  const handleDropOnPaneArea = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    let dragData = draggingItem;
    if (!dragData) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) dragData = JSON.parse(raw);
      } catch (err) {}
    }
    if (!dragData) return;

    const { id: draggedId, type: draggedType } = dragData;
    
    if (draggedType === 'folder') {
      const folderObj = folders.find(f => f.id === draggedId);
      if (folderObj && folderObj.parentId === targetFolderId) {
        return; // already there
      }
      if (draggedId === targetFolderId) {
        showError("Cannot move folder into itself.");
        return;
      }
    } else {
      const fileObj = files.find(f => f.id === draggedId);
      if (fileObj && fileObj.folderId === targetFolderId) {
        return; // already there
      }
    }

    try {
      let success = false;
      let errMsg = '';
      if (draggedType === 'file') {
        const res = await Api.moveFile(draggedId, targetFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move file.';
      } else {
        const res = await Api.moveFolder(draggedId, targetFolderId);
        success = res.success;
        errMsg = res.error || 'Failed to move folder.';
      }

      if (success) {
        showSuccess("Successfully moved item!");
        onRefreshFiles?.();
        fetchFolders();
      } else {
        showError(errMsg);
      }
    } catch (err: any) {
      showError(err.message || "Failed to move item.");
    } finally {
      setDraggingItem(null);
    }
  };

  // Activity Log states
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const fetchLogs = async () => {
    setIsLogsLoading(true);
    try {
      const res = await Api.getActivityLogs();
      if (res.success && res.data) {
        setActivityLogs(res.data);
      }
    } catch (e) {
      console.warn('Failed to retrieve activity log events:', e);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Do not trigger shortcuts when typing in inputs/textareas
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      // Ctrl+U (or Cmd+U) to open file browser upload dialog
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }

      // Delete or Backspace key to remove selected files
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFileIds.length > 0) {
          e.preventDefault();
          if (showBulkConfirm) {
            handleBulkDeleteTrigger();
          } else {
            setShowBulkConfirm(true);
          }
        }
      }

      // Enter key to confirm deletion when challenge is showing
      if (e.key === 'Enter') {
        if (showBulkConfirm && selectedFileIds.length > 0) {
          e.preventDefault();
          handleBulkDeleteTrigger();
        }
      }

      // Escape key to dismiss confirmation views
      if (e.key === 'Escape') {
        if (showBulkConfirm) {
          e.preventDefault();
          setShowBulkConfirm(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedFileIds, showBulkConfirm]);

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
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  // MIME Type Helper for Matching Icons
  const getFileIcon = (mime: string) => {
    const m = mime.toLowerCase();
    if (m.startsWith('image/')) return <FileImage className="w-5 h-5 text-indigo-500" />;
    if (m === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    if (m.includes('zip') || m.includes('tar') || m.includes('rar') || m.includes('7z')) {
      return <Archive className="w-5 h-5 text-amber-500" />;
    }
    if (m.includes('json') || m.includes('javascript') || m.includes('typescript') || m.includes('xml') || m.includes('html') || m.includes('css')) {
      return <Code className="w-5 h-5 text-emerald-500" />;
    }
    return <File className="w-5 h-5 text-slate-500" />;
  };

  // Drag and Drop Handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processSelectedFile = async (rawFile: File) => {
    if (!rawFile) return;
    
    // Check for size ceiling (100MB)
    if (rawFile.size > 100 * 1024 * 1024) {
      setAlertInfo({ type: 'error', message: 'The file exceeds the maximum 100MB storage allocation.' });
      return;
    }

    setIsUploading(true);
    setUploadPercent(0);
    setUploadingName(rawFile.name);
    setAlertInfo(null);

    const success = await onUploadFile(rawFile, currentFolderId, (percent) => {
      setUploadPercent(percent);
    });
    setIsUploading(false);

    if (success) {
      setAlertInfo({ type: 'success', message: `"${rawFile.name}" successfully uploaded and encrypted.` });
      // Reset input if present
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      fetchLogs();
    } else {
      setAlertInfo({ type: 'error', message: `Failed to upload "${rawFile.name}". Please try again.` });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  // Delete Action handler
  const handleDeleteTrigger = async (id: string) => {
    setDeleteConfirmId(null);
    setAlertInfo(null);
    const success = await onDeleteFile(id);
    if (success) {
      setAlertInfo({ type: 'success', message: 'File deleted successfully from vault storage.' });
      setSelectedFileIds(prev => prev.filter(item => item !== id));
      fetchLogs();
    } else {
      setAlertInfo({ type: 'error', message: 'Failed to delete the selected file. Please verify permissions.' });
    }
  };

  // Bulk Delete Action handlers
  const handleSelectAllToggle = () => {
    const allFilteredIds = filteredFiles.map(f => f.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedFileIds.includes(id));
    
    if (areAllSelected) {
      setSelectedFileIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedFileIds(prev => {
        const otherSelected = prev.filter(id => !allFilteredIds.includes(id));
        return [...otherSelected, ...allFilteredIds];
      });
    }
  };

  const handleSelectFileToggle = (id: string) => {
    setSelectedFileIds(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id) 
        : [...prev, id]
    );
  };

  const handleBulkDeleteTrigger = async () => {
    if (selectedFileIds.length === 0) return;
    setShowBulkConfirm(false);
    setIsBulkDeleting(true);
    setAlertInfo(null);
    
    const countToDelete = selectedFileIds.length;
    const success = await onDeleteMultipleFiles(selectedFileIds);
    setIsBulkDeleting(false);
    
    if (success) {
      setAlertInfo({ type: 'success', message: `Successfully deleted ${countToDelete} file(s) from vault storage.` });
      setSelectedFileIds([]);
      fetchLogs();
    } else {
      setAlertInfo({ type: 'error', message: 'Failed to delete selected files. Please verify permissions.' });
    }
  };

  // Secure file download execution
  const handleDownloadFile = async (url: string, filename: string) => {
    // Track download interaction
    const matchedFile = files.find(f => f.url === url || f.name === filename);
    if (matchedFile) {
      trackFileInteraction(matchedFile.id);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to retrieve file from repository');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.warn('Direct retrieval failed or CORS blocked. Routing to fallback direct open method...', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Secure bulk files ZIP download packaging execution
  const handleDownloadSelectedZip = async () => {
    if (selectedFileIds.length === 0) return;
    setIsDownloadingZip(true);
    setAlertInfo(null);
    try {
      const blob = await Api.downloadZip(selectedFileIds);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `privatevault_archive_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setAlertInfo({ 
        type: 'success', 
        message: `Successfully bundled and downloaded ${selectedFileIds.length} file(s) as ZIP file archive.` 
      });
      fetchLogs();
    } catch (error: any) {
      console.warn('Selected ZIP assembly workflow failed:', error);
      setAlertInfo({ 
        type: 'error', 
        message: error.message || 'Failed to assemble and download ZIP folder.' 
      });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Filter application mapping and sorting
  const filteredFiles = files.filter(f => {
    // Hide trashed files from standard view and folder routes
    if (f.isTrashed) return false;

    // If not searching, restrict to current folder level
    const matchesFolder = searchTerm ? true : (f.folderId || null) === currentFolderId;
    if (!matchesFolder) return false;

    const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    const mime = f.mimeType.toLowerCase();
    if (fileFilter === 'image') return mime.startsWith('image/');
    if (fileFilter === 'pdf') return mime === 'application/pdf';
    if (fileFilter === 'archive') return mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z');
    if (fileFilter === 'document') return mime.includes('word') || mime.includes('excel') || mime.includes('powerpoint') || mime.includes('text') || mime === 'application/msword';
    
    return true;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    } else if (sortBy === 'createdAt') {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortBy === 'size') {
      comparison = (a.size || 0) - (b.size || 0);
    } else if (sortBy === 'mimeType') {
      comparison = a.mimeType.localeCompare(b.mimeType, undefined, { sensitivity: 'base' });
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const filteredFolders = folders.filter(f => {
    // If not searching, restrict to current folder level
    const matchesFolder = searchTerm ? true : (f.parentId || null) === currentFolderId;
    if (!matchesFolder) return false;

    const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const exportToCSV = () => {
    if (filteredFiles.length === 0) {
      setAlertInfo({ type: 'error', message: 'No file metadata found matching the current search/filters to export.' });
      return;
    }

    const headers = ['File ID', 'File Name', 'File Size (Bytes)', 'MIME Type', 'Cloud URL', 'Upload Date'];
    const rows = filteredFiles.map(file => [
      file.id,
      file.name,
      file.size,
      file.mimeType,
      file.url,
      file.createdAt
    ]);

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `privatevault_metadata_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderPane = (
    paneId: 'pane1' | 'pane2',
    paneFolderId: string | null,
    setPaneFolderId: (id: string | null) => void
  ) => {
    const paneFiles = getFilesForPane(paneFolderId);
    const paneFolders = getFoldersForPane(paneFolderId);
    const crumbs = getBreadcrumbsForId(paneFolderId);
    const isAddingFolder = paneId === 'pane1' ? pane1AddingFolder : pane2AddingFolder;
    const setIsAddingFolder = paneId === 'pane1' ? setPane1AddingFolder : setPane2AddingFolder;

    return (
      <div 
        id={`directory-pane-${paneId}`}
        onDragOver={handleDragOverItem}
        onDrop={(e) => handleDropOnPaneArea(e, paneFolderId)}
        className={`flex flex-col bg-white rounded-xl border p-4 shadow-sm min-h-[500px] transition-all duration-200 ${
          draggingItem && draggingItem.sourcePaneId !== paneId
            ? 'border-dashed border-blue-400 bg-blue-50/10'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Pane Name / Toolbar Indicator */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 select-none">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${paneId === 'pane1' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {paneId === 'pane1' ? 'Left Explorer Pane' : 'Right Explorer Pane'}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            {/* FolderPlus icon button */}
            <button
              onClick={() => {
                setIsAddingFolder(!isAddingFolder);
                setInlineFolderName('');
              }}
              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-50 transition cursor-pointer"
              title="Create a new folder here"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            
            {/* Upload file button */}
            <button
              onClick={() => document.getElementById(`inline-upload-${paneId}`)?.click()}
              className="p-1 text-slate-400 hover:text-emerald-600 rounded hover:bg-slate-50 transition cursor-pointer"
              title="Upload file directly to this folder"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input 
              type="file" 
              id={`inline-upload-${paneId}`} 
              className="hidden" 
              onChange={(e) => handlePaneFileUpload(e, paneFolderId)} 
            />
          </div>
        </div>

        {/* Local Breadcrumbs */}
        <div className="py-2 border-b border-slate-100 flex items-center flex-wrap gap-1.5 text-xs text-slate-450 bg-slate-50/20 px-2 rounded-md my-2">
          {crumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || `crumb-${paneId}-${idx}`}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
              <button
                onClick={() => setPaneFolderId(crumb.id)}
                className={`hover:text-blue-600 hover:underline font-medium cursor-pointer transition select-none flex items-center gap-1 shrink-0 ${
                  crumb.id === paneFolderId ? 'text-slate-800 font-bold' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {crumb.id === null ? (
                  <span className="flex items-center gap-1 text-[10px] uppercase font-semibold">
                    <Folder className="w-3 h-3 text-slate-400 animate-pulse" />
                    <span>{crumb.name}</span>
                  </span>
                ) : (
                  <span className="text-[10.5px] font-semibold">{crumb.name}</span>
                )}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Inline Folder Creation Form */}
        {isAddingFolder && (
          <form 
            onSubmit={(e) => handleCreateInlineFolder(e, paneId, paneFolderId)}
            className="flex items-center gap-2 p-2 border border-blue-200 bg-blue-50/30 rounded-xl mb-3 animate-fade-in"
          >
            <Folder className="w-4 h-4 text-blue-500 shrink-0" />
            <input
              type="text"
              required
              autoFocus
              placeholder="Name new directory..."
              value={inlineFolderName}
              onChange={(e) => setInlineFolderName(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-2.5 py-1 rounded cursor-pointer"
              disabled={isCreatingFolder || !inlineFolderName.trim()}
            >
              {isCreatingFolder ? '...' : 'Create'}
            </button>
            <button 
              type="button" 
              onClick={() => setIsAddingFolder(false)}
              className="text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Subfolders View */}
        {paneFolders.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 select-none">Directories</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {paneFolders.map((folder) => {
                const isItemDragged = draggingItem?.id === folder.id && draggingItem?.type === 'folder';
                return (
                  <div
                    key={folder.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, folder.id, 'folder', paneId)}
                    onDragOver={handleDragOverItem}
                    onDrop={(e) => { e.stopPropagation(); handleDropOnFolderCard(e, folder.id); }}
                    className={`group relative flex items-center justify-between p-2.5 border rounded-lg transition-colors cursor-pointer select-none ${
                        isItemDragged 
                          ? 'opacity-40 border-slate-200 bg-slate-50' 
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/55 hover:bg-white'
                    }`}
                    onClick={() => setPaneFolderId(folder.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="w-3.5 h-3.5 text-blue-500 fill-blue-50/20 shrink-0" />
                      <p className="text-xs font-semibold text-slate-800 truncate" title={folder.name}>
                        {folder.name}
                      </p>
                    </div>
                    
                    {/* Tiny inline navigate trigger */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setRenamingFolder(folder);
                          setNewFolderInputName(folder.name);
                        }}
                        className="p-0.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition cursor-pointer"
                        title="Rename directory"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-0.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100 transition cursor-pointer"
                        title="Delete folder"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Files View Table */}
        <div className="flex-1 overflow-x-auto min-h-[250px]">
          {paneFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 border border-dashed border-slate-150 rounded-lg select-none px-4">
              <File className="w-8 h-8 text-slate-250 mb-2" />
              <p className="text-xs font-semibold text-slate-650 text-center">Empty Directory</p>
              <p className="text-[10px] text-slate-400 text-center mt-1">
                Drag files or folders from the other active explorer pane and drop here.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto text-xs">
              <thead>
                <tr className="border-b border-slate-150 text-[10px] font-bold text-slate-400 uppercase bg-slate-50/50 select-none">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paneFiles.map((file) => {
                  const isItemDragged = draggingItem?.id === file.id && draggingItem?.type === 'file';
                  const isConfirmingDelete = deleteConfirmId === file.id;

                  return (
                    <tr
                      key={file.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, file.id, 'file', paneId)}
                      onClick={() => handlePreviewFile(file)}
                      className={`border-b border-slate-100 hover:bg-slate-50/80 transition duration-100 cursor-pointer ${
                        isItemDragged ? 'opacity-40 bg-slate-50' : ''
                      } ${selectedFileIds.includes(file.id) ? 'bg-blue-50/10' : ''}`}
                    >
                      <td className="px-3 py-2.5 max-w-[140px] truncate">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="p-1 bg-slate-50 border border-slate-150 rounded shrink-0">
                            {getFileIcon(file.mimeType)}
                          </span>
                          <p className="truncate font-semibold text-slate-800" title={file.name}>
                            {file.name}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-[10.5px] whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownloadFile(file.url, file.name)}
                            className="p-1 hover:bg-slate-100 hover:text-emerald-600 rounded text-slate-450 transition cursor-pointer"
                            title="Download secure payload locally"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => handleOpenShareModal([file.id])}
                            className="p-1 hover:bg-slate-100 hover:text-indigo-600 rounded text-slate-450 transition cursor-pointer"
                            title="Generate secure public share link"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setRenamingFile(file);
                              setNewFileName(file.name);
                            }}
                            className="p-1 hover:bg-slate-100 hover:text-blue-600 rounded text-slate-450 transition cursor-pointer"
                            title="Rename stored file"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-0.5 bg-red-50 px-1 py-0.5 rounded border border-red-250 animate-fade-in">
                              <button
                                onClick={() => handleDeleteTrigger(file.id)}
                                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[9px] font-bold transition cursor-pointer"
                              >
                                Del
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="p-0.5 text-slate-500 rounded cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(file.id)}
                              className="p-1 text-slate-450 hover:text-red-550 rounded transition cursor-pointer"
                              title="Destroy file from vault"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
    );
  };

  return (
    <div id="dashboard-wrapper" className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 id="tab-title" className="text-2xl font-sans font-semibold tracking-tight text-slate-900">
            Secure File Vault
          </h1>
          <p className="text-sm text-slate-500">
            Upload, retrieve, and organize files securely with encrypted transport.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedFileIds.length > 0 && (
            <>
              <button
                onClick={handleDownloadSelectedZip}
                disabled={isDownloadingZip}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0"
                title="Download all selected files compressed inside a single ZIP bundle"
              >
                {isDownloadingZip ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Download Selected ({selectedFileIds.length})</span>
              </button>

              <button
                onClick={() => handleOpenShareModal(selectedFileIds)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0"
                title="Create a secure, time-limited share link for all selected files"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Selected ({selectedFileIds.length})</span>
              </button>

              <div className="flex items-center gap-2 bg-red-55 border border-red-200 p-1 px-2 rounded-lg animate-fade-in shrink-0">
                {showBulkConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-850 flex items-center gap-1.5" title="Press Enter to confirm or Escape to cancel">
                      Destroy {selectedFileIds.length} file(s)?
                      <span className="hidden sm:flex items-center gap-1 opacity-75">
                        <kbd className="text-[9px] font-mono bg-red-100 text-red-700 px-1 py-0.2 rounded font-bold uppercase">Enter</kbd>
                        <span className="text-[9px] text-red-400">/</span>
                        <kbd className="text-[9px] font-mono bg-red-100 text-red-700 px-1 py-0.2 rounded font-bold uppercase">Esc</kbd>
                      </span>
                    </span>
                    <button
                      onClick={handleBulkDeleteTrigger}
                      disabled={isBulkDeleting}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded text-xs font-bold cursor-pointer transition flex items-center gap-1"
                    >
                      {isBulkDeleting ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Yes, Delete'
                      )}
                    </button>
                    <button
                      onClick={() => setShowBulkConfirm(false)}
                      disabled={isBulkDeleting}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-705 border border-slate-300 rounded text-xs font-semibold cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowBulkConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
                    title="Remove all currently checked files (Press Delete / Backspace key)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedFileIds.length})</span>
                    <span className="flex items-center gap-0.5 ml-1 select-none">
                      <kbd className="text-[9px] font-mono font-bold uppercase px-1 py-0.5 bg-red-700 text-red-100 rounded leading-none shadow-2xs">
                        Del
                      </kbd>
                    </span>
                  </button>
                )}
              </div>
            </>
          )}

          <button
            onClick={() => {
              setNewFolderName('');
              setShowCreateFolder(true);
            }}
            className="flex items-center gap-2 px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 transition-colors cursor-pointer text-sm font-semibold rounded-lg shadow-sm"
            title="Create a new folder directory in the current vault location"
          >
            <FolderPlus className="w-4 h-4 text-blue-600" />
            <span>New Folder</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-755 hover:text-slate-900 transition-colors cursor-pointer text-sm font-semibold rounded-lg shadow-sm"
            title="Download metadata collection for currently filtered files"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Metadata (CSV)</span>
          </button>

          <button
            onClick={() => setShowManageShares(true)}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 transition-colors cursor-pointer text-sm font-semibold rounded-lg shadow-sm"
            title="Manage secure public share links and access catalogs"
          >
            <Share2 className="w-4 h-4 text-indigo-600" />
            <span>Shared Links ({sharedLinks.length})</span>
          </button>

          <button
            onClick={() => {
              const nextState = !isTwoPane;
              setIsTwoPane(nextState);
              if (nextState) {
                // Initialize both pane folders on first split
                setPane1FolderId(currentFolderId);
                setPane2FolderId(currentFolderId);
              }
            }}
            id="btn-toggle-twopane"
            className={`flex items-center gap-2 px-4 py-2 border transition-all duration-200 cursor-pointer text-sm font-semibold rounded-lg shadow-sm ${
              isTwoPane 
                ? 'bg-amber-650 border-amber-600 text-white hover:bg-amber-700 shadow-md scale-98'
                : 'border-slate-250 bg-white hover:bg-slate-55 text-slate-755 hover:text-slate-900'
            }`}
            title="Toggle split screen explorer panes to organize with drag and drop"
          >
            <Columns className="w-4 h-4" />
            <span>{isTwoPane ? 'Single View' : 'Two-Pane View'}</span>
          </button>
        </div>
      </div>

      {/* Alert notices reporting */}
      {alertInfo && (
        <div 
          id="alert-message" 
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
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Recent Files Quick-Access Section */}
      {files.filter(f => !f.isTrashed).length > 0 && (
        <div className="bg-slate-50/40 rounded-xl border border-slate-200 p-4 space-y-3.5 animate-fade-in mb-6" id="recent-files-quick-access">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 animate-pulse" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider select-none">
              Recent Files Quick Access
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
            {getRecentFilesList().map((file) => (
              <div
                key={`recent-${file.id}`}
                onClick={() => handlePreviewFile(file)}
                className="group relative bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3.5 transition-all duration-200 cursor-pointer hover:shadow-2xs flex flex-col justify-between h-32 select-none"
              >
                {/* File Icon & Info */}
                <div className="flex items-start gap-3 min-w-0">
                  <span className="p-2 bg-slate-50 border border-slate-100 rounded-lg shrink-0 group-hover:bg-blue-50/50 transition">
                    {getFileIcon(file.mimeType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {formatBytes(file.size)}
                    </p>
                    <span className="inline-block mt-1 text-[9px] font-semibold bg-slate-100/90 text-slate-600 px-1.5 py-0.5 rounded-md truncate max-w-full">
                      {getCleanMimeLabel(file.mimeType)}
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Date Context & Action Links */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                  <span className="truncate" title={formatDate(file.createdAt)}>
                    {formatDate(file.createdAt)}
                  </span>
                  {/* Quick Actions (visible on hover) */}
                  <div className="flex items-center gap-1 bg-white/95 pl-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadFile(file.url, file.name)}
                      className="p-1 hover:bg-slate-100 text-slate-500 hover:text-emerald-600 rounded transition cursor-pointer"
                      title="Download secure file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenShareModal([file.id])}
                      className="p-1 hover:bg-slate-100 text-slate-550 hover:text-indigo-600 rounded transition cursor-pointer"
                      title="Share secure link"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid of upload panel and files section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload panel column */}
        {!isTwoPane && (
          <div className="lg:col-span-1 space-y-4 animate-fade-in">
            <div className="bg-white p-6 rounded-xl border border-slate-250/80 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                  Upload Files
                </h2>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-205 text-slate-450 rounded shadow-2xs font-bold uppercase tracking-normal select-none" title="Press Ctrl + U to select files for upload">
                Ctrl+U
              </kbd>
            </div>

            {/* Dropzone container target */}
            <div
              id="file-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 select-none flex flex-col items-center justify-center min-h-[220px] ${
                isDragging 
                  ? 'border-blue-600 bg-blue-50/50' 
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/55 hover:bg-slate-50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
              />

              {isUploading ? (
                <div className="space-y-4 w-full px-4 py-2">
                  <div className="flex flex-col items-center justify-center">
                    <RefreshCw className="w-10 h-10 text-blue-605 text-blue-600 animate-spin mb-2" />
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]" title={uploadingName}>
                      {uploadingName || 'Uploading...'}
                    </p>
                  </div>
                  
                  <div className="space-y-1.5 w-full">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>{uploadPercent === 100 ? 'Securing inside Cloudinary...' : 'Uploading secure bytes...'}</span>
                      <span className="font-mono text-blue-600">{uploadPercent}%</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden shadow-inner border border-slate-250/20">
                      <div 
                        className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadPercent}%` }}
                      ></div>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-450 font-mono leading-none">
                    {uploadPercent === 100 ? 'Finalizing secure vault links...' : `Transferred ${uploadPercent}% of package`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-white rounded-full shadow-xs inline-block text-slate-600 border border-slate-200">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Drag &amp; drop your file here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      or <span className="text-blue-600 font-medium">browse local files</span>
                    </p>
                  </div>
                  <div className="pt-2">
                    <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                      Max file size: 100MB
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity Log Section */}
          <div className="bg-white p-6 rounded-xl border border-slate-250/80 shadow-xs flex flex-col h-[382px]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 w-full min-w-0">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 shrink-0">
                  <Activity className="w-4 h-4 animate-pulse" />
                </span>
                <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider truncate">
                  Activity Log
                </h2>
              </div>
              <button
                onClick={fetchLogs}
                disabled={isLogsLoading}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                title="Refresh log feed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLogsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
              {isLogsLoading && activityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 select-none">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                  <p className="text-xs font-mono">Synchronizing active logs...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-455 text-center p-4 space-y-2 select-none">
                  <Clock className="w-10 h-10 text-slate-205" />
                  <p className="text-xs font-semibold text-slate-700">No recent events</p>
                  <p className="text-[10px] text-slate-400 max-w-[180px]">
                    Actions like file uploads, renames, and deletions will be monitored here.
                  </p>
                </div>
              ) : (
                activityLogs.map((log) => {
                  let iconElement = <File className="w-3.5 h-3.5" />;
                  let bgClass = 'bg-slate-100 text-slate-600 border-slate-200';
                  
                  if (log.action === 'upload') {
                    iconElement = <Upload className="w-3.5 h-3.5" />;
                    bgClass = 'bg-emerald-50 text-emerald-600 border-emerald-150';
                  } else if (log.action === 'rename') {
                    iconElement = <Pencil className="w-3.5 h-3.5" />;
                    bgClass = 'bg-amber-50 text-amber-600 border-amber-150';
                  } else if (log.action === 'delete') {
                    iconElement = <Trash2 className="w-3.5 h-3.5" />;
                    bgClass = 'bg-rose-50 text-rose-600 border-rose-150';
                  } else if (log.action === 'bulk_delete') {
                    iconElement = <Trash2 className="w-3.5 h-3.5" />;
                    bgClass = 'bg-red-50 text-red-650 border-red-150';
                  }

                  return (
                    <div key={log.id} className="flex gap-3 text-xs">
                      <div className={`mt-0.5 w-7 h-7 shrink-0 rounded-lg flex items-center justify-center border ${bgClass}`}>
                        {iconElement}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <p className="text-slate-700 font-medium leading-relaxed break-words" title={log.details}>
                          {log.details}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-350" />
                          <span>{formatDate(log.timestamp)}</span>
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

        {/* Directory browser column */}
        <div className={isTwoPane ? "lg:col-span-3 space-y-4" : "lg:col-span-2 space-y-4"}>
          {isTwoPane ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fade-in" id="two-pane-split-container">
              {renderPane('pane1', pane1FolderId, setPane1FolderId)}
              {renderPane('pane2', pane2FolderId, setPane2FolderId)}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-250/80 shadow-xs overflow-hidden">
            
            {/* Header controls inside list */}
            <div className="p-5 border-b border-slate-150 flex flex-col md:flex-row md:items-center gap-4 justify-between bg-slate-50/60">
              {/* Search fields input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search file name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-slate-800 text-sm pl-9 pr-4 py-2 border border-slate-350 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition"
                />
              </div>

              {/* Categorical tag filters */}
              <div className="flex flex-wrap items-center gap-1">
                {(['all', 'image', 'pdf', 'archive', 'document'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFileFilter(filter)}
                    className={`text-xs px-2.5 py-1.5 rounded-md font-medium capitalize cursor-pointer transition ${
                      fileFilter === filter
                        ? 'bg-slate-800 text-white'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-300'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Breadcrumbs for Folder Navigation */}
            <div className="px-5 py-3 border-b border-slate-150 flex items-center flex-wrap gap-2 text-sm text-slate-500 bg-slate-50/30">
              {getBreadcrumbs().map((crumb, idx) => (
                <React.Fragment key={crumb.id || 'root-crumb'}>
                  {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-350 shrink-0" />}
                  <button
                    onClick={() => {
                      setCurrentFolderId(crumb.id);
                      setSelectedFileIds([]);
                    }}
                    className={`hover:text-blue-605 hover:underline font-medium cursor-pointer transition select-none flex items-center gap-1 shrink-0 ${
                      crumb.id === currentFolderId ? 'text-slate-800 font-bold' : 'text-slate-450 hover:text-slate-700'
                    }`}
                  >
                    {crumb.id === null ? (
                      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold">
                        <Folder className="w-3.5 h-3.5 text-slate-400" />
                        <span>{crumb.name}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-semibold">{crumb.name}</span>
                    )}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Subfolders Grid */}
            {isLoading ? (
              <div className="p-5 border-b border-slate-150 bg-slate-50/20 select-none animate-pulse">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Scanning folders...</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center gap-3 p-3 border border-slate-205 bg-white rounded-xl shadow-2xs">
                      <div className="p-2 bg-slate-100 rounded-lg h-8 w-8" />
                      <div className="space-y-2 flex-1">
                        <div className="h-3 bg-slate-200 rounded w-2/3" />
                        <div className="h-2 bg-slate-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredFolders.length > 0 && (
              <div className="p-5 border-b border-slate-150 bg-slate-50/20 select-none">
                <h3 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-2.5">Folders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredFolders.map((folder) => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, folder.id, 'folder')}
                      onDragOver={handleDragOverItem}
                      onDrop={(e) => { e.stopPropagation(); handleDropOnFolderCard(e, folder.id); }}
                      className="group relative flex items-center justify-between p-3 border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 rounded-xl transition cursor-pointer shadow-2xs"
                      onClick={() => {
                        setCurrentFolderId(folder.id);
                        setSelectedFileIds([]);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition">
                          <Folder className="w-4 h-4 text-blue-600 fill-blue-150" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-850 truncate" title={folder.name}>
                            {folder.name}
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                            {formatDate(folder.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Action Popovers/Buttons */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setRenamingFolder(folder);
                            setNewFolderInputName(folder.name);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition"
                          title="Rename directory"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setMovingItem({ id: folder.id, type: 'folder' })}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition"
                          title="Move folder nesting"
                        >
                          <Move className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="p-1 text-slate-400 hover:text-red-650 rounded hover:bg-slate-100 transition"
                          title="Delete folder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Listed items directory container */}
            <div className="overflow-x-auto">
              {filteredFiles.length === 0 && !isLoading ? (
                <div className="p-12 text-center text-slate-550 space-y-3">
                  <File className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-base font-semibold text-slate-700">No files found</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {searchTerm 
                      ? "We couldn't find items matching your search parameters inside this directory."
                      : "Your cryptographic safe is completely vacant. Drag in your first secure file to get started!"
                    }
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="border-b border-slate-150 text-[11px] font-bold text-slate-500 uppercase bg-slate-50 select-none">
                      <th className="px-5 py-3 w-10 text-center">
                        <input 
                          type="checkbox" 
                          checked={filteredFiles.length > 0 && filteredFiles.every(file => selectedFileIds.includes(file.id))}
                          onChange={handleSelectAllToggle}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer accent-blue-600"
                          title="Select all visible files"
                        />
                      </th>
                      <th 
                        className="px-5 py-3 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group select-none"
                        onClick={() => handleSort('name')}
                        title="Sort by file name. Click to toggle ascending/descending."
                      >
                        <div className="flex items-center gap-1.5">
                          <span>File Name</span>
                          {renderSortIndicator('name')}
                        </div>
                      </th>
                      <th 
                        className="px-5 py-3 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group select-none"
                        onClick={() => handleSort('mimeType')}
                        title="Sort by file type. Click to toggle ascending/descending."
                      >
                        <div className="flex items-center gap-1.5">
                          <span>File Type</span>
                          {renderSortIndicator('mimeType')}
                        </div>
                      </th>
                      <th 
                        className="px-5 py-3 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group select-none"
                        onClick={() => handleSort('size')}
                        title="Sort by file size. Click to toggle ascending/descending."
                      >
                        <div className="flex items-center gap-1.5">
                          <span>File Size</span>
                          {renderSortIndicator('size')}
                        </div>
                      </th>
                      <th 
                        className="px-5 py-3 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group select-none"
                        onClick={() => handleSort('createdAt')}
                        title="Sort by upload date. Click to toggle ascending/descending."
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Upload Date</span>
                          {renderSortIndicator('createdAt')}
                        </div>
                      </th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 text-sm">
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, idx) => (
                        <tr key={`skeleton-row-${idx}`} className="animate-pulse">
                          {/* Checkbox loading */}
                          <td className="px-5 py-4 w-10 text-center">
                            <div className="w-4 h-4 bg-slate-200 rounded mx-auto" />
                          </td>

                          {/* Details loading */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-205 bg-slate-200 rounded-lg shrink-0" />
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                                <div className="h-2 bg-slate-150 rounded w-1/3" />
                              </div>
                            </div>
                          </td>

                          {/* Type loading */}
                          <td className="px-5 py-4">
                            <div className="h-5 w-24 bg-slate-100 rounded border border-slate-200" />
                          </td>

                          {/* Size loading */}
                          <td className="px-5 py-4">
                            <div className="h-3.5 w-12 bg-slate-200 rounded" />
                          </td>

                          {/* Date loading */}
                          <td className="px-5 py-4">
                            <div className="h-3.5 w-20 bg-slate-150 rounded" />
                          </td>

                          {/* Actions loading */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <div className="w-16 h-7 bg-slate-100 rounded" />
                              <div className="w-16 h-7 bg-slate-100 rounded" />
                              <div className="w-8 h-7 bg-slate-100 rounded" />
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : filteredFiles.map((file) => {
                      const isConfirmingDelete = deleteConfirmId === file.id;

                      return (
                        <tr 
                          key={file.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, file.id, 'file')}
                          onClick={() => handlePreviewFile(file)}
                          className={`transition duration-150 cursor-pointer ${
                            selectedFileIds.includes(file.id) 
                              ? 'bg-blue-50/40 hover:bg-blue-50/60' 
                              : 'hover:bg-slate-50/60'
                          }`}
                        >
                          {/* Checkbox selection column */}
                          <td 
                            className="px-5 py-4 w-10 text-center select-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedFileIds.includes(file.id)}
                              onChange={() => handleSelectFileToggle(file.id)}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer accent-blue-600"
                            />
                          </td>

                          {/* Name column */}
                          <td className="px-5 py-4 font-medium text-slate-800 max-w-xs truncate">
                            <div className="flex items-center gap-3">
                              <span className="p-1.5 bg-slate-100 rounded border border-slate-200">
                                {getFileIcon(file.mimeType)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-[13px]" title={file.name}>
                                  {file.name}
                                </p>
                                <span className="text-[9px] text-slate-400 font-mono block truncate" title={file.mimeType}>
                                  {file.mimeType}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Type Column */}
                          <td className="px-5 py-4 text-slate-500 whitespace-nowrap text-xs">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {getCleanMimeLabel(file.mimeType)}
                            </span>
                          </td>

                          {/* Size column */}
                          <td className="px-5 py-4 text-slate-600 whitespace-nowrap font-mono text-xs">
                            {formatBytes(file.size)}
                          </td>

                          {/* Date column */}
                          <td className="px-5 py-4 text-slate-500 whitespace-nowrap text-xs">
                            {formatDate(file.createdAt)}
                          </td>

                          {/* Action triggers column */}
                          <td 
                            className="px-5 py-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-2">
                              {/* Open preview / external button */}
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded-lg text-slate-450 border border-slate-200/50 bg-slate-50 cursor-pointer transition flex items-center gap-1 text-xs font-semibold"
                                title="Open or download secure link"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>View</span>
                              </a>

                              {/* Download file button */}
                              <button
                                onClick={() => handleDownloadFile(file.url, file.name)}
                                className="p-1.5 hover:bg-slate-100 hover:text-emerald-600 rounded-lg text-slate-450 border border-slate-200/50 bg-slate-50 cursor-pointer transition flex items-center gap-1 text-xs font-semibold animate-fade-in"
                                title="Download secure payload locally"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </button>

                              {/* Share file button */}
                              <button
                                onClick={() => handleOpenShareModal([file.id])}
                                className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-slate-450 border border-slate-200/50 bg-slate-50 cursor-pointer transition flex items-center gap-1 text-xs font-semibold"
                                title="Generate secure public share link for this file"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share</span>
                              </button>

                              {/* Move button */}
                              <button
                                onClick={() => setMovingItem({ id: file.id, type: 'file' })}
                                className="p-1.5 hover:bg-slate-100 hover:text-indigo-650 rounded-lg text-slate-450 border border-slate-200/50 bg-slate-50 cursor-pointer transition flex items-center gap-1 text-xs font-semibold"
                                title="Move safe file location"
                              >
                                <Move className="w-3.5 h-3.5 text-indigo-505" />
                                <span>Move</span>
                              </button>

                              {/* Rename button */}
                              <button
                                onClick={() => {
                                  setRenamingFile(file);
                                  setNewFileName(file.name);
                                }}
                                className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded-lg text-slate-450 border border-slate-200/50 bg-slate-50 cursor-pointer transition flex items-center gap-1 text-xs font-semibold"
                                title="Rename stored file"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Rename</span>
                              </button>

                              {/* Delete button or confirmation */}
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                                  <button
                                    onClick={() => handleDeleteTrigger(file.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer transition"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="p-1 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(file.id)}
                                  className="p-1.5 text-slate-450 hover:bg-red-50 hover:text-red-600 rounded-lg cursor-pointer transition border border-transparent"
                                  title="Destroy file from vault"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        )}
      </div>
    </div>
      
      {/* File Detail Preview Modal Trigger */}
      <FilePreviewModal 
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onAnalyzeFile={async (fileId) => {
          if (!onAnalyzeFile) return false;
          const success = await onAnalyzeFile(fileId);
          if (success) {
            // Hot update the modal state using the freshly scanned file props
            const scannedFile = files.find(f => f.id === fileId);
            if (scannedFile) {
              setPreviewFile(scannedFile);
            }
          }
          return success;
        }}
        onRefresh={() => {
          fetchFolders();
          if (onRefreshFiles) {
            onRefreshFiles();
          }
        }}
      />

      {/* File Rename Modal */}
      {renamingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="rename-modal-wrapper">
          {/* Backdrop */}
          <div 
            onClick={() => setRenamingFile(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
            id="rename-modal-backdrop"
          />
          
          {/* Modal box */}
          <div 
            className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col z-10"
            id="rename-modal-container"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-100 text-slate-500 rounded-md border border-slate-200">
                  <Pencil className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Rename Stored File
                </h3>
              </div>
              <button
                onClick={() => setRenamingFile(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newFileName.trim() || isRenaming) return;
                setIsRenaming(true);
                setAlertInfo(null);
                const success = await onRenameFile(renamingFile.id, newFileName.trim());
                setIsRenaming(false);
                if (success) {
                  setAlertInfo({ type: 'success', message: `File renamed successfully to "${newFileName.trim()}".` });
                  setRenamingFile(null);
                  fetchLogs();
                } else {
                  setAlertInfo({ type: 'error', message: 'Failed to rename file. Please try again.' });
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  File Name
                </label>
                <input 
                  type="text"
                  required
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                  placeholder="Enter new file name..."
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingFile(null)}
                  disabled={isRenaming}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !newFileName.trim()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold cursor-pointer transition select-none flex items-center gap-1.5"
                >
                  {isRenaming ? (
                    <>
                      <RefreshCw className="w-3 animate-spin" />
                      <span>Renaming...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="create-folder-modal">
          <div onClick={() => setShowCreateFolder(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer" />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col z-10 animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-md border border-blue-105">
                  <FolderPlus className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-905">Create New Folder</h3>
              </div>
              <button onClick={() => setShowCreateFolder(false)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold tracking-wider text-slate-400">Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="E.g., Financials, Receipts, Code..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-205 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateFolder(false)} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none">
                  Cancel
                </button>
                <button type="submit" disabled={isCreatingFolder || !newFolderName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-xs font-bold cursor-pointer transition select-none flex items-center gap-1.5">
                  {isCreatingFolder ? <RefreshCw className="w-3 h-3 animate-spin" /> : <span>Create Folder</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="rename-folder-modal">
          <div onClick={() => setRenamingFolder(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer" />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col z-10 animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-md border border-blue-105">
                  <Pencil className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-905">Rename Directory</h3>
              </div>
              <button onClick={() => setRenamingFolder(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRenameFolder} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold tracking-wider text-slate-400">New Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFolderInputName}
                  onChange={(e) => setNewFolderInputName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-205 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setRenamingFolder(null)} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none">
                  Cancel
                </button>
                <button type="submit" disabled={isRenamingFolder || !newFolderInputName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-xs font-bold cursor-pointer transition select-none flex items-center gap-1.5">
                  {isRenamingFolder ? <RefreshCw className="w-3 h-3 animate-spin" /> : <span>Save Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Item Folder Selector Modal */}
      {movingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="move-item-modal">
          <div onClick={() => setMovingItem(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer animate-fade-in" />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-slate-100 flex flex-col z-10 max-h-[85vh] animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Move className="w-4 h-4 text-indigo-600" />
                  <span>Move {movingItem.type === 'file' ? 'File' : 'Folder'}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Choose destination folder to relocate item:</p>
              </div>
              <button onClick={() => setMovingItem(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-2.5 max-h-[50vh]">
              {/* Root Choice */}
              <button
                type="button"
                onClick={() => handleMoveItem(null)}
                disabled={isMoving}
                className="w-full flex items-center justify-between p-3 border border-slate-150 hover:bg-indigo-50/40 hover:border-indigo-350 rounded-xl text-left transition text-xs font-bold text-slate-800 disabled:opacity-50 cursor-pointer group"
              >
                <span className="flex items-center gap-3">
                  <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded group-hover:bg-indigo-100 transition">
                    <Folder className="w-4 h-4 text-indigo-600 fill-indigo-100" />
                  </span>
                  <span>Vault Root (Top Level)</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition" />
              </button>

              {/* Folders List selection */}
              {folders
                .filter(f => f.id !== movingItem.id) // Cannot move into itself
                .map((folder) => {
                  const pathParts: string[] = [];
                  let current = folder;
                  while (current) {
                    pathParts.unshift(current.name);
                    current = current.parentId ? folders.find(f => f.id === current.parentId)! : null!;
                  }
                  const pathString = pathParts.join(' / ');

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => handleMoveItem(folder.id)}
                      disabled={isMoving}
                      className="w-full flex items-center justify-between p-3 border border-slate-150 hover:bg-indigo-50/40 hover:border-indigo-350 rounded-xl text-left transition text-xs font-bold text-slate-800 disabled:opacity-50 cursor-pointer group"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="p-1.5 bg-blue-50 text-blue-600 rounded group-hover:bg-blue-100 transition shrink-0">
                          <Folder className="w-4 h-4 text-blue-600 fill-blue-100" />
                        </span>
                        <span className="truncate">
                          <span className="block truncate font-bold">{folder.name}</span>
                          <span className="block text-[9px] text-slate-400 font-mono font-normal truncate mt-0.5">{pathString}</span>
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition" />
                    </button>
                  );
                })}

              {folders.filter(f => f.id !== movingItem.id).length === 0 && (
                <div className="p-6 text-center text-slate-400 border border-slate-100 rounded-xl text-xs font-mono">
                  No other directories exist.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMovingItem(null)}
                disabled={isMoving}
                className="px-4 py-2 border border-slate-205 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECURE PUBLIC SHARE LINKS CREATION MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-600" />
                <span>Create Secure Share Link</span>
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              {!generatedShare ? (
                <>
                  <p className="text-xs text-slate-500">
                    You are generating a secure access point to download <strong>{sharingFileIds.length}</strong> selected file(s) instantly. 
                    Configure restrictions below to safeguard access.
                  </p>

                  {/* Expiration Select */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Time Bound Expiry Limit</label>
                    <select
                      value={shareExpiresUnit}
                      onChange={(e: any) => setShareExpiresUnit(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-semibold"
                    >
                      <option value="15m">15 Minutes (Temporary quick share)</option>
                      <option value="1h">1 Hour (Highly secure short access)</option>
                      <option value="24h">24 Hours (1 day default sharing)</option>
                      <option value="7d">7 Days (Weekly collaboration)</option>
                      <option value="30d">30 Days (Extended time window)</option>
                    </select>
                  </div>

                  {/* Optional download views count limit */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
                      <span>Maximum Access Views Count</span>
                      <span className="text-slate-400 lowercase font-normal italic">optional</span>
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 5 (Revokes after 5 downloads, leave blank for infinite)"
                      value={shareViewsLimit}
                      onChange={(e) => setShareViewsLimit(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>

                  {/* Optional secret passcode protection */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-between">
                      <span>Gate access with secret passcode</span>
                      <span className="text-slate-400 lowercase font-normal italic">optional</span>
                    </label>
                    <input
                      type="password"
                      placeholder="e.g. PaSsWoRd (Hides file names and contents until verified)"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-5 py-2">
                  <div className="text-center space-y-2">
                    <div className="bg-emerald-50 text-emerald-600 border border-emerald-200 p-2.5 rounded-full inline-block">
                      <Check className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-800">Your Share Link is Active!</h4>
                    <p className="text-[11px] text-slate-450 font-mono">
                      Secure token: <strong className="text-slate-700">{generatedShare.id}</strong>
                    </p>
                  </div>

                  {/* The generated URL */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Share Link Location</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/share/${generatedShare.id}`}
                        className="flex-1 px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 select-all"
                        id="generated-share-link-input"
                      />
                      <button
                        onClick={() => copyToClipboard(`${window.location.origin}/share/${generatedShare.id}`, 'new-link')}
                        className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg shrink-0 border border-slate-200 cursor-pointer active:scale-95 transition"
                        title="Copy share link to clipboard"
                      >
                        {copiedShareId === 'new-link' ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 text-xs text-slate-600 space-y-1.5 font-mono">
                    <p className="font-bold text-indigo-850">Security Checklist Info:</p>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>Expires: <strong>{new Date(generatedShare.expiresAt).toLocaleString()}</strong></div>
                      <div>Access view limits: <strong>{generatedShare.viewsLimit === null ? '∞' : generatedShare.viewsLimit}</strong></div>
                      <div>Passcode protected: <strong>{generatedShare.password ? 'Active' : 'Disabled'}</strong></div>
                      <div>Total files inside: <strong>{generatedShare.fileIds.length}</strong></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              {generatedShare ? (
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition select-none"
                >
                  Close Panel
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateShareLink}
                    disabled={isGeneratingShare}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:bg-indigo-400 cursor-pointer transition select-none flex items-center gap-1.5"
                  >
                    {isGeneratingShare ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                    <span>Generate Share Link</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUDITING ACTIVE PUBLIC SHARE LINKS MODAL */}
      {showManageShares && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col h-[520px]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-600" />
                <span>Auditing Active Share Resources</span>
              </h3>
              <button
                onClick={() => setShowManageShares(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500">
                Below is a live catalog of secure access links you have provisioned. 
                You can inspect access parameters, check remaining expiration durations, and instantly delete/revoke them to sever visitor access.
              </p>

              <div className="space-y-3">
                {sharedLinks.map((link) => {
                  const shareUrl = `${window.location.origin}/share/${link.id}`;
                  const isExpired = new Date() > new Date(link.expiresAt);
                  const isViewsExceeded = link.viewsLimit !== null && link.viewsCount >= link.viewsLimit;

                  return (
                    <div
                      key={link.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition text-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono text-[11px] text-slate-450 flex items-center gap-1.5 break-all font-bold">
                          <span>Token:</span>
                          <span className="text-slate-800 underline block shrink-1">{link.id}</span>
                          {link.password && (
                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-700 text-[8px] uppercase tracking-wider font-bold rounded-sm border border-amber-200">
                              Passcode Active
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isExpired ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md">Expired</span>
                          ) : isViewsExceeded ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md">Limit Reached</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md">Active</span>
                          )}

                          <button
                            onClick={() => copyToClipboard(shareUrl, link.id)}
                            className="p-1 px-2 border border-slate-250 bg-white hover:bg-slate-100 rounded-md text-slate-555 hover:text-slate-700 transition cursor-pointer flex items-center gap-1 font-semibold"
                            title="Copy link to clipboard"
                          >
                            {copiedShareId === link.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-[10px] text-emerald-600">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="text-[10px]">Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleRevokeShare(link.id)}
                            disabled={isRevokingShareId === link.id}
                            className="p-1 px-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-800 rounded-md transition cursor-pointer flex items-center gap-1 font-semibold disabled:opacity-50"
                            title="Revoke and delete shared link instantly"
                          >
                            {isRevokingShareId === link.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-red-600" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            <span className="text-[10px]">Revoke</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-500 bg-white p-2.5 rounded-lg border border-slate-150/60 leading-normal">
                        <div>
                          Files: <strong className="text-slate-700">{link.fileIds.length} file(s)</strong>
                        </div>
                        <div>
                          Views limits: <strong className="text-slate-700">{link.viewsCount} / {link.viewsLimit === null ? '∞' : link.viewsLimit}</strong>
                        </div>
                        <div>
                          Expires time: <strong className="text-slate-705">{new Date(link.expiresAt).toLocaleDateString()}</strong>
                        </div>
                        <div>
                          Generated: <strong className="text-slate-705">{new Date(link.createdAt).toLocaleDateString()}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sharedLinks.length === 0 && (
                  <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs font-mono">
                    No active secure public sharing links exist currently.
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowManageShares(false)}
                className="px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition select-none"
              >
                Close Catalog List
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Upload Progress Overlay Card */}
      {isUploading && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-4 font-sans transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100/80 text-blue-600 rounded-xl">
              <Upload className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                  {uploadPercent === 100 ? 'Securing Cloud Database' : 'Transferring file'}
                </span>
                <span className="text-xs font-extrabold text-blue-600 font-mono">{uploadPercent}%</span>
              </div>
              <p className="text-xs text-slate-600 font-semibold truncate mb-3" title={uploadingName}>
                {uploadingName || 'Processing data...'}
              </p>
              
              {/* Progress Bar Container */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadPercent}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between items-center mt-2.5 text-[9px] text-slate-400 font-mono leading-none">
                <span>STAGE: {uploadPercent === 100 ? 'Cloudinary upload' : 'Local transport stream'}</span>
                {uploadPercent === 100 ? (
                  <span className="text-emerald-600 font-extrabold animate-[pulse_1s_infinite]">PROCESSING</span>
                ) : (
                  <span>ACTIVE</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
