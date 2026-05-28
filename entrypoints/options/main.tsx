import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Save } from "lucide-react";
import { useSettingsState } from "../../src/shared/useSettingsState";
import { SUPPORTED_CURRENCIES, SUPPORTED_PRICE_COUNTRIES } from "../../src/shared/types";
import "../popup/style.css";
import "./style.css";

export function Options() {
  const { settings, isLoading, status, persist } = useSettingsState();
  const [currencyDraft, setCurrencyDraft] = useState(settings.currency);

  useEffect(() => {
    setCurrencyDraft(settings.currency);
  }, [settings.currency]);

  async function saveCurrency() {
    await persist({ ...settings, currency: currencyDraft });
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <h1>Fuel Cost Options</h1>
        <p>Defaults for trip estimates and display currency.</p>
      </header>

      <section className="panel">
        <div className="split">
          <label>
            <span>Home country</span>
            <select
              value={settings.country}
              onChange={(event) => {
                const country = SUPPORTED_PRICE_COUNTRIES.find(
                  (item) => item.code === event.target.value
                );
                void persist({
                  ...settings,
                  country: event.target.value,
                  currency: country?.currency || settings.currency
                });
              }}
            >
              {SUPPORTED_PRICE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label} ({country.code})
                </option>
              ))}
            </select>
          </label>
          <div className="field-action compact-action">
            <label>
              <span>Currency</span>
              <select
                value={currencyDraft}
                onChange={(event) => setCurrencyDraft(event.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary secondary" disabled={isLoading} onClick={saveCurrency}>
              <Save size={16} />
              Save
            </button>
          </div>
        </div>
        <div className="split">
          <label className="toggle">
            <input
              checked={settings.showFuelLiters}
              type="checkbox"
              onChange={(event) =>
                void persist({ ...settings, showFuelLiters: event.target.checked })
              }
            />
            <span>Show liters</span>
          </label>
          <label className="toggle">
            <input
              checked={settings.showRefuelsNeeded}
              type="checkbox"
              onChange={(event) =>
                void persist({ ...settings, showRefuelsNeeded: event.target.checked })
              }
            />
            <span>Show refuels needed</span>
          </label>
        </div>
      </section>

      <footer>{status}</footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Options />);
