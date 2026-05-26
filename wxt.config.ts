import { defineConfig } from "wxt";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import packageJson from "./package.json";
import { apiHostPermission, resolveApiBaseUrl } from "./src/shared/config";

const mapsHostPermissions = [
  "https://www.google.com/maps/*",
  "https://maps.google.com/*"
];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@worker": fileURLToPath(new URL("./worker/src", import.meta.url))
      }
    }
  }),
  manifest: ({ browser }) => ({
    name: "Fuel Cost for Maps",
    description: "Show route fuel cost in Google Maps with country-aware fuel prices.",
    version: packageJson.version,
    permissions: ["storage"],
    host_permissions: [
      ...mapsHostPermissions,
      apiHostPermission(resolveApiBaseUrl(process.env.WXT_API_BASE_URL))
    ],
    action: {
      default_title: "Fuel Cost",
      default_popup: "popup.html",
      default_icon: {
        "16": "/icon/16.png",
        "32": "/icon/32.png"
      }
    },
    icons: {
      "16": "/icon/16.png",
      "32": "/icon/32.png",
      "48": "/icon/48.png",
      "96": "/icon/96.png",
      "128": "/icon/128.png"
    },
    options_ui: {
      page: "options.html",
      open_in_tab: false
    },
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "fuel-cost-for-maps@example.com",
              data_collection_permissions: {
                required: ["none"]
              }
            }
          }
        : undefined
  })
});
