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
  const logsContainerRef = useRef(null);

  const addLog = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, text, type }]);
  };

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, consoleExpanded]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanupUpload = window.electronAPI.onUploadProgress((data) => {
      if (data.total > 0) {
        setLoadingProgress(Math.round((data.loaded / data.total) * 100));
      }
    });
    const cleanupDownload = window.electronAPI.onDownloadProgress((data) => {
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
    setToken('');
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
      const safePath = selectedKey.key.replace(/[<>/\\|?*":]/g, '_');
      const saveDialog = await window.electronAPI.saveFileDialog({
        title: 'save decrypted file',
        defaultPath: safePath,
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
    <div className="flex h-screen w-screen bg-m3-surface text-m3-on-surface font-sans overflow-hidden select-none" onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}>
      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-m3-surface drag-region"
          >
            <div className="w-full max-w-[450px] bg-m3-surface-container rounded-[32px] p-10 flex flex-col gap-8 no-drag-region">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-m3-primary-container flex items-center justify-center mb-2">
                  <HardDrive className="text-m3-on-primary-container" size={32} />
                </div>
                <h1 className="text-3xl font-normal text-m3-on-surface">Connect</h1>
                <p className="text-base text-m3-on-surface-variant">Enter the gRPC server address</p>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-m3-on-surface-variant font-medium px-4">Host Address</label>
                  <input
                    type="text"
                    className="bg-m3-surface-container-high border-none rounded-full text-m3-on-surface px-6 py-4 text-base font-mono outline-none focus:ring-2 focus:ring-m3-primary transition-all"
                    value={grpcAddress}
                    onChange={(e) => setGrpcAddress(e.target.value)}
                    placeholder="localhost:50051"
                  />
                </div>

                {connectionError && (
                  <div className="bg-m3-error-container text-m3-on-error-container px-6 py-4 rounded-[24px] text-sm">
                    {connectionError}
                  </div>
                )}
                
                <button
                  className="w-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-6 py-4 text-base font-medium transition-colors mt-2 flex items-center justify-center gap-2"
                  onClick={connectGrpc}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full h-full overflow-hidden"
          >
            {/* Sidebar */}
            <div className="w-[320px] bg-m3-surface-container flex flex-col h-full z-10 pt-8">
              {/* Brand */}
              <div className="px-6 py-4 flex items-center gap-3 drag-region">
                <div className="w-8 h-8 rounded-full bg-m3-primary-container flex items-center justify-center">
                  <HardDrive className="text-m3-on-primary-container" size={18} />
                </div>
                <h1 className="text-xl font-medium text-m3-on-surface">qrrot</h1>
              </div>

              {/* Connection Panel */}
              <div className="px-6 py-4 flex flex-col gap-4">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    className="flex-1 bg-m3-surface-container-high border-none rounded-full text-m3-on-surface px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-m3-primary transition-all"
                    value={grpcAddress}
                    onChange={(e) => setGrpcAddress(e.target.value)}
                    placeholder="127.0.0.1:50051"
                  />
                  <button
                    className="bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container rounded-full w-10 h-10 flex items-center justify-center transition-colors shrink-0"
                    onClick={connectGrpc}
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              {/* Registry Header */}
              <div className="px-6 pt-4 pb-2 flex justify-between items-center">
                <h2 className="text-sm font-medium text-m3-on-surface-variant">Data Index</h2>
                <button
                  className="flex items-center gap-2 bg-m3-primary-container hover:bg-m3-primary-container/80 text-m3-on-primary-container rounded-full px-4 py-2 text-sm font-medium transition-colors"
                  onClick={() => setShowUploadPanel(true)}
                >
                  <Upload size={16} />
                  Upload
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-m3-on-surface-variant" size={18} />
                  <input
                    type="text"
                    className="w-full bg-m3-surface-container-high border-none rounded-full text-m3-on-surface pl-12 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keys..."
                  />
                </div>
              </div>

              {/* Registry List */}
              <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-1 mt-2">
                {filteredRegistry.map(item => {
                  const isActive = selectedKey?.key === item.key;
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-full cursor-pointer transition-all",
                        isActive ? "bg-m3-secondary-container" : "hover:bg-m3-surface-variant"
                      )}
                      onClick={() => handleSelectKey(item)}
                    >
                      <div className={cn(
                        "w-10 h-10 flex items-center justify-center shrink-0 rounded-full transition-colors",
                        isActive ? "bg-m3-primary text-m3-on-primary" : "bg-m3-surface-container-high text-m3-on-surface-variant"
                      )}>
                        {getIcon(item.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-sm font-medium truncate", isActive ? "text-m3-on-secondary-container" : "text-m3-on-surface")}>
                          {item.key}
                        </div>
                        <div className={cn("text-xs flex gap-2 mt-0.5", isActive ? "text-m3-on-secondary-container/80" : "text-m3-on-surface-variant")}>
                          <span>{formatBytes(item.size)}</span>
                          <span>•</span>
                          <span>{item.mimeType.split('/')[1] || 'binary'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredRegistry.length === 0 && (
                  <div className="text-center py-10 text-m3-on-surface-variant text-sm">
                    No items found
                  </div>
                )}
              </div>
            </div>

            {/* Workspace Area */}
            <div className="flex-1 flex flex-col h-full min-h-0 bg-m3-surface rounded-tl-[32px] overflow-hidden relative border-l border-m3-outline-variant/30">
              
              {/* Workspace Header */}
              <div className="h-24 px-8 flex items-center justify-between drag-region shrink-0">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-normal text-m3-on-surface">
                    {selectedKey ? selectedKey.key : 'Select an item'}
                  </h2>
                  {selectedKey && (
                    <p className="text-sm text-m3-on-surface-variant">
                      {selectedKey.mimeType} • {formatBytes(selectedKey.size)}
                    </p>
                  )}
                </div>

                {selectedKey && (
                  <div className="flex items-center gap-3 no-drag-region">
                    <div className="flex items-center gap-2 bg-m3-surface-container-high rounded-full px-4 py-2">
                      <span className="text-sm text-m3-on-surface-variant">Token</span>
                      <input
                        type="password"
                        className="bg-transparent border-none text-m3-on-surface text-sm font-mono outline-none w-32"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <button
                      className="bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                      onClick={handleViewKey}
                    >
                      <Eye size={18} /> Decrypt
                    </button>
                    <button
                      className="bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container rounded-full px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
                      onClick={handleDownloadKey}
                    >
                      <Download size={18} /> Save
                    </button>
                    <button
                      className="bg-m3-surface-variant hover:bg-m3-surface-variant/80 text-m3-on-surface-variant rounded-full w-10 h-10 flex items-center justify-center transition-colors"
                      onClick={handleCheckExists}
                      title="Check Exists"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      className="bg-m3-error-container hover:bg-m3-error-container/80 text-m3-on-error-container rounded-full w-10 h-10 flex items-center justify-center transition-colors"
                      onClick={handleDeleteKey}
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* Viewport */}
              <div className="flex-1 p-6 flex items-center justify-center overflow-hidden min-h-0 relative">
                {loading ? (
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 border-4 border-m3-primary border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-center">
                      <p className="text-m3-on-surface text-base font-medium">{loadingText}</p>
                      {loadingProgress !== null && (
                        <div className="w-64 mt-4">
                          <div className="w-full h-2 bg-m3-surface-variant rounded-full overflow-hidden">
                            <div className="h-full bg-m3-primary transition-all duration-100 ease-out" style={{ width: `${loadingProgress}%` }}></div>
                          </div>
                          <div className="text-sm text-m3-on-surface-variant mt-2 text-center">
                            {loadingText.includes('downloading') ? `${loadingProgress} KB` : `${loadingProgress}%`}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : viewerData ? (
                  <div className="w-full h-full bg-m3-surface-container rounded-[32px] flex flex-col overflow-hidden relative">
                    {viewerData.type === 'text' && (
                      <pre className="flex-1 p-8 font-mono text-sm text-m3-on-surface overflow-auto whitespace-pre-wrap select-text">
                        {viewerData.text}
                      </pre>
                    )}
                    {viewerData.type === 'image' && (
                      <div className="flex-1 flex items-center justify-center overflow-hidden relative p-8">
                        <img src={viewerData.url} alt={selectedKey?.key} className="max-w-full max-h-full object-contain rounded-2xl" />
                      </div>
                    )}
                    {viewerData.type === 'video' && (
                      <div className="flex-1 flex items-center justify-center overflow-hidden relative p-8">
                        <video src={viewerData.url} controls autoPlay className="max-w-full max-h-full rounded-2xl outline-none bg-black/5" />
                      </div>
                    )}
                    {viewerData.type === 'audio' && (
                      <div className="flex-1 flex items-center justify-center relative p-8">
                        <div className="flex flex-col items-center gap-8 p-12 bg-m3-surface rounded-[32px] w-[400px]">
                          <div className="w-32 h-32 rounded-full bg-m3-primary-container flex items-center justify-center text-m3-primary">
                            <Music size={48} />
                          </div>
                          <audio src={viewerData.url} controls autoPlay className="w-full outline-none" />
                        </div>
                      </div>
                    )}
                    {viewerData.type === 'binary' && (
                      <div className="flex-1 flex items-center justify-center relative p-8">
                        <div className="flex flex-col items-center gap-4 text-center">
                          <div className="w-24 h-24 rounded-full bg-m3-tertiary-container flex items-center justify-center text-m3-on-tertiary-container mb-2">
                            <Box size={40} />
                          </div>
                          <p className="text-xl text-m3-on-surface">Binary File</p>
                          <p className="text-sm text-m3-on-surface-variant font-mono">{viewerData.mimeType}</p>
                          <button className="bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-6 py-3 text-sm font-medium transition-colors mt-6 flex items-center gap-2" onClick={handleDownloadKey}>
                            <Download size={18} /> Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center flex flex-col items-center gap-6">
                    <div className="w-32 h-32 rounded-full bg-m3-surface-container flex items-center justify-center text-m3-surface-variant">
                      <Box size={48} />
                    </div>
                    <p className="text-base text-m3-on-surface-variant max-w-[250px]">
                      Select an item to preview or upload a new file
                    </p>
                  </div>
                )}
              </div>

              {/* Upload Panel Overlay */}
              {showUploadPanel && (
                <div className="absolute inset-0 bg-m3-surface/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                  <div className="w-full max-w-[500px] bg-m3-surface-container rounded-[32px] p-8 flex flex-col gap-8 shadow-lg">
                    <div className="flex justify-between items-center">
                      <h3 className="text-2xl font-normal text-m3-on-surface">
                        Upload Data
                      </h3>
                      <button className="text-m3-on-surface-variant hover:bg-m3-surface-variant rounded-full w-10 h-10 flex items-center justify-center transition-colors" onClick={() => setShowUploadPanel(false)}>
                        <X size={20} />
                      </button>
                    </div>

                    <div
                      className={cn(
                        "border-2 border-dashed rounded-[24px] p-10 text-center cursor-pointer transition-all flex flex-col items-center gap-4",
                        dragActive ? "border-m3-primary bg-m3-secondary-container" : "border-m3-outline-variant hover:bg-m3-surface-variant"
                      )}
                      onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={selectUploadFile}
                    >
                      <div className="w-16 h-16 rounded-full bg-m3-primary-container flex items-center justify-center text-m3-primary mb-2">
                        <FileUp size={32} />
                      </div>
                      {uploadForm.fileName ? (
                        <div>
                          <p className="font-medium text-m3-on-surface">{uploadForm.fileName}</p>
                          <p className="text-sm text-m3-on-surface-variant mt-1">Click to change file</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-base font-medium text-m3-on-surface">Drag & drop or browse</p>
                          <p className="text-sm text-m3-on-surface-variant mt-1">Any file size supported</p>
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleUploadSubmit} className="flex flex-col gap-5">
                      <div className="flex gap-4">
                        <div className="flex-1 flex flex-col gap-2">
                          <label className="text-sm font-medium text-m3-on-surface-variant px-2">Key Name</label>
                          <input
                            type="text" required value={uploadForm.key}
                            onChange={(e) => setUploadForm(prev => ({ ...prev, key: e.target.value }))}
                            placeholder="e.g. docs"
                            className="bg-m3-surface border-none rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary"
                          />
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                          <label className="text-sm font-medium text-m3-on-surface-variant px-2">MIME Type</label>
                          <input
                            type="text" required value={uploadForm.mimeType}
                            onChange={(e) => setUploadForm(prev => ({ ...prev, mimeType: e.target.value }))}
                            placeholder="image/png"
                            className="bg-m3-surface border-none rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-m3-on-surface-variant px-2">Encryption Token</label>
                        <input
                          type="password" value={uploadForm.token}
                          onChange={(e) => setUploadForm(prev => ({ ...prev, token: e.target.value }))}
                          placeholder="Optional AES token"
                          className="bg-m3-surface border-none rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary"
                        />
                      </div>
                      <button
                        type="submit" disabled={!uploadForm.key || !uploadForm.filePath}
                        className="bg-m3-primary hover:bg-m3-primary/90 disabled:opacity-50 text-m3-on-primary rounded-full px-6 py-4 text-base font-medium transition-colors mt-2 w-full"
                      >
                        Start Upload
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Console / Terminal */}
              <motion.div
                  initial={false}
                  animate={{ height: consoleExpanded ? 250 : 48 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="w-full bg-m3-surface-container-high flex flex-col z-40 overflow-hidden shrink-0 border-t border-m3-outline-variant/30"
              >
                 <div
                   className="flex items-center justify-between px-6 h-12 min-h-[48px] cursor-pointer hover:bg-m3-surface-variant transition-colors select-none"
                   onClick={() => setConsoleExpanded(!consoleExpanded)}
                 >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <TerminalSquare size={18} className="text-m3-on-surface-variant" />
                      <div className="flex items-center gap-3 text-sm font-mono">
                         {connected ? <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div> : <div className="w-2.5 h-2.5 rounded-full bg-m3-error"></div>}
                         <span className="text-m3-on-surface-variant truncate max-w-[600px]">
                           {logs.length > 0 ? logs[logs.length - 1].text : "No logs yet"}
                         </span>
                      </div>
                    </div>
                    <div className="text-m3-on-surface-variant w-8 h-8 flex items-center justify-center rounded-full hover:bg-m3-surface-variant">
                      {consoleExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </div>
                 </div>

                 <div ref={logsContainerRef} className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs flex flex-col gap-2 select-text scrollbar-thin">
                   {logs.map((log, idx) => (
                     <div key={idx} className="flex gap-3">
                       <span className="text-m3-on-surface-variant shrink-0">[{log.timestamp}]</span>
                       <span className={cn(
                         "flex-1 break-all",
                         log.type === 'error' && "text-m3-error",
                         log.type === 'success' && "text-green-400",
                         log.type === 'info' && "text-m3-primary"
                       )}>
                         {log.text}
                       </span>
                     </div>
                   ))}
                 </div>
              </motion.div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
