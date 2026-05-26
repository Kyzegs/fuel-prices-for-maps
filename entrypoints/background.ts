import browser from "webextension-polyfill";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../src/shared/settings";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    await saveSettings({ ...DEFAULT_SETTINGS, ...settings });
  });
});
