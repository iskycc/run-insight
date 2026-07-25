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

export type FetchJsonOptions = RequestInit & {
  /**
   * 业务接口也可能使用 401 表示凭据校验失败。此时调用方可关闭自动刷新，
   * 并在当前界面展示服务端返回的具体错误。
   */
  reloadOnUnauthorized?: boolean;
};

export async function fetchJson<T = unknown>(
  input: string | URL | Request,
  init?: FetchJsonOptions
): Promise<T> {
  const { reloadOnUnauthorized = true, ...requestInit } = init ?? {};
  const res = await fetch(input, init ? requestInit : undefined);

  if (res.status === 401 && reloadOnUnauthorized) {
    // 未登录，刷新页面触发 middleware 重定向
    window.location.reload();
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
