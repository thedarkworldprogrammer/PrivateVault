export type UserRole = 'user' | 'admin';

export interface UserPreferences {
  autoScan: boolean;
  compactLayout: boolean;
  notificationsEnabled: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  trashRetentionDays?: number; // settings preference for auto-purging
  preferences?: UserPreferences;
}

export interface FileAiAnalysis {
  summary: string;
  tags: string[];
  sensitiveDataDetected: boolean;
  securityClassification: 'Secure' | 'Warning' | 'Critical';
  category: string;
  analyzedAt: string;
  suggestedFolder?: {
    id: string | null;
    name: string;
    isNew: boolean;
    reasoning?: string;
  } | null;
}

export interface UploadedFile {
  id: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  cloudinaryPublicId?: string;
  createdAt: string;
  aiAnalysis?: FileAiAnalysis;
  folderId?: string | null;
  isTrashed?: boolean;
  trashedAt?: string;
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null; // null for root level
  createdAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  secretKey: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: 'upload' | 'rename' | 'delete' | 'bulk_delete' | 'download';
  details: string;
  timestamp: string;
}

export interface SharedLink {
  id: string;
  userId: string;
  fileIds: string[];
  expiresAt: string; // ISO String
  createdAt: string; // ISO String
  viewsCount: number;
  viewsLimit: number | null; // null means unlimited
  password?: string | null; // optional password
}

export interface PasswordResetToken {
  id: string;
  email: string;
  token: string;
  expiresAt: string; // ISO String
  isUsed: boolean;
  createdAt: string; // ISO String
}

