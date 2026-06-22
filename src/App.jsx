import React, { useState, useEffect, useRef } from 'react';

const MIME_ICONS = {
  image: '📷',
  video: '🎬',
  audio: '🎵',
  text: '📄',
  json: '⚙️',
  binary: '📦'
};

function getIcon(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return MIME_ICONS.image;
  if (mime.startsWith('video/')) return MIME_ICONS.video;
  if (mime.startsWith('audio/')) return MIME_ICONS.audio;
  if (mime.startsWith('text/')) return MIME_ICONS.text;
  if (mime === 'application/json') return MIME_ICONS.json;
  return MIME_ICONS.binary;
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'kb', 'mb', 'gb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

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
  const consoleEndRef = useRef(null);

  const addLog = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, text, type }]);
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    fetchRegistry();
    connectGrpc();
  }, []);

  useEffect(() => {
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
    try {
      const list = await window.electronAPI.getRegistry();
      setRegistry(list);
    } catch (err) {
      addLog(`failed to load registry: ${err.message}`, 'error');
    }
  };

  const connectGrpc = async () => {
    addLog(`connecting to ${grpcAddress}...`, 'info');
    try {
      const res = await window.electronAPI.connect(grpcAddress);
      if (res.success) {
        setConnected(true);
        addLog('connected to grpc server', 'success');
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
    addLog(`selected: ${entry.key}`, 'info');
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
    try {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingText(`decrypting '${selectedKey.key}'...`);
      setViewerData(null);

      const res = await window.electronAPI.get({ key: selectedKey.key, token });
      const type = detectViewerType(res.mimeType);
      let textContent = '';

      if (type === 'text') {
        const response = await fetch(`qrrot-media://${res.filePath}`);
        textContent = await response.text();
      }

      setViewerData({
        type,
        mimeType: res.mimeType,
        size: res.size,
        url: `qrrot-media://${res.filePath}`,
        text: textContent
      });
      addLog(`decrypted '${selectedKey.key}' (${res.size} bytes)`, 'success');
    } catch (err) {
      addLog(`decrypt failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
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

      const res = await window.electronAPI.get({
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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const filePath = file.path;
      const fileName = file.name;
      const mimeType = detectMimeType(fileName);
      const keyName = fileName.replace(/\.[^/.]+$/, '');
      setUploadForm(prev => ({ ...prev, filePath, fileName, key: keyName, mimeType }));
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
    <div className="app-container">
      <div className="bg-glow glow-1"></div>
      <div className="bg-glow glow-2"></div>

      <div className="sidebar">
        <div className="brand">
          <h1>qrrot gui</h1>
        </div>

        <div className="connection-panel">
          <div className="status-indicator">
            <span className={`status-dot ${connected ? 'status-connected' : 'status-disconnected'}`}></span>
            {connected ? 'connected' : 'disconnected'}
          </div>
          <div className="conn-input-group">
            <input
              type="text" className="input-text" value={grpcAddress}
              onChange={(e) => setGrpcAddress(e.target.value)} placeholder="localhost:60945"
            />
            <button className="btn btn-secondary" onClick={connectGrpc}>connect</button>
          </div>
        </div>

        <div className="registry-header">
          <h2>data index</h2>
          <button className="btn" onClick={() => setShowUploadPanel(true)}>+ upload</button>
        </div>

        <div className="search-box">
          <input
            type="text" className="input-text" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} placeholder="search keys..."
          />
        </div>

        <div className="registry-list">
          {filteredRegistry.map(item => (
            <div
              key={item.key}
              className={`registry-item ${selectedKey?.key === item.key ? 'active' : ''}`}
              onClick={() => handleSelectKey(item)}
            >
              <div className="file-icon">{getIcon(item.mimeType)}</div>
              <div className="file-meta">
                <div className="file-name">{item.key}</div>
                <div className="file-sub">
                  <span>{formatBytes(item.size)}</span>
                  <span>•</span>
                  <span>{item.mimeType.split('/')[1] || 'binary'}</span>
                </div>
              </div>
            </div>
          ))}
          {filteredRegistry.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              no keys in registry
            </div>
          )}
        </div>
      </div>

      <div className="workspace">
        <div className="workspace-header">
          <div className="selected-title">
            <h2>{selectedKey ? selectedKey.key : 'no key selected'}</h2>
            {selectedKey && (
              <p>{selectedKey.mimeType} • {formatBytes(selectedKey.size)}</p>
            )}
          </div>
          {selectedKey && (
            <div className="action-bar">
              <div className="token-input-group">
                <span>token</span>
                <input
                  type="password" className="token-input" value={token}
                  onChange={(e) => setToken(e.target.value)} placeholder="aes decryption key"
                />
              </div>
              <button className="btn" onClick={handleViewKey}>decrypt & view</button>
              <button className="btn btn-secondary" onClick={handleDownloadKey}>save as</button>
              <button className="btn btn-secondary" onClick={handleCheckExists}>exists?</button>
              <button className="btn btn-secondary btn-danger" onClick={handleDeleteKey}>delete</button>
            </div>
          )}
        </div>

        <div className="viewport">
          {loading ? (
            <div className="spinner-container">
              <div className="spin-wheel"></div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{loadingText}</p>
              {loadingProgress !== null && (
                <div style={{ width: '200px', textAlign: 'center' }}>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${loadingProgress}%` }}></div>
                  </div>
                  <div className="progress-text">{loadingProgress}%</div>
                </div>
              )}
            </div>
          ) : viewerData ? (
            <div className="view-card">
              {viewerData.type === 'text' && <pre className="text-viewer">{viewerData.text}</pre>}
              {viewerData.type === 'image' && (
                <div className="media-viewer"><img src={viewerData.url} alt={selectedKey?.key} /></div>
              )}
              {viewerData.type === 'video' && (
                <div className="media-viewer"><video src={viewerData.url} controls autoPlay /></div>
              )}
              {viewerData.type === 'audio' && (
                <div className="media-viewer">
                  <div className="audio-player-container">
                    <div className="audio-disc">🎵</div>
                    <audio src={viewerData.url} controls autoPlay />
                  </div>
                </div>
              )}
              {viewerData.type === 'binary' && (
                <div className="media-viewer">
                  <div className="binary-fallback">
                    <div className="binary-icon">📦</div>
                    <p style={{ color: 'var(--text-secondary)' }}>binary file / unsupported preview</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{viewerData.mimeType}</p>
                    <button className="btn btn-secondary" onClick={handleDownloadKey} style={{ marginTop: '10px' }}>
                      download file
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="idle-screen">
              <div className="idle-icon">⚡</div>
              <p>select an item from the index and insert decryption token, or upload a new file.</p>
            </div>
          )}
        </div>

        {showUploadPanel && (
          <div className="uploader-panel">
            <div className="uploader-card">
              <div className="uploader-title">
                <h3>upload new key</h3>
                <button className="btn btn-secondary" onClick={() => setShowUploadPanel(false)}>close</button>
              </div>
              <div
                className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag} onDragOver={handleDrag}
                onDragLeave={handleDrag} onDrop={handleDrop} onClick={selectUploadFile}
              >
                <div className="drop-zone-icon">📥</div>
                {uploadForm.fileName ? (
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--cyan)' }}>{uploadForm.fileName}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>click or drop another file to change</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.9rem' }}>drag & drop a file here, or click to browse</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>supports files up to any size (streamed in chunks)</p>
                  </div>
                )}
              </div>
              <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label>key name</label>
                    <input
                      type="text" required value={uploadForm.key}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, key: e.target.value }))}
                      placeholder="e.g. users_photo"
                    />
                  </div>
                  <div className="form-group">
                    <label>mime type</label>
                    <input
                      type="text" required value={uploadForm.mimeType}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, mimeType: e.target.value }))}
                      placeholder="e.g. image/png"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>encryption token (aes-ctr)</label>
                  <input
                    type="password" value={uploadForm.token}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, token: e.target.value }))}
                    placeholder="token to derive key from"
                  />
                </div>
                <button
                  type="submit" className="btn"
                  disabled={!uploadForm.key || !uploadForm.filePath}
                  style={{ width: '100%', padding: '10px', fontSize: '0.95rem' }}
                >
                  start secure upload
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="console-panel">
          {logs.map((log, idx) => (
            <div key={idx} className="console-line">
              <span className="console-time">[{log.timestamp}]</span>
              <span className={`console-${log.type}`}>{log.text}</span>
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}
