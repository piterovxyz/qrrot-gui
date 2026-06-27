import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from './App';

// Mock Electron API
const mockElectronAPI = {
  onUploadProgress: vi.fn(() => vi.fn()),
  onDownloadProgress: vi.fn(() => vi.fn()),
  getRegistry: vi.fn(),
  connect: vi.fn(),


  removeRegistry: vi.fn(),
  getMemory: vi.fn(),
  saveFileDialog: vi.fn(),
  getSave: vi.fn(),
  openFileDialog: vi.fn(),
  put: vi.fn(),
  addRegistry: vi.fn(),
  getKeys: vi.fn()
};

beforeEach(() => {
  window.electronAPI = mockElectronAPI;

  // Setup standard mock responses
  mockElectronAPI.getRegistry.mockResolvedValue([
    { key: 'test1', mimeType: 'text/plain', size: 100 },
    { key: 'test2', mimeType: 'image/png', size: 2048 },
    { key: 'test3', mimeType: 'video/mp4', size: 1048576 } // 1MB
  ]);
  mockElectronAPI.getKeys.mockResolvedValue([
    { key: 'test1', mimeType: 'text/plain', size: 100 },
    { key: 'test2', mimeType: 'image/png', size: 2048 },
    { key: 'test3', mimeType: 'video/mp4', size: 1048576 } // 1MB
  ]);

  mockElectronAPI.connect.mockResolvedValue({ success: true, cached: false });


  mockElectronAPI.removeRegistry.mockResolvedValue([
    { key: 'test2', mimeType: 'image/png', size: 2048 },
    { key: 'test3', mimeType: 'video/mp4', size: 1048576 }
  ]);
  mockElectronAPI.getMemory.mockResolvedValue({
    data: new Uint8Array(),
    mimeType: 'text/plain',
    size: 0
  });

  // Mock window features
  window.confirm = vi.fn(() => true);
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

const setupConnected = async () => {
  render(<App />);
  const connectBtn = screen.getByRole('button', { name: /connect/i });
  fireEvent.click(connectBtn);
  await waitFor(() => {
    expect(screen.getByText('qrrot')).toBeInTheDocument();
  });
};

describe('App Component', () => {
  it('renders successfully and initializes connections', async () => {
    render(<App />);

    // Check landing screen is rendered initially
    expect(screen.getByText('Enter the gRPC server address')).toBeInTheDocument();

    // Click connect
    const connectBtn = screen.getByRole('button', { name: /connect/i });
    fireEvent.click(connectBtn);

    // Check brand renders after connection
    await waitFor(() => {
      expect(screen.getByText('qrrot')).toBeInTheDocument();
    });

    // Check loading of registry
    await waitFor(() => {
      expect(mockElectronAPI.getKeys).toHaveBeenCalled();
    });

    // Check connecting
    await waitFor(() => {
      expect(mockElectronAPI.connect).toHaveBeenCalledWith('127.0.0.1:60945');
    });

    // Check items render
    expect(screen.getByText('test1')).toBeInTheDocument();
    expect(screen.getByText('test2')).toBeInTheDocument();
    expect(screen.getByText('test3')).toBeInTheDocument();
  });

  it('filters registry via search', async () => {
    await setupConnected();

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search keys.../i);
    fireEvent.change(searchInput, { target: { value: 'test1' } });

    expect(screen.getByText('test1')).toBeInTheDocument();
    expect(screen.queryByText('test2')).not.toBeInTheDocument();
    expect(screen.queryByText('test3')).not.toBeInTheDocument();
  });

  it('selects an item and displays workspace options', async () => {
    await setupConnected();

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    // Click an item
    const item = screen.getByText('test1');
    fireEvent.click(item);

    // Header should update to display 'test1'
    await waitFor(() => {
      expect(screen.getAllByText('test1').length).toBeGreaterThan(1);
    });

    // Buttons should appear
    expect(screen.getByTestId('header-decrypt-btn')).toBeInTheDocument();
    expect(screen.getByTestId('header-save-btn')).toBeInTheDocument();
  });


  it('handles decryption (memory viewing) with token', async () => {
    await setupConnected();

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    // Click to select/open test1 -> triggers modal immediately
    fireEvent.click(screen.getByText('test1'));

    // Wait for the modal input to appear and enter the token
    const tokenInput = await screen.findByPlaceholderText(/optional/i);
    fireEvent.change(tokenInput, { target: { value: 'mysecrettoken' } });

    mockElectronAPI.getMemory.mockResolvedValue({
      data: new TextEncoder().encode('Hello World'),
      mimeType: 'text/plain',
      size: 11
    });

    // Click the Decrypt button inside the modal to submit
    const modalDecryptBtn = screen.getByTestId('modal-decrypt-btn');
    fireEvent.click(modalDecryptBtn);

    await waitFor(() => {
      expect(mockElectronAPI.getMemory).toHaveBeenLastCalledWith({ key: 'test1', token: 'mysecrettoken', size: 100, mimeType: 'text/plain' });
    });

    // Look for text content
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  it('handles upload form', async () => {
    await setupConnected();

    const uploadBtn = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadBtn);

    expect(screen.getByText('Upload Data')).toBeInTheDocument();

    mockElectronAPI.openFileDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/fake/path/image.png']
    });

    const browseArea = screen.getByText(/drag & drop or browse/i);
    fireEvent.click(browseArea);

    await waitFor(() => {
      expect(mockElectronAPI.openFileDialog).toHaveBeenCalled();
    });

    // Form populated
    expect(screen.getByDisplayValue('image')).toBeInTheDocument(); // Key name without extension
    expect(screen.getByDisplayValue('image/png')).toBeInTheDocument(); // Mime type detected

    mockElectronAPI.put.mockResolvedValue({ size: 2048 });
    mockElectronAPI.addRegistry.mockResolvedValue([
      { key: 'test1', mimeType: 'text/plain', size: 100 },
      { key: 'test2', mimeType: 'image/png', size: 2048 },
      { key: 'test3', mimeType: 'video/mp4', size: 1048576 },
      { key: 'image', mimeType: 'image/png', size: 2048 }
    ]);

    // Submit
    const submitBtn = screen.getByRole('button', { name: /start upload/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockElectronAPI.put).toHaveBeenCalledWith({
        key: 'image',
        filePath: '/fake/path/image.png',
        mimeType: 'image/png',
        token: ''
      });
      expect(mockElectronAPI.addRegistry).toHaveBeenCalled();
    });
  });
});
