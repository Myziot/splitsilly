import sharp = require('sharp');
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/receipts';
const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10); // 10MB
const MAX_DIMENSION = 1200;

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function compressImage(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  // Generate a safe filename
  const hash = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${hash}${ext}`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  // Process with sharp - resize to 1200px on longest side, convert to webp
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let processed = sharp(buffer);

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      processed = processed.resize(MAX_DIMENSION, null, { fit: 'inside', withoutEnlargement: true });
    } else {
      processed = processed.resize(null, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    }
  }

  const outputBuffer = await processed
    .webp({ quality: 80 })
    .toBuffer();

  fs.writeFileSync(outputPath, outputBuffer);

  // Return the site-absolute path for DB storage. The client renders
  // receipt_path verbatim as an href, and the static mount lives at
  // /uploads — a bare `receipts/...` would resolve against the SPA root
  // and hit the catch-all instead of the file.
  return `/uploads/receipts/${hash}.webp`;
}

export function validateImage(buffer: Buffer, originalName: string): string | null {
  // Check size
  if (buffer.length > MAX_SIZE) {
    return `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024}MB.`;
  }

  // Check extension
  const ext = path.extname(originalName).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  if (!allowedExts.includes(ext)) {
    return 'Invalid file type. Only images are allowed.';
  }

  return null;
}
