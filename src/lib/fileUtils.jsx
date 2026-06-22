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
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac',
    txt: 'text/plain', html: 'text/html', css: 'text/css',
    js: 'text/plain', py: 'text/plain', go: 'text/plain',
    json: 'application/json'
  };
  return map[ext] || 'application/octet-stream';
}

export function detectViewerType(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript') return 'text';
  return 'binary';
}
