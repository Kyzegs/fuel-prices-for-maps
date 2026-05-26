export const API_BASE_URL_ENV_VAR = "WXT_API_BASE_URL";

type ImportMetaWithExtensionEnv = ImportMeta & {
  env?: {
    WXT_API_BASE_URL?: string;
  };
};

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl(
    (import.meta as ImportMetaWithExtensionEnv).env?.WXT_API_BASE_URL ||
      readNodeEnvApiBaseUrl()
  );
}

export function resolveApiBaseUrl(value: string | undefined): string {
  const rawValue = value?.trim();
  if (!rawValue) {
    throw new Error(`${API_BASE_URL_ENV_VAR} is required. Add it to .env or pass it to the build command.`);
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${API_BASE_URL_ENV_VAR} must be a valid absolute URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${API_BASE_URL_ENV_VAR} must use http or https.`);
  }

  return url.toString().replace(/\/+$/, "");
}

export function apiHostPermission(apiBaseUrl: string): string {
  return `${new URL(apiBaseUrl).origin}/*`;
}

function readNodeEnvApiBaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env?.WXT_API_BASE_URL;
}
