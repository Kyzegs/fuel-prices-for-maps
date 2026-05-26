import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

type StoredValue = Record<string, unknown>;

const storage: StoredValue = {};

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onInstalled: {
        addListener: vi.fn()
      }
    },
    storage: {
      local: {
        async get(key?: string | string[] | StoredValue) {
          if (!key) return { ...storage };
          if (typeof key === "string") return { [key]: storage[key] };
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((item) => [item, storage[item]]));
          }
          return Object.fromEntries(
            Object.entries(key).map(([item, defaultValue]) => [
              item,
              storage[item] ?? defaultValue
            ])
          );
        },
        async set(values: StoredValue) {
          Object.assign(storage, values);
        },
        async clear() {
          for (const key of Object.keys(storage)) delete storage[key];
        }
      },
      onChanged: {
        addListener: vi.fn()
      }
    }
  }
}));

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
});
