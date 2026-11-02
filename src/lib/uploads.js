import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { put, del, get } from '@vercel/blob';
import sharp from 'sharp';

// Nếu có BLOB_READ_WRITE_TOKEN (tự động có khi bật Vercel Blob trên dự án Vercel),
// dùng Vercel Blob để lưu file — cần thiết vì Vercel không có ổ đĩa bền vững.
// Nếu không có (chạy local, tự host VPS...), lưu thẳng vào đĩa như trước.
const isBlobMode = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// File riêng tư (báo cáo, công việc) khi lưu local: nằm ngoài /public.
export const PRIVATE_UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
// Ảnh đại diện khi lưu local: nằm trong /public để phục vụ trực tiếp qua URL tĩnh.
export const PUBLIC_UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'avatars');

const ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/plain',
];
const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AVATAR_SIZE = 3 * 1024 * 1024; // 3MB

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function isRemoteUrl(value) {
  return /^https?:\/\//.test(value || '');
}

/**
 * Lưu file đính kèm riêng tư (báo cáo/công việc).
 * subdir ví dụ: 'reports/12', 'tasks/7'
 * Trả về { storedPath, originalName, mimeType, size }.
 * storedPath là URL đầy đủ (chế độ Blob) hoặc đường dẫn tương đối (chế độ local).
 */
export async function savePrivateAttachment(file, subdir) {
  if (!ATTACHMENT_MIME_TYPES.includes(file.type)) {
    throw new Error(`Định dạng file "${file.name}" không được hỗ trợ`);
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File "${file.name}" vượt quá dung lượng cho phép (tối đa 10MB)`);
  }

  const storedName = `${crypto.randomUUID()}${safeExt(file.name)}`;

  if (isBlobMode()) {
    const blob = await put(`${subdir}/${storedName}`, file, { access: 'private', addRandomSuffix: false });
    return { storedPath: blob.url, originalName: file.name, mimeType: file.type, size: file.size };
  }

  const dir = path.join(PRIVATE_UPLOAD_ROOT, subdir);
  ensureDir(dir);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, storedName), buffer);
  return {
    storedPath: path.posix.join(subdir, storedName),
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

/** Stream file after the route has checked the caller's access. */
export async function readPrivateAttachment(storedPath) {
  if (isRemoteUrl(storedPath)) {
    if (isBlobMode()) {
      const blob = await get(storedPath, { access: 'private' }).catch(() => null);
      if (blob) return blob.stream;
    }
    // Existing public blobs remain readable until migrated or deleted.
    const res = await fetch(storedPath);
    if (!res.ok) return null;
    return res.body;
  }
  const filePath = path.join(PRIVATE_UPLOAD_ROOT, storedPath);
  if (!fs.existsSync(filePath)) return null;
  return Readable.toWeb(fs.createReadStream(filePath));
}

export async function deletePrivateAttachment(storedPath) {
  if (isRemoteUrl(storedPath)) {
    if (isBlobMode()) await del(storedPath).catch(() => {});
    return;
  }
  const filePath = path.join(PRIVATE_UPLOAD_ROOT, storedPath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

/**
 * Lưu ảnh đại diện công khai. Trả về URL để dùng trực tiếp trong <img src>.
 */
export async function savePublicAvatar(file, employeeId) {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    throw new Error('Ảnh đại diện phải là PNG, JPG, WEBP hoặc GIF');
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('Ảnh vượt quá dung lượng cho phép (tối đa 3MB)');
  }
  let buffer;
  try {
    buffer = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000 })
      .rotate().resize(256, 256, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error('Ảnh không hợp lệ hoặc quá lớn. Vui lòng chọn ảnh khác.');
  }
  if (buffer.length > 64 * 1024) throw new Error('Ảnh quá phức tạp. Vui lòng chọn ảnh nhỏ hơn.');

  const storedName = `emp${employeeId}-${crypto.randomUUID()}.webp`;

  if (isBlobMode()) {
    const blob = await put(`avatars/${storedName}`, buffer, { access: 'public', contentType: 'image/webp', addRandomSuffix: false });
    return blob.url;
  }

  // Serverless filesystems cannot persist uploads. Small normalized avatars fit
  // in the existing avatar_path TEXT column, without a schema change.
  if (process.env.VERCEL) return `data:image/webp;base64,${buffer.toString('base64')}`;

  ensureDir(PUBLIC_UPLOAD_ROOT);
  fs.writeFileSync(path.join(PUBLIC_UPLOAD_ROOT, storedName), buffer);
  return `/uploads/avatars/${storedName}`;
}

export async function deletePublicAvatar(avatarUrl) {
  if (!avatarUrl || avatarUrl.startsWith('data:')) return;
  if (isRemoteUrl(avatarUrl)) {
    if (isBlobMode()) await del(avatarUrl).catch(() => {});
    return;
  }
  // Old local avatar URLs may still exist in the database after deployment.
  if (process.env.VERCEL) return;
  const filePath = path.join(process.cwd(), 'public', avatarUrl);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
