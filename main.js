const { app, BrowserWindow, ipcMain, protocol, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

let mainWindow;
let grpcClient = null;

const registryPath = path.join(app.getPath('userData'), 'qrrot_registry.json');

function readRegistry() {
  try {
    if (!fs.existsSync(registryPath)) {
      return [];
    }
    const data = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('failed to read registry:', err);
    return [];
  }
}

function writeRegistry(data) {
  try {
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('failed to write registry:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('qrrot-media', (request) => {
    const rawPath = request.url.slice('qrrot-media://'.length);
    const decodedPath = decodeURIComponent(rawPath);
    return net.fetch(url.pathToFileURL(decodedPath).toString());
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('grpc:connect', async (event, address) => {
  try {
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, 'proto/qrrot.proto'),
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      }
    );
    const qrrotProto = grpc.loadPackageDefinition(packageDefinition).qrrot.v1;
    
    if (grpcClient) {
      grpcClient.close();
    }

    grpcClient = new qrrotProto.QrrotService(
      address,
      grpc.credentials.createInsecure()
    );

    return new Promise((resolve) => {
      const state = grpcClient.getChannel().getConnectivityState(true);
      resolve({ success: true, state });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('grpc:exists', async (event, key) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));
    grpcClient.exists({ key }, (err, res) => {
      if (err) return reject(err);
      resolve(res.exists);
    });
  });
});

ipcMain.handle('grpc:del', async (event, key) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));
    grpcClient.del({ key }, (err, res) => {
      if (err) return reject(err);
      resolve(res.status);
    });
  });
});

ipcMain.handle('grpc:put', async (event, { key, filePath, mimeType, token }) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));
    if (!fs.existsSync(filePath)) return reject(new Error('file does not exist'));

    const fileStats = fs.statSync(filePath);
    const totalSize = fileStats.size;

    const call = grpcClient.put((err, res) => {
      if (err) return reject(err);
      resolve({ status: res.status, size: totalSize });
    });

    call.write({
      metadata: { key, mime_type: mimeType },
      token: token
    });

    const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let bytesUploaded = 0;

    readStream.on('data', (chunk) => {
      bytesUploaded += chunk.length;
      mainWindow.webContents.send('upload-progress', { key, loaded: bytesUploaded, total: totalSize });
      
      call.write({
        chunk: chunk,
        token: token
      });
    });

    readStream.on('end', () => {
      call.end();
    });

    readStream.on('error', (err) => {
      call.destroy(err);
      reject(err);
    });
  });
});

ipcMain.handle('grpc:get', async (event, { key, token, savePath }) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));

    const call = grpcClient.get({ key, token });
    let writeStream = null;
    let resolvedPath = savePath;
    let mimeType = '';
    let bytesDownloaded = 0;

    call.on('data', (res) => {
      if (res.metadata) {
        mimeType = res.metadata.mime_type;
        if (!resolvedPath) {
          const tempDir = app.getPath('temp');
          const ext = path.extname(key) || `.${mimeType.split('/')[1] || 'bin'}`;
          resolvedPath = path.join(tempDir, `qrrot_${Date.now()}_${key}${ext}`);
        }
        writeStream = fs.createWriteStream(resolvedPath);
        writeStream.on('error', (err) => {
          reject(err);
        });
      } else if (res.chunk) {
        bytesDownloaded += res.chunk.length;
        mainWindow.webContents.send('download-progress', { key, loaded: bytesDownloaded });
        if (writeStream) {
          writeStream.write(res.chunk);
        }
      }
    });

    call.on('end', () => {
      if (writeStream) {
        writeStream.end(() => {
          resolve({ filePath: resolvedPath, mimeType, size: bytesDownloaded });
        });
      } else {
        reject(new Error('key not found or invalid response'));
      }
    });

    call.on('error', (err) => {
      if (writeStream) {
        writeStream.destroy();
      }
      reject(err);
    });
  });
});

ipcMain.handle('registry:list', async () => {
  return readRegistry();
});

ipcMain.handle('registry:add', async (event, entry) => {
  const registry = readRegistry();
  const index = registry.findIndex(e => e.key === entry.key);
  if (index >= 0) {
    registry[index] = { ...registry[index], ...entry, dateUpdated: new Date().toISOString() };
  } else {
    registry.push({ ...entry, dateAdded: new Date().toISOString() });
  }
  writeRegistry(registry);
  return registry;
});

ipcMain.handle('registry:remove', async (event, key) => {
  const registry = readRegistry();
  const updated = registry.filter(e => e.key !== key);
  writeRegistry(updated);
  return updated;
});

ipcMain.handle('dialog:open', async (event, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('dialog:save', async (event, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});
