import { beforeEach, describe, expect, it } from "vitest";
import { actors, clearEmulator } from "@/test/helpers";
import { getBranding, getLogo, removeLogo, setLogo } from "./service";
import { logoUrl } from "./types";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeEach(async () => {
  await clearEmulator();
});

describe("company logo", () => {
  it("stores a PNG and serves it by version", async () => {
    expect(logoUrl(await getBranding())).toBeNull();
    await setLogo(actors.admin(), `data:image/png;base64,${TINY_PNG}`);
    const logo = await getLogo();
    expect(logo?.bytes.equals(Buffer.from(TINY_PNG, "base64"))).toBe(true);
    expect(logo?.version).toMatch(/^[a-z0-9]+$/);

    await removeLogo(actors.admin());
    expect(await getLogo()).toBeNull();
  });

  it("accepts only PNG images, from settings managers", async () => {
    await expect(
      setLogo(actors.admin(), `data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}`),
    ).rejects.toThrow("אינו תמונה תקינה");
    await expect(setLogo(actors.admin(), "data:image/svg+xml;base64,PHN2Zy8+")).rejects.toThrow();
    await expect(
      setLogo(actors.teamManager(["t"]), `data:image/png;base64,${TINY_PNG}`),
    ).rejects.toThrow();
  });
});
