import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import module from 'module';

const mockElectron = {
  app: {
    getPath: vi.fn(function () { return '/mock/path'; }),
    whenReady: vi.fn(function () { return Promise.resolve(); }),
    on: vi.fn(function () {}),
    isPackaged: false
  },
  BrowserWindow: Object.assign(
    vi.fn(function () {
      return {
        loadURL: vi.fn(function () {}),
        loadFile: vi.fn(function () {}),
        webContents: {
          openDevTools: vi.fn(function () {}),
          send: vi.fn(function () {})
        }
      };
    }),
    {
      getAllWindows: vi.fn(function () { return []; })
    }
  ),
  ipcMain: {
    handle: vi.fn(function (channel, handler) {
      if (channel === 'grpc:connect') {
        global.grpcConnectHandler = handler;
      }
    })
  },
  protocol: { 
    handle: vi.fn(function () {}),
    registerSchemesAsPrivileged: vi.fn(function () {})
  },
  net: { fetch: vi.fn(function () {}) },
  dialog: {
    showOpenDialog: vi.fn(function () {}),
    showSaveDialog: vi.fn(function () {})
  }
};

// Override require for electron BEFORE requiring main.js
const originalRequire = module.prototype.require;
module.prototype.require = function(id) {
  if (id === 'electron') {
    return mockElectron;
  }
  return originalRequire.apply(this, arguments);
};

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
  // Restore original require when done
  module.prototype.require = originalRequire;
});

process.env.NODE_ENV = 'test';
const main = require('./main.js');

describe('readRegistry edge cases', () => {
  let readFileSpy;
  let writeFileSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    readFileSpy = vi.spyOn(fs.promises, 'readFile');
    writeFileSpy = vi.spyOn(fs.promises, 'writeFile');
  });

  afterEach(() => {
    readFileSpy.mockRestore();
    writeFileSpy.mockRestore();
  });

  it('should return an empty array when fs.promises.readFile throws an error', async () => {
    readFileSpy.mockRejectedValue(new Error('Mock read error'));

    const result = await main.readRegistry();
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('failed to read registry:', expect.any(Error));
  });

  it('should return an empty array when JSON.parse throws an error', async () => {
    readFileSpy.mockResolvedValue('invalid-json');

    const result = await main.readRegistry();
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('failed to read registry:', expect.any(SyntaxError));
  });

  it('should return an empty array when file does not exist', async () => {
    const enoentError = new Error('ENOENT');
    enoentError.code = 'ENOENT';
    readFileSpy.mockRejectedValue(enoentError);

    const result = await main.readRegistry();
    expect(result).toEqual([]);
  });

  it('should return parsed data when valid JSON is read', async () => {
    const mockData = [{ key: 'test', value: 'data' }];
    readFileSpy.mockResolvedValue(JSON.stringify(mockData));

    const result = await main.readRegistry();
    expect(result).toEqual(mockData);
  });
});

describe('grpc:connect handler', () => {
  let grpcConnectHandler;

  beforeAll(() => {
    grpcConnectHandler = global.grpcConnectHandler;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when protoLoader throws', async () => {
    expect(grpcConnectHandler).toBeDefined();

    const protoLoader = require('@grpc/proto-loader');
    const spy = vi.spyOn(protoLoader, 'loadSync').mockImplementation(function () {
      throw new Error('Mock proto load error');
    });

    const result = await grpcConnectHandler({}, 'localhost:50053');
    expect(result).toEqual({ success: false, error: 'Mock proto load error' });
    spy.mockRestore();
  });

  it('should return error when grpc.loadPackageDefinition throws', async () => {
    expect(grpcConnectHandler).toBeDefined();

    const grpc = require('@grpc/grpc-js');
    const spy = vi.spyOn(grpc, 'loadPackageDefinition').mockImplementation(function () {
      throw new Error('Mock grpc load error');
    });

    const result = await grpcConnectHandler({}, 'localhost:50054');
    expect(result).toEqual({ success: false, error: 'Mock grpc load error' });
    spy.mockRestore();
  });
});

describe('generateGibberish utility', () => {
  it('should generate printable ASCII chars for text mime types', () => {
    const data = main.generateGibberish(100, 'text/plain');
    expect(data.length).toBe(100);
    const str = data.toString('utf8');
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      expect(code).toBeGreaterThanOrEqual(9);
      expect(code).toBeLessThanOrEqual(126);
    }
  });

  it('should generate random binary bytes for non-text mime types', () => {
    const data = main.generateGibberish(100, 'image/png');
    expect(data.length).toBe(100);
    let nonTextCount = 0;
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte > 126 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
        nonTextCount++;
      }
    }
    expect(nonTextCount).toBeGreaterThan(0);
  });
});
