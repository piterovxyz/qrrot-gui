import { describe, it, expect } from 'vitest';
import { detectMimeType, detectViewerType } from './fileUtils';

describe('fileUtils helpers', () => {
  describe('detectMimeType', () => {
    it('should resolve image formats', () => {
      expect(detectMimeType('photo.png')).toBe('image/png');
      expect(detectMimeType('pic.jpg')).toBe('image/jpeg');
      expect(detectMimeType('graphic.svg')).toBe('image/svg+xml');
      expect(detectMimeType('icon.ico')).toBe('image/x-icon');
      expect(detectMimeType('avatar.avif')).toBe('image/avif');
      expect(detectMimeType('shot.heic')).toBe('image/heic');
    });

    it('should resolve video formats', () => {
      expect(detectMimeType('movie.mp4')).toBe('video/mp4');
      expect(detectMimeType('clip.mkv')).toBe('video/x-matroska');
      expect(detectMimeType('video.mov')).toBe('video/quicktime');
      expect(detectMimeType('animation.webm')).toBe('video/webm');
    });

    it('should resolve audio formats', () => {
      expect(detectMimeType('song.mp3')).toBe('audio/mpeg');
      expect(detectMimeType('record.wav')).toBe('audio/wav');
      expect(detectMimeType('track.m4a')).toBe('audio/x-m4a');
      expect(detectMimeType('podcast.opus')).toBe('audio/opus');
    });

    it('should resolve documents', () => {
      expect(detectMimeType('doc.pdf')).toBe('application/pdf');
    });

    it('should resolve text and code files', () => {
      expect(detectMimeType('readme.md')).toBe('text/markdown');
      expect(detectMimeType('script.js')).toBe('application/javascript');
      expect(detectMimeType('styles.scss')).toBe('text/plain'); // mapped to plain/css text
      expect(detectMimeType('data.json')).toBe('application/json');
      expect(detectMimeType('config.toml')).toBe('text/plain');
    });

    it('should fallback to application/octet-stream for unknown types', () => {
      expect(detectMimeType('binary.dat')).toBe('application/octet-stream');
      expect(detectMimeType('noext')).toBe('application/octet-stream');
    });
  });

  describe('detectViewerType', () => {
    it('should classify images as image', () => {
      expect(detectViewerType('image/png')).toBe('image');
      expect(detectViewerType('image/svg+xml')).toBe('image');
    });

    it('should classify videos as video', () => {
      expect(detectViewerType('video/mp4')).toBe('video');
      expect(detectViewerType('video/x-matroska')).toBe('video');
    });

    it('should classify audios as audio', () => {
      expect(detectViewerType('audio/mpeg')).toBe('audio');
      expect(detectViewerType('audio/x-m4a')).toBe('audio');
    });

    it('should classify pdf as pdf', () => {
      expect(detectViewerType('application/pdf')).toBe('pdf');
    });

    it('should classify texts and js/json/xml as text', () => {
      expect(detectViewerType('text/plain')).toBe('text');
      expect(detectViewerType('text/markdown')).toBe('text');
      expect(detectViewerType('application/json')).toBe('text');
      expect(detectViewerType('application/javascript')).toBe('text');
      expect(detectViewerType('application/problem+json')).toBe('text');
      expect(detectViewerType('application/rss+xml')).toBe('text');
    });

    it('should classify others as binary', () => {
      expect(detectViewerType('application/octet-stream')).toBe('binary');
      expect(detectViewerType('application/zip')).toBe('binary');
    });
  });
});
