import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isExpectedError, logError } = await import("./error-report");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("error reporting", () => {
  it("writes one Error Reporting line in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("K_REVISION", "mishmarot-00042");
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logError(new TypeError("boom"), {
      source: "action",
      path: "/schedule?team=x",
      method: "POST",
      userId: "u1",
      digest: "123",
    });
    expect(write).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(write.mock.calls[0][0]));
    expect(entry).toMatchObject({
      severity: "ERROR",
      "@type": "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
      serviceContext: { service: "mishmarot", version: "mishmarot-00042" },
      context: { httpRequest: { method: "POST", url: "/schedule?team=x" }, user: "u1" },
      source: "action",
      digest: "123",
    });
    expect(entry.message).toMatch(/^TypeError: boom\n\s+at /);
  });

  it("gives non-Error values a stack so they are grouped", () => {
    vi.stubEnv("NODE_ENV", "production");
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logError("plain string", { source: "render" });
    expect(JSON.parse(String(write.mock.calls[0][0])).message).toContain("at (unknown)");
  });

  it("skips errors that are part of normal flow", () => {
    expect(isExpectedError(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" }))).toBe(true);
    expect(
      isExpectedError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/login" })),
    ).toBe(true);
    expect(isExpectedError(Object.assign(new Error("אין הרשאה"), { name: "ForbiddenError" }))).toBe(
      true,
    );
    expect(isExpectedError(new Error("real bug"))).toBe(false);
    expect(isExpectedError(Object.assign(new Error("x"), { digest: "2710456" }))).toBe(false);
  });
});
