import { ApiResponse, AuthResponse, UploadedFile, User, ActivityLog, Folder, SharedLink } from '../types.js';

const getHeaders = (isMultipart = false) => {
  const token = localStorage.getItem('privatevault_token');
  const headers: Record<string, string> = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  
  return headers;
};

export const Api = {
  // Auth endpoints
  login: async (email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        localStorage.setItem('privatevault_token', data.data.token);
      }
      return data;
    } catch (e: any) {
      return { success: false, error: 'Failed to access authentication services.' };
    }
  },

  register: async (email: string, password: string, name: string, role?: string, adminKey?: string): Promise<ApiResponse<AuthResponse>> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password, name, role, adminKey }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        localStorage.setItem('privatevault_token', data.data.token);
      }
      return data;
    } catch (e: any) {
      return { success: false, error: 'Failed to establish connection for registration.' };
    }
  },

  getCurrentUser: async (): Promise<ApiResponse<{ user: User }>> => {
    try {
      const token = localStorage.getItem('privatevault_token');
      if (!token) {
        return { success: false, error: 'No authentication token active.' };
      }
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Unable to fetch user profile context.' };
    }
  },

  resetPassword: async (email: string, password: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Database network failed while updating password.' };
    }
  },

  // File endpoints
  getFiles: async (): Promise<ApiResponse<UploadedFile[]>> => {
    try {
      const res = await fetch('/api/files', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to load cloud vault directory.' };
    }
  },

  uploadFile: async (file: File, folderId?: string | null): Promise<ApiResponse<UploadedFile>> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) {
        formData.append('folderId', folderId);
      }
      
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: getHeaders(true),
        body: formData,
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Network error occurred during physical file upload.' };
    }
  },

  deleteFile: async (fileId: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to request delete verification.' };
    }
  },

  deleteFilesBulk: async (fileIds: string[]): Promise<ApiResponse<{ deletedIds: string[] }>> => {
    try {
      const res = await fetch('/api/files/bulk-delete', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids: fileIds }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to request batch delete verification.' };
    }
  },

  restoreFile: async (fileId: string): Promise<ApiResponse<UploadedFile>> => {
    try {
      const res = await fetch(`/api/files/${fileId}/restore`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to restore file.' };
    }
  },

  purgeFile: async (fileId: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/files/${fileId}/purge`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to permanently delete file.' };
    }
  },

  clearTrash: async (): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch('/api/files/trash/clear', {
        method: 'POST',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to clear trash bin.' };
    }
  },

  updateTrashRetentionDays: async (days: number): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch('/api/users/settings/trash-retention', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ days }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to save trash retention settings.' };
    }
  },

  updateUserProfile: async (name: string, email: string, preferences: any): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ name, email, preferences }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to update user profile and preferences.' };
    }
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to complete password secure update.' };
    }
  },

  renameFile: async (fileId: string, newName: string): Promise<ApiResponse<UploadedFile>> => {
    try {
      const res = await fetch(`/api/files/${fileId}/rename`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ name: newName }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to request file rename.' };
    }
  },

  downloadZip: async (ids: string[]): Promise<Blob> => {
    const res = await fetch('/api/files/download-zip', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || 'Failed to download ZIP file.');
    }
    return await res.blob();
  },

  getActivityLogs: async (): Promise<ApiResponse<ActivityLog[]>> => {
    try {
      const res = await fetch('/api/activity-logs', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to fetch activity logs.' };
    }
  },

  // Admin endpoints
  getAdminUsers: async (): Promise<ApiResponse<User[]>> => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Unauthorized role check or connection timed out.' };
    }
  },

  getAdminUserFiles: async (userId: string): Promise<ApiResponse<{ files: UploadedFile[], folders: Folder[], activityLogs: ActivityLog[] }>> => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/files`, {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to retrieve selected user vault data.' };
    }
  },

  updateUserRole: async (userId: string, role: 'admin' | 'user'): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ role }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to execute structural role modifications.' };
    }
  },

  deleteUser: async (userId: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Error requesting user deletion parameters.' };
    }
  },

  // Developer API endpoints
  getDeveloperKeys: async (): Promise<ApiResponse<any[]>> => {
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to fetch developer API keys.' };
    }
  },

  createDeveloperKey: async (name: string): Promise<ApiResponse<any>> => {
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to create developer key.' };
    }
  },

  deleteDeveloperKey: async (id: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/developer/keys/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to revoke developer key.' };
    }
  },

  // AI File Scan
  analyzeFile: async (fileId: string): Promise<ApiResponse<UploadedFile>> => {
    try {
      const res = await fetch(`/api/files/${fileId}/analyze`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to execute smart AI file scan.' };
    }
  },

  getStats: async (): Promise<ApiResponse<{
    totalUsers: number;
    totalFiles: number;
    totalStorageBytes: number;
    isUsingMongo: boolean;
    isUsingCloudinary: boolean;
  }>> => {
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Unable to gather operational telemetry logs.' };
    }
  },

  // Folder API helpers
  getFolders: async (): Promise<ApiResponse<Folder[]>> => {
    try {
      const res = await fetch('/api/folders', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to retrieve folders.' };
    }
  },

  createFolder: async (name: string, parentId: string | null): Promise<ApiResponse<Folder>> => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, parentId }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to create folder.' };
    }
  },

  renameFolder: async (folderId: string, name: string): Promise<ApiResponse<Folder>> => {
    try {
      const res = await fetch(`/api/folders/${folderId}/rename`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to rename folder.' };
    }
  },

  moveFolder: async (folderId: string, parentId: string | null): Promise<ApiResponse<Folder>> => {
    try {
      const res = await fetch(`/api/folders/${folderId}/move`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ parentId }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to move folder.' };
    }
  },

  moveFile: async (fileId: string, folderId: string | null): Promise<ApiResponse<UploadedFile>> => {
    try {
      const res = await fetch(`/api/files/${fileId}/move`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ folderId }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to move file.' };
    }
  },

  deleteFolder: async (folderId: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to delete folder.' };
    }
  },

  createSharedLink: async (
    fileIds: string[],
    expiresAt: string,
    viewsLimit: number | null,
    password: string | null
  ): Promise<ApiResponse<SharedLink>> => {
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ fileIds, expiresAt, viewsLimit, password }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to generate secure shared link.' };
    }
  },

  getSharedLinks: async (): Promise<ApiResponse<SharedLink[]>> => {
    try {
      const res = await fetch('/api/shares', {
        method: 'GET',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to retrieve shared link catalog.' };
    }
  },

  deleteSharedLink: async (id: string): Promise<ApiResponse<void>> => {
    try {
      const res = await fetch(`/api/shares/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to revoke shared link.' };
    }
  },

  getPublicShareDetails: async (
    id: string,
    password?: string
  ): Promise<ApiResponse<SharedLink & { requiresVerification: boolean; files: UploadedFile[] }>> => {
    try {
      const res = await fetch(`/api/public/shares/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: 'Failed to query shared link credentials and contents.' };
    }
  }
};
