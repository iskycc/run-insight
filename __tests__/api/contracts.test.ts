import {
  parseJsonObject,
  parseOptionalBooleanSearchParam,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { NextRequest } from "next/server";

describe("API request contract helpers", () => {
  it.each([
    ["{", "请求体必须是有效的 JSON 对象"],
    ["null", "请求体必须是 JSON 对象"],
    ["[]", "请求体必须是 JSON 对象"],
    ['"text"', "请求体必须是 JSON 对象"],
  ])("rejects invalid JSON object body %s", async (body, message) => {
    const request = new NextRequest("http://localhost/api/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const result = await parseJsonObject(request, ["name"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(result.response.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(result.response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message,
    });
  });

  it("rejects unsupported content types with 415", async () => {
    const request = new NextRequest("http://localhost/api/contract", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: '{"name":"value"}',
    });

    const result = await parseJsonObject(request, ["name"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
    await expect(result.response.json()).resolves.toEqual({
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "Content-Type 必须为 application/json",
    });
  });

  it("accepts JSON media type suffixes and rejects unknown fields", async () => {
    const accepted = await parseJsonObject(
      new NextRequest("http://localhost/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/merge-patch+json; charset=utf-8" },
        body: '{"name":"value"}',
      }),
      ["name"],
    );
    expect(accepted).toEqual({ ok: true, value: { name: "value" } });

    const rejected = await parseJsonObject(
      new NextRequest("http://localhost/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name":"value","unexpected":true}',
      }),
      ["name"],
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    await expect(rejected.response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message: "不支持的字段：unexpected",
    });
  });

  it("maps malformed request URLs to the standard validation error", async () => {
    const result = parseRequestUrl({ url: "::not-an-absolute-url::" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message: "请求 URL 不合法",
    });
  });

  it.each(["yes", "1", "", "TRUE"])(
    "rejects invalid boolean query value %s",
    async (value) => {
      const result = parseOptionalBooleanSearchParam(
        new URLSearchParams([["permanent", value]]),
        "permanent",
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: "VALIDATION_ERROR",
        message: "查询参数 permanent 必须为 true 或 false",
      });
    },
  );

  it("rejects duplicate booleans and accepts omitted/valid values", () => {
    expect(
      parseOptionalBooleanSearchParam(
        new URLSearchParams("permanent=true&permanent=false"),
        "permanent",
      ).ok,
    ).toBe(false);
    expect(
      parseOptionalBooleanSearchParam(new URLSearchParams(), "permanent"),
    ).toEqual({ ok: true, value: false });
    expect(
      parseOptionalBooleanSearchParam(
        new URLSearchParams("permanent=true"),
        "permanent",
      ),
    ).toEqual({ ok: true, value: true });
  });
});
