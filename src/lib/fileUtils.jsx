import React from 'react';
import {
  Image as ImageIcon, FileText, FileJson,
  FileCode, Video, Music, Box
} from 'lucide-react';

// Helper: Format bytes
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'kb', 'mb', 'gb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Get Icon based on mime
export function getIcon(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return <ImageIcon className="text-cyan-400" size={18} />;
  if (mime.startsWith('video/')) return <Video className="text-violet-400" size={18} />;
  if (mime.startsWith('audio/')) return <Music className="text-pink-400" size={18} />;
  if (mime.startsWith('text/')) return <FileText className="text-blue-400" size={18} />;
  if (mime === 'application/json') return <FileJson className="text-yellow-400" size={18} />;
  if (mime.includes('code') || mime.includes('javascript')) return <FileCode className="text-green-400" size={18} />;
  return <Box className="text-gray-400" size={18} />;
}

// Helper: Detect mime
export function detectMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    // Images
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
    tif: 'image/tiff', avif: 'image/avif', heic: 'image/heic',
    heif: 'image/heif',

    // Video
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv', flv: 'video/x-flv', m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',

    // Audio
    mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
    flac: 'audio/flac', m4a: 'audio/x-m4a', opus: 'audio/opus',
    wma: 'audio/x-ms-wma', mid: 'audio/midi', midi: 'audio/midi',
    amr: 'audio/amr',

    // Documents
    pdf: 'application/pdf',

    // Text & Code
    txt: 'text/plain', html: 'text/html', css: 'text/css',
    js: 'application/javascript', json: 'application/json',
    md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
    xml: 'text/xml', yaml: 'text/yaml', yml: 'text/yaml',
    ini: 'text/plain', conf: 'text/plain', log: 'text/plain',
    sql: 'text/plain', sh: 'text/plain', bat: 'text/plain',
    cmd: 'text/plain', ps1: 'text/plain', ts: 'text/plain',
    tsx: 'text/plain', jsx: 'text/plain', rs: 'text/plain',
    c: 'text/plain', h: 'text/plain', cpp: 'text/plain',
    hpp: 'text/plain', cs: 'text/plain', java: 'text/plain',
    kt: 'text/plain', swift: 'text/plain', rb: 'text/plain',
    pl: 'text/plain', php: 'text/plain', less: 'text/plain',
    scss: 'text/plain', sass: 'text/plain', diff: 'text/plain',
    patch: 'text/plain', toml: 'text/plain', dockerfile: 'text/plain',
    gitignore: 'text/plain'
  };
  return map[ext] || 'application/octet-stream';
}

export function detectViewerType(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  ) return 'text';
  return 'binary';
}
