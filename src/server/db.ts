import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { User, UploadedFile, UserRole, ApiKey, FileAiAnalysis, ActivityLog, Folder, SharedLink } from '../types.js';

const MONGODB_URI = process.env.MONGODB_URI;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_JSON_PATH = path.join(DATA_DIR, 'db.json');

// Ensure data folder exists for fallback file persistence
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_JSON_PATH)) {
  fs.writeFileSync(DB_JSON_PATH, JSON.stringify({ users: [], files: [], activityLogs: [], folders: [], sharedLinks: [] }, null, 2));
}

// Ensure local uploads directory exists
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MongoDB Schemas
let UserModel: mongoose.Model<any> | null = null;
let FileModel: mongoose.Model<any> | null = null;
let ApiKeyModel: mongoose.Model<any> | null = null;
let ActivityLogModel: mongoose.Model<any> | null = null;
let FolderModel: mongoose.Model<any> | null = null;
let SharedLinkModel: mongoose.Model<any> | null = null;
let isMongoConnected = false;

if (MONGODB_URI) {
  try {
    mongoose.connect(MONGODB_URI)
      .then(() => {
        isMongoConnected = true;
        console.log('Successfully connected to MongoDB.');
      })
      .catch((err) => {
        console.warn('MongoDB connection failed. Falling back to local JSON database.', err);
      });

    const userSchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, enum: ['user', 'admin'], default: 'user' },
      createdAt: { type: String, required: true },
      trashRetentionDays: { type: Number, default: 30 }
    });

    const fileSchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      size: { type: Number, required: true },
      mimeType: { type: String, required: true },
      url: { type: String, required: true },
      cloudinaryPublicId: { type: String },
      createdAt: { type: String, required: true },
      aiAnalysis: { type: Map, of: mongoose.Schema.Types.Mixed },
      folderId: { type: String, default: null },
      isTrashed: { type: Boolean, default: false },
      trashedAt: { type: String, default: null }
    });

    const apiKeySchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      secretKey: { type: String, required: true, unique: true },
      createdAt: { type: String, required: true }
    });

    const activityLogSchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      action: { type: String, required: true },
      details: { type: String, required: true },
      timestamp: { type: String, required: true }
    });

    const folderSchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      parentId: { type: String, default: null },
      createdAt: { type: String, required: true }
    });

    const sharedLinkSchema = new mongoose.Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      fileIds: [{ type: String, required: true }],
      expiresAt: { type: String, required: true },
      createdAt: { type: String, required: true },
      viewsCount: { type: Number, default: 0 },
      viewsLimit: { type: Number, default: null },
      password: { type: String, default: null }
    });

    UserModel = mongoose.model('User', userSchema);
    FileModel = mongoose.model('File', fileSchema);
    ApiKeyModel = mongoose.model('ApiKey', apiKeySchema);
    ActivityLogModel = mongoose.model('ActivityLog', activityLogSchema);
    FolderModel = mongoose.model('Folder', folderSchema);
    SharedLinkModel = mongoose.model('SharedLink', sharedLinkSchema);
  } catch (error) {
    console.warn('Failed to initialize MongoDB schemas. Fallback is active.', error);
  }
}

// Helpers for fallback JSON Db
interface LocalDbData {
  users: Array<User & { password?: string }>;
  files: UploadedFile[];
  apiKeys?: ApiKey[];
  activityLogs?: ActivityLog[];
  folders?: Folder[];
  sharedLinks?: SharedLink[];
}

function readLocalDb(): LocalDbData {
  try {
    const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.apiKeys) parsed.apiKeys = [];
    if (!parsed.activityLogs) parsed.activityLogs = [];
    if (!parsed.folders) parsed.folders = [];
    if (!parsed.sharedLinks) parsed.sharedLinks = [];
    return parsed;
  } catch (err) {
    return { users: [], files: [], apiKeys: [], activityLogs: [], folders: [], sharedLinks: [] };
  }
}

function writeLocalDb(data: LocalDbData) {
  if (!data.apiKeys) data.apiKeys = [];
  if (!data.activityLogs) data.activityLogs = [];
  if (!data.folders) data.folders = [];
  if (!data.sharedLinks) data.sharedLinks = [];
  fs.writeFileSync(DB_JSON_PATH, JSON.stringify(data, null, 2));
}

// Main DB Access Methods
export const Db = {
  isUsingMongo: () => isMongoConnected,

  findUserByEmail: async (email: string) => {
    const searchEmail = email.toLowerCase().trim();
    if (isMongoConnected && UserModel) {
      const doc = await UserModel.findOne({ email: searchEmail }).lean();
      return doc ? { id: doc.id, email: doc.email, password: doc.password, name: doc.name, role: doc.role, createdAt: doc.createdAt, trashRetentionDays: doc.trashRetentionDays ?? 30 } : null;
    } else {
      const data = readLocalDb();
      const found = data.users.find(u => u.email.toLowerCase().trim() === searchEmail);
      if (found && found.trashRetentionDays === undefined) found.trashRetentionDays = 30;
      return found || null;
    }
  },

  findUserById: async (id: string) => {
    if (isMongoConnected && UserModel) {
      const doc = await UserModel.findOne({ id }).lean();
      return doc ? { id: doc.id, email: doc.email, name: doc.name, role: doc.role, createdAt: doc.createdAt, trashRetentionDays: doc.trashRetentionDays ?? 30 } : null;
    } else {
      const data = readLocalDb();
      const found = data.users.find(u => u.id === id);
      if (!found) return null;
      if (found.trashRetentionDays === undefined) found.trashRetentionDays = 30;
      const { password, ...userWithoutPassword } = found;
      return userWithoutPassword;
    }
  },

  createUser: async (user: any) => {
    user.email = user.email.toLowerCase().trim();
    if (isMongoConnected && UserModel) {
      const newUser = new UserModel(user);
      await newUser.save();
    } else {
      const data = readLocalDb();
      data.users.push(user);
      writeLocalDb(data);
    }
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  },

  getAllUsers: async () => {
    if (isMongoConnected && UserModel) {
      const docs = await UserModel.find().sort({ createdAt: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        email: d.email,
        name: d.name,
        role: d.role as UserRole,
        createdAt: d.createdAt
      }));
    } else {
      const data = readLocalDb();
      return data.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt
      }));
    }
  },

  updateUserRole: async (id: string, role: 'user' | 'admin') => {
    if (isMongoConnected && UserModel) {
      await UserModel.updateOne({ id }, { role });
    } else {
      const data = readLocalDb();
      const idx = data.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        data.users[idx].role = role;
        writeLocalDb(data);
      }
    }
  },

  updateUserTrashRetention: async (id: string, days: number) => {
    if (isMongoConnected && UserModel) {
      await UserModel.updateOne({ id }, { trashRetentionDays: days });
    } else {
      const data = readLocalDb();
      const idx = data.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        data.users[idx].trashRetentionDays = days;
        writeLocalDb(data);
      }
    }
  },

  deleteUser: async (id: string) => {
    if (isMongoConnected && UserModel) {
      await UserModel.deleteOne({ id });
      if (FileModel) {
        // Also delete user files from db mapping
        await FileModel.deleteMany({ userId: id });
      }
    } else {
      const data = readLocalDb();
      data.users = data.users.filter(u => u.id !== id);
      data.files = data.files.filter(f => f.userId !== id);
      writeLocalDb(data);
    }
  },

  // File system database mappings
  getFilesByUserId: async (userId: string) => {
    if (isMongoConnected && FileModel) {
      const docs = await FileModel.find({ userId }).sort({ createdAt: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        size: d.size,
        mimeType: d.mimeType,
        url: d.url,
        cloudinaryPublicId: d.cloudinaryPublicId,
        createdAt: d.createdAt,
        aiAnalysis: d.aiAnalysis,
        folderId: d.folderId || null,
        isTrashed: d.isTrashed || false,
        trashedAt: d.trashedAt || null
      }));
    } else {
      const data = readLocalDb();
      return data.files
        .filter(f => f.userId === userId)
        .map(f => ({
          ...f,
          isTrashed: f.isTrashed || false,
          trashedAt: f.trashedAt || null
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  getAllFiles: async () => {
    if (isMongoConnected && FileModel) {
      const docs = await FileModel.find().sort({ createdAt: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        size: d.size,
        mimeType: d.mimeType,
        url: d.url,
        cloudinaryPublicId: d.cloudinaryPublicId,
        createdAt: d.createdAt,
        aiAnalysis: d.aiAnalysis,
        folderId: d.folderId || null
      }));
    } else {
      const data = readLocalDb();
      return data.files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  createFile: async (file: UploadedFile) => {
    if (isMongoConnected && FileModel) {
      const newFile = new FileModel(file);
      await newFile.save();
    } else {
      const data = readLocalDb();
      data.files.push(file);
      writeLocalDb(data);
    }
    return file;
  },

  deleteFile: async (id: string, userId?: string) => {
    if (isMongoConnected && FileModel) {
      const query: any = { id };
      if (userId) query.userId = userId;
      const fileDoc = await FileModel.findOne(query).lean();
      if (fileDoc) {
        await FileModel.deleteOne({ id });
        return fileDoc;
      }
      return null;
    } else {
      const data = readLocalDb();
      const fileIdx = data.files.findIndex(f => f.id === id && (!userId || f.userId === userId));
      if (fileIdx !== -1) {
        const deletedFile = data.files[fileIdx];
        data.files.splice(fileIdx, 1);
        writeLocalDb(data);
        return deletedFile;
      }
      return null;
    }
  },

  trashFile: async (id: string, userId: string) => {
    const timestamp = new Date().toISOString();
    if (isMongoConnected && FileModel) {
      const fileDoc = await FileModel.findOneAndUpdate(
        { id, userId },
        { isTrashed: true, trashedAt: timestamp },
        { new: true }
      ).lean();
      return fileDoc;
    } else {
      const data = readLocalDb();
      const fileIdx = data.files.findIndex(f => f.id === id && f.userId === userId);
      if (fileIdx !== -1) {
        data.files[fileIdx].isTrashed = true;
        data.files[fileIdx].trashedAt = timestamp;
        writeLocalDb(data);
        return data.files[fileIdx];
      }
      return null;
    }
  },

  restoreFile: async (id: string, userId: string) => {
    if (isMongoConnected && FileModel) {
      const fileDoc = await FileModel.findOneAndUpdate(
        { id, userId },
        { isTrashed: false, trashedAt: null },
        { new: true }
      ).lean();
      return fileDoc;
    } else {
      const data = readLocalDb();
      const fileIdx = data.files.findIndex(f => f.id === id && f.userId === userId);
      if (fileIdx !== -1) {
        data.files[fileIdx].isTrashed = false;
        data.files[fileIdx].trashedAt = undefined;
        writeLocalDb(data);
        return data.files[fileIdx];
      }
      return null;
    }
  },

  updateFileName: async (id: string, name: string, userId?: string) => {
    if (isMongoConnected && FileModel) {
      const query: any = { id };
      if (userId) query.userId = userId;
      const fileDoc = await FileModel.findOneAndUpdate(query, { name }, { new: true }).lean();
      return fileDoc ? {
        id: fileDoc.id,
        userId: fileDoc.userId,
        name: fileDoc.name,
        size: fileDoc.size,
        mimeType: fileDoc.mimeType,
        url: fileDoc.url,
        cloudinaryPublicId: fileDoc.cloudinaryPublicId,
        createdAt: fileDoc.createdAt,
        aiAnalysis: fileDoc.aiAnalysis,
        folderId: fileDoc.folderId || null
      } : null;
    } else {
      const data = readLocalDb();
      const fileIdx = data.files.findIndex(f => f.id === id && (!userId || f.userId === userId));
      if (fileIdx !== -1) {
        data.files[fileIdx].name = name;
        writeLocalDb(data);
        return data.files[fileIdx];
      }
      return null;
    }
  },

  saveAiAnalysis: async (id: string, aiAnalysis: FileAiAnalysis, userId?: string) => {
    if (isMongoConnected && FileModel) {
      const query: any = { id };
      if (userId) query.userId = userId;
      const fileDoc = await FileModel.findOneAndUpdate(query, { aiAnalysis }, { new: true }).lean();
      return fileDoc ? {
        id: fileDoc.id,
        userId: fileDoc.userId,
        name: fileDoc.name,
        size: fileDoc.size,
        mimeType: fileDoc.mimeType,
        url: fileDoc.url,
        cloudinaryPublicId: fileDoc.cloudinaryPublicId,
        createdAt: fileDoc.createdAt,
        aiAnalysis: fileDoc.aiAnalysis,
        folderId: fileDoc.folderId || null
      } : null;
    } else {
      const data = readLocalDb();
      const fileIdx = data.files.findIndex(f => f.id === id && (!userId || f.userId === userId));
      if (fileIdx !== -1) {
        data.files[fileIdx].aiAnalysis = aiAnalysis;
        writeLocalDb(data);
        return data.files[fileIdx];
      }
      return null;
    }
  },

  // API keys helpers
  getApiKeysByUserId: async (userId: string): Promise<ApiKey[]> => {
    if (isMongoConnected && ApiKeyModel) {
      const docs = await ApiKeyModel.find({ userId }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        secretKey: d.secretKey,
        createdAt: d.createdAt
      }));
    } else {
      const data = readLocalDb();
      return (data.apiKeys || []).filter(k => k.userId === userId);
    }
  },

  createApiKey: async (key: ApiKey): Promise<ApiKey> => {
    if (isMongoConnected && ApiKeyModel) {
      const newKey = new ApiKeyModel(key);
      await newKey.save();
    } else {
      const data = readLocalDb();
      if (!data.apiKeys) data.apiKeys = [];
      data.apiKeys.push(key);
      writeLocalDb(data);
    }
    return key;
  },

  deleteApiKey: async (id: string, userId: string): Promise<boolean> => {
    if (isMongoConnected && ApiKeyModel) {
      const result = await ApiKeyModel.deleteOne({ id, userId });
      return result.deletedCount > 0;
    } else {
      const data = readLocalDb();
      if (!data.apiKeys) data.apiKeys = [];
      const index = data.apiKeys.findIndex(k => k.id === id && k.userId === userId);
      if (index !== -1) {
        data.apiKeys.splice(index, 1);
        writeLocalDb(data);
        return true;
      }
      return false;
    }
  },

  findApiKeyByKey: async (secretKey: string): Promise<ApiKey | null> => {
    if (isMongoConnected && ApiKeyModel) {
      const doc = await ApiKeyModel.findOne({ secretKey }).lean();
      return doc ? {
        id: doc.id,
        userId: doc.userId,
        name: doc.name,
        secretKey: doc.secretKey,
        createdAt: doc.createdAt
      } : null;
    } else {
      const data = readLocalDb();
      const found = (data.apiKeys || []).find(k => k.secretKey === secretKey);
      return found || null;
    }
  },

  createActivityLog: async (log: ActivityLog): Promise<ActivityLog> => {
    if (isMongoConnected && ActivityLogModel) {
      const newLog = new ActivityLogModel(log);
      await newLog.save();
    } else {
      const data = readLocalDb();
      if (!data.activityLogs) data.activityLogs = [];
      data.activityLogs.push(log);
      writeLocalDb(data);
    }
    return log;
  },

  getActivityLogsByUserId: async (userId: string): Promise<ActivityLog[]> => {
    if (isMongoConnected && ActivityLogModel) {
      const docs = await ActivityLogModel.find({ userId }).sort({ timestamp: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        action: d.action,
        details: d.details,
        timestamp: d.timestamp
      }));
    } else {
      const data = readLocalDb();
      return (data.activityLogs || [])
        .filter(log => log.userId === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  },

  // Folder database mappings
  getFoldersByUserId: async (userId: string): Promise<Folder[]> => {
    if (isMongoConnected && FolderModel) {
      const docs = await FolderModel.find({ userId }).sort({ createdAt: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        name: d.name,
        parentId: d.parentId || null,
        createdAt: d.createdAt
      }));
    } else {
      const data = readLocalDb();
      return (data.folders || []).filter(f => f.userId === userId);
    }
  },

  createFolder: async (folder: Folder): Promise<Folder> => {
    if (isMongoConnected && FolderModel) {
      const newFolder = new FolderModel(folder);
      await newFolder.save();
    } else {
      const data = readLocalDb();
      if (!data.folders) data.folders = [];
      data.folders.push(folder);
      writeLocalDb(data);
    }
    return folder;
  },

  updateFolderName: async (id: string, name: string, userId: string): Promise<Folder | null> => {
    if (isMongoConnected && FolderModel) {
      const folderDoc = await FolderModel.findOneAndUpdate({ id, userId }, { name }, { new: true }).lean();
      return folderDoc ? {
        id: folderDoc.id,
        userId: folderDoc.userId,
        name: folderDoc.name,
        parentId: folderDoc.parentId || null,
        createdAt: folderDoc.createdAt
      } : null;
    } else {
      const data = readLocalDb();
      const idx = (data.folders || []).findIndex(f => f.id === id && f.userId === userId);
      if (idx !== -1) {
        data.folders![idx].name = name;
        writeLocalDb(data);
        return data.folders![idx];
      }
      return null;
    }
  },

  moveFile: async (fileId: string, folderId: string | null, userId: string): Promise<UploadedFile | null> => {
    if (isMongoConnected && FileModel) {
      const fileDoc = await FileModel.findOneAndUpdate({ id: fileId, userId }, { folderId }, { new: true }).lean();
      return fileDoc ? {
        id: fileDoc.id,
        userId: fileDoc.userId,
        name: fileDoc.name,
        size: fileDoc.size,
        mimeType: fileDoc.mimeType,
        url: fileDoc.url,
        cloudinaryPublicId: fileDoc.cloudinaryPublicId,
        createdAt: fileDoc.createdAt,
        aiAnalysis: fileDoc.aiAnalysis,
        folderId: fileDoc.folderId || null
      } : null;
    } else {
      const data = readLocalDb();
      const idx = data.files.findIndex(f => f.id === fileId && f.userId === userId);
      if (idx !== -1) {
        data.files[idx].folderId = folderId;
        writeLocalDb(data);
        return data.files[idx];
      }
      return null;
    }
  },

  moveFolder: async (folderId: string, parentId: string | null, userId: string): Promise<Folder | null> => {
    if (parentId === folderId) return null;

    if (isMongoConnected && FolderModel) {
      const folderDoc = await FolderModel.findOneAndUpdate({ id: folderId, userId }, { parentId }, { new: true }).lean();
      return folderDoc ? {
        id: folderDoc.id,
        userId: folderDoc.userId,
        name: folderDoc.name,
        parentId: folderDoc.parentId || null,
        createdAt: folderDoc.createdAt
      } : null;
    } else {
      const data = readLocalDb();
      const idx = (data.folders || []).findIndex(f => f.id === folderId && f.userId === userId);
      if (idx !== -1) {
        data.folders![idx].parentId = parentId;
        writeLocalDb(data);
        return data.folders![idx];
      }
      return null;
    }
  },

  deleteFolder: async (id: string, userId: string): Promise<boolean> => {
    if (isMongoConnected && FolderModel) {
      const result = await FolderModel.deleteOne({ id, userId });
      return result.deletedCount > 0;
    } else {
      const data = readLocalDb();
      const idx = (data.folders || []).findIndex(f => f.id === id && f.userId === userId);
      if (idx !== -1) {
        data.folders!.splice(idx, 1);
        writeLocalDb(data);
        return true;
      }
      return false;
    }
  },

  // Shared Link helpers
  getSharedLinksByUserId: async (userId: string): Promise<SharedLink[]> => {
    if (isMongoConnected && SharedLinkModel) {
      const docs = await SharedLinkModel.find({ userId }).sort({ createdAt: -1 }).lean();
      return docs.map(d => ({
        id: d.id,
        userId: d.userId,
        fileIds: d.fileIds,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
        viewsCount: d.viewsCount,
        viewsLimit: d.viewsLimit,
        password: d.password
      }));
    } else {
      const data = readLocalDb();
      return (data.sharedLinks || [])
        .filter(sl => sl.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  getSharedLinkById: async (id: string): Promise<SharedLink | null> => {
    if (isMongoConnected && SharedLinkModel) {
      const doc = await SharedLinkModel.findOne({ id }).lean();
      return doc ? {
        id: doc.id,
        userId: doc.userId,
        fileIds: doc.fileIds,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
        viewsCount: doc.viewsCount,
        viewsLimit: doc.viewsLimit,
        password: doc.password
      } : null;
    } else {
      const data = readLocalDb();
      const found = (data.sharedLinks || []).find(sl => sl.id === id);
      return found || null;
    }
  },

  createSharedLink: async (sharedLink: SharedLink): Promise<SharedLink> => {
    if (isMongoConnected && SharedLinkModel) {
      const newDoc = new SharedLinkModel(sharedLink);
      await newDoc.save();
    } else {
      const data = readLocalDb();
      if (!data.sharedLinks) data.sharedLinks = [];
      data.sharedLinks.push(sharedLink);
      writeLocalDb(data);
    }
    return sharedLink;
  },

  deleteSharedLink: async (id: string, userId: string): Promise<boolean> => {
    if (isMongoConnected && SharedLinkModel) {
      const result = await SharedLinkModel.deleteOne({ id, userId });
      return result.deletedCount > 0;
    } else {
      const data = readLocalDb();
      if (!data.sharedLinks) data.sharedLinks = [];
      const idx = data.sharedLinks.findIndex(sl => sl.id === id && sl.userId === userId);
      if (idx !== -1) {
        data.sharedLinks.splice(idx, 1);
        writeLocalDb(data);
        return true;
      }
      return false;
    }
  },

  incrementSharedLinkViews: async (id: string): Promise<void> => {
    if (isMongoConnected && SharedLinkModel) {
      await SharedLinkModel.updateOne({ id }, { $inc: { viewsCount: 1 } });
    } else {
      const data = readLocalDb();
      if (!data.sharedLinks) data.sharedLinks = [];
      const idx = data.sharedLinks.findIndex(sl => sl.id === id);
      if (idx !== -1) {
        data.sharedLinks[idx].viewsCount = (data.sharedLinks[idx].viewsCount || 0) + 1;
        writeLocalDb(data);
      }
    }
  }
};
