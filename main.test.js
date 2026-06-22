import { test, expect, vi, describe, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('grpc:connect handler', () => {
  let grpcConnectHandler;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Require instead of import to mock CommonJS
    const protoLoader = require('@grpc/proto-loader');
    vi.spyOn(protoLoader, 'loadSync').mockRestore(); // restore previous

    const main = await import('./main.js?t=' + Date.now()); // force reload

    const connectCall = global.mockIpcMainHandle.mock.calls.find(call => call[0] === 'grpc:connect');
    if (connectCall) {
      grpcConnectHandler = connectCall[1];
    }
  });

  afterEach(() => {
    const protoLoader = require('@grpc/proto-loader');
    if (protoLoader.loadSync.mockRestore) {
      protoLoader.loadSync.mockRestore();
    }
    const grpc = require('@grpc/grpc-js');
    if (grpc.loadPackageDefinition.mockRestore) {
      grpc.loadPackageDefinition.mockRestore();
    }
  });

  test('should return error when protoLoader throws', async () => {
    expect(grpcConnectHandler).toBeDefined();

    const protoLoader = require('@grpc/proto-loader');
    vi.spyOn(protoLoader, 'loadSync').mockImplementation(() => {
      throw new Error('Mock proto load error');
    });

    const result = await grpcConnectHandler({}, 'localhost:50053');
    expect(result).toEqual({ success: false, error: 'Mock proto load error' });
  });

  test('should return error when grpc.loadPackageDefinition throws', async () => {
    expect(grpcConnectHandler).toBeDefined();

    const grpc = require('@grpc/grpc-js');
    vi.spyOn(grpc, 'loadPackageDefinition').mockImplementation(() => {
      throw new Error('Mock grpc load error');
    });

    const result = await grpcConnectHandler({}, 'localhost:50054');
    expect(result).toEqual({ success: false, error: 'Mock grpc load error' });
  });
});
