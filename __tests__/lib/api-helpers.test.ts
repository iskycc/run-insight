import { jsonError, internalError } from '@/lib/api-helpers';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      json: () => Promise.resolve(body),
      status: init?.status ?? 200,
      headers: new Headers(),
    }),
  },
}));

describe('api-helpers', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

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
    const request = new Request("http://localhost/api/test", {
      headers: { "x-request-id": "request-safe_123" },
    });
    const res = internalError('自定义错误', {
      request,
      error: new Error("数据库密码不应进入日志"),
      context: { password: "plain-text", operation: "test" },
      event: "test.internal_error",
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("request-safe_123");
    const body = await res.json();
    expect(body.message).toBe('自定义错误');
    const record = JSON.parse(consoleErrorSpy.mock.calls.at(-1)?.[0]);
    expect(record).toEqual(
      expect.objectContaining({
        level: "error",
        event: "test.internal_error",
        requestId: "request-safe_123",
        context: { password: "[REDACTED]", operation: "test" },
        error: expect.objectContaining({
          name: "Error",
          message: "自定义错误",
        }),
      }),
    );
    expect(JSON.stringify(record)).not.toContain("数据库密码");
    expect(JSON.stringify(record)).not.toContain("plain-text");
  });
});
