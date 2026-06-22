const fs = require('fs');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/path'),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    isPackaged: false
  },
  BrowserWindow: Object.assign(jest.fn(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    webContents: { openDevTools: jest.fn(), send: jest.fn() }
  })), {
    getAllWindows: jest.fn(() => [])
  }),
  ipcMain: { handle: jest.fn() },
  protocol: { handle: jest.fn() },
  net: { fetch: jest.fn() },
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() }
}));

jest.mock('fs', () => {
  return {
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn()
  };
});

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

process.env.NODE_ENV = 'test';
const main = require('./main.js');

describe('readRegistry edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return an empty array when fs.readFileSync throws an error', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation(() => {
      throw new Error('Mock read error');
    });

    const result = main.readRegistry();
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('failed to read registry:', expect.any(Error));
  });

  it('should return an empty array when JSON.parse throws an error', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('invalid-json');

    const result = main.readRegistry();
    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('failed to read registry:', expect.any(SyntaxError));
  });

  it('should return an empty array when file does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    const result = main.readRegistry();
    expect(result).toEqual([]);
  });

  it('should return parsed data when valid JSON is read', () => {
    const mockData = [{ key: 'test', value: 'data' }];
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

    const result = main.readRegistry();
    expect(result).toEqual(mockData);
  });
});
