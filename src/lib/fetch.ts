export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T = unknown>(
  input: string | URL | Request,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    // 未登录，刷新页面触发 middleware 重定向
    window.location.reload();
    throw new ApiError(401, "UNAUTHORIZED", "未登录");
  }

  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = "请求失败";
    try {
      const body = await res.json();
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      // 响应非 JSON
    }
    throw new ApiError(res.status, code, message);
  }

  return res.json() as Promise<T>;
}
