import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const isCloudinaryConfigured = !!(
  CLOUDINARY_URL || 
  (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)
);

if (isCloudinaryConfigured) {
  try {
    if (CLOUDINARY_URL) {
      // Configuration automatically picked up from CLOUDINARY_URL env
    } else {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
      });
    }
    console.log('Cloudinary successfully initialized.');
  } catch (err) {
    console.warn('Failed to configure Cloudinary. Falling back to local storage.', err);
  }
} else {
  console.log('No Cloudinary credentials found. Using local static disk storage for uploads.');
}

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

export const Storage = {
  isUsingCloudinary: () => isCloudinaryConfigured,

  /**
   * Uploads a file (from multer disk storage) to either Cloudinary or keeps it local.
   * Returns the file location URL and optionally cloud identification metadata.
   */
  uploadFile: async (localFilePath: string, originalName: string): Promise<{ url: string; publicId?: string }> => {
    if (isCloudinaryConfigured) {
      try {
        const result = await cloudinary.uploader.upload(localFilePath, {
          folder: 'privatevault',
          resource_type: 'auto',
        });
        
        // Clean up the temporary local file uploaded by multer
        try {
          fs.unlinkSync(localFilePath);
        } catch (unlinkErr) {
          // Ignore
        }

        return {
          url: result.secure_url,
          publicId: result.public_id
        };
      } catch (err) {
        console.warn('Cloudinary upload failed, using local fallback:', err);
      }
    }

    // Fallback: move or keep the file in the public local uploads folder
    const fileExt = path.extname(originalName) || path.extname(localFilePath);
    const uniqueName = `${path.basename(localFilePath)}${fileExt}`;
    const destinationPath = path.join(UPLOADS_DIR, uniqueName);

    // Copy/Move to public static directory
    fs.renameSync(localFilePath, destinationPath);

    // Calculate a clean URL based on environment or host
    const appUrl = process.env.APP_URL || '';
    const cleanUrl = `${appUrl}/uploads/${uniqueName}`;

    return {
      url: cleanUrl,
    };
  },

  /**
   * Deletes a file from either Cloudinary or local disk
   */
  deleteFile: async (urlOrPath: string, publicId?: string) => {
    // If publicId belongs to Cloudinary
    if (isCloudinaryConfigured && publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
        return;
      } catch (err) {
        console.warn('Failed to delete file from Cloudinary:', err);
      }
    }

    // Fallback or double check: check if it's a local file in UPLOADS_DIR
    try {
      const filename = path.basename(urlOrPath);
      const localPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (err) {
      console.warn('Failed to delete file from local storage:', err);
    }
  }
};
