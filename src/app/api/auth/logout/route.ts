import { NextRequest, NextResponse } from "next/server";
import { createLogoutCookie } from "@/lib/auth";

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.headers.set("set-cookie", createLogoutCookie());
  return response;
}
