import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Save, Trash2 } from "lucide-react";
import { useSettingsState } from "../../src/shared/useSettingsState";
import {
  FUEL_LABELS,
  FUEL_TYPES,
  SUPPORTED_PRICE_COUNTRIES,
  type ManualPriceOverride,
} from "../../src/shared/types";
import "../popup/style.css";
import "./style.css";

export function Options() {
  const { settings, isLoading, status, persist, setStatus } = useSettingsState();
  const [currencyDraft, setCurrencyDraft] = useState(settings.currency);
  const [draft, setDraft] = useState<ManualPriceOverride>({
    country: "NL",
    fuel: "gasoline_98",
    pricePerLiter: 2.2,
    currency: "EUR"
  });
  const [draftPrice, setDraftPrice] = useState("2.2");

  useEffect(() => {
    setCurrencyDraft(settings.currency);
  }, [settings.currency]);

  async function saveCurrency() {
    const currency = currencyDraft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setStatus("Enter a 3-letter currency code");
      return;
    }
    await persist({ ...settings, currency });
  }

  function addOverride() {
    const pricePerLiter = Number(draftPrice);
    if (draftPrice.trim() === "" || !Number.isFinite(pricePerLiter) || pricePerLiter < 0) {
      return;
    }

    const next = {
      ...settings,
      overrides: [
        ...settings.overrides.filter(
          (item) => !(item.country === draft.country && item.fuel === draft.fuel)
        ),
        {
          ...draft,
          country: draft.country.toUpperCase(),
          currency: draft.currency.toUpperCase(),
          pricePerLiter
        }
      ]
    };
    void persist(next);
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <h1>Fuel Cost Options</h1>
        <p>Defaults and custom country average prices.</p>
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
              <input
                maxLength={3}
                value={currencyDraft}
                onChange={(event) => setCurrencyDraft(event.target.value.toUpperCase())}
              />
            </label>
            <button className="primary secondary" disabled={isLoading} onClick={saveCurrency}>
              <Save size={16} />
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Custom country average prices</h2>
        <div className="override-grid">
          <label>
            <span>Country</span>
            <input
              maxLength={2}
              value={draft.country}
              onChange={(event) => setDraft({ ...draft, country: event.target.value.toUpperCase() })}
            />
          </label>
          <label>
            <span>Fuel</span>
            <select
              value={draft.fuel}
              onChange={(event) =>
                setDraft({ ...draft, fuel: event.target.value as ManualPriceOverride["fuel"] })
              }
            >
              {FUEL_TYPES.map((fuel) => (
                <option key={fuel} value={fuel}>
                  {FUEL_LABELS[fuel]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Average price/L</span>
            <input
              min="0"
              step="0.01"
              type="number"
              value={draftPrice}
              onChange={(event) => {
                const nextPrice = event.target.value;
                setDraftPrice(nextPrice);

                const pricePerLiter = Number(nextPrice);
                if (nextPrice.trim() === "" || !Number.isFinite(pricePerLiter) || pricePerLiter < 0) {
                  return;
                }

                setDraft({ ...draft, pricePerLiter });
              }}
            />
          </label>
          <label>
            <span>Currency</span>
            <input
              maxLength={3}
              value={draft.currency}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })}
            />
          </label>
          <button className="primary" onClick={addOverride}>
            <Plus size={16} />
            Add
          </button>
        </div>

        <ul className="override-list">
          {settings.overrides.map((override) => (
            <li key={`${override.country}-${override.fuel}`}>
              <span>
                {override.country} · {FUEL_LABELS[override.fuel]} · custom average ·{" "}
                {override.currency} {override.pricePerLiter.toFixed(2)}/L
              </span>
              <button
                aria-label="Remove override"
                onClick={() =>
                  persist({
                    ...settings,
                    overrides: settings.overrides.filter((item) => item !== override)
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer>{status}</footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Options />);
