const { vi } = require('vitest');
module.exports = {
  app: {
    getPath: vi.fn(() => '/mock/path'),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    isPackaged: false,
  },
  BrowserWindow: Object.assign(vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      send: vi.fn(),
    },
  })), {
    getAllWindows: vi.fn(() => []),
  }),
  ipcMain: {
    handle: vi.fn(),
  },
  protocol: {
    handle: vi.fn(),
  },
  net: {
    fetch: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
};
