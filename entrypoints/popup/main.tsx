import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CarFront, Fuel, RefreshCw, Route, Save, Trash2 } from "lucide-react";
import { lookupVehicle } from "../../src/shared/api";
import { applyOverride } from "../../src/shared/fuel";
import { getDailyPrice } from "../../src/shared/priceCache";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { useSettingsState } from "../../src/shared/useSettingsState";
import {
  FUEL_LABELS,
  SUPPORTED_PLATE_COUNTRIES,
  SUPPORTED_PRICE_FUEL_TYPES,
  SUPPORTED_PRICE_COUNTRIES,
  type EconomyUnit,
  type PriceQuote,
  type UserSettings
} from "../../src/shared/types";
import "./style.css";

export function Popup() {
  const { settings, isLoading, status, setStatus, persist } = useSettingsState();
  const [economyValue, setEconomyValue] = useState(String(DEFAULT_SETTINGS.economy.value));
  const [prices, setPrices] = useState<PriceQuote[]>([]);
  const [priceStatus, setPriceStatus] = useState("Loading prices");
  const [manualPriceValue, setManualPriceValue] = useState("");
  const [plate, setPlate] = useState("");

  useEffect(() => {
    if (isLoading) return;
    setEconomyValue(String(settings.economy.value));
    setPlate(settings.savedPlate || "");
    void loadPrices(settings);
  }, [isLoading]);

  const canLookup = useMemo(() => plate.trim().length >= 4, [plate]);
  const selectedPrice = prices[0]?.fuel === settings.fuelType ? prices[0] : undefined;
  const currentOverride = useMemo(
    () =>
      settings.overrides.find(
        (override) =>
          override.country.toUpperCase() === settings.country.toUpperCase() &&
          override.fuel === settings.fuelType
      ),
    [settings.country, settings.fuelType, settings.overrides]
  );

  useEffect(() => {
    setManualPriceValue(
      currentOverride?.pricePerLiter !== undefined
        ? String(currentOverride.pricePerLiter)
        : selectedPrice?.pricePerLiter !== undefined
          ? String(selectedPrice.pricePerLiter)
          : ""
    );
  }, [currentOverride, selectedPrice?.pricePerLiter]);

  async function persistAndRefresh(next: UserSettings, message = "Saved") {
    await persist(next, message);
    void loadPrices(next);
  }

  async function loadPrices(currentSettings = settings, refresh = false) {
    setPriceStatus("Loading prices");
    try {
      const basePrice = await getDailyPrice(
        currentSettings.country,
        currentSettings.fuelType,
        { refresh }
      );
      const price = basePrice ? applyOverride(basePrice, currentSettings.overrides) : undefined;
      setPrices(price ? [price] : []);
      setPriceStatus(formatPriceStatus(price, currentSettings.country));
    } catch (error) {
      setPrices([]);
      setPriceStatus(error instanceof Error ? error.message : "Price fetch failed");
    }
  }

  async function onLookup() {
    if (!canLookup) return;
    setStatus("Looking up vehicle");
    try {
      const response = await lookupVehicle(
        settings.plateCountry,
        plate.trim()
      );
      if (response.economy) {
        setEconomyValue(String(response.economy.value));
        await persistAndRefresh({
          ...settings,
          economy: response.economy,
          savedPlate: settings.savePlate ? plate.trim() : undefined
        }, response.model ? `Loaded ${response.model}` : "Economy loaded");
        setStatus(response.model ? `Loaded ${response.model}` : "Economy loaded");
      } else {
        setStatus(response.message || "Manual economy required");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lookup failed");
    }
  }

  async function saveManualPrice() {
    const pricePerLiter = Number(manualPriceValue);
    if (
      manualPriceValue.trim() === "" ||
      !Number.isFinite(pricePerLiter) ||
      pricePerLiter < 0
    ) {
      setStatus("Enter a valid fuel price");
      return;
    }

    await persistAndRefresh({
      ...settings,
      overrides: [
        ...settings.overrides.filter(
          (override) =>
            !(
              override.country.toUpperCase() === settings.country.toUpperCase() &&
              override.fuel === settings.fuelType
            )
        ),
        {
          country: settings.country.toUpperCase(),
          fuel: settings.fuelType,
          pricePerLiter,
          currency: settings.currency.toUpperCase()
        }
      ]
    }, "Manual fuel price saved");
  }

  async function removeManualPrice() {
    await persistAndRefresh({
      ...settings,
      overrides: settings.overrides.filter(
        (override) =>
          !(
            override.country.toUpperCase() === settings.country.toUpperCase() &&
            override.fuel === settings.fuelType
          )
      )
    }, "Manual fuel price removed");
  }

  async function saveEconomyValue() {
    const numericValue = Number(economyValue);
    if (economyValue.trim() === "" || !Number.isFinite(numericValue) || numericValue <= 0) {
      setStatus("Enter a valid fuel economy");
      return;
    }

    await persistAndRefresh({
      ...settings,
      economy: { ...settings.economy, value: numericValue }
    });
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span className="mark">
            <Fuel size={18} />
          </span>
          <h1>Fuel Cost</h1>
          <p>Google Maps trip estimates with selected-country fuel prices.</p>
        </div>
      </header>

      <section className="panel">
        <div className="section-title row-between">
          <span className="title-with-icon">
            <Fuel size={17} />
            <h2>Average fuel prices</h2>
          </span>
          <button
            className="icon-button"
            aria-label="Refresh prices"
            disabled={isLoading || priceStatus === "Loading prices"}
            onClick={() => loadPrices(settings, true)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="price-hero">
          <span>{FUEL_LABELS[settings.fuelType]}</span>
          <strong>{formatPrice(selectedPrice)}</strong>
        </div>
        <div className="manual-price-row">
          <label>
            <span>Manual price/L</span>
            <input
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={manualPriceValue}
              onChange={(event) => setManualPriceValue(event.target.value)}
            />
          </label>
          <button className="primary compact" onClick={saveManualPrice}>
            <Save size={15} />
            Save
          </button>
          <button
            className="icon-button danger"
            aria-label="Remove manual price"
            disabled={!currentOverride}
            onClick={removeManualPrice}
          >
            <Trash2 size={15} />
          </button>
        </div>
        <p className="muted">{priceStatus}</p>
      </section>

      <section className="panel">
        <label>
          <span>Country</span>
          <select
            value={settings.country}
            onChange={(event) => {
              const country = SUPPORTED_PRICE_COUNTRIES.find(
                (item) => item.code === event.target.value
              );
              void persistAndRefresh({
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

        <label>
          <span>Fuel type</span>
          <select
            value={settings.fuelType}
            onChange={(event) =>
              persistAndRefresh({ ...settings, fuelType: event.target.value as UserSettings["fuelType"] })
            }
          >
            {SUPPORTED_PRICE_FUEL_TYPES.map((fuel) => (
              <option key={fuel} value={fuel}>
                {FUEL_LABELS[fuel]}
              </option>
            ))}
          </select>
        </label>

        <div className="split">
          <label>
            <span>Economy</span>
            <input
              inputMode="decimal"
              min="0.1"
              step="0.1"
              type="number"
              value={economyValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setEconomyValue(nextValue);
              }}
            />
          </label>
          <label>
            <span>Unit</span>
            <select
              value={settings.economy.unit}
              onChange={(event) =>
                persistAndRefresh({
                  ...settings,
                  economy: { ...settings.economy, unit: event.target.value as EconomyUnit }
                })
              }
            >
              <option value="l_per_100km">L/100 km</option>
              <option value="km_per_l">km/L</option>
              <option value="mpg_us">MPG US</option>
              <option value="mpg_imp">MPG UK</option>
            </select>
          </label>
        </div>
        <button className="primary compact" onClick={saveEconomyValue}>
          <Save size={15} />
          Save economy
        </button>
      </section>

      <section className="panel">
        <div className="section-title">
          <CarFront size={17} />
          <h2>Vehicle lookup</h2>
        </div>
        <div className="split country-plate">
          <label>
            <span>Country</span>
            <select
              value={settings.plateCountry}
              onChange={(event) =>
                persistAndRefresh({ ...settings, plateCountry: event.target.value.toUpperCase() })
              }
            >
              {SUPPORTED_PLATE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label} ({country.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Plate</span>
            <input value={plate} onChange={(event) => setPlate(event.target.value)} />
          </label>
        </div>
        <label className="toggle">
          <input
            checked={settings.savePlate}
            type="checkbox"
            onChange={(event) =>
              persistAndRefresh({
                ...settings,
                savePlate: event.target.checked,
                savedPlate: event.target.checked ? plate.trim() : undefined
              })
            }
          />
          <span>
            <Save size={16} />
            Save plate locally
          </span>
        </label>
        <button className="primary" disabled={!canLookup} onClick={onLookup}>
          <Route size={16} />
          Fetch economy
        </button>
      </section>

      <footer>{status}</footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);

function formatPrice(price: PriceQuote | undefined): string {
  if (!price?.available || price.pricePerLiter === undefined) return "Unavailable";

  return `${new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: 2
  }).format(price.pricePerLiter)}/L`;
}

function formatPriceStatus(price: PriceQuote | undefined, country: string): string {
  if (!price) return "Price unavailable";
  if (price.source === "override") return `Manual override for ${country}`;
  if (!price.available) return price.diagnostics?.message || "Price unavailable";
  return price.diagnostics?.message || `Daily average for ${country}`;
}
