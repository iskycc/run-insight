import { NextResponse } from "next/server";
import type { ApiError } from "@/types";
import { logger, requestIdFrom, resolveRequestId } from "@/lib/logger";

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse<ApiError> };

type RequestUrlResult =
  | { ok: true; value: URL }
  | { ok: false; response: NextResponse<ApiError> };

type BooleanSearchParamResult =
  | { ok: true; value: boolean }
  | { ok: false; response: NextResponse<ApiError> };

export function jsonError(error: string, message: string, status: number = 400) {
  return NextResponse.json<ApiError>({ error, message }, { status });
}

export interface InternalErrorOptions {
  request?: Pick<Request, "headers">;
  requestId?: string | null;
  context?: Record<string, unknown>;
  error?: unknown;
  event?: string;
}

export function internalError(
  message: string = "服务器内部错误",
  options: InternalErrorOptions = {},
) {
  const requestId = options.request
    ? requestIdFrom(options.request)
    : resolveRequestId(options.requestId);
  logger.error(options.event ?? "api.internal_error", {
    requestId,
    context: options.context,
    error: options.error,
    safeErrorMessage: message,
  });
  const response = jsonError("INTERNAL_ERROR", message, 500);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function parseJsonObject(
  request: Request,
  allowedFields: readonly string[],
): Promise<JsonObjectResult> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    mediaType !== "application/json" &&
    !(mediaType?.startsWith("application/") && mediaType.endsWith("+json"))
  ) {
    return {
      ok: false,
      response: jsonError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type 必须为 application/json",
        415,
      ),
    };
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError("VALIDATION_ERROR", "请求体必须是有效的 JSON 对象"),
    };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      response: jsonError("VALIDATION_ERROR", "请求体必须是 JSON 对象"),
    };
  }

  const allowed = new Set(allowedFields);
  const unknownField = Object.keys(value).find((field) => !allowed.has(field));
  if (unknownField) {
    return {
      ok: false,
      response: jsonError(
        "VALIDATION_ERROR",
        `不支持的字段：${unknownField}`,
      ),
    };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

export function parseRequestUrl(request: Pick<Request, "url">): RequestUrlResult {
  try {
    return { ok: true, value: new URL(request.url) };
  } catch {
    return {
      ok: false,
      response: jsonError("VALIDATION_ERROR", "请求 URL 不合法"),
    };
  }
}

export function parseOptionalBooleanSearchParam(
  searchParams: URLSearchParams,
  name: string,
): BooleanSearchParamResult {
  const values = searchParams.getAll(name);
  if (
    values.length > 1 ||
    (values.length === 1 && values[0] !== "true" && values[0] !== "false")
  ) {
    return {
      ok: false,
      response: jsonError(
        "VALIDATION_ERROR",
        `查询参数 ${name} 必须为 true 或 false`,
      ),
    };
  }
  return { ok: true, value: values[0] === "true" };
}
