const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connect: (address) => ipcRenderer.invoke('grpc:connect', address),
  exists: (key) => ipcRenderer.invoke('grpc:exists', key),
  del: (key) => ipcRenderer.invoke('grpc:del', key),
  put: (args) => ipcRenderer.invoke('grpc:put', args),
  get: (args) => ipcRenderer.invoke('grpc:get', args),
  getSave: (args) => ipcRenderer.invoke('grpc:get:save', args),
  getMemory: (args) => ipcRenderer.invoke('grpc:get:memory', args),

  getRegistry: () => ipcRenderer.invoke('registry:list'),
  addRegistry: (entry) => ipcRenderer.invoke('registry:add', entry),
  removeRegistry: (key) => ipcRenderer.invoke('registry:remove', key),

  openFileDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:save', options),

  authorizeDrop: (file) => {
    if (webUtils && webUtils.getPathForFile) {
      const path = webUtils.getPathForFile(file);
      if (path) {
        return ipcRenderer.invoke('dialog:authorizeDrop', path);
      }
    }
    return Promise.resolve(false);
  },

  onUploadProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('upload-progress', listener);
    return () => ipcRenderer.off('upload-progress', listener);
  },
  onDownloadProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.off('download-progress', listener);
  }
});
