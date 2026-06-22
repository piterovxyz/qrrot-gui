import React, { useState, useEffect, useRef } from 'react';
import {
  Search, HardDrive, Upload, Image as ImageIcon, FileText, FileJson,
  FileCode, Video, Music, Box, CheckCircle2, XCircle, Trash2, Download,
  Eye, RefreshCw, X, FileUp, TerminalSquare, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from './lib/utils';

// Helper: Format bytes
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'kb', 'mb', 'gb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Get Icon based on mime
function getIcon(mimeType) {
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
function detectMimeType(fileName) {
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

function detectViewerType(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript') return 'text';
  return 'binary';
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [grpcAddress, setGrpcAddress] = useState('localhost:60945');
  const [registry, setRegistry] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [loadingText, setLoadingText] = useState('');
  const [viewerData, setViewerData] = useState(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    key: '', filePath: '', fileName: '', mimeType: 'application/octet-stream', token: ''
  });
  const [dragActive, setDragActive] = useState(false);
  const [logs, setLogs] = useState([]);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const consoleEndRef = useRef(null);

  const addLog = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, text, type }]);
  };

  useEffect(() => {
    if (consoleExpanded && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, consoleExpanded]);

  useEffect(() => {
    fetchRegistry();
    connectGrpc();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanupUpload = window.electronAPI.onUploadProgress((data) => {
      if (data.total > 0) {
        setLoadingProgress(Math.round((data.loaded / data.total) * 100));
      }
    });
    const cleanupDownload = window.electronAPI.onDownloadProgress((data) => {
      // For large downloads we just show bytes downloaded
      setLoadingProgress(Math.round(data.loaded / 1024));
    });
    return () => { cleanupUpload(); cleanupDownload(); };
  }, []);

  const fetchRegistry = async () => {
    if (!window.electronAPI) return;
    try {
      const list = await window.electronAPI.getRegistry();
      setRegistry(list);
    } catch (err) {
      addLog(`failed to load registry: ${err.message}`, 'error');
    }
  };

  const connectGrpc = async () => {
    if (!window.electronAPI) return;
    addLog(`connecting to ${grpcAddress}...`, 'info');
    try {
      const res = await window.electronAPI.connect(grpcAddress);
      if (res.success) {
        setConnected(true);
        addLog(res.cached ? 'using cached grpc connection' : 'connected to grpc server', 'success');
      } else {
        setConnected(false);
        addLog(`connection failed: ${res.error}`, 'error');
      }
    } catch (err) {
      setConnected(false);
      addLog(`connection error: ${err.message}`, 'error');
    }
  };

  const handleSelectKey = (entry) => {
    setSelectedKey(entry);
    setViewerData(null);
    setToken(''); // Reset token when switching keys
  };

  const handleCheckExists = async () => {
    if (!selectedKey) return;
    try {
      const exists = await window.electronAPI.exists(selectedKey.key);
      addLog(
        exists ? `key '${selectedKey.key}' exists on server` : `key '${selectedKey.key}' not found on server`,
        exists ? 'success' : 'error'
      );
    } catch (err) {
      addLog(`exists check failed: ${err.message}`, 'error');
    }
  };

  const handleDeleteKey = async () => {
    if (!selectedKey) return;
    if (!confirm(`delete '${selectedKey.key}'?`)) return;
    try {
      setLoading(true);
      setLoadingText('deleting...');
      await window.electronAPI.del(selectedKey.key);
      addLog(`deleted '${selectedKey.key}'`, 'success');
      const updated = await window.electronAPI.removeRegistry(selectedKey.key);
      setRegistry(updated);
      setSelectedKey(null);
      setViewerData(null);
    } catch (err) {
      addLog(`deletion failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewKey = async () => {
    if (!selectedKey) return;
    if (!token) {
        addLog(`token required to view '${selectedKey.key}'`, 'error');
        return;
    }

    try {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`decrypting '${selectedKey.key}'...`);
      setViewerData(null);

      const type = detectViewerType(selectedKey.mimeType);

      // If file is <= 50MB and is an image or text, decrypt in memory
      if (selectedKey.size <= 50 * 1024 * 1024 && (type === 'image' || type === 'text')) {
         const res = await window.electronAPI.getMemory({ key: selectedKey.key, token });
         let url = '';
         let textContent = '';

         if (type === 'text') {
             const decoder = new TextDecoder('utf-8');
             textContent = decoder.decode(res.data);
         } else if (type === 'image') {
             const blob = new Blob([res.data], { type: res.mimeType });
             url = URL.createObjectURL(blob);
         }

         setViewerData(prev => {
            if (prev?.url && prev.url.startsWith('blob:')) {
               URL.revokeObjectURL(prev.url);
            }
            return {
               type,
               mimeType: res.mimeType,
               size: res.size,
               url,
               text: textContent
            };
         });
         addLog(`decrypted '${selectedKey.key}' to memory (${res.size} bytes)`, 'success');
      } else {
         // Streaming media or large files
         const streamUrl = `qrrot-media://stream/${selectedKey.key}?token=${encodeURIComponent(token)}`;
         setViewerData({
            type,
            mimeType: selectedKey.mimeType,
            size: selectedKey.size,
            url: streamUrl,
            text: ''
         });
         addLog(`streaming '${selectedKey.key}' via local proxy`, 'success');
      }
    } catch (err) {
      addLog(`decrypt failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  };

  const handleDownloadKey = async () => {
    if (!selectedKey) return;
    if (!token) {
        addLog(`token required to save '${selectedKey.key}'`, 'error');
        return;
    }

    try {
      const saveDialog = await window.electronAPI.saveFileDialog({
        title: 'save decrypted file',
        defaultPath: selectedKey.key,
      });
      if (saveDialog.canceled || !saveDialog.filePath) return;

      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`downloading '${selectedKey.key}'...`);

      const res = await window.electronAPI.getSave({
        key: selectedKey.key, token, savePath: saveDialog.filePath
      });
      addLog(`saved to: ${res.filePath}`, 'success');
    } catch (err) {
      addLog(`download failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  };

  const selectUploadFile = async () => {
    const res = await window.electronAPI.openFileDialog({ properties: ['openFile'] });
    if (!res.canceled && res.filePaths.length > 0) {
      const filePath = res.filePaths[0];
      const fileName = filePath.split(/[\\/]/).pop();
      const mimeType = detectMimeType(fileName);
      const keyName = fileName.replace(/\.[^/.]+$/, '');
      setUploadForm(prev => ({ ...prev, filePath, fileName, key: keyName, mimeType }));
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await window.electronAPI.authorizeDrop(file);
      const filePath = file.path;
      const fileName = file.name;
      const mimeType = detectMimeType(fileName);
      const keyName = fileName.replace(/\.[^/.]+$/, '');
      setUploadForm(prev => ({ ...prev, filePath, fileName, key: keyName, mimeType }));
      setShowUploadPanel(true);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadForm.key || !uploadForm.filePath) {
      addLog('key and file are required', 'error');
      return;
    }
    try {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`uploading '${uploadForm.key}'...`);
      setShowUploadPanel(false);

      const res = await window.electronAPI.put({
        key: uploadForm.key, filePath: uploadForm.filePath,
        mimeType: uploadForm.mimeType, token: uploadForm.token
      });
      addLog(`uploaded '${uploadForm.key}' (${res.size} bytes)`, 'success');

      const updated = await window.electronAPI.addRegistry({
        key: uploadForm.key, mimeType: uploadForm.mimeType, size: res.size
      });
      setRegistry(updated);

      const newEntry = updated.find(e => e.key === uploadForm.key);
      if (newEntry) handleSelectKey(newEntry);

      setUploadForm({ key: '', filePath: '', fileName: '', mimeType: 'application/octet-stream', token: '' });
    } catch (err) {
      addLog(`upload failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  };

  const filteredRegistry = registry.filter(item =>
    item.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen bg-bg-dark text-gray-100 font-sans overflow-hidden select-none" onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}>
      {/* Glow effects */}
      <div className="bg-glow bg-cyan-primary -top-[100px] -left-[100px]"></div>
      <div className="bg-glow bg-violet-primary -bottom-[100px] -right-[100px]"></div>

      {/* Sidebar */}
      <div className="w-[320px] bg-bg-panel border-r border-border-light backdrop-blur-md flex flex-col h-full z-10 pt-[40px]">
        {/* Brand */}
        <div className="px-6 py-5 flex items-center gap-3 border-b border-border-light">
          <HardDrive className="text-cyan-400" size={24} />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent lowercase">
            qrrot gui
          </h1>
        </div>

        {/* Connection Panel */}
        <div className="px-5 py-4 border-b border-border-light flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-medium lowercase">
            {connected ? (
              <><CheckCircle2 className="text-green-500" size={14} /> <span className="text-green-500">connected</span></>
            ) : (
              <><XCircle className="text-red-500" size={14} /> <span className="text-red-500">disconnected</span></>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-black/30 border border-border-light rounded-md text-gray-100 px-3 py-1.5 text-sm font-mono outline-none focus:border-cyan-400 transition-colors"
              value={grpcAddress}
              onChange={(e) => setGrpcAddress(e.target.value)}
              placeholder="localhost:60945"
            />
            <button
              className="bg-white/5 hover:bg-white/10 border border-border-light text-gray-100 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
              onClick={connectGrpc}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Registry Header */}
        <div className="px-5 pt-4 pb-2 flex justify-between items-center">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">data index</h2>
          <button
            className="flex items-center gap-1 bg-gradient-to-br from-cyan-500 to-violet-500 hover:opacity-90 text-white rounded-md px-2 py-1 text-xs font-medium transition-opacity"
            onClick={() => setShowUploadPanel(true)}
          >
            <Upload size={12} />
            upload
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="text"
              className="w-full bg-black/30 border border-border-light rounded-md text-gray-100 pl-9 pr-3 py-1.5 text-sm font-mono outline-none focus:border-cyan-400 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="search keys..."
            />
          </div>
        </div>

        {/* Registry List */}
        <div className="flex-1 overflow-y-auto px-3 pb-5 flex flex-col gap-1.5">
          {filteredRegistry.map(item => (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border border-transparent",
                selectedKey?.key === item.key
                  ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.05)]"
                  : "hover:bg-white/5 hover:border-white/10"
              )}
              onClick={() => handleSelectKey(item)}
            >
              <div className={cn(
                "w-9 h-9 rounded-md flex items-center justify-center shrink-0 border",
                selectedKey?.key === item.key ? "bg-cyan-500/20 border-cyan-500/40" : "bg-white/5 border-border-light"
              )}>
                {getIcon(item.mimeType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-100 truncate">{item.key}</div>
                <div className="text-xs text-gray-500 flex gap-2 lowercase mt-0.5">
                  <span>{formatBytes(item.size)}</span>
                  <span>•</span>
                  <span>{item.mimeType.split('/')[1] || 'binary'}</span>
                </div>
              </div>
            </div>
          ))}
          {filteredRegistry.length === 0 && (
            <div className="text-center py-10 text-gray-500 text-sm">
              no keys in registry
            </div>
          )}
        </div>
      </div>

      {/* Workspace Area */}
      <div className="flex-1 flex flex-col h-full bg-[radial-gradient(circle_at_top_right,rgba(30,30,45,0.2),transparent)] relative z-0">

        {/* Workspace Header */}
        <div className="h-20 px-8 flex items-center justify-between border-b border-border-light bg-black/40 backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{selectedKey ? selectedKey.key : 'no key selected'}</h2>
            {selectedKey && (
              <p className="text-xs text-gray-400 font-mono">
                {selectedKey.mimeType} • {formatBytes(selectedKey.size)}
              </p>
            )}
          </div>

          {selectedKey && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-black/20 border border-border-light rounded-md px-2 py-1">
                <span className="text-xs text-gray-500 lowercase">token</span>
                <input
                  type="password"
                  className="bg-transparent border-none text-gray-100 text-sm font-mono outline-none w-32"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="aes key"
                />
              </div>
              <button
                className="bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-90 text-white rounded-md px-3 py-1.5 text-sm font-semibold transition-all flex items-center gap-1.5"
                onClick={handleViewKey}
              >
                <Eye size={16} /> decrypt
              </button>
              <button
                className="bg-white/5 hover:bg-white/10 border border-border-light text-gray-100 rounded-md px-3 py-1.5 text-sm font-semibold transition-all flex items-center gap-1.5"
                onClick={handleDownloadKey}
              >
                <Download size={16} /> save
              </button>
              <div className="w-px h-6 bg-border-light mx-1"></div>
              <button
                className="bg-white/5 hover:bg-white/10 border border-border-light text-gray-100 rounded-md px-3 py-1.5 text-sm font-semibold transition-all"
                onClick={handleCheckExists}
                title="Check Exists"
              >
                <CheckCircle2 size={16} />
              </button>
              <button
                className="bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 rounded-md px-3 py-1.5 text-sm font-semibold transition-all"
                onClick={handleDeleteKey}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Viewport */}
        <div className="flex-1 p-8 flex items-center justify-center overflow-hidden mb-8">
          {loading ? (
            <div className="flex flex-col items-center gap-5">
              <div className="w-12 h-12 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin"></div>
              <p className="text-gray-400 text-sm">{loadingText}</p>
              {loadingProgress !== null && (
                <div className="w-48 text-center">
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-100 ease-out" style={{ width: `${loadingProgress}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-1">
                     {loadingText.includes('downloading') ? `${loadingProgress} KB` : `${loadingProgress}%`}
                  </div>
                </div>
              )}
            </div>
          ) : viewerData ? (
            <div className="w-full h-full bg-bg-panel border border-border-light rounded-xl backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl relative">
              {viewerData.type === 'text' && (
                <pre className="flex-1 bg-black/40 p-6 font-mono text-sm text-cyan-200 overflow-auto whitespace-pre-wrap select-text">
                  {viewerData.text}
                </pre>
              )}
              {viewerData.type === 'image' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 overflow-hidden relative p-4">
                  <img src={viewerData.url} alt={selectedKey?.key} className="max-w-full max-h-full object-contain rounded-md shadow-lg" />
                </div>
              )}
              {viewerData.type === 'video' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 overflow-hidden relative p-4">
                  <video src={viewerData.url} controls autoPlay className="max-w-full max-h-full rounded-md shadow-lg outline-none" />
                </div>
              )}
              {viewerData.type === 'audio' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 relative p-4">
                  <div className="flex flex-col items-center gap-5 p-10 bg-white/5 rounded-2xl border border-border-light w-[400px] shadow-xl">
                    <div className="w-32 h-32 rounded-full bg-[radial-gradient(circle,#27272a_40%,#09090b_100%)] flex items-center justify-center text-5xl text-cyan-500 border-4 border-border-light animate-[spin_8s_linear_infinite]">
                      <Music />
                    </div>
                    <audio src={viewerData.url} controls autoPlay className="w-full outline-none mt-4" />
                  </div>
                </div>
              )}
              {viewerData.type === 'binary' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 relative p-4">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Box size={64} className="text-violet-500 drop-shadow-[0_0_10px_rgba(139,92,246,0.3)]" />
                    <p className="text-gray-400">binary file / unsupported preview</p>
                    <p className="text-xs text-gray-500 font-mono">{viewerData.mimeType}</p>
                    <button className="bg-white/10 hover:bg-white/20 border border-border-light text-white rounded-md px-4 py-2 text-sm font-semibold transition-all mt-2 flex items-center gap-2" onClick={handleDownloadKey}>
                      <Download size={16} /> Download File
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center flex flex-col items-center gap-4 text-gray-500">
              <div className="text-6xl bg-gradient-to-b from-cyan-400 to-violet-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(6,182,212,0.2)] animate-[float_4s_ease-in-out_infinite]">⚡</div>
              <p className="text-sm">select an item and insert decryption token, or upload a new file.</p>
            </div>
          )}
        </div>

        {/* Upload Panel Overlay */}
        {showUploadPanel && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-10">
            <div className="w-full max-w-[550px] bg-bg-panel border border-border-light rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">
                  upload new key
                </h3>
                <button className="text-gray-400 hover:text-white transition-colors" onClick={() => setShowUploadPanel(false)}>
                  <X size={20} />
                </button>
              </div>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all flex flex-col items-center gap-3",
                  dragActive ? "border-cyan-500 bg-cyan-500/10" : "border-white/15 bg-white/5 hover:border-cyan-500 hover:bg-cyan-500/5"
                )}
                onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={selectUploadFile}
              >
                <FileUp size={40} className="text-cyan-400" />
                {uploadForm.fileName ? (
                  <div>
                    <p className="font-semibold text-cyan-300">{uploadForm.fileName}</p>
                    <p className="text-xs text-gray-500 mt-1">click or drop another file to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm">drag & drop a file here, or click to browse</p>
                    <p className="text-xs text-gray-500 mt-1">supports files up to any size (streamed in chunks)</p>
                  </div>
                )}
              </div>

              <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 lowercase">key name</label>
                    <input
                      type="text" required value={uploadForm.key}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, key: e.target.value }))}
                      placeholder="e.g. users_photo"
                      className="bg-black/30 border border-border-light rounded-md text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 lowercase">mime type</label>
                    <input
                      type="text" required value={uploadForm.mimeType}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, mimeType: e.target.value }))}
                      placeholder="e.g. image/png"
                      className="bg-black/30 border border-border-light rounded-md text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 lowercase">encryption token (aes-ctr)</label>
                  <input
                    type="password" value={uploadForm.token}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, token: e.target.value }))}
                    placeholder="token to derive key from"
                    className="bg-black/30 border border-border-light rounded-md text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  type="submit" disabled={!uploadForm.key || !uploadForm.filePath}
                  className="bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-90 disabled:opacity-50 text-white rounded-md px-4 py-2.5 text-sm font-semibold transition-all mt-2 w-full"
                >
                  start secure upload
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Collapsible Console Footer */}
        <div className={cn(
            "absolute bottom-0 left-0 w-full bg-black/90 border-t border-border-light transition-all duration-300 ease-in-out flex flex-col z-40",
            consoleExpanded ? "h-[200px]" : "h-8"
        )}>
           <div
             className="flex items-center justify-between px-4 h-8 cursor-pointer hover:bg-white/5 transition-colors select-none"
             onClick={() => setConsoleExpanded(!consoleExpanded)}
           >
              <div className="flex items-center gap-3 overflow-hidden">
                <TerminalSquare size={14} className="text-gray-400" />
                <div className="flex items-center gap-2 text-xs font-mono">
                   {connected ? <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div> : <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>}
                   <span className="text-gray-500 truncate max-w-[500px]">
                     {logs.length > 0 ? logs[logs.length - 1].text : "no logs yet"}
                   </span>
                </div>
              </div>
              <div className="text-gray-500">
                {consoleExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
           </div>

           {consoleExpanded && (
              <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs flex flex-col gap-1 select-text scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                    <span className={cn(
                      log.type === 'error' && "text-red-400",
                      log.type === 'success' && "text-green-400",
                      log.type === 'info' && "text-cyan-400"
                    )}>
                      {log.text}
                    </span>
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
           )}
        </div>

      </div>
    </div>
  );
}
