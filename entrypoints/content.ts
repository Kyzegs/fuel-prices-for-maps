import { getDailyPrice } from "../src/shared/priceCache";
import { getSettings, SETTINGS_KEY } from "../src/shared/settings";
import {
  annotateDistanceElement,
  findDistanceElements,
  removeAnnotations
} from "../src/content/sidebarRoutes";
import "../src/content/content.css";

export default defineContentScript({
  matches: ["https://www.google.com/maps/*", "https://maps.google.com/*"],
  main() {
    startSidebarFuelCosts();
  }
});

function startSidebarFuelCosts() {
  let refreshTimer: number | undefined;
  let requestId = 0;

  const refresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      requestId += 1;
      void annotateVisibleRoutes(requestId, () => requestId);
    }, 200);
  };

  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener("popstate", refresh);
  window.addEventListener("hashchange", refresh);
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && SETTINGS_KEY in changes) refresh();
  });

  refresh();
}

async function annotateVisibleRoutes(requestId: number, getCurrentRequestId: () => number) {
  const elements = findDistanceElements();
  if (elements.length === 0) {
    removeAnnotations();
    return;
  }

  const settings = await getSettings();
  const basePrice = await getDailyPrice(
    settings.country,
    settings.fuelType
  ).catch(() => undefined);

  if (requestId !== getCurrentRequestId()) return;
  for (const element of elements) {
    annotateDistanceElement(element, settings, basePrice);
  }
}
