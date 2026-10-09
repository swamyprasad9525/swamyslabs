import path from 'path';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FILE_TYPES = {
  jpeg: { mime: 'image/jpeg', extension: '.jpg' },
  png: { mime: 'image/png', extension: '.png' },
  webp: { mime: 'image/webp', extension: '.webp' },
  pdf: { mime: 'application/pdf', extension: '.pdf' },
};

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return FILE_TYPES.jpeg;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return FILE_TYPES.png;
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return FILE_TYPES.webp;
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return FILE_TYPES.pdf;
  return null;
}

export function validateAndNormalizeUpload(file) {
  if (!file) return { file: null };

  const detected = detectFileType(file.buffer);
  if (!detected || file.mimetype !== detected.mime) {
    return { error: 'Invalid file type. Only JPG, PNG, WEBP, and PDF files are allowed.' };
  }

  const rawBase = path.basename(file.originalname || 'attachment');
  const stem = path.parse(rawBase).name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80) || 'attachment';

  return {
    file: {
      ...file,
      originalname: `${stem}${detected.extension}`,
      mimetype: detected.mime,
    },
  };
}
