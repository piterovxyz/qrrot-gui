import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, HardDrive, Upload, CheckCircle2, XCircle, Trash2, Download,
  Eye, RefreshCw, X, FileUp, TerminalSquare, ChevronDown, ChevronUp, Box, Music
} from 'lucide-react';
import { cn } from './lib/utils';
import { formatBytes, getIcon, detectMimeType, detectViewerType } from './lib/fileUtils';

export default function App() {
  const [grpcAddress, setGrpcAddress] = useState('127.0.0.1:50051');
  const [connected, setConnected] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [connectionError, setConnectionError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
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
    // Wait for manual connection
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
    setIsConnecting(true);
    setConnectionError('');
    addLog(`connecting to ${grpcAddress}...`, 'info');
    try {
      const res = await window.electronAPI.connect(grpcAddress);
      if (res.success) {
        setConnected(true);
        addLog(res.cached ? 'using cached grpc connection' : 'connected to grpc server', 'success');
        fetchRegistry();
      } else {
        setConnected(false);
        setConnectionError(`Connection failed: ${res.error}`);
        addLog(`connection failed: ${res.error}`, 'error');
      }
    } catch (err) {
      setConnected(false);
      setConnectionError(`Connection error: ${err.message}`);
      addLog(`connection error: ${err.message}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const viewKeyDirectly = async (keyEntry, currentToken) => {
    if (!keyEntry) return;

    try {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`decrypting '${keyEntry.key}'...`);
      setViewerData(null);

      const type = detectViewerType(keyEntry.mimeType);

      // If file is <= 50MB and is an image or text, decrypt in memory
      if (keyEntry.size <= 50 * 1024 * 1024 && (type === 'image' || type === 'text')) {
         const res = await window.electronAPI.getMemory({ key: keyEntry.key, token: currentToken });
         let url = '';
         let textContent = '';

         if (res && res.data) {
           if (type === 'text') {
               const decoder = new TextDecoder('utf-8');
               textContent = decoder.decode(res.data);
           } else if (type === 'image') {
               const blob = new Blob([res.data], { type: res.mimeType });
               url = URL.createObjectURL(blob);
           }
         }

         setViewerData(prev => {
            if (prev?.url && prev.url.startsWith('blob:')) {
               URL.revokeObjectURL(prev.url);
            }
            return {
               type,
               mimeType: res ? res.mimeType : keyEntry.mimeType,
               size: res ? res.size : keyEntry.size,
               url,
               text: textContent
            };
         });
         addLog(`decrypted '${keyEntry.key}' to memory (${res ? res.size : 0} bytes)`, 'success');
      } else {
         // Streaming media or large files
         const streamUrl = `qrrot-media://stream/${keyEntry.key}?token=${encodeURIComponent(currentToken)}`;
         setViewerData({
            type,
            mimeType: keyEntry.mimeType,
            size: keyEntry.size,
            url: streamUrl,
            text: ''
         });
         addLog(`streaming '${keyEntry.key}' via local proxy`, 'success');
      }
    } catch (err) {
      addLog(`decrypt failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  };

  const handleSelectKey = async (entry) => {
    setSelectedKey(entry);
    setViewerData(null);
    setToken(''); // Reset token when switching keys
    await viewKeyDirectly(entry, '');
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
    await viewKeyDirectly(selectedKey, token);
  };

  const handleDownloadKey = async () => {
    if (!selectedKey) return;

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
      <div className="bg-glow bg-orange-primary -top-[100px] -left-[100px]"></div>
      <div className="bg-glow bg-orange-hover -bottom-[100px] -right-[100px]"></div>

      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 32, mass: 1.0 }}
            className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/40 drag-region"
          >
            <div className="w-full max-w-[450px] bg-bg-panel border border-border-light rounded-3xl p-10 flex flex-col gap-6 shadow-2xl no-drag-region">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-orange-primary/20 flex items-center justify-center mb-2">
                  <HardDrive className="text-orange-primary" size={32} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Connect to qrrot</h1>
                <p className="text-sm text-gray-400">Enter the gRPC server address to connect</p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Host Address</label>
                  <input
                    type="text"
                    className="bg-black/40 border border-border-light rounded-xl text-gray-100 px-4 py-3 text-sm font-mono outline-none focus:border-orange-primary transition-colors"
                    value={grpcAddress}
                    onChange={(e) => setGrpcAddress(e.target.value)}
                    placeholder="localhost:60945"
                  />
                </div>



                {connectionError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-xs">
                    {connectionError}
                  </div>
                )}
                <button
                  className="w-full bg-orange-primary hover:bg-orange-hover text-white rounded-xl px-4 py-3 text-sm font-bold transition-colors mt-2 flex items-center justify-center gap-2"
                  onClick={connectGrpc}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Connecting...
                    </>
                  ) : "Connect"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 32, mass: 1.0 }}
            className="flex w-full h-full"
          >
            {/* Sidebar */}
            <div className="w-[320px] bg-bg-panel border-r border-border-light backdrop-blur-md flex flex-col h-full z-10 pt-[40px]">
        {/* Brand */}
        <div className="px-6 py-5 flex items-center gap-3 border-b border-border-light drag-region">
          <HardDrive className="text-orange-primary" size={24} />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-orange-primary to-orange-hover bg-clip-text text-transparent lowercase">
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
              className="flex-1 bg-black/30 border border-border-light rounded-xl text-gray-100 px-3 py-1.5 text-sm font-mono outline-none focus:border-orange-primary transition-colors"
              value={grpcAddress}
              onChange={(e) => setGrpcAddress(e.target.value)}
              placeholder="127.0.0.1:50051"
            />
            <button
              className="bg-white/5 hover:bg-white/10 border border-border-light text-gray-100 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors"
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
            className="flex items-center gap-1 bg-gradient-to-br from-orange-primary to-orange-hover hover:opacity-90 text-white rounded-xl px-2 py-1 text-xs font-medium transition-opacity"
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
              className="w-full bg-black/30 border border-border-light rounded-xl text-gray-100 pl-9 pr-3 py-1.5 text-sm font-mono outline-none focus:border-orange-primary transition-colors"
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
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border border-transparent",
                !selectedKey || selectedKey.key !== item.key ? "hover:bg-white/5 hover:border-white/10" : ""
              )}
              onClick={() => handleSelectKey(item)}
            >
              {selectedKey?.key === item.key && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute inset-0 bg-orange-primary/10 border border-orange-primary/30 rounded-xl shadow-[0_0_12px_rgba(255,107,0,0.15)] z-0"
                  transition={{ type: "spring", stiffness: 280, damping: 32, mass: 1.0 }}
                />
              )}
              <div className={cn(
                "w-9 h-9 flex items-center justify-center shrink-0 border relative z-10 transition-all duration-300 ease-out",
                selectedKey?.key === item.key
                  ? "bg-orange-primary/20 border-orange-primary/40 rounded-[6px_14px_6px_6px]"
                  : "bg-white/5 border-border-light rounded-[14px_6px_14px_14px] hover:rounded-[8px_14px_8px_8px]"
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
        <div className="h-20 px-8 flex items-center justify-between border-b border-border-light bg-black/40 backdrop-blur-md drag-region">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{selectedKey ? selectedKey.key : 'no key selected'}</h2>
            {selectedKey && (
              <p className="text-xs text-gray-400 font-mono">
                {selectedKey.mimeType} • {formatBytes(selectedKey.size)}
              </p>
            )}
          </div>

          {selectedKey && (
            <div className="flex items-center gap-3 no-drag-region">
              <div className="flex items-center gap-2 bg-black/20 border border-border-light rounded-xl px-2 py-1">
                <span className="text-xs text-gray-500 lowercase">token</span>
                <input
                  type="password"
                  className="bg-transparent border-none text-gray-100 text-sm font-mono outline-none w-32"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="aes key (optional)"
                />
              </div>
              <div className="flex items-center bg-white/5 border border-border-light rounded-xl overflow-hidden no-drag-region">
                <button
                  className="bg-gradient-to-r from-orange-primary to-orange-hover hover:opacity-90 text-white px-3 py-1.5 text-sm font-semibold transition-all flex items-center gap-1.5 border-r border-orange-primary/30"
                  onClick={handleViewKey}
                >
                  <Eye size={16} /> decrypt
                </button>
                <button
                  className="hover:bg-white/10 text-gray-100 px-3 py-1.5 text-sm font-semibold transition-all flex items-center gap-1.5"
                  onClick={handleDownloadKey}
                  title="Save to disk"
                >
                  <Download size={16} /> save
                </button>
              </div>
              <div className="w-px h-6 bg-border-light mx-1"></div>
              <button
                className="bg-white/5 hover:bg-white/10 border border-border-light text-gray-100 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all"
                onClick={handleCheckExists}
                title="Check Exists"
              >
                <CheckCircle2 size={16} />
              </button>
              <button
                className="bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all"
                onClick={handleDeleteKey}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Viewport */}
        <div className="flex-1 p-8 flex items-center justify-center overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-5">
              <motion.div
                animate={{ 
                  borderRadius: ["30% 70% 70% 30% / 30% 30% 70% 70%", "50% 50% 20% 80% / 20% 80% 20% 80%", "30% 70% 70% 30% / 30% 30% 70% 70%"],
                  rotate: [0, 180, 360],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "linear" 
                }}
                className="w-16 h-16 bg-orange-primary/10 flex items-center justify-center border border-orange-primary/30 shadow-[0_0_15px_rgba(255,107,0,0.4)] text-3xl"
              >
                ⚡
              </motion.div>
              <p className="text-gray-400 text-sm">{loadingText}</p>
              {loadingProgress !== null && (
                <div className="w-48 text-center">
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-gradient-to-r from-orange-primary to-orange-hover transition-all duration-100 ease-out" style={{ width: `${loadingProgress}%` }}></div>
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
                <pre className="flex-1 bg-black/40 p-6 font-mono text-sm text-orange-primary overflow-auto whitespace-pre-wrap select-text">
                  {viewerData.text}
                </pre>
              )}
              {viewerData.type === 'image' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 overflow-hidden relative p-4">
                  <img src={viewerData.url} alt={selectedKey?.key} className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
                </div>
              )}
              {viewerData.type === 'video' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 overflow-hidden relative p-4">
                  <video src={viewerData.url} controls autoPlay className="max-w-full max-h-full rounded-xl shadow-lg outline-none" />
                </div>
              )}
              {viewerData.type === 'audio' && (
                <div className="flex-1 flex items-center justify-center bg-black/60 relative p-4">
                  <div className="flex flex-col items-center gap-5 p-10 bg-white/5 rounded-3xl border border-border-light w-[400px] shadow-xl">
                    <div className="w-32 h-32 rounded-full bg-[radial-gradient(circle,#27272a_40%,#09090b_100%)] flex items-center justify-center text-5xl text-orange-primary border-4 border-border-light animate-[spin_8s_linear_infinite]">
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
                    <button className="bg-white/10 hover:bg-white/20 border border-border-light text-white rounded-xl px-4 py-2 text-sm font-semibold transition-all mt-2 flex items-center gap-2" onClick={handleDownloadKey}>
                      <Download size={16} /> Download File
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center flex flex-col items-center gap-4 text-gray-500">
              <div className="text-6xl bg-gradient-to-b from-orange-primary to-orange-hover bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(6,182,212,0.2)] animate-[float_4s_ease-in-out_infinite]">⚡</div>
              <p className="text-sm">select an item and insert decryption token, or upload a new file.</p>
            </div>
          )}
        </div>

        {/* Upload Panel Overlay */}
        {showUploadPanel && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-10">
            <div className="w-full max-w-[550px] bg-bg-panel border border-border-light rounded-3xl p-8 flex flex-col gap-5 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold bg-gradient-to-r from-orange-primary to-orange-hover bg-clip-text text-transparent">
                  upload new key
                </h3>
                <button className="text-gray-400 hover:text-white transition-colors" onClick={() => setShowUploadPanel(false)}>
                  <X size={20} />
                </button>
              </div>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all flex flex-col items-center gap-3",
                  dragActive ? "border-orange-primary bg-orange-primary/10" : "border-white/15 bg-white/5 hover:border-orange-primary hover:bg-orange-primary/5"
                )}
                onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={selectUploadFile}
              >
                <FileUp size={40} className="text-orange-primary" />
                {uploadForm.fileName ? (
                  <div>
                    <p className="font-semibold text-orange-primary">{uploadForm.fileName}</p>
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
                      className="bg-black/30 border border-border-light rounded-xl text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-orange-primary"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs text-gray-400 lowercase">mime type</label>
                    <input
                      type="text" required value={uploadForm.mimeType}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, mimeType: e.target.value }))}
                      placeholder="e.g. image/png"
                      className="bg-black/30 border border-border-light rounded-xl text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-orange-primary"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 lowercase">encryption token (aes-ctr)</label>
                  <input
                    type="password" value={uploadForm.token}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, token: e.target.value }))}
                    placeholder="token to derive key from"
                    className="bg-black/30 border border-border-light rounded-xl text-gray-100 px-3 py-2 text-sm font-sans outline-none focus:border-orange-primary"
                  />
                </div>
                <button
                  type="submit" disabled={!uploadForm.key || !uploadForm.filePath}
                  className="bg-gradient-to-r from-orange-primary to-orange-hover hover:opacity-90 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all mt-2 w-full"
                >
                  start secure upload
                </button>
              </form>
            </div>
          </div>
        )}

        <motion.div
            initial={false}
            animate={{ height: consoleExpanded ? 200 : 32 }}
            transition={{ type: "spring", stiffness: 280, damping: 32, mass: 1.0 }}
            className="w-full bg-black/90 border-t border-border-light flex flex-col z-40 overflow-hidden shrink-0 relative"
        >
           <div
             className="flex items-center justify-between px-4 h-8 min-h-[32px] cursor-pointer hover:bg-white/5 transition-colors select-none"
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

           <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs flex flex-col gap-1 select-text scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
             {logs.map((log, idx) => (
               <div key={idx} className="flex gap-2">
                 <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                 <span className={cn(
                   log.type === 'error' && "text-red-400",
                   log.type === 'success' && "text-green-400",
                   log.type === 'info' && "text-orange-primary"
                 )}>
                   {log.text}
                 </span>
               </div>
             ))}
             <div ref={consoleEndRef} />
           </div>
        </motion.div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
