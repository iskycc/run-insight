import { NextRequest, NextResponse } from "next/server";
import { getPublicBuildInfo } from "@/lib/build-info";
import { requestIdFrom } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request?: NextRequest) {
  const response = NextResponse.json(
    {
      status: "alive",
      check: "liveness",
      ...getPublicBuildInfo(),
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
  response.headers.set("x-request-id", requestIdFrom(request));
  return response;
}
