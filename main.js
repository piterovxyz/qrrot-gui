const { app, BrowserWindow, ipcMain, protocol, net, dialog } = require('electron');
app.name = 'Qrrot';
const path = require('path');
const fs = require('fs');
const url = require('url');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

let mainWindow;
let grpcClient = null;
const allowedSavePaths = new Set();
const activeCalls = new Map();

function generateGibberish(size, mimeType = '') {
  const bufferSize = Math.min(size || 1024, 10 * 1024 * 1024);
  const buffer = Buffer.alloc(bufferSize);
  const mime = (mimeType || '').toLowerCase();
  const isText = mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript';
  
  if (isText) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n\r\t.,!?-+=*/';
    for (let i = 0; i < bufferSize; i++) {
      buffer[i] = chars.charCodeAt(Math.floor(Math.random() * chars.length));
    }
  } else {
    for (let i = 0; i < bufferSize; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  return buffer;
}

let registryPath;
try {
  const newUserData = app.getPath('userData');
  registryPath = path.join(newUserData, 'qrrot_registry.json');

  if (!fs.existsSync(registryPath)) {
    const oldUserData = path.join(path.dirname(newUserData), 'qrrot-gui');
    const oldRegistryPath = path.join(oldUserData, 'qrrot_registry.json');
    if (fs.existsSync(oldRegistryPath)) {
      try {
        fs.mkdirSync(newUserData, { recursive: true });
        fs.copyFileSync(oldRegistryPath, registryPath);
      } catch (err) {
        console.error('failed to migrate registry:', err);
      }
    }
  }
} catch (e) {
  registryPath = path.join('/mock/path', 'qrrot_registry.json');
}

async function readRegistry() {
  try {
    const data = await fs.promises.readFile(registryPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    console.error('failed to read registry:', err);
    return [];
  }
}

async function writeRegistry(data) {
  try {
    await fs.promises.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('failed to write registry:', err);
  }
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
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

if (app) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'qrrot-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
  ]);

  app.whenReady().then(() => {
    protocol.handle('qrrot-media', async (request) => {
      const urlObj = new URL(request.url);

      if (urlObj.host === 'stream') {
        const key = decodeURIComponent(urlObj.pathname.slice(1));
        const rawToken = urlObj.searchParams.get('token') || '';
        const token = rawToken.replace(/[\x00-\x1f]/g, '');

        if (!grpcClient) {
          return new Response('Not connected', { status: 500 });
        }

        let responseMimeType = 'application/octet-stream';
        let firstChunkReceived = false;
        let resolveResponse;
        let grpcCall = null;

        const responsePromise = new Promise((resolve) => {
          resolveResponse = resolve;
        });

        const readable = new ReadableStream({
          start(controller) {
            grpcCall = grpcClient.get({ key, token });

            grpcCall.on('data', (res) => {
              if (res.metadata) {
                responseMimeType = res.metadata.mime_type;
              } else if (res.chunk) {
                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  resolveResponse(new Response(readable, {
                    headers: { 'Content-Type': responseMimeType }
                  }));
                }

                controller.enqueue(res.chunk);

                if (controller.desiredSize <= 0) {
                  grpcCall.pause();
                }
              }
            });

            grpcCall.on('end', () => {
              if (!firstChunkReceived) {
                resolveResponse(new Response(readable, {
                  headers: { 'Content-Type': responseMimeType }
                }));
              }
              controller.close();
            });

            grpcCall.on('error', (err) => {
              console.error('grpc get error:', err);
              if (!firstChunkReceived) {
                resolveResponse(new Response('Error', { status: 500 }));
              }
              controller.error(err);
            });
          },
          pull() {
            if (grpcCall) {
              grpcCall.resume();
            }
          },
          cancel() {
            if (grpcCall) {
              grpcCall.cancel();
            }
          }
        });

        return responsePromise;
      }

      return new Response('Not found', { status: 404 });
    });

  createWindow();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });
}

let currentGrpcAddress = null;
const allowedFilePaths = new Set();

if (ipcMain) {
ipcMain.handle('grpc:connect', async (event, address) => {
  try {
    activeCalls.clear();
    const protoPath = path.join(__dirname, 'proto/qrrot.proto');

    const packageDefinition = protoLoader.loadSync(
      protoPath,
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

    let credentials = grpc.credentials.createInsecure();
    let cleanAddress = address;
    if (address.startsWith('grpcs://')) {
      cleanAddress = address.slice(8);
      credentials = grpc.credentials.createSsl();
    } else if (address.startsWith('grpc://')) {
      cleanAddress = address.slice(7);
      credentials = grpc.credentials.createInsecure();
    }

    grpcClient = new qrrotProto.QrrotService(
      cleanAddress,
      credentials
    );
    currentGrpcAddress = address;

    const deadline = Date.now() + 3000;
    return new Promise((resolve) => {
      grpcClient.waitForReady(deadline, async (err) => {
        if (err) {
          grpcClient.close();
          grpcClient = null;
          currentGrpcAddress = null;
          resolve({ success: false, error: 'Failed to connect: ' + err.message });
        } else {
          const state = grpcClient.getChannel().getConnectivityState(false);
          resolve({ success: true, state });
        }
      });
    });
  } catch (err) {
    if (grpcClient) {
      grpcClient.close();
      grpcClient = null;
      currentGrpcAddress = null;
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('grpc:keys', async (event, token) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));

    const call = grpcClient.keys({ token: token || "" });
    const keys = [];

    call.on('data', (res) => {
      if (res.keys) {
        const mapped = res.keys.map(k => ({
          key: k.key,
          size: Number(k.size),
          mimeType: k.mime_type || 'application/octet-stream'
        }));
        keys.push(...mapped);
      }
    });

    call.on('end', async () => {
      try {
        const localRegistry = await readRegistry();
        const registryMap = new Map();
        localRegistry.forEach(item => registryMap.set(item.key, item));
        keys.forEach(item => registryMap.set(item.key, item));
        const mergedKeys = Array.from(registryMap.values());
        await writeRegistry(mergedKeys);
        resolve(mergedKeys);
      } catch (err) {
        reject(err);
      }
    });

    call.on('error', (err) => {
      reject(err);
    });
  });
});


ipcMain.handle('grpc:put', async (event, { key, filePath, mimeType, token }) => {
  if (!grpcClient) throw new Error('not connected to grpc server');
  if (!allowedFilePaths.has(filePath)) throw new Error('Unauthorized file path');

  let fileStats;
  try {
    fileStats = await fs.promises.stat(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('file does not exist');
    throw err;
  }

  const totalSize = fileStats.size;

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

    const call = grpcClient.put((err, res) => {
      activeCalls.delete(key);
      if (err) {
        readStream.destroy();
        return reject(err);
      }
      resolve({ status: res.status, size: totalSize });
    });

    activeCalls.set(key, { call, readStream });

    call.write({
      metadata: { key, mime_type: mimeType },
      token: token
    });

    let bytesUploaded = 0;
    let lastProgressSent = 0;

    readStream.on('data', (chunk) => {
      bytesUploaded += chunk.length;
      
      const now = Date.now();
      if (now - lastProgressSent > 100 || bytesUploaded === totalSize) {
        mainWindow.webContents.send('upload-progress', { key, loaded: bytesUploaded, total: totalSize });
        lastProgressSent = now;
      }

      call.write({
        chunk: chunk,
        token: token
      });
    });

    readStream.on('end', () => {
      call.end();
    });

    readStream.on('error', (err) => {
      activeCalls.delete(key);
      call.destroy(err);
      reject(err);
    });

    call.on('error', (err) => {
      activeCalls.delete(key);
      readStream.destroy();
      reject(err);
    });
  });
});


ipcMain.handle('grpc:get:save', async (event, { key, token, savePath, size, mimeType }) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));
    if (!allowedSavePaths.has(savePath)) {
      return reject(new Error('Unauthorized save path'));
    }

    allowedSavePaths.delete(savePath);

    const call = grpcClient.get({ key, token });
    activeCalls.set(key, call);

    let writeStream = null;
    let responseMimeType = mimeType || '';
    let bytesDownloaded = 0;
    const pendingChunks = [];
    let lastProgressSent = 0;

    call.on('data', (res) => {
      if (res.metadata) {
        responseMimeType = res.metadata.mime_type || responseMimeType;
        writeStream = fs.createWriteStream(savePath);
        writeStream.on('error', (err) => {
          activeCalls.delete(key);
          call.cancel();
          reject(err);
        });
        // flush any chunks that arrived before metadata
        while (pendingChunks.length > 0) {
          writeStream.write(pendingChunks.shift());
        }
      } else if (res.chunk) {
        bytesDownloaded += res.chunk.length;
        
        const now = Date.now();
        if (now - lastProgressSent > 100 || (size && bytesDownloaded === size)) {
          mainWindow.webContents.send('download-progress', { key, loaded: bytesDownloaded, total: size || 0 });
          lastProgressSent = now;
        }

        if (writeStream) {
          writeStream.write(res.chunk);
        } else {
          pendingChunks.push(res.chunk);
        }
      }
    });

    call.on('end', () => {
      activeCalls.delete(key);
      mainWindow.webContents.send('download-progress', { key, loaded: bytesDownloaded, total: bytesDownloaded });
      if (writeStream) {
        writeStream.end(() => {
          resolve({ filePath: savePath, mimeType: responseMimeType, size: bytesDownloaded });
        });
      } else if (pendingChunks.length > 0) {
        // metadata never arrived but we got chunks — write them out
        writeStream = fs.createWriteStream(savePath);
        while (pendingChunks.length > 0) {
          writeStream.write(pendingChunks.shift());
        }
        writeStream.end(() => {
          resolve({ filePath: savePath, mimeType: responseMimeType || 'application/octet-stream', size: bytesDownloaded });
        });
      } else {
        reject(new Error('key not found or invalid response'));
      }
    });

    call.on('error', async (err) => {
      activeCalls.delete(key);
      if (writeStream) {
        writeStream.destroy();
      }
      if (err.message && err.message.includes('invalid token')) {
        try {
          const gibberishData = generateGibberish(size || 1024, responseMimeType || 'application/octet-stream');
          await fs.promises.writeFile(savePath, gibberishData);
          resolve({ filePath: savePath, mimeType: responseMimeType || 'application/octet-stream', size: gibberishData.length, isGibberish: true });
        } catch (writeErr) {
          reject(writeErr);
        }
      } else {
        reject(err);
      }
    });
  });
});

ipcMain.handle('grpc:get:memory', async (event, { key, token, size, mimeType }) => {
  return new Promise((resolve, reject) => {
    if (!grpcClient) return reject(new Error('not connected to grpc server'));

    const call = grpcClient.get({ key, token });
    activeCalls.set(key, call);

    let responseMimeType = mimeType || '';
    let bytesDownloaded = 0;
    const chunks = [];
    let lastProgressSent = 0;

    call.on('data', (res) => {
      if (res.metadata) {
        responseMimeType = res.metadata.mime_type || responseMimeType;
      } else if (res.chunk) {
        bytesDownloaded += res.chunk.length;
        chunks.push(res.chunk);
        
        const now = Date.now();
        if (now - lastProgressSent > 100 || (size && bytesDownloaded === size)) {
          mainWindow.webContents.send('download-progress', { key, loaded: bytesDownloaded, total: size || 0 });
          lastProgressSent = now;
        }
      }
    });

    call.on('end', () => {
      activeCalls.delete(key);
      mainWindow.webContents.send('download-progress', { key, loaded: bytesDownloaded, total: bytesDownloaded });
      if (chunks.length > 0 || responseMimeType) {
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const resultBuffer = Buffer.concat(chunks, totalLength);
        resolve({ mimeType: responseMimeType, size: bytesDownloaded, data: resultBuffer });
      } else {
        reject(new Error('key not found or invalid response'));
      }
    });

    call.on('error', (err) => {
      activeCalls.delete(key);
      if (err.message && err.message.includes('invalid token')) {
        const gibberishData = generateGibberish(size || 1024, responseMimeType || 'application/octet-stream');
        resolve({ mimeType: responseMimeType || 'application/octet-stream', size: gibberishData.length, data: gibberishData, isGibberish: true });
      } else {
        reject(err);
      }
    });
  });
});

ipcMain.handle('grpc:cancel', async (event, key) => {
  const entry = activeCalls.get(key);
  if (entry) {
    // entry can be a plain grpc call or { call, readStream } for uploads
    if (entry.call) {
      entry.call.cancel();
      if (entry.readStream) {
        entry.readStream.destroy();
      }
    } else {
      entry.cancel();
    }
    activeCalls.delete(key);
    return { success: true };
  }
  return { success: false, error: 'no active call found' };
});

ipcMain.handle('registry:list', async () => {
  return await readRegistry();
});

ipcMain.handle('registry:add', async (event, entry) => {
  const registry = await readRegistry();
  const index = registry.findIndex(e => e.key === entry.key);
  if (index >= 0) {
    registry[index] = { ...registry[index], ...entry, dateUpdated: new Date().toISOString() };
  } else {
    registry.push({ ...entry, dateAdded: new Date().toISOString() });
  }
  await writeRegistry(registry);
  return registry;
});

ipcMain.handle('registry:remove', async (event, key) => {
  const registry = await readRegistry();
  const updated = registry.filter(e => e.key !== key);
  await writeRegistry(updated);
  return updated;
});

ipcMain.handle('dialog:open', async (event, options) => {
  const res = await dialog.showOpenDialog(mainWindow, options);
  if (!res.canceled) {
    res.filePaths.forEach(p => allowedFilePaths.add(p));
  }
  return res;
});

ipcMain.handle('dialog:save', async (event, options) => {
  const res = await dialog.showSaveDialog(mainWindow, options);
  if (!res.canceled && res.filePath) {
    allowedSavePaths.add(res.filePath);
  }
  return res;
});

ipcMain.handle('dialog:authorizeDrop', async (event, filePath) => {
  if (filePath) {
    allowedFilePaths.add(filePath);
  }
  return true;
});

}

if (process.env.NODE_ENV === 'test') {
  module.exports = { readRegistry, writeRegistry, generateGibberish };
}
