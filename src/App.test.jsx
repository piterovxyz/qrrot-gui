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
  exists: vi.fn(),
  del: vi.fn(),
  removeRegistry: vi.fn(),
  getMemory: vi.fn(),
  saveFileDialog: vi.fn(),
  getSave: vi.fn(),
  openFileDialog: vi.fn(),
  put: vi.fn(),
  addRegistry: vi.fn()
};

beforeEach(() => {
  window.electronAPI = mockElectronAPI;

  // Setup standard mock responses
  mockElectronAPI.getRegistry.mockResolvedValue([
    { key: 'test1', mimeType: 'text/plain', size: 100 },
    { key: 'test2', mimeType: 'image/png', size: 2048 },
    { key: 'test3', mimeType: 'video/mp4', size: 1048576 } // 1MB
  ]);

  mockElectronAPI.connect.mockResolvedValue({ success: true, cached: false });
  mockElectronAPI.exists.mockResolvedValue(true);
  mockElectronAPI.del.mockResolvedValue();
  mockElectronAPI.removeRegistry.mockResolvedValue([
    { key: 'test2', mimeType: 'image/png', size: 2048 },
    { key: 'test3', mimeType: 'video/mp4', size: 1048576 }
  ]);

  // Mock window features
  window.confirm = vi.fn(() => true);
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('App Component', () => {
  it('renders successfully and initializes connections', async () => {
    render(<App />);

    // Check brand renders
    expect(screen.getByText('qrrot gui')).toBeInTheDocument();

    // Check loading of registry
    await waitFor(() => {
      expect(mockElectronAPI.getRegistry).toHaveBeenCalled();
    });

    // Check connecting
    await waitFor(() => {
      expect(mockElectronAPI.connect).toHaveBeenCalledWith('127.0.0.1:50051');
    });

    // Check items render
    expect(screen.getByText('test1')).toBeInTheDocument();
    expect(screen.getByText('test2')).toBeInTheDocument();
    expect(screen.getByText('test3')).toBeInTheDocument();
  });

  it('filters registry via search', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('search keys...');
    fireEvent.change(searchInput, { target: { value: 'test1' } });

    expect(screen.getByText('test1')).toBeInTheDocument();
    expect(screen.queryByText('test2')).not.toBeInTheDocument();
    expect(screen.queryByText('test3')).not.toBeInTheDocument();
  });

  it('selects an item and displays workspace options', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    // Click an item
    const item = screen.getByText('test1');
    fireEvent.click(item);

    // Header should update to display 'test1'
    expect(screen.getAllByText('test1').length).toBeGreaterThan(1);

    // Buttons should appear
    expect(screen.getByRole('button', { name: /decrypt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByTitle('Check Exists')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('checks if an item exists', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test1'));

    const checkBtn = screen.getByTitle('Check Exists');
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(mockElectronAPI.exists).toHaveBeenCalledWith('test1');
    });

    // Log message should appear
    expect(screen.getByText(/key 'test1' exists on server/i)).toBeInTheDocument();
  });

  it('deletes an item', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test1'));

    const deleteBtn = screen.getByTitle('Delete');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith("delete 'test1'?");

    await waitFor(() => {
      expect(mockElectronAPI.del).toHaveBeenCalledWith('test1');
      expect(mockElectronAPI.removeRegistry).toHaveBeenCalledWith('test1');
    });

    // Ensure the item is removed from view
    await waitFor(() => {
      expect(screen.queryByText('test1')).not.toBeInTheDocument();
    });
  });

  it('handles decryption (memory viewing) with token', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test1'));

    // Need a token to view
    const tokenInput = screen.getByPlaceholderText('aes key');
    fireEvent.change(tokenInput, { target: { value: 'mysecrettoken' } });

    mockElectronAPI.getMemory.mockResolvedValue({
      data: new TextEncoder().encode('Hello World'),
      mimeType: 'text/plain',
      size: 11
    });

    const decryptBtn = screen.getByRole('button', { name: /decrypt/i });
    fireEvent.click(decryptBtn);

    await waitFor(() => {
      expect(mockElectronAPI.getMemory).toHaveBeenCalledWith({ key: 'test1', token: 'mysecrettoken' });
    });

    // Look for text content
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  it('handles upload form', async () => {
    render(<App />);

    const uploadBtn = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadBtn);

    expect(screen.getByText('upload new key')).toBeInTheDocument();

    mockElectronAPI.openFileDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/fake/path/image.png']
    });

    const browseArea = screen.getByText(/drag & drop a file here, or click to browse/i);
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
    const submitBtn = screen.getByRole('button', { name: /start secure upload/i });
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

    // Check log
    await waitFor(() => {
      expect(screen.getByText(/uploaded 'image' \(2048 bytes\)/i)).toBeInTheDocument();
    });
  });
});
