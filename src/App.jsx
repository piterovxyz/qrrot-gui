import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, HardDrive, Upload, XCircle, Download,
  Eye, RefreshCw, X, FileUp, Box, Music
} from 'lucide-react';
import { cn } from './lib/utils';
import { formatBytes, getIcon, detectMimeType, detectViewerType } from './lib/fileUtils';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

const RegistryItem = React.memo(({ item, isActive, onClick, onDoubleClick }) => {
  const handleClick = useCallback(() => {
    onClick(item);
  }, [item, onClick]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick(item);
  }, [item, onDoubleClick]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent select-none active:scale-[0.98]",
        isActive 
          ? "bg-m3-secondary-container border-m3-secondary/20 shadow-md scale-[0.99]" 
          : "hover:bg-m3-surface-container-high hover:border-m3-outline-variant/30 hover:scale-[1.01]"
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className={cn(
        "w-10 h-10 flex items-center justify-center shrink-0 rounded-[14px] transition-colors duration-200 shadow-inner",
        isActive ? "bg-m3-secondary text-m3-on-secondary" : "bg-m3-surface-variant text-m3-on-surface-variant"
      )}>
        {getIcon(item.mimeType)}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("text-[13px] font-semibold truncate", isActive ? "text-m3-on-secondary-container" : "text-m3-on-surface")}>
          {item.key}
        </div>
        <div className={cn("text-[10px] flex gap-1.5 mt-0.5 font-medium", isActive ? "text-m3-on-secondary-container/80" : "text-m3-on-surface-variant")}>
          <span>{formatBytes(item.size)}</span>
          <span className="opacity-50">•</span>
          <span className="truncate">{item.mimeType.split('/')[1] || 'binary'}</span>
        </div>
      </div>
    </div>
  );
});

RegistryItem.displayName = 'RegistryItem';

export default function App() {
  const [grpcAddress, setGrpcAddress] = useState('127.0.0.1:60945');
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptKey, setPromptKey] = useState(null);
  const [promptAction, setPromptAction] = useState(null); // 'view' | 'save'
  const [promptTokenValue, setPromptTokenValue] = useState('');

  const addLog = useCallback((text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    if (type === 'error') {
      console.error(`[${timestamp}] [${type}] ${text}`);
    } else {
      console.log(`[${timestamp}] [${type}] ${text}`);
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanupUpload = window.electronAPI.onUploadProgress((data) => {
      const prog = data.total > 0 ? Math.round((data.loaded / data.total) * 100) : 0;
      setLoadingProgress(prev => (prev !== null ? prog : null));
      setBackgroundTasks(prev => prev.map(t => t.key === data.key ? { ...t, progress: prog } : t));
    });
    const cleanupDownload = window.electronAPI.onDownloadProgress((data) => {
      const isPercent = data.total > 0;
      const prog = isPercent ? Math.round((data.loaded / data.total) * 100) : Math.round(data.loaded / 1024);
      setLoadingProgress(prev => (prev !== null ? prog : null));
      setBackgroundTasks(prev => prev.map(t => t.key === data.key ? { ...t, progress: isPercent ? prog : 0, loadedKb: Math.round(data.loaded / 1024), isPercent } : t));
    });
    return () => { cleanupUpload(); cleanupDownload(); };
  }, []);

  const fetchRegistry = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const list = await window.electronAPI.getRegistry();
      setRegistry(list);
    } catch (err) {
      addLog(`failed to load registry: ${err.message}`, 'error');
    }
  }, [addLog]);

  const connectGrpc = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsConnecting(true);
    setConnectionError('');
    addLog(`connecting to ${grpcAddress}...`, 'info');
    try {
      const res = await window.electronAPI.connect(grpcAddress);
      if (res.success) {
        setConnected(true);
        addLog(res.cached ? 'using cached grpc connection' : 'connected to grpc server', 'success');
        try {
          addLog('fetching keys from server...', 'info');
          const keys = await window.electronAPI.getKeys(token);
          setRegistry(keys);
          addLog(`successfully loaded ${keys.length} keys from server`, 'success');
        } catch (err) {
          addLog(`failed to load keys from server: ${err.message}, falling back to local registry`, 'error');
          fetchRegistry();
        }
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
  }, [grpcAddress, token, addLog, fetchRegistry]);

  const viewKeyDirectly = useCallback(async (keyEntry, currentToken) => {
    if (!keyEntry) return;

    try {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`decrypting '${keyEntry.key}'...`);
      setViewerData(null);

      const type = detectViewerType(keyEntry.mimeType);

      if (keyEntry.size <= 50 * 1024 * 1024 && (type === 'image' || type === 'text' || type === 'pdf')) {
         const res = await window.electronAPI.getMemory({ key: keyEntry.key, token: currentToken, size: keyEntry.size, mimeType: keyEntry.mimeType });
         let url = '';
         let textContent = '';

         if (res && res.data) {
           if (type === 'text') {
               const decoder = new TextDecoder('utf-8');
               textContent = decoder.decode(res.data);
           } else if (type === 'image' || type === 'pdf') {
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
      setBackgroundTasks(prev => prev.filter(t => t.key !== keyEntry.key));
    }
  }, [addLog]);

  const handleSelectKey = useCallback(async (entry) => {
    setSelectedKey(entry);
    setViewerData(prev => {
      if (prev?.url && prev.url.startsWith('blob:')) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
    setToken('');
    setMobileSidebarOpen(false);
  }, []);

  const handleDoubleClickKey = useCallback(async (entry) => {
    setSelectedKey(entry);
    setViewerData(prev => {
      if (prev?.url && prev.url.startsWith('blob:')) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
    setMobileSidebarOpen(false);
    
    setPromptKey(entry);
    setPromptAction('view');
    setPromptTokenValue(token);
    setPromptOpen(true);
  }, [token]);

  const handleViewKey = useCallback(async () => {
    if (!selectedKey) return;
    setPromptKey(selectedKey);
    setPromptAction('view');
    setPromptTokenValue(token);
    setPromptOpen(true);
  }, [selectedKey, token]);

  const downloadKeyDirectly = useCallback(async (keyEntry, currentToken) => {
    if (!keyEntry) return;

    try {
      const safePath = keyEntry.key.replace(/[<>/\\|?*":]/g, '_');
      const saveDialog = await window.electronAPI.saveFileDialog({
        title: 'save decrypted file',
        defaultPath: safePath,
      });
      if (saveDialog.canceled || !saveDialog.filePath) return;

      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`downloading '${keyEntry.key}'...`);

      const res = await window.electronAPI.getSave({
        key: keyEntry.key, token: currentToken, savePath: saveDialog.filePath, size: keyEntry.size, mimeType: keyEntry.mimeType
      });
      addLog(`saved to: ${res.filePath}`, 'success');
    } catch (err) {
      addLog(`download failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
      setBackgroundTasks(prev => prev.filter(t => t.key !== keyEntry.key));
    }
  }, [addLog]);

  const handleDownloadKey = useCallback(async () => {
    if (!selectedKey) return;
    setPromptKey(selectedKey);
    setPromptAction('save');
    setPromptTokenValue(token);
    setPromptOpen(true);
  }, [selectedKey, token]);

  const handlePromptSubmit = useCallback(async (enteredToken) => {
    setPromptOpen(false);
    setToken(enteredToken);
    
    if (promptAction === 'view') {
      await viewKeyDirectly(promptKey, enteredToken);
    } else if (promptAction === 'save') {
      await downloadKeyDirectly(promptKey, enteredToken);
    }
  }, [promptAction, promptKey, viewKeyDirectly, downloadKeyDirectly]);

  const moveToBackground = useCallback(() => {
    const taskType = loadingText.includes('uploading') ? 'upload' : 'download';
    const currentKey = taskType === 'upload' ? uploadForm.key : selectedKey?.key;
    if (!currentKey) return;
    
    setBackgroundTasks(prev => {
      if (prev.some(t => t.key === currentKey)) return prev;
      return [...prev, {
        key: currentKey,
        type: taskType,
        progress: loadingProgress || 0,
        loadingText: loadingText,
        size: taskType === 'upload' ? 0 : (selectedKey?.size || 0)
      }];
    });
    setLoading(false);
    setLoadingProgress(null);
  }, [selectedKey, uploadForm, loadingText, loadingProgress]);

  const handleCancelTask = useCallback(async (taskKey) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.cancelCall(taskKey);
      addLog(`cancelled task for key '${taskKey}'`, 'info');
    } catch (err) {
      addLog(`failed to cancel task: ${err.message}`, 'error');
    }
    setBackgroundTasks(prev => prev.filter(t => t.key !== taskKey));
  }, [addLog]);

  const selectUploadFile = useCallback(async () => {
    const res = await window.electronAPI.openFileDialog({ properties: ['openFile'] });
    if (!res.canceled && res.filePaths.length > 0) {
      const filePath = res.filePaths[0];
      const fileName = filePath.split(/[\\/]/).pop();
      const mimeType = detectMimeType(fileName);
      const keyName = fileName.replace(/\.[^/.]+$/, '');
      setUploadForm(prev => ({ ...prev, filePath, fileName, key: keyName, mimeType }));
    }
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const authorized = await window.electronAPI.authorizeDrop(file);
      if (!authorized) return;
      const fileName = file.name;
      const mimeType = detectMimeType(fileName);
      const keyName = fileName.replace(/\.[^/.]+$/, '');
      setUploadForm(prev => ({ ...prev, filePath: file.path || fileName, fileName, key: keyName, mimeType }));
      setShowUploadPanel(true);
    }
  }, []);

  const handleUploadSubmit = useCallback(async (e) => {
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
      setBackgroundTasks(prev => prev.filter(t => t.key !== uploadForm.key));
    }
  }, [uploadForm, addLog, handleSelectKey]);

  const filteredRegistry = useMemo(() => {
    return registry.filter(item =>
      item.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [registry, searchQuery]);

  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    setVisibleCount(100);
  }, [searchQuery, registry]);

  const displayedRegistry = useMemo(() => {
    return filteredRegistry.slice(0, visibleCount);
  }, [filteredRegistry, visibleCount]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setVisibleCount(prev => {
        if (prev < filteredRegistry.length) {
          return Math.min(prev + 100, filteredRegistry.length);
        }
        return prev;
      });
    }
  }, [filteredRegistry.length]);

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
            className="absolute inset-0 z-50 flex items-center justify-center bg-m3-surface drag-region overflow-hidden"
          >
            {/* Ambient glow blobs */}
            <div className="absolute top-1/4 left-1/4 w-[35rem] h-[35rem] bg-m3-primary/10 rounded-full blur-[140px] pointer-events-none animate-pulse-subtle"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[35rem] h-[35rem] bg-m3-secondary/10 rounded-full blur-[140px] pointer-events-none animate-pulse-subtle" style={{ animationDelay: '1s' }}></div>

            <div className="w-full max-w-[400px] bg-m3-surface-container/70 backdrop-blur-xl rounded-3xl p-8 flex flex-col gap-8 shadow-2xl no-drag-region border border-m3-outline-variant/20 relative z-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring" }}
                  className="w-16 h-16 rounded-full bg-m3-primary-container flex items-center justify-center mb-1 shadow-lg"
                >
                  <HardDrive className="text-m3-primary" size={32} />
                </motion.div>
                <h1 className="text-3xl font-semibold text-m3-on-surface tracking-tight">Connect</h1>
                <p className="text-sm text-m3-on-surface-variant font-medium">Enter the gRPC server address</p>
              </div>

              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-m3-on-surface-variant font-semibold uppercase tracking-wider px-2">Host Address</label>
                  <input
                    type="text"
                    className="bg-m3-surface-container-high border border-m3-outline-variant/30 rounded-full text-m3-on-surface px-5 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-m3-primary focus:border-transparent transition-all shadow-inner"
                    value={grpcAddress}
                    onChange={(e) => setGrpcAddress(e.target.value)}
                    placeholder="localhost:60945"
                  />
                </div>

                <AnimatePresence>
                  {connectionError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-m3-error-container text-m3-error px-5 py-3 rounded-2xl text-xs font-medium shadow-sm"
                    >
                      {connectionError}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-5 py-3 text-sm font-semibold transition-colors mt-2 flex items-center justify-center gap-2 shadow-md"
                  onClick={connectGrpc}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-3 border-m3-on-primary/30 border-t-m3-on-primary rounded-full animate-spin"></div>
                      Connecting...
                    </>
                  ) : "Connect"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full h-full overflow-hidden flex-col md:flex-row relative"
          >
            <div className={cn(
              "w-full md:w-[280px] bg-m3-surface-container/80 backdrop-blur-lg flex flex-col h-full z-20 transition-transform duration-300 absolute md:relative border-r border-m3-outline-variant/20 shadow-xl md:shadow-none",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
              <div className="px-5 h-12 flex items-center justify-end drag-region relative">
                <h1 className="text-xl font-semibold text-m3-on-surface tracking-tight absolute left-1/2 -translate-x-1/2">
                  qrrot
                </h1>
                <button 
                  className="md:hidden text-m3-on-surface-variant p-1.5 hover:bg-m3-surface-variant rounded-full no-drag-region z-10"
                  onClick={() => setMobileSidebarOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="px-5 py-3 flex flex-col gap-3">
                <div className="flex gap-2 items-center bg-m3-surface-container-high p-1 rounded-full shadow-inner border border-m3-outline-variant/20">
                  <input
                    type="text"
                    className="flex-1 bg-transparent border-none text-m3-on-surface px-3 py-1.5 text-xs font-mono outline-none"
                    value={grpcAddress}
                    onChange={(e) => setGrpcAddress(e.target.value)}
                    placeholder="127.0.0.1:60945"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container rounded-full w-8 h-8 flex items-center justify-center transition-colors shrink-0"
                    onClick={connectGrpc}
                  >
                    <RefreshCw size={14} />
                  </motion.button>
                </div>
              </div>

              <div className="px-5 py-3 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-2 bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-xl py-2.5 text-xs font-bold transition-colors shadow-md"
                  onClick={() => setShowUploadPanel(true)}
                >
                  <Upload size={14} />
                  Upload
                </motion.button>
              </div>

              <div className="px-5 py-2">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-m3-on-surface-variant group-focus-within:text-m3-primary transition-colors" size={16} />
                  <input
                    type="text"
                    className="w-full bg-m3-surface-container-high border border-m3-outline-variant/20 rounded-full text-m3-on-surface pl-10 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-m3-primary transition-all shadow-inner"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keys..."
                  />
                </div>
              </div>

              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1 mt-1 scrollbar-thin"
              >
                {displayedRegistry.map(item => {
                  const isActive = selectedKey?.key === item.key;
                  return (
                    <RegistryItem
                      key={item.key}
                      item={item}
                      isActive={isActive}
                      onClick={handleSelectKey}
                      onDoubleClick={handleDoubleClickKey}
                    />
                  );
                })}
                {filteredRegistry.length > displayedRegistry.length && (
                  <div className="text-center py-3 text-[11px] text-m3-on-surface-variant/60 font-mono">
                    showing {displayedRegistry.length} of {filteredRegistry.length} keys...
                  </div>
                )}
                {filteredRegistry.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 text-m3-on-surface-variant text-xs font-medium">
                    No items found
                  </motion.div>
                )}
              </motion.div>
            </div>

            <div className="flex-1 flex flex-col h-full min-h-0 bg-m3-surface rounded-none md:rounded-tl-3xl overflow-hidden relative shadow-2xl">
              
              <div className="h-20 px-5 md:px-8 flex items-center justify-between drag-region shrink-0 border-b border-m3-outline-variant/10 bg-m3-surface/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                  {!mobileSidebarOpen && (
                    <button 
                      className="md:hidden text-m3-on-surface-variant p-1.5 hover:bg-m3-surface-variant rounded-full no-drag-region"
                      onClick={() => setMobileSidebarOpen(true)}
                    >
                      <Search size={18} />
                    </button>
                  )}
                  <div className="flex flex-col">
                    <h2 className="text-lg md:text-xl font-semibold text-m3-on-surface tracking-tight truncate max-w-[150px] md:max-w-[300px]">
                      {selectedKey ? selectedKey.key : 'Select an item'}
                    </h2>
                    {selectedKey && (
                      <p className="text-[11px] text-m3-on-surface-variant font-medium">
                        {selectedKey.mimeType} • {formatBytes(selectedKey.size)}
                      </p>
                    )}
                  </div>
                </div>

                {selectedKey && (
                  <div className="flex items-center gap-2 no-drag-region overflow-x-auto hide-scrollbar pb-1 pt-1 pr-2">
                    <div className="flex items-center gap-2 bg-m3-surface-container-high rounded-full px-4 py-2 shadow-inner border border-m3-outline-variant/20 hidden lg:flex">
                      <span className="text-[10px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">Token</span>
                      <input
                        type="password"
                        className="bg-transparent border-none text-m3-on-surface text-xs font-mono outline-none w-24 placeholder-m3-on-surface-variant/50"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shrink-0"
                      onClick={handleViewKey}
                    >
                      <Eye size={14} /> <span className="hidden sm:inline">Decrypt</span>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container rounded-full px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
                      onClick={handleDownloadKey}
                    >
                      <Download size={14} /> <span className="hidden sm:inline">Save</span>
                    </motion.button>

                  </div>
                )}
              </div>

              <div className="flex-1 p-4 md:p-6 flex items-center justify-center overflow-hidden min-h-0 relative bg-m3-surface">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex flex-col items-center gap-6 bg-m3-surface-container-high p-8 rounded-3xl shadow-xl border border-m3-outline-variant/20"
                    >
                      <div className="w-12 h-12 border-4 border-m3-primary/30 border-t-m3-primary rounded-full animate-spin"></div>
                      <div className="text-center w-full">
                        <p className="text-m3-on-surface text-sm font-semibold tracking-wide">{loadingText}</p>
                        {loadingProgress !== null && (
                          <div className="w-56 mt-4 mx-auto">
                            <div className="w-full h-2 bg-m3-surface-variant rounded-full overflow-hidden shadow-inner">
                              <div className="h-full bg-m3-primary transition-all duration-300 ease-out relative overflow-hidden" style={{ width: `${loadingProgress}%` }}>
                                <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                              </div>
                            </div>
                            <div className="text-xs font-mono text-m3-on-surface-variant mt-2 text-center bg-m3-surface px-3 py-1 rounded-full inline-block shadow-sm">
                              {loadingProgress}%
                            </div>
                          </div>
                        )}
                        <div className="flex gap-3 justify-center mt-6">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={moveToBackground}
                            className="bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
                          >
                            Background
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleCancelTask(selectedKey?.key || uploadForm.key)}
                            className="bg-m3-error-container hover:bg-m3-error-container/80 text-m3-error rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
                          >
                            Cancel
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ) : viewerData ? (
                    <motion.div 
                      key="viewer"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                      className="w-full h-full bg-m3-surface-container rounded-3xl flex flex-col overflow-hidden relative shadow-2xl border border-m3-outline-variant/20"
                    >
                      {viewerData.type === 'text' && (
                        <pre className="flex-1 p-6 font-mono text-[12px] text-m3-on-surface overflow-auto whitespace-pre-wrap select-text leading-relaxed bg-[#141414] scrollbar-thin">
                          {viewerData.text}
                        </pre>
                      )}
                      {viewerData.type === 'image' && (
                        <div className="flex-1 flex items-center justify-center overflow-hidden relative p-6 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZvAXgAAnI8P/mCT+A/EQzYRgNCvA1yWj22H0DAw2DQBvFw4zEw/a+QAAAABJRU5ErkJggg==')]">
                          <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} src={viewerData.url} alt={selectedKey?.key} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
                        </div>
                      )}
                      {viewerData.type === 'video' && (
                        <div className="flex-1 flex items-center justify-center overflow-hidden relative p-4 bg-black">
                          <video src={viewerData.url} controls autoPlay className="max-w-full max-h-full rounded-xl outline-none shadow-2xl" />
                        </div>
                      )}
                      {viewerData.type === 'audio' && (
                        <div className="flex-1 flex items-center justify-center relative p-6">
                          <div className="flex flex-col items-center gap-8 p-10 bg-m3-surface-container-high rounded-3xl w-[320px] shadow-2xl border border-m3-outline-variant/20">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-m3-primary-container to-m3-tertiary-container flex items-center justify-center text-m3-primary shadow-inner animate-pulse-subtle">
                              <Music size={48} />
                            </div>
                            <audio src={viewerData.url} controls autoPlay className="w-full outline-none" />
                          </div>
                        </div>
                      )}
                      {viewerData.type === 'pdf' && (
                        <div className="flex-1 flex items-center justify-center overflow-hidden relative p-4 bg-m3-surface-container-high">
                          <embed src={viewerData.url} type="application/pdf" className="w-full h-full rounded-xl shadow-2xl" />
                        </div>
                      )}
                      {viewerData.type === 'binary' && (
                        <div className="flex-1 flex items-center justify-center relative p-6">
                          <div className="flex flex-col items-center gap-5 text-center bg-m3-surface-container-high p-10 rounded-3xl shadow-xl border border-m3-outline-variant/20">
                            <div className="w-20 h-20 rounded-full bg-m3-tertiary-container flex items-center justify-center text-m3-tertiary mb-1 shadow-inner">
                              <Box size={40} />
                            </div>
                            <div>
                              <p className="text-xl font-semibold text-m3-on-surface">Binary File</p>
                              <p className="text-xs text-m3-on-surface-variant font-mono mt-2 bg-m3-surface px-3 py-1 rounded-full inline-block shadow-sm">{viewerData.mimeType}</p>
                            </div>
                            <motion.button 
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full px-6 py-3 text-sm font-semibold transition-colors mt-4 flex items-center gap-2 shadow-lg" 
                              onClick={handleDownloadKey}
                            >
                              <Download size={18} /> Download File
                            </motion.button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center flex flex-col items-center gap-6 relative"
                    >
                      {/* Premium background blur blob in empty state */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-m3-primary/5 rounded-full blur-[120px] pointer-events-none animate-pulse-subtle"></div>
                      
                      <div className="w-32 h-32 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-surface-variant shadow-inner border border-m3-outline-variant/10 relative z-10">
                        <Box size={48} />
                      </div>
                      <p className="text-sm font-medium text-m3-on-surface-variant max-w-[240px] leading-relaxed relative z-10">
                        Select an item to preview or upload a new file
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {showUploadPanel && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 20 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="w-full max-w-[460px] bg-m3-surface-container/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col gap-6 shadow-2xl border border-m3-outline-variant/30"
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-semibold text-m3-on-surface tracking-tight">
                          Upload Data
                        </h3>
                        <motion.button 
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          whileTap={{ scale: 0.9 }}
                          className="text-m3-on-surface-variant hover:bg-m3-surface-variant hover:text-m3-on-surface rounded-full w-10 h-10 flex items-center justify-center transition-colors" 
                          onClick={() => setShowUploadPanel(false)}
                        >
                          <X size={20} />
                        </motion.button>
                      </div>

                      <div
                        className={cn(
                          "border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center gap-4",
                          dragActive ? "border-m3-primary bg-m3-primary-container/20 shadow-inner" : "border-m3-outline-variant hover:bg-m3-surface-container-high hover:border-m3-outline"
                        )}
                        onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={selectUploadFile}
                      >
                        <motion.div 
                          animate={{ y: dragActive ? -10 : 0 }}
                          className="w-16 h-16 rounded-full bg-m3-primary-container flex items-center justify-center text-m3-primary mb-1 shadow-sm"
                        >
                          <FileUp size={32} />
                        </motion.div>
                        {uploadForm.fileName ? (
                          <div>
                            <p className="font-semibold text-base text-m3-on-surface">{uploadForm.fileName}</p>
                            <p className="text-[11px] font-medium text-m3-on-surface-variant mt-2 bg-m3-surface px-3 py-1 rounded-full inline-block">Click to change file</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-lg font-semibold text-m3-on-surface">Drag & drop or browse</p>
                            <p className="text-[11px] font-medium text-m3-on-surface-variant mt-1.5">Any file size supported</p>
                          </div>
                        )}
                      </div>

                      <form onSubmit={handleUploadSubmit} className="flex flex-col gap-5">
                        <div className="flex flex-col md:flex-row gap-4">
                          <div className="flex-1 flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-m3-on-surface-variant px-2">Key Name</label>
                            <input
                              type="text" required value={uploadForm.key}
                              onChange={(e) => setUploadForm(prev => ({ ...prev, key: e.target.value }))}
                              placeholder="e.g. docs"
                              className="bg-m3-surface-container-high border border-m3-outline-variant/20 rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary shadow-inner transition-all"
                            />
                          </div>
                          <div className="flex-1 flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-m3-on-surface-variant px-2">MIME Type</label>
                            <input
                              type="text" required value={uploadForm.mimeType}
                              onChange={(e) => setUploadForm(prev => ({ ...prev, mimeType: e.target.value }))}
                              placeholder="image/png"
                              className="bg-m3-surface-container-high border border-m3-outline-variant/20 rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary shadow-inner transition-all"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-m3-on-surface-variant px-2">Encryption Token</label>
                          <input
                            type="password" value={uploadForm.token}
                            onChange={(e) => setUploadForm(prev => ({ ...prev, token: e.target.value }))}
                            placeholder="Optional AES token"
                            className="bg-m3-surface-container-high border border-m3-outline-variant/20 rounded-full text-m3-on-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-m3-primary shadow-inner transition-all"
                          />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="submit" disabled={!uploadForm.key || !uploadForm.filePath}
                          className="bg-m3-primary hover:bg-m3-primary/90 disabled:opacity-50 text-m3-on-primary rounded-full px-5 py-3 text-base font-semibold transition-colors mt-2 w-full shadow-md"
                        >
                          Start Upload
                        </motion.button>
                      </form>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {promptOpen && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 15 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 15 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="w-full max-w-[380px] bg-m3-surface-container/90 backdrop-blur-xl rounded-3xl p-6 flex flex-col gap-5 shadow-2xl border border-m3-outline-variant/30 relative"
                    >
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-lg font-semibold text-m3-on-surface tracking-tight">
                          Decrypt key:
                        </h3>
                        <p className="text-xs text-m3-primary font-mono truncate px-2.5 py-1 bg-m3-primary-container/20 rounded-md border border-m3-primary/10 select-all">
                          {promptKey?.key}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-m3-on-surface-variant px-1">
                          Encryption Token
                        </label>
                        <input
                          type="password"
                          autoFocus
                          className="bg-m3-surface-container-high border border-m3-outline-variant/20 rounded-full text-m3-on-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-m3-primary focus:border-transparent transition-all shadow-inner font-mono"
                          placeholder="Optional AES token"
                          value={promptTokenValue}
                          onChange={(e) => setPromptTokenValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handlePromptSubmit(promptTokenValue);
                            }
                          }}
                        />
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex gap-2">
                          <motion.button
                            data-testid="modal-decrypt-btn"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handlePromptSubmit(promptTokenValue)}
                            className="flex-1 bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary rounded-full py-2.5 text-xs font-bold shadow-md transition-colors"
                          >
                            Decrypt
                          </motion.button>
                          <motion.button
                            data-testid="modal-skip-btn"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handlePromptSubmit('')}
                            className="flex-1 bg-m3-surface-variant hover:bg-m3-surface-variant/80 text-m3-on-surface rounded-full py-2.5 text-xs font-bold border border-m3-outline-variant/30 transition-colors"
                          >
                            Skip
                          </motion.button>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setPromptOpen(false)}
                          className="w-full bg-transparent hover:bg-m3-surface-variant/30 text-m3-on-surface-variant rounded-full py-2 text-xs font-medium transition-colors"
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Tasks Widget */}
      {backgroundTasks.length > 0 && (
        <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-3 w-80 max-h-96 overflow-y-auto bg-m3-surface-container-high border border-m3-outline-variant/30 rounded-3xl p-4 shadow-2xl">
          <div className="flex justify-between items-center border-b border-m3-outline-variant/10 pb-2">
            <span className="text-xs font-bold text-m3-on-surface uppercase tracking-wider">Active Tasks ({backgroundTasks.length})</span>
          </div>
          <div className="flex flex-col gap-3">
            {backgroundTasks.map(task => (
              <div key={task.key} className="flex flex-col gap-1.5 p-2 rounded-2xl bg-m3-surface/40 border border-m3-outline-variant/10">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-semibold text-m3-on-surface truncate flex-1">{task.key}</span>
                  <button 
                    onClick={() => handleCancelTask(task.key)}
                    className="p-1 hover:bg-m3-error-container hover:text-m3-error rounded-full transition-colors shrink-0 text-m3-on-surface-variant"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="text-[10px] text-m3-on-surface-variant font-medium">
                  {task.type === 'upload' ? 'Uploading' : 'Downloading'}...
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-m3-surface-variant rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-m3-primary transition-all duration-300 ease-out" 
                      style={{ width: `${task.progress}%` }} 
                    />
                  </div>
                  <span className="text-[10px] font-mono text-m3-on-surface-variant shrink-0">
                    {task.isPercent === false ? `${task.loadedKb} KB` : `${task.progress}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

