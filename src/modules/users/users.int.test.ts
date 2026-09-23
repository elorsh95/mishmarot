import { beforeEach, describe, expect, it } from "vitest";
import { adminAuth } from "@/lib/firebase/admin";
import { signInWithPassword } from "@/lib/firebase/auth-rest";
import { actors, baseData, clearEmulator } from "@/test/helpers";
import {
  checkPasswordLink,
  completePasswordSetup,
  findUserByUsername,
  getUser,
  inviteUser,
  requestPasswordReset,
  sendPasswordLink,
  updateUser,
} from "./service";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "demo-mishmarot";

type OobCode = { email: string; oobCode: string; requestType: string };

async function allOobCodes(): Promise<OobCode[]> {
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`,
  );
  return ((await res.json()) as { oobCodes: OobCode[] }).oobCodes;
}

// The emulator keeps codes across tests; only look at the ones sent during the current test.
let seenCodes = 0;

/** Links "e-mailed" by the Auth emulator during this test, oldest first. */
async function sentLinks(email: string): Promise<string[]> {
  return (await allOobCodes())
    .slice(seenCodes)
    .filter((c) => c.email === email && c.requestType === "PASSWORD_RESET")
    .map((c) => c.oobCode);
}

const invite = {
  username: "dana",
  fullName: "דנה לוי",
  email: "Dana@Example.com",
  roleId: "center_manager",
  managedTeamIds: [],
};

beforeEach(async () => {
  await clearEmulator();
  await baseData();
  seenCodes = (await allOobCodes()).length;
});

describe("user invitations", () => {
  it("creates the user without a password and e-mails a link", async () => {
    const { userId, emailSent } = await inviteUser(actors.admin(), invite);
    expect(emailSent).toBe(true);
    const user = await getUser(userId);
    expect(user?.email).toBe("dana@example.com");
    expect(user?.authEmail).toBe("dana@example.com");
    expect(user?.passwordSetAt).toBeNull();
    expect(await sentLinks("dana@example.com")).toHaveLength(1);
  });

  it("the link sets the password once and the user can sign in", async () => {
    const { userId } = await inviteUser(actors.admin(), invite);
    const [code] = await sentLinks("dana@example.com");

    const check = await checkPasswordLink(code);
    expect(check).toMatchObject({ ok: true, isInvite: true, user: { username: "dana" } });

    await expect(completePasswordSetup(code, "short")).rejects.toThrow();
    const creds = await completePasswordSetup(code, "Newpass123");
    expect(creds.username).toBe("dana");
    expect((await getUser(userId))?.passwordSetAt).not.toBeNull();
    expect((await adminAuth().getUser(userId)).emailVerified).toBe(true);
    expect((await signInWithPassword("dana@example.com", "Newpass123")).ok).toBe(true);

    // A used link can't be reused
    expect((await checkPasswordLink(code)).ok).toBe(false);
    await expect(completePasswordSetup(code, "Another123")).rejects.toThrow(/קישור/);
  });

  it("rejects a second user with the same e-mail", async () => {
    await inviteUser(actors.admin(), invite);
    await expect(
      inviteUser(actors.admin(), { ...invite, username: "dana2", email: "dana@example.com" }),
    ).rejects.toThrow(/מייל/);
    expect(await findUserByUsername("dana2")).toBeNull();
  });

  it("only user managers can invite", async () => {
    await expect(inviteUser(actors.centerManager(), invite)).rejects.toThrow(/הרשאה/);
  });

  it("forgot-password sends a link only for real, active users", async () => {
    await inviteUser(actors.admin(), invite);
    await requestPasswordReset("DANA");
    await requestPasswordReset("dana@example.com");
    await requestPasswordReset("nobody"); // silently ignored
    expect(await sentLinks("dana@example.com")).toHaveLength(3);
  });

  it("admin can resend the link and change the e-mail", async () => {
    const { userId } = await inviteUser(actors.admin(), invite);
    await sendPasswordLink(actors.admin(), userId);
    expect(await sentLinks("dana@example.com")).toHaveLength(2);

    await updateUser(actors.admin(), userId, {
      ...invite,
      email: "dana.levi@example.com",
      isActive: true,
    });
    expect((await getUser(userId))?.authEmail).toBe("dana.levi@example.com");
    expect((await adminAuth().getUser(userId)).email).toBe("dana.levi@example.com");

    await sendPasswordLink(actors.admin(), userId);
    const [code] = await sentLinks("dana.levi@example.com");
    await completePasswordSetup(code, "Newpass123");
    expect((await signInWithPassword("dana.levi@example.com", "Newpass123")).ok).toBe(true);
  });
});
