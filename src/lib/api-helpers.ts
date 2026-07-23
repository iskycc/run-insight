import { NextResponse } from "next/server";
import type { ApiError } from "@/types";

export function jsonError(error: string, message: string, status: number = 400) {
  return NextResponse.json<ApiError>({ error, message }, { status });
}

export function internalError(message: string = "服务器内部错误") {
  return jsonError("INTERNAL_ERROR", message, 500);
}
