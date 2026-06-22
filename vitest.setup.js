import { vi } from 'vitest';
import module from 'module';

const mockIpcMainHandle = vi.fn();

class MockBrowserWindow {
  constructor() {
    this.loadURL = vi.fn();
    this.loadFile = vi.fn();
    this.webContents = {
      openDevTools: vi.fn(),
      send: vi.fn()
    };
  }
  static getAllWindows() {
    return [];
  }
}

const mockElectron = {
  app: {
    getPath: vi.fn().mockReturnValue('/mock/path'),
    whenReady: vi.fn().mockResolvedValue(),
    on: vi.fn(),
    isPackaged: false
  },
  BrowserWindow: MockBrowserWindow,
  ipcMain: {
    handle: mockIpcMainHandle,
  },
  protocol: { handle: vi.fn() },
  net: { fetch: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
};

const originalRequire = module.prototype.require;
module.prototype.require = function(id) {
  if (id === 'electron') {
    return mockElectron;
  }
  return originalRequire.apply(this, arguments);
};

global.mockIpcMainHandle = mockIpcMainHandle;
global.mockElectron = mockElectron;
