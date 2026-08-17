import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Uploads live in server/uploads/<yyyy-mm>/ — served statically by index.ts at /uploads
const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const monthDir = path.join(UPLOAD_ROOT, new Date().toISOString().slice(0, 7));
    fs.mkdirSync(monthDir, { recursive: true });
    cb(null, monthDir);
  },
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || 'bin';
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_MIMES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/**
 * POST /uploads  (multipart form, field "photos", up to 5 images)
 * Auth: bearer token (worker or family).
 * Returns relative public paths, e.g. { photos: ["/uploads/2026-08/xxx.jpg", ...] }
 */
router.post(
  '/',
  requireAuth,
  upload.array('photos', 5),
  (req: AuthRequest, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos provided (multipart field "photos")' });
    }
    res.json({
      photos: files.map((f) => `/uploads/${path.basename(path.dirname(f.path))}/${f.filename}`),
    });
  }
);

// Multer error handler — surface friendly messages for size/type violations
router.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(code).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  next();
});

export default router;
