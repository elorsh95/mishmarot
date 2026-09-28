import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  totpStep,
  verifyTotp,
} from "./totp";

// RFC 6238 test secret "12345678901234567890" (SHA-1)
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("round-trips base32", () => {
    expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("matches the RFC 6238 vectors (last 6 digits)", () => {
    expect(totpCode(SECRET, totpStep(59_000))).toBe("287082");
    expect(totpCode(SECRET, totpStep(1_111_111_109_000))).toBe("081804");
    expect(totpCode(SECRET, totpStep(2_000_000_000_000))).toBe("279037");
  });

  it("accepts one step of drift, rejects reuse and bad input", () => {
    const now = 1_111_111_109_000;
    const step = totpStep(now);
    const code = totpCode(SECRET, step);
    expect(verifyTotp(SECRET, code, { now })).toBe(step);
    expect(verifyTotp(SECRET, code, { now: now + 30_000 })).toBe(step);
    expect(verifyTotp(SECRET, code, { now: now + 90_000 })).toBeNull();
    expect(verifyTotp(SECRET, code, { now, lastStep: step })).toBeNull();
    expect(verifyTotp(SECRET, "12345", { now })).toBeNull();
    expect(verifyTotp(SECRET, "abcdef", { now })).toBeNull();
  });
});
