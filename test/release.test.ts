import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import wxtConfig from "../wxt.config";
import { apiHostPermission, resolveApiBaseUrl } from "@/shared/config";

const originalApiBaseUrl = process.env.WXT_API_BASE_URL;

describe("release configuration", () => {
  it("uses package.json as the manifest version source", async () => {
    const manifest = await resolveManifest("https://api.fuel-cost.app");

    expect(packageJson.version).toBe("1.0.0");
    expect(manifest.version).toBe(packageJson.version);
  });

  it("uses only the configured API origin in host permissions", async () => {
    const manifest = await resolveManifest("https://api.example.com/v1/");

    expect(manifest.host_permissions).toContain("https://api.example.com/*");
    expect(manifest.host_permissions).not.toContain("https://api.fuel-cost.app/*");
    expect(manifest.host_permissions).not.toContain("http://localhost:8787/*");
  });

  it("fails clearly when the API URL is missing or invalid", () => {
    expect(() => resolveApiBaseUrl(undefined)).toThrow("WXT_API_BASE_URL is required");
    expect(() => resolveApiBaseUrl("not a url")).toThrow("valid absolute URL");
    expect(() => resolveApiBaseUrl("ftp://api.example.com")).toThrow("http or https");
  });

  it("formats host permissions from the configured API origin", () => {
    expect(apiHostPermission(resolveApiBaseUrl("https://api.example.com/v1/"))).toBe(
      "https://api.example.com/*"
    );
  });

});

async function resolveManifest(apiBaseUrl: string) {
  process.env.WXT_API_BASE_URL = apiBaseUrl;
  const manifest = wxtConfig.manifest;
  const resolved =
    typeof manifest === "function"
      ? manifest({
          browser: "chrome",
          command: "build",
          mode: "production"
        } as never)
      : manifest;
  restoreApiBaseUrlEnv();

  if (!resolved) throw new Error("WXT manifest config missing");
  return await resolved;
}

function restoreApiBaseUrlEnv() {
  if (originalApiBaseUrl === undefined) {
    delete process.env.WXT_API_BASE_URL;
  } else {
    process.env.WXT_API_BASE_URL = originalApiBaseUrl;
  }
}
