import { isSafeHttpUrl } from "@/lib/url";

describe("isSafeHttpUrl", () => {
  it("returns true for http URLs", () => {
    expect(isSafeHttpUrl("http://example.com/path")).toBe(true);
  });

  it("returns true for https URLs", () => {
    expect(isSafeHttpUrl("https://example.com/path")).toBe(true);
  });

  it("returns false for javascript: URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("returns false for mailto: URLs", () => {
    expect(isSafeHttpUrl("mailto:test@example.com")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});
