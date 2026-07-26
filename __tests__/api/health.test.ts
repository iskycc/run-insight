import { GET as getLiveness } from "@/app/api/health/live/route";
import { GET as getReadiness } from "@/app/api/health/ready/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const queryDatabase = prisma.$queryRawUnsafe as jest.Mock;

describe("health checks", () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("reports liveness without requiring the database", async () => {
    const response = await getLiveness();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      status: "alive",
      check: "liveness",
      version: expect.any(String),
      build: expect.any(String),
      timestamp: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });
    expect(queryDatabase).not.toHaveBeenCalled();
  });

  it("reports ready when the database responds", async () => {
    queryDatabase.mockResolvedValue([{ "1": 1 }]);

    const response = await getReadiness();
    const body = await response.json();

    expect(queryDatabase).toHaveBeenCalledWith("SELECT 1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      status: "ready",
      check: "readiness",
      version: expect.any(String),
      build: expect.any(String),
      checks: { database: "up" },
      timestamp: expect.any(String),
    });
  });

  it("reports not ready without leaking database errors", async () => {
    queryDatabase.mockRejectedValue(new Error("connect ECONNREFUSED db:3306"));

    const response = await getReadiness();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "not_ready",
      check: "readiness",
      version: expect.any(String),
      build: expect.any(String),
      checks: { database: "down" },
      timestamp: expect.any(String),
      error: "SERVICE_UNAVAILABLE",
      message: "数据库暂不可用",
    });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    const logRecord = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
    expect(logRecord).toEqual(
      expect.objectContaining({
        level: "warn",
        event: "health.readiness_failed",
        requestId: expect.any(String),
        context: { check: "database" },
        error: expect.objectContaining({
          name: "Error",
          message: "Database readiness check failed",
        }),
      }),
    );
    expect(JSON.stringify(logRecord)).not.toContain("ECONNREFUSED");
  });

  it("fails readiness promptly when the database check hangs", async () => {
    jest.useFakeTimers();
    queryDatabase.mockReturnValue(new Promise(() => undefined));

    const responsePromise = getReadiness();
    await jest.advanceTimersByTimeAsync(2_000);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: "not_ready",
        checks: { database: "down" },
      }),
    );
  });
});
