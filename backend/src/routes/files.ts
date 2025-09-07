import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// Rate limiting middleware removed to rely on upstream GitLab limits
import {
  asyncHandler,
  ValidationError,
  sendResponse,
} from '../middleware/errorHandler';
import { EnvConfig } from '../config/env';
import { createClient } from '@supabase/supabase-js';

// Minimal magic-byte sniffer for common image formats
function sniffImage(buffer: Buffer): { ext: string; mime: string } | null {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer as any as Uint8Array;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return { ext: 'png', mime: 'image/png' };
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { ext: 'jpg', mime: 'image/jpeg' };
  // GIF87a / GIF89a
  if (
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  )
    return { ext: 'gif', mime: 'image/gif' };
  // WebP: 'RIFF'....'WEBP'
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return { ext: 'webp', mime: 'image/webp' };
  // BMP: 'BM'
  if (b[0] === 0x42 && b[1] === 0x4d) return { ext: 'bmp', mime: 'image/bmp' };
  // TIFF: II*\0 or MM\0*
  if (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
  )
    return { ext: 'tif', mime: 'image/tiff' };
  // HEIC/HEIF: ftyp.... 'heic'/'heix'/'hevc'/'heif'
  if (
    b[4] === 0x66 &&
    b[5] === 0x74 &&
    b[6] === 0x79 &&
    b[7] === 0x70 &&
    b.length >= 12
  ) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (brand.startsWith('hei')) return { ext: 'heic', mime: 'image/heic' };
    if (brand === 'heif') return { ext: 'heif', mime: 'image/heif' };
  }
  return null;
}

const router = Router();

// Accept images (for pasted screenshots/attachments)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: EnvConfig.MAX_FILE_SIZE, // bytes
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Clipboard images may come through as application/octet-stream without a proper mimetype
    if (!file.mimetype || file.mimetype === 'application/octet-stream')
      return cb(null, true);
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

router.post(
  '/upload',
  authMiddleware.authenticate,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) throw new ValidationError('File is required');
    const purpose = String((req.body?.purpose as string) || 'attachment');
    if (!['screenshot', 'attachment'].includes(purpose)) {
      throw new ValidationError('Invalid purpose');
    }

    const subdir = 'screenshots';
    const id = randomUUID();

    const imageOctetBuffer = req.file.buffer;
    console.log('IMAGE BUFFTER', imageOctetBuffer);
    const transcodedImageBuffer = await sharp(imageOctetBuffer)
      .webp({ quality: 80 })
      .toBuffer();
    const fileName = `${id}.webp`;

    // If Supabase is configured, upload to Storage and return public URL
    if (EnvConfig.SUPABASE_URL && EnvConfig.SUPABASE_SERVICE_ROLE_KEY) {
      const client = createClient(
        EnvConfig.SUPABASE_URL,
        EnvConfig.SUPABASE_SERVICE_ROLE_KEY
      );
      const bucket = EnvConfig.SUPABASE_BUCKET;
      const pathInBucket = `${subdir}/${fileName}`;

      const { error: upErr } = await client.storage
        .from(bucket)
        .upload(pathInBucket, transcodedImageBuffer, {
          contentType: 'image/webp',
          upsert: false,
        });
      if (upErr) {
        // Fall back to local disk if upload fails
        const baseDir = path.resolve(EnvConfig.UPLOAD_PATH);
        const destDir = path.join(baseDir, subdir);
        await fs.mkdir(destDir, { recursive: true });
        const fullPath = path.join(destDir, fileName);
        await fs.writeFile(fullPath, req.file.buffer);
        const url = `/uploads/${subdir}/${fileName}`;
        return sendResponse(res, 200, true, 'File uploaded (local fallback)', {
          url,
          id,
          storage: 'local',
        });
      }

      const { data: pub } = client.storage
        .from(bucket)
        .getPublicUrl(pathInBucket);
      let url = pub?.publicUrl as string | undefined;
      if (!url) {
        const signed = await client.storage
          .from(bucket)
          .createSignedUrl(pathInBucket, 60 * 60 * 24 * 365); // 1 year
        url = (signed.data && (signed.data as any).signedUrl) || undefined;
      }
      return sendResponse(res, 200, true, 'File uploaded successfully', {
        url,
        id,
        storage: 'supabase',
      });
    }

    // Local disk fallback when Supabase not configured
    const baseDir = path.resolve(EnvConfig.UPLOAD_PATH);
    const destDir = path.join(baseDir, subdir);
    await fs.mkdir(destDir, { recursive: true });
    const fullPath = path.join(destDir, fileName);
    await fs.writeFile(fullPath, req.file.buffer);
    const url = `/uploads/${subdir}/${fileName}`;
    sendResponse(res, 200, true, 'File uploaded successfully', {
      url,
      id,
      storage: 'local',
    });
  })
);

export { router as filesRouter };
