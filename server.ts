import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import mongoose from 'mongoose';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { Db } from './src/server/db.js';
import { Storage } from './src/server/cloudinary.js';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'privatevault-secret-key-999-default';

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
const getGeminiClient = (): GoogleGenAI => {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required but not configured.');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
};

// Multer storage folder preparation
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer upload config configuration
const upload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static serving for local media uploads fallback
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Authentication Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ success: false, error: 'Access token required. Please sign in.' });
      }

      jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
        if (err || !decoded) {
          return res.status(403).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
        }

        const user = await Db.findUserById(decoded.id);
        if (!user) {
          return res.status(404).json({ success: false, error: 'User account not found.' });
        }

        req.user = user;
        next();
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Internal server authentication error.' });
    }
  };

  // Administrator Authorization Middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Access denied. Administrator privileges required.' });
    }
  };

  // --- API ROUTES ---

  // Auth: Register
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, name, role, adminKey } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ success: false, error: 'Please provide all required fields (email, password, name).' });
      }

      const existingUser = await Db.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Email already registered. Please sign in instead.' });
      }

      // Determine registration role: strictly ignore user role input and adminKey
      let userRole: 'user' | 'admin' = 'user';
      if (email.toLowerCase().trim() === 'himanshutiwarykhrhna@gmail.com') {
        userRole = 'admin';
      }

      // Create new user profile mapping
      const hashedPassword = await bcryptjs.hash(password, 10);
      const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
      
      const newUser = await Db.createUser({
        id: userId,
        email: email.toLowerCase().trim(),
        name,
        password: hashedPassword,
        role: userRole,
        createdAt: new Date().toISOString()
      });

      // Generate Access Token
      const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({
        success: true,
        data: {
          user: newUser,
          token
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Registration failed.' });
    }
  });

  // Auth: Log In
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Please provide both email and password.' });
      }

      const userAndPass = await Db.findUserByEmail(email);
      if (!userAndPass) {
        return res.status(401).json({ success: false, error: 'Incorrect email or password.' });
      }

      const isMatch = await bcryptjs.compare(password, userAndPass.password || '');
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Incorrect email or password.' });
      }

      const { password: _, ...userProfile } = userAndPass;

      if (userAndPass.email.toLowerCase().trim() === 'himanshutiwarykhrhna@gmail.com' && userAndPass.role !== 'admin') {
        userAndPass.role = 'admin';
        userProfile.role = 'admin';
        await Db.updateUserRole(userAndPass.id, 'admin');
      }

      const token = jwt.sign({ id: userAndPass.id, email: userAndPass.email, role: userAndPass.role }, JWT_SECRET, { expiresIn: '7d' });

      res.status(200).json({
        success: true,
        data: {
          user: userProfile,
          token
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Login failed.' });
    }
  });

  // Auth: Handshake Current Session Profile
  app.get('/api/auth/me', authenticateToken, (req: any, res: any) => {
    res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  });

  // Auth: Reset Password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Please specify your email and the new password.' });
      }

      const user = await Db.findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'No account registered with this email address.' });
      }

      const hashedNewPassword = await bcryptjs.hash(password, 10);
      
      // Update locally or via Mongo
      if (Db.isUsingMongo()) {
        const UserScheme = (mongoose.models && mongoose.models.User) || mongoose.model('User');
        await UserScheme.updateOne({ id: user.id }, { password: hashedNewPassword });
      } else {
        const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'db.json'), 'utf-8');
        const data = JSON.parse(raw);
        const idx = data.users.findIndex((u: any) => u.id === user.id);
        if (idx !== -1) {
          data.users[idx].password = hashedNewPassword;
          fs.writeFileSync(path.join(process.cwd(), 'data', 'db.json'), JSON.stringify(data, null, 2));
        }
      }

      res.status(200).json({ success: true, message: 'Password successfully updated. You may now sign in.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Password reset failed.' });
    }
  });

  // Auth: Request Forgot Password Token
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Please specify your email address.' });
      }

      const user = await Db.findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'No account registered with this email address.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiry
      const id = crypto.randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();

      const resetToken = {
        id,
        email: user.email,
        token,
        expiresAt,
        isUsed: false,
        createdAt
      };

      await Db.createPasswordResetToken(resetToken);

      // Generate a fully working reset URL
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.protocol || 'http';
      const resetLink = `${protocol}://${host}/reset-password?token=${token}`;

      // Simulate sending email (log strictly inside terminal console)
      console.log(`========================================`);
      console.log(`[EMAIL SEND SIMULATOR] To: ${user.email}`);
      console.log(`Subject: Reset Your PrivateVault Password`);
      console.log(`Link: ${resetLink}`);
      console.log(`========================================`);

      // Return success with simulated link so testing in sandbox environment is extremely smooth
      res.status(200).json({
        success: true,
        message: 'A secure password reset link has been sent to your email. Please check your inbox.',
        resetLink // return here so UI can simulate receiving the email
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Unable to request password reset.' });
    }
  });

  // Auth: Validate Forgot Password Token
  app.get('/api/auth/validate-reset-token', async (req: any, res: any) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'Reset token is required.' });
      }

      const resetToken = await Db.findPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ success: false, error: 'This reset token is invalid or has already been used.' });
      }

      if (new Date(resetToken.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ success: false, error: 'This reset token has expired.' });
      }

      res.status(200).json({
        success: true,
        email: resetToken.email
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Token validation failed.' });
    }
  });

  // Auth: Secure apply reset password
  app.post('/api/auth/apply-reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Verification token and password are required.' });
      }

      const resetToken = await Db.findPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ success: false, error: 'This reset token is invalid or has already been used.' });
      }

      if (new Date(resetToken.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ success: false, error: 'This reset token has expired.' });
      }

      const user = await Db.findUserByEmail(resetToken.email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'The user account associated with this token could not be found.' });
      }

      const hashedNewPassword = await bcryptjs.hash(password, 10);
      await Db.updateUserPassword(user.id, hashedNewPassword);
      await Db.markPasswordResetTokenUsed(token);

      res.status(200).json({
        success: true,
        message: 'Your password has been reset successfully. You may now log in.'
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to complete password reset.' });
    }
  });

  // Helper to run trash auto purge based on retention policy
  async function runTrashAutoPurge(userId: string) {
    try {
      const user = await Db.findUserById(userId);
      if (!user) return;

      const retentionDays = user.trashRetentionDays !== undefined ? user.trashRetentionDays : 30;
      if (retentionDays <= 0) return; // disabled auto-purging

      const files = await Db.getFilesByUserId(userId);
      const trashedFiles = files.filter(f => f.isTrashed);

      const now = new Date();
      const purgeTimeLimit = retentionDays * 24 * 60 * 60 * 1000;

      for (const file of trashedFiles) {
        if (file.trashedAt) {
          const trashedDate = new Date(file.trashedAt);
          const age = now.getTime() - trashedDate.getTime();
          if (age >= purgeTimeLimit) {
            console.log(`Auto-purging file from trash: ${file.name} (age: ${Math.round(age / (1000 * 60 * 60 * 24))} days, policy: ${retentionDays} days)`);
            
            await Db.deleteFile(file.id, userId);
            try {
              await Storage.deleteFile(file.url, file.cloudinaryPublicId);
            } catch (storageError) {
              console.error(`Failed to delete storage asset for auto-purged file ${file.name}:`, storageError);
            }

            const logId = 'log_' + Math.random().toString(36).substr(2, 9);
            await Db.createActivityLog({
              id: logId,
              userId,
              action: 'delete',
              details: `Auto-purged "${file.name}" from trash (retention policy of ${retentionDays} days expired)`,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in runTrashAutoPurge:', error);
    }
  }

  // Files: Fetch user file vault
  app.get('/api/files', authenticateToken, async (req: any, res: any) => {
    try {
      // Run trash auto-purge based on retention policy
      await runTrashAutoPurge(req.user.id);

      const files = await Db.getFilesByUserId(req.user.id);
      res.status(200).json({ success: true, data: files });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve uploaded files.' });
    }
  });

  // Files: Create/Upload File
  app.post('/api/files', authenticateToken, upload.single('file'), async (req: any, res: any) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file included in request.' });
      }

      // Run adaptive cloud or local storage upload mapping
      const uploadResult = await Storage.uploadFile(file.path, file.originalname);

      // Save database layout representation
      const folderId = req.body.folderId || null;
      const fileId = 'file_' + Math.random().toString(36).substr(2, 9);
      const newFileEntry = {
        id: fileId,
        userId: req.user.id,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        url: uploadResult.url,
        cloudinaryPublicId: uploadResult.publicId,
        createdAt: new Date().toISOString(),
        folderId: folderId
      };

      await Db.createFile(newFileEntry);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'upload',
        details: `Uploaded file "${file.originalname}"`,
        timestamp: new Date().toISOString()
      });

      res.status(201).json({
        success: true,
        data: newFileEntry
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to process file upload.' });
    }
  });

  // Files: Delete (Move to Trash) File
  app.delete('/api/files/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const file = await Db.trashFile(id, req.user.id);

      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found or permission denied.' });
      }

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'delete',
        details: `Moved file "${file.name}" to trash`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'File successfully moved to trash.', data: file });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to move file to trash.' });
    }
  });

  // Files: Bulk Delete (Move to Trash) Files
  app.post('/api/files/bulk-delete', authenticateToken, async (req: any, res: any) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Please provide an array of file IDs to delete.' });
      }

      const trashedIds: string[] = [];
      const trashedNames: string[] = [];

      for (const id of ids) {
        const file = await Db.trashFile(id, req.user.id);
        if (file) {
          trashedIds.push(id);
          trashedNames.push(file.name);
        }
      }

      if (trashedNames.length > 0) {
        const logId = 'log_' + Math.random().toString(36).substr(2, 9);
        await Db.createActivityLog({
          id: logId,
          userId: req.user.id,
          action: 'bulk_delete',
          details: `Moved ${trashedNames.length} file(s) to trash: ${trashedNames.map(name => `"${name}"`).join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ 
        success: true, 
        message: `Successfully moved ${trashedIds.length} file(s) to trash.`,
        data: { deletedIds: trashedIds }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to execute bulk delete.' });
    }
  });

  // Files: Restore File from Trash
  app.post('/api/files/:id/restore', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const file = await Db.restoreFile(id, req.user.id);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found or permission denied.' });
      }

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'rename',
        details: `Restored file "${file.name}" from trash`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'File successfully restored from trash.', data: file });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to restore file.' });
    }
  });

  // Files: Permanent Purge File
  app.delete('/api/files/:id/purge', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const userIdConstraint = req.user.role === 'admin' ? undefined : req.user.id;
      const file = await Db.deleteFile(id, userIdConstraint);

      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found or permission denied.' });
      }

      // Safely delete from Storage (Cloudinary/Local)
      await Storage.deleteFile(file.url, file.cloudinaryPublicId);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'delete',
        details: `Permanently purged file "${file.name}" from trash`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'File permanently purged from vault storage.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to purge file.' });
    }
  });

  // Files: Empty Trash (Purge all user's trashed files)
  app.post('/api/files/trash/clear', authenticateToken, async (req: any, res: any) => {
    try {
      const files = await Db.getFilesByUserId(req.user.id);
      const trashedFiles = files.filter(f => f.isTrashed);

      let clearedCount = 0;
      for (const file of trashedFiles) {
        const deletedFile = await Db.deleteFile(file.id, req.user.id);
        if (deletedFile) {
          clearedCount++;
          await Storage.deleteFile(file.url, file.cloudinaryPublicId);
        }
      }

      if (clearedCount > 0) {
        // Create activity log
        const logId = 'log_' + Math.random().toString(36).substr(2, 9);
        await Db.createActivityLog({
          id: logId,
          userId: req.user.id,
          action: 'delete',
          details: `Cleared trash: Permanently purged ${clearedCount} file(s)`,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: `Successfully cleared ${clearedCount} file(s) from trash.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to clear trash.' });
    }
  });

  // Settings: Update Trash Retention Policy
  app.post('/api/users/settings/trash-retention', authenticateToken, async (req: any, res: any) => {
    try {
      const { days } = req.body;
      if (days === undefined || typeof days !== 'number' || days < 0) {
        return res.status(400).json({ success: false, error: 'Please specify a valid number of days (at least 0).' });
      }

      await Db.updateUserTrashRetention(req.user.id, days);

      res.status(200).json({ success: true, message: `Trash retention policy successfully updated to ${days} days.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to update trash retention policy.' });
    }
  });

  // Settings: Update User Profile & Preferences
  app.patch('/api/users/profile', authenticateToken, async (req: any, res: any) => {
    try {
      const { name, email, preferences } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Name field cannot be left blank.' });
      }
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ success: false, error: 'Email field cannot be left blank.' });
      }

      const searchEmail = email.toLowerCase().trim();
      if (searchEmail !== req.user.email.toLowerCase()) {
        const emailExists = await Db.findUserByEmail(searchEmail);
        if (emailExists) {
          return res.status(400).json({ success: false, error: 'Email belongs to another registered account.' });
        }
      }

      await Db.updateUserProfile(req.user.id, name.trim(), searchEmail, preferences);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'rename',
        details: `Updated personal profile details: name="${name.trim()}" email="${searchEmail}"`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ 
        success: true, 
        message: 'Profile information & preferences updated successfully.' 
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to update user profile.' });
    }
  });

  // Settings: Change Password
  app.post('/api/users/change-password', authenticateToken, async (req: any, res: any) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Please specify both current and new password.' });
      }

      // Find user with password to match bcrypt
      const userAndPass = await Db.findUserByEmail(req.user.email);
      if (!userAndPass) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }

      const isMatch = await bcryptjs.compare(currentPassword, userAndPass.password || '');
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Your current password was entered incorrectly.' });
      }

      const hashedPassword = await bcryptjs.hash(newPassword, 10);
      await Db.updateUserPassword(req.user.id, hashedPassword);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'rename',
        details: 'Secured account: Password updated successfully',
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'Password changed successfully.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to update password.' });
    }
  });

  // Files: Download Selected Files as ZIP Archive
  app.post('/api/files/download-zip', authenticateToken, async (req: any, res: any) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Please specify the file IDs to download.' });
      }

      const userFiles = await Db.getFilesByUserId(req.user.id);
      const selectedFiles = userFiles.filter(f => ids.includes(f.id));

      if (selectedFiles.length === 0) {
        return res.status(404).json({ success: false, error: 'None of the selected files were found under your account.' });
      }

      const zip = new JSZip();
      const downloadedNames: string[] = [];

      for (const file of selectedFiles) {
        try {
          let fileData: Buffer;
          const isLocal = !file.url.startsWith('http') || file.url.includes('localhost') || file.url.includes('127.0.0.1') || file.url.includes('/uploads/');
          
          if (isLocal) {
            const filename = path.basename(file.url);
            const localPath = path.join(process.cwd(), 'data', 'uploads', filename);
            if (fs.existsSync(localPath)) {
              fileData = fs.readFileSync(localPath);
            } else {
              const fetchUrl = file.url.startsWith('http') ? file.url : `http://localhost:${PORT}${file.url}`;
              const resp = await fetch(fetchUrl);
              if (!resp.ok) throw new Error('Local asset lookup returned non-OK status');
              const arrayBuffer = await resp.arrayBuffer();
              fileData = Buffer.from(arrayBuffer);
            }
          } else {
            const resp = await fetch(file.url);
            if (!resp.ok) throw new Error(`Cloud storage fetch failed with status ${resp.status}`);
            const arrayBuffer = await resp.arrayBuffer();
            fileData = Buffer.from(arrayBuffer);
          }

          // Use the file name inside the ZIP
          zip.file(file.name, fileData);
          downloadedNames.push(file.name);
        } catch (fileError: any) {
          console.warn(`Could not bundle file "${file.name}" in ZIP:`, fileError.message || fileError);
        }
      }

      if (downloadedNames.length === 0) {
        return res.status(404).json({ success: false, error: 'Failed to package any of the selected files.' });
      }

      // Generate activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'download',
        details: `Downloaded ${downloadedNames.length} file(s) as ZIP: ${downloadedNames.map(n => `"${n}"`).join(', ')}`,
        timestamp: new Date().toISOString()
      });

      const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="privatevault_archive_${Date.now()}.zip"`);
      res.send(zipContent);

    } catch (e: any) {
      console.error('ZIP generation error:', e);
      res.status(500).json({ success: false, error: e.message || 'Failed to assemble ZIP archive.' });
    }
  });

  // Files: Rename File
  app.patch('/api/files/:id/rename', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'Please provide a valid file name.' });
      }

      const files = await Db.getFilesByUserId(req.user.id);
      const oldFile = files.find(f => f.id === id);
      const oldName = oldFile ? oldFile.name : 'Unknown';

      const userIdConstraint = req.user.role === 'admin' ? undefined : req.user.id;
      const updatedFile = await Db.updateFileName(id, name.trim(), userIdConstraint);

      if (!updatedFile) {
        return res.status(404).json({ success: false, error: 'File not found or permission denied.' });
      }

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'rename',
        details: `Renamed file from "${oldName}" to "${name.trim()}"`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'File successfully renamed.', data: updatedFile });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to rename file.' });
    }
  });

  // --- FOLDERS ENDPOINTS ---

  // Folders: Fetch user folders
  app.get('/api/folders', authenticateToken, async (req: any, res: any) => {
    try {
      const folders = await Db.getFoldersByUserId(req.user.id);
      res.status(200).json({ success: true, data: folders });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve folders.' });
    }
  });

  // Folders: Create a new Folder
  app.post('/api/folders', authenticateToken, async (req: any, res: any) => {
    try {
      const { name, parentId } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Please provide a valid folder name.' });
      }

      const folderId = 'folder_' + Math.random().toString(36).substr(2, 9);
      const newFolder = {
        id: folderId,
        userId: req.user.id,
        name: name.trim(),
        parentId: parentId || null,
        createdAt: new Date().toISOString()
      };

      await Db.createFolder(newFolder);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'upload', // Keep in line with defined schema actions or details for robust logging compatibility
        details: `Created folder "${name.trim()}"`,
        timestamp: new Date().toISOString()
      });

      res.status(201).json({ success: true, data: newFolder });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to create folder.' });
    }
  });

  // Folders: Rename Folder
  app.patch('/api/folders/:id/rename', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Please provide a valid folder name.' });
      }

      const updated = await Db.updateFolderName(id, name.trim(), req.user.id);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Folder not found or permission denied.' });
      }

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'rename',
        details: `Renamed folder to "${name.trim()}"`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to rename folder.' });
    }
  });

  // Folders: Move Folder (Nested Folders Support)
  app.patch('/api/folders/:id/move', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { parentId } = req.body; // string or null

      const updated = await Db.moveFolder(id, parentId || null, req.user.id);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Folder move operation unsuccessful.' });
      }

      res.status(200).json({ success: true, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to move folder.' });
    }
  });

  // Files: Move File into Folder
  app.patch('/api/files/:id/move', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { folderId } = req.body; // string or null

      const updated = await Db.moveFile(id, folderId || null, req.user.id);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'File move operation unsuccessful.' });
      }

      res.status(200).json({ success: true, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to move file.' });
    }
  });

  // Folders: Delete Folder (with safety raise-to-parent)
  app.delete('/api/folders/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;

      const folders = await Db.getFoldersByUserId(req.user.id);
      const targetFolder = folders.find(f => f.id === id);

      if (!targetFolder) {
        return res.status(404).json({ success: false, error: 'Folder not found or permission denied.' });
      }

      const pId = targetFolder.parentId || null;

      // Safe raise: Let's find all subfolders and move them up
      if (Db.isUsingMongo()) {
        const FolderModelInMongoose = mongoose.model('Folder');
        const FileModelInMongoose = mongoose.model('File');
        await FolderModelInMongoose.updateMany({ parentId: id, userId: req.user.id }, { parentId: pId });
        await FileModelInMongoose.updateMany({ folderId: id, userId: req.user.id }, { folderId: pId });
      } else {
        const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'db.json'), 'utf-8');
        const data = JSON.parse(raw);
        
        data.folders = (data.folders || []).map((f: any) => {
          if (f.parentId === id && f.userId === req.user.id) {
            return { ...f, parentId: pId };
          }
          return f;
        });

        data.files = (data.files || []).map((f: any) => {
          if (f.folderId === id && f.userId === req.user.id) {
            return { ...f, folderId: pId };
          }
          return f;
        });

        fs.writeFileSync(path.join(process.cwd(), 'data', 'db.json'), JSON.stringify(data, null, 2));
      }

      await Db.deleteFolder(id, req.user.id);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'delete',
        details: `Deleted folder "${targetFolder.name}" (contents raised up)`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'Folder successfully deleted.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to delete folder.' });
    }
  });

  // --- SECURE PUBLIC SHARED LINKS ENDPOINTS ---

  // Shares: Generate a secure shared link
  app.post('/api/shares', authenticateToken, async (req: any, res: any) => {
    try {
      const { fileIds, expiresAt, viewsLimit, password } = req.body;
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Please specify the file IDs to share.' });
      }

      // Verify the files belong to the user
      const userFiles = await Db.getFilesByUserId(req.user.id);
      const ownedFileIds = userFiles.map(f => f.id);
      const invalidFiles = fileIds.filter(id => !ownedFileIds.includes(id));
      
      if (invalidFiles.length > 0) {
        return res.status(403).json({ success: false, error: 'Authorization denied. You do not own some of selected files.' });
      }

      const shareId = 'share_' + Math.random().toString(36).substr(2, 9);
      const newShare = {
        id: shareId,
        userId: req.user.id,
        fileIds,
        expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // fallback to 24h
        createdAt: new Date().toISOString(),
        viewsCount: 0,
        viewsLimit: viewsLimit ? parseInt(viewsLimit, 10) : null,
        password: password && password.trim() ? password.trim() : null
      };

      await Db.createSharedLink(newShare);

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'download',
        details: `Created secure public share link "${shareId}" with ${fileIds.length} files`,
        timestamp: new Date().toISOString()
      });

      res.status(201).json({ success: true, data: newShare });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to generate secure shared link.' });
    }
  });

  // Shares: Fetch current user's shared links
  app.get('/api/shares', authenticateToken, async (req: any, res: any) => {
    try {
      const links = await Db.getSharedLinksByUserId(req.user.id);
      res.status(200).json({ success: true, data: links });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve shared links.' });
    }
  });

  // Shares: Delete/Revoke a shared link
  app.delete('/api/shares/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const deleted = await Db.deleteSharedLink(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Shared link not found or permission denied.' });
      }

      // Create activity log
      const logId = 'log_' + Math.random().toString(36).substr(2, 9);
      await Db.createActivityLog({
        id: logId,
        userId: req.user.id,
        action: 'delete',
        details: `Revoked secure shared link "${id}"`,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ success: true, message: 'Shared link successfully revoked.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to revoke shared link.' });
    }
  });

  // Public shares: Fetch public metadata details
  const getPublicShareDetails = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { password } = req.body || {};

      const share = await Db.getSharedLinkById(id);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Shared link not found or has been revoked by owner.' });
      }

      // Check expiration
      if (new Date() > new Date(share.expiresAt)) {
        return res.status(410).json({ success: false, error: 'This secure shared link has expired.' });
      }

      // Check views limits
      if (share.viewsLimit !== null && share.viewsCount >= share.viewsLimit) {
        return res.status(410).json({ success: false, error: 'This shared link has reached its maximum download limit.' });
      }

      const isPasswordProtected = !!share.password;
      const isPasswordCorrect = !isPasswordProtected || (password && password.trim() === share.password);

      if (isPasswordProtected && !isPasswordCorrect) {
        return res.status(200).json({
          success: true,
          data: {
            id: share.id,
            createdAt: share.createdAt,
            expiresAt: share.expiresAt,
            viewsLimit: share.viewsLimit,
            viewsCount: share.viewsCount,
            isPasswordProtected: true,
            requiresVerification: true,
            files: []
          }
        });
      }

      // Resolve files associated with this link
      const allFiles = await Db.getAllFiles();
      const files = allFiles.filter(f => share.fileIds.includes(f.id));

      return res.status(200).json({
        success: true,
        data: {
          id: share.id,
          createdAt: share.createdAt,
          expiresAt: share.expiresAt,
          viewsLimit: share.viewsLimit,
          viewsCount: share.viewsCount,
          isPasswordProtected,
          requiresVerification: false,
          files: files.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            mimeType: f.mimeType,
            createdAt: f.createdAt
          }))
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to process shared link query.' });
    }
  };

  app.get('/api/public/shares/:id', getPublicShareDetails);
  app.post('/api/public/shares/:id', getPublicShareDetails);

  // Public share download: Retrieve file content individually
  const processPublicDownload = async (req: any, res: any) => {
    try {
      const { id, fileId } = req.params;
      const password = req.query.password || req.body?.password || '';

      const share = await Db.getSharedLinkById(id);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Shared link not found or has been revoked.' });
      }

      // Check expiration
      if (new Date() > new Date(share.expiresAt)) {
        return res.status(410).json({ success: false, error: 'This download link has expired.' });
      }

      // Check views limits
      if (share.viewsLimit !== null && share.viewsCount >= share.viewsLimit) {
        return res.status(410).json({ success: false, error: 'This shared link has reached its maximum download limit.' });
      }

      // Check password
      const isPasswordProtected = !!share.password;
      const isPasswordCorrect = !isPasswordProtected || (password && password.trim() === share.password);

      if (isPasswordProtected && !isPasswordCorrect) {
        return res.status(403).json({ success: false, error: 'Incorrect password. Access denied.' });
      }

      // Check if file is part of this share link
      if (!share.fileIds.includes(fileId)) {
        return res.status(404).json({ success: false, error: 'Requested file is not part of this shared bundle.' });
      }

      // Get file details
      const allFiles = await Db.getAllFiles();
      const file = allFiles.find(f => f.id === fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File resource could not be found.' });
      }

      // Increment views count
      await Db.incrementSharedLinkViews(share.id);

      // Stream the file back
      let fileData: Buffer;
      const isLocal = !file.url.startsWith('http') || file.url.includes('localhost') || file.url.includes('127.0.0.1') || file.url.includes('/uploads/');
      
      if (isLocal) {
        const filename = path.basename(file.url);
        const localPath = path.join(process.cwd(), 'data', 'uploads', filename);
        if (fs.existsSync(localPath)) {
          fileData = fs.readFileSync(localPath);
        } else {
          const fetchUrl = file.url.startsWith('http') ? file.url : `http://localhost:${PORT}${file.url}`;
          const resp = await fetch(fetchUrl);
          if (!resp.ok) throw new Error('Local asset file lookup failed');
          const arrayBuffer = await resp.arrayBuffer();
          fileData = Buffer.from(arrayBuffer);
        }
      } else {
        const resp = await fetch(file.url);
        if (!resp.ok) throw new Error(`Cloud asset lookup failed with status ${resp.status}`);
        const arrayBuffer = await resp.arrayBuffer();
        fileData = Buffer.from(arrayBuffer);
      }

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.send(fileData);

    } catch (e: any) {
      console.error('Public download error:', e);
      res.status(500).json({ success: false, error: 'Failed to secure and retrieve file data.' });
    }
  };

  app.get('/api/public/shares/:id/download/:fileId', processPublicDownload);
  app.post('/api/public/shares/:id/download/:fileId', processPublicDownload);

  // Public zip download: Packages all shared files into a single bundle
  const processPublicZipDownload = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const password = req.query.password || req.body?.password || '';

      const share = await Db.getSharedLinkById(id);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Shared link not found or has been revoked.' });
      }

      // Check expiration
      if (new Date() > new Date(share.expiresAt)) {
        return res.status(410).json({ success: false, error: 'This shared link has expired.' });
      }

      // Check views limit
      if (share.viewsLimit !== null && share.viewsCount >= share.viewsLimit) {
        return res.status(410).json({ success: false, error: 'This shared link has reached its maximum download limit.' });
      }

      // Check password
      const isPasswordProtected = !!share.password;
      const isPasswordCorrect = !isPasswordProtected || (password && password.trim() === share.password);

      if (isPasswordProtected && !isPasswordCorrect) {
        return res.status(403).json({ success: false, error: 'Incorrect password. Access denied.' });
      }

      // Get files
      const allFiles = await Db.getAllFiles();
      const files = allFiles.filter(f => share.fileIds.includes(f.id));

      if (files.length === 0) {
        return res.status(404).json({ success: false, error: 'No files were found in this shared bundle.' });
      }

      // Increment views count
      await Db.incrementSharedLinkViews(share.id);

      const zip = new JSZip();
      const downloadedNames: string[] = [];

      for (const file of files) {
        try {
          let fileData: Buffer;
          const isLocal = !file.url.startsWith('http') || file.url.includes('localhost') || file.url.includes('127.0.0.1') || file.url.includes('/uploads/');
          
          if (isLocal) {
            const filename = path.basename(file.url);
            const localPath = path.join(process.cwd(), 'data', 'uploads', filename);
            if (fs.existsSync(localPath)) {
              fileData = fs.readFileSync(localPath);
            } else {
              const fetchUrl = file.url.startsWith('http') ? file.url : `http://localhost:${PORT}${file.url}`;
              const resp = await fetch(fetchUrl);
              if (!resp.ok) throw new Error('Local asset lookup returned non-OK status');
              const arrayBuffer = await resp.arrayBuffer();
              fileData = Buffer.from(arrayBuffer);
            }
          } else {
            const resp = await fetch(file.url);
            if (!resp.ok) throw new Error(`Cloud storage fetch failed with status ${resp.status}`);
            const arrayBuffer = await resp.arrayBuffer();
            fileData = Buffer.from(arrayBuffer);
          }

          zip.file(file.name, fileData);
          downloadedNames.push(file.name);
        } catch (fileError: any) {
          console.warn(`Could not bundle file "${file.name}" in ZIP:`, fileError.message || fileError);
        }
      }

      if (downloadedNames.length === 0) {
        return res.status(404).json({ success: false, error: 'Failed to package any of the selected files.' });
      }

      const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="shared_privatevault_${id}.zip"`);
      res.send(zipContent);

    } catch (e: any) {
      console.error('ZIP generation error:', e);
      res.status(500).json({ success: false, error: 'Failed to assemble ZIP archive.' });
    }
  };

  app.get('/api/public/shares/:id/download-zip', processPublicZipDownload);
  app.post('/api/public/shares/:id/download-zip', processPublicZipDownload);

  // Activity Logs: Retrieve recent logs
  app.get('/api/activity-logs', authenticateToken, async (req: any, res: any) => {
    try {
      const logs = await Db.getActivityLogsByUserId(req.user.id);
      res.status(200).json({ success: true, data: logs });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve activity log history.' });
    }
  });

  // --- DEV & API KEYS MANAGEMENT ---

  // Developer Keys: Fetch
  app.get('/api/developer/keys', authenticateToken, async (req: any, res: any) => {
    try {
      const keys = await Db.getApiKeysByUserId(req.user.id);
      res.status(200).json({ success: true, data: keys });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve programmer keys.' });
    }
  });

  // Developer Keys: Create
  app.post('/api/developer/keys', authenticateToken, async (req: any, res: any) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Please specify an identification name for this key.' });
      }

      // Generate secure high-entropy API key
      const randomSegment = Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
      const secretKey = `vault_live_${randomSegment}`;
      const keyId = 'key_' + Math.random().toString(36).substring(2, 11);

      const newKey = await Db.createApiKey({
        id: keyId,
        userId: req.user.id,
        name: name.trim(),
        secretKey,
        createdAt: new Date().toISOString()
      });

      res.status(201).json({ success: true, data: newKey });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to create developer access key.' });
    }
  });

  // Developer Keys: Revoke
  app.delete('/api/developer/keys/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const success = await Db.deleteApiKey(id, req.user.id);
      if (success) {
        res.status(200).json({ success: true, message: 'Developer key successfully revoked from private system.' });
      } else {
        res.status(404).json({ success: false, error: 'API key not found under your active user account.' });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to revoke key.' });
    }
  });

  // --- SMART AI FILE SCANNING AND ANALYSIS ---

  // Files: Analyze File via Gemini API
  app.post('/api/files/:id/analyze', authenticateToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const userIdConstraint = req.user.role === 'admin' ? undefined : req.user.id;

      // Get file from DB
      const files = await Db.getFilesByUserId(userIdConstraint || req.user.id);
      const file = files.find(f => f.id === id);

      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found, or you lack access permission.' });
      }

      // Fetch the existing user folders to recommend folder classification
      const userFolders = await Db.getFoldersByUserId(file.userId);
      const foldersList = userFolders.map(f => ({ id: f.id, name: f.name }));

      let aiResult: any = null;

      // Check key existence
      if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY is not defined in environments. Launching adaptive smart simulated file scanner...');
        
        // Custom smart local simulation adaptive to file attributes
        const isSuspiciousName = /passwords?|keys?|credentials?|secrets?|admin|database|db|config/i.test(file.name);
        const codeSuffixes = ['.json', '.js', '.ts', '.env', '.yml', '.yaml', '.py', '.rb'];
        const isCodeSuffix = codeSuffixes.some(s => file.name.toLowerCase().endsWith(s));

        let category = 'Document';
        if (file.mimeType.startsWith('image/')) category = 'Image';
        else if (isCodeSuffix || file.mimeType.includes('json') || file.mimeType.includes('javascript')) category = 'SourceCode';
        else if (file.mimeType === 'application/pdf') category = 'LegalBrief';

        let tags = ['VaultFile', category, 'AutoAnalyzed'];
        if (file.size > 1024 * 1024) tags.push('LargeFile');
        else tags.push('Compact');

        let sensitiveDataDetected = isSuspiciousName || file.name.endsWith('.env');
        let securityClassification: 'Secure' | 'Warning' | 'Critical' = 'Secure';
        let summary = `This file is cataloged under ${category} formatting and holds a payload of ${file.name}.`;

        if (sensitiveDataDetected) {
          securityClassification = 'Critical';
          summary += ' WARNING: High-entropy raw credentials or naming structures that risk leak exposure have been flagged.';
        } else if (file.name.includes('log') || file.size > 5 * 1024 * 1024) {
          securityClassification = 'Warning';
          summary += ' Notice: File carries high metadata density, verify access parameters.';
        } else {
          summary += ' Secure file signature validated with no immediate security liabilities detected.';
        }

        // Propose simulated folder categories
        let suggestedFolder: any = null;
        const lowercaseCategory = category.toLowerCase();
        const matchedFolder = userFolders.find(f => {
          const fn = f.name.toLowerCase();
          return fn === lowercaseCategory || fn.includes(lowercaseCategory) || lowercaseCategory.includes(fn);
        });

        if (matchedFolder) {
          suggestedFolder = {
            id: matchedFolder.id,
            name: matchedFolder.name,
            isNew: false,
            reasoning: `Found existing folder "${matchedFolder.name}" which perfectly aligns with ${category} files.`
          };
        } else {
          suggestedFolder = {
            id: null,
            name: category === 'Image' ? 'Images' : category === 'SourceCode' ? 'Source Code' : category === 'LegalBrief' ? 'Legal and Documents' : 'My Documents',
            isNew: true,
            reasoning: `No matching organizational directory exists yet. Recommending creation of a dedicated folders layout.`
          };
        }

        aiResult = {
          summary,
          tags,
          sensitiveDataDetected,
          securityClassification,
          category,
          suggestedFolder,
          analyzedAt: new Date().toISOString()
        };
      } else {
        // Real Gemini Content Retrieval and Scanning
        const client = getGeminiClient();

        // Load content of file to check
        let sampleContent = `File Name: ${file.name}\nMIME Type: ${file.mimeType}\nSize: ${file.size} bytes\nCreated: ${file.createdAt}`;
        
        try {
          const filename = path.basename(file.url);
          const localPath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(localPath)) {
            const mime = (file.mimeType || '').toLowerCase();
            const textExtensions = ['.txt', '.json', '.js', '.ts', '.html', '.css', '.md', '.env', '.ini', '.csv', '.xml', '.yaml', '.yml'];
            const isTextType = mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
            
            if (isTextType) {
              const text = fs.readFileSync(localPath, 'utf8');
              sampleContent = `[File Contents - First 15,000 characters]\n${text.slice(0, 15000)}\n[End of contents]\n\nFile Info:\nName: ${file.name}\nMIME: ${file.mimeType}`;
            }
          }
        } catch (readErr) {
          console.warn('Failed to fetch full local file bytes, analyzing meta instead:', readErr);
        }

        const prompt = `Analyze this stored file's metadata and contents. Detect sensitive data exposures like passwords, API secrets, database credentials, ssh keys, or personal identifiers.
Suggest organization tags & folder placement for this file.
Here is the list of existing folders for this user's vault: ${JSON.stringify(foldersList)}.
If one of these existing folders matches and is a good fit, recommend it (set id to its folder id, name to folder name, isNew to false, and give a 1-sentence reasoning).
If none of the existing folders are a good match, suggest a new suitable folder name to create (set id to null, name to the suitable folder name like "Invoices", "Credentials", "Images", "Source Code", or similar, set isNew to true, and provide a 1-sentence reasoning).

Return a structured output representing:
1. summary: A professional 2-sentence summary of what this file is and its core purpose.
2. tags: 3 to 5 key semantic tag words related to this file.
3. sensitiveDataDetected: boolean indicating if passwords, secrets, keys, or leak signs are detected.
4. securityClassification: 'Secure' if clean, 'Warning' if it contains sensitive references but no direct private keys/secrets, 'Critical' if plain passwords, API keys, or security vulnerabilities are explicitly containing.
5. category: One-word category like SourceCode, Log, System, Document, Account, Finance, Image, Media.
6. suggestedFolder: An object representing the folder placement recommendation:
   - id: string or null
   - name: string
   - isNew: boolean
   - reasoning: string (brief explanation under 1 sentence)

Payload content or metadata:
${sampleContent}`;

        const geminiResponse = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: '2-sentence brief summarizing file content/use case' },
                tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3 to 5 smart, clean keywords' },
                sensitiveDataDetected: { type: Type.BOOLEAN, description: 'True if direct credentials, access keys, private files, or passwords exist' },
                securityClassification: { type: Type.STRING, enum: ['Secure', 'Warning', 'Critical'], description: 'Risk categorization' },
                category: { type: Type.STRING, description: 'One word category representing the material type' },
                suggestedFolder: {
                  type: Type.OBJECT,
                  description: 'Folder layout recommendation parameters',
                  properties: {
                    id: { type: Type.STRING, description: 'Existing Folder ID matched or null' },
                    name: { type: Type.STRING, description: 'Folder Name suggested' },
                    isNew: { type: Type.BOOLEAN, description: 'Whether a new folder is recommended to be created' },
                    reasoning: { type: Type.STRING, description: 'Explanation reasoning' }
                  },
                  required: ['id', 'name', 'isNew', 'reasoning']
                }
              },
              required: ['summary', 'tags', 'sensitiveDataDetected', 'securityClassification', 'category', 'suggestedFolder']
            }
          }
        });

        const rawText = geminiResponse.text;
        if (!rawText) throw new Error('Empty intelligence reply from Gemini SDK.');

        const responseObj = JSON.parse(rawText.trim());
        aiResult = {
          summary: responseObj.summary,
          tags: responseObj.tags || [],
          sensitiveDataDetected: !!responseObj.sensitiveDataDetected,
          securityClassification: responseObj.securityClassification || 'Secure',
          category: responseObj.category || 'Document',
          suggestedFolder: responseObj.suggestedFolder ? {
            id: responseObj.suggestedFolder.id || null,
            name: responseObj.suggestedFolder.name,
            isNew: !!responseObj.suggestedFolder.isNew,
            reasoning: responseObj.suggestedFolder.reasoning
          } : null,
          analyzedAt: new Date().toISOString()
        };
      }

      // Save to Database
      const updatedFile = await Db.saveAiAnalysis(id, aiResult, userIdConstraint);

      if (!updatedFile) {
        return res.status(404).json({ success: false, error: 'Failed to record AI metadata analysis.' });
      }

      res.status(200).json({ success: true, message: 'AI Scanner complete.', data: updatedFile });
    } catch (e: any) {
      console.error('AI SCAN ERROR:', e);
      res.status(500).json({ success: false, error: e.message || 'AI scanner extraction fail.' });
    }
  });

  // --- PROGRAMMATIC EXTERNAL DEVELOPER API ---

  // Middleware: Authenticate Dev Key
  const authenticateApiKey = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
      let apiKeyStr = authHeader;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKeyStr = authHeader.split(' ')[1];
      }

      if (!apiKeyStr) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing secret developer Key in x-api-key or Authorization header.' });
      }

      const keyObj = await Db.findApiKeyByKey(apiKeyStr);
      if (!keyObj) {
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid, disabled, or revoked API Key.' });
      }

      const user = await Db.findUserById(keyObj.userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Associated user account could not be found.' });
      }

      req.user = user;
      next();
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Internal API key system error.' });
    }
  };

  // External API: Get stored records
  app.get('/api/external/files', authenticateApiKey, async (req: any, res: any) => {
    try {
      const files = await Db.getFilesByUserId(req.user.id);
      res.status(200).json({
        success: true,
        count: files.length,
        developer: { name: req.user.name, email: req.user.email },
        data: files.map(f => ({
          fileId: f.id,
          name: f.name,
          byteSize: f.size,
          mimeType: f.mimeType,
          downloadUrl: f.url,
          uploadedAt: f.createdAt,
          aiAnalysis: f.aiAnalysis
        }))
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to extract program files.' });
    }
  });

  // External API: Get individual metadata
  app.get('/api/external/files/:id', authenticateApiKey, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const files = await Db.getFilesByUserId(req.user.id);
      const file = files.find(f => f.id === id);

      if (!file) {
        return res.status(404).json({ success: false, error: 'Metadata record not found.' });
      }

      res.status(200).json({
        success: true,
        data: {
          fileId: file.id,
          name: file.name,
          byteSize: file.size,
          mimeType: file.mimeType,
          downloadUrl: file.url,
          uploadedAt: file.createdAt,
          aiAnalysis: file.aiAnalysis
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Programmatic lookup failure.' });
    }
  });

  // External API: Programmatic Raw File Upload
  app.post('/api/external/files', authenticateApiKey, upload.single('file'), async (req: any, res: any) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Payload must contain a multipart form-data file parameter named "file".' });
      }

      const uploadResult = await Storage.uploadFile(file.path, file.originalname);
      const fileId = 'file_' + Math.random().toString(36).substr(2, 9);
      const newFileEntry = {
        id: fileId,
        userId: req.user.id,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        url: uploadResult.url,
        cloudinaryPublicId: uploadResult.publicId,
        createdAt: new Date().toISOString()
      };

      await Db.createFile(newFileEntry);

      res.status(201).json({
        success: true,
        message: 'Programmatic upload execution success.',
        data: {
          fileId: newFileEntry.id,
          name: newFileEntry.name,
          byteSize: newFileEntry.size,
          downloadUrl: newFileEntry.url,
          mimeType: newFileEntry.mimeType,
          uploadedAt: newFileEntry.createdAt
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Programmatic upload failing.' });
    }
  });

  // Admin Operations: Retrieve users list with file and activity stats
  app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const users = await Db.getAllUsers();
      const enrichedUsers = [];
      for (const u of users) {
        const userFiles = await Db.getFilesByUserId(u.id);
        const userLogs = await Db.getActivityLogsByUserId(u.id);
        
        enrichedUsers.push({
          ...u,
          fileCount: userFiles.length,
          totalSize: userFiles.reduce((sum, f) => sum + (f.size || 0), 0),
          activityCount: userLogs.length,
          lastActivity: userLogs.length > 0 ? userLogs[0].timestamp : null
        });
      }
      res.status(200).json({ success: true, data: enrichedUsers });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve register user accounts.' });
    }
  });

  // Admin Operations: Retrieve a specific user's folder/files and activity metadata
  app.get('/api/admin/users/:id/files', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const files = await Db.getFilesByUserId(id);
      const folders = await Db.getFoldersByUserId(id);
      const activityLogs = await Db.getActivityLogsByUserId(id);
      res.status(200).json({ success: true, data: { files, folders, activityLogs } });
    } catch (e: any) {
      res.status(550).json({ success: false, error: 'Failed to retrieve files for specified user.' });
    }
  });

  // Admin Operations: Elevate or degrade user role
  app.patch('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (role !== 'user' && role !== 'admin') {
        return res.status(400).json({ success: false, error: "Invalid role value. Must be 'user' or 'admin'." });
      }

      if (id === req.user.id) {
        return res.status(400).json({ success: false, error: 'You cannot alter your own admin permissions.' });
      }

      await Db.updateUserRole(id, role);
      res.status(200).json({ success: true, message: `User role successfully updated to ${role}.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to modify role status.' });
    }
  });

  // Admin Operations: Delete individual user accounts
  app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;

      if (id === req.user.id) {
        return res.status(400).json({ success: false, error: 'You are not allowed to delete your own primary account.' });
      }

      // Search and retrieve all associated files so we can clean cloud/disk storage too
      const userFiles = await Db.getFilesByUserId(id);
      for (const file of userFiles) {
        await Storage.deleteFile(file.url, file.cloudinaryPublicId);
      }

      // Delete user mapping inside database
      await Db.deleteUser(id);

      res.status(200).json({ success: true, message: 'User account and all their files successfully expunged.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to delete user mapping.' });
    }
  });

  // Admin Operations: Generate System Overall Metrics
  app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const allUsers = await Db.getAllUsers();
      const allFiles = await Db.getAllFiles();

      const totalStorageBytes = allFiles.reduce((acc, curr) => acc + curr.size, 0);

      res.status(200).json({
        success: true,
        data: {
          totalUsers: allUsers.length,
          totalFiles: allFiles.length,
          totalStorageBytes,
          isUsingMongo: Db.isUsingMongo(),
          isUsingCloudinary: Storage.isUsingCloudinary()
        }
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'Failed to generate metrics overview.' });
    }
  });

  // --- CLIENT SERVING ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PrivateVault Express Backend] listening on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Critical server system crash on startup:', err);
  process.exit(1);
});
