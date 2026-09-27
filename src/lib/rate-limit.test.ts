import { describe, expect, it } from "vitest";
import { RateLimiter, SeenRecently } from "./rate-limit";

describe("rate limiting", () => {
  it("allows max hits per window and frees up as it slides", () => {
    const limit = new RateLimiter(2, 1000);
    expect(limit.allow("a", 0)).toBe(true);
    expect(limit.allow("a", 100)).toBe(true);
    expect(limit.allow("a", 200)).toBe(false);
    expect(limit.allow("b", 200)).toBe(true); // other keys are separate
    expect(limit.allow("a", 1050)).toBe(true); // the first hit left the window
    expect(limit.allow("a", 1060)).toBe(false);
  });

  it("keeps memory bounded", () => {
    const limit = new RateLimiter(1, 1000, 3);
    for (const k of ["a", "b", "c", "d"]) limit.allow(k, 0);
    expect(limit.allow("a", 1)).toBe(true); // "a" was dropped as the oldest
    expect(limit.allow("d", 1)).toBe(false);
  });

  it("drops repeats within the ttl", () => {
    const seen = new SeenRecently(1000);
    expect(seen.check("x", 0)).toBe(false);
    expect(seen.check("x", 500)).toBe(true);
    expect(seen.check("x", 1500)).toBe(false);
  });
});
