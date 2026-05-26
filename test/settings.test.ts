import { describe, expect, it } from "vitest";
import { normalizeSettings } from "@/shared/settings";

describe("settings normalization", () => {
  it("ignores legacy backend URL settings from old installs", () => {
    expect(normalizeSettings({ backendBaseUrl: "http://localhost:8787" })).not.toHaveProperty(
      "backendBaseUrl"
    );
  });

  it("normalizes country and currency values", () => {
    expect(normalizeSettings({ country: "nl", currency: "eur" })).toMatchObject({
      country: "NL",
      currency: "EUR"
    });
  });
});
