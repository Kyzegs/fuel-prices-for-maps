import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "./settings";
import type { UserSettings } from "./types";

export function useSettingsState() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Loading");

  useEffect(() => {
    let isMounted = true;

    getSettings()
      .then((loaded) => {
        if (!isMounted) return;
        setSettings(loaded);
        setStatus("Ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus(error instanceof Error ? error.message : "Settings failed to load");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: UserSettings, message = "Saved") => {
    setSettings(next);
    setStatus("Saving");
    await saveSettings(next);
    setStatus(message);
    return next;
  }, []);

  return {
    settings,
    setSettings,
    isLoading,
    status,
    setStatus,
    persist
  };
}
