import { fetchJson, ApiError } from '@/lib/fetch';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location for node test environment
const mockReload = jest.fn();
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      reload: mockReload,
    },
  },
  writable: true,
});

describe('fetchJson', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockReload.mockClear();
  });

  it('returns parsed JSON on successful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    });

    const result = await fetchJson<{ data: string }>('/api/test');
    expect(result).toEqual({ data: 'test' });
  });

  it('throws ApiError with 401 status and reloads page', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'UNAUTHORIZED', message: '未登录' }),
    });

    try {
      await fetchJson('/api/test');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).code).toBe('UNAUTHORIZED');
    }
    expect(mockReload).toHaveBeenCalled();
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'INTERNAL_ERROR', message: '服务器错误' }),
    });

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: '服务器错误',
    });
  });

  it('handles non-JSON error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Not JSON')),
    });

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      status: 500,
      code: 'UNKNOWN_ERROR',
      message: '请求失败',
    });
  });

  it('uses fallback code/message when error body has null fields', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: null, message: null }),
    });

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      message: '请求失败',
    });
  });

  it('passes init options to fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchJson('/api/test', { method: 'POST', body: '{}' });
    expect(mockFetch).toHaveBeenCalledWith('/api/test', { method: 'POST', body: '{}' });
  });
});

describe('ApiError', () => {
  it('has correct properties', () => {
    const err = new ApiError(400, 'TEST_ERROR', 'test message');
    expect(err.status).toBe(400);
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});
