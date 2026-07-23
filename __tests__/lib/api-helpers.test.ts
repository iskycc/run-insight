import { jsonError, internalError } from '@/lib/api-helpers';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      json: () => Promise.resolve(body),
      status: init?.status ?? 200,
    }),
  },
}));

describe('api-helpers', () => {
  it('jsonError returns formatted error response', async () => {
    const res = jsonError('TEST_ERROR', 'test message', 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'TEST_ERROR', message: 'test message' });
  });

  it('internalError returns 500 with default message', async () => {
    const res = internalError();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('internalError returns 500 with custom message', async () => {
    const res = internalError('自定义错误');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('自定义错误');
  });
});
