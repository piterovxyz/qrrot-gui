import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Using vi.mock with an inline factory works in vitest if we are using ES modules, but main is CJS.
// Let's use Vitest's recommended way for CJS: vi.mock + vi.importActual / static object
const electronMock = {
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
vi.mock('electron', () => electronMock);

vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
  },
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
}));

vi.mock('@grpc/grpc-js', () => ({
  connectivityState: {
    TRANSIENT_FAILURE: 'TRANSIENT_FAILURE',
    SHUTDOWN: 'SHUTDOWN'
  },
  credentials: {
    createInsecure: vi.fn()
  },
  loadPackageDefinition: vi.fn(() => ({
    qrrot: {
      v1: {
        QrrotService: vi.fn()
      }
    }
  }))
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn()
}));


describe('writeRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should catch and log error when fs.writeFileSync throws', async () => {
    process.env.NODE_ENV = 'test';
    // Use dynamic import instead of require
    const mainModule = await import('./main.js');

    fs.writeFileSync.mockImplementation(() => {
      throw new Error('Disk full');
    });
    mainModule.writeRegistry({});
    expect(console.error).toHaveBeenCalledWith('failed to write registry:', expect.any(Error));
  });
});
