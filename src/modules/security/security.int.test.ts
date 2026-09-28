import { beforeEach, describe, expect, it } from "vitest";
import { col, COLLECTIONS, serverNow } from "@/lib/firebase/collections";
import { totpCode, totpStep } from "@/lib/totp";
import { actors, baseData, clearEmulator } from "@/test/helpers";
import {
  confirmMfaEnrollment,
  countUsersWithoutMfa,
  createMfaChallenge,
  disableOwnMfa,
  getSecuritySettings,
  lockedUntil,
  recordLoginFailure,
  resetUserMfa,
  startMfaEnrollment,
  unlockUser,
  updateSecuritySettings,
  verifyMfaChallenge,
} from "./service";
import { LOCKOUT } from "./types";

const USER = "u1";
const actor = { ...actors.teamManager([], USER), fullName: "דנה" };

beforeEach(async () => {
  await clearEmulator();
  await baseData();
  await col(COLLECTIONS.users)
    .doc(USER)
    .set({ username: "dana", fullName: "דנה", isActive: true, createdAt: serverNow() });
});

const user = async () => (await col(COLLECTIONS.users).doc(USER).get()).data()!;

describe("lockout", () => {
  it("locks after repeated failures in the window, and an admin can unlock", async () => {
    const now = Date.now();
    for (let i = 1; i < LOCKOUT.maxFailures; i++) {
      expect(await recordLoginFailure(USER, "password", now + i)).toBeNull();
    }
    const lock = await recordLoginFailure(USER, "password", now + 10);
    expect(lock).toBe(now + 10 + LOCKOUT.lockMinutes * 60_000);
    expect(lockedUntil(await user(), now + 20)).toBe(lock);

    const audit = await col(COLLECTIONS.auditLogs).where("entityId", "==", USER).get();
    const actions = audit.docs.map((d) => d.get("action"));
    expect(actions.filter((a) => a === "auth.failed")).toHaveLength(LOCKOUT.maxFailures);
    expect(actions).toContain("auth.locked");

    await expect(unlockUser(actors.teamManager([]), USER)).rejects.toThrow();
    await unlockUser(actors.admin(), USER);
    expect(lockedUntil(await user())).toBeNull();
  });

  it("starts counting again after the window", async () => {
    const now = Date.now();
    for (let i = 0; i < LOCKOUT.maxFailures - 1; i++)
      await recordLoginFailure(USER, "password", now);
    const later = now + (LOCKOUT.windowMinutes + 1) * 60_000;
    expect(await recordLoginFailure(USER, "password", later)).toBeNull();
    expect((await user()).failedLogins).toBe(1);
  });
});

describe("two-step verification", () => {
  it("enrolls with a code, logs in through a challenge, and rejects reuse", async () => {
    const { secret, qr } = await startMfaEnrollment(actor);
    expect(qr).toMatch(/^data:image\/png;base64,/);
    await expect(confirmMfaEnrollment(actor, "000000")).rejects.toThrow("הקוד שגוי");
    const step = totpStep();
    await confirmMfaEnrollment(actor, totpCode(secret, step));
    expect((await user()).mfaEnabled).toBe(true);
    // The secret is not on the user document
    expect((await user()).mfaSecret).toBeUndefined();

    // A login: the same code can't be used again, the next one works
    const id = await createMfaChallenge(USER, "id-token");
    const reused = await verifyMfaChallenge(id, totpCode(secret, step));
    expect(reused.ok).toBe(false);
    const ok = await verifyMfaChallenge(id, totpCode(secret, step + 1));
    expect(ok).toEqual({ ok: true, userId: USER, idToken: "id-token" });
    // Used up
    expect((await verifyMfaChallenge(id, totpCode(secret, step + 1))).ok).toBe(false);
  });

  it("gives up a challenge after too many wrong codes", async () => {
    const { secret } = await startMfaEnrollment(actor);
    await confirmMfaEnrollment(actor, totpCode(secret, totpStep()));
    const id = await createMfaChallenge(USER, "t");
    let last;
    for (let i = 0; i < 5; i++) last = await verifyMfaChallenge(id, "000000");
    expect(last).toMatchObject({ ok: false, restart: true });
    expect((await col(COLLECTIONS.mfaChallenges).doc(id).get()).exists).toBe(false);
  });

  it("can't be turned off when required; an admin can reset it", async () => {
    const { secret } = await startMfaEnrollment(actor);
    const step = totpStep();
    await confirmMfaEnrollment(actor, totpCode(secret, step));
    await updateSecuritySettings(actors.admin(), { idleMinutes: 15, mfa: "required" });
    expect(await getSecuritySettings()).toEqual({ idleMinutes: 15, mfa: "required" });
    await expect(disableOwnMfa(actor, totpCode(secret, step + 1))).rejects.toThrow("חובה");
    expect(await countUsersWithoutMfa(actors.admin())).toBe(0);

    await resetUserMfa(actors.admin(), USER);
    expect((await user()).mfaEnabled).toBe(false);
    expect(await countUsersWithoutMfa(actors.admin())).toBe(1);
  });
});
